import { describe, it, expect } from 'vitest';
import postgres from 'postgres';
import { requireTestDatabaseUrl } from '../setup';

describe('conexão', () => {
  it('suporta transação com set_local', async () => {
    const sql = postgres(requireTestDatabaseUrl(), { max: 1 });
    const got = await sql.begin(async (tx) => {
      await tx`select set_config('app.user_id', 'abc', true)`;
      const r = await tx`select current_setting('app.user_id', true) as v`;
      return r[0].v;
    });
    await sql.end();
    expect(got).toBe('abc');
  });
});
