import { PageHeader } from '@/components/page-header';
import { TAMANHO_MAXIMO_PADRAO } from '@/lib/arquivo-do-livro';
import { ImportClient } from './import-client';

export default function ImportPage() {
  const maxBytes = Number(process.env.BOOK_FILE_MAX_BYTES ?? TAMANHO_MAXIMO_PADRAO);
  return <>
    <PageHeader titulo="Importar livro" descricao="Escolha um EPUB ou PDF, revise os dados e adicione ao acervo." />
    <ImportClient maxBytes={Number.isFinite(maxBytes) && maxBytes > 0 ? maxBytes : TAMANHO_MAXIMO_PADRAO} />
  </>;
}
