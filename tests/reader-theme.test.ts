import {afterEach,expect,it} from 'vitest';
import {readUIPreferences,migrateUIPreferences} from '@/lib/ui-preferences';
import {useUIPreferences} from '@/hooks/use-ui-preferences';
import {useReaderStore} from '@/hooks/use-reader-store';
const uiInitial=useUIPreferences.getState(),readerInitial=useReaderStore.getState();
afterEach(()=>{useUIPreferences.setState(uiInitial,true);useReaderStore.setState(readerInitial,true);});
it('starts a fresh reader and app in daylight regardless of system theme',()=>{
 expect(readUIPreferences(null).theme).toBe('light');
 expect(useReaderStore.getInitialState().theme).toBe('light');
});
it('keeps explicit dark and system choices and custom dimensions',()=>{
 expect(readUIPreferences({theme:'dark',panels:{word:{width:410,height:520}}})).toMatchObject({theme:'dark',panels:{word:{width:410,height:520}}});
 expect(readUIPreferences({theme:'system'}).theme).toBe('system');
});
it('preserves a legacy saved theme when UI preferences have not been set',()=>{
 expect(migrateUIPreferences(null,{state:{theme:'dark',explanationPanelWidth:620}})).toMatchObject({theme:'dark',panels:{word:{width:620}}});
});
it('records a user choice and synchronizes day/night reading without replacing sepia',()=>{
 useReaderStore.setState({theme:'light'});useUIPreferences.getState().setTheme('dark');
 expect(useUIPreferences.getState()).toMatchObject({theme:'dark',themeExplicit:true});
 expect(useReaderStore.getState().theme).toBe('dark');
 useReaderStore.setState({theme:'sepia'});useUIPreferences.getState().setTheme('light');
 expect(useReaderStore.getState().theme).toBe('sepia');
});
it('ignores corrupted themes and a corrupt preference envelope',()=>{
 for(const value of ['bogus','<script>',null,{},[]])expect(readUIPreferences({theme:value}).theme).toBe('light');
});
it('uses the same default and explicit system behavior before hydration',async()=>{
 const {runInNewContext}=await import('node:vm');
 const {THEME_BOOTSTRAP,isDarkUI,resolveReaderTheme}=await import('@/lib/reader-theme');
 for(const [raw,dark] of [[null,false],[{theme:'dark'},true],[{theme:'system'},true],[{theme:'light'},false]] as const){
  let applied=false;const style:{colorScheme?:string}={};
  runInNewContext(THEME_BOOTSTRAP,{localStorage:{getItem:(key:string)=>key==='deepreader-ui'?JSON.stringify({state:raw}):null},matchMedia:()=>({matches:true}),document:{documentElement:{style,classList:{toggle:(_class:string,value:boolean)=>{applied=value},remove:()=>{applied=false}}}}});
  expect(applied).toBe(dark);expect(style.colorScheme).toBe(dark?'dark':'light');
 }
 expect(isDarkUI('invalid',true)).toBe(false);
 expect(resolveReaderTheme({theme:'dark'})).toBe('dark');
 expect(resolveReaderTheme({theme:'sepia'})).toBe('sepia');
 expect(resolveReaderTheme({theme:'invalid'})).toBe('light');
});
it('renders daylight when storage access is denied before hydration',async()=>{
 const {runInNewContext}=await import('node:vm');const {THEME_BOOTSTRAP}=await import('@/lib/reader-theme');
 const style:{colorScheme?:string}={};let removed=false;
 runInNewContext(THEME_BOOTSTRAP,{localStorage:{getItem:()=>{throw new Error('Storage denied')}},document:{documentElement:{style,classList:{remove:()=>{removed=true}}}}});
 expect(style.colorScheme).toBe('light');expect(removed).toBe(true);
});
