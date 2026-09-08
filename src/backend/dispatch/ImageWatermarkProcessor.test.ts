import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { applyImageWatermark } from './ImageWatermarkProcessor';

describe('applyImageWatermark', () => {
  it('renderiza o texto sem alterar as dimensões da imagem', async () => {
    const input = await sharp({ create: { width: 320, height: 240, channels: 3, background: '#8b5a2b' } }).jpeg().toBuffer();
    const result = await applyImageWatermark(new Uint8Array(input), 'image/jpeg', {
      enabled: true, text: '@minhaloja', position: 'bottom-right', opacity: 0.7,
    });
    const metadata = await sharp(result.bytes).metadata();
    expect(result.mimeType).toBe('image/jpeg');
    expect(metadata.width).toBe(320);
    expect(metadata.height).toBe(240);
    expect(Buffer.from(result.bytes).equals(input)).toBe(false);
  });
});
