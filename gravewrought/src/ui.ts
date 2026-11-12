// Interface: HUD, hotbar, inventory, equipment, chests, crafting, journal, tooltips, title screen.

import {
  VW, VH, DAY, TILE, ITEMS, ENEMIES, SETS, RANKS, ORG_NAME, BIOME_NAME, RARITY_NAME, STAT_TEXT, CLASS_NAME,
  slotName, slotColor, slotRarity, weaponStats, weaponClass, armorDef, isGear, type Slot, type MissionDef, type StatKey,
} from './defs';
import { icons, type Ctx } from './art';
import { input } from './input';
import { audio } from './audio';
import { addTo, ACC_SLOTS, type Game, type RecipeRow } from './game';

const S = 22, STEP = 24;
const HB_X = 201, HB_Y = 332;
const EQ_X = 452, EQ_Y = HB_Y - (2 + ACC_SLOTS) * STEP;
const CHEST_Y = 196;
const CR = { x: 8, y: 62, w: 186, h: 290 };
const CR_ROW = 26, CR_ROWS = 10;
const JR = { x: 140, y: 34, w: 360, h: 284 };
const JR_ROW = 42, JR_TOP = 62;
const FONT = 'Georgia, "Times New Roman", serif';

type Kind = 'inv' | 'armor' | 'acc' | 'chest';
interface SlotRef { list: (Slot | null)[]; i: number; kind: Kind; x: number; y: number; }
interface Line { text: string; col: string; }

const invPos = (i: number): [number, number] => {
  const row = Math.floor(i / 10);
  return [HB_X + (i % 10) * STEP, row === 0 ? HB_Y : HB_Y - 6 - row * STEP];
};
const inRect = (x: number, y: number, rx: number, ry: number, rw: number, rh: number) => x >= rx && y >= ry && x < rx + rw && y < ry + rh;

function allSlots(g: Game): SlotRef[] {
  const out: SlotRef[] = [];
  const p = g.p;
  const n = g.invOpen ? 40 : 10;
  for (let i = 0; i < n; i++) { const [x, y] = invPos(i); out.push({ list: p.inv, i, kind: 'inv', x, y }); }
  if (g.invOpen) {
    for (let i = 0; i < 3; i++) out.push({ list: p.armor, i, kind: 'armor', x: EQ_X, y: EQ_Y + i * STEP });
    for (let i = 0; i < ACC_SLOTS; i++) out.push({ list: p.acc, i, kind: 'acc', x: EQ_X, y: EQ_Y + (3 + i) * STEP });
    if (g.chest !== null) {
      const c = g.world.chests.get(g.chest);
      if (c) for (let i = 0; i < c.length; i++) out.push({ list: c, i, kind: 'chest', x: HB_X + (i % 10) * STEP, y: CHEST_Y + Math.floor(i / 10) * STEP });
    }
  }
  return out;
}

function slotAt(g: Game, mx: number, my: number): SlotRef | null {
  for (const r of allSlots(g)) if (inRect(mx, my, r.x, r.y, S, S)) return r;
  return null;
}

function overPanel(g: Game, mx: number, my: number): boolean {
  if (inRect(mx, my, HB_X - 4, HB_Y - 4, 246, 30)) return true;
  if (g.journal && inRect(mx, my, JR.x, JR.y, JR.w, JR.h)) return true;
  if (!g.invOpen) return false;
  if (inRect(mx, my, HB_X - 6, 250, 250, 108)) return true;
  if (inRect(mx, my, EQ_X - 6, EQ_Y - 22, 36, VH - EQ_Y + 20)) return true;
  if (inRect(mx, my, CR.x, CR.y, CR.w, CR.h)) return true;
  if (g.chest !== null && inRect(mx, my, HB_X - 6, 178, 250, 68)) return true;
  return false;
}

function accepts(r: SlotRef, s: Slot): boolean {
  const d = ITEMS[s.id];
  if (r.kind === 'armor') return d.armor?.slot === r.i;
  if (r.kind === 'acc') return d.kind === 'acc' && !r.list.some((a, j) => j !== r.i && a && a.id === s.id);
  return true;
}

