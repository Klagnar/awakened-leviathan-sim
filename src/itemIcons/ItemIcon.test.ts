import { hsl, priority, renderItemIcon } from "./ItemIcon";
import type { Face, Hsl, IconItem, IconModel, Priority, Shading, Sprite } from "./ItemIcon";

const FRONT_ON: IconItem = {
  zoom2d: 512,
  xan2d: 0,
  yan2d: 0,
  zan2d: 0,
  xOffset2d: 0,
  yOffset2d: 0,
  resize: { x: 128, y: 128, z: 128 },
  recolours: [],
  ambient: 0,
  contrast: 0,
};
const RED = hsl(960);
const BLUE = hsl(44992);
const GREEN = hsl(22464);

function square(left: number, right: number, half: number, z: number, colour: Hsl, priority: Priority, first: number): IconModel {
  const vertices = [
    { x: left, y: -half, z },
    { x: right, y: -half, z },
    { x: right, y: half, z },
    { x: left, y: half, z },
  ];
  const face = (b: number, c: number): Face => ({ corners: [first, first + b, first + c], colour, shading: "flat", priority });
  return { vertices, faces: [face(2, 1), face(3, 2)] };
}

function picture(sprite: Sprite, legend: Readonly<Record<string, number>>): string[] {
  const letters = new Map(Object.entries(legend).map(([letter, rgb]) => [rgb, letter]));
  return Array.from({ length: sprite.height }, (_, y) =>
    sprite.pixels.slice(y * sprite.width, (y + 1) * sprite.width).map((pixel) => (pixel === 0 ? "." : letters.get(pixel) ?? "?")).join(""),
  );
}

describe("renderItemIcon matches RuneLite's ItemSpriteFactory output at commit 12f56ce", () => {
  test("a flat face fills edge to edge inside a one-pixel outline, cropped to the outline", () => {
    expect(picture(renderItemIcon(FRONT_ON, square(-4, 4, 4, 0, RED, 0, 0)), { o: 0x000001, r: 0xdd2e1a })).toEqual([
      ".oooooooo.",
      "orrrrrrrro",
      "orrrrrrrro",
      "orrrrrrrro",
      "orrrrrrrro",
      "orrrrrrrro",
      "orrrrrrrro",
      "orrrrrrrro",
      "orrrrrrrro",
      ".oooooooo.",
    ]);
  });

  test("a face with a higher priority covers a nearer face", () => {
    const near = square(-4, 4, 4, 0, RED, 0, 0);
    const far = square(0, 8, 4, 8, BLUE, 1, 4);
    const model: IconModel = { vertices: [...near.vertices, ...far.vertices], faces: [...near.faces, ...far.faces] };
    expect(picture(renderItemIcon(FRONT_ON, model), { o: 0x000001, r: 0xdd2e1a, b: 0x391add })).toEqual([
      ".oooooooo....",
      "orrrrrrrrooo.",
      "orrrrbbbbbbbo",
      "orrrrbbbbbbbo",
      "orrrrbbbbbbbo",
      "orrrrbbbbbbbo",
      "orrrrbbbbbbbo",
      "orrrrbbbbbbbo",
      "orrrrrrrrooo.",
      ".oooooooo....",
    ]);
  });

  test("the item's recolour applies before smooth faces are shaded pixel by pixel", () => {
    const smooth: Shading = "smooth";
    const pyramid: IconModel = {
      vertices: [
        { x: -5, y: -5, z: 0 },
        { x: 5, y: -5, z: 0 },
        { x: 5, y: 5, z: 0 },
        { x: -5, y: 5, z: 0 },
        { x: 0, y: 0, z: -6 },
      ],
      faces: [1, 2, 3, 0].map((b, i) => ({ corners: [4, b, i], colour: RED, shading: smooth, priority: 0 })),
    };
    const sprite = renderItemIcon({ ...FRONT_ON, recolours: [{ from: RED, to: GREEN }] }, pyramid);
    expect([sprite.width, sprite.height]).toEqual([12, 12]);
    expect(sprite.pixels.slice(12, 24)).toEqual([
      0x000001, 0x1df626, 0x1df126, 0x1dec24, 0x1ae524, 0x1ae022, 0x1ada22, 0x1ad320, 0x18cd20, 0x18c820, 0x18c21d, 0x000001,
    ]);
  });
});

test("a face colour is a 16-bit packed HSL value", () => {
  expect(hsl(0xffff)).toBe(0xffff);
  expect(() => hsl(0x10000)).toThrow("not a packed HSL colour: 65536");
});

test("a face priority is 0 to 11", () => {
  expect(priority(11)).toBe(11);
  expect(() => priority(12)).toThrow("not a face priority: 12");
});
