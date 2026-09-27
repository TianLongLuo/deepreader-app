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