function clickSlot(g: Game, r: SlotRef): void {
  const cur = g.cursor, s = r.list[r.i];
  if (cur && !accepts(r, cur)) return;
  if (!cur) {
    if (!s) return;
    g.cursor = s;
    r.list[r.i] = null;
  } else if (!s) {
    r.list[r.i] = cur;
    g.cursor = null;
  } else if (s.id === cur.id && ITEMS[s.id].stack > 1) {
    const k = Math.min(cur.n, ITEMS[s.id].stack - s.n);
    s.n += k;
    cur.n -= k;
    if (cur.n <= 0) g.cursor = null;
  } else {
    r.list[r.i] = cur;
    g.cursor = s;
  }
  audio.sfx('click');
}

function equip(g: Game, r: SlotRef): boolean {
  const s = r.list[r.i];
  if (!s) return false;
  const d = ITEMS[s.id], p = g.p;
  if (d.armor) {
    const old = p.armor[d.armor.slot];
    p.armor[d.armor.slot] = s;
    r.list[r.i] = old;
    return true;
  }
  if (d.kind === 'acc') {
    if (p.acc.some((a) => a && a.id === s.id)) return false;
    const free = p.acc.findIndex((a) => !a);
    const j = free >= 0 ? free : 0;
    const old = p.acc[j];
    p.acc[j] = s;
    r.list[r.i] = old;
    return true;
  }
  return false;
}

function moveTo(r: SlotRef, dest: (Slot | null)[]): void {
  const s = r.list[r.i];
  if (!s) return;
  const left = addTo(dest, s);
  if (left <= 0) r.list[r.i] = null;
  else s.n = left;
}

function rightClickSlot(g: Game, r: SlotRef): void {
  const cur = g.cursor, s = r.list[r.i];
  if (cur) {
    // drop a single item from the held stack
    if (!accepts(r, cur)) return;
    if (!s) r.list[r.i] = { ...cur, n: 1 };
    else if (s.id === cur.id && s.n < ITEMS[s.id].stack) s.n++;
    else return;
    if (--cur.n <= 0) g.cursor = null;
    audio.sfx('click');
    return;
  }
  if (!s) return;
  if (r.kind === 'armor' || r.kind === 'acc') moveTo(r, g.p.inv);
  else if (r.kind === 'inv' && equip(g, r)) { /* equipped */ }
  else if (s.n > 1) {
    const half = Math.ceil(s.n / 2);
    g.cursor = { ...s, n: half };
    s.n -= half;
  } else {
    g.cursor = s;
    r.list[r.i] = null;
  }
  audio.sfx('click');
}

function quickMove(g: Game, r: SlotRef): void {
  if (r.kind === 'inv') {
    const chest = g.chest !== null ? g.world.chests.get(g.chest) : undefined;
    if (chest) moveTo(r, chest);
    else equip(g, r);
  } else moveTo(r, g.p.inv);
  audio.sfx('click');
}

function craftRowAt(g: Game, mx: number, my: number): RecipeRow | null {
  if (!g.invOpen || !inRect(mx, my, CR.x + 2, CR.y + 20, CR.w - 4, CR_ROWS * CR_ROW)) return null;
  const i = Math.floor((my - CR.y - 20) / CR_ROW) + g.craftScroll;
  return g.recipes[i] ?? null;
}

const claimRect = (i: number): [number, number, number, number] => [JR.x + JR.w - 66, JR.y + JR_TOP + i * JR_ROW + 10, 54, 16];

function missionAt(g: Game, mx: number, my: number): MissionDef | null {
  if (!g.journal) return null;
  const list = g.missions();
  for (let i = 0; i < list.length; i++) {
    const [x, y, w, h] = claimRect(i);
    if (inRect(mx, my, x, y, w, h)) return list[i];
  }
  return null;
}

