import { describe, it, expect } from 'vitest';
import { sanitizeDescription } from '@/lib/description';

describe('sanitizeDescription', () => {
  it('preserva parágrafos e ênfases — é o que torna a sinopse legível', () => {
    const html = '<p>Um <b>thriller</b> na veia de <i>O Conto da Aia</i>.</p>';
    const limpo = sanitizeDescription(html);
    expect(limpo).toContain('<p>');
    expect(limpo).toContain('<b>thriller</b>');
    expect(limpo).toContain('<i>O Conto da Aia</i>');
  });

  it('preserva quebras e listas', () => {
    const limpo = sanitizeDescription('<ul><li>um</li><li>dois</li></ul><br>');
    expect(limpo).toContain('<li>um</li>');
    expect(limpo).toContain('<br');
  });

  it('remove script — o HTML vem de fontes externas via Calibre', () => {
    const limpo = sanitizeDescription('<p>ok</p><script>alert(1)</script>');
    expect(limpo).not.toContain('script');
    expect(limpo).toContain('<p>ok</p>');
  });

  it('remove atributos de evento', () => {
    const limpo = sanitizeDescription('<p onclick="roubar()">texto</p>');
    expect(limpo).not.toContain('onclick');
    expect(limpo).toContain('texto');
  });

  it('remove href javascript:', () => {
    const limpo = sanitizeDescription('<a href="javascript:alert(1)">clique</a>');
    expect(limpo).not.toContain('javascript');
    expect(limpo).toContain('clique');
  });

  it('mantém link http e o marca como externo não confiável', () => {
    const limpo = sanitizeDescription('<a href="https://exemplo.com">site</a>');
    expect(limpo).toContain('href="https://exemplo.com"');
    expect(limpo).toContain('rel="noopener noreferrer nofollow"');
  });

  it('remove font e style, que só sujam o visual', () => {
    const limpo = sanitizeDescription(
      '<font color="red">a</font><p style="color:red">b</p>'
    );
    expect(limpo).not.toContain('<font');
    expect(limpo).not.toContain('style=');
  });

  it('converte div em parágrafo', () => {
    // O Calibre usa div para blocos; sem isso o texto vira um bloco só.
    expect(sanitizeDescription('<div>texto</div>')).toContain('<p>texto</p>');
  });

  it('decodifica entidades como o travessão', () => {
    // &#8211; aparecia literalmente na tela.
    expect(sanitizeDescription('<p>Libba Bray &#8211; autora</p>'))
      .toContain('–');
  });

  it('descrição nula devolve string vazia', () => {
    expect(sanitizeDescription(null)).toBe('');
  });

  it('texto puro sem tags continua funcionando', () => {
    expect(sanitizeDescription('Só texto.')).toContain('Só texto.');
  });
});
