import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it} from 'vitest';
import MeaningGroupControl from '@/components/reader/meaning-group-control';
import {useReaderStore} from '@/hooks/use-reader-store';
it('defaults off and preserves the reader preference through ordinary state updates',()=>{expect(useReaderStore.getState().meaningGroupReading).toBe(false);useReaderStore.getState().setMeaningGroupReading(true);useReaderStore.getState().setTypography(20,1.9);expect(useReaderStore.getState().meaningGroupReading).toBe(true);useReaderStore.getState().setMeaningGroupReading(false);});
it('offers a native labeled checkbox and explicit retry without a modal',()=>{const html=renderToStaticMarkup(createElement(MeaningGroupControl,{enabled:true,onChange:()=>{},onRetry:()=>{},status:{pending:0,ready:0,failed:1,blocked:false,deferred:0,retryAt:null,prefetchPending:0,prefetchReady:0,pauseReason:null},unsupported:false,skipped:0}));expect(html).toContain('type="checkbox"');expect(html).toContain('意群阅读');expect(html).toContain('重试');});

it('labels rate-limited units as waiting instead of complete',()=>{const html=renderToStaticMarkup(createElement(MeaningGroupControl,{enabled:true,onChange:()=>{},onRetry:()=>{},status:{pending:35,ready:0,failed:0,blocked:true,deferred:35,retryAt:Date.now()+5000,prefetchPending:0,prefetchReady:0,pauseReason:'rate'},unsupported:false,skipped:0}));expect(html).toContain('35 段待处理');expect(html).toContain('自动继续');expect(html).not.toContain('已标记');});
