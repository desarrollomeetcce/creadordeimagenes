import type { Design } from "./design";
export type ResizeHandle = "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "nw";
type Layer = Design["layers"][number];
export function resizeLayer(
  layer: Layer,
  handle: ResizeHandle,
  dx: number,
  dy: number,
  canvas: { width: number; height: number },
  startHeight: number,
): Layer {
  const west = handle.includes("w"),
    east = handle.includes("e"),
    north = handle.includes("n"),
    south = handle.includes("s");
  const oldHeight = layer.type === "text" ? startHeight : layer.height;
  const left = west
    ? Math.max(0, Math.min(layer.x + layer.width - 20, layer.x + dx))
    : layer.x;
  const right = east
    ? Math.max(left + 20, Math.min(canvas.width, layer.x + layer.width + dx))
    : layer.x + layer.width;
  const top = north
    ? Math.max(0, Math.min(layer.y + oldHeight - 20, layer.y + dy))
    : layer.y;
  const bottom = south
    ? Math.max(top + 20, Math.min(canvas.height, layer.y + oldHeight + dy))
    : layer.y + oldHeight;
  const width = Math.round(right - left),
    height = Math.round(bottom - top);
  if (layer.type === "text")
    return {
      ...layer,
      x: Math.round(left),
      y: Math.round(top),
      width,
      fontSize:
        north || south
          ? Math.max(
              12,
              Math.min(
                240,
                Math.round((layer.fontSize * height) / Math.max(1, oldHeight)),
              ),
            )
          : layer.fontSize,
    };
  return { ...layer, x: Math.round(left), y: Math.round(top), width, height };
}
