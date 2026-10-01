import {isAbsolute} from 'node:path';
import {existsSync,lstatSync} from 'node:fs';
import {PrismaClient} from '@prisma/client';
import {migrateSavedWords} from '../src/server/vocabulary/migration';
async function main(){
const args=process.argv.slice(2),file=args[1];
if(args.length!==2||args[0]!=='--database'||!file||!isAbsolute(file)||!existsSync(file)||!lstatSync(file).isFile()||lstatSync(file).isSymbolicLink())throw new Error('Use --database EXISTING_ABSOLUTE_DB_PATH');
const db=new PrismaClient({datasourceUrl:'file:'+file});
try{console.log(JSON.stringify(await migrateSavedWords(db)));}finally{await db.$disconnect();}

}
void main().catch(error=>{console.error(error instanceof Error?error.message:"Vocabulary migration failed");process.exitCode=1;});
