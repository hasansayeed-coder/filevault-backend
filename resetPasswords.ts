import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const adminHash = await bcrypt.hash('Admin@123', 12);
  const userHash = await bcrypt.hash('User@123', 12);

  await prisma.user.update({
    where: { email: 'admin@filevault.com' },
    data: { password: adminHash, isEmailVerified: true },
  });
  console.log('✅ Admin password reset');

  await prisma.user.update({
    where: { email: 'user@filevault.com' },
    data: { password: userHash, isEmailVerified: true },
  });
  console.log('✅ User password reset');

  console.log('\n admin@filevault.com / Admin@123');
  console.log(' user@filevault.com  / User@123');
  await prisma.$disconnect();
}

main().catch(console.error);