'use client';
import {createSemanticHover} from './semantic-hover';
import { viewportAnchor, type StudyAnchor } from './floating-study-layout';
import {createAnchorHandle,wordLookupBounds,type AnchorHandle} from './selection-anchor';
import {originalText,originalRange,projectionFor,projectedRanges,readOriginalSelection} from './original-text';
import {collectMeaningSources,sourceRange,type MeaningTextSource} from './meaning-text-source';
import {findEpubSourceElement,occurrenceId,type Occurrence} from './source-position';
import {EpubCFI} from 'epubjs';
import {epubSourceAnchor} from './epub-source-anchor';
import {canFlipPointer} from './flip-pointer-guard';
import type {ReaderModeQA} from './reader-qa-types';
import {useSemanticFlip} from '@/hooks/use-semantic-flip';
import {semanticFlipRequestSchema} from '@/lib/semantic-flip';
import {createTextProjection,type TextProjection} from './text-projection';
import {registerOriginalText} from './original-text';
import type {CompletedFlip} from './semantic-flip-controller';
import {flipInputFor,pdfOccurrence,sourceRangeAt} from './semantic-flip-source';
const isSingleOriginalWord=(text:string)=>/^[\p{L}\p{M}]+(?:['’\-][\p{L}\p{M}]+)*$/u.test(text);
const sourceText=(node:Node|null|undefined)=>node?originalText(node):'';
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
import {ReaderEdgeNavigation} from './reader-edge-navigation';
import {epubReaderGutter,compactEpubCss,installCompactEpubPresentation} from './epub-reader-presentation';
import {readingFlowOptions,anchorScrollDelta,readingWindowGeometry,moveReadingScreen,type ReadingFlow,type ContinuousManagerPort} from './reading-flow';
import {installContinuousScrollSync} from './reading-flow';
import {useReadingPreferences} from './reading-preferences';
import {ReadingModeControls} from './reading-mode-controls';
import {useReadingAIEpoch} from '@/lib/reading-ai-epoch';
import {createReaderAIClientBudget} from './reader-ai-budget';
import {createReadingRestoreController,type RestoreReason} from './reading-restore';
import {createEpubReadingSession,type SessionContents} from './epub-reading-session';
import {mapLoadedView,type EpubReflowPort,type LoadedViewPort} from './epub-engine-adapter';
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

type NormalizedTextMap = {text:string;source:MeaningTextSource};

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
  cfiFromNode: (node:Node) => string;
};

type RenditionLike = {
  on?: (event: string, callback: (value: {start?:{cfi?:string;percentage?:number;index?:number};end?:unknown}) => void) => void;
  book?: {
    ready?: Promise<unknown>;
    loaded?: { metadata?: Promise<{language?:string;layout?:string}> };
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

type EngineView=Omit<LoadedViewPort,'document'> & {contents:SessionContents & {resizeCheck():void};iframe?:HTMLIFrameElement;size(width:number,height:number):void};
type PinnedEngine={started?:Promise<unknown>;manager?:Omit<ContinuousManagerPort,'check'|'update'> & {check?:ContinuousManagerPort['check'];update?:ContinuousManagerPort['update'];layout?:{delta?:number}};
 views():EngineView[]|{all():EngineView[]};reportLocation():unknown;
 on(name:string,fn:(value:unknown)=>void):void;off(name:string,fn:(value:unknown)=>void):void;
 hooks:{content:{register(fn:(contents:SessionContents)=>void):void;deregister(fn:(contents:SessionContents)=>void):void}}};
type EpubSession=ReturnType<typeof createEpubReadingSession>;

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

  html:not([data-reader-semantic-flip='true']) [data-reader-interactive='true'][data-reader-hovered='true'] {
    background: rgba(0, 122, 255, 0.10) !important;
    box-shadow: inset 0 0 0 1px rgba(234, 88, 12, 0.24);
  }

  html:not([data-reader-semantic-flip='true']) [data-reader-interactive='true'][data-reader-active='true'] {
    background: rgba(0, 122, 255, 0.16) !important;
    box-shadow:
      inset 0 0 0 1px rgba(234, 88, 12, 0.38),
      0 8px 24px rgba(154, 52, 18, 0.10);
  }

  html[data-reader-semantic-flip='true'] [data-reader-interactive='true'] {
    outline: none !important;
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
  return {
    ...ReactReaderStyle,
    readerArea: {
      ...ReactReaderStyle.readerArea,
      backgroundColor: theme==='dark'?'#171717':theme==='sepia'?'#f5efdf':'#fcfcfa',
    },
    reader: {...ReactReaderStyle.reader,left:epubReaderGutter,right:epubReaderGutter},
    arrow: {...ReactReaderStyle.arrow,display:'none'},
  };
}

function buildNormalizedTextMap(element: HTMLElement): NormalizedTextMap | null {
  const source=collectMeaningSources(element).find(s=>s.element===element);
  return source?{text:source.text,source}:null;
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

  try{return projectedRanges(sourceRange(mapping.source,start,end))[0];}catch{return null;}
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
  // Paired text identities must survive: normalization is only safe before capture.
  if(!projectionFor(parent))parent.normalize();
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
  onQAReady,
}: {
  document: ReaderDocument;
  initialSections?: unknown[];
  onQAReady?:(api:ReaderModeQA)=>void;
  currentUser: {
    id: string;
    email: string;
  };
}) {
  const {
    theme,
    sourceLanguage,meaningGroupReading,setMeaningGroupReading,meaningGroupLowSaturation,setMeaningGroupLowSaturation,
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
  const [readingLoaded,setReadingLoaded]=useState(false);
  const readingLoadedRef=useRef(false);
  const [restore]=useState(createReadingRestoreController);
  const [readingPhase,setReadingPhase]=useState(restore.phase());
  const readingPreferences=useReadingPreferences(currentUser.id),aiEpoch=useReadingAIEpoch(currentUser.id);
  const [flow,setFlow]=useState<ReadingFlow>('paginated');
  const [fixedLayout,setFixedLayout]=useState(false);
  const flowRef=useRef(flow);flowRef.current=fixedLayout?'paginated':flow;
  const sessionRef=useRef<EpubSession|null>(null);
  const initialAnchorRef=useRef({location:'',percentage:0});
  const runRestoreRef=useRef<(anchor:{location:string;percentage:number},reason:RestoreReason)=>void>(()=>{});
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
  const meaningLocationFor=useCallback((source:import('./meaning-text-source').MeaningTextSource,range:Range)=>{try{const content=epubContentsRef.current.find(c=>c.document===source.element.ownerDocument);if(content)return content.cfiFromRange(range);const block=source.element.closest<HTMLElement>('[data-pdf-selection-key]');if(!block?.dataset.pdfSelectionKey)return null;const prefix=range.cloneRange();prefix.selectNodeContents(projectionFor(block)?.canonicalNode(block)??block);prefix.setEnd(range.startContainer,range.startOffset);return block.dataset.pdfSelectionKey+'@'+prefix.toString().length;}catch{return null;}},[]);
  const aiBudget=useMemo(()=>createReaderAIClientBudget(),[currentUser.id,document.id,aiEpoch]);
  const budgetLifetime=useRef({budget:aiBudget,generation:0});budgetLifetime.current.budget=aiBudget;
  useEffect(()=>{const generation=++budgetLifetime.current.generation;return()=>{queueMicrotask(()=>{if(budgetLifetime.current.generation===generation||budgetLifetime.current.budget!==aiBudget)aiBudget.dispose();});};},[aiBudget]);
  const geometryListeners=useRef(new Set<()=>void>());
  const notifyGeometry=useCallback(()=>{geometryListeners.current.forEach(refresh=>refresh());},[]);
  const subscribeGeometry=useCallback((refresh:()=>void)=>{geometryListeners.current.add(refresh);return()=>{geometryListeners.current.delete(refresh);};},[]);
  const meaningGeometry=useCallback(()=>{if(document.fileType==='EPUB')return sessionRef.current?.port.geometry()??null;const body=containerRef.current?.querySelector('[data-reading-body]')?.getBoundingClientRect(),scroll=containerRef.current?.querySelector('[data-pdf-text-scroll]')?.getBoundingClientRect();if(!body)return null;return readingWindowGeometry({flow:'vertical',readingRect:body,browserRect:{left:0,top:0,right:window.innerWidth,bottom:window.innerHeight},scrollRect:scroll});},[document.fileType]);
  const meaningGroups=useMeaningGroupReading({root:containerRef,documentId:document.id,userId:currentUser.id,language:sourceLanguage,enabled:meaningGroupReading&&(document.fileType==='EPUB'||pdfViewMode==='text'),ready:readingReady,flow:document.fileType==='PDF'?'vertical':fixedLayout?'paginated':flow,aiEpoch,budget:aiBudget,geometry:meaningGeometry,subscribeGeometry,theme,lowSaturation:meaningGroupLowSaturation,locationFor:meaningLocationFor});
  const effectiveFlip=readingPreferences.preferences.semanticFlip&&((document.fileType==='EPUB'&&!fixedLayout)||(document.fileType==='PDF'&&pdfViewMode==='text'));
  const flipModeRef=useRef(effectiveFlip);flipModeRef.current=effectiveFlip;
  const readyRef=useRef(readingReady);readyRef.current=readingReady;
  const flipDomain={documentId:document.id,sourceLanguage,targetLanguage:readingPreferences.preferences.targets[sourceLanguage],aiEpoch};
  const flipDomainRef=useRef(flipDomain);flipDomainRef.current=flipDomain;
  const pdfProjections=useRef(new Map<Element,{projection:TextProjection;off:()=>void}>());
  const flipRef=useRef<ReturnType<typeof useSemanticFlip>|null>(null);
  const allProjections=()=>[...(sessionRef.current?.projections()??[]),...Array.from(pdfProjections.current.values(),v=>v.projection)];
  const ensurePdfProjections=()=>{if(!flipModeRef.current)return;for(const [block,entry] of pdfProjections.current)if(!block.isConnected){entry.off();entry.projection.dispose();pdfProjections.current.delete(block);}containerRef.current?.querySelectorAll('[data-pdf-selection-key]').forEach(block=>{if(!pdfProjections.current.has(block)){const projection=createTextProjection(block,{layout:'stable'});pdfProjections.current.set(block,{projection,off:registerOriginalText(projection)});}});};
  const resolveFlip=(c:CompletedFlip):{projection:TextProjection;range:Range}|null=>{
    if(c.position.kind==='pdf'){ensurePdfProjections();for(const [block,entry] of pdfProjections.current){if((block as HTMLElement).dataset.pdfSelectionKey===c.position.selectionKey){try{return {projection:entry.projection,range:sourceRangeAt(entry.projection.canonicalNode(block)!,c.position.start,c.position.end)};}catch{return null;}}}return null;}
    const session=sessionRef.current;if(!session)return null;
    try{const cfi=new EpubCFI(c.position.cfi);for(const content of session.contents()){const body=content.document.createRange();body.selectNodeContents(content.document.body);if(new EpubCFI(content.cfiFromRange(body)).spinePos!==cfi.spinePos)continue;const projection=session.projection(content.document);if(projection)return {projection,range:originalRange(cfi.toRange(content.document))};}}catch{/* Not currently loaded. Rebind when this chapter returns. */}return null;
  };
  const boundFlips=useRef(new WeakMap<TextProjection,Set<string>>());
  const bindFlip=async(c:CompletedFlip)=>{if(!flipModeRef.current)return;const found=resolveFlip(c);if(!found)return;let ids=boundFlips.current.get(found.projection);if(!ids){ids=new Set();boundFlips.current.set(found.projection,ids);}if(ids.has(c.id))return;found.projection.apply({id:c.id,originalRange:found.range,replacement:c.replacement});ids.add(c.id);};
  // Stable glyph-box painting changes neither layout nor scroll. Never seek/reflow on a flip.
  const projectionTransaction=async(edit:()=>void)=>{edit();notifyGeometry();};
  const semanticFlip=useSemanticFlip({enabled:effectiveFlip,ready:readingReady,domain:flipDomain,budget:aiBudget,inputFor:o=>flipInputFor(o,flipDomainRef.current),pending:o=>{const found=resolveFlip({...o,replacement:o.word});return found?.projection.pending({id:o.id,originalRange:found.range})??(()=>{});},
    apply:async(o,replacement)=>{if(!flipModeRef.current)return;await projectionTransaction(()=>{const found=resolveFlip({...o,replacement});if(found){found.projection.apply({id:o.id,originalRange:found.range,replacement});let ids=boundFlips.current.get(found.projection);if(!ids){ids=new Set();boundFlips.current.set(found.projection,ids);}ids.add(o.id);}});},
    restore:async(id,animate)=>{await projectionTransaction(()=>{for(const p of allProjections()){p.restore(id,{animate});boundFlips.current.get(p)?.delete(id);}});},
    restoreAll:async()=>{if(!allProjections().some(p=>(boundFlips.current.get(p)?.size??0)>0))return;await projectionTransaction(()=>{for(const p of allProjections())p.restoreAll();boundFlips.current=new WeakMap();});},
    isVisible:c=>{const found=resolveFlip(c),geometry=meaningGeometry();if(!found||!geometry)return false;const frame=found.projection.liveDocument.defaultView?.frameElement?.getBoundingClientRect();return found.projection.projectedRanges(found.range).some(r=>Array.from(r.getClientRects()).some(rect=>{const left=rect.left+(frame?.left??0),top=rect.top+(frame?.top??0);return left<geometry.visible.right&&left+rect.width>geometry.visible.left&&top<geometry.visible.bottom&&top+rect.height>geometry.visible.top;}));},
  });flipRef.current=semanticFlip;
  const occurrenceFrom=(range:Range,contents?:EpubContents):Occurrence|null=>{try{const r=originalRange(range),word=r.toString();if(!word)return null;if(contents){const position={kind:'epub',cfi:contents.cfiFromRange(r)} as const;return {id:occurrenceId(position),position,word,originalRange:r};}const canonical=projectionFor(range.startContainer)?.canonicalNode(range.startContainer)??range.startContainer,block=(canonical.nodeType===1?canonical as Element:canonical.parentElement)?.closest<HTMLElement>('[data-pdf-selection-key]');if(!block?.dataset.pdfSelectionKey)return null;const live=projectionFor(range.startContainer)?.liveNode(block)??block;return pdfOccurrence(block.dataset.pdfSelectionKey,live as Element,r);}catch{return null;}};
  const flipClick=(doc:Document,x:number,y:number,within:Element,contents?:EpubContents)=>{if(!readyRef.current||!canFlipPointer(doc))return;const hit=wordAtPoint(doc,x,y,within);if(!hit)return;const o=occurrenceFrom(hit.originalRange,contents);if(o)flipRef.current?.click(o);};
  const installFlipEvents=(doc:Document,contents?:EpubContents)=>{
    const copy=(event:ClipboardEvent)=>{if(!flipModeRef.current||!event.clipboardData)return;const selection=doc.defaultView?.getSelection();if(!selection?.rangeCount||selection.isCollapsed)return;try{event.clipboardData.setData('text/plain',readOriginalSelection(selection.getRangeAt(0)));event.preventDefault();}catch{/* Preserve normal copy if selection is outside prose. */}};
    const key=(event:KeyboardEvent)=>{if(!flipModeRef.current)return;if(event.key==='Escape'){event.preventDefault();flipRef.current?.escape();return;}if(event.key!=='Enter'||!event.altKey||!readyRef.current)return;const selection=doc.defaultView?.getSelection();if(!selection?.rangeCount||selection.isCollapsed)return;const range=selection.getRangeAt(0),projection=projectionFor(range.startContainer),replacement=projection?.occurrenceForLiveRange(range);if(replacement){event.preventDefault();flipRef.current?.restoreOccurrence(replacement);return;}const o=occurrenceFrom(range,contents);if(!o||!isSingleOriginalWord(o.word))return;const input=flipInputFor(o,flipDomainRef.current);try{semanticFlipRequestSchema.parse(input);}catch{return;}event.preventDefault();flipRef.current?.click(o,{animate:false});};
    const hover=createSemanticHover(doc);let longTimer:ReturnType<typeof setTimeout>|undefined,press:{x:number;y:number}|undefined,consumed=false;
    const hitAt=(event:PointerEvent)=>{const target=event.target as Element|null,block=target?.closest('[data-reader-interactive], [data-pdf-selection-key]');if(!block)return null;const hit=wordAtPoint(doc,event.clientX,event.clientY,block);if(!hit)return null;const id=projectionFor(hit.range.startContainer)?.occurrenceForLiveRange(hit.range);const replacement=id?flipRef.current?.completed().find(c=>c.id===id)?.replacement:undefined;return {word:hit.word,rect:hit.rect,language:flipDomainRef.current.sourceLanguage,replacement};};
    const move=(event:PointerEvent)=>{
      if(press&&Math.hypot(event.clientX-press.x,event.clientY-press.y)>8){clearTimeout(longTimer);press=undefined;hover.clear();}
      if(!flipModeRef.current||event.pointerType==='touch'){if(!press&&!consumed)hover.clear();return;}
      const hit=hitAt(event);if(hit)hover.show(hit);else hover.clear();
    };
    const down=(event:PointerEvent)=>{clearTimeout(longTimer);consumed=false;hover.clear();if(!flipModeRef.current||event.pointerType!=='touch')return;const hit=hitAt(event);if(!hit?.replacement)return;press={x:event.clientX,y:event.clientY};longTimer=setTimeout(()=>{consumed=true;hover.show(hit,{lookupPOS:false});},450);};
    const up=()=>{clearTimeout(longTimer);press=undefined;};
    const cancel=()=>{up();consumed=false;hover.clear();};
    const click=(event:MouseEvent)=>{if(consumed){consumed=false;event.preventDefault();event.stopImmediatePropagation();}};
    const context=(event:MouseEvent)=>{if(consumed)event.preventDefault();};
    const leave=()=>{if(!press&&!consumed)hover.clear();};
    doc.addEventListener('reader-mode-change',cancel);doc.addEventListener('copy',copy);doc.addEventListener('keydown',key);doc.addEventListener('pointermove',move);doc.addEventListener('pointerdown',down);doc.addEventListener('pointerup',up);doc.addEventListener('pointercancel',cancel);doc.addEventListener('click',click,true);doc.addEventListener('contextmenu',context);doc.addEventListener('pointerout',leave);doc.addEventListener('scroll',cancel,true);
    return()=>{cancel();hover.dispose();doc.removeEventListener('reader-mode-change',cancel);doc.removeEventListener('copy',copy);doc.removeEventListener('keydown',key);doc.removeEventListener('pointermove',move);doc.removeEventListener('pointerdown',down);doc.removeEventListener('pointerup',up);doc.removeEventListener('pointercancel',cancel);doc.removeEventListener('click',click,true);doc.removeEventListener('contextmenu',context);doc.removeEventListener('pointerout',leave);doc.removeEventListener('scroll',cancel,true);};
  };

  const renditionRef = useRef<RenditionLike | null>(null);

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

  useEffect(()=>{
    for(const doc of [...(sessionRef.current?.contents().map(c=>c.document)??[]),globalThis.document]){
      doc.documentElement.dataset.readerSemanticFlip=String(effectiveFlip);doc.dispatchEvent(new Event('reader-mode-change'));
      doc.querySelectorAll<HTMLElement>('[data-reader-interactive]').forEach(el=>{el.title=effectiveFlip?'':'点击单词查词；点击段落边缘或按 Enter 分析整段';if(effectiveFlip){if(doc.activeElement===el)el.blur();el.removeAttribute('tabindex');setParagraphState(el,{hovered:false,active:false});}else el.tabIndex=0;});
    }
    if(effectiveFlip){clearUnderlineAnnotations();closeExplanationPanel();setToolsOpen(false);setShowDetailed(false);setUtilityOpen(false);setToolSelection(null);useReaderStore.getState().setStudyPinned(false);sessionRef.current?.setProjectionEnabled(true);ensurePdfProjections();notifyGeometry();}
    else {sessionRef.current?.setProjectionEnabled(false);for(const entry of pdfProjections.current.values()){entry.off();entry.projection.dispose();}pdfProjections.current.clear();boundFlips.current=new WeakMap();notifyGeometry();}
  },[effectiveFlip,pdfTextState.status]);
  useEffect(()=>{if(document.fileType!=='PDF')return;return installFlipEvents(globalThis.document);},[document.fileType]);
  useEffect(()=>()=>{for(const entry of pdfProjections.current.values()){entry.off();entry.projection.dispose();}pdfProjections.current.clear();},[]);

  const handleParagraphClick = useCallback(
    (element: HTMLElement, contents: EpubContents) => {
      if(flipModeRef.current)return;
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
      setToolSelection({kind:'paragraph',anchorHandle:createAnchorHandle(element,undefined,()=>findEpubSourceElement(epubContentsRef.current,cfiRange)),anchor:viewportAnchor(rect,frameRect),side:preferredPanelSide,text:mapping.text,location:cfiRange,previousText:sourceText(element.previousElementSibling),nextText:sourceText(element.nextElementSibling),chapterText:sourceText(element.ownerDocument.body)||mapping.text});
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
      if(flipModeRef.current)return;
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
    if(flipModeRef.current){anchorHandle?.dispose();return;}
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
      if(flipModeRef.current){event.preventDefault();flipClick(event.currentTarget.ownerDocument,event.clientX,event.clientY,event.currentTarget);return;}
      const selection=window.getSelection();
      const selected=selection?.rangeCount?readOriginalSelection(selection.getRangeAt(0)).trim():'';
      const word = wordAtPoint(event.currentTarget.ownerDocument,event.clientX,event.clientY,event.currentTarget);
      if (selected && /\s/.test(selected)) {openPdfParagraph(paragraph,event.currentTarget);return;}
      if (selected || word) {
        const index=pdfTextState.paragraphs.indexOf(paragraph);
        openWord(selected || word!.word,getPdfSelectionKey(document.id,paragraph.id),paragraph.text,event.clientX,pdfTextState.paragraphs[index-1]?.text,pdfTextState.paragraphs[index+1]?.text,viewportAnchor(event.currentTarget.getBoundingClientRect()),createAnchorHandle(event.currentTarget,word?.range,undefined,word?wordLookupBounds('PDF',flowRef.current):'paragraph'));
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

  const installInteractiveParagraphs = useCallback((contents: EpubContents,own:(off:()=>void)=>void=()=>{}) => {
    contents.document.documentElement.dataset.readerSemanticFlip=String(flipModeRef.current);
    contents.addStylesheetCss(
      INTERACTIVE_PARAGRAPH_CSS + ' ::highlight(reader-hover-word) {background-color:#c7dfff;color:#12243b;} [data-reader-interactive] {position:relative;} [data-reader-interactive]::before {content: "≡"; position:absolute;right:100%;top:0; padding:0 4px;font-size:12px;opacity:0;cursor:pointer;} html:not([data-reader-semantic-flip=true]) [data-reader-interactive]:hover::before,html:not([data-reader-semantic-flip=true]) [data-reader-interactive]:focus::before {opacity:.6;}',
      'reader-paragraph-interaction'
    );

    const dismiss=(event:MouseEvent)=>{if(!(event.target as Element).closest('[data-reader-interactive]')&&!useReaderStore.getState().studyPinned){setToolsOpen(false);setShowDetailed(false);closeExplanationPanel();}};
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){setToolsOpen(false);setShowDetailed(false);closeExplanationPanel();}};
    contents.document.addEventListener('click',dismiss);contents.document.addEventListener('keydown',escape);
    own(()=>contents.document.removeEventListener('click',dismiss));own(()=>contents.document.removeEventListener('keydown',escape));
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

      const listen=<K extends keyof HTMLElementEventMap>(name:K,fn:(event:HTMLElementEventMap[K])=>void)=>{element.addEventListener(name,fn);own(()=>element.removeEventListener(name,fn));};
      own(()=>{delete element.dataset.readerInteractive;});
      if(!flipModeRef.current)element.tabIndex=0;else element.removeAttribute('tabindex');
      element.title = flipModeRef.current?'':'点击单词查词；点击段落边缘或按 Enter 分析整段';
      listen('keydown',event=>{if(flipModeRef.current)return;if(event.key==='Enter'&&event.target===element){event.preventDefault();handleParagraphClick(element,contents);}});
      element.dataset.readerInteractive = 'true';
      setParagraphState(element, { hovered: false, active: false });

      listen('mouseenter', () => {
        if(flipModeRef.current){setParagraphState(element,{hovered:false,active:false});return;}
        if (activeElementRef.current === element) {
          setParagraphState(element, { hovered: false, active: true });
          return;
        }

        setParagraphState(element, { hovered: true, active: false });
      });

      listen('mousemove', (event) => {const hit=wordAtPoint(contents.document,event.clientX,event.clientY,element);highlightWord(contents.document,hit?.range);});
      listen('mouseleave', () => {
        highlightWord(contents.document);
        if(flipModeRef.current){setParagraphState(element,{hovered:false,active:false});return;}
        if (activeElementRef.current === element) {
          setParagraphState(element, { hovered: false, active: true });
          return;
        }

        setParagraphState(element, { hovered: false, active: false });
      });

      listen('click', (event) => {
        const target = event.target as HTMLElement | null;
        if (target?.closest('a')) {
          return;
        }

        if(flipModeRef.current){event.preventDefault();event.stopPropagation();flipClick(contents.document,event.clientX,event.clientY,element,contents);return;}
        if (contents.document.documentElement.dataset.readerSelectionConsumed === 'true' || (contents.window.getSelection()?.rangeCount&&readOriginalSelection(contents.window.getSelection()!.getRangeAt(0)).trim())) return;
        event.preventDefault();
        event.stopPropagation();
        const hit=wordAtPoint(contents.document,event.clientX,event.clientY,element);
        if(hit){
          const frame=(contents.window.frameElement as Element|null)?.getBoundingClientRect();
          const wordCfi=contents.cfiFromRange(hit.originalRange);
          openWord(hit.word,wordCfi,sourceText(element),event.clientX+(frame?.left||0),sourceText(element.previousElementSibling),sourceText(element.nextElementSibling),viewportAnchor(element.getBoundingClientRect(),frame),createAnchorHandle(element,hit.originalRange,()=>findEpubSourceElement(epubContentsRef.current,wordCfi),wordLookupBounds('EPUB',flowRef.current)));
          return;
        }
        handleParagraphClick(element, contents);
      });
    });
  }, [handleParagraphClick,openWord]);

  const installWheelNavigation = useCallback((contents: EpubContents) => {
    const wheel=(event:WheelEvent)=>{
      if(flowRef.current==='vertical'||restore.phase()!=='ready')return;
      if(Math.abs(event.deltaY)<WHEEL_PAGE_TURN_THRESHOLD)return;
      const now=Date.now();if(now-lastWheelNavigationAtRef.current<WHEEL_PAGE_TURN_COOLDOWN_MS){event.preventDefault();return;}
      const rendition=renditionRef.current;if(!rendition)return;
      lastWheelNavigationAtRef.current=now;event.preventDefault();
      if(event.deltaY>0)rendition.next();else rendition.prev();
    };
    contents.document.addEventListener('wheel',wheel,{passive:false});
    return ()=>contents.document.removeEventListener('wheel',wheel);
  }, [restore]);

  const applyExplanationAnnotations = useCallback(
    (
      selectionKey: string,
      explanation: ParagraphExplanationOutput | null,
      focusedSentenceIndex: number | null = null,
      focusedTarget: ActiveFocusTarget | null = null
    ) => {
      if (flipModeRef.current || !explanation) {
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
      if(flipModeRef.current)return;
      if (flipModeRef.current || !explanation) {
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
      if(flipModeRef.current)return;
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
      if(flipModeRef.current)return;
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
      setViewportFrame({width:container.clientWidth,height:container.clientHeight});
      if(sessionRef.current&&restore.phase()==='ready'){const anchor=restore.lastConfirmed();if(anchor)runRestoreRef.current(anchor,'resize');}
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

    currentLocationRef.current = location;
  }, [location]);

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



  runRestoreRef.current=(anchor,reason)=>{
    setReadingReady(false);
    const current=sessionRef.current;void current?.restoreTo(anchor,reason).catch(error=>{if(sessionRef.current===current)setSyncError(error instanceof Error?error.message:'阅读定位失败，请重试。');});
  };
  const changeFlow=(next:ReadingFlow)=>{
    if(next===flowRef.current||fixedLayout)return;
    const anchor=restore.lastConfirmed()??initialAnchorRef.current;
    restore.begin(anchor,'flow');setReadingReady(false);setReadingPhase('restoring');
    initialAnchorRef.current=anchor;
    sessionRef.current?.dispose();sessionRef.current=null;epubContentsRef.current=[];
    clearUnderlineAnnotations();closeExplanationPanel();setToolsOpen(false);setShowDetailed(false);
    flowRef.current=next;setFlow(next);
  };
  useEffect(()=>{if(!fixedLayout&&readingPreferences.preferences.flow!==flowRef.current)changeFlow(readingPreferences.preferences.flow);},[readingPreferences.preferences.flow,fixedLayout]);
  const getRendition = (rendition: RenditionLike) => {
    sessionRef.current?.dispose();epubContentsRef.current=[];renditionRef.current=rendition;registerThemes(rendition);
    // The installed runtime returns a Views collection, contrary to its public .d.ts.
    const engine=rendition as unknown as PinnedEngine;
    const mappedViews=new WeakMap<EngineView,LoadedViewPort>();
    // Fixed-layout books retain the default manager, which has no continuous check/update.
    const adaptedManager:ContinuousManagerPort={
      get settings(){if(!engine.manager)throw new Error('EPUB manager is not ready');return engine.manager.settings;},
      get container(){return engine.manager?.container;},get scrollTop(){return engine.manager?.scrollTop;},set scrollTop(value){if(engine.manager)engine.manager.scrollTop=value;},get scrollLeft(){return engine.manager?.scrollLeft;},set scrollLeft(value){if(engine.manager)engine.manager.scrollLeft=value;},
      enqueue:task=>{const manager=engine.manager as unknown as {q?:{enqueue:(task:()=>Promise<unknown>)=>Promise<unknown>}};return manager?.q?.enqueue(task)??task();},
      check:()=>engine.manager?.check?.()??Promise.resolve(),update:offset=>engine.manager?.update?.(offset)??Promise.resolve(),scrollBy:(x,y,silent)=>engine.manager?.scrollBy(x,y,silent),
    };
    let offScrollSync:(()=>void)|undefined;
    const port:EpubReflowPort={
      dispose:()=>offScrollSync?.(),
      get manager(){return adaptedManager;},
      views(){const collection=engine.views?.();const views=Array.isArray(collection)?collection:collection?.all()??[];return views.filter(v=>v.contents?.document&&v.iframe?.isConnected!==false).map(v=>{return mapLoadedView(mappedViews,v);});},
      geometry(){const reading=containerRef.current?.querySelector('[data-reading-body]')?.getBoundingClientRect();if(!reading)return null;const browserRect={left:0,top:0,right:window.innerWidth,bottom:window.innerHeight};return readingWindowGeometry({flow:flowRef.current,readingRect:reading,browserRect,scrollRect:engine.manager?.container?.getBoundingClientRect(),layoutDelta:engine.manager?.layout?.delta});},
      alignAnchor:cfi=>{
       const spine=new EpubCFI(cfi).spinePos,collection=engine.views?.(),views=Array.isArray(collection)?collection:collection?.all()??[];
       const view=views.find(v=>(v as EngineView & {section?:{index:number}}).section?.index===spine);if(!view?.iframe)return;
       const range=new EpubCFI(cfi).toRange(view.contents.document);if(!range)return;
       if(range.collapsed&&range.startContainer.nodeType===3){const text=range.startContainer.textContent??'',start=range.startOffset,length=text.codePointAt(start)!>0xffff?2:1;if(start<text.length)range.setEnd(range.startContainer,start+length);}
       const r=range.getBoundingClientRect(),frame=view.iframe.getBoundingClientRect(),g=port.geometry();if(!g||!r.width||!r.height)return;
       const delta=anchorScrollDelta(g,{left:r.left+frame.left,right:r.right+frame.left,top:r.top+frame.top,bottom:r.bottom+frame.top});if(delta.x||delta.y)adaptedManager.scrollBy(delta.x,delta.y,true);
      },display:target=>{return Promise.resolve(target?rendition.display(target):rendition.display(0));},reportLocation:()=>engine.reportLocation(),nextFrame:()=>new Promise(resolve=>window.requestAnimationFrame(()=>resolve())),
    };
    const session=createEpubReadingSession({runtime:{port,ready:async()=>{await (engine.started??Promise.resolve());if(!offScrollSync&&engine.manager)offScrollSync=installContinuousScrollSync(engine.manager as unknown as Parameters<typeof installContinuousScrollSync>[0]);},on:(name,fn)=>engine.on(name,fn),off:(name,fn)=>engine.off(name,fn),content:engine.hooks.content,anchorForTarget:target=>{
       const section=target?rendition.book?.section(target):rendition.book?.section(0);if(!section)return null;
       const content=epubContentsRef.current.find(c=>{try{const range=c.document.createRange();range.selectNodeContents(c.document.body);range.collapse(true);return new EpubCFI(c.cfiFromRange(range)).spinePos===section.index;}catch{return false;}});if(!content)return null;
       const fragment=target.includes('#')?decodeURIComponent(target.slice(target.indexOf('#')+1)):'';
       const within=fragment?content.document.getElementById(fragment):content.document.body;if(!within)return null;
       return epubSourceAnchor(content,within);
      },percentage:cfi=>{const ratio=rendition.book?.locations?.percentageFromCfi(cfi);return typeof ratio==='number'&&Number.isFinite(ratio)&&ratio>=0?ratio*100:NaN;}},restore,
      onPhase:()=>{if(sessionRef.current!==session)return;setReadingPhase(session.phase());setReadingReady(readingLoadedRef.current&&session.phase()==='ready');notifyGeometry();},
      onProgress:snapshot=>{if(sessionRef.current!==session)return;progressRef.current=snapshot;currentLocationRef.current=snapshot.location;setLocation(snapshot.location);setEpubPercentage(snapshot.percentage);},
      onScroll:()=>{notifyGeometry();if(!useReaderStore.getState().studyPinned){setToolsOpen(false);setShowDetailed(false);closeExplanationPanel();}},
      onContents:contents=>{
        const owned:Array<()=>void>=[],own=(off:()=>void)=>owned.push(off);notifyGeometry();epubContentsRef.current=[...epubContentsRef.current.filter(c=>c.document!==contents.document),contents];
        contents.addStylesheetCss('body,p,li{font-size:'+typographyRef.current.fontSize+'px !important;line-height:'+typographyRef.current.lineHeight+' !important;}','reader-typography');
        if(!fixedLayout){contents.addStylesheetCss(compactEpubCss,'reader-compact-prose');own(installCompactEpubPresentation(contents.document,window,flowRef.current));}
        own(installFlipEvents(contents.document,contents));
        contents.addStylesheetCss('p,li,blockquote{overflow-wrap:anywhere;}','reader-flip-wrap');
        const down=()=>{delete contents.document.documentElement.dataset.readerSelectionConsumed;clearUnderlineAnnotations();};
        const up=()=>{
          if(flipModeRef.current)return;
          const selected=contents.window.getSelection();const text=selected?.rangeCount?readOriginalSelection(selected.getRangeAt(0)).trim():'';if(!text||!selected?.rangeCount||restore.phase()!=='ready')return;
          contents.document.documentElement.dataset.readerSelectionConsumed='true';
          const range=selected.getRangeAt(0),ancestor=range.commonAncestorContainer,parent=ancestor.nodeType===1?ancestor as Element:ancestor.parentElement,block=parent?.closest('p,li,blockquote') as HTMLElement|null;
          if(/\s/.test(text)&&block){handleParagraphClick(block,contents);return;}
          const rect=range.getBoundingClientRect(),frame=contents.window.frameElement?.getBoundingClientRect(),cfi=contents.cfiFromRange(originalRange(range));
          openWord(text,cfi,sourceText(block)||sourceText(parent),rect.left+(frame?.left||0),sourceText(block?.previousElementSibling),sourceText(block?.nextElementSibling),viewportAnchor(block?.getBoundingClientRect()??rect,frame),block?createAnchorHandle(block,range,()=>findEpubSourceElement(epubContentsRef.current,cfi),wordLookupBounds('EPUB',flowRef.current)):undefined);
        };
        contents.document.addEventListener('pointerdown',down,true);contents.document.addEventListener('mouseup',up);
        own(()=>contents.document.removeEventListener('pointerdown',down,true));own(()=>contents.document.removeEventListener('mouseup',up));
        contents.document.querySelectorAll<HTMLElement>('p,li,blockquote').forEach(node=>{if(entriesRef.current.some(e=>e.kind==='note'&&originalText(node).includes(e.text)))node.style.boxShadow='inset 0 -2px #007aff';});
        installInteractiveParagraphs(contents,own);own(installWheelNavigation(contents));
        return ()=>{owned.reverse().forEach(off=>off());epubContentsRef.current=epubContentsRef.current.filter(c=>c.document!==contents.document);};
      },
    });sessionRef.current=session;
    session.setRebind(async signal=>{if(!flipModeRef.current)return;signal.throwIfAborted();session.setProjectionEnabled(true);await flipRef.current?.rebind(async c=>{signal.throwIfAborted();await bindFlip(c);});});
    if(flipModeRef.current)session.setProjectionEnabled(true);
    if(onQAReady){

      type QAContent=EpubContents&{epubcfi:object;triggerSelectedEvent:(s:Selection)=>void;cfiBase:string};
      type QAView=EngineView&{section:{cfiBase:string}};
      const qaEngine=rendition as unknown as {epubcfi:object;manager:{mapping:{page:(c:EpubContents,base:string,start:number,end:number)=>unknown}}};
      const words=(word:string,chapter?:string)=>epubContentsRef.current.filter(c=>!chapter||c.document.body.dataset.chapter===chapter).flatMap(c=>collectMeaningSources(c.document.body).flatMap(source=>{const result:{c:EpubContents;r:Range}[]=[];for(const match of source.text.matchAll(/[\p{L}\p{M}]+(?:['’\-][\p{L}\p{M}]+)*/gu))if(match[0]===word)result.push({c,r:sourceRange(source,match.index!,match.index!+word.length)});return result;}));
      const api:ReaderModeQA={
       cfiIdentity:()=>({rendition:qaEngine.epubcfi instanceof EpubCFI,contents:epubContentsRef.current.every(c=>(c as QAContent).epubcfi instanceof EpubCFI)}),cfiCounts:()=>session.cfiCounts(),
       canonicalWordCFI:(word,index,chapter)=>{const found=words(word,chapter)[index];if(!found)throw new Error('Synthetic word not loaded');return found.c.cfiFromRange(found.r);},
       selectOriginal:cfi=>{const c:CompletedFlip={id:occurrenceId({kind:'epub',cfi}),position:{kind:'epub',cfi},word:'',replacement:''},found=resolveFlip(c);if(!found)throw new Error('Source not loaded');const range=found.projection.projectedRanges(found.range)[0],selection=found.projection.liveDocument.defaultView!.getSelection()!;selection.removeAllRanges();selection.addRange(range);},
       visibleUnits:()=>{const geometry=session.port.geometry();if(!geometry)return [];return epubContentsRef.current.flatMap(c=>{const frame=c.window.frameElement?.getBoundingClientRect();return collectMeaningSources(c.document.body).filter(source=>projectedRanges(sourceRange(source,0,source.text.length)).some(r=>Array.from(r.getClientRects()).some(rect=>rect.bottom+(frame?.top??0)>geometry.visible.top&&rect.top+(frame?.top??0)<geometry.visible.bottom&&rect.right+(frame?.left??0)>geometry.visible.left&&rect.left+(frame?.left??0)<geometry.visible.right))).map(source=>({key:source.text,sourceId:c.cfiFromRange(sourceRange(source,0,source.text.length)),location:c.cfiFromRange(sourceRange(source,0,source.text.length))}));});},
       loadedChapterIds:()=>epubContentsRef.current.map(c=>c.document.querySelector('body')?.getAttribute('data-chapter')??''),geometry:()=>session.port.geometry(),savedProgress:()=>restore.lastConfirmed(),
       flipWord:async cfi=>{const found=resolveFlip({id:'',position:{kind:'epub',cfi},word:'',replacement:''});if(!found)throw new Error('Word not loaded');const content=epubContentsRef.current.find(c=>c.document===found.projection.liveDocument)!;const o=occurrenceFrom(found.range,content);if(!o)throw new Error('No occurrence');flipInputFor(o,flipDomainRef.current);flipRef.current?.click(o);const until=Date.now()+6000;while(Date.now()<until){await new Promise(r=>setTimeout(r,25));if(readyRef.current&&flipRef.current?.pending===0)return;}throw new Error('Flip did not settle');},
       setTheme:theme=>useReaderStore.getState().setTheme(theme),completed:()=>flipRef.current?.completed()??[],jump:async cfi=>{await session.restoreTo({location:cfi,percentage:restore.lastConfirmed()?.percentage??0},'initial');},metrics:()=>port.views().map(v=>({width:v.width(),height:v.height()})),
       locationRange:()=>session.range(),probeCanonicalCalls:()=>{const collection=engine.views?.(),views=Array.isArray(collection)?collection:collection?.all()??[],view=views.find(v=>v.contents?.document) as QAView;if(!view)throw new Error('No real view');let before=session.cfiCounts().registeredFromRange;qaEngine.manager.mapping.page(view.contents as unknown as EpubContents,view.section.cfiBase,0,port.geometry()?.screenStep??600);const mapping=session.cfiCounts().registeredFromRange-before;const found=words('CAT')[0]??words('gato')[0];if(!found)throw new Error('Synthetic word not loaded');const range=projectedRanges(found.r)[0],selection=found.c.window.getSelection()!;selection.removeAllRanges();selection.addRange(range);before=session.cfiCounts().registeredFromRange;(found.c as QAContent).triggerSelectedEvent(selection);const delta=session.cfiCounts().registeredFromRange-before;selection.removeAllRanges();return {mapping,selection:delta};},
      };onQAReady(api);
    }

    void rendition.book?.loaded?.metadata?.then(metadata=>{
      if(sessionRef.current!==session)return;
      if(metadata.layout==='pre-paginated')setFixedLayout(true);
      if(!validSourceLanguage(new URLSearchParams(window.location.search).get('sourceLanguage'))&&!validSourceLanguage(document.language??null)){const language=validSourceLanguage(metadata.language?.toLowerCase().split(/[-_]/)[0]??null);if(language)setSourceLanguage(language);}
    }).catch(()=>{});
    void rendition.book?.ready?.then(async()=>{await rendition.book?.locations?.generate(1600);if(sessionRef.current!==session)return;const confirmed=restore.lastConfirmed();if(confirmed&&restore.phase()==='ready'){const ratio=rendition.book?.locations?.percentageFromCfi(confirmed.location);if(typeof ratio==='number'&&Number.isFinite(ratio)&&ratio>=0){const snapshot={...confirmed,percentage:Math.min(100,ratio*100)};if(restore.confirmProgress(restore.generation(),snapshot)){progressRef.current=snapshot;setEpubPercentage(snapshot.percentage);}}}}).catch(()=>{});
    if(readingLoadedRef.current)runRestoreRef.current(initialAnchorRef.current,'initial');
  };
  useEffect(()=>()=>{sessionRef.current?.dispose();sessionRef.current=null;},[]);

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
    runRestoreRef.current({location:resolvedTarget,percentage:restore.lastConfirmed()?.percentage??0},'initial');
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
      if(disposed)return;window.localStorage.removeItem(getBookmarkStorageKey(currentUser.id,document.id));setEntries(merged);setReadingLoaded(true);readingLoadedRef.current=true;
      const target=new URLSearchParams(window.location.search).get('location')||data.progress?.location;
      if(document.fileType==='EPUB'){
        if(data.progress?.location)restore.seedConfirmed({location:data.progress.location,percentage:data.progress.percentage??0});
        initialAnchorRef.current={location:target||'',percentage:data.progress?.percentage??0};
        if(sessionRef.current)runRestoreRef.current(initialAnchorRef.current,'initial');
      }else{if(target)pendingRestore.current=target;setReadingReady(true);}
      setSyncError('');
    } catch(error) {if(!disposed){setSyncError(error instanceof Error?error.message:'Could not sync reading data');retryTimer=setTimeout(()=>void loadReading(),5000);}}};
    void loadReading();
    return ()=>{disposed=true;controller.abort();clearTimeout(retryTimer);};
  },[document.id,currentUser.id,document.fileType,restore]);
  useEffect(()=>{
    if(!readingReady)return;
    if(pendingRestore.current && (document.fileType==='EPUB'||pdfTextState.status==='ready'||parsePdfPageLocation(pendingRestore.current, document.id)!==null)) {
      const target=pendingRestore.current;pendingRestore.current=null;jumpReadingRef.current(target, false);
    }
  },[readingReady,document.fileType,document.id,pdfTextState.status]);
  useEffect(()=>{
    if(!readingLoaded)return;
    const save=()=>{
      if(document.fileType!=='EPUB'&&pendingRestore.current)return;
      let progress=document.fileType==='EPUB'?restore.lastConfirmed():progressRef.current;
      if(!progress)return;
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
  },[readingLoaded,document.id,document.fileType,document.pageCount,pdfTextState.pageCount,getVisiblePdfBookmarkTarget,progressSync,restore]);
  useEffect(()=>{
    epubContentsRef.current.forEach(c=>c.document.querySelectorAll<HTMLElement>('p,li,blockquote').forEach(node=>{node.style.boxShadow=entries.some(e=>e.kind==='note'&&originalText(node).includes(e.text))?'inset 0 -2px #007aff':'';}));
  },[entries]);
  useEffect(()=>{
    epubContentsRef.current.forEach(c=>c.addStylesheetCss('body, p, li {font-size:'+fontSize+'px !important;line-height:'+lineHeight+' !important;}','reader-typography'));
    if(sessionRef.current&&readingLoadedRef.current){const anchor=restore.lastConfirmed();if(anchor)runRestoreRef.current(anchor,'typography');}
  },[fontSize,lineHeight,restore]);


  const handleLocationChanged = useCallback((nextLocation: string) => {
    if(restore.phase()!=='ready')return;
    if(!useReaderStore.getState().studyPinned && currentLocationRef.current && nextLocation!==currentLocationRef.current){setToolsOpen(false);setShowDetailed(false);closeExplanationPanel();}
    currentLocationRef.current = nextLocation;
    setLocation(nextLocation);
  }, [closeExplanationPanel,restore]);

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
      if(restore.phase()!=='ready')return;
      if(flowRef.current==='vertical'){const port=sessionRef.current?.port,g=port?.geometry();if(port&&g)void moveReadingScreen(port.manager,g,delta<0?-1:1).then(()=>port.reportLocation()).catch(error=>setSyncError(error.message));return;}
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
      data-reading-phase={document.fileType==='EPUB'?readingPhase:readingReady?'ready':'loading'}
      className={`${immersive
        ? 'fixed inset-0 z-[60] flex flex-col w-full overflow-hidden'
        : 'relative flex flex-col h-[100dvh] w-full overflow-hidden'} ${theme === 'dark'
        ? 'bg-[#171717]'
        : 'bg-background'} ${themeClasses[theme]}`}
    >
      {document.fileType === 'EPUB' || document.fileType === 'PDF' ? (
        <>
          <ReaderToolbar onUtility={tab=>{if(flipModeRef.current)return;setUtilityTab(tab);setUtilityOpen(true);}}
            title={document.title}
            navigationKind={document.fileType==='EPUB'&&!fixedLayout&&flow==='vertical'?'screen':'page'}
            positionLabel={document.fileType === 'PDF' ? '第 ' + currentPdfPage + ' 页 / ' + (pdfTotal ?? '…') + ' 页' : '已读 ' + Math.round(epubPercentage) + '%'}
            onPrevious={() => turnPage(-1)} onNext={() => turnPage(1)}
            onBookmark={handleAddBookmark} onContents={() => setDrawerOpen(value => !value)}
            onFullscreen={() => setImmersive(value => !value)} immersive={immersive}
            previousDisabled={document.fileType === 'PDF' && currentPdfPage <= 1}
            nextDisabled={document.fileType === 'PDF' && pdfTotal !== null && currentPdfPage >= pdfTotal}
            bookmarkDisabled={!readingReady || (document.fileType === 'PDF' && (pdfViewMode === 'original' ? pdfReadyPage !== pdfOriginalPage : !pdfTextState.paragraphs.length))}
          >
            <ReadingModeControls format={document.fileType==='EPUB'?(fixedLayout?'epub-fixed':'epub-reflowable'):pdfViewMode==='text'?'pdf-text':'pdf-original'} preferences={readingPreferences.preferences} sourceLanguage={sourceLanguage} busy={semanticFlip.pending>0} status={semanticFlip.message} onFlow={next=>{readingPreferences.setFlow(next);changeFlow(next);}} onFlip={readingPreferences.setSemanticFlip} onTarget={target=>readingPreferences.setTarget(sourceLanguage,target)} onRetry={semanticFlip.retry}/>
            {(document.fileType==='EPUB'||pdfViewMode==='text')&&<MeaningGroupControl enabled={meaningGroupReading} onChange={setMeaningGroupReading} status={meaningGroups} unsupported={meaningGroups.unsupported} skipped={meaningGroups.skipped} onRetry={meaningGroups.retry} lowSaturation={meaningGroupLowSaturation} onLowSaturationChange={setMeaningGroupLowSaturation}/>}
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

      {document.fileType==='EPUB'&&readingPhase==='error'&&<button type="button" className="absolute bottom-8 left-4 z-20 rounded-lg border bg-card px-3 py-2 text-sm" onClick={()=>{setSyncError('');runRestoreRef.current(restore.lastConfirmed()??initialAnchorRef.current,'initial');}}>重试阅读定位</button>}
      {syncError&&<div role="alert" className="absolute bottom-20 left-4 z-20 max-w-sm rounded-xl bg-red-50 p-3 text-sm text-red-800">阅读同步失败：{syncError}。稍后将自动重试。</div>}

      <div className="sr-only" aria-live="polite">{semanticFlip.lastChange&&<><span lang={sourceLanguage}>{semanticFlip.lastChange.original}</span>{' → '}<span lang={flipDomain.targetLanguage}>{semanticFlip.lastChange.replacement}</span></>}</div>
      <style>{'::highlight(reader-hover-word){background-color:#c7dfff;color:#12243b;}'}</style>
      {!effectiveFlip&&<ReaderUtilities open={utilityOpen} onClose={()=>setUtilityOpen(false)}><ReadingTools initialTab={utilityTab} documentId={document.id} selection={toolSelection} open={utilityOpen} embedded onOpen={()=>{setShowDetailed(false);setToolsOpen(true);}} onClose={()=>setUtilityOpen(false)} entries={entries} onSave={saveReadingEntry}
        onDelete={async id=>{await readingRequest('/api/documents/'+document.id+'/reading?entryId='+encodeURIComponent(id),{method:'DELETE'});setEntries(items=>items.filter(item=>item.id!==id));}}
        onJump={jumpReading} onDetailed={()=>{if(toolSelection)setSelectedParagraph({key:toolSelection.location,text:toolSelection.text,preferredPanelSide:'right',anchorY:100,paragraphBounds:{left:24,top:80,right:320,bottom:160}});setToolsOpen(false);setShowDetailed(true);}} onRestoreSelection={setToolSelection}
        onQuote={quote=>{const content=epubContentsRef.current.find(c=>originalText(c.document.body).includes(quote));if(content){const node=Array.from(content.document.querySelectorAll('p,li')).find(e=>originalText(e).includes(quote));node?.scrollIntoView({block:'center'});if(node) {(node as HTMLElement).style.backgroundColor='rgba(0,122,255,.15)';}}else{const paragraph=pdfTextState.paragraphs.find(p=>p.text.includes(quote));if(paragraph)jumpToPdfBookmark(getPdfSelectionKey(document.id,paragraph.id));}}}/></ReaderUtilities>}
      <StudyDock flow={document.fileType==='PDF'?'vertical':flow} kind={showDetailed?'paragraph':'word'} anchorHandle={toolSelection?.anchorHandle} onReturnToSource={()=>toolSelection&&jumpReading(toolSelection.location)} anchor={toolSelection?.anchor} open={!effectiveFlip&&(toolsOpen || Boolean(selectedParagraph && showDetailed))} side={(showDetailed?selectedParagraph?.preferredPanelSide:toolSelection?.side)||'right'} title={showDetailed?'段落结构与语法':'语境查词 · 阅读工具'} onClose={()=>{setToolsOpen(false);setShowDetailed(false);closeExplanationPanel();}} panel={effectiveFlip?null:selectedParagraph && showDetailed ? (
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
<WordLookupContent userId={currentUser.id} documentId={document.id} selection={toolSelection} entries={entries} onSave={saveReadingEntry}/>
      )}>
      <div className="relative h-full min-h-0">
        {document.fileType === 'EPUB' ? (
          <>
          <ReactReader
            key={`${document.id}:${flow}:${fixedLayout}`}
            epubOptions={fixedLayout?{}:readingFlowOptions(flow)}
            url={`/api/documents/${document.id}/raw`}
            title={document.title}
            showToc={false}
            location={location}
            locationChanged={handleLocationChanged}
            tocChanged={(toc) => setTocItems(toc as TocItem[])}
            getRendition={getRendition}
            readerStyles={getReaderTheme(theme)}
            epubInitOptions={{ openAs: 'epub' }}
          />
          <ReaderEdgeNavigation flow={fixedLayout?'paginated':flow} ready={readingReady} onTurn={turnPage} hasSelection={()=>!canFlipPointer(globalThis.document)||epubContentsRef.current.some(contents=>!canFlipPointer(contents.document))}/>
          </>
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
            <div data-pdf-text-scroll className={pdfViewMode === 'text' ? 'min-h-0 flex-1 overflow-y-auto' : 'hidden'} onScroll={() => {notifyGeometry();const page = getVisiblePdfBookmarkTarget()?.pageNumber;if(page) setPdfVisiblePage(page);}}>
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
                              !effectiveFlip && selectedParagraph?.key === selectionKey;
                            const explanation = isActive
                              ? pdfExplanations[selectionKey]
                              : null;

                            return (
                              <div key={paragraph.id} className="group relative">
                              <button disabled={effectiveFlip} type="button" aria-label="分析本段结构与语法" title="分析本段结构与语法" className="float-right ml-2 rounded border border-border bg-card px-2 py-0.5 text-xs text-foreground hover:bg-muted" onClick={event=>openPdfParagraph(paragraph,event.currentTarget.parentElement!)}>段落分析</button>
                              <button
                                type="button"
                                data-pdf-selection-key={selectionKey}
                                tabIndex={effectiveFlip?-1:0}
                                style={{fontSize, lineHeight,overflowWrap:'anywhere'}}
                                onMouseMove={event=>highlightWord(event.currentTarget.ownerDocument,wordAtPoint(event.currentTarget.ownerDocument,event.clientX,event.clientY,event.currentTarget)?.range)}
                                onMouseLeave={event=>highlightWord(event.currentTarget.ownerDocument)}
                                onClick={(event) =>
                                  handlePdfParagraphClick(paragraph, event)
                                }
                                className={cn(
                                  'mb-[1em] block w-full break-words rounded-md px-0.5 py-0.5 text-left font-sans text-inherit transition-colors focus-visible:outline-none',
                                  !effectiveFlip && 'focus-visible:ring-2',
                                  'whitespace-pre-line',
                                  entries.some(e=>e.kind==='note'&&e.location===selectionKey)?'underline decoration-orange-400 decoration-2 underline-offset-4':'',
                                  !effectiveFlip && pdfReaderParagraphClasses[theme],
                                  isActive
                                    ? pdfReaderActiveParagraphClasses[theme]
                                    : 'bg-transparent'
                                )}
                              >
                                <span>
                                  {effectiveFlip?paragraph.text:renderPdfAnnotatedText(
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
