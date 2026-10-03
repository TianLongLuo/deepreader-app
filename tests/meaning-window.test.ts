import {expect,it} from 'vitest';
import {partitionMeaningWindow,type MeaningUnitRef} from '@/components/reader/meaning-window';
import {readingWindowGeometry} from '@/components/reader/reading-flow';
const unit=(key:string):MeaningUnitRef=>({key,text:'Text.',sourceId:key,location:key,start:0,end:5});
const rect=(top:number,bottom:number,left=0,right=500)=>({top,bottom,left,right});
it('classifies actual text rectangles, not a spanning paragraph box, across two neighboring screens',()=>{
 const g=readingWindowGeometry({flow:'vertical',readingRect:rect(0,500),browserRect:rect(0,500)})!;
 const w=partitionMeaningWindow([{unit:unit('visible'),rects:[rect(100,120)]},{unit:unit('prev'),rects:[rect(-80,-50)]},{unit:unit('next2'),rects:[rect(1200,1230)]},{unit:unit('third'),rects:[rect(1550,1580)]},{unit:unit('cross'),rects:[rect(-700,-680),rect(20,40)]}],g,1);
 expect(w.visible.map(u=>u.key)).toEqual(['visible','cross']);expect(w.neighborhood.map(n=>[n.unit.key,n.distance,n.direction])).toEqual([['prev',1,-1],['next2',2,1]]);
});
it('uses actual horizontal full-screen delta and keeps equal text at distinct source locations',()=>{
 const g=readingWindowGeometry({flow:'paginated',readingRect:rect(0,500,0,1000),browserRect:rect(0,500,0,1000),layoutDelta:1200})!;
 const w=partitionMeaningWindow([{unit:unit('first'),rects:[rect(0,20,10,80)]},{unit:unit('second'),rects:[rect(0,20,600,670)]},{unit:unit('n1'),rects:[rect(0,20,1400,1500)]},{unit:unit('n2'),rects:[rect(0,20,2700,2800)]},{unit:unit('outside'),rects:[rect(0,20,3500,3600)]}],g,-1);
 expect(w.visible).toHaveLength(2);expect(w.readingDirection).toBe(-1);expect(w.neighborhood.map(n=>n.distance)).toEqual([1,2]);
});
it('rejects zero-size and nonfinite text rects and prefers the closest overlapping screen',()=>{
 const g=readingWindowGeometry({flow:'vertical',readingRect:rect(0,500),browserRect:rect(0,500)})!;
 const w=partitionMeaningWindow([{unit:unit('invalid'),rects:[rect(20,20)]},{unit:unit('nan'),rects:[rect(NaN,100)]},{unit:unit('near'),rects:[rect(600,610),rect(1200,1210)]}],g,1);expect(w.visible).toEqual([]);expect(w.neighborhood.map(n=>n.distance)).toEqual([1]);
});
