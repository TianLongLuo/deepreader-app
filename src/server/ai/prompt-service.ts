import { ParagraphExplanationInput } from '@/types/explanation';

export function buildExplanationSystemPrompt(input: ParagraphExplanationInput): string {
  const lang = input.explanationLanguage || 'English';
  return `You are an expert reading assistant parsing literary paragraphs.
Your goal is to explain the text clearly so the user can fully understand its meaning, nuance, vocabulary, and grammar.
Use the Grammarly Grammar Guide as the reference taxonomy for grammar categories: parts of speech, subjects, predicates, objects, complements, modifiers, conjunctions, clauses, compound subjects, and appositives.
Always include grammar_notes for tense, aspect, voice, or modal meaning when the paragraph contains finite verbs.

CRITICAL REQUIREMENT:
You must output ONLY valid, minified JSON.
Do not include markdown codeblocks (no \`\`\`json).
Do not include any commentary before or after the JSON.
Your JSON must strictly conform to the following properties:
- paragraph_summary (string)
- plain_meaning (string)
- sentence_roles (array of objects: text, role, start_offset, end_offset, label, explanation)
  - roles must be one of: subject, verb, object, modifier, clause, phrase, other
  - include enough subject/verb/object/modifier roles to cover the main trunk of every sentence or main clause in the entire selected paragraph
- who_did_what (array of objects: actor, action, target, actor_modifier, actor_core, action_modifier, action_core, target_modifier, target_core, extra)
  - include one item for every sentence or main clause, not just the first or easiest sentence
  - split each core action into six readable slots: what-kind-of subject, core who, how/manner, core action, what-kind-of object/event, core object/event
  - every split slot must be exact source text from the paragraph; leave missing slots empty instead of writing category labels
  - actor_core must be the full grammatical subject when the subject is coordinated or appositive, for example "Pauline and her kids"; do not shrink it to the final noun phrase
  - for simple non-coordinated subjects, actor_core can be the core noun/pronoun subject; action_core only the main verb/verb phrase, target_core only the core object/event phrase
  - do not put conditions, comparisons, reason clauses, or whole dependent clauses into core slots; explain those in logic_flow instead
  - direction/particle words such as back, away, out, around usually belong in action_modifier, not target_core
- vocabulary_notes (array of objects: term, meaning, translation, usage_note)
- grammar_notes (array of objects: pattern, explanation)
  - include tense/aspect/voice/modal notes with exact verb phrases, such as "was waiting", "had seen", "will go", or "could not move"
- logic_flow (array of objects: step, text, relation, explanation)
  - use 4-8 steps to show the paragraph's full logic from background/setup to action, shift, consequence, feeling, contrast, cause, or emphasis
  - text should be an exact source phrase or concise sentence fragment from the paragraph
- sentence_breakdown (array of objects: sentence_index, sentence_text, sentence_pattern, clause_type, clause_role, subject_modifier, subject_core, verb_modifier, verb_core, object_modifier, object_core, connector, logic, logic_breakdown, clause_map, reference_map, learning_focus, explanation)
  - include every sentence or major main clause in reading order
  - also include sentence_pattern, clause_type, clause_role, logic_breakdown, clause_map, reference_map, and learning_focus for every item
  - sentence_pattern should use the five basic patterns when possible: SV, SVC, SVO, SVOO, or SVOC; append useful expansions such as "+ adverbial clause", "+ relative clause", "+ noun clause", passive SVO, existential there, imperative, compound predicate, or fragment
  - clause_type should identify main clause, coordinated main clause, adverbial clause, relative clause, noun clause, non-finite phrase, participial phrase, appositive phrase, or key prepositional phrase when relevant; for complex sentences, separate the main clause and important dependent clauses when that helps comprehension
  - logic_breakdown should explain how to split the idea: connector/subordinator -> subject -> verb -> object/complement -> modifiers -> relation to the previous idea; for dependent clauses, name whether it gives time, reason, condition, contrast, result, noun content, or modifies a noun
  - clause_map should be an array for any subordinate/relative/noun/non-finite/comparison/elliptical structure: { clause_text, clause_type, chinese_type, connector, full_sentence, main_clause, modifies, role_in_sentence }
  - reference_map should be an array for pronouns and referring expressions that matter: { expression, refers_to, evidence }. Resolve it, this, that, which, who, they, one, the other, the former/latter, such, and so when possible
  - learning_focus should be { plain_takeaway, why_it_is_hard, reading_tip }, where why_it_is_hard lists concrete blockers rather than generic grammar labels
  - explanation should begin with a natural Chinese translation/meaning of that exact sentence or clause, then add one short learner-friendly note
  - modifier fields should contain exact adjectives, adverbs, negation, modal phrases, prepositional phrases, or descriptive words from the source
  - subject_core should contain the complete grammatical subject when it is a compound, coordinated, or appositive subject; verb_core and object_core should contain the smallest useful verb/object core phrase
- tone_or_subtext (string)
- translation (string)
- reading_tip (string)

Provide explanations in ${lang}${input.bilingual ? ' with bilingual learner notes: exact source phrases remain English, paragraph_summary and plain_meaning use two lines (English first, concise Chinese second), and explanation includes concise Chinese plus useful English keywords' : ''}.
Focus heavily on accurately extracting exact text spans for sentence_roles.
`;
}

export function buildExplanationUserPrompt(input: ParagraphExplanationInput): string {
  let prompt = [];
  
  if (input.previousParagraph) {
    prompt.push(`[CONTEXT ONLY - DO NOT EXPLAIN THIS] Previous Paragraph:\n${input.previousParagraph}\n`);
  }
  
  prompt.push(`[PRIMARY PARAGRAPH - EXPLAIN THIS]\n${input.currentParagraph}\n`);
  
  if (input.nextParagraph) {
    prompt.push(`[CONTEXT ONLY - DO NOT EXPLAIN THIS] Next Paragraph:\n${input.nextParagraph}\n`);
  }
  
  return prompt.join('\n');
}

export function buildRepairPrompt(invalidJsonStr: string, validationErrorStr: string): string {
  return `You previously generated an invalid JSON response.
Here is the error that occurred during validation or parsing:
${validationErrorStr}

Here is the raw text you generated:
"""
${invalidJsonStr}
"""

Please fix the errors and output ONLY valid JSON matching the original requested schema.
Do not wrap it in markdown. Do not include apologies. ONLY JSON.`;
}

export const PromptService = {
  buildExplanationSystemPrompt,
  buildExplanationUserPrompt,
  buildRepairPrompt
};
