# Awakened Leviathan Simulator: Enrage Phase

A browser practice tool for the last 20% of the Awakened Leviathan. You start on the abyssal pathfinder in max ranged
gear with the boss on 537/2700 HP (19.9%), and it throws an orb every tick until one of you dies.

> Created using intellectual property belonging to Jagex Limited under the terms of Jagex's Fan Content Policy. This
> content is not endorsed by or affiliated with Jagex.

## Run it

```bash
nvm use 22
npm ci
npm run build:site   # the beta SDK, the cache reader, the cache assets, then the site in dist/
npm start            # http://127.0.0.1:8002
```

`npm run build:site` (`scripts/build.sh`) downloads the cache reader and the OpenRS2 cache into
`node_modules/.cache/leviathan-build/` on the first run and reuses them after. It extracts the boss, the pathfinder,
the tornado, the debris rock, the arena (region 8291) and three item icons from OpenRS2 cache 2499 into
`public/osrs-assets/`. Newer caches have no XTEA keys for the region. Run `npm test` and `npm run typecheck` before
changing anything.

Every push to `main` builds the site and publishes it to GitHub Pages (`.github/workflows/pages.yml`), after the
typecheck and tests pass. In the repository's Settings → Pages, set Source to "GitHub Actions" once.

URL options: `?hp=19.9` (boss HP percentage), `?seed=123` (replays a run), `?aura=0` (hides the aura overlay),
`?bite=0` (hides the red tile markers round the bite reach). The controls under the chat set the same options.

## What you get

- **Setup**: Webweaver bow, Seeking dragon arrows, Masori (f), Phoenix necklace, Dizana's quiver, Zaryte vambraces, Avernic
  treads (max) and Venator ring. Your inventory holds the Twisted bow, a Necklace of anguish for when the Phoenix
  necklace pops, and 13 anglerfish each with a karambwan to its right, so you can eat both on the same tick. Anglerfish
  overheal to 121. You start at 120 Hitpoints, as if you ate an angler before the enrage, and 112 Ranged, as if you
  just sipped a ranging potion, on the prayer tab with Rigour and Protect from Range on.
- **Controls**: F1 opens the inventory, F2 the prayers, F3 the equipment and F4 the spellbook. These are set on your
  first visit; change them in the settings tab and your choice sticks. Sound starts on; untick Sound and it stays off. The side panel grows up to three times its usual size
  as far as the window height allows, and the minimap and its orbs are drawn 1.6 times larger so the special attack orb
  is easy to hit.
- **The boss**: a ranged (max 41) or magic (max 55) orb every tick. If you stand next to the pool's rim (diagonals
  included) it may bite instead (max 86); red tile markers outline those tiles. Each attack, falling rock and tornado
  hit has its in-game sound effect (tick Sound under the chat).
- **The abyssal pathfinder**: it spawns on the north-west corner, or the next corner clockwise if debris blocks it, and
  walks clockwise round the pool. Its aura is a 7x7 square: its 3x3 body plus 2 tiles on each side. It steps before
  the boss's hits land each tick, so a hit is judged against the square round its next tile: the row just behind it
  is never safe. The blue tiles show that square, less bite reach and rocks, so standing on blue with the right prayer
  always takes 0. Inside the aura your ranged attacks always hit, each for at least 20% of your
  max, and the right protection prayer blocks orbs completely. Outside it, the right prayer still lets chip damage
  through, and the wrong one takes the full hit.
- **Debris**: the arena's outer ring of tiles is already filled with rocks, as if you had dropped your pre-enrage
  debris along the walls. Nothing falls on you as the enrage starts. Every 3 to 6 ticks a single rock falls 2 to 5 tiles
  from you, never on your tile, and breaks when it lands: something to avoid as you move. Every 25 to 40 ticks a '+' of
  five lands centred 3 to 6 tiles from you and stays as blockers for you and the tornado, still there when you
  come round the loop again. A '+' never lands where it would close the way round the pool or wall off any floor. A shadow can be walked through; only a landed rock blocks, and clicking a rock walks you to the nearest open tile. Each rock lands three ticks after its shadow appears; the shadow turns darker on its last
  tick, when it is too late to move. Step off before then to dodge it; a dodged rock leaves no hitsplat, and a blocker
  that lands on you hits you instead of staying. All rocks clear when the boss dies, and you cheer under the fireworks
  for 99 in every skill.
