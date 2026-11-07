import { ControlPanelController, DragonArrows, Karambwan, NecklaceOfAnguish, Random, TileMarker } from "osrs-sdk";
import { Anglerfish, LeviathanTwistedBow, PhoenixNecklace, SeekingDragonArrows, WebweaverBow } from "../gear/items";
import { DEBRIS, ENRAGE, ITEM_STATS, PATHFINDER, SEQ, SPOT, TORNADO } from "../data";
import { spawnCornerIndex } from "../fight";
import { BOSS_ANCHOR, CORNER_INDICES, PATH_CORNERS, PATH_LOOP, PATH_RING, cutsLoop, distanceToPool, edgeTiles, floorTiles, inBiteReach, isFloor, reachable } from "../geometry";
import { chebyshev, sameTile, tile } from "../types";
import type { HitRecord, Tile } from "../types";
import { startFight } from "./harness";

describe("the arena", () => {
  test("the pathfinder's loop is all floor, clockwise from the north-west corner, and stays out of bite reach", () => {
    expect(PATH_LOOP[0]).toEqual(PATH_CORNERS[0]);
    expect(PATH_LOOP.every(isFloor)).toBe(true);
    expect(PATH_LOOP.some(inBiteReach)).toBe(false);
    PATH_LOOP.forEach((at, i) => expect(chebyshev(at, PATH_LOOP[(i + 1) % PATH_LOOP.length])).toBe(1));
    // Clockwise with y growing south: the first leg runs east.
    expect(PATH_LOOP[1].x).toBeGreaterThan(PATH_LOOP[0].x);
  });

  test("the bite reaches the floor round the pool's rim, diagonals included", () => {
    expect(inBiteReach(tile(29, 23))).toBe(true);
    expect(inBiteReach(tile(28, 27))).toBe(true);
    expect(inBiteReach(tile(27, 27))).toBe(false);
    expect(inBiteReach(tile(29, 27))).toBe(false);
  });

  test("unsaved tile markers outline every tile in bite reach", () => {
    const run = startFight({ showBiteReach: true });
    const marked = run.region.entities.filter((entity): entity is TileMarker => entity instanceof TileMarker);
    expect(marked.length).toBeGreaterThan(0);
    expect(marked.every((marker) => inBiteReach(marker.location) && !marker.saveable)).toBe(true);
    expect(marked.length).toBe(floorTiles().filter(inBiteReach).length);
  });

  test("the pathfinder spawns at the next corner clockwise when debris blocks one", () => {
    expect(spawnCornerIndex(() => false)).toBe(CORNER_INDICES[0]);
    expect(spawnCornerIndex((at) => sameTile(at, PATH_CORNERS[0]))).toBe(CORNER_INDICES[1]);
  });
});

