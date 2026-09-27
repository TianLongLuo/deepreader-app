export type UITheme='system'|'light'|'dark';
export type PanelKind='word'|'paragraph';
export type PanelSize={width:number;height:number};
export type UIPreferences={version:1;theme:UITheme;toolbarCollapsed:boolean;panels:Record<PanelKind,PanelSize>};
export function readUIPreferences(raw:unknown):UIPreferences{
 const value=raw&&typeof raw==='object'?raw as Record<string,unknown>:{};
 const panels=value.panels&&typeof value.panels==='object'?value.panels as Record<string,unknown>:{};
 const size=(kind:PanelKind,defaults:PanelSize)=>{const item=panels[kind] as Partial<PanelSize>|undefined;return {width:typeof item?.width==='number'&&Number.isFinite(item.width)?Math.max(280,Math.min(1600,item.width)):defaults.width,height:typeof item?.height==='number'&&Number.isFinite(item.height)?Math.max(220,Math.min(1400,item.height)):defaults.height};};
 return {version:1,toolbarCollapsed:value.toolbarCollapsed===true,theme:value.theme==='light'||value.theme==='dark'?value.theme:'system',panels:{word:size('word',{width:360,height:480}),paragraph:size('paragraph',{width:480,height:600})}};
}

export function migrateUIPreferences(current:unknown,legacy:unknown):UIPreferences{
 if(current&&typeof current==='object')return readUIPreferences(current);
 const state=(legacy as {state?:{explanationPanelWidth?:number;explanationPanelHeight?:number}}|null)?.state;
 const size={width:state?.explanationPanelWidth,height:state?.explanationPanelHeight};
 return readUIPreferences({panels:{word:size,paragraph:size}});
}
