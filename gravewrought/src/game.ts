// Simulation: player, enemies, projectiles, drops, mining, building, crafting.

import {
  TILE, VW, VH, DAY, T, WL, TILES, WALLS, ITEMS, ENEMIES, RECIPES, STATION_TILE, STATION_NAME, URN_LOOT,
  weaponStats, slotName, slotColor, type Slot, type Recipe, type Station, type ItemDef, type WeaponStats,
} from './defs';
import { World, generateWorld, saveWorld, loadWorld, rollPrefix, rollLoot, CHEST_SLOTS, type WorldSave } from './world';
import { RNG, clamp, aabb } from './util';
import { input } from './input';
import { audio, type Mood } from './audio';

export interface Ent { x: number; y: number; w: number; h: number; vx: number; vy: number; ground: boolean; }
export interface Enemy extends Ent { type: string; hp: number; dir: number; t: number; flash: number; cd: number; }
export interface Proj {
  x: number; y: number; vx: number; vy: number; kind: 'arrow' | 'knife' | 'shard' | 'bone';
  dmg: number; kb: number; crit: number; friendly: boolean; life: number; grav: number; rot: number;
}
export interface Drop extends Ent { item: Slot; age: number; }
export interface Part { x: number; y: number; vx: number; vy: number; life: number; col: string; grav: number; }
export interface FText { x: number; y: number; text: string; col: string; life: number; }
export interface RecipeRow { r: Recipe; ok: boolean; why: string; }

const TILE_COL: Record<number, string> = {
  [T.Dirt]: '#4b3a3e', [T.Grass]: '#55603f', [T.Stone]: '#585c72', [T.Brick]: '#6b6080', [T.Wood]: '#6e4c36',
  [T.Platform]: '#6e4c36', [T.IronOre]: '#b08368', [T.SilverOre]: '#c9d3e6', [T.BloodOre]: '#c0182f',
  [T.Gloom]: '#2e2b47', [T.Trunk]: '#3a2e2b', [T.TreeTop]: '#3a2e2b', [T.Urn]: '#6e6a84', [T.Crystal]: '#ff6b7c',
};

const STEPPED = 2, HIT_X = 1;

function boxSolid(w: World, x: number, y: number, bw: number, bh: number): boolean {
  const x0 = Math.floor(x / TILE), x1 = Math.floor((x + bw - 0.01) / TILE);
  const y0 = Math.floor(y / TILE), y1 = Math.floor((y + bh - 0.01) / TILE);
  for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (w.solid(tx, ty)) return true;
  return false;
}

/** Axis-separated tile collision. Returns HIT_X / STEPPED flags. */
export function moveEnt(w: World, e: Ent, drop = false, step = false): number {
  let flags = 0;
  if (e.vx !== 0) {
    e.x += e.vx;
    const ty0 = Math.floor(e.y / TILE), ty1 = Math.floor((e.y + e.h - 0.01) / TILE);
    const tx = e.vx > 0 ? Math.floor((e.x + e.w - 0.01) / TILE) : Math.floor(e.x / TILE);
    let blocked = false, onlyFeet = true;
    for (let ty = ty0; ty <= ty1; ty++) {
      if (w.solid(tx, ty)) { blocked = true; if (ty !== ty1) onlyFeet = false; }
    }
    if (blocked) {
      let stepped = false;
      if (step && e.ground && onlyFeet) {
        const ny = ty1 * TILE - e.h;
        if (!boxSolid(w, e.x, ny, e.w, e.h)) { e.y = ny; stepped = true; flags |= STEPPED; }
      }
      if (!stepped) {
        e.x = e.vx > 0 ? tx * TILE - e.w : (tx + 1) * TILE;
        e.vx = 0;
        flags |= HIT_X;
      }
    }
  }
  const prevBottom = e.y + e.h;
  e.y += e.vy;
  e.ground = false;
  const tx0 = Math.floor(e.x / TILE), tx1 = Math.floor((e.x + e.w - 0.01) / TILE);
  if (e.vy > 0) {
    const ty = Math.floor((e.y + e.h - 0.01) / TILE);
    for (let tx = tx0; tx <= tx1; tx++) {
      const t = w.tile(tx, ty);
      if (TILES[t].solid || (t === T.Platform && !drop && prevBottom <= ty * TILE + 0.01)) {
        e.y = ty * TILE - e.h;
        e.vy = 0;
        e.ground = true;
        break;
      }
    }
  } else if (e.vy < 0) {
    const ty = Math.floor(e.y / TILE);
    for (let tx = tx0; tx <= tx1; tx++) {
      if (w.solid(tx, ty)) { e.y = (ty + 1) * TILE; e.vy = 0; break; }
    }
  }
  return flags;
}

export class Player implements Ent {
  x = 0; y = 0; w = 12; h = 28; vx = 0; vy = 0; ground = false;
  face = 1;
  hp = 100; maxHp = 100;
  inv: (Slot | null)[] = new Array(40).fill(null);
  armor: (Slot | null)[] = [null, null, null];
  acc: (Slot | null)[] = [null, null];
  sel = 0;
  useT = 0; useMax = 1; useItem: ItemDef | null = null; useStats: WeaponStats | null = null;
  aim = 0; hitSet = new Set<Enemy>();
  invuln = 0; dead = 0; regenT = 0; potionCd = 0; airJumps = 0; coyote = 0; fallY = 0;
  anim = 0; stepOff = 0; placeCd = 0;
  def = 0; speedMul = 1; dmgMul = 1; regenMul = 1;
  has: Record<string, boolean> = {};

