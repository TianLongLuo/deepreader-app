import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import {
  DictionaryError,
  dictionaryWordSchema,
  lookupDictionary,
} from "@/server/reading-assistant/dictionary";

export async function GET(req: Request) {
  try {
    await requireAuth();
    const language = new URL(req.url).searchParams.get("language") || "en";
    if (language !== "en" && language !== "es") return NextResponse.json({error:"Unsupported source language"}, {status:400});
    if (language === "es") return NextResponse.json({error:"西班牙语暂不提供通用词典查询，请使用 AI 语境释义。",code:"DICTIONARY_LANGUAGE_UNSUPPORTED",aiAvailable:true,sourceLanguage:"es"}, {status:422});
    const word = dictionaryWordSchema.safeParse(
      new URL(req.url).searchParams.get("word"),
    );
    if (!word.success)
      return NextResponse.json(
        { error: "请输入一个英文单词（最多 64 个字符）" },
        { status: 400 },
      );
    return NextResponse.json(await lookupDictionary(word.data, req.signal), {
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
