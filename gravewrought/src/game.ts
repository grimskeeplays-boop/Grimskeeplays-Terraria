// Simulation: player, enemies, projectiles, drops, mining, building, crafting,
// hunter ranks and missions, world events, and the fight with the Count.

import {
  TILE, VW, VH, DAY, T, WL, TILES, WALLS, ITEMS, ENEMIES, SPAWNS, RECIPES, STATION_TILE, STATION_NAME, URN_LOOT, CHEST_LOOT,
  SETS, RANKS, MISSIONS, weaponStats, armorDef, rollGear, isGear, slotName, slotColor,
  type Slot, type Recipe, type Station, type ItemDef, type WeaponStats, type Bonus, type StatKey, type MissionDef, type SpawnRow,
} from './defs';
import { World, generateWorld, saveWorld, loadWorld, rollLoot, CHEST_SLOTS, type WorldSave } from './world';
import { RNG, clamp, aabb } from './util';
import { input } from './input';
import { audio, type Mood } from './audio';

export interface Ent { x: number; y: number; w: number; h: number; vx: number; vy: number; ground: boolean; }
export interface Enemy extends Ent { type: string; hp: number; dir: number; t: number; flash: number; cd: number; mode: number; tx: number; ty: number; }
export type ProjKind = 'arrow' | 'knife' | 'shard' | 'bone' | 'bolt' | 'fire' | 'orb';
export interface Proj {
  x: number; y: number; vx: number; vy: number; kind: ProjKind; col: string;
  dmg: number; kb: number; crit: number; friendly: boolean; life: number; grav: number; rot: number;
}
export interface Drop extends Ent { item: Slot; age: number; }
export interface Part { x: number; y: number; vx: number; vy: number; life: number; col: string; grav: number; }
export interface FText { x: number; y: number; text: string; col: string; life: number; }
export interface RecipeRow { r: Recipe; ok: boolean; why: string; }
export type EventType = 'crimson' | 'fog' | 'legion';
export interface WorldEvent { type: EventType; kills: number; goal: number; }

const TILE_COL: Record<number, string> = {
  [T.Dirt]: '#4b3a3e', [T.Grass]: '#55603f', [T.Stone]: '#585c72', [T.Brick]: '#6b6080', [T.Wood]: '#6e4c36',
  [T.Platform]: '#6e4c36', [T.IronOre]: '#b08368', [T.SilverOre]: '#c9d3e6', [T.BloodOre]: '#c0182f',
  [T.Gloom]: '#2e2b47', [T.Trunk]: '#3a2e2b', [T.TreeTop]: '#3a2e2b', [T.Urn]: '#6e6a84', [T.Crystal]: '#ff6b7c',
  [T.Snow]: '#dfe8f0', [T.Ice]: '#9ad4ee', [T.Mud]: '#3f3a2c', [T.Moss]: '#4f6a3a', [T.Ash]: '#5a5658',
  [T.Brim]: '#4a1f1c', [T.NightOre]: '#9a7cf0', [T.Ember]: '#ff7a1a', [T.Bloom]: '#9fd07a', [T.Gravestone]: '#7a7e90',
};

const STEPPED = 2, HIT_X = 1;
const BIOME_KEY = ['hollow', 'frost', 'marsh', 'ash', 'cursed'];
const EVENT_TEXT: Record<EventType, [string, string]> = {
  crimson: ['A Crimson Moon rises. The dead are restless tonight.', 'The Crimson Moon sets.'],
  fog: ['A grave fog rolls in. The dead walk beneath it, even by day.', 'The fog lifts.'],
  legion: ["The Count's legion marches on you!", 'The legion withdraws with the dawn.'],
};

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

export const ACC_SLOTS = 4;

export class Player implements Ent {
  x = 0; y = 0; w = 12; h = 28; vx = 0; vy = 0; ground = false;
  face = 1;
  hp = 100; baseHp = 100; maxHp = 100;
  spirit = 60; maxSpirit = 60;
  inv: (Slot | null)[] = new Array(40).fill(null);
  armor: (Slot | null)[] = [null, null, null];
  acc: (Slot | null)[] = new Array(ACC_SLOTS).fill(null);
  sel = 0;
  useT = 0; useMax = 1; useItem: ItemDef | null = null; useStats: WeaponStats | null = null;
  aim = 0; hitSet = new Set<Enemy>();
  invuln = 0; dead = 0; regenT = 0; potionCd = 0; airJumps = 0; coyote = 0; fallY = 0;
  anim = 0; stepOff = 0; placeCd = 0;
  /** Totals from everything worn: armour, trinkets, set bonus. */
  bonus: Bonus = {};
  def = 0; speedMul = 1; setName = '';
  has: Record<string, boolean> = {};

