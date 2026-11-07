import {
  AttackStyle,
  AttackStyleTypes,
  DragonArrows,
  Food,
  ImageLoader,
  ItemName,
  Necklace,
  Player,
  PlayerAnimationIndices,
  Random,
  RangedWeapon,
  TwistedBow,
} from "osrs-sdk";
import type { AttackBonuses, ProjectileOptions, Unit } from "osrs-sdk";
import { ITEM, ITEM_STATS, PATHFINDER } from "../data";
import { itemIconFile } from "../../../assets";

// Menus and the combat tab read names only from the SDK's closed ItemName enum, so the sim's items join it.
declare module "osrs-sdk/lib/src/sdk/ItemName" {
  enum ItemName {
    WEBWEAVER_BOW = "Webweaver bow",
    PHOENIX_NECKLACE = "Phoenix necklace",
    ANGLERFISH = "Anglerfish",
  }
}

Object.assign(ItemName, {
  WEBWEAVER_BOW: "Webweaver bow",
  PHOENIX_NECKLACE: "Phoenix necklace",
  ANGLERFISH: "Anglerfish",
} as const satisfies { readonly [K in keyof typeof ItemName]?: `${(typeof ItemName)[K]}` });

function inventoryIcon(itemId: number): HTMLImageElement {
  return ImageLoader.createImage(`osrs-assets/${itemIconFile(itemId)}`);
}

/** The pathfinder's buff, read by the player's ranged weapons when they roll against the Leviathan. */
export interface EmpowersRanged {
  empowers(attacker: Unit): boolean;
}

function isEmpowering(target: Unit): target is Unit & EmpowersRanged {
  return "empowers" in target && typeof target.empowers === "function";
}

/** Inside the aura every ranged hit deals at least 20% of the max hit (accuracy is the target's job). */
function withAuraFloor(roll: number, from: Unit, to: Unit, maxHit: () => number): number {
  if (!isEmpowering(to) || !to.empowers(from)) return roll;
  return Math.max(roll, Math.floor(maxHit() * PATHFINDER.minHitFraction.value));
}

/**
 * Dragon arrows with +20 ranged attack and a minimum successful hit of 3. The attack bonus is for bows only, and
 * every weapon here that fires arrows is a bow. The cache this sim extracts from predates them, so they keep the dragon
 * arrow's sprite and models.
 */
export class SeekingDragonArrows extends DragonArrows {
  constructor() {
    super();
    const { range, rangedStrength } = ITEM_STATS.seekingDragonArrows.value;
    this.bonuses = {
      attack: { stab: 0, slash: 0, crush: 0, magic: 0, range },
      defence: { stab: 0, slash: 0, crush: 0, magic: 0, range: 0 },
      other: { meleeStrength: 0, rangedStrength, magicDamage: 0, prayer: 1 },
      targetSpecific: { undead: 0, slayer: 0 },
    };
  }

  override get itemName(): ItemName {
    return ItemName.SEEKING_DRAGON_ARROWS;
  }
}

/** Called only after the accuracy roll succeeds. */
function withSeekingFloor(roll: number, from: Unit): number {
  if (!(from instanceof Player) || !(from.equipment.ammo instanceof SeekingDragonArrows)) return roll;
  return Math.max(roll, ITEM_STATS.seekingDragonArrows.value.minHit);
}

/** The SDK's Twisted bow plus the seeking arrows' and the pathfinder's minimum hits. */
export class LeviathanTwistedBow extends TwistedBow {
  override _calculateHitDamage(from: Unit, to: Unit, bonuses: AttackBonuses): number {
    const roll = withSeekingFloor(super._calculateHitDamage(from, to, bonuses), from);
    return withAuraFloor(roll, from, to, () => this._maxHit(from, to, bonuses));
  }
}

/**
 * Webweaver bow (charged). It makes its own arrows; with no compatible ammo the SDK leaves worn arrows out of bonuses.
 * Swarm: four hits for 50% energy, each with doubled accuracy and up to 40% (rounded up) of the max hit.
 */
export class WebweaverBow extends RangedWeapon {
  override inventorySprite = inventoryIcon(this.cacheItemId);

  constructor() {
    super();
    const { range, rangedStrength } = ITEM_STATS.webweaver.value;
    this.bonuses = {
      attack: { stab: 0, slash: 0, crush: 0, magic: 0, range },
      defence: { stab: 0, slash: 0, crush: 0, magic: 0, range: 0 },
      other: { meleeStrength: 0, rangedStrength, magicDamage: 0, prayer: 0 },
      targetSpecific: { undead: 0, slayer: 0 },
    };
  }

  override get cacheItemId(): number {
    return ITEM.webweaverBow.value;
  }

  override get itemName(): ItemName {
    return ItemName.WEBWEAVER_BOW;
  }

  override get isTwoHander(): boolean {
    return true;
  }

  override get weight(): number {
    return 1.5;
  }

  override attackStyles(): AttackStyle[] {
    return [AttackStyle.ACCURATE, AttackStyle.RAPID, AttackStyle.LONGRANGE];
  }

