import { PrismaClient, Role } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required to seed the admin account`);
  }
  return value;
}

async function main() {
  console.log('Start seeding...');

  const email = requiredEnv('SEED_ADMIN_EMAIL');
  const password = requiredEnv('SEED_ADMIN_PASSWORD');
  const name = process.env.SEED_ADMIN_NAME || 'Super Admin';
  const adminPassword = await bcrypt.hash(password, 10);
  const admin = await prisma.user.upsert({
    where: { email },
    update: {
      name,
      password_hash: adminPassword,
      role: Role.ADMIN,
      status: 'ACTIVE',
    },
    create: {
      email,
      name,
      password_hash: adminPassword,
      role: Role.ADMIN,
      status: 'ACTIVE',
    },
  });
  console.log(`Created admin user with id: ${admin.id}`);

  // const defaultOffer = await prisma.offerRule.create({
  //   data: {
  //     title: 'Welcome 20% Off',
  //     discount_value: 20,
  //     cta_text: 'Claim Now',
  //     active: true,
  //     variant: 'A',
  //   }
  // });
  // console.log(`Created default offer rule: ${defaultOffer.id}`);

  console.log('Seeding finished.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
