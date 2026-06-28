import * as vscode from 'vscode';
import * as crypto from 'crypto';
import { SlideshowCoordinator, ISyncTarget } from './SlideshowCoordinator';

export class PhotoSlidesLightboxPanel implements ISyncTarget {
  private static _current?: PhotoSlidesLightboxPanel;
  private readonly panel: vscode.WebviewPanel;

  static open(extensionUri: vscode.Uri, coordinator: SlideshowCoordinator): void {
    if (!coordinator.currentImages.length) { return; }
    if (PhotoSlidesLightboxPanel._current) {
      PhotoSlidesLightboxPanel._current.panel.reveal(vscode.ViewColumn.One, false);
      PhotoSlidesLightboxPanel._current.sendImages(coordinator);
      return;
    }
    new PhotoSlidesLightboxPanel(extensionUri, coordinator);
  }

  private constructor(
    extensionUri: vscode.Uri,
    private readonly coordinator: SlideshowCoordinator,
  ) {
    const folder = coordinator.currentFolder;
    const roots: vscode.Uri[] = [vscode.Uri.joinPath(extensionUri, 'media')];
    if (folder) { roots.push(vscode.Uri.file(folder)); }

    this.panel = vscode.window.createWebviewPanel(
      'photoSlides.lightbox',
      'Photo Slides',
      { viewColumn: vscode.ViewColumn.One, preserveFocus: false },
      { enableScripts: true, localResourceRoots: roots, retainContextWhenHidden: true },
    );

    PhotoSlidesLightboxPanel._current = this;
    coordinator.registerLightbox(this);

    this.panel.webview.html = this.getHtml(extensionUri, this.panel.webview);
    this.panel.webview.onDidReceiveMessage((msg: Record<string, unknown>) =>
      this.handleMessage(msg),
    );
    this.panel.onDidDispose(() => {
      coordinator.unregisterLightbox();
      PhotoSlidesLightboxPanel._current = undefined;
    });
  }

  // ---------------------------------------------------------------- ISyncTarget
  send(message: object): void {
    void this.panel.webview.postMessage(message);
  }

  // --------------------------------------------------------------- Messages
  private sendImages(coordinator: SlideshowCoordinator): void {
    const webview = this.panel.webview;
    const images = coordinator.currentImages.map((f) => ({
      name: f.name,
      uri: webview.asWebviewUri(vscode.Uri.file(f.abs)).toString(),
    }));
    void webview.postMessage({ type: 'images', images });
    // Envía el estado actual para que el lightbox muestre la imagen correcta.
    void webview.postMessage(coordinator.currentShowPayload());
  }

  private handleMessage(msg: Record<string, unknown>): void {
    switch (msg.type) {
      case 'ready':
        this.sendImages(this.coordinator);
        break;
      case 'navigate':
        this.coordinator.navigate(msg.direction as 'next' | 'prev');
        break;
      case 'togglePlay':
        this.coordinator.setPlaying(!this.coordinator.playing);
        break;
      case 'toggleShuffle': {
        const ns = !this.coordinator.shuffle;
        this.coordinator.setShuffle(ns);
        void vscode.workspace.getConfiguration('photoSlides')
          .update('shuffle', ns, vscode.ConfigurationTarget.Global);
        break;
      }
      case 'close':
        this.panel.dispose();
        break;
    }
  }

  // --------------------------------------------------------------- HTML
  private getHtml(extensionUri: vscode.Uri, webview: vscode.Webview): string {
    const nonce = getNonce();
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, 'media', 'lightbox.js'),
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(extensionUri, 'media', 'lightbox.css'),
    );
    const csp = [
      `default-src 'none'`,
      `img-src ${webview.cspSource}`,
      `style-src ${webview.cspSource}`,
      `script-src 'nonce-${nonce}'`,
    ].join('; ');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta http-equiv="Content-Security-Policy" content="${csp}" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <link href="${styleUri}" rel="stylesheet" />
  <title>Photo Slides</title>
</head>
<body>
  <div id="app">
    <header id="top-bar">
      <span id="filename" class="filename"></span>
      <span id="counter" class="counter"></span>
      <button id="close-btn" class="close-btn" type="button" title="Close (Escape)" aria-label="Close">✕</button>
    </header>
    <main id="stage">
      <img id="photo" class="photo" alt="" />
      <div id="spinner" class="spinner hidden" role="status" aria-label="Loading"></div>
    </main>
    <footer id="controls">
      <button id="prev-btn" class="ctrl-btn" type="button" title="Previous (←)" aria-label="Previous">⏮</button>
      <button id="play-btn" class="ctrl-btn primary" type="button" title="Play / Pause (Space)" aria-label="Play or pause">⏸</button>
      <button id="next-btn" class="ctrl-btn" type="button" title="Next (→)" aria-label="Next">⏭</button>
      <button id="shuffle-btn" class="ctrl-btn" type="button" title="Shuffle" aria-label="Toggle shuffle">🔀</button>
    </footer>
  </div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  return crypto.randomBytes(16).toString('hex');
}
