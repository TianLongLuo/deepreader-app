// @vitest-environment jsdom
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {createElement} from 'react';
import {cleanup,fireEvent,render,screen,waitFor} from '@testing-library/react';
import WordLookupContent from '@/components/reader/word-lookup-content';
const stable=vi.hoisted(()=>({answer:null,draft:'',busy:false,error:null,start:vi.fn(),stop:vi.fn(),reset:vi.fn()}));
vi.mock('@/hooks/use-reading-answer-stream',()=>({useReadingAnswerStream:()=>stable}));
beforeEach(()=>{localStorage.clear();vi.stubGlobal('fetch',vi.fn(async()=>Response.json({meanings:[]})));});
afterEach(()=>{cleanup();vi.restoreAllMocks();vi.unstubAllGlobals();});
const props={userId:'alice',documentId:'book-one',selection:{text:'occasion',contextText:'An occasion.',location:'loc'},entries:[],onSave:async()=>{}};
const details=()=>screen.getByText(/^词典释义 ·/).closest('details')!;
it('initially expands only the dictionary',async()=>{
 const view=render(createElement(WordLookupContent,props));
 await waitFor(()=>expect(details().open).toBe(true));
 expect([...view.container.querySelectorAll('details')].slice(1).every(d=>!d.open)).toBe(true);
});
it('remembers collapse across words, books and a fresh component mount, then remembers expansion',async()=>{
 let view=render(createElement(WordLookupContent,props));
 await waitFor(()=>expect(details().open).toBe(true));
 fireEvent.click(details().querySelector('summary')!);
 await waitFor(()=>expect(details().open).toBe(false));
 view.rerender(createElement(WordLookupContent,{...props,documentId:'book-two',selection:{...props.selection,text:'event'}}));
 expect(details().open).toBe(false);
 view.unmount();view=render(createElement(WordLookupContent,props));
 await waitFor(()=>expect(details().open).toBe(false));
 fireEvent.click(details().querySelector('summary')!);
 await waitFor(()=>expect(details().open).toBe(true));
 // Wait for native toggle delivery before destroying the component.
 await waitFor(()=>expect(localStorage.getItem('deepreader:dictionary-expanded:alice')).toBe('true'));
 view.unmount();render(createElement(WordLookupContent,props));
 await waitFor(()=>expect(details().open).toBe(true));
});
it('isolates account preferences even when switching users without unmounting the reader',async()=>{
 localStorage.setItem('deepreader:dictionary-expanded:alice','false');
 const view=render(createElement(WordLookupContent,props));
 await waitFor(()=>expect(details().open).toBe(false));
 view.rerender(createElement(WordLookupContent,{...props,userId:'bob'}));
 await waitFor(()=>expect(details().open).toBe(true));
 view.rerender(createElement(WordLookupContent,props));
 await waitFor(()=>expect(details().open).toBe(false));
 expect(localStorage.getItem('deepreader:dictionary-expanded:bob')).toBeNull();
});
it('keeps toggling usable when browser storage is blocked',async()=>{
 vi.spyOn(Storage.prototype,'getItem').mockImplementation(()=>{throw new Error('blocked');});
 vi.spyOn(Storage.prototype,'setItem').mockImplementation(()=>{throw new Error('blocked');});
 render(createElement(WordLookupContent,props));
 await waitFor(()=>expect(details().open).toBe(true));
 fireEvent.click(details().querySelector('summary')!);
 await waitFor(()=>expect(details().open).toBe(false));
});
