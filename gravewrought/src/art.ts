// All artwork is generated in code at startup: tiles, walls, item icons, scenery.

import { T, WL, ITEMS, ICON_TILE, TILES } from './defs';
import { RNG, hash2, shade } from './util';

export type Ctx = CanvasRenderingContext2D;

export function mk(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d')!;
  x.imageSmoothingEnabled = false;
  return [c, x];
}

const R = (c: Ctx, x: number, y: number, w: number, h: number, col: string) => {
  c.fillStyle = col;
  c.fillRect(x, y, w, h);
};

function line(c: Ctx, x0: number, y0: number, x1: number, y1: number, col: string, th = 1): void {
  const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx - dy;
  c.fillStyle = col;
  for (;;) {
    c.fillRect(x0, y0, th, th);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 > -dy) { err -= dy; x0 += sx; }
    if (e2 < dx) { err += dx; y0 += sy; }
  }
}

export const VARIANTS = 3;
export let tileAtlas: HTMLCanvasElement;
export let wallAtlas: HTMLCanvasElement;
export let crackAtlas: HTMLCanvasElement;
export let moonSprite: HTMLCanvasElement;
/** Tree crowns, indexed by biome then variant. */
export const treeTops: HTMLCanvasElement[][] = [];
export const icons: Record<string, HTMLCanvasElement> = {};

type Painter = (c: Ctx, v: number) => void;

function speckle(c: Ctx, v: number, seed: number, base: string, cols: [string, number][]): void {
  R(c, 0, 0, 16, 16, base);
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      let h = hash2((x + v * 31) >> 1, y + v * 17, seed);
      for (const [col, p] of cols) {
        if (h < p) { R(c, x, y, 1, 1, col); break; }
        h -= p;
      }
    }
  }
}

const cracks = (c: Ctx, v: number, seed: number, dark: string, lit: string | null) => {
  const r = new RNG(seed + v * 31);
  for (let i = 0; i < 3; i++) {
    let x = r.int(1, 12), y = r.int(1, 12);
    const len = r.int(3, 6);
    for (let k = 0; k < len; k++) {
      R(c, x, y, 1, 1, dark);
      if (lit) R(c, x, y + 1, 1, 1, lit);
      if (r.chance(0.6)) x++; else y += r.chance(0.5) ? 1 : -1;
    }
  }
};

const stone: Painter = (c, v) => {
  speckle(c, v, 3, '#5c6078', [['#52566c', 0.12], ['#666a82', 0.08]]);
  cracks(c, v, 700, '#3f4258', '#6d7189');
};

const nuggets = (c: Ctx, v: number, seed: number, col: string[]) => {
  const r = new RNG(seed * 97 + v * 13 + 1);
  for (let i = 0; i < 5; i++) {
    const x = r.int(1, 12), y = r.int(1, 12);
    R(c, x, y, 3, 2, col[0]);
    R(c, x + 1, y - 1, 1, 1, col[0]);
    R(c, x, y, 1, 1, col[1]);
    R(c, x + 2, y + 1, 1, 1, col[2]);
  }
};

const gloom: Painter = (c, v) => {
  speckle(c, v, 5, '#211f33', [['#191729', 0.2], ['#2e2b47', 0.1]]);
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    if ((x * 2 + y + v * 5) % 23 < 2 && hash2(x, y, 40 + v) > 0.35) R(c, x, y, 1, 1, '#3b2f5c');
  }
};

const flame = (c: Ctx, x: number, y: number, v: number) => {
  const o = v === 1 ? 1 : 0;
  R(c, x - 1, y + o, 4, 5 - o, '#ff8a2a');
  R(c, x, y + 2, 2, 3, '#ffe08a');
  R(c, x + (v % 2), y - 1 + o, 1, 1, '#ffb347');
};

