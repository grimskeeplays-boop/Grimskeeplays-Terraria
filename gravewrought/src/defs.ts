// Static game data: tiles, walls, items, gear rolls, recipes, enemies, loot, ranks, missions.

import type { RNG } from './util';

export const TILE = 16;
export const VW = 640;
export const VH = 360;
export const DAY = 43200; // ticks in a full day/night cycle (12 minutes at 60 Hz)

/** The hunters' guild the player works for. Rename freely. */
export const ORG_NAME = 'Van Helsing Order';

export const T = {
  Air: 0, Dirt: 1, Grass: 2, Stone: 3, Brick: 4, Wood: 5, Platform: 6,
  IronOre: 7, SilverOre: 8, BloodOre: 9, Gloom: 10, Bedrock: 11,
  Trunk: 12, TreeTop: 13, Torch: 14, Workbench: 15, Furnace: 16, Anvil: 17,
  Chest: 18, Urn: 19, Candelabra: 20, Crystal: 21, Altar: 22,
  Snow: 23, Ice: 24, Mud: 25, Moss: 26, Ash: 27, Brim: 28, NightOre: 29,
  Gravestone: 30, Board: 31, Bloom: 32, Ember: 33,
} as const;

export const WL = { None: 0, Dirt: 1, Stone: 2, Brick: 3, Wood: 4, Gloom: 5, Pillar: 6, Ice: 7, Brim: 8 } as const;

export const BIOME = { Hollow: 0, Frost: 1, Marsh: 2, Ash: 3, Cursed: 4 } as const;
export const BIOME_NAME = ['Hollowwood', 'Frostfell', 'Mirewood', 'Ashlands', 'Cursed Grounds'];

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
TILES[T.Trunk] = { name: 'Tree', solid: false, opaque: false, hp: 55, minPick: 0, tool: 'axe', drop: 'wood' };
TILES[T.TreeTop] = { name: 'Tree', solid: false, opaque: false, hp: 55, minPick: 0, tool: 'axe', drop: 'wood' };
TILES[T.Torch] = object('Torch', 'torch', { light: [1.35, 1.12, 0.8], anim: true, floor: false, hp: 4 });
TILES[T.Workbench] = object('Workbench', 'workbench');
TILES[T.Furnace] = object('Furnace', 'furnace', { light: [1.05, 0.65, 0.35], anim: true });
TILES[T.Anvil] = object('Anvil', 'anvil');
TILES[T.Chest] = object('Chest', 'chest');
TILES[T.Urn] = object('Urn', null, { hp: 6 });
TILES[T.Candelabra] = object('Candelabra', 'candelabra', { light: [1.4, 1.16, 0.82], anim: true });
TILES[T.Crystal] = object('Vitae Crystal', 'vitae_crystal', { light: [0.8, 0.2, 0.3], hp: 30 });
TILES[T.Altar] = object("The Count's Altar", null, { hp: Infinity, minPick: 999, light: [0.5, 0.06, 0.12] });
TILES[T.Snow] = block('Snow', 24, 'snow');
TILES[T.Ice] = block('Ice', 50, 'ice');
TILES[T.Mud] = block('Mire Mud', 28, 'mud');
TILES[T.Moss] = block('Mire Turf', 28, 'mud');
TILES[T.Ash] = block('Ash', 26, 'ash');
TILES[T.Brim] = block('Brimrock', 150, 'brimrock', 85);
TILES[T.NightOre] = { ...block('Umbrite Ore', 180, 'night_ore', 85), light: [0.25, 0.12, 0.5] };
TILES[T.Gravestone] = object('Gravestone', 'gravestone');
TILES[T.Board] = object('Dispatch Board', null, { hp: Infinity, minPick: 999 });
TILES[T.Bloom] = object('Mirebloom', 'mirebloom', { hp: 4, light: [0.12, 0.3, 0.2] });
TILES[T.Ember] = { ...block('Cinder Vein', 150, 'brimrock', 85), light: [1.0, 0.42, 0.12] };

export interface WallDef { name: string; drop: string | null; }
export const WALLS: WallDef[] = [];
WALLS[WL.None] = { name: '', drop: null };
WALLS[WL.Dirt] = { name: 'Soil Wall', drop: null };
WALLS[WL.Stone] = { name: 'Stone Wall', drop: null };
WALLS[WL.Brick] = { name: 'Castle Brick Wall', drop: 'brick_wall' };
WALLS[WL.Wood] = { name: 'Deadwood Wall', drop: 'wood_wall' };
WALLS[WL.Gloom] = { name: 'Gloomrock Wall', drop: null };
WALLS[WL.Pillar] = { name: 'Castle Pillar', drop: 'brick_wall' };
WALLS[WL.Ice] = { name: 'Ice Wall', drop: null };
WALLS[WL.Brim] = { name: 'Brimrock Wall', drop: null };

// ---------------------------------------------------------------- stats

export type StatKey = 'dmg' | 'melee' | 'whip' | 'ranged' | 'arcane' | 'crit' | 'speed' | 'kb' | 'def' | 'hp' | 'move' | 'regen' | 'spirit' | 'leech';
export type Bonus = Partial<Record<StatKey, number>>;
export type DamageClass = 'melee' | 'whip' | 'ranged' | 'arcane';

export const STAT_TEXT: Record<StatKey, (v: number) => string> = {
  dmg: (v) => `+${v}% damage`,
  melee: (v) => `+${v}% blade damage`,
  whip: (v) => `+${v}% whip damage`,
  ranged: (v) => `+${v}% ranged damage`,
  arcane: (v) => `+${v}% arcane damage`,
  crit: (v) => `+${v}% critical strike chance`,
  speed: (v) => `+${v}% attack speed`,
  kb: (v) => `+${v}% knockback`,
  def: (v) => `+${v} defence`,
  hp: (v) => `+${v} maximum life`,
  move: (v) => `+${v}% movement speed`,
  regen: (v) => `+${v} life regeneration`,
  spirit: (v) => `+${v} maximum spirit`,
  leech: (v) => `Restores ${v} life on hit`,
};

/** Name prefix granted by an item's leading rolled stat. */
const STAT_ADJ: Record<StatKey, string> = {
  dmg: 'Savage', melee: "Duelist's", whip: "Lasher's", ranged: "Marksman's", arcane: 'Occult', crit: 'Keen',
  speed: 'Swift', kb: 'Heavy', def: 'Warded', hp: 'Stout', move: 'Fleet', regen: 'Mending', spirit: 'Devout', leech: 'Vampiric',
};

export const CLASS_NAME: Record<DamageClass, string> = { melee: 'blade', whip: 'whip', ranged: 'ranged', arcane: 'arcane' };

// ---------------------------------------------------------------- items

/**
 * One inventory stack. Gear also carries its rolled rarity (`r`), a quality
 * multiplier on its base stats (`q`) and rolled bonus stats (`a`).
 * `u` marks loot that has not been rolled yet; its value is the luck bonus.
 */
export interface Slot { id: string; n: number; r?: number; q?: number; a?: [StatKey, number][]; u?: number; }

