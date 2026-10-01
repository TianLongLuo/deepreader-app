/** Explicit consistent backup copy only; never guesses DATABASE_URL or touches the live DB. */
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';import {execFileSync} from 'node:child_process';import {DatabaseSync} from 'node:sqlite';
const args=process.argv.slice(2),file=args[1];if(args.length!==2||args[0]!=='--database'||!path.isAbsolute(file)||path.basename(file)!=='COPY.db'||!fs.lstatSync(file).isFile()||fs.lstatSync(file).isSymbolicLink())throw new Error('Use an explicit existing COPY.db backup');
const open=()=>new DatabaseSync(file,{readOnly:true}),before=open(),original=before.prepare('SELECT * FROM reading_entries ORDER BY id').all();before.close();
let state;
for(let i=0;i<2;i++){
 execFileSync(process.execPath,['scripts/migrate-learning-schema.mjs','--database',file],{stdio:'pipe'});
 execFileSync(process.execPath,['--import','tsx','scripts/migrate-vocabulary.ts','--database',file],{stdio:'pipe'});
 const db=open();assert.deepEqual(db.prepare('SELECT * FROM reading_entries ORDER BY id').all(),original);
 const current=['vocabulary_encounters','review_cards','review_logs','enrichment_jobs'].map(table=>db.prepare(`SELECT * FROM ${table} ORDER BY id`).all());if(i)assert.deepEqual(current,state);state=current;
 assert.deepEqual(db.prepare('PRAGMA foreign_key_check').all(),[]);assert.equal(Object.values(db.prepare('PRAGMA quick_check').get())[0],'ok');db.close();
}
console.log(JSON.stringify({legacyUnchanged:true,idempotent:true,integrity:'ok'}));
