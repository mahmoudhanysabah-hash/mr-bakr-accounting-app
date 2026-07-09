# Accounting Module Handoff Status

Last updated: 2026-06-29

## Product Goal

Build a private web application for the company's accountant and management. It will
replace the monthly Excel workflow with linked student, group, billing, payment,
receipt, discount, refund, expense, target, alert, and reporting records.

The application is intended to be deployed later behind a private URL with named user
accounts and role-based permissions.

## Confirmed Business Rules

- Partial payments are allowed.
- One payment can be allocated across multiple months.
- Old unpaid charges remain outstanding after a month ends.
- Session price defaults to EGP 300 but can vary by group, month, or student.
- Groups may have 8, 12, or another number of monthly sessions.
- Group types include regular, review, exams, and other.
- Refunds are recorded separately and do not erase original payments.
- Staff can grant discounts; reports must identify student, group, amount, reason, and actor.
- Every group has both revenue and student-count targets.
- Expenses belong to the company.
- Initial payment methods: InstaPay, Vodafone Cash, bank transfer, plus optional cash/other.
- The system shows internal overdue alerts so staff can contact guardians.
- Receipt images/PDFs must be attached to the payment and visible in the student profile.
- Closed months preserve their financial history.

## Completed Work

### Planning

Created:

- `13_Accounting_Module/implementation_plan.md`

This document contains the complete workflows, delivery phases, acceptance rules, and
implementation order.

### Database foundation

Updated:

- `03_Backend/prisma/schema.prisma`

Added roles:

- `ACCOUNTANT`
- `FINANCE_MANAGER`

Added accounting models:

- `ManagedStudent`
- `AccountingGroup`
- `StudentEnrollment`
- `BillingPeriod`
- `MonthlyGroupPlan`
- `MonthlyCharge`
- `AccountingPayment`
- `PaymentAllocation`
- `PaymentReceipt`
- `StudentDiscount`
- `StudentRefund`
- `CompanyExpense`
- `CollectionAlert`

Created and applied migration:

- `03_Backend/prisma/migrations/20260629203840_accounting_foundation/migration.sql`

The migration was reviewed before application. It is additive and did not drop old LMS
tables. It was successfully applied to the PostgreSQL/Neon database configured in
`03_Backend/.env`.

Prisma validation and client generation succeeded.

### Backend API foundation

Created:

- `03_Backend/src/accounting/accounting.module.ts`
- `03_Backend/src/accounting/accounting.controller.ts`
- `03_Backend/src/accounting/accounting.service.ts`
- `03_Backend/src/accounting/dto/accounting.dto.ts`

Updated:

- `03_Backend/src/app.module.ts`

Implemented endpoints:

- `POST /accounting/students`
- `GET /accounting/students`
- `GET /accounting/students/:id`
- `PATCH /accounting/students/:id`
- `POST /accounting/groups`
- `GET /accounting/groups`
- `PATCH /accounting/groups/:id`
- `POST /accounting/enrollments`
- `POST /accounting/enrollments/transfer`
- `POST /accounting/enrollments/:id/end`
- `POST /accounting/periods/open`
- `GET /accounting/periods/:id`
- `POST /accounting/periods/:id/close`
- `POST /accounting/payments`

Implemented behavior:

- Search students by name, code, student phone, or guardian phone.
- Retrieve a full student history with groups, charges, payments, receipts, discounts,
  refunds, and alerts.
- Enroll students with optional custom session price/session count.
- Transfer students without deleting old enrollment history.
- End an enrollment with effective date and reason.
- Open a month and generate group plans and student charges from active enrollments.
- Close an open month.
- Record partial payments.
- Allocate one payment to several monthly charges.
- Store unallocated payment value as student credit.
- Update charge status to partially paid or paid.
- Write audit-log entries for sensitive operations.

All accounting endpoints currently require one of these roles:

- `ADMIN`
- `ACCOUNTANT`
- `FINANCE_MANAGER`

The NestJS backend production build passed.

### Frontend foundation

Updated:

- `04_Frontend/src/app/admin/layout.tsx`

Created:

- `04_Frontend/src/app/admin/accounting/students/page.tsx`
- `04_Frontend/src/app/admin/accounting/groups/page.tsx`

Implemented UI:

- Arabic accounting navigation in the admin sidebar.
- Student list and search.
- Add-student form with student and guardian contact details.
- Group list.
- Add-group form with type, session price, session count, student target, and revenue target.
- Direct API integration through the existing Axios client.

The Next.js production build passed. The generated routes include:

- `/admin/accounting/students`
- `/admin/accounting/groups`

## Verification Completed

- `npx prisma format`: passed.
- `npx prisma validate`: passed.
- `npx prisma generate`: passed.
- `npx prisma migrate deploy`: accounting migration applied successfully.
- Backend `npm run build`: passed.
- Frontend `npm run build`: passed.

## Important Known Gaps

The following are not implemented yet:

1. Accountant user creation/role-management UI.
2. Student detail page and enrollment/transfer UI.
3. Billing-period list and open-month UI.
4. Monthly charge editing before close.
5. Payment entry/allocation UI.
6. Receipt image/PDF upload and secure file storage.
7. Discount API and UI.
8. Session-based refund API and UI.
9. Company expense API and UI.
10. Reopen-month control.
11. Overdue alert generation and WhatsApp-ready message UI.
12. Accounting dashboard and reports.
13. Excel staged import and duplicate resolution.
14. Automated backend tests for accounting transactions.
15. Production deployment and custom/private URL.

The admin sidebar already links to `/admin/accounting/periods` and
`/admin/accounting/receipts`, but those pages have not been created yet.

## Recommended Next Task

Build the operational monthly workflow in this order:

1. Create `/admin/accounting/periods`.
2. Add an API to list billing periods.
3. Add the open-month dialog and show generated charges/group totals.
4. Add the student detail page with current balance and history.
5. Build payment entry with allocation across old and current monthly charges.
6. Add multipart receipt upload using protected object storage.

After that, implement discounts, refunds, expenses, alerts, and reporting.

## Local Run Commands

Backend:

```powershell
cd "C:\Users\Mahmoud Hany\Downloads\Compressed\antigravity_lms_package\antigravity_lms_package\03_Backend"
npm.cmd run start:dev
```

Frontend:

```powershell
cd "C:\Users\Mahmoud Hany\Downloads\Compressed\antigravity_lms_package\antigravity_lms_package\04_Frontend"
npm.cmd run dev
```

Default local URLs:

- Frontend: `http://localhost:3000`
- Backend: `http://localhost:3001`

## Instruction for the Next Chat

Read this file and `13_Accounting_Module/implementation_plan.md`, then continue from
the "Recommended Next Task" section. Do not recreate the schema or migration, because
the migration has already been applied successfully.
