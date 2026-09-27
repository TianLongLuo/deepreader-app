import {expect,it} from 'vitest';
import {execFileSync} from 'node:child_process';
it('imports only actual Chinese definitions and excludes audio',()=>{const result=execFileSync('python3',['-c',`import runpy,json
m=runpy.run_path('scripts/dictionaries/import-chinese.py')
r=m['extract_record']({'word':'niño','lang_code':'es','pos':'noun','sounds':[{'ipa':'/niɲo/','audio':'unlicensed.ogg'}],'senses':[{'glosses':['小孩','child']}]})
assert r[1]=='niño' and r[2][3]==['小孩']
assert m['extract_record']({'word':'foo','lang_code':'es','senses':[{'glosses':['English only']}]}) is None
assert m['extract_record']({'word':'foo','lang_code':'fr','senses':[{'glosses':['中文']}]}) is None
print(json.dumps(r,ensure_ascii=False))`],{encoding:'utf8'});expect(result).not.toContain('unlicensed');expect(result).toContain('小孩');});
it('discards embedded foreign-language sections in Spanish glosses',()=>{
 execFileSync('python3',['-c',`import runpy
extract=runpy.run_path('scripts/dictionaries/import-chinese.py')['extract_record']
r=extract({'word':'retal','lang_code':'es','senses':[{'glosses':['零头，小块 ==葡萄牙語== 直肠的']}]})
assert r[2][3]==['零头，小块'],r
assert extract({'word':'foo','lang_code':'es','senses':[{'glosses':['==葡萄牙語== 直肠的']}]}) is None
`]);
});
