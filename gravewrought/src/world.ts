// World storage, procedural generation and save encoding.

import { T, WL, TILES, DAY, ITEMS, PREFIXES, CHEST_LOOT, type Slot, type LootRow } from './defs';
import { RNG, fbm2, noise2, clamp } from './util';

export const CHEST_SLOTS = 20;

export class World {
  tiles: Uint8Array;
  walls: Uint8Array;
  spawnX = 0;
  spawnY = 0;
  /** Rows above this can receive sky light. */
  skyLimit = 0;
  time = DAY * 0.06;
  day = 1;
  chests = new Map<number, (Slot | null)[]>();

  constructor(public w: number, public h: number, public seed: number) {
    this.tiles = new Uint8Array(w * h);
    this.walls = new Uint8Array(w * h);
  }

  inb(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }
  tile(x: number, y: number): number {
    return this.inb(x, y) ? this.tiles[y * this.w + x] : T.Bedrock;
  }
  wall(x: number, y: number): number {
    return this.inb(x, y) ? this.walls[y * this.w + x] : WL.Stone;
  }
  set(x: number, y: number, t: number): void {
    if (this.inb(x, y)) this.tiles[y * this.w + x] = t;
  }
  setWall(x: number, y: number, wl: number): void {
    if (this.inb(x, y)) this.walls[y * this.w + x] = wl;
  }
  solid(x: number, y: number): boolean {
    return TILES[this.tile(x, y)].solid;
  }
  /** 0 = deep night, 1 = full day. */
  daylight(): number {
    const t = this.time / DAY;
    if (t < 0.48) return 1;
    if (t < 0.6) return 1 - (t - 0.48) / 0.12;
    if (t < 0.93) return 0;
    return (t - 0.93) / 0.07;
  }
  isNight(): boolean {
    return this.daylight() < 0.35;
  }
}

// ---------------------------------------------------------------- loot helpers

export function rollPrefix(r: RNG, id: string): number | undefined {
  const d = ITEMS[id];
  if (d.kind !== 'weapon' || d.stack > 1) return undefined;
  if (r.chance(0.3)) return undefined;
  let tot = 0;
  for (const p of PREFIXES) tot += p.w;
  let v = r.next() * tot;
  for (let i = 0; i < PREFIXES.length; i++) {
    v -= PREFIXES[i].w;
    if (v <= 0) return i;
  }
  return undefined;
}

export function rollLoot(r: RNG, table: LootRow[]): Slot {
  let tot = 0;
  for (const row of table) tot += row[3];
  let v = r.next() * tot;
  for (const row of table) {
    v -= row[3];
    if (v <= 0) return { id: row[0], n: r.int(row[1], row[2]) };
  }
  return { id: table[0][0], n: table[0][1] };
}

function fillChest(r: RNG, tier: string): (Slot | null)[] {
  const t = CHEST_LOOT[tier];
  const slots: (Slot | null)[] = new Array(CHEST_SLOTS).fill(null);
  const main = r.pick(t.main);
  slots[0] = { id: main, n: 1, pre: rollPrefix(r, main) };
  let i = 1;
  if (r.chance(t.crystal)) slots[i++] = { id: 'vitae_crystal', n: 1 };
  const n = r.int(2, 4);
  const seen = new Set<string>();
  for (let k = 0; k < n; k++) {
    const s = rollLoot(r, t.fill);
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    slots[i++] = s;
  }
  return slots;
}

// ---------------------------------------------------------------- generation

