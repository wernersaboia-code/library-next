-- Impressão digital da capa que está no Storage. Sem ela, qualquer livro
-- marcado como modificado no Calibre faz o sync reenviar a imagem — e uma
-- edição em lote de metadados (que não toca em capa alguma) custava
-- centenas de uploads idênticos.
ALTER TABLE "books" ADD COLUMN "cover_hash" text;
