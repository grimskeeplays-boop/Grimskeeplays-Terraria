// Static game data: tiles, walls, items, recipes, enemies, loot.

export const TILE = 16;
export const VW = 640;
export const VH = 360;
export const DAY = 43200; // ticks in a full day/night cycle (12 minutes at 60 Hz)

export const T = {
  Air: 0, Dirt: 1, Grass: 2, Stone: 3, Brick: 4, Wood: 5, Platform: 6,
  IronOre: 7, SilverOre: 8, BloodOre: 9, Gloom: 10, Bedrock: 11,
  Trunk: 12, TreeTop: 13, Torch: 14, Workbench: 15, Furnace: 16, Anvil: 17,
  Chest: 18, Urn: 19, Candelabra: 20, Crystal: 21, Altar: 22,
} as const;

export const WL = { None: 0, Dirt: 1, Stone: 2, Brick: 3, Wood: 4, Gloom: 5, Pillar: 6 } as const;

export type ToolType = 'pick' | 'axe' | 'hammer';

export interface TileDef {
  name: string;
  solid: boolean;
  /** Blocks light and hides the wall behind it. */
  opaque: boolean;
  hp: number;
  minPick: number;
  tool: 'pick' | 'axe';
  drop: string | null;
  light?: [number, number, number];
  anim?: boolean;
  /** Needs a solid tile underneath when placed. */
  floor?: boolean;
}

const block = (name: string, hp: number, drop: string | null, minPick = 0): TileDef =>
  ({ name, solid: true, opaque: true, hp, minPick, tool: 'pick', drop });
const object = (name: string, drop: string | null, extra: Partial<TileDef> = {}): TileDef =>
  ({ name, solid: false, opaque: false, hp: 14, minPick: 0, tool: 'pick', drop, floor: true, ...extra });

export const TILES: TileDef[] = [];
TILES[T.Air] = { name: 'Air', solid: false, opaque: false, hp: 0, minPick: 0, tool: 'pick', drop: null };
TILES[T.Dirt] = block('Grave Soil', 30, 'dirt');
TILES[T.Grass] = block('Withered Turf', 30, 'dirt');
TILES[T.Stone] = block('Stone', 60, 'stone');
TILES[T.Brick] = block('Castle Brick', 85, 'brick');
TILES[T.Wood] = block('Deadwood', 40, 'wood');
TILES[T.Platform] = { name: 'Platform', solid: false, opaque: false, hp: 16, minPick: 0, tool: 'pick', drop: 'platform' };
TILES[T.IronOre] = block('Iron Ore', 80, 'iron_ore');
TILES[T.SilverOre] = block('Silver Ore', 105, 'silver_ore', 45);
TILES[T.BloodOre] = { ...block('Bloodstone Ore', 140, 'blood_ore', 60), light: [0.45, 0.04, 0.08] };
TILES[T.Gloom] = block('Gloomrock', 120, 'gloomrock', 60);
TILES[T.Bedrock] = block('Bedrock', Infinity, null, 999);
TILES[T.Trunk] = { name: 'Dead Tree', solid: false, opaque: false, hp: 55, minPick: 0, tool: 'axe', drop: 'wood' };
TILES[T.TreeTop] = { name: 'Dead Tree', solid: false, opaque: false, hp: 55, minPick: 0, tool: 'axe', drop: 'wood' };
TILES[T.Torch] = object('Torch', 'torch', { light: [1.35, 1.12, 0.8], anim: true, floor: false, hp: 4 });
TILES[T.Workbench] = object('Workbench', 'workbench');
TILES[T.Furnace] = object('Furnace', 'furnace', { light: [1.05, 0.65, 0.35], anim: true });
TILES[T.Anvil] = object('Anvil', 'anvil');
TILES[T.Chest] = object('Chest', 'chest');
TILES[T.Urn] = object('Urn', null, { hp: 6 });
TILES[T.Candelabra] = object('Candelabra', 'candelabra', { light: [1.4, 1.16, 0.82], anim: true });
TILES[T.Crystal] = object('Vitae Crystal', 'vitae_crystal', { light: [0.8, 0.2, 0.3], hp: 30 });
TILES[T.Altar] = object('Forsaken Altar', null, { hp: Infinity, minPick: 999, light: [0.35, 0.05, 0.1] });

