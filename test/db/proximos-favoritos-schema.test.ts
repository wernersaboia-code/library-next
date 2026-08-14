import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDb } from '../helpers/db';

let ctx: Awaited<ReturnType<typeof createTestDb>>;
let userId: string;

beforeAll(async () => {
  ctx = await createTestDb();
  const [u] = await ctx.sql`
    insert into app_users (email) values ('proximos@teste.com') returning id`;
  userId = u.id;
});
afterAll(() => ctx.cleanup());

describe('nota com meia estrela', () => {
  it('aceita 3.5', async () => {
    const [b] = await ctx.sql`
      insert into books (user_id, title, title_source, my_rating)
      values (${userId}, 'Meia', 'Meia', 3.5) returning my_rating`;
    expect(Number(b.my_rating)).toBe(3.5);
  });

  it('aceita 5 e aceita nulo', async () => {
    const [cheia] = await ctx.sql`
      insert into books (user_id, title, title_source, my_rating)
      values (${userId}, 'Cheia', 'Cheia', 5) returning my_rating`;
    expect(Number(cheia.my_rating)).toBe(5);
    const [sem] = await ctx.sql`
      insert into books (user_id, title, title_source)
      values (${userId}, 'Sem', 'Sem') returning my_rating`;
    expect(sem.my_rating).toBeNull();
  });

  it('recusa um quarto de estrela', async () => {
    await expect(ctx.sql`
      insert into books (user_id, title, title_source, my_rating)
      values (${userId}, 'Quarto', 'Quarto', 3.25)`).rejects.toThrow(/check/i);
  });

  it('recusa nota acima de 5 e abaixo de meia', async () => {
    await expect(ctx.sql`
      insert into books (user_id, title, title_source, my_rating)
      values (${userId}, 'Alta', 'Alta', 5.5)`).rejects.toThrow(/check/i);
    await expect(ctx.sql`
      insert into books (user_id, title, title_source, my_rating)
      values (${userId}, 'Zero', 'Zero', 0)`).rejects.toThrow(/check/i);
  });
});

describe('marcações de próximo e favorito', () => {
  it('nascem falsas', async () => {
    const [b] = await ctx.sql`
      insert into books (user_id, title, title_source)
      values (${userId}, 'Padrão', 'Padrão') returning next_up, favorite`;
    expect(b.next_up).toBe(false);
    expect(b.favorite).toBe(false);
  });

  it('guardam verdadeiro', async () => {
    const [b] = await ctx.sql`
      insert into books (user_id, title, title_source, next_up, favorite)
      values (${userId}, 'Marcado', 'Marcado', true, true)
      returning next_up, favorite`;
    expect(b.next_up).toBe(true);
    expect(b.favorite).toBe(true);
  });
});
