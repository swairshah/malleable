# Malleable

A desktop app for building UI through conversation. Chat with an AI agent on the left, see the result rendered live on an infinite canvas to the right.

Built with Electron and the [pi-agent](https://github.com/nichochar/pi-agent) SDK.

## Setup

```bash
npm install
```

Set your API key:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

## Usage

```bash
npm start
```

Type in the chat to ask the agent to build something. It will render the result on the canvas using a `render` tool. The rendered page can call `malleable.sendChat("...")` to send messages back to the agent, enabling interactive UIs where buttons trigger agent actions.

### Canvas controls

| Action | Input |
|--------|-------|
| Pan | Scroll / trackpad two-finger swipe |
| Zoom | Cmd/Ctrl + scroll |
| Drag pan | Click + drag on background |
| Interact with page | Click on the rendered frame |
| Return to canvas | Move mouse off frame, click outside, or press Escape |

## Structure

```
main.js        Main process — agent setup, IPC handlers
preload.cjs    Context bridge
renderer.js    Renderer logic — chat UI, infinite canvas
index.html     App layout
styles.css     Styling and themes
```
