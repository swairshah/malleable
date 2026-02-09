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

  // Propagate theme to canvas iframe
  const frame = document.getElementById("canvasFrame");
  if (frame && frame.contentWindow) {
    frame.contentWindow.postMessage({ type: "malleable:theme", theme: mode }, "*");
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
const stopButton = document.getElementById("stopButton");
const imagePreviewArea = document.getElementById("imagePreviewArea");
let isStreaming = false;
let pendingImages = []; // { data: base64, mimeType: string }

function updateSendButton() {
  const hasContent = chatInput.value.trim().length > 0 || pendingImages.length > 0;
  sendButton.disabled = !hasContent;
}

function setStreamingUI(streaming) {
  isStreaming = streaming;
  stopButton.style.display = streaming ? "" : "none";
  updateSendButton();
}

chatInput.addEventListener("input", () => {
  chatInput.style.height = "auto";
  chatInput.style.height = Math.min(chatInput.scrollHeight, 200) + "px";
  updateSendButton();
});

chatInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) {
    e.preventDefault();
    if (chatInput.value.trim() || pendingImages.length > 0) {
      sendMessage(chatInput.value.trim());
    }
  }
});

sendButton.addEventListener("click", () => {
  if (chatInput.value.trim() || pendingImages.length > 0) {
    sendMessage(chatInput.value.trim());
  }
});

stopButton.addEventListener("click", () => {
  window.malleable.abort();
});

// ===== Image paste handling =====
chatInput.addEventListener("paste", (e) => {
  const items = e.clipboardData?.items;
  if (!items) return;

  for (const item of items) {
    if (!item.type.startsWith("image/")) continue;
    e.preventDefault();

    const file = item.getAsFile();
    if (!file) continue;

    addImageFile(file);
  }
});

// ===== Image drag-and-drop handling =====
// Prevent Electron's default behavior of navigating to dropped files
document.addEventListener("dragover", (e) => {
  e.preventDefault();
  e.stopPropagation();
});

document.addEventListener("drop", (e) => {
  e.preventDefault();
  e.stopPropagation();
});

// Chat input area drop zone
const chatInputArea = document.querySelector(".chat-input-area");

chatInputArea.addEventListener("dragover", (e) => {
  e.preventDefault();
  e.stopPropagation();
  chatInputArea.classList.add("drag-over");
});

chatInputArea.addEventListener("dragleave", (e) => {
  e.preventDefault();
  e.stopPropagation();
  // Only remove if leaving the chat input area entirely
  if (!chatInputArea.contains(e.relatedTarget)) {
    chatInputArea.classList.remove("drag-over");
  }
});

chatInputArea.addEventListener("drop", (e) => {
  e.preventDefault();
  e.stopPropagation();
  chatInputArea.classList.remove("drag-over");

  const files = e.dataTransfer?.files;
  if (!files) return;

  for (const file of files) {
    if (!file.type.startsWith("image/")) continue;
    addImageFile(file);
  }
});

// Shared helper: read an image File into pendingImages
function addImageFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    const dataUrl = reader.result;
    const base64 = dataUrl.split(",")[1];
    const mimeType = file.type;

    pendingImages.push({ data: base64, mimeType });
    renderImagePreviews();
    updateSendButton();
  };
  reader.readAsDataURL(file);
}

function renderImagePreviews() {
  // Clear existing previews
  while (imagePreviewArea.firstChild) {
    imagePreviewArea.removeChild(imagePreviewArea.firstChild);
  }

  if (pendingImages.length === 0) {
    imagePreviewArea.style.display = "none";
    return;
  }

  imagePreviewArea.style.display = "";

  pendingImages.forEach((img, i) => {
    const container = document.createElement("div");
    container.className = "image-preview";

    const imgEl = document.createElement("img");
    imgEl.src = "data:" + img.mimeType + ";base64," + img.data;
    container.appendChild(imgEl);

    const removeBtn = document.createElement("button");
    removeBtn.className = "image-preview-remove";
    removeBtn.textContent = "\u00d7";
    removeBtn.addEventListener("click", () => {
      pendingImages.splice(i, 1);
      renderImagePreviews();
      updateSendButton();
    });
    container.appendChild(removeBtn);

    imagePreviewArea.appendChild(container);
  });
}

// ===== Message rendering =====
function createUserMessage(text, images) {
  const wrapper = document.createElement("div");
  wrapper.className = "message message-user";

  if (text) {
    const content = document.createElement("div");
    content.className = "message-content";
    content.textContent = text;
    wrapper.appendChild(content);
  }

  if (images && images.length > 0) {
    const imagesDiv = document.createElement("div");
    imagesDiv.className = "message-images";
    images.forEach((img) => {
      const imgEl = document.createElement("img");
      imgEl.className = "message-image";
      imgEl.src = "data:" + img.mimeType + ";base64," + img.data;
      imagesDiv.appendChild(imgEl);
    });
    wrapper.appendChild(imagesDiv);
  }

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

  // Remove typing indicator if present
  const typing = currentAssistantWrapper.querySelector(".typing-indicator");
  if (typing) typing.remove();

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
  // Remove typing indicator if still present
  if (currentAssistantWrapper) {
    const typing = currentAssistantWrapper.querySelector(".typing-indicator");
    if (typing) typing.remove();
  }

  setStreamingUI(false);
  currentAssistantText = null;
  currentAssistantWrapper = null;
  currentAssistantContent = "";
  currentToolIndicator = null;
  chatInput.focus();
});