  get cx(): number { return this.x + this.w / 2; }
  get cy(): number { return this.y + this.h / 2; }

  recalc(): void {
    this.def = 0;
    for (const a of this.armor) if (a) this.def += ITEMS[a.id].armor!.def;
    this.has = {};
    for (const a of this.acc) if (a) this.has[ITEMS[a.id].acc!] = true;
    this.speedMul = this.has.speed ? 1.25 : 1;
    this.dmgMul = this.has.dmg ? 1.12 : 1;
    this.regenMul = this.has.regen ? 3 : 1;
  }
  held(): Slot | null { return this.inv[this.sel]; }
  count(id: string): number {
    let n = 0;
    for (const s of this.inv) if (s && s.id === id) n += s.n;
    return n;
  }
  remove(id: string, n: number): void {
    for (let i = this.inv.length - 1; i >= 0 && n > 0; i--) {
      const s = this.inv[i];
      if (!s || s.id !== id) continue;
      const k = Math.min(n, s.n);
      s.n -= k;
      n -= k;
      if (s.n <= 0) this.inv[i] = null;
    }
  }
  /** Adds to the inventory; returns how many did not fit. */
  add(item: Slot): number {
    return addTo(this.inv, item);
  }
}

export function addTo(slots: (Slot | null)[], item: Slot): number {
  const max = ITEMS[item.id].stack;
  let n = item.n;
  if (max > 1) {
    for (const s of slots) {
      if (n <= 0) break;
      if (s && s.id === item.id && s.n < max) {
        const k = Math.min(n, max - s.n);
        s.n += k;
        n -= k;
      }
    }
  }
  for (let i = 0; i < slots.length && n > 0; i++) {
    if (!slots[i]) {
      const k = Math.min(n, max);
      slots[i] = { id: item.id, n: k, pre: item.pre };
      n -= k;
    }
  }
  return n;
}

export interface GameSave {
  v: number;
  world: WorldSave;
  player: { x: number; y: number; hp: number; maxHp: number; inv: (Slot | null)[]; armor: (Slot | null)[]; acc: (Slot | null)[]; sel: number };
}

export class Game {
  world!: World;
  p = new Player();
  enemies: Enemy[] = [];
  projs: Proj[] = [];
  drops: Drop[] = [];
  parts: Part[] = [];
  texts: FText[] = [];
  cam = { x: 0, y: 0 };
  tick = 0;
  rng = new RNG((Date.now() ^ 0x5bd1e995) >>> 0);
  mining = { x: -1, y: -1, wall: false, prog: 0, max: 1 };
  target: { x: number; y: number; ok: boolean } | null = null;

  // interface state (drawn and driven by ui.ts)
  invOpen = false;
  chest: number | null = null;
  cursor: Slot | null = null;
  craftScroll = 0;
  recipes: RecipeRow[] = [];
  msgs: { text: string; t: number }[] = [];
  help = false;
  mood: Mood = 'day';
  private warnT = 0;

  static create(seed: number): Game {
    const g = new Game();
    g.world = generateWorld(seed);
    g.placeAtSpawn();
    const p = g.p;
    p.inv[0] = { id: 'worn_sword', n: 1 };
    p.inv[1] = { id: 'crude_pick', n: 1 };
    p.inv[2] = { id: 'crude_axe', n: 1 };
    p.inv[3] = { id: 'torch', n: 8 };
    g.snapCamera();
    g.say('The castle waits. Gather deadwood, dig, and survive the night.');
    g.say('Press H for controls.');
    return g;
  }

  static load(s: GameSave): Game {
    const g = new Game();
    g.world = loadWorld(s.world);
    const p = g.p;
    Object.assign(p, { x: s.player.x, y: s.player.y, hp: s.player.hp, maxHp: s.player.maxHp, sel: s.player.sel });
    p.inv = s.player.inv;
    p.armor = s.player.armor;
    p.acc = s.player.acc;
    p.fallY = p.y;
    g.snapCamera();
    return g;
  }

  save(): GameSave {
    const p = this.p;
    // anything held on the cursor goes back to the bag so it is not lost
    if (this.cursor) {
      const left = p.add(this.cursor);
      this.cursor = left > 0 ? { ...this.cursor, n: left } : null;
    }
    return {
      v: 1,
      world: saveWorld(this.world),
      player: { x: p.x, y: p.y, hp: Math.max(1, p.hp), maxHp: p.maxHp, inv: p.inv, armor: p.armor, acc: p.acc, sel: p.sel },
    };
  }

  private placeAtSpawn(): void {
    const p = this.p;
    p.x = this.world.spawnX * TILE + 2;
    p.y = (this.world.spawnY + 2) * TILE - p.h;
    p.vx = p.vy = 0;
    p.fallY = p.y;
  }

  private snapCamera(): void {
    this.cam.x = clamp(this.p.cx - VW / 2, 0, this.world.w * TILE - VW);
    this.cam.y = clamp(this.p.cy - VH / 2 - 10, 0, this.world.h * TILE - VH);
  }

