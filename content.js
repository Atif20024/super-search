const SUPER_FIND_NS = {
  styleId: "super-find-style",
  markerLayerId: "super-find-marker-layer"
};

const state = {
  highlightMap: new Map(),
  activeMatchId: null,
  currentMatchIndex: -1,
  currentMatches: []
};

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  void handleMessage(message).then(sendResponse);
  return true;
});

async function handleMessage(message) {
  switch (message.type) {
    case "SUPER_FIND_SEARCH":
      return runSearch(message.payload);
    case "SUPER_FIND_NAVIGATE":
      return navigate(message.payload.direction);
    case "SUPER_FIND_CLEAR":
      clearHighlights();
      return {
        ok: true,
        matchCount: 0,
        currentIndex: -1,
        message: "Cleared highlights."
      };
    case "SUPER_FIND_GET_SELECTION":
      return {
        ok: true,
        selection: window.getSelection()?.toString() || ""
      };
    default:
      return { ok: false, error: "Unknown message." };
  }
}

function runSearch(payload) {
  const query = (payload.query || "").trim();
  clearHighlights();

  if (!query) {
    return {
      ok: true,
      matchCount: 0,
      currentIndex: -1,
      message: "Enter something to search."
    };
  }

  const textModel = collectTextModel();

  if (!textModel.fullText) {
    return {
      ok: true,
      matchCount: 0,
      currentIndex: -1,
      message: "No searchable text found on this page."
    };
  }

  let matches;

  try {
    if (payload.mode === "regex") {
      matches = findRegexMatches(textModel.fullText, query, payload);
    } else if (payload.mode === "fuzzy") {
      matches = findFuzzyMatches(textModel.fullText, query, payload);
    } else {
      matches = findLiteralMatches(textModel.fullText, query, payload);
    }
  } catch (error) {
    return {
      ok: false,
      error: error.message || "Search failed."
    };
  }

  if (!matches.length) {
    return {
      ok: true,
      matchCount: 0,
      currentIndex: -1,
      message: "No matches found."
    };
  }

  applyHighlights(textModel, matches);
  state.currentMatches = matches;
  state.currentMatchIndex = 0;
  setActiveMatchByIndex(0);

  return {
    ok: true,
    matchCount: matches.length,
    currentIndex: 0,
    message: "Matches highlighted."
  };
}

function navigate(direction) {
  if (!state.currentMatches.length) {
    return {
      ok: true,
      matchCount: 0,
      currentIndex: -1,
      message: "No matches to navigate."
    };
  }

  if (direction === "prev") {
    state.currentMatchIndex =
      (state.currentMatchIndex - 1 + state.currentMatches.length) % state.currentMatches.length;
  } else {
    state.currentMatchIndex = (state.currentMatchIndex + 1) % state.currentMatches.length;
  }

  setActiveMatchByIndex(state.currentMatchIndex);

  return {
    ok: true,
    matchCount: state.currentMatches.length,
    currentIndex: state.currentMatchIndex,
    message: "Moved to another match."
  };
}

function collectTextModel() {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      if (!node.nodeValue || !node.nodeValue.trim()) {
        return NodeFilter.FILTER_REJECT;
      }

      const parent = node.parentElement;
      if (!parent) {
        return NodeFilter.FILTER_REJECT;
      }

      if (parent.closest("[data-super-find-ignore]")) {
        return NodeFilter.FILTER_REJECT;
      }

      const tagName = parent.tagName;
      if (["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA"].includes(tagName)) {
        return NodeFilter.FILTER_REJECT;
      }

      if (parent.isContentEditable) {
        return NodeFilter.FILTER_REJECT;
      }

      const computedStyle = window.getComputedStyle(parent);
      if (
        computedStyle.display === "none" ||
        computedStyle.visibility === "hidden" ||
        computedStyle.opacity === "0"
      ) {
        return NodeFilter.FILTER_REJECT;
      }

      return NodeFilter.FILTER_ACCEPT;
    }
  });

  const segments = [];
  let fullText = "";
  let node;

  while ((node = walker.nextNode())) {
    const text = node.nodeValue;
    const start = fullText.length;
    fullText += text;
    segments.push({
      node,
      start,
      end: fullText.length,
      text
    });
  }

  return { fullText, segments };
}

