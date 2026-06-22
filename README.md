# Photo Slides

A VS Code extension that shows a **slideshow** of local images right in the
**Explorer** side bar.

## ✨ Features

- 📂 Native **folder picker** (`showOpenDialog`), cross-platform (Windows, macOS, Linux).
- ▶️ **Automatic playback** with a configurable interval (5 s by default).
- ⏮ ⏯ ⏭ **Controls** for Previous / Play-Pause / Next, plus keyboard shortcuts
  (`←`, `→`, `Space`).
- 🖱️ Controls and filename appear **only on hover** over the image, so they don't
  get in the way.
- 🔀 **Shuffle mode** (on by default), toggleable with one click.
- 💾 **Persistence**: remembers the last folder via `globalState` and the
  `photoSlides.folder` setting, so it survives restarts.
- 🎞️ **File filtering**: only valid images (`jpg`, `jpeg`, `png`, `gif`, `webp`,
  `bmp`, `svg`), configurable.
- 🗂️ Optional **recursive scan** of sub-folders, with configurable sort order.
- 🖼️ **Responsive**: images fit the panel with `object-fit: contain | cover`.
- 🌗 **Native theming**: uses VS Code CSS variables, so it respects light and dark themes.
- 🔒 **Secure webview**: images are loaded through `webview.asWebviewUri()` under a
  strict CSP with a `nonce`.
- ↔️ **Right-click menu**: *Reveal in File Explorer* and *Change Folder…*.
- ⚙️ **Native Settings integration**: everything configurable from VS Code Settings.

## 🚀 Getting started (F5)

```bash
# 1. Install dependencies
npm install

# 2. Compile once...
npm run compile
#    ...or keep the compiler in watch mode
npm run watch
```

3. Open this folder in VS Code and press **F5** (or *Run > Start Debugging*).
   This launches an **Extension Development Host** window with the extension loaded.
4. In the new window, open the **Explorer** (`Ctrl/Cmd + Shift + E`) and find the
   **Photo Slides** panel.
5. Click **"Select photo folder"** (or run the `Photo Slides: Select Photo Folder`
   command from the Command Palette `Ctrl/Cmd + Shift + P`) and choose a folder with images.

> 💡 There are sample images in `sample-photos/` if you want to try it quickly.

## ⚙️ Configuration

Open the settings from the ⚙️ icon in the panel title bar (or run
`Photo Slides: Open Settings`):

| Setting | Type | Default | Description |
| --- | --- | --- | --- |
| `photoSlides.folder` | string | `""` | Absolute path to the folder with images. Includes a **Browse…** link in Settings. |
| `photoSlides.intervalSeconds` | number | `5` | Seconds between images. |
| `photoSlides.shuffle` | boolean | `true` | Random order. |
| `photoSlides.recursive` | boolean | `false` | Also include images from sub-folders. |
| `photoSlides.sortOrder` | `name` \| `nameDesc` \| `dateNewest` \| `dateOldest` | `name` | Order used in sequential mode. |
| `photoSlides.fileTypes` | string[] | `jpg, jpeg, png, gif, webp, bmp, svg` | Image extensions to include. |
| `photoSlides.imageFit` | `contain` \| `cover` | `contain` | How images fit the panel. |
| `photoSlides.autoplay` | boolean | `true` | Start playback when a folder is loaded. |

## ⌨️ Keyboard shortcuts (when the panel is focused)

| Key | Action |
| --- | --- |
| `→` | Next image |
| `←` | Previous image |
| `Space` | Play / Pause |
| `Esc` | Close the context menu |

## 🧩 Packaging (optional)

```bash
npx @vscode/vsce package
```

Produces an installable `photo-slides-0.1.0.vsix` file (via
*Extensions: Install from VSIX…*).

## 🏗️ Architecture

- [`src/extension.ts`](src/extension.ts) — activation, registration of the
  `WebviewViewProvider`, commands, and configuration-change listener.
- [`src/PhotoSlidesViewProvider.ts`](src/PhotoSlidesViewProvider.ts) — all the
  Node.js logic (`fs`/`path`), HTML generation with CSP + nonce, recursive scan,
  sorting, and message passing with the webview.
- [`media/main.js`](media/main.js) — webview-side playback logic (timer, shuffle,
  controls, keyboard, context menu).
- [`media/main.css`](media/main.css) — styles based on native VS Code variables.

The **filesystem is never touched from the webview**: the extension reads the
folder, converts each path with `asWebviewUri()`, and sends the list via
`postMessage`. The webview only renders and sends back commands.

### Performance

The extension is designed to stay out of the way:

- The slideshow timer runs in the webview renderer, **not** the extension host,
  so it never blocks the editor UI.
- No file watchers and no disk polling — the folder is read only on load, folder
  change, or manual refresh.
- The timer is **paused while the panel is hidden** to avoid background work.
- Recursive scans are capped at 2000 images to bound memory and I/O.

## 📄 License

[MIT](LICENSE) © Matias Rohleder
