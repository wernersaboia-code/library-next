'use client';

import { validarArquivo } from './arquivo-do-livro';

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
export async function hashDoArquivo(arquivo: File): Promise<string | null> {
  try {
    const digest = await crypto.subtle.digest('SHA-256', await arquivo.arrayBuffer());
    return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  } catch {
    return null;
  }
}


/** Reutiliza o envio direto ao Storage e confirma o registro no servidor. */
export async function enviarArquivoDoLivro(
  bookId: number, arquivo: File, tamanhoMaximo: number,
  aoProgredir: (percentual: number) => void, hash?: string | null
): Promise<void> {
  const escolha = validarArquivo(arquivo.name, arquivo.size, tamanhoMaximo);
  if (!escolha.ok) throw new Error(escolha.erro);
  const pedido = await fetch('/api/books/' + bookId + '/file', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nome: arquivo.name, tamanho: arquivo.size }),
  });
  const dados = await pedido.json().catch(() => null);
  if (!pedido.ok || !dados?.signedUrl) throw new Error(dados?.error ?? 'Não foi possível preparar o envio.');
  await enviarComProgresso(dados.signedUrl, arquivo, dados.mime ?? escolha.mime, aoProgredir);
  const registro = await fetch('/api/books/' + bookId + '/file', {
    method: 'PUT', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ formato: dados.formato ?? escolha.formato,
      sha256: hash === undefined ? await hashDoArquivo(arquivo) : hash }),
  });
  const confirmado = await registro.json().catch(() => null);
  if (!registro.ok) throw new Error(confirmado?.error ?? 'O arquivo subiu, mas o livro não foi registrado. Tente novamente.');
}
