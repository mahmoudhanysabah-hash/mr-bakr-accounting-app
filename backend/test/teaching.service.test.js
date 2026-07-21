const test = require('node:test');
const assert = require('node:assert/strict');

const { TeachingService } = require('../dist/src/teaching/teaching.service');

const assistant = { id: 'assistant-1', role: 'ASSISTANT' };
const student = {
  id: 'student-1',
  code: 'ST-001',
  full_name: 'Student One',
  guardian_name: 'Guardian',
};
const group = { id: 'group-1', name: 'B64', code: 'B64' };

function createAudit() {
  return { log: async () => undefined };
}

function createPrisma({ hasAccess = true } = {}) {
  return {
    assistantGroupAssignment: {
      count: async () => (hasAccess ? 1 : 0),
    },
    assistantStudentAssignment: {
      count: async () => (hasAccess ? 1 : 0),
    },
    studentEnrollment: {
      findFirst: async () => ({
        starts_at: new Date('2026-07-01T00:00:00.000Z'),
        ends_at: null,
        student,
        group,
      }),
    },
    teachingSession: {
      findMany: async () => [
        {
          id: 'session-1',
          title: 'Revision',
          session_date: new Date('2026-07-10T00:00:00.000Z'),
          status: 'COMPLETED',
          attendance_records: [
            {
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
      ],
    },
    academicFollowUpEntry: {
      findMany: async () => [],
    },
  };
}

test('student academic report summarizes sessions and scores', async () => {
  const service = new TeachingService(createPrisma(), createAudit());

  const report = await service.getStudentAcademicReport(
    assistant,
    student.id,
    group.id,
    2026,
    7,
  );

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
  const service = new TeachingService(createPrisma({ hasAccess: false }), createAudit());

  await assert.rejects(
    () => service.getStudentAcademicReport(assistant, student.id, group.id, 2026, 7),
    /Assistant is not assigned/,
  );
});
