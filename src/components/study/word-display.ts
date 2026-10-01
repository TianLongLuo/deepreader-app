/** Text parts only: the caller renders them as React text, never HTML. */
export function wordSpans(text:string,word:string):Array<{text:string;highlight:boolean}>{
 if(!word)return[{text,highlight:false}];
 const pattern=word.normalize('NFC').replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const regex=new RegExp(`(?<![\\p{L}\\p{N}\\p{M}_])${pattern}(?![\\p{L}\\p{N}\\p{M}_])`,'giu');
 let normalized='';const starts:number[]=[],ends:number[]=[];
 for(const segment of new Intl.Segmenter(undefined,{granularity:'grapheme'}).segment(text)){
  const value=segment.segment.normalize('NFC');normalized+=value;
  for(let i=0;i<value.length;i++){starts.push(segment.index);ends.push(segment.index+segment.segment.length);}
 }
 const parts:Array<{text:string;highlight:boolean}>=[];let from=0;
 for(const match of normalized.matchAll(regex)){const at=starts[match.index],end=ends[match.index+match[0].length-1];parts.push({text:text.slice(from,at),highlight:false},{text:text.slice(at,end),highlight:true});from=end;}
 parts.push({text:text.slice(from),highlight:false});return parts;
}
export function displayBookTitle(title:string){
 const cleaned=title.replace(/\.(epub|pdf)$/i,'').replace(/\s*[([]Z[- ]Library[)\]]/gi,'').trim();
 return cleaned.length>120?cleaned.slice(0,120)+'…':cleaned;
}

export function capabilityLabels(input:{recognition:'new'|'learning'|'due';applicationEvidence:Array<{result:boolean|null;usedHint:boolean;disputed:boolean}>}){
 const recognition='阅读识别：'+({new:'新词',learning:'学习中',due:'待复习'}[input.recognition]),latest=input.applicationEvidence[0];
 const usage='主动使用：'+(!latest?'尚未练习':latest.disputed?'反馈待核对':latest.usedHint?'使用提示完成':latest.result===true?'本次使用正确':latest.result===false?'还需练习':'结果尚不确定');
 return {recognition,usage};
}
