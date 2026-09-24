/** Conservative horizontal text reflow. Ambiguous/rotated content keeps its original text. */
export type PdfTextRun = {
  str: string;
  transform: number[];
  width: number;
  height: number;
  dir: string;
};
type Line = { text: string; x: number; right: number; y: number; size: number };

function paragraphs(lines: Line[]): string {
  const result: string[] = [];
  let previous: Line | undefined;
  for (const line of lines) {
    const gap = previous ? line.y - previous.y : 0;
    const newParagraph = previous && (
      gap > Math.max(previous.size, line.size) * 1.65 ||
      Math.abs(line.size - previous.size) > Math.min(line.size, previous.size) * 0.2 ||
      (line.x - previous.x > line.size * 0.8 && /[.!?:;”’»]$/.test(previous.text)) ||
      /^(?:[•●▪]|[-–]\s|\d+[.)]\s)/u.test(line.text)
    );
    if (!previous || newParagraph) result.push(line.text.trim());
    else result[result.length - 1] += ` ${line.text.trim()}`;
    previous = line;
  }
  return result.join('\n\n').replace(/\u00ad\s*(?=\p{L})/gu, '').replace(/\u00ad/g, '');
}

export function reflowPdfPage(items: PdfTextRun[]): string | null {
  const runs = items.filter(item => item.str.length > 0);
  if (!runs.some(item => item.str.trim()) || runs.some(item => item.dir !== 'ltr' ||
    !item.transform.every(Number.isFinite) || Math.abs(item.transform[1]) > 0.1 ||
    Math.abs(item.transform[2]) > 0.1 || item.transform[0] <= 0 || item.transform[3] <= 0)) return null;
  const rows: Line[][] = [];
  for (const run of [...runs].sort((a, b) => b.transform[5] - a.transform[5] || a.transform[4] - b.transform[4])) {
    const size = Math.max(1, run.height || Math.abs(run.transform[3]));
    const line = { text: run.str, x: run.transform[4], right: run.transform[4] + run.width, y: -run.transform[5], size };
    const row = rows[rows.length - 1];
    if (row && Math.abs(row[0].y - line.y) <= Math.min(row[0].size, size) * 0.3) row.push(line);
    else rows.push([line]);
  }
  const lines: Line[] = [];
  for (const row of rows) {
    let current: Line | undefined;
    for (const run of row.sort((a, b) => a.x - b.x)) {
      if (!run.text.trim()) {
        if (current && !/\s$/.test(current.text)) current.text += ' ';
        continue;
      }
      const gap = current ? run.x - current.right : 0;
      if (!current || gap > Math.max(24, run.size * 2)) {
        current = { ...run };
        lines.push(current);
      } else {
        current.text += (gap > run.size * 0.12 && !/\s$/.test(current.text) && !/^\s/.test(run.text) ? ' ' : '') + run.text;
        current.right = Math.max(current.right, run.right);
        current.size = Math.max(current.size, run.size);
      }
    }
  }
  // Require several aligned rows and a real gutter before reading column-first.
  // Full-width headings are handled as separators between column sections.
  const candidates = [...new Set(lines.map(line => line.x))].sort((a, b) => a - b);
  const leftEdge = candidates[0];
  const rightEdge = Math.max(...lines.map(line => line.right));
  for (const edge of candidates) {
    if (edge < leftEdge + (rightEdge - leftEdge) * 0.3 || edge > leftEdge + (rightEdge - leftEdge) * 0.75) continue;
    const left = lines.filter(line => line.right <= edge - line.size * 1.5);
    const right = lines.filter(line => line.x >= edge - 2);
    if (left.length < 3 || right.length < 3) continue;
    if ([left, right].some(column => column.filter(line => !/\p{L}/u.test(line.text)).length >= column.length / 2)) return null;
    const overlap = left.filter(a => right.some(b => Math.abs(a.y - b.y) < Math.max(a.size, b.size)));
    if (overlap.length < 3) continue;
    const spanning = lines.filter(line => !left.includes(line) && !right.includes(line));
    const result: string[] = [];
    let startY = -Infinity;
    for (const divider of [...spanning, { y: Infinity }]) {
      for (const column of [left, right]) {
        const section = column.filter(line => line.y >= startY && line.y < divider.y);
        if (section.length) result.push(paragraphs(section));
      }
      if ('text' in divider) result.push(divider.text);
      startY = divider.y;
    }
    return result.join('\n\n');
  }
  // Multiple distant fragments on one baseline may be a table. Don't guess.
  if (lines.some((line, i) => i > 0 && Math.abs(line.y - lines[i - 1].y) < line.size * 0.3)) return null;
  return paragraphs(lines);
}
