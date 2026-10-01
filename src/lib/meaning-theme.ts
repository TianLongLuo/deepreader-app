import type {ReaderTheme} from './reader-theme';
/** Opaque, restrained fills make boundaries visible and contrast predictable in EPUB/PDF. */
export function meaningPalette(theme:ReaderTheme,lowSaturation=false):{backgrounds:string[];foreground:string;verb:string}{
 if(theme==='dark')return {backgrounds:lowSaturation?['#333936','#3b3933','#3a3437']:['#34463f','#4d452d','#493840'],foreground:'#f1f1ef',verb:'#ffe0a3'};
 if(theme==='sepia')return {backgrounds:lowSaturation?['#e5e4d9','#e9e1ce','#e6ddda']:['#e3e5d1','#eee0bd','#ead8d5'],foreground:'#433b2c',verb:'#683915'};
 return {backgrounds:lowSaturation?['#ebefec','#f1eee5','#eee9eb']:['#e5ece6','#f3ecd8','#f0e4e7'],foreground:'#242424',verb:'#683915'};
}
