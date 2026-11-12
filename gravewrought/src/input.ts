// Keyboard and mouse state, in the game's 640x360 coordinate space.

export const input = {
  keys: new Set<string>(),
  pressed: new Set<string>(),
  mx: 320,
  my: 180,
  lmb: false,
  rmb: false,
  lClick: false,
  rClick: false,
  wheel: 0,
  shift: false,
  /** Whether shift was held at the moment of the last click. */
  clickShift: false,
  /** Set by main.ts: converts page pixels to game pixels. */
  toGame: (x: number, y: number): [number, number] => [x, y],

  down(...codes: string[]): boolean {
    for (const c of codes) if (this.keys.has(c)) return true;
    return false;
  },
  hit(...codes: string[]): boolean {
    for (const c of codes) if (this.pressed.has(c)) return true;
    return false;
  },
  /** Clear one-shot flags; call after each simulation step that consumed them. */
  endStep(): void {
    this.pressed.clear();
    this.lClick = false;
    this.rClick = false;
    this.clickShift = false;
    this.wheel = 0;
  },
};

export function bindInput(canvas: HTMLCanvasElement, onGesture: () => void): void {
  const GAME_KEYS = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab']);
  window.addEventListener('keydown', (e) => {
    if (GAME_KEYS.has(e.code)) e.preventDefault();
    if (!e.repeat) input.pressed.add(e.code);
    input.keys.add(e.code);
    input.shift = e.shiftKey;
    onGesture();
  });
  window.addEventListener('keyup', (e) => {
    input.keys.delete(e.code);
    input.shift = e.shiftKey;
  });
  window.addEventListener('blur', () => {
    input.keys.clear();
    input.lmb = false;
    input.rmb = false;
  });
  const move = (e: MouseEvent) => {
    const [x, y] = input.toGame(e.clientX, e.clientY);
    input.mx = x;
    input.my = y;
  };
  canvas.addEventListener('mousemove', move);
  canvas.addEventListener('mousedown', (e) => {
    move(e);
    if (e.button === 0) { input.lmb = true; input.lClick = true; }
    if (e.button === 2) { input.rmb = true; input.rClick = true; }
    input.shift = e.shiftKey;
    input.clickShift = e.shiftKey;
    onGesture();
  });
  window.addEventListener('mouseup', (e) => {
    if (e.button === 0) input.lmb = false;
    if (e.button === 2) input.rmb = false;
  });
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    input.wheel += Math.sign(e.deltaY);
  }, { passive: false });
}
