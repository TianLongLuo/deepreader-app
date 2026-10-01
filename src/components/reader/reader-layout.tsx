'use client';
import { viewportAnchor, type StudyAnchor } from './floating-study-layout';
import {createAnchorHandle,type AnchorHandle} from './selection-anchor';
import StudyDock from './study-dock';
import { wordAtPoint, highlightWord, oppositeSide } from './study-interaction';

import {
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { ReactReader, ReactReaderStyle } from 'react-reader';
import { BookOpenText, BookmarkPlus } from 'lucide-react';
import { validSourceLanguage } from './language-tools';
import { useReaderStore } from '@/hooks/use-reader-store';
import { cn } from '@/lib/utils';
import ExplanationPanel from './explanation-panel';
import PdfOriginalView from './pdf-original-view';
import ReaderToolbar from './reader-toolbar';
import MeaningGroupControl from './meaning-group-control';
import {useMeaningGroupReading} from '@/hooks/use-meaning-group-reading';
import { formatPdfPageLocation, parsePdfPageLocation, pdfPageProgress } from './pdf-location';
import { createProgressSync } from './progress-sync';
import WordLookupContent from './word-lookup-content';
import ReaderUtilities from './reader-utilities';
import ReadingTools, { readingRequest, type ReadingEntry, type ReadingSelection } from './reading-tools';
import type { ParagraphExplanationOutput } from '@/types/explanation';
import { getActionAnnotationStyle } from './action-annotation-style';
import {
  getActionAnnotationSlots as getStructuredActionAnnotationSlots,
  type ActionAnnotationSlot,
} from './action-annotation-slots';

type ReaderTheme = 'light' | 'dark' | 'sepia';

type TextPoint = {
  node: Text;
  offset: number;
};

type NormalizedTextMap = {
  text: string;
  boundaries: TextPoint[];
};

type ActiveParagraphSelection = {
  key: string;
  contents: EpubContents;
  mapping: NormalizedTextMap;
};

type TocItem = {
  href: string;
  label: string;
  subitems?: TocItem[];
};

type PanelSide = 'left' | 'right';
type PanelFrame = {
  width: number;
  height: number;
};

type ResizeState = {
  pointerId: number;
  startX: number;
  startY: number;
  startWidth: number;
  startHeight: number;
  side: PanelSide;
};

type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  startLeft: number;
  startTop: number;
};

type PlacementCandidate = {
  side: PanelSide;
  rect: ParagraphBounds;
  frame: PanelFrame;
  overlap: number;
  shortage: number;
  preferredPenalty: number;
};

type ParagraphBounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

type UserBookmark = {
  id: string;
  label: string;
  location: string;
  createdAt: string;
};

type PdfTextParagraph = {
  id: string;
  orderIndex: number;
  pageNumber: number | null;
  text: string;
  analysisText?: string;
};

type PdfTextState = {
  status: 'idle' | 'loading' | 'ready' | 'error';
  paragraphs: PdfTextParagraph[];
  pageCount: number | null;
  message?: string;
};

type PdfPageGroup = {
  pageNumber: number | null;
  paragraphs: PdfTextParagraph[];
};

type TokenOffset = { start: number; end: number };

type ActiveFocusTarget =
  | { type: 'sentence'; sentenceIndex: number }
  | { type: 'clause'; sentenceIndex: number; text: string; offsets?: TokenOffset }
  | {
      type: 'reference';
      sentenceIndex: number;
      expression: string;
      refersTo: string;
    }
  | {
      type: 'token';
      sentenceIndex: number;
      offsets: TokenOffset;
    }
  | {
      type: 'vocabulary';
      offsets: TokenOffset[];
    };

type ReaderDocument = {
  language?: string | null;
  id: string;
  title: string;
  fileType: string;
  pageCount?: number | null;
};

type EpubContents = {
  document: Document;
  window: Window;
  addStylesheetCss: (serializedCss: string, key: string) => void;
  cfiFromRange: (range: Range) => string;
};

type RenditionLike = {
  on?: (event: string, callback: (value: {start?:{cfi?:string;percentage?:number;index?:number};end?:unknown}) => void) => void;
  book?: {
    ready?: Promise<unknown>;
    loaded?: { metadata?: Promise<{language?:string}> };
    locations?: { generate: (chars: number) => Promise<unknown>; percentageFromCfi: (cfi: string) => number };
    section: {
      (target: string): { href: string; index: number } | null;
      (target: number): { href: string; index: number } | null;
    };
  };
  themes: {
    register: (name: ReaderTheme, definition: Record<string, unknown>) => void;
    select: (name: ReaderTheme) => void;
  };
  display: {
    (target?: string): Promise<unknown> | unknown;
    (target?: number): Promise<unknown> | unknown;
  };
  next: () => void;
  prev: () => void;
  annotations: {
    remove: (cfiRange: string, type: 'underline') => void;
    underline: (
      cfiRange: string,
      data?: Record<string, unknown>,
      cb?: (() => void) | undefined,
      className?: string,
      styles?: Record<string, string>
    ) => void;
  };
  hooks: {
    content: {
      register: (callback: (contents: EpubContents) => void) => void;
    };
  };
};

const MIN_INTERACTIVE_PARAGRAPH_LENGTH = 20;
const WHEEL_PAGE_TURN_THRESHOLD = 70;
const WHEEL_PAGE_TURN_COOLDOWN_MS = 450;
const PANEL_EDGE_MARGIN = 24;
const PANEL_GAP = 18;
const PANEL_MIN_WIDTH = 420;
const PANEL_MIN_HEIGHT = 360;
const PANEL_DEFAULT_FRAME: PanelFrame = {
  width: 620,
  height: 760,
};
const INTERACTIVE_PARAGRAPH_SELECTOR =
  'p, li, blockquote, dd, figcaption';

const INTERACTIVE_PARAGRAPH_CSS = `
  [data-reader-interactive='true'] {
    cursor: pointer !important;
    border-radius: 14px;
    transition:
      background-color 160ms ease,
      box-shadow 160ms ease,
      transform 160ms ease;
  }

  [data-reader-interactive='true'][data-reader-hovered='true'] {
    background: rgba(0, 122, 255, 0.10) !important;
    box-shadow: inset 0 0 0 1px rgba(234, 88, 12, 0.24);
  }

  [data-reader-interactive='true'][data-reader-active='true'] {
    background: rgba(0, 122, 255, 0.16) !important;
    box-shadow:
      inset 0 0 0 1px rgba(234, 88, 12, 0.38),
      0 8px 24px rgba(154, 52, 18, 0.10);
  }

  .reader-sentence-dim {
    color: rgba(154, 52, 18, 0.42) !important;
  }
`;

const globalEpubCssOverrides = {
  '*': {
    'font-family': 'Inter, system-ui, -apple-system, sans-serif !important',
    'line-height': '1.8 !important',
    'color': 'inherit !important',
    'background-color': 'transparent !important',
  },
  p: {
    'font-size': '1.05rem !important',
    'margin-bottom': '1.2em !important',
  },
  'h1, h2, h3, h4, h5, h6': {
    'font-family': 'Inter, system-ui, -apple-system, sans-serif !important',
    'font-weight': '700 !important',
    'margin-top': '1.5em !important',
    'margin-bottom': '0.8em !important',
  },
};

const themeClasses: Record<ReaderTheme, string> = {
  light: 'bg-[#fcfcfa] text-[#242424]',
  dark: 'bg-[#171717] text-[#e8e8e5]',
  sepia: 'bg-[#f5efdf] text-[#433b2c]',
};

const pdfReaderPageMetaClasses: Record<ReaderTheme, string> = {
  light: 'text-foreground',
  dark: 'text-muted-foreground',
  sepia: 'text-[#433422]/50',
};

const pdfReaderParagraphClasses: Record<ReaderTheme, string> = {
  light: 'hover:bg-muted focus-visible:ring-primary',
  dark: 'hover:bg-muted focus-visible:ring-border',
  sepia: 'hover:bg-muted focus-visible:ring-primary',
};

const pdfReaderActiveParagraphClasses: Record<ReaderTheme, string> = {
  light: 'bg-muted ring-1 ring-primary',
  dark: 'bg-muted ring-1 ring-border',
  sepia: 'bg-muted ring-1 ring-primary',
};

function buildThemeDefinition(theme: ReaderTheme) {
  switch (theme) {
    case 'dark':
      return {
        ...globalEpubCssOverrides,
        body: { background: '#171717 !important', color: '#e8e8e5 !important' },
      };
    case 'sepia':
      return {
        ...globalEpubCssOverrides,
        body: { background: '#f5efdf !important', color: '#242424 !important' },
      };
    default:
      return {
        ...globalEpubCssOverrides,
        body: { background: '#fcfcfa !important', color: '#242424 !important' },
      };
  }
}

function getReaderTheme(theme: ReaderTheme) {
  switch (theme) {
    case 'dark':
      return {
        ...ReactReaderStyle,
        readerArea: {
          ...ReactReaderStyle.readerArea,
          backgroundColor: '#171717',
        },
      };
    case 'sepia':
      return {
        ...ReactReaderStyle,
        readerArea: {
          ...ReactReaderStyle.readerArea,
          backgroundColor: '#f5efdf',
        },
      };
    default:
      return {
        ...ReactReaderStyle,
        readerArea: {
          ...ReactReaderStyle.readerArea,
          backgroundColor: '#fcfcfa',
        },
      };
  }
}

function buildNormalizedTextMap(element: HTMLElement): NormalizedTextMap | null {
  const walker = element.ownerDocument.createTreeWalker(
    element,
    NodeFilter.SHOW_TEXT
  );
  const boundaries: TextPoint[] = [];
  let normalizedText = '';
  let pendingWhitespace = false;

  let current = walker.nextNode();
  while (current) {
    const textNode = current as Text;
    const value = textNode.nodeValue ?? '';

    for (let index = 0; index < value.length; index += 1) {
      const character = value[index];
      const isWhitespace = /\s/.test(character);

      if (isWhitespace) {
        if (normalizedText.length > 0) {
          pendingWhitespace = true;
        }
        continue;
      }

      if (pendingWhitespace && normalizedText.length > 0) {
        normalizedText += ' ';
        boundaries.push({ node: textNode, offset: index });
        pendingWhitespace = false;
      }

      if (normalizedText.length === 0) {
        boundaries.push({ node: textNode, offset: index });
      }

      normalizedText += character;
      boundaries.push({ node: textNode, offset: index + 1 });
    }

    current = walker.nextNode();
  }

  const text = normalizedText.trim();
  if (!text || boundaries.length !== text.length + 1) {
    return null;
  }

  return { text, boundaries };
}

function createElementRange(element: HTMLElement): Range {
  const range = element.ownerDocument.createRange();
  range.selectNodeContents(element);
  return range;
}

function createRoleRange(
  mapping: NormalizedTextMap,
  startOffset: number,
  endOffset: number
): Range | null {
  const start = Math.max(0, Math.min(startOffset, mapping.text.length));
  const end = Math.max(start, Math.min(endOffset, mapping.text.length));

  if (start === end) {
    return null;
  }

  const startPoint = mapping.boundaries[start];
  const endPoint = mapping.boundaries[end];
  if (!startPoint || !endPoint) {
    return null;
  }

  if (
    startPoint.offset > startPoint.node.length ||
    endPoint.offset > endPoint.node.length
  ) {
    return null;
  }

  const range = startPoint.node.ownerDocument.createRange();
  range.setStart(startPoint.node, startPoint.offset);
  range.setEnd(endPoint.node, endPoint.offset);
  return range;
}

