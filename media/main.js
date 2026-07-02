// @ts-check
/**
 * Webview del panel lateral. No mantiene timers ni orden de reproducción:
 * esos estados viven en el SlideshowCoordinator del lado de la extensión.
 * Este archivo solo renderiza lo que el coordinator le indica y reenvía
 * los inputs del usuario.
 */
(function () {
  const vscode = acquireVsCodeApi();

  // ----------------------------------------------------------------- Elements
  const loadingState = document.getElementById('loading-state');
  const emptyState   = document.getElementById('empty-state');
  const emptyMessage = document.getElementById('empty-message');
  const emptySelectBtn   = document.getElementById('empty-select-btn');
  const emptySettingsBtn = document.getElementById('empty-settings-btn');
  const player    = document.getElementById('player');
  const stage     = document.getElementById('stage');
  const photo     = /** @type {HTMLImageElement} */ (document.getElementById('photo'));
  const spinner   = document.getElementById('spinner');
  const filenameEl = document.getElementById('filename');
  const counterEl  = document.getElementById('counter');
  const prevBtn   = document.getElementById('prev-btn');
  const nextBtn   = document.getElementById('next-btn');
  const playBtn   = document.getElementById('play-btn');
  const shuffleBtn = document.getElementById('shuffle-btn');
  const contextMenu     = document.getElementById('context-menu');
  const revealBtn       = document.getElementById('reveal-btn');
  const changeFolderBtn = document.getElementById('change-folder-btn');

  // -------------------------------------------------------------------- State
  /** @type {{ name: string, uri: string }[]} */
  let images = [];
  let imageFit = 'contain';
  /** Si llegó un 'show' antes de que llegaran las 'images', lo guardamos aquí. */
  /** @type {null | { imageIndex: number, position: number, total: number, playing: boolean, shuffle: boolean }} */
  let pendingShow = null;
  /** Índice de imagen actualmente visible (para context menu). */
  let currentImageIndex = 0;

  // ----------------------------------------------------------------- Helpers
  function applyShow(msg) {
    if (!images.length) {
      pendingShow = msg;
      return;
    }
    pendingShow = null;
    const img = images[msg.imageIndex];
    if (!img) { return; }
    const baseName = img.name.split(/[\\/]/).pop() || img.name;
    photo.classList.remove('loaded');
    spinner.classList.remove('hidden');
    photo.onload = () => { photo.classList.add('loaded'); spinner.classList.add('hidden'); };
    photo.onerror = () => { spinner.classList.add('hidden'); };
    photo.src = img.uri;
    photo.alt = baseName;
    filenameEl.textContent = baseName;
    filenameEl.setAttribute('title', img.name);
    counterEl.textContent = `${msg.position} / ${msg.total}`;
    currentImageIndex = msg.imageIndex;

    // Botones reflejan el estado del coordinator.
    playBtn.textContent = msg.playing ? '⏸' : '▶';
    playBtn.setAttribute('title', msg.playing ? 'Pause (Space)' : 'Play (Space)');
    shuffleBtn.classList.toggle('active', msg.shuffle);
    shuffleBtn.setAttribute('aria-pressed', String(msg.shuffle));
  }

  function applyFit() {
    photo.classList.toggle('fit-cover', imageFit === 'cover');
  }

  // ----------------------------------------------------------------- UI events
  emptySelectBtn.addEventListener('click', () =>
    vscode.postMessage({ type: 'selectFolder' }),
  );
  emptySettingsBtn.addEventListener('click', () =>
    vscode.postMessage({ type: 'openSettings' }),
  );
  nextBtn.addEventListener('click',    () => vscode.postMessage({ type: 'navigate', direction: 'next' }));
  prevBtn.addEventListener('click',    () => vscode.postMessage({ type: 'navigate', direction: 'prev' }));
  playBtn.addEventListener('click',    () => vscode.postMessage({ type: 'togglePlay' }));
  shuffleBtn.addEventListener('click', () => vscode.postMessage({ type: 'toggleShuffle' }));

  photo.addEventListener('dblclick', () => {
    if (images.length) { vscode.postMessage({ type: 'openLightbox' }); }
  });

  // --------------------------------------------------------- Context menu
  function hideContextMenu() {
    contextMenu.classList.add('hidden');
  }

  stage.addEventListener('contextmenu', (e) => {
    if (!images.length) { return; }
    e.preventDefault();
    contextMenu.classList.remove('hidden');
    const menuW = contextMenu.offsetWidth;
    const menuH = contextMenu.offsetHeight;
    const x = Math.min(e.clientX, window.innerWidth - menuW - 4);
    const y = Math.min(e.clientY, window.innerHeight - menuH - 4);
    contextMenu.style.left = Math.max(4, x) + 'px';
    contextMenu.style.top  = Math.max(4, y) + 'px';
  });

  revealBtn.addEventListener('click', () => {
    if (images[currentImageIndex]) {
      vscode.postMessage({ type: 'reveal', name: images[currentImageIndex].name });
    }
    hideContextMenu();
  });

  changeFolderBtn.addEventListener('click', () => {
    vscode.postMessage({ type: 'selectFolder' });
    hideContextMenu();
  });

  document.addEventListener('click', hideContextMenu);
  window.addEventListener('blur',   hideContextMenu);
  window.addEventListener('scroll', hideContextMenu, true);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { hideContextMenu(); }
    if (player.classList.contains('hidden')) { return; }
    switch (e.key) {
      case 'ArrowRight': vscode.postMessage({ type: 'navigate', direction: 'next' }); e.preventDefault(); break;
      case 'ArrowLeft':  vscode.postMessage({ type: 'navigate', direction: 'prev' }); e.preventDefault(); break;
      case ' ':          vscode.postMessage({ type: 'togglePlay' }); e.preventDefault(); break;
    }
  });

  // -------------------------------------------------------------- Ext messages
  window.addEventListener('message', (event) => {
    const msg = event.data;
    loadingState.classList.add('hidden');
    switch (msg.type) {

      // Carga inicial de una carpeta: recibe URIs webview-específicas.
      case 'images': {
        images = msg.images || [];
        imageFit = msg.imageFit || 'contain';
        applyFit();
        emptyState.classList.add('hidden');
        player.classList.remove('hidden');
        // Si ya llegó un 'show' antes que las imágenes, lo aplicamos ahora.
        if (pendingShow) { applyShow(pendingShow); }
        break;
      }

      // El coordinator avanzó (timer, navegación de cualquier panel).
      case 'show': {
        applyShow(msg);
        break;
      }

      // Cambio de settings no estructural (imageFit, etc.)
      case 'config': {
        if (msg.imageFit) {
          imageFit = msg.imageFit;
          applyFit();
        }
        break;
      }

      // Estado vacío (sin carpeta, carpeta vacía, error).
      case 'empty': {
        images = [];
        pendingShow = null;
        player.classList.add('hidden');
        emptyState.classList.remove('hidden');
        emptySelectBtn.classList.remove('hidden');
        emptySettingsBtn.classList.add('hidden');
        if (msg.reason === 'empty-folder') {
          emptyMessage.textContent = 'No images found in this folder. Try another one.';
        } else if (msg.reason === 'error') {
          emptyMessage.textContent = 'Could not open the saved folder. Please select a new one.';
        } else {
          emptyMessage.textContent = 'No photo folder selected yet.';
        }
        break;
      }

      // Panel no habilitado en la config photoSlides.panels.
      case 'disabled': {
        images = [];
        pendingShow = null;
        player.classList.add('hidden');
        emptyState.classList.remove('hidden');
        emptySelectBtn.classList.add('hidden');
        emptySettingsBtn.classList.remove('hidden');
        emptyMessage.textContent =
          'This panel is not enabled. Add "' + msg.panelId +
          '" to photoSlides.panels in settings to use Photo Slides here.';
        break;
      }
    }
  });

  vscode.postMessage({ type: 'ready' });
})();
