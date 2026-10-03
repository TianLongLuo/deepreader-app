import {afterEach,expect,it,vi} from 'vitest';
import {JSDOM} from 'jsdom';
import {Contents,EpubCFI} from 'epubjs';
import {createRequire} from 'node:module';
import {createTextProjection} from '@/components/reader/text-projection';
import {createCanonicalCfiScope} from '@/components/reader/scoped-cfi-adapter';
const Mapping=createRequire(import.meta.url)('epubjs/lib/mapping').default;
const base='/6/2[ch1]';
const range=(doc:Document,node:Node,start:number,end:number)=>{const r=doc.createRange();r.setStart(node,start);r.setEnd(node,end);return r;};
afterEach(()=>{vi.restoreAllMocks();vi.unstubAllGlobals();});
function fixture(){
 const doc=new JSDOM('<p>CAT after CAT.</p>').window.document;
 vi.stubGlobal('XPathResult',doc.defaultView!.XPathResult);vi.stubGlobal('Node',doc.defaultView!.Node);vi.stubGlobal('navigator',doc.defaultView!.navigator);
 const p=createTextProjection(doc.documentElement),live=doc.querySelector('p')!.firstChild as Text,original=p.canonicalNode(live)!;
 const flip=()=>p.apply({id:'first',originalRange:range(p.canonicalDocument,original,0,3),replacement:'small animal'});
 return {doc,p,live,original,flip};
}
it('resolves and reserializes old CFIs after a longer word without shifting later words',()=>{
 const f=fixture(),old=new EpubCFI(range(f.doc,f.live,4,9),base).toString(),scope=createCanonicalCfiScope(EpubCFI);
 const off=scope.register(f.p);
 try{
  f.flip();const resolved=new EpubCFI(old).toRange(f.doc);
  expect(resolved.toString()).toBe('after');expect(new EpubCFI(resolved,base).toString()).toBe(old);
  expect(scope.diagnostics().registeredFromRange).toBeGreaterThan(0);
  expect(scope.diagnostics().registeredToRange).toBeGreaterThan(0);
 }finally{off();scope.dispose();f.p.dispose();}
});
it('preserves origin of an old inner-word CFI but not after changing or freshly creating a range',()=>{
 const f=fixture(),old=new EpubCFI(range(f.doc,f.live,1,2),base).toString(),scope=createCanonicalCfiScope(EpubCFI);scope.register(f.p);
 try{
  f.flip();const resolved=new EpubCFI(old).toRange(f.doc);
  expect(resolved.toString()).toBe('small animal');
  expect(new EpubCFI(resolved,base).toString()).toBe(old);
  expect(new EpubCFI(scope.cloneOriginRange(resolved),base).toString()).toBe(old);
  const fresh=range(f.doc,f.live,1,2),canonical=new EpubCFI(fresh,base).toRange(f.p.canonicalDocument);
  expect(canonical.toString()).toBe('CAT');
  resolved.collapse(true);
  expect(new EpubCFI(resolved,base).toString()).not.toBe(old);
 }finally{scope.dispose();f.p.dispose();}
});
it('keeps independent scopes and restores prototype entrypoints only after the final disposal',()=>{
 const saved=EpubCFI.prototype.fromRange,a=createCanonicalCfiScope(EpubCFI),b=createCanonicalCfiScope(EpubCFI),f=fixture();
 const other=new JSDOM('<p>Untouched</p>').window.document;
 const old=new EpubCFI(range(other,other.querySelector('p')!.firstChild!,0,9),base).toString();
 try{a.register(f.p);f.flip();a.dispose();
  expect(EpubCFI.prototype.fromRange).not.toBe(saved);
  expect(new EpubCFI(range(other,other.querySelector('p')!.firstChild!,0,9),base).toString()).toBe(old);
 }finally{b.dispose();a.dispose();f.p.dispose();}
 expect(EpubCFI.prototype.fromRange).toBe(saved);
});
it('canonicalizes the real Contents selection and real Mapping endpoints',()=>{
 const f=fixture(),scope=createCanonicalCfiScope(EpubCFI);scope.register(f.p);f.flip();
 const proto=Contents.prototype as unknown as {listeners():void};vi.spyOn(proto,'listeners').mockImplementation(()=>{});
 const contents=new Contents(f.doc,f.doc.body,base,0) as unknown as {epubcfi:EpubCFI;destroy():void;
  triggerSelectedEvent(selection:{rangeCount:number;getRangeAt:(i:number)=>Range}):void;on(event:string,fn:(cfi:string)=>void):void};
 try{
  expect(Object.getPrototypeOf(contents.epubcfi).constructor).toBe(EpubCFI);
  let selected='';contents.on('selected',cfi=>{selected=cfi;});
  const live=range(f.doc,f.live,13,18);contents.triggerSelectedEvent({rangeCount:1,getRangeAt:()=>live});
  expect(new EpubCFI(selected).toRange(f.p.canonicalDocument).toString()).toBe('after');
  const pair=new Mapping({}).rangePairToCfiPair(base,{start:live.cloneRange(),end:live.cloneRange()});
  expect(new EpubCFI(pair.start).toRange(f.p.canonicalDocument).startOffset).toBe(4);
  expect(new EpubCFI(pair.end).toRange(f.p.canonicalDocument).startOffset).toBe(9);
 }finally{contents.destroy();scope.dispose();f.p.dispose();}
});