function normalizeSentenceSearchText(value: string) {
  return value
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function getFocusedSentenceRange(
  explanation: ParagraphExplanationOutput | null | undefined,
  sourceText: string,
  activeSentenceIndex: number | null
) {
  if (
    activeSentenceIndex === null ||
    activeSentenceIndex < 0 ||
    !explanation?.sentence_breakdown?.[activeSentenceIndex]
  ) {
    return null;
  }

  const sentenceText =
    explanation.sentence_breakdown[activeSentenceIndex].sentence_text || '';
  const normalizedSentence = normalizeSentenceSearchText(sentenceText);
  if (!normalizedSentence) {
    return null;
  }

  const normalizedSource = normalizeSentenceSearchText(sourceText);
  const start = normalizedSource.indexOf(normalizedSentence);
  if (start === -1) {
    return null;
  }

  return {
    start,
    end: start + normalizedSentence.length,
  };
}

function findNormalizedTextRange(sourceText: string, targetText: string) {
  const normalizedTarget = normalizeSentenceSearchText(targetText);
  if (!normalizedTarget) {
    return null;
  }

  const normalizedSource = normalizeSentenceSearchText(sourceText);
  const start = normalizedSource.indexOf(normalizedTarget);
  if (start === -1) {
    return null;
  }

  return {
    start,
    end: start + normalizedTarget.length,
  };
}

function dedupeRanges(ranges: Array<{ start: number; end: number }>) {
  return ranges
    .filter((range) => range.start < range.end)
    .sort((a, b) => a.start - b.start)
    .reduce<Array<{ start: number; end: number }>>((merged, range) => {
      const last = merged[merged.length - 1];
      if (last && range.start <= last.end) {
        last.end = Math.max(last.end, range.end);
        return merged;
      }

      merged.push({ ...range });
      return merged;
    }, []);
}

function getFocusRanges(
  explanation: ParagraphExplanationOutput | null | undefined,
  sourceText: string,
  activeSentenceIndex: number | null,
  activeFocusTarget: ActiveFocusTarget | null = null
) {
  if (activeFocusTarget?.type === 'clause') {
    const clauseRange = findNormalizedTextRange(sourceText, activeFocusTarget.text);
    if (clauseRange) {
      return [clauseRange];
    }
  }

  if (activeFocusTarget?.type === 'reference') {
    const ranges = [
      findNormalizedTextRange(sourceText, activeFocusTarget.expression),
      findNormalizedTextRange(sourceText, activeFocusTarget.refersTo),
    ].filter((range): range is { start: number; end: number } => Boolean(range));

    if (ranges.length > 0) {
      return dedupeRanges(ranges);
    }
  }

  if (activeFocusTarget?.type === 'token') {
    return [activeFocusTarget.offsets];
  }

  if (activeFocusTarget?.type === 'vocabulary') {
    return activeFocusTarget.offsets;
  }

  const sentenceIndex =
    activeFocusTarget?.type === 'sentence'
      ? activeFocusTarget.sentenceIndex
      : activeSentenceIndex;
  const sentenceRange = getFocusedSentenceRange(
    explanation,
    sourceText,
    sentenceIndex
  );

  return sentenceRange ? [sentenceRange] : [];
}

function filterSlotsToFocusRanges(
  slots: ActionAnnotationSlot[],
  focusRanges: Array<{ start: number; end: number }>
) {
  if (focusRanges.length === 0) {
    return slots;
  }

  return slots.filter((slot) =>
    focusRanges.some(
      (range) => slot.start_offset >= range.start && slot.end_offset <= range.end
    )
  );
}

function getDimRanges(
  textLength: number,
  focusRanges: Array<{ start: number; end: number }>
) {
  if (focusRanges.length === 0) {
    return [];
  }

  const ranges: Array<{ start: number; end: number }> = [];
  let cursor = 0;
  dedupeRanges(focusRanges).forEach((range) => {
    if (range.start > cursor) {
      ranges.push({ start: cursor, end: range.start });
    }
    cursor = Math.max(cursor, range.end);
  });

  if (cursor < textLength) {
    ranges.push({ start: cursor, end: textLength });
  }

  return ranges;
}

function getRawRangeFromNormalizedRange(
  offsetMap: ReturnType<typeof buildWhitespaceCollapsedOffsetMap>,
  range: { start: number; end: number } | null
) {
  if (!offsetMap || !range || range.start === range.end) {
    return null;
  }

  const rawStart = offsetMap.boundaries[range.start]?.start;
  const rawEnd = offsetMap.boundaries[range.end - 1]?.end;

  if (
    typeof rawStart !== 'number' ||
    typeof rawEnd !== 'number' ||
    rawStart >= rawEnd
  ) {
    return null;
  }

  return {
    start: rawStart,
    end: rawEnd,
  };
}

function getRawRangesFromNormalizedRanges(
  offsetMap: ReturnType<typeof buildWhitespaceCollapsedOffsetMap>,
  ranges: Array<{ start: number; end: number }>
) {
  return dedupeRanges(
    ranges
      .map((range) => getRawRangeFromNormalizedRange(offsetMap, range))
      .filter((range): range is { start: number; end: number } =>
        Boolean(range)
      )
  );
}

function renderPdfAnnotatedText(
  text: string,
  explanation?: ParagraphExplanationOutput | null,
  analysisText = text.replace(/\s+/g, ' ').trim(),
  activeSentenceIndex: number | null = null,
  activeFocusTarget: ActiveFocusTarget | null = null
) {
  const focusRanges = getFocusRanges(
    explanation,
    analysisText,
    activeSentenceIndex,
    activeFocusTarget
  );
  const slots = filterSlotsToFocusRanges(
    explanation
      ? getStructuredActionAnnotationSlots(explanation, analysisText)
      : [],
    focusRanges
  );

  if (slots.length === 0 && focusRanges.length === 0) {
    return text;
  }

  const offsetMap = buildWhitespaceCollapsedOffsetMap(text);
  if (!offsetMap || offsetMap.normalizedText !== analysisText) {
    return text;
  }

  const rawFocusRanges = getRawRangesFromNormalizedRanges(offsetMap, focusRanges);
  const parts: ReactNode[] = [];
  let cursor = 0;
  const pushText = (start: number, end: number, key: string) => {
    if (start >= end) {
      return;
    }

    if (rawFocusRanges.length === 0) {
      parts.push(text.slice(start, end));
      return;
    }

    const breakpoints = [start, end];
    rawFocusRanges.forEach((range) => {
      if (range.start > start && range.start < end) {
        breakpoints.push(range.start);
      }
      if (range.end > start && range.end < end) {
        breakpoints.push(range.end);
      }
    });

    [...new Set(breakpoints)]
      .sort((a, b) => a - b)
      .forEach((point, segmentIndex, points) => {
        const nextPoint = points[segmentIndex + 1];
        if (typeof nextPoint !== 'number' || point >= nextPoint) {
          return;
        }

        const focused = rawFocusRanges.some(
          (range) => point >= range.start && nextPoint <= range.end
        );
        const content = text.slice(point, nextPoint);
        parts.push(
          focused ? (
            <span
              key={`${key}-${segmentIndex}`}
              className="rounded bg-muted text-inherit"
            >
              {content}
            </span>
          ) : (
            <span key={`${key}-${segmentIndex}`} className="text-foreground/35">
              {content}
            </span>
          )
        );
      });
  };

  slots.forEach((slot, index) => {
    const rawStart = offsetMap.boundaries[slot.start_offset]?.start;
    const rawEnd = offsetMap.boundaries[slot.end_offset - 1]?.end;

    if (
      typeof rawStart !== 'number' ||
      typeof rawEnd !== 'number' ||
      rawStart >= rawEnd
    ) {
      return;
    }

    if (rawStart > cursor) {
      pushText(cursor, rawStart, `text-${index}`);
    }

    const style = getActionAnnotationStyle(slot.role);
    parts.push(
      <span
        key={`${rawStart}-${rawEnd}-${index}`}
        className={`reader-action-underline reader-action-underline-${slot.role}`}
        style={{
          color: style.textColor,
          fontWeight: style.fontWeight,
          textDecorationLine: style.underlineEnabled ? 'underline' : 'none',
          ...(style.underlineEnabled
            ? {
                textDecorationColor: style.underlineColor,
                textDecorationStyle: style.underlineStyle,
                textDecorationThickness: style.underlineThickness,
                textUnderlineOffset: '4px',
                textDecorationSkipInk: 'auto',
              }
            : {}),
        }}
      >
        {text.slice(rawStart, rawEnd)}
      </span>
    );
    cursor = rawEnd;
  });

  if (cursor < text.length) {
    pushText(cursor, text.length, 'text-end');
  }

  return parts;
}

function buildWhitespaceCollapsedOffsetMap(text: string) {
  const boundaries: Array<{ start: number; end: number }> = [];
  let normalizedText = '';
  let pendingWhitespaceStart: number | null = null;

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index];

    if (/\s/.test(character)) {
      if (normalizedText.length > 0) {
        pendingWhitespaceStart ??= index;
      }
      continue;
    }

    if (pendingWhitespaceStart !== null && normalizedText.length > 0) {
      normalizedText += ' ';
      boundaries.push({ start: pendingWhitespaceStart, end: index });
      pendingWhitespaceStart = null;
    }

    normalizedText += character;
    boundaries.push({ start: index, end: index + 1 });
  }

  return {
    normalizedText: normalizedText.trim(),
    boundaries,
  };
}

function getPdfSelectionKey(documentId: string, paragraphId: string) {
  return `pdf:${documentId}:${paragraphId}`;
}

function getPdfParagraphIdFromSelectionKey(selectionKey: string) {
  return selectionKey.split(':').at(-1) ?? '';
}

function groupPdfParagraphsByPage(paragraphs: PdfTextParagraph[]): PdfPageGroup[] {
  const groups: PdfPageGroup[] = [];

  paragraphs.forEach((paragraph) => {
    const lastGroup = groups[groups.length - 1];

    if (lastGroup && lastGroup.pageNumber === paragraph.pageNumber) {
      lastGroup.paragraphs.push(paragraph);
      return;
    }

    groups.push({
      pageNumber: paragraph.pageNumber,
      paragraphs: [paragraph],
    });
  });

  return groups;
}

function chunkPdfPagesForSpread(groups: PdfPageGroup[]) {
  const spreads: PdfPageGroup[][] = [];

  for (let index = 0; index < groups.length; index += 2) {
    spreads.push(groups.slice(index, index + 2));
  }

  return spreads;
}

