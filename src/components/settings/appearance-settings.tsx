'use client';
import {useUIPreferences} from '@/hooks/use-ui-preferences';
import {useReaderStore} from '@/hooks/use-reader-store';
import type {UITheme} from '@/lib/ui-preferences';
export default function AppearanceSettings(){
 const {theme,setTheme}=useUIPreferences();const reader=useReaderStore();
 return <div className="space-y-6">
  <section className="rounded-xl border border-border bg-card p-5"><h2 className="font-semibold">外观</h2><p className="mt-1 text-sm text-muted-foreground">日间与夜间切换同步阅读外观；暖纸偏好会保留。</p><div className="mt-4 flex flex-wrap gap-2">{[['system','跟随系统'],['light','浅色'],['dark','深色']].map(([v,label])=><button key={v} aria-pressed={theme===v} onClick={()=>setTheme(v as UITheme)} className={'native-action '+(theme===v?'ring-2 ring-primary':'')}>{label}</button>)}</div></section>
  <section className="rounded-xl border border-border bg-card p-5"><h2 className="mb-4 font-semibold">阅读偏好</h2><div className="grid gap-5 sm:grid-cols-3"><label className="text-sm">纸色<select className="native-field mt-2" value={reader.theme} onChange={e=>reader.setTheme(e.target.value as 'light'|'dark'|'sepia')}><option value="light">白纸</option><option value="sepia">暖纸</option><option value="dark">深色</option></select></label><label className="text-sm">字号 · {reader.fontSize}px<input className="mt-4 block w-full accent-primary" type="range" min="14" max="32" value={reader.fontSize} onChange={e=>reader.setTypography(+e.target.value,reader.lineHeight)}/></label><label className="text-sm">行距 · {reader.lineHeight}<input className="mt-4 block w-full accent-primary" type="range" min="1.3" max="2.4" step=".1" value={reader.lineHeight} onChange={e=>reader.setTypography(reader.fontSize,+e.target.value)}/></label></div></section>
 </div>;
}