export interface WallDef { name: string; drop: string | null; }
export const WALLS: WallDef[] = [];
WALLS[WL.None] = { name: '', drop: null };
WALLS[WL.Dirt] = { name: 'Soil Wall', drop: null };
WALLS[WL.Stone] = { name: 'Stone Wall', drop: null };
WALLS[WL.Brick] = { name: 'Castle Brick Wall', drop: 'brick_wall' };
WALLS[WL.Wood] = { name: 'Deadwood Wall', drop: 'wood_wall' };
WALLS[WL.Gloom] = { name: 'Gloomrock Wall', drop: null };
WALLS[WL.Pillar] = { name: 'Castle Pillar', drop: 'brick_wall' };

// ---------------------------------------------------------------- items

export interface Slot { id: string; n: number; pre?: number; }

export type WeaponType = 'sword' | 'whip' | 'bow' | 'throw';

export interface ItemDef {
  id: string;
  name: string;
  kind: 'block' | 'wall' | 'mat' | 'tool' | 'weapon' | 'armor' | 'acc' | 'ammo' | 'use';
  stack: number;
  rarity: number;
  desc?: string;
  /** Icon shape plus its palette (mid, light, dark). */
  icon: string;
  col: string[];
  place?: number;
  placeWall?: number;
  tool?: { type: ToolType; power: number };
  wpn?: { type: WeaponType; dmg: number; use: number; kb: number; reach?: number; speed?: number };
  ammoDmg?: number;
  armor?: { slot: number; def: number };
  acc?: string;
  heal?: number;
  life?: number;
}

export const ITEMS: Record<string, ItemDef> = {};

function it(id: string, name: string, kind: ItemDef['kind'], icon: string, col: string[], extra: Partial<ItemDef> = {}): void {
  const single = kind === 'tool' || kind === 'armor' || kind === 'acc' || (kind === 'weapon' && extra.wpn?.type !== 'throw');
  ITEMS[id] = { id, name, kind, icon, col, stack: single ? 1 : 999, rarity: 0, ...extra };
}

const C = {
  wood: ['#6e4c36', '#96704b', '#3d2a20'],
  iron: ['#8d8f9c', '#c4c6d0', '#5b5d6b'],
  rust: ['#8a6a5a', '#b08c78', '#5a4238'],
  silver: ['#c9d3e6', '#ffffff', '#8793ad'],
  blood: ['#c0182f', '#ff6b7c', '#74091c'],
  bone: ['#d9d2b8', '#f3eedc', '#a39c84'],
  hide: ['#7a5a3f', '#96744f', '#54402e'],
  gold: ['#c9a227', '#f0d76a', '#8a6d14'],
};

// blocks & furniture
it('dirt', 'Grave Soil', 'block', 'tile', [], { place: T.Dirt });
it('stone', 'Stone', 'block', 'tile', [], { place: T.Stone });
it('brick', 'Castle Brick', 'block', 'tile', [], { place: T.Brick });
it('wood', 'Deadwood', 'block', 'log', C.wood, { place: T.Wood });
it('platform', 'Deadwood Platform', 'block', 'tile', [], { place: T.Platform });
it('gloomrock', 'Gloomrock', 'block', 'tile', [], { place: T.Gloom });
it('torch', 'Torch', 'block', 'tile', [], { place: T.Torch, desc: 'Holds back the dark' });
it('workbench', 'Workbench', 'block', 'tile', [], { place: T.Workbench, desc: 'Basic crafting station' });
it('furnace', 'Furnace', 'block', 'tile', [], { place: T.Furnace, desc: 'Smelts ore and fires brick' });
it('anvil', 'Anvil', 'block', 'tile', [], { place: T.Anvil, desc: 'For forging arms and armour' });
it('chest', 'Chest', 'block', 'tile', [], { place: T.Chest, desc: 'Stores 20 stacks' });
it('candelabra', 'Candelabra', 'block', 'tile', [], { place: T.Candelabra });
it('brick_wall', 'Castle Brick Wall', 'wall', 'wall', [], { placeWall: WL.Brick });
it('wood_wall', 'Deadwood Wall', 'wall', 'wall', [], { placeWall: WL.Wood });

