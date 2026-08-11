// Shim para o pacote `server-only` nos testes do Vitest.
// Em produção, o Next.js substitui `server-only` por um módulo que lança
// erro se importado de um Client Component. O Vitest não tem esse bundler
// especial, então aliasamos para um módulo vazio (sem efeito) só nos testes.
export {};
