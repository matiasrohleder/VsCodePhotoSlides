/** Imagen almacenada en el coordinador. La URI se genera por cada webview. */
export interface StoredImage {
  name: string;
  abs: string;
}

/** Interfaz que cada panel debe implementar para recibir actualizaciones. */
export interface ISyncTarget {
  send(message: object): void;
}

export interface ShowPayload {
  type: 'show';
  imageIndex: number;
  position: number; // 1-based, para el contador "N / total"
  total: number;
  playing: boolean;
  shuffle: boolean;
}

/**
 * Fuente única de verdad para el slideshow.
 * Dueño del timer, el orden de reproducción, la posición y el estado de play.
 * Los webviews son pantallas pasivas que reciben ShowPayload para renderizar.
 */
export class SlideshowCoordinator {
  private readonly registered = new Map<string, ISyncTarget>();
  private lightbox?: ISyncTarget;

  private _images: StoredImage[] = [];
  private _folder?: string;
  private _order: number[] = [];
  private _position = 0;
  private _shuffle = false;
  private _playing = false;
  private _intervalMs = 5000;
  private _timer?: ReturnType<typeof setTimeout>;

  // ------------------------------------------------------------------ Registry
  register(id: string, target: ISyncTarget): void {
    this.registered.set(id, target);
  }

  registerLightbox(target: ISyncTarget): void {
    this.lightbox = target;
  }

  unregisterLightbox(): void {
    this.lightbox = undefined;
  }

  // ----------------------------------------------------------------- Accessors
  get currentImages(): StoredImage[] { return this._images; }
  get currentFolder(): string | undefined { return this._folder; }
  get currentImageIndex(): number { return this._order[this._position] ?? 0; }
  get intervalMs(): number { return this._intervalMs; }
  get playing(): boolean { return this._playing; }
  get shuffle(): boolean { return this._shuffle; }

  // ------------------------------------------------------------------ Commands
  /**
   * Carga una nueva lista de imágenes. Reinicia posición y arranca el timer.
   * Llamado por el provider cuando hace refresh de la carpeta.
   */
  setImages(
    images: StoredImage[],
    folder: string | undefined,
    intervalMs: number,
    shuffle: boolean,
    autoplay: boolean,
  ): void {
    this._images = images;
    this._folder = folder;
    this._intervalMs = intervalMs;
    this._shuffle = shuffle;
    this._playing = autoplay && images.length > 1;
    this._buildOrder(false);
    this._restartTimer();
    this._broadcastShow();
  }

  /** Actualiza el intervalo sin recargar imágenes (cambio de settings en vivo). */
  setIntervalMs(ms: number): void {
    this._intervalMs = ms;
    this._restartTimer();
  }

  /** Actualiza el shuffle sin recargar imágenes (settings o toggle de UI). */
  setShuffle(shuffle: boolean): void {
    this._shuffle = shuffle;
    this._buildOrder(true); // mantiene la imagen actual en el nuevo orden
    this._broadcastShow();
  }

  /** Avanza o retrocede. Llamado cuando el usuario navega en cualquier panel. */
  navigate(direction: 'next' | 'prev'): void {
    if (!this._order.length) { return; }
    if (direction === 'next') {
      this._position = (this._position + 1) % this._order.length;
    } else {
      this._position = (this._position - 1 + this._order.length) % this._order.length;
    }
    this._restartTimer();
    this._broadcastShow();
  }

  /** Activa o desactiva la reproducción automática. */
  setPlaying(playing: boolean): void {
    this._playing = playing;
    this._restartTimer();
    this._broadcastShow();
  }

  /** Devuelve el payload actual (para inicializar un panel recién abierto). */
  currentShowPayload(): ShowPayload {
    return {
      type: 'show',
      imageIndex: this._order[this._position] ?? 0,
      position: this._position + 1,
      total: this._order.length,
      playing: this._playing,
      shuffle: this._shuffle,
    };
  }

  // ----------------------------------------------------------------- Internals
  private _buildOrder(keepCurrent: boolean): void {
    if (!this._images.length) {
      this._order = [];
      this._position = 0;
      return;
    }
    const curImage = this._order.length ? this._order[this._position] : 0;
    if (this._shuffle) {
      this._order = this._shuffledIndices(this._images.length);
      if (keepCurrent) {
        const at = this._order.indexOf(curImage);
        if (at > 0) {
          this._order.splice(at, 1);
          this._order.unshift(curImage);
        }
        this._position = 0;
      }
    } else {
      this._order = Array.from({ length: this._images.length }, (_, i) => i);
      this._position = keepCurrent ? curImage : 0;
    }
    if (this._position >= this._order.length) {
      this._position = 0;
    }
  }

  private _shuffledIndices(n: number): number[] {
    const arr = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  private _clearTimer(): void {
    if (this._timer !== undefined) {
      clearTimeout(this._timer);
      this._timer = undefined;
    }
  }

  private _restartTimer(): void {
    this._clearTimer();
    if (this._playing && this._order.length > 1) {
      this._timer = setTimeout(() => {
        this._position = (this._position + 1) % this._order.length;
        this._restartTimer();
        this._broadcastShow();
      }, this._intervalMs);
    }
  }

  private _broadcastShow(): void {
    const payload = this.currentShowPayload();
    for (const target of this.registered.values()) {
      target.send(payload);
    }
    this.lightbox?.send(payload);
  }
}
