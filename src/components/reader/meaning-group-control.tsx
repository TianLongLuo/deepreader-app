'use client';
import type {MeaningGroupStatus} from './meaning-group-queue';
export default function MeaningGroupControl({enabled,onChange,status,unsupported,skipped,onRetry}:{enabled:boolean;onChange:(value:boolean)=>void;status:MeaningGroupStatus;unsupported:boolean;skipped:number;onRetry:()=>void}){
 const message=unsupported?'当前浏览器暂不支持范围标色，原文保持不变':status.blocked?'意群分析暂停，请检查 AI 权限、设置或稍后重试':status.failed?'部分段落未完成标色，原文保持不变':status.pending?'正在划分意群…':skipped?'长段落保留原文':status.ready?'已标记当前段落':'';
 return <div className="flex flex-wrap items-center gap-2 text-xs">
  <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm" title="仅分析当前阅读内容；首次分析使用已配置模型的额度。">
   <input type="checkbox" aria-label="意群阅读" checked={enabled} onChange={e=>onChange(e.target.checked)} className="h-4 w-4 accent-[var(--primary)]"/>意群阅读
  </label>
  {enabled&&<span role="status" aria-live="polite" className="text-muted-foreground">{message}</span>}
  {enabled&&(status.failed>0||status.blocked)&&<button type="button" className="rounded-md px-2 py-1 text-primary hover:bg-muted" onClick={onRetry}>重试意群</button>}
 </div>;
}
