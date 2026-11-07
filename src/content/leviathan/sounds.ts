import { Sound, cacheSound } from "osrs-sdk";
import { SOUND } from "./data";

const effect = (id: number): Sound => new Sound(cacheSound(id), SOUND.volume.value);

/** The boss's attacks; the bite's launch sound comes from its own sequence. */
export const SOUNDS = {
  rangedLaunch: effect(SOUND.rangedLaunch.value),
  rangedImpact: effect(SOUND.rangedImpact.value),
  magicLaunch: effect(SOUND.magicLaunch.value),
  magicImpact: effect(SOUND.magicImpact.value),
  biteImpact: effect(SOUND.biteImpact.value),
  rubbleImpact: effect(SOUND.rubbleImpact.value),
  tornadoImpact: effect(SOUND.tornadoImpact.value),
} as const;
