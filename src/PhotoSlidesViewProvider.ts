import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { SlideshowCoordinator, ISyncTarget } from './SlideshowCoordinator';
import { PhotoSlidesLightboxPanel } from './PhotoSlidesLightboxPanel';

const DEFAULT_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'];
const LAST_FOLDER_KEY = 'photoSlides.lastFolder';
const MAX_IMAGES = 2000;

type SortOrder = 'name' | 'nameDesc' | 'dateNewest' | 'dateOldest';

type InboundMessage =
  | { type: 'ready' }
  | { type: 'selectFolder' }
  | { type: 'openSettings' }
  | { type: 'openLightbox' }
  | { type: 'requestRefresh' }
  | { type: 'reveal'; name: string }
  | { type: 'navigate'; direction: 'next' | 'prev' }
  | { type: 'togglePlay' }
  | { type: 'toggleShuffle' };

interface FoundImage {
  abs: string;
  rel: string;
}

export class PhotoSlidesViewProvider
  implements vscode.WebviewViewProvider, ISyncTarget
{
  private view?: vscode.WebviewView;
  private currentFolder?: string;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly context: vscode.ExtensionContext,
    private readonly panelId: string,
    private readonly coordinator: SlideshowCoordinator,
  ) {
    this.currentFolder = this.resolveCurrentFolder();
  }

  // ---------------------------------------------------------------- ISyncTarget
  send(message: object): void {
    void this.view?.webview.postMessage(message);
  }

  // -------------------------------------------------------- WebviewViewProvider
  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this.view = webviewView;
    this.applyWebviewOptions(webviewView.webview);
    webviewView.webview.html = this.getHtml(webviewView.webview);
    webviewView.webview.onDidReceiveMessage((msg: InboundMessage) =>
      this.handleMessage(msg),
    );
    // Sin visibilidad no necesitamos pausar: el timer está en el coordinator.
  }

  // --------------------------------------------------------------- Helpers
  private resolveCurrentFolder(): string | undefined {
    const fromSettings = vscode.workspace
      .getConfiguration('photoSlides')
      .get<string>('folder', '')
      .trim();
    if (fromSettings) { return fromSettings; }
    return this.context.globalState.get<string>(LAST_FOLDER_KEY) || undefined;
  }

  private isPanelEnabled(): boolean {
    const panels = vscode.workspace
      .getConfiguration('photoSlides')
      .get<string[]>('panels', ['explorer']);
    return panels.includes(this.panelId);
  }

  private applyWebviewOptions(webview: vscode.Webview): void {
    const roots: vscode.Uri[] = [vscode.Uri.joinPath(this.extensionUri, 'media')];
    if (this.currentFolder) {
      roots.push(vscode.Uri.file(this.currentFolder));
    }
    webview.options = { enableScripts: true, localResourceRoots: roots };
  }

  private readConfig() {
    const cfg = vscode.workspace.getConfiguration('photoSlides');
    const seconds = cfg.get<number>('intervalSeconds', 5);
    return {
      intervalMs: Math.max(1, seconds) * 1000,
      shuffle: cfg.get<boolean>('shuffle', true),
      imageFit: cfg.get<'contain' | 'cover'>('imageFit', 'contain'),
      autoplay: cfg.get<boolean>('autoplay', true),
    };
  }

  // --------------------------------------------------------------- Messages
  private handleMessage(message: InboundMessage): void {
    switch (message.type) {
      case 'ready':
      case 'requestRefresh':
        void this.refresh();
        break;
      case 'selectFolder':
        void this.promptSelectFolder();
        break;
      case 'openSettings':
        void vscode.commands.executeCommand(
          'workbench.action.openSettings', '@ext:mrohleder.photo-slides',
        );
        break;
      case 'openLightbox':
        PhotoSlidesLightboxPanel.open(this.extensionUri, this.coordinator);
        break;
      case 'reveal':
        this.revealInExplorer(message.name);
        break;
      case 'navigate':
        this.coordinator.navigate(message.direction);
        break;
      case 'togglePlay':
        this.coordinator.setPlaying(!this.coordinator.playing);
        break;
      case 'toggleShuffle': {
        const newShuffle = !this.coordinator.shuffle;
        this.coordinator.setShuffle(newShuffle);
        void vscode.workspace
          .getConfiguration('photoSlides')
          .update('shuffle', newShuffle, vscode.ConfigurationTarget.Global);
        break;
      }
    }
  }

  private revealInExplorer(name: string): void {
    if (!this.currentFolder || !name) { return; }
    const root = path.resolve(this.currentFolder);
    const target = path.resolve(root, name);
    const rel = path.relative(root, target);
    if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) { return; }
    void vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(target));
  }

  // -------------------------------------------------------------- Public API
  public async promptSelectFolder(): Promise<void> {
    const picked = await vscode.window.showOpenDialog({
      canSelectFolders: true, canSelectFiles: false, canSelectMany: false,
      openLabel: 'Select photo folder',
      title: 'Photo Slides — choose a folder with images',
    });
    if (!picked || picked.length === 0) { return; }
    const folder = picked[0].fsPath;
    await this.context.globalState.update(LAST_FOLDER_KEY, folder);
    const cfg = vscode.workspace.getConfiguration('photoSlides');
    if (cfg.get<string>('folder', '').trim() === folder) {
      await this.refresh();
    } else {
      await cfg.update('folder', folder, vscode.ConfigurationTarget.Global);
    }
  }

  public reloadFolder(): void {
    this.currentFolder = this.resolveCurrentFolder();
    if (this.view) { this.applyWebviewOptions(this.view.webview); }
    void this.refresh();
  }

  /**
   * Actualiza la configuración de reproducción en vivo (sin recargar imágenes).
   * Llamado cuando cambia intervalSeconds, imageFit, etc.
   */
  public pushConfig(): void {
    if (!this.view) { return; }
    const cfg = this.readConfig();
    // Actualiza el coordinator con el nuevo intervalo y shuffle.
    this.coordinator.setIntervalMs(cfg.intervalMs);
    this.coordinator.setShuffle(cfg.shuffle);
    // Envía el imageFit solo a este panel (es visual, no estado compartido).
    void this.view.webview.postMessage({ type: 'config', imageFit: cfg.imageFit });
  }

  public async refresh(): Promise<void> {
    if (!this.view) { return; }

    if (!this.isPanelEnabled()) {
      void this.view.webview.postMessage({ type: 'disabled', panelId: this.panelId });
      return;
    }

    const config = this.readConfig();
    const view = this.view;

    if (!this.currentFolder) {
      void view.webview.postMessage({ type: 'empty', reason: 'no-folder' });
      return;
    }

    try {
      const stat = await fs.promises.stat(this.currentFolder);
      if (!stat.isDirectory()) { throw new Error('La ruta no es una carpeta.'); }
    } catch (err) {
      void view.webview.postMessage({
        type: 'empty', reason: 'error',
        message: err instanceof Error ? err.message : String(err),
      });
      return;
    }

    const cfg = vscode.workspace.getConfiguration('photoSlides');
    const recursive = cfg.get<boolean>('recursive', false);
    const sortOrder = cfg.get<SortOrder>('sortOrder', 'name');
    const exts = new Set(
      cfg.get<string[]>('fileTypes', DEFAULT_EXTENSIONS)
        .map((t) => t.replace(/^\./, '').toLowerCase()),
    );

    let found = await this.collectImages(this.currentFolder, recursive, exts);

    if (found.length === 0) {
      void view.webview.postMessage({ type: 'empty', reason: 'empty-folder' });
      return;
    }

    found = await this.sortImages(found, sortOrder);

    // 1. Actualiza el coordinator (dueño del timer y el orden).
    this.coordinator.setImages(
      found.map((f) => ({ name: f.rel, abs: f.abs })),
      this.currentFolder,
      config.intervalMs,
      config.shuffle,
      config.autoplay,
    );

    // 2. Envía las URIs webview-específicas a ESTE panel.
    const images = found.map((f) => ({
      name: f.rel,
      uri: view.webview.asWebviewUri(vscode.Uri.file(f.abs)).toString(),
    }));
    void view.webview.postMessage({
      type: 'images',
      folder: path.basename(this.currentFolder),
      images,
      imageFit: config.imageFit,
    });

    // 3. El coordinator ya hizo _broadcastShow() en setImages(), lo que envió
    //    un 'show' a este panel. Si llega antes que 'images', el webview lo
    //    encola y lo aplica cuando tenga las imágenes (ver main.js).
  }

  // --------------------------------------------------------------- Filesystem
  private async collectImages(
    root: string, recursive: boolean, exts: Set<string>,
  ): Promise<FoundImage[]> {
    const out: FoundImage[] = [];
    const walk = async (dir: string): Promise<void> => {
      if (out.length >= MAX_IMAGES) { return; }
      let entries: fs.Dirent[];
      try { entries = await fs.promises.readdir(dir, { withFileTypes: true }); }
      catch { return; }
      for (const entry of entries) {
        if (out.length >= MAX_IMAGES) { break; }
        const abs = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          if (recursive && !entry.name.startsWith('.')) { await walk(abs); }
        } else if (entry.isFile() && exts.has(this.extensionOf(entry.name))) {
          out.push({ abs, rel: path.relative(root, abs) });
        }
      }
    };
    await walk(root);
    return out;
  }

  private async sortImages(items: FoundImage[], order: SortOrder): Promise<FoundImage[]> {
    if (order === 'dateNewest' || order === 'dateOldest') {
      const withTime = await Promise.all(items.map(async (it) => {
        let mtime = 0;
        try { mtime = (await fs.promises.stat(it.abs)).mtimeMs; } catch { /* skip */ }
        return { it, mtime };
      }));
      withTime.sort((a, b) => order === 'dateNewest' ? b.mtime - a.mtime : a.mtime - b.mtime);
      return withTime.map((w) => w.it);
    }
    const cmp = (a: FoundImage, b: FoundImage): number =>
      a.rel.localeCompare(b.rel, undefined, { numeric: true, sensitivity: 'base' });
    items.sort((a, b) => order === 'nameDesc' ? -cmp(a, b) : cmp(a, b));
    return items;
  }

  private extensionOf(fileName: string): string {
    return path.extname(fileName).slice(1).toLowerCase();
  }

  /** Envía un comando de control al webview (de comandos de la paleta). */
  public sendCommand(command: 'next' | 'previous' | 'playPause' | 'toggleShuffle'): void {
    // Con el coordinator, los comandos de paleta se aplican globalmente.
    switch (command) {
      case 'next':        this.coordinator.navigate('next'); break;
      case 'previous':    this.coordinator.navigate('prev'); break;
      case 'playPause':   this.coordinator.setPlaying(!this.coordinator.playing); break;
      case 'toggleShuffle': {
        const ns = !this.coordinator.shuffle;
        this.coordinator.setShuffle(ns);
        void vscode.workspace.getConfiguration('photoSlides')
          .update('shuffle', ns, vscode.ConfigurationTarget.Global);
        break;
      }
    }
  }

  // -------------------------------------------------------------------- HTML
  private getHtml(webview: vscode.Webview): string {
    const nonce = getNonce();
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'main.js'),
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'main.css'),
    );
    const csp = [
      `default-src 'none'`,
      `img-src ${webview.cspSource}`,
      `style-src ${webview.cspSource}`,
      `script-src 'nonce-${nonce}'`,
    ].join('; ');

    return /* html */ `<!DOCTYPE html>
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
    <div id="empty-state" class="empty-state">
      <div class="empty-icon" aria-hidden="true">🖼️</div>
      <p id="empty-message" class="empty-message">No photo folder selected yet.</p>
      <button id="empty-select-btn" class="primary-btn" type="button">Select photo folder</button>
      <button id="empty-settings-btn" class="primary-btn hidden" type="button">Open Settings</button>
    </div>

    <div id="player" class="player hidden">
      <div class="stage" id="stage">
        <img id="photo" class="photo" alt="" />
        <div id="spinner" class="spinner hidden" role="status" aria-label="Loading"></div>
        <div class="meta overlay-top">
          <span id="filename" class="filename" title=""></span>
          <span id="counter" class="counter"></span>
        </div>
        <div class="controls overlay-bottom">
          <button id="prev-btn" class="ctrl-btn" type="button" title="Previous (←)" aria-label="Previous">⏮</button>
          <button id="play-btn" class="ctrl-btn primary" type="button" title="Play / Pause (Space)" aria-label="Play or pause">⏸</button>
          <button id="next-btn" class="ctrl-btn" type="button" title="Next (→)" aria-label="Next">⏭</button>
          <button id="shuffle-btn" class="ctrl-btn" type="button" title="Shuffle" aria-label="Shuffle">🔀</button>
        </div>
      </div>
    </div>

    <div id="context-menu" class="context-menu hidden" role="menu">
      <button id="reveal-btn" class="context-item" type="button" role="menuitem">Reveal in File Explorer</button>
      <button id="change-folder-btn" class="context-item" type="button" role="menuitem">Change Folder…</button>
    </div>
  </div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  return crypto.randomBytes(16).toString('hex');
}
