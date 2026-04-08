const toggle = document.getElementById("toggle");

chrome.storage.local.get({ brokerUrl: "http://localhost:3100", feedbackActive: false }, (result) => {
  document.getElementById("broker-url").value = result.brokerUrl;
  toggle.checked = result.feedbackActive;
});

toggle.addEventListener("change", () => {
  const active = toggle.checked;
  chrome.storage.local.set({ feedbackActive: active });

  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0]) {
      if (active) {
        chrome.runtime.sendMessage({ action: "activate", tabId: tabs[0].id });
      } else {
        chrome.tabs.sendMessage(tabs[0].id, { action: "deactivate" });
      }
    }
  });
});

document.getElementById("broker-url").addEventListener("change", (e) => {
  chrome.storage.local.set({ brokerUrl: e.target.value });
});
