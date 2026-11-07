import type { LeviathanRegion } from "./content/leviathan/LeviathanRegion";
import type { FightLog, HitRecord, Protection, Tile } from "./content/leviathan/types";

/** Served by the dev server only (webpack.config.js), which appends to hit-log.md in the project root. */
const ENDPOINT = "/__hit-log";

const COLUMNS = ["Tick", "Fired", "Source", "You", "Landed on", "Pathfinder", "Dist", "In aura", "On blue", "Needed", "Praying", "Lit", "Outcome", "Dmg", "HP after", "Check"];

const at = ({ x, y }: Tile): string => `(${x}, ${y})`;
const yesNo = (value: boolean): string => (value ? "yes" : "no");
const prayer = (protection: Protection): string => protection ?? "none";

/** Flags rows that contradict the rules the simulator claims to follow. */
function check(hit: HitRecord): string {
  const flags: string[] = [];
  const prayedRight = hit.needed !== null && hit.praying === hit.needed;
  if (prayedRight && hit.onBlue && hit.damage > 0) flags.push("HIT ON BLUE WITH RIGHT PRAYER");
  if (hit.onBlue && !hit.inAura) flags.push("BLUE BUT OUT OF AURA");
  return flags.join("; ");
}

function row(hit: HitRecord): string {
  const cells = [
    hit.tick,
    hit.launchedAt,
    hit.source,
    at(hit.you),
    at(hit.landedOn),
    at(hit.pathfinder),
    hit.pathfinderDistance,
    yesNo(hit.inAura),
    yesNo(hit.onBlue),
    prayer(hit.needed),
    prayer(hit.praying),
    hit.lit.join(", "),
    hit.outcome,
    hit.damage,
    hit.hpAfter,
    check(hit),
  ];
  return `| ${cells.join(" | ")} |\n`;
}

function header(entry: Extract<FightLog, { kind: "run" }>, tab: string): string {
  const started = new Date().toLocaleString();
  return [
    "",
    `## Run ${started} · tab ${tab} · seed ${entry.seed} · boss ${entry.bossHp} HP · you ${entry.startHp} HP`,
    "",
    `| ${COLUMNS.join(" | ")} |`,
    `|${COLUMNS.map(() => "---").join("|")}|`,
    "",
  ].join("\n");
}

/** Logs every hit to the console and to hit-log.md, in order. */
export function startHitLog(region: LeviathanRegion): () => void {
  const tab = Math.random().toString(36).slice(2, 6);
  let runs = 0;
  /** Sent with the run's first hit, so runs nobody played leave no empty tables. */
  let unsentHeader = "";
  let pending: Promise<unknown> = Promise.resolve();
  const append = (text: string): void => {
    const body = JSON.stringify({ run: `${tab}-${runs}`, text: unsentHeader + text });
    unsentHeader = "";
    pending = pending.then(() => fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body })).catch(() => undefined);
  };
  return region.onLog((entry) => {
    switch (entry.kind) {
      case "run":
        runs++;
        console.log(`[hit-log] new run, tab ${tab}, seed ${entry.seed}`);
        unsentHeader = header(entry, tab);
        return;
      case "hit": {
        const { hit } = entry;
        console.log(
          `[hit-log] t${hit.tick} ${hit.source} fired t${hit.launchedAt}: you ${at(hit.you)}, landed ${at(hit.landedOn)}, pathfinder ${at(hit.pathfinder)} (${hit.pathfinderDistance} away), ` +
            `aura ${yesNo(hit.inAura)}, blue ${yesNo(hit.onBlue)}, needed ${prayer(hit.needed)}, praying ${prayer(hit.praying)} -> ${hit.outcome} ${hit.damage}`,
          hit,
        );
        append(row(hit));
        return;
      }
      default: {
        const unhandled: never = entry;
        return unhandled;
      }
    }
  });
}
