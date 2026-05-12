import { prisma } from '@/lib/prisma';
import { encrypt } from '@/lib/crypto';
import { hashSettings } from '@/lib/crypto';
import { cacheService } from '@/lib/redis';
import { createChildLogger } from '@/lib/logger';
import { buildHeuristicSentenceBreakdown } from '@/lib/reader-structure';
import { DEEPSEEK_V4_MAX_OUTPUT_TOKENS } from './deepseek-config';
import { aiConfigResolver, ResolvedAIConfig } from './config-resolver';
import { aiResponseValidator } from './response-validator';
import {
  ExplanationRequest,
  ExplanationResponse,
  ParagraphExplanationOutput,
  GrammarNote,
  SentenceBreakdown,
  SentenceRole,
  VocabularyNote,
} from '@/types/explanation';

const log = createChildLogger('explanation-service');
const CORE_EXPLANATION_MAX_TOKENS = DEEPSEEK_V4_MAX_OUTPUT_TOKENS;
const REPAIR_EXPLANATION_MAX_TOKENS = DEEPSEEK_V4_MAX_OUTPUT_TOKENS;
const EXPLANATION_TEMPERATURE = 0.1;
const EXPLANATION_STRUCTURE_VERSION = 'core-v12-clause-reference-map';
const RESPONSE_GUARDRAILS = `
Return only one valid JSON object.
Keep it short. Do not include tone notes or reading tips unless essential.
Analyze only the selected paragraph.
Focus on paragraph_summary, plain_meaning, vocabulary_notes, and accurate sentence_breakdown structure.
Use the Grammarly Grammar Guide taxonomy as the grammar reference: parts of speech, subjects, predicates, objects, complements, modifiers, conjunctions, clauses, compound subjects, and appositives.
Always include concise grammar_notes for tense, aspect, voice, or modal meaning when the paragraph contains finite verbs. Mention the exact verb phrase and explain what time/attitude it signals.
For sentence_breakdown, include sentence_pattern, clause_type, clause_role, logic_breakdown, clause_map, reference_map, and learning_focus. sentence_pattern should identify one of the five basic English sentence patterns when possible: SV, SVC, SVO, SVOO, or SVOC; then append useful expansions such as "+ adverbial clause", "+ relative clause", "+ noun clause", "+ participial phrase", "passive", "existential there", "imperative", "compound predicate", or "fragment".
clause_type should identify main clause, coordinated main clause, adverbial clause, relative clause, noun clause, non-finite phrase, participial phrase, appositive phrase, or prepositional phrase when relevant. For complex sentences, separate the main clause from important subordinate/relative/noun clauses when that helps comprehension.
logic_breakdown should explain how to break down the clause: connector/subordinator -> subject -> verb -> object/complement -> modifiers -> relation to previous/next idea. Explicitly name what the subordinate clause does: time, reason, condition, contrast, result, concession, noun content, or noun modifier.
For any subordinate, relative, noun, participial, non-finite, comparison, or elliptical clause/phrase, fill clause_map with exact clause_text, clause_type, Chinese type name, connector, full host sentence, main_clause, what it modifies or completes, and its role in the whole sentence.
For pronouns and referring expressions that affect comprehension, fill reference_map with exact expression, what it refers to, and brief evidence. Resolve it, this, that, which, who, they, one, the other, the former/latter, such, and so when the paragraph gives enough evidence.
For learning_focus, explain the sentence like a human tutor: plain_takeaway is one short "what this sentence really says" sentence; why_it_is_hard lists 1-3 concrete blockers such as pronoun reference, ellipsis, embedded clause, comparison, negation, or long distance relation; reading_tip is one transferable reading move.
Write structure explanations in the order a learner should read them: first the sentence trunk, then the five-pattern label, then clauses/modifiers, then the combined meaning and logic.
Original-text annotations use sentence_breakdown first: subject_core, verb_core, and object_core become distinct colored underlines. subject_modifier, verb_modifier, and object_modifier change font color only, without underline.
sentence_roles is only for extra complex-sentence signals that are not already captured by sentence_breakdown.
For every sentence or main finite clause, fill exact spans for the grammatical subject, the core verb/action, and the predicate content that completes the meaning, such as object, complement, result, direction, or key event phrase.
For coordinated or appositive subjects, keep the whole subject phrase in subject_core. For example, use "Pauline and her kids", not only "her kids".
For coordinated actions with a shared subject, fill the shared subject once and fill each coordinated core verb/action plus its predicate content.
Do not skip short pronoun subjects like "I", "you", "he", "she", "it", "we", or "they" when they are the real grammatical subject.
Use modifier fields for only the core words that change understanding: adjectives/determiners for subject_modifier, negation/adverbs/modals for verb_modifier, and object/predicate descriptors or key prepositional phrases for object_modifier.
Prioritize complex-sentence signals: negation, comparison, condition, contrast, cause/result, direction, intensity, time shift, and key prepositional phrases.
Do not use a fixed percentage target. The amount of annotation depends on the paragraph: mark as much as needed for a complete, logical reading skeleton, and leave only low-signal filler unmarked.
Each sentence_roles item should usually be 1-12 words. Prefer meaningful phrases over whole long clauses.
For sentence_roles start_offset and end_offset, use 0 if unsure; the app realigns exact spans locally from text.
Return sentence_breakdown in reading order with sentence_index, sentence_text, subject_modifier, subject_core, verb_modifier, verb_core, object_modifier, object_core, logic, and explanation.
sentence_breakdown should use fine but natural granularity: one finite clause, coordinated action, subordinate clause, relative clause, noun clause, non-finite modifier, comparison step, condition, or result per item.
Do not create overlapping sentence_text values. Do not repeat the same sentence_text or reuse the same explanation across adjacent items.
sentence_breakdown should cover every sentence or important main clause, up to 14 items.
Return logic_flow only when you can give 2-4 paragraph-level movement steps that are not just the same sentence_breakdown list repeated; otherwise return [].
Return at most 5 vocabulary_notes.
Use empty arrays for who_did_what. grammar_notes should include tense/aspect/voice/modal notes unless the paragraph has no finite verbs.
`.trim();

export type ExplanationStreamEvent =
  | { type: 'cached'; explanation: ExplanationResponse }
  | { type: 'chunk'; text: string }
  | { type: 'final'; explanation: ExplanationResponse }
  | { type: 'error'; error: string };