/** Handles interface input. Returns true when the mouse belongs to the interface this step. */
export function uiUpdate(g: Game): boolean {
  const p = g.p;
  const mx = input.mx, my = input.my;
  if (input.hit('KeyM')) audio.toggleMute();
  if (input.hit('KeyH')) g.help = !g.help;
  if (p.dead > 0) return true;

  const closeBag = () => {
    g.invOpen = false;
    g.chest = null;
    if (g.cursor) {
      const left = p.add(g.cursor);
      if (left > 0) g.spawnDrop(p.cx, p.cy, { ...g.cursor, n: left }, p.face * 3);
      g.cursor = null;
    }
  };
  if (input.hit('Escape')) {
    if (g.help) g.help = false;
    else if (g.journal) g.journal = false;
    else if (g.invOpen) closeBag();
  }
  if (input.hit('KeyJ')) {
    g.journal = !g.journal;
    if (g.journal) closeBag();
    audio.sfx('click');
  }
  if (input.hit('KeyE', 'Tab')) {
    if (g.invOpen) closeBag();
    else { g.invOpen = true; g.journal = false; g.refreshRecipes(); }
    audio.sfx('click');
  }
  for (let i = 0; i < 10; i++) if (input.hit(`Digit${(i + 1) % 10}`)) p.sel = i;

  const over = overPanel(g, mx, my);
  if (input.wheel !== 0) {
    if (g.invOpen && inRect(mx, my, CR.x, CR.y, CR.w, CR.h)) {
      g.craftScroll = Math.max(0, Math.min(Math.max(0, g.recipes.length - CR_ROWS), g.craftScroll + input.wheel));
    } else if (p.useT === 0) p.sel = (p.sel + input.wheel + 10) % 10;
  }

  if (g.journal && input.lClick) {
    const m = missionAt(g, mx, my);
    if (m) g.claim(m);
    if (over) return true;
  }

  const r = slotAt(g, mx, my);
  let changed = false;
  if (g.invOpen) {
    if (r && input.lClick) { if (input.clickShift && !g.cursor) quickMove(g, r); else clickSlot(g, r); changed = true; }
    else if (r && input.rClick) { rightClickSlot(g, r); changed = true; }
    else if (input.lClick) {
      const row = craftRowAt(g, mx, my);
      if (row) g.craft(row);
      else if (!over && g.cursor) {
        g.spawnDrop(p.cx, p.cy, g.cursor, (mx + g.cam.x >= p.cx ? 1 : -1) * 3);
        g.cursor = null;
        return true;
      }
    }
  } else if (r && input.lClick) {
    p.sel = r.i;
  }
  if (changed) g.refreshRecipes();
  return over || g.cursor !== null;
}

// ---------------------------------------------------------------- drawing

function txt(c: Ctx, s: string, x: number, y: number, col: string, size = 7, align: CanvasTextAlign = 'left', bold = false): void {
  c.font = `${bold ? 'bold ' : ''}${size}px ${FONT}`;
  c.textAlign = align;
  c.fillStyle = 'rgba(0,0,0,0.85)';
  c.fillText(s, x + 0.5, y + 0.5);
  c.fillStyle = col;
  c.fillText(s, x, y);
  c.textAlign = 'left';
}

function panel(c: Ctx, x: number, y: number, w: number, h: number): void {
  c.fillStyle = 'rgba(16,13,24,0.93)';
  c.fillRect(x, y, w, h);
  c.fillStyle = '#5a4a2a';
  c.fillRect(x, y, w, 1); c.fillRect(x, y + h - 1, w, 1); c.fillRect(x, y, 1, h); c.fillRect(x + w - 1, y, 1, h);
  c.fillStyle = '#2a2438';
  c.fillRect(x + 1, y + 1, w - 2, 1); c.fillRect(x + 1, y + h - 2, w - 2, 1); c.fillRect(x + 1, y + 1, 1, h - 2); c.fillRect(x + w - 2, y + 1, 1, h - 2);
  c.fillStyle = '#c9a227';
  for (const [px, py] of [[x, y], [x + w - 2, y], [x, y + h - 2], [x + w - 2, y + h - 2]]) c.fillRect(px, py, 2, 2);
}

function bar(c: Ctx, x: number, y: number, w: number, h: number, frac: number, back: string, fill: string, lit: string): void {
  c.fillStyle = back;
  c.fillRect(x, y, w, h);
  const fw = Math.round(w * Math.max(0, Math.min(1, frac)));
  c.fillStyle = fill;
  c.fillRect(x, y, fw, h);
  c.fillStyle = lit;
  c.fillRect(x, y, fw, Math.max(1, Math.round(h / 4)));
}

