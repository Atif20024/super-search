const queryEl = document.getElementById("query");
const resultCountEl = document.getElementById("result-count");
const statusEl = document.getElementById("status");
const themeToggleEl = document.getElementById("theme-toggle");
const savedSearchesEl = document.getElementById("saved-searches");
const notesEl = document.getElementById("page-notes");
const notesListEl = document.getElementById("notes-list");
const savedSearchTemplate = document.getElementById("saved-search-template");
const noteTemplate = document.getElementById("note-template");
const saveFormEl = document.getElementById("save-form");
const saveSearchNameEl = document.getElementById("save-search-name");
const modeLiteralEl = document.getElementById("mode-literal");
const modeRegexEl = document.getElementById("mode-regex");
const modeFuzzyEl = document.getElementById("mode-fuzzy");
const caseToggleEl = document.getElementById("case-toggle");
const regexPresetsWrapEl = document.getElementById("regex-presets-wrap");
const regexPresetsToggleEl = document.getElementById("regex-presets-toggle");
const regexPresetsMenuEl = document.getElementById("regex-presets-menu");

const REGEX_PRESETS = {
  email: String.raw`\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b`,
  phone: String.raw`\b(?:\+?\d{1,3}[\s.-]?)?(?:\(?\d{3}\)?[\s.-]?)\d{3}[\s.-]?\d{4}\b`,
  url: String.raw`https?:\/\/[^\s"'<>]+`,
  date: String.raw`\b(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}-\d{2}-\d{2})\b`,
  year: String.raw`\b(?:19|20)\d{2}\b`
};

const state = {
  currentTabId: null,
  currentTabUrl: "",
  currentTabTitle: "",
  savedSearches: [],
  notes: [],
  notesDraftTimer: null,
  mode: "literal",
  caseSensitive: false,
  fuzzyDistance: 0,
  hasSearched: false,
  currentIndex: 0,
  matchCount: 0
};

init().catch((error) => {
  showStatus(error.message || "Failed to initialize.");
});

async function init() {
  attachEvents();
  await loadCurrentTab();
  await loadTheme();
  await loadSavedSearches();
  await loadNotes();
  await restoreLastSearch();
  updateModeButtons();
  updateMatchCount();
  focusAndSelectQuery();
}

function attachEvents() {
  document.getElementById("next-match").addEventListener("click", () => handleAdvance(false));
  document.getElementById("prev-match").addEventListener("click", () => handleAdvance(true));
  themeToggleEl.addEventListener("click", toggleTheme);
  document.getElementById("toggle-save-form").addEventListener("click", openSaveForm);
  document.getElementById("save-search").addEventListener("click", saveCurrentSearch);
  document.getElementById("cancel-save").addEventListener("click", closeSaveForm);
  document.getElementById("save-note").addEventListener("click", saveTypedNote);
  document.getElementById("capture-selection").addEventListener("click", captureSelection);
  regexPresetsToggleEl.addEventListener("click", toggleRegexPresetsMenu);

  modeLiteralEl.addEventListener("click", () => setMode("literal"));
  modeRegexEl.addEventListener("click", () => setMode("regex"));
  modeFuzzyEl.addEventListener("click", cycleFuzzyMode);
  caseToggleEl.addEventListener("click", toggleCaseSensitive);
  document.querySelectorAll(".regex-preset-item").forEach((button) => {
    button.addEventListener("click", () => applyRegexPreset(button.dataset.preset));
  });

  queryEl.addEventListener("input", () => {
    state.hasSearched = false;
    state.currentIndex = 0;
    state.matchCount = 0;
    updateMatchCount();
    hideStatus();
  });

  queryEl.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      handleAdvance(event.shiftKey);
    }
  });

  saveSearchNameEl.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      saveCurrentSearch();
    }
  });

  notesEl.addEventListener("input", () => hideStatus());
  notesEl.addEventListener("dragover", (event) => event.preventDefault());
  notesEl.addEventListener("drop", onNotesDrop);
  document.addEventListener("click", handleDocumentClick);
}

