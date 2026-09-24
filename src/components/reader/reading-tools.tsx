"use client";
import { useEffect, useRef, useState } from "react";
import { speakInBrowser } from "./language-tools";
import { useReaderStore } from "@/hooks/use-reader-store";

export type ReadingEntry = {
  id: string;
  kind: string;
  text: string;
  note: string | null;
  location: string | null;
  createdAt: string;
};
export type ReadingSelection = {
  text: string;
  location: string;
  previousText?: string;
  nextText?: string;
  chapterText?: string;
};
type Answer = {
  provider?: string;
  model?: string;
  answer: string;
  citations?: { quote: string }[];
  questions?: { question: string; answer: string; quote: string }[];
};
type Dictionary = {
  word: string;
  phonetic?: string;
  audioUrl?: string;
  sourceUrl?: string;
  source?: string;
  provider?: string;
  licenseUrl?: string;
  attribution?: string;
  definitionLanguage?: string;
  meanings: {
    partOfSpeech: string;
    definitions: { definition: string; example?: string }[];
  }[];
};
export async function readingRequest(url: string, init?: RequestInit) {
  const response = await fetch(url, init);
  const data = await response.json();
  if (!response.ok)
    throw new Error(data.error || "Request failed. Please retry.");
  return data;
}
const button =
  "rounded-xl border border-orange-200 px-3 py-2 text-sm hover:bg-orange-100 focus-visible:outline-2 focus-visible:outline-orange-500 disabled:opacity-40";
const input =
  "w-full rounded-xl border border-orange-200 bg-white px-3 py-2 text-sm text-orange-950";
