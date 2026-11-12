# Gravewrought

*Working title.* A gothic sandbox for the browser: dig, forge and survive the night beneath a ruined castle.

It blends two genres: the mood of a gothic action-platformer and the systems of a crafting sandbox. Everything in it is original. All art is drawn by code at startup, the music is an original chiptune piece synthesised in the browser, and no code or assets come from any other game.

## What is in this build (v0.1)

- A procedurally generated world: withered surface, dead forest, winding caves, three ore tiers, buried crypts, and a ruined castle with a catacomb beneath it
- Mining, chopping, building with blocks, platforms and background walls
- Crafting at three stations (workbench, furnace, anvil) with 47 recipes
- Swords, whips, bows, thrown weapons, four armour sets and seven accessories
- Random weapon prefixes (Keen, Savage, Dread, Rusted and so on) on crafted and looted gear
- Loot chests, breakable urns and life-raising Vitae Crystals
- Four enemies (ghoul, skeleton, crypt bat, wraith), a day/night cycle, and dynamic coloured lighting
- Music that changes with where you are: day, night, cave and castle
- Automatic saving in the browser

## Controls

| Input | Action |
| --- | --- |
| A / D | Walk |
| Space or W | Jump (hold for height) |
| S | Drop through platforms |
| Left mouse | Use the held item: swing, mine, place, shoot |
| Right mouse | Open chests; in the bag, equip gear or split a stack |
| 1 to 0, mouse wheel | Choose a hotbar slot |
| E or Tab | Open the bag, equipment and crafting |
| Shift + click | Quick-move between bag and chest |
| M | Mute |
| H | Help |

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

## Project layout

| File | Purpose |
| --- | --- |
| `src/defs.ts` | Tiles, items, recipes, enemies and loot tables. Most balance and content changes happen here. |
| `src/world.ts` | World storage, generation and save encoding |
| `src/game.ts` | Simulation: player, combat, mining, building, crafting, enemies |
| `src/render.ts` | Sky, parallax, tiles, lighting and character drawing |
| `src/art.ts` | Procedural tile, wall, icon and scenery art |
| `src/ui.ts` | HUD, bag, equipment, chests, crafting, tooltips and title screen |
| `src/audio.ts` | Synthesised music and sound effects |
| `src/input.ts`, `src/main.ts` | Input handling, main loop, scaling, saving |

## Ideas for what comes next

- A boss summoned at the altar in the castle's highest hall
- More enemies, biomes and a deeper underworld
- Doors, furniture and more decorative castle pieces
- Magic weapons and a mana bar
- Friendly characters who move into what you build
- Touch and gamepad controls
