import {
  AttackStyle,
  AttackStylesController,
  AvernicTreadsMax,
  DizanasQuiver,
  Karambwan,
  MasoriBodyF,
  MasoriChapsF,
  MasoriMaskF,
  NecklaceOfAnguish,
  VenatorRing,
  ZaryteVambraces,
} from "osrs-sdk";
import type { Item, Player } from "osrs-sdk";
import { ITEM_STATS } from "./data";
import { Anglerfish, LeviathanTwistedBow, PhoenixNecklace, SeekingDragonArrows, WebweaverBow } from "./gear/items";

/** Webweaver and Phoenix necklace worn to open the phase; Twisted bow and Necklace of anguish to switch to; the rest
 * anglerfish with a karambwan to the right of each, for combo eating. */
export function dress(player: Player): void {
  const webweaver = new WebweaverBow();
  player.equipment.weapon = webweaver;
  player.equipment.ammo = new SeekingDragonArrows();
  player.equipment.helmet = new MasoriMaskF();
  player.equipment.chest = new MasoriBodyF();
  player.equipment.legs = new MasoriChapsF();
  player.equipment.necklace = new PhoenixNecklace();
  player.equipment.cape = new DizanasQuiver();
  player.equipment.gloves = new ZaryteVambraces();
  player.equipment.feet = new AvernicTreadsMax();
  player.equipment.ring = new VenatorRing();

  const bow = new LeviathanTwistedBow();
  const switches: Item[] = [bow, new NecklaceOfAnguish()];
  const comboPairs = (player.inventory.length - switches.length) / 2;
  const food = Array.from({ length: comboPairs }, (): Item[] => [new Anglerfish(), new Karambwan()]).flat();
  [...switches, ...food].forEach((item, index) => (player.inventory[index] = item));
  player.equipmentChanged();
  AttackStylesController.controller.setWeaponAttackStyle(webweaver, AttackStyle.RAPID);
  AttackStylesController.controller.setWeaponAttackStyle(bow, AttackStyle.RAPID);
}

/** Rigour and Protect from Range are on as the phase starts, Hitpoints are overhealed by an angler eaten during
 * pre-enrage, and a ranging potion has just been sipped. */
export function prepare(player: Player): void {
  for (const name of STARTING_PRAYERS) {
    const prayer = player.prayerController.findPrayerByName(name);
    if (!prayer.isActive) prayer.toggle(player);
  }
  player.currentStats.hitpoint = STARTING_HITPOINTS;
  player.currentStats.range = rangingPotionBoost(player.stats.range);
}

export function rangingPotionBoost(level: number): number {
  const { flat, fraction } = ITEM_STATS.rangingPotion.value;
  return level + flat + Math.floor(level * fraction);
}

const STARTING_PRAYERS = ["Rigour", "Protect from Range"] as const;
const STARTING_HITPOINTS = 120;
