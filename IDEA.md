# Malleable - Idea & Design Notes

## What is it?

Malleable is a desktop app (Electron) where you chat with an AI agent on the left and it renders live UI on a canvas to the right. You describe what you want, the agent builds it, and the result appears instantly as a working HTML page you can interact with.

The agent has full coding tools (read, write, edit, bash, grep, etc.) plus a `render` tool that pushes complete HTML documents into a sandboxed iframe on the canvas.

## Canvas Bridge

Rendered pages get a `malleable` object injected automatically. AI-generated code can call `malleable.sendChat("...")` to send messages back to the agent as if the user typed them. This lets buttons and UI elements trigger arbitrary agent behavior at runtime — the agent decides what to do when it receives the message.

## Infinite Canvas

The canvas panel is a Figma-style infinite canvas rather than a static viewport. The rendered page appears as a floating 1280x800 "frame" on a dot-grid background.

### Controls
- **Pan**: Trackpad two-finger scroll or mouse wheel scrolls the canvas
- **Zoom**: Cmd/Ctrl + scroll zooms toward the cursor position (0.1x - 3x range)
- **Drag pan**: Click and drag on the background to pan around
- **Zoom indicator**: Small label in the bottom-right showing current zoom percentage

### Overlay system

An invisible overlay sits on top of the canvas to intercept pan/zoom gestures. Without it, the iframe captures all mouse and wheel events when the rendered content is large, making the canvas uncontrollable.

The overlay uses a two-mode interaction model:

1. **Canvas mode** (default) - The overlay captures all events. Wheel pans/zooms, click+drag pans. If the user clicks without dragging (< 4px movement) on the iframe area, it switches to iframe mode.

2. **Iframe mode** - The overlay becomes transparent to pointer events (`pointer-events: none`). The user can freely interact with the iframe content (click buttons, type in inputs, scroll within the page). The overlay re-engages when the user:
   - Moves their mouse off the iframe onto the background
   - Clicks outside the iframe
   - Presses Escape

## Architecture

```
main.js          Electron main process. Creates the agent, handles IPC.
preload.cjs      Context bridge exposing IPC channels to renderer.
renderer.js      All renderer-side logic: chat UI, canvas pan/zoom, theme toggle.
index.html       Layout: titlebar, chat panel, resize handle, canvas panel.
styles.css       All styling. Dark/light themes, dot-grid, canvas frame shadow.
```
