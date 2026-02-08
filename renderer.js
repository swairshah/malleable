// ===== Theme toggle =====
const themeToggle = document.getElementById("themeToggle");
const iconSun = themeToggle.querySelector(".icon-sun");
const iconMoon = themeToggle.querySelector(".icon-moon");

function setTheme(mode) {
  document.documentElement.classList.remove("light", "dark");
  document.documentElement.classList.add(mode);
  localStorage.setItem("malleable-theme", mode);

  if (mode === "dark") {
    iconSun.style.display = "";
    iconMoon.style.display = "none";
  } else {
    iconSun.style.display = "none";
    iconMoon.style.display = "";
  }
}

setTheme(localStorage.getItem("malleable-theme") || "dark");

themeToggle.addEventListener("click", () => {
  const current = document.documentElement.classList.contains("dark")
    ? "dark"
    : "light";
  setTheme(current === "dark" ? "light" : "dark");
});

// ===== Auto-resize textarea =====
const chatInput = document.getElementById("chatInput");
const sendButton = document.getElementById("sendButton");
let isStreaming = false;

chatInput.addEventListener("input", () => {
  chatInput.style.height = "auto";
  chatInput.style.height = Math.min(chatInput.scrollHeight, 200) + "px";
  sendButton.disabled = chatInput.value.trim().length === 0 || isStreaming;
});

chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    if (chatInput.value.trim() && !isStreaming) {
      sendMessage(chatInput.value.trim());
    }
  }
});

sendButton.addEventListener("click", () => {
  if (chatInput.value.trim() && !isStreaming) {
    sendMessage(chatInput.value.trim());
  }
});

// ===== Message rendering =====
function createUserMessage(text) {
  const wrapper = document.createElement("div");
  wrapper.className = "message message-user";

  const content = document.createElement("div");
  content.className = "message-content";
  content.textContent = text;

  wrapper.appendChild(content);
  return wrapper;
}

function createAssistantMessage() {
  const wrapper = document.createElement("div");
  wrapper.className = "message message-assistant";

  const msgText = document.createElement("div");
  msgText.className = "message-text";

  wrapper.appendChild(msgText);
  return { wrapper, msgText };
}

// Currently streaming assistant message element
let currentAssistantText = null;
let currentAssistantWrapper = null;
let currentAssistantContent = "";
let currentToolIndicator = null;

// ===== Streaming event handlers =====
window.malleable.onDelta((delta) => {
  if (!currentAssistantWrapper) return;

  // If there's an active tool indicator, make sure text goes after it
  if (!currentAssistantText) {
    currentAssistantText = document.createElement("div");
    currentAssistantText.className = "message-text";
    currentAssistantWrapper.appendChild(currentAssistantText);
  }

  currentAssistantContent += delta;
  currentAssistantText.textContent = currentAssistantContent;

  const messages = document.getElementById("chatMessages");
  messages.scrollTop = messages.scrollHeight;
});

window.malleable.onDone((_finalText) => {
  isStreaming = false;
  currentAssistantText = null;
  currentAssistantWrapper = null;
  currentAssistantContent = "";
  currentToolIndicator = null;
  sendButton.disabled = chatInput.value.trim().length === 0;
  chatInput.focus();
});

window.malleable.onError((error) => {
  isStreaming = false;
  currentAssistantContent = "";

  if (currentAssistantText) {
    currentAssistantText.textContent = "Error: " + error;
    currentAssistantText.style.color = "#e55";
  }

  currentAssistantText = null;
  currentAssistantWrapper = null;
  currentToolIndicator = null;
  sendButton.disabled = chatInput.value.trim().length === 0;
});

// ===== Tool execution indicators =====
window.malleable.onToolStart((data) => {
  if (!currentAssistantWrapper) return;

  // If we were mid-text, finalize that text block so the tool indicator appears after it
  if (currentAssistantText && currentAssistantContent) {
    currentAssistantText = null;
    currentAssistantContent = "";
  }

  const indicator = document.createElement("div");
  indicator.className = "tool-indicator running";

  const icon = document.createElement("span");
  icon.className = "tool-icon";
  icon.textContent = "⚡";

  const label = document.createElement("span");
  label.className = "tool-label";
  label.textContent = data.name;

  const args = document.createElement("span");
  args.className = "tool-args";
  // Show a compact summary of args
  const argSummary = formatToolArgs(data.name, data.args);
  if (argSummary) args.textContent = argSummary;

  indicator.appendChild(icon);
  indicator.appendChild(label);
  if (argSummary) indicator.appendChild(args);

  currentAssistantWrapper.appendChild(indicator);
  currentToolIndicator = indicator;

  const messages = document.getElementById("chatMessages");
  messages.scrollTop = messages.scrollHeight;
});

