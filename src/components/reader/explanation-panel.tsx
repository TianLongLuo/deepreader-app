'use client';

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { BookOpen, Sparkles, Languages, ListTree, Info, RefreshCw, Volume2, Loader2, ChevronDown } from 'lucide-react';
import { useReaderStore } from '@/hooks/use-reader-store';
import { Button } from '@/components/ui/button';
import type { ParagraphExplanationOutput } from '@/types/explanation';

type ExplanationPanelProps = {
  documentId: string;
  text: string;
  selectionKey: string;
  onClose?: () => void;
  onActiveSentenceChange?: (selectionKey: string, index: number | null) => void;
  onFocusTargetChange?: (
    selectionKey: string,
    target: ActiveFocusTarget | null
  ) => void;
  onExplanationReady?: (
    selectionKey: string,
    explanation: ParagraphExplanationOutput | null
  ) => void;
};

type ExplanationData = {
  status: string;
  cached?: boolean;
  output: ParagraphExplanationOutput | null;
  error?: string;
};

type GrammarNoteItem = ParagraphExplanationOutput['grammar_notes'][number];
type LogicFlowItem = NonNullable<ParagraphExplanationOutput['logic_flow']>[number];
type VocabularyNoteItem = ParagraphExplanationOutput['vocabulary_notes'][number];

type PronunciationStatus = Record<string, 'loading' | 'error'>;
type LearningDepth = 'quick' | 'structure' | 'grammar';
type ActiveFocusTarget =
  | { type: 'sentence'; sentenceIndex: number }
  | { type: 'clause'; sentenceIndex: number; text: string }
  | {
      type: 'reference';
      sentenceIndex: number;
      expression: string;
      refersTo: string;
    };

type ClauseMapItem = {
  clause_text: string;
  clause_type?: string;
  chinese_type?: string;
  connector?: string;
  full_sentence?: string;
  main_clause?: string;
  modifies?: string;
  role_in_sentence?: string;
};

type ReferenceMapItem = {
  expression: string;
  refers_to: string;
  evidence?: string;
};

type LearningFocus = {
  plain_takeaway?: string;
  why_it_is_hard?: string[];
  reading_tip?: string;
};

type StructureBreakdownItem = {
  sentence_index: number;
  sentence_text: string;
  sentence_pattern?: string;
  clause_type?: string;
  clause_role?: string;
  subject_modifier?: string;
  subject_core?: string;
  verb_modifier?: string;
  verb_core?: string;
  object_modifier?: string;
  object_core?: string;
  connector?: string;
  logic?: string;
  logic_breakdown?: string;
  clause_map?: ClauseMapItem[];
  reference_map?: ReferenceMapItem[];
  learning_focus?: LearningFocus;
  explanation: string;
};

function cleanActionSlot(value?: string | null) {
  if (typeof value !== 'string') {
    return '';
  }

  const normalized = value.trim();
  const placeholders = new Set([
    '什么样的',
    '谁',
    '怎么样的',
    '干了',
    '事',
    'who',
    'did what',
    'to whom/what',
    'what kind of subject',
    'core who',
    'how/in what manner',
    'core verb/action',
    'what kind of object/event',
    'core object/event',
  ]);

  return placeholders.has(normalized.toLowerCase()) ? '' : normalized;
}

function getWordCount(value: string) {
  return value.split(/\s+/).filter(Boolean).length;
}

function cleanCoreSlot(
  value: string,
  role: 'actor' | 'action' | 'target'
) {
  const normalized = cleanActionSlot(value);

  if (!normalized) {
    return '';
  }

  const lower = normalized.toLowerCase();
  const clausePattern =
    /\b(who|which|that|when|where|while|because|although|though|if|unless|as|after|before|since|the more|the less|the harder)\b/;

  if (role === 'actor' && (clausePattern.test(lower) || getWordCount(normalized) > 4)) {
    return '';
  }

  if (role === 'action' && getWordCount(normalized) > 4) {
    return '';
  }

  if (role === 'target' && getWordCount(normalized) > 6) {
    return '';
  }

  if (
    role === 'target' &&
    /^(back|away|out|around|up|down|off|over|through)$/i.test(normalized)
  ) {
    return '';
  }

  return normalized;
}

function ActionUnderline({
  value,
  className,
}: {
  value?: string;
  className: string;
}) {
  if (!value) {
    return null;
  }

  return (
    <span
      className={`font-medium underline decoration-2 underline-offset-4 ${className}`}
    >
      {value}
    </span>
  );
}

type OrderedStructureToken = {
  text: string;
  role:
    | 'subject_modifier'
    | 'subject_core'
    | 'verb_modifier'
    | 'verb_core'
    | 'object_modifier'
    | 'object_core';
  label: string;
  className: string;
  start: number;
  end: number;
};

const STRUCTURE_TOKEN_STYLES: Record<
  OrderedStructureToken['role'],
  { label: string; className: string; underline: boolean }
> = {
  subject_modifier: {
    label: '修饰主语',
    className: 'text-stone-600/80',
    underline: false,
  },
  subject_core: {
    label: '主语核心',
    className: 'text-amber-800 decoration-amber-500 dark:text-amber-300',
    underline: true,
  },
  verb_modifier: {
    label: '修饰动作',
    className: 'text-stone-600/80',
    underline: false,
  },
  verb_core: {
    label: '动作核心',
    className: 'text-emerald-700 decoration-emerald-500 dark:text-emerald-300',
    underline: true,
  },
  object_modifier: {
    label: '修饰宾语/事件',
    className: 'text-stone-600/80',
    underline: false,
  },
  object_core: {
    label: '宾语/事件核心',
    className: 'text-indigo-700 decoration-indigo-400 dark:text-indigo-300',
    underline: true,
  },
};

const PREPOSITION_PATTERN =
  /^(against|into|onto|to|at|from|with|without|along|around|before|after|over|under|beside|behind|through|out of|in|on|for|of)\b/i;
const CONNECTOR_PATTERN =
  /\b(and|but|or|while|because|if|when|although|though|so|then)\b/i;

function overlapsStructureToken(
  tokens: OrderedStructureToken[],
  start: number,
  end: number
) {
  return tokens.some((token) => start < token.end && end > token.start);
}