// materials
it('iron_ore', 'Iron Ore', 'mat', 'ore', ['#b08368', '#dcb394', '#7a5846']);
it('silver_ore', 'Silver Ore', 'mat', 'ore', C.silver, { rarity: 1 });
it('blood_ore', 'Bloodstone Ore', 'mat', 'ore', C.blood, { rarity: 2 });
it('iron_bar', 'Iron Ingot', 'mat', 'bar', C.iron);
it('silver_bar', 'Silver Ingot', 'mat', 'bar', C.silver, { rarity: 1 });
it('blood_bar', 'Bloodstone Ingot', 'mat', 'bar', C.blood, { rarity: 2 });
it('bone', 'Bone', 'mat', 'bone', C.bone);
it('hide', 'Rotten Hide', 'mat', 'hide', C.hide);
it('bat_wing', 'Bat Wing', 'mat', 'wing', ['#3a2f47', '#5a4a6e', '#221b2b']);
it('shroud', 'Wraith Shroud', 'mat', 'shroud', ['#a9c4d6', '#e0f4ff', '#6f8ca0'], { rarity: 1 });

// tools
it('crude_pick', "Gravedigger's Pick", 'tool', 'pick', C.rust, { tool: { type: 'pick', power: 30 }, wpn: { type: 'sword', dmg: 4, use: 16, kb: 2, reach: 22 } });
it('crude_axe', "Woodsman's Hatchet", 'tool', 'axe', C.rust, { tool: { type: 'axe', power: 30 }, wpn: { type: 'sword', dmg: 5, use: 20, kb: 3, reach: 22 } });
it('mallet', 'Deadwood Mallet', 'tool', 'hammer', C.wood, { tool: { type: 'hammer', power: 30 }, wpn: { type: 'sword', dmg: 4, use: 22, kb: 4, reach: 22 }, desc: 'Breaks background walls' });
it('iron_pick', 'Iron Pickaxe', 'tool', 'pick', C.iron, { tool: { type: 'pick', power: 45 }, wpn: { type: 'sword', dmg: 6, use: 15, kb: 2, reach: 22 }, desc: 'Can mine silver' });
it('iron_axe', 'Iron Axe', 'tool', 'axe', C.iron, { tool: { type: 'axe', power: 55 }, wpn: { type: 'sword', dmg: 9, use: 19, kb: 3.5, reach: 22 } });
it('iron_hammer', 'Iron Hammer', 'tool', 'hammer', C.iron, { tool: { type: 'hammer', power: 55 }, wpn: { type: 'sword', dmg: 8, use: 21, kb: 5, reach: 22 }, desc: 'Breaks background walls' });
it('silver_pick', 'Silver Pickaxe', 'tool', 'pick', C.silver, { rarity: 1, tool: { type: 'pick', power: 60 }, wpn: { type: 'sword', dmg: 8, use: 14, kb: 2, reach: 22 }, desc: 'Can mine gloomrock and bloodstone' });
it('blood_pick', 'Bloodstone Pickaxe', 'tool', 'pick', C.blood, { rarity: 2, tool: { type: 'pick', power: 85 }, wpn: { type: 'sword', dmg: 12, use: 12, kb: 2.5, reach: 22 } });

