chrome.commands.onCommand.addListener(async (command) => {
  if (command !== "capture_selection_to_notes") {
    return;
  }

  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url) {
    return;
  }

  try {
    let response;
    try {
      response = await chrome.tabs.sendMessage(tab.id, { type: "SUPER_FIND_GET_SELECTION" });
    } catch (error) {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ["content.js"]
      });
      response = await chrome.tabs.sendMessage(tab.id, { type: "SUPER_FIND_GET_SELECTION" });
    }

    if (!response?.ok) {
      return;
    }

    const selection = (response.selection || "").trim();
    if (!selection) {
      return;
    }

    const { notes = [] } = await chrome.storage.local.get("notes");
    notes.unshift({
      id: crypto.randomUUID(),
      text: selection,
      sourceUrl: tab.url,
      sourceTitle: tab.title || tab.url,
      sourceHost: hostnameFromUrl(tab.url),
      createdAt: new Date().toISOString()
    });
    await chrome.storage.local.set({ notes });
  } catch (error) {
    // Ignore pages where content scripts are unavailable.
  }
});

function hostnameFromUrl(url) {
  try {
    return new URL(url).hostname;
  } catch (error) {
    return "";
  }
}
