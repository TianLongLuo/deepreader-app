/** Additive, checksum-protected learning migration. Explicit local DB path required. */
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
const args=process.argv.slice(2),options={};
for(let i=0;i<args.length;i+=2){if(!['--database','--migration','--version'].includes(args[i])||!args[i+1])throw new Error('Use --database ABSOLUTE_DB_PATH');options[args[i]]=args[i+1];}
const file=options['--database'];
if(!file||!path.isAbsolute(file)||!fs.existsSync(file)||!fs.lstatSync(file).isFile()||fs.lstatSync(file).isSymbolicLink())throw new Error('An explicit existing absolute database file is required');
const migrations=options['--migration']?[options['--migration']]:fs.readdirSync(path.resolve('prisma/learning-migrations')).filter(f=>f.endsWith('.sql')).sort().map(f=>path.resolve('prisma/learning-migrations',f));
const db=new DatabaseSync(file);db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=10000;');
try{
 for(const migration of migrations){
  const version=options['--version']||path.basename(migration,'.sql'),sql=fs.readFileSync(migration,'utf8'),checksum=createHash('sha256').update(sql).digest('hex');
  if(!/^[a-zA-Z0-9_-]{1,120}$/.test(version))throw new Error('Invalid migration version');
  db.exec('BEGIN IMMEDIATE');
  try{
   db.exec('CREATE TABLE IF NOT EXISTS learning_schema_versions (version TEXT PRIMARY KEY, checksum TEXT NOT NULL, appliedAt TEXT NOT NULL)');
   const prior=db.prepare('SELECT checksum FROM learning_schema_versions WHERE version=?').get(version);
   if(prior){if(prior.checksum!==checksum)throw new Error('Migration checksum changed');console.log(version+': already applied');}
   else{db.exec(sql);db.prepare('INSERT INTO learning_schema_versions VALUES(?,?,?)').run(version,checksum,new Date().toISOString());console.log(version+': applied');}
   if(db.prepare('PRAGMA foreign_key_check').all().length)throw new Error('Foreign key check failed');
   if(db.prepare('PRAGMA quick_check').all().some(row=>Object.values(row)[0]!=='ok'))throw new Error('Database integrity check failed');
   db.exec('COMMIT');
  }catch(error){db.exec('ROLLBACK');throw error;}
 }
}finally{db.close();}