const TILE_PAINT: Record<number, Painter> = {
  [T.Dirt]: (c, v) => speckle(c, v, 1, '#4b3a3e', [['#413238', 0.12], ['#564447', 0.09], ['#65524f', 0.02]]),
  [T.Grass]: (c, v) => {
    speckle(c, v, 1, '#4b3a3e', [['#413238', 0.12], ['#564447', 0.09], ['#65524f', 0.02]]);
    for (let x = 0; x < 16; x++) {
      const h = hash2(x, v, 77);
      const d = 2 + (h < 0.35 ? 1 : 0) + (h < 0.1 ? 1 : 0);
      R(c, x, 0, 1, d, '#55603f');
      R(c, x, 0, 1, 1, h > 0.6 ? '#78854f' : '#687545');
      if (h > 0.85) R(c, x, d - 1, 1, 1, '#434c33');
    }
  },
  [T.Stone]: stone,
  [T.Brick]: (c, v) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      const row = y >> 2, off = (row % 2) * 4;
      const bx = (x + off) % 8, by = y % 4;
      let col = '#2a2635';
      if (bx !== 7 && by !== 3) {
        const k = hash2(((x + off) >> 3) % 2, row, 11 + v);
        col = k < 0.33 ? '#6b6080' : k < 0.66 ? '#62587a' : '#736888';
        if (by === 0) col = '#81759a';
        if (hash2(x, y, 12 + v) < 0.06) col = '#574e6c';
      }
      R(c, x, y, 1, 1, col);
    }
  },
  [T.Wood]: (c, v) => {
    R(c, 0, 0, 16, 16, '#6e4c36');
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      if (hash2((x / 3) | 0, y + v * 9, 5) < 0.22) R(c, x, y, 1, 1, '#5d3f2d');
    }
    R(c, 0, 0, 16, 1, '#82603f'); R(c, 0, 8, 16, 1, '#82603f');
    R(c, 0, 7, 16, 1, '#3d2a20'); R(c, 0, 15, 16, 1, '#3d2a20');
    R(c, (5 + v * 4) % 16, 0, 1, 7, '#3d2a20'); R(c, (12 + v * 3) % 16, 8, 1, 7, '#3d2a20');
  },
  [T.Platform]: (c) => {
    R(c, 0, 0, 16, 2, '#8a6644'); R(c, 0, 2, 16, 2, '#6e4c36'); R(c, 0, 4, 16, 1, '#3d2a20');
    R(c, 1, 5, 2, 3, '#4d3526'); R(c, 13, 5, 2, 3, '#4d3526');
  },
  [T.IronOre]: (c, v) => { stone(c, v); nuggets(c, v, 1, ['#b08368', '#dcb394', '#7a5846']); },
  [T.SilverOre]: (c, v) => { stone(c, v); nuggets(c, v, 2, ['#c9d3e6', '#ffffff', '#8793ad']); },
  [T.BloodOre]: (c, v) => { gloom(c, v); nuggets(c, v, 3, ['#c0182f', '#ff6b7c', '#74091c']); },
  [T.Gloom]: gloom,
  [T.Bedrock]: (c) => {
    R(c, 0, 0, 16, 16, '#0f0e16');
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) if ((x + y) % 4 === 0) R(c, x, y, 1, 1, '#1b1928');
  },
  [T.Trunk]: (c, v) => {
    for (let y = 0; y < 16; y++) for (let x = 4; x < 12; x++) {
      let col = '#3a2e2b';
      if (x === 4) col = '#2a2120'; else if (x === 11) col = '#251d1c'; else if (x === 5 || x === 6) col = '#4b3c37';
      if (hash2(x, y + v * 9, 21) < 0.2) col = '#2c2321';
      R(c, x, y, 1, 1, col);
    }
  },
  [T.Torch]: (c, v) => { R(c, 7, 8, 2, 8, '#6e4c36'); R(c, 7, 8, 1, 8, '#82603f'); flame(c, 7, 3, v); },
  [T.Workbench]: (c) => {
    R(c, 0, 5, 16, 3, '#7a5539'); R(c, 0, 5, 16, 1, '#96704b');
    R(c, 1, 8, 2, 8, '#553a29'); R(c, 13, 8, 2, 8, '#553a29'); R(c, 3, 11, 10, 1, '#553a29');
    R(c, 9, 3, 4, 2, '#8d8f9c'); R(c, 6, 4, 3, 1, '#6e4c36');
  },
  [T.Furnace]: (c, v) => {
    R(c, 1, 3, 14, 13, '#585c72'); R(c, 0, 2, 16, 2, '#6f7389'); R(c, 1, 15, 14, 1, '#3c3f54');
    R(c, 1, 9, 14, 1, '#3c3f54'); R(c, 10, 0, 3, 2, '#4a4e63');
    R(c, 4, 8, 8, 6, '#1a1218'); R(c, 5, 11, 6, 3, '#ff7a1a'); R(c, 6, 10 + (v % 2), 4, 2, '#ffd35a');
  },
  [T.Anvil]: (c) => {
    R(c, 2, 6, 12, 3, '#8d8f9c'); R(c, 0, 6, 3, 2, '#8d8f9c'); R(c, 0, 6, 14, 1, '#c4c6d0');
    R(c, 5, 9, 6, 3, '#5b5d6b'); R(c, 3, 12, 10, 2, '#6f7180'); R(c, 2, 14, 12, 2, '#5b5d6b');
  },
  [T.Chest]: (c) => {
    R(c, 1, 5, 14, 11, '#6e4c36'); R(c, 1, 5, 14, 1, '#96704b'); R(c, 1, 9, 14, 1, '#3d2a20');
    R(c, 1, 5, 2, 11, '#c9a227'); R(c, 13, 5, 2, 11, '#c9a227'); R(c, 1, 15, 14, 1, '#3d2a20');
    R(c, 7, 8, 2, 3, '#f0d76a');
  },
  [T.Urn]: (c) => {
    const rows: [number, number, number][] = [[5, 6, 9], [6, 7, 8], [7, 5, 10], [8, 5, 10], [9, 4, 11], [10, 4, 11], [11, 4, 11], [12, 4, 11], [13, 5, 10], [14, 5, 10], [15, 6, 9]];
    for (const [y, x0, x1] of rows) {
      R(c, x0, y, x1 - x0 + 1, 1, '#6e6a84');
      R(c, x0, y, 1, 1, '#8c88a0');
      R(c, x1, y, 1, 1, '#4f4b63');
    }
    R(c, 4, 10, 8, 1, '#b3122d');
    R(c, 6, 8, 1, 2, '#a9a5bd');
  },
  [T.Candelabra]: (c, v) => {
    R(c, 7, 6, 2, 9, '#3a3a46'); R(c, 4, 14, 8, 2, '#3a3a46'); R(c, 2, 6, 12, 1, '#4a4a58');
    for (const [x, y] of [[2, 4], [7, 3], [12, 4]] as const) {
      R(c, x, y, 2, 2, '#e8e0c8');
      R(c, x, y - 2, 2, 2, '#ff8a2a');
      R(c, x + ((v + x) % 2), y - 3, 1, 1, '#ffe08a');
    }
  },
  [T.Crystal]: (c) => {
    R(c, 6, 4, 4, 12, '#c0182f'); R(c, 7, 2, 2, 2, '#ff6b7c'); R(c, 3, 9, 3, 7, '#8f1024');
    R(c, 4, 8, 1, 1, '#c0182f'); R(c, 10, 7, 3, 9, '#a3142a'); R(c, 11, 6, 1, 1, '#c0182f');
    R(c, 7, 5, 1, 4, '#ffb3bd'); R(c, 11, 9, 1, 2, '#ff6b7c'); R(c, 4, 11, 1, 2, '#ff6b7c');
  },
  [T.Altar]: (c) => {
    R(c, 1, 8, 14, 8, '#4a4e63'); R(c, 0, 6, 16, 3, '#676b82'); R(c, 0, 6, 16, 1, '#8589a0');
    R(c, 4, 6, 8, 6, '#8f1024'); R(c, 4, 11, 8, 1, '#c9a227');
    R(c, 6, 1, 4, 4, '#d9d2b8'); R(c, 7, 5, 2, 1, '#d9d2b8'); R(c, 6, 3, 1, 1, '#1a1218'); R(c, 9, 3, 1, 1, '#1a1218');
  },
};
TILE_PAINT[T.TreeTop] = TILE_PAINT[T.Trunk];

