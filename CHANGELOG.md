# Change Log

All notable changes to the **Photo Slides** extension are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-06-21

### Added

- Initial release.
- `WebviewView` slideshow contributed to the Explorer side bar.
- Native folder picker (`showOpenDialog`), cross-platform (Windows, macOS, Linux).
- Automatic playback with a configurable interval (5 s by default).
- Previous / Play-Pause / Next controls plus keyboard shortcuts (`←`, `→`, `Space`).
- Controls and filename shown only on hover over the image.
- Shuffle mode (on by default).
- Persistence of the last folder via `globalState` and the `photoSlides.folder` setting.
- Right-click context menu: **Reveal in File Explorer** and **Change Folder…**.
- Settings: folder, interval, shuffle, recursive scan, sort order, file types,
  image fit and autoplay.
- Loading spinner shown only on folder load.
- Pauses the playback timer while the panel is hidden (lower CPU usage).
