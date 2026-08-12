import { writeFileSync } from 'fs';

// PDF mínimo, escrito à mão, com 3 páginas — usado por test/import/pdf.test.ts
// para validar `pdfPageCount`. Sem dependência de produção: o formato PDF é
// texto (com um xref binário simples), então é gerado diretamente aqui.
//
// Estrutura: Catalog (1) -> Pages (2, Count 3) -> Page (3), Page (4), Page (5).
// O xref é recalculado a partir dos offsets reais de cada objeto para que o
// arquivo seja um PDF válido (não só "parece PDF").

const objects = [];
objects[1] = '<< /Type /Catalog /Pages 2 0 R >>';
objects[2] = '<< /Type /Pages /Kids [3 0 R 4 0 R 5 0 R] /Count 3 >>';
objects[3] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>';
objects[4] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>';
objects[5] = '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>';

const header = '%PDF-1.4\n';
let body = '';
const offsets = [0]; // objeto 0 é sempre livre, offset 0

for (let i = 1; i <= 5; i += 1) {
  offsets[i] = header.length + body.length;
  body += `${i} 0 obj\n${objects[i]}\nendobj\n`;
}

const xrefOffset = header.length + body.length;
let xref = `xref\n0 6\n0000000000 65535 f \n`;
for (let i = 1; i <= 5; i += 1) {
  xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
}

const trailer = `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

const pdf = header + body + xref + trailer;

writeFileSync('test/fixtures/exemplo.pdf', pdf, 'latin1');
console.log('exemplo.pdf gerado');