function drawSlot(c: Ctx, x: number, y: number, s: Slot | null, selected = false, ghost = ''): void {
  c.fillStyle = selected ? 'rgba(52,42,30,0.95)' : 'rgba(26,22,36,0.92)';
  c.fillRect(x, y, S, S);
  const rar = s && isGear(ITEMS[s.id]) ? slotRarity(s) : 0;
  c.fillStyle = selected ? '#e8c84a' : '#4a4060';
  c.fillRect(x, y, S, 1); c.fillRect(x, y + S - 1, S, 1); c.fillRect(x, y, 1, S); c.fillRect(x + S - 1, y, 1, S);
  if (s) {
    if (rar > 0) {
      // a coloured corner marks rolled rarity at a glance
      c.fillStyle = slotColor(s);
      c.fillRect(x + S - 5, y + 1, 4, 1); c.fillRect(x + S - 2, y + 1, 1, 4);
    }
    c.drawImage(icons[s.id], x + 3, y + 3);
    if (s.n > 1) txt(c, String(s.n), x + S - 2, y + S - 2, '#e8e4d8', 6, 'right');
  } else if (ghost) {
    c.globalAlpha = 0.18;
    c.drawImage(icons[ghost], x + 3, y + 3);
    c.globalAlpha = 1;
  }
}

function tooltipLines(g: Game, s: Slot): Line[] {
  const d = ITEMS[s.id];
  const out: Line[] = [{ text: slotName(s), col: slotColor(s) }];
  const grey = '#b8b2a4', white = '#e8e4d8', green = '#9fe8a8';
  if (s.u !== undefined) { out.push({ text: 'Unidentified', col: grey }); return out; }
  if (isGear(d)) out.push({ text: RARITY_NAME[slotRarity(s)], col: slotColor(s) });
  const st = weaponStats(s);
  if (st && d.wpn) {
    out.push({ text: `${st.dmg} ${d.tool ? 'blade' : CLASS_NAME[weaponClass(d)]} damage`, col: white });
    const u = st.use;
    out.push({ text: `${u <= 14 ? 'Very fast' : u <= 18 ? 'Fast' : u <= 23 ? 'Average' : u <= 28 ? 'Slow' : 'Very slow'} speed`, col: grey });
    if (d.wpn.cost) out.push({ text: `Uses ${d.wpn.cost} spirit`, col: grey });
  }
  if (d.tool) out.push({ text: `${d.tool.power}% ${d.tool.type} power`, col: white });
  if (d.armor) out.push({ text: `${armorDef(s)} defence`, col: white });
  if (d.ammoDmg) out.push({ text: `${d.ammoDmg} arrow damage`, col: white });
  if (d.kind === 'acc') out.push({ text: 'Trinket', col: grey });
  if (d.bonus) for (const k of Object.keys(d.bonus) as StatKey[]) out.push({ text: STAT_TEXT[k](d.bonus[k]!), col: white });
  if (s.a) for (const [k, v] of s.a) out.push({ text: STAT_TEXT[k](v), col: green });
  if (d.armor) {
    const set = SETS[d.armor.set];
    const worn = g.p.armor.filter((a) => a && ITEMS[a.id].armor!.set === d.armor!.set).length;
    out.push({ text: `${set.name} set (${worn}/3): ${set.text}`, col: worn === 3 ? '#f0d76a' : '#8a8478' });
  }
  if (d.place !== undefined || d.placeWall !== undefined) out.push({ text: 'Can be placed', col: grey });
  if (d.kind === 'mat') out.push({ text: 'Material', col: grey });
  if (d.desc) out.push({ text: d.desc, col: '#d8c890' });
  return out;
}

function drawTooltip(c: Ctx, lines: Line[], mx: number, my: number): void {
  c.font = `7px ${FONT}`;
  let w = 0;
  for (const l of lines) w = Math.max(w, c.measureText(l.text).width);
  w += 12;
  const h = lines.length * 9 + 6;
  const x = Math.max(2, Math.min(mx + 10, VW - w - 2)), y = Math.max(2, Math.min(my + 10, VH - h - 2));
  panel(c, x, y, w, h);
  lines.forEach((l, i) => txt(c, l.text, x + 5, y + 10 + i * 9, l.col, 7, 'left', i === 0));
}