  get cx(): number { return this.x + this.w / 2; }
  get cy(): number { return this.y + this.h / 2; }

  recalc(): void {
    const b: Bonus = {};
    const add = (src: Bonus | undefined) => {
      if (src) for (const k of Object.keys(src) as StatKey[]) b[k] = (b[k] ?? 0) + src[k]!;
    };
    const addRolled = (s: Slot) => { if (s.a) for (const [k, v] of s.a) b[k] = (b[k] ?? 0) + v; };
    this.has = {};
    this.def = 0;
    this.setName = '';
    const sets: Record<string, number> = {};
    for (const a of this.armor) {
      if (!a) continue;
      const d = ITEMS[a.id];
      this.def += armorDef(a);
      sets[d.armor!.set] = (sets[d.armor!.set] ?? 0) + 1;
      add(d.bonus);
      addRolled(a);
    }
    for (const a of this.acc) {
      if (!a) continue;
      const d = ITEMS[a.id];
      if (d.acc) this.has[d.acc] = true;
      add(d.bonus);
      addRolled(a);
    }
    for (const k of Object.keys(sets)) {
      if (sets[k] < 3) continue;
      add(SETS[k].bonus);
      if (SETS[k].flag) this.has[SETS[k].flag!] = true;
      this.setName = SETS[k].name;
    }
    this.def += b.def ?? 0;
    this.bonus = b;
    this.maxHp = this.baseHp + (b.hp ?? 0);
    if (this.hp > this.maxHp) this.hp = this.maxHp;
    this.maxSpirit = 60 + (b.spirit ?? 0);
    if (this.spirit > this.maxSpirit) this.spirit = this.maxSpirit;
    this.speedMul = 1 + (b.move ?? 0) / 100;
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
      slots[i] = { ...item, n: k };
      n -= k;
    }
  }
  return n;
}

export interface GameSave {
  v: number;
  world: WorldSave;
  player: { x: number; y: number; hp: number; baseHp: number; inv: (Slot | null)[]; armor: (Slot | null)[]; acc: (Slot | null)[]; sel: number };
  rank: number; renown: number; prog: Record<string, number>; claimed: string[];
}

