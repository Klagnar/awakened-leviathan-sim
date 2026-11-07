import { CacheRenderModel, CacheRenderReferences, CacheRenderSceneModel, CollisionType, Entity, LineOfSightMask } from "osrs-sdk";
import type { Model, Region } from "osrs-sdk";
import { MAP, MODEL } from "../data";
import type { Tile } from "../types";

/** The Leviathan's lair from the cache: terrain and objects of region 8291, drawn under the SDK grid. */
export class ArenaScene extends Entity {
  constructor(region: Region) {
    super(region, { x: 0, y: 0 });
  }

  override get collisionType(): CollisionType {
    return CollisionType.NONE;
  }

  override get lineOfSight(): LineOfSightMask {
    return LineOfSightMask.NONE;
  }

  override get size(): number {
    return 1;
  }

  override get color(): string {
    return "#1d2a2a";
  }

  override draw(): void {}

  override getPerceivedRotation(): number {
    return -Math.PI / 2;
  }

  protected override create3dModel(): Model {
    return new CacheRenderSceneModel(`region:${MAP.region.value}`, { elevation: MAP.sceneElevation.value });
  }
}

/** [WS] Debris that stays: it blocks movement and line of sight until the boss dies. */
export class Debris extends Entity {
  constructor(region: Region, readonly at: Tile) {
    super(region, { x: at.x, y: at.y });
  }

  override get collisionType(): CollisionType {
    return CollisionType.BLOCK_MOVEMENT;
  }

  override get lineOfSight(): LineOfSightMask {
    return LineOfSightMask.FULL_MASK;
  }

  override get size(): number {
    return 1;
  }

  override get height(): number {
    return 0.8;
  }

  override get color(): string {
    return "#4a3f35";
  }

  protected override create3dModel(): Model {
    return CacheRenderModel.forRenderable(this, CacheRenderReferences.model(MODEL.debris.value), { spotAnims: [] });
  }
}
