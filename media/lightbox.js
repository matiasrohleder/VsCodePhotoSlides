// @ts-check
/**
 * Webview del lightbox a pantalla completa. Igual que main.js, no mantiene
 * timer ni orden — solo renderiza el ShowPayload del coordinator.
 */
(function () {
  const vscode = acquireVsCodeApi();

  // ----------------------------------------------------------------- Elements
  const photo    = /** @type {HTMLImageElement} */ (document.getElementById('photo'));
  const spinner  = document.getElementById('spinner');
  const filenameEl = document.getElementById('filename');
  const counterEl  = document.getElementById('counter');
  const prevBtn  = document.getElementById('prev-btn');
  const playBtn  = document.getElementById('play-btn');
  const nextBtn  = document.getElementById('next-btn');
  const shuffleBtn = document.getElementById('shuffle-btn');
  const closeBtn   = document.getElementById('close-btn');

  // -------------------------------------------------------------------- State
  /** @type {{ name: string, uri: string }[]} */
  let images = [];
  /** @type {null | { imageIndex: number, position: number, total: number, playing: boolean, shuffle: boolean }} */
  let pendingShow = null;

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
    counterEl.textContent = `${msg.position} / ${msg.total}`;

    playBtn.textContent = msg.playing ? '⏸' : '▶';
    playBtn.title = msg.playing ? 'Pause (Space)' : 'Play (Space)';
    shuffleBtn.classList.toggle('active', msg.shuffle);
    shuffleBtn.setAttribute('aria-pressed', String(msg.shuffle));
  }

  // ----------------------------------------------------------------- UI events
  prevBtn.addEventListener('click',    () => vscode.postMessage({ type: 'navigate', direction: 'prev' }));
  nextBtn.addEventListener('click',    () => vscode.postMessage({ type: 'navigate', direction: 'next' }));
  playBtn.addEventListener('click',    () => vscode.postMessage({ type: 'togglePlay' }));
  shuffleBtn.addEventListener('click', () => vscode.postMessage({ type: 'toggleShuffle' }));
  closeBtn.addEventListener('click',   () => vscode.postMessage({ type: 'close' }));

  document.addEventListener('keydown', (e) => {
    switch (e.key) {
      case 'Escape':      vscode.postMessage({ type: 'close' }); break;
      case 'ArrowRight':  vscode.postMessage({ type: 'navigate', direction: 'next' }); e.preventDefault(); break;
      case 'ArrowLeft':   vscode.postMessage({ type: 'navigate', direction: 'prev' }); e.preventDefault(); break;
      case ' ':           vscode.postMessage({ type: 'togglePlay' }); e.preventDefault(); break;
    }
  });

  // -------------------------------------------------------------- Ext messages
  window.addEventListener('message', (event) => {
    const msg = event.data;
    switch (msg.type) {
      case 'images': {
        images = msg.images || [];
        if (pendingShow) { applyShow(pendingShow); }
        break;
      }
      case 'show': {
        applyShow(msg);
        break;
      }
    }
  });

  vscode.postMessage({ type: 'ready' });
})();
