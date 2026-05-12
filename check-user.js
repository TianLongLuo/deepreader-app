const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function checkUser() {
  const users = await prisma.user.findMany({
    select: { id: true, email: true, name: true }
  });
  console.log('All users in database:');
  console.log(users);
  process.exit(0);
}

checkUser();
