import { describe, it, expect, beforeEach, afterEach } from 'vitest';

const original = process.env.AUTH_ALLOWED_EMAILS;
afterEach(() => {
  process.env.AUTH_ALLOWED_EMAILS = original;
});

async function load() {
  const m = await import('@/lib/auth-tokens');
  return m.isEmailAllowed;
}

describe('isEmailAllowed', () => {
  beforeEach(() => {
    process.env.AUTH_ALLOWED_EMAILS = 'a@x.com, B@X.com ';
  });

  it('aceita e-mail da lista', async () => {
    expect((await load())('a@x.com')).toBe(true);
  });

  it('é case-insensitive e ignora espaços', async () => {
    expect((await load())('b@x.com')).toBe(true);
  });

  it('recusa quem não está na lista', async () => {
    expect((await load())('c@x.com')).toBe(false);
  });

  it('recusa null e string vazia', async () => {
    const f = await load();
    expect(f(null)).toBe(false);
    expect(f('')).toBe(false);
  });

  it('recusa todos quando a lista está vazia (falha fechado)', async () => {
    process.env.AUTH_ALLOWED_EMAILS = '';
    expect((await load())('a@x.com')).toBe(false);
  });
});
