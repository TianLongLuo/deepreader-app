export type ReaderStructureSlotRole =
  | 'actor_modifier'
  | 'actor_core'
  | 'action_modifier'
  | 'action_core'
  | 'target_modifier'
  | 'target_core';

export type ReaderStructureSlot = {
  text: string;
  role: ReaderStructureSlotRole;
  start_offset: number;
  end_offset: number;
};

export type ReaderStructureBreakdownItem = {
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
  explanation: string;
};

type TextSegment = {
  text: string;
  start: number;
  end: number;
};

type WordToken = {
  text: string;
  lower: string;
  start: number;
  end: number;
};

const PLACEHOLDERS = new Set([
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

const LEADING_CONNECTOR_PATTERN =
  /^(?:and|but|while|because|if|when|then|so|though|although|as|before|after|right now|which|that)\s+/i;

const PREPOSITION_PATTERN =
  /^(against|into|onto|to|at|from|with|without|along|around|before|after|over|under|beside|behind|through|out of|in|on|for|of)\b/i;

const CONNECTOR_ONLY_PATTERN =
  /^(?:and|but|or|while|because|if|when|then|so|though|although|as)$/i;

const AUXILIARY_WORDS = new Set([
  'am',
  'is',
  'are',
  'was',
  'were',
  'be',
  'being',
  'been',
  'do',
  'does',
  'did',
  "don't",
  "doesn't",
  "didn't",
  'have',
  'has',
  'had',
  "haven't",
  "hasn't",
  "hadn't",
  "there's",
  "there're",
  "there'd",
  "there'll",
  'can',
  "can't",
  'cannot',
  'could',
  "couldn't",
  'will',
  "won't",
  'would',
  "wouldn't",
  'should',
  "shouldn't",
  'may',
  'might',
  'must',
  "mustn't",
]);

const VERB_WORDS = new Set([
  ...AUXILIARY_WORDS,
  'appear',
  'appears',
  'appeared',
  'become',
  'becomes',
  'became',
  'carry',
  'carried',
  'come',
  'comes',
  'coming',
  'decide',
  'decides',
  'decided',
  'drag',
  'drags',
  'duck',
  'ducked',
  'fight',
  'fights',
  'fighting',
  'freeze',
  'freezes',
  'frozen',
  'get',
  'gets',
  'getting',
  'go',
  'goes',
  'going',
  'gesture',
  'gestured',
  'hear',
  'hears',
  'heard',
  'lean',
  'leans',
  'look',
  'looks',
  'meet',
  'meets',
  'mean',
  'means',
  'need',
  'needs',
  'pedal',
  'pedals',
  'phone',
  'phoned',
  'produce',
  'produces',
  'pull',
  'pulls',
  'pulled',
  'say',
  'says',
  'said',
  'see',
  'sees',
  'seem',
  'seems',
  'seemed',
  'shift',
  'shifts',
  'slide',
  'slides',
  'slow',
  'slows',
  'smell',
  'smells',
  'squint',
  'squints',
  'stand',
  'stands',
  'steer',
  'steers',
  'stop',
  'stops',
  'strike',
  'strikes',
  'talk',
  'talks',
  'turn',
  'turns',
  'want',
  'wants',
  'wanted',
  'work',
  'works',
  'working',
]);

const LINKING_WORDS = new Set([
  'not',
  "n't",
  'never',
  'really',
  'only',
  'just',
  'still',
  'even',
  'ever',
  'hardly',
  'remotely',
  'sure',
  'to',
  'almost',
  'already',
  'always',
  'usually',
  'often',
  'sometimes',
  'still',
  'right',
  'now',
  'back',
  'away',
  'out',
  'around',
  'up',
  'down',
  'off',
  'over',
  'through',
]);

function normalizeSlotText(value?: string | null) {
  if (typeof value !== 'string') {
    return '';
  }

  const normalized = value
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[,;:)\]]+/, '')
    .replace(/[(\[,;:.!?]+$/, '')
    .trim();

  return PLACEHOLDERS.has(normalized.toLowerCase()) ? '' : normalized;
}

function normalizeStructureSourceText(value?: string | null) {
  if (typeof value !== 'string') {
    return '';
  }

  return value
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[,;:)\]]+/, '')
    .replace(/[(\[,;:.!?]+$/, '')
    .trim();
}

function getWords(value: string) {
  return value.match(/[A-Za-z]+(?:['’][A-Za-z]+)?|\d+/g) || [];
}

function trimSegment(sourceText: string, start: number, end: number): TextSegment | null {
  let segmentStart = start;
  let segmentEnd = end;

  while (segmentStart < segmentEnd && /[\s,;:.!?]/.test(sourceText[segmentStart])) {
    segmentStart += 1;
  }

  while (segmentEnd > segmentStart && /[\s,;:.!?]/.test(sourceText[segmentEnd - 1])) {
    segmentEnd -= 1;
  }

  if (segmentEnd <= segmentStart) {
    return null;
  }

  const text = sourceText.slice(segmentStart, segmentEnd).trim();
  if (text.length < 2) {
    return null;
  }

  if (CONNECTOR_ONLY_PATTERN.test(text)) {
    return null;
  }

  return {
    text,
    start: segmentStart,
    end: segmentEnd,
  };
}

function splitSegmentAtConnectors(segment: TextSegment): TextSegment[] {
  const subjectStartPattern =
    "I|you|he|she|they|we|it|it's|the|there|this|that|these|those|my|his|her|their|our";
  const actionStartPattern =
    "steer|look|shift|turn|pedal|stand|lean|stop|slow|slide|smell|hear|see|fight|squint|am|is|are|was|were|can|can't|do|does|did";
  const splitPattern =
    new RegExp(
      [
        `\\s+(?:and|but|or)\\s+(?=(?:${subjectStartPattern}|${actionStartPattern})\\b)`,
        `,\\s+(?=(?:and|but|while|because|if|when|right now|the harder|the more|${subjectStartPattern})\\b)`,
        `\\s+(?:because|if|when|while|though|although)\\s+(?=(?:${subjectStartPattern})\\b)`,
      ].join('|'),
      'gi'
    );
  const pieces: TextSegment[] = [];
  let currentStart = 0;
  let match: RegExpExecArray | null;

  while ((match = splitPattern.exec(segment.text))) {
    const splitStart = match.index;
    const splitEnd = match.index + match[0].length;
    const left = trimSegment(
      segment.text,
      currentStart,
      splitStart
    );

    if (left) {
      pieces.push({
        ...left,
        start: segment.start + left.start,
        end: segment.start + left.end,
      });
    }

    currentStart = splitEnd;
  }

  const right = trimSegment(segment.text, currentStart, segment.text.length);
  if (right) {
    pieces.push({
      ...right,
      start: segment.start + right.start,
      end: segment.start + right.end,
    });
  }

  return pieces.length > 0 ? pieces : [segment];
}

function splitIntoSegments(sourceText: string) {
  const segments: TextSegment[] = [];
  let start = 0;

  for (let index = 0; index < sourceText.length; index += 1) {
    if (/[.!?;]/.test(sourceText[index])) {
      const segment = trimSegment(sourceText, start, index);
      if (segment) {
        segments.push(...splitSegmentAtConnectors(segment));
      }
      start = index + 1;
    }
  }

  const finalSegment = trimSegment(sourceText, start, sourceText.length);
  if (finalSegment) {
    segments.push(...splitSegmentAtConnectors(finalSegment));
  }

  return segments;
}

function tokenize(segment: TextSegment): WordToken[] {
  return Array.from(
    segment.text.matchAll(/[A-Za-z]+(?:['’][A-Za-z]+)?|\d+/g)
  ).map((match) => ({
    text: match[0],
    lower: match[0].toLowerCase().replace(/[’]/g, "'"),
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
  }));
}

function isVerbToken(token: WordToken) {
  if (VERB_WORDS.has(token.lower)) {
    return true;
  }

  return (
    token.lower.length > 4 &&
    (token.lower.endsWith('ed') || token.lower.endsWith('ing')) &&
    !token.lower.endsWith('thing')
  );
}

function findVerbIndex(tokens: WordToken[]) {
  return tokens.findIndex((token, index) => {
    if (index === 0 && /^(?:i'm|you're|he's|she's|it's|we're|they're|there's|there're)$/.test(token.lower)) {
      return true;
    }

    return isVerbToken(token);
  });
}

function expandVerbEnd(tokens: WordToken[], verbIndex: number) {
  let endIndex = verbIndex;

  for (let index = verbIndex + 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (LINKING_WORDS.has(token.lower) || isVerbToken(token)) {
      endIndex = index;
      continue;
    }
    break;
  }

  return endIndex;
}

function cleanLeadingConnector(value: string) {
  let cleaned = normalizeSlotText(value);

  while (LEADING_CONNECTOR_PATTERN.test(cleaned)) {
    cleaned = cleaned.replace(LEADING_CONNECTOR_PATTERN, '').trim();
  }

  return cleaned;
}

function normalizeSubjectCore(value: string) {
  const core = normalizeSlotText(value);
  const contraction = core.match(/^(i|you|he|she|it|we|they)'(?:m|re|s)$/i);

  if (!contraction) {
    return core;
  }

  return contraction[1].toLowerCase() === 'i'
    ? 'I'
    : contraction[1].toLowerCase();
}

function splitSubject(value: string) {
  const subject = cleanLeadingConnector(value);
  const words = getWords(subject);

  if (!subject || words.length <= 1) {
    return { modifier: '', core: normalizeSubjectCore(subject) };
  }

  if (/^the\s+(?:harder|more|less|longer|closer|farther|further)\b/i.test(subject)) {
    const core = words[words.length - 1];
    const coreStart = subject.toLowerCase().lastIndexOf(core.toLowerCase());

    return {
      modifier: normalizeSlotText(subject.slice(0, coreStart)),
      core: normalizeSubjectCore(subject.slice(coreStart)),
    };
  }

  if (/\b(?:and|or|nor)\b|&/.test(subject)) {
    return { modifier: '', core: normalizeSubjectCore(subject) };
  }

  if (/\bof\b/i.test(subject) || words.length <= 3) {
    return { modifier: '', core: normalizeSubjectCore(subject) };
  }

  const core = words[words.length - 1];
  const coreStart = subject.toLowerCase().lastIndexOf(core.toLowerCase());

  return {
    modifier: normalizeSlotText(subject.slice(0, coreStart)),
    core: normalizeSubjectCore(subject.slice(coreStart)),
  };
}

function splitObject(value: string) {
  const object = cleanLeadingConnector(value);

  if (!object) {
    return { modifier: '', core: '' };
  }

  const preposition = object.match(PREPOSITION_PATTERN);
  if (preposition) {
    const modifier = preposition[0];
    const core = normalizeSlotText(object.slice(modifier.length));
    return {
      modifier,
      core,
    };
  }

  return { modifier: '', core: object };
}

function deriveBreakdown(
  segment: TextSegment,
  sentenceIndex: number,
  previousSubjectCore: string,
  bilingualMode: boolean
): ReaderStructureBreakdownItem {
  const tokens = tokenize(segment);
  const verbIndex = findVerbIndex(tokens);

  if (verbIndex === -1) {
    return {
      sentence_index: sentenceIndex,
      sentence_text: segment.text,
      object_core: cleanLeadingConnector(segment.text),
      explanation: '',
    };
  }

  const verbEndIndex = expandVerbEnd(tokens, verbIndex);
  const firstVerb = tokens[verbIndex];
  const lastVerb = tokens[verbEndIndex];
  const firstLower = firstVerb.lower;
  const contractionSubject = firstLower.match(/^(i|you|he|she|it|we|they|there)'(?:m|re|s)$/);
  const isExistentialThere =
    firstLower === "there's" ||
    firstLower === "there're" ||
    firstLower === "there'd" ||
    firstLower === "there'll";
  const rawSubject = contractionSubject
    ? isExistentialThere
      ? ''
      : contractionSubject[1] === 'i'
      ? 'I'
      : contractionSubject[1]
    : segment.text.slice(0, firstVerb.start);
  const subject = splitSubject(
    rawSubject || (isExistentialThere ? '' : previousSubjectCore)
  );
  const subjectContractionVerbModifier =
    !contractionSubject
      ? rawSubject.trim().match(/\b(?:i|you|he|she|it|we|they)(['’](?:m|re|s))$/i)?.[1] || ''
      : '';
  const contractionVerbModifier =
    contractionSubject && !isExistentialThere
      ? normalizeSlotText(
          firstVerb.text.slice(contractionSubject[1].length)
        )
      : '';
  const verbModifier =
    contractionVerbModifier || normalizeSlotText(subjectContractionVerbModifier);
  const rawVerb = contractionSubject
    ? isExistentialThere
      ? firstVerb.text
      : verbEndIndex > verbIndex
      ? segment.text.slice(
          tokens[verbIndex + 1]?.start ?? firstVerb.start,
          lastVerb.end
        )
      : firstVerb.text
    : segment.text.slice(firstVerb.start, lastVerb.end);
  const object = splitObject(segment.text.slice(lastVerb.end));

  return {
    sentence_index: sentenceIndex,
    sentence_text: segment.text,
    subject_modifier: subject.modifier,
    subject_core: subject.core,
    verb_modifier: verbModifier,
    verb_core: normalizeSlotText(rawVerb),
    object_modifier: object.modifier,
    object_core: object.core,
    connector: sentenceIndex === 1 ? undefined : bilingualMode ? '承接' : 'Then',
    logic: '',
    explanation: '',
  };
}

export function buildHeuristicSentenceBreakdown(
  sourceText: string,
  bilingualMode = false
): ReaderStructureBreakdownItem[] {
  const normalizedSource = normalizeStructureSourceText(sourceText);
  if (!normalizedSource) {
    return [];
  }

  const segments = splitIntoSegments(normalizedSource);
  const breakdown: ReaderStructureBreakdownItem[] = [];
  let previousSubjectCore = '';

  segments.forEach((segment) => {
    const item = deriveBreakdown(
      segment,
      breakdown.length + 1,
      previousSubjectCore,
      bilingualMode
    );

    if (item.subject_core) {
      previousSubjectCore = item.subject_core;
    }

    breakdown.push(item);
  });

  return breakdown;
}

export function structureSlotsFromBreakdown(
  breakdown: ReaderStructureBreakdownItem[],
  sourceText: string
): ReaderStructureSlot[] {
  const searchableSourceText = sourceText
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .toLowerCase();
  const usedRanges: Array<{ start: number; end: number }> = [];
  const slots: ReaderStructureSlot[] = [];

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

  const findSlotOffset = (
    slotText: string,
    searchFrom: number,
    searchEnd = sourceText.length,
    fallbackStart = 0
  ) => {
    const lowerSlotText = slotText
      .replace(/[“”]/g, '"')
      .replace(/[‘’]/g, "'")
      .toLowerCase();
    const searchStarts = [searchFrom, fallbackStart];

    for (const searchStart of searchStarts) {
      let index = searchableSourceText.indexOf(lowerSlotText, searchStart);

      while (index !== -1) {
        const end = index + slotText.length;
        const overlaps = usedRanges.some(
          (range) => index < range.end && end > range.start
        );

        if (end <= searchEnd && !overlaps && hasWordBoundary(index, end)) {
          return index;
        }

        index = searchableSourceText.indexOf(lowerSlotText, index + 1);
      }
    }

    return -1;
  };

  breakdown.forEach((sentence) => {
    const sentenceLookupText = normalizeSlotText(sentence.sentence_text);
    const sentenceStart = sentenceLookupText
      ? findSlotOffset(
          sentenceLookupText,
          0,
          sourceText.length,
          0
        )
      : -1;
    const sentenceEnd =
      sentenceStart === -1
        ? sourceText.length
        : sentenceStart + sentenceLookupText.length;
    let cursor = sentenceStart === -1 ? 0 : sentenceStart;
    const candidates: Array<[ReaderStructureSlotRole, string]> = [
      ['actor_modifier', normalizeSlotText(sentence.subject_modifier)],
      ['actor_core', normalizeSlotText(sentence.subject_core)],
      ['action_modifier', normalizeSlotText(sentence.verb_modifier)],
      ['action_core', normalizeSlotText(sentence.verb_core)],
      ['target_modifier', normalizeSlotText(sentence.object_modifier)],
      ['target_core', normalizeSlotText(sentence.object_core)],
    ];

    candidates.forEach(([role, text]) => {
      if (!text) {
        return;
      }

      const start =
        sentenceStart === -1
          ? findSlotOffset(text, cursor)
          : findSlotOffset(text, cursor, sentenceEnd, sentenceStart);
      if (start === -1) {
        return;
      }

      const end = start + text.length;
      slots.push({
        text: sourceText.slice(start, end),
        role,
        start_offset: start,
        end_offset: end,
      });
      usedRanges.push({ start, end });
      cursor = end;
    });
  });

  return slots.sort((a, b) => a.start_offset - b.start_offset);
}

function getSlotWordCount(value: string) {
  return (value.match(/[A-Za-z]+(?:['’][A-Za-z]+)?|\d+/g) || []).length;
}

function rangesOverlap(
  ranges: Array<{ start: number; end: number }>,
  start: number,
  end: number
) {
  return ranges.some((range) => start < range.end && end > range.start);
}

function trimRelativeRange(value: string, start: number, end: number) {
  let rangeStart = start;
  let rangeEnd = end;

  while (rangeStart < rangeEnd && /[\s,;:.!?]/.test(value[rangeStart])) {
    rangeStart += 1;
  }

  while (rangeEnd > rangeStart && /[\s,;:.!?]/.test(value[rangeEnd - 1])) {
    rangeEnd -= 1;
  }

  if (rangeEnd <= rangeStart) {
    return null;
  }

  return { start: rangeStart, end: rangeEnd };
}

function addTargetRange(
  ranges: Array<{ start: number; end: number }>,
  value: string,
  start: number,
  end: number
) {
  const trimmed = trimRelativeRange(value, start, end);

  if (!trimmed) {
    return;
  }

  const text = value.slice(trimmed.start, trimmed.end);
  const wordCount = getSlotWordCount(text);
  if (
    wordCount === 0 ||
    wordCount > 5 ||
    rangesOverlap(ranges, trimmed.start, trimmed.end)
  ) {
    return;
  }

  ranges.push(trimmed);
}

function addNounChunkRanges(
  ranges: Array<{ start: number; end: number }>,
  value: string,
  start: number,
  end: number
) {
  const chunkPattern = /[^,;]+?(?=\s+(?:and|or)\s+|[,;]|$)/gi;
  const segment = value.slice(start, end);
  let match: RegExpExecArray | null;

  while ((match = chunkPattern.exec(segment))) {
    addTargetRange(
      ranges,
      value,
      start + match.index,
      start + match.index + match[0].length
    );
  }
}

function getLastWordRange(value: string, maxWords: number) {
  const matches = Array.from(
    value.matchAll(/[A-Za-z]+(?:['’][A-Za-z]+)?|\d+/g)
  );
  const selected = matches.slice(-maxWords);

  if (selected.length === 0) {
    return null;
  }

  const first = selected[0];
  const last = selected[selected.length - 1];
  return {
    start: first.index ?? 0,
    end: (last.index ?? 0) + last[0].length,
  };
}

function getKeyTargetRanges(value: string) {
  const ranges: Array<{ start: number; end: number }> = [];
  const wordCount = getSlotWordCount(value);

  if (wordCount <= 4 && value.length <= 36) {
    addTargetRange(ranges, value, 0, value.length);
    return ranges;
  }

  const lowerValue = value.toLowerCase();
  const firstWord = value.match(/[A-Za-z]+(?:['’][A-Za-z]+)?|\d+/);
  if (firstWord && /^(?:nothing|everything|anything|something|no one|nobody)$/i.test(firstWord[0])) {
    addTargetRange(
      ranges,
      value,
      firstWord.index ?? 0,
      (firstWord.index ?? 0) + firstWord[0].length
    );
  }

  const apartFromIndex = lowerValue.lastIndexOf('apart from ');
  if (apartFromIndex !== -1) {
    addNounChunkRanges(
      ranges,
      value,
      apartFromIndex + 'apart from '.length,
      value.length
    );
  }

  const prepositionMatch = lowerValue.match(
    /\b(?:into|onto|toward|towards|from|against|along|through|over|under|with|without|inside|outside|in|on|at|to)\b/
  );
  if (prepositionMatch?.index !== undefined) {
    const before = trimRelativeRange(value, 0, prepositionMatch.index);
    const after = trimRelativeRange(
      value,
      prepositionMatch.index + prepositionMatch[0].length,
      value.length
    );

    if (before && getSlotWordCount(value.slice(before.start, before.end)) <= 4) {
      addTargetRange(ranges, value, before.start, before.end);
    }

    if (after) {
      const afterText = value.slice(after.start, after.end);
      if (getSlotWordCount(afterText) <= 5) {
        addTargetRange(ranges, value, after.start, after.end);
      } else {
        const tail = getLastWordRange(afterText, 4);
        if (tail) {
          addTargetRange(
            ranges,
            value,
            after.start + tail.start,
            after.start + tail.end
          );
        }
      }
    }
  }

  if (ranges.length === 0) {
    const tail = getLastWordRange(value, 4);
    if (tail) {
      addTargetRange(ranges, value, tail.start, tail.end);
    }
  }

  return ranges;
}

export function keyStructureSlotsFromBreakdown(
  breakdown: ReaderStructureBreakdownItem[],
  sourceText: string
): ReaderStructureSlot[] {
  const slots = structureSlotsFromBreakdown(breakdown, sourceText);
  const selectedSlots: ReaderStructureSlot[] = [];
  const usedRanges: Array<{ start: number; end: number }> = [];

  const addSlot = (slot: ReaderStructureSlot) => {
    if (rangesOverlap(usedRanges, slot.start_offset, slot.end_offset)) {
      return;
    }

    selectedSlots.push(slot);
    usedRanges.push({
      start: slot.start_offset,
      end: slot.end_offset,
    });
  };

  slots.forEach((slot) => {
    if (slot.role === 'actor_core' || slot.role === 'action_core') {
      addSlot(slot);
      return;
    }

    if (
      slot.role === 'actor_modifier' &&
      /^the\s+(?:harder|more|less|longer|closer|farther|further)\b/i.test(slot.text)
    ) {
      addSlot(slot);
      return;
    }

    if (slot.role !== 'target_core') {
      return;
    }

    getKeyTargetRanges(slot.text).forEach((range) => {
      addSlot({
        ...slot,
        text: slot.text.slice(range.start, range.end),
        start_offset: slot.start_offset + range.start,
        end_offset: slot.start_offset + range.end,
      });
    });
  });

  return selectedSlots.sort((a, b) => a.start_offset - b.start_offset);
}