function findLiteralMatches(fullText, query, payload) {
  const escaped = escapeRegex(query);
  return findRegexMatches(fullText, escaped, {
    caseSensitive: payload.caseSensitive,
    regexFlags: "g"
  });
}

function findRegexMatches(fullText, pattern, payload) {
  const requestedFlags = (payload.regexFlags || "g").replace(/i/g, "");
  const flagSet = new Set(requestedFlags.split(""));
  flagSet.add("g");

  if (!payload.caseSensitive) {
    flagSet.add("i");
  }

  const flags = [...flagSet].join("");
  const regex = new RegExp(pattern, flags);
  const matches = [];
  let match;

  while ((match = regex.exec(fullText)) !== null) {
    const value = match[0];

    if (!value) {
      regex.lastIndex += 1;
      continue;
    }

    matches.push({
      start: match.index,
      end: match.index + value.length,
      text: value
    });
  }

  return matches;
}

function findFuzzyMatches(fullText, query, payload) {
  const target = payload.caseSensitive ? query : query.toLowerCase();
  const maxDistance = Number.isFinite(payload.fuzzyDistance) ? payload.fuzzyDistance : 1;

  if (maxDistance === 0) {
    return findLiteralMatches(fullText, query, payload);
  }

  const wordRegex = /\b[\p{L}\p{N}_-]+\b/gu;
  const matches = [];
  let tokenMatch;

  while ((tokenMatch = wordRegex.exec(fullText)) !== null) {
    const rawToken = tokenMatch[0];
    const normalizedToken = payload.caseSensitive ? rawToken : rawToken.toLowerCase();
    const lengthGap = Math.abs(normalizedToken.length - target.length);

    if (lengthGap > maxDistance) {
      continue;
    }

    const distance = levenshtein(normalizedToken, target, maxDistance);
    if (distance <= maxDistance) {
      matches.push({
        start: tokenMatch.index,
        end: tokenMatch.index + rawToken.length,
        text: rawToken
      });
    }
  }

  return dedupeMatches(matches);
}

function applyHighlights(textModel, matches) {
  ensureStyle();

  matches.forEach((match, matchIndex) => {
    state.highlightMap.set(matchIndex, []);
  });

  for (const segment of textModel.segments) {
    const overlaps = [];

    matches.forEach((match, matchIndex) => {
      if (match.end <= segment.start || match.start >= segment.end) {
        return;
      }

      const localStart = Math.max(0, match.start - segment.start);
      const localEnd = Math.min(segment.text.length, match.end - segment.start);

      if (localStart < localEnd) {
        overlaps.push({
          localStart,
          localEnd,
          matchIndex
        });
      }
    });

    if (!overlaps.length) {
      continue;
    }

    overlaps.sort((left, right) => left.localStart - right.localStart);

    const fragment = document.createDocumentFragment();
    let cursor = 0;

    overlaps.forEach((overlap) => {
      if (cursor < overlap.localStart) {
        fragment.appendChild(
          document.createTextNode(segment.text.slice(cursor, overlap.localStart))
        );
      }

      const mark = document.createElement("mark");
      mark.className = "super-find-highlight";
      mark.dataset.superFindHighlight = "true";
      mark.dataset.matchId = String(overlap.matchIndex);
      mark.textContent = segment.text.slice(overlap.localStart, overlap.localEnd);
      fragment.appendChild(mark);
      state.highlightMap.get(overlap.matchIndex).push(mark);
      cursor = overlap.localEnd;
    });

    if (cursor < segment.text.length) {
      fragment.appendChild(document.createTextNode(segment.text.slice(cursor)));
    }

    segment.node.parentNode?.replaceChild(fragment, segment.node);
  }

  renderScrollbarMarkers(matches, textModel.fullText.length);
}

function setActiveMatchByIndex(index) {
  if (state.activeMatchId !== null) {
    const oldHighlights = state.highlightMap.get(state.activeMatchId) || [];
    oldHighlights.forEach((element) => element.classList.remove("super-find-highlight-active"));
  }

  state.activeMatchId = index;
  const highlights = state.highlightMap.get(index) || [];
  highlights.forEach((element) => element.classList.add("super-find-highlight-active"));

  const first = highlights[0];
  if (first) {
    first.scrollIntoView({
      behavior: "smooth",
      block: "center",
      inline: "nearest"
    });
  }
}

