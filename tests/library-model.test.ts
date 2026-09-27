import {expect,it} from 'vitest';
import {filterLibrary,libraryEmptyKind} from '../src/components/documents/library-model';
it('handles unicode and empty states',()=>{expect(libraryEmptyKind(0,0)).toBe('empty');expect(libraryEmptyKind(3,0)).toBe('filtered');expect(filterLibrary([{title:'Corazón'}],'CORAZÓN')).toHaveLength(1);});
