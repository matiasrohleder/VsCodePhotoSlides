# Change Log

All notable changes to the **Photo Slides** extension are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.1] - 2026-07-01

### Fixed

- The slideshow now shows the correct first photo immediately on load, instead
  of a blank/black panel until the first interval tick (which also skipped
  straight to the second image).
- Added a loading spinner shown from the very first frame, replacing the
  black flash while the webview starts up.
- Each panel (Explorer, Source Control, Run & Debug) now only appears in the
  side bar when it's actually enabled in `photoSlides.panels`, instead of
  showing a collapsed "not enabled" placeholder.

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
