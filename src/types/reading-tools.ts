export type ReadingEntry = {
  id: string;
  kind: string;
  text: string;
  note: string | null;
  location: string | null;
  createdAt: string;
};
export type ReadingSelection = {
  anchorHandle?: import('../components/reader/selection-anchor').AnchorHandle;
  anchor?: import('../components/reader/floating-study-layout').StudyAnchor;
  kind?: 'word'|'paragraph';
  side?: 'left'|'right';
  contextText?: string;
  text: string;
  location: string;
  previousText?: string;
  nextText?: string;
  chapterText?: string;
};
export type Answer = {
  provider?: string;
  model?: string;
  answer: string;
  citations?: { quote: string }[];
  questions?: { question: string; answer: string; quote: string }[];
};
export type Dictionary = {
  word: string;
  phonetic?: string;
  audioUrl?: string;
  sourceUrl?: string;
  source?: string;
  provider?: string;
  licenseUrl?: string;
  attribution?: string;
  definitionLanguage?: string;
  meanings: {
    partOfSpeech: string;
    definitions: { definition: string; example?: string }[];
  }[];
};
