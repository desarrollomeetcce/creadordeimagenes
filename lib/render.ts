import sharp from "sharp";
import { demand } from "./errors";
export const ratios: Record<string, [number, number]> = {
  "1:1": [1, 1],
  "4:3": [4, 3],
  "3:4": [3, 4],
  "4:5": [4, 5],
  "5:4": [5, 4],
  "16:9": [16, 9],
  "9:16": [9, 16],
};
export async function adaptImage(bytes: Buffer, format: string) {
  const ratio = ratios[format];
  demand(ratio, "Formato no admitido.");
  const [w, h] = ratio;
  const scale = Math.ceil(1080 / Math.min(w, h));
  return sharp(bytes, { limitInputPixels: 40000000 })
    .resize(w * scale, h * scale, {
      fit: "contain",
      background: "#ffffff",
      withoutEnlargement: false,
    })
    .png()
    .toBuffer();
}
export async function jpeg(bytes: Buffer) {
  return sharp(bytes, { limitInputPixels: 40000000 })
    .flatten({ background: "#fff" })
    .jpeg({ quality: 92 })
    .toBuffer();
}
