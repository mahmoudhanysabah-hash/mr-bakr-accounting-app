const test = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID } = require('node:crypto');
const { plainToInstance } = require('class-transformer');
const { validate } = require('class-validator');

const { LessonSheetService } = require('../dist/src/teaching/lesson-sheet.service');
const { SaveLessonSheetDto } = require('../dist/src/teaching/dto/lesson-sheet.dto');
const { rosterForLesson } = require('../dist/src/teaching/lesson-roster');
const manager = { id: 'manager', role: 'ADMIN' };
const assistant = { id: 'assistant', role: 'ASSISTANT' };
const student = { id: 'student', full_name: 'طالب تجريبي', code: 'S1', guardian_name: 'بيانات خاصة' };
const group = { id: 'group', name: 'مجموعة تجريبية', code: 'G1' };
const lesson = {
  id: 'lesson', group_id: group.id, group, title: 'حصة تجريبية', status: 'COMPLETED',
  session_date: new Date('2026-11-09T00:00:00Z'), created_at: new Date('2026-11-09T13:00:00Z'),
};
const next = { ...lesson, id: 'next', created_at: new Date('2026-11-09T13:01:00Z') };
const rowKey = { studentId: student.id, enrollmentId: 'enrollment' };
const enrollment = {
  id: rowKey.enrollmentId, student_id: student.id, student, group_id: group.id, starts_at: new Date('2026-10-01'),
  ends_at: null, teaching_continues_after_end: false, teaching_last_session: null,
};
const placeholder = { id: 'legacy', session_id: lesson.id, student_id: student.id, status: 'ABSENT', recorded_by_id: null, enrollment_id: enrollment.id };

function makePrisma({ groupTask = 'FULL', studentTask = 'FULL', attendance = [], enrollments = [enrollment], lessons = [lesson, next] } = {}) {
  const initial = { attendance: [...attendance], entries: [], awards: [], audit: [], enrollments: [...enrollments] };
  let state = initial;
  const unique = (rows, key) => rows.find((row) => Object.entries(key).every(([field, value]) => row[field] === value));
  const upsert = (rows, key, create, update) => {
    const previous = unique(rows, key);
    const saved = { ...(previous ?? { id: randomUUID() }), ...(previous ? update : create), updated_at: new Date() };
    if (previous) rows[rows.indexOf(previous)] = saved;
    else rows.push(saved);
    return saved;
  };
  const byRoster = (rows, where) => rows.filter((row) =>
    row.session_id === where.session_id && where.student_id.in.includes(row.student_id));
  const db = {
    teachingSession: { findUnique: async ({ where }) => unique(lessons, where) },
    assistantGroupAssignment: { findMany: async () => [{ responsibility: groupTask }] },
    assistantStudentAssignment: { findMany: async () => [{ student_id: student.id, responsibility: studentTask }] },
    studentEnrollment: {
      findMany: async ({ where }) => state.enrollments.filter((row) => row.group_id === where.group_id && (!where.student_id || where.student_id.in.includes(row.student_id))),
      findUnique: async ({ where }) => unique(state.enrollments, where),
      updateMany: async ({ where, data }) => {
        const row = state.enrollments.find((item) => item.id === where.id && !item.teaching_removed_at);
        if (!row) return { count: 0 };
        state.enrollments[state.enrollments.indexOf(row)] = { ...row, ...data, teaching_last_session: lessons.find((entry) => entry.id === data.teaching_last_session_id) };
        return { count: 1 };
      },
    },
    attendanceRecord: {
      findMany: async ({ where }) => byRoster(state.attendance, where),
      upsert: async ({ where, create, update }) => upsert(state.attendance, where.session_id_student_id, create, update),
    },
    academicFollowUpEntry: {
      findMany: async ({ where }) => byRoster(state.entries, where),
      upsert: async ({ where, create, update }) => upsert(state.entries, where.session_id_student_id_sheet_slot, create, update),
    },
    teachingIncentiveAward: {
      findMany: async ({ where }) => where.id ? state.awards.filter((item) => where.id.in.includes(item.id))
        : state.awards.filter((item) => where.enrollment_id.in.includes(item.enrollment_id))
          .map((item) => ({ ...item, session: lessons.find((entry) => entry.id === item.session_id), recorded_by: { name: 'أسيستنت' } })),
      createMany: async ({ data }) => state.awards.push(...data),
    },
    auditLog: {
      findUnique: async ({ where }) => unique(state.audit, where),
      create: async ({ data }) => state.audit.push(data),
    },
    $transaction: async (callback) => {
      const snapshot = Object.fromEntries(Object.entries(state).map(([key, rows]) => [key, [...rows]]));
      try { return await callback(db); }
      catch (err) { state = snapshot; throw err; }
    },
    state: () => state,
  };
  return db;
}

const update = (service, row, user = manager, requestId = randomUUID()) => service.saveSheet(lesson.id, { requestId, rows: [{ ...rowKey, ...row }] }, user);

test('the sheet treats untouched and seeded absences as unrecorded and requires a note for other', async () => {
  const prisma = makePrisma({ attendance: [placeholder] });
  const service = new LessonSheetService(prisma);
  const initial = (await service.getSheet(lesson.id, manager)).rows[0];
  assert.equal(initial.attendance.status, null);
  assert.equal(initial.academic.classwork.attendanceLabel, null);
  await assert.rejects(() => update(service, { attendance: { status: 'OTHER', version: initial.attendance.version } }), { status: 400 });
  assert.equal(prisma.state().attendance[0].recorded_by_id, null);
  const saved = (await update(service, { attendance: { status: 'OTHER', notes: 'موعد بديل', version: initial.attendance.version } })).rows[0];
  assert.equal(saved.attendance.status, 'OTHER');
  assert.equal(saved.attendance.notes, 'موعد بديل');
  const shareable = await service.getShareableSheet(lesson.id, manager);
  assert.equal(shareable.rows[0].attendance, 'OTHER');
  assert.ok(!JSON.stringify(shareable).includes('موعد بديل'));
  assert.ok(!JSON.stringify(shareable).includes('بيانات خاصة'));
});

