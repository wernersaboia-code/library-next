// lib/description.ts
//
// A descrição vem do Calibre em HTML — é o formato nativo do campo de
// comentários dele. 884 dos 971 livros com descrição neste acervo têm tags,
// e a página exibia tudo como texto puro, mostrando "<p><b>" e "&#8211;" na
// tela.
//
// O HTML não é do dono: veio de metadados baixados de Amazon, Goodreads e
// afins. Renderizar sem limpar permitiria script e link `javascript:` na
// sessão dele — por isso a allowlist é restrita e a sanitização roda no
// servidor.
import sanitizeHtml from 'sanitize-html';

const OPCOES: sanitizeHtml.IOptions = {
  allowedTags: [
    'p', 'br', 'em', 'i', 'strong', 'b', 'u',
    'ul', 'ol', 'li', 'blockquote',
    'h3', 'h4', 'h5', 'h6', 'a',
  ],
  allowedAttributes: {
    a: ['href', 'rel', 'target'],
  },
  // Só o que abre no navegador. `javascript:` e `data:` ficam de fora.
  allowedSchemes: ['http', 'https', 'mailto'],
  // O Calibre usa div como bloco; sem virar parágrafo, o texto colapsa.
  transformTags: {
    div: 'p',
    span: sanitizeHtml.simpleTransform('span', {}, false),
    a: sanitizeHtml.simpleTransform('a', {
      rel: 'noopener noreferrer nofollow',
      target: '_blank',
    }),
  },
  // Sem isto, o conteúdo de <script>/<style> sobraria como texto solto.
  nonTextTags: ['style', 'script', 'textarea', 'option', 'noscript'],
};

/** HTML seguro para renderizar, ou string vazia quando não há descrição. */
export function sanitizeDescription(html: string | null | undefined): string {
  if (!html) return '';
  return sanitizeHtml(html, OPCOES);
}