export type WeaponType = 'sword' | 'whip' | 'bow' | 'throw' | 'magic';

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
  wpn?: { type: WeaponType; dmg: number; use: number; kb: number; reach?: number; speed?: number; cost?: number };
  ammoDmg?: number;
  armor?: { slot: number; def: number; set: string };
  /** Fixed bonuses granted while worn. */
  bonus?: Bonus;
  /** Special effect granted while worn. */
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
  night: ['#5a3fa8', '#9a7cf0', '#2c1d5c'],
  bone: ['#d9d2b8', '#f3eedc', '#a39c84'],
  hide: ['#7a5a3f', '#96744f', '#54402e'],
  pelt: ['#6f7480', '#a3a9b8', '#42464f'],
  gold: ['#c9a227', '#f0d76a', '#8a6d14'],
  shroud: ['#a9c4d6', '#e0f4ff', '#6f8ca0'],
  frost: ['#9ad4ee', '#e6f8ff', '#5a94b8'],
  ember: ['#ff7a1a', '#ffd35a', '#a83a0a'],
  moss: ['#5f8f4a', '#9fd07a', '#33552a'],
};

// blocks & furniture
it('dirt', 'Grave Soil', 'block', 'tile', [], { place: T.Dirt });
it('stone', 'Stone', 'block', 'tile', [], { place: T.Stone });
it('brick', 'Castle Brick', 'block', 'tile', [], { place: T.Brick });
it('wood', 'Deadwood', 'block', 'log', C.wood, { place: T.Wood });
it('platform', 'Deadwood Platform', 'block', 'tile', [], { place: T.Platform });
it('gloomrock', 'Gloomrock', 'block', 'tile', [], { place: T.Gloom });
it('snow', 'Snow', 'block', 'tile', [], { place: T.Snow });
it('ice', 'Ice', 'block', 'tile', [], { place: T.Ice });
it('mud', 'Mire Mud', 'block', 'tile', [], { place: T.Mud });
it('ash', 'Ash', 'block', 'tile', [], { place: T.Ash });
it('brimrock', 'Brimrock', 'block', 'tile', [], { place: T.Brim });
it('torch', 'Torch', 'block', 'tile', [], { place: T.Torch, desc: 'Holds back the dark' });
it('workbench', 'Workbench', 'block', 'tile', [], { place: T.Workbench, desc: 'Basic crafting station' });
it('furnace', 'Furnace', 'block', 'tile', [], { place: T.Furnace, desc: 'Smelts ore and fires brick' });
it('anvil', 'Anvil', 'block', 'tile', [], { place: T.Anvil, desc: 'For forging arms and armour' });
it('chest', 'Chest', 'block', 'tile', [], { place: T.Chest, desc: 'Stores 20 stacks' });
it('candelabra', 'Candelabra', 'block', 'tile', [], { place: T.Candelabra });
it('gravestone', 'Gravestone', 'block', 'tile', [], { place: T.Gravestone });
it('brick_wall', 'Castle Brick Wall', 'wall', 'wall', [], { placeWall: WL.Brick });
it('wood_wall', 'Deadwood Wall', 'wall', 'wall', [], { placeWall: WL.Wood });

// materials
it('iron_ore', 'Iron Ore', 'mat', 'ore', ['#b08368', '#dcb394', '#7a5846']);
it('silver_ore', 'Silver Ore', 'mat', 'ore', C.silver, { rarity: 1 });
it('blood_ore', 'Bloodstone Ore', 'mat', 'ore', C.blood, { rarity: 2 });
it('night_ore', 'Umbrite Ore', 'mat', 'ore', C.night, { rarity: 3 });
it('iron_bar', 'Iron Ingot', 'mat', 'bar', C.iron);
it('silver_bar', 'Silver Ingot', 'mat', 'bar', C.silver, { rarity: 1 });
it('blood_bar', 'Bloodstone Ingot', 'mat', 'bar', C.blood, { rarity: 2 });
it('night_bar', 'Nightsteel Ingot', 'mat', 'bar', C.night, { rarity: 3 });
it('bone', 'Bone', 'mat', 'bone', C.bone);
it('hide', 'Rotten Hide', 'mat', 'hide', C.hide);
it('bat_wing', 'Bat Wing', 'mat', 'wing', ['#3a2f47', '#5a4a6e', '#221b2b']);
it('shroud', 'Wraith Shroud', 'mat', 'shroud', C.shroud, { rarity: 1 });
it('wolf_pelt', 'Dire Pelt', 'mat', 'hide', C.pelt, { rarity: 1 });
it('frost_shard', 'Rime Shard', 'mat', 'gem', C.frost, { rarity: 1 });
it('mirebloom', 'Mirebloom', 'mat', 'bloom', C.moss);
it('cursed_blood', 'Cursed Blood', 'mat', 'potion', ['#5a0a16'], { rarity: 2, desc: 'Still warm' });
it('cinder_heart', 'Cinder Heart', 'mat', 'gem', C.ember, { rarity: 3 });
it('dracula_fang', "The Count's Fang", 'mat', 'fang', C.bone, { rarity: 5, desc: 'Proof that the night can be ended' });

// tools
it('crude_pick', "Gravedigger's Pick", 'tool', 'pick', C.rust, { tool: { type: 'pick', power: 30 }, wpn: { type: 'sword', dmg: 4, use: 16, kb: 2, reach: 22 } });
it('crude_axe', "Woodsman's Hatchet", 'tool', 'axe', C.rust, { tool: { type: 'axe', power: 30 }, wpn: { type: 'sword', dmg: 5, use: 20, kb: 3, reach: 22 } });
it('mallet', 'Deadwood Mallet', 'tool', 'hammer', C.wood, { tool: { type: 'hammer', power: 30 }, wpn: { type: 'sword', dmg: 4, use: 22, kb: 4, reach: 22 }, desc: 'Breaks background walls' });
it('iron_pick', 'Iron Pickaxe', 'tool', 'pick', C.iron, { tool: { type: 'pick', power: 45 }, wpn: { type: 'sword', dmg: 6, use: 15, kb: 2, reach: 22 }, desc: 'Can mine silver' });
it('iron_axe', 'Iron Axe', 'tool', 'axe', C.iron, { tool: { type: 'axe', power: 55 }, wpn: { type: 'sword', dmg: 9, use: 19, kb: 3.5, reach: 22 } });
it('iron_hammer', 'Iron Hammer', 'tool', 'hammer', C.iron, { tool: { type: 'hammer', power: 55 }, wpn: { type: 'sword', dmg: 8, use: 21, kb: 5, reach: 22 }, desc: 'Breaks background walls' });
it('silver_pick', 'Silver Pickaxe', 'tool', 'pick', C.silver, { rarity: 1, tool: { type: 'pick', power: 60 }, wpn: { type: 'sword', dmg: 8, use: 14, kb: 2, reach: 22 }, desc: 'Can mine gloomrock and bloodstone' });
it('blood_pick', 'Bloodstone Pickaxe', 'tool', 'pick', C.blood, { rarity: 2, tool: { type: 'pick', power: 85 }, wpn: { type: 'sword', dmg: 12, use: 12, kb: 2.5, reach: 22 }, desc: 'Can mine brimrock and umbrite' });

