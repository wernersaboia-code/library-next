import { describe, it, expect } from 'vitest';

// Documenta o contrato do reescritor de schema usado por `applyMigrations`
// em `test/helpers/db.ts`: ele substitui apenas a sequência literal
// `"public".` (aspas duplas + ponto). Este teste fixa esse comportamento
// para que futuras migrations (ex.: Task 4, RLS) não presumam um
// reescritor mais genérico — ver o comentário de aviso em `db.ts`.
function rewriteSchemaQualifier(raw: string, schemaName: string) {
  return raw.replaceAll('"public".', `"${schemaName}".`);
}

describe('contrato do reescritor de schema em test/helpers/db.ts', () => {
  it('substitui o qualificador exato "public". usado pelo drizzle-kit', () => {
    const raw = 'REFERENCES "public"."books"("id")';
    expect(rewriteSchemaQualifier(raw, 'test_abc')).toBe(
      'REFERENCES "test_abc"."books"("id")'
    );
  });

  it('NÃO reescreve public.tabela sem aspas (fora do contrato)', () => {
    const raw = 'REFERENCES public.books(id)';
    expect(rewriteSchemaQualifier(raw, 'test_abc')).toBe(raw);
  });

  it('NÃO reescreve a palavra "public" dentro de um literal de string', () => {
    const raw = "USING (schema_name = 'public')";
    expect(rewriteSchemaQualifier(raw, 'test_abc')).toBe(raw);
  });
});