async function loadCurrentTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  if (!tab || typeof tab.id !== "number") {
    throw new Error("No active tab found.");
  }

  state.currentTabId = tab.id;
  state.currentTabUrl = tab.url || "";
  state.currentTabTitle = tab.title || state.currentTabUrl;
}

async function loadSavedSearches() {
  const { savedSearches = [] } = await chrome.storage.local.get("savedSearches");
  state.savedSearches = savedSearches;
  renderSavedSearches();
}

async function loadTheme() {
  const { theme = "light" } = await chrome.storage.local.get("theme");
  applyTheme(theme);
}

async function loadNotes() {
  const { notes = [] } = await chrome.storage.local.get("notes");
  state.notes = notes;
  renderNotes();
}

async function restoreLastSearch() {
  const { lastSearch = null } = await chrome.storage.local.get("lastSearch");

  if (!lastSearch) {
    return;
  }

  queryEl.value = lastSearch.query || "";
  state.mode = lastSearch.mode || "literal";
  state.caseSensitive = Boolean(lastSearch.caseSensitive);
  state.fuzzyDistance = Number(lastSearch.fuzzyDistance ?? 0);
}

function focusAndSelectQuery() {
  window.setTimeout(() => {
    queryEl.focus();
    queryEl.select();
  }, 0);
}

async function toggleTheme() {
  const nextTheme = document.body.dataset.theme === "dark" ? "light" : "dark";
  applyTheme(nextTheme);
  await chrome.storage.local.set({ theme: nextTheme });
}

function applyTheme(theme) {
  document.body.dataset.theme = theme;
  themeToggleEl.textContent = theme === "dark" ? "Light" : "Dark";
}

function setMode(mode) {
  state.mode = mode;
  if (mode !== "fuzzy") {
    state.fuzzyDistance = 0;
  }
  updateModeButtons();
  hideStatus();
  closeRegexPresetsMenu();
  rerunIfPossible();
}

function cycleFuzzyMode() {
  if (state.mode !== "fuzzy") {
    state.mode = "fuzzy";
    state.fuzzyDistance = 1;
  } else {
    state.fuzzyDistance = state.fuzzyDistance === 1 ? 2 : state.fuzzyDistance === 2 ? 0 : 1;
  }
  updateModeButtons();
  hideStatus();
  rerunIfPossible();
}

function toggleCaseSensitive() {
  state.caseSensitive = !state.caseSensitive;
  updateModeButtons();
  rerunIfPossible();
}

function updateModeButtons() {
  modeLiteralEl.classList.toggle("is-active", state.mode === "literal");
  modeRegexEl.classList.toggle("is-active", state.mode === "regex");
  modeFuzzyEl.classList.toggle("is-active", state.mode === "fuzzy");
  caseToggleEl.classList.toggle("is-active", state.caseSensitive);
  caseToggleEl.setAttribute("aria-pressed", String(state.caseSensitive));
  modeFuzzyEl.textContent = state.fuzzyDistance === 0 ? "Fuzzy" : `Fuzzy ${state.fuzzyDistance}`;
  regexPresetsWrapEl.hidden = state.mode !== "regex";
}

function rerunIfPossible() {
  if (!queryEl.value.trim()) {
    return;
  }

  state.hasSearched = false;
  void runSearch();
}

function toggleRegexPresetsMenu(event) {
  event.stopPropagation();
  regexPresetsMenuEl.hidden = !regexPresetsMenuEl.hidden;
}

function closeRegexPresetsMenu() {
  regexPresetsMenuEl.hidden = true;
}

function applyRegexPreset(presetKey) {
  const pattern = REGEX_PRESETS[presetKey];
  if (!pattern) {
    return;
  }

  state.mode = "regex";
  queryEl.value = pattern;
  updateModeButtons();
  closeRegexPresetsMenu();
  hideStatus();
  focusAndSelectQuery();
  queryEl.setSelectionRange(0, pattern.length);
  void runSearch();
}

