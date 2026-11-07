import { ClickController } from "osrs-sdk";

export function keepHoverTextOnCanvas(): void {
  const measure = document.createElement("canvas").getContext("2d");
  if (measure === null) return;
  const box = { right: 0, bottom: 0 };
  measure.fillRect = (x: number, y: number, width: number, height: number) => {
    box.right = Math.max(box.right, x + width);
    box.bottom = Math.max(box.bottom, y + height);
  };
  const draw = ClickController.prototype.drawHoverTooltip;
  ClickController.prototype.drawHoverTooltip = function (this: ClickController, context: CanvasRenderingContext2D) {
    box.right = 0;
    box.bottom = 0;
    draw.call(this, measure);
    context.save();
    context.translate(Math.min(0, context.canvas.width - box.right), Math.min(0, context.canvas.height - box.bottom));
    draw.call(this, context);
    context.restore();
  };
}
