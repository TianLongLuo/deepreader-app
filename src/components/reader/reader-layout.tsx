'use client';

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
import { BookOpenText, BookmarkPlus, Maximize2, Menu, Minimize2 } from 'lucide-react';
import { useReaderStore } from '@/hooks/use-reader-store';
import { cn } from '@/lib/utils';
import ExplanationPanel from './explanation-panel';
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

type ActiveFocusTarget =
  | { type: 'sentence'; sentenceIndex: number }
  | { type: 'clause'; sentenceIndex: number; text: string }
  | {
      type: 'reference';
      sentenceIndex: number;
      expression: string;
      refersTo: string;
    };

type ReaderDocument = {
  id: string;
  title: string;
  fileType: string;
};

type EpubContents = {
  document: Document;
  window: Window;
  addStylesheetCss: (serializedCss: string, key: string) => void;
  cfiFromRange: (range: Range) => string;
};

type RenditionLike = {
  book?: {
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
    background: rgba(251, 146, 60, 0.16) !important;
    box-shadow: inset 0 0 0 1px rgba(234, 88, 12, 0.24);
  }

  [data-reader-interactive='true'][data-reader-active='true'] {
    background: rgba(251, 146, 60, 0.18) !important;
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
  light: 'bg-[#fff7ed] text-orange-950',
  dark: 'bg-[#1c120d] text-orange-50',
  sepia: 'bg-[#fff3df] text-orange-950',
};

const pdfReaderLinkClasses: Record<ReaderTheme, string> = {
  light: 'border-orange-200 bg-white/80 text-orange-900 hover:bg-orange-100',
  dark: 'border-orange-300/15 bg-[#1c120d]/85 text-orange-50 hover:bg-orange-300/10',
  sepia: 'border-orange-200 bg-orange-50/80 text-[#433422] hover:bg-orange-100',
};

const pdfReaderPageClasses: Record<ReaderTheme, string> = {
  light: 'border-orange-200 bg-white/75 shadow-[0_18px_55px_rgba(251,146,60,0.20)]',
  dark: 'border-orange-300/15 bg-orange-50/[0.045] shadow-[0_18px_55px_rgba(0,0,0,0.24)]',
  sepia: 'border-orange-200 bg-white/45 shadow-[0_18px_55px_rgba(251,146,60,0.16)]',
};

const pdfReaderPageMetaClasses: Record<ReaderTheme, string> = {
  light: 'text-orange-900/45',
  dark: 'text-orange-100/45',
  sepia: 'text-[#433422]/50',
};

const pdfReaderParagraphClasses: Record<ReaderTheme, string> = {
  light: 'hover:bg-orange-200/35 focus-visible:ring-orange-400/60',
  dark: 'hover:bg-orange-300/10 focus-visible:ring-orange-300/60',
  sepia: 'hover:bg-orange-200/35 focus-visible:ring-orange-400/50',
};

const pdfReaderActiveParagraphClasses: Record<ReaderTheme, string> = {
  light: 'bg-orange-200/45 ring-1 ring-orange-400/40',
  dark: 'bg-orange-300/12 ring-1 ring-orange-300/35',
  sepia: 'bg-orange-200/45 ring-1 ring-orange-400/35',
};

function buildThemeDefinition(theme: ReaderTheme) {
  switch (theme) {
    case 'dark':
      return {
        ...globalEpubCssOverrides,
        body: { background: '#1c120d !important', color: '#fff7ed !important' },
      };
    case 'sepia':
      return {
        ...globalEpubCssOverrides,
        body: { background: '#fff3df !important', color: '#431407 !important' },
      };
    default:
      return {
        ...globalEpubCssOverrides,
        body: { background: '#fffaf3 !important', color: '#431407 !important' },
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
          backgroundColor: '#1c120d',
        },
      };
    case 'sepia':
      return {
        ...ReactReaderStyle,
        readerArea: {
          ...ReactReaderStyle.readerArea,
          backgroundColor: '#fff3df',
        },
      };
    default:
      return {
        ...ReactReaderStyle,
        readerArea: {
          ...ReactReaderStyle.readerArea,
          backgroundColor: '#fffaf3',
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
              className="rounded bg-orange-300/20 text-inherit"
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
    explanationPanelWidth,
    explanationPanelHeight,
    setExplanationPanelSize,
  } = useReaderStore();

  const [location, setLocation] = useState<string | number>(0);
  const [selectedParagraph, setSelectedParagraph] = useState<{
    key: string;
    text: string;
    preferredPanelSide: PanelSide;
    anchorY: number;
    paragraphBounds: ParagraphBounds;
  } | null>(null);
  const [panelFrame, setPanelFrame] = useState<PanelFrame>({
    width: explanationPanelWidth || PANEL_DEFAULT_FRAME.width,
    height: explanationPanelHeight || PANEL_DEFAULT_FRAME.height,
  });
  const [viewportFrame, setViewportFrame] = useState({
    width: 1280,
    height: 900,
  });
  const [navigationTarget, setNavigationTarget] = useState<string | number | null>(null);
  const [resizeState, setResizeState] = useState<ResizeState | null>(null);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [manualPanelPosition, setManualPanelPosition] = useState<{
    left: number;
    top: number;
  } | null>(null);
  const [tocItems, setTocItems] = useState<TocItem[]>([]);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [immersive, setImmersive] = useState(false);
  const [pdfPageJumpValue, setPdfPageJumpValue] = useState('');
  const [userBookmarks, setUserBookmarks] = useState<UserBookmark[]>(() =>
    readStoredBookmarks(currentUser.id, document.id)
  );
  const [pdfTextState, setPdfTextState] = useState<PdfTextState>({
    status: document.fileType === 'PDF' ? 'loading' : 'idle',
    paragraphs: [],
    pageCount: null,
  });
  const [pdfExplanations, setPdfExplanations] = useState<
    Record<string, ParagraphExplanationOutput>
  >({});
  const [activeSentenceIndex, setActiveSentenceIndex] = useState<number | null>(null);
  const [activeFocusTarget, setActiveFocusTarget] =
    useState<ActiveFocusTarget | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
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

  const clampedPanelFrame = clampPanelFrame(panelFrame, viewportFrame);
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
      setManualPanelPosition(null);
      activeExplanationRef.current = null;
      activeSentenceIndexRef.current = null;
      activeFocusTargetRef.current = null;
      setActiveSentenceIndex(null);
      setActiveFocusTarget(null);
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

      setManualPanelPosition(null);
      activeExplanationRef.current = null;
      activeSentenceIndexRef.current = null;
      activeFocusTargetRef.current = null;
      setActiveSentenceIndex(null);
      setActiveFocusTarget(null);
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
    [clearUnderlineAnnotations, document.id, viewportFrame.width]
  );

  const handlePdfParagraphClick = useCallback(
    (
      paragraph: PdfTextParagraph,
      event: ReactMouseEvent<HTMLButtonElement>
    ) => {
      openPdfParagraph(paragraph, event.currentTarget);
    },
    [openPdfParagraph]
  );

  const getVisiblePdfBookmarkTarget = useCallback(() => {
    if (document.fileType !== 'PDF') {
      return null;
    }

    if (selectedParagraph?.key.startsWith(`pdf:${document.id}:`)) {
      const paragraphId = getPdfParagraphIdFromSelectionKey(selectedParagraph.key);
      const paragraph = pdfTextState.paragraphs.find(
        (item) => item.id === paragraphId
      );

      if (paragraph) {
        return {
          location: selectedParagraph.key,
          label: selectedParagraph.text.slice(0, 48),
        };
      }
    }

    const container = containerRef.current;
    if (!container) {
      return null;
    }

    const containerRect = container.getBoundingClientRect();
    const paragraphButtons = Array.from(
      container.querySelectorAll<HTMLButtonElement>('[data-pdf-selection-key]')
    );
    const bestMatch = paragraphButtons.reduce<{
      element: HTMLButtonElement;
      distance: number;
    } | null>((best, element) => {
      const rect = element.getBoundingClientRect();
      const distance = Math.abs(rect.top - containerRect.top - 96);

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
    };
  }, [document.fileType, document.id, pdfTextState.paragraphs, selectedParagraph]);

  const installInteractiveParagraphs = useCallback((contents: EpubContents) => {
    contents.addStylesheetCss(
      INTERACTIVE_PARAGRAPH_CSS,
      'reader-paragraph-interaction'
    );

    const nodes = Array.from(
      contents.document.querySelectorAll(INTERACTIVE_PARAGRAPH_SELECTOR)
    ) as HTMLElement[];

    nodes.forEach((element) => {
      const mapping = buildNormalizedTextMap(element);
      if (!mapping || mapping.text.length < MIN_INTERACTIVE_PARAGRAPH_LENGTH) {
        return;
      }

      if (element.dataset.readerInteractive === 'true') {
        return;
      }

      element.dataset.readerInteractive = 'true';
      setParagraphState(element, { hovered: false, active: false });

      element.addEventListener('mouseenter', () => {
        if (activeElementRef.current === element) {
          setParagraphState(element, { hovered: false, active: true });
          return;
        }

        setParagraphState(element, { hovered: true, active: false });
      });

      element.addEventListener('mouseleave', () => {
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

        event.preventDefault();
        event.stopPropagation();
        handleParagraphClick(element, contents);
      });
    });
  }, [handleParagraphClick]);

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

    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [immersive]);

  useEffect(() => {
    if (document.fileType !== 'PDF') {
      return;
    }

    const controller = new AbortController();
    setSelectedParagraph(null);
    setPdfExplanations({});
    setPdfTextState({
      status: 'loading',
      paragraphs: [],
      pageCount: null,
    });

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
        setPdfTextState({
          status: 'ready',
          paragraphs: payload.paragraphs ?? [],
          pageCount: payload.pageCount ?? null,
        });
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
  }, [document.fileType, document.id]);

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

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(
      getBookmarkStorageKey(currentUser.id, document.id),
      JSON.stringify(userBookmarks)
    );
  }, [currentUser.id, document.id, userBookmarks]);

  useEffect(() => {
    if (!resizeState) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerId !== resizeState.pointerId) {
        return;
      }

      const deltaX = event.clientX - resizeState.startX;
      const deltaY = event.clientY - resizeState.startY;
      const nextWidth =
        resizeState.side === 'right'
          ? resizeState.startWidth - deltaX
          : resizeState.startWidth + deltaX;
      const nextHeight = resizeState.startHeight + deltaY;

      setPanelFrame(
        clampPanelFrame(
          { width: nextWidth, height: nextHeight },
          viewportFrame
        )
      );
    };

    const finishResize = (event: PointerEvent) => {
      if (event.pointerId !== resizeState.pointerId) {
        return;
      }

      setExplanationPanelSize(clampedPanelFrame);
      setResizeState(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', finishResize);
    window.addEventListener('pointercancel', finishResize);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', finishResize);
      window.removeEventListener('pointercancel', finishResize);
    };
  }, [
    clampedPanelFrame,
    resizeState,
    setExplanationPanelSize,
    viewportFrame,
  ]);

  useEffect(() => {
    if (!dragState) {
      return;
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerId !== dragState.pointerId) {
        return;
      }

      const nextPosition = clampPanelPosition(
        {
          left: dragState.startLeft + event.clientX - dragState.startX,
          top: dragState.startTop + event.clientY - dragState.startY,
        },
        clampedPanelFrame,
        viewportFrame
      );

      setManualPanelPosition(nextPosition);
    };

    const finishDrag = (event: PointerEvent) => {
      if (event.pointerId !== dragState.pointerId) {
        return;
      }

      setDragState(null);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', finishDrag);
    window.addEventListener('pointercancel', finishDrag);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', finishDrag);
      window.removeEventListener('pointercancel', finishDrag);
    };
  }, [clampedPanelFrame, dragState, viewportFrame]);

  const panelTop = selectedParagraph
    ? Math.min(
        Math.max(
          selectedParagraph.anchorY,
          PANEL_EDGE_MARGIN + clampedPanelFrame.height / 2
        ),
        viewportFrame.height -
          PANEL_EDGE_MARGIN -
          clampedPanelFrame.height / 2
      )
    : viewportFrame.height / 2;

  const resolvedPanelPlacement: {
    side: PanelSide;
    rect: ParagraphBounds;
    frame: PanelFrame;
  } = (() => {
    if (!selectedParagraph) {
      const fallbackParagraphBounds = {
        left: viewportFrame.width / 2 - 120,
        top: viewportFrame.height / 2 - 40,
        right: viewportFrame.width / 2 + 120,
        bottom: viewportFrame.height / 2 + 40,
      };
      const fallbackFrame = clampedPanelFrame;
      return {
        side: 'right',
        rect: getPanelRect(
          'right',
          panelTop,
          fallbackFrame,
          viewportFrame,
          fallbackParagraphBounds
        ),
        frame: fallbackFrame,
      };
    }

    if (manualPanelPosition) {
      const manualRect = clampPanelPosition(
        manualPanelPosition,
        clampedPanelFrame,
        viewportFrame
      );

      return {
        side:
          manualRect.left >= selectedParagraph.paragraphBounds.right
            ? 'right'
            : 'left',
        rect: {
          left: manualRect.left,
          top: manualRect.top,
          right: manualRect.left + clampedPanelFrame.width,
          bottom: manualRect.top + clampedPanelFrame.height,
        },
        frame: clampedPanelFrame,
      };
    }

    const preferred = selectedParagraph.preferredPanelSide;
    const candidateSides: PanelSide[] =
      preferred === 'right' ? ['right', 'left'] : ['left', 'right'];
    const candidates = candidateSides.map((side, sideIndex) => {
      const availableWidth = getAvailableWidthForSide(
        side,
        selectedParagraph.paragraphBounds,
        viewportFrame
      );
      const maxWidth = viewportFrame.width - PANEL_EDGE_MARGIN * 2;
      const frame = {
        width:
          availableWidth > 0
            ? Math.min(clampedPanelFrame.width, availableWidth, maxWidth)
            : Math.min(clampedPanelFrame.width, maxWidth),
        height: clampedPanelFrame.height,
      };
      const shortage = Math.max(0, clampedPanelFrame.width - availableWidth);
      const rect = getPanelRect(
        side,
        panelTop,
        frame,
        viewportFrame,
        selectedParagraph.paragraphBounds
      );
      const overlap = getIntersectionArea(rect, selectedParagraph.paragraphBounds);

      return {
        side,
        rect,
        frame,
        overlap,
        shortage,
        preferredPenalty: sideIndex,
      } satisfies PlacementCandidate;
    });

    const bestPlacement = candidates.reduce<PlacementCandidate | null>(
      (best, candidate) => {
        if (!best) {
          return candidate;
        }

        if (candidate.overlap < best.overlap) {
          return candidate;
        }

        if (
          candidate.overlap === best.overlap &&
          candidate.shortage < best.shortage
        ) {
          return candidate;
        }

        if (
          candidate.overlap === best.overlap &&
          candidate.shortage === best.shortage &&
          candidate.preferredPenalty < best.preferredPenalty
        ) {
          return candidate;
        }

        return best;
      },
      null
    );

    if (bestPlacement) {
      return {
        side: bestPlacement.side,
        rect: bestPlacement.rect,
        frame: bestPlacement.frame,
      };
    }

    return {
      side: preferred,
      rect: getPanelRect(
        preferred,
        panelTop,
        clampedPanelFrame,
        viewportFrame,
        selectedParagraph.paragraphBounds
      ),
      frame: clampedPanelFrame,
    };
  })();

  const resolvedPanelSide = resolvedPanelPlacement.side;
  const resolvedPanelRect = resolvedPanelPlacement.rect;
  const resolvedPanelFrame = resolvedPanelPlacement.frame;

  const handleResizeStart = useCallback(
    (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (!selectedParagraph) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      setResizeState({
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startWidth: resolvedPanelFrame.width,
        startHeight: resolvedPanelFrame.height,
        side: resolvedPanelSide,
      });
    },
    [
      resolvedPanelFrame.height,
      resolvedPanelFrame.width,
      resolvedPanelSide,
      selectedParagraph,
    ]
  );

  const handlePanelDragStart = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (!selectedParagraph) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      setDragState({
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startLeft: resolvedPanelRect.left,
        startTop: resolvedPanelRect.top,
      });
    },
    [resolvedPanelRect.left, resolvedPanelRect.top, selectedParagraph]
  );

  const getRendition = (rendition: RenditionLike) => {
    renditionRef.current = rendition;
    registerThemes(rendition);

    if (!hooksRegisteredRef.current) {
      rendition.hooks.content.register((contents: EpubContents) => {
        installInteractiveParagraphs(contents);
        installWheelNavigation(contents);
      });
      hooksRegisteredRef.current = true;
    }
  };

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

    const label = window.prompt('Bookmark name', suggestedLabel)?.trim();

    if (!label) {
      return;
    }

    setUserBookmarks((current) => [
      {
        id: crypto.randomUUID(),
        label,
        location: bookmarkLocation,
        createdAt: new Date().toISOString(),
      },
      ...current.filter((bookmark) => bookmark.location !== bookmarkLocation),
    ]);
  }, [
    document.fileType,
    getVisiblePdfBookmarkTarget,
    location,
    selectedParagraph?.text,
    tocItems,
    userBookmarks.length,
  ]);

  const jumpToLocation = useCallback((target: string) => {
    const normalizedTarget = normalizeNavigationTarget(target);
    if (!normalizedTarget) {
      return;
    }

    const resolvedTarget = resolveNavigationTarget(renditionRef.current, normalizedTarget);

    setDrawerOpen(false);
    closeExplanationPanel();
    setNavigationTarget(resolvedTarget);

    if (renditionRef.current) {
      window.requestAnimationFrame(() => {
        void renditionRef.current?.display(resolvedTarget);
      });
    }
  }, [closeExplanationPanel]);

  const jumpToPdfBookmark = useCallback(
    (target: string) => {
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

      paragraphElement.scrollIntoView({
        block: 'center',
        inline: 'center',
        behavior: 'auto',
      });

      window.requestAnimationFrame(() => {
        openPdfParagraph(paragraph, paragraphElement);
      });
    },
    [openPdfParagraph, pdfTextState.paragraphs]
  );

  const jumpToPdfPage = useCallback(
    (pageNumber: number) => {
      const targetPage = pdfPageGroups.find(
        (page) => page.pageNumber === pageNumber
      );

      if (!targetPage) {
        return false;
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
    [pdfPageGroups]
  );

  const handlePdfPageJump = useCallback(() => {
    const pageNumber = Number.parseInt(pdfPageJumpValue, 10);

    if (!Number.isFinite(pageNumber)) {
      return;
    }

    const didJump = jumpToPdfPage(pageNumber);
    if (didJump) {
      setPdfPageJumpValue('');
    }
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

  const handleLocationChanged = useCallback((nextLocation: string) => {
    if (navigationTarget) {
      if (nextLocation === currentLocationRef.current) {
        return;
      }

      setNavigationTarget(null);
    }

    currentLocationRef.current = nextLocation;
    setLocation(nextLocation);
  }, [navigationTarget]);

  return (
    <div
      ref={containerRef}
      className={`${immersive
        ? 'fixed inset-0 z-[60] flex w-full overflow-hidden'
        : 'relative flex h-screen w-full overflow-hidden'} ${theme === 'dark'
        ? 'bg-[radial-gradient(circle_at_12%_10%,rgba(251,191,36,0.12),transparent_30%),radial-gradient(circle_at_92%_18%,rgba(251,146,60,0.10),transparent_28%),#1c120d]'
        : 'bg-[radial-gradient(circle_at_12%_10%,rgba(251,191,36,0.28),transparent_30%),radial-gradient(circle_at_92%_18%,rgba(251,146,60,0.22),transparent_28%),linear-gradient(135deg,#fff7ed_0%,#fffbeb_55%,#fff1e6_100%)]'} ${themeClasses[theme]}`}
    >
      {document.fileType === 'EPUB' || document.fileType === 'PDF' ? (
        <>
          {!immersive && (
            <button
              type="button"
              className="absolute left-5 top-5 z-30 rounded-2xl border border-orange-200 bg-white/75 p-2 text-orange-900 shadow-lg shadow-orange-200/40 backdrop-blur-md dark:border-orange-300/15 dark:bg-[#1c120d]/75 dark:text-orange-100 dark:shadow-none"
              onClick={() => setDrawerOpen((current) => !current)}
              aria-label="Toggle contents and bookmarks"
            >
              <Menu className="h-5 w-5" />
            </button>
          )}

          <button
            type="button"
            className="absolute right-5 top-5 z-30 rounded-2xl border border-orange-200 bg-white/75 p-2 text-orange-900 shadow-lg shadow-orange-200/40 backdrop-blur-md transition-colors hover:bg-orange-100 dark:border-orange-300/15 dark:bg-[#1c120d]/75 dark:text-orange-100 dark:shadow-none dark:hover:bg-orange-300/10"
            onClick={() => setImmersive((current) => !current)}
            aria-label={immersive ? 'Exit fullscreen' : 'Enter fullscreen'}
            title={immersive ? 'Exit fullscreen (Esc)' : 'Enter fullscreen'}
          >
            {immersive ? <Minimize2 className="h-5 w-5" /> : <Maximize2 className="h-5 w-5" />}
          </button>

          {!immersive && drawerOpen ? (
            <>
              <button
                type="button"
                aria-label="Close bookmarks"
                className="absolute inset-0 z-[25] bg-transparent"
                onClick={() => setDrawerOpen(false)}
              />
              <div className="absolute inset-y-4 left-4 z-30 w-[320px] overflow-hidden rounded-[28px] border border-orange-200 bg-white/90 text-orange-950 shadow-[0_24px_80px_rgba(251,146,60,0.28)] backdrop-blur-xl dark:border-orange-300/20 dark:bg-[#1a1008]/95 dark:text-orange-50">
              <div className="flex items-center justify-between border-b border-orange-200/70 px-4 py-4 dark:border-orange-300/15">
                <div>
                  <p className="text-sm font-bold text-orange-950 dark:text-orange-200">🐾 Bookmarks</p>
                  <p className="text-xs text-orange-900/55 dark:text-orange-100/55">
                    {document.fileType === 'EPUB'
                      ? 'Built-in contents and your saved positions'
                      : 'Saved positions in this PDF'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleAddBookmark}
                  className="inline-flex items-center gap-2 rounded-full border border-orange-200 bg-orange-50 px-3 py-1.5 text-xs font-semibold text-orange-800 transition-colors hover:bg-orange-100 dark:border-orange-300/15 dark:bg-orange-300/5 dark:text-orange-200 dark:hover:bg-orange-300/10"
                >
                  <BookmarkPlus className="h-3.5 w-3.5" />
                  Add
                </button>
              </div>

              <div className="h-full overflow-y-auto px-4 pb-5">
                {document.fileType === 'EPUB' ? (
                  <div className="pt-4">
                    <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-orange-900/55 dark:text-orange-100/55">
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
                        <p className="rounded-2xl border border-dashed border-orange-200 px-3 py-4 text-sm text-orange-900/55 dark:border-orange-300/15 dark:text-orange-100/55">
                          This file did not expose a clickable table of contents.
                        </p>
                      )}
                    </div>
                  </div>
                ) : null}

                <div className="pb-24 pt-6">
                  <div className="mb-3 flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-orange-900/55 dark:text-orange-100/55">
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
                          className="block w-full rounded-2xl border border-orange-200 bg-orange-50/60 px-3 py-3 text-left transition-colors hover:bg-orange-100/70 dark:border-orange-300/15 dark:bg-orange-300/5 dark:hover:bg-orange-300/10"
                        >
                          <p className="text-sm font-medium">{bookmark.label}</p>
                          <p className="mt-1 text-xs text-orange-900/50 dark:text-orange-100/50">
                            {new Date(bookmark.createdAt).toLocaleString()}
                          </p>
                        </button>
                      ))
                    ) : document.fileType === 'PDF' ? (
                      <div className="rounded-2xl border border-dashed border-orange-200 px-3 py-4 dark:border-orange-300/15">
                        <p className="text-sm text-orange-900/55 dark:text-orange-100/55">
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
                            className="min-w-0 flex-1 rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-950 outline-none transition-colors placeholder:text-orange-900/40 focus:border-orange-400/70 dark:border-orange-300/10 dark:bg-orange-300/5 dark:text-orange-50 dark:placeholder:text-orange-100/35"
                          />
                          <button
                            type="button"
                            onClick={handlePdfPageJump}
                            className="rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-sm font-semibold text-orange-900 transition-colors hover:bg-orange-100 dark:border-orange-300/10 dark:bg-orange-300/5 dark:text-orange-50 dark:hover:bg-orange-300/10"
                          >
                            Go
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="rounded-2xl border border-dashed border-orange-200 px-3 py-4 text-sm text-orange-900/55 dark:border-orange-300/15 dark:text-orange-100/55">
                        No personal bookmarks yet.
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

      <div className="relative flex-1">
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
          <div className="relative h-full overflow-y-auto">
            <a
              href={`/api/documents/${document.id}/raw#toolbar=1&view=FitH`}
              target="_blank"
              rel="noreferrer"
              className={cn(
                'absolute right-5 top-5 z-10 rounded-lg border px-3 py-2 text-xs font-medium shadow-sm backdrop-blur-md transition-colors',
                pdfReaderLinkClasses[theme]
              )}
            >
              Open original PDF
            </a>

            <div className="mx-auto min-h-full max-w-[1440px] px-5 py-14 font-sans text-[1.03rem] leading-[1.85] md:px-8 md:py-16 xl:text-[1.05rem]">
              <h1 className="mx-auto mb-8 max-w-[1320px] px-2 text-2xl font-bold leading-tight">
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
                    This file may be scanned images instead of selectable text.
                  </p>
                </div>
              ) : (
                <div className="space-y-8 pb-16">
                  {pdfPageSpreads.map((spread, spreadIndex) => (
                    <section
                      key={`pdf-spread-${spreadIndex}`}
                      className="grid grid-cols-1 gap-7 xl:grid-cols-2 xl:items-start"
                    >
                      {spread.map((page) => (
                        <article
                          key={`pdf-page-${page.pageNumber ?? spreadIndex}`}
                          data-pdf-page-number={page.pageNumber ?? undefined}
                          className={cn(
                            'min-h-[calc(100vh-9rem)] rounded-lg border px-7 py-9 md:px-9 md:py-10',
                            pdfReaderPageClasses[theme]
                          )}
                        >
                          {page.pageNumber ? (
                            <div
                              className={cn(
                                'mb-6 text-xs font-medium uppercase tracking-[0.12em]',
                                pdfReaderPageMetaClasses[theme]
                              )}
                            >
                              Page {page.pageNumber}
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
                              <button
                                key={paragraph.id}
                                type="button"
                                data-pdf-selection-key={selectionKey}
                                onClick={(event) =>
                                  handlePdfParagraphClick(paragraph, event)
                                }
                                className={cn(
                                  'mb-[1.2em] block w-full rounded-lg px-2 py-1 text-left font-sans text-[1.03rem] leading-[1.85] text-inherit transition-colors focus-visible:outline-none focus-visible:ring-2 xl:text-[1.05rem]',
                                  'whitespace-pre-wrap',
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
        )}
      </div>

      {selectedParagraph ? (
        <div className="absolute inset-0 z-30">
          <button
            type="button"
            aria-label="Close explanation"
            className="absolute inset-0 bg-transparent"
            onClick={closeExplanationPanel}
          />
          <div
            className="absolute"
            style={{
              top: resolvedPanelRect.top,
              left: resolvedPanelRect.left,
              width: resolvedPanelFrame.width,
              height: resolvedPanelFrame.height,
            }}
          >
            <div
              className="relative flex h-full w-full overflow-hidden rounded-[28px] border border-orange-200/90 bg-white/88 shadow-[0_24px_80px_rgba(251,146,60,0.34)] backdrop-blur-xl"
              onClick={(event) => event.stopPropagation()}
            >
              <div
                className="absolute left-1/2 top-3 z-30 h-2 w-24 -translate-x-1/2 cursor-grab rounded-full bg-orange-200 hover:bg-orange-300"
                data-panel-drag-handle="true"
                onPointerDown={handlePanelDragStart}
                title="Drag explanation panel"
              />
              <ExplanationPanel
                documentId={document.id}
                text={selectedParagraph.text}
                selectionKey={selectedParagraph.key}
                onClose={closeExplanationPanel}
                onActiveSentenceChange={handleActiveSentenceChange}
                onFocusTargetChange={handleFocusTargetChange}
                onExplanationReady={handleExplanationReady}
              />
              <button
                type="button"
                aria-label="Resize explanation panel"
                className={cn(
                  'absolute bottom-3 z-30 flex h-5 w-5 items-center justify-center rounded-full border border-orange-200 bg-white/80 text-orange-700 shadow-sm backdrop-blur-md',
                  resolvedPanelSide === 'right'
                    ? 'left-3 cursor-sw-resize'
                    : 'right-3 cursor-se-resize'
                )}
                onPointerDown={handleResizeStart}
              >
                <span className="text-[10px] leading-none">↘</span>
              </button>
            </div>
          </div>
        </div>
      ) : document.fileType === 'EPUB' ? (
        <div className="pointer-events-none absolute bottom-8 left-1/2 -translate-x-1/2 transform rounded-full bg-orange-500/90 px-4 py-2 text-sm font-semibold text-white shadow-xl shadow-orange-200 backdrop-blur-md fade-in animate-in">
          🐱 Hover a paragraph, then click to decode it with AI
        </div>
      ) : null}
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
        className="block w-full rounded-xl px-3 py-2 text-left text-sm transition-colors hover:bg-orange-100/70 dark:hover:bg-orange-300/10"
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
