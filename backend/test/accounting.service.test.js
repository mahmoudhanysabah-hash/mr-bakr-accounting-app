const test = require('node:test');
const assert = require('node:assert/strict');
const {
  AccountingPaymentStatus,
  ChargeStatus,
  Prisma,
} = require('@prisma/client');
const { AccountingService } = require('../dist/src/accounting/accounting.service');

function makeService({ payment, charge, receipt }) {
  const calls = [];

  const tx = {
    monthlyCharge: {
      findUnique: async () => charge,
      update: async (args) => {
        calls.push({ name: 'monthlyCharge.update', args });
        return args.data;
      },
    },
    managedStudent: {
      update: async (args) => {
        calls.push({ name: 'managedStudent.update', args });
        return args.data;
      },
    },
    accountingPayment: {
      update: async (args) => {
        calls.push({ name: 'accountingPayment.update', args });
        return { ...payment, ...args.data };
      },
      delete: async () => {
        throw new Error('accountingPayment.delete must not be called');
      },
    },
    paymentAllocation: {
      deleteMany: async () => {
        throw new Error('paymentAllocation.deleteMany must not be called');
      },
    },
    paymentReceipt: {
      deleteMany: async () => {
        throw new Error('paymentReceipt.deleteMany must not be called');
      },
    },
  };

  const prisma = {
    accountingPayment: {
      findUnique: async () => payment,
    },
    paymentReceipt: {
      findUnique: async () => receipt,
      delete: async () => {
        throw new Error('paymentReceipt.delete must not be called');
      },
    },
    $transaction: async (callback) => callback(tx),
  };

  const audit = {
    log: async (entry) => {
      calls.push({ name: 'audit.log', args: entry });
    },
  };

  return { service: new AccountingService(prisma, audit), calls };
}

test('reversing a payment preserves records and recalculates related charge state', async () => {
  const reversedAllocation = {
    id: 'allocation-reversed',
    charge_id: 'charge-1',
    amount: new Prisma.Decimal(60),
  };
  const payment = {
    id: 'payment-1',
    student_id: 'student-1',
    amount: new Prisma.Decimal(100),
    status: AccountingPaymentStatus.APPROVED,
    allocations: [reversedAllocation],
    receipts: [{ id: 'receipt-1' }],
  };
  const charge = {
    id: 'charge-1',
    net_amount: new Prisma.Decimal(100),
    allocations: [
      { ...reversedAllocation, payment },
      {
        id: 'allocation-other',
        charge_id: 'charge-1',
        amount: new Prisma.Decimal(25),
        payment: { id: 'payment-2', status: AccountingPaymentStatus.APPROVED },
      },
    ],
  };

  const { service, calls } = makeService({ payment, charge });

  const result = await service.deletePayment('payment-1', 'user-1', 'duplicate payment');

  assert.equal(result.success, true);

  const paymentUpdate = calls.find((call) => call.name === 'accountingPayment.update');
  assert.equal(paymentUpdate.args.data.status, AccountingPaymentStatus.REVERSED);
  assert.equal(paymentUpdate.args.data.reversal_reason, 'duplicate payment');
  assert.ok(paymentUpdate.args.data.reversed_at instanceof Date);

  const chargeUpdate = calls.find((call) => call.name === 'monthlyCharge.update');
  assert.equal(chargeUpdate.args.data.status, ChargeStatus.PARTIALLY_PAID);

  const creditUpdate = calls.find((call) => call.name === 'managedStudent.update');
  assert.equal(Number(creditUpdate.args.data.credit_balance.decrement), 40);

  const auditCall = calls.find((call) => call.name === 'audit.log');
  assert.equal(auditCall.args.action, 'ACCOUNTING_PAYMENT_REVERSED');
  assert.equal(auditCall.args.payload.receiptCount, 1);
});

test('receipt deletion is blocked because receipts are immutable financial evidence', async () => {
  const { service, calls } = makeService({
    receipt: { id: 'receipt-1', storage_key: 'receipt-key' },
  });

  await assert.rejects(
    () => service.deleteReceipt('receipt-key', 'user-1'),
    /Receipts are immutable/,
  );

  const auditCall = calls.find((call) => call.name === 'audit.log');
  assert.equal(auditCall.args.action, 'ACCOUNTING_RECEIPT_DELETE_BLOCKED');
});