export function buildCoreSystemPrompt(bilingualMode: boolean) {
  const languageInstruction = bilingualMode
    ? 'Write learner-facing explanations in concise Simplified Chinese. Keep source phrases in English. vocabulary_notes.translation must be Chinese.'
    : 'Write learner-facing explanations in concise English.';

  return `
You are a fast reading assistant for English paragraphs.
Use the Grammarly Grammar Guide as the reference taxonomy for English grammar categories.
Return compact JSON for these core UI features only:
1. plain meaning and paragraph summary,
2. brief sentence/main-clause logic explanations,
3. vocabulary that affects understanding,
4. AI-chosen balanced key underlines for the original text.

The app computes exact offsets locally from exact source phrases. Original-text annotations come primarily from sentence_breakdown structure fields, with sentence_roles used only for extra complex-sentence signals.

Required JSON shape:
{
  "paragraph_summary": "one sentence",
  "plain_meaning": "2-3 short sentences",
  "sentence_roles": [
    {
      "text": "exact short phrase from paragraph",
      "role": "subject|verb|object|modifier|clause|phrase|other",
      "start_offset": 0,
      "end_offset": 0,
      "label": "main structure / key modifier",
      "explanation": "brief reason this exact phrase is worth underlining"
    }
  ],
  "sentence_breakdown": [
    {
      "sentence_index": 1,
      "sentence_text": "exact sentence or main clause from the paragraph",
      "sentence_pattern": "SV/SVC/SVO/SVOO/SVOC plus useful expansion, e.g. SVO + adverbial clause",
      "clause_type": "main clause / coordinated main clause / adverbial clause / relative clause / noun clause / non-finite phrase / etc.",
      "clause_role": "main action / condition / reason / result / contrast / time / modifier / explanation / etc.",
      "subject_modifier": "exact nonessential pre-subject descriptors or empty",
      "subject_core": "exact full grammatical subject; keep coordinated/appositive subjects together",
      "verb_modifier": "exact negation/modal/adverb/auxiliary words or empty",
      "verb_core": "exact main verb or compact verb phrase",
      "object_modifier": "exact predicate/object/complement modifiers or key prepositional phrase or empty",
      "object_core": "exact predicate/object/complement/result core",
      "logic": "short role in the paragraph",
      "logic_breakdown": "connector/subordinator -> subject -> verb -> object/complement -> modifiers -> logical relation",
      "clause_map": [
        {
          "clause_text": "exact subordinate/relative/noun/non-finite clause or phrase",
          "clause_type": "conditional adverbial clause / relative clause / noun clause / etc.",
          "chinese_type": "条件状语从句 / 定语从句 / 宾语从句 / etc.",
          "connector": "if / which / that / when / empty",
          "full_sentence": "the full sentence this clause belongs to",
          "main_clause": "the main clause or host phrase",
          "modifies": "what this clause modifies or completes",
          "role_in_sentence": "condition / reason / contrast / noun content / noun modifier / etc."
        }
      ],
      "reference_map": [
        {
          "expression": "it / this / which / the other / etc.",
          "refers_to": "exact antecedent or inferred referent",
          "evidence": "short reason from surrounding text"
        }
      ],
      "learning_focus": {
        "plain_takeaway": "one short human explanation of what this sentence really says",
        "why_it_is_hard": ["specific blocker, not a generic grammar label"],
        "reading_tip": "one transferable reading move for this sentence"
      },
      "explanation": "natural Chinese translation/meaning first, then one short learner-friendly note"
    }
  ],
  "vocabulary_notes": [
    { "term": "word or phrase", "meaning": "contextual meaning", "translation": "", "usage_note": "short nuance" }
  ],
  "who_did_what": [],
  "grammar_notes": [
    { "pattern": "Tense/aspect: exact verb phrase", "explanation": "what time, duration, completion, voice, or modal attitude it signals in context" }
  ],
  "logic_flow": [
    {
      "step": 1,
      "text": "short paragraph-level movement, not a copied clause list",
      "relation": "setup/pressure/contrast/result/etc.",
      "explanation": "how this part moves the paragraph meaning forward"
    }
  ]
}

${RESPONSE_GUARDRAILS}
${languageInstruction}
`.trim();
}

