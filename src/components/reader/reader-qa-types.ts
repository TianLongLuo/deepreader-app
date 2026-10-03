import type {ReadingWindowGeometry} from './reading-flow';
import type {ReadingProgressSnapshot} from './progress-sync';
import type {CompletedFlip} from './semantic-flip-controller';
/** Opt-in local fixture callback only. Production pages never supply it. */
export interface ReaderModeQA {
 cfiIdentity():{rendition:boolean;contents:boolean};cfiCounts():{registeredFromRange:number;registeredToRange:number};
 canonicalWordCFI(word:string,occurrence:number,chapter?:string):string;selectOriginal(cfi:string):void;
 visibleUnits():{key:string;sourceId:string;location:string|null}[];loadedChapterIds():string[];
 geometry():ReadingWindowGeometry|null;savedProgress():ReadingProgressSnapshot|null;
 flipWord(cfi:string):Promise<void>;setTheme(theme:'light'|'dark'|'sepia'):void;
 locationRange():{start:string;end:string}|null;probeCanonicalCalls():{mapping:number;selection:number};completed():readonly CompletedFlip[];
 jump(cfi:string):Promise<void>;metrics():{width:number;height:number}[];
}