const brim: Painter = (c, v) => {
  speckle(c, v, 14, '#4c2222', [['#3c1819', 0.16], ['#5e2e2a', 0.1]]);
  cracks(c, v, 760, '#1c0a0c', '#5a2a24');
};

Object.assign(TILE_PAINT, {
  [T.Snow]: (c: Ctx, v: number) => {
    speckle(c, v, 10, '#dfe8f0', [['#c8d6e4', 0.14], ['#f6fbff', 0.1]]);
    for (let x = 0; x < 16; x++) if (hash2(x, v, 78) < 0.3) R(c, x, 0, 1, 1, '#ffffff');
  },
  [T.Ice]: (c: Ctx, v: number) => {
    speckle(c, v, 11, '#8cc4e0', [['#74aed0', 0.12], ['#b4e0f4', 0.1]]);
    for (let i = 0; i < 16; i++) if ((i + v * 3) % 7 < 2) { R(c, i, (i * 2 + v * 5) % 16, 1, 1, '#e6f8ff'); R(c, (i * 3 + 4) % 16, i, 1, 1, '#d0f0ff'); }
  },
  [T.Mud]: (c: Ctx, v: number) => speckle(c, v, 12, '#3f3a2c', [['#353023', 0.14], ['#4a4534', 0.09], ['#5a5540', 0.02]]),
  [T.Moss]: (c: Ctx, v: number) => {
    speckle(c, v, 12, '#3f3a2c', [['#353023', 0.14], ['#4a4534', 0.09], ['#5a5540', 0.02]]);
    for (let x = 0; x < 16; x++) {
      const h = hash2(x, v, 79);
      const d = 2 + (h < 0.4 ? 1 : 0) + (h < 0.15 ? 2 : 0);
      R(c, x, 0, 1, d, '#3f5f35');
      R(c, x, 0, 1, 1, h > 0.5 ? '#6f9a52' : '#557a44');
    }
  },
  [T.Ash]: (c: Ctx, v: number) => speckle(c, v, 13, '#5a5658', [['#4c484b', 0.14], ['#6a6668', 0.1], ['#807c7c', 0.02]]),
  [T.Brim]: brim,
  [T.NightOre]: (c: Ctx, v: number) => { brim(c, v); nuggets(c, v, 4, ['#5a3fa8', '#9a7cf0', '#2c1d5c']); },
  [T.Ember]: (c: Ctx, v: number) => {
    brim(c, v);
    const r = new RNG(900 + v * 17);
    for (let i = 0; i < 3; i++) {
      let x = r.int(1, 12), y = r.int(1, 12);
      for (let k = 0; k < r.int(4, 7); k++) {
        R(c, x, y, 1, 1, k % 3 === 0 ? '#ffd35a' : '#ff7a1a');
        if (r.chance(0.5)) x++; else y += r.chance(0.5) ? 1 : -1;
      }
    }
  },
  [T.Gravestone]: (c: Ctx) => {
    R(c, 4, 4, 8, 12, '#6a6e80'); R(c, 5, 3, 6, 1, '#6a6e80'); R(c, 6, 2, 4, 1, '#6a6e80');
    R(c, 4, 4, 1, 12, '#8589a0'); R(c, 11, 4, 1, 12, '#4a4e63'); R(c, 6, 2, 4, 1, '#8589a0');
    R(c, 7, 5, 2, 6, '#3c3f54'); R(c, 6, 7, 4, 1, '#3c3f54'); R(c, 3, 15, 10, 1, '#3c3f54');
  },
  [T.Board]: (c: Ctx) => {
    R(c, 2, 12, 2, 4, '#553a29'); R(c, 12, 12, 2, 4, '#553a29');
    R(c, 0, 1, 16, 11, '#7a5539'); R(c, 0, 1, 16, 1, '#96704b'); R(c, 0, 11, 16, 1, '#3d2a20');
    R(c, 2, 3, 5, 6, '#e8e0c8'); R(c, 9, 4, 5, 5, '#d8cfa8'); R(c, 3, 5, 3, 1, '#6a6478'); R(c, 3, 7, 3, 1, '#6a6478');
    R(c, 10, 6, 3, 1, '#6a6478'); R(c, 4, 3, 1, 1, '#c0182f'); R(c, 11, 4, 1, 1, '#c0182f');
  },
  [T.Bloom]: (c: Ctx, v: number) => {
    R(c, 7, 8, 1, 8, '#3f5f35'); R(c, 5, 11, 2, 1, '#557a44'); R(c, 8, 13, 2, 1, '#557a44');
    R(c, 6, 5, 3, 3, '#9fd07a'); R(c, 7, 4 + (v % 2), 1, 1, '#e8ffc0'); R(c, 5, 6, 1, 1, '#6f9a52'); R(c, 9, 6, 1, 1, '#6f9a52');
  },
});

