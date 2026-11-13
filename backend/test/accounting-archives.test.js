const test = require('node:test');
const assert = require('node:assert/strict');
const { AccountingService } = require('../dist/src/accounting/accounting.service');
const { includesLesson } = require('../dist/src/teaching/lesson-roster');
const { AccountingController } = require('../dist/src/accounting/accounting.controller');

function fixture(failAudit = false) {
  const state = {
    students: [{ id: 'student', status: 'ACTIVE', archived_at: null, archive_reason: null, credit_balance: '25.00' }],
    groups: [{ id: 'group', active: true, archived_at: null, archive_reason: null }],
    history: { enrollments: ['enrollment'], payments: ['payment'], charges: ['charge'], attendance: ['attendance'], grades: ['grade'], awards: ['award'], sessions: ['lesson'], assignments: ['assignment'] },
    audits: [],
  };
  const calls = [];
  const model = (name) => ({
    findUnique: async (args) => { calls.push({ name: name + '.findUnique', args }); return state[name].find((row) => row.id === args.where.id) || null; },
    findFirst: async () => null,
    findMany: async (args) => { calls.push({ name: name + '.findMany', args }); return state[name].filter((row) => args.where.archived_at?.not === null ? row.archived_at != null : row.archived_at == null); },
    updateMany: async (args) => {
      calls.push({ name: name + '.updateMany', args });
      const rows = state[name].filter((row) => row.id === args.where.id && row.archived_at == null);
      rows.forEach((row) => Object.assign(row, args.data));
      return { count: rows.length };
    },
    delete: async () => { throw new Error('Physical deletion must never be attempted'); },
    update: async () => { throw new Error('Archived records must not be reactivated'); },
    create: async () => { throw new Error('Archived records must not get new enrollments'); },
  });
  const prisma = {
    managedStudent: model('students'), accountingGroup: model('groups'),
    studentEnrollment: { findFirst: async () => null },
    auditLog: { create: async ({ data }) => { if (failAudit) throw new Error('AUDIT_FAILED'); state.audits.push(data); return data; } },
    $transaction: async (callback) => {
      const before = structuredClone(state);
      try { return await callback(prisma); }
      catch (error) { Object.assign(state, before); throw error; }
    },
  };
  return { state, calls, prisma, service: new AccountingService(prisma, { log: async () => {} }) };
}

test('deleting a student hides the record without touching any historical relations or balance', async () => {
  const { state, service } = fixture();
  const history = structuredClone(state.history);
  const result = await service.deleteStudent('student', { reason: '  غادر الكورس  ' }, 'admin');
  assert.deepEqual(result, { deleted: true, archived: true, id: 'student' });
  assert.ok(state.students[0].archived_at instanceof Date);
  assert.equal(state.students[0].archive_reason, 'غادر الكورس');
  assert.equal(state.students[0].status, 'ACTIVE');
  assert.equal(state.students[0].credit_balance, '25.00');
  assert.deepEqual(state.history, history);
  assert.equal((await service.listStudents()).length, 0);
  assert.equal((await service.listStudents(undefined, undefined, undefined, true)).length, 1);
  assert.equal((await service.getStudent('student')).id, 'student');
  assert.equal(state.audits[0].action, 'ACCOUNTING_STUDENT_ARCHIVED');
  await service.deleteStudent('student', { reason: 'different reason' }, 'admin');
  assert.equal(state.audits.length, 1);
  assert.equal(state.students[0].archive_reason, 'غادر الكورس');
});

test('groups with teaching-only history and empty groups are both removed without foreign-key deletes', async () => {
  for (const withHistory of [true, false]) {
    const { state, service } = fixture();
    if (!withHistory) state.history = {};
    const history = structuredClone(state.history);
    await service.deleteGroup('group', 'admin');
    assert.equal(state.groups[0].active, false);
    assert.ok(state.groups[0].archived_at instanceof Date);
    assert.deepEqual(state.history, history);
    assert.equal((await service.listGroups()).length, 0);
    assert.equal((await service.listGroups(undefined, true)).length, 1);
    await service.deleteGroup('group', 'admin');
    assert.equal(state.audits.length, 1);
  }
});