// weapons: blades
it('worn_sword', 'Worn Shortsword', 'weapon', 'sword', C.rust, { wpn: { type: 'sword', dmg: 9, use: 22, kb: 4, reach: 26 } });
it('bone_blade', 'Bone Blade', 'weapon', 'sword', C.bone, { wpn: { type: 'sword', dmg: 13, use: 20, kb: 4.5, reach: 28 } });
it('iron_sword', 'Iron Longsword', 'weapon', 'sword', C.iron, { wpn: { type: 'sword', dmg: 17, use: 20, kb: 5, reach: 30 } });
it('silver_saber', 'Silver Sabre', 'weapon', 'sword', C.silver, { rarity: 1, wpn: { type: 'sword', dmg: 24, use: 17, kb: 5, reach: 32 } });
it('blood_greatsword', 'Bloodstone Greatsword', 'weapon', 'sword', C.blood, { rarity: 2, wpn: { type: 'sword', dmg: 38, use: 26, kb: 7, reach: 40 } });
it('night_claymore', 'Nightsteel Claymore', 'weapon', 'sword', C.night, { rarity: 3, wpn: { type: 'sword', dmg: 54, use: 24, kb: 7.5, reach: 42 } });
// weapons: whips
it('hide_lash', 'Hide Lash', 'weapon', 'whip', C.hide, { wpn: { type: 'whip', dmg: 11, use: 30, kb: 2, reach: 70 }, desc: 'Strikes at a distance' });
it('chain_whip', 'Chain Whip', 'weapon', 'whip', C.iron, { wpn: { type: 'whip', dmg: 16, use: 30, kb: 3, reach: 84 } });
it('silver_scourge', 'Silver Scourge', 'weapon', 'whip', C.silver, { rarity: 1, wpn: { type: 'whip', dmg: 23, use: 27, kb: 3, reach: 96 } });
it('crimson_lash', 'Crimson Lash', 'weapon', 'whip', C.blood, { rarity: 2, wpn: { type: 'whip', dmg: 34, use: 25, kb: 4, reach: 110 } });
it('duskfang', 'Duskfang Lash', 'weapon', 'whip', C.night, { rarity: 3, wpn: { type: 'whip', dmg: 47, use: 23, kb: 4.5, reach: 124 } });
// weapons: ranged
it('wooden_bow', 'Deadwood Bow', 'weapon', 'bow', C.wood, { wpn: { type: 'bow', dmg: 8, use: 26, kb: 2, speed: 7 }, desc: 'Uses arrows' });
it('iron_longbow', 'Iron Longbow', 'weapon', 'bow', C.iron, { wpn: { type: 'bow', dmg: 13, use: 24, kb: 3, speed: 8.5 }, desc: 'Uses arrows' });
it('silver_bow', 'Silverstring Bow', 'weapon', 'bow', C.silver, { rarity: 1, wpn: { type: 'bow', dmg: 19, use: 21, kb: 3, speed: 9.5 }, desc: 'Uses arrows' });
it('blood_bow', 'Bloodthorn Bow', 'weapon', 'bow', C.blood, { rarity: 2, wpn: { type: 'bow', dmg: 28, use: 19, kb: 3.5, speed: 10.5 }, desc: 'Uses arrows' });
it('eclipse_bow', 'Eclipse Bow', 'weapon', 'bow', C.night, { rarity: 3, wpn: { type: 'bow', dmg: 40, use: 17, kb: 4, speed: 11.5 }, desc: 'Uses arrows' });
it('bone_shard', 'Bone Shard', 'weapon', 'shard', C.bone, { wpn: { type: 'throw', dmg: 10, use: 16, kb: 2, speed: 6.5 } });
it('throwing_knife', 'Throwing Knife', 'weapon', 'knife', C.iron, { wpn: { type: 'throw', dmg: 14, use: 14, kb: 2, speed: 8 } });
it('silver_knife', 'Silver Throwing Knife', 'weapon', 'knife', C.silver, { rarity: 1, wpn: { type: 'throw', dmg: 22, use: 13, kb: 2, speed: 9 } });
// weapons: arcane
it('grave_wand', "Gravecaller's Wand", 'weapon', 'staff', C.bone, { wpn: { type: 'magic', dmg: 13, use: 22, kb: 2, speed: 6.5, cost: 5 }, desc: 'Uses spirit' });
it('moon_sceptre', 'Moonlit Sceptre', 'weapon', 'staff', C.silver, { rarity: 1, wpn: { type: 'magic', dmg: 21, use: 20, kb: 2.5, speed: 7.5, cost: 6 }, desc: 'Uses spirit' });
it('blood_rod', 'Bloodrite Rod', 'weapon', 'staff', C.blood, { rarity: 2, wpn: { type: 'magic', dmg: 31, use: 17, kb: 3, speed: 8.5, cost: 7 }, desc: 'Uses spirit' });
it('umbral_staff', 'Umbral Staff', 'weapon', 'staff', C.night, { rarity: 3, wpn: { type: 'magic', dmg: 44, use: 15, kb: 3.5, speed: 9.5, cost: 8 }, desc: 'Uses spirit' });

// ammo
it('arrow', 'Arrow', 'ammo', 'arrow', C.iron, { ammoDmg: 4 });
it('silver_arrow', 'Silver Arrow', 'ammo', 'arrow', C.silver, { ammoDmg: 9, rarity: 1 });

// armour sets
export interface SetDef { name: string; bonus: Bonus; text: string; flag?: string; }
export const SETS: Record<string, SetDef> = {};

const armorSet = (key: string, setName: string, names: [string, string, string], col: string[], defs: [number, number, number], rarity: number, piece: Bonus, set: Bonus, flag?: string) => {
  it(`${key}_helm`, names[0], 'armor', 'helm', col, { armor: { slot: 0, def: defs[0], set: key }, rarity, bonus: piece });
  it(`${key}_plate`, names[1], 'armor', 'body', col, { armor: { slot: 1, def: defs[1], set: key }, rarity, bonus: piece });
  it(`${key}_greaves`, names[2], 'armor', 'legs', col, { armor: { slot: 2, def: defs[2], set: key }, rarity, bonus: piece });
  const parts = (Object.keys(set) as StatKey[]).map((k) => STAT_TEXT[k](set[k]!).replace('+', ''));
  if (flag === 'leech') parts.push('blade and whip hits restore life');
  SETS[key] = { name: setName, bonus: set, text: parts.join(', '), flag };
};
armorSet('hide', 'Hide', ['Hide Hood', 'Hide Jerkin', 'Hide Leggings'], C.hide, [1, 2, 1], 0, {}, { move: 10 });
armorSet('iron', 'Iron', ['Iron Helm', 'Iron Cuirass', 'Iron Greaves'], C.iron, [2, 4, 3], 0, {}, { def: 3 });
armorSet('silver', 'Vanguard', ['Vanguard Helm', 'Vanguard Cuirass', 'Vanguard Greaves'], C.silver, [4, 6, 4], 1, { melee: 4, whip: 4 }, { melee: 8, whip: 8 });
armorSet('stalker', 'Stalker', ['Stalker Cowl', 'Stalker Coat', 'Stalker Boots'], C.pelt, [3, 5, 3], 1, { ranged: 5 }, { ranged: 10, crit: 5 });
armorSet('acolyte', 'Acolyte', ['Acolyte Hood', 'Acolyte Vestment', 'Acolyte Wraps'], C.shroud, [2, 4, 2], 1, { arcane: 6 }, { arcane: 10, spirit: 40 });
armorSet('blood', 'Bloodstone', ['Bloodstone Crown', 'Bloodstone Cuirass', 'Bloodstone Greaves'], C.blood, [6, 9, 6], 2, { melee: 6, whip: 6 }, { melee: 12, whip: 12 }, 'leech');
armorSet('dusk', 'Duskhunter', ['Duskhunter Hat', 'Duskhunter Coat', 'Duskhunter Boots'], ['#5a3a3a', '#8a5a52', '#2e1c1c'], [5, 7, 5], 2, { ranged: 7 }, { ranged: 14, crit: 8 });
armorSet('rite', 'Bloodrite', ['Bloodrite Mask', 'Bloodrite Robe', 'Bloodrite Sandals'], ['#7a1a3a', '#c04a6a', '#3a0a1a'], [4, 6, 4], 2, { arcane: 8 }, { arcane: 14, spirit: 60 });
armorSet('night', 'Nightsteel', ['Nightsteel Helm', 'Nightsteel Cuirass', 'Nightsteel Greaves'], C.night, [9, 13, 9], 3, { dmg: 4 }, { dmg: 10, def: 4 });

