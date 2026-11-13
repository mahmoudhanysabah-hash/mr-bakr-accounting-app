-- Logical deletion keeps every financial and teaching relation intact.
ALTER TABLE "accounting_students"
  ADD COLUMN "archived_at" TIMESTAMP(3),
  ADD COLUMN "archive_reason" TEXT;
ALTER TABLE "accounting_groups"
  ADD COLUMN "archived_at" TIMESTAMP(3),
  ADD COLUMN "archive_reason" TEXT;
CREATE INDEX "accounting_students_archived_at_idx" ON "accounting_students"("archived_at");
CREATE INDEX "accounting_groups_archived_at_idx" ON "accounting_groups"("archived_at");
