import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

/** Extensiones de imagen soportadas por defecto (sin el punto, en minúsculas). */
const DEFAULT_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'];

/** Clave en globalState para recordar la última carpeta (compat. hacia atrás). */
const LAST_FOLDER_KEY = 'photoSlides.lastFolder';

/** Tope de imágenes para no degradar el rendimiento con carpetas enormes. */
const MAX_IMAGES = 2000;

type SortOrder = 'name' | 'nameDesc' | 'dateNewest' | 'dateOldest';

/** Mensajes que el Webview puede enviar a la extensión. */
type InboundMessage =
  | { type: 'ready' }
  | { type: 'selectFolder' }
  | { type: 'requestRefresh' }
  | { type: 'persistShuffle'; value: boolean }
  | { type: 'reveal'; name: string };

/** Configuración de reproducción enviada al Webview. */
interface SlideshowConfig {
  intervalMs: number;
  shuffle: boolean;
  imageFit: 'contain' | 'cover';
  autoplay: boolean;
}

interface FoundImage {
  abs: string;
  rel: string;
}

/**
 * Provee el Webview que renderiza el slideshow dentro de la barra lateral.
 * Toda la lógica de filesystem vive aquí (Node.js); el Webview solo renderiza
 * y emite comandos de reproducción.
 */
