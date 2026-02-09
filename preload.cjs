const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("malleable", {
  platform: process.platform,

  // Chat API
  sendMessage: (text, images) => ipcRenderer.invoke("chat:send", { text, images }),
  abort: () => ipcRenderer.invoke("chat:abort"),
  clearChat: () => ipcRenderer.invoke("chat:clear"),
  getCwd: () => ipcRenderer.invoke("chat:get-cwd"),
  pickCwd: () => ipcRenderer.invoke("chat:pick-cwd"),

  // Streaming events from main process
  onDelta: (callback) => {
    const handler = (_event, delta) => callback(delta);
    ipcRenderer.on("chat:delta", handler);
    return () => ipcRenderer.removeListener("chat:delta", handler);
  },
  onDone: (callback) => {
    const handler = (_event, text) => callback(text);
    ipcRenderer.on("chat:done", handler);
    return () => ipcRenderer.removeListener("chat:done", handler);
  },
  onError: (callback) => {
    const handler = (_event, error) => callback(error);
    ipcRenderer.on("chat:error", handler);
    return () => ipcRenderer.removeListener("chat:error", handler);
  },
  onToolStart: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on("chat:tool_start", handler);
    return () => ipcRenderer.removeListener("chat:tool_start", handler);
  },
  onToolEnd: (callback) => {
    const handler = (_event, data) => callback(data);
    ipcRenderer.on("chat:tool_end", handler);
    return () => ipcRenderer.removeListener("chat:tool_end", handler);
  },

  // Canvas rendering
  onCanvasRender: (callback) => {
    const handler = (_event, html) => callback(html);
    ipcRenderer.on("canvas:render", handler);
    return () => ipcRenderer.removeListener("canvas:render", handler);
  },
});
