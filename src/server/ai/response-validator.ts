import { z } from 'zod';
import { ParagraphExplanationSchema, ParagraphExplanation } from '@/types/explanation';
import { AIResponseParseError, AIResponseValidationError } from '@/types/ai';

type JsonRecord = Record<string, unknown>;

const VALID_ROLES = new Set([
  'subject',
  'verb',
  'object',
  'modifier',
  'clause',
  'phrase',
  'other',
]);

function asRecord(value: unknown): JsonRecord {
  return typeof value === 'object' && value !== null ? (value as JsonRecord) : {};
}

function asString(value: unknown, fallback = ''): string {
  if (typeof value === 'string') {
    return value.trim();
  }

  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }

  return fallback;
}

function asInteger(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === 'string' && value.trim().length > 0) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function asArray<T>(
  value: unknown,
  mapper: (item: unknown, index: number) => T | null
): T[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((item, index) => mapper(item, index))
    .filter((item): item is T => item !== null);
}

function normalizeExplanationPayload(parsedObject: unknown): ParagraphExplanation {
  const record = asRecord(parsedObject);

  const sentenceRoles = asArray(record.sentence_roles, (item, index) => {
    const roleRecord = asRecord(item);
    const text = asString(roleRecord.text, `segment-${index + 1}`);
    const fallbackStart = 0;
    const fallbackEnd = Math.max(fallbackStart + 1, text.length || 1);
    const start = Math.max(0, asInteger(roleRecord.start_offset, fallbackStart));
    const end = Math.max(start + 1, asInteger(roleRecord.end_offset, fallbackEnd));
    const role = asString(roleRecord.role, 'other').toLowerCase();

    return {
      text,
      role: VALID_ROLES.has(role) ? role : 'other',
      start_offset: start,
      end_offset: end,
      label: asString(roleRecord.label, 'Key part'),
      explanation: asString(
        roleRecord.explanation,
        'This span is important for understanding the sentence.'
      ),
    };
  });

  const normalized: unknown = {
    paragraph_summary: asString(
      record.paragraph_summary,
      'This paragraph conveys an important point in the passage.'
    ),
    plain_meaning: asString(
      record.plain_meaning,
      'This paragraph describes the main idea in simpler language.'
    ),
    sentence_roles: sentenceRoles,
    who_did_what: asArray(record.who_did_what, (item) => {
      const actionRecord = asRecord(item);
      return {
        actor: asString(actionRecord.actor, 'Unknown'),
        action: asString(actionRecord.action, 'Described'),
        target: asString(actionRecord.target, ''),
        actor_modifier:
          asString(actionRecord.actor_modifier, '') || undefined,
        actor_core: asString(actionRecord.actor_core, '') || undefined,
        action_modifier:
          asString(actionRecord.action_modifier, '') || undefined,
        action_core: asString(actionRecord.action_core, '') || undefined,
        target_modifier:
          asString(actionRecord.target_modifier, '') || undefined,
        target_core: asString(actionRecord.target_core, '') || undefined,
        extra: asString(actionRecord.extra, '') || undefined,
      };
    }),
    vocabulary_notes: asArray(record.vocabulary_notes, (item) => {
      const vocabRecord = asRecord(item);
      const term = asString(vocabRecord.term);
      const meaning = asString(vocabRecord.meaning);

      if (!term && !meaning) {
        return null;
      }

      return {
        term: term || 'Key phrase',
        meaning: meaning || 'Important meaning in this paragraph.',
        translation: asString(vocabRecord.translation, '') || undefined,
        usage_note: asString(vocabRecord.usage_note, '') || undefined,
      };
    }),
    grammar_notes: asArray(record.grammar_notes, (item) => {
      const grammarRecord = asRecord(item);
      const pattern = asString(grammarRecord.pattern);
      const explanation = asString(grammarRecord.explanation);

      if (!pattern && !explanation) {
        return null;
      }

      return {
        pattern: pattern || 'Sentence structure',
        explanation:
          explanation || 'This structure helps organize the meaning of the paragraph.',
      };
    }),
    logic_flow:
      asArray(record.logic_flow, (item, index) => {
        const flowRecord = asRecord(item);
        const text = asString(flowRecord.text);
        const relation = asString(flowRecord.relation);
        const explanation = asString(flowRecord.explanation);

        if (!text && !relation && !explanation) {
          return null;
        }

        return {
          step: asInteger(flowRecord.step, index + 1),
          text: text || 'Sentence part',
          relation: relation || 'Meaning step',
          explanation:
            explanation || 'This part helps move the sentence meaning forward.',
        };
      }) || undefined,
    sentence_breakdown:
      asArray(record.sentence_breakdown, (item, index) => {
        const sentenceRecord = asRecord(item);
        const sentenceText = asString(sentenceRecord.sentence_text);
        const explanation = asString(sentenceRecord.explanation);

        if (!sentenceText && !explanation) {
          return null;
        }

        const clauseMap = asArray(sentenceRecord.clause_map, (clauseItem) => {
          const clauseRecord = asRecord(clauseItem);
          const clauseText = asString(clauseRecord.clause_text);
          const clauseType = asString(clauseRecord.clause_type);
          const chineseType = asString(clauseRecord.chinese_type);

          if (!clauseText && !clauseType && !chineseType) {
            return null;
          }

          return {
            clause_text: clauseText || sentenceText || 'Clause',
            clause_type: clauseType || undefined,
            chinese_type: chineseType || undefined,
            connector: asString(clauseRecord.connector, '') || undefined,
            full_sentence:
              asString(clauseRecord.full_sentence, '') || undefined,
            main_clause: asString(clauseRecord.main_clause, '') || undefined,
            modifies: asString(clauseRecord.modifies, '') || undefined,
            role_in_sentence:
              asString(clauseRecord.role_in_sentence, '') || undefined,
          };
        });
        const referenceMap = asArray(
          sentenceRecord.reference_map,
          (referenceItem) => {
            const referenceRecord = asRecord(referenceItem);
            const expression = asString(referenceRecord.expression);
            const refersTo = asString(referenceRecord.refers_to);

            if (!expression && !refersTo) {
              return null;
            }

            return {
              expression: expression || 'it',
              refers_to: refersTo || 'the previous idea',
              evidence: asString(referenceRecord.evidence, '') || undefined,
            };
          }
        );
        const learningFocusRecord = asRecord(sentenceRecord.learning_focus);
        const whyItIsHard = asArray(
          learningFocusRecord.why_it_is_hard,
          (reason) => {
            const text = asString(reason);
            return text ? text : null;
          }
        );
        const learningFocus = {
          plain_takeaway:
            asString(learningFocusRecord.plain_takeaway, '') || undefined,
          why_it_is_hard: whyItIsHard.length > 0 ? whyItIsHard : undefined,
          reading_tip:
            asString(learningFocusRecord.reading_tip, '') || undefined,
        };

        return {
          sentence_index: asInteger(sentenceRecord.sentence_index, index + 1),
          sentence_text: sentenceText || 'Sentence',
          sentence_pattern:
            asString(sentenceRecord.sentence_pattern, '') || undefined,
          clause_type: asString(sentenceRecord.clause_type, '') || undefined,
          clause_role: asString(sentenceRecord.clause_role, '') || undefined,
          subject_modifier:
            asString(sentenceRecord.subject_modifier, '') || undefined,
          subject_core: asString(sentenceRecord.subject_core, '') || undefined,
          verb_modifier:
            asString(sentenceRecord.verb_modifier, '') || undefined,
          verb_core: asString(sentenceRecord.verb_core, '') || undefined,
          object_modifier:
            asString(sentenceRecord.object_modifier, '') || undefined,
          object_core: asString(sentenceRecord.object_core, '') || undefined,
          connector: asString(sentenceRecord.connector, '') || undefined,
          logic: asString(sentenceRecord.logic, '') || undefined,
          logic_breakdown:
            asString(sentenceRecord.logic_breakdown, '') || undefined,
          clause_map: clauseMap.length > 0 ? clauseMap : undefined,
          reference_map: referenceMap.length > 0 ? referenceMap : undefined,
          learning_focus:
            learningFocus.plain_takeaway ||
            learningFocus.why_it_is_hard ||
            learningFocus.reading_tip
              ? learningFocus
              : undefined,
          explanation:
            explanation ||
            'This sentence adds an important step to the paragraph meaning.',
        };
      }) || undefined,
    tone_or_subtext: asString(record.tone_or_subtext, '') || undefined,
    translation: asString(record.translation, '') || undefined,
    reading_tip: asString(record.reading_tip, '') || undefined,
  };

  return ParagraphExplanationSchema.parse(normalized);
}