test('archiving is atomic with its audit record and rejects missing reasons or unknown entities', async () => {
  const { service, state } = fixture(true);
  await assert.rejects(service.deleteStudent('student', { reason: 'left' }, 'admin'), /AUDIT_FAILED/);
  assert.equal(state.students[0].archived_at, null);
  await assert.rejects(service.deleteGroup('group', 'admin'), /AUDIT_FAILED/);
  assert.equal(state.groups[0].active, true);
  await assert.rejects(service.deleteStudent('student', { reason: '   ' }), (error) => error.getStatus() === 400);
  await assert.rejects(service.deleteStudent('missing', { reason: 'left' }), (error) => error.getStatus() === 404);
  await assert.rejects(service.deleteGroup('missing'), (error) => error.getStatus() === 404);
});

test('archived entities cannot be edited, re-enrolled or bulk-enrolled through stale selections', async () => {
  const { service } = fixture();
  await service.deleteStudent('student', { reason: 'left' });
  await assert.rejects(service.updateStudent('student', { status: 'ACTIVE' }), (error) => error.getStatus() === 409);
  await assert.rejects(service.enrollStudent({ studentId: 'student', groupId: 'group', startsAt: '2026-11-13' }), (error) => error.getStatus() === 404);
  await assert.rejects(service.enrollStudentsBulk({ studentIds: ['student'], groupId: 'group', startsAt: '2026-11-13' }), (error) => error.getStatus() === 400);
  await service.deleteGroup('group');
  await assert.rejects(service.updateGroup('group', { active: true }), (error) => error.getStatus() === 409);
  await assert.rejects(service.enrollStudentsBulk({ studentIds: ['student'], groupId: 'group', startsAt: '2026-11-13' }), (error) => error.getStatus() === 404);
});

test('all normal list filters exclude archives and group counts exclude archived students', async () => {
  const { service, calls } = fixture();
  await service.listStudents('name', 'WITHDRAWN', 'group');
  await service.listGroups(false);
  const students = calls.find((call) => call.name === 'students.findMany').args;
  const groups = calls.find((call) => call.name === 'groups.findMany').args;
  assert.equal(students.where.archived_at, null);
  assert.equal(students.where.status, 'WITHDRAWN');
  assert.equal(students.include.enrollments.where.group.archived_at, null);
  assert.equal(groups.where.archived_at, null);
  assert.equal(groups.include._count.select.enrollments.where.student.archived_at, null);
});

test('future billing skips archives without altering historical financial totals', async () => {
  const { service, prisma } = fixture();
  prisma.billingPeriod = { findUnique: async () => null };
  prisma.accountingGroup.findMany = async ({ where }) => { assert.deepEqual(where, { active: true, archived_at: null }); return []; };
  prisma.studentEnrollment.findMany = async ({ where }) => {
    assert.equal(where.student.archived_at, null);
    assert.equal(where.group.archived_at, null);
    throw new Error('STOP_BEFORE_ANY_WRITES');
  };
  await assert.rejects(service.openBillingPeriod({ year: 2026, month: 12 }), /STOP_BEFORE_ANY_WRITES/);
});

test('student archival preserves earlier lesson rosters but excludes lessons after deletion even after a transfer', () => {
  const archivedAt = new Date('2026-11-13T14:00:00Z');
  const enrollment = { group_id: 'group', starts_at: new Date('2026-01-01'), ends_at: new Date('2026-11-01'), teaching_continues_after_end: true, student: { archived_at: archivedAt } };
  const lesson = (time) => ({ group_id: 'group', session_date: new Date(time), starts_at: null });
  assert.equal(includesLesson(enrollment, lesson('2026-11-12')), true);
  assert.equal(includesLesson(enrollment, lesson('2026-11-14')), false);
  assert.equal(includesLesson(enrollment, lesson('2026-11-13T14:00:00Z')), false);
});

test('global delete routes remain restricted to management roles', () => {
  for (const method of ['deleteStudent', 'deleteGroup']) {
    assert.deepEqual(Reflect.getMetadata('roles', AccountingController.prototype[method]), ['ADMIN', 'FINANCE_MANAGER']);
  }
});
