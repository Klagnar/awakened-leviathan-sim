import { CacheRenderModel, CacheRenderReferences, Mob, Projectile, RangedWeapon, Settings, SoundCache } from "osrs-sdk";
import type { Model, Region, Sound, Unit, UnitBonuses } from "osrs-sdk";
import { BOSS, ENRAGE, NPC, SEQ, SPOT } from "../data";
import { SOUNDS } from "../sounds";
import { BOSS_ANCHOR, inBiteReach } from "../geometry";
import type { EmpowersRanged } from "../gear/items";
import type { Cancellable, LeviathanPlayer } from "../LeviathanPlayer";
import type { Rng } from "../rng";
import type { HitOutcome, OrbStyle, Tile } from "../types";

type BossHitStyle = OrbStyle | "bite";
type IncomingAttackRoll = Parameters<Unit["incomingAttackRollModifiers"]>[0];
type IncomingAttackRollModifiers = ReturnType<Unit["incomingAttackRollModifiers"]>;

/** What the boss needs from the fight around it. */
export interface BossHooks {
  readonly rng: Rng;
  /** Whether the pathfinder's aura covers a tile right now. */
  auraCovers(at: Tile): boolean;
  /** The boss only attacks while the enrage is running. */
  attacking(): boolean;
  /** Fight ticks since the enrage started. */
  readonly ticks: number;
  hitLanded(outcome: HitOutcome, launchedAt: number): void;
}

const PRAYER_FOR: Readonly<Record<BossHitStyle, "ranged" | "magic" | "melee">> = { ranged: "ranged", magic: "magic", bite: "melee" };

const ORB_SPOT: Readonly<Record<OrbStyle, number>> = { ranged: SPOT.rangedOrb.value, magic: SPOT.magicOrb.value };
const IMPACT_SPOT: Readonly<Record<OrbStyle, number>> = { ranged: SPOT.rangedImpact.value, magic: SPOT.magicImpact.value };
const LAUNCH_SOUND: Readonly<Record<OrbStyle, Sound>> = { ranged: SOUNDS.rangedLaunch, magic: SOUNDS.magicLaunch };
const IMPACT_SOUND: Readonly<Record<BossHitStyle, Sound>> = { ranged: SOUNDS.rangedImpact, magic: SOUNDS.magicImpact, bite: SOUNDS.biteImpact };

/**
 * The boss fires before the player's hits count down in the same tick, so the SDK's hit delay for an orb includes the
 * tick it is fired on. Without this an orb with a flight of 2 would land on the next tick, halfway through its graphic.
 */
const FIRING_TICK = 1;
const CLIENT_CYCLE_MS = 20;
const clientCyclesPerTick = (): number => Math.max(1, Math.round(Settings.tickMs / CLIENT_CYCLE_MS));

/** One orb or bite. Prayer and the aura are judged as it lands, so prayer flicks and late steps into the aura count. */
class BossHit extends Projectile implements Cancellable {
  private cancelled = false;
  private readonly launchedAt: number;

  constructor(
    boss: Leviathan,
    private readonly player: LeviathanPlayer,
    private readonly style: BossHitStyle,
    delay: number,
    private readonly hooks: BossHooks,
  ) {
    super(null, 0, boss, player, style === "bite" ? "crush" : style === "ranged" ? "range" : "magic", {
      setDelay: style === "bite" ? delay : delay + FIRING_TICK,
      visuals: style === "bite" ? { hidden: true } : { spotAnim: { id: ORB_SPOT[style] }, startCycleOffset: 0, endCycleOffset: delay * clientCyclesPerTick() },
      sound: style === "bite" ? undefined : LAUNCH_SOUND[style],
    });
    this.launchedAt = hooks.ticks;
  }

  cancel(): void {
    this.cancelled = true;
  }

  override beforeHit(): void {
    super.beforeHit();
    const { style, player, hooks } = this;
    if (this.cancelled) {
      this.damage = 0;
      hooks.hitLanded({ kind: "cancelled", style }, this.launchedAt);
      return;
    }
    SoundCache.play(IMPACT_SOUND[style]);
    if (style !== "bite") player.addSpotAnim({ id: IMPACT_SPOT[style], channel: "leviathan-impact" });
    const prayed = player.protection === PRAYER_FOR[style];
    if (prayed && hooks.auraCovers(player.tile)) {
      this.damage = 0;
      hooks.hitLanded({ kind: "prayed", style }, this.launchedAt);
      return;
    }
    const max = ENRAGE.maxHit.value[style];
    const rolled = hooks.rng.int(0, prayed ? Math.floor(max * ENRAGE.piercedFraction.value) : max);
    this.damage = Math.min(rolled, player.currentStats.hitpoint);
    hooks.hitLanded(prayed ? { kind: "pierced", style, damage: this.damage } : { kind: "unprayed", style, damage: this.damage }, this.launchedAt);
  }
}

