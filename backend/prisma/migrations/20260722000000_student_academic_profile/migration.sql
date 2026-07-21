CREATE TYPE "AcademicTrack" AS ENUM ('SAT', 'EST', 'OTHER');

ALTER TABLE "accounting_students"
ADD COLUMN "grade_level" TEXT,
ADD COLUMN "academic_track" "AcademicTrack";