function handleDocumentClick(event) {
  if (!regexPresetsWrapEl.hidden && !regexPresetsWrapEl.contains(event.target)) {
    closeRegexPresetsMenu();
  }
}

function getPayload() {
  return {
    query: queryEl.value,
    mode: state.mode,
    caseSensitive: state.caseSensitive,
    fuzzyDistance: state.fuzzyDistance
  };
}

async function handleAdvance(isPrevious) {
  if (!queryEl.value.trim()) {
    return;
  }

  if (!state.hasSearched) {
    await runSearch();
    return;
  }

  await navigate(isPrevious ? "prev" : "next");
}

async function runSearch() {
  const payload = getPayload();

  try {
    const response = await sendTabMessage({
      type: "SUPER_FIND_SEARCH",
      payload
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Search failed.");
    }

    await chrome.storage.local.set({ lastSearch: payload });
    applySearchState(response);
  } catch (error) {
    showStatus(error.message || "Search failed.");
  }
}

async function navigate(direction) {
  try {
    const response = await sendTabMessage({
      type: "SUPER_FIND_NAVIGATE",
      payload: { direction }
    });

    if (!response?.ok) {
      throw new Error(response?.error || "Navigation failed.");
    }

    applySearchState(response);
  } catch (error) {
    showStatus(error.message || "Navigation failed.");
  }
}

function applySearchState(response) {
  state.matchCount = response.matchCount || 0;
  state.currentIndex =
    typeof response.currentIndex === "number" && response.currentIndex >= 0
      ? response.currentIndex + 1
      : 0;
  state.hasSearched = true;
  updateMatchCount();

  if (state.matchCount === 0) {
    showStatus("No matches");
  } else {
    hideStatus();
  }
}

function updateMatchCount() {
  resultCountEl.textContent = `${state.currentIndex}/${state.matchCount}`;
}

async function saveCurrentSearch() {
  const payload = getPayload();
  const trimmed = payload.query.trim();

  if (!trimmed) {
    showStatus("Enter a search before saving it.");
    return;
  }

  const name = saveSearchNameEl.value.trim();
  if (!name) {
    showStatus("Add a name for the saved search.");
    return;
  }

  const savedItem = {
    id: crypto.randomUUID(),
    name,
    ...payload
  };

  state.savedSearches.unshift(savedItem);
  await chrome.storage.local.set({ savedSearches: state.savedSearches });
  renderSavedSearches();
  closeSaveForm();
  hideStatus();
}

function openSaveForm() {
  const trimmed = queryEl.value.trim();
  if (!trimmed) {
    showStatus("Enter a search before saving it.");
    return;
  }

  saveSearchNameEl.value = trimmed;
  saveFormEl.hidden = false;
  saveSearchNameEl.focus();
  saveSearchNameEl.select();
}

function closeSaveForm() {
  saveFormEl.hidden = true;
  saveSearchNameEl.value = "";
  focusAndSelectQuery();
}

function renderSavedSearches() {
  savedSearchesEl.textContent = "";

  if (!state.savedSearches.length) {
    savedSearchesEl.className = "saved-searches empty-state";
    savedSearchesEl.textContent = "No saved searches yet.";
    return;
  }

  savedSearchesEl.className = "saved-searches";

  state.savedSearches.forEach((item) => {
    const fragment = savedSearchTemplate.content.cloneNode(true);
    const root = fragment.querySelector(".saved-item");

    fragment.querySelector(".saved-name").textContent = item.name;
    fragment.querySelector(".saved-meta").textContent = describeSavedSearch(item);

    fragment.querySelector(".run-saved").addEventListener("click", async () => {
      queryEl.value = item.query;
      state.mode = item.mode || "literal";
      state.caseSensitive = Boolean(item.caseSensitive);
      state.fuzzyDistance = Number(item.fuzzyDistance ?? 0);
      state.hasSearched = false;
      updateModeButtons();
      focusAndSelectQuery();
      await runSearch();
    });

    fragment.querySelector(".delete-saved").addEventListener("click", async () => {
      state.savedSearches = state.savedSearches.filter((entry) => entry.id !== item.id);
      await chrome.storage.local.set({ savedSearches: state.savedSearches });
      renderSavedSearches();
    });

    savedSearchesEl.appendChild(root);
  });
}

function describeSavedSearch(item) {
  const parts = [item.mode];
  if (item.mode === "fuzzy" && item.fuzzyDistance) {
    parts.push(String(item.fuzzyDistance));
  }
  if (item.caseSensitive) {
    parts.push("case");
  }
  return `${item.query} • ${parts.join(" • ")}`;
}

async function captureSelection() {
  try {
    const response = await sendTabMessage({ type: "SUPER_FIND_GET_SELECTION" });
    if (!response?.ok) {
      throw new Error(response?.error || "Could not capture selection.");
    }

    const selectionText = (response.selection || "").trim();
    if (!selectionText) {
      showStatus("No page selection found.");
      return;
    }

    await addNote(selectionText);
    hideStatus();
  } catch (error) {
    showStatus(error.message || "Could not capture selection.");
  }
}

function onNotesDrop(event) {
  event.preventDefault();
  const text = event.dataTransfer?.getData("text/plain");

  if (!text) {
    return;
  }

  const prefix = notesEl.value.trim() ? "\n" : "";
  notesEl.value += `${prefix}${text}`;
}

async function saveTypedNote() {
  const text = notesEl.value.trim();
  if (!text) {
    showStatus("Write a note before saving it.");
    return;
  }

  await addNote(text);
  notesEl.value = "";
  hideStatus();
}

async function addNote(text) {
  const note = {
    id: crypto.randomUUID(),
    text,
    sourceUrl: state.currentTabUrl,
    sourceTitle: state.currentTabTitle || state.currentTabUrl,
    sourceHost: hostnameFromUrl(state.currentTabUrl),
    createdAt: new Date().toISOString()
  };

  state.notes.unshift(note);
  await chrome.storage.local.set({ notes: state.notes });
  renderNotes();
}

function renderNotes() {
  notesListEl.textContent = "";

  if (!state.notes.length) {
    notesListEl.className = "notes-list empty-state";
    notesListEl.textContent = "No notes yet.";
    return;
  }

  notesListEl.className = "notes-list";

  state.notes.forEach((note) => {
    const fragment = noteTemplate.content.cloneNode(true);
    fragment.querySelector(".note-text").textContent = note.text;
    fragment.querySelector(".note-meta").textContent = describeNote(note);
    fragment.querySelector(".note-link").href = note.sourceUrl;
    fragment.querySelector(".delete-note").addEventListener("click", async () => {
      state.notes = state.notes.filter((entry) => entry.id !== note.id);
      await chrome.storage.local.set({ notes: state.notes });
      renderNotes();
    });
    notesListEl.appendChild(fragment);
  });
}

function describeNote(note) {
  const source = note.sourceHost || "Unknown site";
  const title = note.sourceTitle || note.sourceUrl || "Untitled page";
  return `${source} • ${title}`;
}

function hostnameFromUrl(url) {
  try {
    return new URL(url).hostname;
  } catch (error) {
    return "";
  }
}

function showStatus(message) {
  statusEl.hidden = false;
  statusEl.textContent = message;
}

function hideStatus() {
  statusEl.hidden = true;
  statusEl.textContent = "";
}

async function sendTabMessage(message) {
  try {
    return await chrome.tabs.sendMessage(state.currentTabId, message);
  } catch (error) {
    try {
      await chrome.scripting.executeScript({
        target: { tabId: state.currentTabId },
        files: ["content.js"]
      });
      return await chrome.tabs.sendMessage(state.currentTabId, message);
    } catch (retryError) {
      throw new Error("Super Find cannot access this page.");
    }
  }
}