  say(text: string): void {
    this.msgs.push({ text, t: 420 });
    if (this.msgs.length > 5) this.msgs.shift();
  }

  floatText(x: number, y: number, text: string, col: string): void {
    this.texts.push({ x, y, text, col, life: 60 });
  }

  burst(x: number, y: number, col: string, n: number, speed = 1.5, grav = 0.15): void {
    for (let i = 0; i < n; i++) {
      this.parts.push({ x, y, vx: this.rng.range(-speed, speed), vy: this.rng.range(-speed * 1.4, speed * 0.4), life: this.rng.int(14, 30), col, grav });
    }
  }

  // ---------------------------------------------------------------- main step

  update(uiCaptured: boolean): void {
    this.tick++;
    const w = this.world;
    w.time++;
    if (w.time >= DAY) { w.time = 0; w.day++; this.say(`Day ${w.day} dawns.`); }
    const p = this.p;
    p.recalc();

    if (p.dead > 0) {
      p.dead--;
      if (p.dead === 0) {
        this.placeAtSpawn();
        p.hp = p.maxHp;
        p.invuln = 120;
        this.snapCamera();
      }
    } else {
      this.control();
      this.useItem(uiCaptured);
      if (p.invuln > 0) p.invuln--;
      if (p.regenT > 0) p.regenT--;
      else if (p.hp < p.maxHp && this.tick % Math.round(45 / p.regenMul) === 0) p.hp++;
    }

    this.updateEnemies();
    this.updateProjs();
    this.updateDrops();
    for (let i = this.parts.length - 1; i >= 0; i--) {
      const q = this.parts[i];
      q.vy += q.grav;
      q.x += q.vx;
      q.y += q.vy;
      if (--q.life <= 0) this.parts.splice(i, 1);
    }
    for (let i = this.texts.length - 1; i >= 0; i--) {
      const t = this.texts[i];
      t.y -= 0.5;
      if (--t.life <= 0) this.texts.splice(i, 1);
    }
    for (let i = this.msgs.length - 1; i >= 0; i--) if (--this.msgs[i].t <= 0) this.msgs.splice(i, 1);

    if (this.tick % 40 === 0) this.spawnTick();
    if (this.tick % 20 === 0) {
      this.updateMood();
      if (this.invOpen) this.refreshRecipes();
      // walking away closes a chest
      if (this.chest !== null) {
        const cx = (this.chest % w.w) * TILE + 8, cy = Math.floor(this.chest / w.w) * TILE + 8;
        if (Math.hypot(cx - p.cx, cy - p.cy) > 110) this.chest = null;
      }
    }

    const tx = clamp(p.cx - VW / 2, 0, w.w * TILE - VW);
    const ty = clamp(p.cy - VH / 2 - 10, 0, w.h * TILE - VH);
    this.cam.x += (tx - this.cam.x) * 0.18;
    this.cam.y += (ty - this.cam.y) * 0.18;
  }

  private updateMood(): void {
    const p = this.p, w = this.world;
    const tx = Math.floor(p.cx / TILE), ty = Math.floor(p.cy / TILE);
    const wl = w.wall(tx, ty);
    if (wl === WL.Brick || wl === WL.Pillar) this.mood = 'castle';
    else if (ty > w.skyLimit + 3) this.mood = 'cave';
    else this.mood = w.isNight() ? 'night' : 'day';
    audio.setMood(p.dead > 0 ? 'none' : this.mood);
  }

  // ---------------------------------------------------------------- player

  private control(): void {
    const p = this.p, w = this.world;
    const L = input.down('KeyA', 'ArrowLeft'), R = input.down('KeyD', 'ArrowRight');
    const max = 2.5 * p.speedMul;
    if (L && !R) { p.vx = Math.max(p.vx - 0.4, -max); if (p.useT === 0) p.face = -1; }
    else if (R && !L) { p.vx = Math.min(p.vx + 0.4, max); if (p.useT === 0) p.face = 1; }
    else {
      p.vx *= p.ground ? 0.72 : 0.94;
      if (Math.abs(p.vx) < 0.05) p.vx = 0;
    }

    const jp = input.hit('Space', 'KeyW', 'ArrowUp');
    const jh = input.down('Space', 'KeyW', 'ArrowUp');
    if (p.ground) { p.coyote = 6; p.airJumps = p.has.dblJump ? 1 : 0; }
    else if (p.coyote > 0) p.coyote--;
    if (jp) {
      if (p.coyote > 0) { p.vy = -6.9; p.coyote = 0; audio.sfx('jump'); }
      else if (p.airJumps > 0) {
        p.airJumps--;
        p.vy = -6.3;
        p.fallY = p.y;
        this.burst(p.cx, p.y + p.h, '#2b2d42', 8, 1.2, 0.05);
        audio.sfx('jump');
      }
    }
    if (!jh && p.vy < -2.5) p.vy = -2.5;
    const glide = !!p.has.glide && jh && p.vy > 0;
    p.vy = Math.min(p.vy + 0.32, glide ? 1.4 : 9.5);
    if (glide) p.fallY = p.y;

    const wasGround = p.ground;
    const flags = moveEnt(w, p, input.down('KeyS', 'ArrowDown'), true);
    if (flags & STEPPED) p.stepOff = TILE;
    p.stepOff *= 0.7;
    if (p.stepOff < 0.5) p.stepOff = 0;

    if (p.ground) {
      if (!wasGround) {
        const dist = (p.y - p.fallY) / TILE;
        if (dist > 24) this.hurtPlayer(Math.round((dist - 24) * 6), p.cx, true);
      }
      p.fallY = p.y;
    } else if (p.vy <= 0) p.fallY = p.y;

    p.anim += Math.abs(p.vx) * 0.11;
  }