- **Why you took damage**: every hit that does damage gets a chat line naming its source: an orb with the wrong prayer,
  an orb through the right prayer and how many tiles outside the aura you stood, a falling rock, the tornado, or the
  roar as the enrage starts.
- **The tornado**: it has been out since 50% and starts 8 tiles behind you on the pathfinder's loop, where you lured
  it. It closes in at the pathfinder's pace, a tile a tick counted round the loop, walking the tiles you walked: keep
  up with the pathfinder and it never reaches you, however you go round rocks or corners, but stop, fall back or turn
  round and it closes in, up to two tiles a tick. Ground you lose by falling behind comes back when you run in front of
  the pathfinder again. A rock that lands on your path slows it a tile. It hits for 40 to 50 when it reaches your tile, then vanishes for 4 ticks and comes back on the tile where it hit you.
- **Items**: the Webweaver's special fires four hits for 50% energy, with doubled accuracy and each hit up to 40% of
  the max. Inside the pathfinder's aura each spec takes 3.5 to 5% of the boss's HP instead (24 to 33 a hit), so two
  specs take 7 to 10%. The Phoenix necklace restores 30% of your HP once when you drop to 20% or below, and cancels hits still in
  flight. Anglerfish heal 22 and can overheal. Seeking dragon arrows give the Twisted bow +20 ranged attack over
  dragon arrows and make every successful hit at least 3; the Webweaver fires its own arrows and ignores them. They
  are newer than the cache the sim extracts from, so they show the dragon arrow icon.

## What is a guess

Every number lives in `src/content/leviathan/data.ts` with its source and a trust level. These are marked
`unverified`; change them there if you know better:

| Value | Used | Why it is a guess |
| --- | --- | --- |
| Orb flight time | 2 ticks: each orb lands two ticks after it appears | Players call the awakened enrage "1t look ahead"; the wiki has no number |
| Bite chance next to the pool | 1 in 3 attacks, each in place of an orb: magic, ranged or bite evenly | The wiki says when it bites, not how often |
| Damage through prayer outside the aura | up to a quarter of the max (10 ranged, 13 magic) | The wiki says the attacks "pierce" prayer, not how much |
| Boss accuracy | always rolls 0 to max | Not modelled |
| Pathfinder speed and route | 1 tile a tick, 4 tiles from the pool | The wiki only says "clockwise" |
| Debris timing, max hit and which rocks stay | a single 2 to 5 tiles from you every 3 to 6 ticks that breaks; a '+' of five centred 3 to 6 tiles from you every 25 to 40 ticks that stays; 3 ticks from shadow to landing; 25 | The wiki says debris falls around the arena with permanent blockers (a '+' in Awakened), and the cache has a breaking and a staying rock; the max hit is from normal mode; the rest is from play |
| Roar length before the first orb | 2 ticks | Not measured |
| Tornado speed, damage and time gone after a hit | 1 tile a tick, 40 to 50, 4 ticks | The wiki says only that it chases you and hits for "40+"; vanishing and coming back where it hit is from play |
| Tornado start tile | 8 tiles behind you on the loop | The guide says to lure it south before the enrage |
| Tornado route | Along the tiles you walked, round any rock that lands on them | From play; the wiki says only that it chases you |
| Webweaver spec in the aura | 3.5 to 5% of the boss's HP a spec | Players saw hits at the full max; the wiki gives 40% of max and ~180 for two specs; tuned to two specs taking 7 to 10% |

The wiki's "Abyssal protector" is a Guardians of the Rift pet. The NPC that buffs you in this fight is the **abyssal
pathfinder** (NPC 12220), so that is where you spawn.

## Credits

- Base tooling (build, asset pipeline, item icons, split asset loading, effects) forked from
  [ocellus-sim](https://github.com/alessandrorodi/ocellus-sim) by Alessandro Rodi, itself built on Julian-Dasilva's
  [ArchiveOcellusTrainer](https://github.com/Julian-Dasilva/ArchiveOcellusTrainer), and Julian-Dasilva's cache reader
  fork.
- **OldSchoolSDK / Supalosa**: [osrs-sdk](https://github.com/OldSchoolSDK/osrs-sdk), the engine.
- **The OSRS Wiki editors**: [The Leviathan](https://oldschool.runescape.wiki/w/The_Leviathan) and its strategies page.
- **Jagex**: every game asset. No game files are stored in this repository; they are extracted from the cache when
  you build.

## Licence

GPL-3.0, like ocellus-sim and osrs-sdk. See [LICENSE](LICENSE).
