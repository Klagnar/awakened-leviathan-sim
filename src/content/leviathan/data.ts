/**
 * Every id, stat, timing and damage number the simulator uses, each with where it came from and how far to trust it.
 *
 * Trust levels:
 * - "confirmed": read from the cache (RuneLite gameval) or an OSRS Wiki infobox.
 * - "inferred": follows from a source but is not stated outright.
 * - "unverified": a placeholder until someone measures it in game. Change these first when the sim feels wrong.
 *
 * Sources:
 * - [W]  https://oldschool.runescape.wiki/w/The_Leviathan (infobox "Awakened" version, 2026-11-06)
 * - [WS] https://oldschool.runescape.wiki/w/The_Leviathan/Strategies (Enrage phase, Awakened mode)
 * - [WP] https://oldschool.runescape.wiki/w/Abyssal_pathfinder
 * - [G]  RuneLite gameval NpcID / AnimationID / SpotanimID / ItemID (runelite/runelite master, 2026-11-06)
 * - [WI] OSRS Wiki item pages: Webweaver_bow, Phoenix_necklace, Anglerfish
 * - [SI] https://oldschool.runescape.wiki/w/List_of_sound_IDs (cache sound names, 2026-11-06)
 * - [R]  https://www.reddit.com/r/2007scape/comments/1gc315l/ (players comparing awakened enrage speeds)
 * - [RW] https://www.reddit.com/r/2007scape/comments/15bnix4/ ("I did the maths: Webweaver vs Leviathan")
 */

export type Trust = "confirmed" | "inferred" | "unverified";

export type Fact<T> = Readonly<{ value: T; trust: Trust; source: string }>;

const fact = <T>(value: T, trust: Trust, source: string): Fact<T> => ({ value, trust, source });

export const NPC = {
  leviathan: fact(12214, "confirmed", "[G] NpcID.LEVIATHAN; [W] id2 (awakened uses the post-quest id)"),
  pathfinder: fact(12220, "confirmed", "[G] NpcID.LEVIATHAN_BUFF_NPC, 'Abyssal pathfinder'; [WP]"),
  tornado: fact(12222, "confirmed", "[G] NpcID.LEVIATHAN_TORNADO; [WS] true tile id 12222"),
} as const;

/** Cache sequences. Every one listed here is baked into the NPC payload, so keep only those the code plays. */
export const SEQ = {
  idle: fact(10276, "confirmed", "[G] NPC_LEVIATHAN_01_IDLE_01"),
  projectileSingle: fact(10281, "inferred", "[G] NPC_LEVIATHAN_01_PROJECTILE_SINGLE_01; one orb per enraged attack"),
  bite: fact(10283, "inferred", "[G] NPC_LEVIATHAN_01_MELEE_01; the bite next to the pool"),
  roar: fact(10290, "inferred", "[G] NPC_LEVIATHAN_01_EXPLOSION_START; the roar that drops debris"),
  death: fact(10293, "confirmed", "[G] NPC_LEVIATHAN_01_DEATH"),
  pathfinderIdle: fact(10295, "confirmed", "[G] NPC_BUFF01_IDLE01"),
  pathfinderSpawn: fact(10296, "confirmed", "[G] NPC_BUFF01_SPAWN01"),
  pathfinderDespawn: fact(10297, "confirmed", "[G] NPC_BUFF01_DESPAWN01"),
  tornado: fact(8100, "confirmed", "cache 2499 NPC 12222: standing and walking sequence"),
  /** The player's cheer emote, played on the kill. */
  cheer: fact(862, "confirmed", "[G] AnimationID.EMOTE_CHEER"),
} as const;

/**
 * Cache sound effects the server plays for the boss's attacks; the cache links none of them to a sequence. The bite's
 * own sound (7029, dt2_levboss_melee_01) already plays from SEQ.bite's frame sounds.
 */
export const SOUND = {
  rangedLaunch: fact(7041, "confirmed", "[SI] dt2_levboss_range_launch_sound_01"),
  rangedImpact: fact(7026, "confirmed", "[SI] dt2_levboss_ranged_impact_sound_01"),
  magicLaunch: fact(7030, "confirmed", "[SI] dt2_levboss_magic_launch_sound_01"),
  magicImpact: fact(7023, "confirmed", "[SI] dt2_levboss_magic_impact_sound_01"),
  biteImpact: fact(7025, "confirmed", "[SI] dt2_levboss_melee_impact_sound_01"),
  rubbleImpact: fact(7049, "confirmed", "[SI] dt2_levboss_rubble_impact_01"),
  tornadoImpact: fact(7021, "confirmed", "[SI] dt2_levboss_tornado_impact_01"),
  volume: fact(0.1, "inferred", "the SDK plays cache effects at 0.1 (prayers, Manticore orbs)"),
} as const;