  override attackStyleCategory(): AttackStyleTypes {
    return AttackStyleTypes.BOW;
  }

  override defaultStyle(): AttackStyle {
    return AttackStyle.RAPID;
  }

  override get attackSpeed(): number {
    const { speed } = ITEM_STATS.webweaver.value;
    return this.attackStyle() === AttackStyle.RAPID ? speed - 1 : speed;
  }

  override get attackRange(): number {
    const { attackRange } = ITEM_STATS.webweaver.value;
    return this.attackStyle() === AttackStyle.LONGRANGE ? attackRange + 1 : attackRange;
  }

  override get attackAnimationId(): number {
    return PlayerAnimationIndices.FireBow;
  }

  override _maxHit(from: Unit, to: Unit, bonuses: AttackBonuses): number {
    const max = super._maxHit(from, to, bonuses);
    return bonuses.isSpecialAttack ? Math.ceil(max * ITEM_STATS.webweaver.value.specMaxFraction) : max;
  }

  override _accuracyMultiplier(from: Unit, to: Unit, bonuses: AttackBonuses): number {
    return bonuses.isSpecialAttack ? ITEM_STATS.webweaver.value.specAccuracy : 1;
  }

  override _calculateHitDamage(from: Unit, to: Unit, bonuses: AttackBonuses): number {
    if (bonuses.isSpecialAttack && isEmpowering(to) && to.empowers(from)) {
      const { low, high } = WebweaverBow.auraSpecHitRange(to.stats.hitpoint);
      this.lastHitHit = true;
      return low + Math.floor(Random.get() * (high - low + 1));
    }
    return withAuraFloor(super._calculateHitDamage(from, to, bonuses), from, to, () => this._maxHit(from, to, bonuses));
  }

  /** One spec hit in the aura: a spec totals between the shares of the boss's max HP, so each hit rolls a quarter. */
  static auraSpecHitRange(bossMaxHp: number): { readonly low: number; readonly high: number } {
    const { min, max } = PATHFINDER.specBossHpShare.value;
    const { specHits } = ITEM_STATS.webweaver.value;
    return { low: Math.ceil((bossMaxHp * min) / specHits), high: Math.floor((bossMaxHp * max) / specHits) };
  }

  override hasSpecialAttack(): boolean {
    return true;
  }

  override specialAttackDrain(): number {
    return ITEM_STATS.webweaver.value.specDrain;
  }

  override specialAttack(from: Unit, to: Unit, bonuses: AttackBonuses = {}, options: ProjectileOptions = {}): boolean {
    let fired = false;
    for (let hit = 0; hit < ITEM_STATS.webweaver.value.specHits; hit++) {
      fired = super.attack(from, to, { ...bonuses, isSpecialAttack: true }, options) || fired;
    }
    return fired;
  }
}

/** Restores 30% of max Hitpoints once, the moment the wearer drops to 20% or below. */
export class PhoenixNecklace extends Necklace {
  override inventorySprite = inventoryIcon(this.cacheItemId);

  constructor() {
    super();
    this.bonuses = {
      attack: { stab: 0, slash: 0, crush: 0, magic: 0, range: 0 },
      defence: { stab: 0, slash: 0, crush: 0, magic: 0, range: 0 },
      other: { meleeStrength: 0, rangedStrength: 0, magicDamage: 0, prayer: 0 },
      targetSpecific: { undead: 0, slayer: 0 },
    };
  }

  override get cacheItemId(): number {
    return ITEM.phoenixNecklace.value;
  }

  override get itemName(): ItemName {
    return ItemName.PHOENIX_NECKLACE;
  }

  override get weight(): number {
    return 0.01;
  }

  /** Whether `hp` out of `maxHp` sets the necklace off. */
  static triggers(hp: number, maxHp: number): boolean {
    return hp > 0 && hp <= Math.floor(maxHp * ITEM_STATS.phoenix.value.triggerFraction);
  }

  static heal(maxHp: number): number {
    return Math.floor(maxHp * ITEM_STATS.phoenix.value.healFraction);
  }
}

/** Heals floor(level / 10) + 13 at 93+ Hitpoints and may overheal by up to that amount. */
export class Anglerfish extends Food {
  override inventorySprite = inventoryIcon(this.cacheItemId);

  override get cacheItemId(): number {
    return ITEM.anglerfish.value;
  }

  override get itemName(): ItemName {
    return ItemName.ANGLERFISH;
  }

  override get weight(): number {
    return 0.4;
  }

  static healFor(hitpointsLevel: number): number {
    return Math.floor(hitpointsLevel / 10) + ITEM_STATS.anglerfishBonus.value;
  }

  override eat(player: Player): void {
    player.interruptCombat();
    player.playAnimation(PlayerAnimationIndices.Eat, false);
    const heal = Anglerfish.healFor(player.stats.hitpoint);
    const now = player.currentStats.hitpoint;
    player.currentStats.hitpoint = Math.max(now, Math.min(now + heal, player.stats.hitpoint + heal));
  }
}
