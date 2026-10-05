'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { BookOpenIcon, CloudUploadIcon, UploadIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useRefreshAgendado } from '@/lib/use-refresh-agendado';
import { limiteEmMegabytes, validarArquivo } from '@/lib/arquivo-do-livro';

interface ReadingActionInitial {
  readyToRead: boolean;
  hasFile: boolean;
  canPrepare: boolean;
}

/** Sobe o arquivo mostrando o progresso — `fetch` não conta o quanto já foi. */
function enviarComProgresso(
  url: string,
  arquivo: File,
  mime: string,
  aoProgredir: (percentual: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url);
    xhr.setRequestHeader('Content-Type', mime);
    // O caminho pode já ter o arquivo de uma tentativa que morreu no meio.
    xhr.setRequestHeader('x-upsert', 'true');
    xhr.upload.onprogress = (evento) => {
      if (evento.lengthComputable) {
        aoProgredir(Math.round((evento.loaded / evento.total) * 100));
      }
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else if (/exceeded|quota|maximum|too large/i.test(xhr.responseText)) {
        reject(new Error('Espaço de armazenamento esgotado.'));
      } else {
        reject(new Error(`Falha ao enviar o arquivo (HTTP ${xhr.status}).`));
      }
    };
    xhr.onerror = () => reject(new Error('Falha de rede ao enviar o arquivo.'));
    xhr.send(arquivo);
  });
}

/**
 * SHA-256 em hexadecimal — o mesmo campo que o comando do computador grava, e o
 * que faz `db:sync-files` pular um arquivo que já está lá. Sem `crypto.subtle`
 * (contexto inseguro) o envio segue, só sem o hash.
 */
async function hashDoArquivo(arquivo: File): Promise<string | null> {
  try {
    const digest = await crypto.subtle.digest('SHA-256', await arquivo.arrayBuffer());
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}

export function ReadingAction({
  bookId,
  initial,
  tamanhoMaximo,
}: {
  bookId: number;
  initial: ReadingActionInitial;
  tamanhoMaximo: number;
}) {
  const agendarRefresh = useRefreshAgendado();
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState<number | null>(null);
  const [enviado, setEnviado] = useState(false);
  const arquivoRef = useRef<HTMLInputElement>(null);

  async function marcar(readyToRead: boolean) {
    setErro(null);
    setSalvando(true);
    try {
      const res = await fetch(`/api/books/${bookId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ readyToRead }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setErro(data?.error ?? 'Não foi possível salvar.');
        return;
      }
      agendarRefresh();
    } catch {
      setErro('Falha de rede ao salvar.');
    } finally {
      setSalvando(false);
    }
  }

  /**
   * Envio do arquivo escolhido no aparelho, em três passos: o servidor confere e
   * assina uma URL, o navegador sobe os bytes direto ao Storage (arquivo grande
   * não passa pelo nosso servidor) e o servidor mede o que chegou e registra o
   * livro como pronto — o mesmo estado que `db:sync-files` deixa pelo PC.
   */
  async function enviar(arquivo: File) {
    setErro(null);
    const escolha = validarArquivo(arquivo.name, arquivo.size, tamanhoMaximo);
    if (!escolha.ok) {
      setErro(escolha.erro);
      return;
    }

    setEnviando(0);
    try {
      const pedido = await fetch(`/api/books/${bookId}/file`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: arquivo.name, tamanho: arquivo.size }),
      });
      const dados = await pedido.json().catch(() => null);
      if (!pedido.ok || !dados?.signedUrl) {
        setErro(dados?.error ?? 'Não foi possível preparar o envio.');
        return;
      }

      await enviarComProgresso(dados.signedUrl, arquivo, dados.mime ?? escolha.mime, setEnviando);

      const registro = await fetch(`/api/books/${bookId}/file`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formato: dados.formato ?? escolha.formato,
          sha256: await hashDoArquivo(arquivo),
        }),
      });
      const confirmado = await registro.json().catch(() => null);
      if (!registro.ok) {
        setErro(confirmado?.error ?? 'O arquivo subiu, mas o livro não foi registrado.');
        return;
      }

      setEnviado(true);
      agendarRefresh();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Falha ao enviar o arquivo.');
    } finally {
      setEnviando(null);
      // Permite escolher o mesmo arquivo de novo depois de um erro.
      if (arquivoRef.current) arquivoRef.current.value = '';
    }
  }

  if (initial.hasFile) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" asChild>
          <Link href={`/${bookId}/read`}>
            <BookOpenIcon className="mr-2 h-4 w-4" aria-hidden /> Ler
          </Link>
        </Button>
        <span className="text-sm text-muted-foreground">Arquivo pronto para leitura</span>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <input
          ref={arquivoRef}
          type="file"
          accept=".epub,.pdf,application/epub+zip,application/pdf"
          className="hidden"
          onChange={(e) => {
            const arquivo = e.target.files?.[0];
            if (arquivo) void enviar(arquivo);
          }}
        />
        <Button
          type="button"
          size="sm"
          disabled={enviando !== null}
          onClick={() => arquivoRef.current?.click()}
        >
          <UploadIcon className="mr-2 h-4 w-4" aria-hidden />
          {enviando === null ? 'Enviar arquivo do celular' : `Enviando… ${enviando}%`}
        </Button>
        <p className="text-sm text-muted-foreground">
          Escolha um EPUB ou PDF do aparelho — ou do Google Drive, pelo app do Drive. Até{' '}
          {limiteEmMegabytes(tamanhoMaximo)} MB.
        </p>
        {enviado && (
          <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">
            Arquivo enviado. Já dá para ler.
          </p>
        )}
        {erro && <p role="alert" className="text-sm text-red-600">{erro}</p>}
      </div>

      {initial.canPrepare && (
        <div className="space-y-2 border-t border-border pt-3">
          <Button
            type="button"
            variant={initial.readyToRead ? 'outline' : 'default'}
            size="sm"
            disabled={salvando}
            onClick={() => void marcar(!initial.readyToRead)}
          >
            <CloudUploadIcon className="mr-2 h-4 w-4" aria-hidden />
            {initial.readyToRead ? 'Remover da preparação' : 'Preparar para leitura'}
          </Button>
          {initial.readyToRead && (
            <p className="text-sm text-muted-foreground">
              Marquei como pronto. Envie o arquivo pelo celular (botão acima) ou rode{' '}
              <code className="rounded bg-muted px-1">pnpm db:sync-files</code> no computador.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
