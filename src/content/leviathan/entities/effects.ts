import * as THREE from "three";
import { CacheRenderInstancedModel, CacheRenderReferences, CollisionType, Entity, GROUND_OVERLAY_Y, LineOfSightMask, Settings } from "osrs-sdk";
import type { Location3, Model, Region } from "osrs-sdk";
import type { Tile } from "../types";

/** Anything drawn on the floor rather than standing on it. */
abstract class FloorEntity extends Entity {
  override get collisionType(): CollisionType {
    return CollisionType.NONE;
  }

  override get lineOfSight(): LineOfSightMask {
    return LineOfSightMask.NONE;
  }

  override get size(): number {
    return 1;
  }
}

export type SpotOptions = Readonly<{
  /** Client cycles (20 ms) before the effect starts. */
  delay?: number;
  height?: number;
  /** Remove after this many ticks even when the animation has not reported its end. */
  maxTicks?: number;
}>;

class SpotModel implements Model {
  private playing: CacheRenderInstancedModel | null = null;

  constructor(private readonly renderable: GroundSpot) {}

  draw(scene: THREE.Scene, clockDelta: number, tickPercent: number, location: Location3, angleRadians: number, pitchRadians: number, visible: boolean, modelOffsets: Location3[]): void {
    if (this.playing === null && !this.renderable.finished()) {
      const { id, options } = this.renderable;
      this.playing = CacheRenderInstancedModel.forRenderable(
        this.renderable,
        CacheRenderReferences.spotAnim([{ id, delay: options.delay ?? 0, rotation: 0, height: options.height ?? 0 }]),
        { onSpotAnimComplete: () => this.renderable.complete() },
      );
    }
    this.playing?.draw(scene, clockDelta, tickPercent, location, 0, pitchRadians, visible && !this.renderable.finished(), modelOffsets);
  }

  destroy(scene: THREE.Scene): void {
    this.playing?.destroy(scene);
    this.playing = null;
  }

  getWorldPosition(): THREE.Vector3 {
    return this.playing?.getWorldPosition() ?? new THREE.Vector3();
  }

  async preload(): Promise<void> {}
}

/** A cache spotanim played once on a floor tile. */
export class GroundSpot extends FloorEntity {
  private age = 0;
  private done = false;

  constructor(region: Region, at: Tile, readonly id: number, readonly options: SpotOptions = {}) {
    super(region, { x: at.x, y: at.y });
  }

  finished(): boolean {
    return this.done;
  }

  complete(): void {
    this.done = true;
  }

  override tick(): void {
    this.age++;
    if (this.done || this.age > (this.options.maxTicks ?? 12)) {
      this.done = true;
      this.dying = 0;
    }
  }

  override draw(): void {}

  protected override create3dModel(): Model {
    return new SpotModel(this);
  }
}

export type TileMark = Readonly<{ tile: Tile; colour: number; opacity: number }>;

const MAX_MARKS = 600;

class TileMarksModel implements Model {
  private readonly geometry = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  private readonly material = new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, opacity: 1 });
  private readonly mesh: THREE.InstancedMesh;
  private readonly matrix = new THREE.Matrix4();
  private readonly colour = new THREE.Color();
  private readonly opacities = new Float32Array(MAX_MARKS);

  constructor(private readonly marks: () => readonly TileMark[], height: number) {
    this.geometry.setAttribute("instanceOpacity", new THREE.InstancedBufferAttribute(this.opacities, 1));
    this.material.onBeforeCompile = (shader) => {
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nattribute float instanceOpacity;\nvarying float vInstanceOpacity;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvInstanceOpacity = instanceOpacity;");
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying float vInstanceOpacity;")
        .replace("#include <opaque_fragment>", "#include <opaque_fragment>\ngl_FragColor.a *= vInstanceOpacity;");
    };
    this.mesh = new THREE.InstancedMesh(this.geometry, this.material, MAX_MARKS);
    this.mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(MAX_MARKS * 3), 3);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
    this.mesh.position.y = height;
  }

  draw(scene: THREE.Scene, clockDelta: number, tickPercent: number, location: Location3, angleRadians: number, pitchRadians: number, visible: boolean): void {
    if (this.mesh.parent !== scene) scene.add(this.mesh);
    const marks = this.marks();
    const count = Math.min(MAX_MARKS, marks.length);
    for (let i = 0; i < count; i++) {
      const { tile, colour, opacity } = marks[i];
      this.matrix.makeScale(1, 1, 1).setPosition(tile.x + 0.5, 0, tile.y - 0.5);
      this.mesh.setMatrixAt(i, this.matrix);
      this.mesh.setColorAt(i, this.colour.setHex(colour));
      this.opacities[i] = opacity;
    }
    this.mesh.count = count;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
    this.geometry.getAttribute("instanceOpacity").needsUpdate = true;
    this.mesh.visible = visible && count > 0;
  }

  destroy(scene: THREE.Scene): void {
    scene.remove(this.mesh);
    this.geometry.dispose();
    this.material.dispose();
  }

  getWorldPosition(): THREE.Vector3 {
    return new THREE.Vector3();
  }

  async preload(): Promise<void> {}
}

/** Translucent tiles, rebuilt every frame from a provider (the aura, debris shadows, bite reach). */
export class TileMarks extends FloorEntity {
  constructor(region: Region, private readonly marks: () => readonly TileMark[], private readonly overlayY = GROUND_OVERLAY_Y + 0.004) {
    super(region, { x: 0, y: 0 });
  }

  override draw(tickPercent: number, context: OffscreenCanvasRenderingContext2D): void {
    const scale = Settings.tileSize;
    for (const { tile, colour, opacity } of this.marks()) {
      context.globalAlpha = opacity;
      context.fillStyle = `#${colour.toString(16).padStart(6, "0")}`;
      context.fillRect(tile.x * scale, tile.y * scale, scale, scale);
    }
    context.globalAlpha = 1;
  }

  protected override create3dModel(): Model {
    return new TileMarksModel(this.marks, this.overlayY);
  }
}
