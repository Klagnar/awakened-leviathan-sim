import { CacheRenderModel, CacheRenderReferences } from "osrs-sdk";
import type { Model } from "osrs-sdk";
import { NPC, SEQ } from "../data";
import { isFloor } from "../geometry";
import type { Tile } from "../types";
import { chebyshev, sameTile, tile } from "../types";
import { ScriptedNpc } from "./ScriptedNpc";

const key = ({ x, y }: Tile): string => `${x},${y}`;

type Passable = (at: Tile) => boolean;

const STEPS: readonly (readonly [number, number])[] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

/** Passable tiles one step away; a diagonal step needs both tiles beside it passable, so it cannot clip a corner. */
function neighbours(from: Tile, passable: Passable): Tile[] {
  return STEPS.filter(([dx, dy]) => passable(tile(from.x + dx, from.y + dy)) && passable(tile(from.x + dx, from.y)) && passable(tile(from.x, from.y + dy))).map(([dx, dy]) =>
    tile(from.x + dx, from.y + dy),
  );
}

/** Steps from every passable tile to `target`. */
function stepsTo(target: Tile, passable: Passable): Map<string, number> {
  const distance = new Map([[key(target), 0]]);
  const queue = [target];
  for (let i = 0; i < queue.length; i++) {
    const from = queue[i];
    const next = (distance.get(key(from)) ?? 0) + 1;
    for (const to of neighbours(from, passable)) {
      if (distance.has(key(to))) continue;
      distance.set(key(to), next);
      queue.push(to);
    }
  }
  return distance;
}

/** [WS] Awakened: the tornado that spawns at 50% and chases the player. It stays on the floor. */
export class Tornado extends ScriptedNpc {
  /**
   * The next tile on a shortest walk to `target` around `blocked` rocks, never through the pool; null when it is already
   * there. Only when rocks wall the target off does it go over them. Of the steps that are as short, it takes the one
   * that best lines it up with the target's row or column.
   */
  nextStepToward(target: Tile, blocked: Passable): Tile | null {
    if (sameTile(this.tile, target)) return null;
    const offLine = (at: Tile): number => Math.min(Math.abs(at.x - target.x), Math.abs(at.y - target.y));
    const rules: readonly Passable[] = [(at) => isFloor(at) && !blocked(at), isFloor];
    for (const passable of rules) {
      const distance = stepsTo(target, passable);
      const here = distance.get(key(this.tile)) ?? Infinity;
      const steps = neighbours(this.tile, passable).filter((at) => (distance.get(key(at)) ?? Infinity) < here);
      if (steps.length === 0) continue;
      steps.sort(
        (a, b) =>
          (distance.get(key(a)) ?? Infinity) - (distance.get(key(b)) ?? Infinity) || offLine(a) - offLine(b) || chebyshev(a, target) - chebyshev(b, target),
      );
      return steps[0];
    }
    return null;
  }

  override mobName(): string {
    return "Tornado";
  }

  override get idlePoseId(): number {
    return SEQ.tornado.value;
  }

  override get walkingPoseId(): number {
    return SEQ.tornado.value;
  }

  override create3dModel(): Model {
    return CacheRenderModel.forRenderable(this, CacheRenderReferences.npc(NPC.tornado.value), { spotAnims: [] });
  }
}
