import { ParsedParagraph, ParsedSentence } from '@/types/documents';

/**
 * Segmentation utilities to break raw text into sentences.
 */

const SENTENCE_END_PUNCTUATION = /[.?!。？！]/;

export function segmentParagraphs(rawText: string): { sentences: ParsedSentence[] } {
  const normalizedText = rawText.replace(/\s+/g, ' ').trim();
  const sentences: ParsedSentence[] = [];
  
  let currentStart = 0;
  
  // Basic Regex-based sentence boundary detection.
  // We look for punctuation followed by a space and an uppercase letter, or end of string.
  // Note: This is a basic implementation. A production system might use an NLP library like compromised or Intil.Segmenter.
  
  // Using Intl.Segmenter if available (Node 16+)
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' });
    const segments = segmenter.segment(normalizedText);
    
    for (const segment of segments) {
      const sentRaw = segment.segment;
      // We need to map this back to the rawText offsets
      // For simplicity in this implementation, we will use the normalized text offsets
      // Map normalized start/end
      const normalizedStart = segment.index;
      const normalizedEnd = segment.index + sentRaw.length;
      
      const sentTrimmed = sentRaw.trim();
      
      if (sentTrimmed.length > 0) {
        sentences.push({
            rawText: sentTrimmed,
            normalizedText: sentTrimmed.replace(/\s+/g, ' '),
            startOffset: currentStart,
            endOffset: currentStart + sentTrimmed.length,
        });
        currentStart += sentTrimmed.length + 1; // +1 for the space (approximate)
      }
    }
  } else {
      // Fallback regex segmentation
      const matches = normalizedText.split(/([.?!。？！]+(?:["']|\s|$))/);
      
      let sentenceBuf = '';
      for (let i = 0; i < matches.length; i++) {
          sentenceBuf += matches[i];
          if (i % 2 !== 0 || i === matches.length - 1) { // Current match is a boundary or we are at the end
              const sentTrimmed = sentenceBuf.trim();
              if (sentTrimmed.length > 0) {
                  sentences.push({
                      rawText: sentTrimmed,
                      normalizedText: sentTrimmed.replace(/\s+/g, ' '),
                      startOffset: currentStart,
                      endOffset: currentStart + sentTrimmed.length,
                  });
                  currentStart += sentTrimmed.length + 1;
              }
              sentenceBuf = '';
          }
      }
  }

  return { sentences };
}