export class PhotoSlidesViewProvider implements vscode.WebviewViewProvider {
  private view?: vscode.WebviewView;
  private currentFolder?: string;

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly context: vscode.ExtensionContext,
  ) {
    this.currentFolder = this.resolveCurrentFolder();
  }

  public resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ): void {
    this.view = webviewView;
    this.applyWebviewOptions(webviewView.webview);

    webviewView.webview.html = this.getHtml(webviewView.webview);

    webviewView.webview.onDidReceiveMessage((message: InboundMessage) =>
      this.handleMessage(message),
    );

    // No re-leemos el disco en cada cambio de visibilidad: solo pausamos/
    // reanudamos el temporizador en el Webview. Esto evita trabajo en segundo
    // plano cuando el panel está oculto (mejor rendimiento).
    webviewView.onDidChangeVisibility(() => {
      void webviewView.webview.postMessage({
        type: 'visibility',
        visible: webviewView.visible,
      });
    });
  }

  /**
   * Determina la carpeta activa: prioriza el setting `photoSlides.folder`;
   * si está vacío, usa la última carpeta recordada en globalState.
   */
  private resolveCurrentFolder(): string | undefined {
    const fromSettings = vscode.workspace
      .getConfiguration('photoSlides')
      .get<string>('folder', '')
      .trim();
    if (fromSettings) {
      return fromSettings;
    }
    return this.context.globalState.get<string>(LAST_FOLDER_KEY) || undefined;
  }

  /**
   * Configura las opciones del Webview, incluyendo los roots de recursos
   * locales permitidos (media propia + carpeta de fotos seleccionada).
   */
  private applyWebviewOptions(webview: vscode.Webview): void {
    const roots: vscode.Uri[] = [vscode.Uri.joinPath(this.extensionUri, 'media')];
    if (this.currentFolder) {
      roots.push(vscode.Uri.file(this.currentFolder));
    }
    webview.options = {
      enableScripts: true,
      localResourceRoots: roots,
    };
  }

  private handleMessage(message: InboundMessage): void {
    switch (message.type) {
      case 'ready':
      case 'requestRefresh':
        void this.refresh();
        break;
      case 'selectFolder':
        void this.promptSelectFolder();
        break;
      case 'persistShuffle':
        // Sincroniza el toggle de la UI con los Settings del usuario.
        void vscode.workspace
          .getConfiguration('photoSlides')
          .update('shuffle', message.value, vscode.ConfigurationTarget.Global);
        break;
      case 'reveal':
        this.revealInExplorer(message.name);
        break;
    }
  }

  /** Revela el archivo de imagen actual en el explorador de archivos del SO. */
  private revealInExplorer(name: string): void {
    if (!this.currentFolder || !name) {
      return;
    }
    // Defensa en profundidad: aunque `name` lo genera la extensión, validamos
    // que la ruta resultante quede dentro de la carpeta elegida (evita un
    // path traversal teórico si el Webview enviara un nombre malicioso).
    const root = path.resolve(this.currentFolder);
    const target = path.resolve(root, name);
    const rel = path.relative(root, target);
    if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
      return;
    }
    void vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(target));
  }

  /** Lee la configuración de reproducción desde los Settings nativos. */
  private readConfig(): SlideshowConfig {
    const cfg = vscode.workspace.getConfiguration('photoSlides');
    const seconds = cfg.get<number>('intervalSeconds', 5);
    return {
      intervalMs: Math.max(1, seconds) * 1000,
      shuffle: cfg.get<boolean>('shuffle', true),
      imageFit: cfg.get<'contain' | 'cover'>('imageFit', 'contain'),
      autoplay: cfg.get<boolean>('autoplay', true),
    };
  }

  /**
   * Abre el diálogo nativo para elegir una carpeta y la guarda en el setting
   * `photoSlides.folder` (que dispara la recarga vía onDidChangeConfiguration).
   */
  public async promptSelectFolder(): Promise<void> {
    const picked = await vscode.window.showOpenDialog({
      canSelectFolders: true,
      canSelectFiles: false,
      canSelectMany: false,
      openLabel: 'Select photo folder',
      title: 'Photo Slides — choose a folder with images',
    });

    if (!picked || picked.length === 0) {
      return;
    }

    const folder = picked[0].fsPath;
    await this.context.globalState.update(LAST_FOLDER_KEY, folder);

    // El setting es la fuente de verdad. Si el valor no cambió (misma carpeta),
    // forzamos un refresh manual porque no se disparará el evento de config.
    const cfg = vscode.workspace.getConfiguration('photoSlides');
    if (cfg.get<string>('folder', '').trim() === folder) {
      await this.refresh();
    } else {
      await cfg.update('folder', folder, vscode.ConfigurationTarget.Global);
    }
  }

  /**
   * Re-resuelve la carpeta activa, reaplica los roots permitidos y refresca.
   * Se llama cuando cambia `photoSlides.folder` (u otras opciones de escaneo).
   */
  public reloadFolder(): void {
    this.currentFolder = this.resolveCurrentFolder();
    if (this.view) {
      this.applyWebviewOptions(this.view.webview);
    }
    void this.refresh();
  }

  /**
   * Lee la carpeta actual, filtra imágenes válidas y las envía al Webview.
   */
  public async refresh(): Promise<void> {
    if (!this.view) {
      return;
    }

    const config = this.readConfig();
    const view = this.view;

    if (!this.currentFolder) {
      void view.webview.postMessage({ type: 'empty', reason: 'no-folder', config });
      return;
    }

    // Verifica que la carpeta exista y sea un directorio.
    try {
      const stat = await fs.promises.stat(this.currentFolder);
      if (!stat.isDirectory()) {
        throw new Error('La ruta configurada no es una carpeta.');
      }
    } catch (err) {
      void view.webview.postMessage({
        type: 'empty',
        reason: 'error',
        folder: this.currentFolder,
        message: err instanceof Error ? err.message : String(err),
        config,
      });
      return;
    }

    const cfg = vscode.workspace.getConfiguration('photoSlides');
    const recursive = cfg.get<boolean>('recursive', false);
    const sortOrder = cfg.get<SortOrder>('sortOrder', 'name');
    const exts = new Set(
      cfg
        .get<string[]>('fileTypes', DEFAULT_EXTENSIONS)
        .map((t) => t.replace(/^\./, '').toLowerCase()),
    );

    let found = await this.collectImages(this.currentFolder, recursive, exts);

    if (found.length === 0) {
      void view.webview.postMessage({
        type: 'empty',
        reason: 'empty-folder',
        folder: this.currentFolder,
        config,
      });
      return;
    }

    found = await this.sortImages(found, sortOrder);

    const images = found.map((f) => ({
      name: f.rel, // ruta relativa: sirve para mostrar y para "Reveal".
      uri: view.webview.asWebviewUri(vscode.Uri.file(f.abs)).toString(),
    }));

    void view.webview.postMessage({
      type: 'images',
      folder: path.basename(this.currentFolder),
      images,
      config,
    });
  }

  /**
   * Recolecta las imágenes de la carpeta (recursivo opcional) hasta MAX_IMAGES.
   */
  private async collectImages(
    root: string,
    recursive: boolean,
    exts: Set<string>,
  ): Promise<FoundImage[]> {
    const out: FoundImage[] = [];

    const walk = async (dir: string): Promise<void> => {
      if (out.length >= MAX_IMAGES) {
        return;
      }
      let entries: fs.Dirent[];
      try {
        entries = await fs.promises.readdir(dir, { withFileTypes: true });
      } catch {
        return; // carpeta sin permisos o eliminada en medio del recorrido
      }
      for (const entry of entries) {
        if (out.length >= MAX_IMAGES) {
          break;
        }
        const abs = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          // Evita carpetas ocultas y enlaces para no caer en bucles.
          if (recursive && !entry.name.startsWith('.')) {
            await walk(abs);
          }
        } else if (entry.isFile() && exts.has(this.extensionOf(entry.name))) {
          out.push({ abs, rel: path.relative(root, abs) });
        }
      }
    };

    await walk(root);
    return out;
  }

  /** Ordena las imágenes según el setting `photoSlides.sortOrder`. */
  private async sortImages(items: FoundImage[], order: SortOrder): Promise<FoundImage[]> {
    if (order === 'dateNewest' || order === 'dateOldest') {
      const withTime = await Promise.all(
        items.map(async (it) => {
          let mtime = 0;
          try {
            mtime = (await fs.promises.stat(it.abs)).mtimeMs;
          } catch {
            /* deja mtime en 0 si falla el stat */
          }
          return { it, mtime };
        }),
      );
      withTime.sort((a, b) =>
        order === 'dateNewest' ? b.mtime - a.mtime : a.mtime - b.mtime,
      );
      return withTime.map((w) => w.it);
    }

    const cmp = (a: FoundImage, b: FoundImage): number =>
      a.rel.localeCompare(b.rel, undefined, { numeric: true, sensitivity: 'base' });
    items.sort((a, b) => (order === 'nameDesc' ? -cmp(a, b) : cmp(a, b)));
    return items;
  }

  /** Reenvía solo la configuración cuando cambia en los Settings. */
  public pushConfig(): void {
    if (!this.view) {
      return;
    }
    void this.view.webview.postMessage({ type: 'config', config: this.readConfig() });
  }

  /** Envía un comando de control de reproducción al Webview. */
  public sendCommand(command: 'next' | 'previous' | 'playPause' | 'toggleShuffle'): void {
    this.view?.webview.postMessage({ type: 'command', command });
  }

  /** Devuelve la extensión en minúsculas sin el punto inicial. */
  private extensionOf(fileName: string): string {
    return path.extname(fileName).slice(1).toLowerCase();
  }

  /** Construye el HTML del Webview con CSP estricta y nonce. */
  private getHtml(webview: vscode.Webview): string {
    const nonce = getNonce();
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'main.js'),
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media', 'main.css'),
    );

    // CSP: solo se permiten imágenes desde el origen del Webview (asWebviewUri),
    // estilos propios y el script con nonce.
    // CSP estricta: solo recursos del propio Webview. Sin orígenes remotos
    // (la extensión nunca carga imágenes externas), sin inline scripts/estilos.
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
    <!-- Empty state -->
    <div id="empty-state" class="empty-state">
      <div class="empty-icon" aria-hidden="true">🖼️</div>
      <p id="empty-message" class="empty-message">No photo folder selected yet.</p>
      <button id="empty-select-btn" class="primary-btn" type="button">
        Select photo folder
      </button>
    </div>

    <!-- Player -->
    <div id="player" class="player hidden">
      <div class="stage" id="stage">
        <img id="photo" class="photo" alt="" />
        <div id="spinner" class="spinner hidden" role="status" aria-label="Loading"></div>

        <!-- Filename overlay: only visible on hover -->
        <div class="meta overlay-top">
          <span id="filename" class="filename" title=""></span>
          <span id="counter" class="counter"></span>
        </div>

        <!-- Controls overlay: only visible on hover -->
        <div class="controls overlay-bottom">
          <button id="prev-btn" class="ctrl-btn" type="button" title="Previous (←)" aria-label="Previous">⏮</button>
          <button id="play-btn" class="ctrl-btn primary" type="button" title="Play / Pause (Space)" aria-label="Play or pause">⏯</button>
          <button id="next-btn" class="ctrl-btn" type="button" title="Next (→)" aria-label="Next">⏭</button>
          <button id="shuffle-btn" class="ctrl-btn" type="button" title="Shuffle" aria-label="Shuffle">🔀</button>
        </div>
      </div>
    </div>

    <!-- Right-click context menu -->
    <div id="context-menu" class="context-menu hidden" role="menu">
      <button id="reveal-btn" class="context-item" type="button" role="menuitem">
        Reveal in File Explorer
      </button>
      <button id="change-folder-btn" class="context-item" type="button" role="menuitem">
        Change Folder…
      </button>
    </div>
  </div>

  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  // Nonce criptográficamente seguro (128 bits) para la CSP.
  return crypto.randomBytes(16).toString('hex');
}
