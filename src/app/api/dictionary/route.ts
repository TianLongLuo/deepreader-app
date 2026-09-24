import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import {
  DictionaryError,
  dictionaryWordSchema,
  spanishDictionaryWordSchema,
  lookupDictionary,
} from "@/server/reading-assistant/dictionary";

export async function GET(req: Request) {
  try {
    await requireAuth();
    const language = new URL(req.url).searchParams.get("language") || "en";
    if (language !== "en" && language !== "es") return NextResponse.json({error:"Unsupported source language"}, {status:400});
    const word = (language === "es" ? spanishDictionaryWordSchema : dictionaryWordSchema).safeParse(
      new URL(req.url).searchParams.get("word"),
    );
    if (!word.success)
      return NextResponse.json(
        { error: "请输入一个所选语言的单词（最多 64 个字符）" },
        { status: 400 },
      );
    return NextResponse.json(await lookupDictionary(word.data, req.signal, language), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    if (req.signal.aborted) return new Response(null, { status: 499 });
    if (error instanceof DictionaryError)
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    if (error instanceof Error && error.message === "Authentication required")
      return NextResponse.json({ error: error.message }, { status: 401 });
    return NextResponse.json(
      { error: "查词失败，请稍后重试" },
      { status: 502 },
    );
  }
}
