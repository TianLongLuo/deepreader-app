import {expect,it} from 'vitest';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {FormattedText} from '../src/components/ui/formatted-text';
it('formats emphasis and lists without executing HTML',()=>{
 const html=renderToStaticMarkup(createElement(FormattedText,{text:'**meaning**\n1. first\n2. second\n<img src=x onerror=alert(1)>'}));
 expect(html).toContain('<strong>meaning</strong>');expect(html).toContain('<ol');expect(html).not.toContain('<img');
});
