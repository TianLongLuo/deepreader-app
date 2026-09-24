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
        if (!r.ok) throw new Error("Unable to load your learning library.");
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
    if (!rating && !window.confirm("Delete this saved item?")) return;
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
        throw new Error(payload.error || "Unable to update item");
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
    <div className="mx-auto max-w-5xl space-y-6 p-6 text-orange-950">
      <div>
        <p className="text-sm text-orange-700">YOUR READING COMPANION</p>
        <h1 className="text-3xl font-bold">Notes & vocabulary</h1>
        <p className="mt-2 text-orange-900/60">
          Keep ideas, revisit words, and return to their original context.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <input
          aria-label="Search saved items"
          placeholder="Search words, notes, books…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="min-w-48 flex-1 rounded-xl border p-3"
        />
        <select aria-label="Filter learning language" value={languageFilter} onChange={event=>{setLanguageFilter(event.target.value);setRevealed([]);}} className="rounded-xl border p-3">
          <option value="all">All languages</option><option value="en">English</option><option value="es">Español</option>
        </select>
        <select
          aria-label="Filter saved items"
          value={filter}
          onChange={(e) => {
            setFilter(e.target.value);
            setRevealed([]);
          }}
          className="rounded-xl border p-3"
        >
          <option value="all">All saved items</option>
          <option value="note">Notes</option>
          <option value="word">Vocabulary</option>
          <option value="bookmark">Bookmarks</option>
          <option value="chat">AI conversations</option>
          <option value="due">Words due for review</option>
        </select>
        <button
          disabled={!visible.length}
          onClick={() => download("md")}
          className="rounded-xl border p-3 disabled:opacity-40"
        >
          Export Markdown
        </button>
        <button
          disabled={!visible.length}
          onClick={() => download("csv")}
          className="rounded-xl border p-3 disabled:opacity-40"
        >
          Export CSV
        </button>
      </div>
      {error && (
        <p role="alert" className="rounded-xl bg-red-50 p-3 text-red-700">
          {error}
        </p>
      )}
      {loading ? (
        <p>Loading saved items…</p>
      ) : !visible.length ? (
        <p className="rounded-2xl border border-dashed p-10 text-center">
          {filter === "due"
            ? "All caught up. Words will appear here when their next review is due."
            : "No matching items. Save a word, bookmark, or note while reading."}
        </p>
      ) : (
        <p className="text-sm text-orange-800/60">
          {visible.length} saved items
        </p>
      )}
      {visible.map((item) => (
        <article
          key={item.id}
          className="space-y-3 rounded-2xl border border-orange-200 bg-white/80 p-5"
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
              Delete
            </button>
          </div>
          <p className="whitespace-pre-wrap break-words font-medium">
            {item.text}
          </p>
          {filter === "due" && !revealed.includes(item.id) ? (
            <button
              onClick={() => setRevealed((v) => [...v, item.id])}
              className="rounded-lg bg-orange-100 px-3 py-2"
            >
              Reveal meaning
            </button>
          ) : (
            <p className="whitespace-pre-wrap break-words text-orange-900/75">
              {readableNote(item.kind, item.note) || "No additional notes."}
            </p>
          )}
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Link
              href={`/reader/${item.document.id}${item.location ? `?location=${encodeURIComponent(item.location)}` : ""}`}
              className="underline"
            >
              Back to original
            </Link>
            {item.kind === "word" && (
              <>
                <span>
                  {item.reviewAt
                    ? `Next review: ${new Date(item.reviewAt).toLocaleString()}`
                    : "Ready for review"}
                </span>
                {(filter !== "due" || revealed.includes(item.id)) && (
                  <>
                    <button
                      disabled={busy === item.id}
                      onClick={() => void mutate(item, "again")}
                      className="rounded-lg border px-3 py-2"
                    >
                      Review again in 10 min
                    </button>
                    <button
                      disabled={busy === item.id}
                      onClick={() => void mutate(item, "good")}
                      className="rounded-lg bg-orange-500 px-3 py-2 text-white"
                    >
                      I remembered
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