// weapons
it('worn_sword', 'Worn Shortsword', 'weapon', 'sword', C.rust, { wpn: { type: 'sword', dmg: 9, use: 22, kb: 4, reach: 26 } });
it('bone_blade', 'Bone Blade', 'weapon', 'sword', C.bone, { wpn: { type: 'sword', dmg: 13, use: 20, kb: 4.5, reach: 28 } });
it('iron_sword', 'Iron Longsword', 'weapon', 'sword', C.iron, { wpn: { type: 'sword', dmg: 17, use: 20, kb: 5, reach: 30 } });
it('silver_saber', 'Silver Sabre', 'weapon', 'sword', C.silver, { rarity: 1, wpn: { type: 'sword', dmg: 24, use: 17, kb: 5, reach: 32 } });
it('blood_greatsword', 'Bloodstone Greatsword', 'weapon', 'sword', C.blood, { rarity: 2, wpn: { type: 'sword', dmg: 38, use: 26, kb: 7, reach: 40 } });
it('hide_lash', 'Hide Lash', 'weapon', 'whip', C.hide, { wpn: { type: 'whip', dmg: 11, use: 30, kb: 2, reach: 70 }, desc: 'Strikes at a distance' });
it('chain_whip', 'Chain Whip', 'weapon', 'whip', C.iron, { wpn: { type: 'whip', dmg: 16, use: 30, kb: 3, reach: 84 } });
it('silver_scourge', 'Silver Scourge', 'weapon', 'whip', C.silver, { rarity: 1, wpn: { type: 'whip', dmg: 23, use: 27, kb: 3, reach: 96 } });
it('crimson_lash', 'Crimson Lash', 'weapon', 'whip', C.blood, { rarity: 2, wpn: { type: 'whip', dmg: 34, use: 25, kb: 4, reach: 110 } });
it('wooden_bow', 'Deadwood Bow', 'weapon', 'bow', C.wood, { wpn: { type: 'bow', dmg: 8, use: 26, kb: 2, speed: 7 }, desc: 'Uses arrows' });
it('iron_longbow', 'Iron Longbow', 'weapon', 'bow', C.iron, { wpn: { type: 'bow', dmg: 13, use: 24, kb: 3, speed: 8.5 }, desc: 'Uses arrows' });
it('bone_shard', 'Bone Shard', 'weapon', 'shard', C.bone, { wpn: { type: 'throw', dmg: 10, use: 16, kb: 2, speed: 6.5 } });
it('throwing_knife', 'Throwing Knife', 'weapon', 'knife', C.iron, { wpn: { type: 'throw', dmg: 14, use: 14, kb: 2, speed: 8 } });

// ammo
it('arrow', 'Arrow', 'ammo', 'arrow', C.iron, { ammoDmg: 4 });
it('silver_arrow', 'Silver Arrow', 'ammo', 'arrow', C.silver, { ammoDmg: 9, rarity: 1 });

// armour
const armorSet = (key: string, names: [string, string, string], col: string[], defs: [number, number, number], rarity: number) => {
  it(`${key}_helm`, names[0], 'armor', 'helm', col, { armor: { slot: 0, def: defs[0] }, rarity });
  it(`${key}_plate`, names[1], 'armor', 'body', col, { armor: { slot: 1, def: defs[1] }, rarity });
  it(`${key}_greaves`, names[2], 'armor', 'legs', col, { armor: { slot: 2, def: defs[2] }, rarity });
};
armorSet('hide', ['Hide Hood', 'Hide Jerkin', 'Hide Leggings'], C.hide, [1, 2, 1], 0);
armorSet('iron', ['Iron Helm', 'Iron Cuirass', 'Iron Greaves'], C.iron, [2, 4, 3], 0);
armorSet('silver', ['Silver Helm', 'Silver Cuirass', 'Silver Greaves'], C.silver, [4, 6, 4], 1);
armorSet('blood', ['Bloodstone Crown', 'Bloodstone Cuirass', 'Bloodstone Greaves'], C.blood, [6, 9, 6], 2);

// accessories
it('raven_charm', 'Raven Feather Charm', 'acc', 'feather', ['#2b2d42', '#4a4e73', '#16172a'], { acc: 'dblJump', rarity: 2, desc: 'Grants a second jump' });
it('wolf_boots', 'Wolfhide Boots', 'acc', 'boots', C.hide, { acc: 'speed', rarity: 1, desc: '25% faster movement' });
it('miners_lantern', "Sexton's Lantern", 'acc', 'lantern', C.gold, { acc: 'lantern', rarity: 1, desc: 'Lights your way' });
it('blood_ring', 'Bloodstone Signet', 'acc', 'ring', C.blood, { acc: 'dmg', rarity: 2, desc: '12% more damage' });
it('leech_fang', 'Leech Fang', 'acc', 'fang', C.bone, { acc: 'leech', rarity: 3, desc: 'Melee hits restore life' });
it('moon_locket', 'Moon Locket', 'acc', 'locket', C.silver, { acc: 'regen', rarity: 2, desc: 'Life regenerates much faster' });
it('shroud_cloak', 'Shroud Cloak', 'acc', 'cloak', ['#a9c4d6', '#e0f4ff', '#6f8ca0'], { acc: 'glide', rarity: 2, desc: 'Hold jump to fall slowly' });

