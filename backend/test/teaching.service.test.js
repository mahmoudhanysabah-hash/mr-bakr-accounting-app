const test = require('node:test');
const assert = require('node:assert/strict');

const { LessonReportService, cairoMonthStart } = require('../dist/src/teaching/lesson-report.service');

const assistant = { id: 'assistant-1', role: 'ASSISTANT' };
const student = {
  id: 'student-1',
  code: 'ST-001',
  full_name: 'Student One',
  guardian_name: 'Guardian',
};
const group = { id: 'group-1', name: 'B64', code: 'B64' };

const lessonDate = new Date('2026-07-10T00:00:00.000Z');
const enrollment = {
  id: 'enrollment-1', student_id: student.id, group_id: group.id,
  starts_at: new Date('2026-07-01T00:00:00.000Z'), ends_at: null, student,
};
const lesson = { id: 'session-1', group_id: group.id, title: 'Revision', session_date: lessonDate, created_at: lessonDate, status: 'COMPLETED' };
const baseQuery = { studentId: student.id, groupId: group.id, year: 2026, month: 7 };

function createPrisma({ hasAccess = true, enrollments = [enrollment], sessions, awards = [] } = {}) {
  const db = {
    assistantGroupAssignment: {
      findMany: async () => [{ responsibility: 'ACADEMIC_FOLLOW_UP' }],
    },
    assistantStudentAssignment: {
      findMany: async () => hasAccess ? [{ student_id: student.id, responsibility: 'ACADEMIC_FOLLOW_UP' }] : [],
    },
    accountingGroup: { findUnique: async ({ where }) => ({ ...group, id: where.id }) },
    studentEnrollment: {
      findMany: async ({ where }) => enrollments.filter((entry) => entry.group_id === where.group_id && (!where.student_id || where.student_id.in.includes(entry.student_id))),
    },
    teachingSession: {
      findMany: async ({ where }) => (sessions ?? [
        {
          ...lesson,
          attendance_records: [
            {
              student_id: student.id,
              status: 'PRESENT',
              minutes_late: null,
              left_early_minutes: null,
              notes: null,
              contacts: [],
            },
          ],
          academic_follow_ups: [
            {
              id: 'follow-up-1',
              student_id: student.id,
              entry_date: new Date('2026-07-10T00:00:00.000Z'),
              activity_type: 'HOMEWORK',
              score: 8,
              max_score: 10,
              question_type: 'Algebra',
              error_type: 'Sign error',
              error_reason: 'Careless calculation',
              correction: 'Review signs',
              assistant_action: 'Explained the correction',
              result: 'IMPROVED',
              notes: 'Good progress',
            },
          ],
        },
      ]).filter((entry) => entry.group_id === where.group_id && entry.session_date >= where.session_date.gte && entry.session_date < where.session_date.lt),
    },
    academicFollowUpEntry: {
      findMany: async () => [],
    },
    teachingIncentiveAward: { findMany: async ({ where }) => awards.filter((award) => where.enrollment_id.in.includes(award.enrollment_id) && award.session.session_date < where.session.session_date.lt) },
    $transaction: async (callback) => callback(db),
  };
  return db;
}

test('student academic report summarizes sessions and scores', async () => {
  const service = new LessonReportService(createPrisma());
  const report = await service.studentReport(assistant, baseQuery);

  assert.equal(report.student.id, student.id);
  assert.equal(report.group.id, group.id);
  assert.equal(report.summary.totalSessions, 1);
  assert.equal(report.summary.attendance.PRESENT, 1);
  assert.equal(report.summary.averageScorePercentage, 80);
  assert.equal(report.summary.progressLevel, 'GOOD');
  assert.equal(report.sessions[0].academicFollowUps[0].correction, 'Review signs');
  assert.equal(report.summary.mainDifficulties[0].label, 'Sign error');
});

test('assistant without student assignment cannot read the report', async () => {
  const service = new LessonReportService(createPrisma({ hasAccess: false }));

  await assert.rejects(
    () => service.studentReport(assistant, baseQuery),
    { status: 403 },
  );
});

test('group report carries old points to the selected cutoff and starts a separate balance in the new group', async () => {
  const makeLesson = (id, date, groupId = group.id, attendance = [], grades = []) => ({
    ...lesson, id, group_id: groupId, session_date: new Date(date), created_at: new Date(date), attendance_records: attendance, academic_follow_ups: grades,
  });
  const october = makeLesson('october', '2026-10-20');
  const beforeCutoff = makeLesson('untouched', '2026-11-06', group.id, [{ student_id: student.id, status: 'ABSENT', recorded_by_id: null, contacts: [] }]);
  const last = makeLesson('last', '2026-11-09', group.id, [{ student_id: student.id, status: 'EXCUSED', contacts: [] }], [{
    id: 'zero', student_id: student.id, enrollment_id: enrollment.id, score: 0, max_score: 10, sheet_slot: 'CLASSWORK', activity_type: 'CLASSWORK', result: 'NOT_ASSESSED',
  }]);
  const archived = makeLesson('archived', '2026-11-10');
  const newLesson = makeLesson('new', '2026-11-10', 'new-group');
  const oldEntry = { ...enrollment, ends_at: new Date('2026-11-08'), teaching_continues_after_end: true, teaching_last_session: last };
  const newEntry = { ...enrollment, id: 'new-enrollment', group_id: 'new-group', starts_at: new Date('2026-11-08') };
  const unauthorized = { ...oldEntry, id: 'other-enrollment', student_id: 'other', student: { ...student, id: 'other' } };
  const award = (session, entry, amount) => ({ id: session.id, session_id: session.id, session, enrollment_id: entry.id, source: 'CLASSWORK', amount });
  const service = new LessonReportService(createPrisma({
    enrollments: [oldEntry, newEntry, unauthorized], sessions: [october, beforeCutoff, last, archived, newLesson],
    awards: [award(october, oldEntry, 10), award(last, oldEntry, 5), award(archived, oldEntry, 99), award(newLesson, newEntry, 2)],
  }));
  const { reports } = await service.groupReport(assistant, { ...baseQuery, month: 11 });
  assert.equal(reports.length, 1);
  const [old] = reports;
  assert.deepEqual(old.sessions.map((entry) => entry.id), ['untouched', 'last']);
  assert.equal(old.summary.attendance.ABSENT, 0);
  assert.equal(old.summary.attendance.UNRECORDED, 1);
  assert.equal(old.summary.attendance.EXCUSED, 1);
  assert.equal(old.summary.averageScorePercentage, 0);
  assert.equal(old.sessions[1].classwork.score, 0);
  assert.equal(old.sessions[1].classwork.attendanceLabel, null);
  assert.equal(old.summary.pointsEarned, 5);
  assert.equal(old.summary.pointsBalance, 15);

  const latest = await service.studentReport(assistant, { ...baseQuery, groupId: 'new-group', month: 11 });
  assert.equal(latest.summary.pointsEarned, 2);
  assert.equal(latest.summary.pointsBalance, 2);
});

test('month boundaries use the Cairo calendar rather than UTC', () => {
  assert.equal(cairoMonthStart(2026, 11).toISOString(), '2026-10-31T22:00:00.000Z');
});
