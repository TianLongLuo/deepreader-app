export type ReaderTheme = 'light' | 'dark' | 'sepia';
export function resolveReaderTheme(raw: unknown): ReaderTheme {
  const theme = raw && typeof raw === 'object' ? (raw as {theme?:unknown}).theme : null;
  return theme === 'dark' || theme === 'sepia' ? theme : 'light';
}
/** Shared by the pre-hydration script and the mounted provider. */
export function isDarkUI(theme: unknown, systemDark: boolean): boolean {
  return theme === 'dark' || (theme === 'system' && systemDark);
}
export const THEME_BOOTSTRAP = `try{var p=JSON.parse(localStorage.getItem('deepreader-ui')||'{}').state||{};var t=p.theme;if(!['light','dark','system'].includes(t)){var r=JSON.parse(localStorage.getItem('reader-preferences')||'{}').state||{};t=r.theme==='dark'?'dark':'light'}var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light'}catch{document.documentElement.classList.remove('dark');document.documentElement.style.colorScheme='light'}`;