export const SAVE_VERSION = 2;

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

  // the hunter's standing with the Order
  rank = 0;
  renown = 0;
  prog: Record<string, number> = {};
  claimed: string[] = [];
  event: WorldEvent | null = null;

  // interface state (drawn and driven by ui.ts)
  invOpen = false;
  journal = false;
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
    p.inv[0] = { id: 'worn_sword', n: 1, r: 0, q: 1, a: [] };
    p.inv[1] = { id: 'crude_pick', n: 1 };
    p.inv[2] = { id: 'crude_axe', n: 1 };
    p.inv[3] = { id: 'torch', n: 8 };
    g.snapCamera();
    g.say('Welcome to the Order, rookie. Your missions are in the journal (J).');
    g.say('Press H for controls.');
    return g;
  }

  static load(s: GameSave): Game {
    const g = new Game();
    g.world = loadWorld(s.world);
    const p = g.p;
    Object.assign(p, { x: s.player.x, y: s.player.y, hp: s.player.hp, baseHp: s.player.baseHp, sel: s.player.sel });
    p.inv = s.player.inv;
    p.armor = s.player.armor;
    p.acc = s.player.acc;
    while (p.acc.length < ACC_SLOTS) p.acc.push(null);
    p.fallY = p.y;
    g.rank = s.rank;
    g.renown = s.renown;
    g.prog = s.prog;
    g.claimed = s.claimed;
    p.recalc();
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
      v: SAVE_VERSION,
      world: saveWorld(this.world),
      player: { x: p.x, y: p.y, hp: Math.max(1, p.hp), baseHp: p.baseHp, inv: p.inv, armor: p.armor, acc: p.acc, sel: p.sel },
      rank: this.rank, renown: this.renown, prog: this.prog, claimed: this.claimed,
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
    this.msgs.push({ text, t: 480 });
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

  get boss(): Enemy | null {
    for (const e of this.enemies) if (ENEMIES[e.type].boss) return e;
    return null;
  }

  // ---------------------------------------------------------------- main step

  update(uiCaptured: boolean): void {
    this.tick++;
    const w = this.world;
    const before = w.time / DAY;
    w.time++;
    if (w.time >= DAY) { w.time = 0; w.day++; this.say(`Day ${w.day} dawns.`); }
    this.eventClock(before, w.time / DAY);
    const p = this.p;
    p.recalc();

    if (p.dead > 0) {
      p.dead--;
      if (p.dead === 0) {
        this.placeAtSpawn();
        p.hp = p.maxHp;
        p.spirit = p.maxSpirit;
        p.invuln = 120;
        this.snapCamera();
      }
    } else {
      this.control();
      this.useItem(uiCaptured);
      if (p.invuln > 0) p.invuln--;
      if (p.regenT > 0) p.regenT--;
      else if (p.hp < p.maxHp && this.tick % Math.max(6, Math.round(45 / (1 + (p.bonus.regen ?? 0)))) === 0) p.hp++;
      if (p.spirit < p.maxSpirit && this.tick % 8 === 0) p.spirit++;
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
    const zone = w.zone(ty);
    const brick = wl === WL.Brick || wl === WL.Pillar;
    if (this.boss) this.mood = 'boss';
    else if (brick) this.mood = 'castle';
    else if (zone !== 'surface') this.mood = 'cave';
    else this.mood = w.isNight() || this.event ? 'night' : 'day';
    audio.setMood(p.dead > 0 ? 'none' : this.mood);

    if (p.dead > 0) return;
    if (zone !== 'surface') this.track('reach', 'underground');
    if (zone === 'pit') this.track('reach', 'pit');
    if (brick && w.inCastle(tx, ty)) this.track('reach', 'castle');
  }

  // ---------------------------------------------------------------- ranks and missions

  missions(): MissionDef[] {
    return MISSIONS.filter((m) => m.rank === this.rank && !this.claimed.includes(m.id));
  }

  missionProgress(m: MissionDef): number {
    if (m.kind === 'bring') return Math.min(m.n, this.p.count(m.target));
    return Math.min(m.n, this.prog[m.id] ?? 0);
  }

  track(kind: MissionDef['kind'], target: string, n = 1): void {
    for (const m of this.missions()) {
      if (m.kind !== kind || m.target !== target) continue;
      const have = this.prog[m.id] ?? 0;
      if (have >= m.n) continue;
      this.prog[m.id] = Math.min(m.n, have + n);
      if (this.prog[m.id] >= m.n) {
        this.say(`Mission complete: ${m.title}. Claim it in your journal (J).`);
        audio.sfx('craft');
      }
    }
  }

  claim(m: MissionDef): void {
    if (this.claimed.includes(m.id) || this.missionProgress(m) < m.n) return;
    const p = this.p;
    if (m.kind === 'bring') p.remove(m.target, m.n);
    this.claimed.push(m.id);
    for (const [id, n] of m.reward) {
      const item: Slot = isGear(ITEMS[id]) ? rollGear(this.rng, id, this.rank, 1) : { id, n };
      const left = p.add(item);
      if (left > 0) this.spawnDrop(p.cx, p.cy, { ...item, n: left });
      this.floatText(p.cx, p.y - 6 - (this.texts.length % 4) * 8, `+${n} ${slotName(item)}`, slotColor(item));
    }
    this.renown += m.renown;
    this.say(`${m.title}: +${m.renown} renown.`);
    audio.sfx('pickup');
    // the last promotion is earned only by destroying the Count
    while (this.rank < RANKS.length - 1 && this.renown >= RANKS[this.rank].need && (this.rank < 4 || this.claimed.includes('r4_count'))) {
      this.renown -= RANKS[this.rank].need;
      this.rank++;
      const r = RANKS[this.rank];
      this.say(`The Order promotes you to ${r.name}. Unlocked: ${r.unlock}.`);
      this.burst(p.cx, p.cy, '#f0d76a', 30, 2.6, 0.03);
      audio.sfx('rankup');
    }
    if (this.rank === RANKS.length - 1) this.renown = 0;
    if (this.invOpen) this.refreshRecipes();
  }

  // ---------------------------------------------------------------- world events

  startEvent(type: EventType): void {
    this.event = { type, kills: 0, goal: type === 'legion' ? 16 + this.rank * 4 : 0 };
    this.say(EVENT_TEXT[type][0]);
    audio.sfx('event');
  }

  private endEvent(completed: boolean): void {
    const e = this.event;
    if (!e) return;
    this.event = null;
    if (e.type === 'legion' && completed) {
      this.say("The legion breaks and scatters. The Order will hear of this.");
      const pool = CHEST_LOOT[this.rank >= 4 ? 'pit' : 'deep'].main;
      this.spawnDrop(this.p.cx, this.p.y - 10, rollGear(this.rng, this.rng.pick(pool), this.rank, 1));
      this.spawnDrop(this.p.cx, this.p.y - 10, { id: 'greater_tonic', n: 3 });
      this.track('event', 'legion');
      audio.sfx('rankup');
    } else {
      this.say(EVENT_TEXT[e.type][1]);
      if (e.type === 'crimson' && this.p.dead === 0) this.track('event', 'crimson');
    }
  }

  /** Starts and ends events as the clock passes dusk, dawn and morning. */
  private eventClock(before: number, now: number): void {
    const crossed = (t: number) => before < t && now >= t;
    const w = this.world;
    if (crossed(0.6) && !this.event && w.day >= 2) {
      const wantsMoon = this.missions().some((m) => m.id === 'r2_moon' && this.missionProgress(m) < m.n);
      const wantsLegion = this.missions().some((m) => m.id === 'r3_legion' && this.missionProgress(m) < m.n);
      if (this.rank >= 3 && this.rng.chance(wantsLegion ? 0.6 : 0.25)) this.startEvent('legion');
      else if (this.rng.chance(wantsMoon ? 0.65 : 0.3)) this.startEvent('crimson');
    }
    if (crossed(0.93) && this.event && this.event.type !== 'fog') this.endEvent(false);
    if (crossed(0.04) && !this.event && w.day >= 2 && this.rng.chance(0.2)) this.startEvent('fog');
    if (crossed(0.4) && this.event?.type === 'fog') this.endEvent(false);
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
    const st = weaponStats(s, p.bonus)!;
    p.useT = p.useMax = st.use;
    p.useItem = d;
    p.useStats = st;
    p.hitSet.clear();
    p.face = wx >= p.cx ? 1 : -1;
    p.aim = Math.atan2(wy - (p.y + 12), wx - p.cx);
  }

  private warn(text: string, wait = 180): void {
    if (this.warnT > 0) return;
    this.say(text);
    this.warnT = wait;
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
        this.warn(`Your pick is too weak for ${td.name}.`, 240);
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
        if (ai < 0) { this.warn('You have no arrows.'); return; }
        const ammo = p.inv[ai]!;
        this.startSwing(s, d, wx, wy);
        this.shoot('arrow', p.useStats!.dmg + (ITEMS[ammo.id].ammoDmg ?? 0), d.wpn.speed!, 0.06, ITEMS[ammo.id].col[0]);
        if (--ammo.n <= 0) p.inv[ai] = null;
        audio.sfx('bow');
      } else if (wt === 'magic') {
        const cost = d.wpn.cost ?? 5;
        if (p.spirit < cost) { this.warn('Your spirit is spent.', 120); return; }
        p.spirit -= cost;
        this.startSwing(s, d, wx, wy);
        this.shoot('bolt', p.useStats!.dmg, d.wpn.speed!, 0, d.col[1]);
        audio.sfx('magic');
      } else {
        this.startSwing(s, d, wx, wy);
        this.shoot(d.icon === 'knife' ? 'knife' : 'shard', p.useStats!.dmg, d.wpn.speed!, 0.12, d.col[1]);
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
        if (p.baseHp >= 300) this.say('Your body can hold no more vitae.');
        else {
          p.baseHp += d.life;
          p.hp += d.life;
          this.floatText(p.cx, p.y - 6, `+${d.life} max life`, '#ff6b8b');
          this.burst(p.cx, p.cy, '#ff6b7c', 16, 2, 0.02);
          this.consumeHeld();
          audio.sfx('life');
        }
      } else if (d.id === 'sanctified_stake') {
        this.say("Carry the stake to the altar at the top of the Count's keep.");
      }
    }
  }

  private shoot(kind: ProjKind, dmg: number, speed: number, grav: number, col: string): void {
    const p = this.p;
    const st = p.useStats!;
    this.projs.push({
      x: p.cx + Math.cos(p.aim) * 8, y: p.y + 12 + Math.sin(p.aim) * 8,
      vx: Math.cos(p.aim) * speed, vy: Math.sin(p.aim) * speed,
      kind, col, dmg, kb: st.kb, crit: st.crit, friendly: true, life: 180, grav, rot: p.aim,
    });
  }

  private meleeTick(): void {
    const p = this.p;
    const wp = p.useItem!.wpn;
    const st = p.useStats;
    if (!wp || !st) return;
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
    let dmg = st.dmg * this.rng.range(0.85, 1.15) * (crit ? 2 : 1);
    dmg = Math.max(1, Math.round(dmg - def.def * 0.5));
    e.hp -= dmg;
    e.flash = 8;
    const kb = st.kb * (1 - def.kbRes);
    if (kb > 0) {
      e.vx = dir * kb * 0.8;
      if (!def.fly) e.vy = -kb * 0.45;
    }
    this.floatText(e.x + e.w / 2, e.y - 4, String(dmg), crit ? '#ffae57' : '#f3eedc');
    this.burst(e.x + e.w / 2, e.y + e.h / 2, def.sprite === 'skeleton' ? '#d9d2b8' : def.sprite === 'wraith' ? '#a9c4d6' : '#8f1024', 4, 1.6);
    audio.sfx(crit ? 'crit' : 'hit');
    const heal = st.leech + (melee && p.has.leech ? 1 : 0);
    if (heal > 0 && p.hp < p.maxHp) p.hp = Math.min(p.maxHp, p.hp + heal);
    if (e.hp <= 0) this.killEnemy(e);
  }

  private killEnemy(e: Enemy): void {
    const i = this.enemies.indexOf(e);
    if (i >= 0) this.enemies.splice(i, 1);
    const def = ENEMIES[e.type];
    const ex = e.x + e.w / 2, ey = e.y + e.h / 2;
    for (const [id, a, b, ch] of def.drops) {
      if (this.rng.chance(ch)) this.spawnDrop(ex, ey, { id, n: this.rng.int(a, b) });
    }
    if (def.gear && this.rng.chance(def.gear[0] * (this.event?.type === 'crimson' ? 2 : 1))) {
      this.spawnDrop(ex, ey, rollGear(this.rng, this.rng.pick(def.gear[1]), this.rank));
    }
    this.burst(ex, ey, def.sprite === 'skeleton' ? '#d9d2b8' : def.sprite === 'wraith' ? '#e0f4ff' : def.pal[0], def.boss ? 60 : 14, def.boss ? 4 : 2.2);
    audio.sfx('kill');
    this.track('kill', e.type);
    if (this.event?.type === 'legion') {
      this.event.kills++;
      if (this.event.kills >= this.event.goal) this.endEvent(true);
    }
    if (def.boss) {
      for (let k = 0; k < 2; k++) this.spawnDrop(ex, ey, rollGear(this.rng, this.rng.pick(CHEST_LOOT.pit.main), this.rank, 2));
      this.say('Count Dracula is destroyed. Dawn breaks over the keep.');
      this.world.time = DAY * 0.96;
      if (this.event) this.endEvent(false);
      audio.sfx('rankup');
    }
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
      this.journal = false;
      this.chest = null;
      this.burst(p.cx, p.cy, '#8f1024', 30, 3);
      this.say('You have perished. The Order carries you back to the outpost.');
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
    if (!Number.isFinite(td.hp)) return;
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
    else if (td.solid && (TILES[above].floor || above === T.Trunk || above === T.TreeTop)) this.breakTile(tx, ty - 1);
  }

  private interact(tx: number, ty: number, inReach: boolean): void {
    const w = this.world, p = this.p;
    const t = w.tile(tx, ty);
    if (!inReach) return;
    if (t === T.Chest) {
      const key = ty * w.w + tx;
      if (!w.chests.has(key)) w.chests.set(key, new Array(CHEST_SLOTS).fill(null));
      // gear found in the world is rolled against your rank the first time you see it
      const c = w.chests.get(key)!;
      for (let i = 0; i < c.length; i++) {
        const s = c[i];
        if (s && s.u !== undefined) c[i] = rollGear(this.rng, s.id, this.rank, s.u);
      }
      this.chest = this.chest === key ? null : key;
      if (this.chest !== null) { this.invOpen = true; this.journal = false; this.refreshRecipes(); }
      audio.sfx('chest');
    } else if (t === T.Board) {
      this.journal = !this.journal;
      if (this.journal) this.invOpen = false;
      audio.sfx('click');
    } else if (t === T.Altar) {
      if (this.boss) return;
      if (this.rank >= RANKS.length - 1) this.say('The altar is cold and silent. The Count is gone.');
      else if (this.rank < 4) this.say(`The altar does not stir. The Order sends no one below the rank of ${RANKS[4].name} against the Count.`);
      else if (p.count('sanctified_stake') < 1) this.say('You need a Sanctified Stake to rouse the Count and end him.');
      else {
        p.remove('sanctified_stake', 1);
        this.enemies.push(this.makeEnemy('dracula', tx * TILE - 8, (ty - 5) * TILE));
        this.say('Count Dracula rises.');
        this.burst(tx * TILE + 8, ty * TILE, '#8f1024', 40, 3, 0.02);
        audio.sfx('event');
      }
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
      const ranked = this.rank >= r.rank;
      if (hasAll && station && ranked) ok.push({ r, ok: true, why: '' });
      else if (any) {
        const why = !ranked ? `Requires the rank of ${RANKS[r.rank].name}` : !station ? `Needs a ${STATION_NAME[r.at!]} nearby` : 'Missing materials';
        rest.push({ r, ok: false, why });
      }
    }
    this.recipes = ok.concat(rest);
    this.craftScroll = clamp(this.craftScroll, 0, Math.max(0, this.recipes.length - 1));
  }

  craft(row: RecipeRow): void {
    if (!row.ok) return;
    const p = this.p;
    for (const [id, n] of row.r.need) if (p.count(id) < n) return;
    for (const [id, n] of row.r.need) p.remove(id, n);
    const item: Slot = isGear(ITEMS[row.r.out]) ? rollGear(this.rng, row.r.out, this.rank) : { id: row.r.out, n: row.r.n };
    const left = p.add(item);
    if (left > 0) this.spawnDrop(p.cx, p.cy, { ...item, n: left });
    this.floatText(p.cx, p.y - 6, slotName(item), slotColor(item));
    audio.sfx('craft');
    this.track('craft', row.r.out, row.r.n);
    this.refreshRecipes();
  }

  // ---------------------------------------------------------------- enemies

  makeEnemy(type: string, x: number, y: number): Enemy {
    const def = ENEMIES[type];
    const tough = this.event?.type === 'crimson' && !def.boss ? 1.25 : 1;
    return {
      type, hp: Math.round(def.hp * tough), x, y, w: def.w, h: def.h, vx: 0, vy: 0, ground: false,
      dir: 1, t: this.rng.int(0, 100), flash: 0, cd: this.rng.int(60, 160), mode: 0, tx: 0, ty: 0,
    };
  }

  private spawnTable(tx: number, ty: number): SpawnRow[] | null {
    const w = this.world;
    const wl = w.wall(tx, ty);
    if (wl === WL.Brick || wl === WL.Pillar) return w.inCastle(tx, ty) ? SPAWNS.castle : SPAWNS.crypt;
    if (wl === WL.Wood) return null;
    if (wl === WL.None && ty < w.skyLimit) {
      if (Math.abs(tx - w.spawnX) < 26) return null; // the outpost is safe ground
      const dark = w.isNight() || this.event?.type === 'fog';
      const table = SPAWNS[`${BIOME_KEY[w.biomeAt(tx)]}_${dark ? 'night' : 'day'}`];
      if (!table) return null;
      return dark || this.rng.chance(0.3) ? table : null;
    }
    const zone = w.zone(ty);
    return SPAWNS[zone === 'surface' ? 'underground' : zone];
  }

  private pickFrom(table: SpawnRow[]): string {
    let tot = 0;
    for (const row of table) tot += row[1];
    let v = this.rng.next() * tot;
    for (const row of table) { v -= row[1]; if (v <= 0) return row[0]; }
    return table[0][0];
  }

  private spawnTick(): void {
    const p = this.p, w = this.world;
    if (p.dead > 0 || this.boss) return;
    const night = w.isNight();
    const ev = this.event?.type;
    const cap = ev === 'legion' ? 11 : ev === 'crimson' ? 13 : night ? 9 : 6;
    if (this.enemies.length >= cap) return;
    if (!this.rng.chance(ev === 'legion' || ev === 'crimson' ? 0.9 : night ? 0.55 : 0.35)) return;
    const px = Math.floor(p.cx / TILE), py = Math.floor(p.cy / TILE);
    const tx = px + (this.rng.chance(0.5) ? 1 : -1) * this.rng.int(22, 36);
    let ty = py + this.rng.int(-12, 12);
    const assault = (ev === 'legion' || ev === 'crimson') && w.zone(py) === 'surface';
    if (assault) {
      // event waves always find footing: take the first open ground in the column
      ty = -1;
      for (let y = py - 16; y <= py + 16; y++) {
        if (w.tile(tx, y) === T.Air && w.tile(tx, y - 1) === T.Air && w.solid(tx, y + 1)) { ty = y; break; }
      }
      if (ty < 0) return;
    }
    if (!w.inb(tx, ty) || w.tile(tx, ty) !== T.Air || w.tile(tx, ty - 1) !== T.Air) return;
    const table = ev === 'legion' && assault ? SPAWNS.legion : this.spawnTable(tx, ty);
    if (!table) return;
    const type = this.pickFrom(table);
    const def = ENEMIES[type];
    if (!def.fly) {
      // settle onto the nearest floor below
      let found = false;
      for (let k = 0; k < 12; k++) {
        if (w.solid(tx, ty + 1) || w.tile(tx, ty + 1) === T.Platform) { found = true; break; }
        ty++;
        if (w.tile(tx, ty) !== T.Air) break;
      }
      if (!found) return;
    }
    this.enemies.push(this.makeEnemy(type, tx * TILE + (TILE - def.w) / 2, (ty + 1) * TILE - def.h));
  }

  private updateDracula(e: Enemy): void {
    const p = this.p;
    const def = ENEMIES.dracula;
    const ecx = e.x + e.w / 2, ecy = e.y + e.h / 2;
    const enraged = e.hp < def.hp * 0.5;
    e.dir = p.cx >= ecx ? 1 : -1;
    e.cd--;
    if (e.mode === 0) {
      // drift to a perch above and beside the hunter
      const gx = p.cx + (ecx < p.cx ? -1 : 1) * 54, gy = p.cy - 24;
      e.vx = clamp(e.vx + clamp((gx - ecx) * 0.02, -0.22, 0.22), -def.speed, def.speed) * 0.96;
      e.vy = clamp(e.vy + clamp((gy - ecy) * 0.02, -0.22, 0.22), -def.speed, def.speed) * 0.96;
      if (e.cd <= 0) {
        const k = this.rng.next();
        if (k < 0.45) { e.mode = 2; e.cd = 34; }
        else if (k < 0.75) { e.mode = 3; e.cd = 32; e.tx = p.cx; e.ty = p.cy; }
        else { e.mode = 1; e.cd = 50; }
      }
    } else if (e.mode === 1) {
      // dissolve into bats and reform elsewhere
      e.vx *= 0.9; e.vy *= 0.9;
      if (e.cd === 25) {
        e.x = p.cx + (this.rng.chance(0.5) ? -1 : 1) * this.rng.range(70, 110) - e.w / 2;
        e.y = p.cy - this.rng.range(40, 80);
        this.burst(e.x + e.w / 2, e.y + e.h / 2, '#2a2233', 16, 2.4, 0);
        if (enraged) for (let k = 0; k < 2; k++) this.enemies.push(this.makeEnemy('bat', e.x + k * 20 - 10, e.y));
      }
      if (e.cd <= 0) { e.mode = 0; e.cd = enraged ? 50 : 80; }
    } else if (e.mode === 2) {
      // a fan of blood orbs
      e.vx *= 0.88; e.vy *= 0.88;
      if (e.cd <= 0) {
        const base = Math.atan2(p.cy - ecy, p.cx - ecx);
        const n = enraged ? 5 : 3, speed = enraged ? 3.7 : 3.1;
        for (let k = 0; k < n; k++) {
          const a = base + (k - (n - 1) / 2) * 0.24;
          this.projs.push({ x: ecx, y: ecy - 6, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, kind: 'orb', col: '#ff2a3a', dmg: 26, kb: 3, crit: 0, friendly: false, life: 170, grav: 0, rot: 0 });
        }
        audio.sfx('magic');
        e.mode = 0;
        e.cd = enraged ? 70 : 110;
      }
    } else if (e.mode === 3) {
      // rear back, then lunge through where the hunter stood
      e.vx = -e.dir * 0.6; e.vy = -0.4;
      if (e.cd <= 0) {
        const a = Math.atan2(e.ty - ecy, e.tx - ecx);
        e.vx = Math.cos(a) * 6.4; e.vy = Math.sin(a) * 6.4;
        e.mode = 4; e.cd = 34;
        audio.sfx('whip');
      }
    } else {
      this.parts.push({ x: ecx, y: ecy, vx: 0, vy: 0, life: 12, col: '#8f1024', grav: 0 });
      if (e.cd <= 0) { e.mode = 0; e.cd = enraged ? 60 : 100; e.vx *= 0.3; e.vy *= 0.3; }
    }
    e.x += e.vx;
    e.y += e.vy;
  }

  private updateEnemies(): void {
    const p = this.p, w = this.world;
    const sunny = w.daylight() > 0.6 && this.event?.type !== 'fog';
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      const def = ENEMIES[e.type];
      e.t++;
      if (e.flash > 0) e.flash--;
      const ecx = e.x + e.w / 2, ecy = e.y + e.h / 2;
      const dx = p.cx - ecx, dy = p.cy - ecy;
      const dist = Math.hypot(dx, dy);
      const alive = p.dead === 0;
      if (def.boss) {
        if (!alive || dist > 900) {
          this.enemies.splice(i, 1);
          this.say('The Count returns to his slumber. He will be waiting.');
          continue;
        }
        this.updateDracula(e);
        if (e.mode !== 1 && aabb(e.x, e.y, e.w, e.h, p.x, p.y, p.w, p.h)) this.hurtPlayer(def.dmg, ecx);
        continue;
      }
      if (dist > 1000) { this.enemies.splice(i, 1); continue; }

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
          const keep = def.shoot ? 70 : 6;
          e.vx = clamp(e.vx + Math.sign(dx) * (Math.abs(dx) > keep || !def.shoot ? 0.07 : -0.05), -def.speed, def.speed);
          e.vy = clamp(e.vy + Math.sign(dy - (def.shoot ? 40 : 6)) * 0.06 + Math.sin(e.t * 0.25) * 0.09, -def.speed, def.speed);
        }
        const f = moveEnt(w, e);
        if (f & HIT_X) e.vy -= 0.4;
        e.dir = dx >= 0 ? 1 : -1;
        if (def.shoot === 'fire' && alive && --e.cd <= 0 && dist < 240) {
          e.cd = this.rng.int(110, 180);
          const a = Math.atan2(dy, dx);
          this.projs.push({ x: ecx, y: ecy, vx: Math.cos(a) * 3.2, vy: Math.sin(a) * 3.2, kind: 'fire', col: '#ff7a1a', dmg: 22, kb: 2, crit: 0, friendly: false, life: 150, grav: 0, rot: 0 });
        }
      } else {
        if (alive && Math.abs(dx) > 6) e.dir = dx > 0 ? 1 : -1;
        if (e.ground || !def.jump) e.vx += (e.dir * def.speed - e.vx) * 0.12;
        e.vy = Math.min(e.vy + 0.32, 9.5);
        const f = moveEnt(w, e, false, true);
        if (f & HIT_X && e.ground) e.vy = -(def.jump ? Math.max(6.4, def.jump) : 6.4);
        if (alive) e.cd--;
        if (def.jump && alive && e.ground && e.cd <= 0 && dist < 120 && dist > 24) {
          // pounce
          e.cd = this.rng.int(60, 110);
          e.vy = -def.jump * 0.75;
          e.vx = e.dir * def.speed * 1.9;
        }
        if (def.shoot === 'bone' && alive && e.cd <= 0 && dist < 230 && Math.abs(dy) < 110) {
          e.cd = this.rng.int(130, 220);
          this.projs.push({
            x: ecx, y: e.y + 8, vx: Math.sign(dx) * (1.6 + Math.abs(dx) / 55), vy: -4.2 + dy / 60,
            kind: 'bone', col: '#d9d2b8', dmg: 12, kb: 2, crit: 0, friendly: false, life: 200, grav: 0.16, rot: 0,
          });
        }
      }

      // the restless dead burn in open daylight
      if (sunny && def.burns && e.t % 12 === 0) {
        const tx = Math.floor(ecx / TILE), ty = Math.floor(ecy / TILE);
        if (w.wall(tx, ty) === WL.None && ty < w.skyLimit) {
          e.hp -= 2;
          this.burst(ecx, e.y, '#c9c4b0', 2, 0.8, -0.03);
          if (e.hp <= 0) { this.enemies.splice(i, 1); this.burst(ecx, ecy, '#c9c4b0', 12, 1.6, -0.02); continue; }
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
      q.rot = q.kind === 'arrow' || q.kind === 'bolt' ? Math.atan2(q.vy, q.vx) : q.rot + 0.35;
      let dead = --q.life <= 0;
      const ghostly = q.kind === 'orb';
      if (!dead && !ghostly && w.solid(Math.floor(q.x / TILE), Math.floor(q.y / TILE))) {
        dead = true;
        this.burst(q.x, q.y, q.col, 3, 1);
      }
      if (q.kind === 'bolt' || q.kind === 'fire' || q.kind === 'orb') {
        if (this.tick % 2 === 0) this.parts.push({ x: q.x, y: q.y, vx: 0, vy: 0, life: 8, col: q.col, grav: 0 });
      }
      if (!dead && q.friendly) {
        for (const e of this.enemies) {
          if (q.x > e.x - 3 && q.x < e.x + e.w + 3 && q.y > e.y - 3 && q.y < e.y + e.h + 3) {
            this.hitEnemy(e, { dmg: q.dmg, use: 0, kb: q.kb, crit: q.crit, leech: 0 }, q.vx >= 0 ? 1 : -1, false);
            dead = true;
            break;
          }
        }
      } else if (!dead && p.dead === 0 && q.x > p.x - 2 && q.x < p.x + p.w + 2 && q.y > p.y && q.y < p.y + p.h) {
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