// consumables
it('tonic', 'Crimson Tonic', 'use', 'potion', ['#c0182f'], { heal: 50, stack: 30, desc: 'Restores 50 life' });
it('vitae_crystal', 'Vitae Crystal', 'use', 'tile', [], { life: 20, stack: 99, rarity: 2, desc: 'Permanently raises life by 20' });

/** Tile id an item's icon is drawn from, for items that share a tile's art. */
export const ICON_TILE: Record<string, number> = {
  dirt: T.Dirt, stone: T.Stone, brick: T.Brick, platform: T.Platform, gloomrock: T.Gloom, torch: T.Torch,
  workbench: T.Workbench, furnace: T.Furnace, anvil: T.Anvil, chest: T.Chest, candelabra: T.Candelabra,
  vitae_crystal: T.Crystal, brick_wall: WL.Brick, wood_wall: WL.Wood,
};

// ---------------------------------------------------------------- prefixes

export interface Prefix { name: string; dmg: number; spd: number; crit: number; kb: number; tier: number; w: number; }
export const PREFIXES: Prefix[] = [
  { name: 'Rusted', dmg: -0.15, spd: 0, crit: 0, kb: 0, tier: -1, w: 10 },
  { name: 'Dull', dmg: -0.1, spd: 0, crit: -2, kb: -0.1, tier: -1, w: 10 },
  { name: 'Brittle', dmg: 0, spd: -0.12, crit: 0, kb: 0, tier: -1, w: 8 },
  { name: 'Keen', dmg: 0, spd: 0, crit: 8, kb: 0, tier: 1, w: 12 },
  { name: 'Savage', dmg: 0.15, spd: 0, crit: 0, kb: 0, tier: 1, w: 12 },
  { name: 'Swift', dmg: 0, spd: 0.15, crit: 0, kb: 0, tier: 1, w: 12 },
  { name: 'Heavy', dmg: 0.1, spd: -0.1, crit: 0, kb: 0.3, tier: 1, w: 10 },
  { name: 'Blessed', dmg: 0.1, spd: 0.05, crit: 5, kb: 0.1, tier: 2, w: 6 },
  { name: 'Dread', dmg: 0.18, spd: 0.1, crit: 8, kb: 0.15, tier: 3, w: 3 },
];

export const RARITY_COL = ['#e8e4d8', '#7fa8ff', '#7fe08a', '#ffae57', '#ff6b8b', '#c78bff'];

export function slotName(s: Slot): string {
  const d = ITEMS[s.id];
  return s.pre !== undefined ? `${PREFIXES[s.pre].name} ${d.name}` : d.name;
}

export function slotColor(s: Slot): string {
  const d = ITEMS[s.id];
  const r = d.rarity + (s.pre !== undefined ? PREFIXES[s.pre].tier : 0);
  return r < 0 ? '#9a968c' : RARITY_COL[Math.min(r, RARITY_COL.length - 1)];
}

export interface WeaponStats { dmg: number; use: number; kb: number; crit: number; }
export function weaponStats(s: Slot): WeaponStats | null {
  const w = ITEMS[s.id].wpn;
  if (!w) return null;
  const p = s.pre !== undefined ? PREFIXES[s.pre] : null;
  return {
    dmg: Math.max(1, Math.round(w.dmg * (1 + (p?.dmg ?? 0)))),
    use: Math.max(6, Math.round(w.use * (1 - (p?.spd ?? 0)))),
    kb: w.kb * (1 + (p?.kb ?? 0)),
    crit: Math.max(0, 4 + (p?.crit ?? 0)),
  };
}

