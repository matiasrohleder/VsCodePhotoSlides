// @ts-check
(function () {
  const vscode = acquireVsCodeApi();

  // ----------------------------------------------------------------- Elements
  const emptyState = document.getElementById('empty-state');
  const emptyMessage = document.getElementById('empty-message');
  const emptySelectBtn = document.getElementById('empty-select-btn');
  const player = document.getElementById('player');
  const stage = document.getElementById('stage');
  const photo = /** @type {HTMLImageElement} */ (document.getElementById('photo'));
  const spinner = document.getElementById('spinner');
  const filenameEl = document.getElementById('filename');
  const counterEl = document.getElementById('counter');
  const prevBtn = document.getElementById('prev-btn');
  const nextBtn = document.getElementById('next-btn');
  const playBtn = document.getElementById('play-btn');
  const shuffleBtn = document.getElementById('shuffle-btn');
  const contextMenu = document.getElementById('context-menu');
  const revealBtn = document.getElementById('reveal-btn');
  const changeFolderBtn = document.getElementById('change-folder-btn');

  // -------------------------------------------------------------------- State
  /** @type {{ name: string, uri: string }[]} */
  let images = [];
  /** @type {number[]} Orden de reproducción (índices hacia `images`). */
  let order = [];
  let position = 0; // posición dentro de `order`
  let playing = false;
  let shuffle = false;
  let intervalMs = 5000;
  let imageFit = 'contain';
  let autoplay = true;
  // El spinner solo se muestra al cargar la carpeta (primera imagen), no en
  // cada transición automática (si no, ocupa lugar y distrae).
  let showSpinnerNext = false;
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;

  const persistedState = vscode.getState();
  if (persistedState && typeof persistedState.shuffle === 'boolean') {
    shuffle = persistedState.shuffle;
  }

  // ----------------------------------------------------------------- Helpers
  function saveState() {
    vscode.setState({ shuffle });
  }

  /** Fisher–Yates: produce un orden aleatorio de los índices. */
  function shuffledIndices(n) {
    const arr = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  function rebuildOrder(keepCurrent) {
    const currentImageIndex = order.length ? order[position] : 0;
    if (shuffle) {
      order = shuffledIndices(images.length);
      if (keepCurrent) {
        // Mueve la imagen actual al frente para que no salte.
        const at = order.indexOf(currentImageIndex);
        if (at > 0) {
          order.splice(at, 1);
          order.unshift(currentImageIndex);
        }
        position = 0;
      }
    } else {
      order = Array.from({ length: images.length }, (_, i) => i);
      position = keepCurrent ? currentImageIndex : 0;
    }
    if (position >= order.length) {
      position = 0;
    }
  }

  function show(index) {
    if (!images.length) {
      return;
    }
    position = ((index % order.length) + order.length) % order.length;
    const img = images[order[position]];
    const baseName = img.name.split(/[\\/]/).pop() || img.name;
    photo.classList.remove('loaded');
    if (showSpinnerNext) {
      spinner.classList.remove('hidden');
      showSpinnerNext = false;
    }
    photo.onload = () => {
      photo.classList.add('loaded');
      spinner.classList.add('hidden');
    };
    photo.onerror = () => {
      spinner.classList.add('hidden');
    };
    photo.src = img.uri;
    photo.alt = baseName;
    filenameEl.textContent = baseName;
    filenameEl.setAttribute('title', img.name);
    counterEl.textContent = `${position + 1} / ${order.length}`;
    restartTimerIfPlaying();
  }

  function next() {
    show(position + 1);
  }

  function previous() {
    show(position - 1);
  }

  function clearTimer() {
    if (timer) {
      clearTimeout(timer);
      timer = undefined;
    }
  }

  function restartTimerIfPlaying() {
    clearTimer();
    if (playing && order.length > 1) {
      timer = setTimeout(next, intervalMs);
    }
  }

  function setPlaying(value) {
    playing = value;
    playBtn.textContent = playing ? '⏸' : '▶';
    playBtn.setAttribute('title', playing ? 'Pause (Space)' : 'Play (Space)');
    restartTimerIfPlaying();
  }

  function togglePlay() {
    setPlaying(!playing);
  }

  function setShuffle(value, persistToSettings) {
    shuffle = value;
    shuffleBtn.classList.toggle('active', shuffle);
    shuffleBtn.setAttribute('aria-pressed', String(shuffle));
    saveState();
    rebuildOrder(true);
    show(position);
    if (persistToSettings) {
      vscode.postMessage({ type: 'persistShuffle', value: shuffle });
    }
  }

  function applyFit() {
    photo.classList.toggle('fit-cover', imageFit === 'cover');
  }

  function applyConfig(config) {
    if (!config) {
      return;
    }
    intervalMs = config.intervalMs || 5000;
    imageFit = config.imageFit || 'contain';
    applyFit();
    // El shuffle de los Settings tiene prioridad al cargar imágenes nuevas,
    // pero el toggle local de la UI puede haberlo cambiado en sesión.
    if (typeof config.shuffle === 'boolean') {
      shuffle = config.shuffle;
      shuffleBtn.classList.toggle('active', shuffle);
      shuffleBtn.setAttribute('aria-pressed', String(shuffle));
    }
    if (typeof config.autoplay === 'boolean') {
      // autoplay solo influye en la primera carga (ver handler 'images').
      autoplay = config.autoplay;
    }
  }

  // ----------------------------------------------------------------- UI events
  emptySelectBtn.addEventListener('click', () =>
    vscode.postMessage({ type: 'selectFolder' }),
  );
  nextBtn.addEventListener('click', () => next());
  prevBtn.addEventListener('click', () => previous());
  playBtn.addEventListener('click', () => togglePlay());
  shuffleBtn.addEventListener('click', () => setShuffle(!shuffle, true));

  // --------------------------------------------------------- Context menu
  function currentName() {
    return images.length ? images[order[position]].name : null;
  }

  function hideContextMenu() {
    contextMenu.classList.add('hidden');
  }

  stage.addEventListener('contextmenu', (e) => {
    if (!images.length) {
      return;
    }
    e.preventDefault();
    // Mostrar fuera de pantalla primero para medir el tamaño real.
    contextMenu.classList.remove('hidden');
    const menuW = contextMenu.offsetWidth;
    const menuH = contextMenu.offsetHeight;
    const x = Math.min(e.clientX, window.innerWidth - menuW - 4);
    const y = Math.min(e.clientY, window.innerHeight - menuH - 4);
    contextMenu.style.left = Math.max(4, x) + 'px';
    contextMenu.style.top = Math.max(4, y) + 'px';
  });

  revealBtn.addEventListener('click', () => {
    const name = currentName();
    if (name) {
      vscode.postMessage({ type: 'reveal', name });
    }
    hideContextMenu();
  });

  changeFolderBtn.addEventListener('click', () => {
    vscode.postMessage({ type: 'selectFolder' });
    hideContextMenu();
  });

  document.addEventListener('click', hideContextMenu);
  window.addEventListener('blur', hideContextMenu);
  window.addEventListener('scroll', hideContextMenu, true);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      hideContextMenu();
    }
    if (player.classList.contains('hidden')) {
      return;
    }
    switch (e.key) {
      case 'ArrowRight':
        next();
        e.preventDefault();
        break;
      case 'ArrowLeft':
        previous();
        e.preventDefault();
        break;
      case ' ':
        togglePlay();
        e.preventDefault();
        break;
    }
  });

  // -------------------------------------------------------------- Ext messages
  window.addEventListener('message', (event) => {
    const msg = event.data;
    switch (msg.type) {
      case 'images': {
        applyConfig(msg.config);
        images = msg.images || [];
        rebuildOrder(false);
        emptyState.classList.add('hidden');
        player.classList.remove('hidden');
        // Muestra el spinner solo para la primera imagen de esta carga.
        showSpinnerNext = true;
        show(0);
        setPlaying(autoplay && images.length > 1);
        break;
      }
      case 'visibility': {
        // Pausa el temporizador cuando el panel se oculta (ahorra CPU) y lo
        // reanuda al volver, sin re-leer el disco.
        if (msg.visible) {
          restartTimerIfPlaying();
        } else {
          clearTimer();
        }
        break;
      }
      case 'empty': {
        applyConfig(msg.config);
        clearTimer();
        images = [];
        order = [];
        player.classList.add('hidden');
        emptyState.classList.remove('hidden');
        if (msg.reason === 'empty-folder') {
          emptyMessage.textContent =
            'No images found in this folder. Try another one.';
        } else if (msg.reason === 'error') {
          emptyMessage.textContent =
            'Could not open the saved folder. Please select a new one.';
        } else {
          emptyMessage.textContent = 'No photo folder selected yet.';
        }
        break;
      }
      case 'config': {
        applyConfig(msg.config);
        restartTimerIfPlaying();
        break;
      }
      case 'command': {
        if (player.classList.contains('hidden')) {
          break;
        }
        if (msg.command === 'next') next();
        else if (msg.command === 'previous') previous();
        else if (msg.command === 'playPause') togglePlay();
        else if (msg.command === 'toggleShuffle') setShuffle(!shuffle, true);
        break;
      }
    }
  });

  // Notifica a la extensión que el Webview está listo para recibir imágenes.
  vscode.postMessage({ type: 'ready' });
})();
