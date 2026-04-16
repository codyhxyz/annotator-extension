chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  await chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_OVERLAY" });
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === "OPEN_FEED") {
    const feedUrl = chrome.runtime.getURL("src/feed/index.html");
    chrome.tabs.create({ url: feedUrl });
  }
  if (msg.type === "OPEN_AUTH") {
    const authUrl = chrome.runtime.getURL("src/auth/index.html");
    chrome.tabs.create({ url: authUrl });
  }

  // ann:// URI handler — opens the annotated page and scrolls to the annotation
  if (msg.type === "NAVIGATE_TO_ANNOTATION") {
    const { url, annotationId } = msg;
    if (!url || !annotationId) return;

    // Open the page, wait for it to load, then tell content script to scroll to annotation
    chrome.tabs.create({ url }, (tab) => {
      if (!tab?.id) return;
      const tabId = tab.id;

      const listener = (updatedTabId: number, info: chrome.tabs.TabChangeInfo) => {
        if (updatedTabId === tabId && info.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          // Give content script a moment to initialize
          setTimeout(() => {
            chrome.tabs.sendMessage(tabId, {
              type: "SCROLL_TO_ANNOTATION",
              annotationId,
            });
          }, 500);
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
    });
  }

});