describe("the enrage starts", () => {
  test("at 19.9% with the player on the pathfinder in max ranged gear", () => {
    const run = startFight();
    expect(run.boss().currentStats.hitpoint).toBe(Math.floor(2700 * 0.199));
    expect(run.boss().location).toEqual(BOSS_ANCHOR);
    expect(run.player().location).toEqual(run.pathfinder().location);
    expect(run.player().location).toEqual(PATH_CORNERS[0]);
    expect(run.player().equipment.weapon).toBeInstanceOf(WebweaverBow);
    expect(run.player().equipment.necklace).toBeInstanceOf(PhoenixNecklace);
    expect(run.player().inventory[0]).toBeInstanceOf(LeviathanTwistedBow);
    expect(run.player().inventory[1]).toBeInstanceOf(NecklaceOfAnguish);
    run.player().inventory.slice(2).forEach((item, index) => {
      expect(item).toBeInstanceOf(index % 2 === 0 ? Anglerfish : Karambwan);
    });
    run.tick();
    const active = run.player().prayerController.activePrayers().map((prayer) => prayer.name);
    expect(active).toEqual(expect.arrayContaining(["Rigour", "Protect from Range"]));
    expect(ControlPanelController.controller.selectedControl).toBe(ControlPanelController.controls.PRAYER);
    expect(run.player().currentStats.hitpoint).toBe(120);
    expect(run.player().equipment.ammo).toBeInstanceOf(SeekingDragonArrows);
    expect(run.player().stats.range).toBe(99);
    expect(run.player().currentStats.range).toBe(112);
  });

  test("seeking dragon arrows give the Twisted bow 20 more ranged attack than dragon arrows, and the Webweaver nothing", () => {
    const run = startFight();
    const player = run.player();
    const bonusesWith = (weapon: WebweaverBow | LeviathanTwistedBow, ammo: DragonArrows) => {
      player.equipment.weapon = weapon;
      player.equipment.ammo = ammo;
      player.equipmentChanged();
      return { range: player.bonuses.attack.range, rangedStrength: player.bonuses.other.rangedStrength };
    };
    const bowDragon = bonusesWith(new LeviathanTwistedBow(), new DragonArrows());
    const bowSeeking = bonusesWith(new LeviathanTwistedBow(), new SeekingDragonArrows());
    expect(bowSeeking).toEqual({ range: bowDragon.range + 20, rangedStrength: bowDragon.rangedStrength });
    expect(bonusesWith(new WebweaverBow(), new SeekingDragonArrows())).toEqual(bonusesWith(new WebweaverBow(), new DragonArrows()));
  });

  test("two Webweaver specs take 7 to 10% of the boss in the aura; outside, each hit is up to 40% of the max", () => {
    const run = startFight();
    run.tick();
    const player = run.player();
    const boss = run.boss();
    const bow = player.equipment.weapon;
    if (!(bow instanceof WebweaverBow)) throw new Error("the Webweaver is not worn");
    const bonuses = (isSpecialAttack: boolean) => {
      const b = { isSpecialAttack };
      bow._calculatePrayerEffects(player, boss, b);
      return { ...b, styleBonus: 0, voidMultiplier: 1, gearMeleeMultiplier: 1, gearMageMultiplier: 1, gearRangeMultiplier: 1, overallMultiplier: 1 };
    };
    const fullMax = bow._maxHit(player, boss, bonuses(false));
    const specMax = bow._maxHit(player, boss, bonuses(true));
    expect(specMax).toBe(Math.ceil(fullMax * 0.4));
    const rolls = (times: number) => Array.from({ length: times }, () => bow._calculateHitDamage(player, boss, bonuses(true)));
    const inAura = rolls(3000);
    const maxHp = boss.stats.hitpoint;
    const hits = 2 * ITEM_STATS.webweaver.value.specHits;
    expect(Math.min(...inAura) * hits).toBeGreaterThanOrEqual(maxHp * 0.07);
    expect(Math.max(...inAura) * hits).toBeLessThanOrEqual(maxHp * 0.1);
    expect(Math.min(...inAura)).toBe(WebweaverBow.auraSpecHitRange(maxHp).low);
    expect(Math.max(...inAura)).toBe(WebweaverBow.auraSpecHitRange(maxHp).high);
    run.place(PATH_CORNERS[2]);
    expect(Math.max(...rolls(3000))).toBe(specMax);
  });

  test("a successful Twisted bow hit with seeking dragon arrows does at least 3 outside the aura", () => {
    const run = startFight();
    const player = run.player();
    const bow = new LeviathanTwistedBow();
    player.equipment.weapon = bow;
    player.equipmentChanged();
    run.place(PATH_CORNERS[2]);
    jest.spyOn(bow, "_maxHit").mockReturnValue(80);
    const lowest = jest.spyOn(Random, "get").mockReturnValue(0);
    try {
      expect(bow._calculateHitDamage(player, run.boss(), {})).toBe(3);
      player.equipment.ammo = new DragonArrows();
      expect(bow._calculateHitDamage(player, run.boss(), {})).toBe(0);
    } finally {
      lowest.mockRestore();
    }
  });

  test("the boss throws an orb every tick once the roar ends", () => {
    const run = startFight();
    run.pray("Protect from Magic");
    run.player().currentStats.hitpoint = 10_000;
    run.tick(1 + ENRAGE.roarTicks.value + ENRAGE.orbFlightTicks.value + 10);
    expect(run.outcomes.length).toBeGreaterThanOrEqual(10);
    expect(run.outcomes.every((outcome) => outcome.style !== "bite")).toBe(true);
  });

  test("next to the pool about a third of attacks are bites, each in place of an orb", () => {
    const run = startFight();
    const player = run.player();
    const reach = floorTiles().find((at) => inBiteReach(at) && !run.fight().blocked(at));
    if (!reach) throw new Error("no tile in bite reach");
    for (let i = 0; i < 300; i++) {
      run.place(reach);
      player.currentStats.hitpoint = 10_000;
      player.currentStats.prayer = 99;
      run.tick();
    }
    const bites = run.outcomes.filter((outcome) => outcome.style === "bite").length;
    const orbs = run.outcomes.length - bites;
    const share = bites / (bites + orbs);
    expect(share).toBeGreaterThan(0.2);
    expect(share).toBeLessThan(0.45);
  });
});