  private consumeHeld(): void {
    const p = this.p;
    const s = p.inv[p.sel];
    if (!s) return;
    if (--s.n <= 0) p.inv[p.sel] = null;
  }

  private startSwing(s: Slot, d: ItemDef, wx: number, wy: number): void {
    const p = this.p;
    const st = weaponStats(s)!;
    p.useT = p.useMax = st.use;
    p.useItem = d;
    p.useStats = st;
    p.hitSet.clear();
    p.face = wx >= p.cx ? 1 : -1;
    p.aim = Math.atan2(wy - (p.y + 12), wx - p.cx);
  }

  private useItem(uiCaptured: boolean): void {
    const p = this.p, w = this.world;
    if (p.useT > 0) p.useT--;
    if (p.placeCd > 0) p.placeCd--;
    if (p.potionCd > 0) p.potionCd--;
    if (this.warnT > 0) this.warnT--;

    const wx = this.cam.x + input.mx, wy = this.cam.y + input.my;
    const tx = Math.floor(wx / TILE), ty = Math.floor(wy / TILE);
    const inReach = Math.hypot(tx * TILE + 8 - p.cx, ty * TILE + 8 - p.cy) <= 92;
    this.target = null;

    if (!uiCaptured && input.rClick) this.interact(tx, ty, inReach);
    if (p.useT > 0 && p.useItem) this.meleeTick();

    const s = p.held();
    const d = s ? ITEMS[s.id] : null;
    if (uiCaptured || this.cursor || !s || !d) { this.mining.prog = 0; return; }

    // --- tools: mine, chop, or knock out walls
    if (d.tool) {
      const tt = d.tool.type;
      const t = w.tile(tx, ty);
      const td = TILES[t];
      let valid = false, wallTarget = false;
      if (tt === 'hammer') { valid = w.wall(tx, ty) !== WL.None && !td.opaque; wallTarget = true; }
      else valid = t !== T.Air && td.tool === tt && Number.isFinite(td.hp);
      if (valid && inReach) this.target = { x: tx, y: ty, ok: true };
      if (!input.lmb) { this.mining.prog = 0; return; }
      if (p.useT === 0) { this.startSwing(s, d, wx, wy); audio.sfx('swing'); }
      if (!valid || !inReach) { this.mining.prog = 0; return; }
      const m = this.mining;
      if (m.x !== tx || m.y !== ty || m.wall !== wallTarget) { m.x = tx; m.y = ty; m.wall = wallTarget; m.prog = 0; }
      m.max = wallTarget ? 24 : td.hp;
      if (!wallTarget && d.tool.power < td.minPick) {
        if (this.warnT === 0) { this.say(`Your pick is too weak for ${td.name}.`); this.warnT = 240; }
        return;
      }
      m.prog += d.tool.power / 15;
      if (this.tick % 9 === 0) {
        audio.sfx('dig');
        this.burst(tx * TILE + 8, ty * TILE + 8, wallTarget ? '#3b3450' : TILE_COL[t] ?? '#6e6a84', 2, 1);
      }
      if (m.prog >= m.max) {
        m.prog = 0;
        if (wallTarget) this.breakWall(tx, ty); else this.breakTile(tx, ty);
      }
      return;
    }
    this.mining.prog = 0;

    // --- placing blocks and walls
    if (d.place !== undefined || d.placeWall !== undefined) {
      const ok = inReach && (d.place !== undefined ? this.canPlace(tx, ty, d.place) : this.canPlaceWall(tx, ty));
      if (inReach) this.target = { x: tx, y: ty, ok };
      if (input.lmb && ok && p.placeCd === 0) {
        if (d.place !== undefined) {
          w.set(tx, ty, d.place);
          if (d.place === T.Chest) w.chests.set(ty * w.w + tx, new Array(CHEST_SLOTS).fill(null));
        } else w.setWall(tx, ty, d.placeWall!);
        this.consumeHeld();
        p.placeCd = 7;
        p.useT = p.useMax = 10;
        p.useItem = null;
        p.face = wx >= p.cx ? 1 : -1;
        audio.sfx('place');
      }
      return;
    }

    // --- weapons
    if (d.wpn) {
      if (!input.lmb || p.useT > 0) return;
      const wt = d.wpn.type;
      if (wt === 'sword') { this.startSwing(s, d, wx, wy); audio.sfx('swing'); }
      else if (wt === 'whip') { this.startSwing(s, d, wx, wy); audio.sfx('whip'); }
      else if (wt === 'bow') {
        const ai = p.inv.findIndex((q) => q !== null && ITEMS[q.id].kind === 'ammo');
        if (ai < 0) {
          if (this.warnT === 0) { this.say('You have no arrows.'); this.warnT = 180; }
          return;
        }
        const ammo = p.inv[ai]!;
        this.startSwing(s, d, wx, wy);
        this.shoot('arrow', p.useStats!.dmg + (ITEMS[ammo.id].ammoDmg ?? 0), d.wpn.speed!, 0.06);
        if (--ammo.n <= 0) p.inv[ai] = null;
        audio.sfx('bow');
      } else {
        this.startSwing(s, d, wx, wy);
        this.shoot(d.icon === 'knife' ? 'knife' : 'shard', p.useStats!.dmg, d.wpn.speed!, 0.12);
        this.consumeHeld();
        audio.sfx('throw');
      }
      return;
    }

    // --- consumables
    if (input.lClick) {
      if (d.heal && p.hp < p.maxHp && p.potionCd === 0) {
        p.hp = Math.min(p.maxHp, p.hp + d.heal);
        p.potionCd = 600;
        this.floatText(p.cx, p.y - 6, `+${d.heal}`, '#7fe08a');
        this.consumeHeld();
        audio.sfx('drink');
      } else if (d.heal && p.potionCd > 0 && p.hp < p.maxHp) {
        this.say('The tonic needs a moment to settle.');
      } else if (d.life) {
        if (p.maxHp >= 300) this.say('Your body can hold no more vitae.');
        else {
          p.maxHp += d.life;
          p.hp += d.life;
          this.floatText(p.cx, p.y - 6, `+${d.life} max life`, '#ff6b8b');
          this.burst(p.cx, p.cy, '#ff6b7c', 16, 2, 0.02);
          this.consumeHeld();
          audio.sfx('life');
        }
      }
    }
  }

