import {expect,it} from 'vitest';
import {execFileSync} from 'node:child_process';
it('executes isolated copy migration, interrupted recovery and real FSRS without changing old records',()=>{
 const output=execFileSync(process.execPath,['node_modules/tsx/dist/cli.mjs','scripts/qa/vocabulary-migration.ts'],{encoding:'utf8',timeout:30000,stdio:['ignore','pipe','pipe']});
 expect(JSON.parse(output)).toMatchObject({legacyRecordsPreserved:true,duplicateSensesPreserved:true,manualPreserved:true,reviewPreserved:true,interruptedCopyRecovered:true,integrity:'ok'});
},35000);
