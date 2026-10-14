import { getCurrentUserId } from '@/lib/auth-user';
import { fetchReadingExport } from '@/lib/db/reading-export';
import { readingCsv, readingMarkdown } from '@/lib/reading-export';
import { errorResponse } from '@/lib/errors';

export async function GET(req: Request) {
  try {
    const userId = await getCurrentUserId();
    const format = new URL(req.url).searchParams.get('format');
    if (format !== 'csv' && format !== 'md') return Response.json({ error: 'Escolha CSV ou Markdown.' }, { status: 400 });
    const data = await fetchReadingExport(userId);
    return new Response(format === 'csv' ? readingCsv(data) : readingMarkdown(data), {
      headers: {
        'Content-Type': `${format === 'csv' ? 'text/csv' : 'text/markdown'}; charset=utf-8`,
        'Content-Disposition': `attachment; filename="meus-dados-de-leitura.${format}"`,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (err) { return errorResponse(err, 'Não foi possível exportar os dados de leitura'); }
}