// ---------------------------------------------------------------- recipes

export type Station = 'workbench' | 'furnace' | 'anvil';
export interface Recipe { out: string; n: number; need: [string, number][]; at?: Station; }

const rc = (out: string, n: number, need: [string, number][], at?: Station): Recipe => ({ out, n, need, at });

export const RECIPES: Recipe[] = [
  rc('torch', 3, [['wood', 1]]),
  rc('workbench', 1, [['wood', 10]]),
  rc('platform', 2, [['wood', 1]]),
  rc('wood_wall', 4, [['wood', 1]], 'workbench'),
  rc('furnace', 1, [['stone', 20], ['wood', 4], ['torch', 3]], 'workbench'),
  rc('chest', 1, [['wood', 8], ['iron_bar', 2]], 'workbench'),
  rc('anvil', 1, [['iron_bar', 5]], 'workbench'),
  rc('mallet', 1, [['wood', 8]], 'workbench'),
  rc('wooden_bow', 1, [['wood', 10]], 'workbench'),
  rc('arrow', 10, [['wood', 1], ['stone', 1]], 'workbench'),
  rc('bone_blade', 1, [['bone', 12]], 'workbench'),
  rc('bone_shard', 10, [['bone', 2]], 'workbench'),
  rc('hide_lash', 1, [['hide', 6]], 'workbench'),
  rc('hide_helm', 1, [['hide', 4]], 'workbench'),
  rc('hide_plate', 1, [['hide', 8]], 'workbench'),
  rc('hide_greaves', 1, [['hide', 6]], 'workbench'),
  rc('tonic', 1, [['bat_wing', 2]], 'workbench'),
  rc('shroud_cloak', 1, [['shroud', 8]], 'workbench'),
  rc('brick_wall', 4, [['brick', 1]], 'workbench'),
  rc('candelabra', 1, [['iron_bar', 2], ['torch', 3]], 'workbench'),
  rc('brick', 1, [['stone', 2]], 'furnace'),
  rc('iron_bar', 1, [['iron_ore', 3]], 'furnace'),
  rc('silver_bar', 1, [['silver_ore', 4]], 'furnace'),
  rc('blood_bar', 1, [['blood_ore', 4]], 'furnace'),
  rc('iron_pick', 1, [['iron_bar', 8], ['wood', 3]], 'anvil'),
  rc('iron_axe', 1, [['iron_bar', 6], ['wood', 3]], 'anvil'),
  rc('iron_hammer', 1, [['iron_bar', 6], ['wood', 3]], 'anvil'),
  rc('iron_sword', 1, [['iron_bar', 7]], 'anvil'),
  rc('chain_whip', 1, [['iron_bar', 8]], 'anvil'),
  rc('iron_longbow', 1, [['iron_bar', 6]], 'anvil'),
  rc('throwing_knife', 20, [['iron_bar', 1]], 'anvil'),
  rc('iron_helm', 1, [['iron_bar', 8]], 'anvil'),
  rc('iron_plate', 1, [['iron_bar', 14]], 'anvil'),
  rc('iron_greaves', 1, [['iron_bar', 10]], 'anvil'),
  rc('silver_pick', 1, [['silver_bar', 10], ['wood', 3]], 'anvil'),
  rc('silver_saber', 1, [['silver_bar', 8]], 'anvil'),
  rc('silver_scourge', 1, [['silver_bar', 10]], 'anvil'),
  rc('silver_arrow', 15, [['silver_bar', 1], ['wood', 2]], 'anvil'),
  rc('silver_helm', 1, [['silver_bar', 10]], 'anvil'),
  rc('silver_plate', 1, [['silver_bar', 16]], 'anvil'),
  rc('silver_greaves', 1, [['silver_bar', 12]], 'anvil'),
  rc('blood_pick', 1, [['blood_bar', 12], ['wood', 3]], 'anvil'),
  rc('blood_greatsword', 1, [['blood_bar', 12]], 'anvil'),
  rc('crimson_lash', 1, [['blood_bar', 10], ['shroud', 4]], 'anvil'),
  rc('blood_helm', 1, [['blood_bar', 12]], 'anvil'),
  rc('blood_plate', 1, [['blood_bar', 20]], 'anvil'),
  rc('blood_greaves', 1, [['blood_bar', 14]], 'anvil'),
];