function timeLabel(t: number): string {
  if (t < 0.1) return 'Morning';
  if (t < 0.4) return 'Day';
  if (t < 0.5) return 'Evening';
  if (t < 0.6) return 'Dusk';
  if (t < 0.92) return 'Night';
  return 'Dawn';
}

const ZONE_NAME: Record<string, string> = { underground: 'Underground', caverns: 'Caverns', depths: 'The Depths', pit: 'The Pit' };

function rewardText(m: MissionDef): string {
  return m.reward.map(([id, n]) => (n > 1 ? `${n} ${ITEMS[id].name}` : ITEMS[id].name)).join(', ');
}

function drawJournal(c: Ctx, g: Game): void {
  const rank = RANKS[g.rank];
  panel(c, JR.x, JR.y, JR.w, JR.h);
  txt(c, ORG_NAME, JR.x + JR.w / 2, JR.y + 16, '#c9a227', 11, 'center', true);
  txt(c, `Hunter rank: ${rank.name}`, JR.x + 12, JR.y + 33, '#f0d76a', 8, 'left', true);
  const last = g.rank === RANKS.length - 1;
  if (!last) {
    bar(c, JR.x + 12, JR.y + 39, 150, 6, g.renown / rank.need, '#241c10', '#c9a227', '#f0d76a');
    txt(c, `Renown ${Math.min(g.renown, rank.need)} / ${rank.need}`, JR.x + 168, JR.y + 45, '#b8b2a4', 6);
    const next = RANKS[g.rank + 1];
    const hint = g.rank === 4 ? 'Destroy Count Dracula to earn the final rank.' : `Next: ${next.name} unlocks ${next.unlock}.`;
    txt(c, hint, JR.x + 12, JR.y + 56, '#8a8478', 6);
  } else {
    txt(c, 'The Count is destroyed. The Order has nothing more to ask of you.', JR.x + 12, JR.y + 48, '#b8b2a4', 7);
  }
  const list = g.missions();
  const hover = missionAt(g, input.mx, input.my);
  list.forEach((m, i) => {
    const y = JR.y + JR_TOP + i * JR_ROW;
    c.fillStyle = 'rgba(255,255,255,0.035)';
    c.fillRect(JR.x + 8, y, JR.w - 16, JR_ROW - 4);
    const have = g.missionProgress(m);
    const done = have >= m.n;
    txt(c, m.title, JR.x + 14, y + 11, done ? '#7fe08a' : '#e8e4d8', 8, 'left', true);
    txt(c, m.text, JR.x + 14, y + 21, '#b8b2a4', 6);
    txt(c, `Reward: ${rewardText(m)} · ${m.renown} renown`, JR.x + 14, y + 31, '#d8c890', 6);
    txt(c, `${have} / ${m.n}`, JR.x + JR.w - 74, y + 21, done ? '#7fe08a' : '#b8b2a4', 7, 'right');
    const [bx, by, bw, bh] = claimRect(i);
    c.fillStyle = done ? (hover === m ? '#8a6d14' : '#5a4a2a') : '#221d2c';
    c.fillRect(bx, by, bw, bh);
    c.fillStyle = done ? '#f0d76a' : '#3a3448';
    c.fillRect(bx, by, bw, 1); c.fillRect(bx, by + bh - 1, bw, 1); c.fillRect(bx, by, 1, bh); c.fillRect(bx + bw - 1, by, 1, bh);
    txt(c, m.kind === 'bring' ? 'Deliver' : 'Claim', bx + bw / 2, by + 11, done ? '#f6e7a8' : '#5a5468', 7, 'center', true);
  });
  if (list.length === 0 && !last) txt(c, 'No missions remain at this rank.', JR.x + 14, JR.y + JR_TOP + 14, '#8a8478', 7);
  txt(c, 'J or Esc to close', JR.x + JR.w - 10, JR.y + JR.h - 8, '#6a6478', 6, 'right');
}

