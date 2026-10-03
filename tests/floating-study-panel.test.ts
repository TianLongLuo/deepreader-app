import { expect, it } from 'vitest';
import { floatingPanelLayout } from '@/components/reader/floating-study-layout';
const intersects=(a:any,b:any)=>a.left<b.right&&a.left+a.width>b.left&&a.top<b.bottom&&a.top+a.height>b.top;
it('floats on the opposite side without reserving a reading column',()=>{
 const anchor={left:1000,right:1100,top:240,bottom:280};
 const panel=floatingPanelLayout(1200,800,{width:620,height:650},'left',anchor);
 expect(panel.width).toBe(620);expect(panel.left+panel.width).toBe(anchor.left-12);expect(intersects(panel,anchor)).toBe(false);
});
it('uses space below a full-width paragraph rather than covering it',()=>{
 const anchor={left:20,right:1180,top:30,bottom:180};
 const panel=floatingPanelLayout(1200,800,{width:620,height:760},'left',anchor);
 expect(panel.top).toBeGreaterThanOrEqual(192);expect(intersects(panel,anchor)).toBe(false);expect(panel.top+panel.height).toBeLessThanOrEqual(788);
});
it('keeps a phone reading area unchanged and fits the floating panel above or below the word',()=>{
 const anchor={left:180,right:235,top:150,bottom:180};
 const panel=floatingPanelLayout(390,650,{width:620,height:760},'left',anchor);
 expect(panel.width).toBeLessThanOrEqual(366);expect(intersects(panel,anchor)).toBe(false);expect(panel.height).toBeGreaterThan(250);
});
it('clamps invalid or oversized saved sizes to the viewport',()=>{
 const p=floatingPanelLayout(900,650,{width:NaN,height:Infinity},'right');
 expect(Number.isFinite(p.width)&&Number.isFinite(p.height)).toBe(true);expect(p.left+p.width).toBeLessThanOrEqual(888);
});
it('keeps controls usable when a long paragraph fills the viewport',()=>{
 const panel=floatingPanelLayout(390,650,{width:620,height:760},'right',{left:24,right:366,top:35,bottom:610});
 expect(panel.width).toBeGreaterThanOrEqual(280);expect(panel.height).toBeGreaterThanOrEqual(180);expect(panel.top+panel.height).toBeLessThanOrEqual(638);
});
it('prefers a usable nonoverlapping rectangle to a larger unusable narrow one',()=>{
 const anchor={left:250,right:950,top:250,bottom:550};
 const panel=floatingPanelLayout(1200,800,{width:620,height:760},'left',anchor);
 expect(panel.crowded).not.toBe(true);expect(intersects(panel,anchor)).toBe(false);expect(panel.width).toBe(620);expect(panel.height).toBe(226);
});

it('aligns with the clicked word instead of the top window edge',()=>{
 const p=floatingPanelLayout(1400,900,{width:360,height:400},'right',{left:500,right:550,top:350,bottom:375});
 expect(p.left).toBe(562);expect(p.top).toBe(350);
});
it('uses a compact phone bottom card in vertical flow without covering the clicked line',()=>{
 const anchor={left:24,right:366,top:230,bottom:265};
 const p=floatingPanelLayout(390,650,{width:600,height:700},'right',anchor,{flow:'vertical',kind:'word'});
 expect(p.height).toBeLessThanOrEqual(260);expect(p.top+p.height).toBe(638);expect(intersects(p,anchor)).toBe(false);
});
it('keeps a full-width vertical reading line clear even when there is little paragraph whitespace',()=>{
 const anchor={left:80,right:1120,top:300,bottom:350};
 const p=floatingPanelLayout(1200,800,{width:440,height:600},'left',anchor,{flow:'vertical',kind:'word'});
 expect(intersects(p,anchor)).toBe(false);expect(p.height).toBeLessThanOrEqual(360);expect(p.top-anchor.bottom).toBeGreaterThanOrEqual(20);
});
