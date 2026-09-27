import {expect,it,vi} from 'vitest';
const mocks=vi.hoisted(()=>({session:vi.fn()}));
vi.mock('@/lib/prisma',()=>({prisma:{session:{findUnique:mocks.session}}}));
vi.mock('next/headers',()=>({cookies:async()=>({get:()=>({value:'fixture'})})}));
vi.mock('@/lib/logger',()=>({createChildLogger:()=>({info:vi.fn(),error:vi.fn()})}));
import {requireAdmin} from '@/lib/auth';
it('does not grant admin privileges based on a legacy email alone',async()=>{
 mocks.session.mockResolvedValue({expiresAt:new Date(Date.now()+60000),user:{id:'u',email:'admin@qq.com',role:'USER',workspaceMembers:[]}});
 await expect(requireAdmin()).rejects.toThrow('Admin access required');
});
it('accepts an explicitly assigned ADMIN role',async()=>{
 mocks.session.mockResolvedValue({expiresAt:new Date(Date.now()+60000),user:{id:'a',email:'owner@example.test',role:'ADMIN',workspaceMembers:[]}});
 await expect(requireAdmin()).resolves.toMatchObject({role:'ADMIN'});
});