export function drawUI(c: Ctx, g: Game): void {
  const p = g.p, w = g.world;
  const mx = input.mx, my = input.my;

  // life and spirit
  panel(c, 8, 8, 132, 15);
  bar(c, 11, 11, 126, 9, p.hp / p.maxHp, '#2a0a12', '#b3122d', '#ff5a6e');
  c.fillStyle = 'rgba(0,0,0,0.45)';
  for (let v = 20; v < p.maxHp; v += 20) c.fillRect(11 + Math.round((126 * v) / p.maxHp), 11, 1, 9);
  txt(c, `${Math.ceil(p.hp)} / ${p.maxHp}`, 74, 18.5, '#f3eedc', 7, 'center', true);
  panel(c, 8, 24, 92, 9);
  bar(c, 10, 26, 88, 5, p.spirit / p.maxSpirit, '#10122a', '#4a5ad8', '#9aa8ff');
  txt(c, RANKS[g.rank].name, 10, 43, '#f0d76a', 7, 'left', true);
  let ly = 52;
  if (p.def > 0) { txt(c, `Defence ${p.def}${p.setName ? ` · ${p.setName} set` : ''}`, 10, ly, '#b8b2a4', 6); ly += 8; }
  if (p.potionCd > 0) txt(c, `Tonic ready in ${Math.ceil(p.potionCd / 60)}s`, 10, ly, '#b8b2a4', 6);

  // clock and place
  const tt = w.time / DAY;
  const tx = Math.floor(p.cx / TILE), ty = Math.floor(p.cy / TILE);
  const zone = w.zone(ty);
  txt(c, `Day ${w.day} · ${timeLabel(tt)}`, VW - 8, 15, '#e8e4d8', 7, 'right');
  txt(c, zone === 'surface' ? BIOME_NAME[w.biomeAt(tx)] : ZONE_NAME[zone], VW - 8, 25, '#b8b2a4', 6, 'right');
  if (audio.muted) txt(c, 'Muted (M)', VW - 8, 34, '#b8b2a4', 6, 'right');

  // event banner and boss bar
  if (g.event) {
    const e = g.event;
    const label = e.type === 'crimson' ? 'Crimson Moon' : e.type === 'fog' ? 'Grave Fog' : `Legion Assault  ${e.kills} / ${e.goal}`;
    txt(c, label, VW / 2, 16, e.type === 'fog' ? '#c8ccd8' : '#ff5a6e', 9, 'center', true);
  }
  const boss = g.boss;
  if (boss) {
    const def = ENEMIES[boss.type];
    txt(c, def.name, VW / 2, 32, '#f3eedc', 9, 'center', true);
    panel(c, VW / 2 - 122, 36, 244, 10);
    bar(c, VW / 2 - 120, 38, 240, 6, boss.hp / def.hp, '#2a0a12', '#8f1024', '#ff5a6e');
  }

  // messages
  g.msgs.forEach((m, i) => {
    c.globalAlpha = Math.min(1, m.t / 60);
    const base = g.invOpen || g.journal ? 8 : 300;
    const y = g.invOpen || g.journal ? base + i * 10 : base - (g.msgs.length - 1 - i) * 10;
    txt(c, m.text, g.invOpen || g.journal ? 150 : 10, y + (g.invOpen || g.journal ? 4 : 0), '#e8dcb8', 7);
  });
  c.globalAlpha = 1;

  // panels
  if (g.invOpen) {
    panel(c, HB_X - 6, 250, 250, 108);
    panel(c, EQ_X - 6, EQ_Y - 22, 36, VH - EQ_Y + 20);
    txt(c, 'Worn', EQ_X + S / 2 - 1, EQ_Y - 8, '#c9a227', 7, 'center', true);
    if (g.chest !== null) {
      panel(c, HB_X - 6, 178, 250, 68);
      txt(c, 'Chest', HB_X, 191, '#c9a227', 7, 'left', true);
    }
  }
  const ghosts = ['iron_helm', 'iron_plate', 'iron_greaves', 'blood_ring', 'raven_charm', 'moon_locket', 'wolf_boots'];
  for (const r of allSlots(g)) {
    const sel = r.kind === 'inv' && r.i === p.sel;
    const ghost = r.kind === 'armor' ? ghosts[r.i] : r.kind === 'acc' ? ghosts[3 + r.i] : '';
    drawSlot(c, r.x, r.y, r.list[r.i], sel, ghost);
    if (r.kind === 'inv' && r.i < 10) txt(c, String((r.i + 1) % 10), r.x + 2, r.y + 7, sel ? '#e8c84a' : '#6a6080', 5);
  }
  if (!g.invOpen) {
    const held = p.held();
    if (held) txt(c, slotName(held), VW / 2, HB_Y - 6, slotColor(held), 7, 'center');
  }

  // crafting
  let hoverRow: RecipeRow | null = null;
  if (g.invOpen) {
    panel(c, CR.x, CR.y, CR.w, CR.h);
    txt(c, 'Crafting', CR.x + 7, CR.y + 13, '#c9a227', 8, 'left', true);
    if (g.recipes.length === 0) txt(c, 'Gather materials to see recipes.', CR.x + 7, CR.y + 32, '#8a8478', 6);
    hoverRow = craftRowAt(g, mx, my);
    for (let k = 0; k < CR_ROWS; k++) {
      const row = g.recipes[k + g.craftScroll];
      if (!row) break;
      const y = CR.y + 20 + k * CR_ROW;
      if (row === hoverRow) { c.fillStyle = row.ok ? 'rgba(201,162,39,0.18)' : 'rgba(255,255,255,0.05)'; c.fillRect(CR.x + 3, y, CR.w - 6, CR_ROW - 1); }
      c.globalAlpha = row.ok ? 1 : 0.4;
      c.drawImage(icons[row.r.out], CR.x + 7, y + 4);
      const out: Slot = { id: row.r.out, n: row.r.n };
      txt(c, row.r.n > 1 ? `${ITEMS[row.r.out].name} ×${row.r.n}` : ITEMS[row.r.out].name, CR.x + 28, y + 10, row.ok ? slotColor(out) : '#b8b2a4', 7);
      const need = row.r.need.map(([id, n]) => `${n} ${ITEMS[id].name}`).join(', ');
      txt(c, need, CR.x + 28, y + 20, '#9a9488', 6);
      c.globalAlpha = 1;
    }
    if (g.recipes.length > CR_ROWS) {
      const trackH = CR_ROWS * CR_ROW;
      const barH = Math.max(12, (trackH * CR_ROWS) / g.recipes.length);
      const barY = CR.y + 20 + ((trackH - barH) * g.craftScroll) / (g.recipes.length - CR_ROWS);
      c.fillStyle = '#5a4a2a';
      c.fillRect(CR.x + CR.w - 5, barY, 2, barH);
    }
  }

  if (g.journal) drawJournal(c, g);

  // tooltips and the held stack
  if (g.cursor) {
    c.drawImage(icons[g.cursor.id], Math.round(mx - 8), Math.round(my - 8));
    if (g.cursor.n > 1) txt(c, String(g.cursor.n), mx + 9, my + 9, '#e8e4d8', 6, 'right');
  } else if (g.invOpen || my > HB_Y - 4) {
    const r = slotAt(g, mx, my);
    const s = r ? r.list[r.i] : null;
    if (s) drawTooltip(c, tooltipLines(g, s), mx, my);
    else if (hoverRow) {
      const lines = tooltipLines(g, { id: hoverRow.r.out, n: hoverRow.r.n });
      if (isGear(ITEMS[hoverRow.r.out])) lines.splice(1, 1, { text: 'Rarity and bonus stats are rolled when crafted', col: '#b8b2a4' });
      if (!hoverRow.ok) lines.push({ text: hoverRow.why, col: '#ff8a8a' });
      else lines.push({ text: 'Click to craft', col: '#7fe08a' });
      drawTooltip(c, lines, mx, my);
    }
  }

  if (p.dead > 0) {
    const a = Math.min(1, (240 - p.dead) / 60);
    c.fillStyle = `rgba(40,0,6,${0.55 * a})`;
    c.fillRect(0, 0, VW, VH);
    c.globalAlpha = a;
    txt(c, 'You Have Perished', VW / 2, 170, '#c0182f', 26, 'center', true);
    txt(c, `Rising again in ${Math.ceil(p.dead / 60)}…`, VW / 2, 194, '#e8e4d8', 8, 'center');
    c.globalAlpha = 1;
  }

  if (g.help) drawHelp(c);
}

