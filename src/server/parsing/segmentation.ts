import type { ParsedSentence } from '@/types/documents';

/** Sentence offsets use the whitespace-normalized paragraph's UTF-16 coordinates. */
export function segmentParagraphs(rawText: string): { sentences: ParsedSentence[] } {
  const normalizedText = rawText.replace(/\s+/g, ' ').trim();
  const sentences: ParsedSentence[] = [];
  const append = (text: string, index: number) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const startOffset = index + text.length - text.trimStart().length;
    sentences.push({ rawText: trimmed, normalizedText: trimmed, startOffset, endOffset: startOffset + trimmed.length });
  };

  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });
    for (const segment of segmenter.segment(normalizedText)) append(segment.segment, segment.index);
  } else {
    // Approximate boundaries, but exact offsets: punctuation need not be followed by a space.
    // Keep closing quotes/brackets with the sentence and accept an unpunctuated final fragment.
    const chunks = normalizedText.matchAll(/[^.?!。？！]*[.?!。？！]+["'”’»）)\]]*|[^.?!。？！]+$/gu);
    for (const match of chunks) append(match[0], match.index);
  }
  return { sentences };
}
