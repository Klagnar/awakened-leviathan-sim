import { defineConfig } from "osrs-sdk-assets";
import { LEVIATHAN_ASSETS } from "./src/assets";
import { MAP } from "./src/content/leviathan/data";

export default defineConfig({
  cache: { openrs2: MAP.openrs2Cache.value },
  assets: LEVIATHAN_ASSETS,
  outDir: "./public/osrs-assets",
});
