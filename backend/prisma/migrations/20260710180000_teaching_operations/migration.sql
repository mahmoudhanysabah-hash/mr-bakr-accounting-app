-- CreateEnum
CREATE TYPE "AssistantResponsibility" AS ENUM ('ATTENDANCE', 'GUARDIAN_CONTACT', 'ACADEMIC_FOLLOW_UP', 'FULL');

-- CreateEnum
CREATE TYPE "AssistantAssignmentStatus" AS ENUM ('ACTIVE', 'INACTIVE');

-- CreateEnum
CREATE TYPE "TeachingSessionStatus" AS ENUM ('PLANNED', 'OPEN', 'COMPLETED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "AttendanceStatus" AS ENUM ('PRESENT', 'ABSENT', 'LATE', 'LEFT_EARLY', 'EXCUSED');

-- CreateEnum
CREATE TYPE "GuardianContactStatus" AS ENUM ('PENDING', 'CONTACTED', 'NO_ANSWER', 'EXCUSED', 'NEEDS_FOLLOW_UP', 'WRONG_NUMBER');

-- CreateEnum
CREATE TYPE "AcademicActivityType" AS ENUM ('HOMEWORK', 'CLASSWORK', 'QUIZ', 'EXAM', 'OTHER');

-- CreateEnum
CREATE TYPE "AcademicImprovementStatus" AS ENUM ('IMPROVED', 'NOT_IMPROVED', 'NEEDS_MORE_WORK', 'NOT_ASSESSED');

-- CreateTable
CREATE TABLE "assistant_group_assignments" (
    "id" TEXT NOT NULL,
    "assistant_id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "responsibility" "AssistantResponsibility" NOT NULL DEFAULT 'FULL',
    "status" "AssistantAssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "assigned_by_id" TEXT,
    "starts_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ends_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assistant_group_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "assistant_student_assignments" (
    "id" TEXT NOT NULL,
    "assistant_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "responsibility" "AssistantResponsibility" NOT NULL DEFAULT 'FULL',
    "status" "AssistantAssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "assigned_by_id" TEXT,
    "starts_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ends_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "assistant_student_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "teaching_sessions" (
    "id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "title" TEXT,
    "session_date" TIMESTAMP(3) NOT NULL,
    "starts_at" TIMESTAMP(3),
    "ends_at" TIMESTAMP(3),
    "status" "TeachingSessionStatus" NOT NULL DEFAULT 'PLANNED',
    "created_by_id" TEXT,
    "attendance_assistant_id" TEXT,
    "guardian_contact_assistant_id" TEXT,
    "academic_assistant_id" TEXT,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "teaching_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attendance_records" (
    "id" TEXT NOT NULL,
    "session_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "enrollment_id" TEXT,
    "status" "AttendanceStatus" NOT NULL DEFAULT 'ABSENT',
    "recorded_by_id" TEXT,
    "recorded_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "minutes_late" INTEGER,
    "left_early_minutes" INTEGER,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "attendance_records_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "guardian_contact_logs" (
    "id" TEXT NOT NULL,
    "attendance_id" TEXT,
    "session_id" TEXT NOT NULL,
    "student_id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "guardian_phone" TEXT,
    "status" "GuardianContactStatus" NOT NULL DEFAULT 'PENDING',
    "response" TEXT,
    "contacted_by_id" TEXT,
    "contacted_at" TIMESTAMP(3),
    "follow_up_at" TIMESTAMP(3),
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "guardian_contact_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_follow_up_entries" (
    "id" TEXT NOT NULL,
    "session_id" TEXT,
    "student_id" TEXT NOT NULL,
    "group_id" TEXT NOT NULL,
    "assistant_id" TEXT,
    "entry_date" TIMESTAMP(3) NOT NULL,
    "activity_type" "AcademicActivityType" NOT NULL,
    "score" DECIMAL(12,2),
    "max_score" DECIMAL(12,2),
    "question_type" TEXT,
    "error_type" TEXT,
    "error_reason" TEXT,
    "correction" TEXT,
    "assistant_action" TEXT,
    "result" "AcademicImprovementStatus" NOT NULL DEFAULT 'NOT_ASSESSED',
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "academic_follow_up_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "assistant_group_assignments_assistant_id_group_id_respons_key" ON "assistant_group_assignments"("assistant_id", "group_id", "responsibility");

-- CreateIndex
CREATE INDEX "assistant_group_assignments_group_id_status_idx" ON "assistant_group_assignments"("group_id", "status");

-- CreateIndex
CREATE INDEX "assistant_group_assignments_assistant_id_status_idx" ON "assistant_group_assignments"("assistant_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "assistant_student_assignments_assistant_id_student_id_group_key" ON "assistant_student_assignments"("assistant_id", "student_id", "group_id", "responsibility");

-- CreateIndex
CREATE INDEX "assistant_student_assignments_student_id_status_idx" ON "assistant_student_assignments"("student_id", "status");

-- CreateIndex
CREATE INDEX "assistant_student_assignments_group_id_status_idx" ON "assistant_student_assignments"("group_id", "status");

-- CreateIndex
CREATE INDEX "assistant_student_assignments_assistant_id_status_idx" ON "assistant_student_assignments"("assistant_id", "status");

-- CreateIndex
CREATE INDEX "teaching_sessions_group_id_session_date_idx" ON "teaching_sessions"("group_id", "session_date");

-- CreateIndex
CREATE INDEX "teaching_sessions_status_session_date_idx" ON "teaching_sessions"("status", "session_date");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_records_session_id_student_id_key" ON "attendance_records"("session_id", "student_id");

-- CreateIndex
CREATE INDEX "attendance_records_student_id_recorded_at_idx" ON "attendance_records"("student_id", "recorded_at");

-- CreateIndex
CREATE INDEX "attendance_records_group_id_recorded_at_idx" ON "attendance_records"("group_id", "recorded_at");

-- CreateIndex
CREATE INDEX "attendance_records_status_recorded_at_idx" ON "attendance_records"("status", "recorded_at");

-- CreateIndex
CREATE INDEX "guardian_contact_logs_student_id_contacted_at_idx" ON "guardian_contact_logs"("student_id", "contacted_at");

-- CreateIndex
CREATE INDEX "guardian_contact_logs_group_id_contacted_at_idx" ON "guardian_contact_logs"("group_id", "contacted_at");

-- CreateIndex
CREATE INDEX "guardian_contact_logs_status_follow_up_at_idx" ON "guardian_contact_logs"("status", "follow_up_at");

-- CreateIndex
CREATE INDEX "guardian_contact_logs_session_id_status_idx" ON "guardian_contact_logs"("session_id", "status");

-- CreateIndex
CREATE INDEX "academic_follow_up_entries_student_id_entry_date_idx" ON "academic_follow_up_entries"("student_id", "entry_date");

-- CreateIndex
CREATE INDEX "academic_follow_up_entries_group_id_entry_date_idx" ON "academic_follow_up_entries"("group_id", "entry_date");

-- CreateIndex
CREATE INDEX "academic_follow_up_entries_assistant_id_entry_date_idx" ON "academic_follow_up_entries"("assistant_id", "entry_date");

-- AddForeignKey
ALTER TABLE "assistant_group_assignments" ADD CONSTRAINT "assistant_group_assignments_assistant_id_fkey" FOREIGN KEY ("assistant_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistant_group_assignments" ADD CONSTRAINT "assistant_group_assignments_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "accounting_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistant_group_assignments" ADD CONSTRAINT "assistant_group_assignments_assigned_by_id_fkey" FOREIGN KEY ("assigned_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistant_student_assignments" ADD CONSTRAINT "assistant_student_assignments_assistant_id_fkey" FOREIGN KEY ("assistant_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistant_student_assignments" ADD CONSTRAINT "assistant_student_assignments_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "accounting_students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistant_student_assignments" ADD CONSTRAINT "assistant_student_assignments_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "accounting_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "assistant_student_assignments" ADD CONSTRAINT "assistant_student_assignments_assigned_by_id_fkey" FOREIGN KEY ("assigned_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teaching_sessions" ADD CONSTRAINT "teaching_sessions_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "accounting_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teaching_sessions" ADD CONSTRAINT "teaching_sessions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teaching_sessions" ADD CONSTRAINT "teaching_sessions_attendance_assistant_id_fkey" FOREIGN KEY ("attendance_assistant_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teaching_sessions" ADD CONSTRAINT "teaching_sessions_guardian_contact_assistant_id_fkey" FOREIGN KEY ("guardian_contact_assistant_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "teaching_sessions" ADD CONSTRAINT "teaching_sessions_academic_assistant_id_fkey" FOREIGN KEY ("academic_assistant_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "teaching_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "accounting_students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "accounting_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_enrollment_id_fkey" FOREIGN KEY ("enrollment_id") REFERENCES "student_enrollments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_recorded_by_id_fkey" FOREIGN KEY ("recorded_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardian_contact_logs" ADD CONSTRAINT "guardian_contact_logs_attendance_id_fkey" FOREIGN KEY ("attendance_id") REFERENCES "attendance_records"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardian_contact_logs" ADD CONSTRAINT "guardian_contact_logs_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "teaching_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardian_contact_logs" ADD CONSTRAINT "guardian_contact_logs_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "accounting_students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardian_contact_logs" ADD CONSTRAINT "guardian_contact_logs_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "accounting_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "guardian_contact_logs" ADD CONSTRAINT "guardian_contact_logs_contacted_by_id_fkey" FOREIGN KEY ("contacted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_follow_up_entries" ADD CONSTRAINT "academic_follow_up_entries_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "teaching_sessions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_follow_up_entries" ADD CONSTRAINT "academic_follow_up_entries_student_id_fkey" FOREIGN KEY ("student_id") REFERENCES "accounting_students"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_follow_up_entries" ADD CONSTRAINT "academic_follow_up_entries_group_id_fkey" FOREIGN KEY ("group_id") REFERENCES "accounting_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_follow_up_entries" ADD CONSTRAINT "academic_follow_up_entries_assistant_id_fkey" FOREIGN KEY ("assistant_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