const HELP: [string, string][] = [
  ['A / D', 'Walk'],
  ['Space or W', 'Jump (hold for height)'],
  ['S', 'Drop through platforms'],
  ['Left mouse', 'Use held item: swing, mine, place, shoot, cast'],
  ['Right mouse', 'Open chests and the dispatch board · equip or split stacks'],
  ['1 – 0, wheel', 'Choose a hotbar slot'],
  ['E or Tab', 'Open bag, equipment and crafting'],
  ['J', "Hunter's journal: rank and missions"],
  ['Shift + click', 'Quick-move between bag and chest'],
  ['M', 'Mute sound'],
  ['H', 'Show or hide this page'],
];

function drawHelp(c: Ctx): void {
  const x = 150, y = 40, w = 340, h = 60 + HELP.length * 13 + 56;
  panel(c, x, y, w, h);
  txt(c, 'How to Play', x + w / 2, y + 20, '#c9a227', 12, 'center', true);
  HELP.forEach(([k, v], i) => {
    txt(c, k, x + 16, y + 42 + i * 13, '#e8c84a', 7, 'left', true);
    txt(c, v, x + 92, y + 42 + i * 13, '#e8e4d8', 7);
  });
  const ty = y + 50 + HELP.length * 13;
  txt(c, 'Complete missions in the journal to earn renown. Each new rank unlocks better crafting', x + 16, ty, '#b8b2a4', 6);
  txt(c, 'and lets rarer gear appear. Gear rolls random bonus stats; what you wear shapes how you fight.', x + 16, ty + 10, '#b8b2a4', 6);
  txt(c, 'Crafting stations must be nearby. The outpost is safe ground. The dead walk at night.', x + 16, ty + 20, '#b8b2a4', 6);
  txt(c, 'Your world saves automatically.', x + 16, ty + 30, '#b8b2a4', 6);
}