function findStructureTokenStart(
  sourceText: string,
  phrase: string,
  from: number,
  tokens: OrderedStructureToken[]
) {
  const normalizedPhrase = cleanActionSlot(phrase);
  if (!normalizedPhrase) {
    return -1;
  }

  const searchableSource = sourceText
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .toLowerCase();
  const lowerPhrase = normalizedPhrase
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .toLowerCase();
  const starts = [from, 0];
  const isWordCharacter = (character?: string) =>
    Boolean(character && /[A-Za-z0-9]/.test(character));
  const hasWordBoundary = (start: number, end: number) => {
    const first = sourceText[start];
    const last = sourceText[end - 1];

    if (isWordCharacter(first) && isWordCharacter(sourceText[start - 1])) {
      return false;
    }

    if (isWordCharacter(last) && isWordCharacter(sourceText[end])) {
      return false;
    }

    return true;
  };

  for (const startAt of starts) {
    let index = searchableSource.indexOf(lowerPhrase, startAt);

    while (index !== -1) {
      const end = index + normalizedPhrase.length;

      if (
        !overlapsStructureToken(tokens, index, end) &&
        hasWordBoundary(index, end)
      ) {
        return index;
      }

      index = searchableSource.indexOf(lowerPhrase, index + 1);
    }
  }

  return -1;
}

function getOrderedStructureTokens(item: StructureBreakdownItem) {
  const sourceText = item.sentence_text || '';
  const tokens: OrderedStructureToken[] = [];
  let cursor = 0;
  const candidates: Array<[OrderedStructureToken['role'], string | undefined]> = [
    ['subject_modifier', item.subject_modifier],
    ['subject_core', item.subject_core],
    ['verb_modifier', item.verb_modifier],
    ['verb_core', item.verb_core],
    ['object_modifier', item.object_modifier],
    ['object_core', item.object_core],
  ];

  candidates.forEach(([role, value]) => {
    const text = cleanActionSlot(value);
    if (!text) {
      return;
    }

    const start = findStructureTokenStart(sourceText, text, cursor, tokens);
    if (start === -1) {
      return;
    }

    const end = start + text.length;
    tokens.push({
      text: sourceText.slice(start, end),
      role,
      start,
      end,
      ...STRUCTURE_TOKEN_STYLES[role],
    });
    cursor = end;
  });

  return tokens.sort((a, b) => a.start - b.start);
}

function getConnectorLabel(gapText: string, bilingualMode: boolean) {
  const connector = gapText.match(CONNECTOR_PATTERN)?.[1]?.toLowerCase();
  if (!connector) {
    return null;
  }

  if (!bilingualMode) {
    if (connector === 'and' || connector === 'or') {
      return 'Coordinating conjunction';
    }
    if (connector === 'but') {
      return 'Contrast conjunction';
    }
    return 'Subordinating connector';
  }

  if (connector === 'and' || connector === 'or') {
    return '并列连词 / Coordinating conjunction';
  }
  if (connector === 'but') {
    return '转折连词 / Contrast conjunction';
  }
  return '从属连接词 / Subordinating connector';
}

function getTokenRoleLabel(
  token: OrderedStructureToken,
  bilingualMode: boolean
) {
  const isPreposition = PREPOSITION_PATTERN.test(token.text);

  if (!bilingualMode) {
    if (isPreposition) {
      return 'Preposition';
    }

    const roleMap: Record<OrderedStructureToken['role'], string> = {
      subject_modifier: 'Subject modifier',
      subject_core: 'Subject',
      verb_modifier: 'Verb modifier',
      verb_core: 'Verb / action',
      object_modifier: 'Object modifier',
      object_core: 'Object / event',
    };

    return roleMap[token.role];
  }

  if (isPreposition) {
    return '介词 / Preposition';
  }

  const roleMap: Record<OrderedStructureToken['role'], string> = {
    subject_modifier: '主语修饰语 / Subject modifier',
    subject_core: '主语 / Subject',
    verb_modifier: '动作修饰语 / Verb modifier',
    verb_core: '动词/动作 / Verb',
    object_modifier: '宾语/事件修饰语 / Object modifier',
    object_core: '宾语/事件 / Object',
  };

  return roleMap[token.role];
}

function getStructurePatternLabel(
  item: StructureBreakdownItem,
  bilingualMode: boolean
) {
  const sourceText = item.sentence_text || '';
  const tokens = getOrderedStructureTokens(item);

  if (tokens.length === 0) {
    return bilingualMode
      ? '句子整体补充背景或状态'
      : 'Sentence-level background or state';
  }

  const labels: string[] = [];
  let previousEnd = 0;

  tokens.forEach((token, index) => {
    const gapLabel = getConnectorLabel(
      sourceText.slice(previousEnd, token.start),
      bilingualMode
    );

    if (gapLabel && labels[labels.length - 1] !== gapLabel) {
      labels.push(gapLabel);
    }

    const currentLabel = getTokenRoleLabel(token, bilingualMode);
    const nextToken = tokens[index + 1];

    if (
      PREPOSITION_PATTERN.test(token.text) &&
      nextToken?.role === 'object_core' &&
      nextToken.start >= token.end
    ) {
      labels.push(bilingualMode ? '介词短语 / Prepositional phrase' : 'Prepositional phrase');
      previousEnd = nextToken.end;
      return;
    }

    if (
      index > 0 &&
      PREPOSITION_PATTERN.test(tokens[index - 1].text) &&
      token.role === 'object_core'
    ) {
      previousEnd = token.end;
      return;
    }

    if (labels[labels.length - 1] !== currentLabel) {
      labels.push(currentLabel);
    }
    previousEnd = token.end;
  });

  return labels.join(bilingualMode ? ' + ' : ' + ');
}

function OrderedStructureLine({ item }: { item: StructureBreakdownItem }) {
  const sourceText = item.sentence_text || '';
  const tokens = getOrderedStructureTokens(item);

  if (!sourceText) {
    return null;
  }

  if (tokens.length === 0) {
    return <p className="text-[15px] leading-8 text-orange-950">{sourceText}</p>;
  }

  const elements: ReactNode[] = [];
  let cursor = 0;

  tokens.forEach((token, index) => {
    if (token.start > cursor) {
      elements.push(
        <span key={`text-${index}`}>{sourceText.slice(cursor, token.start)}</span>
      );
    }

    elements.push(
      <span
        key={`token-${index}`}
        title={token.label}
        className={`font-medium ${
          STRUCTURE_TOKEN_STYLES[token.role].underline
            ? 'underline decoration-2 underline-offset-4'
            : ''
        } ${token.className}`}
      >
        {sourceText.slice(token.start, token.end)}
      </span>
    );
    cursor = token.end;
  });

  if (cursor < sourceText.length) {
    elements.push(<span key="text-end">{sourceText.slice(cursor)}</span>);
  }

  return (
    <p className="text-[15px] leading-8 text-orange-950">
      {elements}
    </p>
  );
}

function buildCoreFormula(item: StructureBreakdownItem, bilingualMode: boolean) {
  const subject = cleanActionSlot(item.subject_core);
  const verb = cleanActionSlot(item.verb_core);
  const predicate = cleanActionSlot(item.object_core || item.object_modifier);
  const parts = [
    subject || (bilingualMode ? '省略/承前主语 / implied subject' : 'implied subject'),
    verb || (bilingualMode ? '省略谓语 / implied verb' : 'implied verb'),
    predicate || (bilingualMode ? '补足信息 / complement' : 'complement'),
  ];

  return parts.join(' -> ');
}