const brickWall = (c: Ctx, v: number) => {
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const row = y >> 3;
    const bx = (x + (row % 2) * 8) % 16, by = y % 8;
    let col = '#1f1b29';
    if (bx !== 15 && by !== 7) {
      const k = hash2(((x + (row % 2) * 8) >> 4) % 2, row, 31 + v);
      col = k < 0.5 ? '#3b3450' : '#352f49';
      if (hash2(x, y, 32 + v) < 0.07) col = '#2f2941';
    }
    R(c, x, y, 1, 1, col);
  }
};

const WALL_PAINT: Record<number, Painter> = {
  [WL.Dirt]: (c, v) => speckle(c, v, 6, '#352a2f', [['#2c2227', 0.15], ['#3d3136', 0.08]]),
  [WL.Stone]: (c, v) => {
    speckle(c, v, 7, '#3a3c50', [['#32344a', 0.15], ['#42455a', 0.08]]);
    cracks(c, v, 720, '#2a2c3e', null);
  },
  [WL.Brick]: brickWall,
  [WL.Wood]: (c, v) => {
    for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
      let col = x % 4 === 3 ? '#2a1d16' : '#3f2c21';
      if (x % 4 !== 3 && hash2(x, (y / 3) | 0, 8 + v) < 0.2) col = '#372519';
      R(c, x, y, 1, 1, col);
    }
  },
  [WL.Gloom]: (c, v) => speckle(c, v, 9, '#13121f', [['#0e0d18', 0.2], ['#1a1830', 0.1]]),
  [WL.Pillar]: (c, v) => {
    brickWall(c, v);
    const cols = ['#3f3a54', '#4f4967', '#615a7c', '#6f6890', '#615a7c', '#4f4967', '#454059', '#4f4967', '#3f3a54', '#322d44'];
    for (let i = 0; i < cols.length; i++) R(c, 3 + i, 0, 1, 16, cols[i]);
  },
};

WALL_PAINT[WL.Ice] = (c, v) => {
  speckle(c, v, 15, '#3f6278', [['#365568', 0.15], ['#4a7088', 0.1]]);
  cracks(c, v, 780, '#2c4658', null);
};
WALL_PAINT[WL.Brim] = (c, v) => {
  speckle(c, v, 16, '#2c1416', [['#221012', 0.2], ['#381c1e', 0.1]]);
  cracks(c, v, 790, '#0e0506', null);
};