// accessories
it('raven_charm', 'Raven Feather Charm', 'acc', 'feather', ['#2b2d42', '#4a4e73', '#16172a'], { acc: 'dblJump', rarity: 2, desc: 'Grants a second jump' });
it('wolf_boots', 'Wolfhide Boots', 'acc', 'boots', C.hide, { bonus: { move: 25 }, rarity: 1 });
it('miners_lantern', "Sexton's Lantern", 'acc', 'lantern', C.gold, { acc: 'lantern', rarity: 1, desc: 'Lights your way' });
it('blood_ring', 'Bloodstone Signet', 'acc', 'ring', C.blood, { bonus: { dmg: 12 }, rarity: 2 });
it('leech_fang', 'Leech Fang', 'acc', 'fang', C.bone, { acc: 'leech', rarity: 3, desc: 'Blade and whip hits restore life' });
it('moon_locket', 'Moon Locket', 'acc', 'locket', C.silver, { bonus: { regen: 2 }, rarity: 2 });
it('shroud_cloak', 'Shroud Cloak', 'acc', 'cloak', C.shroud, { acc: 'glide', rarity: 2, desc: 'Hold jump to fall slowly' });
it('duelist_sash', "Duelist's Sash", 'acc', 'cloak', ['#a3142a', '#e04a5a', '#5a0a16'], { bonus: { melee: 10, speed: 5 }, rarity: 1 });
it('lash_glove', "Lashmaster's Glove", 'acc', 'boots', ['#3d2a20', '#6e4c36', '#1f1510'], { bonus: { whip: 12, speed: 6 }, rarity: 1 });
it('marksman_eye', "Marksman's Monocle", 'acc', 'ring', ['#9ad4ee', '#e6f8ff', '#5a94b8'], { bonus: { ranged: 10, crit: 4 }, rarity: 1 });
it('occult_sigil', 'Occult Sigil', 'acc', 'locket', C.night, { bonus: { arcane: 10, spirit: 20 }, rarity: 1 });
it('iron_ward', 'Warding Plate', 'acc', 'helm', C.iron, { bonus: { def: 4 }, rarity: 1 });
it('ember_heart', 'Emberheart Pendant', 'acc', 'locket', C.ember, { bonus: { dmg: 8, hp: 30 }, rarity: 3 });

// consumables
it('tonic', 'Crimson Tonic', 'use', 'potion', ['#c0182f'], { heal: 50, stack: 30, desc: 'Restores 50 life' });
it('greater_tonic', 'Greater Tonic', 'use', 'potion', ['#ff5a9a'], { heal: 110, stack: 30, rarity: 1, desc: 'Restores 110 life' });
it('vitae_crystal', 'Vitae Crystal', 'use', 'tile', [], { life: 20, stack: 99, rarity: 2, desc: 'Permanently raises life by 20' });
it('sanctified_stake', 'Sanctified Stake', 'use', 'stake', C.silver, { stack: 5, rarity: 4, desc: "Carry it to the altar in the Count's keep" });

/** Tile id an item's icon is drawn from, for items that share a tile's art. */
export const ICON_TILE: Record<string, number> = {
  dirt: T.Dirt, stone: T.Stone, brick: T.Brick, platform: T.Platform, gloomrock: T.Gloom, torch: T.Torch,
  workbench: T.Workbench, furnace: T.Furnace, anvil: T.Anvil, chest: T.Chest, candelabra: T.Candelabra,
  vitae_crystal: T.Crystal, brick_wall: WL.Brick, wood_wall: WL.Wood, snow: T.Snow, ice: T.Ice, mud: T.Mud,
  ash: T.Ash, brimrock: T.Brim, gravestone: T.Gravestone,
};

// ---------------------------------------------------------------- rarity and gear rolls

export const RARITY_NAME = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic'];
export const RARITY_COL = ['#e8e4d8', '#7fe08a', '#7fa8ff', '#c78bff', '#ffae57', '#ff5a6e'];

export function isGear(d: ItemDef): boolean {
  return (d.kind === 'weapon' && d.stack === 1) || d.kind === 'armor' || d.kind === 'acc';
}

/** [stat, min, max, minimum rarity] */
type AffixRow = [StatKey, number, number, number];
const AFFIX: Record<'weapon' | 'armor' | 'acc', AffixRow[]> = {
  weapon: [['dmg', 5, 12, 0], ['speed', 4, 10, 0], ['crit', 3, 8, 0], ['kb', 10, 25, 0], ['leech', 1, 1, 3]],
  armor: [['def', 1, 2, 0], ['hp', 5, 15, 0], ['move', 3, 6, 0], ['melee', 2, 5, 0], ['whip', 2, 5, 0], ['ranged', 2, 5, 0], ['arcane', 2, 5, 0], ['crit', 1, 3, 0], ['regen', 1, 1, 2]],
  acc: [['def', 1, 3, 0], ['hp', 8, 20, 0], ['move', 3, 8, 0], ['melee', 3, 7, 0], ['whip', 3, 7, 0], ['ranged', 3, 7, 0], ['arcane', 3, 7, 0], ['crit', 2, 4, 0], ['regen', 1, 2, 2], ['spirit', 10, 25, 0], ['speed', 3, 6, 1]],
};
const RARITY_WEIGHT = [100, 45, 18, 7, 2.5, 0.8];
const AFFIX_COUNT = [0, 1, 2, 2, 3, 4];

/** Highest rarity a hunter of the given rank can normally find. */
export const rarityCap = (rank: number) => Math.min(5, rank + 1);

/**
 * Rolls a fresh piece of gear. Higher hunter rank unlocks higher rarities and
 * makes them more likely; `luck` pushes the result up further (bosses, deep chests).
 */
export function rollGear(rng: RNG, id: string, rank: number, luck = 0): Slot {
  const d = ITEMS[id];
  if (!isGear(d)) return { id, n: 1 };
  const cap = rarityCap(rank);
  let tot = 0;
  const ws: number[] = [];
  for (let r = 0; r <= cap; r++) { ws.push(RARITY_WEIGHT[r] * (1 + rank * 0.5 * r)); tot += ws[r]; }
  let v = rng.next() * tot, rar = 0;
  for (let r = 0; r <= cap; r++) { v -= ws[r]; if (v <= 0) { rar = r; break; } }
  rar = Math.min(5, rar + luck);
  const q = Math.round((1 + rar * 0.06 + rng.range(-0.06, 0.06)) * 100) / 100;
  const pool = AFFIX[d.kind as 'weapon' | 'armor' | 'acc'].filter((row) => rar >= row[3]);
  const a: [StatKey, number][] = [];
  for (let i = 0; i < AFFIX_COUNT[rar] && pool.length > 0; i++) {
    const row = pool.splice(Math.floor(rng.next() * pool.length), 1)[0];
    const scale = row[0] === 'leech' || row[0] === 'regen' ? 1 : 1 + rar * 0.12;
    a.push([row[0], Math.max(1, Math.round(rng.range(row[1], row[2]) * scale))]);
  }
  return { id, n: 1, r: rar, q, a };
}

