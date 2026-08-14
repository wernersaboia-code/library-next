import { describe, it, expect } from 'vitest';
import { applyFilter } from '@/lib/url-state';

describe('applyFilter', () => {
  it('define o valor do filtro', () => {
    expect(applyFilter({}, 'status', 'lido')).toEqual({ status: 'lido' });
  });

  it('remove o filtro quando o valor é undefined', () => {
    const r = applyFilter({ status: 'lido' }, 'status', undefined);
    expect(r.status).toBeUndefined();
  });

  it('volta para a primeira página ao mudar um filtro', () => {
    // O bug: filtrar estando na página 5 mantinha offset 112, e o catálogo
    // vinha vazio mesmo havendo resultados (3 livros lidos, por exemplo).
    const r = applyFilter({ page: '5' }, 'status', 'lido');
    expect(r.page).toBeUndefined();
    expect(r.status).toBe('lido');
  });

  it('volta para a primeira página também ao limpar um filtro', () => {
    const r = applyFilter({ page: '5', status: 'lido' }, 'status', undefined);
    expect(r.page).toBeUndefined();
  });

  it('preserva os demais filtros', () => {
    const r = applyFilter({ genre: 'Terror', posse: 'todos', page: '3' }, 'status', 'lido');
    expect(r.genre).toBe('Terror');
    expect(r.posse).toBe('todos');
  });

  it('não modifica o objeto original', () => {
    const original = { page: '5' };
    applyFilter(original, 'status', 'lido');
    expect(original).toEqual({ page: '5' });
  });
});
