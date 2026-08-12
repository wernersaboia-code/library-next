import { zipSync, strToU8 } from 'fflate';
import { writeFileSync } from 'fs';

const container = `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles><rootfile full-path="OEBPS/content.opf"
    media-type="application/oebps-package+xml"/></rootfiles>
</container>`;

const opf = (comCapa) => `<?xml version="1.0"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>O Livro de Teste</dc:title>
    <dc:creator>Maria Andrade</dc:creator>
    <dc:creator>João Peçanha</dc:creator>
    <dc:language>pt-BR</dc:language>
    <dc:publisher>Editora Exemplo</dc:publisher>
    <dc:description>Descrição de teste.</dc:description>
    <dc:identifier>ISBN:9788500000000</dc:identifier>
    ${comCapa ? '<meta name="cover" content="cover-img"/>' : ''}
  </metadata>
  <manifest>
    ${comCapa
      ? '<item id="cover-img" href="cover.jpg" media-type="image/jpeg"/>'
      : ''}
    <item id="c1" href="c1.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
</package>`;

// JPEG mínimo válido (SOI + APP0 + EOI)
const jpeg = new Uint8Array([
  0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00,
  0x01, 0x01, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, 0xff, 0xd9,
]);

const capitulo = strToU8('<html><body><p>Olá</p></body></html>');

// level: 0 => armazenado sem compressão (STORE). O leitor de ZIP em
// lib/ebook.ts só descomprime o método STORE (0); um epub deflatado (o
// padrão do fflate) não seria parseável por ele.
const opts = { level: 0 };

writeFileSync('test/fixtures/valido.epub', zipSync({
  'META-INF/container.xml': strToU8(container),
  'OEBPS/content.opf': strToU8(opf(true)),
  'OEBPS/cover.jpg': jpeg,
  'OEBPS/c1.xhtml': capitulo,
}, opts));

writeFileSync('test/fixtures/sem-capa.epub', zipSync({
  'META-INF/container.xml': strToU8(container),
  'OEBPS/content.opf': strToU8(opf(false)),
  'OEBPS/c1.xhtml': capitulo,
}, opts));

// zip válido, sem container.xml → parseEpubMetadata deve lançar
writeFileSync('test/fixtures/malformado.epub', zipSync({
  'leiame.txt': strToU8('isto não é um epub'),
}, opts));

console.log('fixtures geradas');
