const{PrismaClient}=require('@prisma/client');
const bcrypt=require('bcryptjs');
const prisma=new PrismaClient();
async function seed(){
  const h1=await bcrypt.hash('Admin@123',12);
  await prisma.user.upsert({where:{email:'admin@filevault.com'},update:{},create:{email:'admin@filevault.com',password:h1,firstName:'System',lastName:'Admin',role:'ADMIN',isEmailVerified:true}});
  const h2=await bcrypt.hash('User@123',12);
  await prisma.user.upsert({where:{email:'user@filevault.com'},update:{},create:{email:'user@filevault.com',password:h2,firstName:'Demo',lastName:'User',role:'USER',isEmailVerified:true}});
  console.log('Done!');
  await prisma['']();
}
seed();
