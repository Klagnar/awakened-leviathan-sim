import React, { useEffect, useState } from "react";
import { CacheRender, ControlPanelController, MapController, Settings, SoundCache, TrainerInstance, TrainerLoadingState } from "osrs-sdk";
import { GameOverlay, TrainerApp, TrainerLoadingSplash, useSettingsSnapshot } from "osrs-sdk-react";
import { ENRAGE } from "./content/leviathan/data";
import type { FightOptions } from "./content/leviathan/fight";
import { formatTicks } from "./content/leviathan/fight";
import { inBiteReach } from "./content/leviathan/geometry";
import { LeviathanRegion } from "./content/leviathan/LeviathanRegion";
import { startHitLog } from "./hitLog";
import { keepHoverTextOnCanvas } from "./hoverText";

keepHoverTextOnCanvas();
// Desktop browsers start the SDK's AudioContext suspended until a user gesture, and the SDK never resumes it.
window.addEventListener("pointerdown", () => void SoundCache.context?.resume(), { capture: true });

export const CREDIT_LINE =
  "Created using intellectual property belonging to Jagex Limited under the terms of Jagex's Fan Content Policy. This content is not endorsed by or affiliated with Jagex.";

declare global {
  interface Window {
    __leviathanProbe?: Readonly<{ region: LeviathanRegion; trainer: TrainerInstance; panel: ControlPanelController }>;
  }
}

/** Reads ?hp=19.9&seed=123&aura=0&bite=0; anything missing or malformed falls back to the default. */
export function parseOptions(url: URL, freshSeed: () => number): FightOptions {
  const params = url.searchParams;
  const percent = Number(params.get("hp"));
  const seed = Number(params.get("seed"));
  return {
    startFraction: params.has("hp") && percent > 0 && percent <= 100 ? percent / 100 : ENRAGE.startFraction.value,
    seed: params.has("seed") && Number.isInteger(seed) && seed >= 0 ? seed : freshSeed(),
    showAura: params.get("aura") !== "0",
    showBiteReach: params.get("bite") !== "0",
  };
}

const DEFAULTS_APPLIED_KEY = "awakened-leviathan-sim:keybinds-v2";
const CONTROL_PANEL_SCALE = 3;
const CONTROL_PANEL_FILL = 0.75;
const MINIMAP_SCALE = 1.6;

/** F1 inventory and F2 prayer, once; later changes in Keybinds stick. The SDK binds equipment to F1 and spells to F2. */
function applyFirstRunKeybinds(): void {
  if (window.localStorage.getItem(DEFAULTS_APPLIED_KEY)) return;
  Settings.set({ inventory_key: "F1", prayer_key: "F2", equipment_key: "F3", spellbook_key: "F4" });
  window.localStorage.setItem(DEFAULTS_APPLIED_KEY, "1");
}

/** Runs one SDK layout step as if the UI scale were `scale`; the setting itself scales every part of the UI at once. */
function atUiScale<T>(scale: number, layout: () => T): T {
  const uiScale = Settings.maxUiScale;
  Settings.maxUiScale = scale;
  try {
    return layout();
  } finally {
    Settings.maxUiScale = uiScale;
  }
}

/**
 * Grows only the side panel (tabs, inventory, prayers): three quarters of the largest size that fits under the
 * minimap, capped at three times its usual size.
 */
function enlargeControlPanel(): void {
  const panel = ControlPanelController.controller;
  const fitTabScale = panel.getTabScale.bind(panel);
  const tabScaleUpTo = (cap: number) => atUiScale(cap, fitTabScale);
  panel.getTabScale = () => tabScaleUpTo(Math.max(1, tabScaleUpTo(CONTROL_PANEL_SCALE) * CONTROL_PANEL_FILL));
}

/** Grows the minimap and its orbs, so the special attack orb is an easier target. Clicks follow the drawn size. */
function enlargeMinimap(): void {
  const map = MapController.controller;
  const draw = map.draw.bind(map);
  map.draw = (context) => atUiScale(MINIMAP_SCALE, () => draw(context));
}

function createTrainer() {
  CacheRender.configure(new URL("osrs-assets/manifest.json", window.location.href).href);
  Settings.readFromStorage();
  applyFirstRunKeybinds();
  enlargeControlPanel();
  enlargeMinimap();
  const options = parseOptions(new URL(window.location.href), () => crypto.getRandomValues(new Uint32Array(1))[0]);
  const region = new LeviathanRegion(options);
  if (process.env.NODE_ENV !== "production") startHitLog(region);
  const trainer = new TrainerInstance(region);
  if (process.env.NODE_ENV !== "production") window.__leviathanProbe = Object.freeze({ region, trainer, panel: ControlPanelController.controller });
  return { trainer, region, options };
}