export function buildCoreUserPrompt({
  paragraph,
  bilingualMode,
}: {
  paragraph: string;
  bilingualMode: boolean;
}) {
  return `
Paragraph:
"""${paragraph}"""

Task:
- Explain the paragraph plainly.
- Summarize what it does in context.
- For each sentence, split into fine but natural sentence_breakdown items: one finite clause, coordinated action, subordinate clause, relative clause, noun clause, non-finite modifier, comparison step, condition, or result per item.
- For each sentence_breakdown item, identify sentence_pattern, clause_type, clause_role, logic_breakdown, clause_map, reference_map, and learning_focus.
- sentence_pattern should use the five basic patterns when possible: SV (subject + verb), SVC (subject + linking verb + complement), SVO (subject + verb + object), SVOO (subject + verb + indirect object + direct object), SVOC (subject + verb + object + object complement). Add useful expansions such as "+ adverbial clause", "+ relative clause", "+ noun clause", "passive", "existential there", "imperative", "compound predicate", or "fragment".
- clause_type should call out main clauses, coordinated main clauses, adverbial clauses, relative clauses, noun clauses, non-finite phrases, participial phrases, appositives, and key prepositional phrases when they drive comprehension. For complex sentences, make the main clause and important dependent clauses visible as separate sentence_breakdown items when possible.
- logic_breakdown should explain how to break down: connector/subordinator -> subject -> verb -> object/complement -> modifiers -> relation to previous/next idea. For dependent clauses, say whether the clause gives time, reason, condition, contrast, concession, result, noun content, or modifies a noun.
- If an item is or contains a subordinate clause, relative clause, noun clause, participial phrase, non-finite modifier, comparison step, or key elliptical phrase, fill clause_map. Include the full host sentence so the learner sees the whole sentence, not only the fragment, and say what the clause modifies or completes.
- Fill reference_map whenever a pronoun or referring expression matters: it, this, that, which, who, they, one, the other, the former/latter, such, so, etc. Resolve it to the most likely antecedent from the paragraph/context and give brief evidence. Use [] when there is no meaningful reference.
- Fill learning_focus for every sentence_breakdown item. plain_takeaway should be the quickest "I get it" explanation. why_it_is_hard should name concrete blockers like "it refers to the breeze" or "the other omits direction"; avoid generic labels. reading_tip should tell the learner how to read this pattern next time.
- Make explanation learner-first: in each sentence_breakdown explanation, start with a natural Chinese translation/meaning of that exact sentence or clause, then add one short note about how the structure helps the reader understand it. Avoid abstract grammar labels without a learning purpose.
- Do not overlap or duplicate sentence_breakdown items. Do not repeat the same explanation for multiple adjacent items.
- Include a specific logic/explanation for each sentence_breakdown item. Do not use generic fallback wording.
- If there is a distinct paragraph-level logic movement, include 2-4 logic_flow steps. Do not copy sentence_breakdown item-by-item.
- Choose sentence_roles completely from your own analysis. Use exact short phrases from the paragraph; do not mirror a full grammar parse and do not mark every word.
- For original-text annotations, every sentence/main clause must fill sentence_breakdown fields for its grammatical subject, core verb/action, and predicate content: object, complement, result, direction, or key event phrase. Then fill essential modifier fields and add only extra complex-sentence signals to sentence_roles.
- For coordinated or appositive subjects, keep the full subject phrase together in subject_core, such as "Pauline and her kids"; do not shrink it to the final noun phrase.
- For shared-subject coordination, fill the shared subject once and fill each coordinated verb/action plus predicate content.
- Do not omit pronoun subjects when they carry the sentence skeleton.
- Add grammar_notes for tense/aspect/voice/modal use. Include the exact verb phrase, such as "was waiting", "had seen", "will go", "could not move", and explain what it signals.
- Do not target a fixed annotation percentage. Mark however much the paragraph actually needs so the user can see the full sentence skeleton and complex-sentence logic. Avoid low-signal words like "the" and "and" unless they are inside a short phrase that matters.
- Include only vocabulary that materially affects comprehension.
- For sentence_roles, use start_offset/end_offset 0 when unsure. For sentence_breakdown, every non-empty structure field and every clause_map.clause_text must be an exact phrase copied from the paragraph. reference_map.refers_to may be an inferred antecedent when needed.
${bilingualMode ? '- Use concise Chinese explanations for the learner.' : '- Use concise English explanations.'}
${bilingualMode ? '- For paragraph_summary and plain_meaning, use two lines: first a concise English line, then a concise Chinese line. Keep the Chinese line natural and learner-friendly.' : ''}
`.trim();
}