/** Cache models drawn on their own. */
export const MODEL = {
  debris: fact(49266, "inferred", "cache 2499: model of the unnamed 1x1 object 47590 (and of 'Rubble' 57287), the landed rock; the falling spotanims' model 49264 needs their animation to line up"),
} as const;

export const SPOT = {
  rangedOrb: fact(2487, "confirmed", "[G] VFX_LEVIATHAN_01_PROJECTILE_RANGED_01 (green)"),
  magicOrb: fact(2489, "confirmed", "[G] VFX_LEVIATHAN_01_PROJECTILE_MAGIC_01 (blue)"),
  rangedImpact: fact(2490, "confirmed", "[G] VFX_LEVIATHAN_01_PROJECTILE_IMPACT_RANGED_01"),
  magicImpact: fact(2492, "confirmed", "[G] VFX_LEVIATHAN_01_PROJECTILE_IMPACT_MAGIC_01"),
  pathfinderSpawn: fact(2298, "confirmed", "[G] LEVIATHAN_BUFF_SPAWN"),
  debrisFalling: fact(2475, "inferred", "[G] SPOTANIM_BRAIN_01_FALLING_BREAK_01; listed with the Leviathan's effects, breaks on landing"),
  debrisStays: fact(2477, "inferred", "[G] SPOTANIM_BRAIN_01_FALLING_STAY_01; the debris that stays as a blocker"),
  /** The fireworks for reaching 99 in every skill, played on the kill. */
  levelUpMax: fact(1389, "confirmed", "[G] SpotanimID.LEVELUP_MAX (LEVELUP_99_ANIM 1388 is a single 99)"),
} as const;

export const ITEM = {
  twistedBow: fact(20997, "confirmed", "[G] ItemID.TWISTED_BOW"),
  webweaverBow: fact(27655, "confirmed", "[G] ItemID.WILD_CAVE_WEBWEAVER_CHARGED; [WI] id2"),
  phoenixNecklace: fact(11090, "confirmed", "[G] ItemID.JEWL_NECKLACE_OF_PHOENIX; [WI]"),
  anglerfish: fact(13441, "confirmed", "[G] ItemID.ANGLERFISH; [WI]"),
  seekingDragonArrows: fact(33595, "confirmed", "[WI] Seeking dragon arrow, item ID 33595, released 30 June 2026"),
  masoriMaskF: fact(27235, "confirmed", "[G] ItemID.MASORI_MASK_FORTIFIED"),
  masoriBodyF: fact(27238, "confirmed", "[G] ItemID.MASORI_BODY_FORTIFIED"),
  masoriChapsF: fact(27241, "confirmed", "[G] ItemID.MASORI_CHAPS_FORTIFIED"),
  zaryteVambraces: fact(26235, "confirmed", "[G] ItemID.ZARYTE_VAMBRACES"),
  dizanasQuiver: fact(28951, "confirmed", "[G] ItemID.DIZANAS_QUIVER_CHARGED"),
  avernicTreadsMax: fact(31097, "confirmed", "[G] ItemID.AVERNIC_TREADS_MAX"),
  venatorRing: fact(28310, "confirmed", "[G] ItemID.VENATOR_RING"),
  dragonArrows: fact(11212, "confirmed", "[G] ItemID.DRAGON_ARROW"),
} as const;

export const MAP = {
  /** (2081 >> 6) << 8 | (6372 >> 6). */
  region: fact(8291, "inferred", "[W] LocLine 2081,6372 for The Leviathan in the Scar"),
  /** OpenRS2 cache with XTEA keys for the region; 2746 (Oct 2026) has none. */
  openrs2Cache: fact(2499, "confirmed", "https://archive.openrs2.org/caches/runescape/2499 (build 236, 2026-03-18), keys for mapsquare 8291"),
  /** Lowers the compiled scene so its floor meets the SDK's ground plane (tiles). */
  sceneElevation: fact(-1.3125, "inferred", "the bridged platform's plane 1 heights are 232-256 against the region's base of 88; its highest tile, (256 - 88) / 128, meets the ground so tile overlays stay above it"),
} as const;

