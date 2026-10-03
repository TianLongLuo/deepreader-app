import {expect,it,vi} from 'vitest';
import {JSDOM} from 'jsdom';
import {installStudyDismiss} from '@/components/reader/study-dismiss-events';
it('closes on reading iframe background or scroll, not panel controls, and releases listeners',()=>{
 const doc=new JSDOM('<div id="root"><iframe></iframe><section data-study-panel><button>inside</button></section></div>').window.document,root=doc.querySelector('#root')!,frame=root.querySelector('iframe')!,close=vi.fn();let pinned=false;
 const off=installStudyDismiss(root,()=>pinned,close);
 frame.contentDocument!.body.dispatchEvent(new doc.defaultView!.Event('pointerdown',{bubbles:true}));expect(close).toHaveBeenCalledTimes(1);
 root.querySelector('button')!.dispatchEvent(new doc.defaultView!.Event('pointerdown',{bubbles:true}));expect(close).toHaveBeenCalledTimes(1);
 frame.contentDocument!.dispatchEvent(new doc.defaultView!.Event('scroll'));expect(close).toHaveBeenCalledTimes(2);
 pinned=true;frame.contentDocument!.body.dispatchEvent(new doc.defaultView!.Event('pointerdown',{bubbles:true}));expect(close).toHaveBeenCalledTimes(2);
 pinned=false;off();frame.contentDocument!.body.dispatchEvent(new doc.defaultView!.Event('pointerdown',{bubbles:true}));expect(close).toHaveBeenCalledTimes(2);
});
it('binds new chapter iframes and protects utility interactions and native selections',async()=>{
 const doc=new JSDOM('<div id="root"><section data-reader-utility><button>x</button></section></div>').window.document,root=doc.querySelector('#root')!,close=vi.fn();
 const off=installStudyDismiss(root,()=>false,close),frame=doc.createElement('iframe');root.append(frame);await new Promise(r=>setTimeout(r,0));
 frame.contentDocument!.body.dispatchEvent(new doc.defaultView!.Event('pointerdown',{bubbles:true}));expect(close).toHaveBeenCalledTimes(1);
 root.querySelector('button')!.dispatchEvent(new doc.defaultView!.Event('pointerdown',{bubbles:true}));expect(close).toHaveBeenCalledTimes(1);off();
});