export function slotName(s: Slot): string {
  const d = ITEMS[s.id];
  return s.a && s.a.length > 0 ? `${STAT_ADJ[s.a[0][0]]} ${d.name}` : d.name;
}

export function slotRarity(s: Slot): number {
  return s.r !== undefined ? s.r : ITEMS[s.id].rarity;
}

export function slotColor(s: Slot): string {
  return RARITY_COL[Math.min(slotRarity(s), RARITY_COL.length - 1)];
}

const affix = (s: Slot, k: StatKey): number => {
  let v = 0;
  if (s.a) for (const [key, val] of s.a) if (key === k) v += val;
  return v;
};

export function weaponClass(d: ItemDef): DamageClass {
  const t = d.wpn!.type;
  return t === 'sword' ? 'melee' : t === 'whip' ? 'whip' : t === 'magic' ? 'arcane' : 'ranged';
}

export interface WeaponStats { dmg: number; use: number; kb: number; crit: number; leech: number; }

/** A weapon's working numbers: its own roll, plus the wearer's bonuses when given. */
export function weaponStats(s: Slot, b: Bonus = {}): WeaponStats | null {
  const d = ITEMS[s.id];
  const w = d.wpn;
  if (!w) return null;
  const cls = weaponClass(d);
  const pct = (b.dmg ?? 0) + (b[cls] ?? 0);
  return {
    dmg: Math.max(1, Math.round(w.dmg * (s.q ?? 1) * (1 + affix(s, 'dmg') / 100) * (1 + pct / 100))),
    use: Math.max(5, Math.round(w.use / (1 + (affix(s, 'speed') + (b.speed ?? 0)) / 100))),
    kb: w.kb * (1 + affix(s, 'kb') / 100),
    crit: 4 + affix(s, 'crit') + (b.crit ?? 0),
    leech: affix(s, 'leech'),
  };
}

export function armorDef(s: Slot): number {
  return Math.round(ITEMS[s.id].armor!.def * (s.q ?? 1));
}

// ---------------------------------------------------------------- recipes

export type Station = 'workbench' | 'furnace' | 'anvil';
export interface Recipe { out: string; n: number; need: [string, number][]; at?: Station; rank: number; }

const rc = (rank: number, out: string, n: number, need: [string, number][], at?: Station): Recipe => ({ out, n, need, at, rank });

export const RECIPES: Recipe[] = [
  // Rookie
  rc(0, 'torch', 3, [['wood', 1]]),
  rc(0, 'workbench', 1, [['wood', 10]]),
  rc(0, 'platform', 2, [['wood', 1]]),
  rc(0, 'wood_wall', 4, [['wood', 1]], 'workbench'),
  rc(0, 'chest', 1, [['wood', 12]], 'workbench'),
  rc(0, 'mallet', 1, [['wood', 8]], 'workbench'),
  rc(0, 'wooden_bow', 1, [['wood', 10]], 'workbench'),
  rc(0, 'arrow', 10, [['wood', 1], ['stone', 1]], 'workbench'),
  rc(0, 'bone_blade', 1, [['bone', 12]], 'workbench'),
  rc(0, 'bone_shard', 10, [['bone', 2]], 'workbench'),
  rc(0, 'hide_lash', 1, [['hide', 6]], 'workbench'),
  rc(0, 'hide_helm', 1, [['hide', 4]], 'workbench'),
  rc(0, 'hide_plate', 1, [['hide', 8]], 'workbench'),
  rc(0, 'hide_greaves', 1, [['hide', 6]], 'workbench'),
  rc(0, 'tonic', 1, [['bat_wing', 2]], 'workbench'),
  rc(0, 'tonic', 2, [['mirebloom', 3]], 'workbench'),
  rc(0, 'gravestone', 1, [['stone', 6]], 'workbench'),
  // Apprentice: the forge
  rc(1, 'furnace', 1, [['stone', 20], ['wood', 4], ['torch', 3]], 'workbench'),
  rc(1, 'brick', 1, [['stone', 2]], 'furnace'),
  rc(1, 'brick_wall', 4, [['brick', 1]], 'workbench'),
  rc(1, 'iron_bar', 1, [['iron_ore', 3]], 'furnace'),
  rc(1, 'anvil', 1, [['iron_bar', 5]], 'workbench'),
  rc(1, 'candelabra', 1, [['iron_bar', 2], ['torch', 3]], 'workbench'),
  rc(1, 'grave_wand', 1, [['bone', 10], ['bat_wing', 4]], 'workbench'),
  rc(1, 'iron_pick', 1, [['iron_bar', 8], ['wood', 3]], 'anvil'),
  rc(1, 'iron_axe', 1, [['iron_bar', 6], ['wood', 3]], 'anvil'),
  rc(1, 'iron_hammer', 1, [['iron_bar', 6], ['wood', 3]], 'anvil'),
  rc(1, 'iron_sword', 1, [['iron_bar', 7]], 'anvil'),
  rc(1, 'chain_whip', 1, [['iron_bar', 8]], 'anvil'),
  rc(1, 'iron_longbow', 1, [['iron_bar', 6]], 'anvil'),
  rc(1, 'throwing_knife', 20, [['iron_bar', 1]], 'anvil'),
  rc(1, 'iron_helm', 1, [['iron_bar', 8]], 'anvil'),
  rc(1, 'iron_plate', 1, [['iron_bar', 14]], 'anvil'),
  rc(1, 'iron_greaves', 1, [['iron_bar', 10]], 'anvil'),
  rc(1, 'iron_ward', 1, [['iron_bar', 10], ['hide', 4]], 'anvil'),
  rc(1, 'wolf_boots', 1, [['wolf_pelt', 6], ['hide', 4]], 'workbench'),
  // Hunter: silver and the three paths
  rc(2, 'silver_bar', 1, [['silver_ore', 4]], 'furnace'),
  rc(2, 'silver_pick', 1, [['silver_bar', 10], ['wood', 3]], 'anvil'),
  rc(2, 'silver_saber', 1, [['silver_bar', 8]], 'anvil'),
  rc(2, 'silver_scourge', 1, [['silver_bar', 10]], 'anvil'),
  rc(2, 'silver_bow', 1, [['silver_bar', 8], ['wolf_pelt', 2]], 'anvil'),
  rc(2, 'moon_sceptre', 1, [['silver_bar', 8], ['shroud', 3]], 'anvil'),
  rc(2, 'silver_arrow', 15, [['silver_bar', 1], ['wood', 2]], 'anvil'),
  rc(2, 'silver_knife', 20, [['silver_bar', 1]], 'anvil'),
  rc(2, 'silver_helm', 1, [['silver_bar', 10]], 'anvil'),
  rc(2, 'silver_plate', 1, [['silver_bar', 16]], 'anvil'),
  rc(2, 'silver_greaves', 1, [['silver_bar', 12]], 'anvil'),
  rc(2, 'stalker_helm', 1, [['wolf_pelt', 5], ['silver_bar', 3]], 'workbench'),
  rc(2, 'stalker_plate', 1, [['wolf_pelt', 9], ['silver_bar', 5]], 'workbench'),
  rc(2, 'stalker_greaves', 1, [['wolf_pelt', 7], ['silver_bar', 4]], 'workbench'),
  rc(2, 'acolyte_helm', 1, [['shroud', 4], ['silver_bar', 3]], 'workbench'),
  rc(2, 'acolyte_plate', 1, [['shroud', 8], ['silver_bar', 5]], 'workbench'),
  rc(2, 'acolyte_greaves', 1, [['shroud', 6], ['silver_bar', 4]], 'workbench'),
  rc(2, 'shroud_cloak', 1, [['shroud', 8]], 'workbench'),
  rc(2, 'duelist_sash', 1, [['silver_bar', 6], ['hide', 6]], 'workbench'),
  rc(2, 'lash_glove', 1, [['silver_bar', 6], ['wolf_pelt', 4]], 'workbench'),
  rc(2, 'marksman_eye', 1, [['silver_bar', 6], ['frost_shard', 4]], 'workbench'),
  rc(2, 'occult_sigil', 1, [['silver_bar', 6], ['shroud', 4]], 'workbench'),
  rc(2, 'greater_tonic', 1, [['tonic', 1], ['frost_shard', 1], ['mirebloom', 1]], 'workbench'),
  // Slayer: bloodstone
  rc(3, 'blood_bar', 1, [['blood_ore', 4]], 'furnace'),
  rc(3, 'blood_pick', 1, [['blood_bar', 12], ['wood', 3]], 'anvil'),
  rc(3, 'blood_greatsword', 1, [['blood_bar', 12]], 'anvil'),
  rc(3, 'crimson_lash', 1, [['blood_bar', 10], ['shroud', 4]], 'anvil'),
  rc(3, 'blood_bow', 1, [['blood_bar', 10], ['wolf_pelt', 4]], 'anvil'),
  rc(3, 'blood_rod', 1, [['blood_bar', 10], ['cursed_blood', 3]], 'anvil'),
  rc(3, 'blood_helm', 1, [['blood_bar', 12]], 'anvil'),
  rc(3, 'blood_plate', 1, [['blood_bar', 20]], 'anvil'),
  rc(3, 'blood_greaves', 1, [['blood_bar', 14]], 'anvil'),
  rc(3, 'dusk_helm', 1, [['blood_bar', 6], ['wolf_pelt', 6]], 'anvil'),
  rc(3, 'dusk_plate', 1, [['blood_bar', 10], ['wolf_pelt', 10]], 'anvil'),
  rc(3, 'dusk_greaves', 1, [['blood_bar', 8], ['wolf_pelt', 8]], 'anvil'),
  rc(3, 'rite_helm', 1, [['blood_bar', 6], ['cursed_blood', 3]], 'anvil'),
  rc(3, 'rite_plate', 1, [['blood_bar', 10], ['cursed_blood', 5]], 'anvil'),
  rc(3, 'rite_greaves', 1, [['blood_bar', 8], ['cursed_blood', 4]], 'anvil'),
  rc(3, 'blood_ring', 1, [['blood_bar', 8], ['cursed_blood', 4]], 'anvil'),
  // Vanquisher: nightsteel and the stake
  rc(4, 'night_bar', 1, [['night_ore', 4]], 'furnace'),
  rc(4, 'night_claymore', 1, [['night_bar', 12], ['cinder_heart', 2]], 'anvil'),
  rc(4, 'duskfang', 1, [['night_bar', 12], ['cinder_heart', 2]], 'anvil'),
  rc(4, 'eclipse_bow', 1, [['night_bar', 12], ['cinder_heart', 2]], 'anvil'),
  rc(4, 'umbral_staff', 1, [['night_bar', 12], ['cinder_heart', 2]], 'anvil'),
  rc(4, 'night_helm', 1, [['night_bar', 12]], 'anvil'),
  rc(4, 'night_plate', 1, [['night_bar', 20]], 'anvil'),
  rc(4, 'night_greaves', 1, [['night_bar', 14]], 'anvil'),
  rc(4, 'ember_heart', 1, [['cinder_heart', 5], ['night_bar', 4]], 'anvil'),
  rc(4, 'sanctified_stake', 1, [['wood', 20], ['silver_bar', 10], ['night_bar', 5]], 'anvil'),
];

