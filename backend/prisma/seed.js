const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

function requiredEnv(name) {
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
      role: 'ADMIN',
      status: 'ACTIVE',
    },
    create: {
      email,
      name,
      password_hash: adminPassword,
      role: 'ADMIN',
      status: 'ACTIVE',
    },
  });
  console.log(`Created/Verified admin user with id: ${admin.id}`);
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
