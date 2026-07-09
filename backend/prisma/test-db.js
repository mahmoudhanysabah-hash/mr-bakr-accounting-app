const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Testing database content...');
  const periods = await prisma.billingPeriod.findMany();
  console.log(`Billing Periods count: ${periods.length}`);
  periods.forEach(p => console.log(`- ${p.month}/${p.year} (Status: ${p.status}, ID: ${p.id})`));

  const groups = await prisma.accountingGroup.findMany();
  console.log(`Groups count: ${groups.length}`);

  const students = await prisma.managedStudent.findMany();
  console.log(`Students count: ${students.length}`);

  const charges = await prisma.monthlyCharge.findMany();
  console.log(`Charges count: ${charges.length}`);

  const payments = await prisma.accountingPayment.findMany();
  console.log(`Payments count: ${payments.length}`);

  const allocations = await prisma.paymentAllocation.findMany();
  console.log(`Allocations count: ${allocations.length}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
