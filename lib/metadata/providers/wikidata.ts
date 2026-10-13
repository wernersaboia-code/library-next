import type { MetadataProvider, MetadataRecord } from '../types';
import { toIsbn13, yearOf } from '../util';

const API = 'https://www.wikidata.org/w/api.php';
const LINGUAS = 'pt|en';

interface Entity {
  labels?: Record<string, { value?: string }>;
  descriptions?: Record<string, { value?: string }>;
  claims?: Record<string, Claim[]>;
}
interface Claim {
  mainsnak?: { datavalue?: { value?: unknown } };
}

function label(entity: Entity | undefined): string | null {
  if (!entity?.labels) return null;
  return entity.labels.pt?.value ?? entity.labels.en?.value ?? null;
}

function description(entity: Entity | undefined): string | null {
  if (!entity?.descriptions) return null;
  return entity.descriptions.pt?.value ?? entity.descriptions.en?.value ?? null;
}

function idsOf(entity: Entity, prop: string): string[] {
  const claims = entity.claims?.[prop] ?? [];
  const ids: string[] = [];
  for (const claim of claims) {
    const value = claim.mainsnak?.datavalue?.value;
    if (value && typeof value === 'object' && 'id' in value) {
      const id = (value as { id?: unknown }).id;
      if (typeof id === 'string') ids.push(id);
    }
  }
  return ids;
}

function stringOf(entity: Entity, prop: string): string | null {
  const claim = entity.claims?.[prop]?.[0];
  const value = claim?.mainsnak?.datavalue?.value;
  return typeof value === 'string' ? value : null;
}

function yearOfClaim(entity: Entity, prop: string): number | null {
  const claim = entity.claims?.[prop]?.[0];
  const value = claim?.mainsnak?.datavalue?.value;
  if (value && typeof value === 'object' && 'time' in value) {
    const time = (value as { time?: unknown }).time;
    if (typeof time === 'string') return yearOf(time);
  }
  return null;
}

function numberClaim(entity: Entity, prop: string): number | null {
  const claim = entity.claims?.[prop]?.[0];
  const value = claim?.mainsnak?.datavalue?.value;
  if (value && typeof value === 'object' && 'amount' in value) {
    const amount = Number((value as { amount?: unknown }).amount);
    return Number.isFinite(amount) && amount > 0 ? Math.round(amount) : null;
  }
  return null;
}

async function wd(params: Record<string, string>, signal?: AbortSignal): Promise<unknown> {
  const url = new URL(API);
  for (const [chave, valor] of Object.entries({ ...params, format: 'json' })) {
    url.searchParams.set(chave, valor);
  }
  const res = await fetch(url, {
    headers: { Accept: 'application/json' },
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10000)]) : AbortSignal.timeout(10000),
  });
  if (!res.ok) throw new Error(`WikiData respondeu ${res.status}`);
  return res.json();
}

async function labelsFor(ids: string[], signal?: AbortSignal): Promise<Map<string, string>> {
  const resultado = new Map<string, string>();
  if (ids.length === 0) return resultado;
  const data = (await wd({
    action: 'wbgetentities',
    ids: ids.join('|'),
    props: 'labels',
    languages: LINGUAS,
  }, signal)) as { entities?: Record<string, Entity> };
  for (const [id, entity] of Object.entries(data.entities ?? {})) {
    const nome = label(entity);
    if (nome) resultado.set(id, nome);
  }
  return resultado;
}

/**
 * WikiData: busca itens e extrai o que a obra tiver (autores, ano, editora,
 * ISBN, páginas). É a fonte mais ruidosa, então só entra quando o item tem
 * título e algum outro dado forte — e carrega a confiança mais baixa.
 */
export const wikiDataProvider: MetadataProvider = {
  source: 'wikidata',
  async search(query, options): Promise<MetadataRecord[]> {
    const busca = (await wd({
      action: 'wbsearchentities',
      search: query,
      language: 'pt',
      uselang: 'pt',
      type: 'item',
      limit: '6',
    }, options?.signal)) as { search?: { id?: string }[] };
    const ids = (busca.search ?? [])
      .map((s) => s.id)
      .filter((id): id is string => typeof id === 'string');
    if (ids.length === 0) return [];

    const dados = (await wd({
      action: 'wbgetentities',
      ids: ids.join('|'),
      props: 'claims|labels|descriptions',
      languages: LINGUAS,
    }, options?.signal)) as { entities?: Record<string, Entity> };

    const entidades = Object.entries(dados.entities ?? {});
    const autorIds = new Set<string>();
    const editoraIds = new Set<string>();
    for (const [, entity] of entidades) {
      for (const id of idsOf(entity, 'P50')) autorIds.add(id);
      for (const id of idsOf(entity, 'P123')) editoraIds.add(id);
    }
    const [rotulosAutores, rotulosEditoras] = await Promise.all([
      labelsFor([...autorIds], options?.signal),
      labelsFor([...editoraIds], options?.signal),
    ]);

    return entidades
      .map(([, entity]): MetadataRecord | null => {
        const titulo = label(entity);
        if (!titulo) return null;

        const autores = idsOf(entity, 'P50')
          .map((id) => rotulosAutores.get(id))
          .filter((nome): nome is string => Boolean(nome));
        const ano = yearOfClaim(entity, 'P577');
        const isbn13 =
          toIsbn13(stringOf(entity, 'P212')) ??
          toIsbn13(stringOf(entity, 'P957'));

        if (autores.length === 0 && !isbn13 && ano === null) return null;

        const editoraId = idsOf(entity, 'P123')[0];
        const editora = editoraId ? rotulosEditoras.get(editoraId) ?? null : null;

        return {
          source: 'wikidata' as const,
          confidence: 0.55,
          title: titulo,
          authors: autores,
          publicationYear: ano,
          numPages: numberClaim(entity, 'P1104'),
          publisher: editora,
          language: null,
          description: description(entity),
          isbn13,
          cover: null,
          ratingsAverage: null,
          ratingsCount: null,
        };
      })
      .filter((r): r is MetadataRecord => r !== null);
  },
};
