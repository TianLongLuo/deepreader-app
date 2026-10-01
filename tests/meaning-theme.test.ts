import {expect,it} from 'vitest';
import {meaningPalette} from '@/lib/meaning-theme';
import {useReaderStore} from '@/hooks/use-reader-store';
const rgb=(hex:string)=>hex.replace('#','').match(/../g)!.map(v=>parseInt(v,16));
const blend=(color:string,background:string)=>{
 if(color.startsWith('#'))return rgb(color);
 const [r,g,b,a]=color.match(/[\d.]+/g)!.map(Number),base=rgb(background);
 return [r,g,b].map((v,i)=>v*a+base[i]*(1-a));
};
const luminance=(channels:number[])=>channels.map(v=>v/255).map(v=>v<=.04045?v/12.92:Math.pow((v+.055)/1.055,2.4)).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0);
const contrast=(foreground:string,background:number[])=>{const a=luminance(rgb(foreground)),b=luminance(background);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);};
it.each([['light','#fcfcfa'],['dark','#171717'],['sepia','#f5efdf']] as const)('keeps body and finite verbs readable on every %s group background', (theme,base)=>{
 for(const low of [false,true]){
  const palette=meaningPalette(theme,low);expect(palette.backgrounds).toHaveLength(3);
  for(const color of palette.backgrounds){const background=blend(color,base);expect(contrast(palette.foreground,background)).toBeGreaterThanOrEqual(4.5);expect(contrast(palette.verb,background)).toBeGreaterThanOrEqual(4.5);}
 }
});
it('offers distinct low-saturation colors and preserves its preference across normal reader updates',()=>{
 expect(meaningPalette('dark',true).backgrounds).not.toEqual(meaningPalette('dark').backgrounds);
 expect(useReaderStore.getState().meaningGroupLowSaturation).toBe(false);
 useReaderStore.getState().setMeaningGroupLowSaturation(true);useReaderStore.getState().setTypography(19,1.8);
 expect(useReaderStore.getState().meaningGroupLowSaturation).toBe(true);useReaderStore.getState().setMeaningGroupLowSaturation(false);
});
