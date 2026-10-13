import 'server-only';
import { timingSafeEqual } from 'node:crypto';
import { NextResponse, type NextRequest } from 'next/server';
import { and, desc, eq, ilike, inArray, or, sql, type SQL } from 'drizzle-orm';
import { db } from '@/lib/db/drizzle';
import {
  appUsers,
  authors,
  bookCollections,
  bookFiles,
  bookToAuthor,
  books,
} from '@/lib/db/schema';
import { withUser } from '@/lib/db/with-user';
import { checkRateLimit } from '@/lib/rate-limit';

export const OPDS_NAVIGATION_TYPE =
  'application/atom+xml;profile=opds-catalog;kind=navigation;charset=utf-8';
export const OPDS_ACQUISITION_TYPE =
  'application/atom+xml;profile=opds-catalog;kind=acquisition;charset=utf-8';

export const OPDS_PAGE_SIZE = 50;

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function stripHtml(value: string): string {
  return value
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function mimeFor(formato: string): string {
  return formato.toLowerCase() === 'pdf'
    ? 'application/pdf'
    : 'application/epub+zip';
}

/** Padrão ILIKE escapando curingas do usuário, para busca literal. */
function likePattern(termo: string): string {
  return `%${termo.replace(/[\\%_]/g, '\\$&')}%`;
}

function xmlResponse(body: string, contentType: string): NextResponse {
  return new NextResponse(body, {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'no-store',
    },
  });
}

// ─── Autenticação (HTTP Basic) ────────────────────────────────

export type OpdsAuth =
  | { ok: true; userId: string; email: string }
  | { ok: false; response: NextResponse };

function unauthorized(): NextResponse {
  return new NextResponse('Autenticação requerida', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Book Inventory", charset="UTF-8"',
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}

function senhasIguais(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

/**
 * Autentica um cliente OPDS por HTTP Basic. Usuário = e-mail do dono (a
 * mesma conta do app); senha = `OPDS_PASSWORD`. Sem essa variável, o serviço
 * responde 503 em vez de aceitar credencial vazia.
 */
export async function authenticateOpds(req: NextRequest): Promise<OpdsAuth> {
  const senha = process.env.OPDS_PASSWORD;
  const owner = process.env.OWNER_EMAIL?.trim().toLowerCase();
  if (!senha || !owner) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: 'OPDS não configurado (defina OWNER_EMAIL e OPDS_PASSWORD)' },
        { status: 503 }
      ),
    };
  }

  const address = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const rate = checkRateLimit(`opds:${address}`, 120, 60_000);
  if (!rate.allowed) return { ok: false, response: new NextResponse('Muitas tentativas. Tente novamente em instantes.', {
    status: 429, headers: { 'Retry-After': String(rate.retryAfter), 'Cache-Control': 'no-store' },
  }) };

  const header = req.headers.get('authorization') ?? '';
  const [esquema, codificado] = header.split(' ');
  if (!codificado || esquema?.toLowerCase() !== 'basic') {
    return { ok: false, response: unauthorized() };
  }

  const decodificado = Buffer.from(codificado, 'base64').toString('utf8');
  const separador = decodificado.indexOf(':');
  if (separador < 0) return { ok: false, response: unauthorized() };

  const usuario = decodificado.slice(0, separador).trim().toLowerCase();
  const enviada = decodificado.slice(separador + 1);
  if (usuario !== owner || !senhasIguais(enviada, senha)) {
    return { ok: false, response: unauthorized() };
  }

  const [conta] = await db
    .select({ id: appUsers.id, email: appUsers.email })
    .from(appUsers)
    .where(eq(appUsers.email, usuario))
    .limit(1);
  if (!conta) return { ok: false, response: unauthorized() };

  return { ok: true, userId: conta.id, email: conta.email };
}

// ─── Consultas ────────────────────────────────────────────────

export interface OpdsBook {
  id: number;
  title: string;
  imageUrl: string | null;
  description: string | null;
  language: string | null;
  updatedAt: string;
  authors: string[];
  format: string | null;
  hasFile: boolean;
}

