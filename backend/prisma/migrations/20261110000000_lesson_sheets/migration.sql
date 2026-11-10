ALTER TYPE "AttendanceStatus" ADD VALUE 'OTHER';

ALTER TABLE "attendance_records"
  ADD COLUMN "confirmed_at" TIMESTAMP(3),
  ALTER COLUMN "status" DROP DEFAULT;

UPDATE "attendance_records" SET "confirmed_at" = "recorded_at" WHERE "recorded_by_id" IS NOT NULL;

ALTER TABLE "student_enrollments"
  ADD COLUMN "teaching_continues_after_end" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "teaching_removed_at" TIMESTAMP(3),
  ADD COLUMN "teaching_removed_by_id" TEXT,
  ADD COLUMN "teaching_removal_reason" TEXT,
  ADD COLUMN "teaching_last_session_id" TEXT;

ALTER TABLE "student_enrollments"
  ADD CONSTRAINT "student_enrollments_teaching_removed_by_id_fkey" FOREIGN KEY ("teaching_removed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "student_enrollments_teaching_last_session_id_fkey" FOREIGN KEY ("teaching_last_session_id") REFERENCES "teaching_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "student_enrollments_teaching_last_session_id_idx" ON "student_enrollments"("teaching_last_session_id");

ALTER TABLE "academic_follow_up_entries"
  ADD COLUMN "enrollment_id" TEXT,
  ADD COLUMN "sheet_slot" "AcademicActivityType",
  ADD CONSTRAINT "academic_follow_up_entries_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "student_enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "academic_follow_up_entries_enrollment_id_idx" ON "academic_follow_up_entries"("enrollment_id");
CREATE UNIQUE INDEX "academic_follow_up_entries_session_id_student_id_sheet_slot_key" ON "academic_follow_up_entries"("session_id", "student_id", "sheet_slot");

CREATE TYPE "TeachingAwardSource" AS ENUM ('HOMEWORK', 'CLASSWORK');
CREATE TABLE "teaching_incentive_awards" (
  "id" TEXT PRIMARY KEY,
  "session_id" TEXT NOT NULL,
  "enrollment_id" TEXT NOT NULL,
  "recorded_by_id" TEXT,
  "source" "TeachingAwardSource" NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL CHECK ("amount" > 0),
  "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "teaching_incentive_awards_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "teaching_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "teaching_incentive_awards_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "student_enrollments"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "teaching_incentive_awards_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "teaching_incentive_awards_session_id_idx" ON "teaching_incentive_awards"("session_id");
CREATE INDEX "teaching_incentive_awards_enrollment_id_idx" ON "teaching_incentive_awards"("enrollment_id");
