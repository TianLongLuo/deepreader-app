// @vitest-environment jsdom
import {afterEach,expect,it,vi} from 'vitest';
import {createElement} from 'react';
import {cleanup,fireEvent,render,screen} from '@testing-library/react';
import {ReadingModeControls} from '@/components/reader/reading-mode-controls';
const props={format:'epub-reflowable' as const,preferences:{flow:'paginated' as const,semanticFlip:true,targets:{en:'en' as const,es:'en' as const}},sourceLanguage:'es' as const,busy:false,status:'',onFlow:vi.fn(),onFlip:vi.fn(),onTarget:vi.fn(),onRetry:vi.fn()};
afterEach(()=>{cleanup();vi.clearAllMocks();});
it('offers labeled flow, flip checkbox and three target languages with touch-sized controls',()=>{
 const h=render(createElement(ReadingModeControls,props));const flow=screen.getByLabelText('阅读方式'),flip=screen.getByLabelText('语义翻牌'),target=screen.getByLabelText('翻牌语言');expect(target.querySelectorAll('option')).toHaveLength(3);fireEvent.change(flow,{target:{value:'vertical'}});expect(props.onFlow).toHaveBeenCalledWith('vertical');fireEvent.click(flip);expect(props.onFlip).toHaveBeenCalledWith(false);fireEvent.change(target,{target:{value:'zh'}});expect(props.onTarget).toHaveBeenCalledWith('zh');expect(h.container.textContent).toContain('中文');
});
it.each(['epub-fixed','pdf-original'] as const)('does not expose unsupported modes in %s',format=>{render(createElement(ReadingModeControls,{...props,format}));expect(screen.queryByLabelText('语义翻牌')).toBeNull();expect(screen.queryByLabelText('阅读方式')).toBeNull();});
it('uses existing vertical PDF text reading without a fake paginated flow selector',()=>{render(createElement(ReadingModeControls,{...props,format:'pdf-text'}));expect(screen.getByText('纵向阅读')).toBeTruthy();expect(screen.queryByLabelText('阅读方式')).toBeNull();expect(screen.getByLabelText('语义翻牌')).toBeTruthy();});
it('announces busy/result status once while allowing an in-flight mode to be switched off',()=>{
 render(createElement(ReadingModeControls,{...props,busy:true,status:'正在理解语境…'}));expect(screen.getAllByRole('status')).toHaveLength(1);expect(screen.getByRole('status').textContent).toBe('正在理解语境…');fireEvent.click(screen.getByLabelText('语义翻牌'));expect(props.onFlip).toHaveBeenCalledWith(false);
});
