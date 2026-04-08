// Auto-inject on tab updates when feedback is active
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "complete" && tab.url) {
    chrome.storage.local.get({ feedbackActive: false }, (result) => {
      if (result.feedbackActive) {
        injectContentScript(tabId);
      }
    });
  }
});

// Listen for messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === "captureTab") {
    const tabId = sender.tab && sender.tab.id;
    if (!tabId) {
      sendResponse({ dataUrl: null });
      return true;
    }
    chrome.tabs.get(tabId, (tab) => {
      chrome.tabs.captureVisibleTab(tab.windowId, { format: "png" }, (dataUrl) => {
        if (chrome.runtime.lastError) {
          sendResponse({ dataUrl: null });
        } else {
          sendResponse({ dataUrl });
        }
      });
    });
    return true;
  }

  if (message.action === "saveSnapshot") {
    // Save snapshot to disk via broker's /api/snapshots endpoint
    const { dataUrl } = message;
    const filename = `snapshot-${Date.now()}.jpg`;
    chrome.storage.local.get({ brokerUrl: "http://localhost:3100" }, (result) => {
      const url = (result.brokerUrl || "http://localhost:3100").replace(/\/$/, "");
      fetch(url + "/api/snapshots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl, filename }),
      })
        .then((res) => {
          if (!res.ok) throw new Error("HTTP " + res.status);
          return res.json();
        })
        .then((data) => {
          sendResponse({ ok: true, path: data.path });
        })
        .catch((err) => {
          sendResponse({ ok: false, error: err.message, path: null });
        });
    });
    return true;
  }

  if (message.action === "activate") {
    const tabId = message.tabId || (sender.tab && sender.tab.id);
    if (tabId) {
      injectContentScript(tabId);
    }
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach((tab) => {
        if (tab.id !== tabId && tab.url && !tab.url.startsWith("chrome://")) {
          injectContentScript(tab.id);
        }
      });
    });
    sendResponse({ ok: true });
    return true;
  }

  if (message.action === "sendFeedback") {
    chrome.storage.local.get({ feedback: [] }, (result) => {
      const feedback = result.feedback;
      const item = {
        text: message.text,
        timestamp: new Date().toISOString(),
      };
      if (message.snapshotPath) item.snapshotPath = message.snapshotPath;
      feedback.push(item);
      chrome.storage.local.set({ feedback }, () => {
        sendResponse({ ok: true });
      });
    });
    return true;
  }

  if (message.action === "getFeedback") {
    chrome.storage.local.get({ feedback: [] }, (result) => {
      sendResponse({ ok: true, feedback: result.feedback });
    });
    return true;
  }

  if (message.action === "clearFeedback") {
    chrome.storage.local.set({ feedback: [] }, () => {
      sendResponse({ ok: true });
    });
    return true;
  }

  if (message.action === "sendPayload") {
    const text = message.text;
    chrome.storage.local.get({ brokerUrl: "http://localhost:3100" }, (result) => {
      const url = (result.brokerUrl || "http://localhost:3100").replace(/\/$/, "");
      fetch(url + "/api/master/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      })
        .then((res) => {
          if (!res.ok) throw new Error("HTTP " + res.status);
          return res.json();
        })
        .then(() => {
          chrome.storage.local.set({ feedback: [] }, () => {
            sendResponse({ ok: true });
          });
        })
        .catch((err) => {
          sendResponse({ ok: false, error: err.message });
        });
    });
    return true;
  }

  if (message.action === "sendAllFeedback") {
    chrome.storage.local.get({ feedback: [], brokerUrl: "http://localhost:3100" }, (result) => {
      const items = result.feedback || [];
      if (items.length === 0) {
        sendResponse({ ok: false, error: "No feedback to send" });
        return;
      }
      const text = items.map((item, i) => {
        let entry = `--- Feedback ${i + 1} ---\n${item.text}`;
        if (item.snapshotPath) entry += `\nSnapshot: ${item.snapshotPath}`;
        return entry;
      }).join("\n\n");
      const url = (result.brokerUrl || "http://localhost:3100").replace(/\/$/, "");

      fetch(url + "/api/master/message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      })
        .then((res) => {
          if (!res.ok) throw new Error("HTTP " + res.status);
          return res.json();
        })
        .then(() => {
          chrome.storage.local.set({ feedback: [] }, () => {
            sendResponse({ ok: true, count: items.length });
          });
        })
        .catch((err) => {
          sendResponse({ ok: false, error: err.message });
        });
    });
    return true;
  }
});

async function injectContentScript(tabId) {
  try {
    await chrome.scripting.insertCSS({
      target: { tabId },
      files: ["content.css"],
    });
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ["content.js"],
    });
  } catch (err) {
    // Silently fail for chrome:// pages etc
  }
}
