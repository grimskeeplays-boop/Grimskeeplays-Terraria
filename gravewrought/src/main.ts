// Boot, main loop, scaling and saving.

import { VW, VH, DAY } from './defs';
import { initArt } from './art';
import { audio } from './audio';
import { input, bindInput } from './input';
import { Game, type GameSave } from './game';
import { Renderer } from './render';
import { uiUpdate, drawUI, drawTitle, titleButtonAt } from './ui';

const SAVE_KEY = 'gravewrought.save.v1';
const canvas = document.getElementById('c') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

initArt();
const renderer = new Renderer();
let game: Game | null = null;
let titleT = 0;
let scale = 1, offX = 0, offY = 0;

function readSave(): GameSave | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw) as GameSave;
    return s && s.v === 1 ? s : null;
  } catch {
    return null;
  }
}
let hasSave = readSave() !== null;

function writeSave(): void {
  if (!game) return;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(game.save()));
    hasSave = true;
  } catch {
    // storage can be unavailable (private windows, embedded frames); the game still runs
  }
}

function resize(): void {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(window.innerWidth * dpr));
  canvas.height = Math.max(1, Math.floor(window.innerHeight * dpr));
  const s = Math.min(canvas.width / VW, canvas.height / VH);
  scale = s >= 1 ? Math.floor(s * 2) / 2 : s;
  offX = Math.floor((canvas.width - VW * scale) / 2);
  offY = Math.floor((canvas.height - VH * scale) / 2);
  input.toGame = (x, y) => [(x * dpr - offX) / scale, (y * dpr - offY) / scale];
}
window.addEventListener('resize', resize);
resize();
bindInput(canvas, () => audio.init());

function startGame(load: boolean): void {
  const saved = load ? readSave() : null;
  if (saved) game = Game.load(saved);
  else {
    const q = new URLSearchParams(location.search).get('seed');
    game = Game.create(q ? Number(q) >>> 0 : (Math.random() * 0xffffffff) >>> 0);
  }
  audio.setMood('day');
}

function step(): void {
  if (!game) {
    titleT++;
    audio.setMood('castle');
    if (input.lClick) {
      const b = titleButtonAt(input.mx, input.my, hasSave);
      if (b) { audio.sfx('craft'); startGame(b === 'continue'); }
    }
  } else {
    const captured = uiUpdate(game);
    game.update(captured);
    if (game.tick % 3600 === 0) writeSave();
  }
  input.endStep();
}

function render(): void {
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(scale, 0, 0, scale, offX, offY);
  ctx.imageSmoothingEnabled = false;
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, VW, VH);
  ctx.clip();
  if (game) {
    renderer.draw(ctx, game);
    drawUI(ctx, game);
  } else {
    renderer.drawSky(ctx, DAY * 0.74, titleT * 0.4, 20);
    drawTitle(ctx, hasSave, titleT);
  }
  ctx.restore();
}

const STEP_MS = 1000 / 60;
let last = performance.now();
let acc = 0;
function frame(now: number): void {
  acc += Math.min(100, now - last);
  last = now;
  let n = 0;
  while (acc >= STEP_MS && n < 5) {
    step();
    acc -= STEP_MS;
    n++;
  }
  if (n === 5) acc = 0;
  audio.update();
  render();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

window.addEventListener('beforeunload', writeSave);
document.addEventListener('visibilitychange', () => { if (document.hidden) writeSave(); });

// Handle for automated tests and debugging from the browser console.
(window as unknown as { gw: unknown }).gw = { get game() { return game; }, start: startGame, save: writeSave };