  private shoot(kind: Proj['kind'], dmg: number, speed: number, grav: number): void {
    const p = this.p;
    const st = p.useStats!;
    this.projs.push({
      x: p.cx + Math.cos(p.aim) * 8, y: p.y + 12 + Math.sin(p.aim) * 8,
      vx: Math.cos(p.aim) * speed, vy: Math.sin(p.aim) * speed,
      kind, dmg, kb: st.kb, crit: st.crit, friendly: true, life: 180, grav, rot: p.aim,
    });
  }

  private meleeTick(): void {
    const p = this.p;
    const wp = p.useItem!.wpn;
    const st = p.useStats;
    if (!wp || !st) return;
    const prog = 1 - p.useT / p.useMax;
    if (wp.type === 'sword') {
      const reach = wp.reach ?? 24;
      const bx = p.face > 0 ? p.cx - 2 : p.cx - reach;
      for (const e of this.enemies) {
        if (p.hitSet.has(e)) continue;
        if (aabb(bx, p.y - 10, reach + 2, p.h + 14, e.x, e.y, e.w, e.h)) { p.hitSet.add(e); this.hitEnemy(e, st, p.face, true); }
      }
    } else if (wp.type === 'whip') {
      const len = this.whipLen();
      if (len <= 0) return;
      const ox = p.cx + p.face * 2, oy = p.y + 12;
      const c = Math.cos(p.aim), sn = Math.sin(p.aim);
      for (const e of this.enemies) {
        if (p.hitSet.has(e)) continue;
        for (let d = 8; d <= len; d += 5) {
          const x = ox + c * d, y = oy + sn * d;
          if (x > e.x - 4 && x < e.x + e.w + 4 && y > e.y - 4 && y < e.y + e.h + 4) {
            p.hitSet.add(e);
            this.hitEnemy(e, st, c >= 0 ? 1 : -1, true);
            break;
          }
        }
      }
    }
    void prog;
  }

  /** Current length of the whip lash, in pixels (0 when not striking). */
  whipLen(): number {
    const p = this.p;
    const wp = p.useItem?.wpn;
    if (!wp || wp.type !== 'whip' || p.useT <= 0) return 0;
    const prog = 1 - p.useT / p.useMax;
    if (prog < 0.2) return 0;
    const k = prog < 0.5 ? (prog - 0.2) / 0.3 : 1 - (prog - 0.5) * 0.9;
    return (wp.reach ?? 60) * clamp(k, 0, 1);
  }

  private hitEnemy(e: Enemy, st: WeaponStats, dir: number, melee: boolean): void {
    const p = this.p;
    const def = ENEMIES[e.type];
    const crit = this.rng.chance(st.crit / 100);
    let dmg = st.dmg * p.dmgMul * this.rng.range(0.85, 1.15) * (crit ? 2 : 1);
    dmg = Math.max(1, Math.round(dmg - def.def * 0.5));
    e.hp -= dmg;
    e.flash = 8;
    const kb = st.kb * (1 - def.kbRes);
    e.vx = dir * kb * 0.8;
    if (!def.fly) e.vy = -kb * 0.45;
    this.floatText(e.x + e.w / 2, e.y - 4, String(dmg), crit ? '#ffae57' : '#f3eedc');
    this.burst(e.x + e.w / 2, e.y + e.h / 2, e.type === 'skeleton' ? '#d9d2b8' : e.type === 'wraith' ? '#a9c4d6' : '#8f1024', 4, 1.6);
    audio.sfx(crit ? 'crit' : 'hit');
    if (melee && p.has.leech && p.hp < p.maxHp) p.hp++;
    if (e.hp <= 0) this.killEnemy(e);
  }

