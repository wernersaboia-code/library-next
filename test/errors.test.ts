import { describe, it, expect, vi } from 'vitest';

// lib/errors.ts importa AuthError de lib/auth-user.ts, que por sua vez
// importa o cliente drizzle (lib/db/drizzle.ts) — módulo que exige
// POSTGRES_URL definida. Mocka-se aqui só para permitir a importação;
// nenhum destes testes toca o banco.
vi.mock('@/lib/db/drizzle', () => ({ db: {}, client: {} }));

const { errorResponse } = await import('@/lib/errors');
const { AuthError } = await import('@/lib/auth-user');

describe('errorResponse', () => {
  it('nunca vaza a mensagem original no corpo', async () => {
    const r = errorResponse(
      new Error('conexão falhou em 10.0.0.5:5432'), 'Erro ao importar'
    );
    const body = await r.json();
    expect(JSON.stringify(body)).not.toContain('10.0.0.5');
    expect(body.error).toBe('Erro ao importar');
  });

  it('inclui um requestId rastreável', async () => {
    const body = await errorResponse(new Error('x'), 'Erro').json();
    expect(body.requestId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('mapeia AuthError para 401', () => {
    expect(errorResponse(new AuthError(), 'Erro').status).toBe(401);
  });

  it('usa 500 para erro desconhecido', () => {
    expect(errorResponse(new Error('x'), 'Erro').status).toBe(500);
  });

  it('loga o erro completo no servidor', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    errorResponse(new Error('detalhe secreto'), 'Erro');
    expect(spy.mock.calls[0].join(' ')).toContain('detalhe secreto');
    spy.mockRestore();
  });
});