export const STATION_TILE: Record<Station, number> = { workbench: T.Workbench, furnace: T.Furnace, anvil: T.Anvil };
export const STATION_NAME: Record<Station, string> = { workbench: 'Workbench', furnace: 'Furnace', anvil: 'Anvil' };

// ---------------------------------------------------------------- enemies

/** [item, min, max, chance] */
export type DropRow = [string, number, number, number];

export interface EnemyDef {
  name: string; hp: number; dmg: number; def: number; kbRes: number;
  w: number; h: number; speed: number; fly?: boolean; ghost?: boolean; boss?: boolean;
  sprite: 'ghoul' | 'skeleton' | 'bat' | 'wraith' | 'wolf' | 'thrall' | 'dracula';
  pal: string[];
  /** Burns away in open daylight. */
  burns?: boolean;
  shoot?: 'bone' | 'fire';
  jump?: number;
  drops: DropRow[];
  /** Chance to drop a rolled piece of gear, and what it can be. */
  gear?: [number, string[]];
}

export const ENEMIES: Record<string, EnemyDef> = {
  ghoul: { name: 'Ghoul', hp: 28, dmg: 12, def: 2, kbRes: 0.1, w: 12, h: 26, speed: 0.85, sprite: 'ghoul', burns: true,
    pal: ['#7d8a70', '#8e9b80', '#4a5a48', '#5b6b55', '#3d3a35', '#ff5a3a'],
    drops: [['hide', 1, 2, 0.8], ['bone', 1, 1, 0.3], ['tonic', 1, 1, 0.04]], gear: [0.03, ['hide_lash', 'bone_blade', 'hide_helm']] },
  bog_lurker: { name: 'Bog Lurker', hp: 46, dmg: 16, def: 3, kbRes: 0.25, w: 12, h: 26, speed: 0.75, sprite: 'ghoul', burns: true,
    pal: ['#5f7a52', '#7a9a66', '#3a3a24', '#55552f', '#2a2a1c', '#c8ff5a'],
    drops: [['hide', 1, 3, 0.8], ['mirebloom', 1, 2, 0.35], ['tonic', 1, 1, 0.05]], gear: [0.04, ['wolf_boots', 'iron_ward', 'grave_wand']] },
  frost_wight: { name: 'Frost Wight', hp: 52, dmg: 18, def: 4, kbRes: 0.2, w: 12, h: 26, speed: 0.95, sprite: 'ghoul', burns: true,
    pal: ['#a8c8dc', '#d0e8f4', '#5a7890', '#7a9ab0', '#3a4a5a', '#7fe8ff'],
    drops: [['frost_shard', 1, 2, 0.7], ['hide', 1, 2, 0.4]], gear: [0.04, ['marksman_eye', 'iron_longbow', 'iron_sword']] },
  husk: { name: 'Cinder Husk', hp: 64, dmg: 22, def: 5, kbRes: 0.2, w: 12, h: 26, speed: 1.0, sprite: 'ghoul', burns: true,
    pal: ['#4a4444', '#6a6060', '#2a2424', '#3a3232', '#1c1818', '#ffae3a'],
    drops: [['bone', 1, 3, 0.6], ['iron_ore', 2, 5, 0.3], ['greater_tonic', 1, 1, 0.04]], gear: [0.05, ['duelist_sash', 'lash_glove', 'chain_whip']] },
  dire_wolf: { name: 'Dire Wolf', hp: 38, dmg: 18, def: 3, kbRes: 0.1, w: 22, h: 14, speed: 2.0, sprite: 'wolf', jump: 5.6,
    pal: ['#6f7480', '#42464f', '#ffd35a'],
    drops: [['wolf_pelt', 1, 2, 0.75]] },
  skeleton: { name: 'Skeleton', hp: 40, dmg: 16, def: 4, kbRes: 0.2, w: 12, h: 28, speed: 1.15, sprite: 'skeleton', shoot: 'bone',
    pal: ['#d9d2b8', '#a39c84', '#f3eedc', ''],
    drops: [['bone', 1, 3, 0.9], ['arrow', 3, 8, 0.15], ['iron_bar', 1, 1, 0.06]], gear: [0.03, ['iron_sword', 'iron_helm', 'wooden_bow']] },
  bone_knight: { name: 'Bone Knight', hp: 95, dmg: 26, def: 10, kbRes: 0.5, w: 12, h: 28, speed: 1.0, sprite: 'skeleton',
    pal: ['#c9c2a8', '#938c74', '#e3deca', '#5b5d6b'],
    drops: [['bone', 2, 4, 0.9], ['iron_bar', 1, 3, 0.4], ['silver_bar', 1, 2, 0.15]], gear: [0.07, ['silver_saber', 'silver_helm', 'silver_plate', 'iron_ward']] },
  bat: { name: 'Crypt Bat', hp: 10, dmg: 9, def: 0, kbRes: 0, w: 14, h: 10, speed: 2.1, fly: true, sprite: 'bat',
    pal: ['#2a2233', '#3a2f47', '#ff3a3a'],
    drops: [['bat_wing', 1, 1, 0.6]] },
  imp: { name: 'Cinder Imp', hp: 48, dmg: 24, def: 6, kbRes: 0.2, w: 14, h: 10, speed: 1.7, fly: true, sprite: 'bat', shoot: 'fire',
    pal: ['#7a1a10', '#c0401a', '#ffd35a'],
    drops: [['cinder_heart', 1, 1, 0.45], ['night_ore', 1, 2, 0.2]], gear: [0.05, ['ember_heart', 'blood_rod', 'blood_bow']] },
  wraith: { name: 'Wraith', hp: 55, dmg: 22, def: 6, kbRes: 0.6, w: 14, h: 26, speed: 0.9, fly: true, ghost: true, sprite: 'wraith', burns: true,
    pal: ['#a9c4d6', '#8fa8bc', '#d0ffff'],
    drops: [['shroud', 1, 2, 0.8], ['silver_ore', 1, 3, 0.2], ['tonic', 1, 1, 0.08]], gear: [0.05, ['occult_sigil', 'moon_sceptre', 'shroud_cloak']] },
  thrall: { name: 'Vampire Thrall', hp: 85, dmg: 28, def: 8, kbRes: 0.3, w: 12, h: 28, speed: 1.55, sprite: 'thrall', jump: 7.4,
    pal: ['#d8d0d8', '#2a1a2a', '#7a0a1a', '#ff2a3a'],
    drops: [['cursed_blood', 1, 2, 0.7], ['greater_tonic', 1, 1, 0.06]], gear: [0.08, ['blood_ring', 'leech_fang', 'silver_scourge', 'raven_charm']] },
  dracula: { name: 'Count Dracula', hp: 3000, dmg: 38, def: 12, kbRes: 1, w: 16, h: 34, speed: 2.2, fly: true, ghost: true, boss: true, sprite: 'dracula',
    pal: ['#e8e0e8', '#16101c', '#8f1024', '#ff2a3a'],
    drops: [['dracula_fang', 1, 1, 1], ['vitae_crystal', 2, 3, 1], ['greater_tonic', 4, 6, 1]] },
};

/** [enemy, weight] */
export type SpawnRow = [string, number];
export const SPAWNS: Record<string, SpawnRow[]> = {
  hollow_night: [['ghoul', 70], ['bat', 30]],
  frost_night: [['frost_wight', 50], ['dire_wolf', 35], ['bat', 15]],
  frost_day: [['dire_wolf', 100]],
  marsh_night: [['bog_lurker', 60], ['bat', 25], ['ghoul', 15]],
  ash_night: [['husk', 55], ['dire_wolf', 30], ['bat', 15]],
  ash_day: [['dire_wolf', 100]],
  cursed_night: [['ghoul', 35], ['skeleton', 30], ['thrall', 15], ['bat', 20]],
  cursed_day: [['skeleton', 100]],
  underground: [['skeleton', 45], ['bat', 55]],
  caverns: [['skeleton', 35], ['bat', 28], ['bone_knight', 20], ['wraith', 17]],
  depths: [['wraith', 30], ['bone_knight', 35], ['bat', 15], ['skeleton', 20]],
  pit: [['imp', 50], ['wraith', 22], ['bone_knight', 28]],
  crypt: [['skeleton', 55], ['wraith', 25], ['bone_knight', 20]],
  castle: [['thrall', 38], ['skeleton', 30], ['wraith', 20], ['bone_knight', 12]],
  legion: [['skeleton', 45], ['bone_knight', 25], ['thrall', 20], ['bat', 10]],
};

// ---------------------------------------------------------------- loot

/** [item, min, max, weight] */
export type LootRow = [string, number, number, number];

export const URN_LOOT: LootRow[] = [
  ['torch', 3, 8, 20], ['arrow', 5, 12, 14], ['tonic', 1, 1, 10], ['throwing_knife', 4, 10, 8],
  ['iron_ore', 2, 5, 12], ['bone', 1, 3, 14], ['silver_ore', 1, 3, 4], ['wood', 3, 8, 10],
];

export interface ChestTier { main: string[]; fill: LootRow[]; crystal: number; luck: number; }
export const CHEST_LOOT: Record<string, ChestTier> = {
  outpost: { main: [], fill: [['torch', 10, 10, 1], ['tonic', 2, 2, 1], ['wood', 20, 20, 1], ['arrow', 20, 20, 1]], crystal: 0, luck: 0 },
  surface: {
    main: ['wooden_bow', 'hide_lash', 'bone_blade', 'wolf_boots', 'grave_wand', 'iron_ward'],
    fill: [['torch', 5, 15, 10], ['tonic', 1, 3, 8], ['arrow', 10, 25, 8], ['wood', 8, 20, 4], ['iron_ore', 4, 10, 6]],
    crystal: 0.1, luck: 0,
  },
  cave: {
    main: ['iron_sword', 'chain_whip', 'iron_longbow', 'grave_wand', 'miners_lantern', 'wolf_boots', 'iron_ward'],
    fill: [['torch', 5, 15, 10], ['tonic', 1, 3, 8], ['iron_bar', 2, 6, 8], ['arrow', 10, 25, 8], ['throwing_knife', 8, 20, 6]],
    crystal: 0.15, luck: 0,
  },
  crypt: {
    main: ['raven_charm', 'moon_locket', 'silver_saber', 'silver_scourge', 'silver_bow', 'moon_sceptre', 'duelist_sash', 'lash_glove', 'marksman_eye', 'occult_sigil'],
    fill: [['throwing_knife', 10, 25, 8], ['tonic', 2, 4, 8], ['bone', 4, 10, 6], ['silver_ore', 4, 10, 6], ['iron_bar', 4, 8, 8], ['silver_arrow', 10, 25, 6]],
    crystal: 0.3, luck: 0,
  },
  deep: {
    main: ['blood_greatsword', 'crimson_lash', 'blood_bow', 'blood_rod', 'blood_ring', 'leech_fang', 'shroud_cloak', 'raven_charm'],
    fill: [['silver_bar', 3, 7, 8], ['greater_tonic', 1, 3, 8], ['silver_arrow', 15, 35, 8], ['silver_knife', 10, 25, 6], ['blood_ore', 4, 10, 6]],
    crystal: 0.4, luck: 1,
  },
  pit: {
    main: ['night_claymore', 'duskfang', 'eclipse_bow', 'umbral_staff', 'ember_heart', 'leech_fang'],
    fill: [['night_ore', 4, 10, 8], ['greater_tonic', 2, 4, 8], ['cinder_heart', 1, 3, 6], ['blood_bar', 3, 6, 6]],
    crystal: 0.5, luck: 1,
  },
  castle: {
    main: ['blood_ring', 'leech_fang', 'silver_saber', 'silver_scourge', 'raven_charm', 'moon_locket', 'blood_rod', 'blood_bow'],
    fill: [['silver_bar', 3, 7, 8], ['greater_tonic', 1, 3, 8], ['silver_arrow', 10, 30, 8], ['cursed_blood', 1, 3, 6], ['candelabra', 1, 2, 3]],
    crystal: 0.45, luck: 1,
  },
};

// ---------------------------------------------------------------- ranks and missions

export interface RankDef { name: string; need: number; unlock: string; }
/** `need` is the renown required to advance out of the rank. */
export const RANKS: RankDef[] = [
  { name: 'Rookie', need: 30, unlock: '' },
  { name: 'Apprentice', need: 40, unlock: 'the furnace, iron arms and armour' },
  { name: 'Hunter', need: 45, unlock: 'silver gear and the Vanguard, Stalker and Acolyte sets' },
  { name: 'Slayer', need: 50, unlock: 'bloodstone gear' },
  { name: 'Vanquisher', need: 60, unlock: 'nightsteel gear and the Sanctified Stake' },
  { name: "Dracula's Bane", need: 0, unlock: 'the gratitude of the Order' },
];

export interface MissionDef {
  id: string; rank: number; title: string; text: string;
  kind: 'kill' | 'bring' | 'craft' | 'reach' | 'event';
  target: string; n: number; renown: number;
  /** Item rewards; ids of gear are rolled with a luck bonus. */
  reward: [string, number][];
}

const ms = (rank: number, id: string, title: string, text: string, kind: MissionDef['kind'], target: string, n: number, renown: number, reward: [string, number][]): MissionDef =>
  ({ id, rank, title, text, kind, target, n, renown, reward });

export const MISSIONS: MissionDef[] = [
  ms(0, 'r0_ghouls', 'First Blood', 'Put down ghouls that rise in Hollowwood at night.', 'kill', 'ghoul', 5, 12, [['tonic', 3]]),
  ms(0, 'r0_bench', 'Tools of the Trade', 'Build a workbench for the outpost.', 'craft', 'workbench', 1, 10, [['torch', 15]]),
  ms(0, 'r0_wood', 'Timber for the Outpost', 'Deliver deadwood to the quartermaster.', 'bring', 'wood', 30, 10, [['hide_lash', 1]]),
  ms(0, 'r0_down', 'Into the Dark', 'Scout the tunnels beneath the surface.', 'reach', 'underground', 1, 10, [['iron_ore', 12]]),
  ms(1, 'r1_iron', 'Iron Resolve', 'Smelt iron ingots at a furnace.', 'craft', 'iron_bar', 10, 14, [['iron_bar', 6]]),
  ms(1, 'r1_bones', 'Rattling Bones', 'Destroy skeletons in the underground.', 'kill', 'skeleton', 10, 14, [['iron_longbow', 1], ['arrow', 40]]),
  ms(1, 'r1_frost', 'Frostfell Patrol', 'Cull the wights that stalk the snow.', 'kill', 'frost_wight', 6, 14, [['greater_tonic', 2], ['wolf_boots', 1]]),
  ms(1, 'r1_bloom', 'Samples from the Mire', 'Bring mirebloom for the Order’s apothecary.', 'bring', 'mirebloom', 8, 12, [['tonic', 5], ['grave_wand', 1]]),
  ms(2, 'r2_silver', 'Silver for the Order', 'Smelt silver ingots. The dead fear it.', 'craft', 'silver_bar', 10, 15, [['silver_bar', 8]]),
  ms(2, 'r2_moon', 'Under a Crimson Moon', 'Be standing when a Crimson Moon sets.', 'event', 'crimson', 1, 18, [['vitae_crystal', 1], ['moon_locket', 1]]),
  ms(2, 'r2_wolves', 'Wolves at the Door', 'Hunt the dire wolves of Frostfell and the Ashlands.', 'kill', 'dire_wolf', 8, 14, [['silver_bow', 1]]),
  ms(2, 'r2_wraiths', 'The Unquiet', 'Banish wraiths in the caverns and crypts.', 'kill', 'wraith', 6, 15, [['occult_sigil', 1]]),
  ms(2, 'r2_castle', 'Scout the Keep', "Set foot inside the Count's castle.", 'reach', 'castle', 1, 12, [['greater_tonic', 3]]),
  ms(3, 'r3_blood', 'Blood from Stone', 'Smelt bloodstone ingots from the depths.', 'craft', 'blood_bar', 8, 16, [['blood_bar', 6]]),
  ms(3, 'r3_legion', 'Thin the Legion', "Break one of the Count's night assaults.", 'event', 'legion', 1, 20, [['vitae_crystal', 1], ['blood_ring', 1]]),
  ms(3, 'r3_thralls', 'Thralls of the Count', 'Destroy vampire thralls in and around the castle.', 'kill', 'thrall', 10, 18, [['leech_fang', 1]]),
  ms(3, 'r3_pit', 'Descend to the Pit', 'Reach the burning deep at the bottom of the world.', 'reach', 'pit', 1, 16, [['greater_tonic', 5]]),
  ms(4, 'r4_night', 'Nightsteel', 'Smelt nightsteel from umbrite ore.', 'craft', 'night_bar', 8, 20, [['night_bar', 6]]),
  ms(4, 'r4_imps', 'Snuff the Cinders', 'Slay cinder imps in the Pit.', 'kill', 'imp', 12, 20, [['ember_heart', 1]]),
  ms(4, 'r4_stake', 'The Stake', 'Forge a Sanctified Stake.', 'craft', 'sanctified_stake', 1, 20, [['greater_tonic', 5], ['vitae_crystal', 1]]),
  ms(4, 'r4_count', 'End the Night', 'Carry the stake to the altar in the keep and destroy Count Dracula.', 'kill', 'dracula', 1, 60, [['vitae_crystal', 3]]),
];
