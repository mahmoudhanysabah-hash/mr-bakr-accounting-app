-- CreateEnum
CREATE TYPE "ManagedStudentStatus" AS ENUM ('ACTIVE', 'PAUSED', 'WITHDRAWN', 'COMPLETED');

-- CreateEnum
CREATE TYPE "AccountingGroupType" AS ENUM ('REGULAR', 'REVIEW', 'EXAMS', 'OTHER');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('ACTIVE', 'PAUSED', 'ENDED');

-- CreateEnum
CREATE TYPE "BillingPeriodStatus" AS ENUM ('DRAFT', 'OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "ChargeStatus" AS ENUM ('DRAFT', 'DUE', 'PARTIALLY_PAID', 'PAID', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AccountingPaymentMethod" AS ENUM ('INSTAPAY', 'VODAFONE_CASH', 'BANK_TRANSFER', 'CASH', 'OTHER');

-- CreateEnum
CREATE TYPE "AccountingPaymentStatus" AS ENUM ('PENDING_REVIEW', 'APPROVED', 'REJECTED', 'REVERSED');

-- CreateEnum
CREATE TYPE "AdjustmentStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'REVERSED');

-- CreateEnum
CREATE TYPE "AlertStatus" AS ENUM ('OPEN', 'DISMISSED', 'CONTACTED', 'RESOLVED');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "Role" ADD VALUE 'ACCOUNTANT';
ALTER TYPE "Role" ADD VALUE 'FINANCE_MANAGER';

-- CreateTable
CREATE TABLE "accounting_students" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "user_id" TEXT,
    "full_name" TEXT NOT NULL,
    "student_phone" TEXT,
    "guardian_name" TEXT,
    "guardian_phone" TEXT,
    "status" "ManagedStudentStatus" NOT NULL DEFAULT 'ACTIVE',
    "joined_at" TIMESTAMP(3) NOT NULL,
    "paused_at" TIMESTAMP(3),
    "withdrawn_at" TIMESTAMP(3),
    "exit_reason" TEXT,
    "notes" TEXT,
    "credit_balance" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounting_students_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounting_groups" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "AccountingGroupType" NOT NULL DEFAULT 'REGULAR',
    "teacher_name" TEXT,
    "level" TEXT,
    "default_session_price" DECIMAL(12,2) NOT NULL DEFAULT 300,
    "default_sessions_per_month" INTEGER NOT NULL,
    "default_student_target" INTEGER,
    "default_revenue_target" DECIMAL(12,2),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounting_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_enrollments" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "starts_at" TIMESTAMP(3) NOT NULL,
    "ends_at" TIMESTAMP(3),
    "exit_reason" TEXT,
    "custom_session_price" DECIMAL(12,2),
    "custom_sessions_per_month" INTEGER,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_enrollments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "billing_periods" (
    "id" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "status" "BillingPeriodStatus" NOT NULL DEFAULT 'DRAFT',
    "opened_at" TIMESTAMP(3),
    "opened_by_id" TEXT,
    "closed_at" TIMESTAMP(3),
    "closed_by_id" TEXT,
    "reopened_at" TIMESTAMP(3),
    "reopened_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "billing_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monthly_group_plans" (
    "id" TEXT NOT NULL,
    "period_id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "sessions_count" INTEGER NOT NULL,
    "session_price" DECIMAL(12,2) NOT NULL,
    "student_target" INTEGER,
    "revenue_target" DECIMAL(12,2),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "monthly_group_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "monthly_charges" (
    "id" TEXT NOT NULL,
    "period_id" TEXT NOT NULL,
    "monthly_plan_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "enrollment_id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "sessions_count" INTEGER NOT NULL,
    "session_price" DECIMAL(12,2) NOT NULL,
    "gross_amount" DECIMAL(12,2) NOT NULL,
    "discount_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "adjustment_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "net_amount" DECIMAL(12,2) NOT NULL,
    "due_date" TIMESTAMP(3),
    "status" "ChargeStatus" NOT NULL DEFAULT 'DUE',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "monthly_charges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounting_payments" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" "AccountingPaymentMethod" NOT NULL,
    "status" "AccountingPaymentStatus" NOT NULL DEFAULT 'PENDING_REVIEW',
    "paid_at" TIMESTAMP(3) NOT NULL,
    "external_reference" TEXT,
    "notes" TEXT,
    "recorded_by_id" TEXT,
    "reviewed_by_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "rejection_reason" TEXT,
    "reversed_at" TIMESTAMP(3),
    "reversal_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounting_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_allocations" (
    "id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "charge_id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_receipts" (
    "id" TEXT NOT NULL,
    "payment_id" TEXT NOT NULL,
    "original_name" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "checksum" TEXT,
    "uploaded_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_discounts" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "period_id" TEXT NOT NULL,
    "charge_id" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" "AdjustmentStatus" NOT NULL DEFAULT 'APPROVED',
    "created_by_id" TEXT,
    "approved_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "student_discounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "student_refunds" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "group_id" TEXT,
    "period_id" TEXT,
    "charge_id" TEXT,
    "payment_id" TEXT,
    "sessions_count" INTEGER,
    "session_unit_price" DECIMAL(12,2),
    "amount" DECIMAL(12,2) NOT NULL,
    "reason" TEXT NOT NULL,
    "method" "AccountingPaymentMethod" NOT NULL,
    "external_reference" TEXT,
    "receipt_storage_key" TEXT,
    "status" "AdjustmentStatus" NOT NULL DEFAULT 'APPROVED',
    "created_by_id" TEXT,
    "approved_by_id" TEXT,
    "refunded_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "student_refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_expenses" (
    "id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "method" "AccountingPaymentMethod" NOT NULL,
    "spent_at" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "external_reference" TEXT,
    "receipt_storage_key" TEXT,
    "recorded_by_id" TEXT,
    "status" "AdjustmentStatus" NOT NULL DEFAULT 'APPROVED',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_expenses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collection_alerts" (
    "id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "period_id" TEXT NOT NULL,
    "status" "AlertStatus" NOT NULL DEFAULT 'OPEN',
    "message_template" TEXT,
    "last_contacted_at" TIMESTAMP(3),
    "contacted_by_id" TEXT,
    "resolved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "collection_alerts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "accounting_students_code_key" ON "accounting_students"("code");

-- CreateIndex
CREATE UNIQUE INDEX "accounting_students_user_id_key" ON "accounting_students"("user_id");

-- CreateIndex
CREATE INDEX "accounting_students_full_name_idx" ON "accounting_students"("full_name");

-- CreateIndex
CREATE INDEX "accounting_students_student_phone_idx" ON "accounting_students"("student_phone");

-- CreateIndex
CREATE INDEX "accounting_students_guardian_phone_idx" ON "accounting_students"("guardian_phone");

-- CreateIndex
CREATE INDEX "accounting_students_status_idx" ON "accounting_students"("status");

-- CreateIndex
CREATE UNIQUE INDEX "accounting_groups_code_key" ON "accounting_groups"("code");

-- CreateIndex
CREATE INDEX "accounting_groups_name_idx" ON "accounting_groups"("name");

-- CreateIndex
CREATE INDEX "accounting_groups_type_active_idx" ON "accounting_groups"("type", "active");

-- CreateIndex
CREATE INDEX "student_enrollments_student_id_status_idx" ON "student_enrollments"("student_id", "status");

-- CreateIndex
CREATE INDEX "student_enrollments_group_id_status_idx" ON "student_enrollments"("group_id", "status");

-- CreateIndex
CREATE INDEX "student_enrollments_starts_at_ends_at_idx" ON "student_enrollments"("starts_at", "ends_at");

-- CreateIndex
CREATE INDEX "billing_periods_status_idx" ON "billing_periods"("status");

-- CreateIndex
CREATE UNIQUE INDEX "billing_periods_year_month_key" ON "billing_periods"("year", "month");

-- CreateIndex
CREATE INDEX "monthly_group_plans_group_id_idx" ON "monthly_group_plans"("group_id");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_group_plans_period_id_group_id_key" ON "monthly_group_plans"("period_id", "group_id");

-- CreateIndex
CREATE INDEX "monthly_charges_student_id_period_id_idx" ON "monthly_charges"("student_id", "period_id");

-- CreateIndex
CREATE INDEX "monthly_charges_group_id_period_id_idx" ON "monthly_charges"("group_id", "period_id");

-- CreateIndex
CREATE INDEX "monthly_charges_status_due_date_idx" ON "monthly_charges"("status", "due_date");

-- CreateIndex
CREATE UNIQUE INDEX "monthly_charges_period_id_enrollment_id_key" ON "monthly_charges"("period_id", "enrollment_id");

-- CreateIndex
CREATE INDEX "accounting_payments_student_id_paid_at_idx" ON "accounting_payments"("student_id", "paid_at");

-- CreateIndex
CREATE INDEX "accounting_payments_status_paid_at_idx" ON "accounting_payments"("status", "paid_at");

-- CreateIndex
CREATE INDEX "accounting_payments_external_reference_idx" ON "accounting_payments"("external_reference");

-- CreateIndex
CREATE INDEX "payment_allocations_charge_id_idx" ON "payment_allocations"("charge_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_allocations_payment_id_charge_id_key" ON "payment_allocations"("payment_id", "charge_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_receipts_storage_key_key" ON "payment_receipts"("storage_key");

-- CreateIndex
CREATE INDEX "payment_receipts_payment_id_idx" ON "payment_receipts"("payment_id");

-- CreateIndex
CREATE INDEX "student_discounts_student_id_period_id_idx" ON "student_discounts"("student_id", "period_id");

-- CreateIndex
CREATE INDEX "student_discounts_group_id_period_id_idx" ON "student_discounts"("group_id", "period_id");

-- CreateIndex
CREATE INDEX "student_refunds_student_id_refunded_at_idx" ON "student_refunds"("student_id", "refunded_at");

-- CreateIndex
CREATE INDEX "student_refunds_period_id_idx" ON "student_refunds"("period_id");

-- CreateIndex
CREATE INDEX "company_expenses_spent_at_idx" ON "company_expenses"("spent_at");

-- CreateIndex
CREATE INDEX "company_expenses_category_idx" ON "company_expenses"("category");

-- CreateIndex
CREATE INDEX "collection_alerts_status_idx" ON "collection_alerts"("status");

-- CreateIndex
CREATE UNIQUE INDEX "collection_alerts_student_id_period_id_key" ON "collection_alerts"("student_id", "period_id");

-- AddForeignKey
ALTER TABLE "accounting_students" ADD CONSTRAINT "accounting_students_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "accounting_students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_enrollments" ADD CONSTRAINT "student_enrollments_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "accounting_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_group_plans" ADD CONSTRAINT "monthly_group_plans_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "billing_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_group_plans" ADD CONSTRAINT "monthly_group_plans_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "accounting_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_charges" ADD CONSTRAINT "monthly_charges_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "billing_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_charges" ADD CONSTRAINT "monthly_charges_monthly_plan_id_fkey" FOREIGN KEY ("monthly_plan_id") REFERENCES "monthly_group_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_charges" ADD CONSTRAINT "monthly_charges_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "accounting_students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_charges" ADD CONSTRAINT "monthly_charges_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "student_enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "monthly_charges" ADD CONSTRAINT "monthly_charges_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "accounting_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounting_payments" ADD CONSTRAINT "accounting_payments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "accounting_students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "accounting_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_allocations" ADD CONSTRAINT "payment_allocations_charge_id_fkey" FOREIGN KEY ("charge_id") REFERENCES "monthly_charges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_receipts" ADD CONSTRAINT "payment_receipts_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "accounting_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_discounts" ADD CONSTRAINT "student_discounts_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "accounting_students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_discounts" ADD CONSTRAINT "student_discounts_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "accounting_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_discounts" ADD CONSTRAINT "student_discounts_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "billing_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_discounts" ADD CONSTRAINT "student_discounts_charge_id_fkey" FOREIGN KEY ("charge_id") REFERENCES "monthly_charges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_refunds" ADD CONSTRAINT "student_refunds_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "accounting_students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_refunds" ADD CONSTRAINT "student_refunds_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "accounting_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_refunds" ADD CONSTRAINT "student_refunds_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "billing_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_refunds" ADD CONSTRAINT "student_refunds_charge_id_fkey" FOREIGN KEY ("charge_id") REFERENCES "monthly_charges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "student_refunds" ADD CONSTRAINT "student_refunds_payment_id_fkey" FOREIGN KEY ("payment_id") REFERENCES "accounting_payments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_alerts" ADD CONSTRAINT "collection_alerts_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "accounting_students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_alerts" ADD CONSTRAINT "collection_alerts_period_id_fkey" FOREIGN KEY ("period_id") REFERENCES "billing_periods"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
