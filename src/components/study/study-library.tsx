"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { csvCell } from "./export";
import { readableNote, savedSourceLanguage } from "./readable-note";
type Entry = {
  id: string;
  kind: string;
  text: string;
  note: string;
  location: string;
  createdAt: string;
  reviewAt: string | null;
  reviewCount: number;
  document: { id: string; title: string };
};
export default function StudyLibrary() {
  const [items, setItems] = useState<Entry[]>([]);
  const [languageFilter, setLanguageFilter] = useState("all");
  const [filter, setFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [revealed, setRevealed] = useState<string[]>([]);
  useEffect(() => {
    let active = true;
    fetch("/api/study")
      .then(async (r) => {
        if (!r.ok) throw new Error("学习记录加载失败，请刷新重试。");
        return r.json();
      })
      .then((d) => {
        if (active) setItems(d.items);
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);
  const visible = items.filter(
    (i) =>
      (languageFilter === "all" || ((i.kind === "word" || i.kind === "chat") && savedSourceLanguage(i.note) === languageFilter)) &&
      (filter === "all" || filter === "due"
        ? filter !== "due" ||
          (i.kind === "word" &&
            (!i.reviewAt || new Date(i.reviewAt).getTime() <= Date.now()))
        : i.kind === filter) &&
      `${i.text} ${readableNote(i.kind, i.note)} ${i.document.title}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  async function mutate(item: Entry, rating?: "again" | "good") {
    if (!rating && !window.confirm("删除这条学习记录？")) return;
    setBusy(item.id);
    setError("");
    try {
      const response = await fetch(
        rating
          ? "/api/study"
          : `/api/study?entryId=${encodeURIComponent(item.id)}`,
        {
          method: rating ? "PATCH" : "DELETE",
          ...(rating
            ? {
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ entryId: item.id, rating }),
              }
            : {}),
        },
      );
      const payload = await response.json();
      if (!response.ok)
        throw new Error(payload.error || "更新失败，请重试。");
      setItems((list) =>
        rating
          ? list.map((i) => (i.id === item.id ? { ...i, ...payload.item } : i))
          : list.filter((i) => i.id !== item.id),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy("");
    }
  }
  function download(format: "csv" | "md") {
    const text =
      format === "csv"
        ? "\uFEFF" +
          [
            ["Type", "Text", "Notes", "Book", "Location"],
            ...visible.map((i) => [
              i.kind,
              i.text,
              readableNote(i.kind, i.note),
              i.document.title,
              i.location,
            ]),
          ]
            .map((row) => row.map(csvCell).join(","))
            .join("\r\n")
        : "# Reading notes\n\n" +
          visible
            .map(
              (i) =>
                `## ${i.document.title.replace(/[\r\n]/g, " ")} · ${i.kind}\n\n${i.text}\n\n${readableNote(i.kind, i.note)}\n\nLocation: ${i.location}\n`,
            )
            .join("\n---\n\n");
    const url = URL.createObjectURL(
      new Blob([text], {
        type:
          format === "csv"
            ? "text/csv;charset=utf-8"
            : "text/markdown;charset=utf-8",
      }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `reading-notes.${format}`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6 text-foreground">
      <div>
        <p className="text-sm text-primary">温故而知新</p>
        <h1 className="text-3xl font-bold">学习</h1>
        <p className="mt-2 text-foreground">
          记录想法，复习生词，回到最初遇见它的那句话。
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <input
          aria-label="搜索学习记录"
          placeholder="搜索单词、笔记或书籍…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="min-w-48 flex-1 rounded-xl border p-3"
        />
        <select aria-label="筛选原文语言" value={languageFilter} onChange={event=>{setLanguageFilter(event.target.value);setRevealed([]);}} className="rounded-xl border p-3">
          <option value="all">所有语言</option><option value="en">English</option><option value="es">Español</option>
        </select>
        <select
          aria-label="筛选记录类型"
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            setRevealed([]);
          }}
          className="rounded-xl border p-3"
        >
          <option value="all">全部记录</option>
          <option value="note">笔记</option>
          <option value="word">生词</option>
          <option value="bookmark">书签</option>
          <option value="chat">AI 对话</option>
          <option value="due">待复习生词</option>
        </select>
        <button
          disabled={!visible.length}
          onClick={() => download("md")}
          className="rounded-xl border p-3 disabled:opacity-40"
        >
          导出 Markdown
        </button>
        <button
          disabled={!visible.length}
          onClick={() => download("csv")}
          className="rounded-xl border p-3 disabled:opacity-40"
        >
          导出 CSV
        </button>
      </div>
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-700">
          {error}
        </p>
      )}
      {loading ? (
        <p>正在加载学习记录…</p>
      ) : !visible.length ? (
        <p className="rounded-2xl border border-dashed p-10 text-center">
          {filter === "due"
            ? "今天的复习已完成。下次到期的生词会显示在这里。"
            : "没有匹配的记录。阅读时可以收藏生词、添加书签或笔记。"}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          {visible.length} 条记录
        </p>
      )}
      {visible.map((item) => (
        <article
          key={item.id}
          className="space-y-3 rounded-2xl border border-border bg-card p-5"
        >
          <div className="flex justify-between gap-3 text-sm">
            <span>
              {item.document.title} · {item.kind}{(item.kind === "word" || item.kind === "chat") ? ` · ${savedSourceLanguage(item.note) === "es" ? "Español" : "English"}` : ""}
            </span>
            <button
              disabled={busy === item.id}
              onClick={() => void mutate(item)}
              className="text-red-700"
            >
              删除
            </button>
          </div>
          <p className="whitespace-pre-wrap break-words font-medium">
            {item.text}
          </p>
          {filter === "due" && !revealed.includes(item.id) ? (
            <button
              onClick={() => setRevealed((v) => [...v, item.id])}
              className="rounded-lg bg-muted px-3 py-2"
            >
              显示释义
            </button>
          ) : (
            <p className="whitespace-pre-wrap break-words text-foreground">
              {readableNote(item.kind, item.note) || "暂无补充笔记。"}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Link
              href={`/reader/${item.document.id}?sourceLanguage=${savedSourceLanguage(item.note)}${item.location ? `&location=${encodeURIComponent(item.location)}` : ""}`}
              className="underline"
            >
              返回原文
            </Link>
            {item.kind === "word" && (
              <>
                <span>
                  {item.reviewAt
                    ? `下次复习：${new Date(item.reviewAt).toLocaleString()}`
                    : "可以复习"}
                </span>
                {(filter !== "due" || revealed.includes(item.id)) && (
                  <>
                    <button
                      disabled={busy === item.id}
                      onClick={() => void mutate(item, "again")}
                      className="rounded-lg border px-3 py-2"
                    >
                      10 分钟后再练
                    </button>
                    <button
                      disabled={busy === item.id}
                      onClick={() => void mutate(item, "good")}
                      className="rounded-lg bg-primary px-3 py-2 text-white"
                    >
                      记住了
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}
