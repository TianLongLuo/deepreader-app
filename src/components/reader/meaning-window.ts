import type {ReadingWindowGeometry,ViewportRect} from './reading-flow';
export type MeaningUnitRef={key:string;text:string;sourceId:string;location:string|null;start:number;end:number};
export type MeaningWindowSnapshot={visible:readonly MeaningUnitRef[];neighborhood:readonly {unit:MeaningUnitRef;distance:1|2;direction:-1|1}[];readingDirection:-1|1};
export const intersectsReadingRect=(a:ViewportRect,b:ViewportRect)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;
export function partitionMeaningWindow(candidates:readonly {unit:MeaningUnitRef;rects:readonly ViewportRect[]}[],geometry:ReadingWindowGeometry,readingDirection:-1|1):MeaningWindowSnapshot{
 const visible:MeaningUnitRef[]=[],neighborhood:MeaningWindowSnapshot['neighborhood'][number][]=[];
 for(const {unit,rects} of candidates){
  const valid=rects.filter(r=>[r.top,r.bottom,r.left,r.right].every(Number.isFinite)&&r.right>r.left&&r.bottom>r.top);
  if(valid.some(r=>intersectsReadingRect(r,geometry.visible))){visible.push(unit);continue;}
  let closest:{distance:1|2;direction:-1|1}|undefined;
  for(const rect of valid){
   if(!intersectsReadingRect(rect,geometry.neighborhood))continue;
   const horizontal=geometry.axis==='horizontal',low=horizontal?rect.left:rect.top,high=horizontal?rect.right:rect.bottom,vlow=horizontal?geometry.visible.left:geometry.visible.top,vhigh=horizontal?geometry.visible.right:geometry.visible.bottom;
   const direction:1|-1=high<=vlow?-1:1,gap=direction===1?Math.max(0,low-vhigh):Math.max(0,vlow-high);
   const distance=Math.floor(gap/geometry.screenStep)+1;if(distance>2)continue;
   if(!closest||distance<closest.distance)closest={distance:distance as 1|2,direction};
  }
  if(closest)neighborhood.push({unit,...closest});
 }
 return {visible,neighborhood,readingDirection};
}
