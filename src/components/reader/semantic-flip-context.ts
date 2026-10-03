import {isCodePointBoundary} from './projection-offsets';
/** Crop by the supplied occurrence offsets; never search for a duplicate spelling. */
export function cropFlipContext({text,start,end,previousText,nextText}:{text:string;start:number;end:number;previousText?:string;nextText?:string}){
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||end<=start||end>text.length||!isCodePointBoundary(text,start)||!isCodePointBoundary(text,end)||end-start>120)throw new RangeError('Invalid original word span');
 let low=0,high=text.length;
 if(text.length>6000){
  const sentence=Array.from(new Intl.Segmenter(undefined,{granularity:'sentence'}).segment(text)).find(s=>s.index<=start&&s.index+s.segment.length>=end);
  if(sentence&&sentence.segment.length<=6000){low=sentence.index;high=low+sentence.segment.length;}
  else{low=Math.max(0,Math.min(start-3000,text.length-6000));high=Math.min(text.length,low+6000);if(end>high){high=end;low=high-6000;}}
  if(!isCodePointBoundary(text,low))low++;if(!isCodePointBoundary(text,high))high--;
 }
 const crop=(value:string|undefined,tail:boolean)=>{if(value===undefined)return undefined;if(value.length<=1500)return value;let bound=tail?value.length-1500:1500;if(!isCodePointBoundary(value,bound))bound+=tail?1:-1;return tail?value.slice(bound):value.slice(0,bound);};
 return {sourceText:text.slice(low,high),start:start-low,end:end-low,targetWord:text.slice(start,end),previousText:crop(previousText,true),nextText:crop(nextText,false)};
}