test('attendance changes its classwork label, zero is numeric, and clearing it returns to attendance', async () => {
  const prisma = makePrisma();
  const service = new LessonSheetService(prisma);
  const absent = (await update(service, { attendance: { status: 'ABSENT', version: '' } })).rows[0];
  assert.equal(absent.academic.classwork.attendanceLabel, 'ABSENT');
  const excused = (await update(service, { attendance: { status: 'EXCUSED', version: absent.attendance.version } })).rows[0];
  assert.equal(excused.academic.classwork.attendanceLabel, 'EXCUSED');
  const graded = (await update(service, { academic: { version: '', classwork: { score: 0, maxScore: 10 }, homework: { score: 8, maxScore: 10 } } })).rows[0];
  assert.deepEqual(graded.academic.classwork, { score: 0, maxScore: 10, attendanceLabel: null });
  const cleared = (await update(service, { academic: { version: graded.academic.version, classwork: { score: null, maxScore: 10 } } })).rows[0];
  assert.equal(cleared.academic.classwork.attendanceLabel, 'EXCUSED');
  assert.equal(cleared.attendance.status, 'EXCUSED');
  assert.equal(cleared.academic.homework.score, 8);
  assert.ok(prisma.state().audit.some((audit) => JSON.parse(audit.payload_json).changes.some((change) => change.field === 'CLASSWORK' && change.from.score === 0 && change.to.score === null)));
});

test('two award sources accumulate once, while stale changes cannot overwrite saved entries', async () => {
  const prisma = makePrisma();
  const service = new LessonSheetService(prisma);
  const awards = [{ id: randomUUID(), source: 'CLASSWORK', amount: 2 }, { id: randomUUID(), source: 'HOMEWORK', amount: 3 }];
  const requestId = randomUUID();
  const changes = { attendance: { status: 'PRESENT', version: '' }, awards };
  await update(service, changes, manager, requestId);
  const retried = (await update(service, changes, manager, requestId)).rows[0];
  assert.equal(retried.academic.pointsInLesson, 5);
  assert.equal(retried.academic.awards.length, 2);
  assert.equal((await update(service, { awards })).rows[0].academic.pointsBalance, 5);
  assert.equal(prisma.state().awards.length, 2);
  await assert.rejects(() => update(service, { attendance: { status: 'ABSENT', version: '' } }), { status: 409 });
  await assert.rejects(() => update(service, { awards: [{ ...awards[0], amount: 4 }] }), { status: 409 });
  assert.equal(prisma.state().attendance[0].status, 'PRESENT');
});

test('task scope is checked for each row and validation failure rolls back the sheet', async () => {
  const restricted = makePrisma({ groupTask: 'ATTENDANCE' });
  const service = new LessonSheetService(restricted);
  const row = (await service.getSheet(lesson.id, assistant)).rows[0];
  assert.equal(row.academic, null);
  await assert.rejects(() => update(service, { awards: [{ id: randomUUID(), source: 'HOMEWORK', amount: 2 }] }, assistant), { status: 403 });
  await assert.rejects(() => update(service, {
    attendance: { status: 'PRESENT', version: '' }, academic: { version: '', homework: { score: 12, maxScore: 10 } },
  }), { status: 400 });
  assert.equal(restricted.state().attendance.length, 0);
});

test('the explicit inclusive lesson cutoff can be set after an accounting transfer without deleting history', async () => {
  const transferred = { ...enrollment, ends_at: new Date('2026-11-08'), teaching_continues_after_end: true };
  assert.equal(rosterForLesson([transferred], next).size, 1);
  const prisma = makePrisma({ enrollments: [transferred], attendance: [{ ...placeholder, session_id: next.id }] });
  const service = new LessonSheetService(prisma);
  await assert.rejects(() => service.removeEnrollment(transferred.id, { lastSessionId: lesson.id, reason: 'نقل' }, assistant), { status: 403 });
  await service.removeEnrollment(transferred.id, { lastSessionId: lesson.id, reason: 'نقل' }, manager);
  assert.equal((await service.getSheet(lesson.id, manager)).rows.length, 1);
  assert.equal((await service.getShareableSheet(next.id, manager)).rows.length, 0);
  assert.equal(prisma.state().attendance.length, 1);
  assert.equal(prisma.state().enrollments[0].teaching_removal_reason, 'نقل');
  assert.equal(prisma.state().enrollments[0].ends_at, transferred.ends_at);
});

test('sheet payload validation rejects malformed objects but accepts explicit zero and null', async () => {
  const requestId = randomUUID();
  const valid = plainToInstance(SaveLessonSheetDto, { requestId, rows: [{ ...rowKey, academic: { version: '', classwork: { score: 0, maxScore: null } } }] });
  assert.deepEqual(await validate(valid, { whitelist: true, forbidNonWhitelisted: true }), []);
  const invalid = plainToInstance(SaveLessonSheetDto, { requestId, rows: [{ ...rowKey, awards: [null] }] });
  assert.ok((await validate(invalid)).length > 0);
});