function Controls({ options }: Readonly<{ options: FightOptions }>) {
  const [hp, setHp] = useState(String(Math.round(options.startFraction * 1000) / 10));
  const [seed, setSeed] = useState("");
  const [aura, setAura] = useState(options.showAura);
  const [bite, setBite] = useState(options.showBiteReach);
  const { playsAudio } = useSettingsSnapshot();
  const restart = () => {
    const url = new URL(window.location.href);
    url.searchParams.set("hp", hp.trim());
    if (seed.trim()) url.searchParams.set("seed", seed.trim());
    else url.searchParams.delete("seed");
    url.searchParams.set("aura", aura ? "1" : "0");
    url.searchParams.set("bite", bite ? "1" : "0");
    window.location.assign(url.href);
  };
  const stop = (event: React.KeyboardEvent) => event.stopPropagation();

  return (
    <form id="drill_controls" onSubmit={(event) => { event.preventDefault(); restart(); }}>
      <label>
        Boss HP % <input id="hp" inputMode="decimal" value={hp} onInput={(event) => setHp(event.currentTarget.value)} onKeyDown={stop} />
      </label>
      <label>
        Seed <input id="seed" inputMode="numeric" placeholder={String(options.seed)} value={seed} onInput={(event) => setSeed(event.currentTarget.value)} onKeyDown={stop} />
      </label>
      <label>
        Aura <input id="aura" type="checkbox" checked={aura} onChange={(event) => setAura(event.target.checked)} />
      </label>
      <label>
        Bite reach <input id="bite" type="checkbox" checked={bite} onChange={(event) => setBite(event.target.checked)} />
      </label>
      <button id="restart" type="submit">Restart</button>
      <button id="keybinds" type="button" onClick={() => ControlPanelController.controller.setActiveControl("SETTINGS")}>Keybinds</button>
      <label>
        Sound <input id="sound" type="checkbox" checked={playsAudio} onChange={(event) => Settings.set({ playsAudio: event.target.checked })} />
      </label>
    </form>
  );
}

const CHAT_LINES_SHOWN = 5;
const POLL_MS = 300;

function usePolled<T>(read: () => T, same: (a: T, b: T) => boolean): T {
  const [value, setValue] = useState(read);
  useEffect(() => {
    const poll = window.setInterval(() => setValue((shown) => {
      const latest = read();
      return same(latest, shown) ? shown : latest;
    }), POLL_MS);
    return () => window.clearInterval(poll);
  }, [read, same]);
  return value;
}

const sameLines = (a: readonly string[], b: readonly string[]) => a.length === b.length;
const sameText = (a: string, b: string) => a === b;

function GameChat({ region }: Readonly<{ region: LeviathanRegion }>) {
  const [read] = useState(() => () => region.chat());
  const lines = usePolled(read, sameLines);
  return (
    <ol id="game_chat">
      {lines.slice(-CHAT_LINES_SHOWN).map((line, index) => <li key={index}>{line}</li>)}
    </ol>
  );
}

function Status({ region }: Readonly<{ region: LeviathanRegion }>) {
  const [read] = useState(() => () => {
    const fight = region.current();
    if (!fight) return "";
    const { boss, player, run, ticks } = fight;
    const aura = fight.safeNextTick(player.tile) ? "in aura" : "OUT OF AURA";
    const where = inBiteReach(player.tile) ? `${aura} · BITE RANGE` : aura;
    const state = run.kind === "fighting" ? where : run.kind === "won" ? "kill" : "dead";
    return `Leviathan ${Math.max(0, boss.currentStats.hitpoint)}/${boss.stats.hitpoint} · ${formatTicks(ticks)} · ${state}`;
  });
  const text = usePolled(read, sameText);
  return <p id="fight_status">{text}</p>;
}

export function App() {
  const [{ trainer, region, options }] = useState(createTrainer);
  const [loading, setLoading] = useState<TrainerLoadingState>();

  return (
    <TrainerApp trainer={trainer} onLoadingStateChange={setLoading}>
      <GameOverlay>
        <TrainerLoadingSplash state={loading} />
        <Status region={region} />
        <GameChat region={region} />
        <Controls options={options} />
        <p id="credit_line">{CREDIT_LINE}</p>
      </GameOverlay>
    </TrainerApp>
  );
}
