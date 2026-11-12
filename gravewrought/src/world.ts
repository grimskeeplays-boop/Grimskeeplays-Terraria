// World storage, procedural generation and save encoding.

import { T, WL, TILES, DAY, BIOME, CHEST_LOOT, isGear, ITEMS, type Slot, type LootRow } from './defs';
import { RNG, fbm2, noise2, clamp } from './util';

export const CHEST_SLOTS = 20;

export type Zone = 'surface' | 'underground' | 'caverns' | 'depths' | 'pit';

export interface Rect { x0: number; y0: number; x1: number; y1: number; }

export class World {
  tiles: Uint8Array;
  walls: Uint8Array;
  /** Surface biome of each column. */
  biome: Uint8Array;
  spawnX = 0;
  spawnY = 0;
  /** Rows above this can receive sky light. */
  skyLimit = 0;
  cavernY = 0;
  depthsY = 0;
  pitY = 0;
  castle: Rect = { x0: 0, y0: 0, x1: 0, y1: 0 };
  time = DAY * 0.06;
  day = 1;
  chests = new Map<number, (Slot | null)[]>();

  constructor(public w: number, public h: number, public seed: number) {
    this.tiles = new Uint8Array(w * h);
    this.walls = new Uint8Array(w * h);
    this.biome = new Uint8Array(w);
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
  biomeAt(x: number): number {
    return this.biome[clamp(x, 0, this.w - 1)];
  }
  zone(y: number): Zone {
    if (y >= this.pitY) return 'pit';
    if (y >= this.depthsY) return 'depths';
    if (y >= this.cavernY) return 'caverns';
    if (y > this.skyLimit + 3) return 'underground';
    return 'surface';
  }
  inCastle(x: number, y: number): boolean {
    const c = this.castle;
    return x >= c.x0 && x <= c.x1 && y >= c.y0 && y <= c.y1;
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

/** Chest gear is left unrolled (`u`) so it can be rolled against the hunter's rank when first opened. */
function fillChest(r: RNG, tier: string): (Slot | null)[] {
  const t = CHEST_LOOT[tier];
  const slots: (Slot | null)[] = new Array(CHEST_SLOTS).fill(null);
  let i = 0;
  if (t.main.length > 0) {
    const main = r.pick(t.main);
    slots[i++] = isGear(ITEMS[main]) ? { id: main, n: 1, u: t.luck } : { id: main, n: 1 };
    if (r.chance(0.25)) {
      const second = r.pick(t.main);
      if (second !== main && isGear(ITEMS[second])) slots[i++] = { id: second, n: 1, u: t.luck };
    }
  }
  if (r.chance(t.crystal)) slots[i++] = { id: 'vitae_crystal', n: 1 };
  const n = t.main.length > 0 ? r.int(2, 4) : t.fill.length;
  const seen = new Set<string>();
  for (let k = 0; k < n; k++) {
    const s = t.main.length > 0 ? rollLoot(r, t.fill) : { id: t.fill[k][0], n: t.fill[k][1] };
    if (seen.has(s.id)) continue;
    seen.add(s.id);
    slots[i++] = s;
  }
  return slots;
}

// ---------------------------------------------------------------- generation

const CW = 12, CH = 7;

export function generateWorld(seed: number): World {
  const W = 1500, H = 450;
  const w = new World(W, H, seed);
  const r = new RNG(seed);
  const mid = W >> 1;
  const flip = r.chance(0.5) ? 1 : -1; // which side the Count's castle lies on

  // --- biomes: Ashlands | Frostfell | Hollowwood | Mirewood | Cursed Grounds (mirrored at random)
  for (let x = 0; x < W; x++) {
    const d = (x - mid) * flip + (noise2(x * 0.02, 4.2, seed + 21) - 0.5) * 26;
    w.biome[x] = d > 520 ? BIOME.Cursed : d > 190 ? BIOME.Marsh : d > -190 ? BIOME.Hollow : d > -520 ? BIOME.Frost : BIOME.Ash;
  }

  // --- surface heights, with relief that depends on the biome
  const AMP = [44, 60, 16, 34, 26];
  const amp = new Float32Array(W);
  for (let x = 0; x < W; x++) {
    let a = 0, n = 0;
    for (let k = -24; k <= 24; k += 4) { a += AMP[w.biomeAt(x + k)]; n++; }
    amp[x] = a / n;
  }
  const hs = new Int16Array(W);
  for (let x = 0; x < W; x++) {
    const v = 94 + (fbm2(x * 0.011, 3.3, seed, 4) - 0.5) * amp[x] + (noise2(x * 0.07, 9.1, seed + 5) - 0.5) * (amp[x] > 30 ? 7 : 3);
    hs[x] = clamp(Math.round(v), 58, 124);
  }
  const flatten = (cx0: number, cx1: number, level: number, margin: number) => {
    for (let x = Math.max(0, cx0 - margin); x <= Math.min(W - 1, cx1 + margin); x++) {
      const d = x < cx0 ? cx0 - x : x > cx1 ? x - cx1 : 0;
      const k = d / margin;
      hs[x] = Math.round(level + (hs[x] - level) * k * k);
    }
  };
  flatten(mid - 7, mid + 7, hs[mid], 10);

  // --- castle footprint, near the far edge of the Cursed Grounds
  const COLS = 7;
  const colH = [6, 3, 4, 6, 4, 3, 6];
  const castleW = COLS * CW;
  const castleX = Math.round(mid + flip * (W / 2 - 118) - castleW / 2);
  let avg = 0;
  for (let x = castleX; x <= castleX + castleW; x++) avg += hs[x];
  const gy = Math.round(avg / (castleW + 1));
  flatten(castleX - 2, castleX + castleW + 2, gy, 12);
  w.castle = { x0: castleX - 4, x1: castleX + castleW + 4, y0: gy - 7 * CH - 10, y1: gy + 60 };

  let maxH = 0;
  for (let x = 0; x < W; x++) maxH = Math.max(maxH, hs[x]);
  w.skyLimit = maxH + 5;
  w.cavernY = 215;
  w.depthsY = 320;
  w.pitY = 396;

  // --- base fill
  for (let x = 0; x < W; x++) {
    const b = w.biome[x];
    const soilDepth = (b === BIOME.Ash ? 13 : b === BIOME.Marsh ? 11 : 8) + Math.floor(noise2(x * 0.09, 1.7, seed + 9) * 8);
    const snowDepth = 4 + Math.floor(noise2(x * 0.12, 2.9, seed + 10) * 4);
    const gloomY = w.depthsY + Math.floor((noise2(x * 0.03, 5.5, seed + 11) - 0.5) * 16);
    const brimY = w.pitY - 6 + Math.floor((noise2(x * 0.04, 6.5, seed + 12) - 0.5) * 8);
    const soil = b === BIOME.Marsh ? T.Mud : b === BIOME.Ash ? T.Ash : T.Dirt;
    for (let y = hs[x]; y < H; y++) {
      const depth = y - hs[x];
      let t: number = T.Stone;
      let wl: number = WL.Stone;
      if (y >= H - 3) t = T.Bedrock;
      else if (y >= brimY) { t = T.Brim; wl = WL.Brim; }
      else if (y >= gloomY) { t = T.Gloom; wl = WL.Gloom; }
      else if (depth < soilDepth) { t = b === BIOME.Frost && depth < snowDepth ? T.Snow : soil; wl = WL.Dirt; }
      else {
        if (depth < soilDepth + 2) wl = WL.Dirt;
        if (b === BIOME.Frost && y < w.cavernY + 30 && fbm2(x * 0.05, y * 0.05, seed + 31, 2) > 0.52) { t = T.Ice; wl = WL.Ice; }
        else if (b === BIOME.Marsh && y < w.cavernY && fbm2(x * 0.06, y * 0.06, seed + 32, 2) > 0.6) t = T.Mud;
      }
      w.set(x, y, t);
      if (depth >= 1) w.setWall(x, y, wl);
    }
    w.set(x, hs[x], b === BIOME.Frost ? T.Snow : b === BIOME.Marsh ? T.Moss : b === BIOME.Ash ? T.Ash : T.Grass);
  }

  // --- caves: winding tunnels everywhere, wide caverns lower down, one vast hollow in the Pit
  for (let x = 1; x < W - 1; x++) {
    const pitTop = w.pitY + 8 + noise2(x * 0.03, 7.7, seed + 41) * 12;
    const pitBottom = H - 9 - noise2(x * 0.05, 8.8, seed + 42) * 8;
    for (let y = hs[x] + 6; y < H - 4; y++) {
      const n = fbm2(x * 0.035, y * 0.05, seed + 7, 3);
      const big = fbm2(x * 0.018, y * 0.03, seed + 13, 3);
      let open = Math.abs(n - 0.5) < 0.03;
      if (y > hs[x] + 22) open = open || big > (y >= w.cavernY && y < w.depthsY ? 0.66 : 0.7);
      if (y > pitTop && y < pitBottom) open = fbm2(x * 0.03, y * 0.07, seed + 43, 2) < 0.6;
      if (open) w.set(x, y, T.Air);
    }
  }
  // entrances from the surface
  for (let i = 0; i < 16; i++) {
    let x = r.int(20, W - 20);
    if (Math.abs(x - mid) < 16 || (x > castleX - 12 && x < castleX + castleW + 12)) continue;
    let y = hs[x];
    const len = r.int(16, 40);
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
        else if (t === T.Air && solid >= 7) {
          const wl = w.wall(x, y);
          w.set(x, y, wl === WL.Brim ? T.Brim : wl === WL.Gloom ? T.Gloom : wl === WL.Ice ? T.Ice : T.Stone);
        }
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
  scatter(300, 100, 310, 26, T.Dirt, [T.Stone]);
  scatter(220, 70, 150, 8, T.Stone, [T.Dirt, T.Mud, T.Ash]);
  scatter(620, 80, 320, 12, T.IronOre, [T.Stone, T.Dirt, T.Mud, T.Ash, T.Ice]);
  scatter(380, w.cavernY - 10, w.pitY - 4, 9, T.SilverOre, [T.Stone, T.Gloom, T.Ice]);
  scatter(280, w.depthsY, w.pitY + 4, 8, T.BloodOre, [T.Gloom, T.Brim]);
  scatter(260, w.pitY, H - 5, 8, T.NightOre, [T.Brim]);
  scatter(260, w.pitY - 4, H - 5, 10, T.Ember, [T.Brim]);

  // --- brick rooms: the building block of the castle and the crypts
  const room = (rx: number, ry: number) => {
    for (let x = rx; x <= rx + CW; x++) {
      for (let y = ry; y <= ry + CH; y++) {
        const border = x === rx || x === rx + CW || y === ry || y === ry + CH;
        w.set(x, y, border ? T.Brick : T.Air);
        w.setWall(x, y, WL.Brick);
      }
    }
  };
  const putChest = (x: number, y: number, tier: string) => {
    w.set(x, y, T.Chest);
    w.chests.set(y * W + x, fillChest(r, tier));
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
      if (free(x)) putChest(x, fy, tier);
    }
  };

  // --- the Count's castle
  for (let x = castleX; x <= castleX + castleW; x++) {
    for (let y = gy - 60; y < gy; y++) { w.set(x, y, T.Air); w.setWall(x, y, WL.None); }
    for (let y = gy + 1; y <= gy + 3; y++) w.set(x, y, T.Brick);
  }
  for (let c = 0; c < COLS; c++) for (let rr = 0; rr < colH[c]; rr++) room(castleX + c * CW, gy - (rr + 1) * CH);
  for (let c = 0; c < COLS; c++) {
    const rx = castleX + c * CW;
    for (let rr = 0; rr < colH[c]; rr++) {
      const ry = gy - (rr + 1) * CH;
      if (c + 1 < COLS && rr < colH[c + 1]) {
        for (let y = ry + CH - 3; y <= ry + CH - 1; y++) w.set(rx + CW, y, T.Air);
        for (let y = ry + 1; y <= ry + CH - 1; y++) { w.setWall(rx + CW - 1, y, WL.Pillar); w.setWall(rx + CW + 1, y, WL.Pillar); }
      }
      if (rr + 1 < colH[c]) {
        const gx = rr % 2 === 0 ? rx + 2 : rx + CW - 4;
        for (let x = gx; x <= gx + 2; x++) w.set(x, ry, T.Platform);
        for (let x = gx; x <= gx + 2; x++) w.set(x, ry + CH - 3, T.Platform);
      }
      if (r.chance(0.6)) {
        const wx = rx + 6;
        for (let x = wx - 1; x <= wx + 1; x++) for (let y = ry + 2; y <= ry + 3; y++) w.setWall(x, y, WL.None);
        w.setWall(wx, ry + 1, WL.None);
      }
    }
    const top = gy - colH[c] * CH;
    if (colH[c] === 6) {
      for (let k = 0; k <= CW / 2; k++) {
        for (let x = rx + k; x <= rx + CW - k; x++) { w.set(x, top - 1 - k, T.Brick); w.setWall(x, top - 1 - k, WL.Brick); }
      }
    } else {
      for (let x = rx; x <= rx + CW; x++) if ((x - rx) % 2 === 0) w.set(x, top - 1, T.Brick);
    }
  }
  for (let y = gy - 3; y <= gy - 1; y++) { w.set(castleX, y, T.Air); w.set(castleX + castleW, y, T.Air); }
  for (let c = 0; c < COLS; c++) {
    for (let rr = 0; rr < colH[c]; rr++) {
      const top = rr === colH[c] - 1;
      furnish(castleX + c * CW, gy - (rr + 1) * CH, 'castle', top ? 0.9 : 0.2);
    }
  }
  // the throne hall: top of the central keep
  {
    const ax = castleX + 3 * CW + 6, ay = gy - 5 * CH - 1;
    for (let x = ax - 2; x <= ax + 2; x++) if (w.tile(x, ay) !== T.Air) { w.chests.delete(ay * W + x); w.set(x, ay, T.Air); }
    w.set(ax, ay, T.Altar);
    w.set(ax - 2, ay, T.Candelabra);
    w.set(ax + 2, ay, T.Candelabra);
  }
  for (let i = 0; i < 36; i++) {
    const c = r.int(0, COLS - 1);
    const x = castleX + c * CW + r.int(0, CW);
    const y = gy - colH[c] * CH - r.int(0, 1);
    if (w.tile(x, y) === T.Brick && w.tile(x, y - 1) === T.Air) w.set(x, y, T.Air);
  }
  // catacombs: a shaft under the keep with two burial halls
  {
    const sx = castleX + 3 * CW + 5;
    const depth = 44;
    for (let x = sx; x <= sx + 2; x++) w.set(x, gy, T.Platform);
    for (let y = gy + 1; y <= gy + depth; y++) {
      for (let x = sx - 1; x <= sx + 3; x++) {
        const edge = x === sx - 1 || x === sx + 3;
        w.set(x, y, edge ? T.Brick : (y - gy) % 4 === 0 ? T.Platform : T.Air);
        w.setWall(x, y, WL.Brick);
      }
    }
    for (const [off, cols] of [[20, 3], [44, 5]] as const) {
      const hy = gy + off;
      const hx = sx + 1 - Math.floor((CW * cols) / 2);
      for (let c = 0; c < cols; c++) room(hx + c * CW, hy);
      for (let c = 0; c + 1 < cols; c++) for (let y = hy + CH - 3; y <= hy + CH - 1; y++) w.set(hx + (c + 1) * CW, y, T.Air);
      for (let x = sx; x <= sx + 2; x++) { w.set(x, hy, T.Platform); w.set(x, hy + CH - 3, T.Platform); }
      for (let c = 0; c < cols; c++) furnish(hx + c * CW, hy, 'castle', c === (cols >> 1) ? 0 : 0.8);
    }
  }

  // --- the Order's outpost at the spawn point
  {
    const oy = hs[mid];
    for (let x = mid - 6; x <= mid + 6; x++) {
      for (let y = oy - 8; y < oy; y++) w.set(x, y, T.Air);
      w.set(x, oy, T.Wood);
      w.set(x, oy - 6, T.Wood);
    }
    for (let x = mid - 5; x <= mid + 5; x++) for (let y = oy - 5; y < oy; y++) w.setWall(x, y, WL.Wood);
    for (let y = oy - 5; y < oy - 3; y++) { w.set(mid - 6, y, T.Wood); w.set(mid + 6, y, T.Wood); }
    w.set(mid + 3, oy - 1, T.Board);
    putChest(mid - 4, oy - 1, 'outpost');
    w.set(mid - 2, oy - 3, T.Torch);
    w.set(mid + 2, oy - 3, T.Torch);
  }

  // --- ruined watchtowers
  for (let i = 0; i < 7; i++) {
    const x0 = r.int(40, W - 50);
    if (Math.abs(x0 - mid) < 40 || (x0 > castleX - 40 && x0 < castleX + castleW + 40)) continue;
    const ty = hs[x0 + 3];
    for (let x = x0; x <= x0 + 6; x++) {
      const inside = x > x0 && x < x0 + 6;
      for (let y = ty - 16; y < ty; y++) { w.set(x, y, T.Air); w.setWall(x, y, inside && y >= ty - 12 ? WL.Brick : WL.None); }
      for (let y = ty; y <= ty + 8; y++) {
        const below = w.solid(x, y) && y > ty + 1;
        w.set(x, y, T.Brick);
        if (below) break;
      }
    }
    for (let y = ty - 12; y < ty; y++) { w.set(x0, y, T.Brick); w.set(x0 + 6, y, T.Brick); }
    const door = r.chance(0.5) ? x0 : x0 + 6;
    for (let y = ty - 3; y < ty; y++) w.set(door, y, T.Air);
    for (let x = x0 + 1; x <= x0 + 5; x++) { w.set(x, ty - 4, T.Platform); w.set(x, ty - 8, T.Platform); w.set(x, ty - 12, x === x0 + 3 ? T.Platform : T.Brick); }
    for (let x = x0; x <= x0 + 6; x += 2) w.set(x, ty - 13, T.Brick);
    putChest(x0 + 2, ty - 9, w.biomeAt(x0) === BIOME.Hollow ? 'surface' : 'cave');
    w.set(x0 + 4, ty - 9, T.Urn);
  }

  // --- buried crypts and Pit vaults
  for (let i = 0; i < 30; i++) {
    const rx = r.int(16, W - 16 - CW);
    const ry = r.int(maxH + 24, H - 22);
    if (rx > castleX - 40 && rx < castleX + castleW + 40 && ry < gy + 70) continue;
    room(rx, ry);
    for (let y = ry + CH - 3; y <= ry + CH - 1; y++) { w.set(rx, y, T.Air); w.set(rx + CW, y, T.Air); }
    furnish(rx, ry, ry >= w.pitY - 8 ? 'pit' : ry >= w.depthsY ? 'deep' : 'crypt', 1);
  }

  // --- trees, graves and marsh flowers
  const treeGap: [number, number][] = [[3, 8], [4, 9], [3, 7], [9, 18], [6, 12]];
  for (let x = 4; x < W - 4;) {
    const b = w.biome[x];
    x += r.int(treeGap[b][0], treeGap[b][1]);
    if (x >= W - 4) break;
    if (Math.abs(x - mid) < 9) continue;
    if (x > castleX - 3 && x < castleX + castleW + 3) continue;
    const y = hs[x];
    const ground = w.tile(x, y);
    if (!TILES[ground].solid || ground === T.Brick || ground === T.Wood || w.tile(x, y - 1) !== T.Air) continue;
    const bb = w.biome[x];
    const height = bb === BIOME.Ash ? r.int(2, 4) : bb === BIOME.Frost ? r.int(4, 7) : r.int(5, 11);
    let clear = true;
    for (let k = 1; k <= height; k++) if (w.tile(x, y - k) !== T.Air) clear = false;
    if (!clear) continue;
    for (let k = 1; k < height; k++) w.set(x, y - k, T.Trunk);
    w.set(x, y - height, T.TreeTop);
  }
  for (let x = 6; x < W - 6; x++) {
    const b = w.biome[x], y = hs[x];
    if (w.tile(x, y - 1) !== T.Air || !w.solid(x, y) || Math.abs(x - mid) < 9) continue;
    if (b === BIOME.Cursed && r.chance(0.22)) w.set(x, y - 1, T.Gravestone);
    else if (b === BIOME.Hollow && r.chance(0.02)) w.set(x, y - 1, T.Gravestone);
    else if (b === BIOME.Marsh && r.chance(0.13)) w.set(x, y - 1, T.Bloom);
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
  for (let i = 0; i < 760; i++) {
    const p = floorSpot(maxH + 4, H - 6);
    if (p) w.set(p[0], p[1], T.Urn);
  }
  for (let i = 0; i < 56; i++) {
    const p = floorSpot(maxH + 20, H - 6);
    if (p) w.set(p[0], p[1], T.Crystal);
  }
  for (let i = 0; i < 40; i++) {
    const p = floorSpot(maxH + 8, H - 8);
    if (!p) continue;
    const y = p[1];
    putChest(p[0], y, y >= w.pitY ? 'pit' : y >= w.depthsY ? 'deep' : y >= w.cavernY ? 'crypt' : 'cave');
  }
  for (let i = 0; i < 160; i++) {
    const p = floorSpot(maxH + 4, w.cavernY);
    if (p && w.biomeAt(p[0]) === BIOME.Marsh) w.set(p[0], p[1], T.Bloom);
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
  w: number; h: number; seed: number; tiles: string; walls: string; biome: string;
  spawn: [number, number]; skyLimit: number; layers: [number, number, number]; castle: Rect;
  time: number; day: number;
  chests: [number, (Slot | null)[]][];
}

export function saveWorld(w: World): WorldSave {
  return {
    w: w.w, h: w.h, seed: w.seed, tiles: rle(w.tiles), walls: rle(w.walls), biome: rle(w.biome),
    spawn: [w.spawnX, w.spawnY], skyLimit: w.skyLimit, layers: [w.cavernY, w.depthsY, w.pitY], castle: w.castle,
    time: w.time, day: w.day,
    chests: [...w.chests.entries()],
  };
}

export function loadWorld(s: WorldSave): World {
  const w = new World(s.w, s.h, s.seed);
  w.tiles = unrle(s.tiles, s.w * s.h);
  w.walls = unrle(s.walls, s.w * s.h);
  w.biome = unrle(s.biome, s.w);
  w.spawnX = s.spawn[0];
  w.spawnY = s.spawn[1];
  w.skyLimit = s.skyLimit;
  [w.cavernY, w.depthsY, w.pitY] = s.layers;
  w.castle = s.castle;
  w.time = s.time;
  w.day = s.day;
  w.chests = new Map(s.chests);
  return w;
}
