import { describe, expect, it } from 'vitest';
import { checkRateLimit } from '@/lib/rate-limit';

describe('checkRateLimit', () => {
  it('bloqueia novas tentativas depois do limite', () => {
    const key = `teste-${Date.now()}-${Math.random()}`;

    expect(checkRateLimit(key, 2, 60_000).allowed).toBe(true);
    expect(checkRateLimit(key, 2, 60_000).allowed).toBe(true);
    expect(checkRateLimit(key, 2, 60_000)).toMatchObject({ allowed: false });
  });

  it('abre uma nova janela depois do vencimento', () => {
    const key = `teste-${Date.now()}-${Math.random()}`;

    expect(checkRateLimit(key, 1, 0).allowed).toBe(true);
    expect(checkRateLimit(key, 1, 0).allowed).toBe(true);
  });
});
