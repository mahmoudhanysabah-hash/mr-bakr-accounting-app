'use client';

import React, { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import api from '@/lib/axios';
import { getApiErrorMessage } from '@/lib/error';
import { extractAuthUser } from '@/lib/auth';
import LessonSheet from '@/components/teaching/lesson-sheet';
import LessonRosterManagement from '@/components/teaching/lesson-roster-management';
import { cairoDateKey, cairoDateText } from '@/components/teaching/lesson-shared';
import TodayLessonSchedule, { type ScheduledLesson } from '@/components/teaching/today-lesson-schedule';
import {
  CalendarCheck,
  ClipboardCheck,
  PhoneCall,
  Plus,
  RefreshCw,
  FileText,
  Search,
  ShieldCheck,
  UserCheck,
  Users,
} from 'lucide-react';

type Role = 'ADMIN' | 'ACCOUNTANT' | 'FINANCE_MANAGER' | 'ASSISTANT';
type Responsibility = 'ATTENDANCE' | 'GUARDIAN_CONTACT' | 'ACADEMIC_FOLLOW_UP' | 'FULL';

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

type AssistantStudentAssignment = {
  id: string;
  responsibility: Responsibility;
  status: string;
  group: Group;
  assistant: Assistant;
  student: Student;
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
  return cairoDateKey(new Date());
}

function contactStatusLabel(status?: GuardianContactStatus | null) {
  return contactStatusOptions.find((item) => item.value === status)?.label ?? 'لم يتم التواصل';
}

function getErrorMessage(error: unknown, fallback: string) {
  return getApiErrorMessage(error, fallback);
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
  const [sessionTime, setSessionTime] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [contactDrafts, setContactDrafts] = useState<Record<string, ContactDraft>>({});

  const [assignmentAssistantId, setAssignmentAssistantId] = useState('');
  const [assignmentGroupId, setAssignmentGroupId] = useState('');
  const [assignmentResponsibility, setAssignmentResponsibility] = useState<Responsibility>('ATTENDANCE');
  const [groupStudents, setGroupStudents] = useState<Student[]>([]);
  const [studentAssignments, setStudentAssignments] = useState<AssistantStudentAssignment[]>([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [studentAssignmentNotes, setStudentAssignmentNotes] = useState('');
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');
  const [sheetDirty, setSheetDirty] = useState(false);
  const [sheetRefresh, setSheetRefresh] = useState(0);
  const [contactsRefresh, setContactsRefresh] = useState(0);
  const [sheetScroll, setSheetScroll] = useState(0);
  const [absenceState, setAbsenceState] = useState<{ sessionId: string; rows: AttendanceRecord[] } | null>(null);
  const sessionRequests = useRef(0);
  const sheetAnchor = useRef<HTMLDivElement>(null);

  const isManager = userRole ? managerRoles.includes(userRole) : false;
  const canCreateSession = useMemo(() => {
    if (isManager) return true;
    return assignments.some(
      (assignment) =>
        assignment.status === 'ACTIVE' &&
        assignment.group.id === selectedGroupId &&
        (assignment.responsibility === 'ATTENDANCE' || assignment.responsibility === 'FULL'),
    );
  }, [assignments, isManager, selectedGroupId]);

  const loadGroupStudents = useCallback(
    async (groupId = assignmentGroupId, assistantId = assignmentAssistantId) => {
      if (!managerRoles.includes((userRole || 'ACCOUNTANT') as Role) || !groupId) return;
      setLoadingStudents(true);
      setError('');
      try {
        const [studentsResponse, assignmentsResponse] = await Promise.all([
          api.get('/accounting/students', { params: { status: 'ACTIVE', groupId } }),
          api.get('/teaching/assistant-students', {
            params: {
              groupId,
              assistantId: assistantId || undefined,
            },
          }),
        ]);
        setGroupStudents(unwrapData<Student[]>(studentsResponse.data));
        setStudentAssignments(unwrapData<AssistantStudentAssignment[]>(assignmentsResponse.data));
        setSelectedStudentIds([]);
      } catch (err) {
        setError(getErrorMessage(err, 'تعذر تحميل طلبة الجروب'));
      } finally {
        setLoadingStudents(false);
      }
    },
    [assignmentAssistantId, assignmentGroupId, userRole],
  );

  const canLeaveSheet = () => !sheetDirty || window.confirm('فيه تعديلات لسه متحفظتش في الشيت. تسيبها وتكمل؟');
  const focusLesson = useCallback((session: TeachingSession) => {
    sessionRequests.current++;
    setSelectedGroupId(session.group_id);
    setSessionDate(cairoDateKey(new Date(session.session_date)));
    setSelectedSession(session);
    setSessions((current) => current.some((row) => row.id === session.id) ? current : [session]);
    setSheetScroll((value) => value + 1);
  }, []);
  const openScheduledLesson = (lesson: ScheduledLesson) => {
    if (selectedSession?.id === lesson.id) {
      sheetAnchor.current?.scrollIntoView({ block: 'start' });
      return;
    }
    if (!canLeaveSheet()) return;
    focusLesson({ id: lesson.id, title: lesson.title, group_id: lesson.group.id, group: lesson.group, session_date: lesson.date, status: lesson.status });
  };
  const refreshContacts = useCallback(() => setContactsRefresh((value) => value + 1), []);
  const refreshRoster = useCallback(() => {
    setSheetRefresh((value) => value + 1);
    refreshContacts();
  }, [refreshContacts]);

  const loadSessions = useCallback(async () => {
    if (!userRole || !selectedGroupId) return;
    const request = ++sessionRequests.current;
    try {
      const response = await api.get('/teaching/sessions', {
        params: { groupId: selectedGroupId, date: sessionDate || undefined },
      });
      if (request !== sessionRequests.current) return;
      const data = unwrapData<TeachingSession[]>(response.data);
      setSessions(data);
      setSelectedSession((current) => data.find((session) => session.id === current?.id) ?? data[0] ?? null);
    } catch (err) {
      if (request === sessionRequests.current) setError(getErrorMessage(err, 'تعذر تحميل الحصص'));
    }
  }, [selectedGroupId, sessionDate, userRole]);

  const loadBootstrap = useCallback(async (role: Role) => {
    setError('');
    try {
      if (managerRoles.includes(role)) {
        const [groupsResponse, assistantsResponse, assignmentsResponse] = await Promise.all([
          api.get('/accounting/groups'),
          api.get('/teaching/assistants'),
          api.get('/teaching/assistant-groups'),
        ]);
        const loadedGroups = unwrapData<Group[]>(groupsResponse.data).sort((a, b) => Number(b.active !== false) - Number(a.active !== false));
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
          new Map(loadedAssignments.filter((assignment) => assignment.status === 'ACTIVE').map((assignment) => [assignment.group.id, assignment.group])).values(),
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
    let cancelled = false;

    const loadCurrentUser = async () => {
      try {
        const response = await api.get('/auth/me');
        const user = extractAuthUser(response.data);
        if (!user) {
          throw new Error('Unauthorized role');
        }
        if (!cancelled) {
          setUserRole(user.role);
          const requested = new URLSearchParams(window.location.search).get('lesson');
          let openingError = '';
          if (requested && (managerRoles.includes(user.role) || user.role === 'ASSISTANT')) {
            try {
              const lesson = await api.get(`/teaching/sessions/${encodeURIComponent(requested)}`);
              if (!cancelled) focusLesson(unwrapData<TeachingSession>(lesson.data));
            } catch {
              openingError = 'ما قدرناش نفتح الحصة المطلوبة. اختارها من جدول حصص اليوم.';
            }
          }
          if (cancelled) return;
          await loadBootstrap(user.role);
          if (!cancelled && openingError) setError(openingError);
        }
      } catch {
        if (!cancelled) {
          setError('تعذر قراءة بيانات المستخدم الحالي');
          setLoading(false);
        }
      }
    };

    void loadCurrentUser();
    return () => {
      cancelled = true;
    };
  }, [focusLesson, loadBootstrap]);

  useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  useEffect(() => {
    if (isManager && assignmentGroupId) {
      void loadGroupStudents();
    }
  }, [assignmentAssistantId, assignmentGroupId, isManager, loadGroupStudents]);

  const selectedSessionId = selectedSession?.id;
  useEffect(() => {
    if (!loading && selectedSessionId && sheetScroll) sheetAnchor.current?.scrollIntoView({ block: 'start' });
  }, [loading, selectedSessionId, sheetScroll]);

  const canContact = isManager || assignments.some((assignment) =>
    assignment.group.id === selectedSession?.group_id && assignment.status === 'ACTIVE'
    && (assignment.responsibility === 'FULL' || assignment.responsibility === 'GUARDIAN_CONTACT'));
  useEffect(() => {
    if (!selectedSessionId || !canContact) return;
    const controller = new AbortController();
    api.get(`/teaching/sessions/${selectedSessionId}/absences`, { signal: controller.signal })
      .then((response) => {
        if (!controller.signal.aborted) setAbsenceState({ sessionId: selectedSessionId, rows: unwrapData<AttendanceRecord[]>(response.data) });
      })
      .catch((err) => {
        if (!controller.signal.aborted) setError(getErrorMessage(err, 'تعذر تحميل متابعة الغياب'));
      });
    return () => controller.abort();
  }, [selectedSessionId, canContact, contactsRefresh]);

  useEffect(() => {
    if (!sheetDirty) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [sheetDirty]);

  const absenceRecords = absenceState?.sessionId === selectedSessionId ? absenceState?.rows ?? [] : [];

  const assignedStudentIds = useMemo(() => {
    return new Set(
      studentAssignments
        .filter(
          (assignment) =>
            assignment.status === 'ACTIVE' &&
            assignment.responsibility === assignmentResponsibility &&
            assignment.assistant.id === assignmentAssistantId,
        )
        .map((assignment) => assignment.student.id),
    );
  }, [assignmentAssistantId, assignmentResponsibility, studentAssignments]);

  const filteredGroupStudents = useMemo(() => {
    const query = studentSearch.trim().toLowerCase();
    if (!query) return groupStudents;
    return groupStudents.filter((student) => {
      return (
        student.full_name.toLowerCase().includes(query) ||
        student.code.toLowerCase().includes(query) ||
        (student.guardian_phone || '').includes(query) ||
        (student.student_phone || '').includes(query)
      );
    });
  }, [groupStudents, studentSearch]);

  const createSession = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedGroupId || !sessionDate || !canLeaveSheet()) return;
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const response = await api.post('/teaching/sessions', {
        groupId: selectedGroupId,
        title: sessionTitle.trim() || undefined,
        sessionDate: new Date(sessionDate).toISOString(),
        startTime: sessionTime || undefined,
      });
      const created = unwrapData<TeachingSession>(response.data);
      setSelectedSession(created);
      setSessionTitle('');
      setSessionTime('');
      setMessage('تم إنشاء الحصة وتجهيز قائمة الطلاب');
      refreshContacts();
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

  const toggleStudentSelection = (studentId: string) => {
    setSelectedStudentIds((current) =>
      current.includes(studentId)
        ? current.filter((id) => id !== studentId)
        : [...current, studentId],
    );
  };

  const assignSelectedStudents = async () => {
    if (!assignmentAssistantId || !assignmentGroupId) return;
    if (selectedStudentIds.length === 0) {
      setError('اختار طالب واحد على الأقل قبل حفظ التوزيع');
      setMessage('');
      return;
    }
    setSaving(true);
    setError('');
    setMessage('');
    try {
      await api.post('/teaching/assistant-students/bulk', {
        assistantId: assignmentAssistantId,
        groupId: assignmentGroupId,
        responsibility: assignmentResponsibility,
        studentIds: selectedStudentIds,
        notes: studentAssignmentNotes.trim() || undefined,
      });
      const assignmentsResponse = await api.get('/teaching/assistant-groups');
      setAssignments(unwrapData<AssistantGroupAssignment[]>(assignmentsResponse.data));
      await loadGroupStudents(assignmentGroupId, assignmentAssistantId);
      setStudentAssignmentNotes('');
      setMessage(`تم ربط ${selectedStudentIds.length.toLocaleString('ar-EG')} طالب بالمساعد`);
    } catch (err) {
      setError(getErrorMessage(err, 'تعذر ربط الطلبة بالمساعد'));
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
      refreshContacts();
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
            افتح حصة الجروب وسجّل الحضور والدرجات والملاحظات في شيت واحد.
          </p>
        </div>
        <Link
          href="/sessions/reports"
          onClick={(event) => { if (!canLeaveSheet()) event.preventDefault(); }}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-black text-white transition hover:bg-blue-700"
        >
          <FileText className="h-4 w-4" />
          تقارير الطلاب
        </Link>
        <button
          type="button"
          onClick={() => {
            if (!userRole || !canLeaveSheet()) return;
            void loadBootstrap(userRole);
            void loadSessions();
            refreshRoster();
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
                    onChange={(event) => {
                      if (!canLeaveSheet()) return;
                      sessionRequests.current++;
                      setSessions([]);
                      setSelectedSession(null);
                      setSelectedGroupId(event.target.value);
                    }}
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
                    onChange={(event) => {
                      if (!canLeaveSheet()) return;
                      sessionRequests.current++;
                      setSessions([]);
                      setSelectedSession(null);
                      setSessionDate(event.target.value);
                    }}
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold outline-none focus:border-emerald-500"
                  />
                </label>
              </div>

              {isManager && selectedGroupId && (
                <LessonRosterManagement key={selectedGroupId} groupId={selectedGroupId} dirty={sheetDirty} onSaved={refreshRoster} />
              )}

              {canCreateSession && (
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
                  <label className="block space-y-2 text-sm font-bold text-slate-700">
                    <span>ميعاد الحصة بتوقيت القاهرة <span className="text-xs font-semibold text-slate-500">(اختياري)</span></span>
                    <input type="time" value={sessionTime} onChange={(event) => setSessionTime(event.target.value)}
                      className="w-full rounded-xl border border-emerald-100 bg-white px-4 py-3 text-sm font-semibold outline-none focus:border-emerald-500" />
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
                        onClick={() => { if (selectedSession?.id !== session.id && canLeaveSheet()) setSelectedSession(session); }}
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
                              {cairoDateText(session.session_date)}
                            </div>
                          </div>
                          {session.status === 'CANCELLED' && <span className="text-xs font-bold text-red-700">حصة ملغية</span>}
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </div>

          {selectedSession && (
            <div ref={sheetAnchor} className="min-w-0 scroll-mt-4">
              <LessonSheet key={`${selectedSession.id}:${sheetRefresh}`} sessionId={selectedSession.id} onSaved={refreshContacts} onDirtyChange={setSheetDirty} />
            </div>
          )}

          {selectedSession && canContact && selectedSession.status !== 'CANCELLED' && (
            <section className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <div className="space-y-3">
                <h3 className="flex items-center gap-2 text-lg font-black text-slate-900">
                  <PhoneCall className="h-5 w-5 text-red-600" />
                  متابعة الغياب مع ولي الأمر
                </h3>
                {absenceState?.sessionId !== selectedSession.id ? (
                  <p className="text-sm font-bold text-slate-500">جاري تحميل متابعة الغياب…</p>
                ) : absenceRecords.length === 0 ? (
                  <div className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 text-sm font-bold text-emerald-700">
                    مفيش غياب أو اعتذار متسجّل للطلبة اللي بتتابعهم في الحصة دي.
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

          {(isManager || userRole === 'ASSISTANT') && <TodayLessonSchedule activeId={selectedSessionId} onOpen={openScheduledLesson} refreshKey={contactsRefresh} />}

          {isManager && (
            <section className="space-y-4 rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <h2 className="flex items-center gap-2 text-lg font-black text-slate-900">
                    <UserCheck className="h-5 w-5 text-emerald-600" />
                    توزيع الطلبة على المساعد
                  </h2>
                  <p className="mt-1 text-sm font-semibold text-slate-500">
                    {groupStudents.length.toLocaleString('ar-EG')} طالب في الجروب المحدد
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedStudentIds(filteredGroupStudents.map((student) => student.id))}
                    disabled={loadingStudents || filteredGroupStudents.length === 0}
                    className="rounded-xl border border-emerald-100 bg-emerald-50 px-4 py-2 text-xs font-black text-emerald-700 transition hover:bg-emerald-100 disabled:opacity-60"
                  >
                    تحديد الظاهر
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedStudentIds([])}
                    disabled={selectedStudentIds.length === 0}
                    className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-black text-slate-600 transition hover:bg-slate-50 disabled:opacity-60"
                  >
                    إلغاء التحديد
                  </button>
                </div>
              </div>

              <div className="grid gap-3 lg:grid-cols-[1fr_1.4fr]">
                <label className="space-y-2 text-sm font-bold text-slate-700">
                  <span>بحث في الطلبة</span>
                  <div className="relative">
                    <Search className="pointer-events-none absolute right-3 top-3.5 h-4 w-4 text-slate-400" />
                    <input
                      value={studentSearch}
                      onChange={(event) => setStudentSearch(event.target.value)}
                      placeholder="اسم الطالب أو الكود أو رقم الهاتف"
                      className="w-full rounded-xl border border-slate-200 px-10 py-3 text-sm font-semibold outline-none focus:border-emerald-500"
                    />
                  </div>
                </label>
                <label className="space-y-2 text-sm font-bold text-slate-700">
                  <span>ملاحظات التوزيع</span>
                  <input
                    value={studentAssignmentNotes}
                    onChange={(event) => setStudentAssignmentNotes(event.target.value)}
                    placeholder="مثال: يتابع الواجب فقط أو يتابع الغياب لهذا الشهر"
                    className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold outline-none focus:border-emerald-500"
                  />
                </label>
              </div>

              <div className="max-h-80 overflow-y-auto rounded-xl border border-slate-100">
                {loadingStudents ? (
                  <div className="p-8 text-center text-sm font-bold text-slate-400">جاري تحميل طلبة الجروب...</div>
                ) : filteredGroupStudents.length === 0 ? (
                  <div className="p-8 text-center text-sm font-bold text-slate-400">لا يوجد طلبة مطابقون للاختيار الحالي.</div>
                ) : (
                  <div className="grid gap-2 p-3 md:grid-cols-2 xl:grid-cols-3">
                    {filteredGroupStudents.map((student) => {
                      const selected = selectedStudentIds.includes(student.id);
                      const alreadyAssigned = assignedStudentIds.has(student.id);
                      return (
                        <button
                          key={student.id}
                          type="button"
                          onClick={() => toggleStudentSelection(student.id)}
                          className={`rounded-xl border p-3 text-right transition ${
                            selected ? 'border-emerald-200 bg-emerald-50' : 'border-slate-100 bg-white hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              checked={selected}
                              readOnly
                              className="mt-1 h-4 w-4 rounded border-slate-300 text-emerald-600"
                            />
                            <div className="min-w-0 flex-1">
                              <div className="truncate font-black text-slate-900">{student.full_name}</div>
                              <div className="mt-1 text-xs font-semibold text-slate-500">{student.code}</div>
                              <div className="mt-2 inline-flex rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-600">
                                {alreadyAssigned ? 'مسجل للمساعد' : 'غير مسجل'}
                              </div>
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={() => void assignSelectedStudents()}
                disabled={saving || !assignmentAssistantId || !assignmentGroupId || selectedStudentIds.length === 0}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-black text-white transition hover:bg-emerald-700 disabled:opacity-60"
              >
                <ClipboardCheck className="h-4 w-4" />
                حفظ توزيع الطلبة المحددين
              </button>
            </section>
          )}

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


        </>
      )}
    </div>
  );
}
