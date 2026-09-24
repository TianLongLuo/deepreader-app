import { describe, expect, it } from 'vitest';
import { reflowPdfPage, type PdfTextRun } from '../src/server/parsing/pdf-reflow';

function run(str: string, x = 40, y = 740, width = str.length * 5, size = 10): PdfTextRun {
  return { str, transform: [size, 0, 0, size, x, y], width, height: size, dir: 'ltr' };
}

function columns() {
  return [
    run('Left first line', 40, 720, 180), run('Right first line', 300, 720, 180),
    run('left second line', 40, 706, 180), run('right second line', 300, 706, 180),
    run('left final line.', 40, 692, 180), run('right final line.', 300, 692, 180),
  ];
}

describe('PDF text reflow from positioned text runs', () => {
  it('joins consecutive English lines into one paragraph in visual order', () => {
    expect(reflowPdfPage([
      run('over multiple lines.', 40, 712),
      run('A sentence starts here', 40, 740),
      run('and continues naturally', 40, 726),
    ])).toBe('A sentence starts here and continues naturally over multiple lines.');
  });

  it('preserves Spanish punctuation, accents and word spaces across lines', () => {
    expect(reflowPdfPage([
      run('¿Cómo está el niño?', 40, 740),
      run('Está leyendo una historia', 40, 726),
      run('sobre España y el océano.', 40, 712),
    ])).toBe('¿Cómo está el niño? Está leyendo una historia sobre España y el océano.');
  });

  it('uses larger line gaps to separate paragraphs', () => {
    expect(reflowPdfPage([
      run('The first paragraph', 40, 740), run('ends here.', 40, 726),
      run('The next paragraph', 40, 698), run('starts after a gap.', 40, 684),
    ])).toBe('The first paragraph ends here.\n\nThe next paragraph starts after a gap.');
  });

  it('reads all left-column lines before the right column', () => {
    expect(reflowPdfPage(columns())).toBe('Left first line left second line left final line.\n\nRight first line right second line right final line.');
  });

  it('retains a full-width heading before the two columns', () => {
    expect(reflowPdfPage([run('A heading spanning both columns', 40, 758, 440, 18), ...columns()]))
      .toBe('A heading spanning both columns\n\nLeft first line left second line left final line.\n\nRight first line right second line right final line.');
  });

  it('falls back for rotated or RTL content', () => {
    expect(reflowPdfPage([{ ...run('Rotated'), transform: [0, 10, -10, 0, 40, 740] }])).toBeNull();
    expect(reflowPdfPage([{ ...run('مرحبا'), dir: 'rtl' }])).toBeNull();
  });

  it('falls back for a sparse row of table cells', () => {
    expect(reflowPdfPage([run('Product', 40, 740, 50), run('Price', 300, 740, 30)] )).toBeNull();
  });

  it('falls back for a multi-row numeric table instead of treating it as prose columns', () => {
    expect(reflowPdfPage([
      run('Product', 40, 740, 60), run('Price', 160, 740, 50),
      run('Apples', 40, 726, 60), run('10.00', 160, 726, 50),
      run('Oranges', 40, 712, 60), run('20.00', 160, 712, 50),
    ])).toBeNull();
  });

  it('assembles character fragments and preserves an explicitly extracted space', () => {
    // Some PDFs provide zero-advance space glyphs; the textual space must survive
    // even when the next word begins exactly at the previous glyph boundary.
    expect(reflowPdfPage([
      run('H', 40, 740, 5), run('i', 45, 740, 5), run(' ', 50, 740, 0),
      run('t', 50, 740, 5), run('h', 55, 740, 5), run('e', 60, 740, 5),
      run('r', 65, 740, 5), run('e', 70, 740, 5),
    ])).toBe('Hi there');
  });

  it('adds inferred spaces between fragmented words without splitting their letters', () => {
    expect(reflowPdfPage([
      run('H', 40, 740, 5), run('i', 45, 740, 5),
      run('t', 54, 740, 5), run('h', 59, 740, 5), run('e', 64, 740, 5),
      run('r', 69, 740, 5), run('e', 74, 740, 5),
    ])).toBe('Hi there');
  });
});

