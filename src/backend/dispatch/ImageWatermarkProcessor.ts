import sharp from 'sharp';
import type { DispatchWatermarkSettings } from '../../domain/dispatch/types';
import { validateImage } from '../media/ImageFileValidator';

function xml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;',
  })[character] ?? character);
}

function coordinates(position: DispatchWatermarkSettings['position'], width: number, height: number, padding: number) {
  if (position === 'top-left') return { x: padding, y: padding, anchor: 'start', baseline: 'hanging' };
  if (position === 'top-right') return { x: width - padding, y: padding, anchor: 'end', baseline: 'hanging' };
  if (position === 'bottom-left') return { x: padding, y: height - padding, anchor: 'start', baseline: 'auto' };
  if (position === 'center') return { x: width / 2, y: height / 2, anchor: 'middle', baseline: 'middle' };
  return { x: width - padding, y: height - padding, anchor: 'end', baseline: 'auto' };
}

export async function applyImageWatermark(
  bytes: Uint8Array,
  mimeType: string,
  settings: DispatchWatermarkSettings,
): Promise<{ bytes: Uint8Array; mimeType: string }> {
  if (!settings.enabled) return { bytes, mimeType };
  const source = validateImage(bytes, mimeType);
  const shortestSide = Math.min(source.width, source.height);
  const fontSize = Math.max(18, Math.min(64, Math.round(shortestSide * 0.055)));
  const padding = Math.max(14, Math.round(shortestSide * 0.035));
  const point = coordinates(settings.position, source.width, source.height, padding);
  const overlay = Buffer.from(`<svg width="${source.width}" height="${source.height}" xmlns="http://www.w3.org/2000/svg">
    <text x="${point.x}" y="${point.y}" text-anchor="${point.anchor}" dominant-baseline="${point.baseline}"
      font-family="Arial, Helvetica, sans-serif" font-size="${fontSize}" font-weight="700"
      fill="white" fill-opacity="${settings.opacity}" stroke="black" stroke-opacity="${Math.min(0.65, settings.opacity)}"
      stroke-width="${Math.max(1, Math.round(fontSize / 18))}" paint-order="stroke">${xml(settings.text)}</text>
  </svg>`);
  const pipeline = sharp(bytes).composite([{ input: overlay, top: 0, left: 0 }]);
  let output: Buffer;
  if (source.mimeType === 'image/png') output = await pipeline.png({ compressionLevel: 9 }).toBuffer();
  else if (source.mimeType === 'image/webp') output = await pipeline.webp({ quality: 88 }).toBuffer();
  else output = await pipeline.jpeg({ quality: 88, mozjpeg: true }).toBuffer();
  const validated = validateImage(output, source.mimeType);
  return { bytes: new Uint8Array(output), mimeType: validated.mimeType };
}