window.malleable.onToolEnd((data) => {
  if (currentToolIndicator) {
    currentToolIndicator.classList.remove("running");
    currentToolIndicator.classList.add(data.isError ? "error" : "done");
    const icon = currentToolIndicator.querySelector(".tool-icon");
    if (icon) icon.textContent = data.isError ? "✗" : "✓";
    currentToolIndicator = null;
  }
});

function formatToolArgs(toolName, args) {
  if (!args) return "";
  if (typeof args === "string") return args;
  // Show the most relevant arg for each tool
  switch (toolName) {
    case "read": return args.path || args.file || "";
    case "write": return args.path || args.file || "";
    case "edit": return args.path || args.file || "";
    case "bash": return args.command || "";
    case "grep": return args.pattern || "";
    case "find": return args.pattern || args.glob || "";
    case "ls": return args.path || "";
    default: return JSON.stringify(args).slice(0, 80);
  }
}

async function sendMessage(text) {
  const messages = document.getElementById("chatMessages");

  // Remove empty state if present
  const emptyState = messages.querySelector(".empty-state");
  if (emptyState) emptyState.remove();

  // Add user message
  messages.appendChild(createUserMessage(text));

  // Clear input
  chatInput.value = "";
  chatInput.style.height = "auto";

  // Create streaming assistant message
  const { wrapper, msgText } = createAssistantMessage();
  messages.appendChild(wrapper);
  currentAssistantWrapper = wrapper;
  currentAssistantText = msgText;
  currentAssistantContent = "";

  // Disable input while streaming
  isStreaming = true;
  sendButton.disabled = true;

  messages.scrollTop = messages.scrollHeight;

  // Send to agent
  const result = await window.malleable.sendMessage(text);
  if (result.error) {
    isStreaming = false;
    currentAssistantText.textContent = "Error: " + result.error;
    currentAssistantText.style.color = "#e55";
    currentAssistantText = null;
    sendButton.disabled = chatInput.value.trim().length === 0;
  }
}

// ===== Resizable panels =====
const resizeHandle = document.getElementById("resizeHandle");
const chatPanel = document.querySelector(".chat-panel");
let isResizing = false;

resizeHandle.addEventListener("mousedown", (e) => {
  isResizing = true;
  resizeHandle.classList.add("active");
  document.body.style.cursor = "col-resize";
  document.body.style.userSelect = "none";
  e.preventDefault();
});

document.addEventListener("mousemove", (e) => {
  if (!isResizing) return;
  const containerWidth = document.querySelector(".main-layout").offsetWidth;
  const newWidth = Math.max(320, Math.min(e.clientX, containerWidth - 300));
  chatPanel.style.width = newWidth + "px";
});

document.addEventListener("mouseup", () => {
  if (isResizing) {
    isResizing = false;
    resizeHandle.classList.remove("active");
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }
});

// ===== Infinite canvas (pan & zoom) =====
const canvasViewport = document.getElementById("canvasViewport");
const canvasWorld = document.getElementById("canvasWorld");
const canvasOverlay = document.getElementById("canvasOverlay");
const zoomIndicator = document.getElementById("zoomIndicator");
const canvasFrame = document.getElementById("canvasFrame");

let panX = 0;
let panY = 0;
let zoom = 1;
const ZOOM_MIN = 0.1;
const ZOOM_MAX = 3;
const FRAME_W = 1280;
const FRAME_H = 800;

function applyTransform() {
  canvasWorld.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
  zoomIndicator.textContent = Math.round(zoom * 100) + "%";
}

function centerCanvas() {
  const vw = canvasViewport.clientWidth;
  const vh = canvasViewport.clientHeight;
  panX = (vw - FRAME_W) / 2;
  panY = (vh - FRAME_H) / 2;
  zoom = 1;
  applyTransform();
}

centerCanvas();

// --- Wheel: pan (plain) / zoom (Cmd/Ctrl) ---
// Attached to overlay so it intercepts even when cursor is over the iframe
canvasOverlay.addEventListener("wheel", (e) => {
  e.preventDefault();

  if (e.metaKey || e.ctrlKey) {
    const rect = canvasViewport.getBoundingClientRect();
    const cursorX = e.clientX - rect.left;
    const cursorY = e.clientY - rect.top;

    const wx = (cursorX - panX) / zoom;
    const wy = (cursorY - panY) / zoom;

    const delta = -e.deltaY * 0.01;
    const newZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, zoom * (1 + delta)));

    panX = cursorX - wx * newZoom;
    panY = cursorY - wy * newZoom;
    zoom = newZoom;
  } else {
    panX -= e.deltaX;
    panY -= e.deltaY;
  }

  applyTransform();
}, { passive: false });