function buildAtlases(): void {
  const nT = TILES.length;
  const [tc, tx] = mk(VARIANTS * 16, nT * 16);
  for (let id = 1; id < nT; id++) {
    const p = TILE_PAINT[id];
    if (!p) continue;
    for (let v = 0; v < VARIANTS; v++) {
      const [c, cx] = mk(16, 16);
      p(cx, v);
      tx.drawImage(c, v * 16, id * 16);
    }
  }
  tileAtlas = tc;

  const [wc, wx] = mk(VARIANTS * 16, 12 * 16);
  for (const key of Object.keys(WALL_PAINT)) {
    const id = Number(key);
    for (let v = 0; v < VARIANTS; v++) {
      const [c, cx] = mk(16, 16);
      WALL_PAINT[id](cx, v);
      wx.drawImage(c, v * 16, id * 16);
    }
  }
  wallAtlas = wc;

  // mining cracks, four stages
  const [cc, ccx] = mk(64, 16);
  const r = new RNG(99);
  const pts: [number, number][] = [];
  for (let i = 0; i < 40; i++) pts.push([r.int(1, 14), r.int(1, 14)]);
  for (let s = 0; s < 4; s++) {
    for (let i = 0; i < (s + 1) * 10; i++) {
      R(ccx, s * 16 + pts[i][0], pts[i][1], 1, 1, 'rgba(0,0,0,0.75)');
      if (i % 2 === 0) R(ccx, s * 16 + pts[i][0] + 1, pts[i][1], 1, 1, 'rgba(0,0,0,0.5)');
    }
  }
  crackAtlas = cc;
}

function buildScenery(): void {
  // tree crowns: one style per biome, three variants each
  const dead = (seed: number, bark: string, barkLit: string, twig: string, reach: number): HTMLCanvasElement => {
    const [c, cx] = mk(64, 56);
    const r = new RNG(seed);
    const branch = (x: number, y: number, ang: number, len: number, th: number) => {
      const x1 = x + Math.cos(ang) * len, y1 = y + Math.sin(ang) * len;
      line(cx, Math.round(x), Math.round(y), Math.round(x1), Math.round(y1), th > 1 ? bark : twig, th);
      if (th > 1) line(cx, Math.round(x), Math.round(y), Math.round(x1), Math.round(y1), barkLit, 1);
      if (len < 5) return;
      const n = len > 12 ? 3 : 2;
      for (let i = 0; i < n; i++) branch(x1, y1, ang + r.range(-0.9, 0.9), len * r.range(0.55, 0.75), Math.max(1, th - 1));
    };
    R(cx, 28, 44, 8, 12, bark); R(cx, 28, 44, 1, 12, twig); R(cx, 29, 44, 2, 12, barkLit);
    branch(31, 46, -Math.PI / 2 - 0.5, reach, 3);
    branch(32, 46, -Math.PI / 2 + 0.45, reach + 1, 3);
    branch(32, 46, -Math.PI / 2, reach - 2, 2);
    return c;
  };
  const pine = (seed: number): HTMLCanvasElement => {
    const [c, cx] = mk(64, 56);
    const r = new RNG(seed);
    R(cx, 28, 46, 8, 10, '#3a2e2b'); R(cx, 29, 46, 2, 10, '#4b3c37');
    for (let tier = 0; tier < 4; tier++) {
      const base = 48 - tier * 11, hw = 19 - tier * 4;
      for (let k = 0; k < 13; k++) {
        const y = base - k;
        const half = Math.max(1, Math.round(hw * (1 - k / 13)));
        R(cx, 32 - half, y, half * 2, 1, k % 3 === 0 ? '#1a322d' : '#234039');
        R(cx, 32 - half, y, 1, 1, '#14262a');
        if (k > 6 || r.chance(0.25)) R(cx, 32 - half + r.int(0, Math.max(0, half)), y, Math.max(1, half - 1), 1, '#dfe8f0');
      }
    }
    R(cx, 31, 3, 2, 3, '#f6fbff');
    return c;
  };
  const willow = (seed: number): HTMLCanvasElement => {
    const c = dead(seed, '#2e2a22', '#3f3a2e', '#211e18', 13);
    const cx = c.getContext('2d')!;
    const r = new RNG(seed + 1);
    for (let x = 8; x < 56; x += 2) {
      const top = 14 + Math.round(Math.abs(x - 32) * 0.45) + r.int(-2, 2);
      const len = r.int(8, 22);
      for (let k = 0; k < len; k++) R(cx, x + (k % 5 === 4 ? 1 : 0), top + k, 1, 1, k % 4 === 0 ? '#557a44' : '#3f5f35');
    }
    for (let i = 0; i < 26; i++) R(cx, r.int(10, 52), r.int(8, 22), r.int(2, 4), 2, '#2f4a2a');
    return c;
  };
  for (let v = 0; v < 3; v++) {
    const hollow = dead(500 + v * 7, '#3a2e2b', '#4b3c37', '#2c2321', 15);
    const ash = dead(540 + v * 7, '#1f1b1b', '#322c2c', '#141111', 9);
    const ax = ash.getContext('2d')!;
    const er = new RNG(560 + v);
    for (let i = 0; i < 5; i++) R(ax, er.int(22, 42), er.int(28, 46), 1, 1, '#ff7a1a');
    (treeTops[0] ??= []).push(hollow);
    (treeTops[1] ??= []).push(pine(520 + v * 7));
    (treeTops[2] ??= []).push(willow(530 + v * 7));
    (treeTops[3] ??= []).push(ash);
    (treeTops[4] ??= []).push(dead(550 + v * 7, '#2a2228', '#3a3038', '#1c161c', 17));
  }

  // moon
  const [m, mx] = mk(48, 48);
  const craters: [number, number, number][] = [[16, 18, 5], [30, 14, 3], [27, 30, 6], [14, 32, 3], [35, 24, 2]];
  for (let y = 0; y < 48; y++) for (let x = 0; x < 48; x++) {
    const d = Math.hypot(x - 23.5, y - 23.5);
    if (d > 22) continue;
    let k = 1 - (d / 22) * 0.18 + (hash2(x, y, 60) - 0.5) * 0.05;
    for (const [cx0, cy0, cr] of craters) if (Math.hypot(x - cx0, y - cy0) < cr) k -= 0.12;
    if (Math.hypot(x - 30, y - 20) > 24) k -= 0.1;
    R(mx, x, y, 1, 1, shade('#ebe6cf', k));
  }
  moonSprite = m;
}

