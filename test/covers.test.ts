import { describe, it, expect, vi } from 'vitest';
import sharp from 'sharp';

vi.mock('@/lib/storage', () => ({
  uploadCover: vi.fn(),
}));
vi.mock('@/lib/db/with-user', () => ({
  withUser: vi.fn(),
}));

describe('normalizarCapa', () => {
  it('reduz uma capa grande e devolve JPEG', async () => {
    const grande = await sharp({
      create: {
        width: 2400,
        height: 3600,
        channels: 3,
        background: { r: 10, g: 20, b: 30 },
      },
    })
      .jpeg({ quality: 100 })
      .toBuffer();

    const { normalizarCapa, COVER_MAX_WIDTH } = await import('@/lib/covers');
    const { buf, ext } = await normalizarCapa(grande);
    const meta = await sharp(buf).metadata();

    expect(ext).toBe('jpg');
    expect(meta.format).toBe('jpeg');
    expect(meta.width ?? 0).toBeLessThanOrEqual(COVER_MAX_WIDTH);
    expect(buf.length).toBeLessThan(grande.length);
  });

  it('devolve o buffer intacto quando não é uma imagem decodificável', async () => {
    const { normalizarCapa } = await import('@/lib/covers');
    const lixo = Buffer.from('nao-e-imagem');
    const { buf } = await normalizarCapa(lixo);
    expect(buf).toBe(lixo);
  });
});