function getExpansionText(item: StructureBreakdownItem, bilingualMode: boolean) {
  const expansions = [
    cleanActionSlot(item.connector),
    cleanActionSlot(item.subject_modifier),
    cleanActionSlot(item.verb_modifier),
    cleanActionSlot(item.object_modifier),
    cleanActionSlot(item.clause_type),
  ].filter(Boolean);

  if (expansions.length === 0) {
    return bilingualMode
      ? '这一句主要靠主干推进，没有特别重的从句或修饰。'
      : 'This part is carried mostly by the core trunk, with no heavy clause expansion.';
  }

  return expansions.join(' / ');
}

function splitBilingualText(value?: string | null) {
  const text = cleanActionSlot(value);
  if (!text) {
    return { primary: '', secondary: '' };
  }

  const lines = text
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length >= 2) {
    return {
      primary: lines[0],
      secondary: lines.slice(1).join('\n'),
    };
  }

  return { primary: text, secondary: '' };
}

function BilingualTextBlock({
  value,
  secondary,
  bilingualMode,
  className,
}: {
  value?: string | null;
  secondary?: string | null;
  bilingualMode: boolean;
  className?: string;
}) {
  const split = splitBilingualText(value);
  const fallbackSecondary = bilingualMode ? cleanActionSlot(secondary) : '';
  const secondaryText = split.secondary || fallbackSecondary;

  return (
    <div className={className}>
      <p className="whitespace-pre-line">{split.primary || value}</p>
      {bilingualMode && secondaryText ? (
        <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-orange-900/60">
          {secondaryText}
        </p>
      ) : null}
    </div>
  );
}

