const canvasContext = new Proxy({}, {
  get: (target, property) => property === "measureText" ? () => ({ width: 0 }) : () => undefined,
  set: () => true,
});

global.OffscreenCanvas = class {
  constructor(public width: number, public height: number) {}
  getContext() {
    return canvasContext;
  }
} as unknown as typeof OffscreenCanvas;

HTMLCanvasElement.prototype.getContext = (() => canvasContext) as unknown as typeof HTMLCanvasElement.prototype.getContext;

// The SDK preloads remote models at import time; tests stay offline.
global.fetch = (() => Promise.resolve({ arrayBuffer: () => Promise.resolve(new ArrayBuffer(0)) })) as unknown as typeof fetch;

global.ResizeObserver = class {
  constructor(private readonly callback: ResizeObserverCallback) {}
  observe() {
    this.callback([{ contentRect: { width: 800, height: 600 } } as ResizeObserverEntry], this);
  }
  unobserve() {}
  disconnect() {}
};
