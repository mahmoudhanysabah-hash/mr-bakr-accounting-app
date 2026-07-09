# Accounting and Student Operations Module

## Objective

Replace monthly money spreadsheets with one auditable source of truth for students,
groups, monthly charges, payments, receipts, discounts, refunds, expenses, targets,
and management reporting.

The system must preserve historical months. A change to a student's current group or
price must not rewrite a closed month.

## Confirmed Business Rules

1. Partial payments are allowed and leave an outstanding balance.
2. One payment can cover multiple months. Payment allocations identify exactly how
   much was applied to each monthly charge.
3. The default session price is EGP 300, but group and student prices remain editable.
4. Regular, review, and exam groups can use different prices and session counts.
5. A group can have 8, 12, or another configured number of sessions per month.
6. Refunds are separate transactions and never erase the original payment.
7. Staff can grant discounts. Every discount records the student, group, month,
   amount, reason, actor, and time.
8. Every group has both a revenue target and a student-count target.
9. Expenses belong to the company, not to an individual group.
10. Supported payment methods initially are InstaPay, Vodafone Cash, and bank transfer.
11. The system creates internal overdue alerts. Staff decide when to send a prepared
    guardian message.
12. Receipt images or PDFs are attached to the student payment and remain available
    from the student's profile.

## Core Workflows

### Open a month

1. Create an OPEN billing period.
2. Copy active group settings into immutable monthly group plans.
3. Generate one monthly charge for every active enrollment.
4. Carry old unpaid balances through reports; do not duplicate old charges.
5. Review exceptions, then start recording payments.

### Change a student during an open month

- A new enrollment can create a full or manually adjusted charge.
- A transfer closes the old enrollment and creates a new one.
- A pause or withdrawal records an effective date and reason.
- Price, session-count, discount, and refund changes affect totals immediately.

### Close a month

- Closed periods reject normal edits.
- Corrections use explicit adjustment, discount, refund, or reversal records.
- Reopening requires an authorized role and an audit-log entry.

### Record a payment

1. Select the student and payment method.
2. Enter amount, date, external reference, and receipt image/PDF.
3. Allocate the payment to one or more monthly charges.
4. Leave any unused amount as student credit.
5. Update paid, due, and overdue figures transactionally.

## Delivery Plan

### Phase 1 - Accounting foundation

- Prisma models and migration.
- Accountant and finance-manager roles.
- Students, guardians, groups, enrollments, and search APIs.
- Billing periods and monthly group plans.

Exit criteria: a student can be created, placed in a group, transferred, paused, and
retrieved with complete history.

### Phase 2 - Monthly billing

- Open-month workflow.
- Monthly charge generation.
- Partial payments and multi-month allocations.
- Balance and overdue calculation.
- Month close/reopen controls.

Exit criteria: monthly totals reconcile from underlying student transactions.

### Phase 3 - Receipts and adjustments

- Receipt image/PDF upload and protected viewing.
- Discounts with reasons and actor reports.
- Session-based refunds using quantity and unit price.
- Company expenses and evidence attachments.

Exit criteria: original financial records are never overwritten and all corrections
are auditable.

### Phase 4 - Accountant UI

- Operational dashboard.
- Student search and complete student profile.
- Group roster and monthly editing screens.
- Payment allocation and receipt-review screens.
- Overdue-alert queue and prepared guardian messages.

### Phase 5 - Reports and migration

- Revenue, collection, balance, refund, discount, and expense reports.
- Group student/revenue target reporting.
- Month/year comparisons and projections.
- Staged Excel import with duplicate and validation review.

## Acceptance Rules

- No payment, discount, refund, or expense is hard-deleted.
- Payment totals equal the sum of allocations plus unallocated credit.
- Closed periods cannot be edited through standard endpoints.
- Group totals are calculated from student-level records.
- Each receipt belongs to a payment and is visible from the related student.
- Every sensitive action writes an audit log containing actor and before/after data.
- Historical group membership and monthly pricing remain queryable.

## Current Implementation Order

1. Add the accounting schema and migration.
2. Add student/group/enrollment backend modules.
3. Add billing-period and charge generation service.
4. Add payment allocation, receipt, discount, refund, and expense services.
5. Build accountant-facing screens.
6. Import and reconcile the existing 2025/2026 spreadsheets.