window.malleable.onError((error) => {
  currentAssistantContent = "";

  // Remove typing indicator if present
  if (currentAssistantWrapper) {
    const typing = currentAssistantWrapper.querySelector(".typing-indicator");
    if (typing) typing.remove();
  }

  if (currentAssistantText) {
    currentAssistantText.textContent = "Error: " + error;
    currentAssistantText.style.color = "#e55";
  }

  setStreamingUI(false);
  currentAssistantText = null;
  currentAssistantWrapper = null;
  currentToolIndicator = null;
});

// ===== Tool execution indicators =====
window.malleable.onToolStart((data) => {
  if (!currentAssistantWrapper) return;

  // Remove typing indicator if present
  const typing = currentAssistantWrapper.querySelector(".typing-indicator");
  if (typing) typing.remove();

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

function createTypingIndicator() {
  const container = document.createElement("div");
  container.className = "typing-indicator";
  for (let i = 0; i < 3; i++) {
    const dot = document.createElement("span");
    dot.className = "dot";
    container.appendChild(dot);
  }
  return container;
}

async function sendMessage(text) {
  const messages = document.getElementById("chatMessages");

  // Remove empty state if present
  const emptyState = messages.querySelector(".empty-state");
  if (emptyState) emptyState.remove();

  // Capture and clear pending images
  const images = pendingImages.length > 0 ? [...pendingImages] : undefined;
  pendingImages = [];
  renderImagePreviews();

  // Add user message (with image thumbnails if any)
  messages.appendChild(createUserMessage(text, images));

  // Clear input
  chatInput.value = "";
  chatInput.style.height = "auto";
  updateSendButton();

  // If not already streaming, create a new assistant message block
  if (!isStreaming) {
    const { wrapper, msgText } = createAssistantMessage();
    messages.appendChild(wrapper);
    currentAssistantWrapper = wrapper;
    currentAssistantText = msgText;
    currentAssistantContent = "";

    // Add typing indicator
    const typingDots = createTypingIndicator();
    currentAssistantWrapper.appendChild(typingDots);

    setStreamingUI(true);
  }

  messages.scrollTop = messages.scrollHeight;

  // Send to agent (will steer if already streaming)
  const result = await window.malleable.sendMessage(text, images);
  if (result.error) {
    // Remove typing indicator on error
    if (currentAssistantWrapper) {
      const typing = currentAssistantWrapper.querySelector(".typing-indicator");
      if (typing) typing.remove();
    }
    setStreamingUI(false);
    if (currentAssistantText) {
      currentAssistantText.textContent = "Error: " + result.error;
      currentAssistantText.style.color = "#e55";
    }
    currentAssistantText = null;
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
const canvasFrameContainer = document.getElementById("canvasFrameContainer");
const canvasSelection = document.getElementById("canvasSelection");

let panX = 0;
let panY = 0;
let zoom = 1;
const ZOOM_MIN = 0.1;
const ZOOM_MAX = 3;
let frameX = 0;
let frameY = 0;
let frameW = 1280;
let frameH = 800;
let isFrameSelected = false;

function applyTransform() {
  canvasWorld.style.transform = `translate(${panX}px, ${panY}px) scale(${zoom})`;
  zoomIndicator.textContent = Math.round(zoom * 100) + "%";
  updateSelection();
}

function centerCanvas() {
  const vw = canvasViewport.clientWidth;
  const vh = canvasViewport.clientHeight;
  panX = (vw - frameW) / 2;
  panY = (vh - frameH) / 2;
  zoom = 1;
  applyTransform();
}

centerCanvas();
updateFrameContainer();

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

  // If barely moved, treat as a click
  const dx = e.clientX - dragStartX;
  const dy = e.clientY - dragStartY;
  if (Math.abs(dx) < CLICK_THRESHOLD && Math.abs(dy) < CLICK_THRESHOLD) {
    canvasOverlay.style.pointerEvents = "none";
    const target = document.elementFromPoint(e.clientX, e.clientY);
    canvasOverlay.style.pointerEvents = "";

    const isOverFrame = canvasFrame.style.display !== "none" &&
      (target === canvasFrame || target === canvasFrameContainer ||
       canvasFrameContainer.contains(target));

    if (isOverFrame) {
      if (!isFrameSelected) {
        selectFrame();
      } else {
        enterIframeInteraction();
      }
    } else if (isFrameSelected) {
      deselectFrame();
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

// ===== Frame selection & resize =====
function updateFrameContainer() {
  canvasFrameContainer.style.left = frameX + "px";
  canvasFrameContainer.style.top = frameY + "px";
  canvasFrameContainer.style.width = frameW + "px";
  canvasFrameContainer.style.height = frameH + "px";
}

function updateSelection() {
  if (!isFrameSelected) {
    canvasSelection.style.display = "none";
    return;
  }
  canvasSelection.style.display = "";
  canvasSelection.style.left = (panX + frameX * zoom) + "px";
  canvasSelection.style.top = (panY + frameY * zoom) + "px";
  canvasSelection.style.width = (frameW * zoom) + "px";
  canvasSelection.style.height = (frameH * zoom) + "px";
  canvasSelection.style.borderRadius = (8 * zoom) + "px";
}

function selectFrame() {
  isFrameSelected = true;
  updateSelection();
}

function deselectFrame() {
  isFrameSelected = false;
  updateSelection();
}

// --- Resize handles ---
let isResizingFrame = false;
let resizeDir = "";
let resizeStartMouseX = 0;
let resizeStartMouseY = 0;
let resizeStartFrameX = 0;
let resizeStartFrameY = 0;
let resizeStartFrameW = 0;
let resizeStartFrameH = 0;
const MIN_FRAME_W = 320;
const MIN_FRAME_H = 200;

canvasSelection.querySelectorAll(".resize-handle").forEach((handle) => {
  handle.addEventListener("mousedown", (e) => {
    e.stopPropagation();
    e.preventDefault();
    isResizingFrame = true;
    resizeDir = handle.dataset.dir;
    resizeStartMouseX = e.clientX;
    resizeStartMouseY = e.clientY;
    resizeStartFrameX = frameX;
    resizeStartFrameY = frameY;
    resizeStartFrameW = frameW;
    resizeStartFrameH = frameH;
    document.body.style.cursor = getComputedStyle(handle).cursor;
    document.body.style.userSelect = "none";
  });
});

document.addEventListener("mousemove", (e) => {
  if (!isResizingFrame) return;
  const dx = (e.clientX - resizeStartMouseX) / zoom;
  const dy = (e.clientY - resizeStartMouseY) / zoom;

  let newX = resizeStartFrameX;
  let newY = resizeStartFrameY;
  let newW = resizeStartFrameW;
  let newH = resizeStartFrameH;

  if (resizeDir.includes("e")) {
    newW = Math.max(MIN_FRAME_W, resizeStartFrameW + dx);
  }
  if (resizeDir.includes("w")) {
    const clampedDx = Math.min(dx, resizeStartFrameW - MIN_FRAME_W);
    newX = resizeStartFrameX + clampedDx;
    newW = resizeStartFrameW - clampedDx;
  }
  if (resizeDir.includes("s")) {
    newH = Math.max(MIN_FRAME_H, resizeStartFrameH + dy);
  }
  if (resizeDir.includes("n")) {
    const clampedDy = Math.min(dy, resizeStartFrameH - MIN_FRAME_H);
    newY = resizeStartFrameY + clampedDy;
    newH = resizeStartFrameH - clampedDy;
  }

  frameX = newX;
  frameY = newY;
  frameW = newW;
  frameH = newH;

  updateFrameContainer();
  updateSelection();
});

document.addEventListener("mouseup", () => {
  if (isResizingFrame) {
    isResizingFrame = false;
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }
});

// ===== Canvas rendering =====
const canvasEmpty = document.getElementById("canvasEmpty");

// Bridge script injected into every rendered iframe.
// Creates a `malleable` object the AI-generated code can call.
const BRIDGE_SCRIPT = `<style>
html.light-filter { filter: invert(1) hue-rotate(180deg); }
html.light-filter img, html.light-filter video, html.light-filter canvas, html.light-filter svg image { filter: invert(1) hue-rotate(180deg); }
</style>
<script>
window.malleable = {
  sendChat: function(text) {
    window.parent.postMessage({ type: "malleable:chat", text: text }, "*");
  }
};
window.addEventListener("message", function(e) {
  if (e.data && e.data.type === "malleable:theme") {
    if (e.data.theme === "light") {
      document.documentElement.classList.add("light-filter");
    } else {
      document.documentElement.classList.remove("light-filter");
    }
  }
});
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
  canvasFrame.onload = () => {
    const theme = document.documentElement.classList.contains("dark") ? "dark" : "light";
    canvasFrame.contentWindow.postMessage({ type: "malleable:theme", theme }, "*");
  };
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

// ===== Working directory indicator =====
const cwdIndicator = document.getElementById("cwdIndicator");
const cwdPath = document.getElementById("cwdPath");

function shortenPath(p) {
  const home = window.malleable.platform === "darwin" ? "/Users/" : "/home/";
  if (p.startsWith(home)) {
    const afterHome = p.slice(home.length);
    const slash = afterHome.indexOf("/");
    if (slash !== -1) return "~" + afterHome.slice(slash);
    return "~";
  }
  return p;
}

function updateCwdDisplay(cwd) {
  cwdPath.textContent = shortenPath(cwd);
  cwdIndicator.title = cwd;
}

// Load initial cwd
window.malleable.getCwd().then(updateCwdDisplay);

cwdIndicator.addEventListener("click", async () => {
  const result = await window.malleable.pickCwd();
  if (!result.canceled) {
    updateCwdDisplay(result.cwd);
  }
});
