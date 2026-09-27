import {expect,it} from 'vitest';
import {settingsSections} from '../src/components/settings/settings-visibility';
it('keeps appearance available without granting AI permissions',()=>{expect(settingsSections(false)).toEqual(['appearance','reading']);expect(settingsSections(true)).toEqual(['appearance','reading','ai']);});
