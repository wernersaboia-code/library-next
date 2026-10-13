import type {
  AggregatedBook,
  MetadataField,
  MetadataRecord,
  MetadataSource,
} from './types';
import { firstNameKey, normalizeText, toIsbn13 } from './util';
import { normalizeLanguage } from '@/lib/languages';

interface Escolha<T> {
  valor: T | null;
  fontes: MetadataSource[];
  alternativas: { value: T; sources: MetadataSource[] }[];
}

function valorNormalizado(value: unknown): string {
  if (Array.isArray(value)) return JSON.stringify(value.map(valorNormalizado).sort());
  return typeof value === 'string' ? normalizeText(value) : JSON.stringify(value);
}

/**
 * Escolhe o valor de um campo entre os registros: vence o de maior confiança
 * que tenha o campo preenchido. A lista de fontes alimenta a UI (de onde veio
 * cada dado).
 */
function escolher<T>(
  records: MetadataRecord[],
  get: (record: MetadataRecord) => T | null
): Escolha<T> {
  const comValor = records.filter((record) => {
    const valor = get(record);
    return (
      valor !== null &&
      valor !== undefined &&
      !(Array.isArray(valor) && valor.length === 0)
    );
  });
  if (comValor.length === 0) return { valor: null, fontes: [], alternativas: [] };

  const melhor = comValor.reduce((a, b) =>
    b.confidence > a.confidence ? b : a
  );
  const alternativas = new Map<string, { value: T; sources: MetadataSource[] }>();
  for (const record of comValor) {
    const value = get(record) as T;
    const key = valorNormalizado(value);
    const alternativa = alternativas.get(key) ?? { value, sources: [] };
    if (!alternativa.sources.includes(record.source)) alternativa.sources.push(record.source);
    alternativas.set(key, alternativa);
  }
  const escolhido = alternativas.get(valorNormalizado(get(melhor)));
  return { valor: get(melhor), fontes: escolhido?.sources ?? [], alternativas: [...alternativas.values()] };
}

/** Chave de agrupamento: ISBN-13 quando houver; senão título + primeiro autor. */
function chaveDe(record: MetadataRecord): string {
  if (record.isbn13) return `isbn:${record.isbn13}`;
  return `ta:${normalizeText(record.title)}|${firstNameKey(record.authors)}`;
}

function confiancaDe(
  records: MetadataRecord[],
  fontesPorCampo: Partial<Record<MetadataField, MetadataSource[]>>,
  conflitos: number
): number {
  const base = Math.max(...records.map((record) => record.confidence));
  const acordos = Object.values(fontesPorCampo).filter(
    (fontes) => (fontes?.length ?? 0) > 1
  ).length;
  if (conflitos > 0) return Math.max(0, base - 0.05 * conflitos);
  return Math.min(0.99, base + Math.min(0.1, 0.03 * acordos));
}

