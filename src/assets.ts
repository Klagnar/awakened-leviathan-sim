import type { CacheAssets } from "osrs-sdk/asset-manifest";
import { ITEM, MAP, MODEL, NPC, SEQ, SOUND, SPOT } from "./content/leviathan/data";

export const LEVIATHAN_ASSETS = {
  npcs: {
    leviathan: {
      id: NPC.leviathan.value,
      animations: { idle: SEQ.idle.value, orb: SEQ.projectileSingle.value, bite: SEQ.bite.value, roar: SEQ.roar.value, death: SEQ.death.value },
    },
    pathfinder: {
      id: NPC.pathfinder.value,
      animations: { idle: SEQ.pathfinderIdle.value, spawn: SEQ.pathfinderSpawn.value, despawn: SEQ.pathfinderDespawn.value },
    },
    tornado: { id: NPC.tornado.value, animations: { idle: SEQ.tornado.value } },
  },
  models: { debris: { id: MODEL.debris.value } },
  regions: { arena: { id: MAP.region.value } },
  items: {
    webweaverBow: { id: ITEM.webweaverBow.value },
    phoenixNecklace: { id: ITEM.phoenixNecklace.value },
    anglerfish: { id: ITEM.anglerfish.value },
  },
  spotAnims: {
    rangedOrb: { id: SPOT.rangedOrb.value },
    magicOrb: { id: SPOT.magicOrb.value },
    rangedImpact: { id: SPOT.rangedImpact.value },
    magicImpact: { id: SPOT.magicImpact.value },
    pathfinderSpawn: { id: SPOT.pathfinderSpawn.value },
    debrisFalling: { id: SPOT.debrisFalling.value },
    debrisStays: { id: SPOT.debrisStays.value },
    levelUpMax: { id: SPOT.levelUpMax.value },
  },
  playerAnimations: {
    cheer: { id: SEQ.cheer.value },
  },
  sounds: {
    rangedLaunch: { id: SOUND.rangedLaunch.value },
    rangedImpact: { id: SOUND.rangedImpact.value },
    magicLaunch: { id: SOUND.magicLaunch.value },
    magicImpact: { id: SOUND.magicImpact.value },
    biteImpact: { id: SOUND.biteImpact.value },
    rubbleImpact: { id: SOUND.rubbleImpact.value },
    tornadoImpact: { id: SOUND.tornadoImpact.value },
  },
} as const satisfies CacheAssets;

export const ITEM_ICON_DIR = "item-icons";
export const itemIconFile = (itemId: number) => `${ITEM_ICON_DIR}/${itemId}.png`;
/** Items the SDK ships no inventory image for; scripts/assets.sh draws these from their cache models. */
export const ITEM_ICON_IDS: readonly number[] = [ITEM.webweaverBow.value, ITEM.phoenixNecklace.value, ITEM.anglerfish.value];
