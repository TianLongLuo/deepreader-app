type RecordValue = Record<string, unknown>;
function record(value: unknown): RecordValue | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as RecordValue)
    : null;
}
function string(value: unknown): string {
  return typeof value === "string" ? value : "";
}
function records(value: unknown): RecordValue[] {
  return Array.isArray(value)
    ? value.map(record).filter((item): item is RecordValue => item !== null)
    : [];
}

/** Render known saved payloads as text; React renders this without interpreting HTML. */
export function readableNote(kind: string, note: string): string {
  if (kind !== "word" && kind !== "chat") return note;
  let data: RecordValue | null;
  try {
    data = record(JSON.parse(note));
  } catch {
    return note;
  }
  if (!data) return note;
  const parts: string[] = [];
  if (data.sourceLanguage === "es") parts.push("Learning language: Español");
  else if (data.sourceLanguage === "en") parts.push("Learning language: English");
  if (kind === "word") {
    if (string(data.phonetic))
      parts.push(`Pronunciation: ${string(data.phonetic)}`);
    if (string(data.context))
      parts.push(`Original context\n${string(data.context)}`);
    for (const meaning of records(data.meanings)) {
      const definitions = records(meaning.definitions)
        .map((d) =>
          [
            string(d.definition),
            string(d.example) ? `Example: ${string(d.example)}` : "",
          ]
            .filter(Boolean)
            .join("\n"),
        )
        .filter(Boolean);
      if (definitions.length)
        parts.push(
          [string(meaning.partOfSpeech), ...definitions]
            .filter(Boolean)
            .join("\n"),
        );
    }
    const ai =
      string(data.aiExplanation) ||
      string(record(data.aiExplanation)?.answer) ||
      string(data.aiMeaning) ||
      string(record(data.aiMeaning)?.answer);
    if (ai) parts.push(`AI meaning in context\n${ai}`);
    if (data.dictionaryAvailable === false)
      parts.push(
        "No dictionary definition was available when this word was saved.",
      );
  } else {
    const answer = record(data.answer);
    const answerText = string(data.answer) || string(answer?.answer);
    if (answerText) parts.push(`AI explanation\n${answerText}`);
    for (const citation of records(answer?.citations))
      if (string(citation.quote))
        parts.push(`Source passage: ${string(citation.quote)}`);
    for (const question of records(answer?.questions)) {
      if (string(question.question))
        parts.push(
          [
            `Question: ${string(question.question)}`,
            string(question.answer) ? `Answer: ${string(question.answer)}` : "",
            string(question.quote)
              ? `Source passage: ${string(question.quote)}`
              : "",
          ]
            .filter(Boolean)
            .join("\n"),
        );
    }
    for (const turn of records(data.history)) {
      if (string(turn.content))
        parts.push(
          `${turn.role === "user" ? "You" : turn.role === "assistant" ? "AI" : "Conversation"}\n${string(turn.content)}`,
        );
    }
  }
  return parts.length
    ? parts.join("\n\n")
    : "This saved item has no readable explanation.";
}

/** Legacy saved words default to English; unknown future language codes are not accepted. */
export function savedSourceLanguage(note: string): "en" | "es" {
  try { return record(JSON.parse(note))?.sourceLanguage === "es" ? "es" : "en"; }
  catch { return "en"; }
}
