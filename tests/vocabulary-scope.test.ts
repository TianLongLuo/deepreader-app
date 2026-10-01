import {afterEach,beforeEach,expect,it} from 'vitest';
import {createVocabularyDB} from './helpers/vocabulary-db';
import {createVocabularyService} from '@/server/vocabulary/service';
let db:Awaited<ReturnType<typeof createVocabularyDB>>;
beforeEach(async()=>{db=await createVocabularyDB();});afterEach(async()=>{await db?.close();});
it('rejects another user, another workspace, forged entry evidence and deleted documents',async()=>{
 const entry=await db.seedWord({text:'squint'}),service=createVocabularyService(db.prisma);
 for(const scope of [{...db.scope,userId:'other-user'},{...db.scope,workspaceId:'other-workspace'}])await expect(service.capture(scope,entry)).rejects.toMatchObject({status:404});
 await expect(service.capture(db.scope,{...entry,userId:'other-user'})).rejects.toMatchObject({status:404});
 await db.prisma.document.update({where:{id:entry.documentId},data:{status:'DELETED'}});
 await expect(service.capture(db.scope,entry)).rejects.toMatchObject({status:404});expect(await db.prisma.vocabularySense.count()).toBe(0);
});
it('rolls entry creation back when capture fails in the same transaction',async()=>{
 const service=createVocabularyService(db.prisma);
 await expect(db.prisma.$transaction(async tx=>{const entry=await tx.readingEntry.create({data:{userId:db.scope.userId,documentId:db.document.id,kind:'word',text:'word'}});await service.capture({...db.scope,workspaceId:'foreign'},entry,tx);})).rejects.toMatchObject({status:404});
 expect(await db.prisma.readingEntry.count()).toBe(0);
});