/** The Awakened Leviathan, enraged: an orb every tick, a bite for anyone next to the pool. */
export class Leviathan extends Mob implements EmpowersRanged {
  private hooks: BossHooks | null = null;
  private target: LeviathanPlayer | null = null;

  constructor(region: Region) {
    super(region, { ...BOSS_ANCHOR });
  }

  /** Wired after construction: the SDK runs setStats from Unit's constructor, before subclass fields exist. */
  engage(target: LeviathanPlayer, hooks: BossHooks): void {
    this.target = target;
    this.hooks = hooks;
    this.setAggro(target);
  }

  /** Starts the phase at a fraction of max HP. Region.reset rewrites stats after initialiseRegion, so it runs after. */
  enrageAt(fraction: number): void {
    this.currentStats.hitpoint = Math.max(1, Math.floor(this.stats.hitpoint * fraction));
    this.attackDelay = 0;
  }

  override mobName(): string {
    return BOSS.name.value;
  }

  override get combatLevel(): number {
    return BOSS.combatLevel.value;
  }

  override setStats(): void {
    this.stats = { ...BOSS.stats.value, hitpoint: BOSS.maxHp.value };
    this.currentStats = { ...this.stats };
    this.weapons = {};
  }

  override get bonuses(): UnitBonuses {
    return {
      attack: { ...BOSS.attackBonuses.value },
      defence: { ...BOSS.defenceBonuses.value, range: BOSS.rangedDefence.value },
      other: { ...BOSS.otherBonuses.value },
    };
  }

  override get size(): number {
    return BOSS.size.value;
  }

  override get attackSpeed(): number {
    return ENRAGE.attackSpeed.value;
  }

  override get attackRange(): number {
    return 30;
  }

  override get idlePoseId(): number {
    return SEQ.idle.value;
  }

  override get walkingPoseId(): number {
    return SEQ.idle.value;
  }

  override get attackAnimationId(): number {
    return SEQ.projectileSingle.value;
  }

  override get deathAnimationId(): number {
    return SEQ.death.value;
  }

  override create3dModel(): Model {
    return CacheRenderModel.forRenderable(this, CacheRenderReferences.npc(NPC.leviathan.value), { spotAnims: [] });
  }

  /** The boss never leaves its pool. */
  override movementStep(): void {}

  /** Mobs take their hits before players in a tick, so the kill has to stop the player's damage right away. */
  override damageTaken(): void {
    super.damageTaken();
    if (this.currentStats.hitpoint <= 0) this.target?.stopDamage();
  }

  override attackIfPossible(): void {
    const { hooks, target } = this;
    if (hooks === null || target === null || !hooks.attacking() || this.attackDelay > 0) return;
    if (this.currentStats.hitpoint <= 0) return;
    if (target.isDying() || target.currentStats.hitpoint <= 0) return;
    const bites = inBiteReach(target.tile) && hooks.rng.chance(ENRAGE.biteChance.value);
    if (bites) {
      target.addProjectile(new BossHit(this, target, "bite", 1, hooks));
      this.didAttack(SEQ.bite.value);
      return;
    }
    const style = hooks.rng.pick(ENRAGE.styles.value);
    target.addProjectile(new BossHit(this, target, style, ENRAGE.orbFlightTicks.value, hooks));
    this.didAttack(SEQ.projectileSingle.value);
  }

  /** [WP] Inside the aura the player's ranged attacks cannot miss. */
  override incomingAttackRollModifiers(attack: IncomingAttackRoll): IncomingAttackRollModifiers {
    if (attack.weapon instanceof RangedWeapon && this.empowers(attack.attacker)) return { ...super.incomingAttackRollModifiers(attack), guaranteedHit: true };
    return super.incomingAttackRollModifiers(attack);
  }

  empowers(attacker: Unit): boolean {
    return this.hooks !== null && attacker === this.target && this.hooks.auraCovers(this.target.tile);
  }
}
