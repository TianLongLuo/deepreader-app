import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
it('fixes release scope, keeps original rc, and never auto-restores old learning data',()=>{
 const file='scripts/deploy/deepreader-release.sh',source=readFileSync(file,'utf8');expect(()=>execFileSync('/bin/bash',['-n',file])).not.toThrow();
 expect(source).toContain('APP=/opt/deepreader-app');expect(source).toContain('local rc="$1"');expect(source).toContain("trap 'rc=$?;");expect(source).toContain('MemoryMax=1800M');expect(source).toContain('git merge --ff-only');
 expect(source).not.toMatch(/git reset --hard|systemctl stop nginx|apt(-get)? install|pip install --break-system-packages/);expect(source).not.toMatch(/cp.*COPY\.db.*prisma\/dev\.db|tar.*-x.*runtime/);
 const worker=readFileSync('scripts/deploy/deepreader-worker.service','utf8');expect(worker).toContain('WorkingDirectory=/opt/deepreader-app');expect(worker).toContain('MemoryMax=256M');expect(worker).toContain('CPUQuota=20%');
});

it('arms rollback before stopping either own service',()=>{
 const source=readFileSync('scripts/deploy/deepreader-release.sh','utf8');
 const firstWorkerStop=source.indexOf('if systemctl is-active --quiet deepreader-worker.service; then');
 expect(source.lastIndexOf('STOPPED=1',firstWorkerStop)).toBeGreaterThan(source.indexOf('trap \'rc=$?;'));
});