describe("prayer and the aura", () => {
  test("inside the aura the right prayer blocks the orb", () => {
    const run = startFight();
    run.pray("Protect from Magic");
    run.player().currentStats.hitpoint = 10_000;
    for (let i = 0; i < 30; i++) {
      run.place(run.pathfinder().location);
      run.tick();
    }
    const magic = run.outcomes.filter((outcome) => outcome.style === "magic");
    expect(magic.length).toBeGreaterThan(0);
    expect(magic.every((outcome) => outcome.kind === "prayed")).toBe(true);
    expect(run.outcomes.filter((outcome) => outcome.style === "ranged").every((outcome) => outcome.kind === "unprayed")).toBe(true);
  });

  test("outside the aura the right prayer only cuts orbs to chip damage", () => {
    const run = startFight();
    run.pray("Protect from Magic");
    run.player().currentStats.hitpoint = 10_000;
    const far = PATH_CORNERS[2];
    for (let i = 0; i < 12; i++) {
      run.place(far);
      run.tick();
    }
    expect(run.fight().auraCovers(far)).toBe(false);
    const magic = run.outcomes.filter((outcome) => outcome.style === "magic");
    expect(magic.length).toBeGreaterThan(0);
    expect(magic.every((outcome) => outcome.kind === "pierced")).toBe(true);
    const chipCap = Math.floor(ENRAGE.maxHit.value.magic * ENRAGE.piercedFraction.value);
    expect(magic.every((outcome) => outcome.kind === "pierced" && outcome.damage <= chipCap)).toBe(true);
    expect(run.region.chat().some((line) => line.includes("through Protect from Magic: you were") && line.endsWith("outside the pathfinder's aura."))).toBe(true);
  });

  test("inside the aura the boss cannot dodge a ranged attack", () => {
    const run = startFight();
    const boss = run.boss();
    const attack = { attacker: run.player(), weapon: new LeviathanTwistedBow(), bonuses: {} };
    expect(boss.incomingAttackRollModifiers(attack).guaranteedHit).toBe(true);
    run.place(PATH_CORNERS[2]);
    expect(boss.incomingAttackRollModifiers(attack).guaranteedHit).toBeFalsy();
  });

  test("a hit is judged against the 7x7 around the pathfinder's next step, which the blue tiles show", () => {
    const run = startFight();
    const player = run.player();
    player.currentStats.hitpoint = 10_000;
    run.tick(1 + PATHFINDER.spawnDelayTicks.value + 3);
    const results: { kind: string; marked: boolean }[] = [];
    for (const behind of [true, false, true, false]) {
      const now = run.pathfinder().tile;
      const next = run.fight().pathfinderNext;
      expect(chebyshev(now, next)).toBe(1);
      // The trailing edge of the current square, or the leading edge of the next one.
      const at = behind ? tile(now.x - 3 * (next.x - now.x), now.y - 3 * (next.y - now.y)) : tile(next.x + 3 * (next.x - now.x), next.y + 3 * (next.y - now.y));
      run.place(at);
      const landing = player.incomingProjectiles.find((hit) => hit.remainingDelay === 1 && hit.attackStyle !== "crush");
      if (!landing) throw new Error("no orb due");
      run.pray(landing.attackStyle === "magic" ? "Protect from Magic" : "Protect from Range");
      const marked = run.fight().safeNextTick(at);
      const before = run.outcomes.length;
      run.tick();
      const [outcome] = run.outcomes.slice(before);
      results.push({ kind: outcome.kind, marked });
    }
    expect(results).toEqual([
      { kind: "pierced", marked: false },
      { kind: "prayed", marked: true },
      { kind: "pierced", marked: false },
      { kind: "prayed", marked: true },
    ]);
  });

  test("the blue tiles leave out bite reach and rocks all the way round the loop", () => {
    const run = startFight();
    run.player().currentStats.hitpoint = 1_000_000;
    let checked = 0;
    for (let i = 0; i < PATH_LOOP.length + 10; i++) {
      run.place(run.fight().pathfinderNext);
      run.player().currentStats.prayer = 99;
      run.tick();
      const blue = run.fight().marks().filter((mark) => mark.colour === 0x5ad1e6);
      expect(blue.length).toBeGreaterThan(0);
      for (const { tile: at } of blue) {
        expect(run.fight().safeNextTick(at) && !inBiteReach(at) && !run.fight().blocked(at)).toBe(true);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(PATH_LOOP.length * 10);
  });

  test("on every tile of the pathfinder's safe zone the right prayer takes 0 from every orb", () => {
    const run = startFight({ seed: 5 });
    const player = run.player();
    player.currentStats.hitpoint = 10_000;
    const logged: HitRecord[] = [];
    run.region.onLog((entry) => {
      if (entry.kind === "hit") logged.push(entry.hit);
    });
    const offsets = Array.from({ length: 49 }, (_, i) => ({ dx: (i % 7) - 3, dy: Math.floor(i / 7) - 3 }));
    const covered = new Set<string>();
    for (let i = 0; i < 6 * offsets.length; i++) {
      const centre = run.fight().pathfinderNext;
      const { dx, dy } = offsets[i % offsets.length];
      const offset = tile(centre.x + dx, centre.y + dy);
      const at = isFloor(offset) && !inBiteReach(offset) ? offset : centre;
      expect(run.fight().safeNextTick(at)).toBe(true);
      run.place(at);
      player.currentStats.prayer = 99;
      const landing = player.incomingProjectiles.find((hit) => hit.remainingDelay === 1 && hit.attackStyle !== "crush");
      if (landing) run.pray(landing.attackStyle === "magic" ? "Protect from Magic" : "Protect from Range");
      const before = run.outcomes.length;
      run.tick();
      const landed = run.outcomes.slice(before).filter((outcome) => outcome.kind !== "cancelled");
      expect(landed.every((outcome) => outcome.kind === "prayed")).toBe(true);
      if (landed.length > 0 && at === offset) covered.add(`${dx},${dy}`);
    }
    expect([...covered].filter((offset) => offset.split(",").some((d) => Math.abs(Number(d)) === 3)).length).toBeGreaterThan(10);
    expect(run.fight().tally.damageTaken).toBe(0);
    const orbs = logged.filter((hit) => hit.source === "ranged orb" || hit.source === "magic orb");
    expect(orbs.length).toBeGreaterThan(100);
    for (const hit of orbs) {
      expect(hit).toMatchObject({ inAura: true, outcome: "prayed", damage: 0, praying: hit.needed });
      expect(hit.pathfinderDistance).toBeLessThanOrEqual(PATHFINDER.auraRadius.value);
      expect(hit.tick - hit.launchedAt).toBe(ENRAGE.orbFlightTicks.value);
    }
  });
});

describe("falling rocks", () => {
  const falling = (run: ReturnType<typeof startFight>) => floorTiles().filter((at) => run.fight().fallingRockOn(at));

  /** Waits for a single rock's shadow to appear and puts the player on it, as if they had walked onto it; returns that tile. */
  function waitForShadow(run: ReturnType<typeof startFight>) {
    run.player().currentStats.hitpoint = 10_000;
    for (let i = 0; i < 4 * DEBRIS.scatterEveryTicks.value.max; i++) {
      const before = falling(run);
      run.tick();
      const fresh = falling(run).find((at) => !before.some((b) => sameTile(b, at)));
      if (fresh) {
        run.place(fresh);
        return fresh;
      }
    }
    throw new Error("no rock fell");
  }

  const rockHits = (run: ReturnType<typeof startFight>) => run.player().incomingProjectiles.filter((hit) => "silentWhenMissed" in hit && hit.remainingDelay === 0);

  /** Clicks an open neighbouring tile, as a player would to leave the shadow. */
  function stepOff(run: ReturnType<typeof startFight>, from: Tile) {
    const fight = run.fight();
    const around = [[1, 0], [0, 1], [-1, 0], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
    const open = around.map(([dx, dy]) => tile(from.x + dx, from.y + dy)).find(
      (at) => isFloor(at) && !fight.blocked(at) && !fight.fallingRockOn(at),
    );
    if (!open) throw new Error("nowhere to step");
    run.player().moveTo(open.x, open.y);
  }

  test("nothing falls as the phase starts; then single rocks a few tiles away now and then, and rarer '+'s of blockers, never on the player", () => {
    const run = startFight();
    const player = run.player();
    player.currentStats.hitpoint = 1_000_000;
    run.tick();
    expect(falling(run)).toEqual([]);
    const ticks = 3 * DEBRIS.plusEveryTicks.value.max;
    const drops: { from: Tile; fresh: Tile[] }[] = [];
    let seen = falling(run);
    for (let i = 0; i < ticks + DEBRIS.warningTicks.value; i++) {
      run.place(PATH_LOOP[(10 + i) % PATH_LOOP.length]);
      player.currentStats.prayer = 99;
      const from = player.tile;
      run.tick();
      const now = falling(run);
      const fresh = now.filter((at) => !seen.some((s) => sameTile(s, at)));
      seen = now;
      expect(fresh.every((at) => !sameTile(at, from))).toBe(true);
      if (i < ticks && fresh.length > 0) drops.push({ from, fresh });
    }
    const stayed = (at: Tile) => run.fight().blocked(at);
    const pluses = drops.filter(({ fresh }) => fresh.some(stayed));
    for (const { from, fresh } of pluses) {
      const { min, max } = DEBRIS.plusRange.value;
      for (const at of fresh.filter(stayed)) {
        expect(chebyshev(at, from)).toBeGreaterThanOrEqual(min - 1);
        expect(chebyshev(at, from)).toBeLessThanOrEqual(max + 1);
      }
    }
    const singles = drops.flatMap(({ from, fresh }) => fresh.filter((at) => !fresh.some((o) => stayed(o) && chebyshev(o, at) <= 1)).map((at) => ({ at, from })));
    for (const { at, from } of singles) {
      const { min, max } = DEBRIS.scatterRange.value;
      expect(chebyshev(at, from)).toBeGreaterThanOrEqual(min);
      expect(chebyshev(at, from)).toBeLessThanOrEqual(max);
    }
    const { min, max } = DEBRIS.scatterEveryTicks.value;
    expect(singles.length).toBeGreaterThanOrEqual(Math.floor(ticks / max) - 2);
    expect(singles.length).toBeLessThanOrEqual(Math.ceil(ticks / min) + 2);
    expect(pluses.length).toBeGreaterThanOrEqual(2);
    expect(pluses.length).toBeLessThanOrEqual(Math.ceil(ticks / DEBRIS.plusEveryTicks.value.min));
  });

  test("stepping off on the next tick dodges it, with no hitsplat", () => {
    const run = startFight();
    stepOff(run, waitForShadow(run));
    run.tick(DEBRIS.warningTicks.value);
    expect(run.fight().tally.rocksTaken).toBe(0);
    const [rock] = rockHits(run);
    expect(rock.damage).toBe(0);
    expect(run.player().drawHitsplat(rock)).toBe(false);
  });

  test("stepping off on the last tick is too late", () => {
    const run = startFight();
    const at = waitForShadow(run);
    run.tick(DEBRIS.warningTicks.value - 1);
    stepOff(run, at);
    run.tick();
    expect(run.fight().tally.rocksTaken).toBeGreaterThan(0);
    const [rock] = rockHits(run);
    expect(run.player().drawHitsplat(rock)).toBe(true);
  });

  test("the shadow shows, never blue, until the rock lands, and the hit is explained in chat", () => {
    const run = startFight();
    const at = waitForShadow(run);
    const shadowOn = () => run.fight().marks().filter((mark) => sameTile(mark.tile, at));
    for (let i = 1; i < DEBRIS.warningTicks.value; i++) {
      expect(shadowOn().map((mark) => mark.colour)).toEqual([0x000000]);
      run.tick();
    }
    expect(shadowOn().map((mark) => mark.colour)).toEqual([0x000000]);
    expect(run.fight().tally.rocksTaken).toBe(0);
    run.tick();
    expect(run.fight().tally.rocksTaken).toBeGreaterThan(0);
    expect(shadowOn().some((mark) => mark.colour === 0x000000)).toBe(false);
    expect(run.region.chat().some((line) => line.startsWith(`A falling rock hit ${run.fight().tally.rocksTaken}`))).toBe(true);
  });

});

describe("the pathfinder", () => {
  test("walks the loop clockwise a tile a tick after its spawn", () => {
    const run = startFight();
    run.player().currentStats.hitpoint = 10_000;
    run.pray("Protect from Magic");
    run.tick(1 + PATHFINDER.spawnDelayTicks.value);
    expect(run.pathfinder().location).toEqual(PATH_LOOP[0]);
    run.tick(3);
    expect(run.pathfinder().location).toEqual(PATH_LOOP[3]);
  });
});

describe("a kill", () => {
  test("two Webweaver specs then the Twisted bow, staying in the aura, kill the boss", () => {
    const run = startFight();
    const player = run.player();
    const boss = run.boss();
    player.currentStats.hitpoint = 10_000;
    run.pray("Protect from Magic");
    expect(player.equipment.weapon).toBeInstanceOf(WebweaverBow);
    player.setAggro(boss);
    player.useSpecialAttack = true;

    const hits: number[] = [];
    let specs = 0;
    let swapped = false;
    for (let i = 0; i < 200 && run.fight().run.kind === "fighting"; i++) {
      run.place(run.pathfinder().location);
      const before = boss.currentStats.hitpoint;
      const energy = player.currentStats.specialAttack;
      run.tick();
      if (boss.currentStats.hitpoint < before) hits.push(before - boss.currentStats.hitpoint);
      if (player.currentStats.specialAttack < energy) specs++;
      if (!swapped && player.currentStats.specialAttack >= 50) player.useSpecialAttack = true;
      if (!swapped && player.currentStats.specialAttack < 50) {
        const bow = player.inventory.find((item) => item instanceof LeviathanTwistedBow);
        if (bow) {
          bow.inventoryLeftClick(player);
          player.setAggro(boss);
          swapped = true;
        }
      }
    }
    expect(specs).toBe(2);
    expect(player.equipment.weapon).toBeInstanceOf(LeviathanTwistedBow);
    expect(run.fight().run.kind).toBe("won");
    expect(hits.length).toBeGreaterThan(0);
    expect(edgeTiles().some((at) => run.fight().blocked(at))).toBe(false);
    expect(run.region.mobs.includes(run.fight().tornado)).toBe(false);
  });

  test("nothing hurts the player once the boss is dead, including hits already in flight", () => {
    const run = startFight();
    const player = run.player();
    const boss = run.boss();
    player.currentStats.hitpoint = 1_000;
    run.place(PATH_CORNERS[2]);
    run.tick(6);
    expect(player.incomingProjectiles.length).toBeGreaterThan(0);
    boss.currentStats.hitpoint = 0;
    boss.damageTaken();
    const hp = player.currentStats.hitpoint;
    for (let i = 0; i < 20; i++) {
      run.place(PATH_CORNERS[2]);
      run.tick();
    }
    expect(run.fight().run.kind).toBe("won");
    expect(player.currentStats.hitpoint).toBe(hp);
    expect(player.incomingProjectiles).toHaveLength(0);
  });

  test("the player cheers under 99 fireworks when the boss dies", () => {
    const run = startFight();
    const player = run.player();
    const cheer = jest.spyOn(player, "playAnimation");
    run.tick();
    run.boss().currentStats.hitpoint = 0;
    run.tick();
    expect(run.fight().run.kind).toBe("won");
    expect(cheer).toHaveBeenCalledWith(SEQ.cheer.value);
    expect(player.spotAnims.map((spot) => spot.id)).toContain(SPOT.levelUpMax.value);
  });
});

describe("pre-enrage debris", () => {
  test("blocks the arena's edges but not the pathfinder's loop or the tornado's start", () => {
    const run = startFight();
    const edges = edgeTiles();
    expect(edges.length).toBeGreaterThan(40);
    expect(edges.every((at) => run.fight().blocked(at))).toBe(true);
    expect(PATH_LOOP.some((at) => run.fight().blocked(at))).toBe(false);
    expect(run.fight().blocked(run.fight().tornadoSpawnTile)).toBe(false);
  });
});

describe("the tornado", () => {
  test("starts a few tiles behind the player, gains on them at the corners, and never goes over rocks", () => {
    const run = startFight();
    const player = run.player();
    player.currentStats.hitpoint = 1_000_000;
    const tornado = run.fight().tornado;
    const behind = TORNADO.startsBehind.value;
    expect(tornado.tile).toEqual(PATH_LOOP[(PATH_LOOP.length - behind) % PATH_LOOP.length]);
    expect(chebyshev(tornado.tile, player.tile)).toBe(behind);
    const loopIndex = (at: Tile) => PATH_LOOP.reduce((best, t, i) => (chebyshev(t, at) < chebyshev(PATH_LOOP[best], at) ? i : best), 0);
    for (let i = 0; i < 2 * PATH_LOOP.length; i++) {
      run.place(PATH_LOOP[(loopIndex(run.pathfinder().tile) + 2) % PATH_LOOP.length]);
      player.currentStats.prayer = 99;
      run.tick();
      expect(run.fight().blocked(tornado.tile)).toBe(false);
    }
    expect(run.fight().tally.tornadoTaken).toBeGreaterThan(0);
  });

  test("paths around blocker rocks, which makes its route longer", () => {
    const run = startFight();
    const tornado = run.fight().tornado;
    const side = chebyshev(PATH_CORNERS[0], PATH_CORNERS[1]);
    const mid = Math.floor(side / 2);
    const target = PATH_LOOP[mid + 1];
    const walk = (blocked: (at: Tile) => boolean) => {
      tornado.setLocation({ ...PATH_LOOP[mid - 1] });
      let steps = 0;
      for (let next = tornado.nextStepToward(target, blocked); next; next = tornado.nextStepToward(target, blocked)) {
        expect(blocked(next)).toBe(false);
        tornado.setLocation({ ...next });
        steps++;
      }
      return steps;
    };
    const open = walk(() => false);
    const allButMeleeLane = (at: Tile) => at.x === PATH_LOOP[mid].x && distanceToPool(at) > 2;
    expect(walk(allButMeleeLane)).toBeGreaterThan(open);
  });

  test("rocks never fall so as to close the way round the pool or wall any floor off", () => {
    const column = PATH_LOOP[Math.floor(chebyshev(PATH_CORNERS[0], PATH_CORNERS[1]) / 2)].x;
    const northWall = (at: Tile) => at.x === column && at.y < BOSS_ANCHOR.y && isFloor(at);
    expect(cutsLoop(() => false)).toBe(false);
    expect(cutsLoop(northWall)).toBe(true);
    expect(cutsLoop((at) => northWall(at) && distanceToPool(at) !== 3)).toBe(false);
    for (const still of [false, true]) {
      const run = startFight();
      const player = run.player();
      player.currentStats.hitpoint = 1_000_000;
      const stand = PATH_CORNERS[1];
      for (let i = 0; i < 8 * DEBRIS.plusEveryTicks.value.max; i++) {
        run.place(still ? stand : PATH_LOOP[i % PATH_LOOP.length]);
        player.currentStats.prayer = 99;
        run.tick();
        const blocked = (at: Tile) => run.fight().blocked(at);
        expect(cutsLoop(blocked)).toBe(false);
        const open = floorTiles().filter((at) => !blocked(at));
        const from = open.find((at) => sameTile(at, player.tile)) ?? open[0];
        expect(reachable(from, blocked).size).toBe(open.length);
      }
      expect(floorTiles().filter((at) => run.fight().blocked(at)).length).toBeGreaterThan(0);
    }
  });

  test("catches a player who lags further and further behind the pathfinder", () => {
    const run = startFight();
    const player = run.player();
    player.currentStats.hitpoint = 1_000_000;
    const start = PATH_LOOP.findIndex((t) => chebyshev(t, run.pathfinder().tile) === 0);
    let caughtAt = -1;
    for (let i = 0; i < 2 * PATH_LOOP.length && caughtAt < 0; i++) {
      run.place(PATH_LOOP[(start + Math.floor(i / 3)) % PATH_LOOP.length]);
      player.currentStats.prayer = 99;
      run.tick();
      if (run.fight().tally.tornadoTaken > 0) caughtAt = i;
    }
    expect(caughtAt).toBeGreaterThan(0);
  });

  test("catches a player who stands still and hits on contact", () => {
    const run = startFight();
    const player = run.player();
    player.currentStats.hitpoint = 10_000;
    for (let i = 0; i < 40 && run.fight().tally.tornadoTaken === 0; i++) {
      run.place(PATH_CORNERS[0]);
      run.tick();
    }
    const { min, max } = TORNADO.damage.value;
    expect(run.fight().tally.tornadoTaken).toBeGreaterThanOrEqual(min);
    expect(run.fight().tally.tornadoTaken).toBeLessThanOrEqual(max);
  });

  test("steps diagonally, but not past the corner of a rock", () => {
    const run = startFight();
    const tornado = run.fight().tornado;
    const from = PATH_LOOP[0];
    const target = tile(from.x + 3, from.y + 3);
    tornado.setLocation({ ...from });
    expect(tornado.nextStepToward(target, () => false)).toEqual(tile(from.x + 1, from.y + 1));
    const rock = tile(from.x + 1, from.y);
    const step = tornado.nextStepToward(target, (at) => sameTile(at, rock));
    if (!step) throw new Error("no step");
    expect(step).toEqual(tile(from.x, from.y + 1));
  });

  test("cuts corners through the melee tiles but never through the pool", () => {
    const run = startFight();
    const tornado = run.fight().tornado;
    tornado.setLocation({ ...PATH_LOOP[0] });
    const opposite = PATH_LOOP[Math.floor(PATH_LOOP.length / 2)];
    let deepest = distanceToPool(tornado.tile);
    for (let next = tornado.nextStepToward(opposite, () => false); next; next = tornado.nextStepToward(opposite, () => false)) {
      expect(isFloor(next)).toBe(true);
      tornado.setLocation({ ...next });
      deepest = Math.min(deepest, distanceToPool(next));
    }
    expect(deepest).toBeLessThan(PATH_RING.value);
    expect(deepest).toBeGreaterThanOrEqual(2);
  });

  test("vanishes after a hit and comes back on the tile where it hit", () => {
    const run = startFight();
    const player = run.player();
    player.currentStats.hitpoint = 10_000;
    const tornado = run.fight().tornado;
    for (let i = 0; i < 40 && run.fight().tally.tornadoTaken === 0; i++) {
      run.place(PATH_CORNERS[0]);
      run.tick();
    }
    expect(run.fight().tally.tornadoTaken).toBeGreaterThan(0);
    const hitAt = player.tile;
    run.place(PATH_CORNERS[2]);
    // The hit lands a tick after contact, and a mob added back joins the region's list on the next tick.
    let ticksGone = 1;
    while (!run.region.mobs.includes(tornado) && ticksGone < 20) {
      expect(tornado.tile).toEqual(hitAt);
      run.tick();
      ticksGone++;
    }
    expect(ticksGone).toBe(TORNADO.goneAfterHit.value + 1);
    expect(chebyshev(tornado.tile, hitAt)).toBeLessThanOrEqual(1);
  });
});

describe("supplies", () => {
  test("the phoenix necklace heals 30% once at 20% or below and clears pending hits", () => {
    const run = startFight();
    const player = run.player();
    player.currentStats.hitpoint = 25;
    player.damageTaken();
    expect(player.equipment.necklace).toBeInstanceOf(PhoenixNecklace);
    player.currentStats.hitpoint = 19;
    player.damageTaken();
    expect(player.currentStats.hitpoint).toBe(19 + 29);
    expect(player.equipment.necklace).toBeUndefined();
    expect(run.region.chat().some((line) => line.includes("phoenix necklace"))).toBe(true);
  });

  test("an anglerfish heals 22 at 99 Hitpoints", () => {
    expect(Anglerfish.healFor(99)).toBe(22);
  });

  test("an anglerfish overheals by 22 at full Hitpoints", () => {
    const run = startFight();
    const player = run.player();
    player.inventory[2].inventoryLeftClick(player);
    run.tick();
    expect(player.currentStats.hitpoint).toBe(99 + 22);
  });

  test("an anglerfish and the karambwan to its right are eaten on the same tick", () => {
    const run = startFight();
    const player = run.player();
    const [angler, karambwan] = player.inventory.slice(2, 4);
    angler.inventoryLeftClick(player);
    karambwan.inventoryLeftClick(player);
    expect(player.inventory[2]).toBeNull();
    expect(player.inventory[3]).toBeNull();
    expect(player.eats.currentFood).toBe(angler);
    expect(player.eats.currentComboFood).toBe(karambwan);
  });
});
