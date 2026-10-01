import {MEANING_GROUP_MAX_TEXT,type MeaningGroupResult,type MeaningSpan} from './meaning-groups';
export type MeaningTextUnit={text:string;start:number;end:number};
/** Absolute render offsets are not a validated result relative to its unit text. */
export type MappedMeaningSpans={groups:MeaningSpan[];verbs:MeaningSpan[]};
export class MeaningUnitTooLargeError extends Error {
  constructor(public start:number,public max:number){super('A source token exceeds the analysis unit limit');this.name='MeaningUnitTooLargeError';}
}
/** Never normalizes the source again: offsets refer to exactly the caller's text. */
export function splitMeaningText(text:string,max=1200,language:'en'|'es'='en'):MeaningTextUnit[]{
  if(!Number.isInteger(max)||max<1||max>MEANING_GROUP_MAX_TEXT)throw new RangeError('Invalid analysis unit size');
  const sentenceEnds=[...new Intl.Segmenter(language,{granularity:'sentence'}).segment(text)].map(s=>s.index+s.segment.length);
  const units:MeaningTextUnit[]=[];
  let start=0;
  while(start<text.length){
    while(start<text.length&&/\s/.test(text[start]))start++;
    if(start===text.length)break;
    let end=Math.min(text.length,start+max);
    if(end<text.length){
      const sentenceEnd=sentenceEnds.findLast(value=>value>start&&value<=end);
      if(sentenceEnd!==undefined)end=sentenceEnd;
      else {
        while(end>start&&!/\s/.test(text[end]))end--;
        if(end===start)throw new MeaningUnitTooLargeError(start,max);
      }
    }
    let trimmed=end;while(trimmed>start&&/\s/.test(text[trimmed-1]))trimmed--;
    if(trimmed>start)units.push({text:text.slice(start,trimmed),start,end:trimmed});
    start=end;
  }
  return units;
}
export function offsetMeaningResult(result:MeaningGroupResult,offset:number):MappedMeaningSpans {
  if(!Number.isSafeInteger(offset)||offset<0||!Number.isSafeInteger(offset+result.text.length))throw new RangeError('Invalid source offset');
  const map=(s:MeaningSpan):MeaningSpan=>({...s,start:s.start+offset,end:s.end+offset});
  return {groups:result.groups.map(map),verbs:result.verbs.map(map)};
}