function mesclar(grupo: MetadataRecord[]): AggregatedBook {
  const titulo = escolher(grupo, (r) => r.title);
  const autores = escolher(grupo, (r) => (r.authors.length > 0 ? r.authors : null));
  const ano = escolher(grupo, (r) => r.publicationYear);
  const paginas = escolher(grupo, (r) => r.numPages);
  const editora = escolher(grupo, (r) => r.publisher);
  const idioma = escolher(grupo, (r) => r.language);
  const descricao = escolher(grupo, (r) => r.description);
  const isbn = escolher(grupo, (r) => r.isbn13);

  // Capa: a Open Library é a mais confiável; senão, a primeira disponível.
  const comCapa =
    grupo.find((r) => r.cover?.provider === 'openlibrary') ??
    grupo.find((r) => r.cover !== null) ??
    null;
  const capa = comCapa?.cover ?? null;

  // Avaliações só existem na Open Library.
  const comNota =
    grupo.find((r) => r.ratingsAverage !== null && r.ratingsCount !== null) ??
    grupo.find((r) => r.ratingsAverage !== null) ??
    null;

  const fieldSources: Partial<Record<MetadataField, MetadataSource[]>> = {
    title: titulo.fontes,
    authors: autores.fontes,
    publicationYear: ano.fontes,
    numPages: paginas.fontes,
    publisher: editora.fontes,
    language: idioma.fontes,
    description: descricao.fontes,
    isbn13: isbn.fontes,
    cover: capa ? [capa.provider] : [],
  };
  for (const campo of Object.keys(fieldSources) as MetadataField[]) {
    if ((fieldSources[campo]?.length ?? 0) === 0) delete fieldSources[campo];
  }
  const escolhas = { title: titulo, authors: autores, publicationYear: ano,
    numPages: paginas, publisher: editora, language: idioma, description: descricao, isbn13: isbn };
  const conflicts: AggregatedBook['conflicts'] = {};
  for (const campo of Object.keys(escolhas) as (keyof typeof escolhas)[]) {
    const alternativas = escolhas[campo].alternativas;
    if (alternativas.length > 1) conflicts[campo] = alternativas;
  }

  return {
    title: titulo.valor ?? '',
    authors: autores.valor ?? [],
    publicationYear: ano.valor,
    numPages: paginas.valor,
    publisher: editora.valor,
    language: idioma.valor,
    description: descricao.valor,
    isbn13: isbn.valor,
    cover: capa,
    ratingsAverage: comNota?.ratingsAverage ?? null,
    ratingsCount: comNota?.ratingsCount ?? null,
    sources: [...new Set(grupo.map((r) => r.source))],
    fieldSources,
    conflicts,
    confidence: confiancaDe(grupo, fieldSources, Object.keys(conflicts).length),
  };
}

/** Agrupa registros que representam o mesmo livro e escolhe o melhor de cada campo. */
export function aggregate(records: MetadataRecord[]): AggregatedBook[] {
  const grupos = new Map<string, MetadataRecord[]>();
  const normalizados = records.map((record) => ({ ...record,
    isbn13: toIsbn13(record.isbn13), language: normalizeLanguage(record.language) }));
  // Forma primeiro os grupos de edição. Um registro sem ISBN só pode entrar
  // quando há uma única edição compatível; nunca serve de ponte entre ISBNs.
  for (const record of normalizados.filter((r) => r.isbn13)) {
    const chave = chaveDe(record);
    const grupo = grupos.get(chave) ?? [];
    grupo.push(record);
    grupos.set(chave, grupo);
  }
  const camposEdicao = ['language', 'numPages', 'publicationYear'] as const;
  const compativel = (a: MetadataRecord, b: MetadataRecord) => camposEdicao.every((field) =>
    a[field] === null || b[field] === null || a[field] === b[field]);
  // Registros mais específicos vêm primeiro, para que um registro genérico
  // não una duas edições incompatíveis pela ordem de resposta das fontes.
  const semIsbn = normalizados.filter((r) => !r.isbn13).sort((a, b) =>
    camposEdicao.filter((field) => b[field] !== null).length - camposEdicao.filter((field) => a[field] !== null).length);
  for (const [index, record] of semIsbn.entries()) {
    const compatíveis = [...grupos.entries()].filter(([key, grupo]) => key.startsWith('isbn:') &&
      record.authors.length > 0 && grupo.some((r) =>
        normalizeText(r.title) === normalizeText(record.title) &&
        firstNameKey(r.authors) === firstNameKey(record.authors)) &&
      grupo.every((r) => compativel(r, record)));
    const chaveBase = chaveDe(record);
    const semIdentificador = [...grupos.entries()].filter(([key, grupo]) =>
      key.startsWith(`${chaveBase}:`) && grupo.every((r) => compativel(r, record)));
    const chave = compatíveis.length === 1 ? compatíveis[0][0]
      : record.authors.length ? (semIdentificador.length === 1 ? semIdentificador[0][0] : `${chaveBase}:${index}`) : `unknown:${index}`;
    const grupo = grupos.get(chave) ?? [];
    grupo.push(record);
    grupos.set(chave, grupo);
  }
  return [...grupos.values()]
    .map(mesclar)
    .sort((a, b) => b.confidence - a.confidence);
}