function applyDomUnderline(range: Range, slot: ActionAnnotationSlot) {
  const ownerDocument = range.startContainer.ownerDocument;
  if (!ownerDocument) {
    throw new Error('Cannot apply underline without an owner document.');
  }

  const span = ownerDocument.createElement('span');
  const style = getActionAnnotationStyle(slot.role);

  span.className = `reader-action-underline reader-action-underline-${slot.role}`;
  span.dataset.readerActionUnderline = 'true';
  span.style.background = 'transparent';
  span.style.border = '0';
  span.style.boxShadow = 'none';
  span.style.setProperty('color', style.epubCssTextColor, 'important');
  span.style.setProperty('font-weight', style.fontWeight);
  span.style.setProperty(
    'text-decoration-line',
    style.underlineEnabled ? 'underline' : 'none'
  );

  if (style.underlineEnabled) {
    span.style.setProperty('text-decoration-color', style.underlineColor);
    span.style.setProperty('text-decoration-style', style.underlineStyle);
    span.style.setProperty('text-decoration-thickness', style.underlineThickness);
    span.style.setProperty('text-underline-offset', '4px');
    span.style.setProperty('text-decoration-skip-ink', 'auto');
  }

  try {
    range.surroundContents(span);
  } catch {
    const fragment = range.extractContents();
    span.appendChild(fragment);
    range.insertNode(span);
  }

  return span;
}

function applyDomSentenceDim(range: Range) {
  const ownerDocument = range.startContainer.ownerDocument;
  if (!ownerDocument) {
    throw new Error('Cannot apply sentence focus without an owner document.');
  }

  const span = ownerDocument.createElement('span');
  span.className = 'reader-sentence-dim';
  span.dataset.readerSentenceDim = 'true';

  try {
    range.surroundContents(span);
  } catch {
    const fragment = range.extractContents();
    span.appendChild(fragment);
    range.insertNode(span);
  }

  return span;
}

function unwrapDomUnderlineSpan(span: HTMLSpanElement) {
  const parent = span.parentNode;
  if (!parent) {
    return;
  }

  while (span.firstChild) {
    parent.insertBefore(span.firstChild, span);
  }

  parent.removeChild(span);
  parent.normalize();
}

function setParagraphState(
  element: HTMLElement,
  state: { hovered?: boolean; active?: boolean }
) {
  element.dataset.readerHovered = state.hovered ? 'true' : 'false';
  element.dataset.readerActive = state.active ? 'true' : 'false';
}

function clampPanelFrame(
  frame: PanelFrame,
  viewport: { width: number; height: number }
): PanelFrame {
  const maxWidth = Math.max(
    PANEL_MIN_WIDTH,
    viewport.width - PANEL_EDGE_MARGIN * 2
  );
  const maxHeight = Math.max(
    PANEL_MIN_HEIGHT,
    viewport.height - PANEL_EDGE_MARGIN * 2
  );

  return {
    width: Math.min(Math.max(frame.width, PANEL_MIN_WIDTH), maxWidth),
    height: Math.min(Math.max(frame.height, PANEL_MIN_HEIGHT), maxHeight),
  };
}

function getPanelRect(
  side: PanelSide,
  panelTop: number,
  frame: PanelFrame,
  viewport: { width: number; height: number },
  paragraphBounds: ParagraphBounds
): ParagraphBounds {
  const top = Math.min(
    Math.max(panelTop - frame.height / 2, PANEL_EDGE_MARGIN),
    viewport.height - PANEL_EDGE_MARGIN - frame.height
  );
  const preferredLeft =
    side === 'left'
      ? paragraphBounds.left - frame.width - PANEL_GAP
      : paragraphBounds.right + PANEL_GAP;
  const left = Math.min(
    Math.max(preferredLeft, PANEL_EDGE_MARGIN),
    viewport.width - PANEL_EDGE_MARGIN - frame.width
  );

  return {
    left,
    top,
    right: left + frame.width,
    bottom: top + frame.height,
  };
}

function getIntersectionArea(a: ParagraphBounds, b: ParagraphBounds) {
  const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  return width * height;
}

function clampPanelPosition(
  position: { left: number; top: number },
  frame: PanelFrame,
  viewport: { width: number; height: number }
) {
  return {
    left: Math.min(
      Math.max(position.left, PANEL_EDGE_MARGIN),
      viewport.width - PANEL_EDGE_MARGIN - frame.width
    ),
    top: Math.min(
      Math.max(position.top, PANEL_EDGE_MARGIN),
      viewport.height - PANEL_EDGE_MARGIN - frame.height
    ),
  };
}

function getAvailableWidthForSide(
  side: PanelSide,
  paragraphBounds: ParagraphBounds,
  viewport: { width: number; height: number }
) {
  return side === 'left'
    ? paragraphBounds.left - PANEL_EDGE_MARGIN - PANEL_GAP
    : viewport.width - paragraphBounds.right - PANEL_EDGE_MARGIN - PANEL_GAP;
}

function normalizeNavigationTarget(target: string) {
  return target.trim();
}

function isCfiTarget(target: string) {
  return target.startsWith('epubcfi(');
}

function normalizeHrefKey(target: string) {
  return decodeURI(target)
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .split('#')[0];
}

function resolveNavigationTarget(
  rendition: RenditionLike | null,
  target: string
): string {
  if (!target || isCfiTarget(target)) {
    return target;
  }

  const section = rendition?.book?.section(target);
  if (section?.href) {
    return section.href;
  }

  const normalizedTarget = normalizeHrefKey(target);
  const spineItems =
    (
      rendition?.book as
        | { spine?: { spineItems?: Array<{ href: string }> } }
        | undefined
    )?.spine?.spineItems ?? [];
  const matchingSection = spineItems.find((item) => {
    const normalizedHref = normalizeHrefKey(item.href);
    return (
      normalizedHref === normalizedTarget ||
      normalizedHref.endsWith(`/${normalizedTarget}`) ||
      normalizedTarget.endsWith(`/${normalizedHref}`)
    );
  });

  if (matchingSection?.href) {
    return matchingSection.href;
  }

  return target;
}

function toContainerBounds(
  rect: DOMRect,
  containerRect: DOMRect | undefined,
  frameRect?: DOMRect | null
): ParagraphBounds {
  const frameLeft = frameRect?.left ?? 0;
  const frameTop = frameRect?.top ?? 0;
  const absoluteLeft = rect.left + frameLeft;
  const absoluteTop = rect.top + frameTop;
  const absoluteRight = rect.right + frameLeft;
  const absoluteBottom = rect.bottom + frameTop;

  if (!containerRect) {
    return {
      left: absoluteLeft,
      top: absoluteTop,
      right: absoluteRight,
      bottom: absoluteBottom,
    };
  }

  return {
    left: absoluteLeft - containerRect.left,
    top: absoluteTop - containerRect.top,
    right: absoluteRight - containerRect.left,
    bottom: absoluteBottom - containerRect.top,
  };
}

function flattenToc(items: TocItem[]): TocItem[] {
  return items.flatMap((item) => [
    item,
    ...(item.subitems ? flattenToc(item.subitems) : []),
  ]);
}

function getBookmarkStorageKey(userId: string, documentId: string) {
  return `deepreader:user-bookmarks:${userId}:${documentId}`;
}