export const STATION_TILE: Record<Station, number> = { workbench: T.Workbench, furnace: T.Furnace, anvil: T.Anvil };
export const STATION_NAME: Record<Station, string> = { workbench: 'Workbench', furnace: 'Furnace', anvil: 'Anvil' };

// ---------------------------------------------------------------- enemies

/** [item, min, max, chance] */
export type DropRow = [string, number, number, number];

export interface EnemyDef {
  name: string; hp: number; dmg: number; def: number; kbRes: number;
  w: number; h: number; speed: number; fly?: boolean; ghost?: boolean;
  drops: DropRow[];
}

export const ENEMIES: Record<string, EnemyDef> = {
  ghoul: { name: 'Ghoul', hp: 28, dmg: 12, def: 2, kbRes: 0.1, w: 12, h: 26, speed: 0.85, drops: [['hide', 1, 2, 0.8], ['bone', 1, 1, 0.3], ['tonic', 1, 1, 0.04]] },
  skeleton: { name: 'Skeleton', hp: 40, dmg: 16, def: 4, kbRes: 0.2, w: 12, h: 28, speed: 1.15, drops: [['bone', 1, 3, 0.9], ['arrow', 3, 8, 0.15], ['iron_bar', 1, 1, 0.06]] },
  bat: { name: 'Crypt Bat', hp: 10, dmg: 9, def: 0, kbRes: 0, w: 14, h: 10, speed: 2.1, fly: true, drops: [['bat_wing', 1, 1, 0.6]] },
  wraith: { name: 'Wraith', hp: 55, dmg: 22, def: 6, kbRes: 0.6, w: 14, h: 26, speed: 0.9, fly: true, ghost: true, drops: [['shroud', 1, 2, 0.8], ['silver_ore', 1, 3, 0.2], ['tonic', 1, 1, 0.08]] },
};

// ---------------------------------------------------------------- loot

/** [item, min, max, weight] */
export type LootRow = [string, number, number, number];

export const URN_LOOT: LootRow[] = [
  ['torch', 3, 8, 20], ['arrow', 5, 12, 14], ['tonic', 1, 1, 10], ['throwing_knife', 4, 10, 8],
  ['iron_ore', 2, 5, 12], ['bone', 1, 3, 14], ['silver_ore', 1, 3, 4], ['wood', 3, 8, 10],
];

export interface ChestTier { main: string[]; fill: LootRow[]; crystal: number; }
export const CHEST_LOOT: Record<string, ChestTier> = {
  cave: {
    main: ['wooden_bow', 'wolf_boots', 'miners_lantern', 'iron_sword', 'hide_lash', 'bone_blade'],
    fill: [['torch', 5, 15, 10], ['tonic', 1, 3, 8], ['iron_bar', 2, 6, 8], ['arrow', 10, 25, 8], ['wood', 8, 20, 4]],
    crystal: 0.1,
  },
  crypt: {
    main: ['raven_charm', 'moon_locket', 'chain_whip', 'iron_longbow', 'miners_lantern', 'wolf_boots'],
    fill: [['throwing_knife', 10, 25, 8], ['tonic', 2, 4, 8], ['bone', 4, 10, 6], ['silver_ore', 4, 10, 6], ['iron_bar', 4, 8, 8], ['torch', 8, 20, 6]],
    crystal: 0.3,
  },
  castle: {
    main: ['blood_ring', 'leech_fang', 'silver_saber', 'silver_scourge', 'raven_charm', 'moon_locket'],
    fill: [['silver_bar', 3, 7, 8], ['tonic', 2, 5, 8], ['silver_arrow', 10, 30, 8], ['throwing_knife', 15, 30, 6], ['candelabra', 1, 2, 3]],
    crystal: 0.45,
  },
};