export function generateWorld(seed: number): World {
  const W = 600, H = 260;
  const w = new World(W, H, seed);
  const r = new RNG(seed);
  const mid = W >> 1;

  // --- surface heights
  const hs = new Int16Array(W);
  for (let x = 0; x < W; x++) {
    const v = 72 + (fbm2(x * 0.012, 3.3, seed, 4) - 0.5) * 44 + (noise2(x * 0.07, 9.1, seed + 5) - 0.5) * 7;
    hs[x] = clamp(Math.round(v), 46, 96);
  }
  const flatten = (cx0: number, cx1: number, level: number, margin: number) => {
    for (let x = Math.max(0, cx0 - margin); x <= Math.min(W - 1, cx1 + margin); x++) {
      const d = x < cx0 ? cx0 - x : x > cx1 ? x - cx1 : 0;
      const k = d / margin;
      hs[x] = Math.round(level + (hs[x] - level) * k * k);
    }
  };
  flatten(mid - 5, mid + 5, hs[mid], 8);

  // --- castle footprint
  const CW = 12, CH = 7, COLS = 5;
  const castleW = COLS * CW;
  const dir = r.chance(0.5) ? 1 : -1;
  const castleX = dir > 0 ? mid + 70 : mid - 70 - castleW;
  let avg = 0;
  for (let x = castleX; x <= castleX + castleW; x++) avg += hs[x];
  const gy = Math.round(avg / (castleW + 1));
  flatten(castleX - 2, castleX + castleW + 2, gy, 10);

  let maxH = 0;
  for (let x = 0; x < W; x++) maxH = Math.max(maxH, hs[x]);
  w.skyLimit = maxH + 5;

  // --- base fill
  for (let x = 0; x < W; x++) {
    const dirtDepth = 8 + Math.floor(noise2(x * 0.09, 1.7, seed + 9) * 8);
    const gloomY = 188 + Math.floor((noise2(x * 0.03, 5.5, seed + 11) - 0.5) * 16);
    for (let y = hs[x]; y < H; y++) {
      const depth = y - hs[x];
      let t: number = T.Stone;
      if (y >= H - 3) t = T.Bedrock;
      else if (y >= gloomY) t = T.Gloom;
      else if (depth < dirtDepth) t = T.Dirt;
      w.set(x, y, t);
      if (depth >= 1) w.setWall(x, y, y >= gloomY ? WL.Gloom : depth < dirtDepth + 2 ? WL.Dirt : WL.Stone);
    }
    w.set(x, hs[x], T.Grass);
  }

  // --- caves
  for (let x = 1; x < W - 1; x++) {
    for (let y = hs[x] + 6; y < H - 4; y++) {
      const n = fbm2(x * 0.035, y * 0.05, seed + 7, 3);
      const big = fbm2(x * 0.018, y * 0.03, seed + 13, 3);
      if (Math.abs(n - 0.5) < 0.031 || (y > hs[x] + 22 && big > 0.69)) w.set(x, y, T.Air);
    }
  }
  // entrances from the surface
  for (let i = 0; i < 6; i++) {
    let x = r.int(20, W - 20);
    if (Math.abs(x - mid) < 14 || (x > castleX - 12 && x < castleX + castleW + 12)) continue;
    let y = hs[x];
    const len = r.int(14, 34);
    for (let k = 0; k < len && y < H - 6; k++) {
      for (let dx = -1; dx <= 1; dx++) w.set(x + dx, y, T.Air);
      y++;
      if (r.chance(0.45)) x += r.chance(0.5) ? 1 : -1;
      x = clamp(x, 3, W - 4);
    }
  }
  // tidy isolated cells
  for (let pass = 0; pass < 2; pass++) {
    for (let x = 1; x < W - 1; x++) {
      for (let y = hs[x] + 2; y < H - 4; y++) {
        let solid = 0;
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) if ((dx || dy) && w.solid(x + dx, y + dy)) solid++;
        const t = w.tile(x, y);
        if (t !== T.Air && solid <= 2) w.set(x, y, T.Air);
        else if (t === T.Air && solid >= 7) w.set(x, y, w.wall(x, y) === WL.Gloom ? T.Gloom : T.Stone);
      }
    }
  }

  // --- ore and pockets
  const blob = (cx: number, cy: number, n: number, tile: number, into: number[]) => {
    let x = cx, y = cy;
    for (let i = 0; i < n; i++) {
      if (w.inb(x, y) && into.includes(w.tile(x, y))) w.set(x, y, tile);
      if (r.chance(0.5)) x += r.chance(0.5) ? 1 : -1; else y += r.chance(0.5) ? 1 : -1;
    }
  };
  const scatter = (count: number, y0: number, y1: number, n: number, tile: number, into: number[]) => {
    for (let i = 0; i < count; i++) {
      const x = r.int(2, W - 3);
      const y = r.int(y0, y1);
      if (y > hs[x] + 4) blob(x, y, n, tile, into);
    }
  };
  scatter(90, 70, 185, 26, T.Dirt, [T.Stone]);
  scatter(70, 60, 110, 8, T.Stone, [T.Dirt]);
  scatter(190, 60, 215, 12, T.IronOre, [T.Stone, T.Dirt, T.Gloom]);
  scatter(110, 125, 248, 9, T.SilverOre, [T.Stone, T.Gloom]);
  scatter(80, 195, 254, 8, T.BloodOre, [T.Gloom]);

  // --- castle
  const room = (rx: number, ry: number) => {
    for (let x = rx; x <= rx + CW; x++) {
      for (let y = ry; y <= ry + CH; y++) {
        const border = x === rx || x === rx + CW || y === ry || y === ry + CH;
        w.set(x, y, border ? T.Brick : T.Air);
        w.setWall(x, y, WL.Brick);
      }
    }
  };
  const furnish = (rx: number, ry: number, tier: string, chestChance: number) => {
    const fy = ry + CH - 1;
    const free = (x: number) => w.tile(x, fy) === T.Air && w.tile(x, fy + 1) === T.Brick;
    const cx = r.chance(0.5) ? rx + 2 : rx + CW - 2;
    if (r.chance(0.75) && free(cx)) w.set(cx, fy, T.Candelabra);
    const urns = r.int(0, 2);
    for (let i = 0; i < urns; i++) {
      const x = r.int(rx + 1, rx + CW - 1);
      if (free(x)) w.set(x, fy, T.Urn);
    }
    if (r.chance(chestChance)) {
      const x = r.int(rx + 3, rx + CW - 3);
      if (free(x)) {
        w.set(x, fy, T.Chest);
        w.chests.set(fy * W + x, fillChest(r, tier));
      }
    }
  };
  const colH = [5, 3, 4, 3, 5];
  // clear the sky above the footprint and lay a foundation
  for (let x = castleX; x <= castleX + castleW; x++) {
    for (let y = gy - 50; y < gy; y++) { w.set(x, y, T.Air); w.setWall(x, y, WL.None); }
    for (let y = gy + 1; y <= gy + 3; y++) w.set(x, y, T.Brick);
  }
  for (let c = 0; c < COLS; c++) for (let rr = 0; rr < colH[c]; rr++) room(castleX + c * CW, gy - (rr + 1) * CH);
  for (let c = 0; c < COLS; c++) {
    const rx = castleX + c * CW;
    for (let rr = 0; rr < colH[c]; rr++) {
      const ry = gy - (rr + 1) * CH;
      // doorway to the room on the right
      if (c + 1 < COLS && rr < colH[c + 1]) {
        for (let y = ry + CH - 3; y <= ry + CH - 1; y++) w.set(rx + CW, y, T.Air);
        for (let y = ry + 1; y <= ry + CH - 1; y++) { w.setWall(rx + CW - 1, y, WL.Pillar); w.setWall(rx + CW + 1, y, WL.Pillar); }
      }
      // hatch to the room above, with a ledge to reach it
      if (rr + 1 < colH[c]) {
        const gx = rr % 2 === 0 ? rx + 2 : rx + CW - 4;
        for (let x = gx; x <= gx + 2; x++) w.set(x, ry, T.Platform);
        for (let x = gx; x <= gx + 2; x++) w.set(x, ry + CH - 3, T.Platform);
      }
      // arched window
      if (r.chance(0.6)) {
        const wx = rx + 6;
        for (let x = wx - 1; x <= wx + 1; x++) for (let y = ry + 2; y <= ry + 3; y++) w.setWall(x, y, WL.None);
        w.setWall(wx, ry + 1, WL.None);
      }
    }
    // roofline: spires on the towers, battlements elsewhere
    const top = gy - colH[c] * CH;
    if (colH[c] === 5) {
      for (let k = 0; k <= CW / 2; k++) {
        for (let x = rx + k; x <= rx + CW - k; x++) { w.set(x, top - 1 - k, T.Brick); w.setWall(x, top - 1 - k, WL.Brick); }
      }
    } else {
      for (let x = rx; x <= rx + CW; x++) if ((x - rx) % 2 === 0) w.set(x, top - 1, T.Brick);
    }
  }
  // gates on both sides
  for (let y = gy - 3; y <= gy - 1; y++) { w.set(castleX, y, T.Air); w.set(castleX + castleW, y, T.Air); }
  for (let c = 0; c < COLS; c++) {
    for (let rr = 0; rr < colH[c]; rr++) {
      const top = rr === colH[c] - 1;
      furnish(castleX + c * CW, gy - (rr + 1) * CH, 'castle', top ? 0.9 : 0.2);
    }
  }
  // altar in the keep's highest hall
  {
    const ax = castleX + 2 * CW + 6, ay = gy - 3 * CH - 1;
    for (let x = ax - 1; x <= ax + 1; x++) if (w.tile(x, ay) !== T.Air) { w.chests.delete(ay * W + x); w.set(x, ay, T.Air); }
    w.set(ax, ay, T.Altar);
  }
  // ruin: knock a few bricks out of the outer shell
  for (let i = 0; i < 26; i++) {
    const c = r.int(0, COLS - 1);
    const x = castleX + c * CW + r.int(0, CW);
    const y = gy - colH[c] * CH - r.int(0, 1);
    if (w.tile(x, y) === T.Brick && w.tile(x, y - 1) === T.Air) w.set(x, y, T.Air);
  }

  // catacomb beneath the keep
  {
    const sx = castleX + 2 * CW + 5;
    const depth = 20;
    for (let x = sx; x <= sx + 2; x++) w.set(x, gy, T.Platform);
    for (let y = gy + 1; y <= gy + depth; y++) {
      for (let x = sx - 1; x <= sx + 3; x++) {
        const edge = x === sx - 1 || x === sx + 3;
        w.set(x, y, edge ? T.Brick : (y - gy) % 4 === 0 ? T.Platform : T.Air);
        w.setWall(x, y, WL.Brick);
      }
    }
    const hy = gy + depth;
    const hx = sx + 1 - Math.floor(CW * 1.5);
    for (let c = 0; c < 3; c++) room(hx + c * CW, hy);
    for (let c = 0; c < 2; c++) for (let y = hy + CH - 3; y <= hy + CH - 1; y++) w.set(hx + (c + 1) * CW, y, T.Air);
    for (let x = sx; x <= sx + 2; x++) w.set(x, hy, T.Platform);
    for (let x = sx; x <= sx + 2; x++) w.set(x, hy + CH - 3, T.Platform);
    for (let c = 0; c < 3; c++) furnish(hx + c * CW, hy, 'crypt', c === 1 ? 0 : 1);
  }

  // --- buried crypts
  for (let i = 0; i < 9; i++) {
    const rx = r.int(16, W - 16 - CW);
    const ry = r.int(maxH + 24, H - 22);
    if (rx > castleX - 30 && rx < castleX + castleW + 30 && ry < gy + 40) continue;
    room(rx, ry);
    for (let y = ry + CH - 3; y <= ry + CH - 1; y++) { w.set(rx, y, T.Air); w.set(rx + CW, y, T.Air); }
    furnish(rx, ry, ry > 180 ? 'castle' : 'crypt', 1);
  }

  // --- trees
  for (let x = 4; x < W - 4; x += r.int(3, 8)) {
    if (Math.abs(x - mid) < 3) continue;
    if (x > castleX - 3 && x < castleX + castleW + 3) continue;
    const y = hs[x];
    if (w.tile(x, y) !== T.Grass || w.tile(x, y - 1) !== T.Air) continue;
    const height = r.int(5, 11);
    for (let k = 1; k < height; k++) w.set(x, y - k, T.Trunk);
    w.set(x, y - height, T.TreeTop);
  }

  // --- cave dressing
  const floorSpot = (y0: number, y1: number): [number, number] | null => {
    for (let tries = 0; tries < 60; tries++) {
      const x = r.int(3, W - 4);
      const y = r.int(y0, y1);
      const wl = w.wall(x, y);
      if (w.tile(x, y) === T.Air && w.tile(x, y - 1) === T.Air && w.solid(x, y + 1) && wl !== WL.Brick && wl !== WL.None) return [x, y];
    }
    return null;
  };
  for (let i = 0; i < 230; i++) {
    const p = floorSpot(maxH + 4, H - 6);
    if (p) w.set(p[0], p[1], T.Urn);
  }
  for (let i = 0; i < 18; i++) {
    const p = floorSpot(maxH + 20, H - 6);
    if (p) w.set(p[0], p[1], T.Crystal);
  }
  for (let i = 0; i < 12; i++) {
    const p = floorSpot(maxH + 8, H - 8);
    if (!p) continue;
    w.set(p[0], p[1], T.Chest);
    w.chests.set(p[1] * W + p[0], fillChest(r, p[1] > 170 ? 'crypt' : 'cave'));
  }

  w.spawnX = mid;
  w.spawnY = hs[mid] - 2;
  return w;
}

