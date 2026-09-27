import bcrypt from 'bcryptjs';
if(process.stdin.isTTY){console.error('Pipe the password via stdin (do not put it in command arguments). Example: read -rs PASSWORD; printf %s "$PASSWORD" | node scripts/admin-password.mjs; unset PASSWORD');process.exit(1);}
let value='';for await(const chunk of process.stdin)value+=chunk;
value=value.replace(/\r?\n$/,'');
if(value.length<8||Buffer.byteLength(value)>72)throw Error('Password must be 8 characters or more, and at most 72 UTF-8 bytes');
console.log(await bcrypt.hash(value,12));