export function maybeExtractJson(rawText: string): string {
  // If the model wrapped the response in a Markdown code block
  const match = rawText.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (match && match[1]) {
    return match[1].trim();
  }
  
  // Fallback: safely isolate closest outermost braces
  const firstBrace = rawText.indexOf('{');
  const lastBrace = rawText.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return rawText.substring(firstBrace, lastBrace + 1);
  }

  return rawText.trim();
}

export function parseAndValidateExplanation(rawText: string): ParagraphExplanation {
  const jsonText = maybeExtractJson(rawText);
  let parsedObject: unknown;

  try {
    parsedObject = JSON.parse(jsonText);
  } catch (error) {
    throw new AIResponseParseError('Failed to parse AI response as valid JSON', {
        message: (error as Error).message,
        snippet: jsonText.substring(0, 150) + '...'
    });
  }

  try {
    return normalizeExplanationPayload(parsedObject);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new AIResponseValidationError('Failed to validate parsed JSON against strict schema constraints', {
        zodErrors: error.issues,
        partialObject: parsedObject
      });
    }
    throw new AIResponseValidationError('Unknown validation format error', { error });
  }
}

export const aiResponseValidator = {
  validate: (content: string) => {
    try {
      const data = parseAndValidateExplanation(content);
      return { valid: true, data };
    } catch (error: unknown) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown validation error',
      };
    }
  }
};
// Force Turbopack HMR Update
