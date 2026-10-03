import {expect,it} from 'vitest';
import {createAnchorHandle} from '@/components/reader/selection-anchor';
import {floatingPanelLayout} from '@/components/reader/floating-study-layout';
it('keeps the whole paragraph clear for consecutive word clicks, including iframe coordinates',()=>{
 const element={isConnected:true,getBoundingClientRect:()=>({left:80,right:640,top:140,bottom:440,width:560,height:300}),ownerDocument:{defaultView:{frameElement:{getBoundingClientRect:()=>({left:20,top:40})}},createRange:()=>{throw Error('word range should not set paragraph clearance');}}} as unknown as HTMLElement;
 const handle=createAnchorHandle(element,{} as Range,undefined,'paragraph');
 const anchor=handle.measure()!;
 expect(anchor).toEqual({left:100,right:660,top:180,bottom:480});
 const panel=floatingPanelLayout(1400,900,{width:360,height:480},'right',anchor);
 expect(panel.left).toBeGreaterThanOrEqual(anchor.right+12);
 handle.dispose();expect(handle.measure()).toBeNull();
});

import {JSDOM} from 'jsdom';
import {createTextProjection} from '@/components/reader/text-projection';
import {registerOriginalText} from '@/components/reader/original-text';
import {collectMeaningSources,sourceRange} from '@/components/reader/meaning-text-source';
it('remeasures the source span after each projection epoch instead of retaining display offsets',()=>{
 const win=new JSDOM('<p>CAT after.</p>').window,doc=win.document,el=doc.querySelector('p')!;
 Object.defineProperty(win.Range.prototype,'getBoundingClientRect',{value:function(this:Range){return {left:this.startOffset,right:this.endOffset,top:0,bottom:20,width:this.endOffset-this.startOffset,height:20};}});
 const p=createTextProjection(doc.documentElement),off=registerOriginalText(p);
 try{
  const s=collectMeaningSources(doc.body)[0],word=sourceRange(s,4,9),handle=createAnchorHandle(el,word);
  expect(handle.measure()?.left).toBe(4);
  p.apply({id:'cat',originalRange:sourceRange(s,0,3),replacement:'a small animal'});
  expect(handle.measure()?.left).toBe(15);
  p.restoreAll();expect(handle.measure()?.left).toBe(4);handle.dispose();
 }finally{off();p.dispose();}
});
