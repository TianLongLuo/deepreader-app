export function csvCell(value: string) {
  const safe =
    /^[\s]*[=+@-]/.test(value) || /^[\t\r\n]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

import type {WordDetail} from '@/lib/vocabulary';
/** Keep original evidence and offline dictionary credits alongside compact study meaning. */
export function exportVocabulary(items:WordDetail[],format:'csv'|'md'){
 const evidence=(item:WordDetail)=>item.sources.map(s=>({book:s.bookTitle,documentId:s.documentId,location:s.location,surface:s.surface,sentence:s.sentence,context:s.context,rawNote:s.rawNote,dictionary:s.dictionary}));
 if(format==='csv')return '\uFEFF'+[['word','contextMeaning','meaningOrigin','language','tags','frequency','processedPositions','priority','sources'].map(csvCell).join(','),...items.map(item=>[item.word,item.contextMeaning,item.meaningOrigin,item.sourceLanguage,item.tags.join(' · '),JSON.stringify(item.frequency??null),JSON.stringify(item.exposure??null),String(item.priority),JSON.stringify(evidence(item))].map(csvCell).join(','))].join('\r\n');
 const text=(value:string)=>value.replace(/</g,'&lt;').replace(/>/g,'&gt;');
 return items.map(item=>`## ${text(item.word)}\n\n${text(item.contextMeaning)}\n\n来源：${item.meaningOrigin==='manual'?'人工修订':item.meaningOrigin==='ai'?'AI 语境建议':item.meaningOrigin==='legacy'?'旧释义（语言未分类）':'待整理'}\n\n词频来源：${text(JSON.stringify(item.frequency??null))}\n\n已处理位置：${text(JSON.stringify(item.exposure??null))}\n\n个人优先级：${item.priority}\n\n${item.sources.map(source=>`### ${text(source.bookTitle)}\n\n位置：${text(source.location)}\n\n${text(source.sentence)}\n\n完整上下文：${text(source.context)}\n\n词典信息：${text(JSON.stringify(source.dictionary))}\n\n原始证据：${text(source.rawNote)}`).join('\n\n')}`).join('\n\n---\n\n');
}