function normalizeCoverageText(text: string) {
  return text
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function getExpectedStructureSegments(paragraphText: string) {
  return buildHeuristicSentenceBreakdown(paragraphText)
    .map((item) => item.sentence_text)
    .filter((text) => text.trim().length >= 8)
    .slice(0, 18);
}

function getStructureCompletenessIssue(
  output: ParagraphExplanationOutput,
  paragraphText: string
) {
  const expectedSegments = getExpectedStructureSegments(paragraphText);
  const actualBreakdown = output.sentence_breakdown || [];

  if (expectedSegments.length <= 1) {
    return null;
  }

  if (actualBreakdown.length < Math.min(expectedSegments.length, 4)) {
    return `sentence_breakdown has ${actualBreakdown.length} item(s), but the paragraph needs about ${expectedSegments.length} sentence/main-clause item(s).`;
  }

  const actualTexts = actualBreakdown
    .map((item) => normalizeCoverageText(item.sentence_text || ''))
    .filter(Boolean);
  const uncoveredSegments = expectedSegments.filter((segment) => {
    const normalizedSegment = normalizeCoverageText(segment);
    return !actualTexts.some(
      (actual) =>
        actual.includes(normalizedSegment) ||
        normalizedSegment.includes(actual)
    );
  });

  const allowedMisses = Math.max(1, Math.floor(expectedSegments.length * 0.2));
  if (uncoveredSegments.length > allowedMisses) {
    return `sentence_breakdown skipped these paragraph parts: ${uncoveredSegments
      .slice(0, 4)
      .join(' | ')}`;
  }

  const completeCoreItems = actualBreakdown.filter(
    (item) => item.subject_core && item.verb_core
  ).length;
  const minimumCoreItems = Math.max(
    2,
    Math.ceil(expectedSegments.length * 0.65)
  );

  if (completeCoreItems < minimumCoreItems) {
    return `sentence_breakdown has only ${completeCoreItems} item(s) with both subject_core and verb_core; it needs at least ${minimumCoreItems}.`;
  }

  const completeAnalysisItems = actualBreakdown.filter(
    (item) =>
      item.sentence_pattern &&
      item.clause_type &&
      item.clause_role &&
      item.logic_breakdown &&
      item.explanation
  ).length;
  const minimumAnalysisItems = Math.max(
    1,
    Math.ceil(actualBreakdown.length * 0.85)
  );

  if (completeAnalysisItems < minimumAnalysisItems) {
    return `sentence_breakdown has only ${completeAnalysisItems} item(s) with full AI pattern/clause/logic analysis; it needs at least ${minimumAnalysisItems}.`;
  }

  return null;
}

function pickGeneratedStructureText(value?: string | null) {
  const trimmed = typeof value === 'string' ? value.trim() : '';

  if (!trimmed) {
    return '';
  }

  return trimmed;
}

function getUsefulGeneratedLogicFlow(
  output: ParagraphExplanationOutput,
  sentenceBreakdown: SentenceBreakdown[]
) {
  const logicFlow = (output.logic_flow || [])
    .map((step, index) => ({
      ...step,
      step: index + 1,
      text: pickGeneratedStructureText(step.text),
      relation: pickGeneratedStructureText(step.relation),
      explanation: pickGeneratedStructureText(step.explanation),
    }))
    .filter(
      (step) => step.text && step.relation && step.explanation
    )
    .slice(0, 4);

  if (logicFlow.length < 2) {
    return [];
  }

  const sentenceTexts = sentenceBreakdown
    .map((item) => normalizeCoverageText(item.sentence_text || ''))
    .filter(Boolean);
  const repeatedSentenceTextCount = logicFlow.filter((step) => {
    const normalizedStepText = normalizeCoverageText(step.text);

    return sentenceTexts.some(
      (sentenceText) =>
        sentenceText === normalizedStepText ||
        sentenceText.includes(normalizedStepText) ||
        normalizedStepText.includes(sentenceText)
    );
  }).length;

  if (
    logicFlow.length === sentenceBreakdown.length &&
    repeatedSentenceTextCount >= Math.max(2, Math.floor(logicFlow.length * 0.75))
  ) {
    return [];
  }

  const seenExplanations = new Set<string>();
  return logicFlow.filter((step) => {
    const normalizedExplanation = normalizeCoverageText(step.explanation);
    if (seenExplanations.has(normalizedExplanation)) {
      return false;
    }
    seenExplanations.add(normalizedExplanation);
    return true;
  });
}

function ensureCompleteStructureCoverage(
  output: ParagraphExplanationOutput,
  paragraphText: string
): ParagraphExplanationOutput {
  const currentBreakdown = output.sentence_breakdown || [];
  const sourceIndex = (sentenceText: string) => {
    const index = paragraphText
      .toLowerCase()
      .indexOf(sentenceText.toLowerCase());

    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  };

  const sentenceBreakdown = currentBreakdown
    .filter((item) => item.sentence_text?.trim())
    .sort((a, b) => sourceIndex(a.sentence_text) - sourceIndex(b.sentence_text))
    .map((item, index) => ({
    ...item,
    logic: pickGeneratedStructureText(item.logic),
    explanation: pickGeneratedStructureText(item.explanation),
    sentence_index: index + 1,
  }));

  return {
    ...output,
    sentence_breakdown: sentenceBreakdown,
    logic_flow: getUsefulGeneratedLogicFlow(output, sentenceBreakdown),
  };
}

function rangesOverlap(
  ranges: Array<{ start: number; end: number }>,
  start: number,
  end: number
) {
  return ranges.some((range) => start < range.end && end > range.start);
}

function normalizeOffsetSearchText(text: string) {
  return text
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .toLowerCase();
}

function isWordCharacter(character?: string) {
  return Boolean(character && /[A-Za-z0-9]/.test(character));
}

function hasWordBoundary(sourceText: string, start: number, end: number) {
  const first = sourceText[start];
  const last = sourceText[end - 1];

  if (isWordCharacter(first) && isWordCharacter(sourceText[start - 1])) {
    return false;
  }

  if (isWordCharacter(last) && isWordCharacter(sourceText[end])) {
    return false;
  }

  return true;
}

function findExactTextOffset(
  sourceText: string,
  lowerSourceText: string,
  text: string,
  searchFrom: number,
  usedRanges: Array<{ start: number; end: number }>
) {
  const searchableSourceText = normalizeOffsetSearchText(sourceText);
  const lowerText = normalizeOffsetSearchText(text);
  const searchStarts = [searchFrom, 0];

  for (const startAt of searchStarts) {
    let index = searchableSourceText.indexOf(lowerText, startAt);

    while (index !== -1) {
      const end = index + text.length;

      if (
        normalizeOffsetSearchText(sourceText.slice(index, end)) === lowerText &&
        !rangesOverlap(usedRanges, index, end) &&
        hasWordBoundary(sourceText, index, end)
      ) {
        return index;
      }

      index = searchableSourceText.indexOf(lowerText, index + 1);
    }
  }

  return -1;
}

function getUnderlineWordCount(text: string) {
  return (text.match(/[A-Za-z]+(?:['’][A-Za-z]+)?|\d+/g) || []).length;
}

function isLowSignalUnderlineText(text: string) {
  const normalized = normalizeCoverageText(text);

  return (
    getUnderlineWordCount(text) === 1 &&
    new Set([
      'i',
      'you',
      'he',
      'she',
      'it',
      'we',
      'they',
      'the',
      'a',
      'an',
      'and',
      'or',
      'but',
      'my',
      'his',
      'her',
      'our',
      'their',
      'this',
      'that',
    ]).has(normalized)
  );
}

function alignSentenceRoleOffsets(
  output: ParagraphExplanationOutput,
  paragraphText: string
): ParagraphExplanationOutput {
  const lowerParagraphText = paragraphText.toLowerCase();
  const usedRanges: Array<{ start: number; end: number }> = [];
  const seenRoleTexts = new Set<string>();
  const alignedRoles: SentenceRole[] = [];
  let cursor = 0;

  for (const role of output.sentence_roles || []) {
    const text = role.text?.trim();
    const roleName = role.role.toLowerCase();
    const normalizedRoleText = normalizeCoverageText(text || '');
    const roleWordCount = getUnderlineWordCount(text || '');
    if (
      !text ||
      seenRoleTexts.has(normalizedRoleText) ||
      (roleName !== 'subject' && isLowSignalUnderlineText(text)) ||
      roleWordCount > 14 ||
      text.length > 160
    ) {
      continue;
    }

    const proposedStart = Math.max(
      0,
      Math.min(role.start_offset, paragraphText.length)
    );
    const proposedEnd = Math.max(
      proposedStart,
      Math.min(role.end_offset, paragraphText.length)
    );
    const proposedText = paragraphText.slice(proposedStart, proposedEnd);
    let start =
      proposedText === text &&
      !rangesOverlap(usedRanges, proposedStart, proposedEnd)
        ? proposedStart
        : findExactTextOffset(
            paragraphText,
            lowerParagraphText,
            text,
            cursor,
            usedRanges
          );

    if (start === -1) {
      start = findExactTextOffset(
        paragraphText,
        lowerParagraphText,
        text.replace(/\s+/g, ' '),
        cursor,
        usedRanges
      );
    }

    if (start === -1) {
      continue;
    }

    const end = start + text.length;
    alignedRoles.push({
      ...role,
      text: paragraphText.slice(start, end),
      start_offset: start,
      end_offset: end,
    });
    usedRanges.push({ start, end });
    seenRoleTexts.add(normalizedRoleText);
    cursor = end;
  }

  return {
    ...output,
    sentence_roles: alignedRoles.slice(0, 48),
  };
}

function normalizeVerbPhrase(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function enrichClauseMap(item: SentenceBreakdown) {
  return item.clause_map
    ?.map((clause) => ({
      ...clause,
      clause_text: pickGeneratedStructureText(clause.clause_text),
      clause_type: pickGeneratedStructureText(clause.clause_type),
      chinese_type: pickGeneratedStructureText(clause.chinese_type),
      connector: pickGeneratedStructureText(clause.connector),
      full_sentence: pickGeneratedStructureText(clause.full_sentence),
      main_clause: pickGeneratedStructureText(clause.main_clause),
      modifies: pickGeneratedStructureText(clause.modifies),
      role_in_sentence: pickGeneratedStructureText(clause.role_in_sentence),
    }))
    .filter((clause) => clause.clause_text || clause.clause_type || clause.chinese_type);
}

function enrichReferenceMap(item: SentenceBreakdown) {
  return item.reference_map
    ?.map((reference) => ({
      ...reference,
      expression: pickGeneratedStructureText(reference.expression),
      refers_to: pickGeneratedStructureText(reference.refers_to),
      evidence: pickGeneratedStructureText(reference.evidence),
    }))
    .filter((reference) => reference.expression && reference.refers_to);
}

function enrichLearningFocus(item: SentenceBreakdown) {
  const focus = item.learning_focus;
  if (!focus) {
    return undefined;
  }

  const whyItIsHard = focus.why_it_is_hard
    ?.map((reason) => pickGeneratedStructureText(reason))
    .filter(Boolean);
  const plainTakeaway = pickGeneratedStructureText(focus.plain_takeaway);
  const readingTip = pickGeneratedStructureText(focus.reading_tip);

  if (!plainTakeaway && !readingTip && (!whyItIsHard || whyItIsHard.length === 0)) {
    return undefined;
  }

  return {
    plain_takeaway: plainTakeaway || undefined,
    why_it_is_hard:
      whyItIsHard && whyItIsHard.length > 0 ? whyItIsHard.slice(0, 3) : undefined,
    reading_tip: readingTip || undefined,
  };
}

function enrichSentenceBreakdown(breakdown: SentenceBreakdown[] | undefined) {
  return (breakdown || []).map((item) => ({
    ...item,
    sentence_pattern: pickGeneratedStructureText(item.sentence_pattern),
    clause_type: pickGeneratedStructureText(item.clause_type),
    clause_role: pickGeneratedStructureText(item.clause_role),
    logic_breakdown: pickGeneratedStructureText(item.logic_breakdown),
    clause_map: enrichClauseMap(item),
    reference_map: enrichReferenceMap(item),
    learning_focus: enrichLearningFocus(item),
  }));
}

function inferVerbTensePattern(verbPhrase: string) {
  const phrase = normalizeVerbPhrase(verbPhrase);
  const lower = phrase.toLowerCase();

  if (!phrase) {
    return null;
  }

  if (/\b(will|shall)\b/.test(lower)) {
    return 'future with modal auxiliary';
  }

  if (/\b(can|could|may|might|must|should|would)\b/.test(lower)) {
    return 'modal verb phrase';
  }

  if (/\b(has|have|had)\b.+\b\w+(?:ed|en|ne|wn|lt|pt|ught|ought)\b/.test(lower)) {
    return lower.includes('had') ? 'past perfect' : 'present perfect';
  }

  if (/\b(am|is|are|was|were|be|being|been)\b.+\b\w+ing\b/.test(lower)) {
    return /\b(was|were)\b/.test(lower)
      ? 'past progressive'
      : 'present progressive';
  }

  if (/\b(am|is|are|was|were|be|being|been)\b.+\b\w+(?:ed|en|ne|wn|lt|pt|ught|ought)\b/.test(lower)) {
    return 'passive voice';
  }

  if (/\b(was|were|did|had)\b/.test(lower) || /\b\w+ed\b/.test(lower)) {
    return 'simple past';
  }

  if (/\b(am|is|are|do|does|has|have)\b/.test(lower) || /\b\w+s\b/.test(lower)) {
    return 'simple present';
  }

  return 'verb tense/aspect';
}

function buildTenseGrammarNotes(
  output: ParagraphExplanationOutput
): GrammarNote[] {
  const existing = output.grammar_notes || [];
  const hasTenseNote = existing.some((note) =>
    /tense|aspect|modal|voice|时态|语态|情态/i.test(
      `${note.pattern} ${note.explanation}`
    )
  );

  if (hasTenseNote) {
    return existing;
  }

  const seen = new Set<string>();
  const inferredNotes: GrammarNote[] = [];

  for (const item of output.sentence_breakdown || []) {
    const verbPhrase = normalizeVerbPhrase(
      [item.verb_modifier, item.verb_core].filter(Boolean).join(' ')
    );
    const tensePattern = inferVerbTensePattern(verbPhrase);

    if (!verbPhrase || !tensePattern || seen.has(verbPhrase.toLowerCase())) {
      continue;
    }

    seen.add(verbPhrase.toLowerCase());
    inferredNotes.push({
      pattern: `Tense/aspect: ${verbPhrase}`,
      explanation: `This verb phrase is ${tensePattern}; it helps place the action in time and shows whether the action is ongoing, completed, passive, or modal in the sentence.`,
    });

    if (inferredNotes.length >= 4) {
      break;
    }
  }

  return [...existing, ...inferredNotes];
}

function sanitizeExplanationOutput(
  output: ParagraphExplanationOutput,
  paragraphText?: string | null,
  bilingualMode = false
) {
  const cleanedOutput: ParagraphExplanationOutput = {
    ...output,
    sentence_breakdown: output.sentence_breakdown?.map((item, index) => ({
      ...item,
      logic: pickGeneratedStructureText(item.logic),
      explanation: pickGeneratedStructureText(item.explanation),
      sentence_index: index + 1,
    })),
    logic_flow: output.logic_flow
      ?.map((step, index) => ({
        ...step,
        step: index + 1,
        text: pickGeneratedStructureText(step.text),
        relation: pickGeneratedStructureText(step.relation),
        explanation: pickGeneratedStructureText(step.explanation),
      }))
      .filter((step) => step.text && step.relation && step.explanation),
  };

  if (!paragraphText) {
    cleanedOutput.sentence_breakdown = enrichSentenceBreakdown(
      cleanedOutput.sentence_breakdown
    );
    cleanedOutput.grammar_notes = buildTenseGrammarNotes(cleanedOutput);
    return cleanedOutput;
  }

  const structureCompleteOutput = ensureCompleteStructureCoverage(
    cleanedOutput,
    paragraphText
  );
  structureCompleteOutput.sentence_breakdown = enrichSentenceBreakdown(
    structureCompleteOutput.sentence_breakdown
  );
  structureCompleteOutput.grammar_notes =
    buildTenseGrammarNotes(structureCompleteOutput);

  return alignSentenceRoleOffsets(structureCompleteOutput, paragraphText);
}

function buildCompletenessRepairPrompt({
  paragraphText,
  currentJson,
  issue,
  bilingualMode,
}: {
  paragraphText: string;
  currentJson: ParagraphExplanationOutput;
  issue: string;
  bilingualMode: boolean;
}) {
  const expectedSegments = getExpectedStructureSegments(paragraphText);
  const expectedList = expectedSegments
    .map((segment, index) => `${index + 1}. ${segment}`)
    .join('\n');

  return `
The previous JSON was valid but incomplete.
Completeness issue: ${issue}

Original paragraph:
${normalizePromptText(paragraphText)}

Expected sentence/main-clause coverage guide:
${expectedList}

Current JSON:
${JSON.stringify(currentJson)}

Return one corrected, complete JSON object using the same schema.
Requirements:
- Keep existing good analysis, but expand sentence_breakdown so it covers the entire original paragraph in reading order.
- sentence_breakdown must include every sentence and important main clause from the coverage guide.
- Fill subject_modifier, subject_core, verb_modifier, verb_core, object_modifier, and object_core with exact phrases from the original paragraph only.
- Fill sentence_pattern, clause_type, clause_role, logic_breakdown, clause_map, reference_map, and learning_focus for every sentence_breakdown item.
- sentence_pattern should use the five basic patterns when possible: SV, SVC, SVO, SVOO, or SVOC; append useful expansions such as "+ adverbial clause", "+ relative clause", "+ noun clause", passive, existential there, imperative, compound predicate, or fragment.
- clause_type should identify main, coordinated, adverbial, relative, noun, non-finite, participial, appositive, or prepositional structures when relevant. For complex sentences, make the main clause and important dependent clauses visible.
- logic_breakdown should show connector/subordinator -> subject -> verb -> object/complement -> modifiers -> relation to previous/next idea, and name what each dependent clause contributes.
- clause_map should explain every meaningful subordinate/relative/noun/non-finite/comparison/elliptical clause or phrase with clause_text, clause_type, chinese_type, connector, full_sentence, main_clause, modifies, and role_in_sentence.
- reference_map should resolve meaningful pronouns/referring expressions such as it, this, that, which, who, they, one, the other, the former/latter, such, and so.
- learning_focus should include plain_takeaway, 1-3 why_it_is_hard blockers, and one reading_tip.
- Include grammar_notes for tense/aspect/voice/modal meaning. Preserve any existing good tense notes and add missing finite verb tense notes.
- Also update who_did_what, sentence_roles, and logic_flow so they match the full paragraph, not only the opening sentence.
- sentence_roles offsets must be based on the exact original paragraph text.
- Do not use placeholder labels like "什么样的", "who", "did", or "thing" as field values.
- Return only valid JSON. No markdown.
${bilingualMode ? '- Bilingual mode is ON: explanations should be Chinese-friendly but keep source phrases in English.' : '- Write explanation prose in English.'}
`.trim();
}

function normalizePromptText(text?: string | null, maxLength?: number): string {
  if (!text) {
    return '';
  }

  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!maxLength || normalized.length <= maxLength) {
    return normalized;
  }

  return `${normalized.slice(0, maxLength).trimEnd()}...`;
}

function buildRequestSettingsHash(
  baseSettingsHash: string,
  request: ExplanationRequest
) {
  return hashSettings({
    structureVersion: EXPLANATION_STRUCTURE_VERSION,
    baseSettingsHash,
    bilingualMode: request.bilingualMode ?? false,
    grammarMode: request.grammarMode ?? true,
    explanationLanguage: request.explanationLanguage || 'English',
  });
}

/**
 * Core service for generating paragraph explanations using AI.
 */
export class AIExplanationService {
  /**
   * Generate or retrieve a cached explanation for a paragraph.
   */
  async explain(
    workspaceId: string,
    request: ExplanationRequest,
    actorEmail?: string | null
  ): Promise<ExplanationResponse> {
    const { paragraphId, forceRegenerate = false } = request;

    // Fetch the paragraph with context
    const paragraph = await prisma.paragraph.findUnique({
      where: { id: paragraphId },
      include: {
        document: true,
        sentences: { orderBy: { orderIndex: 'asc' } },
      },
    });

    if (!paragraph) {
      throw new Error(`Paragraph not found: ${paragraphId}`);
    }

    // Resolve AI config
    const config = await aiConfigResolver.resolve(workspaceId, actorEmail);
    const explanationMaxTokens = Math.min(
      Math.max(config.maxTokens, 1024),
      CORE_EXPLANATION_MAX_TOKENS
    );
    const requestSettingsHash = buildRequestSettingsHash(config.settingsHash, request);

    if (!forceRegenerate) {
      const existingExplanation = await this.getExplanation(
        paragraphId,
        requestSettingsHash
      );
      if (existingExplanation) {
        log.info({ paragraphId }, 'Returning persisted explanation');
        return {
          ...existingExplanation,
          cached: true,
        };
      }
    }

    // Check cache unless forcing regeneration
    if (!forceRegenerate && config.cacheEnabled) {
      const cached = await this.getCachedExplanation(paragraph.textHash, {
        ...config,
        settingsHash: requestSettingsHash,
      });
      if (cached) {
        log.info({ paragraphId }, 'Returning cached explanation');
        return {
          ...cached,
          cached: true,
        };
      }
    }

    const bilingualMode = request.bilingualMode ?? false;
    const normalizedParagraph = normalizePromptText(paragraph.rawText);
    const systemPrompt = buildCoreSystemPrompt(bilingualMode);
    const userPrompt = buildCoreUserPrompt({
      paragraph: normalizedParagraph,
      bilingualMode,
    });

    // Call AI provider
    log.info({ paragraphId, provider: config.providerKey }, 'Generating explanation');

    const aiResponse = await config.provider.complete({
      systemPrompt,
      userPrompt,
      maxTokens: explanationMaxTokens,
      temperature: EXPLANATION_TEMPERATURE,
    });

    return this.finalizeGeneratedExplanation({
      paragraph,
      config,
      requestSettingsHash,
      normalizedParagraph,
      systemPrompt,
      userPrompt,
      explanationMaxTokens,
      bilingualMode,
      responseContent: aiResponse.content,
    });
  }

  async *streamExplain(
    workspaceId: string,
    request: ExplanationRequest,
    actorEmail?: string | null
  ): AsyncIterable<ExplanationStreamEvent> {
    const { paragraphId, forceRegenerate = false } = request;

    const paragraph = await prisma.paragraph.findUnique({
      where: { id: paragraphId },
      include: {
        document: true,
        sentences: { orderBy: { orderIndex: 'asc' } },
      },
    });

    if (!paragraph) {
      throw new Error(`Paragraph not found: ${paragraphId}`);
    }

    const config = await aiConfigResolver.resolve(workspaceId, actorEmail);
    const explanationMaxTokens = Math.min(
      Math.max(config.maxTokens, 1024),
      CORE_EXPLANATION_MAX_TOKENS
    );
    const requestSettingsHash = buildRequestSettingsHash(
      config.settingsHash,
      request
    );

    if (!forceRegenerate) {
      const existingExplanation = await this.getExplanation(
        paragraphId,
        requestSettingsHash
      );
      if (existingExplanation) {
        yield { type: 'cached', explanation: existingExplanation };
        return;
      }
    }

    if (!forceRegenerate && config.cacheEnabled) {
      const cached = await this.getCachedExplanation(paragraph.textHash, {
        ...config,
        settingsHash: requestSettingsHash,
      });
      if (cached) {
        yield { type: 'cached', explanation: cached };
        return;
      }
    }

    if (!config.provider.stream) {
      const explanation = await this.explain(workspaceId, request, actorEmail);
      yield { type: 'final', explanation };
      return;
    }

    const bilingualMode = request.bilingualMode ?? false;
    const normalizedParagraph = normalizePromptText(paragraph.rawText);
    const systemPrompt = buildCoreSystemPrompt(bilingualMode);
    const userPrompt = buildCoreUserPrompt({
      paragraph: normalizedParagraph,
      bilingualMode,
    });
    let responseContent = '';

    log.info(
      { paragraphId, provider: config.providerKey },
      'Streaming explanation'
    );

    try {
      for await (const chunk of config.provider.stream({
        systemPrompt,
        userPrompt,
        maxTokens: explanationMaxTokens,
        temperature: EXPLANATION_TEMPERATURE,
      })) {
        responseContent += chunk.content;
        yield { type: 'chunk', text: chunk.content };
      }

      const explanation = await this.finalizeGeneratedExplanation({
        paragraph,
        config,
        requestSettingsHash,
        normalizedParagraph,
        systemPrompt,
        userPrompt,
        explanationMaxTokens,
        bilingualMode,
        responseContent,
      });

      yield { type: 'final', explanation };
    } catch (error) {
      log.warn(
        { paragraphId, error: (error as Error).message },
        'Streaming explanation interrupted, retrying with non-stream AI completion'
      );

      const retryResponse = await config.provider.complete({
        systemPrompt,
        userPrompt,
        maxTokens: explanationMaxTokens,
        temperature: EXPLANATION_TEMPERATURE,
      });

      const explanation = await this.finalizeGeneratedExplanation({
        paragraph,
        config,
        requestSettingsHash,
        normalizedParagraph,
        systemPrompt,
        userPrompt,
        explanationMaxTokens,
        bilingualMode,
        responseContent: retryResponse.content,
      });

      yield { type: 'final', explanation };
    }
  }

  private async finalizeGeneratedExplanation({
    paragraph,
    config,
    requestSettingsHash,
    normalizedParagraph,
    systemPrompt,
    userPrompt,
    explanationMaxTokens,
    bilingualMode,
    responseContent,
  }: {
    paragraph: { id: string; rawText: string; textHash: string };
    config: ResolvedAIConfig;
    requestSettingsHash: string;
    normalizedParagraph: string;
    systemPrompt: string;
    userPrompt: string;
    explanationMaxTokens: number;
    bilingualMode: boolean;
    responseContent: string;
  }): Promise<ExplanationResponse> {
    const paragraphId = paragraph.id;
    let validation = aiResponseValidator.validate(responseContent);
    let repairedContent: string | null = null;
    let finalResponseContent = responseContent;

    if (!validation.valid) {
      log.warn(
        { paragraphId, error: validation.error },
        'Initial response invalid, attempting repair'
      );

      const repairPrompt = `
The response below was not valid compact reading-assistant JSON.
Validation error: ${validation.error || 'Unknown validation error'}

Original paragraph:
${normalizedParagraph}

Bad response:
${responseContent}

Return one corrected JSON object using the exact compact schema from the system prompt.
No markdown. No extra text.
`.trim();

      const repairResponse = await config.provider.complete({
        systemPrompt:
          `${systemPrompt}\n\nRepair malformed JSON. Preserve exact source phrases and offsets.`,
        userPrompt: repairPrompt,
        maxTokens: Math.min(explanationMaxTokens, REPAIR_EXPLANATION_MAX_TOKENS),
        temperature: 0,
      });

      repairedContent = repairResponse.content;
      finalResponseContent = repairResponse.content;
      validation = aiResponseValidator.validate(repairResponse.content);
    }

    if (validation.valid && validation.data) {
      const completenessIssue = getStructureCompletenessIssue(
        validation.data,
        paragraph.rawText
      );

      if (completenessIssue) {
        log.warn(
          { paragraphId, issue: completenessIssue },
          'AI structure response incomplete, attempting AI completion repair'
        );

        const completenessRepairResponse = await config.provider.complete({
          systemPrompt:
            `${systemPrompt}\n\nRepair and complete the structure using AI analysis only. Do not use placeholders. Do not omit complex clauses.`,
          userPrompt: buildCompletenessRepairPrompt({
            paragraphText: paragraph.rawText,
            currentJson: validation.data,
            issue: completenessIssue,
            bilingualMode,
          }),
          maxTokens: Math.min(
            explanationMaxTokens,
            REPAIR_EXPLANATION_MAX_TOKENS
          ),
          temperature: 0,
        });
        repairedContent = completenessRepairResponse.content;
        finalResponseContent = completenessRepairResponse.content;
        validation = aiResponseValidator.validate(
          completenessRepairResponse.content
        );
      }

      if (validation.valid && validation.data) {
        const remainingCompletenessIssue = getStructureCompletenessIssue(
          validation.data,
          paragraph.rawText
        );

        if (remainingCompletenessIssue) {
          validation = {
            valid: false,
            error: `AI structure analysis is still incomplete: ${remainingCompletenessIssue}`,
          };
        } else {
          validation.data = sanitizeExplanationOutput(
            validation.data,
            paragraph.rawText,
            bilingualMode
          );
        }
      }
    }

    if (!validation.valid) {
      const explanation = await prisma.paragraphExplanation.create({
        data: {
          paragraphId,
          provider: config.providerKey,
          model: config.model,
          promptVersion: config.promptVersion,
          settingsHash: requestSettingsHash,
          outputJson: JSON.stringify({
            error: validation.error,
            repaired: Boolean(repairedContent),
          }),
          status: 'FAILED',
          rawPromptEncrypted: config.saveRawPrompt
            ? encrypt(userPrompt)
            : null,
          rawResponseEncrypted: config.saveRawResponse
            ? encrypt(finalResponseContent)
            : null,
        },
      });

      return {
        id: explanation.id,
        paragraphId,
        provider: config.providerKey,
        model: config.model,
        promptVersion: config.promptVersion,
        status: 'FAILED',
        output: null,
        error: validation.error,
        cached: false,
        createdAt: explanation.createdAt.toISOString(),
      };
    }

    const explanation = await prisma.paragraphExplanation.create({
      data: {
        paragraphId,
        provider: config.providerKey,
        model: config.model,
        promptVersion: config.promptVersion,
        settingsHash: requestSettingsHash,
        outputJson: JSON.stringify(validation.data),
        status: 'COMPLETED',
        rawPromptEncrypted: config.saveRawPrompt
          ? encrypt(userPrompt)
          : null,
        rawResponseEncrypted: config.saveRawResponse
          ? encrypt(finalResponseContent)
          : null,
      },
    });

    if (validation.data?.sentence_roles) {
      await this.storeAnnotationSpans(explanation.id, validation.data);
    }

    if (validation.data?.vocabulary_notes) {
      await this.storeVocabularyNotes(explanation.id, validation.data);
    }

    if (config.cacheEnabled) {
      await this.cacheExplanation(
        paragraph.textHash,
        {
          ...config,
          settingsHash: requestSettingsHash,
        },
        {
          id: explanation.id,
          paragraphId,
          provider: config.providerKey,
          model: config.model,
          promptVersion: config.promptVersion,
          status: 'COMPLETED',
          output: validation.data!,
          cached: false,
          createdAt: explanation.createdAt.toISOString(),
        }
      );
    }

    return {
      id: explanation.id,
      paragraphId,
      provider: config.providerKey,
      model: config.model,
      promptVersion: config.promptVersion,
      status: 'COMPLETED',
      output: validation.data!,
      cached: false,
      createdAt: explanation.createdAt.toISOString(),
    };
  }

  /**
   * Get existing explanation for a paragraph.
   */
  async getExplanation(
    paragraphId: string,
    settingsHash?: string
  ): Promise<ExplanationResponse | null> {
    const explanation = await prisma.paragraphExplanation.findFirst({
      where: {
        paragraphId,
        ...(settingsHash ? { settingsHash } : {}),
        status: 'COMPLETED',
      },
      include: {
        paragraph: {
          select: {
            rawText: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (!explanation) return null;

    return {
      id: explanation.id,
      paragraphId: explanation.paragraphId,
      provider: explanation.provider,
      model: explanation.model,
      promptVersion: explanation.promptVersion,
      status: explanation.status,
      output: sanitizeExplanationOutput(
        JSON.parse(explanation.outputJson) as ParagraphExplanationOutput,
        explanation.paragraph.rawText
      ),
      cached: true,
      createdAt: explanation.createdAt.toISOString(),
    };
  }

  private async getCachedExplanation(
    textHash: string,
    config: ResolvedAIConfig
  ): Promise<ExplanationResponse | null> {
    const cacheKey = cacheService.explanationCacheKey({
      textHash,
      provider: config.providerKey,
      model: config.model,
      promptVersion: config.promptVersion,
      settingsHash: config.settingsHash,
    });

    return cacheService.get<ExplanationResponse>(cacheKey);
  }

  private async cacheExplanation(
    textHash: string,
    config: ResolvedAIConfig,
    response: ExplanationResponse
  ): Promise<void> {
    const cacheKey = cacheService.explanationCacheKey({
      textHash,
      provider: config.providerKey,
      model: config.model,
      promptVersion: config.promptVersion,
      settingsHash: config.settingsHash,
    });

    await cacheService.set(cacheKey, response, 86400); // 24h TTL
  }

  private async storeAnnotationSpans(
    explanationId: string,
    output: ParagraphExplanationOutput
  ): Promise<void> {
    const spans = output.sentence_roles.map((role: SentenceRole) => ({
      paragraphExplanationId: explanationId,
      startOffset: role.start_offset,
      endOffset: role.end_offset,
      spanType: role.role,
      label: role.label,
      colorKey: this.roleToColor(role.role),
      explanation: role.explanation,
    }));

    if (spans.length > 0) {
      await prisma.annotationSpan.createMany({ data: spans });
    }
  }

  private async storeVocabularyNotes(
    explanationId: string,
    output: ParagraphExplanationOutput
  ): Promise<void> {
    const notes = output.vocabulary_notes.map((note: VocabularyNote) => ({
      paragraphExplanationId: explanationId,
      term: note.term,
      note: note.meaning,
      translation: note.translation || null,
    }));

    if (notes.length > 0) {
      await prisma.vocabularyNote.createMany({ data: notes });
    }
  }

  private roleToColor(role: string): string {
    const colorMap: Record<string, string> = {
      subject: 'blue',
      verb: 'green',
      object: 'orange',
      modifier: 'purple',
      clause: 'teal',
      phrase: 'pink',
    };
    return colorMap[role] || 'gray';
  }
}

export const aiExplanationService = new AIExplanationService();
