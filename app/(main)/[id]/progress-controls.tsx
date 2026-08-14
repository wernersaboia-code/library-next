'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  paginaDoPercentual, percentualDaPagina, diasParado, DIAS_PARA_PARADO,
} from '@/lib/reading';

interface ProgressInitial {
  readStatus: string;
  progressPercent: number | null;
  progressUpdatedAt: string | null;
  dnfReason: string | null;
}

export function ProgressControls({
  bookId,
  numPages,
  initial,
}: {
  bookId: number;
  numPages: number | null;
  initial: ProgressInitial;
}) {
  const router = useRouter();
  const [percentual, setPercentual] = useState(
    initial.progressPercent === null ? '' : String(initial.progressPercent)
  );
  const [pagina, setPagina] = useState('');
  const [motivo, setMotivo] = useState(initial.dnfReason ?? '');
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // O progresso só faz sentido enquanto o livro está em andamento ou foi
  // largado: para "lido" e "não lido" o número seria ruído. O valor
  // permanece gravado — nenhuma rota o apaga.
  const mostrarProgresso =
    initial.readStatus === 'lendo' || initial.readStatus === 'abandonado';

  const atual = initial.progressPercent;
  const paginaAtual = paginaDoPercentual(atual, numPages);
  const dias = diasParado(initial.progressUpdatedAt);
  const parado =
    initial.readStatus === 'lendo' && dias !== null && dias >= DIAS_PARA_PARADO;

  async function enviar(body: Record<string, unknown>) {
    setErro(null);
    setSalvando(true);
    try {
      const res = await fetch(`/api/books/${bookId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        // Não limpamos os campos: perder o número digitado por causa de rede
        // instável no celular faz o dono digitar de novo — e desistir.
        setErro(data?.error ?? 'Não foi possível salvar.');
        return;
      }
      router.refresh();
    } catch {
      setErro('Falha de rede ao salvar. O valor digitado continua aqui.');
    } finally {
      setSalvando(false);
    }
  }

  async function salvarPercentual() {
    const n = Number(percentual);
    if (!Number.isInteger(n) || n < 0 || n > 100) {
      setErro('O progresso deve estar entre 0 e 100.');
      return;
    }
    await enviar({ progressPercent: n });
  }

  async function salvarPagina() {
    const p = Number(pagina);
    if (!Number.isInteger(p) || p < 0) {
      setErro('Informe uma página válida.');
      return;
    }
    const convertido = percentualDaPagina(p, numPages);
    if (convertido === null) {
      setErro(
        numPages === null
          ? 'Este livro não tem número de páginas registrado. Use o percentual.'
          : `Este livro tem ${numPages} páginas. Se o seu leitor mostra mais `
            + '(fonte ampliada repagina o livro), use o percentual.'
      );
      return;
    }
    setPercentual(String(convertido));
    setPagina('');
    await enviar({ progressPercent: convertido });
  }

  return (
    <div className="mb-6 space-y-3 rounded-md border p-4">
      <h2 className="text-lg font-semibold">Progresso</h2>

      {mostrarProgresso && atual !== null && (
        <div className="space-y-1">
          <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
            <div
              className="h-full rounded-full bg-emerald-600"
              style={{ width: `${atual}%` }}
            />
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {atual}%
            {paginaAtual !== null && ` · página ~${paginaAtual} de ${numPages}`}
            {parado && (
              <span className="ml-2 text-amber-600">Parado há {dias} dias</span>
            )}
          </p>
        </div>
      )}

      {atual === 100 && initial.readStatus !== 'lido' && (
        <div className="flex flex-wrap items-center gap-2 rounded-md bg-emerald-50 p-2 dark:bg-emerald-900/20">
          <span className="text-sm">Chegou ao fim deste livro?</span>
          <Button
            type="button"
            size="sm"
            onClick={() => void enviar({ finishedToday: true })}
            disabled={salvando}
          >
            Terminei hoje
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <Label className="block mb-1" htmlFor="progresso-percentual">
            Percentual
          </Label>
          <div className="flex gap-2">
            <Input
              id="progresso-percentual"
              type="number"
              min={0}
              max={100}
              value={percentual}
              onChange={(e) => setPercentual(e.target.value)}
              placeholder="0 a 100"
            />
            <Button
              type="button"
              onClick={() => void salvarPercentual()}
              disabled={salvando}
            >
              Salvar
            </Button>
          </div>
        </div>

        {numPages !== null && (
          <div>
            <Label className="block mb-1" htmlFor="progresso-pagina">
              Ou a página (de {numPages})
            </Label>
            <div className="flex gap-2">
              <Input
                id="progresso-pagina"
                type="number"
                min={0}
                value={pagina}
                onChange={(e) => setPagina(e.target.value)}
                placeholder="Ex.: 180"
              />
              <Button
                type="button"
                variant="outline"
                onClick={() => void salvarPagina()}
                disabled={salvando}
              >
                Converter
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Só quando o aviso de 100% não está na tela — dois botões iguais na
          mesma tela fazem o dono parar para descobrir se fazem a mesma coisa. */}
      {initial.readStatus !== 'lido' && atual !== 100 && (
        <div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void enviar({ finishedToday: true })}
            disabled={salvando}
          >
            Terminei hoje
          </Button>
        </div>
      )}

      {initial.readStatus === 'abandonado' && (
        <div>
          <Label className="block mb-1" htmlFor="motivo-abandono">
            Por que abandonou?
          </Label>
          <textarea
            id="motivo-abandono"
            className="flex w-full min-h-16 rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Pode ser o motivo para voltar a ele um dia..."
          />
          <Button
            type="button"
            size="sm"
            className="mt-2"
            onClick={() => void enviar({ dnfReason: motivo })}
            disabled={salvando}
          >
            Salvar motivo
          </Button>
        </div>
      )}

      {erro && <p className="text-sm text-red-600">{erro}</p>}
    </div>
  );
}