  private killEnemy(e: Enemy): void {
    const i = this.enemies.indexOf(e);
    if (i >= 0) this.enemies.splice(i, 1);
    const def = ENEMIES[e.type];
    for (const [id, a, b, ch] of def.drops) {
      if (this.rng.chance(ch)) this.spawnDrop(e.x + e.w / 2, e.y + e.h / 2, { id, n: this.rng.int(a, b) });
    }
    this.burst(e.x + e.w / 2, e.y + e.h / 2, e.type === 'skeleton' ? '#d9d2b8' : e.type === 'wraith' ? '#e0f4ff' : '#5b6b55', 14, 2.2);
    audio.sfx('kill');
  }

  hurtPlayer(dmg: number, fromX: number, raw = false): void {
    const p = this.p;
    if (p.invuln > 0 || p.dead > 0) return;
    const final = raw ? dmg : Math.max(1, Math.round(dmg - p.def * 0.5));
    p.hp -= final;
    p.invuln = 45;
    p.regenT = 300;
    p.vx = (p.cx >= fromX ? 1 : -1) * 3.5;
    p.vy = -3;
    this.floatText(p.cx, p.y - 4, String(final), '#ff6b7c');
    this.burst(p.cx, p.cy, '#8f1024', 6, 1.6);
    if (p.hp <= 0) {
      p.hp = 0;
      p.dead = 240;
      p.useT = 0;
      this.invOpen = false;
      this.chest = null;
      this.burst(p.cx, p.cy, '#8f1024', 30, 3);
      this.say('You have perished. The grave will not keep you.');
      audio.sfx('die');
      audio.setMood('none');
    } else audio.sfx('hurt');
  }

  // ---------------------------------------------------------------- world edits

  private canPlace(tx: number, ty: number, tile: number): boolean {
    const w = this.world;
    if (!w.inb(tx, ty) || w.tile(tx, ty) !== T.Air) return false;
    const td = TILES[tile];
    if (td.floor) return w.solid(tx, ty + 1) || w.tile(tx, ty + 1) === T.Platform;
    const hasWall = w.wall(tx, ty) !== WL.None;
    if (tile === T.Torch) return hasWall || w.solid(tx - 1, ty) || w.solid(tx + 1, ty) || w.solid(tx, ty + 1);
    const anchored = (x: number, y: number) => { const t = w.tile(x, y); return t !== T.Air && t !== T.Trunk && t !== T.TreeTop; };
    if (!hasWall && !anchored(tx - 1, ty) && !anchored(tx + 1, ty) && !anchored(tx, ty - 1) && !anchored(tx, ty + 1)) return false;
    if (td.solid) {
      const p = this.p;
      if (aabb(tx * TILE, ty * TILE, TILE, TILE, p.x, p.y, p.w, p.h)) return false;
      for (const e of this.enemies) if (aabb(tx * TILE, ty * TILE, TILE, TILE, e.x, e.y, e.w, e.h)) return false;
    }
    return true;
  }

