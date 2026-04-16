/**
 * Service worker — the always-on half of the extension.
 *
 * Responsibilities:
 *   - Route chrome.action clicks → content script toggle.
 *   - Keep sync alive via chrome.alarms, independent of whether any
 *     overlay is visible. The SW can't touch per-origin IndexedDB
 *     directly, so on tick we fan out SYNC_TICK to every tab that has
 *     our content script loaded and each tab runs its own sync.
 *   - Bridge ann:// navigation across tabs.
 *
 * See KNOWN-LIMITATIONS.md: per-host IDB means sync is per-host too.
 * A future offscreen-document refactor will unify storage.
 */

const SYNC_ALARM = 'annotator-sync';
const SYNC_PERIOD_MINUTES = 1;

chrome.runtime.onInstalled.addListener(() => {
  chrome.alarms.create(SYNC_ALARM, { periodInMinutes: SYNC_PERIOD_MINUTES });
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(SYNC_ALARM, { periodInMinutes: SYNC_PERIOD_MINUTES });
});

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== SYNC_ALARM) return;
  const tabs = await chrome.tabs.query({ status: 'complete' });
  for (const tab of tabs) {
    if (!tab.id || !tab.url || !/^https?:/.test(tab.url)) continue;
    // Small per-tab jitter to spread load on the backend.
    const delay = Math.random() * 2000;
    setTimeout(() => {
      chrome.tabs.sendMessage(tab.id!, { type: 'SYNC_TICK' }).catch(() => {});
    }, delay);
  }
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) return;
  await chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_OVERLAY' }).catch(() => {});
});

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'OPEN_FEED') {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/feed/index.html') });
  }
  if (msg.type === 'OPEN_AUTH') {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/auth/index.html') });
  }

  // ann:// URI handler — open the page and tell the content script to scroll.
  if (msg.type === 'NAVIGATE_TO_ANNOTATION') {
    const { url, annotationId } = msg;
    if (!url || !annotationId) return;
    chrome.tabs.create({ url }, (tab) => {
      if (!tab?.id) return;
      const tabId = tab.id;
      const listener = (updatedTabId: number, info: chrome.tabs.TabChangeInfo) => {
        if (updatedTabId === tabId && info.status === 'complete') {
          chrome.tabs.onUpdated.removeListener(listener);
          // Give content script time to mount + attach listeners.
          setTimeout(() => {
            chrome.tabs.sendMessage(tabId, { type: 'SCROLL_TO_ANNOTATION', annotationId }).catch(() => {});
          }, 500);
        }
      };
      chrome.tabs.onUpdated.addListener(listener);
    });
  }
});
