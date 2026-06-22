# Photo Slides

Turn the VS Code **Explorer** side bar into a photo slideshow. Point it at a
folder and it cycles through your images while you work — set it and forget it.

## Features

- ▶️ **Automatic slideshow** of the images in any folder.
- ⏮ ⏯ ⏭ **Controls** for Previous / Play-Pause / Next, plus keyboard shortcuts.
- 🖱️ Controls and the file name appear **only on hover**, so the view stays clean.
- 🔀 **Shuffle** or sequential order (by name or date).
- 🗂️ Optional **sub-folder** scanning.
- 💾 **Remembers your folder** between restarts.
- 🖼️ Images **adapt to the panel** size as you resize the side bar.
- 🌗 Looks native in **light and dark themes**.

## How to use

1. Install **Photo Slides** from the Extensions view (`Ctrl/Cmd + Shift + X`).
2. Open the **Explorer** side bar (`Ctrl/Cmd + Shift + E`) and find the
   **Photo Slides** panel.
3. Click **Select photo folder** and pick a folder with images.

That's it — the slideshow starts automatically. From then on:

- **Hover** over the image to show the controls and file name.
- **Right-click** the image for *Reveal in File Explorer* or *Change Folder…*.
- Use the **⚙️ icon** in the panel header to open the settings.

## Keyboard shortcuts

(while the panel is focused)

| Key | Action |
| --- | --- |
| `→` | Next image |
| `←` | Previous image |
| `Space` | Play / Pause |

## Settings

Open them from the **⚙️ icon** in the panel header, or from VS Code Settings
(search for *Photo Slides*).

| Setting | Default | What it does |
| --- | --- | --- |
| Folder | — | The folder with your images (also has a **Browse…** button). |
| Interval (seconds) | `5` | Time between images. |
| Shuffle | `true` | Random order instead of sequential. |
| Recursive | `false` | Also include images from sub-folders. |
| Sort order | `name` | Order in sequential mode: by name or by date. |
| File types | `jpg, jpeg, png, gif, webp, bmp, svg` | Which image extensions to include. |
| Image fit | `contain` | `contain` shows the whole image; `cover` fills the panel. |
| Autoplay | `true` | Start playing as soon as a folder is loaded. |

## License

[MIT](LICENSE) © Matias Rohleder

---

Want to build it from source or contribute? See [CONTRIBUTING.md](CONTRIBUTING.md).
