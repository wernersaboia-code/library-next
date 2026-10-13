export const MIME_LIVRO = 'application/x-book-inventory';

export interface PayloadLivro {
  bookId: number;
  title: string;
}

export function definirPayloadLivro(
  dataTransfer: DataTransfer,
  payload: PayloadLivro
): void {
  const json = JSON.stringify(payload);
  dataTransfer.setData(MIME_LIVRO, json);
  dataTransfer.setData('text/plain', json);
  dataTransfer.effectAllowed = 'copy';
}

export function temPayloadLivro(dataTransfer: DataTransfer): boolean {
  return dataTransfer.types.includes(MIME_LIVRO);
}

export function lerPayloadLivro(dataTransfer: DataTransfer): PayloadLivro | null {
  const raw = dataTransfer.getData(MIME_LIVRO) || dataTransfer.getData('text/plain');
  if (!raw) return null;
  try {
    const payload = JSON.parse(raw);
    if (
      typeof payload?.bookId === 'number' &&
      Number.isInteger(payload.bookId) &&
      payload.bookId > 0
    ) {
      return {
        bookId: payload.bookId,
        title: typeof payload.title === 'string' ? payload.title : 'Livro',
      };
    }
  } catch {
    return null;
  }
  return null;
}
