import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { PgDialect } from 'drizzle-orm/pg-core';

const state = vi.hoisted(() => ({ rows: [] as unknown[], accounts: [] as unknown[], where: vi.fn(), rate: vi.fn() }));
vi.mock('@/lib/db/drizzle', () => ({ db: { select: () => ({ from: () => ({ where: () => ({ limit: async () => state.accounts }) }) }) } }));
vi.mock('@/lib/rate-limit', () => ({ checkRateLimit: state.rate }));
vi.mock('@/lib/db/with-user', () => ({ withUser: async (_id: string, fn: (tx: unknown) => unknown) => {
  const tx: Record<string, unknown> = {};
  for (const method of ['select', 'from', 'leftJoin', 'innerJoin', 'groupBy', 'orderBy', 'limit', 'offset']) tx[method] = () => tx;
  tx.where = (condition: unknown) => { state.where(condition); return tx; };
  tx.then = (resolve: (rows: unknown[]) => unknown) => Promise.resolve(state.rows).then(resolve);
  return fn(tx);
} }));

import { authenticateOpds, acquisitionFeed, fetchBookFile, parsePaging, pagedUrl, buildFeed, navigationEntry, OPDS_NAVIGATION_TYPE } from '@/lib/opds';

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('OWNER_EMAIL', 'owner@example.test');
  vi.stubEnv('OPDS_PASSWORD', 'test-password');
  state.rate.mockReturnValue({ allowed: true, retryAfter: 0 });
  state.accounts = [{ id: 'owner', email: 'owner@example.test' }];
  state.rows = [];
});
afterEach(() => vi.unstubAllEnvs());

function req(email = 'owner@example.test', password = 'test-password') {
  return new NextRequest('https://library.test/opds', { headers: { authorization: `Basic ${Buffer.from(`${email}:${password}`).toString('base64')}` } });
}

describe('OPDS', () => {
  it('autentica somente o dono e falha fechado sem configuração', async () => {
    expect((await authenticateOpds(req())).ok).toBe(true);
    expect((await authenticateOpds(req('another@example.test'))).ok).toBe(false);
    expect((await authenticateOpds(req(undefined, 'wrong'))).ok).toBe(false);
    vi.stubEnv('OWNER_EMAIL', '');
    const result = await authenticateOpds(req());
    expect(!result.ok && result.response.status).toBe(503);
  });
  it('limita rajadas e pede credenciais quando ausentes', async () => {
    const anonymous = await authenticateOpds(new NextRequest('https://library.test/opds'));
    expect(!anonymous.ok && anonymous.response.headers.get('WWW-Authenticate')).toContain('Basic');
    state.rate.mockReturnValue({ allowed: false, retryAfter: 30 });
    const result = await authenticateOpds(req());
    expect(!result.ok && result.response.status).toBe(429);
    expect(!result.ok && result.response.headers.get('Retry-After')).toBe('30');
  });
  it('conserva busca na próxima e na anterior, com parâmetros inteiros', () => {
    const params = new URLSearchParams('q=Duna & Herbert&page=2&count=1.5');
    expect(parsePaging(params).limit).toBe(1);
    for (const start of [0, 50]) {
      const url = new URL(pagedUrl('https://library.test', '/opds/search', { start, count: 50 }, params));
      expect(url.searchParams.get('q')).toBe('Duna ');
      expect(url.searchParams.has('page')).toBe(false);
      expect(url.searchParams.get('start')).toBe(String(start));
    }
    expect(parsePaging(new URLSearchParams('count=Infinity')).limit).toBe(50);
  });
  it('pagina sem perder q e sem anunciar próxima vazia', async () => {
    const book = { id: 1, title: 'Duna', imageUrl: null, description: null, language: 'por', updatedAt: new Date(), authors: [], format: null, hasFile: false };
    const opts = { req: new NextRequest('https://library.test/opds/search?q=Duna&count=1'), base: 'https://library.test', userId: 'owner', path: '/opds/search', title: 'Busca', filters: { search: 'Duna' } };
    state.rows = [book, { ...book, id: 2 }];
    const text = await (await acquisitionFeed(opts)).text();
    const next = text.match(/rel="next" href="([^"]+)"/)?.[1];
    const nextUrl = new URL((next ?? '').replaceAll('&amp;', '&'));
    expect(nextUrl.searchParams.get('q')).toBe('Duna');
    expect(nextUrl.searchParams.get('start')).toBe('1');
    expect(nextUrl.searchParams.get('count')).toBe('1');
    expect(text.match(/<entry>/g)).toHaveLength(1);
    state.rows = [book];
    expect(await (await acquisitionFeed(opts)).text()).not.toContain('rel="next"');
  });
  it('filtra o proprietário também no download, sem depender da RLS', async () => {
    await fetchBookFile('owner-id', 42);
    const query = new PgDialect().sqlToQuery(state.where.mock.calls[0][0]);
    expect(query.params.filter((p) => p === 'owner-id')).toHaveLength(2);
    expect(query.sql).toContain('"books"."user_id"');
    expect(query.sql).toContain('"book_files"."user_id"');
  });
  it('escapa XML e anuncia o tipo correto da navegação de bibliotecas', () => {
    const entry = navigationEntry('A&B', 'https://library.test/opds/bibliotecas', undefined, OPDS_NAVIGATION_TYPE);
    const xml = buildFeed({ id: 'id', title: 'A < B', self: '/opds', start: '/opds', entries: [entry] });
    expect(xml).toContain('A&amp;B');
    expect(xml).toContain('A &lt; B');
    expect(entry.links[0].type).toBe(OPDS_NAVIGATION_TYPE);
  });
});