export const BOSS = {
  name: fact("The Leviathan", "confirmed", "[W]"),
  combatLevel: fact(1157, "confirmed", "[W] combat2"),
  size: fact(7, "confirmed", "[W] size"),
  maxHp: fact(2700, "confirmed", "[W] hitpoints2; [WS] 'The boss's health increases from 900 to 2,700'"),
  stats: fact({ attack: 525, strength: 630, defence: 287, range: 280, magic: 280 }, "confirmed", "[W] att2 str2 def2 range2 mage2"),
  attackBonuses: fact({ stab: 0, slash: 0, crush: 200, magic: 160, range: 300 }, "inferred", "[W] attbns 200 (melee), amagic 160, arange 300; melee bonus placed on crush, the bite's style is not listed"),
  otherBonuses: fact({ meleeStrength: 22, rangedStrength: 26, magicDamage: 58, prayer: 0 }, "confirmed", "[W] strbns 22, rngbns 26, mbns 58"),
  defenceBonuses: fact({ stab: 260, slash: 190, crush: 230, magic: 280 }, "confirmed", "[W] dstab dslash dcrush dmagic"),
  /** The SDK holds one ranged defence; arrows roll against standard. */
  rangedDefence: fact(50, "confirmed", "[W] dstandard 50 (dlight 50, dheavy 25)"),
} as const;

export const ENRAGE = {
  /** The boss enters enrage at 20%; the sim starts just under it. */
  startFraction: fact(0.199, "inferred", "owner asked for 19.9%; [WS] enrage begins at 20% (540 of 2,700)"),
  attackSpeed: fact(1, "confirmed", "[WS] Awakened: 'Its enraged attack speed is doubled to one tick (0.6s)'"),
  /** Ticks from an orb leaving the boss to it landing; prayer and the aura are checked on landing. */
  orbFlightTicks: fact(
    2,
    "inferred",
    "[R] awakened enrage is '1t speed, 1t look ahead' (an orb lands two ticks after it appears), against '0t look ahead' for normal volley 7; [WS] volley 6 gives '2 ticks to react'",
  ),
  styles: fact(["ranged", "magic"] as const, "confirmed", "[WS] 'It will only use magic and ranged orbs in this state'"),
  maxHit: fact({ ranged: 41, magic: 55, bite: 86 }, "confirmed", "[W] max hit2: 86 (Melee orb & Bite), 41 (Ranged orb), 55 (Magic orb)"),
  /** A bite replaces an orb this often while the player stands next to the pool. */
  biteChance: fact(
    1 / 3,
    "unverified",
    "[WS] enraged it uses magic and ranged orbs but can still bite when adjacent to the pool (incl. diagonals), in place of an orb; owner: in reach it picks evenly from magic, ranged and the bite; the rate is not documented",
  ),
  roarChip: fact(7, "unverified", "[WS] 'up to 7 chip damage from the roar' (normal mode)"),
  /** Ticks between the enrage roar and the first orb. */
  roarTicks: fact(2, "unverified", "roar animation length not measured"),
  /** Hits that get through roll 0 to max with no accuracy roll. */
  rollsWithoutAccuracy: fact(true, "unverified", "the boss's accuracy against the player is not modelled"),
  /** Outside the aura the right prayer only cuts the hit down to chip damage: the roll is capped at this share of the max. */
  piercedFraction: fact(0.25, "unverified", "[WS] 'its attacks will pierce through protection prayers'; players describe the result as chip damage, the share is not documented"),
} as const;

export const PATHFINDER = {
  /** Chebyshev radius of the aura from the pathfinder's centre tile: its 3x3 body plus 2 tiles each way, a 7x7 square. */
  auraRadius: fact(
    3,
    "confirmed",
    "[WP] 'a 7x7 area in the awakened encounter'; cache NPC 12220 has size 3; [WS] RuneLite Radius Markers: NPC 12220, 'Ranged attack range of 2 for Awakened'",
  ),
  /** Tiles moved per tick along its clockwise loop. */
  tilesPerTick: fact(1, "unverified", "[WP] 'will begin to move clockwise'; speed not documented"),
  /** Ticks after spawning before it starts moving. */
  spawnDelayTicks: fact(2, "unverified", "spawn animation length not measured"),
  minHitFraction: fact(0.2, "confirmed", "[WP] Mod Ash: 'ensuring you hit for at least 20% of your max'"),
  /** Inside the aura one Webweaver spec deals this share of the boss's max HP, rolled evenly across its hits. */
  specBossHpShare: fact(
    { min: 0.035, max: 0.05 },
    "unverified",
    "owner: two specs in the aura take 7 to 10% of the boss; [RW] players saw spec hits up to the bow's full max in the enrage, not 40% of it; [WS] two specs take the awakened enrage from 540 to ~360. The real roll is not documented",
  ),
} as const;

