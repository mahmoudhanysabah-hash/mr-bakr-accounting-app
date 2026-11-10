const test = require('node:test');
const assert = require('node:assert/strict');
const { TodayLessonService } = require('../dist/src/teaching/today-lesson.service');
const { cairoDateKey, cairoDayRange, cairoLessonStart } = require('../dist/src/teaching/cairo-calendar');

const day = new Date('2026-11-10T10:00:00Z');
const manager = { id: 'manager', role: 'ADMIN' };
const assistant = { id: 'assistant', role: 'ASSISTANT' };
const assigned = (group_id, id, name, responsibility = 'FULL') => ({ group_id, responsibility, assistant: { id, name } });
const assignments = [assigned('math', assistant.id, 'مساعد تجريبي'), assigned('review', assistant.id, 'مساعد تجريبي', 'GUARDIAN_CONTACT'), assigned('science', 'other', 'مساعد آخر')];
const lesson = (id, group, time) => ({
  id, group_id: group, title: id, group: { id: group, name: group, code: group },
  status: 'PLANNED', session_date: new Date('2026-11-10T00:00:00Z'), created_at: day,
  starts_at: time ? new Date(time) : null, attendance_assistant_id: null, academic_assistant_id: null,
});
const early = lesson('early', 'math', '2026-11-10T12:00:00Z');
const later = lesson('later', 'science', '2026-11-10T15:00:00Z');
const untimed = lesson('untimed', 'review', null);
const removed = lesson('removed', 'math', '2026-11-10T16:00:00Z');
const priorCutoff = { ...early, id: 'prior', starts_at: new Date('2026-11-09T15:00:00Z'), session_date: new Date('2026-11-09') };
const enrollment = (id, student_id, group_id, last = null) => ({ id, student_id, group_id,
  starts_at: new Date('2026-11-01'), ends_at: null, teaching_last_session: last });

function fixture(academic = []) {
  const lessons = [untimed, later, removed, early];
  const enrollmentRows = [enrollment('e1', 's1', 'math'), enrollment('e2', 's2', 'math', priorCutoff), enrollment('e3', 's3', 'science'), enrollment('e4', 's4', 'review')];
  const scopes = [
    { group_id: 'math', student_id: 's1', responsibility: 'ATTENDANCE' },
    { group_id: 'math', student_id: 's2', responsibility: 'FULL' },
    { group_id: 'review', student_id: 's4', responsibility: 'FULL' },
  ];
  const db = {
    assistantGroupAssignment: { findMany: async ({ where }) => assignments.filter((row) => !where.assistant_id || row.assistant.id === where.assistant_id) },
    assistantStudentAssignment: { findMany: async () => scopes },
    teachingSession: { findMany: async ({ where, orderBy }) => {
      assert.deepEqual(orderBy[0], { starts_at: { sort: 'asc', nulls: 'last' } });
      return lessons.filter((row) => (!where.group_id || where.group_id.in.includes(row.group_id)) && row.session_date >= where.session_date.gte && row.session_date < where.session_date.lt)
        .sort((a, b) => (a.starts_at?.getTime() ?? Infinity) - (b.starts_at?.getTime() ?? Infinity));
    } },
    studentEnrollment: { findMany: async () => enrollmentRows },
    attendanceRecord: { findMany: async ({ where }) => {
      assert.ok(where.AND[0].OR.some((clause) => clause.confirmed_at?.not === null));
      return [{ session_id: early.id, student_id: 's1', enrollment_id: 'e1' }, { session_id: removed.id, student_id: 's2', enrollment_id: 'e2' }];
    } },
    academicFollowUpEntry: { findMany: async ({ where }) => {
      assert.ok(where.AND[0].OR.some((clause) => clause.score?.not === null));
      return academic;
    } },
    teachingIncentiveAward: { findMany: async () => [{ session_id: later.id, enrollment_id: 'e3', enrollment: { student_id: 's3' } }] },
    $transaction: async (callback) => callback(db),
  };
  return new TodayLessonService(db);
}

test('manager sees all groups, timed lessons first, assignees, and only retained saved marks', async () => {
  const result = await fixture().getToday(manager, day);
  assert.equal(result.day, '2026-11-10');
  assert.deepEqual(result.lessons.map(({ id }) => id), ['early', 'later', 'removed', 'untimed']);
  assert.deepEqual(result.lessons.map(({ sheetState }) => sheetState), ['SAVED', 'SAVED', 'UNRECORDED', 'UNRECORDED']);
  assert.deepEqual(result.lessons[0].assistants, ['مساعد تجريبي']);
  assert.deepEqual(result.lessons[1].assistants, ['مساعد آخر']);
  assert.equal(JSON.stringify(result).includes('student_id'), false);
});

test('assistant sees multiple assigned groups and sheet state only for assigned sheet duties', async () => {
  const result = await fixture([
    { session_id: removed.id, student_id: 's1', enrollment_id: 'e1' },
    { session_id: untimed.id, student_id: 's4', enrollment_id: 'e4' },
  ]).getToday(assistant, day);
  assert.deepEqual(result.lessons.map(({ id }) => id), ['early', 'removed', 'untimed']);
  assert.deepEqual(result.lessons.map(({ sheetState }) => sheetState), ['SAVED', 'UNRECORDED', 'NOT_VISIBLE']);
  assert.equal(JSON.stringify(result).includes('مساعد آخر'), false);
  await assert.rejects(() => fixture().getToday({ id: 'accountant', role: 'ACCOUNTANT' }, day), { status: 403 });
});

test('day boundary and lesson times follow Cairo even if the server is elsewhere', () => {
  assert.equal(cairoDateKey(new Date('2026-11-09T22:30:00Z')), '2026-11-10');
  const range = cairoDayRange('2026-11-10');
  assert.equal(range.gte.toISOString(), '2026-11-09T22:00:00.000Z');
  assert.equal(range.lt.toISOString(), '2026-11-10T22:00:00.000Z');
  assert.equal(cairoLessonStart('2026-11-10', '17:30').toISOString(), '2026-11-10T15:30:00.000Z');
  assert.equal(cairoLessonStart('2026-07-10', '17:30').toISOString(), '2026-07-10T14:30:00.000Z');
  assert.throws(() => cairoDayRange('2026-02-30'), { status: 400 });
  assert.throws(() => cairoLessonStart('2026-11-10', '25:00'), { status: 400 });
});
