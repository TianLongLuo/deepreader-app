import { expect, it } from 'vitest';
import { pdfParser } from '@/server/parsing/pdf.parser';
import { createCanvas, loadImage } from '@napi-rs/canvas';

// Real PDF fixtures exercise pdf.js decoding, not just mocked parser results.
function book(streams: string[], dimensions = '612 792', rotation = 0) {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${streams.map((_, i) => `${4 + i * 2} 0 R`).join(' ')}] /Count ${streams.length} >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
  ];
  streams.forEach((stream, i) => objects.push(
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${dimensions}] /Rotate ${rotation} /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`,
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ));
  let pdf = '%PDF-1.4\n';
  const offsets: number[] = [];
  objects.forEach((object, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map(n => `${String(n).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(pdf, 'latin1');
}
const line = (text: string, y = 700) => `BT /F1 12 Tf 50 ${y} Td (${text}) Tj ET`;

it('preserves short headings and dialogue from a real PDF', async () => {
  const result = await pdfParser.parse(book([line('Go!')]), 'Short');
  expect(result.sections[0].paragraphs.map(p => p.rawText)).toEqual(['Go!']);
}, 20_000);

it('keeps physical page numbers across empty pages and literal page markers', async () => {
  const result = await pdfParser.parse(book([
    '', line('---PAGE_BREAK---'), '', line('Last page.'), '',
  ]), 'Five pages');
  expect(result.pageCount).toBe(5);
  expect(result.sections[0].paragraphs.map(p => [p.rawText, p.pageNumber])).toEqual([
    ['---PAGE_BREAK---', 2], ['Last page.', 4],
  ]);
});

it('reports a visible page without selectable text without inventing text', async () => {
  const result = await pdfParser.parse(book(['0 0 200 200 re f']), 'Artwork');
  expect(result.pageCount).toBe(1);
  expect(result.sections[0].paragraphs).toEqual([]);
});

it('preserves Spanish accented letters and real compound hyphens', async () => {
  const result = await pdfParser.parse(book([line('El ni\\361o tiene un coraz\\363n bien-known.')]), 'Spanish');
  expect(result.sections[0].paragraphs[0].normalizedText).toBe('El niño tiene un corazón bien-known.');
});

it('keeps AI sentence offsets consistent across wrapped lines', async () => {
  const result = await pdfParser.parse(book([`${line('A long sentence continues')}\n${line('on the next line.', 686)}`]), 'Wrapped');
  const paragraphs = result.sections[0].paragraphs;
  expect(paragraphs.map(p => p.normalizedText).join(' ')).toBe('A long sentence continues on the next line.');
  for (const paragraph of paragraphs) {
    for (const sentence of paragraph.sentences) {
      expect(paragraph.normalizedText.slice(sentence.startOffset, sentence.endOffset)).toBe(sentence.normalizedText);
    }
  }
});

it('renders the requested textless page as a real PNG with its artwork', async () => {
  const result = await pdfParser.renderPage(book([line('First page'), '1 0 0 rg 0 0 612 792 re f']), 2);
  expect(result.pageCount).toBe(2);
  expect(Array.from(result.data.slice(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  const image = await loadImage(Buffer.from(result.data));
  const canvas = createCanvas(image.width, image.height);
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0);
  expect(Array.from(context.getImageData(100, 100, 1, 1).data)).toEqual([255, 0, 0, 255]);
});

it('respects page rotation and bounds unusually tall page canvas allocation', async () => {
  const rotated = await pdfParser.renderPage(book([line('Rotated')], '612 792', 90), 1);
  expect(rotated.width).toBeGreaterThan(rotated.height);
  const tall = await pdfParser.renderPage(book(['0 0 200 200 re f'], '612 10000'), 1);
  expect(tall.height).toBeLessThanOrEqual(2400);
  expect(tall.width * tall.height).toBeLessThanOrEqual(4_000_000);
});

it('rejects an out-of-range physical page', async () => {
  await expect(pdfParser.renderPage(book([line('Only page')]), 2)).rejects.toThrow(RangeError);
});
