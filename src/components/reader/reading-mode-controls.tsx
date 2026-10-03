'use client';
import type {ReadingPreferences} from './reading-preferences';
import type {ReadingFlow} from './reading-flow';
export function ReadingModeControls({format,preferences,sourceLanguage,busy,status,onFlow,onFlip,onTarget,onRetry}:{format:'epub-reflowable'|'epub-fixed'|'pdf-text'|'pdf-original';preferences:ReadingPreferences;sourceLanguage:'en'|'es';busy:boolean;status:string;onFlow:(flow:ReadingFlow)=>void;onFlip:(enabled:boolean)=>void;onTarget:(target:'en'|'zh'|'es')=>void;onRetry:()=>void}){
 if(format==='epub-fixed'||format==='pdf-original')return null;
 return <div className="flex flex-wrap items-center gap-2 text-xs">
  {format==='epub-reflowable'?<label className="inline-flex min-h-8 items-center gap-2 px-2">阅读方式<select aria-label="阅读方式" value={preferences.flow} onChange={e=>onFlow(e.target.value as ReadingFlow)} className="min-h-8 rounded-lg border border-border bg-card px-2"><option value="paginated">分页</option><option value="vertical">纵向</option></select></label>:<span className="px-2 text-muted-foreground">纵向阅读</span>}
  <label className="inline-flex min-h-8 cursor-pointer items-center gap-2 px-2"><input type="checkbox" aria-label="语义翻牌" checked={preferences.semanticFlip} onChange={e=>onFlip(e.target.checked)} className="h-4 w-4 accent-[var(--primary)]"/>语义翻牌</label>
  <label className="inline-flex min-h-8 items-center gap-2">翻牌语言<select aria-label="翻牌语言" value={preferences.targets[sourceLanguage]} onChange={e=>onTarget(e.target.value as 'en'|'zh'|'es')} className="min-h-8 rounded-lg border border-border bg-card px-2"><option value="en">英语</option><option value="zh">中文</option><option value="es">西语</option></select></label>
  <span role="status" aria-live="polite" className="text-muted-foreground">{status||(busy?'正在理解语境…':'')}</span>
  {status.includes('重试')&&<button type="button" onClick={onRetry} className="min-h-8 rounded-lg px-2 text-primary hover:bg-muted">重试翻牌</button>}
 </div>;
}
