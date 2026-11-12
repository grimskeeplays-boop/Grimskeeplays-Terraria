// Keyboard, mouse and touch state, in the game's 640x360 coordinate space.

/** On-screen control layout, shared with the code that draws it. */
export const TOUCH = {
  stick: { x: 62, y: 292, r: 30 },
  aim: { x: 578, y: 292, r: 30 },
  jump: { x: 506, y: 320, r: 20 },
  buttons: [
    { code: 'KeyE', label: 'Bag', x: 590, y: 40, w: 42, h: 18 },
    { code: 'KeyJ', label: 'Journal', x: 542, y: 40, w: 44, h: 18 },
    { code: 'KeyH', label: '?', x: 520, y: 40, w: 18, h: 18 },
  ],
};

const TOUCH_PREF = 'gravewrought.touch';
const LONG_PRESS_MS = 480;

interface Stick { id: number; bx: number; by: number; x: number; y: number; }
const idle = (): Stick => ({ id: -1, bx: 0, by: 0, x: 0, y: 0 });

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

  // --- touch
  /** True when the on-screen controls are in use. */
  touchUI: false,
  /** The device reports a touch screen. */
  touchCapable: false,
  /** The player's stored choice: 'on', 'off', or '' for automatic. */
  touchPref: '',
  /** Set by the interface: sticks are hidden while a menu is open. */
  sticksEnabled: false,
  stick: idle(),
  aim: idle(),
  /** A finger is down outside the sticks and buttons. */
  ptrDown: false,
  /** A short touch was just released. */
  tap: false,
  /** Aim stick: direction (length up to 1) and whether it is pushed far enough to act. */
  aimX: 0,
  aimY: 0,
  aimOn: false,
  /** The aim stick was pushed this step. */
  aimHit: false,

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
    this.tap = false;
    this.aimHit = false;
    this.wheel = 0;
  },
  /** Called once per frame: turns a held finger into a long press. */
  poll(now: number): void {
    if (ptr.id >= 0 && !ptr.long && !ptr.moved && now - ptr.t0 > LONG_PRESS_MS) {
      ptr.long = true;
      this.rClick = true;
    }
  },
  setTouchPref(pref: string): void {
    this.touchPref = pref;
    this.touchUI = pref === 'on' || (pref === '' && this.touchUI);
    if (pref === 'off') { this.touchUI = false; releaseSticks(); }
    try { localStorage.setItem(TOUCH_PREF, pref); } catch { /* storage unavailable */ }
  },
};

const ptr = { id: -1, t0: 0, sx: 0, sy: 0, moved: false, long: false };
let jumpId = -1;

function setKey(code: string, on: boolean): void {
  if (on) input.keys.add(code); else input.keys.delete(code);
}

function releaseSticks(): void {
  input.stick = idle();
  input.aim = idle();
  input.aimOn = false;
  input.aimX = input.aimY = 0;
  setKey('KeyA', false); setKey('KeyD', false); setKey('KeyS', false);
  if (jumpId >= 0) { jumpId = -1; setKey('Space', false); }
}

function moveStick(x: number, y: number): void {
  const s = input.stick;
  s.x = x; s.y = y;
  const dx = (x - s.bx) / TOUCH.stick.r, dy = (y - s.by) / TOUCH.stick.r;
  setKey('KeyA', dx < -0.3);
  setKey('KeyD', dx > 0.3);
  setKey('KeyS', dy > 0.65);
}

function moveAim(x: number, y: number): void {
  const s = input.aim;
  s.x = x; s.y = y;
  let dx = (x - s.bx) / TOUCH.aim.r, dy = (y - s.by) / TOUCH.aim.r;
  const m = Math.hypot(dx, dy);
  if (m > 1) { dx /= m; dy /= m; }
  input.aimX = dx;
  input.aimY = dy;
  const on = m > 0.25;
  if (on && !input.aimOn) input.aimHit = true;
  input.aimOn = on;
}

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

  // --- touch
  input.touchCapable = navigator.maxTouchPoints > 0 || 'ontouchstart' in window;
  try { input.touchPref = localStorage.getItem(TOUCH_PREF) ?? ''; } catch { /* storage unavailable */ }
  input.touchUI = input.touchPref === 'on';

  const inCircle = (x: number, y: number, c: { x: number; y: number; r: number }, pad = 8) => Math.hypot(x - c.x, y - c.y) <= c.r + pad;

  canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    onGesture();
    if (input.touchPref !== 'off') input.touchUI = true;
    for (const t of Array.from(e.changedTouches)) {
      const [x, y] = input.toGame(t.clientX, t.clientY);
      if (input.touchUI) {
        const b = TOUCH.buttons.find((q) => x >= q.x - 3 && x < q.x + q.w + 3 && y >= q.y - 4 && y < q.y + q.h + 4);
        if (b) { input.pressed.add(b.code); continue; }
        if (input.sticksEnabled) {
          if (jumpId < 0 && inCircle(x, y, TOUCH.jump)) { jumpId = t.identifier; input.keys.add('Space'); input.pressed.add('Space'); continue; }
          if (input.stick.id < 0 && x < 190 && y > 190) { input.stick = { id: t.identifier, bx: x, by: y, x, y }; continue; }
          if (input.aim.id < 0 && x > 530 && y > 200) { input.aim = { id: t.identifier, bx: x, by: y, x, y }; continue; }
        }
      }
      if (ptr.id < 0) {
        ptr.id = t.identifier; ptr.t0 = performance.now(); ptr.sx = x; ptr.sy = y; ptr.moved = false; ptr.long = false;
        input.mx = x; input.my = y;
        input.lmb = true;
        input.ptrDown = true;
        // without on-screen controls a touch behaves exactly like a mouse click
        if (!input.touchUI) input.lClick = true;
      }
    }
  }, { passive: false });

  canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      const [x, y] = input.toGame(t.clientX, t.clientY);
      if (t.identifier === input.stick.id) moveStick(x, y);
      else if (t.identifier === input.aim.id) moveAim(x, y);
      else if (t.identifier === ptr.id) {
        input.mx = x; input.my = y;
        if (Math.hypot(x - ptr.sx, y - ptr.sy) > 10) ptr.moved = true;
      }
    }
  }, { passive: false });

  const end = (e: TouchEvent) => {
    e.preventDefault();
    for (const t of Array.from(e.changedTouches)) {
      if (t.identifier === input.stick.id) {
        input.stick = idle();
        setKey('KeyA', false); setKey('KeyD', false); setKey('KeyS', false);
      } else if (t.identifier === input.aim.id) {
        input.aim = idle();
        input.aimOn = false;
      } else if (t.identifier === jumpId) {
        jumpId = -1;
        setKey('Space', false);
      } else if (t.identifier === ptr.id) {
        ptr.id = -1;
        input.lmb = false;
        input.ptrDown = false;
        if (input.touchUI && !ptr.long && !ptr.moved && performance.now() - ptr.t0 < LONG_PRESS_MS) {
          input.lClick = true;
          input.tap = true;
        }
      }
    }
  };
  canvas.addEventListener('touchend', end, { passive: false });
  canvas.addEventListener('touchcancel', end, { passive: false });
}
