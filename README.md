# Photo Slides

Keep photos of the people you love visible while you code. Point it at a folder
and it cycles through your images in the VS Code side bar — set it and forget it.

## Features

- ▶️ **Automatic slideshow** of images in any local folder.
- ⏮ ⏯ ⏭ **Controls** for Previous / Play-Pause / Next, plus keyboard shortcuts.
- 🖱️ Controls and the file name appear **only on hover**, keeping the view clean.
- 🔀 **Shuffle** or sequential order (by name or date).
- 🖼️ **Full-screen lightbox** — double-click any image to expand it across the editor area.
- 📌 **Multiple panels** — show the slideshow in the Explorer, Source Control, and/or Run & Debug side bars simultaneously, always in sync.
- 🗂️ Optional **sub-folder** scanning.
- 💾 **Remembers your folder** between restarts.
- 🌗 Looks native in **light and dark themes**.

## How to use

1. Install **Photo Slides** from the Extensions view (`Ctrl/Cmd + Shift + X`).
2. Open the **Explorer** side bar (`Ctrl/Cmd + Shift + E`) and find the **Photo Slides** panel.
3. Click **Select photo folder** and pick a folder with images.

That's it — the slideshow starts automatically. From then on:

- **Hover** over the image to show the controls and file name.
- **Double-click** the image to open it full-screen in the editor area with large controls.
- **Right-click** the image for *Reveal in File Explorer* or *Change Folder…*.
- Use the **⚙️ icon** in the panel header to open the settings.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| `→` | Next image |
| `←` | Previous image |
| `Space` | Play / Pause |
| `Escape` | Close full-screen lightbox |

## Showing the slideshow in multiple panels

By default Photo Slides lives in the **Explorer**. You can also show it in the
**Source Control** (`scm`) and/or **Run & Debug** (`debug`) side bars.

Open VS Code settings and set:

```json
"photoSlides.panels": ["explorer", "scm", "debug"]
```

All enabled panels are **fully synchronized**: same photo, same play/pause state,
same shuffle — controlled by a single shared timer. Navigating or pausing in any
one panel instantly updates all the others.

## Settings

Open them from the **⚙️ icon** in the panel header, or search *Photo Slides* in VS Code Settings.

| Setting | Default | What it does |
| --- | --- | --- |
| Folder | — | Path to the image folder (the **Browse…** button fills it automatically). |
| Panels | `["explorer"]` | Which side bars display the slideshow (`"explorer"`, `"scm"`, `"debug"`). |
| Interval (seconds) | `5` | Time between images during automatic playback. |
| Shuffle | `true` | Random order instead of sequential. |
| Recursive | `false` | Also include images from sub-folders. |
| Sort order | `name` | Sequential-mode order: by name or by date. |
| File types | `jpg jpeg png gif webp bmp svg` | Image extensions to include. |
| Image fit | `contain` | `contain` shows the whole image; `cover` fills the panel. |
| Autoplay | `true` | Start playing automatically when a folder is loaded. |

## License

[MIT](LICENSE) © Matías D. Rohleder

---

<sub>Built so I could watch photos of my baby girl, Victoria, while I code. 💛</sub>
