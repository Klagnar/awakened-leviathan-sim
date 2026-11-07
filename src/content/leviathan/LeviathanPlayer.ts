import { Player } from "osrs-sdk";
import type { Location, Projectile, Region } from "osrs-sdk";
import { PhoenixNecklace } from "./gear/items";
import type { Protection, Tile } from "./types";
import { tile } from "./types";

/** A hit that can be called off before it lands (the Phoenix necklace clears pending attacks). */
export interface Cancellable {
  cancel(): void;
}

function isCancellable(projectile: Projectile): projectile is Projectile & Cancellable {
  return "cancel" in projectile && typeof projectile.cancel === "function";
}

/** A hit that leaves no hitsplat when it does no damage, like a rock landing on a tile the player has left. */
export interface SilentWhenMissed {
  readonly silentWhenMissed: true;
}

function isSilentWhenMissed(projectile: Projectile): projectile is Projectile & SilentWhenMissed {
  return "silentWhenMissed" in projectile && projectile.silentWhenMissed === true;
}

export class LeviathanPlayer extends Player {
  private damageStopped = false;

  constructor(region: Region, location: Location, private readonly say: (line: string) => void) {
    super(region, location);
  }

  /** Once the boss is dead nothing can hurt the player: hits in flight are dropped and new ones ignored. */
  stopDamage(): void {
    this.damageStopped = true;
    this.incomingProjectiles = [];
  }

  override addProjectile(projectile: Projectile): void {
    if (this.damageStopped) return;
    super.addProjectile(projectile);
  }

  get tile(): Tile {
    return tile(this.location.x, this.location.y);
  }

  get protection(): Protection {
    if (this.prayerController.matchFeature("melee")) return "melee";
    if (this.prayerController.matchFeature("range")) return "ranged";
    if (this.prayerController.matchFeature("magic")) return "magic";
    return null;
  }

  override drawHitsplat(projectile: Projectile): boolean {
    return !(projectile.damage === 0 && isSilentWhenMissed(projectile));
  }

  override damageTaken(): void {
    super.damageTaken();
    const necklace = this.equipment.necklace;
    if (!(necklace instanceof PhoenixNecklace) || !PhoenixNecklace.triggers(this.currentStats.hitpoint, this.stats.hitpoint)) return;
    this.currentStats.hitpoint += PhoenixNecklace.heal(this.stats.hitpoint);
    this.equipment.necklace = undefined;
    this.equipmentChanged();
    for (const pending of this.incomingProjectiles) {
      if (isCancellable(pending)) pending.cancel();
      else pending.damage = 0;
    }
    this.say("Your phoenix necklace heals you, but is destroyed in the process.");
  }
}
