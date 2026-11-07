import { Settings, TrainerInstance, Viewport } from "osrs-sdk";
import type { FightOptions } from "../fight";
import { LeviathanRegion } from "../LeviathanRegion";
import type { HitOutcome, Tile } from "../types";

export type ProtectionPrayer = "Protect from Magic" | "Protect from Range" | "Protect from Melee";

export function startFight(options: Partial<FightOptions> = {}) {
  Settings.readFromStorage();
  const region = new LeviathanRegion({ startFraction: 0.199, seed: 1, showAura: true, showBiteReach: false, ...options });
  const trainer = new TrainerInstance(region, { force2d: true });
  trainer.mount(document.createElement("canvas"), document.createElement("div"));
  // The SDK counts GET READY down only in its browser loop, never in tickWorld.
  region.world.getReadyTimer = 0;
  Viewport.viewport.resize(800, 600);

  const fight = () => {
    const current = region.current();
    if (!current) throw new Error("the region has no fight");
    return current;
  };
  const outcomes: HitOutcome[] = [];
  const record = fight().hitLanded.bind(fight());
  fight().hitLanded = (outcome: HitOutcome, launchedAt: number) => {
    outcomes.push(outcome);
    record(outcome, launchedAt);
  };

  return {
    region,
    fight,
    player: () => fight().player,
    boss: () => fight().boss,
    pathfinder: () => fight().pathfinder,
    outcomes,
    tick: (times = 1) => {
      for (let i = 0; i < times; i++) region.world.tickWorld();
    },
    pray: (name: ProtectionPrayer) => {
      const prayer = fight().player.prayerController.findPrayerByName(name);
      if (!prayer.isActive) prayer.toggle(fight().player);
    },
    place: (at: Tile) => {
      fight().player.setLocation({ x: at.x, y: at.y });
      fight().player.destinationLocation = { x: at.x, y: at.y };
    },
  };
}
