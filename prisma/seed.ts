import { PrismaClient, PackageName, FileType, Role } from '@prisma/client';import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Create default subscription packages
  const packages = [
    {
      name: PackageName.FREE,
      displayName: 'Free',
      description: 'Get started with basic storage capabilities',
      maxFolders: 5,
      maxNestingLevel: 2,
      allowedFileTypes: [FileType.IMAGE, FileType.PDF],
      maxFileSizeMB: 5,
      totalFileLimit: 20,
      filesPerFolder: 5,
    },
    {
      name: PackageName.SILVER,
      displayName: 'Silver',
      description: 'Perfect for personal use with expanded storage',
      maxFolders: 20,
      maxNestingLevel: 3,
      allowedFileTypes: [FileType.IMAGE, FileType.PDF, FileType.AUDIO],
      maxFileSizeMB: 25,
      totalFileLimit: 100,
      filesPerFolder: 20,
    },
    {
      name: PackageName.GOLD,
      displayName: 'Gold',
      description: 'Great for professionals needing more power',
      maxFolders: 50,
      maxNestingLevel: 5,
      allowedFileTypes: [FileType.IMAGE, FileType.PDF, FileType.AUDIO, FileType.VIDEO],
      maxFileSizeMB: 100,
      totalFileLimit: 500,
      filesPerFolder: 50,
    },
    {
      name: PackageName.DIAMOND,
      displayName: 'Diamond',
      description: 'Unlimited power for enterprise and power users',
      maxFolders: 200,
      maxNestingLevel: 10,
      allowedFileTypes: [FileType.IMAGE, FileType.PDF, FileType.AUDIO, FileType.VIDEO],
      maxFileSizeMB: 500,
      totalFileLimit: 5000,
      filesPerFolder: 200,
    },
  ];

  for (const pkg of packages) {
    await prisma.subscriptionPackage.upsert({
      where: { name: pkg.name },
      update: pkg,
      create: pkg,
    });
  }
  console.log('✅ Subscription packages created');

  // Create admin user
  const adminPassword = await bcrypt.hash('Admin@123', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@filevault.com' },
    update: {},
    create: {
      email: 'admin@filevault.com',
      password: adminPassword,
      firstName: 'System',
      lastName: 'Admin',
      role: Role.ADMIN,
      isEmailVerified: true,
    },
  });
  console.log('✅ Admin user created:', admin.email);

  // Create a demo user
  const userPassword = await bcrypt.hash('User@123', 12);
  const user = await prisma.user.upsert({
    where: { email: 'user@filevault.com' },
    update: {},
    create: {
      email: 'user@filevault.com',
      password: userPassword,
      firstName: 'Demo',
      lastName: 'User',
      role: Role.USER,
      isEmailVerified: true,
    },
  });
  console.log('✅ Demo user created:', user.email);

  // Assign Free package to demo user
  const freePackage = await prisma.subscriptionPackage.findUnique({
    where: { name: PackageName.FREE },
  });

  if (freePackage) {
    await prisma.userSubscription.upsert({
      where: {
        id: (await prisma.userSubscription.findFirst({
          where: { userId: user.id, isActive: true },
        }))?.id || 'new',
      },
      update: {},
      create: {
        userId: user.id,
        packageId: freePackage.id,
        isActive: true,
      },
    });
    console.log('✅ Free package assigned to demo user');

    // Create a root folder for demo user
    const rootFolder = await prisma.folder.upsert({
      where: { id: 'demo-root-folder' },
      update: {},
      create: {
        id: 'demo-root-folder',
        name: 'My Documents',
        userId: user.id,
        nestingLevel: 0,
      },
    });
    console.log('✅ Root folder created for demo user');
  }

  console.log('\n🎉 Database seeded successfully!');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📧 Admin credentials:');
  console.log('   Email: admin@filevault.com');
  console.log('   Password: Admin@123');
  console.log('📧 Demo user credentials:');
  console.log('   Email: user@filevault.com');
  console.log('   Password: User@123');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });