# Gravewrought

*Working title.* A gothic sandbox for the browser. You are a rookie monster hunter in the service of the Van Helsing Order. Take missions, rise through the ranks, and carry a stake to Count Dracula's keep.

It blends two genres: the mood of a gothic action-platformer and the systems of a crafting sandbox. Everything in it is original. All art is drawn by code at startup, the music is an original chiptune piece synthesised in the browser, and no code or assets come from any other game. Dracula and Van Helsing come from Bram Stoker's 1897 novel, which is in the public domain.

## What is in this build (v0.3)

**The world**

- A large generated world (1500 × 450 tiles) with five surface biomes: Hollowwood, Frostfell, Mirewood, the Ashlands and the Cursed Grounds
- Four layers below ground: Underground, Caverns, the Depths and the Pit, each with its own stone, ore and enemies
- The Order's outpost at the spawn point (safe ground), ruined watchtowers, buried crypts, and the Count's castle with catacombs beneath it
- A day/night cycle, coloured lighting, and music that follows where you are

**The hunt**

- Six hunter ranks, from Rookie to Dracula's Bane, earned by completing missions in the journal
- 21 missions: kills, deliveries, crafting, scouting, surviving events, and the Count himself
- Each rank unlocks a new tier of crafting (85 recipes in all) and lets rarer gear appear
- Three world events: the Crimson Moon, the Grave Fog and the Legion Assault
- Count Dracula as the final boss, summoned at the altar in his keep

**Gear**

- Four fighting styles defined by what you carry and wear, with no class to pick: blades, whips, ranged weapons and arcane weapons that spend spirit
- Nine armour sets, some built for one style, each with a three-piece set bonus
- Thirteen trinkets in four slots, several of which boost one style
- Six rarities, Common to Mythic. Every weapon, armour piece and trinket rolls its rarity, base quality and bonus stats when it is crafted, dropped, awarded or first found in a chest
- Eleven enemies plus the Count

## Controls

| Input | Action |
| --- | --- |
| A / D | Walk |
| Space or W | Jump (hold for height) |
| S | Drop through platforms |
| Left mouse | Use the held item: swing, mine, place, shoot, cast |
| Right mouse | Open chests and the dispatch board; in the bag, equip gear or split a stack |
| 1 to 0, mouse wheel | Choose a hotbar slot |
| E or Tab | Open the bag, equipment and crafting |
| J | Hunter's journal: rank and missions |
| Shift + click | Quick-move between bag and chest |
| M | Mute |
| H | Help |

### Touch screens

On a phone or tablet the game shows on-screen controls the first time you touch the screen. The title screen has a **Touch controls** option to force them on or off. Play in landscape.

| Control | Action |
| --- | --- |
| Left stick | Walk; pull down to drop through platforms |
| Right stick | Aim and use the held item |
| Jump button | Jump (hold for height) |
| Touch the world | Use the held item at that spot |
| Tap a chest, the dispatch board or the altar | Interact |
| Tap the hotbar | Choose a slot |
| Bag, Journal and ? buttons | Open the bag, the journal and help |
| In the bag | Tap an item to inspect it, tap again to pick it up, hold to equip or split |

## Run it locally

Needs [Node.js](https://nodejs.org) 18 or newer.

```
npm install
npm run dev
```

Then open the address it prints. Add `?seed=12345` to the address to generate a specific world.

## Publish to itch.io

1. Run `npm run build`. This creates a `dist` folder.
2. Zip the **contents** of `dist` so that `index.html` is at the top level of the zip.
3. On itch.io, create a new project and set **Kind of project** to **HTML**.
4. Upload the zip and tick **This file will be played in the browser**.
5. Under **Embed options**, set the viewport to **1280 × 720** and enable the **Fullscreen button**.

The game renders at 640 × 360 and scales up in whole or half steps, so 1280 × 720 and 1920 × 1080 are both pixel-sharp.

## Changing the look later

The artwork is separate from the game rules, so it can be replaced without touching mechanics:

- `src/art.ts` builds every tile, wall, item icon and tree. Each has one small painter function, and the results go into sprite sheets the renderer reads from.
- `src/render.ts` draws the player, enemies and sky.
- Nothing in `src/game.ts`, `src/world.ts` or `src/defs.ts` depends on what things look like.

To use bought or commissioned art, the sheets in `art.ts` would be loaded from image files instead of painted. Look for side-view pixel art with **16 × 16 tiles**, characters around 16 × 32, and a licence that allows commercial use.

## Project layout

| File | Purpose |
| --- | --- |
| `src/defs.ts` | Tiles, items, gear rolls, recipes, enemies, loot, ranks and missions. Most balance and content changes happen here. |
| `src/world.ts` | World storage, generation and save encoding |
| `src/game.ts` | Simulation: player, combat, mining, building, crafting, missions, events, the boss |
| `src/render.ts` | Sky, parallax, tiles, lighting and character drawing |
| `src/art.ts` | Procedural tile, wall, icon and scenery art |
| `src/ui.ts` | HUD, bag, equipment, chests, crafting, journal, tooltips and title screen |
| `src/audio.ts` | Synthesised music and sound effects |
| `src/input.ts`, `src/main.ts` | Input handling, main loop, scaling, saving |

The name of the Order is one constant, `ORG_NAME`, at the top of `src/defs.ts`.

## Ideas for what comes next

- Lieutenants of the Count as mid-game bosses
- Repeatable bounties once a rank's missions are done
- Friendly members of the Order who move into the outpost and sell supplies
- Liquids, doors, furniture and more castle decoration
- Touch and gamepad controls
