-- Título em língua original (ex.: "Dune" para "Duna"). Campo de catálogo —
-- hoje alimentado no cadastro manual; o sync do Calibre pode preenchê-lo no
-- futuro, quando houver coluna custom. Nulo quando não informado.
ALTER TABLE "books" ADD COLUMN "original_title" text;