// --- Drag pan / click-through ---
// The overlay intercepts all mousedowns. If the user drags, it pans.
// If they just click (< 4px movement), hide the overlay briefly and
// forward the click into the iframe content underneath.
const CLICK_THRESHOLD = 4;
let isDragPanning = false;
let dragStartX = 0;
let dragStartY = 0;
let dragStartPanX = 0;
let dragStartPanY = 0;

canvasOverlay.addEventListener("mousedown", (e) => {
  if (e.button !== 0) return;

  isDragPanning = true;
  dragStartX = e.clientX;
  dragStartY = e.clientY;
  dragStartPanX = panX;
  dragStartPanY = panY;
  canvasOverlay.classList.add("grabbing");
  e.preventDefault();
});

document.addEventListener("mousemove", (e) => {
  if (!isDragPanning) return;
  panX = dragStartPanX + (e.clientX - dragStartX);
  panY = dragStartPanY + (e.clientY - dragStartY);
  applyTransform();
});

document.addEventListener("mouseup", (e) => {
  if (!isDragPanning) return;
  isDragPanning = false;
  canvasOverlay.classList.remove("grabbing");

  // If barely moved, treat as a click — let user interact with iframe
  const dx = e.clientX - dragStartX;
  const dy = e.clientY - dragStartY;
  if (Math.abs(dx) < CLICK_THRESHOLD && Math.abs(dy) < CLICK_THRESHOLD) {
    // Check if the click lands over the iframe
    canvasOverlay.style.pointerEvents = "none";
    const target = document.elementFromPoint(e.clientX, e.clientY);
    canvasOverlay.style.pointerEvents = "";

    if (target === canvasFrame || canvasFrame.contains(target)) {
      // Disable the overlay so the user can freely interact with the iframe.
      // It re-enables when they click outside the iframe or press Escape.
      enterIframeInteraction();
    }
  }
});

let iframeInteractionCleanup = null;

function enterIframeInteraction() {
  if (iframeInteractionCleanup) return; // already in iframe mode
  canvasOverlay.style.pointerEvents = "none";

  function exit() {
    exitIframeInteraction();
  }

  // Re-enable overlay when clicking outside the iframe
  function onDocMouseDown(e) {
    if (!canvasFrame.contains(e.target) && e.target !== canvasFrame) {
      exit();
    }
  }

  function onKeyDown(e) {
    if (e.key === "Escape") {
      exit();
    }
  }

  // When mouse moves over the viewport background (not iframe), re-enable
  // With pointer-events:none on overlay, events over iframe go to iframe (cross-origin,
  // invisible to us). Events over the dot-grid background hit the viewport directly.
  function onViewportMouseMove(e) {
    if (e.target === canvasViewport) {
      exit();
    }
  }

  iframeInteractionCleanup = () => {
    document.removeEventListener("mousedown", onDocMouseDown, true);
    document.removeEventListener("keydown", onKeyDown);
    canvasViewport.removeEventListener("mousemove", onViewportMouseMove);
    iframeInteractionCleanup = null;
  };

  document.addEventListener("mousedown", onDocMouseDown, true);
  document.addEventListener("keydown", onKeyDown);
  canvasViewport.addEventListener("mousemove", onViewportMouseMove);
}

function exitIframeInteraction() {
  canvasOverlay.style.pointerEvents = "";
  if (iframeInteractionCleanup) iframeInteractionCleanup();
}

// ===== Canvas rendering =====
const canvasEmpty = document.getElementById("canvasEmpty");

// Bridge script injected into every rendered iframe.
// Creates a `malleable` object the AI-generated code can call.
const BRIDGE_SCRIPT = `<script>
window.malleable = {
  sendChat: function(text) {
    window.parent.postMessage({ type: "malleable:chat", text: text }, "*");
  }
};
<\/script>`;

window.malleable.onCanvasRender((html) => {
  canvasEmpty.style.display = "none";
  canvasFrame.style.display = "block";
  // Inject bridge right after <head> (or at the start if no <head>)
  let injected;
  if (html.includes("<head>")) {
    injected = html.replace("<head>", "<head>" + BRIDGE_SCRIPT);
  } else if (html.includes("<html>")) {
    injected = html.replace("<html>", "<html><head>" + BRIDGE_SCRIPT + "</head>");
  } else {
    injected = BRIDGE_SCRIPT + html;
  }
  canvasFrame.srcdoc = injected;
});

// Listen for postMessage from the canvas iframe
window.addEventListener("message", (e) => {
  const data = e.data;
  if (!data || data.type !== "malleable:chat") return;
  if (typeof data.text !== "string" || !data.text.trim()) return;
  if (isStreaming) return; // ignore if already processing
  sendMessage(data.text.trim());
});

// ===== Focus shortcut =====
document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key === "l") {
    e.preventDefault();
    chatInput.focus();
  }
});
