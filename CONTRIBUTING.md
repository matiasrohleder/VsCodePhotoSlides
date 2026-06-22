# Contributing to Photo Slides

Thanks for your interest in improving Photo Slides! This document covers how to
build, run, and understand the extension.

## Prerequisites

- [Node.js](https://nodejs.org/) 18+
- [VS Code](https://code.visualstudio.com/) 1.85+

## Build & run (F5)

```bash
# Install dependencies
npm install

# Compile once...
npm run compile
# ...or keep the compiler running in watch mode
npm run watch
```

Then open this folder in VS Code and press **F5** (or *Run > Start Debugging*).
This launches an **Extension Development Host** window with the extension loaded.
Open the Explorer side bar and find the **Photo Slides** panel.

## Project structure

- [`src/extension.ts`](src/extension.ts) — activation, registration of the
  `WebviewViewProvider`, commands, and the configuration-change listener.
- [`src/PhotoSlidesViewProvider.ts`](src/PhotoSlidesViewProvider.ts) — all the
  Node.js logic (`fs`/`path`), HTML generation with a strict CSP + nonce,
  recursive scan, sorting, and message passing with the webview.
- [`media/main.js`](media/main.js) — webview-side playback logic (timer, shuffle,
  controls, keyboard, context menu).
- [`media/main.css`](media/main.css) — styles based on native VS Code variables.
- [`media/icon.png`](media/icon.png) — Marketplace icon (128×128).

The **filesystem is never touched from the webview**: the extension reads the
folder, converts each path with `asWebviewUri()`, and sends the list via
`postMessage`. The webview only renders and sends back commands.

## Performance notes

- The slideshow timer runs in the webview renderer, **not** the extension host,
  so it never blocks the editor UI.
- No file watchers and no disk polling — the folder is read only on load, folder
  change, or manual refresh.
- The timer is **paused while the panel is hidden** to avoid background work.
- Recursive scans are capped at 2000 images to bound memory and I/O.

## Packaging

```bash
npx @vscode/vsce package
```

Produces an installable `photo-slides-<version>.vsix` (install via
*Extensions: Install from VSIX…*).

## Pull requests

- Keep TypeScript strict (the project compiles with `strict: true`).
- Run `npm run compile` and make sure there are no errors before opening a PR.
- Describe the change and how you tested it.