export async function fetchOpdsBooks(
  userId: string,
  opts: {
    limit: number;
    offset: number;
    collectionId?: number;
    owned?: boolean;
    readStatus?: string;
    nextUp?: boolean;
    favorite?: boolean;
    search?: string;
  }
): Promise<OpdsBook[]> {
  const { limit, offset, collectionId, owned, readStatus, nextUp, favorite, search } =
    opts;
  return withUser(userId, async (tx) => {
    const filtros: SQL[] = [eq(books.userId, userId)];
    if (owned) filtros.push(eq(books.owned, true));
    if (readStatus) filtros.push(eq(books.read_status, readStatus));
    if (nextUp) filtros.push(eq(books.next_up, true));
    if (favorite) filtros.push(eq(books.favorite, true));
    if (collectionId !== undefined) {
      filtros.push(
        inArray(
          books.id,
          tx
            .select({ id: bookCollections.bookId })
            .from(bookCollections)
            .where(eq(bookCollections.collectionId, collectionId))
        )
      );
    }
    const termo = search?.trim();
    if (termo) {
      const pattern = likePattern(termo);
      const porAutor = tx
        .select({ id: bookToAuthor.bookId })
        .from(bookToAuthor)
        .innerJoin(authors, eq(bookToAuthor.authorId, authors.id))
        .where(ilike(authors.name, pattern));
      const condicao = or(
        ilike(books.title, pattern),
        inArray(books.id, porAutor)
      );
      if (condicao) filtros.push(condicao);
    }

    const linhas = await tx
      .select({
        id: books.id,
        title: books.title,
        imageUrl: books.image_url,
        description: books.description,
        language: books.language_code,
        updatedAt: books.createdAt,
        format: bookFiles.format,
        hasFile: bookFiles.hasFile,
        authors: sql<
          string[]
        >`array_remove(array_agg(distinct ${authors.name}), NULL)`,
      })
      .from(books)
      .leftJoin(bookToAuthor, eq(books.id, bookToAuthor.bookId))
      .leftJoin(authors, eq(bookToAuthor.authorId, authors.id))
      .leftJoin(bookFiles, and(eq(bookFiles.bookId, books.id), eq(bookFiles.userId, userId)))
      .where(filtros.length > 0 ? and(...filtros) : undefined)
      .groupBy(books.id, bookFiles.format, bookFiles.hasFile)
      .orderBy(desc(books.createdAt), desc(books.id))
      .limit(limit)
      .offset(offset);

    return linhas.map((l) => ({
      ...l,
      updatedAt: l.updatedAt.toISOString(),
      authors: l.authors ?? [],
      hasFile: l.hasFile ?? false,
    }));
  });
}

export async function fetchBookFile(
  userId: string,
  bookId: number
): Promise<{ storagePath: string; mime: string } | null> {
  return withUser(userId, async (tx) => {
    const [linha] = await tx
      .select({ storagePath: bookFiles.storagePath, mime: bookFiles.mime })
      .from(bookFiles)
      .innerJoin(books, eq(bookFiles.bookId, books.id))
      .where(and(eq(bookFiles.bookId, bookId), eq(bookFiles.hasFile, true),
        eq(bookFiles.userId, userId), eq(books.userId, userId)))
      .limit(1);
    return linha ?? null;
  });
}

// ─── Montagem dos feeds Atom ──────────────────────────────────

export interface OpdsLink {
  rel: string;
  href: string;
  type?: string;
}

export interface OpdsEntry {
  id: string;
  title: string;
  updated: string;
  summary?: string;
  authors?: string[];
  language?: string | null;
  links: OpdsLink[];
}

function renderLink(link: OpdsLink): string {
  const type = link.type ? ` type="${escapeXml(link.type)}"` : '';
  return `<link rel="${escapeXml(link.rel)}" href="${escapeXml(link.href)}"${type}/>`;
}

function renderEntry(entry: OpdsEntry): string {
  const autores = (entry.authors ?? [])
    .map((nome) => `<author><name>${escapeXml(nome)}</name></author>`)
    .join('');
  const resumo = entry.summary
    ? `<summary type="text">${escapeXml(entry.summary)}</summary>`
    : '';
  const idioma = entry.language
    ? `<dc:language>${escapeXml(entry.language)}</dc:language>`
    : '';
  const links = entry.links.map(renderLink).join('');

  return `<entry>
    <title>${escapeXml(entry.title)}</title>
    <id>${escapeXml(entry.id)}</id>
    <updated>${escapeXml(entry.updated)}</updated>
    ${autores}
    ${idioma}
    ${resumo}
    ${links}
  </entry>`;
}

