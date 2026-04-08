(function () {
  // Prevent double-injection
  if (window.__uifbActive) return;
  window.__uifbActive = true;

  let hoveredEl = null;
  let selectedEl = null;
  let bubble = null;
  let tray = null;
  let hoverMode = true;
  let feedbackItems = [];
  let hoverTimer = null;
  let includeSnapshot = false; // default: screenshot off

  // ── Tray (draggable) ─────────────────────────────────────────────────────

  function createTray() {
    tray = document.createElement("div");
    tray.id = "uifb-tray";
    updateTrayHTML();
    document.body.appendChild(tray);
    bindTrayEvents();
    makeTrayDraggable();
  }

  let trayDragged = false;
  let trayPos = null; // { left, top } after drag

  function makeTrayDraggable() {
    let dragging = false;
    let offsetX = 0, offsetY = 0;
    let dragW = 0, dragH = 0;

    function onDown(e) {
      if (e.target.closest("button")) return;
      dragging = true;
      const rect = tray.getBoundingClientRect();
      offsetX = e.clientX - rect.left;
      offsetY = e.clientY - rect.top;
      dragW = rect.width;
      dragH = rect.height;
      tray.style.width = dragW + "px";
      tray.style.transition = "none";
      e.preventDefault();
    }

    function onMove(e) {
      if (!dragging) return;
      let left = e.clientX - offsetX;
      let top = e.clientY - offsetY;
      left = Math.max(0, Math.min(left, window.innerWidth - dragW));
      top = Math.max(0, Math.min(top, window.innerHeight - dragH));
      tray.style.bottom = "auto";
      tray.style.right = "auto";
      tray.style.left = left + "px";
      tray.style.top = top + "px";
    }

    function onUp() {
      if (!dragging) return;
      dragging = false;
      tray.style.transition = "";
      tray.style.width = "";
      // Save position so we can restore after HTML updates
      const rect = tray.getBoundingClientRect();
      trayDragged = true;
      trayPos = { left: rect.left, top: rect.top };
    }

    tray.addEventListener("mousedown", onDown, true);
    document.addEventListener("mousemove", onMove, true);
    document.addEventListener("mouseup", onUp, true);
  }

  let listExpanded = false;

  function updateTrayHTML() {
    if (!tray) return;

    // Remove any existing popout list
    const existingList = document.getElementById("uifb-tray-list");
    if (existingList) existingList.remove();

    if (feedbackItems.length === 0) {
      listExpanded = false;
      tray.innerHTML = `
        <div class="uifb-tray-bar">
          <div class="uifb-tray-drag" title="Drag to move">&#8942;&#8942;</div>
          <div class="uifb-tray-count"><span id="uifb-tray-num">0</span> comments</div>
          <button class="uifb-tray-send uifb-tray-send-disabled" id="uifb-tray-send" disabled>Send All <kbd>&#8984;&#9166;</kbd></button>
          <button class="uifb-tray-close" id="uifb-tray-close">&times;</button>
        </div>
      `;
    } else {
      tray.innerHTML = `
        <div class="uifb-tray-bar">
          <div class="uifb-tray-drag" title="Drag to move">&#8942;&#8942;</div>
          <button class="uifb-tray-count" id="uifb-tray-toggle"><span id="uifb-tray-num">${feedbackItems.length}</span> comment${feedbackItems.length === 1 ? '' : 's'}</button>
          <button class="uifb-tray-send" id="uifb-tray-send">Send All <kbd>&#8984;&#9166;</kbd></button>
          <button class="uifb-tray-clear" id="uifb-tray-clear">&times;</button>
        </div>
      `;

      if (listExpanded) {
        const listEl = document.createElement("div");
        listEl.id = "uifb-tray-list";
        listEl.className = "uifb-tray-list";
        listEl.innerHTML = feedbackItems.map((item, i) => {
          const changeLine = item.text.split("\n").find(l => l.startsWith("Requested change:")) || "";
          const preview = changeLine.replace("Requested change: ", "").substring(0, 60) || "Comment " + (i + 1);
          const hasImg = item.snapshot ? `<span class="uifb-tray-item-img" title="Has screenshot">&#128247;</span>` : '';
          return `<div class="uifb-tray-item">
            ${hasImg}
            <span class="uifb-tray-item-text">${escapeHtml(preview)}</span>
            <button class="uifb-tray-item-remove" data-index="${i}">&times;</button>
          </div>`;
        }).join('');
        document.body.appendChild(listEl);
        positionList(listEl);
      }
    }
    // Restore drag position if tray was previously dragged
    if (trayDragged && trayPos && tray) {
      tray.style.bottom = "auto";
      tray.style.right = "auto";
      tray.style.left = trayPos.left + "px";
      tray.style.top = trayPos.top + "px";
    }
    bindTrayEvents();
  }

  function positionList(listEl) {
    if (!tray || !listEl) return;
    const trayRect = tray.getBoundingClientRect();
    listEl.style.position = "fixed";
    listEl.style.bottom = (window.innerHeight - trayRect.top + 4) + "px";
    listEl.style.right = (window.innerWidth - trayRect.right) + "px";
    listEl.style.width = Math.max(trayRect.width, 260) + "px";
  }

  function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
  }

  function bindTrayEvents() {
    if (!tray) return;
    const sendBtn = tray.querySelector("#uifb-tray-send");
    const clearBtn = tray.querySelector("#uifb-tray-clear");
    const closeBtn = tray.querySelector("#uifb-tray-close");
    const toggleBtn = tray.querySelector("#uifb-tray-toggle");

    if (sendBtn) {
      sendBtn.addEventListener("click", function(e) {
        e.stopPropagation();
        e.stopImmediatePropagation();
        sendAll();
      }, true);
    }
    if (clearBtn) {
      clearBtn.addEventListener("click", function(e) {
        e.stopPropagation();
        e.stopImmediatePropagation();
        clearAll();
      }, true);
    }
    if (closeBtn) {
      closeBtn.addEventListener("click", function(e) {
        e.stopPropagation();
        e.stopImmediatePropagation();
        deactivate();
      }, true);
    }
    if (toggleBtn) {
      toggleBtn.addEventListener("click", function(e) {
        e.stopPropagation();
        e.stopImmediatePropagation();
        listExpanded = !listExpanded;
        updateTrayHTML();
      }, true);
    }

    // Remove individual items (in popout list)
    const listEl = document.getElementById("uifb-tray-list");
    const removeTargets = listEl ? listEl.querySelectorAll(".uifb-tray-item-remove") : [];
    removeTargets.forEach((btn) => {
      btn.addEventListener("click", function(e) {
        e.stopPropagation();
        e.stopImmediatePropagation();
        const idx = parseInt(btn.dataset.index, 10);
        feedbackItems.splice(idx, 1);
        if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
          chrome.storage.local.get({ feedback: [] }, (result) => {
            const stored = result.feedback || [];
            stored.splice(idx, 1);
            chrome.storage.local.set({ feedback: stored });
          });
        }
        updateTrayHTML();
      }, true);
    });
  }

  // Show tray immediately, load any saved feedback from storage
  createTray();
  if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
    chrome.storage.local.get({ feedback: [] }, (result) => {
      const saved = result.feedback || [];
      if (saved.length > 0) {
        feedbackItems = saved;
        updateTrayHTML();
      }
    });
  }

  // ── Hover / click handlers ────────────────────────────────────────────────

  function onMouseOver(e) {
    if (!hoverMode) return;
    if (e.target.closest("#uifb-bubble") || e.target.closest("#uifb-tray")) return;

    if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null; }

    const target = e.target;
    hoverTimer = setTimeout(() => {
      if (hoveredEl && hoveredEl !== target) hoveredEl.classList.remove("uifb-highlight");
      hoveredEl = target;
      hoveredEl.classList.add("uifb-highlight");
      hoverTimer = null;
    }, 150);
  }

  function onMouseOut(e) {
    if (!hoverMode) return;
    if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null; }
    if (e.target) e.target.classList.remove("uifb-highlight");
  }

  function onClick(e) {
    if (!hoverMode) return;
    if (e.target.closest("#uifb-bubble") || e.target.closest("#uifb-tray")) return;

    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    selectedEl = e.target;
    selectedEl.classList.remove("uifb-highlight");
    hoverMode = false;

    showBubble(selectedEl);
  }

  function onKeyDown(e) {
    if (e.key === "Escape") {
      if (bubble) {
        closeBubble();
      } else {
        deactivate();
      }
    }
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      if (bubble) {
        submitFeedback(true);
      } else if (feedbackItems.length > 0) {
        sendAll();
      }
      return;
    }
    if (e.key === "Enter" && bubble) {
      e.preventDefault();
      submitFeedback(false);
    }
  }

  document.addEventListener("mouseover", onMouseOver, true);
  document.addEventListener("mouseout", onMouseOut, true);
  document.addEventListener("click", onClick, true);
  document.addEventListener("keydown", onKeyDown, true);

  // ── Helpers ───────────────────────────────────────────────────────────────

  function getSelectorPath(el) {
    const parts = [];
    let current = el;
    for (let i = 0; i < 4 && current && current !== document.body; i++) {
      let part = current.tagName.toLowerCase();
      if (current.id) {
        part += "#" + current.id;
      } else if (current.className && typeof current.className === "string") {
        const classes = current.className
          .split(/\s+/)
          .filter((c) => c && !c.startsWith("uifb-"))
          .slice(0, 2);
        if (classes.length) part += "." + classes.join(".");
      }
      parts.unshift(part);
      current = current.parentElement;
    }
    return parts.join(" > ");
  }

  function getCleanHtml(el) {
    const clone = el.cloneNode(true);
    clone.classList.remove("uifb-highlight");
    let html = clone.outerHTML;
    if (html.length > 500) {
      html = html.substring(0, 500) + "\u2026";
    }
    return html;
  }

  // ── Bubble (with camera toggle) ───────────────────────────────────────────

  function showBubble(el) {
    if (bubble) bubble.remove();

    const rect = el.getBoundingClientRect();

    bubble = document.createElement("div");
    bubble.id = "uifb-bubble";
    bubble.innerHTML = `
      <button id="uifb-snap-toggle" class="${includeSnapshot ? 'uifb-snap-on' : 'uifb-snap-off'}" title="${includeSnapshot ? 'Screenshot ON' : 'Screenshot OFF'}">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
          <circle cx="12" cy="13" r="4"/>
        </svg>
      </button>
      <input type="text" id="uifb-input" placeholder="Describe the change..." autocomplete="off">
      <button id="uifb-submit-add">Add <kbd>&#9166;</kbd></button>
      <button id="uifb-submit-send">Send <kbd>&#8984;&#9166;</kbd></button>
    `;

    document.body.appendChild(bubble);

    const bubbleRect = bubble.getBoundingClientRect();
    let top = rect.bottom + window.scrollY + 8;
    let left = rect.left + window.scrollX;

    if (left + bubbleRect.width > window.innerWidth - 16) {
      left = window.innerWidth - bubbleRect.width - 16;
    }
    if (left < 16) left = 16;

    if (rect.bottom + bubbleRect.height + 16 > window.innerHeight) {
      top = rect.top + window.scrollY - bubbleRect.height - 8;
    }

    bubble.style.left = left + "px";
    bubble.style.top = top + "px";

    el.style.outline = "2px solid rgba(100,149,237,0.5)";
    el.style.outlineOffset = "-1px";

    const input = bubble.querySelector("#uifb-input");
    setTimeout(() => input.focus(), 50);

    bubble.querySelector("#uifb-snap-toggle").addEventListener("click", function(e) {
      e.stopPropagation();
      e.stopImmediatePropagation();
      includeSnapshot = !includeSnapshot;
      this.className = includeSnapshot ? "uifb-snap-on" : "uifb-snap-off";
      this.title = includeSnapshot ? "Screenshot ON" : "Screenshot OFF";
    }, true);

    bubble.querySelector("#uifb-submit-add").addEventListener("click", function(e) {
      e.stopPropagation();
      e.stopImmediatePropagation();
      submitFeedback(false);
    }, true);
    bubble.querySelector("#uifb-submit-send").addEventListener("click", function(e) {
      e.stopPropagation();
      e.stopImmediatePropagation();
      submitFeedback(true);
    }, true);
  }

  // ── Snapshot capture ──────────────────────────────────────────────────────

  function captureElementSnapshot(el) {
    return new Promise((resolve) => {
      const rect = el.getBoundingClientRect();
      const captureRect = {
        x: Math.round(rect.left),
        y: Math.round(rect.top),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
        devicePixelRatio: window.devicePixelRatio || 1
      };

      chrome.runtime.sendMessage({ action: "captureTab" }, (response) => {
        if (chrome.runtime.lastError || !response || !response.dataUrl) {
          resolve(null);
          return;
        }

        const img = new Image();
        img.onload = () => {
          const dpr = captureRect.devicePixelRatio;
          const sx = captureRect.x * dpr;
          const sy = captureRect.y * dpr;
          const sw = captureRect.width * dpr;
          const sh = captureRect.height * dpr;

          const clampedSw = Math.min(sw, img.width - sx);
          const clampedSh = Math.min(sh, img.height - sy);

          if (clampedSw <= 0 || clampedSh <= 0) {
            resolve(null);
            return;
          }

          const canvas = document.createElement("canvas");
          canvas.width = clampedSw;
          canvas.height = clampedSh;
          const ctx = canvas.getContext("2d");
          ctx.drawImage(img, sx, sy, clampedSw, clampedSh, 0, 0, clampedSw, clampedSh);

          // Scale down to max 600px wide and use JPEG for smaller payloads
          const maxW = 600;
          let outCanvas = canvas;
          if (canvas.width > maxW) {
            const scaled = document.createElement("canvas");
            const ratio = maxW / canvas.width;
            scaled.width = maxW;
            scaled.height = Math.round(canvas.height * ratio);
            scaled.getContext("2d").drawImage(canvas, 0, 0, scaled.width, scaled.height);
            outCanvas = scaled;
          }
          resolve(outCanvas.toDataURL("image/jpeg", 0.8));
        };
        img.onerror = () => resolve(null);
        img.src = response.dataUrl;
      });
    });
  }

  // ── Submit / Send ─────────────────────────────────────────────────────────

  function submitFeedback(sendNow) {
    const input = bubble.querySelector("#uifb-input");
    const text = input.value.trim();
    if (!text) {
      input.style.borderBottom = "2px solid #DC504A";
      input.placeholder = "Type something...";
      return;
    }

    const url = window.location.href;
    const selector = getSelectorPath(selectedEl);
    const html = getCleanHtml(selectedEl);
    const el = selectedEl;
    const wantSnapshot = includeSnapshot;

    const message = `[UI Feedback] Page: ${url}\nElement: ${selector}\nHTML: ${html}\n\nRequested change: ${text}`;

    if (wantSnapshot) {
      // Hide bubble/outline before capturing
      if (bubble) bubble.style.display = "none";
      el.style.outline = "";
      el.style.outlineOffset = "";

      captureElementSnapshot(el).then((dataUrl) => {
        if (dataUrl) {
          // Save snapshot to disk via broker, get back file path
          chrome.runtime.sendMessage({ action: "saveSnapshot", dataUrl }, (resp) => {
            if (chrome.runtime.lastError) {
              showToast("Screenshot failed: " + chrome.runtime.lastError.message, true);
              finishSubmit({ text: message, timestamp: new Date().toISOString() }, sendNow);
              return;
            }
            const item = { text: message, timestamp: new Date().toISOString() };
            if (resp && resp.path) {
              item.snapshotPath = resp.path;
              item.snapshot = true;
            } else {
              showToast("Screenshot save failed" + (resp && resp.error ? ": " + resp.error : ""), true);
            }
            finishSubmit(item, sendNow);
          });
        } else {
          showToast("Screenshot capture failed — enable 'Allow access to file URLs' for file:// pages", true);
          finishSubmit({ text: message, timestamp: new Date().toISOString() }, sendNow);
        }
      });
    } else {
      finishSubmit({ text: message, timestamp: new Date().toISOString() }, sendNow);
    }
  }

  function finishSubmit(item, sendNow) {
    feedbackItems.push(item);

    // Save to chrome.storage (without the base64 data, just the path)
    if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.sendMessage) {
      chrome.runtime.sendMessage({ action: "sendFeedback", text: item.text, snapshotPath: item.snapshotPath || null });
    }

    closeBubble();
    updateTrayHTML();

    if (sendNow) {
      sendAll();
    }
  }

  function sendAll() {
    if (feedbackItems.length === 0) return;

    const btn = tray.querySelector("#uifb-tray-send");
    if (btn) btn.textContent = "Sending...";

    const text = feedbackItems.map((item, i) => {
      let entry = `--- Feedback ${i + 1} ---\n${item.text}`;
      if (item.snapshotPath) {
        entry += `\nSnapshot: ${item.snapshotPath}`;
      }
      return entry;
    }).join("\n\n");

    chrome.runtime.sendMessage({ action: "sendPayload", text: text }, (response) => {
      if (chrome.runtime.lastError) {
        if (btn) btn.textContent = "Send All";
        showToast("Error: " + chrome.runtime.lastError.message, true);
        return;
      }
      if (response && response.ok) {
        feedbackItems = [];
        if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
          chrome.storage.local.set({ feedback: [] });
        }
        updateTrayHTML();
        if (tray) {
          const btn = tray.querySelector("#uifb-tray-send");
          if (btn) {
            btn.textContent = "Sent!";
            btn.style.background = "#22c55e";
            btn.style.borderColor = "#22c55e";
            setTimeout(() => updateTrayHTML(), 1500);
          }
        }
      } else {
        if (btn) btn.textContent = "Send All";
        showToast("Failed: " + (response ? response.error : "No response"), true);
      }
    });
  }

  function clearAll() {
    feedbackItems = [];
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ feedback: [] });
    }
    updateTrayHTML();
  }

  function closeBubble() {
    if (bubble) {
      bubble.remove();
      bubble = null;
    }
    if (selectedEl) {
      selectedEl.style.outline = "";
      selectedEl.style.outlineOffset = "";
      selectedEl = null;
    }
    hoverMode = true;
  }

  function showToast(msg, isError) {
    const existing = document.getElementById("uifb-toast");
    if (existing) existing.remove();

    const toast = document.createElement("div");
    toast.id = "uifb-toast";
    if (isError) {
      toast.style.color = "#DC504A";
      toast.style.borderColor = "rgba(220,80,74,0.2)";
    }
    toast.textContent = msg;
    if (tray) toast.style.bottom = "72px";
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.opacity = "0";
      toast.style.transition = "opacity 0.3s ease";
      setTimeout(() => toast.remove(), 300);
    }, 2000);
  }

  function deactivate() {
    if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null; }
    if (hoveredEl) hoveredEl.classList.remove("uifb-highlight");
    if (selectedEl) {
      selectedEl.style.outline = "";
      selectedEl.style.outlineOffset = "";
    }
    if (bubble) { bubble.remove(); bubble = null; }
    const existingList = document.getElementById("uifb-tray-list");
    if (existingList) existingList.remove();
    if (tray) { tray.remove(); tray = null; }
    document.removeEventListener("mouseover", onMouseOver, true);
    document.removeEventListener("mouseout", onMouseOut, true);
    document.removeEventListener("click", onClick, true);
    document.removeEventListener("keydown", onKeyDown, true);
    window.__uifbActive = false;
    if (typeof chrome !== "undefined" && chrome.storage && chrome.storage.local) {
      chrome.storage.local.set({ feedbackActive: false });
    }
  }

  // Listen for deactivate message from popup
  if (typeof chrome !== "undefined" && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((message) => {
      if (message.action === "deactivate") {
        deactivate();
      }
    });
  }
})();