// ---------------------------------------------------------------- item icons

type IconPainter = (c: Ctx, col: string[]) => void;

const ICON_PAINT: Record<string, IconPainter> = {
  log: (c, k) => {
    R(c, 2, 6, 12, 5, k[0]); R(c, 2, 6, 12, 1, k[1]); R(c, 2, 10, 12, 1, k[2]);
    R(c, 12, 6, 2, 5, k[1]); R(c, 13, 8, 1, 1, k[2]); R(c, 5, 8, 3, 1, k[2]);
  },
  ore: (c, k) => {
    R(c, 3, 8, 5, 4, k[0]); R(c, 8, 5, 5, 5, k[0]); R(c, 6, 10, 6, 3, k[2]);
    R(c, 3, 8, 2, 1, k[1]); R(c, 8, 5, 2, 2, k[1]); R(c, 11, 9, 2, 1, k[2]); R(c, 7, 11, 2, 1, k[0]);
  },
  bar: (c, k) => {
    R(c, 4, 6, 10, 2, k[1]); R(c, 2, 8, 12, 3, k[0]); R(c, 2, 11, 12, 1, k[2]);
    R(c, 2, 7, 2, 1, k[0]); R(c, 13, 8, 1, 3, k[2]);
  },
  sword: (c, k) => {
    line(c, 5, 10, 13, 2, k[0], 2); line(c, 5, 10, 13, 2, k[1], 1);
    line(c, 2, 9, 6, 13, '#c9a227'); line(c, 1, 14, 3, 12, '#3d2a20', 2);
  },
  pick: (c, k) => {
    line(c, 3, 13, 10, 6, '#6e4c36', 2);
    line(c, 5, 3, 9, 4, k[0], 2); line(c, 9, 4, 12, 7, k[0], 2); line(c, 12, 7, 13, 11, k[0], 2);
    R(c, 5, 3, 1, 1, k[1]); R(c, 9, 4, 2, 1, k[1]); R(c, 13, 11, 1, 2, k[2]);
  },
  axe: (c, k) => {
    line(c, 3, 13, 10, 6, '#6e4c36', 2);
    R(c, 8, 2, 5, 6, k[0]); R(c, 13, 3, 1, 5, k[1]); R(c, 8, 2, 5, 1, k[1]); R(c, 8, 7, 3, 1, k[2]);
  },
  hammer: (c, k) => {
    line(c, 3, 13, 9, 7, '#6e4c36', 2);
    R(c, 7, 2, 7, 5, k[0]); R(c, 7, 2, 7, 1, k[1]); R(c, 7, 6, 7, 1, k[2]);
  },
  whip: (c, k) => {
    line(c, 2, 13, 4, 11, '#3d2a20', 2);
    const pts: [number, number][] = [[5, 10], [6, 7], [8, 5], [11, 5], [13, 7], [13, 10], [11, 12], [9, 11], [8, 9], [9, 8], [11, 8]];
    for (let i = 0; i + 1 < pts.length; i++) line(c, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], i % 2 ? k[0] : k[1]);
  },
  bow: (c, k) => {
    for (let y = 2; y <= 13; y++) {
      const x = 5 + Math.round(6 * Math.sin((Math.PI * (y - 2)) / 11));
      R(c, x, y, 2, 1, k[0]); R(c, x, y, 1, 1, k[1]);
    }
    R(c, 5, 2, 1, 12, '#d8d4c8');
  },
  arrow: (c, k) => {
    line(c, 3, 12, 11, 4, '#96704b');
    R(c, 11, 2, 3, 3, k[0]); R(c, 13, 2, 1, 1, k[1]); R(c, 11, 4, 1, 1, k[2]);
    R(c, 2, 12, 2, 2, '#b3122d'); R(c, 3, 11, 1, 1, '#e8e4d8');
  },
  knife: (c, k) => {
    line(c, 6, 9, 12, 3, k[0], 2); line(c, 6, 9, 12, 3, k[1], 1);
    line(c, 3, 12, 5, 10, '#3d2a20', 2);
  },
  shard: (c, k) => {
    line(c, 4, 11, 11, 4, k[0], 2); R(c, 11, 3, 2, 2, k[1]); R(c, 3, 12, 2, 1, k[2]);
  },
  helm: (c, k) => {
    R(c, 4, 4, 8, 7, k[0]); R(c, 4, 4, 8, 2, k[1]); R(c, 3, 10, 10, 2, k[2]);
    R(c, 6, 8, 5, 1, '#1a1218'); R(c, 7, 2, 2, 2, k[1]);
  },
  body: (c, k) => {
    R(c, 4, 4, 8, 10, k[0]); R(c, 2, 4, 3, 4, k[0]); R(c, 11, 4, 3, 4, k[0]);
    R(c, 7, 3, 2, 2, '#1a1218'); R(c, 5, 5, 6, 1, k[1]); R(c, 4, 11, 8, 1, k[2]); R(c, 2, 4, 3, 1, k[1]); R(c, 11, 4, 3, 1, k[1]);
  },
  legs: (c, k) => {
    R(c, 4, 3, 8, 3, k[0]); R(c, 4, 6, 3, 8, k[0]); R(c, 9, 6, 3, 8, k[0]);
    R(c, 4, 3, 8, 1, k[1]); R(c, 3, 13, 4, 2, k[2]); R(c, 9, 13, 4, 2, k[2]);
  },
  bone: (c, k) => {
    line(c, 4, 11, 11, 4, k[0], 2);
    R(c, 2, 10, 3, 3, k[0]); R(c, 10, 2, 3, 3, k[0]); R(c, 3, 11, 1, 1, k[2]); R(c, 11, 3, 1, 1, k[2]); R(c, 10, 2, 1, 1, k[1]);
  },
  hide: (c, k) => {
    R(c, 3, 4, 10, 9, k[0]); R(c, 2, 6, 1, 4, k[0]); R(c, 13, 5, 1, 5, k[0]);
    R(c, 3, 4, 2, 1, 'rgba(0,0,0,0)'); c.clearRect(3, 4, 1, 1); c.clearRect(12, 12, 1, 1); c.clearRect(3, 12, 1, 1);
    R(c, 5, 6, 5, 1, k[1]); R(c, 6, 9, 4, 1, k[2]); R(c, 9, 7, 1, 3, k[2]);
  },
  wing: (c, k) => {
    const rows: [number, number, number][] = [[4, 10, 13], [5, 8, 13], [6, 6, 13], [7, 5, 12], [8, 4, 12], [9, 3, 10], [10, 3, 8]];
    for (const [y, x0, x1] of rows) R(c, x0, y, x1 - x0 + 1, 1, k[0]);
    line(c, 3, 10, 13, 4, k[1]); line(c, 3, 10, 12, 8, k[2]);
    c.clearRect(7, 10, 1, 1); c.clearRect(10, 9, 1, 1);
  },
  shroud: (c, k) => {
    R(c, 3, 3, 10, 8, k[0]); R(c, 3, 3, 10, 1, k[1]);
    for (let x = 3; x < 13; x++) R(c, x, 11, 1, 1 + ((x * 7) % 3), x % 2 ? k[0] : k[2]);
    R(c, 6, 5, 1, 5, k[2]); R(c, 10, 4, 1, 6, k[2]);
  },
  potion: (c, k) => {
    R(c, 7, 2, 2, 1, '#6e4c36'); R(c, 7, 3, 2, 3, '#b8c8d8');
    R(c, 6, 6, 4, 1, '#b8c8d8'); R(c, 4, 7, 8, 5, '#b8c8d8'); R(c, 5, 12, 6, 1, '#8898a8');
    R(c, 5, 8, 6, 4, k[0]); R(c, 5, 8, 1, 2, '#ffffff');
  },
  ring: (c, k) => {
    const g = '#c9a227';
    R(c, 6, 6, 4, 1, g); R(c, 6, 13, 4, 1, g); R(c, 4, 8, 1, 4, g); R(c, 11, 8, 1, 4, g);
    R(c, 5, 7, 1, 1, g); R(c, 10, 7, 1, 1, g); R(c, 5, 12, 1, 1, g); R(c, 10, 12, 1, 1, g);
    R(c, 6, 3, 4, 3, k[0]); R(c, 7, 3, 1, 1, k[1]); R(c, 9, 5, 1, 1, k[2]);
  },
  feather: (c, k) => {
    line(c, 4, 12, 11, 3, k[0], 3); line(c, 4, 13, 12, 3, k[1], 1); R(c, 3, 13, 1, 2, '#d8d4c8');
    R(c, 11, 2, 2, 1, k[2]);
  },
  boots: (c, k) => {
    R(c, 4, 4, 4, 7, k[0]); R(c, 4, 10, 9, 3, k[0]); R(c, 4, 13, 9, 1, k[2]);
    R(c, 3, 3, 6, 2, '#cfcabb'); R(c, 5, 6, 1, 4, k[1]);
  },
  cloak: (c, k) => {
    for (let y = 2; y <= 13; y++) {
      const hw = 2 + Math.floor((y - 2) * 0.4);
      R(c, 8 - hw, y, hw * 2, 1, k[0]);
    }
    R(c, 7, 2, 2, 1, '#c9a227'); R(c, 6, 5, 1, 9, k[2]); R(c, 9, 4, 1, 10, k[2]); R(c, 4, 9, 1, 5, k[1]);
  },
  fang: (c, k) => {
    const rows: [number, number, number][] = [[3, 6, 10], [4, 6, 10], [5, 7, 10], [6, 7, 10], [7, 8, 10], [8, 8, 10], [9, 8, 10], [10, 9, 10], [11, 9, 10], [12, 9, 9]];
    for (const [y, x0, x1] of rows) R(c, x0, y, x1 - x0 + 1, 1, k[0]);
    R(c, 6, 3, 1, 2, k[1]); R(c, 9, 12, 1, 2, '#b3122d'); R(c, 6, 2, 5, 1, '#8f1024');
  },
  locket: (c, k) => {
    line(c, 3, 2, 7, 7, '#c9a227'); line(c, 12, 2, 8, 7, '#c9a227');
    R(c, 6, 8, 4, 6, k[0]); R(c, 5, 9, 6, 4, k[0]); R(c, 6, 8, 2, 1, k[1]);
    R(c, 8, 10, 2, 3, k[2]); R(c, 7, 11, 1, 1, k[2]);
  },
  lantern: (c) => {
    R(c, 6, 3, 4, 1, '#3a3a46'); R(c, 5, 4, 1, 1, '#3a3a46'); R(c, 10, 4, 1, 1, '#3a3a46');
    R(c, 5, 5, 6, 9, '#3a3a46'); R(c, 6, 6, 4, 6, '#ffd35a'); R(c, 7, 8, 2, 3, '#fff2b0'); R(c, 4, 13, 8, 1, '#5b5d6b');
  },
};

