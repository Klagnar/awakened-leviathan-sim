# Patches to the pinned osrs-sdk

`scripts/install-beta-sdk.sh` applies every `osrs-sdk-*.patch` here to the SDK checkout (`OSRS_SDK_COMMIT`) before it
builds. Regenerate a patch with `git diff` in a clean checkout of that commit.

## osrs-sdk-perf.patch

The first load and the first use of each effect stalled the main thread for seconds (profiled at 4x CPU throttle: a 7 s
freeze while loading, 3 s frames when phase 3's first bombs and slash appear).

- `utils/colors.ts`: each packed cache colour is converted to linear RGB once and reused. Building an effect converted
  every vertex of every animation frame, and actor spotanims did it again on every frame they played.
- `CacheRenderInstancedModel.ts`: an effect's animation frames share one index buffer, and one colour buffer while their
  alphas match; the unlit material skips the normals pass.
- `utils/payloadUtils.ts`: payloads inflate with the browser's native `DecompressionStream` instead of fflate on the main
  thread, falling back to fflate where it is missing.
- `CacheRenderInstancedModel.ts` also applies a spotanim definition's own `rotation` (0 / 90 / 180 / 270, clockwise
  seen from above), which it ignored. The `_90`, `_180` and `_270` variants are one model turned, so every phase 1 crack
  drew as the north (or north-east) piece: lines running east-west or north-west to south-east showed as a row of
  pieces lying across the line. Phase 3's Untether arena effect, turned per quadrant, was off the same way.
- `CacheRenderModel.ts`: a `spotAnims` option lists the effects that can attach to a model. Without it every NPC, player
  and scenery model builds a mesh for each of the bundle's ~120 spotanims, so each new void patch, vine or rift stalled
  the frame it appeared. The sim lists Ocellus's (`BOSS_SPOTS`), gives vines, rifts and void patches none, and leaves
  the player on the default (SDK weapons attach their own).
