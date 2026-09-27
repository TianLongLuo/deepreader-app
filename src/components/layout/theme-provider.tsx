'use client';
import {useEffect,type ReactNode} from 'react';
import {useUIPreferences} from '@/hooks/use-ui-preferences';
export default function ThemeProvider({children}:{children:ReactNode}){
 const theme=useUIPreferences(s=>s.theme);
 useEffect(()=>{const media=matchMedia('(prefers-color-scheme: dark)');const apply=()=>{const dark=theme==='dark'||(theme==='system'&&media.matches);document.documentElement.classList.toggle('dark',dark);document.documentElement.style.colorScheme=dark?'dark':'light';};apply();media.addEventListener('change',apply);return()=>media.removeEventListener('change',apply);},[theme]);
 return children;
}
