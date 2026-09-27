import {expect,it} from 'vitest';
import {isAnchorOffscreen} from '../src/components/reader/floating-study-policy';
import {additionalMeanings} from '../src/components/reader/lookup-session';
it('detects horizontally off-page EPUB anchors',()=>{expect(isAnchorOffscreen({left:900,right:920,top:40,bottom:60},800,600)).toBe(true);});
it('keeps the first definition of later meanings',()=>{expect(additionalMeanings([{definitions:[{definition:'a'}]},{definitions:[{definition:'b'}]},{definitions:[{definition:'c'}]}])).toEqual([{definitions:[{definition:'c'}]}]);});