export default function ReadingTools({
  documentId,
  selection,
  open,
  onClose,
  onOpen,
  onJump,
  onDetailed,
  entries,
  onSave,
  onDelete,
  onQuote,
  onRestoreSelection,
}: {
  documentId: string;
  selection: ReadingSelection | null;
  open: boolean;
  onClose: () => void;
  onOpen: () => void;
  onJump: (location: string) => void;
  onDetailed: () => void;
  entries: ReadingEntry[];
  onSave: (
    kind: string,
    text: string,
    note?: string,
    location?: string,
  ) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
  onQuote: (quote: string) => void;
  onRestoreSelection: (selection: ReadingSelection) => void;
}) {
  const {
    fontSize,
    lineHeight,
    setTypography,
    readingLevel,
    setReadingLevel,
    explanationLanguage,
    setExplanationLanguage,
    sourceLanguage,
    setSourceLanguage,
  } = useReaderStore();
  const [tab, setTab] = useState("ai");
  const [query, setQuery] = useState("");
  const [word, setWord] = useState("");
  const [wordAnswer, setWordAnswer] = useState<{
    word: string;
    answer: Answer;
  } | null>(null);
  const [dictionary, setDictionary] = useState<Dictionary | null>(null);
  const [results, setResults] = useState<{ text: string; location: string }[]>(
    [],
  );
  const [note, setNote] = useState("");
  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState<
    { role: "user" | "assistant"; content: string }[]
  >([]);
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [revealed, setRevealed] = useState<number[]>([]);
  const [responses, setResponses] = useState<Record<number, string>>({});
  const controller = useRef<AbortController | null>(null);
  const lastAction = useRef<(() => Promise<void>) | null>(null);
  useEffect(() => {
    controller.current?.abort();
    setBusy(false);
    setAnswer(null);
    setHistory([]);
    setDictionary(null);
    setWordAnswer(null);
    setStatus("");
    setError("");
    setRevealed([]);
    setResponses({});
    if (selection) {
      setTab(
        /^[\p{L}\p{M}'’-]+$/u.test(selection.text.trim()) ? "dictionary" : "ai",
      );
      setWord(
        /^[\p{L}\p{M}'’-]+$/u.test(selection.text.trim())
          ? selection.text.trim()
          : "",
      );
    }
  }, [selection]);
  useEffect(() => () => controller.current?.abort(), []);
  async function perform(action: (signal: AbortSignal) => Promise<void>) {
    controller.current?.abort();
    const c = new AbortController();
    controller.current = c;
    setBusy(true);
    setError("");
    lastAction.current = () => perform(action);
    try {
      await action(c.signal);
    } catch (e) {
      if (!c.signal.aborted)
        setError(e instanceof Error ? e.message : "Request failed");
    } finally {
      if (controller.current === c) setBusy(false);
    }
  }
  function ask(mode: string) {
    if (!selection?.text) return;
    const prompt = question;
    void perform(async (signal) => {
      const data = await readingRequest("/api/reading-assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal,
        body: JSON.stringify({
          documentId,
          mode,
          text: (mode === "summary" || mode === "quiz"
            ? selection.chapterText || selection.text
            : selection.text
          ).slice(0, 24000),
          previousText: selection.previousText?.slice(0, 6000),
          nextText: selection.nextText?.slice(0, 6000),
          question: prompt,
          history: [
            ...(history.length
              ? history
              : answer
                ? [{ role: "assistant", content: answer.answer }]
                : []),
          ]
            .slice(-12)
            .map((h) => ({ ...h, content: h.content.slice(0, 6000) })),
          level: readingLevel,
          language: explanationLanguage,
          sourceLanguage,
        }),
      });
      if (signal.aborted) return;
      setAnswer(data);
      setRevealed([]);
      setResponses({});
      if (mode === "ask") {
        setHistory((h) => [
          ...h,
          { role: "user", content: prompt },
          { role: "assistant", content: data.answer },
        ]);
        setQuestion("");
      }
    });
  }
  async function save(kind: string, text: string, body?: string) {
    setError("");
    try {
      await onSave(kind, text, body, selection?.location);
      setStatus("Saved to your library");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
    }
  }
  const close = () => {
    controller.current?.abort();
    setBusy(false);
    onClose();
  };
  return (
    <>
      <button
        type="button"
        onClick={onOpen}
        className="absolute bottom-4 right-4 z-20 rounded-full bg-orange-600 px-5 py-3 text-sm font-bold text-white shadow-lg"
      >
        查词 · 阅读工具
      </button>
      {open && (
        <aside
          aria-label="阅读工具"
          className="absolute inset-y-3 right-3 z-40 flex w-[min(440px,calc(100%-24px))] flex-col overflow-hidden rounded-3xl border border-orange-200 bg-orange-50 text-orange-950 shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-orange-200 p-4">
            <h2 className="font-semibold">阅读工具</h2>
            <button
              className={button}
              onClick={close}
              aria-label="关闭阅读工具"
            >
              关闭
            </button>
          </div>
          <label className="flex items-center justify-between gap-3 border-b border-orange-200 px-4 py-3 text-sm">
            学习语言
            <select aria-label="学习语言" className="rounded-lg border border-orange-200 bg-white px-3 py-2" value={sourceLanguage} onChange={event=>{
              controller.current?.abort();setBusy(false);lastAction.current=null;
              setDictionary(null);setWordAnswer(null);setAnswer(null);setHistory([]);setError("");setStatus("");setRevealed([]);setResponses({});
              setSourceLanguage(event.target.value as "en"|"es");
            }}><option value="en">英语 · English</option><option value="es">西班牙语 · Español</option></select>
          </label>
          <label className="flex items-center justify-between gap-3 border-b border-orange-200 px-4 py-3 text-sm">
            讲解语言
            <select aria-label="讲解语言" className="rounded-lg border border-orange-200 bg-white px-3 py-2" value={explanationLanguage} onChange={event=>{
              controller.current?.abort();setBusy(false);lastAction.current=null;
              setWordAnswer(null);setAnswer(null);setHistory([]);setError("");setStatus("");setRevealed([]);setResponses({});
              setExplanationLanguage(event.target.value);
            }}><option value="Chinese">中文</option><option value="English">English</option><option value="Spanish">Español</option></select>
          </label>
          <nav className="flex flex-wrap gap-1 border-b border-orange-200 p-3">
            {[
              ["ai", "AI 阅读"],
              ["dictionary", "查词"],
              ["notes", "笔记"],
              ["search", "书内搜索"],
              ["settings", "设置"],
            ].map(([id, label]) => (
              <button
                key={id}
                className={`${button} ${tab === id ? "bg-orange-200" : ""}`}
                onClick={() => {
                  controller.current?.abort();
                  setBusy(false);
                  setError("");
                  setStatus("");
                  lastAction.current = null;
                  setTab(id);
                }}
              >
                {label}
              </button>
            ))}
          </nav>
          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            {selection && (
              <blockquote className="max-h-32 overflow-y-auto border-l-2 border-orange-500 pl-3 text-sm leading-relaxed">
                {selection.text}
              </blockquote>
            )}
            {error && (
              <div
                role="alert"
                className="rounded-xl bg-red-50 p-3 text-sm text-red-800"
              >
                {error}{" "}
                {lastAction.current && (
                  <button
                    className={button}
                    onClick={() => void lastAction.current?.()}
                  >
                    重试本次操作
                  </button>
                )}
              </div>
            )}
            {status && (
              <p role="status" className="text-sm">
                {status}
              </p>
            )}
            {busy && (
              <div
                role="status"
                className="flex items-center justify-between text-sm"
              >
                正在处理…
                <button
                  className={button}
                  onClick={() => {
                    controller.current?.abort();
                    setBusy(false);
                  }}
                >
                  停止
                </button>
              </div>
            )}
            {tab === "ai" && (
              <>
                <label className="block text-sm">
                  讲解难度
                  <select
                    className={`${input} mt-1`}
                    value={readingLevel}
                    onChange={(e) =>
                      setReadingLevel(e.target.value as typeof readingLevel)
                    }
                  >
                    <option value="beginner">初级</option>
                    <option value="intermediate">中级</option>
                    <option value="advanced">高级</option>
                  </select>
                </label>
                {!selection && (
                  <p className="text-sm">
                    点击正文段落或选中一句话，开始理解原文。
                  </p>
                )}
                <div className="flex flex-wrap gap-2">
                  {[
                    ["quick", "先看大意"],
                    ["explain", "深入分析"],
                    ["translate", "翻译选句"],
                    ["summary", "本章 / 页回顾"],
                    ["quiz", "理解自测"],
                  ].map(([mode, label]) => (
                    <button
                      disabled={!selection || busy}
                      className={button}
                      key={mode}
                      onClick={() => ask(mode)}
                    >
                      {label}
                    </button>
                  ))}
                  <button
                    disabled={!selection}
                    className={button}
                    onClick={onDetailed}
                  >
                    句法详解
                  </button>
                </div>
                <p className="text-xs text-orange-800">
                  回顾和自测仅针对当前已加载章节或 PDF 页
                  {(selection?.chapterText?.length || 0) > 24000
                    ? "的前 24,000 字符"
                    : ""}
                  ；答案依据本段及相邻上下文。
                </p>
                {answer && (
                  <div className="space-y-3 rounded-xl bg-white p-4">
                    {(answer.provider || answer.model) && <p className="text-xs text-orange-700">本次模型：{answer.provider || "未知服务"} · {answer.model || "未知模型"}</p>}
                    <p className="whitespace-pre-wrap text-sm leading-7">
                      {answer.questions?.length
                        ? "先作答，再展开参考答案。"
                        : answer.answer}
                    </p>
                    {answer.citations?.map((c, i) => (
                      <button
                        key={i}
                        className="block text-left text-xs text-orange-700 underline"
                        onClick={() => onQuote(c.quote)}
                      >
                        原文依据：{c.quote}
                      </button>
                    ))}
                    {answer.questions?.map((q, i) => (
                      <div
                        key={i}
                        className="space-y-2 border-t border-orange-100 pt-3"
                      >
                        <p>
                          {i + 1}. {q.question}
                        </p>
                        <textarea
                          aria-label={`第 ${i + 1} 题答案`}
                          className={input}
                          value={responses[i] || ""}
                          onChange={(e) =>
                            setResponses({ ...responses, [i]: e.target.value })
                          }
                        />
                        <button
                          className={button}
                          disabled={!responses[i]?.trim()}
                          onClick={() => setRevealed([...revealed, i])}
                        >
                          查看解析
                        </button>
                        {revealed.includes(i) && (
                          <>
                            <p className="text-sm">{q.answer}</p>
                            <button
                              className="text-sm text-orange-700 underline"
                              onClick={() => onQuote(q.quote)}
                            >
                              {q.quote}
                            </button>
                          </>
                        )}
                      </div>
                    ))}
                    <button
                      className={button}
                      onClick={() =>
                        void save(
                          "chat",
                          selection?.text || "",
                          JSON.stringify({ answer, history, sourceLanguage }),
                        )
                      }
                    >
                      保存解释与追问
                    </button>
                  </div>
                )}
                {history.length > 0 && (
                  <details>
                    <summary className="cursor-pointer text-sm">
                      查看追问记录
                    </summary>
                    {history.map((h, i) => (
                      <p className="my-2 whitespace-pre-wrap text-sm" key={i}>
                        {h.role === "user" ? "我" : "AI"}：{h.content}
                      </p>
                    ))}
                  </details>
                )}
                <form
                  className="space-y-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    ask("ask");
                  }}
                >
                  <input
                    aria-label="继续追问"
                    className={input}
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    placeholder="这里的 it 指谁？"
                  />
                  <button
                    disabled={!selection || !question.trim() || busy}
                    className={button}
                  >
                    继续追问
                  </button>
                </form>
              </>
            )}
            {tab === "dictionary" && (
              <>
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void perform(async (signal) => {
                      const data = await readingRequest(
                        `/api/dictionary?word=${encodeURIComponent(word.trim().normalize("NFC"))}&language=${sourceLanguage}`,
                        { signal },
                      );
                      if (!signal.aborted) setDictionary(data);
                    });
                  }}
                >
                  <input
                    aria-label="输入单词"
                    className={input}
                    value={word}
                    onChange={(e) => {
                      controller.current?.abort();
                      setBusy(false);
                      setWord(e.target.value);
                      setDictionary(null);
                      setWordAnswer(null);
                      setError("");
                      setStatus("");
                      lastAction.current = null;
                    }}
                    placeholder={sourceLanguage === "es" ? "输入西班牙语单词，如 corazón" : "输入英文单词"}
                  />
                  <button className={button} disabled={!word.trim() || busy}>查词</button>
                </form>
                <button type="button" className={button} disabled={!word.trim()} onClick={()=>{setError("");void speakInBrowser(word.trim(),sourceLanguage).catch(error=>setError(error.message));}}>朗读单词</button>
                {dictionary && (
                  <div className="space-y-3 rounded-xl bg-white p-4">
                    <h3 className="text-xl font-bold">
                      {dictionary.word}{" "}
                      <span className="text-sm font-normal">
                        {dictionary.phonetic}
                      </span>
                    </h3>
                    <p className="text-xs text-orange-700">词典 · {sourceLanguage === "es" ? "西班牙语词条" : "英语词条"}{dictionary.definitionLanguage === "en" ? " · 英文释义" : ""}</p>
                    {dictionary.audioUrl && <audio controls src={dictionary.audioUrl} className="max-w-full"/>}
                    {dictionary.meanings.map((m, i) => (
                      <section key={i}>
                        <h4 className="text-sm font-semibold">
                          {m.partOfSpeech}
                        </h4>
                        {m.definitions.slice(0, 5).map((d, j) => (
                          <p key={j} className="mt-2 text-sm">
                            {d.definition}
                            {d.example && (
                              <em className="mt-1 block text-orange-800">
                                {d.example}
                              </em>
                            )}
                          </p>
                        ))}
                      </section>
                    ))}
                    {dictionary.attribution && <p className="text-xs text-orange-800">{dictionary.attribution}</p>}
                    {dictionary.licenseUrl && <a href={dictionary.licenseUrl} target="_blank" rel="noreferrer" className="block text-xs underline">CC BY-SA 许可</a>}
                    {dictionary.sourceUrl && (
                      <a
                        href={dictionary.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs underline"
                      >
                        {dictionary.source || "词典来源"}
                      </a>
                    )}
                  </div>
                )}
                <button
                  className={button}
                  disabled={!word.trim() || busy}
                  onClick={() =>
                    void perform(async (signal) => {
                      const result = await readingRequest(
                        "/api/reading-assistant",
                        {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          signal,
                          body: JSON.stringify({
                            documentId,
                            mode: "word",
                            text: (selection?.text || word).slice(0, 24000),
                            question: `Explain the word: ${word}`,
                            previousText: selection?.previousText?.slice(
                              0,
                              6000,
                            ),
                            nextText: selection?.nextText?.slice(0, 6000),
                            level: readingLevel,
                            language: explanationLanguage,
          sourceLanguage,
                          }),
                        },
                      );
                      if (!signal.aborted)
                        setWordAnswer({ word: word.trim(), answer: result });
                    })
                  }
                >
                  AI 语境释义
                </button>
                {wordAnswer && (
                  <div className="rounded-xl bg-white p-4">
                    <p className="text-xs text-orange-700">
                      AI 生成 · {wordAnswer.word} · 结合所选原文
                    </p>
                    {(wordAnswer.answer.provider || wordAnswer.answer.model) && <p className="mt-2 text-xs text-orange-700">本次模型：{wordAnswer.answer.provider || "未知服务"} · {wordAnswer.answer.model || "未知模型"}</p>}
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-7">
                      {wordAnswer.answer.answer}
                    </p>
                  </div>
                )}
                {!dictionary && (
                  <p className="text-xs text-orange-800">
                    词典释义暂缺。仍可保存单词与原句，稍后补查；AI 释义会单独标明。
                  </p>
                )}
                <button
                  className={button}
                  disabled={!word.trim() || busy}
                  onClick={() =>
                    void save(
                      "word",
                      word.trim(),
                      JSON.stringify({
                        context: [
                          selection?.previousText,
                          selection?.text,
                          selection?.nextText,
                        ]
                          .filter(Boolean)
                          .join(" ")
                          .slice(0, 6000),
                        phonetic: dictionary?.phonetic,
                        meanings: dictionary?.meanings || [],
                        aiExplanation:
                          wordAnswer?.word.toLowerCase() ===
                          word.trim().toLowerCase()
                            ? wordAnswer.answer.answer
                            : undefined,
                        dictionaryAvailable: Boolean(dictionary),
                        provider: dictionary?.provider || dictionary?.source,
                        sourceUrl: dictionary?.sourceUrl,
                        licenseUrl: dictionary?.licenseUrl,
                        attribution: dictionary?.attribution,
                        definitionLanguage: dictionary?.definitionLanguage,
                        sourceLanguage,
                      }),
                    )
                  }
                >
                  加入生词本（保留原句）
                </button>
              </>
            )}
            {tab === "search" && (
              <>
                <form
                  className="flex gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void perform(async (signal) => {
                      const data = await readingRequest(
                        `/api/documents/${documentId}/search?q=${encodeURIComponent(query)}`,
                        { signal },
                      );
                      if (signal.aborted) return;
                      setResults(data.results);
                      setStatus(
                        data.truncated
                          ? "结果较多，请缩小关键词范围"
                          : `找到 ${data.results.length} 处`,
                      );
                    });
                  }}
                >
                  <input
                    className={input}
                    aria-label="全文关键词"
                    placeholder="搜索全书关键词"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  <button disabled={busy || !query.trim()} className={button}>
                    搜索
                  </button>
                </form>
                {results.map((r, i) => (
                  <button
                    key={i}
                    className="block w-full rounded-xl bg-white p-3 text-left text-sm"
                    onClick={() => {
                      onJump(r.location);
                      close();
                    }}
                  >
                    {r.text}
                  </button>
                ))}
              </>
            )}
            {tab === "notes" && (
              <>
                <textarea
                  className={input}
                  aria-label="我的笔记"
                  placeholder="写下你的理解…"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                />
                <div className="flex gap-2">
                  <button
                    disabled={!selection}
                    className={button}
                    onClick={() =>
                      void save("note", selection?.text || "", note)
                    }
                  >
                    保存划线与笔记
                  </button>
                  <button
                    disabled={!selection}
                    className={button}
                    onClick={() =>
                      void save("bookmark", selection?.text || "书签")
                    }
                  >
                    收藏原文
                  </button>
                </div>
                <a href="/study" className="block text-sm underline">
                  打开生词复习与学习库 →
                </a>
                {entries.length === 0 && (
                  <p className="text-sm">还没有笔记。选中原文即可保存。</p>
                )}
                {entries.map((item) => (
                  <article
                    key={item.id}
                    className="space-y-2 rounded-xl bg-white p-3"
                  >
                    <p className="text-xs text-orange-700">
                      {(
                        {
                          note: "笔记",
                          word: "生词",
                          chat: "AI 解释",
                          bookmark: "书签",
                        } as Record<string, string>
                      )[item.kind] || item.kind}
                    </p>
                    <p className="line-clamp-3 text-sm">{item.text}</p>
                    {item.kind === "note" && (
                      <p className="whitespace-pre-wrap text-sm">{item.note}</p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {item.location && (
                        <button
                          className={button}
                          onClick={() => {
                            if (item.kind === "word" || item.kind === "chat") {try {setSourceLanguage(JSON.parse(item.note || "{}").sourceLanguage === "es" ? "es" : "en");} catch {setSourceLanguage("en");}}
                              onJump(item.location!);
                            close();
                          }}
                        >
                          回原文
                        </button>
                      )}
                      {item.kind === "chat" && (
                        <button
                          className={button}
                          onClick={() => {
                            try {
                              const saved = JSON.parse(item.note || "{}");
                              setSourceLanguage(saved.sourceLanguage === "es" ? "es" : "en");
                              onRestoreSelection({
                                text: item.text,
                                location: item.location || "",
                              });
                              window.setTimeout(() => {
                                setAnswer(saved.answer);
                                setHistory(saved.history || []);
                                setTab("ai");
                              }, 0);
                            } catch {
                              setError("保存的解释无法读取");
                            }
                          }}
                        >
                          恢复解释
                        </button>
                      )}
                      <button
                        className={button}
                        onClick={() =>
                          void onDelete(item.id).catch((e) =>
                            setError(e.message),
                          )
                        }
                      >
                        删除
                      </button>
                    </div>
                  </article>
                ))}
              </>
            )}
            {tab === "settings" && (
              <>
                <label className="block text-sm">
                  字号 {fontSize}px
                  <input
                    className="mt-3 block w-full accent-orange-600"
                    type="range"
                    min="14"
                    max="30"
                    value={fontSize}
                    onChange={(e) =>
                      setTypography(Number(e.target.value), lineHeight)
                    }
                  />
                </label>
                <label className="block text-sm">
                  行距 {lineHeight.toFixed(1)}
                  <input
                    className="mt-3 block w-full accent-orange-600"
                    type="range"
                    min="1.3"
                    max="2.5"
                    step="0.1"
                    value={lineHeight}
                    onChange={(e) =>
                      setTypography(fontSize, Number(e.target.value))
                    }
                  />
                </label>
              </>
            )}
          </div>
        </aside>
      )}
    </>
  );
}
