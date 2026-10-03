'use client';
import {useRef} from 'react';
import type {ReadingFlow} from './reading-flow';
import {epubReaderGutter} from './epub-reader-presentation';

type Press={pointerId:number;x:number;y:number;time:number;valid:boolean};
export function ReaderEdgeNavigation({flow,ready,onTurn,hasSelection}:{flow:ReadingFlow;ready:boolean;onTurn:(direction:-1|1)=>void;hasSelection:()=>boolean}){
 const press=useRef<Press|null>(null);
 if(flow!=='paginated')return null;
 return <>{([-1,1] as const).map(direction=><button key={direction} type="button"
  data-reader-page-edge={direction===-1?'previous':'next'}
  aria-label={direction===-1?'上一页（点击页边）':'下一页（点击页边）'} disabled={!ready}
  className="focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary"
  style={{position:'absolute',top:50,bottom:20,[direction===-1?'left':'right']:0,width:epubReaderGutter,zIndex:2,background:'transparent',border:0,padding:0,cursor:'pointer'}}
  onPointerDown={event=>{press.current={pointerId:event.pointerId,x:event.clientX,y:event.clientY,time:Date.now(),valid:event.button===0&&event.isPrimary!==false&&!hasSelection()};}}
  onPointerMove={event=>{const p=press.current;if(p&&p.pointerId===event.pointerId&&Math.hypot(event.clientX-p.x,event.clientY-p.y)>8)p.valid=false;}}
  onPointerUp={event=>{const p=press.current;if(p&&p.pointerId===event.pointerId&&(Date.now()-p.time>=450||Math.hypot(event.clientX-p.x,event.clientY-p.y)>8))p.valid=false;}}
  onPointerCancel={()=>{press.current=null;}}
  onClick={event=>{const p=press.current;press.current=null;if(!ready||event.defaultPrevented||event.detail>1||event.ctrlKey||event.altKey||event.metaKey||event.shiftKey)return;if(event.detail>0&&(!p?.valid||hasSelection()))return;onTurn(direction);}}
 />)}</>;
}
