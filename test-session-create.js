const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function testSessionCreate() {
  try {
    const user = await prisma.user.findUnique({ where: { email: 'admin@qq.com' } });
    console.log('Found user:', user);
    
    const result = await prisma.session.create({
      data: {
        userId: user.id,
        token: 'test-token-' + Date.now(),
        expiresAt: new Date(Date.now() + 3600000)
      }
    });
    console.log('✅ SUCCESS: Session created', result);
    
    // Clean up
    // await prisma.session.delete({ where: { id: result.id } });
    // console.log('Cleaned up');
    
    process.exit(0);
  } catch (e) {
    console.error('❌ ERROR:', e);
    process.exit(1);
  }
}

testSessionCreate();