Object.assign(ICON_PAINT, {
  gem: (c: Ctx, k: string[]) => {
    R(c, 6, 3, 4, 2, k[1]); R(c, 4, 5, 8, 4, k[0]); R(c, 5, 9, 6, 2, k[0]); R(c, 6, 11, 4, 1, k[2]); R(c, 7, 12, 2, 1, k[2]);
    R(c, 5, 5, 2, 2, k[1]); R(c, 10, 7, 2, 2, k[2]);
  },
  bloom: (c: Ctx, k: string[]) => {
    R(c, 7, 8, 1, 6, k[2]); R(c, 5, 11, 2, 1, k[0]); R(c, 8, 12, 3, 1, k[0]);
    R(c, 5, 3, 5, 5, k[1]); R(c, 6, 2, 3, 1, k[1]); R(c, 7, 4, 2, 2, '#f6ffd8'); R(c, 4, 5, 1, 2, k[0]); R(c, 10, 5, 1, 2, k[0]);
  },
  staff: (c: Ctx, k: string[]) => {
    line(c, 3, 13, 10, 6, '#6e4c36', 2);
    R(c, 9, 2, 5, 5, k[0]); R(c, 10, 1, 3, 1, k[0]); R(c, 10, 3, 2, 2, k[1]); R(c, 13, 5, 1, 2, k[2]); R(c, 8, 6, 2, 2, '#c9a227');
  },
  stake: (c: Ctx, k: string[]) => {
    line(c, 4, 12, 11, 5, '#96704b', 3); line(c, 4, 12, 10, 6, '#6e4c36', 1);
    R(c, 11, 3, 3, 3, k[0]); R(c, 13, 2, 1, 1, k[1]); R(c, 2, 13, 3, 2, k[0]); R(c, 7, 8, 3, 1, '#c9a227');
  },
});

function buildIcons(): void {
  for (const id of Object.keys(ITEMS)) {
    const d = ITEMS[id];
    const [c, cx] = mk(16, 16);
    if (d.icon === 'tile') {
      const t = ICON_TILE[id];
      if (TILES[t].solid) {
        cx.drawImage(tileAtlas, 0, t * 16, 16, 16, 2, 2, 12, 12);
        cx.strokeStyle = 'rgba(0,0,0,0.6)';
        cx.strokeRect(1.5, 1.5, 13, 13);
      } else {
        cx.drawImage(tileAtlas, 0, t * 16, 16, 16, 0, 0, 16, 16);
      }
    } else if (d.icon === 'wall') {
      const t = ICON_TILE[id];
      cx.drawImage(wallAtlas, 0, t * 16, 16, 16, 3, 3, 10, 10);
      cx.strokeStyle = 'rgba(0,0,0,0.7)';
      cx.strokeRect(2.5, 2.5, 11, 11);
    } else {
      ICON_PAINT[d.icon](cx, d.col);
    }
    icons[id] = c;
  }
}

export function initArt(): void {
  buildAtlases();
  buildScenery();
  buildIcons();
}