function clearHighlights() {
  document.querySelectorAll("mark[data-super-find-highlight='true']").forEach((mark) => {
    const parent = mark.parentNode;
    if (!parent) {
      return;
    }

    parent.replaceChild(document.createTextNode(mark.textContent || ""), mark);
    parent.normalize();
  });

  const markerLayer = document.getElementById(SUPER_FIND_NS.markerLayerId);
  markerLayer?.remove();

  state.highlightMap.clear();
  state.activeMatchId = null;
  state.currentMatchIndex = -1;
  state.currentMatches = [];
}

function renderScrollbarMarkers(matches, textLength) {
  let layer = document.getElementById(SUPER_FIND_NS.markerLayerId);

  if (layer) {
    layer.innerHTML = "";
  } else {
    layer = document.createElement("div");
    layer.id = SUPER_FIND_NS.markerLayerId;
    layer.dataset.superFindIgnore = "true";
    document.documentElement.appendChild(layer);
  }

  matches.forEach((match, index) => {
    const marker = document.createElement("div");
    marker.className = "super-find-scroll-marker";
    marker.dataset.matchId = String(index);
    marker.style.top = `${Math.max(0, (match.start / textLength) * 100)}%`;
    layer.appendChild(marker);
  });
}

function ensureStyle() {
  if (document.getElementById(SUPER_FIND_NS.styleId)) {
    return;
  }

  const style = document.createElement("style");
  style.id = SUPER_FIND_NS.styleId;
  style.dataset.superFindIgnore = "true";
  style.textContent = `
    mark.super-find-highlight {
      background: rgba(255, 215, 0, 0.72) !important;
      color: inherit !important;
      padding: 0 !important;
      border-radius: 2px !important;
      box-shadow: 0 0 0 1px rgba(159, 118, 0, 0.22) inset !important;
    }

    mark.super-find-highlight.super-find-highlight-active {
      background: rgba(255, 116, 53, 0.82) !important;
      box-shadow: 0 0 0 1px rgba(154, 55, 0, 0.35) inset, 0 0 0 2px rgba(255, 116, 53, 0.2) !important;
    }

    #${SUPER_FIND_NS.markerLayerId} {
      position: fixed !important;
      top: 8px !important;
      right: 2px !important;
      width: 10px !important;
      height: calc(100vh - 16px) !important;
      pointer-events: none !important;
      z-index: 2147483647 !important;
      background: rgba(24, 32, 39, 0.05) !important;
      border-radius: 999px !important;
    }

    #${SUPER_FIND_NS.markerLayerId} .super-find-scroll-marker {
      position: absolute !important;
      left: 1px !important;
      width: 8px !important;
      height: 3px !important;
      border-radius: 999px !important;
      background: rgba(13, 124, 102, 0.85) !important;
    }
  `;

  document.documentElement.appendChild(style);
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function dedupeMatches(matches) {
  const seen = new Set();
  return matches.filter((match) => {
    const key = `${match.start}:${match.end}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function levenshtein(left, right, maxDistance) {
  const rows = left.length + 1;
  const cols = right.length + 1;
  const matrix = Array.from({ length: rows }, () => new Array(cols).fill(0));

  for (let row = 0; row < rows; row += 1) {
    matrix[row][0] = row;
  }

  for (let col = 0; col < cols; col += 1) {
    matrix[0][col] = col;
  }

  for (let row = 1; row < rows; row += 1) {
    let minRowValue = Number.POSITIVE_INFINITY;

    for (let col = 1; col < cols; col += 1) {
      const cost = left[row - 1] === right[col - 1] ? 0 : 1;
      matrix[row][col] = Math.min(
        matrix[row - 1][col] + 1,
        matrix[row][col - 1] + 1,
        matrix[row - 1][col - 1] + cost
      );
      minRowValue = Math.min(minRowValue, matrix[row][col]);
    }

    if (minRowValue > maxDistance) {
      return maxDistance + 1;
    }
  }

  return matrix[left.length][right.length];
}