export function buildFeed(opts: {
  id: string;
  title: string;
  self: string;
  start: string;
  next?: string;
  prev?: string;
  search?: string;
  entries: OpdsEntry[];
}): string {
  const agora = new Date().toISOString();
  const links = [
    `<link rel="self" href="${escapeXml(opts.self)}" type="application/atom+xml;profile=opds-catalog"/>`,
    `<link rel="start" href="${escapeXml(opts.start)}" type="${OPDS_NAVIGATION_TYPE}"/>`,
  ];
  if (opts.search) {
    links.push(
      `<link rel="search" href="${escapeXml(opts.search)}" type="application/opensearchdescription+xml"/>`
    );
  }
  if (opts.next) {
    links.push(
      `<link rel="next" href="${escapeXml(opts.next)}" type="application/atom+xml;profile=opds-catalog"/>`
    );
  }
  if (opts.prev) {
    links.push(
      `<link rel="prev" href="${escapeXml(opts.prev)}" type="application/atom+xml;profile=opds-catalog"/>`
    );
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/terms/" xmlns:opds="http://opds-spec.org/2010/catalog">
  <id>${escapeXml(opts.id)}</id>
  <title>${escapeXml(opts.title)}</title>
  <updated>${agora}</updated>
  <author><name>Book Inventory</name></author>
  ${links.join('\n  ')}
  ${opts.entries.map(renderEntry).join('\n  ')}
</feed>`;
}

export function navigationEntry(
  title: string,
  href: string,
  summary?: string,
  type: string = OPDS_ACQUISITION_TYPE
): OpdsEntry {
  return {
    id: href,
    title,
    updated: new Date().toISOString(),
    summary,
    links: [{ rel: 'subsection', href, type }],
  };
}

export function acquisitionEntry(
  book: OpdsBook,
  baseUrl: string
): OpdsEntry {
  const links: OpdsLink[] = [
    { rel: 'alternate', href: `${baseUrl}/${book.id}`, type: 'text/html' },
  ];
  if (book.imageUrl) {
    links.unshift(
      {
        rel: 'http://opds-spec.org/image',
        href: book.imageUrl,
        type: 'image/jpeg',
      },
      {
        rel: 'http://opds-spec.org/image/thumbnail',
        href: book.imageUrl,
        type: 'image/jpeg',
      }
    );
  }
  if (book.hasFile && book.format) {
    links.push({
      rel: 'http://opds-spec.org/acquisition',
      href: `${baseUrl}/opds/download/${book.id}`,
      type: mimeFor(book.format),
    });
  }

  return {
    id: `urn:book-inventory:book:${book.id}`,
    title: book.title,
    updated: book.updatedAt,
    summary: book.description ? stripHtml(book.description).slice(0, 2000) : undefined,
    authors: book.authors,
    language: book.language,
    links,
  };
}

export function opdsXml(body: string, type: string): NextResponse {
  return xmlResponse(body, type);
}

// ─── Paginação ────────────────────────────────────────────────

export function parsePaging(searchParams: URLSearchParams): {
  limit: number;
  offset: number;
  next?: { start: number; count: number };
  prev?: { start: number; count: number };
} {
  const rawCount = Number(searchParams.get('count'));
  const count = Number.isFinite(rawCount) && rawCount > 0
    ? Math.min(Math.max(Math.floor(rawCount), 1), 200) : OPDS_PAGE_SIZE;
  const startRaw = searchParams.get('start');
  const pageRaw = searchParams.get('page');
  const startNum = startRaw !== null ? Number(startRaw) : Number.NaN;
  const pageNum = pageRaw !== null ? Number(pageRaw) : Number.NaN;
  const offset =
    Number.isFinite(startNum) && startNum >= 0
      ? Math.floor(startNum)
      : Number.isFinite(pageNum) && pageNum > 1
        ? (Math.floor(pageNum) - 1) * count
        : 0;

  return {
    limit: count,
    offset,
    next: { start: offset + count, count },
    prev: offset > 0 ? { start: Math.max(0, offset - count), count } : undefined,
  };
}

export function pagedUrl(base: string, path: string, paging: { start: number; count: number }, params?: URLSearchParams): string {
  const url = new URL(path, base);
  url.search = params?.toString() ?? '';
  url.searchParams.delete('page');
  url.searchParams.set('start', String(paging.start));
  url.searchParams.set('count', String(paging.count));
  return url.toString();
}

export function buildOpenSearchDescription(baseUrl: string): string {
  const template = `${baseUrl}/opds/search?q={searchTerms}`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<OpenSearchDescription xmlns="http://a9.com/-/spec/opensearch/1.1/">
  <ShortName>Book Inventory</ShortName>
  <Description>Buscar no acervo por título ou autor</Description>
  <InputEncoding>UTF-8</InputEncoding>
  <Url type="${OPDS_ACQUISITION_TYPE}" template="${escapeXml(template)}"/>
</OpenSearchDescription>`;
}

/** Monta um feed de aquisição paginado e já o devolve como resposta. */
export async function acquisitionFeed(opts: {
  req: NextRequest;
  base: string;
  userId: string;
  path: string;
  title: string;
  filters: {
    collectionId?: number;
    owned?: boolean;
    readStatus?: string;
    nextUp?: boolean;
    favorite?: boolean;
    search?: string;
  };
}): Promise<NextResponse> {
  const url = new URL(opts.req.url);
  const paging = parsePaging(url.searchParams);

  const livros = await fetchOpdsBooks(opts.userId, {
    limit: paging.limit + 1,
    offset: paging.offset,
    ...opts.filters,
  });
  const temProxima = livros.length > paging.limit;

  const body = buildFeed({
    id: `${opts.base}${opts.path}`,
    title: opts.title,
    self: `${opts.base}${opts.path}${url.search}`,
    start: `${opts.base}/opds`,
    search: `${opts.base}/opds/search.xml`,
    next:
      temProxima && paging.next
        ? pagedUrl(opts.base, opts.path, paging.next, url.searchParams)
        : undefined,
    prev: paging.prev ? pagedUrl(opts.base, opts.path, paging.prev, url.searchParams) : undefined,
    entries: livros.slice(0, paging.limit).map((livro) => acquisitionEntry(livro, opts.base)),
  });

  return opdsXml(body, OPDS_ACQUISITION_TYPE);
}