function StructureLearningPath({
  item,
  bilingualMode,
}: {
  item: StructureBreakdownItem;
  bilingualMode: boolean;
}) {
  const steps = [
    {
      label: bilingualMode ? '1. 抓主干 / Core Trunk' : '1. Core Trunk',
      value: buildCoreFormula(item, bilingualMode),
      hint: bilingualMode ? '先只看谁做什么/是什么 / Read who/what does what first' : 'Read who/what does what first',
    },
    {
      label: bilingualMode ? '2. 判五大句型 / Pattern' : '2. Pattern',
      value: cleanActionSlot(item.sentence_pattern) || (bilingualMode ? '按主干判断句型 / Infer from the trunk' : 'Infer from the trunk'),
      hint: bilingualMode ? 'SV / SVC / SVO / SVOO / SVOC' : 'SV / SVC / SVO / SVOO / SVOC',
    },
    {
      label: bilingualMode ? '3. 看扩展 / Expansion' : '3. Expansion',
      value: getExpansionText(item, bilingualMode),
      hint: bilingualMode ? '从句、介词短语、否定、方式、方向 / Clauses, phrases, negation, manner, direction' : 'Clauses, phrases, negation, manner, direction',
    },
    {
      label: bilingualMode ? '4. 合并逻辑 / Logic' : '4. Logic',
      value:
        cleanActionSlot(item.logic) ||
        cleanActionSlot(item.clause_role) ||
        (bilingualMode ? '看它如何推进上下文 / Connect it to the surrounding idea' : 'Connect it to the surrounding idea'),
      hint: bilingualMode ? '原因/条件/时间/转折/结果/主要动作 / Cause, condition, time, contrast, result, main action' : 'Cause, condition, time, contrast, result, main action',
    },
  ];

  return (
    <div className="grid gap-1.5">
      {steps.map((step) => (
        <div
          key={step.label}
          className="rounded-xl border border-orange-200/80 bg-orange-50/70 px-3 py-1.5 text-orange-950 shadow-sm"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-[10px] font-bold uppercase tracking-wider text-orange-900/65">
              {step.label}
            </div>
            <div className="text-[10px] leading-relaxed text-orange-900/65">
              {step.hint}
            </div>
          </div>
          <div className="mt-1 text-xs font-medium leading-relaxed text-orange-950/90">
            {step.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function StructureLegend({ bilingualMode }: { bilingualMode: boolean }) {
  const items = [
    {
      label: bilingualMode ? '主语 / Subject' : 'Subject',
      className: 'bg-amber-400',
    },
    {
      label: bilingualMode ? '动词 / Verb' : 'Verb',
      className: 'bg-emerald-400',
    },
    {
      label: bilingualMode ? '宾语/补语 / Object' : 'Object',
      className: 'bg-indigo-400',
    },
  ];

  return (
    <div className="pointer-events-none absolute bottom-3 left-4 z-30 rounded-xl border border-orange-200/90 bg-white/90 px-3 py-2 text-[10px] text-orange-900/70 shadow-lg shadow-orange-200/40 backdrop-blur">
      <div className="flex items-center gap-3">
        {items.map((item) => (
          <span key={item.label} className="inline-flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${item.className}`} />
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function SentenceDetail({
  item,
  displayIndex,
  bilingualMode,
  pronunciationStatus,
  onPlayPronunciation,
}: {
  item: StructureBreakdownItem;
  displayIndex: number;
  bilingualMode: boolean;
  pronunciationStatus: PronunciationStatus;
  onPlayPronunciation: (text: string) => void;
}) {
  return (
    <div className="border-t border-orange-200/70 bg-orange-50/55 px-4 py-3">
      <div className="rounded-xl border border-orange-200/70 bg-white/70 px-4 py-3">
        <div className="mb-2 flex items-center justify-between gap-3">
          <span className="text-[10px] font-bold uppercase tracking-wider text-orange-900/65">
            {bilingualMode ? `第 ${displayIndex} 句原句` : `Sentence ${displayIndex}`}
          </span>
          <PronunciationButton
            text={item.sentence_text}
            label={bilingualMode ? '播放句子发音 / Play sentence pronunciation' : 'Play sentence pronunciation'}
            status={pronunciationStatus[pronunciationKey(item.sentence_text)]}
            onPlay={onPlayPronunciation}
          />
        </div>
        <OrderedStructureLine item={item} />
      </div>

      {item.explanation && (
        <div className="mt-3 rounded-xl border border-orange-200/60 bg-white/60 px-4 py-3">
          <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-orange-900/65">
            {bilingualMode ? '详细解析 / Detailed Analysis' : 'Detailed Analysis'}
          </div>
          <div className="whitespace-pre-line text-sm leading-relaxed text-orange-950/90">
            {item.explanation}
          </div>
        </div>
      )}

      {item.clause_map && item.clause_map.length > 0 && (
        <div className="mt-3 rounded-xl border border-orange-200/60 bg-white/60 px-4 py-3">
          <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-orange-900/65">
            {bilingualMode ? '从句分析 / Clause Analysis' : 'Clause Analysis'}
          </div>
          <div className="space-y-2">
            {item.clause_map.map((clause, ci) => (
              <div key={ci} className="rounded-lg border border-orange-200/50 bg-orange-50/50 px-3 py-2">
                <div className="text-xs font-semibold text-orange-800">{clause.clause_text}</div>
                <div className="mt-1 flex flex-wrap gap-2 text-[11px]">
                  {clause.clause_type && (
                    <span className="rounded-md bg-orange-100 px-1.5 py-0.5 text-orange-700">
                      {clause.chinese_type ? `${clause.chinese_type} / ` : ''}{clause.clause_type}
                    </span>
                  )}
                  {clause.connector && (
                    <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-amber-700">
                      {bilingualMode ? '连接词' : 'Connector'}: {clause.connector}
                    </span>
                  )}
                  {clause.role_in_sentence && (
                    <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-emerald-700">
                      {clause.role_in_sentence}
                    </span>
                  )}
                </div>
                {clause.modifies && (
                  <div className="mt-1 text-[11px] text-orange-900/60">
                    {bilingualMode ? '修饰' : 'Modifies'}: {clause.modifies}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {item.reference_map && item.reference_map.length > 0 && (
        <div className="mt-3 rounded-xl border border-orange-200/60 bg-white/60 px-4 py-3">
          <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-orange-900/65">
            {bilingualMode ? '指代关系 / Reference Map' : 'Reference Map'}
          </div>
          <div className="space-y-1.5">
            {item.reference_map.map((ref, ri) => (
              <div key={ri} className="flex items-start gap-2 text-sm">
                <span className="shrink-0 font-semibold text-orange-700">{ref.expression}</span>
                <span className="text-orange-900/50">→</span>
                <span className="text-orange-950/80">{ref.refers_to}</span>
                {ref.evidence && (
                  <span className="text-[11px] text-orange-900/50">({ref.evidence})</span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {item.learning_focus && (
        <div className="mt-3 rounded-xl border border-orange-200/60 bg-orange-50/70 px-4 py-3">
          <div className="mb-2 text-[10px] font-bold uppercase tracking-wider text-orange-900/65">
            {bilingualMode ? '学习要点 / Learning Focus' : 'Learning Focus'}
          </div>
          {item.learning_focus.plain_takeaway && (
            <p className="text-sm leading-relaxed text-orange-950/85">{item.learning_focus.plain_takeaway}</p>
          )}
          {item.learning_focus.why_it_is_hard && item.learning_focus.why_it_is_hard.length > 0 && (
            <div className="mt-2">
              <div className="text-[11px] font-semibold text-orange-900/60 mb-1">
                {bilingualMode ? '难点' : '难点 / Why it is hard'}
              </div>
              <ul className="list-disc pl-4 space-y-0.5">
                {item.learning_focus.why_it_is_hard.map((h, hi) => (
                  <li key={hi} className="text-xs text-orange-950/75">{h}</li>
                ))}
              </ul>
            </div>
          )}
          {item.learning_focus.reading_tip && (
            <p className="mt-2 text-xs italic text-orange-900/60">{item.learning_focus.reading_tip}</p>
          )}
        </div>
      )}

      <div className="mt-4">
        <StructureLearningPath item={item} bilingualMode={bilingualMode} />
      </div>
    </div>
  );
}

function SentenceAccordionList({
  items,
  activeIndex,
  setActiveIndex,
  bilingualMode,
  pronunciationStatus,
  onPlayPronunciation,
}: {
  items: StructureBreakdownItem[];
  activeIndex: number | null;
  setActiveIndex: (index: number | null) => void;
  bilingualMode: boolean;
  pronunciationStatus: PronunciationStatus;
  onPlayPronunciation: (text: string) => void;
}) {
  return (
    <div className="space-y-2">
      {items.map((item, index) => {
        const expanded = activeIndex === index;
        return (
          <div key={`${item.sentence_index}-${index}`} className="overflow-hidden rounded-2xl border border-orange-200/80 bg-white/72 shadow-sm">
            <button
              type="button"
              onClick={() => setActiveIndex(expanded ? null : index)}
              className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-orange-100/70"
              aria-expanded={expanded}
            >
              <span className="mt-0.5 shrink-0 rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[11px] font-semibold text-orange-800">
                {bilingualMode ? `第 ${index + 1} 句` : `Sentence ${index + 1}`}
              </span>
              <span className="min-w-0 flex-1 text-sm leading-relaxed text-orange-950/90">
                {item.sentence_text}
              </span>
              <ChevronDown
                className={`mt-1 h-4 w-4 shrink-0 text-orange-900/65 transition-transform ${
                  expanded ? 'rotate-180' : ''
                }`}
              />
            </button>
            {expanded && (
              <SentenceDetail
                item={item}
                displayIndex={index + 1}
                bilingualMode={bilingualMode}
                pronunciationStatus={pronunciationStatus}
                onPlayPronunciation={onPlayPronunciation}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function formatLogicRelation(relation: string, bilingualMode: boolean) {
  if (!bilingualMode) {
    return relation;
  }

  const relationMap: Record<string, string> = {
    'core action': '主干动作 / core action',
    then: '然后 / then',
    'main idea': '主旨 / main idea',
    setup: '铺垫 / setup',
    action: '动作 / action',
    result: '结果 / result',
    contrast: '转折 / contrast',
    cause: '原因 / cause',
    emphasis: '强调 / emphasis',
  };

  return relationMap[relation.trim().toLowerCase()] || relation;
}

function buildFallbackLogicFlow(
  result: ParagraphExplanationOutput,
  bilingualMode: boolean
): LogicFlowItem[] {
  if (Array.isArray(result.logic_flow)) {
    return result.logic_flow;
  }

  if (result.sentence_breakdown && result.sentence_breakdown.length > 0) {
    return result.sentence_breakdown.map((sentence, index) => ({
      step: index + 1,
      text: sentence.sentence_text,
      relation:
        sentence.logic ||
        (bilingualMode ? `第 ${sentence.sentence_index} 句` : `Sentence ${sentence.sentence_index}`),
      explanation: sentence.explanation,
    }));
  }

  if (result.who_did_what && result.who_did_what.length > 0) {
    return result.who_did_what.map((item, index) => {
      const actor =
        cleanCoreSlot(item.actor_core || '', 'actor') ||
        cleanCoreSlot(item.actor, 'actor');
      const action =
        cleanCoreSlot(item.action_core || '', 'action') ||
        cleanCoreSlot(item.action, 'action');
      const target =
        cleanCoreSlot(item.target_core || '', 'target') ||
        cleanCoreSlot(item.target, 'target');
      const text = [actor, action, target].filter(Boolean).join(' ');

      return {
        step: index + 1,
        text: text || 'Core action',
        relation: bilingualMode
          ? index === 0
            ? '主干动作'
            : '然后'
          : index === 0
            ? 'Core Action'
            : 'Then',
        explanation:
          item.extra ||
          [actor, action, target]
            .filter(Boolean)
            .join(' -> ') ||
          (bilingualMode
            ? '这一步帮助你看清句子意思是怎样往前推进的。'
            : 'This step shows how the sentence meaning moves forward.'),
      };
    });
  }

  return [
    {
      step: 1,
      text: result.paragraph_summary,
      relation: bilingualMode ? '主旨 / Main Idea' : 'Main Idea',
      explanation: result.plain_meaning,
    },
  ];
}

function buildStructureBreakdown(
  result: ParagraphExplanationOutput
): StructureBreakdownItem[] {
  if (result.sentence_breakdown && result.sentence_breakdown.length > 0) {
    return result.sentence_breakdown;
  }

  return (result.who_did_what || []).map((item, index) => ({
    sentence_index: index + 1,
    sentence_text: [item.actor, item.action, item.target]
      .filter(Boolean)
      .join(' '),
    subject_modifier: item.actor_modifier,
    subject_core:
      cleanCoreSlot(item.actor_core || '', 'actor') ||
      cleanCoreSlot(item.actor, 'actor'),
    verb_modifier: item.action_modifier,
    verb_core:
      cleanCoreSlot(item.action_core || '', 'action') ||
      cleanCoreSlot(item.action, 'action'),
    object_modifier: item.target_modifier,
    object_core:
      cleanCoreSlot(item.target_core || '', 'target') ||
      cleanCoreSlot(item.target, 'target'),
    explanation:
      item.extra || 'This core action carries one step of the paragraph meaning.',
  }));
}

async function readJsonResponse(response: Response) {
  const rawText = await response.text();

  if (!rawText.trim()) {
    return {};
  }

  try {
    return JSON.parse(rawText);
  } catch {
    if (rawText.trimStart().startsWith('<')) {
      throw new Error(
        'The server returned an HTML error page before the AI analysis could finish. Please retry.'
      );
    }

    throw new Error(
      `The server returned an unreadable response: ${rawText.slice(0, 160)}`
    );
  }
}

function createEmptyExplanationOutput(): ParagraphExplanationOutput {
  return {
    paragraph_summary: '',
    plain_meaning: '',
    sentence_roles: [],
    who_did_what: [],
    vocabulary_notes: [],
    grammar_notes: [],
    logic_flow: [],
    sentence_breakdown: [],
  };
}

function readJsonStringAt(source: string, start: number) {
  if (source[start] !== '"') {
    return null;
  }

  let escaped = false;
  for (let index = start + 1; index < source.length; index += 1) {
    const character = source[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (character === '\\') {
      escaped = true;
      continue;
    }

    if (character === '"') {
      try {
        return {
          value: JSON.parse(source.slice(start, index + 1)) as string,
          end: index + 1,
        };
      } catch {
        return null;
      }
    }
  }

  return null;
}

function extractStringField(source: string, field: string) {
  const marker = `"${field}"`;
  const markerIndex = source.indexOf(marker);
  if (markerIndex === -1) {
    return '';
  }

  const colonIndex = source.indexOf(':', markerIndex + marker.length);
  if (colonIndex === -1) {
    return '';
  }

  const quoteIndex = source.indexOf('"', colonIndex + 1);
  if (quoteIndex === -1) {
    return '';
  }

  return readJsonStringAt(source, quoteIndex)?.value || '';
}

function extractCompleteArrayObjects(source: string, field: string) {
  const marker = `"${field}"`;
  const markerIndex = source.indexOf(marker);
  if (markerIndex === -1) {
    return [];
  }

  const arrayStart = source.indexOf('[', markerIndex + marker.length);
  if (arrayStart === -1) {
    return [];
  }

  const items: any[] = [];
  let objectStart = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = arrayStart + 1; index < source.length; index += 1) {
    const character = source[index];

    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === '\\') {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }

    if (character === '"') {
      inString = true;
      continue;
    }

    if (character === '{') {
      if (depth === 0) {
        objectStart = index;
      }
      depth += 1;
      continue;
    }

    if (character === '}') {
      depth -= 1;
      if (depth === 0 && objectStart !== -1) {
        try {
          items.push(JSON.parse(source.slice(objectStart, index + 1)));
        } catch {}
        objectStart = -1;
      }
      continue;
    }

    if (character === ']' && depth === 0) {
      break;
    }
  }

  return items;
}

function normalizePartialExplanationOutput(
  value: Partial<ParagraphExplanationOutput>
): ParagraphExplanationOutput {
  const empty = createEmptyExplanationOutput();

  return {
    ...empty,
    ...value,
    sentence_roles: Array.isArray(value.sentence_roles)
      ? value.sentence_roles
      : [],
    who_did_what: Array.isArray(value.who_did_what)
      ? value.who_did_what
      : [],
    vocabulary_notes: Array.isArray(value.vocabulary_notes)
      ? value.vocabulary_notes
      : [],
    grammar_notes: Array.isArray(value.grammar_notes)
      ? value.grammar_notes
      : [],
    logic_flow: Array.isArray(value.logic_flow) ? value.logic_flow : [],
    sentence_breakdown: Array.isArray(value.sentence_breakdown)
      ? value.sentence_breakdown
      : [],
  };
}

function parsePartialExplanationOutput(rawContent: string) {
  const trimmed = rawContent.trim();
  if (!trimmed) {
    return null;
  }

  try {
    return normalizePartialExplanationOutput(
      JSON.parse(trimmed) as ParagraphExplanationOutput
    );
  } catch {}

  const partial = normalizePartialExplanationOutput({
    paragraph_summary: extractStringField(trimmed, 'paragraph_summary'),
    plain_meaning: extractStringField(trimmed, 'plain_meaning'),
    sentence_roles: extractCompleteArrayObjects(trimmed, 'sentence_roles'),
    sentence_breakdown: extractCompleteArrayObjects(trimmed, 'sentence_breakdown'),
    vocabulary_notes: extractCompleteArrayObjects(trimmed, 'vocabulary_notes'),
    grammar_notes: extractCompleteArrayObjects(trimmed, 'grammar_notes'),
    logic_flow: extractCompleteArrayObjects(trimmed, 'logic_flow'),
  });
  const hasContent =
    partial.paragraph_summary ||
    partial.plain_meaning ||
    partial.sentence_roles.length > 0 ||
    (partial.sentence_breakdown?.length || 0) > 0 ||
    partial.vocabulary_notes.length > 0 ||
    (partial.logic_flow?.length || 0) > 0;

  return hasContent ? partial : null;
}

function pronunciationKey(text: string) {
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

async function playPronunciation(text: string) {
  const normalizedText = text.replace(/\s+/g, ' ').trim();
  if (!normalizedText) {
    return;
  }

  const response = await fetch('/api/tts/mimo', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: normalizedText }),
  });

  if (!response.ok) {
    let message = 'Pronunciation is unavailable right now.';
    try {
      const errorBody = await response.json();
      message = errorBody.error || message;
    } catch {}
    throw new Error(message);
  }

  const audioBlob = await response.blob();
  const audioUrl = URL.createObjectURL(audioBlob);
  const audio = new Audio(audioUrl);

  try {
    await audio.play();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(audioUrl), 30000);
  }
}

function PronunciationButton({
  text,
  label,
  status,
  onPlay,
}: {
  text: string;
  label: string;
  status?: 'loading' | 'error';
  onPlay: (text: string) => void;
}) {
  const disabled = status === 'loading' || text.trim().length === 0;

  return (
    <button
      type="button"
      className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border transition-colors ${
        status === 'error'
          ? 'border-red-400/30 bg-red-500/10 text-red-400'
          : 'border-primary/20 bg-primary/10 text-primary hover:bg-primary/20'
      } disabled:cursor-wait disabled:opacity-70`}
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={() => onPlay(text)}
    >
      {status === 'loading' ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Volume2 className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

async function readNdjsonEvents(
  response: Response,
  onEvent: (event: any) => void
) {
  const reader = response.body?.getReader();
  if (!reader) {
    return;
  }

  const decoder = new TextDecoder();
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';

    for (const line of lines) {
      if (!line.trim()) {
        continue;
      }
      onEvent(JSON.parse(line));
    }
  }

  buffer += decoder.decode();
  if (buffer.trim()) {
    onEvent(JSON.parse(buffer));
  }
}

function isAbortLikeError(error: unknown) {
  const message = (error as Error)?.message || String(error || '');
  const name = (error as Error)?.name || '';

  return (
    name === 'AbortError' ||
    /aborted|abort|timed out|timeout/i.test(message)
  );
}

function getReadableAnalysisError(error: unknown, bilingualMode: boolean) {
  if (isAbortLikeError(error)) {
    return bilingualMode
      ? '这次分析连接中断或超时了。可以直接重新分析；如果已显示部分内容，可先继续阅读。'
      : 'The analysis connection was interrupted or timed out. Retry when ready; any partial result can still be used.';
  }

  return (error as Error)?.message || 'Failed to explain';
}

export default function ExplanationPanel({
  documentId,
  text,
  selectionKey,
  onClose,
  onActiveSentenceChange,
  onExplanationReady,
}: ExplanationPanelProps) {
  const {
    grammarMode,
    bilingualMode,
    setBilingualMode,
    learningDepth,
    setLearningDepth,
  } = useReaderStore();
  const [generating, setGenerating] = useState(false);
  const [data, setData] = useState<ExplanationData | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [pronunciationStatus, setPronunciationStatus] = useState<PronunciationStatus>({});
  const [pronunciationError, setPronunciationError] = useState<string | null>(null);
  const [activeSentenceIndex, setActiveSentenceIndex] = useState<number | null>(null);
  const requestIdRef = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleActiveSentenceChange = useCallback(
    (index: number | null) => {
      setActiveSentenceIndex(index);
      onActiveSentenceChange?.(selectionKey, index);
    },
    [onActiveSentenceChange, selectionKey]
  );

  const handlePlayPronunciation = useCallback(async (textToSpeak: string) => {
    const key = pronunciationKey(textToSpeak);
    if (!key) {
      return;
    }

    setPronunciationStatus((current) => ({ ...current, [key]: 'loading' }));
    setPronunciationError(null);

    try {
      await playPronunciation(textToSpeak);
      setPronunciationStatus((current) => {
        const next = { ...current };
        delete next[key];
        return next;
      });
    } catch (playError) {
      setPronunciationStatus((current) => ({ ...current, [key]: 'error' }));
      setPronunciationError((playError as Error).message);
    }
  }, []);

  const handleGenerate = useCallback(async (force: boolean = false) => {
    const requestId = ++requestIdRef.current;
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    setGenerating(true);
    setData(null);
    setError(null);
    handleActiveSentenceChange(null);
    let keptPartialResult = false;

    try {
      const res = await fetch(`/api/explain-text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId,
          text,
          forceRegenerate: force,
          stream: true,
          bilingualMode,
          grammarMode,
          explanationLanguage: bilingualMode ? 'Chinese' : 'English',
        }),
        signal: controller.signal,
      });
      const contentType = res.headers.get('content-type') || '';

      if (res.ok && res.body && contentType.includes('application/x-ndjson')) {
        let streamedContent = '';
        let lastPartialSignature = '';
        let completed = false;

        await readNdjsonEvents(res, (event) => {
          if (requestId !== requestIdRef.current) {
            return;
          }

          if (event.type === 'chunk') {
            streamedContent += event.text || '';
            const partialOutput = parsePartialExplanationOutput(streamedContent);

            if (!partialOutput) {
              return;
            }

            const signature = JSON.stringify({
              summary: partialOutput.paragraph_summary,
              meaning: partialOutput.plain_meaning,
              roles: partialOutput.sentence_roles.length,
              breakdown: partialOutput.sentence_breakdown?.length || 0,
              vocab: partialOutput.vocabulary_notes.length,
              logic: partialOutput.logic_flow?.length || 0,
            });

            if (signature === lastPartialSignature) {
              return;
            }

            lastPartialSignature = signature;
            const partialData: ExplanationData = {
              status: 'STREAMING',
              cached: false,
              output: partialOutput,
            };
            keptPartialResult = true;
            setData(partialData);
            onExplanationReady?.(selectionKey, partialOutput);
            return;
          }

          if (event.type === 'cached' || event.type === 'final') {
            const explanation = event.explanation as ExplanationData;
            completed = true;
            setData(explanation);
            onExplanationReady?.(selectionKey, explanation.output ?? null);
            return;
          }

          if (event.type === 'error') {
            const partialOutput = parsePartialExplanationOutput(streamedContent);

            if (partialOutput) {
              completed = true;
              keptPartialResult = true;
              setData({
                status: 'STREAMING',
                cached: false,
                output: partialOutput,
              });
              onExplanationReady?.(selectionKey, partialOutput);
              return;
            }

            throw new Error(event.error || 'Failed to explain');
          }
        });

        if (!completed && requestId === requestIdRef.current) {
          const partialOutput = parsePartialExplanationOutput(streamedContent);
          if (partialOutput) {
            keptPartialResult = true;
            setData({
              status: 'STREAMING',
              cached: false,
              output: partialOutput,
            });
            onExplanationReady?.(selectionKey, partialOutput);
          }
        }

        return;
      }

      const newData = await readJsonResponse(res);
      if (requestId !== requestIdRef.current) {
        return;
      }
      if (!res.ok) {
        throw new Error(
          (newData as { error?: string }).error || 'Failed to explain'
        );
      }
      setData(newData as ExplanationData);
      onExplanationReady?.(selectionKey, newData.output ?? null);
    } catch (e) {
      if (requestId !== requestIdRef.current) {
        return;
      }
      if (isAbortLikeError(e) && keptPartialResult) {
        return;
      }
      if ((e as Error).name === 'AbortError') {
        return;
      }
      setError(new Error(getReadableAnalysisError(e, bilingualMode)));
      onExplanationReady?.(selectionKey, null);
    } finally {
      if (requestId === requestIdRef.current) {
        abortControllerRef.current = null;
        setGenerating(false);
      }
    }
  }, [
    bilingualMode,
    documentId,
    grammarMode,
    handleActiveSentenceChange,
    onExplanationReady,
    selectionKey,
    text,
  ]);

  useEffect(() => {
    handleGenerate(false);
  }, [handleGenerate, selectionKey]);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      onActiveSentenceChange?.(selectionKey, null);
    };
  }, [onActiveSentenceChange, selectionKey]);

  if (generating && !data) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center space-y-4 p-8">
        <Sparkles className="w-8 h-8 text-primary animate-pulse" />
        <div className="text-sm font-medium text-orange-900/65 animate-pulse">
          {bilingualMode ? 'AI 正在拆解这段英文... / AI is analyzing this paragraph...' : 'AI is analyzing this paragraph...'}
        </div>
        <div className="flex space-x-1">
          <div className="w-2 h-2 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: '0ms' }} />
          <div className="w-2 h-2 rounded-full bg-primary/60 animate-bounce" style={{ animationDelay: '150ms' }} />
          <div className="w-2 h-2 rounded-full bg-primary animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    );
  }

  // Determine if we have structural data or just an error
  const hasData =
    data &&
    data.output &&
    (data.status === 'COMPLETED' || data.status === 'STREAMING');
  const hasError = error || (data && data.status === 'FAILED');

  if (hasError || !hasData) {
    const failureMessage =
      error?.message ||
      data?.error ||
      'AI did not return a usable structured explanation this time. Try again and it will regenerate with a stricter JSON repair pass.';

    return (
      <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
        <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-6">
          <Sparkles className="w-8 h-8 text-primary" />
        </div>
        <h3 className="mb-2 text-xl font-bold tracking-tight">
          {hasError
            ? bilingualMode
              ? '分析没有完成'
              : 'Analysis did not finish'
            : bilingualMode
              ? '准备拆解'
              : 'Ready to Decode'}
        </h3>
        <p className="mb-8 max-w-sm text-sm leading-relaxed text-orange-900/65">
          {hasError
            ? failureMessage
            : bilingualMode
              ? '生成适合中文学习者的结构拆解，帮助你看清主干、逻辑、语法和词汇。'
              : 'Generate an AI-powered deep structural explanation of this paragraph, including grammar, vocabulary, and meaning.'}
        </p>
        <Button
          onClick={() => handleGenerate(Boolean(hasError))}
          size="lg"
          className="w-full max-w-xs shadow-lg shadow-primary/25"
        >
          <Sparkles className="w-4 h-4 mr-2" />
          {hasError
            ? bilingualMode
              ? '重新分析'
              : 'Retry Analysis'
            : bilingualMode
              ? '生成讲解'
              : 'Generate Explanation'}
        </Button>
      </div>
    );
  }

  const result = data.output as ParagraphExplanationOutput;
  const structureBreakdown = buildStructureBreakdown(result);
  const generationLabel =
    data.status === 'STREAMING'
      ? bilingualMode
        ? '生成中'
        : 'STREAMING'
      : data.cached
        ? 'CACHED'
        : 'GENERATED';
  const textLabels = bilingualMode
    ? {
        plainMeaning: '含义总览 Meaning Overview',
        translation: '自然中文 Natural Chinese',
        summary: '段落作用 Paragraph Role',
        tone: '语气与潜台词 Tone & Subtext',
        readingTip: '练习提示 Reading Tip',
        sentenceList: '句子列表 Sentence List',
        sentenceListHint: '先选一句，只看这一句的拆解；展开下一句时，上一句会自动收起。',
        tabs: {
          meaning: '含义 + 结构 Meaning + Structure',
          vocabulary: '词汇 Vocabulary',
        },
      }
      : {
        plainMeaning: 'Meaning Overview',
        translation: '中文理解',
        summary: 'Paragraph Summary',
        tone: 'Tone & Subtext',
        readingTip: 'Reading Tip',
        sentenceList: 'Sentence List',
        sentenceListHint: 'Open one sentence at a time. Opening another sentence automatically closes the current one.',
        tabs: {
          meaning: 'Meaning + Structure',
          vocabulary: 'Vocabulary',
        },
      };

  const structureAnalysisNode = (
    <div className="pt-4 border-t">
      <div className="mb-4">
        <h4 className="text-xs font-bold uppercase tracking-wider text-orange-900/65">{textLabels.sentenceList}</h4>
        <p className="mt-2 text-xs leading-relaxed text-orange-900/65">
          {textLabels.sentenceListHint}
        </p>
      </div>
      <SentenceAccordionList
        items={structureBreakdown}
        activeIndex={activeSentenceIndex}
        setActiveIndex={handleActiveSentenceChange}
        bilingualMode={bilingualMode}
        pronunciationStatus={pronunciationStatus}
        onPlayPronunciation={handlePlayPronunciation}
      />
    </div>
  );

  return (
    <div className="relative flex h-full flex-col bg-gradient-to-br from-orange-50/95 via-orange-100/88 to-amber-100/85 text-orange-950 backdrop-blur-xl">
      <StructureLegend bilingualMode={bilingualMode} />
        {/* Header Actions */}
        <div className="absolute top-0 z-20 flex w-full items-center justify-between border-b border-orange-200/80 bg-orange-50/90 px-4 py-3 shadow-sm shadow-orange-100/60 backdrop-blur-xl">
           <div className="flex items-center gap-3">
              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${data.cached ? 'bg-secondary text-secondary-foreground' : 'bg-primary/20 text-primary'} ${data.status === 'STREAMING' ? 'animate-pulse' : ''}`}>
                {generationLabel}
              </span>
              <button
                type="button"
                aria-pressed={bilingualMode}
                onClick={() => setBilingualMode(!bilingualMode)}
                className={`inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                  bilingualMode
                    ? 'border-orange-300 bg-orange-100 text-orange-800'
                    : 'border-orange-200 bg-white/60 text-orange-900/60'
                }`}
              >
                <span>中文</span>
                <span
                  className={`relative inline-flex h-4 w-8 items-center rounded-full ${
                    bilingualMode ? 'bg-orange-500/70' : 'bg-orange-200'
                  }`}
                >
                  <span
                    className={`absolute h-3 w-3 rounded-full bg-white transition-transform ${
                      bilingualMode ? 'translate-x-4' : 'translate-x-0.5'
                    }`}
                  />
                </span>
              </button>
           </div>
           <div className="flex space-x-2">
             <button onClick={() => handleGenerate(true)} className="rounded-lg p-1.5 text-orange-900/55 transition-colors hover:bg-orange-100 hover:text-orange-950" title="Regenerate">
                 <RefreshCw className={`w-4 h-4 ${generating ? 'animate-spin' : ''}`} />
             </button>
             {onClose && (
                <button onClick={onClose} className="rounded-lg p-1.5 text-orange-900/55 transition-colors hover:bg-orange-100 hover:text-orange-950">
                     ✕
                </button>
             )}
           </div>
        </div>

      <Tabs.Root defaultValue="meaning" className="flex h-full flex-1 flex-col overflow-hidden pt-12">
        <Tabs.List className="flex shrink-0 overflow-x-auto border-b border-orange-200/80 bg-white/55 px-2 no-scrollbar">
          <Tabs.Trigger value="meaning" className="px-4 py-3 text-sm font-medium border-b-2 border-transparent data-[state=active]:border-orange-500 data-[state=active]:text-orange-700 text-orange-900/55 hover:text-orange-950 transition-colors whitespace-nowrap">
            <div className="flex items-center space-x-2"><BookOpen className="w-4 h-4" /><ListTree className="w-4 h-4" /><span>{textLabels.tabs.meaning}</span></div>
          </Tabs.Trigger>
          <Tabs.Trigger value="vocab" className="px-4 py-3 text-sm font-medium border-b-2 border-transparent data-[state=active]:border-orange-500 data-[state=active]:text-orange-700 text-orange-900/55 hover:text-orange-950 transition-colors whitespace-nowrap">
            <div className="flex items-center space-x-2"><Languages className="w-4 h-4" /><span>{textLabels.tabs.vocabulary}</span></div>
          </Tabs.Trigger>
        </Tabs.List>

        {pronunciationError && (
          <div className="border-b border-red-400/20 bg-red-500/10 px-4 py-2 text-xs text-red-300">
            {pronunciationError}
          </div>
        )}

        <div className="flex-1 overflow-y-auto w-full">
            {/* Meaning Tab */}
            <Tabs.Content value="meaning" className="p-6 space-y-6 outline-none animate-in fade-in slide-in-from-right-4 duration-300 pb-32">
            <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-orange-900/65 mb-3 flex items-center"><Info className="w-3 h-3 mr-1"/> {textLabels.plainMeaning}</h4>
                <BilingualTextBlock
                  value={result.plain_meaning}
                  secondary={result.translation}
                  bilingualMode={bilingualMode}
                  className="rounded-2xl border border-orange-200/80 bg-white/70 p-4 text-base leading-relaxed text-orange-950 shadow-sm"
                />
            </div>

            {bilingualMode && result.translation ? (
                <div>
                    <h4 className="text-xs font-bold uppercase tracking-wider text-orange-900/65 mb-3">{textLabels.translation}</h4>
                    <div className="rounded-2xl border border-orange-200/70 bg-white/60 p-4 text-base leading-relaxed text-orange-950">
                        {result.translation}
                    </div>
                </div>
            ) : null}

            <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-orange-900/65 mb-3">{textLabels.summary}</h4>
                <BilingualTextBlock
                  value={result.paragraph_summary}
                  secondary={bilingualMode ? result.plain_meaning : ''}
                  bilingualMode={bilingualMode}
                  className="border-l-2 border-orange-300 py-1 pl-4 text-sm leading-relaxed text-orange-950/90"
                />
            </div>

            {result.tone_or_subtext && (
                <div className="rounded-2xl border border-orange-200/70 bg-orange-50/70 p-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-orange-900/65 mb-2">{textLabels.tone}</h4>
                <BilingualTextBlock
                  value={result.tone_or_subtext}
                  bilingualMode={bilingualMode}
                  className="text-sm text-orange-950/80 leading-relaxed"
                />
                </div>
            )}
            
            {result.reading_tip && (
                <div className="rounded-2xl border border-orange-200/70 bg-orange-50/70 p-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-orange-900/65 mb-2">{textLabels.readingTip}</h4>
                <BilingualTextBlock
                  value={result.reading_tip}
                  bilingualMode={bilingualMode}
                  className="text-sm text-orange-950/80 leading-relaxed"
                />
                </div>
            )}
            {structureAnalysisNode}
            </Tabs.Content>

            {/* Vocabulary Tab */}
            <Tabs.Content value="vocab" className="p-6 outline-none animate-in fade-in slide-in-from-right-4 duration-300 pb-32">
                <div className="grid gap-3">
                    {result.vocabulary_notes?.map((vocab: VocabularyNoteItem, i: number) => (
                        <div key={i} className="group relative overflow-hidden rounded-2xl border border-orange-200/70 bg-white/65 p-4 transition-colors hover:bg-orange-50/80">
                            <div className="mb-2 flex items-center justify-between gap-3">
                                <div className="flex min-w-0 flex-1 items-center gap-2">
                                    <span className="truncate text-lg font-bold text-orange-700">{vocab.term}</span>
                                    <PronunciationButton
                                        text={vocab.term}
                                        label={bilingualMode ? '播放单词发音 / Play word pronunciation' : 'Play word pronunciation'}
                                        status={pronunciationStatus[pronunciationKey(vocab.term)]}
                                        onPlay={handlePlayPronunciation}
                                    />
                                </div>
                                {vocab.translation && (
                                  <span className="shrink-0 rounded-md bg-orange-100 px-2 py-1 text-xs font-medium text-orange-800">{vocab.translation}</span>
                                )}
                            </div>
                            <div className="text-sm font-medium leading-relaxed mb-1">{vocab.meaning}</div>
                            {vocab.usage_note && <div className="mt-2 border-l-2 border-orange-300 pl-2 text-xs leading-relaxed text-orange-900/65 italic">{vocab.usage_note}</div>}
                        </div>
                    ))}
                    {(!result.vocabulary_notes || result.vocabulary_notes.length === 0) && (
                        <div className="py-10 text-center text-sm text-orange-900/55">No specialized vocabulary detected.</div>
                    )}
                </div>
            </Tabs.Content>
        </div>
      </Tabs.Root>
    </div>
  );
}
