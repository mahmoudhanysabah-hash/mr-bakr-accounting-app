'use client';

import React, { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import api from '@/lib/axios';
import {
  CalendarCheck,
  CheckCircle2,
  Clock3,
  MessageSquareText,
  PhoneCall,
  Plus,
  RefreshCw,
  ShieldCheck,
  UserCheck,
  UserRoundCheck,
  Users,
  XCircle,
} from 'lucide-react';

type Role = 'ADMIN' | 'ACCOUNTANT' | 'FINANCE_MANAGER' | 'ASSISTANT';
type Responsibility = 'ATTENDANCE' | 'GUARDIAN_CONTACT' | 'ACADEMIC_FOLLOW_UP' | 'FULL';
type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'LEFT_EARLY' | 'EXCUSED';
type GuardianContactStatus = 'PENDING' | 'CONTACTED' | 'NO_ANSWER' | 'EXCUSED' | 'NEEDS_FOLLOW_UP' | 'WRONG_NUMBER';

type Group = {
  id: string;
  name: string;
  code: string;
  active?: boolean;
};

type Assistant = {
  id: string;
  name: string;
  email: string;
  role: Role;
  status: string;
};

type AssistantGroupAssignment = {
  id: string;
  responsibility: Responsibility;
  status: string;
  group: Group;
  assistant: Assistant;
};

type Student = {
  id: string;
  code: string;
  full_name: string;
  guardian_name?: string | null;
  guardian_phone?: string | null;
  student_phone?: string | null;
};

type GuardianContact = {
  id: string;
  status: GuardianContactStatus;
  response?: string | null;
  notes?: string | null;
  contacted_at?: string | null;
};

type AttendanceRecord = {
  id: string;
  student_id: string;
  status: AttendanceStatus;
  minutes_late?: number | null;
  notes?: string | null;
  student: Student;
  contacts?: GuardianContact[];
};

type TeachingSession = {
  id: string;
  title?: string | null;
  group_id: string;
  session_date: string;
  status: string;
  group: Group;
  attendance_records?: AttendanceRecord[];
  guardian_contact_logs?: GuardianContact[];
  _count?: {
    attendance_records: number;
    guardian_contact_logs: number;
    academic_follow_ups: number;
  };
};

type ContactDraft = {
  status: GuardianContactStatus;
  response: string;
  notes: string;
};

const managerRoles: Role[] = ['ADMIN', 'FINANCE_MANAGER'];

const responsibilityOptions: Array<{ value: Responsibility; label: string }> = [
  { value: 'ATTENDANCE', label: 'تسجيل الحضور' },
  { value: 'GUARDIAN_CONTACT', label: 'متابعة ولي الأمر' },
  { value: 'ACADEMIC_FOLLOW_UP', label: 'المتابعة الدراسية' },
  { value: 'FULL', label: 'كل مهام المساعد' },
];

const attendanceOptions: Array<{ value: AttendanceStatus; label: string; icon: React.ElementType; tone: string }> = [
  { value: 'PRESENT', label: 'حاضر', icon: CheckCircle2, tone: 'bg-emerald-50 text-emerald-700 border-emerald-100' },
  { value: 'ABSENT', label: 'غائب', icon: XCircle, tone: 'bg-red-50 text-red-700 border-red-100' },
  { value: 'LATE', label: 'متأخر', icon: Clock3, tone: 'bg-amber-50 text-amber-700 border-amber-100' },
  { value: 'LEFT_EARLY', label: 'خرج بدري', icon: UserRoundCheck, tone: 'bg-blue-50 text-blue-700 border-blue-100' },
  { value: 'EXCUSED', label: 'غياب بعذر', icon: MessageSquareText, tone: 'bg-slate-100 text-slate-700 border-slate-200' },
];

const contactStatusOptions: Array<{ value: GuardianContactStatus; label: string }> = [
  { value: 'CONTACTED', label: 'تم الرد' },
  { value: 'NO_ANSWER', label: 'لم يتم الرد' },
  { value: 'EXCUSED', label: 'عذر مقبول' },
  { value: 'NEEDS_FOLLOW_UP', label: 'يحتاج متابعة' },
  { value: 'WRONG_NUMBER', label: 'رقم غير صحيح' },
  { value: 'PENDING', label: 'لم يتم التواصل' },
];

function unwrapData<T>(payload: T | { data: T }): T {
  return 'data' in Object(payload) ? (payload as { data: T }).data : (payload as T);
}

function todayInputValue() {
  return new Date().toISOString().split('T')[0];
}

function attendanceMeta(status: AttendanceStatus) {
  return attendanceOptions.find((item) => item.value === status) ?? attendanceOptions[1];
}

function contactStatusLabel(status?: GuardianContactStatus | null) {
  return contactStatusOptions.find((item) => item.value === status)?.label ?? 'لم يتم التواصل';
}

function getErrorMessage(error: unknown, fallback: string) {
  const response = (error as { response?: { data?: { error?: string; message?: string | string[] } } }).response;
  const message = response?.data?.message;
  if (response?.data?.error) return response.data.error;
  if (Array.isArray(message)) return message.join('، ');
  if (message) return message;
  return fallback;
}

export default function SessionsPage() {
  const [userRole, setUserRole] = useState<Role | ''>('');
  const [groups, setGroups] = useState<Group[]>([]);
  const [assistants, setAssistants] = useState<Assistant[]>([]);
  const [assignments, setAssignments] = useState<AssistantGroupAssignment[]>([]);
  const [sessions, setSessions] = useState<TeachingSession[]>([]);
  const [selectedSession, setSelectedSession] = useState<TeachingSession | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [sessionDate, setSessionDate] = useState(todayInputValue());
  const [sessionTitle, setSessionTitle] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [contactDrafts, setContactDrafts] = useState<Record<string, ContactDraft>>({});

  const [assignmentAssistantId, setAssignmentAssistantId] = useState('');
  const [assignmentGroupId, setAssignmentGroupId] = useState('');
  const [assignmentResponsibility, setAssignmentResponsibility] = useState<Responsibility>('ATTENDANCE');

  const isManager = userRole ? managerRoles.includes(userRole) : false;

  const loadSession = useCallback(async (id: string) => {
    const response = await api.get(`/teaching/sessions/${id}`);
    setSelectedSession(unwrapData<TeachingSession>(response.data));
  }, []);

  const loadSessions = useCallback(async () => {
    if (!userRole) return;
    try {
      const response = await api.get('/teaching/sessions', {
        params: {
          groupId: selectedGroupId || undefined,
          date: sessionDate || undefined,
        },
      });
      const data = unwrapData<TeachingSession[]>(response.data);
      setSessions(data);
      if (selectedSession && !data.some((session) => session.id === selectedSession.id)) {
        setSelectedSession(null);
      }
    } catch (err) {
      setError(getErrorMessage(err, 'تعذر تحميل الحصص'));
    }
  }, [selectedGroupId, selectedSession, sessionDate, userRole]);

  const loadBootstrap = useCallback(async (role: Role) => {
    setLoading(true);
    setError('');
    try {
      if (managerRoles.includes(role)) {
        const [groupsResponse, assistantsResponse, assignmentsResponse] = await Promise.all([
          api.get('/accounting/groups', { params: { active: true } }),
          api.get('/teaching/assistants'),
          api.get('/teaching/assistant-groups'),
        ]);
        const loadedGroups = unwrapData<Group[]>(groupsResponse.data).filter((group) => group.active !== false);
        const loadedAssistants = unwrapData<Assistant[]>(assistantsResponse.data);
        const loadedAssignments = unwrapData<AssistantGroupAssignment[]>(assignmentsResponse.data);
        setGroups(loadedGroups);
        setAssistants(loadedAssistants);
        setAssignments(loadedAssignments);
        setSelectedGroupId((current) => current || loadedGroups[0]?.id || '');
        setAssignmentGroupId((current) => current || loadedGroups[0]?.id || '');
        setAssignmentAssistantId((current) => current || loadedAssistants[0]?.id || '');
      } else {
        const assignmentsResponse = await api.get('/teaching/assistant-groups');
        const loadedAssignments = unwrapData<AssistantGroupAssignment[]>(assignmentsResponse.data);
        const uniqueGroups = Array.from(
          new Map(loadedAssignments.map((assignment) => [assignment.group.id, assignment.group])).values(),
        );
        setGroups(uniqueGroups);
        setAssignments(loadedAssignments);
        setSelectedGroupId((current) => current || uniqueGroups[0]?.id || '');
      }
    } catch (err) {
      setError(getErrorMessage(err, 'تعذر تحميل بيانات تشغيل الحصص'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (!userStr) return;
    try {
      const user = JSON.parse(userStr);
      setUserRole(user.role);
      void loadBootstrap(user.role);
    } catch {
      setError('تعذر قراءة بيانات المستخدم الحالي');
      setLoading(false);
    }
  }, [loadBootstrap]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const sessionStats = useMemo(() => {
    const records = selectedSession?.attendance_records || [];
    return {
      total: records.length,
      present: records.filter((record) => record.status === 'PRESENT').length,
      absent: records.filter((record) => record.status === 'ABSENT' || record.status === 'EXCUSED').length,
      late: records.filter((record) => record.status === 'LATE').length,
      contacted: records.filter((record) => (record.contacts || []).length > 0).length,
    };
  }, [selectedSession]);

  const absenceRecords = useMemo(
    () => (selectedSession?.attendance_records || []).filter((record) => record.status === 'ABSENT' || record.status === 'EXCUSED'),
    [selectedSession],
  );

  const createSession = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedGroupId) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await api.post('/teaching/sessions', {
        groupId: selectedGroupId,
        title: sessionTitle.trim() || undefined,
        sessionDate: new Date(sessionDate).toISOString(),
      });
      const created = unwrapData<TeachingSession>(response.data);
      setSelectedSession(created);
      setSessionTitle('');
      setMessage('تم إنشاء الحصة وتجهيز قائمة الطلاب');
      await loadSessions();
    } catch (err) {
      setError(getErrorMessage(err, 'تعذر إنشاء الحصة'));
    } finally {
      setSaving(false);
    }
  };

  const assignAssistant = async (event: FormEvent) => {
    event.preventDefault();
    if (!assignmentAssistantId || !assignmentGroupId) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await api.post('/teaching/assistant-groups', {
        assistantId: assignmentAssistantId,
        groupId: assignmentGroupId,
        responsibility: assignmentResponsibility,
      });
      const assignmentsResponse = await api.get('/teaching/assistant-groups');
      setAssignments(unwrapData<AssistantGroupAssignment[]>(assignmentsResponse.data));
      setMessage('تم ربط المساعد بالجروب');
    } catch (err) {
      setError(getErrorMessage(err, 'تعذر ربط المساعد بالجروب'));
    } finally {
      setSaving(false);
    }
  };

  const updateAttendance = async (record: AttendanceRecord, status: AttendanceStatus) => {
    if (!selectedSession) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await api.post(`/teaching/sessions/${selectedSession.id}/attendance`, {
        records: [{ studentId: record.student_id, status }],
      });
      await loadSession(selectedSession.id);
      setMessage('تم تحديث حضور الطالب');
    } catch (err) {
      setError(getErrorMessage(err, 'تعذر تحديث الحضور'));
    } finally {
      setSaving(false);
    }
  };

  const updateContactDraft = (recordId: string, patch: Partial<ContactDraft>) => {
    setContactDrafts((current) => ({
      ...current,
      [recordId]: {
        status: 'CONTACTED',
        response: '',
        notes: '',
        ...(current[recordId] || {}),
        ...patch,
      },
    }));
  };

  const saveGuardianContact = async (record: AttendanceRecord) => {
    if (!selectedSession) return;
    const draft = contactDrafts[record.id] || { status: 'CONTACTED', response: '', notes: '' };
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await api.post('/teaching/guardian-contacts', {
        attendanceId: record.id,
        sessionId: selectedSession.id,
        studentId: record.student_id,
        status: draft.status,
        guardianPhone: record.student.guardian_phone || undefined,
        response: draft.response.trim() || undefined,
        notes: draft.notes.trim() || undefined,
      });
      await loadSession(selectedSession.id);
      setContactDrafts((current) => ({ ...current, [record.id]: { status: 'CONTACTED', response: '', notes: '' } }));
      setMessage('تم تسجيل تواصل ولي الأمر');
    } catch (err) {
      setError(getErrorMessage(err, 'تعذر تسجيل تواصل ولي الأمر'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 font-cairo" dir="rtl">
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-black text-slate-900">
            <CalendarCheck className="h-7 w-7 text-emerald-600" />
            تشغيل الحصص والحضور
          </h1>
          <p className="mt-1 text-sm font-semibold text-slate-500">
            إنشاء الحصص، تسجيل الحضور، ومتابعة ولي الأمر للطلاب الغائبين.
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            void loadBootstrap(userRole as Role);
            void loadSessions();
          }}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50"
        >
          <RefreshCw className="h-4 w-4" />
          تحديث البيانات
        </button>
      </div>

      {(error || message) && (
        <div className={`rounded-xl border p-4 text-sm font-bold ${error ? 'border-red-100 bg-red-50 text-red-700' : 'border-emerald-100 bg-emerald-50 text-emerald-700'}`}>
          {error || message}
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-slate-100 bg-white p-12 text-center text-sm font-bold text-slate-400">
          جاري تحميل تشغيل الحصص...
        </div>
      ) : (
        <>
          <div className="grid gap-6 xl:grid-cols-[1fr_1.2fr]">
            <section className="space-y-4 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between gap-3">
                <h2 className="flex items-center gap-2 text-lg font-black text-slate-900">
                  <Users className="h-5 w-5 text-emerald-600" />
                  اختيار الجروب والحصة
                </h2>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
                  {groups.length} جروب
                </span>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-2 text-sm font-bold text-slate-700">
                  <span>الجروب</span>
                  <select
                    value={selectedGroupId}
                    onChange={(event) => setSelectedGroupId(event.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold outline-none focus:border-emerald-500"
                  >
                    {groups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-2 text-sm font-bold text-slate-700">
                  <span>تاريخ الحصة</span>
                  <input
                    type="date"
                    value={sessionDate}
                    onChange={(event) => setSessionDate(event.target.value)}
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold outline-none focus:border-emerald-500"
                  />
                </label>
              </div>

              {isManager && (
                <form onSubmit={createSession} className="space-y-3 rounded-xl border border-emerald-100 bg-emerald-50/50 p-4">
                  <label className="space-y-2 text-sm font-bold text-slate-700">
                    <span>عنوان الحصة</span>
                    <input
                      value={sessionTitle}
                      onChange={(event) => setSessionTitle(event.target.value)}
                      placeholder="مثال: حصة مراجعة أو حصة يوم السبت"
                      className="w-full rounded-xl border border-emerald-100 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-emerald-500"
                    />
                  </label>
                  <button
                    type="submit"
                    disabled={saving || !selectedGroupId}
                    className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-black text-white transition hover:bg-emerald-700 disabled:opacity-60"
                  >
                    <Plus className="h-4 w-4" />
                    إنشاء حصة وتجهيز الطلاب
                  </button>
                </form>
              )}

              {isManager && (
                <form onSubmit={assignAssistant} className="space-y-3 rounded-xl border border-slate-100 bg-slate-50 p-4">
                  <h3 className="flex items-center gap-2 text-sm font-black text-slate-800">
                    <ShieldCheck className="h-4 w-4 text-emerald-600" />
                    توزيع مساعد على جروب
                  </h3>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <select
                      value={assignmentAssistantId}
                      onChange={(event) => setAssignmentAssistantId(event.target.value)}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold"
                    >
                      {assistants.map((assistant) => (
                        <option key={assistant.id} value={assistant.id}>
                          {assistant.name}
                        </option>
                      ))}
                    </select>
                    <select
                      value={assignmentGroupId}
                      onChange={(event) => setAssignmentGroupId(event.target.value)}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold"
                    >
                      {groups.map((group) => (
                        <option key={group.id} value={group.id}>
                          {group.name}
                        </option>
                      ))}
                    </select>
                    <select
                      value={assignmentResponsibility}
                      onChange={(event) => setAssignmentResponsibility(event.target.value as Responsibility)}
                      className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold"
                    >
                      {responsibilityOptions.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="submit"
                    disabled={saving || !assignmentAssistantId || !assignmentGroupId}
                    className="w-full rounded-xl bg-slate-900 px-4 py-3 text-sm font-black text-white transition hover:bg-slate-800 disabled:opacity-60"
                  >
                    حفظ التوزيع
                  </button>
                </form>
              )}
            </section>

            <section className="rounded-2xl border border-slate-100 bg-white shadow-sm">
              <div className="flex items-center justify-between border-b border-slate-100 p-5">
                <h2 className="text-lg font-black text-slate-900">حصص اليوم المحدد</h2>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold text-slate-600">
                  {sessions.length} حصة
                </span>
              </div>
              <div className="max-h-[420px] overflow-y-auto p-3">
                {sessions.length === 0 ? (
                  <div className="p-10 text-center text-sm font-bold text-slate-400">
                    لا توجد حصص في هذا اليوم للجروب المحدد.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {sessions.map((session) => (
                      <button
                        key={session.id}
                        type="button"
                        onClick={() => void loadSession(session.id)}
                        className={`w-full rounded-xl border p-4 text-right transition ${
                          selectedSession?.id === session.id
                            ? 'border-emerald-200 bg-emerald-50'
                            : 'border-slate-100 bg-white hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-4">
                          <div>
                            <div className="font-black text-slate-900">{session.title || session.group.name}</div>
                            <div className="mt-1 text-xs font-semibold text-slate-500">
                              {new Date(session.session_date).toLocaleDateString('ar-EG')}
                            </div>
                          </div>
                          <div className="text-left text-xs font-bold text-slate-500">
                            <div>{session._count?.attendance_records || 0} طالب</div>
                            <div>{session._count?.guardian_contact_logs || 0} تواصل</div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </div>

          {isManager && assignments.length > 0 && (
            <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <h2 className="mb-4 text-lg font-black text-slate-900">توزيعات المساعدين الحالية</h2>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {assignments.slice(0, 9).map((assignment) => (
                  <div key={assignment.id} className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                    <div className="font-black text-slate-900">{assignment.assistant.name}</div>
                    <div className="mt-1 text-sm font-bold text-slate-600">{assignment.group.name}</div>
                    <div className="mt-2 inline-flex rounded-full bg-white px-3 py-1 text-xs font-black text-emerald-700">
                      {responsibilityOptions.find((item) => item.value === assignment.responsibility)?.label || assignment.responsibility}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {selectedSession && (
            <section className="space-y-5 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-4 border-b border-slate-100 pb-5 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="text-xl font-black text-slate-900">{selectedSession.title || selectedSession.group.name}</h2>
                  <p className="mt-1 text-sm font-bold text-slate-500">
                    {selectedSession.group.name}، {new Date(selectedSession.session_date).toLocaleDateString('ar-EG')}
                  </p>
                </div>
                <div className="grid grid-cols-5 gap-2 text-center text-xs font-black">
                  <div className="rounded-xl bg-slate-100 px-3 py-2 text-slate-700">الكل<br />{sessionStats.total}</div>
                  <div className="rounded-xl bg-emerald-50 px-3 py-2 text-emerald-700">حاضر<br />{sessionStats.present}</div>
                  <div className="rounded-xl bg-red-50 px-3 py-2 text-red-700">غائب<br />{sessionStats.absent}</div>
                  <div className="rounded-xl bg-amber-50 px-3 py-2 text-amber-700">متأخر<br />{sessionStats.late}</div>
                  <div className="rounded-xl bg-blue-50 px-3 py-2 text-blue-700">تواصل<br />{sessionStats.contacted}</div>
                </div>
              </div>

              <div className="overflow-x-auto rounded-xl border border-slate-100">
                <table className="w-full min-w-[900px] text-right text-sm">
                  <thead className="bg-slate-50 text-xs text-slate-500">
                    <tr>
                      <th className="p-3 font-black">الطالب</th>
                      <th className="p-3 font-black">ولي الأمر</th>
                      <th className="p-3 font-black">الحالة الحالية</th>
                      <th className="p-3 font-black">تسجيل سريع</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(selectedSession.attendance_records || []).map((record) => {
                      const meta = attendanceMeta(record.status);
                      const StatusIcon = meta.icon;
                      return (
                        <tr key={record.id} className="hover:bg-slate-50/60">
                          <td className="p-3">
                            <div className="font-black text-slate-900">{record.student.full_name}</div>
                            <div className="text-xs font-semibold text-slate-500">{record.student.code}</div>
                          </td>
                          <td className="p-3 font-semibold text-slate-600">
                            {record.student.guardian_phone || record.student.student_phone || 'لا يوجد رقم'}
                          </td>
                          <td className="p-3">
                            <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-black ${meta.tone}`}>
                              <StatusIcon className="h-3.5 w-3.5" />
                              {meta.label}
                            </span>
                          </td>
                          <td className="p-3">
                            <div className="flex flex-wrap gap-2">
                              {attendanceOptions.map((option) => (
                                <button
                                  key={option.value}
                                  type="button"
                                  disabled={saving}
                                  onClick={() => void updateAttendance(record, option.value)}
                                  className={`rounded-lg border px-3 py-2 text-xs font-black transition disabled:opacity-60 ${
                                    record.status === option.value
                                      ? option.tone
                                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                                  }`}
                                >
                                  {option.label}
                                </button>
                              ))}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="space-y-3">
                <h3 className="flex items-center gap-2 text-lg font-black text-slate-900">
                  <PhoneCall className="h-5 w-5 text-red-600" />
                  متابعة الغياب مع ولي الأمر
                </h3>
                {absenceRecords.length === 0 ? (
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm font-bold text-emerald-700">
                    لا يوجد طلاب غائبون في هذه الحصة.
                  </div>
                ) : (
                  <div className="grid gap-4 lg:grid-cols-2">
                    {absenceRecords.map((record) => {
                      const latestContact = record.contacts?.[0];
                      const draft = contactDrafts[record.id] || { status: 'CONTACTED', response: '', notes: '' };
                      return (
                        <div key={record.id} className="space-y-3 rounded-xl border border-red-100 bg-red-50/40 p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <div className="font-black text-slate-900">{record.student.full_name}</div>
                              <div className="mt-1 text-xs font-bold text-slate-500">
                                رقم ولي الأمر: {record.student.guardian_phone || 'غير مسجل'}
                              </div>
                            </div>
                            <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-slate-700">
                              {contactStatusLabel(latestContact?.status)}
                            </span>
                          </div>

                          {latestContact?.response && (
                            <div className="rounded-lg bg-white p-3 text-xs font-semibold text-slate-600">
                              آخر رد: {latestContact.response}
                            </div>
                          )}

                          <div className="grid gap-2 sm:grid-cols-[150px_1fr]">
                            <select
                              value={draft.status}
                              onChange={(event) => updateContactDraft(record.id, { status: event.target.value as GuardianContactStatus })}
                              className="rounded-xl border border-red-100 bg-white px-3 py-2 text-sm font-bold"
                            >
                              {contactStatusOptions.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                            <input
                              value={draft.response}
                              onChange={(event) => updateContactDraft(record.id, { response: event.target.value })}
                              placeholder="رد ولي الأمر"
                              className="rounded-xl border border-red-100 bg-white px-3 py-2 text-sm font-semibold"
                            />
                          </div>
                          <textarea
                            value={draft.notes}
                            onChange={(event) => updateContactDraft(record.id, { notes: event.target.value })}
                            placeholder="ملاحظات إضافية"
                            rows={2}
                            className="w-full rounded-xl border border-red-100 bg-white px-3 py-2 text-sm font-semibold"
                          />
                          <button
                            type="button"
                            disabled={saving}
                            onClick={() => void saveGuardianContact(record)}
                            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-3 text-sm font-black text-white transition hover:bg-red-700 disabled:opacity-60"
                          >
                            <PhoneCall className="h-4 w-4" />
                            حفظ نتيجة التواصل
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