// ---------------------------------------------------------------- save encoding

function rle(a: Uint8Array): string {
  const out: number[] = [];
  let i = 0;
  while (i < a.length) {
    const v = a[i];
    let n = 1;
    while (i + n < a.length && a[i + n] === v && n < 255) n++;
    out.push(n, v);
    i += n;
  }
  let s = '';
  for (let k = 0; k < out.length; k += 8192) s += String.fromCharCode(...out.slice(k, k + 8192));
  return btoa(s);
}

function unrle(b64: string, len: number): Uint8Array {
  const s = atob(b64);
  const a = new Uint8Array(len);
  let p = 0;
  for (let i = 0; i + 1 < s.length; i += 2) {
    const n = s.charCodeAt(i), v = s.charCodeAt(i + 1);
    a.fill(v, p, p + n);
    p += n;
  }
  return a;
}

export interface WorldSave {
  w: number; h: number; seed: number; tiles: string; walls: string;
  spawn: [number, number]; skyLimit: number; time: number; day: number;
  chests: [number, (Slot | null)[]][];
}

export function saveWorld(w: World): WorldSave {
  return {
    w: w.w, h: w.h, seed: w.seed, tiles: rle(w.tiles), walls: rle(w.walls),
    spawn: [w.spawnX, w.spawnY], skyLimit: w.skyLimit, time: w.time, day: w.day,
    chests: [...w.chests.entries()],
  };
}

export function loadWorld(s: WorldSave): World {
  const w = new World(s.w, s.h, s.seed);
  w.tiles = unrle(s.tiles, s.w * s.h);
  w.walls = unrle(s.walls, s.w * s.h);
  w.spawnX = s.spawn[0];
  w.spawnY = s.spawn[1];
  w.skyLimit = s.skyLimit;
  w.time = s.time;
  w.day = s.day;
  w.chests = new Map(s.chests);
  return w;
}
