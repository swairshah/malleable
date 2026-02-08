import { app, BrowserWindow, ipcMain } from "electron";
import path from "path";
import { fileURLToPath } from "url";
import { Agent } from "@mariozechner/pi-agent-core";
import { getModel } from "@mariozechner/pi-ai";
import { createCodingTools } from "@mariozechner/pi-coding-agent";
import { Type } from "@sinclair/typebox";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let mainWindow;
let agent;

function createRenderTool() {
  const renderSchema = Type.Object({
    html: Type.String({
      description:
        "Complete HTML document to render. Can include inline <style> and <script> tags. This will be rendered in an iframe on the canvas.",
    }),
  });

  return {
    name: "render",
    label: "render",
    description:
      "Render HTML in the canvas panel. Pass a complete HTML document (including <!DOCTYPE html>, <html>, <head>, <body>). You can include inline CSS via <style> tags and JavaScript via <script> tags. Use this to show UI components, visualizations, or any web content to the user. Always send a complete, self-contained HTML document.",
    parameters: renderSchema,
    execute: async (_toolCallId, { html }) => {
      mainWindow?.webContents.send("canvas:render", html);
      return {
        content: [{ type: "text", text: "Rendered HTML in the canvas." }],
        details: undefined,
      };
    },
  };
}

function createAgent() {
  const model = getModel("anthropic", "claude-sonnet-4-5-20250929");
  const cwd = process.cwd();
  const tools = [...createCodingTools(cwd), createRenderTool()];

  agent = new Agent({
    initialState: {
      systemPrompt: `You are a helpful coding assistant that builds UI components and renders them on a canvas.

Your working directory is: ${cwd}

You have filesystem tools: read, write, edit, bash, grep, find, ls.
You also have a "render" tool that displays HTML in the canvas panel to the right of this chat.

When the user asks you to build or show something visual, use the render tool with a complete HTML document. Include all CSS and JS inline. Make it look polished.

## Design System

## Canvas Bridge API

Inside every rendered HTML, a \`malleable\` object is automatically available. The AI-generated code can use it to send messages back to you (the agent) as if the user typed them in the chat:

  malleable.sendChat("do something")

Use this to make interactive UIs. For example, a button that asks the agent to run a command:

  <button onclick="malleable.sendChat('run the tests and show me the results')">Run Tests</button>

The message will appear in the chat as a user message, and you will receive it and can act on it with your full tool suite (bash, read, write, etc.), then re-render the canvas with updated content. This is how buttons trigger arbitrary behavior at runtime — you define what they do when you receive the message.

## Design System

All rendered HTML MUST follow this design system. Use these exact values:

Fonts (use system stack, do not load external fonts):
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  Monospace: "SF Mono", "Fira Code", ui-monospace, monospace;

Color palette (dark mode — always use dark mode):
  Background:        #1a1818
  Surface/cards:     #252323
  Foreground text:   #a2a2a2
  Strong text:       #d4d4d4
  Muted text:        #666
  Borders:           #333
  Input borders:     #444
  Focus ring:        #555
  Hover highlight:   #333
  Code background:   #333
  Accent (buttons):  #555 (hover: #666)
  Button text:       #fff
  Error:             #e55
  Success:           #5a9

General styling rules:
  - Border radius: 0.5rem (8px) for cards/containers, 4-6px for buttons/inputs
  - Font size: 14px base, 13px secondary, 12px labels
  - Line height: 1.5
  - Spacing: use multiples of 4px (4, 8, 12, 16, 24)
  - Scrollbars: thin, translucent gray (rgba(128,128,128,0.3))
  - Transitions: 0.15s ease
  - No harsh shadows — use subtle borders instead
  - Antialiased text: -webkit-font-smoothing: antialiased

Always set the <body> background to #1a1818 and text color to #a2a2a2. All components should feel minimal, clean, neutral.

Be concise and direct in your text responses.`,
      model,
      thinkingLevel: "off",
      tools,
      messages: [],
    },
    getApiKey: async (provider) => {
      if (provider === "anthropic") {
        return process.env.ANTHROPIC_API_KEY;
      }
      return undefined;
    },
  });
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: "hiddenInset",
    trafficLightPosition: { x: 12, y: 12 },
    backgroundColor: "#1a1818",
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile("index.html");
}

// IPC: send a chat message to the agent
ipcMain.handle("chat:send", async (_event, text) => {
  if (!agent) {
    return { error: "Agent not initialized" };
  }

  if (agent.state.isStreaming) {
    return { error: "Agent is already processing" };
  }

  // Subscribe for streaming events
  const unsubscribe = agent.subscribe((event) => {
    if (
      event.type === "message_update" &&
      event.assistantMessageEvent?.type === "text_delta"
    ) {
      mainWindow?.webContents.send(
        "chat:delta",
        event.assistantMessageEvent.delta
      );
    } else if (event.type === "tool_execution_start") {
      mainWindow?.webContents.send("chat:tool_start", {
        name: event.toolName,
        args: event.args,
      });
    } else if (event.type === "tool_execution_end") {
      mainWindow?.webContents.send("chat:tool_end", {
        name: event.toolName,
        isError: event.isError,
      });
    }
  });

  try {
    await agent.prompt(text);

    // Extract final text from the last assistant message
    const messages = agent.state.messages;
    const lastAssistant = [...messages]
      .reverse()
      .find((m) => m.role === "assistant");

    let finalText = "";
    if (lastAssistant) {
      const textPart = lastAssistant.content.find((c) => c.type === "text");
      if (textPart) {
        finalText = textPart.text;
      }
    }

    mainWindow?.webContents.send("chat:done", finalText);
    return { ok: true };
  } catch (err) {
    const errorMsg = err?.message || "Unknown error";
    mainWindow?.webContents.send("chat:error", errorMsg);
    return { error: errorMsg };
  } finally {
    unsubscribe();
  }
});

// IPC: abort the current stream
ipcMain.handle("chat:abort", async () => {
  if (agent) {
    agent.abort();
  }
  return { ok: true };
});

// IPC: clear conversation
ipcMain.handle("chat:clear", async () => {
  if (agent) {
    agent.replaceMessages([]);
  }
  return { ok: true };
});

app.whenReady().then(() => {
  createAgent();
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
