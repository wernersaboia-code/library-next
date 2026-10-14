'use client';

import { useState } from 'react';
import { Button } from './ui/button';

export function ExportReading() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function download(format: 'csv' | 'md') {
    setBusy(true); setError(null);
    try {
      const response = await fetch(`/api/reading/export?format=${format}`);
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error ?? 'Não foi possível exportar.');
      }
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement('a');
      anchor.href = url; anchor.download = `meus-dados-de-leitura.${format}`;
      document.body.append(anchor); anchor.click(); anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) { setError(err instanceof Error ? err.message : 'Falha de rede ao exportar.'); }
    finally { setBusy(false); }
  }
  return <section className="rounded-xl bg-card p-6 shadow-sm ring-1 ring-border">
    <h2 className="mb-2 text-lg font-semibold">Seus dados de leitura</h2>
    <p className="mb-4 text-sm text-muted-foreground">Baixe avaliações, datas, progresso, notas, citações e destaques. Use CSV em planilhas ou Markdown para guardar e ler suas anotações.</p>
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" disabled={busy} onClick={() => void download('csv')}>Exportar CSV</Button>
      <Button variant="outline" disabled={busy} onClick={() => void download('md')}>Exportar Markdown</Button>
    </div>
    {busy && <p role="status" className="mt-3 text-sm text-muted-foreground">Preparando arquivo…</p>}
    {error && <p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}
  </section>;
}