export const DEBRIS = {
  /** A single rock that breaks on landing falls this often, the gap rolled afresh each time. Nothing falls as the phase starts. */
  scatterEveryTicks: fact(
    { min: 3, max: 6 },
    "unverified",
    "[WS] each roar makes 'debris to fall around the arena'; enrage: 'debris will continually drop from above, including the permanent blocker debris'; [G] SPOTANIM_BRAIN_01_FALLING_BREAK_01; owner: nothing falls on you as it starts, then now and then a single rock a few tiles from you to avoid; the cadence is not documented",
  ),
  /** How far from the player, in tiles, a single rock lands: near enough to be in the way, never on them. */
  scatterRange: fact({ min: 2, max: 5 }, "unverified", "owner: a single rock falls a few tiles ahead, to avoid; not on the player"),
  /** A '+' of rocks that stay falls this often, the gap rolled afresh each time. */
  plusEveryTicks: fact(
    { min: 25, max: 40 },
    "unverified",
    "[WS] Awakened: 'The permanent blocker debris is increased, from one to five dropped in a \"+\" style formation on the player'; [G] SPOTANIM_BRAIN_01_FALLING_STAY_01; owner: the fives are somewhat rare and something to path around; the cadence is not documented",
  ),
  /** How far from the player, in tiles, a '+' is centred: close enough to block their way, not on them. */
  plusRange: fact({ min: 3, max: 6 }, "unverified", "owner: the fives do not target the player directly, and never land so as to block the way forward"),
  /** Ticks between the shadow appearing and the rock landing. */
  warningTicks: fact(
    3,
    "unverified",
    "[WS] Smoke Blast: 'The debris take two ticks to land' (that attack, not the enrage); owner: there should be time between the shadow and the impact",
  ),
  maxHit: fact(25, "unverified", "[WS] 'Rocks ... max hit if not protected 25' (normal mode)"),
  /** Offsets from its centre of the blocker rocks: a '+' of five. */
  plus: fact<readonly (readonly [number, number])[]>(
    [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]],
    "inferred",
    "[WS] Awakened: 'The permanent blocker debris is increased, from one to five dropped in a \"+\" style formation'",
  ),
  /** Blockers already standing as the enrage starts: the floor's outer ring. */
  preEnrageEdges: fact(true, "inferred", "[WS] Awakened: debris lands in a '+' on the player each volley; 'simply fill a row or column accordingly at the edges of the arena'"),
} as const;

/** [WS] Awakened: 'Upon reaching 50% of its health, a tornado will spawn in the arena and move towards the player.' */
export const TORNADO = {
  /** Loop tiles behind the player's start as the enrage begins, so it trails them round the pool. */
  startsBehind: fact(
    8,
    "unverified",
    "[WS] 'luring the tornado as south as possible to get a head-start once starting the phase'; owner: it trails just behind as the enrage starts, never waiting round a corner",
  ),
  /** The pathfinder's pace round the loop, along the tiles the player walked. */
  tilesPerTick: fact(
    1,
    "unverified",
    "owner: same pace as the pathfinder, following the player's path; a player who keeps up with the pathfinder is not caught, and ground lost by falling behind comes back on getting in front again",
  ),
  damage: fact({ min: 40, max: 50 }, "unverified", "[WS] 'This will deal 40+ damage if it makes contact'"),
  /** Ticks it is gone after a hit before it comes back on the tile where it hit. */
  goneAfterHit: fact(
    4,
    "unverified",
    "owner: after a hit it respawns on the same tile about 4 ticks (2.4 s) later; the wiki, guides and cache names do not document it",
  ),
} as const;

export const PLAYER = {
  /** Base 99s; Rigour and a ranging boost are left to the player. */
  rangedLevel: fact(99, "inferred", "max-ranged setup"),
} as const;

export const ITEM_STATS = {
  webweaver: fact(
    { range: 85, rangedStrength: 65, speed: 4, attackRange: 9, specDrain: 50, specHits: 4, specMaxFraction: 0.4, specAccuracy: 2 },
    "confirmed",
    "[WI] Webweaver bow: arange +85, rstr +65, speed 4, range 9; Swarm: 50% energy, four hits, doubled accuracy, each up to 40% (rounded up) of max hit",
  ),
  phoenix: fact({ triggerFraction: 0.2, healFraction: 0.3 }, "confirmed", "[WI] Phoenix necklace: restores 30% of max when at or below 20%, once, and clears pending hits"),
  /** Heal = floor(level / 10) + bonus; 99 Hitpoints heals 22 and may overheal to 121. */
  anglerfishBonus: fact(13, "confirmed", "[WI] Anglerfish healing formula, bonus 13 at 93+ Hitpoints"),
  seekingDragonArrows: fact(
    { range: 20, rangedStrength: 60, minHit: 3 },
    "confirmed",
    "[WI] Seeking dragon arrow: arange +20 (bows only, 8 July 2026 update), rstr +60; 'increasing the player's minimum hit from 1 to 3 upon a successful hit'",
  ),
  /** Boosted level = level + flat + floor(level * fraction): 112 at 99 Ranged. */
  rangingPotion: fact({ flat: 4, fraction: 0.1 }, "confirmed", "[WI] Ranging potion: boosts Ranged by 4 + 10%"),
} as const;
