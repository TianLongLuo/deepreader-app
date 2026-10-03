import {expect,it,vi} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
vi.mock('@/hooks/use-ui-preferences',()=>({useUIPreferences:()=>({toolbarCollapsed:false,setToolbarCollapsed:vi.fn()})}));
import ReaderToolbar from '@/components/reader/reader-toolbar';
const noop=()=>{};
const render=()=>renderToStaticMarkup(createElement(ReaderToolbar,{title:'Fixture',onPrevious:noop,onNext:noop,onBookmark:noop,onContents:noop,onFullscreen:noop,immersive:false}));
it('starts hidden even for existing expanded preferences and reserves no reading space',()=>{
 const html=render();expect(html).toContain('data-reader-toolbar="hidden"');expect(html).toContain('h-0');expect(html).toContain('inert=""');
});
it('provides a top-edge hover target and accessible touch/keyboard restore control',()=>{
 const html=render();expect(html).toContain('data-toolbar-hover-zone');expect(html).toContain('展开阅读工具栏');expect(html).toContain('aria-expanded="false"');
});
it('labels vertical navigation as screens rather than pages',()=>{
 const html=renderToStaticMarkup(createElement(ReaderToolbar,{title:'Fixture',onPrevious:noop,onNext:noop,onBookmark:noop,onContents:noop,onFullscreen:noop,immersive:false,navigationKind:'screen'}));
 expect(html).toContain('aria-label="上一屏"');expect(html).toContain('aria-label="下一屏"');expect(html).not.toContain('aria-label="翻页"');
});