  private canPlaceWall(tx: number, ty: number): boolean {
    const w = this.world;
    if (!w.inb(tx, ty) || w.wall(tx, ty) !== WL.None) return false;
    if (w.tile(tx, ty) !== T.Air) return true;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (w.wall(tx + dx, ty + dy) !== WL.None || w.tile(tx + dx, ty + dy) !== T.Air) return true;
    }
    return false;
  }

  private breakWall(tx: number, ty: number): void {
    const w = this.world;
    const drop = WALLS[w.wall(tx, ty)].drop;
    w.setWall(tx, ty, WL.None);
    if (drop) this.spawnDrop(tx * TILE + 8, ty * TILE + 8, { id: drop, n: 1 });
    this.burst(tx * TILE + 8, ty * TILE + 8, '#3b3450', 5, 1.2);
    audio.sfx('break');
  }

  breakTile(tx: number, ty: number): void {
    const w = this.world;
    const t = w.tile(tx, ty);
    if (t === T.Air) return;
    const td = TILES[t];
    const key = ty * w.w + tx;
    if (t === T.Chest) {
      const c = w.chests.get(key);
      if (c && c.some((s) => s)) { this.say('Empty the chest before breaking it.'); return; }
      w.chests.delete(key);
      if (this.chest === key) this.chest = null;
    }
    w.set(tx, ty, T.Air);
    const cx = tx * TILE + 8, cy = ty * TILE + 8;
    this.burst(cx, cy, TILE_COL[t] ?? '#6e6a84', 7, 1.6);
    if (t === T.Urn) {
      audio.sfx('shatter');
      const n = this.rng.chance(0.3) ? 2 : 1;
      for (let i = 0; i < n; i++) this.spawnDrop(cx, cy, rollLoot(this.rng, URN_LOOT));
    } else {
      audio.sfx('break');
      if (td.drop) this.spawnDrop(cx, cy, { id: td.drop, n: t === T.TreeTop ? this.rng.int(2, 4) : 1 });
    }
    const above = w.tile(tx, ty - 1);
    if ((t === T.Trunk || t === T.TreeTop) && (above === T.Trunk || above === T.TreeTop)) this.breakTile(tx, ty - 1);
    else if (td.solid && TILES[above].floor && above !== T.Altar) this.breakTile(tx, ty - 1);
  }

  private interact(tx: number, ty: number, inReach: boolean): void {
    const w = this.world;
    const t = w.tile(tx, ty);
    if (!inReach) return;
    if (t === T.Chest) {
      const key = ty * w.w + tx;
      if (!w.chests.has(key)) w.chests.set(key, new Array(CHEST_SLOTS).fill(null));
      this.chest = this.chest === key ? null : key;
      if (this.chest !== null) { this.invOpen = true; this.refreshRecipes(); }
      audio.sfx('chest');
    } else if (t === T.Altar) {
      this.say('The altar is cold. Whatever it once called has not yet woken.');
    }
  }

  spawnDrop(x: number, y: number, item: Slot, thrown = 0): void {
    this.drops.push({
      x: x - 5, y: y - 5, w: 10, h: 10, vx: thrown || this.rng.range(-1, 1), vy: -2, ground: false,
      item, age: thrown ? -60 : 0,
    });
  }

  // ---------------------------------------------------------------- crafting

  refreshRecipes(): void {
    const p = this.p, w = this.world;
    const near = new Set<Station>();
    const px = Math.floor(p.cx / TILE), py = Math.floor(p.cy / TILE);
    for (let y = py - 4; y <= py + 4; y++) {
      for (let x = px - 6; x <= px + 6; x++) {
        const t = w.tile(x, y);
        for (const st of Object.keys(STATION_TILE) as Station[]) if (STATION_TILE[st] === t) near.add(st);
      }
    }
    const ok: RecipeRow[] = [], rest: RecipeRow[] = [];
    for (const r of RECIPES) {
      const hasAll = r.need.every(([id, n]) => p.count(id) >= n);
      const any = r.need.some(([id]) => p.count(id) > 0);
      const station = !r.at || near.has(r.at);
      if (hasAll && station) ok.push({ r, ok: true, why: '' });
      else if (any) rest.push({ r, ok: false, why: !station ? `Needs a ${STATION_NAME[r.at!]} nearby` : 'Missing materials' });
    }
    this.recipes = ok.concat(rest);
    this.craftScroll = clamp(this.craftScroll, 0, Math.max(0, this.recipes.length - 1));
  }

  craft(row: RecipeRow): void {
    if (!row.ok) return;
    const p = this.p;
    for (const [id, n] of row.r.need) if (p.count(id) < n) return;
    for (const [id, n] of row.r.need) p.remove(id, n);
    const item: Slot = { id: row.r.out, n: row.r.n, pre: rollPrefix(this.rng, row.r.out) };
    const left = p.add(item);
    if (left > 0) this.spawnDrop(p.cx, p.cy, { ...item, n: left });
    this.floatText(p.cx, p.y - 6, slotName(item), slotColor(item));
    audio.sfx('craft');
    this.refreshRecipes();
  }

  // ---------------------------------------------------------------- enemies

  private spawnTick(): void {
    const p = this.p, w = this.world;
    if (p.dead > 0) return;
    const night = w.isNight();
    if (this.enemies.length >= (night ? 9 : 6)) return;
    if (!this.rng.chance(night ? 0.55 : 0.35)) return;
    const px = Math.floor(p.cx / TILE), py = Math.floor(p.cy / TILE);
    const tx = px + (this.rng.chance(0.5) ? 1 : -1) * this.rng.int(22, 36);
    let ty = py + this.rng.int(-12, 12);
    if (!w.inb(tx, ty) || w.tile(tx, ty) !== T.Air || w.tile(tx, ty - 1) !== T.Air) return;
    const wl = w.wall(tx, ty);
    const surface = wl === WL.None && ty < w.skyLimit;
    let type: string;
    if (surface) {
      if (!night) return;
      type = this.rng.chance(0.7) ? 'ghoul' : 'bat';
    } else if (wl === WL.Brick || wl === WL.Pillar) {
      type = this.rng.chance(night || ty > w.skyLimit ? 0.35 : 0.1) ? 'wraith' : 'skeleton';
    } else if (ty > 185) {
      const k = this.rng.next();
      type = k < 0.3 ? 'wraith' : k < 0.7 ? 'skeleton' : 'bat';
    } else {
      type = this.rng.chance(0.45) ? 'skeleton' : 'bat';
    }
    const def = ENEMIES[type];
    if (!def.fly) {
      // settle onto the nearest floor below
      let found = false;
      for (let k = 0; k < 10; k++) {
        if (w.solid(tx, ty + 1)) { found = true; break; }
        ty++;
        if (w.tile(tx, ty) !== T.Air) break;
      }
      if (!found) return;
    }
    this.enemies.push({
      type, hp: def.hp, x: tx * TILE + (TILE - def.w) / 2, y: (ty + 1) * TILE - def.h, w: def.w, h: def.h,
      vx: 0, vy: 0, ground: false, dir: 1, t: this.rng.int(0, 100), flash: 0, cd: this.rng.int(60, 160),
    });
  }

  private updateEnemies(): void {
    const p = this.p, w = this.world;
    const sunny = w.daylight() > 0.6;
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      const def = ENEMIES[e.type];
      e.t++;
      if (e.flash > 0) e.flash--;
      const ecx = e.x + e.w / 2, ecy = e.y + e.h / 2;
      const dx = p.cx - ecx, dy = p.cy - ecy;
      const dist = Math.hypot(dx, dy);
      if (dist > 1000) { this.enemies.splice(i, 1); continue; }
      const alive = p.dead === 0;

      if (def.ghost) {
        if (alive && dist > 1) {
          e.vx += ((dx / dist) * def.speed - e.vx) * 0.04;
          e.vy += ((dy / dist) * def.speed - e.vy) * 0.04;
        }
        e.x += e.vx;
        e.y += e.vy + Math.sin(e.t * 0.07) * 0.25;
        e.dir = dx >= 0 ? 1 : -1;
      } else if (def.fly) {
        if (alive) {
          e.vx = clamp(e.vx + Math.sign(dx) * 0.07, -def.speed, def.speed);
          e.vy = clamp(e.vy + Math.sign(dy - 6) * 0.06 + Math.sin(e.t * 0.25) * 0.09, -def.speed, def.speed);
        }
        const f = moveEnt(w, e);
        if (f & HIT_X) e.vy -= 0.4;
        e.dir = e.vx >= 0 ? 1 : -1;
      } else {
        if (alive && Math.abs(dx) > 6) e.dir = dx > 0 ? 1 : -1;
        e.vx += (e.dir * def.speed - e.vx) * 0.12;
        e.vy = Math.min(e.vy + 0.32, 9.5);
        const f = moveEnt(w, e, false, true);
        if (f & HIT_X && e.ground) e.vy = -6.4;
        if (e.type === 'skeleton' && alive) {
          if (--e.cd <= 0 && dist < 230 && Math.abs(dy) < 110) {
            e.cd = this.rng.int(130, 220);
            this.projs.push({
              x: ecx, y: e.y + 8, vx: Math.sign(dx) * (1.6 + Math.abs(dx) / 55), vy: -4.2 + dy / 60,
              kind: 'bone', dmg: 12, kb: 2, crit: 0, friendly: false, life: 200, grav: 0.16, rot: 0,
            });
          }
        }
      }

      // the restless dead burn in open daylight
      if (sunny && (e.type === 'ghoul' || e.type === 'wraith') && e.t % 12 === 0) {
        const tx = Math.floor(ecx / TILE), ty = Math.floor(ecy / TILE);
        if (w.wall(tx, ty) === WL.None && ty < w.skyLimit) {
          e.hp -= 2;
          this.burst(ecx, e.y, '#c9c4b0', 2, 0.8, -0.03);
          if (e.hp <= 0) { this.killEnemy(e); continue; }
        }
      }

      if (alive && aabb(e.x, e.y, e.w, e.h, p.x, p.y, p.w, p.h)) this.hurtPlayer(def.dmg, ecx);
    }
  }

  private updateProjs(): void {
    const p = this.p, w = this.world;
    for (let i = this.projs.length - 1; i >= 0; i--) {
      const q = this.projs[i];
      q.vy += q.grav;
      q.x += q.vx;
      q.y += q.vy;
      q.rot = q.kind === 'arrow' ? Math.atan2(q.vy, q.vx) : q.rot + 0.35;
      let dead = --q.life <= 0;
      if (!dead && w.solid(Math.floor(q.x / TILE), Math.floor(q.y / TILE))) {
        dead = true;
        this.burst(q.x, q.y, '#8d8f9c', 3, 1);
      }
      if (!dead && q.friendly) {
        for (const e of this.enemies) {
          if (q.x > e.x - 3 && q.x < e.x + e.w + 3 && q.y > e.y - 3 && q.y < e.y + e.h + 3) {
            this.hitEnemy(e, { dmg: q.dmg, use: 0, kb: q.kb, crit: q.crit }, q.vx >= 0 ? 1 : -1, false);
            dead = true;
            break;
          }
        }
      } else if (!dead && p.dead === 0 && q.x > p.x && q.x < p.x + p.w && q.y > p.y && q.y < p.y + p.h) {
        this.hurtPlayer(q.dmg, q.x - q.vx * 4);
        dead = true;
      }
      if (dead) this.projs.splice(i, 1);
    }
  }

  private updateDrops(): void {
    const p = this.p, w = this.world;
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.age++;
      if (d.age > 18000) { this.drops.splice(i, 1); continue; }
      const dx = p.cx - (d.x + 5), dy = p.cy - (d.y + 5);
      const dist = Math.hypot(dx, dy);
      const wants = p.dead === 0 && d.age > 20 && dist < 60 && this.canFit(d.item);
      if (wants) {
        d.vx += (dx / dist) * 0.6;
        d.vy += (dy / dist) * 0.6;
        d.vx *= 0.85;
        d.vy *= 0.85;
        d.x += d.vx;
        d.y += d.vy;
        if (dist < 14) {
          const before = d.item.n;
          const left = p.add(d.item);
          if (left < before) {
            this.floatText(p.cx, p.y - 6 - (this.texts.length % 4) * 8, `+${before - left} ${slotName(d.item)}`, slotColor(d.item));
            audio.sfx('pickup');
            if (this.invOpen) this.refreshRecipes();
          }
          if (left <= 0) this.drops.splice(i, 1);
          else d.item.n = left;
        }
      } else {
        d.vy = Math.min(d.vy + 0.3, 8);
        moveEnt(w, d);
        d.vx *= d.ground ? 0.8 : 0.98;
      }
    }
  }

  private canFit(item: Slot): boolean {
    const max = ITEMS[item.id].stack;
    for (const s of this.p.inv) {
      if (!s) return true;
      if (max > 1 && s.id === item.id && s.n < max) return true;
    }
    return false;
  }
}