function readStoredBookmarks(userId: string, documentId: string): UserBookmark[] {
  if (typeof window === 'undefined') {
    return [];
  }

  const raw = window.localStorage.getItem(getBookmarkStorageKey(userId, documentId));
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw) as UserBookmark[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function ReaderLayout({
  document,
  currentUser,
}: {
  document: ReaderDocument;
  initialSections?: unknown[];
  currentUser: {
    id: string;
    email: string;
  };
}) {
  const {
    theme,
    sourceLanguage,meaningGroupReading,setMeaningGroupReading,
    setSourceLanguage,
    fontSize, lineHeight,
    explanationPanelWidth,
    explanationPanelHeight,
    setExplanationPanelSize,
  } = useReaderStore();

  useEffect(()=>{const language=validSourceLanguage(new URLSearchParams(window.location.search).get('sourceLanguage')) || validSourceLanguage(document.language ?? null) || 'en';setSourceLanguage(language);},[setSourceLanguage,document.id,document.language]);
  const [utilityOpen,setUtilityOpen]=useState(false);
  const [utilityTab,setUtilityTab]=useState('ai');
  useEffect(()=>{useReaderStore.getState().setStudyPinned(false);return()=>{useReaderStore.getState().setStudyPinned(false);};},[document.id]);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [showDetailed, setShowDetailed] = useState(false);
  const [toolSelection, setToolSelection] = useState<ReadingSelection|null>(null);
  useEffect(()=>()=>toolSelection?.anchorHandle?.dispose(),[toolSelection?.anchorHandle]);
  const [entries, setEntries] = useState<ReadingEntry[]>([]);
  const [readingReady, setReadingReady] = useState(false);
  const [syncError, setSyncError] = useState('');
  // This queue survives effect resubscriptions while the keyed reader stays mounted.
  const [progressSync] = useState(() => createProgressSync(
    snapshot => readingRequest('/api/documents/' + document.id + '/reading', {
      method: 'PATCH',
      keepalive: true,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(snapshot),
    }),
    {
      onSuccess: () => setSyncError(''),
      onError: error => setSyncError(error instanceof Error ? error.message : 'Could not save reading progress'),
    },
  ));
  const pendingRestore = useRef<string|null>(null);
  const progressRef = useRef({location:'',percentage:0});
  const epubContentsRef = useRef<EpubContents[]>([]);
  const entriesRef = useRef<ReadingEntry[]>([]);
  useEffect(()=>{entriesRef.current = entries;},[entries]);
  const typographyRef = useRef({fontSize,lineHeight});
  useEffect(()=>{typographyRef.current = {fontSize,lineHeight};},[fontSize,lineHeight]);
  const [location, setLocation] = useState<string | number>(0);
  const [epubPercentage, setEpubPercentage] = useState(0);
  const [selectedParagraph, setSelectedParagraph] = useState<{
    key: string;
    text: string;
    preferredPanelSide: PanelSide;
    anchorY: number;
    paragraphBounds: ParagraphBounds;
  } | null>(null);
  const [viewportFrame, setViewportFrame] = useState({
    width: 1280,
    height: 900,
  });
  const [navigationTarget, setNavigationTarget] = useState<string | number | null>(null);
  const [tocItems, setTocItems] = useState<TocItem[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [immersive, setImmersive] = useState(false);
  const [pdfPageJumpValue, setPdfPageJumpValue] = useState('');
  const [pdfViewMode, setPdfViewMode] = useState<'text' | 'original'>('text');
  const [pdfOriginalPage, setPdfOriginalPageState] = useState(1);
  const pdfOriginalPageRef = useRef(1);
  const pdfReadyPageRef = useRef<number | null>(null);
  const [pdfReadyPage, setPdfReadyPage] = useState<number | null>(null);
  const [pdfVisiblePage, setPdfVisiblePage] = useState(1);
  const setPdfOriginalPage = useCallback((page: number) => {
    if (page !== pdfOriginalPageRef.current) {
      pdfReadyPageRef.current = null;
      setPdfReadyPage(null);
    }
    pdfOriginalPageRef.current = page;
    setPdfOriginalPageState(page);
    if(!useReaderStore.getState().studyPinned){setToolSelection(null);setToolsOpen(false);}
  }, []);
  const [pdfJumpError, setPdfJumpError] = useState('');
  const pdfViewModeRef = useRef<'text' | 'original'>('text');
  const changePdfViewMode = useCallback((mode: 'text' | 'original') => {
    pdfViewModeRef.current = mode;
    setPdfViewMode(mode);
    setToolsOpen(false);
    setShowDetailed(false);
    setToolSelection(null);
    setSelectedParagraph(null);
    setPdfJumpError('');
  }, []);
  const userBookmarks: UserBookmark[] = entries.filter(e=>e.kind==='bookmark'&&e.location).map(e=>({id:e.id,label:e.text,location:e.location!,createdAt:e.createdAt}));
  const [pdfTextState, setPdfTextState] = useState<PdfTextState>({
    status: document.fileType === 'PDF' ? 'loading' : 'idle',
    paragraphs: [],
    pageCount: null,
  });
  const pdfPagesWithoutText = useMemo(() => {
    if (pdfTextState.status !== 'ready' || pdfTextState.pageCount === null) return 0;
    const pagesWithText = new Set(
      pdfTextState.paragraphs
        .map(paragraph => paragraph.pageNumber)
        .filter((page): page is number => typeof page === 'number' && page > 0)
    );
    return Math.max(0, pdfTextState.pageCount - pagesWithText.size);
  }, [pdfTextState]);
  const [pdfExplanations, setPdfExplanations] = useState<
    Record<string, ParagraphExplanationOutput>
  >({});
  const [activeSentenceIndex, setActiveSentenceIndex] = useState<number | null>(null);
  const [activeFocusTarget, setActiveFocusTarget] =
    useState<ActiveFocusTarget | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const meaningGroups=useMeaningGroupReading({root:containerRef,documentId:document.id,userId:currentUser.id,language:sourceLanguage,enabled:meaningGroupReading&&(document.fileType==='EPUB'||pdfViewMode==='text'),theme});
  const renditionRef = useRef<RenditionLike | null>(null);
  const hooksRegisteredRef = useRef(false);
  const activeSelectionRef = useRef<ActiveParagraphSelection | null>(null);
  const activeElementRef = useRef<HTMLElement | null>(null);
  const activeExplanationRef = useRef<ParagraphExplanationOutput | null>(null);
  const activeSentenceIndexRef = useRef<number | null>(null);
  const activeFocusTargetRef = useRef<ActiveFocusTarget | null>(null);
  const underlineAnnotationCfisRef = useRef<string[]>([]);
  const domUnderlineSpansRef = useRef<HTMLSpanElement[]>([]);
  const sentenceFocusSpansRef = useRef<HTMLSpanElement[]>([]);
  const lastWheelNavigationAtRef = useRef(0);
  const currentLocationRef = useRef<string | number>(location);

  const pdfPageGroups = useMemo(
    () => groupPdfParagraphsByPage(pdfTextState.paragraphs),
    [pdfTextState.paragraphs]
  );
  const pdfPageSpreads = useMemo(
    () => chunkPdfPagesForSpread(pdfPageGroups),
    [pdfPageGroups]
  );

  const registerThemes = useCallback((rendition: RenditionLike) => {
    rendition.themes.register('light', buildThemeDefinition('light'));
    rendition.themes.register('dark', buildThemeDefinition('dark'));
    rendition.themes.register('sepia', buildThemeDefinition('sepia'));
    rendition.themes.select(theme);
  }, [theme]);

  const clearUnderlineAnnotations = useCallback(() => {
    domUnderlineSpansRef.current.forEach((span) => {
      if (span.isConnected) {
        unwrapDomUnderlineSpan(span);
      }
    });
    domUnderlineSpansRef.current = [];

    sentenceFocusSpansRef.current.forEach((span) => {
      if (span.isConnected) {
        unwrapDomUnderlineSpan(span);
      }
    });
    sentenceFocusSpansRef.current = [];

    const rendition = renditionRef.current;
    if (!rendition) {
      underlineAnnotationCfisRef.current = [];
      return;
    }

    underlineAnnotationCfisRef.current.forEach((cfiRange) => {
      rendition.annotations.remove(cfiRange, 'underline');
    });
    underlineAnnotationCfisRef.current = [];
  }, []);

  const clearActiveParagraph = useCallback(() => {
    if (activeElementRef.current?.isConnected) {
      setParagraphState(activeElementRef.current, {
        hovered: false,
        active: false,
      });
    }

    activeElementRef.current = null;
    activeSelectionRef.current = null;
  }, []);

  const closeExplanationPanel = useCallback(() => {
    clearUnderlineAnnotations();
    clearActiveParagraph();
    activeExplanationRef.current = null;
    activeSentenceIndexRef.current = null;
    activeFocusTargetRef.current = null;
    setActiveSentenceIndex(null);
    setActiveFocusTarget(null);
    setSelectedParagraph(null);
  }, [clearActiveParagraph, clearUnderlineAnnotations]);

  const handleParagraphClick = useCallback(
    (element: HTMLElement, contents: EpubContents) => {
      clearUnderlineAnnotations();

      const mapping = buildNormalizedTextMap(element);
      if (!mapping || mapping.text.length < MIN_INTERACTIVE_PARAGRAPH_LENGTH) {
        return;
      }

      const paragraphRange = createElementRange(element);
      const cfiRange = contents.cfiFromRange(paragraphRange);
      if (!cfiRange) {
        return;
      }

      if (activeElementRef.current && activeElementRef.current !== element) {
        setParagraphState(activeElementRef.current, {
          hovered: false,
          active: false,
        });
      }

      setParagraphState(element, { hovered: false, active: true });
      activeElementRef.current = element;
      activeSelectionRef.current = {
        key: cfiRange,
        contents,
        mapping,
      };

      contents.window.getSelection()?.removeAllRanges();
      const rect = element.getBoundingClientRect();
      const frameRect =
        (contents.window.frameElement as Element | null)?.getBoundingClientRect?.() ??
        null;
      const paragraphCenterX = rect.left + rect.width / 2;
      const containerRect = containerRef.current?.getBoundingClientRect();
      const absoluteParagraphCenterX =
        paragraphCenterX + (frameRect?.left ?? 0);
      const preferredPanelSide: PanelSide =
        absoluteParagraphCenterX >
        ((containerRect?.left ?? 0) + viewportFrame.width / 2)
          ? 'left'
          : 'right';
      const paragraphBounds = toContainerBounds(rect, containerRect, frameRect);
      const anchorY = paragraphBounds.top + (paragraphBounds.bottom - paragraphBounds.top) / 2;
      activeExplanationRef.current = null;
      activeSentenceIndexRef.current = null;
      activeFocusTargetRef.current = null;
      setActiveSentenceIndex(null);
      setActiveFocusTarget(null);
      useReaderStore.getState().setLearningDepth('grammar');
      setShowDetailed(true);
      setToolsOpen(false);
      setToolSelection({kind:'paragraph',anchorHandle:createAnchorHandle(element,undefined,()=>epubContentsRef.current.flatMap(c=>Array.from(c.document.querySelectorAll<HTMLElement>('p,li,blockquote'))).find(p=>p.isConnected&&p.textContent===element.textContent)??null),anchor:viewportAnchor(rect,frameRect),side:preferredPanelSide,text:mapping.text,location:cfiRange,previousText:element.previousElementSibling?.textContent||'',nextText:element.nextElementSibling?.textContent||'',chapterText:element.ownerDocument.body.textContent||mapping.text});
      setSelectedParagraph({
        key: cfiRange,
        text: mapping.text,
        preferredPanelSide,
        anchorY,
        paragraphBounds,
      });
    },
    [clearUnderlineAnnotations, viewportFrame.width]
  );

  const openPdfParagraph = useCallback(
    (paragraph: PdfTextParagraph, element: HTMLElement) => {
      const text = (paragraph.analysisText || paragraph.text)
        .replace(/\s+/g, ' ')
        .trim();
      if (text.length < MIN_INTERACTIVE_PARAGRAPH_LENGTH) {
        return;
      }

      clearUnderlineAnnotations();
      const rect = element.getBoundingClientRect();
      const containerRect = containerRef.current?.getBoundingClientRect();
      const paragraphBounds = toContainerBounds(rect, containerRect);
      const absoluteParagraphCenterX = rect.left + rect.width / 2;
      const preferredPanelSide: PanelSide =
        absoluteParagraphCenterX >
        ((containerRect?.left ?? 0) + viewportFrame.width / 2)
          ? 'left'
          : 'right';

      activeExplanationRef.current = null;
      activeSentenceIndexRef.current = null;
      activeFocusTargetRef.current = null;
      setActiveSentenceIndex(null);
      setActiveFocusTarget(null);
      useReaderStore.getState().setLearningDepth('grammar');
      setShowDetailed(true);
      setToolsOpen(false);
      const index = pdfTextState.paragraphs.indexOf(paragraph);
      setToolSelection({kind:'paragraph',anchorHandle:createAnchorHandle(element),anchor:viewportAnchor(rect),side:preferredPanelSide,text,location:getPdfSelectionKey(document.id,paragraph.id),previousText:pdfTextState.paragraphs[index-1]?.text,nextText:pdfTextState.paragraphs[index+1]?.text,chapterText:pdfTextState.paragraphs.filter(p=>p.pageNumber===paragraph.pageNumber).map(p=>p.text).join('\n')});
      setSelectedParagraph({
        key: getPdfSelectionKey(document.id, paragraph.id),
        text,
        preferredPanelSide,
        anchorY:
          paragraphBounds.top +
          (paragraphBounds.bottom - paragraphBounds.top) / 2,
        paragraphBounds,
      });
    },
    [clearUnderlineAnnotations, document.id, viewportFrame.width, pdfTextState.paragraphs]
  );

  const openWord = useCallback((text: string, location: string, contextText: string, x: number, previousText = '', nextText = '', anchor?:StudyAnchor,anchorHandle?:AnchorHandle) => {
    closeExplanationPanel();
    const rect = containerRef.current?.getBoundingClientRect();
    setToolSelection({kind:'word',anchorHandle,anchor,text,location,contextText,previousText,nextText,side:oppositeSide(x,rect?.left||0,rect?.width||window.innerWidth)});
    setShowDetailed(false);
    setToolsOpen(true);
  }, [closeExplanationPanel]);

  const handlePdfParagraphClick = useCallback(
    (
      paragraph: PdfTextParagraph,
      event: ReactMouseEvent<HTMLButtonElement>
    ) => {
      const selected = window.getSelection()?.toString().trim();
      const word = wordAtPoint(event.currentTarget.ownerDocument,event.clientX,event.clientY,event.currentTarget);
      if (selected && /\s/.test(selected)) {openPdfParagraph(paragraph,event.currentTarget);return;}
      if (selected || word) {
        const index=pdfTextState.paragraphs.indexOf(paragraph);
        openWord(selected || word!.word,getPdfSelectionKey(document.id,paragraph.id),paragraph.text,event.clientX,pdfTextState.paragraphs[index-1]?.text,pdfTextState.paragraphs[index+1]?.text,viewportAnchor(event.currentTarget.getBoundingClientRect()),createAnchorHandle(event.currentTarget,word?.range,undefined,'paragraph'));
        return;
      }
      openPdfParagraph(paragraph, event.currentTarget);
    },
    [openPdfParagraph, openWord, document.id, pdfTextState.paragraphs]
  );

  const getVisiblePdfBookmarkTarget = useCallback(() => {
    if (document.fileType !== 'PDF') {
      return null;
    }
    if (pdfViewModeRef.current === 'original') {
      const page = pdfOriginalPageRef.current;
      if (pdfReadyPageRef.current !== page) return null;
      return { location: formatPdfPageLocation(document.id, page), label: `第 ${page} 页`, pageNumber: page };
    }

    const container = containerRef.current;
    if (!container) {
      return null;
    }

    const readingTop = (container.querySelector('[data-pdf-text-scroll]') ?? container).getBoundingClientRect().top;
    const paragraphButtons = Array.from(
      container.querySelectorAll<HTMLButtonElement>('[data-pdf-selection-key]')
    );
    const bestMatch = paragraphButtons.reduce<{
      element: HTMLButtonElement;
      distance: number;
    } | null>((best, element) => {
      const rect = element.getBoundingClientRect();
      const distance = Math.abs(rect.top - readingTop - 24);

      if (!best || distance < best.distance) {
        return { element, distance };
      }

      return best;
    }, null);

    if (!bestMatch?.element.dataset.pdfSelectionKey) {
      return null;
    }

    const paragraphId = getPdfParagraphIdFromSelectionKey(
      bestMatch.element.dataset.pdfSelectionKey
    );
    const paragraph = pdfTextState.paragraphs.find(
      (item) => item.id === paragraphId
    );

    if (!paragraph) {
      return null;
    }

    return {
      location: bestMatch.element.dataset.pdfSelectionKey,
      label: paragraph.text.slice(0, 48),
      pageNumber: paragraph.pageNumber,
    };
  }, [document.fileType, document.id, pdfTextState.paragraphs]);

  const installInteractiveParagraphs = useCallback((contents: EpubContents) => {
    contents.addStylesheetCss(
      INTERACTIVE_PARAGRAPH_CSS + ' ::highlight(reader-hover-word) {background-color:#c7dfff;color:#12243b;} [data-reader-interactive] {position:relative;} [data-reader-interactive]::before {content: "≡"; position:absolute;right:100%;top:0; padding:0 4px;font-size:12px;opacity:0;cursor:pointer;} [data-reader-interactive]:hover::before,[data-reader-interactive]:focus::before {opacity:.6;}',
      'reader-paragraph-interaction'
    );

    if(contents.document.documentElement.dataset.nativeDismiss!=='true'){
      contents.document.documentElement.dataset.nativeDismiss='true';
      contents.document.addEventListener('click',event=>{if(!(event.target as Element).closest('[data-reader-interactive]')&&!useReaderStore.getState().studyPinned){setToolsOpen(false);setShowDetailed(false);closeExplanationPanel();}});
      contents.document.addEventListener('keydown',event=>{if(event.key==='Escape'){setToolsOpen(false);setShowDetailed(false);closeExplanationPanel();}});
    }
    const nodes = Array.from(
      contents.document.querySelectorAll(INTERACTIVE_PARAGRAPH_SELECTOR)
    ) as HTMLElement[];

    nodes.forEach((element) => {
      const mapping = buildNormalizedTextMap(element);
      if (!mapping || !mapping.text) {
        return;
      }

      if (element.dataset.readerInteractive === 'true') {
        return;
      }

      element.tabIndex = 0;
      element.title = '点击单词查词；点击段落边缘或按 Enter 分析整段';
      element.addEventListener('keydown',event=>{if(event.key==='Enter'&&event.target===element){event.preventDefault();handleParagraphClick(element,contents);}});
      element.dataset.readerInteractive = 'true';
      setParagraphState(element, { hovered: false, active: false });

      element.addEventListener('mouseenter', () => {
        if (activeElementRef.current === element) {
          setParagraphState(element, { hovered: false, active: true });
          return;
        }

        setParagraphState(element, { hovered: true, active: false });
      });

      element.addEventListener('mousemove', (event) => {const hit=wordAtPoint(contents.document,event.clientX,event.clientY,element);highlightWord(contents.document,hit?.range);});
      element.addEventListener('mouseleave', () => {
        highlightWord(contents.document);
        if (activeElementRef.current === element) {
          setParagraphState(element, { hovered: false, active: true });
          return;
        }

        setParagraphState(element, { hovered: false, active: false });
      });

      element.addEventListener('click', (event) => {
        const target = event.target as HTMLElement | null;
        if (target?.closest('a')) {
          return;
        }

        if (contents.document.documentElement.dataset.readerSelectionConsumed === 'true' || contents.window.getSelection()?.toString().trim()) return;
        event.preventDefault();
        event.stopPropagation();
        const hit=wordAtPoint(contents.document,event.clientX,event.clientY,element);
        if(hit){
          const frame=(contents.window.frameElement as Element|null)?.getBoundingClientRect();
          openWord(hit.word,contents.cfiFromRange(hit.range),element.textContent||'',event.clientX+(frame?.left||0),element.previousElementSibling?.textContent||'',element.nextElementSibling?.textContent||'',viewportAnchor(element.getBoundingClientRect(),frame),createAnchorHandle(element,hit.range,()=>epubContentsRef.current.flatMap(c=>Array.from(c.document.querySelectorAll<HTMLElement>('p,li,blockquote'))).find(p=>p.isConnected&&p.textContent===element.textContent)??null,'paragraph'));
          return;
        }
        handleParagraphClick(element, contents);
      });
    });
  }, [handleParagraphClick,openWord]);

  const installWheelNavigation = useCallback((contents: EpubContents) => {
    const root = contents.document.documentElement;
    if (root.dataset.readerWheelNavigation === 'true') {
      return;
    }

    root.dataset.readerWheelNavigation = 'true';
    contents.document.addEventListener(
      'wheel',
      (event) => {
        if (Math.abs(event.deltaY) < WHEEL_PAGE_TURN_THRESHOLD) {
          return;
        }

        const now = Date.now();
        if (now - lastWheelNavigationAtRef.current < WHEEL_PAGE_TURN_COOLDOWN_MS) {
          event.preventDefault();
          return;
        }

        const rendition = renditionRef.current;
        if (!rendition) {
          return;
        }

        lastWheelNavigationAtRef.current = now;
        event.preventDefault();

        if (event.deltaY > 0) {
          rendition.next();
          return;
        }

        rendition.prev();
      },
      { passive: false }
    );
  }, []);

  const applyExplanationAnnotations = useCallback(
    (
      selectionKey: string,
      explanation: ParagraphExplanationOutput | null,
      focusedSentenceIndex: number | null = null,
      focusedTarget: ActiveFocusTarget | null = null
    ) => {
      if (!explanation) {
        return;
      }

      const activeSelection = activeSelectionRef.current;
      const rendition = renditionRef.current;
      if (
        !activeSelection ||
        !rendition ||
        activeSelection.key !== selectionKey
      ) {
        return;
      }

      clearUnderlineAnnotations();

      const activeElement = activeElementRef.current;
      const freshMapping = activeElement?.isConnected
        ? buildNormalizedTextMap(activeElement)
        : null;

      if (!freshMapping) {
        return;
      }

      const focusRanges = getFocusRanges(
        explanation,
        freshMapping.text,
        focusedSentenceIndex,
        focusedTarget
      );
      if (focusRanges.length > 0) {
        getDimRanges(freshMapping.text.length, focusRanges).forEach((dimRange) => {
          const range = createRoleRange(
            freshMapping,
            dimRange.start,
            dimRange.end
          );
          if (!range) {
            return;
          }

          try {
            sentenceFocusSpansRef.current.push(applyDomSentenceDim(range));
          } catch {
            // Ignore focus range failures so annotation rendering stays usable.
          }
        });
      }

      const annotationMapping =
        activeElement?.isConnected
          ? buildNormalizedTextMap(activeElement) || freshMapping
          : freshMapping;

      activeSelectionRef.current = {
        ...activeSelection,
        mapping: annotationMapping,
      };

      const annotationFocusRanges = getFocusRanges(
        explanation,
        annotationMapping.text,
        focusedSentenceIndex,
        focusedTarget
      );
      const actionSlots = filterSlotsToFocusRanges(
        getStructuredActionAnnotationSlots(explanation, annotationMapping.text),
        annotationFocusRanges
      );

      [...actionSlots]
        .sort((a, b) => b.start_offset - a.start_offset)
        .forEach((slot) => {
          const range = createRoleRange(
            annotationMapping,
            slot.start_offset,
            slot.end_offset
          );

          if (!range) {
            return;
          }

          try {
            domUnderlineSpansRef.current.push(applyDomUnderline(range, slot));
          } catch {
            // Ignore malformed ranges so a single bad span won't break the reader.
          }
        });
    },
    [clearUnderlineAnnotations]
  );

  const handleExplanationReady = useCallback(
    (selectionKey: string, explanation: ParagraphExplanationOutput | null) => {
      if (!explanation) {
        return;
      }

      activeExplanationRef.current = explanation;

      if (document.fileType === 'PDF') {
        setPdfExplanations((current) => ({
          ...current,
          [selectionKey]: explanation,
        }));
        return;
      }

      applyExplanationAnnotations(
        selectionKey,
        explanation,
        activeSentenceIndexRef.current,
        activeFocusTargetRef.current
      );
    },
    [applyExplanationAnnotations, document.fileType]
  );

  const handleActiveSentenceChange = useCallback(
    (selectionKey: string, index: number | null) => {
      if (selectedParagraph?.key !== selectionKey) {
        return;
      }

      activeSentenceIndexRef.current = index;
      activeFocusTargetRef.current =
        index === null ? null : { type: 'sentence', sentenceIndex: index };
      setActiveSentenceIndex(index);
      setActiveFocusTarget(activeFocusTargetRef.current);

      if (document.fileType !== 'PDF') {
        applyExplanationAnnotations(
          selectionKey,
          activeExplanationRef.current,
          index,
          activeFocusTargetRef.current
        );
      }
    },
    [applyExplanationAnnotations, document.fileType, selectedParagraph?.key]
  );

  const handleFocusTargetChange = useCallback(
    (selectionKey: string, target: ActiveFocusTarget | null) => {
      if (selectedParagraph?.key !== selectionKey) {
        return;
      }

      activeFocusTargetRef.current = target;
      setActiveFocusTarget(target);

      if (document.fileType !== 'PDF') {
        applyExplanationAnnotations(
          selectionKey,
          activeExplanationRef.current,
          activeSentenceIndexRef.current,
          target
        );
      }
    },
    [applyExplanationAnnotations, document.fileType, selectedParagraph?.key]
  );

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const updateViewportFrame = () => {
      setViewportFrame({
        width: container.clientWidth,
        height: container.clientHeight,
      });
    };

    updateViewportFrame();

    const observer = new ResizeObserver(updateViewportFrame);
    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, []);

  useEffect(() => {
    if (renditionRef.current) {
      registerThemes(renditionRef.current);
    }
  }, [registerThemes, theme]);

  useEffect(() => {
    if (navigationTarget) {
      return;
    }

    currentLocationRef.current = location;
  }, [location, navigationTarget]);

  useEffect(() => {
    return () => {
      clearUnderlineAnnotations();
      clearActiveParagraph();
    };
  }, [clearActiveParagraph, clearUnderlineAnnotations]);

  useEffect(() => {
    if (!immersive) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setImmersive(false);
      }
    };

    globalThis.document.addEventListener('keydown', onKeyDown);
    return () => globalThis.document.removeEventListener('keydown', onKeyDown);
  }, [immersive]);

  useEffect(() => {
    if (document.fileType !== 'PDF') {
      return;
    }

    const controller = new AbortController();
    // ReaderWrapper keys the reader by book/user; its initial state is loading.

    fetch(`/api/documents/${document.id}/text`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          throw new Error(
            payload?.error || 'Failed to extract PDF text for analysis.'
          );
        }

        return payload as {
          pageCount?: number | null;
          paragraphs?: PdfTextParagraph[];
        };
      })
      .then((payload) => {
        if (controller.signal.aborted) return;
        setPdfTextState({
          status: 'ready',
          paragraphs: payload.paragraphs ?? [],
          pageCount: payload.pageCount ?? null,
        });
        if (!payload.paragraphs?.length) changePdfViewMode('original');
      })
      .catch((error) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return;
        }

        setPdfTextState({
          status: 'error',
          paragraphs: [],
          pageCount: null,
          message:
            error instanceof Error
              ? error.message
              : 'Failed to extract PDF text for analysis.',
        });
      });

    return () => {
      controller.abort();
    };
  }, [document.fileType, document.id, changePdfViewMode]);

  useEffect(() => {
    if (!selectedParagraph) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeExplanationPanel();
      }
    };

    window.addEventListener('keydown', handleEscape);
    return () => {
      window.removeEventListener('keydown', handleEscape);
    };
  }, [closeExplanationPanel, selectedParagraph]);



  const getRendition = (rendition: RenditionLike) => {
    renditionRef.current = rendition;
    registerThemes(rendition);
    if (!validSourceLanguage(new URLSearchParams(window.location.search).get('sourceLanguage')) && !validSourceLanguage(document.language ?? null)) {
      void rendition.book?.loaded?.metadata?.then(metadata => {
        const language = validSourceLanguage(metadata.language?.toLowerCase().split(/[-_]/)[0] ?? null);
        if (language && renditionRef.current === rendition) setSourceLanguage(language);
      }).catch(()=>{});
    }
    if (!hooksRegisteredRef.current) {
      void rendition.book?.ready?.then(async () => {
        await rendition.book?.locations?.generate(1600);
        if (renditionRef.current !== rendition || !progressRef.current.location) return;
        const ratio = rendition.book?.locations?.percentageFromCfi(progressRef.current.location);
        if (typeof ratio === 'number' && Number.isFinite(ratio) && ratio >= 0) {
          const percentage = Math.min(100, ratio * 100);
          progressRef.current = { ...progressRef.current, percentage };
          setEpubPercentage(percentage);
        }
      }).catch(()=>{});
      rendition.on?.('relocated', (value) => {
        if (value.start?.cfi) {
          const percentage = Math.max(0,Math.min(100,(rendition.book?.locations?.percentageFromCfi(value.start.cfi)||value.start.percentage||0)*100));
          progressRef.current = {location:value.start.cfi, percentage};
          setEpubPercentage(percentage);
        }
      });
    }

    if (!hooksRegisteredRef.current) {
      rendition.hooks.content.register((contents: EpubContents) => {
        epubContentsRef.current = [...epubContentsRef.current.filter(c=>c.document.documentElement.isConnected),contents];
        contents.addStylesheetCss('body, p, li { font-size: '+typographyRef.current.fontSize+'px !important; line-height: '+typographyRef.current.lineHeight+' !important; }','reader-typography');
        // Remove transient annotation nodes before a gesture starts so saved CFIs
        // are always computed against the unannotated book DOM.
        contents.document.addEventListener('pointerdown',()=>{
          delete contents.document.documentElement.dataset.readerSelectionConsumed;
          clearUnderlineAnnotations();
        },true);
        contents.document.addEventListener('mouseup',()=>{
          const selected = contents.window.getSelection();const text=selected?.toString().trim();
          if(!text||!selected?.rangeCount)return;
          contents.document.documentElement.dataset.readerSelectionConsumed = 'true';
          const range=selected.getRangeAt(0);const ancestor=range.commonAncestorContainer;
          const parent=ancestor.nodeType===1?ancestor as Element:ancestor.parentElement;
          const block=parent?.closest('p,li,blockquote') as HTMLElement|null;
          if(/\s/.test(text)&&block){handleParagraphClick(block,contents);return;}
          const rect=range.getBoundingClientRect();const frame=(contents.window.frameElement as Element|null)?.getBoundingClientRect();
          openWord(text,contents.cfiFromRange(range),block?.textContent||parent?.textContent||'',rect.left+(frame?.left||0),block?.previousElementSibling?.textContent||'',block?.nextElementSibling?.textContent||'',viewportAnchor(block?.getBoundingClientRect()??rect,frame),block?createAnchorHandle(block,range,()=>epubContentsRef.current.flatMap(c=>Array.from(c.document.querySelectorAll<HTMLElement>('p,li,blockquote'))).find(p=>p.isConnected&&p.textContent===block.textContent)??null,'paragraph'):undefined);
        });
        contents.document.querySelectorAll<HTMLElement>('p,li,blockquote').forEach(node=>{if(entriesRef.current.some(e=>e.kind==='note'&&node.textContent?.includes(e.text)))node.style.boxShadow='inset 0 -2px #007aff';});
        installInteractiveParagraphs(contents);
        installWheelNavigation(contents);
      });
      hooksRegisteredRef.current = true;
    }
  };

  const saveReadingEntry = useCallback(async (kind:string,text:string,note='',entryLocation?:string) => {
    const data = await readingRequest('/api/documents/'+document.id+'/reading',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind,text,note,location:entryLocation||(document.fileType==='PDF'?getVisiblePdfBookmarkTarget()?.location:progressRef.current.location)||''})});
    setEntries(current=>[data.item,...current.filter(item=>item.id!==data.item.id)]);
  },[document.id,document.fileType,getVisiblePdfBookmarkTarget]);
  const handleAddBookmark = useCallback(() => {
    let bookmarkLocation: string | null = null;
    let suggestedLabel = `Bookmark ${userBookmarks.length + 1}`;

    if (document.fileType === 'PDF') {
      const pdfTarget = getVisiblePdfBookmarkTarget();

      if (!pdfTarget) {
        return;
      }

      bookmarkLocation = pdfTarget.location;
      suggestedLabel = pdfTarget.label || suggestedLabel;
    } else if (typeof location === 'string' && document.fileType === 'EPUB') {
      const tocMatch = flattenToc(tocItems).find(
        (item) =>
          location.includes(item.href) ||
          item.href.includes(location.split('#')[0] ?? location)
      );

      bookmarkLocation = location;
      suggestedLabel =
        selectedParagraph?.text.slice(0, 48) ||
        tocMatch?.label ||
        suggestedLabel;
    }

    if (!bookmarkLocation) {
      return;
    }

    // Use the current page/chapter as the label for the same one-click action
    // in EPUB and both PDF layouts, including embedded browsers without prompts.
    void saveReadingEntry('bookmark', suggestedLabel, '', bookmarkLocation)
      .then(() => setDrawerOpen(true))
      .catch((error) => setSyncError(error.message));
  }, [
    document.fileType,
    getVisiblePdfBookmarkTarget,
    location,
    selectedParagraph?.text,
    tocItems,
    userBookmarks.length,
    saveReadingEntry,
  ]);

  const jumpToLocation = useCallback((target: string) => {
    const normalizedTarget = normalizeNavigationTarget(target);
    if (!normalizedTarget) {
      return;
    }

    const resolvedTarget = resolveNavigationTarget(renditionRef.current, normalizedTarget);

    setDrawerOpen(false);
    if(!useReaderStore.getState().studyPinned)closeExplanationPanel();
    setNavigationTarget(resolvedTarget);

    if (renditionRef.current) {
      window.requestAnimationFrame(() => {
        void renditionRef.current?.display(resolvedTarget);
      });
    }
  }, [closeExplanationPanel]);

  const jumpToPdfBookmark = useCallback(
    (target: string, openTools = true) => {
      const page = parsePdfPageLocation(target, document.id);
      if (page !== null) {
        setPdfOriginalPage(page);
        changePdfViewMode('original');
        setDrawerOpen(false);
        return;
      }
      const paragraphId = getPdfParagraphIdFromSelectionKey(target);
      const paragraph = pdfTextState.paragraphs.find(
        (item) => item.id === paragraphId
      );

      if (!paragraph) {
        return;
      }

      const paragraphElement = Array.from(
        containerRef.current?.querySelectorAll<HTMLButtonElement>(
          '[data-pdf-selection-key]'
        ) ?? []
      ).find((element) => element.dataset.pdfSelectionKey === target);

      setDrawerOpen(false);

      if (!paragraphElement) {
        return;
      }

      changePdfViewMode('text');
      window.requestAnimationFrame(()=>{
      paragraphElement.scrollIntoView({
        block: 'center',
        inline: 'center',
        behavior: 'auto',
      });

      window.requestAnimationFrame(() => {
        if (openTools) openPdfParagraph(paragraph, paragraphElement);
      });
      });
    },
    [openPdfParagraph, pdfTextState.paragraphs, changePdfViewMode, document.id, setPdfOriginalPage]
  );

  const jumpToPdfPage = useCallback(
    (pageNumber: number) => {
      const total = pdfTextState.pageCount ?? document.pageCount;
      if (
        !Number.isSafeInteger(pageNumber) || pageNumber < 1 ||
        (total && pageNumber > total)
      ) return false;
      if (pdfViewMode === 'original') {
        setPdfOriginalPage(pageNumber);
        setDrawerOpen(false);
        return true;
      }
      const targetPage = pdfPageGroups.find(
        (page) => page.pageNumber === pageNumber
      );

      if (!targetPage) {
        setPdfOriginalPage(pageNumber);
        changePdfViewMode('original');
        setDrawerOpen(false);
        setPdfJumpError('本页没有可提取文字，已显示书页排版。阅读位置和书签仍会保存。');
        return true;
      }

      const pageElement = containerRef.current?.querySelector<HTMLElement>(
        `[data-pdf-page-number="${pageNumber}"]`
      );

      if (!pageElement) {
        return false;
      }

      pageElement.scrollIntoView({
        block: 'start',
        inline: 'center',
        behavior: 'auto',
      });
      setDrawerOpen(false);
      return true;
    },
    [pdfPageGroups, pdfTextState.pageCount, pdfViewMode, changePdfViewMode, document.pageCount, setPdfOriginalPage]
  );

  const handlePdfPageJump = useCallback(() => {
    const pageNumber = Number(pdfPageJumpValue);

    setPdfJumpError('');
    if (!Number.isInteger(pageNumber) || pageNumber < 1) {
      setPdfJumpError('请输入有效的 PDF 页码。');
      return;
    }

    const didJump = jumpToPdfPage(pageNumber);
    if (didJump) {
      setPdfPageJumpValue('');
    } else setPdfJumpError('页码超出此 PDF 的范围。');
  }, [jumpToPdfPage, pdfPageJumpValue]);

  const handleBookmarkSelect = useCallback(
    (bookmark: UserBookmark) => {
      if (document.fileType === 'PDF') {
        jumpToPdfBookmark(bookmark.location);
        return;
      }

      jumpToLocation(bookmark.location);
    },
    [document.fileType, jumpToLocation, jumpToPdfBookmark]
  );

  const jumpReading = useCallback((target:string, openTools = true)=>{if(document.fileType==='PDF')jumpToPdfBookmark(target, openTools);else jumpToLocation(target);},[document.fileType,jumpToPdfBookmark,jumpToLocation]);
  const jumpReadingRef = useRef(jumpReading); useEffect(()=>{jumpReadingRef.current=jumpReading;},[jumpReading]);
  useEffect(()=>{
    let disposed=false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    const controller = new AbortController();
    const loadReading = async()=>{try {
      const data=await readingRequest('/api/documents/'+document.id+'/reading',{signal:controller.signal});
      if(disposed)return;
      const merged:ReadingEntry[]=[...data.items];
      for(const bookmark of readStoredBookmarks(currentUser.id,document.id)) {
        if(merged.some(item=>item.kind==='bookmark'&&item.location===bookmark.location))continue;
        const saved=await readingRequest('/api/documents/'+document.id+'/reading',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({kind:'bookmark',text:bookmark.label,location:bookmark.location})});merged.push(saved.item);
      }
      if(disposed)return;window.localStorage.removeItem(getBookmarkStorageKey(currentUser.id,document.id));setEntries(merged);setReadingReady(true);
      const target=new URLSearchParams(window.location.search).get('location')||data.progress?.location;
      if(target)pendingRestore.current=target;
      setSyncError('');
    } catch(error) {if(!disposed){setSyncError(error instanceof Error?error.message:'Could not sync reading data');retryTimer=setTimeout(()=>void loadReading(),5000);}}};
    void loadReading();
    return ()=>{disposed=true;controller.abort();clearTimeout(retryTimer);};
  },[document.id,currentUser.id]);
  useEffect(()=>{
    if(!readingReady)return;
    if(pendingRestore.current && (document.fileType==='EPUB'||pdfTextState.status==='ready'||parsePdfPageLocation(pendingRestore.current, document.id)!==null)) {
      const target=pendingRestore.current;pendingRestore.current=null;jumpReadingRef.current(target, false);
    }
  },[readingReady,document.fileType,document.id,pdfTextState.status]);
  useEffect(()=>{
    if(!readingReady)return;
    const save=()=>{
      if(pendingRestore.current)return;
      let progress=progressRef.current;
      if(document.fileType==='PDF') {
        const target=getVisiblePdfBookmarkTarget();if(!target)return;
        progress={location:target.location,percentage:pdfPageProgress(target.pageNumber ?? 1,pdfTextState.pageCount ?? document.pageCount ?? null)};
      }
      progressSync.enqueue(progress);
    };
    const onVisibilityChange = () => { if (globalThis.document.visibilityState === 'hidden') save(); };
    const timer=window.setInterval(save,3000);window.addEventListener('pagehide',save);
    globalThis.document.addEventListener('visibilitychange', onVisibilityChange);
    return ()=>{clearInterval(timer);window.removeEventListener('pagehide',save);globalThis.document.removeEventListener('visibilitychange', onVisibilityChange);save();};
  },[readingReady,document.id,document.fileType,document.pageCount,pdfTextState.pageCount,getVisiblePdfBookmarkTarget,progressSync]);
  useEffect(()=>{
    epubContentsRef.current.forEach(c=>c.document.querySelectorAll<HTMLElement>('p,li,blockquote').forEach(node=>{node.style.boxShadow=entries.some(e=>e.kind==='note'&&node.textContent?.includes(e.text))?'inset 0 -2px #007aff':'';}));
  },[entries]);
  useEffect(()=>{
    epubContentsRef.current.forEach(c=>c.addStylesheetCss('body, p, li {font-size:'+fontSize+'px !important;line-height:'+lineHeight+' !important;}','reader-typography'));
  },[fontSize,lineHeight]);


  const handleLocationChanged = useCallback((nextLocation: string) => {
    if(!useReaderStore.getState().studyPinned && currentLocationRef.current && nextLocation!==currentLocationRef.current){setToolsOpen(false);setShowDetailed(false);closeExplanationPanel();}
    if (navigationTarget) {
      if (nextLocation === currentLocationRef.current) {
        return;
      }

      setNavigationTarget(null);
    }

    currentLocationRef.current = nextLocation;
    setLocation(nextLocation);
  }, [navigationTarget, closeExplanationPanel]);

  const pdfTotal = pdfTextState.pageCount ?? document.pageCount ?? null;
  const currentPdfPage = pdfViewMode === 'original' ? pdfOriginalPage : pdfVisiblePage;
  const switchPdfLayout = (mode: 'text' | 'original', learn = false) => {
    const page = getVisiblePdfBookmarkTarget()?.pageNumber ?? currentPdfPage;
    if (mode === 'original') {
      setPdfOriginalPage(page);
      changePdfViewMode('original');
      return;
    }
    const paragraph = pdfTextState.paragraphs.find(item => item.pageNumber === page);
    if (!paragraph) {
      setPdfJumpError(pdfTextState.status === 'loading' ? '正在提取文字，请稍后再试。' : '本页没有可提取文字，查词和 AI 分析需要先做 OCR。');
      return;
    }
    changePdfViewMode('text');
    setPdfVisiblePage(page);
    window.requestAnimationFrame(() => {
      if (learn) jumpToPdfBookmark(getPdfSelectionKey(document.id, paragraph.id));
      else containerRef.current?.querySelector('[data-pdf-page-number="' + page + '"]')?.scrollIntoView({block:'start'});
    });
  };
  const turnPage = (delta: number) => {
    if(!useReaderStore.getState().studyPinned){setToolsOpen(false);setShowDetailed(false);closeExplanationPanel();}
    if (document.fileType === 'EPUB') {
      if (delta < 0) renditionRef.current?.prev();
      else renditionRef.current?.next();
    } else {
      const page = getVisiblePdfBookmarkTarget()?.pageNumber ?? currentPdfPage;
      setPdfJumpError('');
      if (jumpToPdfPage(page + delta)) setPdfVisiblePage(page + delta);
    }
  };

  return (
    <div
      ref={containerRef}
      className={`${immersive
        ? 'fixed inset-0 z-[60] flex flex-col w-full overflow-hidden'
        : 'relative flex flex-col h-screen w-full overflow-hidden'} ${theme === 'dark'
        ? 'bg-[#171717]'
        : 'bg-background'} ${themeClasses[theme]}`}
    >
      {document.fileType === 'EPUB' || document.fileType === 'PDF' ? (
        <>
          <ReaderToolbar onUtility={tab=>{setUtilityTab(tab);setUtilityOpen(true);}}
            title={document.title}
            positionLabel={document.fileType === 'PDF' ? '第 ' + currentPdfPage + ' 页 / ' + (pdfTotal ?? '…') + ' 页' : '已读 ' + Math.round(epubPercentage) + '%'}
            onPrevious={() => turnPage(-1)} onNext={() => turnPage(1)}
            onBookmark={handleAddBookmark} onContents={() => setDrawerOpen(value => !value)}
            onFullscreen={() => setImmersive(value => !value)} immersive={immersive}
            previousDisabled={document.fileType === 'PDF' && currentPdfPage <= 1}
            nextDisabled={document.fileType === 'PDF' && pdfTotal !== null && currentPdfPage >= pdfTotal}
            bookmarkDisabled={!readingReady || (document.fileType === 'PDF' && (pdfViewMode === 'original' ? pdfReadyPage !== pdfOriginalPage : !pdfTextState.paragraphs.length))}
          >
            {(document.fileType==='EPUB'||pdfViewMode==='text')&&<MeaningGroupControl enabled={meaningGroupReading} onChange={setMeaningGroupReading} status={meaningGroups} unsupported={meaningGroups.unsupported} skipped={meaningGroups.skipped} onRetry={meaningGroups.retry}/>}
            {document.fileType === 'PDF' && <>
              <label className="flex items-center gap-2 text-sm">排版
                <select aria-label="阅读排版" value={pdfViewMode} onChange={event => switchPdfLayout(event.target.value as 'text' | 'original')} className="rounded-lg border border-border bg-transparent px-3 py-2">
                  <option value="text">随屏排版</option><option value="original">书页排版</option>
                </select>
              </label>
              <form className="flex items-center gap-2" onSubmit={event => {event.preventDefault();handlePdfPageJump();}}>
                <input aria-label="跳转页码" type="number" min="1" max={pdfTotal ?? undefined} value={pdfPageJumpValue} onChange={event => setPdfPageJumpValue(event.target.value)} placeholder="页码" className="w-20 rounded-lg border border-border bg-transparent px-2 py-2 text-sm"/>
                <button type="submit" className="rounded-lg border border-border px-3 py-2 text-sm">跳转</button>
              </form>
              {pdfViewMode === 'original' && <button type="button" className="rounded-lg border border-border px-3 py-2 text-sm" onClick={() => switchPdfLayout('text', true)}>学习本页</button>}
              <a href={'/api/documents/' + document.id + '/raw#page=' + currentPdfPage} target="_blank" rel="noreferrer" className="px-2 text-sm underline">打开原文件</a>
            </>}
          </ReaderToolbar>

          {drawerOpen ? (
            <>
              <button
                type="button"
                aria-label="Close bookmarks"
                className="absolute inset-0 z-[25] bg-transparent"
                onClick={() => setDrawerOpen(false)}
              />
              <div className="absolute inset-y-4 left-4 z-30 w-[320px] overflow-hidden rounded-[28px] border border-border bg-card text-foreground shadow-xl backdrop-blur-xl   ">
              <div className="flex items-center justify-between border-b border-border px-4 py-4 ">
                <div>
                  <p className="text-sm font-bold text-foreground "> Bookmarks</p>
                  <p className="text-xs text-foreground ">
                    {document.fileType === 'EPUB'
                      ? 'Built-in contents and your saved positions'
                      : 'Saved positions in this PDF'}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={!readingReady || (document.fileType === 'PDF' && pdfViewMode === 'original' && pdfReadyPage !== pdfOriginalPage)}
                  onClick={handleAddBookmark}
                  className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-muted    "
                >
                  <BookmarkPlus className="h-3.5 w-3.5" />
                  Add
                </button>
              </div>

              <div className="h-full overflow-y-auto px-4 pb-5">
                {document.fileType === 'EPUB' ? (
                  <div className="pt-4">
                    <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-foreground ">
                      <BookOpenText className="h-3.5 w-3.5" />
                      Book Contents
                    </div>
                    <div className="space-y-1">
                      {tocItems.length > 0 ? (
                        tocItems.map((item) => (
                          <TocTree
                            key={item.href}
                            item={item}
                            depth={0}
                            onSelect={jumpToLocation}
                          />
                        ))
                      ) : (
                        <p className="rounded-2xl border border-dashed border-border px-3 py-4 text-sm text-foreground  ">
                          This file did not expose a clickable table of contents.
                        </p>
                      )}
                    </div>
                  </div>
                ) : null}

                <div className="pb-24 pt-6">
                  <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-foreground ">
                    <BookmarkPlus className="h-3.5 w-3.5" />
                    Your Bookmarks
                  </div>
                  <div className="space-y-2">
                    {userBookmarks.length > 0 ? (
                      userBookmarks.map((bookmark) => (
                        <button
                          key={bookmark.id}
                          type="button"
                          onClick={() => handleBookmarkSelect(bookmark)}
                          className="block w-full rounded-2xl border border-border bg-card px-3 py-3 text-left transition-colors hover:bg-muted   "
                        >
                          <p className="text-sm font-medium">{bookmark.label}</p>
                          <p className="mt-1 text-xs text-foreground ">
                            {new Date(bookmark.createdAt).toLocaleString()}
                          </p>
                        </button>
                      ))
                    ) : document.fileType === 'PDF' ? (
                      <div className="rounded-2xl border border-dashed border-border px-3 py-4 ">
                        <p className="text-sm text-foreground ">
                          No local bookmarks yet.
                        </p>
                        <div className="mt-4 flex gap-2">
                          <input
                            value={pdfPageJumpValue}
                            onChange={(event) =>
                              setPdfPageJumpValue(event.target.value)
                            }
                            onKeyDown={(event) => {
                              if (event.key === 'Enter') {
                                handlePdfPageJump();
                              }
                            }}
                            inputMode="numeric"
                            pattern="[0-9]*"
                            placeholder={
                              pdfTextState.pageCount
                                ? `Page 1-${pdfTextState.pageCount}`
                                : 'Page number'
                            }
                            className="min-w-0 flex-1 rounded-xl border border-border bg-card px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-foreground focus:border-primary    dark:placeholder:text-muted-foreground"
                          />
                          <button
                            type="button"
                            onClick={handlePdfPageJump}
                            className="rounded-xl border border-border bg-card px-3 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-muted    "
                          >
                            Go
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="rounded-2xl border border-dashed border-border px-3 py-4 text-sm text-foreground  ">
                        还没有书签。
                      </p>
                    )}
                  </div>
                </div>
              </div>
              </div>
            </>
          ) : null}
        </>
      ) : null}

      {syncError&&<div role="alert" className="absolute bottom-20 left-4 z-20 max-w-sm rounded-xl bg-red-50 p-3 text-sm text-red-800">阅读同步失败：{syncError}。稍后将自动重试。</div>}

      <style>{'::highlight(reader-hover-word){background-color:#c7dfff;color:#12243b;}'}</style>
      <ReaderUtilities open={utilityOpen} onClose={()=>setUtilityOpen(false)}><ReadingTools initialTab={utilityTab} documentId={document.id} selection={toolSelection} open={utilityOpen} embedded onOpen={()=>{setShowDetailed(false);setToolsOpen(true);}} onClose={()=>setUtilityOpen(false)} entries={entries} onSave={saveReadingEntry}
        onDelete={async id=>{await readingRequest('/api/documents/'+document.id+'/reading?entryId='+encodeURIComponent(id),{method:'DELETE'});setEntries(items=>items.filter(item=>item.id!==id));}}
        onJump={jumpReading} onDetailed={()=>{if(toolSelection)setSelectedParagraph({key:toolSelection.location,text:toolSelection.text,preferredPanelSide:'right',anchorY:100,paragraphBounds:{left:24,top:80,right:320,bottom:160}});setToolsOpen(false);setShowDetailed(true);}} onRestoreSelection={setToolSelection}
        onQuote={quote=>{const content=epubContentsRef.current.find(c=>c.document.body.textContent?.includes(quote));if(content){const node=Array.from(content.document.querySelectorAll('p,li')).find(e=>e.textContent?.includes(quote));node?.scrollIntoView({block:'center'});if(node) {(node as HTMLElement).style.backgroundColor='rgba(0,122,255,.15)';}}else{const paragraph=pdfTextState.paragraphs.find(p=>p.text.includes(quote));if(paragraph)jumpToPdfBookmark(getPdfSelectionKey(document.id,paragraph.id));}}}/></ReaderUtilities>
      <StudyDock kind={showDetailed?'paragraph':'word'} anchorHandle={toolSelection?.anchorHandle} onReturnToSource={()=>toolSelection&&jumpReading(toolSelection.location)} anchor={toolSelection?.anchor} open={toolsOpen || Boolean(selectedParagraph && showDetailed)} side={(showDetailed?selectedParagraph?.preferredPanelSide:toolSelection?.side)||'right'} title={showDetailed?'段落结构与语法':'语境查词 · 阅读工具'} onClose={()=>{setToolsOpen(false);setShowDetailed(false);closeExplanationPanel();}} panel={selectedParagraph && showDetailed ? (
<ExplanationPanel
                documentId={document.id}
                text={selectedParagraph.text.slice(0,20000)}
                selectionKey={selectedParagraph.key}
                previousText={toolSelection?.previousText}
                nextText={toolSelection?.nextText}
                onClose={closeExplanationPanel}
                onActiveSentenceChange={handleActiveSentenceChange}
                onFocusTargetChange={handleFocusTargetChange}
                onExplanationReady={handleExplanationReady}
              />
      ) : (
<WordLookupContent documentId={document.id} selection={toolSelection} entries={entries} onSave={saveReadingEntry}/>
      )}>
      <div className="relative h-full min-h-0">
        {document.fileType === 'EPUB' ? (
          <ReactReader
            url={`/api/documents/${document.id}/raw`}
            title={document.title}
            showToc={false}
            location={navigationTarget ?? location}
            locationChanged={handleLocationChanged}
            tocChanged={(toc) => setTocItems(toc as TocItem[])}
            getRendition={getRendition}
            readerStyles={getReaderTheme(theme)}
            epubInitOptions={{ openAs: 'epub' }}
          />
        ) : (
          <div className="relative flex h-full min-h-0 flex-col">
            <div className="shrink-0 border-b px-4 py-2 text-xs opacity-80">
              <p>{pdfViewMode === 'original' ? '保留图片与书页排版，自动保存页码。点击“学习本页”可查词和分析已提取的文字。' : '文字随屏幕排版，可选词学习；图片和表格请切换“书页排版”。'}</p>
              {pdfViewMode === 'text' && pdfPagesWithoutText > 0 && <p>{pdfPagesWithoutText} 页没有可提取文字，可在书页排版查看；文字学习需先做 OCR。</p>}
              {pdfJumpError && <p role="status" className="mt-1">{pdfJumpError}</p>}
            </div>
            {pdfViewMode === 'original' && (
              <PdfOriginalView
                documentId={document.id}
                title={document.title}
                page={pdfOriginalPage}
                onPageReady={page => {
                  if (pdfOriginalPageRef.current !== page) return;
                  pdfReadyPageRef.current = page;
                  setPdfReadyPage(page);
                  if (readingReady && !pendingRestore.current) progressSync.enqueue({location:formatPdfPageLocation(document.id, page),percentage:pdfPageProgress(page, pdfTotal)});
                }}
              />
            )}
            <div data-pdf-text-scroll className={pdfViewMode === 'text' ? 'min-h-0 flex-1 overflow-y-auto' : 'hidden'} onScroll={() => {const page = getVisiblePdfBookmarkTarget()?.pageNumber;if(page) setPdfVisiblePage(page);}}>
            <div className="mx-auto w-full px-4 py-6 font-sans sm:px-6 sm:py-8"
              style={{ maxWidth: 'min(72ch, 800px)', fontSize, lineHeight }}>
              <h1 className="mb-6 break-words text-xl font-bold leading-snug sm:text-2xl">
                {document.title}
              </h1>

              {pdfTextState.status === 'loading' ? (
                <div className="py-24 text-center text-sm text-muted-foreground">
                  Extracting PDF text for analysis...
                </div>
              ) : pdfTextState.status === 'error' ? (
                <div className="py-24 text-center">
                  <p className="text-sm font-medium text-foreground">
                    PDF text could not be extracted.
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    {pdfTextState.message}
                  </p>
                </div>
              ) : pdfTextState.paragraphs.length === 0 ? (
                <div className="py-24 text-center">
                  <p className="text-sm font-medium text-foreground">
                    No readable PDF text was found.
                  </p>
                  <p className="mt-2 text-sm text-muted-foreground">
                    此 PDF 可能是扫描件，需要 OCR 后才能逐段学习。请切换「书页排版」查看图片页面。
                  </p>
                </div>
              ) : (
                <div className="space-y-4 pb-20">
                  {pdfPageSpreads.map((spread, spreadIndex) => (
                    <section
                      key={`pdf-spread-${spreadIndex}`}
                      className="grid grid-cols-1 gap-7"
                    >
                      {spread.map((page) => (
                        <article
                          key={`pdf-page-${page.pageNumber ?? spreadIndex}`}
                          data-pdf-page-number={page.pageNumber ?? undefined}
                          className={cn(
                            'min-w-0',
                          )}
                        >
                          {page.pageNumber ? (
                            <div
                              className={cn(
                                'mb-3 border-t border-current/10 pt-2 text-[11px] font-medium tracking-wide',
                                pdfReaderPageMetaClasses[theme]
                              )}
                            >
                              原 PDF 第 {page.pageNumber} 页
                            </div>
                          ) : null}

                          {page.paragraphs.map((paragraph) => {
                            const selectionKey = getPdfSelectionKey(
                              document.id,
                              paragraph.id
                            );
                            const isActive =
                              selectedParagraph?.key === selectionKey;
                            const explanation = isActive
                              ? pdfExplanations[selectionKey]
                              : null;

                            return (
                              <div key={paragraph.id} className="group relative">
                              <button type="button" aria-label="分析本段结构与语法" title="分析本段结构与语法" className="float-right ml-2 rounded border border-border bg-card px-2 py-0.5 text-xs text-foreground hover:bg-muted" onClick={event=>openPdfParagraph(paragraph,event.currentTarget.parentElement!)}>段落分析</button>
                              <button
                                type="button"
                                data-pdf-selection-key={selectionKey}
                                style={{fontSize, lineHeight}}
                                onMouseMove={event=>highlightWord(event.currentTarget.ownerDocument,wordAtPoint(event.currentTarget.ownerDocument,event.clientX,event.clientY,event.currentTarget)?.range)}
                                onMouseLeave={event=>highlightWord(event.currentTarget.ownerDocument)}
                                onClick={(event) =>
                                  handlePdfParagraphClick(paragraph, event)
                                }
                                className={cn(
                                  'mb-[1em] block w-full break-words rounded-md px-0.5 py-0.5 text-left font-sans text-inherit transition-colors focus-visible:outline-none focus-visible:ring-2',
                                  'whitespace-pre-line',
                                  entries.some(e=>e.kind==='note'&&e.location===selectionKey)?'underline decoration-orange-400 decoration-2 underline-offset-4':'',
                                  pdfReaderParagraphClasses[theme],
                                  isActive
                                    ? pdfReaderActiveParagraphClasses[theme]
                                    : 'bg-transparent'
                                )}
                              >
                                <span>
                                  {renderPdfAnnotatedText(
                                    paragraph.text,
                                    explanation,
                                    paragraph.analysisText,
                                    isActive ? activeSentenceIndex : null,
                                    isActive ? activeFocusTarget : null
                                  )}
                                </span>
                              </button>
                              </div>
                            );
                          })}
                        </article>
                      ))}
                    </section>
                  ))}
                </div>
              )}
            </div>
            </div>
          </div>
        )}
      </div>

      </StudyDock>
    </div>
  );
}

function TocTree({
  item,
  depth,
  onSelect,
}: {
  item: TocItem;
  depth: number;
  onSelect: (href: string) => void;
}) {
  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={() => onSelect(item.href)}
        className="block w-full rounded-xl px-3 py-2 text-left text-sm transition-colors hover:bg-muted "
        style={{ paddingLeft: `${12 + depth * 16}px` }}
      >
        {item.label}
      </button>
      {item.subitems?.map((subitem) => (
        <TocTree
          key={subitem.href}
          item={subitem}
          depth={depth + 1}
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