// ---------------------------------------------------------------- title

export const TITLE_BUTTONS = [
  { id: 'new', label: 'New World', x: 250, y: 214, w: 140, h: 22 },
  { id: 'continue', label: 'Continue', x: 250, y: 242, w: 140, h: 22 },
];

export function titleButtonAt(mx: number, my: number, hasSave: boolean): string | null {
  for (const b of TITLE_BUTTONS) {
    if (b.id === 'continue' && !hasSave) continue;
    if (inRect(mx, my, b.x, b.y, b.w, b.h)) return b.id;
  }
  return null;
}

export function drawTitle(c: Ctx, hasSave: boolean, t: number): void {
  c.fillStyle = 'rgba(6,4,14,0.35)';
  c.fillRect(0, 0, VW, VH);
  const grad = c.createLinearGradient(0, 96, 0, 140);
  grad.addColorStop(0, '#f6e7a8');
  grad.addColorStop(0.5, '#c9a227');
  grad.addColorStop(1, '#7a5512');
  c.font = `bold 50px ${FONT}`;
  c.textAlign = 'center';
  c.fillStyle = '#12060a';
  c.fillText('GRAVEWROUGHT', VW / 2 + 2, 140 + 2);
  c.fillStyle = '#5a0a16';
  c.fillText('GRAVEWROUGHT', VW / 2 + 1, 140 + 1);
  c.fillStyle = grad;
  c.fillText('GRAVEWROUGHT', VW / 2, 140);
  c.textAlign = 'left';
  txt(c, 'hunt · forge · end the night', VW / 2, 160, '#d8c8c0', 10, 'center');

  const hover = titleButtonAt(input.mx, input.my, hasSave);
  for (const b of TITLE_BUTTONS) {
    if (b.id === 'continue' && !hasSave) continue;
    panel(c, b.x, b.y, b.w, b.h);
    if (hover === b.id) { c.fillStyle = 'rgba(201,162,39,0.2)'; c.fillRect(b.x + 2, b.y + 2, b.w - 4, b.h - 4); }
    txt(c, b.label, b.x + b.w / 2, b.y + 15, hover === b.id ? '#f6e7a8' : '#e8e4d8', 10, 'center', true);
  }
  if (hasSave) txt(c, 'A new world replaces your saved one.', VW / 2, 280, '#8a8478', 6, 'center');
  c.globalAlpha = 0.6 + 0.3 * Math.sin(t * 0.05);
  txt(c, 'Keyboard and mouse', VW / 2, 330, '#b8b2a4', 7, 'center');
  c.globalAlpha = 1;
  txt(c, 'v0.2 prototype', VW - 6, VH - 6, '#6a6478', 6, 'right');
}
