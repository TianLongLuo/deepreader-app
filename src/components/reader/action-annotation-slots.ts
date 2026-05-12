import type { ParagraphExplanationOutput } from '@/types/explanation';
import {
  getSentenceRoleActionSlotRole,
  type ActionSlotRole,
} from './action-annotation-style';

export type ActionAnnotationSlot = {
  text: string;
  role: ActionSlotRole;
  start_offset: number;
  end_offset: number;
};

const STRUCTURE_FIELDS: Array<{
  key:
    | 'subject_modifier'
    | 'subject_core'
    | 'verb_modifier'
    | 'verb_core'
    | 'object_modifier'
    | 'object_core';
  role: ActionSlotRole;
  core?: 'actor' | 'action' | 'target';
}> = [
  { key: 'subject_modifier', role: 'actor_modifier' },
  { key: 'subject_core', role: 'actor_core', core: 'actor' },
  { key: 'verb_modifier', role: 'action_modifier' },
  { key: 'verb_core', role: 'action_core', core: 'action' },
  { key: 'object_modifier', role: 'target_modifier' },
  { key: 'object_core', role: 'target_core', core: 'target' },
];

function cleanActionSlotText(value?: string | null) {
  if (typeof value !== 'string') {
    return '';
  }

  const normalized = value.replace(/\s+/g, ' ').trim();
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

function getSlotWordCount(value: string) {
  return value.split(/\s+/).filter(Boolean).length;
}

function cleanCoreSlotText(
  value: string,
  role: 'actor' | 'action' | 'target'
) {
  const normalized = cleanActionSlotText(value);

  if (!normalized) {
    return '';
  }

  const lower = normalized.toLowerCase();
  const clausePattern =
    /\b(who|which|that|when|where|while|because|although|though|if|unless|as|after|before|since|the more|the less|the harder)\b/;
  const isCoordinatedActor = role === 'actor' && /\b(?:and|or|nor)\b|&/.test(lower);

  if (
    role === 'actor' &&
    (clausePattern.test(lower) ||
      getSlotWordCount(normalized) > (isCoordinatedActor ? 10 : 5))
  ) {
    return '';
  }

  if (role === 'action' && getSlotWordCount(normalized) > 5) {
    return '';
  }

  if (role === 'target' && getSlotWordCount(normalized) > 8) {
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

function overlapsUsedRange(
  usedRanges: Array<{ start: number; end: number }>,
  start: number,
  end: number
) {
  return usedRanges.some((range) => start < range.end && end > range.start);
}

function removeOverlappingRanges(
  slots: ActionAnnotationSlot[],
  usedRanges: Array<{ start: number; end: number }>,
  start: number,
  end: number
) {
  for (let index = slots.length - 1; index >= 0; index -= 1) {
    const slot = slots[index];
    if (start < slot.end_offset && end > slot.start_offset) {
      slots.splice(index, 1);
    }
  }

  for (let index = usedRanges.length - 1; index >= 0; index -= 1) {
    const range = usedRanges[index];
    if (start < range.end && end > range.start) {
      usedRanges.splice(index, 1);
    }
  }
}

function expandCoordinatedActorCoreRange(
  sourceText: string,
  start: number,
  end: number
) {
  const prefix = sourceText.slice(0, start);
  const connectorMatch = prefix.match(
    /\s+(?:and|or|nor|&)\s+(?:[A-Za-z]+(?:['’][A-Za-z]+)?\s+){0,4}$/i
  );

  if (!connectorMatch) {
    return { start, end };
  }

  const connectorStart = start - connectorMatch[0].length;
  const leftText = prefix.slice(0, connectorStart);
  const boundaryIndex = Math.max(
    leftText.lastIndexOf('.'),
    leftText.lastIndexOf('!'),
    leftText.lastIndexOf('?'),
    leftText.lastIndexOf(';'),
    leftText.lastIndexOf(':'),
    leftText.lastIndexOf('\n')
  );
  const clauseStart = boundaryIndex + 1;
  const clauseText = leftText.slice(clauseStart);
  const tokens = Array.from(
    clauseText.matchAll(/[A-Za-z]+(?:['’][A-Za-z]+)?|\d+/g)
  ).map((match) => ({
    text: match[0],
    start: clauseStart + (match.index ?? 0),
    end: clauseStart + (match.index ?? 0) + match[0].length,
  }));

  if (tokens.length === 0) {
    return { start, end };
  }

  const determiners = new Set([
    'a',
    'an',
    'the',
    'this',
    'that',
    'these',
    'those',
    'my',
    'your',
    'his',
    'her',
    'its',
    'our',
    'their',
  ]);
  const prepositions = new Set([
    'in',
    'on',
    'at',
    'by',
    'for',
    'from',
    'with',
    'without',
    'before',
    'after',
    'during',
    'into',
    'onto',
    'over',
    'under',
    'through',
    'to',
    'of',
  ]);
  const lastIndex = tokens.length - 1;
  const lastToken = tokens[lastIndex];
  let candidateStart = lastToken.start;
  const trimmedLeftText = leftText.trimEnd();
  const appositiveMatch = trimmedLeftText.match(
    /(?:^|[.!?;:\n]\s*)([A-Z][A-Za-z]*(?:\s+[A-Z][A-Za-z]*)?\s*,\s+[^,]{2,50},)\s*$/u
  );

  if (appositiveMatch?.index !== undefined) {
    const matchedText = appositiveMatch[0];
    const relativeStart = matchedText.search(/[A-Z]/);
    if (relativeStart !== -1) {
      candidateStart = appositiveMatch.index + relativeStart;
    }
  } else if (/^[A-Z]/.test(lastToken.text)) {
    for (let index = lastIndex - 1; index >= 0; index -= 1) {
      const between = sourceText.slice(tokens[index].end, candidateStart);
      if (!/^[A-Z]/.test(tokens[index].text) || !/^\s+$/.test(between)) {
        break;
      }
      candidateStart = tokens[index].start;
    }
  } else {
    const lowerTokens = tokens.map((token) => token.text.toLowerCase());
    let determinerIndex = -1;

    for (let index = lastIndex - 1; index >= 0; index -= 1) {
      const between = sourceText.slice(tokens[index].end, candidateStart);
      if (!/^\s+$/.test(between)) {
        break;
      }

      if (determiners.has(lowerTokens[index])) {
        determinerIndex = index;
        break;
      }
      if (prepositions.has(lowerTokens[index])) {
        break;
      }
    }

    if (determinerIndex !== -1) {
      candidateStart = tokens[determinerIndex].start;
    } else if (
      lastIndex > 0 &&
      !prepositions.has(lowerTokens[lastIndex - 1]) &&
      /^\s+$/.test(sourceText.slice(tokens[lastIndex - 1].end, lastToken.start))
    ) {
      candidateStart = tokens[lastIndex - 1].start;
    }
  }

  const expandedText = sourceText.slice(candidateStart, end);
  if (
    expandedText.length > 80 ||
    !/\b(?:and|or|nor)\b|&/i.test(expandedText)
  ) {
    return { start, end };
  }

  return { start: candidateStart, end };
}

function findSlotOffset(
  sourceText: string,
  lowerSourceText: string,
  slotText: string,
  searchFrom: number,
  usedRanges: Array<{ start: number; end: number }>
) {
  const lowerSlotText = slotText
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .toLowerCase();
  const searchableSourceText = lowerSourceText
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'");
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
  const searchStarts = [searchFrom, 0];

  for (const searchStart of searchStarts) {
    let index = searchableSourceText.indexOf(lowerSlotText, searchStart);

    while (index !== -1) {
      const end = index + slotText.length;
      if (
        !overlapsUsedRange(usedRanges, index, end) &&
        hasWordBoundary(index, end)
      ) {
        return index;
      }

      index = searchableSourceText.indexOf(lowerSlotText, index + 1);
    }
  }

  const exactIndex = sourceText.indexOf(slotText);
  if (
    exactIndex !== -1 &&
    !overlapsUsedRange(usedRanges, exactIndex, exactIndex + slotText.length)
  ) {
    return exactIndex;
  }

  return -1;
}

function inferModifierRole(role: {
  role?: string;
  label?: string;
  explanation?: string;
}) {
  const hint = `${role.label || ''} ${role.explanation || ''}`.toLowerCase();

  if (
    /\b(subject|actor|noun|pronoun)\b/.test(hint) ||
    ['主语', '名词', '代词'].some((term) => hint.includes(term))
  ) {
    return 'actor_modifier';
  }

  if (
    /\b(verb|action|adverb|modal|negation)\b/.test(hint) ||
    ['动作', '动词', '副词', '情态', '否定'].some((term) =>
      hint.includes(term)
    )
  ) {
    return 'action_modifier';
  }

  return 'target_modifier';
}

function roleFromSentenceRole(role: {
  role?: string;
  label?: string;
  explanation?: string;
}): ActionSlotRole {
  if (role.role === 'modifier') {
    return inferModifierRole(role);
  }

  return getSentenceRoleActionSlotRole(role.role || 'other');
}

function pushSlot(args: {
  slots: ActionAnnotationSlot[];
  usedRanges: Array<{ start: number; end: number }>;
  sourceText: string;
  lowerSourceText: string;
  text: string;
  role: ActionSlotRole;
  cursor: number;
  proposedStart?: number;
  proposedEnd?: number;
}) {
  const cleanText = cleanActionSlotText(args.text);
  if (!cleanText) {
    return args.cursor;
  }

  const proposedText =
    typeof args.proposedStart === 'number' && typeof args.proposedEnd === 'number'
      ? args.sourceText.slice(args.proposedStart, args.proposedEnd)
      : '';
  const shouldUseProposed =
    proposedText &&
    (!cleanText ||
      proposedText.toLowerCase() === cleanText.toLowerCase() ||
      proposedText
        .replace(/[‘’]/g, "'")
        .toLowerCase() === cleanText.replace(/[‘’]/g, "'").toLowerCase());
  const start = shouldUseProposed
    ? args.proposedStart!
    : findSlotOffset(
        args.sourceText,
        args.lowerSourceText,
        cleanText,
        args.cursor,
        args.usedRanges
      );

  if (start === -1) {
    return args.cursor;
  }

  const end = start + cleanText.length;
  const expandedRange =
    args.role === 'actor_core'
      ? expandCoordinatedActorCoreRange(args.sourceText, start, end)
      : { start, end };
  if (
    expandedRange.start === expandedRange.end ||
    overlapsUsedRange(args.usedRanges, expandedRange.start, expandedRange.end)
  ) {
    if (expandedRange.start === start && expandedRange.end === end) {
      return args.cursor;
    }

    removeOverlappingRanges(
      args.slots,
      args.usedRanges,
      expandedRange.start,
      expandedRange.end
    );
  }

  args.slots.push({
    text: args.sourceText.slice(expandedRange.start, expandedRange.end),
    role: args.role,
    start_offset: expandedRange.start,
    end_offset: expandedRange.end,
  });
  args.usedRanges.push({
    start: expandedRange.start,
    end: expandedRange.end,
  });
  return Math.max(args.cursor, expandedRange.end);
}

export function getActionAnnotationSlots(
  explanation: ParagraphExplanationOutput | null | undefined,
  sourceText: string
): ActionAnnotationSlot[] {
  const lowerSourceText = sourceText.toLowerCase();
  const usedRanges: Array<{ start: number; end: number }> = [];
  const slots: ActionAnnotationSlot[] = [];
  let cursor = 0;

  (explanation?.sentence_breakdown || []).forEach((item) => {
    STRUCTURE_FIELDS.forEach((field) => {
      const rawText = item[field.key];
      const slotText =
        field.core && rawText
          ? cleanCoreSlotText(rawText, field.core)
          : cleanActionSlotText(rawText);

      cursor = pushSlot({
        slots,
        usedRanges,
        sourceText,
        lowerSourceText,
        text: slotText,
        role: field.role,
        cursor,
      });
    });
  });

  if (slots.length === 0) {
    (explanation?.who_did_what || []).forEach((item) => {
      const fallbackFields: Array<[ActionSlotRole, string | undefined]> = [
        ['actor_modifier', item.actor_modifier],
        ['actor_core', cleanCoreSlotText(item.actor_core || item.actor || '', 'actor')],
        ['action_modifier', item.action_modifier],
        ['action_core', cleanCoreSlotText(item.action_core || item.action || '', 'action')],
        ['target_modifier', item.target_modifier],
        ['target_core', cleanCoreSlotText(item.target_core || item.target || '', 'target')],
      ];

      fallbackFields.forEach(([role, text]) => {
        cursor = pushSlot({
          slots,
          usedRanges,
          sourceText,
          lowerSourceText,
          text: text || '',
          role,
          cursor,
        });
      });
    });
  }

  explanation?.sentence_roles?.forEach((role) => {
    const proposedStart = Math.max(
      0,
      Math.min(role.start_offset, sourceText.length)
    );
    const proposedEnd = Math.max(
      proposedStart,
      Math.min(role.end_offset, sourceText.length)
    );

    cursor = pushSlot({
      slots,
      usedRanges,
      sourceText,
      lowerSourceText,
      text: role.text || '',
      role: roleFromSentenceRole(role),
      cursor,
      proposedStart,
      proposedEnd,
    });
  });

  return slots.sort((a, b) => a.start_offset - b.start_offset);
}
