import {expect,it} from 'vitest';
import fs from 'node:fs/promises';
import {execFileSync,spawnSync} from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
const file='scripts/deploy/deepreader-reader-release.sh';
it('isolates web-only releases and validates shell syntax',async()=>{
 const s=await fs.readFile(file,'utf8');expect(s).toContain('EXPECTED_OLD_SHA');expect(s).toContain('sqlite3');expect(s).toContain('sha256sum -c');expect(s).toContain('MemoryMax=1800M');
 expect(s).not.toMatch(/systemctl\s+(stop|start|restart|enable|disable)\s+deepreader-worker/);expect(s).not.toMatch(/prisma\s+(db|migrate)|migrate-learning|migrate-vocabulary|frequency\/setup/);expect(s).not.toContain('daemon-reload');expect(spawnSync('bash',['-n',file]).status).toBe(0);
});
const OLD='a'.repeat(40),NEW='b'.repeat(40);
async function exercise(scenario:string){
 const root=await fs.realpath(await fs.mkdtemp(path.join(os.tmpdir(),'reader-release-policy-'))),app=path.join(root,'app'),bin=path.join(root,'bin'),backups=path.join(root,'backups'),config=path.join(root,'config');
 try{
  await fs.mkdir(path.join(app,'.next'),{recursive:true});await fs.mkdir(path.join(app,'prisma'));await fs.mkdir(path.join(app,'node_modules'));await fs.mkdir(path.join(app,'storage/uploads'),{recursive:true});await fs.mkdir(bin);await fs.mkdir(config);
  await fs.writeFile(path.join(app,'.env.production'),'SYNTHETIC_ONLY=1');await fs.writeFile(path.join(app,'.next/BUILD_ID'),'OLD_BUILD');await fs.writeFile(path.join(app,'storage/uploads/book'),'ORIGINAL_SYNTHETIC_BOOK');await fs.writeFile(path.join(root,'head'),OLD);await fs.writeFile(path.join(root,'state'),'active');
  for(const c of ['web','worker','nginx'])await fs.writeFile(path.join(config,c),'ORIGINAL_CONFIG');
  execFileSync('python3',['-c',`import sqlite3; c=sqlite3.connect(${JSON.stringify(path.join(app,'prisma/dev.db'))}); c.execute('create table Evidence(v text)'); c.execute("insert into Evidence values ('old')"); c.commit();c.close()`]);
  const common='#!/bin/bash\necho "'+ '$0 $*' +' CASE=$CASE" >> "$ROOT/commands"\n';
  const commands:Record<string,string>={
   node:'if [[ "$1" = -p ]]; then echo 22; fi',npm:'exit 0',sleep:'exit 0',free:'echo synthetic',du:'echo "1 .next"',df:'echo "Filesystem 1024-blocks Used Available Capacity Mounted"; echo "fixture 9999999 1 9999998 1% /"',stat:'echo root',
   git:`shift 2; case "$1" in rev-parse) if [[ "$2" = HEAD ]]; then [[ "$CASE" = old ]] && echo cccccccccccccccccccccccccccccccccccccccc || cat "$ROOT/head"; else [[ "$CASE" = new ]] && echo cccccccccccccccccccccccccccccccccccccccc || echo "$NEW"; fi;; status) [[ "$CASE" != dirty ]] || echo ' M unexpected';; remote) echo https://github.com/TianLongLuo/deepreader-app.git;; merge-base) [[ "$CASE" != descendant ]];; diff) [[ "$CASE" != dependencies ]] || echo package-lock.json;; fetch) :;; merge) echo "$NEW" > "$ROOT/head";; reset) echo "$OLD" > "$ROOT/head";; *) exit 5;; esac`,
   systemctl:`if [[ "$1" = show ]]; then case "$4" in WorkingDirectory) [[ "$CASE" = unit ]] && echo /other-app || echo "$APP";; FragmentPath) [[ "$2" = deepreader.service ]] && echo "$CONFIG/web" || echo "$CONFIG/worker";; ExecStart) echo "$APP/node_modules/next/dist/bin/next";; User) echo root;; ActiveState) [[ "$2" = deepreader-worker.service ]] && echo active || cat "$ROOT/state";; MainPID) if [[ "$2" = deepreader-worker.service ]]; then echo 17; elif [[ "$(cat "$ROOT/state")" = active ]]; then echo 18; else echo 0; fi;; NRestarts) echo 0;; esac; elif [[ "$1" = is-active ]]; then [[ "$(cat "$ROOT/state")" = active ]]; elif [[ "$1" = stop ]]; then echo inactive > "$ROOT/state"; elif [[ "$1" = start ]]; then echo active > "$ROOT/state"; else exit 6; fi`,
   'systemd-run':`python3 -c 'import os,sqlite3;c=sqlite3.connect(os.environ["APP"]+"/prisma/dev.db");c.execute("insert into Evidence values (\\"concurrent write\\")");c.commit();c.close()'; [[ "$CASE" != build ]] || exit 23; mkdir -p "$APP/.next/server/app/api/semantic-flip" "$APP/.next/static/chunks"; echo NEW_BUILD > "$APP/.next/BUILD_ID"; touch "$APP/.next/server/app/api/semantic-flip/route.js"; echo 语义翻牌 > "$APP/.next/static/chunks/new.js"`,
   curl:`[[ "$(cat "$ROOT/state")" = active ]] || exit 7; if [[ "$*" = *http_code* ]]; then if [[ "$*" = *api/semantic-flip* || "$*" = *api/documents* ]]; then echo 401; else echo 200; fi; fi`,
   sha256sum:'if [[ "$1" = -c ]]; then [[ "$CASE" != checksum || ! -f "$APP/.next/server/app/api/semantic-flip/route.js" ]] || exit 24; else echo synthetic-hash; fi',
  };
  for(const [name,code] of Object.entries(commands))await fs.writeFile(path.join(bin,name),common+code+'\n',{mode:0o755});
  let source=await fs.readFile(file,'utf8');source=source.replace('APP=/opt/deepreader-app','APP='+app).replace('BACKUPS=/opt/deepreader-app-backups','BACKUPS='+backups).replace('[[ $EUID = 0 ]]','[[ 0 = 0 ]]').replace('export PATH=/root/.local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin','export PATH='+bin+':$PATH').replaceAll('/etc/systemd/system/deepreader-worker.service',path.join(config,'worker')).replaceAll('/etc/systemd/system/deepreader.service',path.join(config,'web')).replaceAll('/etc/nginx/sites-enabled/activecoach',path.join(config,'nginx'));
  source=source.replace('exec > >(tee -a "$B/release.log") 2>&1','exec > "$B/release.log" 2>&1');
  if(scenario==='path')source=source.replace('APP='+app,'APP='+app+'/../app');
  const script=path.join(root,'release.sh');await fs.writeFile(script,source);
  const result=spawnSync('bash',[script,NEW,OLD],{env:{...process.env,ROOT:root,APP:app,CONFIG:config,OLD,NEW,CASE:scenario},encoding:'utf8',timeout:10000});
  const log=await fs.readFile(path.join(root,'commands'),'utf8').catch(()=> '');
  let output=result.stdout+result.stderr;try{for(const dir of await fs.readdir(backups))output+=await fs.readFile(path.join(backups,dir,'release.log'),'utf8');}catch{/* rejected before backup */}
  const head=await fs.readFile(path.join(root,'head'),'utf8'),build=await fs.readFile(path.join(app,'.next/BUILD_ID'),'utf8'),state=await fs.readFile(path.join(root,'state'),'utf8');
  const db=execFileSync('python3',['-c',`import sqlite3,json;c=sqlite3.connect(${JSON.stringify(path.join(app,'prisma/dev.db'))});print(json.dumps(c.execute('select v from Evidence').fetchall()))`],{encoding:'utf8'});
  for(const c of ['web','worker','nginx'])expect(await fs.readFile(path.join(config,c),'utf8')).toBe('ORIGINAL_CONFIG');expect(await fs.readFile(path.join(app,'storage/uploads/book'),'utf8')).toBe('ORIGINAL_SYNTHETIC_BOOK');
  expect(log).not.toMatch(/systemctl (stop|start|restart|enable|disable) deepreader-worker/);expect(log).not.toMatch(/bin\/(npm ci|prisma)|daemon-reload/);
  return {status:result.status,output,log,head:head.trim(),build:build.trim(),state:state.trim(),db:JSON.parse(db)};
 }finally{await fs.rm(root,{recursive:true,force:true});}
}
it.each(['dirty','old','path','unit','new','descendant','dependencies'])('rejects %s before any process changes',async scenario=>{
 const r=await exercise(scenario);expect(r.status,r.output+'\n'+r.log).not.toBe(0);expect(r.log).not.toMatch(/systemctl (stop|start)/);expect(r.head).toBe(OLD);expect(r.build).toBe('OLD_BUILD');expect(r.state).toBe('active');
});
it('releases only the web app and verifies the new route and code',async()=>{
 const r=await exercise('success');expect(r.status,r.output).toBe(0);expect(r.output).toContain('__READER_MODES_RELEASE_SUCCESS__');expect(r.head).toBe(NEW);expect(r.build).toBe('NEW_BUILD');expect(r.state).toBe('active');expect(r.db).toEqual([['old'],['concurrent write']]);
});
it.each([['build',23],['checksum',24]])('rolls back %s without restoring the live database',async(scenario,exit)=>{
 const r=await exercise(String(scenario));expect(r.status,r.output).toBe(exit);expect(r.head).toBe(OLD);expect(r.build).toBe('OLD_BUILD');expect(r.state).toBe('active');expect(r.db).toEqual([['old'],['concurrent write']]);expect(r.output).toContain('ROLLBACK_SECONDARY_FAILURE=0');
});
