'use client';

import React, { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import api from '@/lib/axios';
import {
  BookOpenCheck,
  CalendarCheck,
  CheckCircle2,
  ClipboardCheck,
  Clock3,
  MessageSquareText,
  PhoneCall,
  Plus,
  RefreshCw,
  Save,
  Search,
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
type AcademicActivityType = 'HOMEWORK' | 'CLASSWORK' | 'QUIZ' | 'EXAM' | 'OTHER';
type AcademicImprovementStatus = 'IMPROVED' | 'NOT_IMPROVED' | 'NEEDS_MORE_WORK' | 'NOT_ASSESSED';

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

type AcademicFollowUp = {
  id: string;
  student_id: string;
  entry_date: string;
  activity_type: AcademicActivityType;
  score?: number | null;
  max_score?: number | null;
  question_type?: string | null;
  error_type?: string | null;
  error_reason?: string | null;
  correction?: string | null;
  assistant_action?: string | null;
  result?: AcademicImprovementStatus | null;
  notes?: string | null;
  student: Student;
  assistant?: Assistant | null;
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
  academic_follow_ups?: AcademicFollowUp[];
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

type FollowUpDraft = {
  studentId: string;
  activityType: AcademicActivityType;
  score: string;
  maxScore: string;
  questionType: string;
  errorType: string;
  errorReason: string;
  correction: string;
  assistantAction: string;
  result: AcademicImprovementStatus;
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

const activityOptions: Array<{ value: AcademicActivityType; label: string }> = [
  { value: 'HOMEWORK', label: 'واجب' },
  { value: 'CLASSWORK', label: 'تطبيق داخل الحصة' },
  { value: 'QUIZ', label: 'اختبار قصير' },
  { value: 'EXAM', label: 'امتحان' },
  { value: 'OTHER', label: 'متابعة أخرى' },
];

const improvementOptions: Array<{ value: AcademicImprovementStatus; label: string }> = [
  { value: 'NOT_ASSESSED', label: 'لم يتم التقييم' },
  { value: 'IMPROVED', label: 'تحسن' },
  { value: 'NOT_IMPROVED', label: 'لم يتحسن' },
  { value: 'NEEDS_MORE_WORK', label: 'يحتاج شغل أكثر' },
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

function activityLabel(activity?: AcademicActivityType | null) {
  return activityOptions.find((item) => item.value === activity)?.label ?? 'متابعة';
}

function improvementLabel(result?: AcademicImprovementStatus | null) {
  return improvementOptions.find((item) => item.value === result)?.label ?? 'لم يتم التقييم';
}

function optionalNumber(value: string) {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
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
  const [groupStudents, setGroupStudents] = useState<Student[]>([]);
  const [studentAssignments, setStudentAssignments] = useState<AssistantStudentAssignment[]>([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [studentAssignmentNotes, setStudentAssignmentNotes] = useState('');
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');
  const [followUpDraft, setFollowUpDraft] = useState<FollowUpDraft>({
    studentId: '',
    activityType: 'HOMEWORK',
    score: '',
    maxScore: '',
    questionType: '',
    errorType: '',
    errorReason: '',
    correction: '',
    assistantAction: '',
    result: 'NOT_ASSESSED',
    notes: '',
  });

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

  useEffect(() => {
    if (isManager && assignmentGroupId) {
      void loadGroupStudents();
    }
  }, [assignmentAssistantId, assignmentGroupId, isManager, loadGroupStudents]);

  useEffect(() => {
    const firstStudentId = selectedSession?.attendance_records?.[0]?.student_id || '';
    if (firstStudentId) {
      setFollowUpDraft((current) => (current.studentId ? current : { ...current, studentId: firstStudentId }));
    }
  }, [selectedSession?.id, selectedSession?.attendance_records]);

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

  const sessionStudents = useMemo(() => {
    const records = selectedSession?.attendance_records || [];
    return records.map((record) => record.student);
  }, [selectedSession]);

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

  const updateFollowUpDraft = (patch: Partial<FollowUpDraft>) => {
    setFollowUpDraft((current) => ({ ...current, ...patch }));
  };

  const saveAcademicFollowUp = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedSession || !followUpDraft.studentId) return;

    const score = optionalNumber(followUpDraft.score);
    const maxScore = optionalNumber(followUpDraft.maxScore);
    if ((followUpDraft.score.trim() && score === undefined) || (followUpDraft.maxScore.trim() && maxScore === undefined)) {
      setError('درجة الطالب أو الدرجة النهائية غير صحيحة');
      setMessage('');
      return;
    }

    setSaving(true);
    setError('');
    setMessage('');
    try {
      await api.post('/teaching/academic-follow-ups', {
        sessionId: selectedSession.id,
        studentId: followUpDraft.studentId,
        entryDate: new Date().toISOString(),
        activityType: followUpDraft.activityType,
        score,
        maxScore,
        questionType: followUpDraft.questionType.trim() || undefined,
        errorType: followUpDraft.errorType.trim() || undefined,
        errorReason: followUpDraft.errorReason.trim() || undefined,
        correction: followUpDraft.correction.trim() || undefined,
        assistantAction: followUpDraft.assistantAction.trim() || undefined,
        result: followUpDraft.result,
        notes: followUpDraft.notes.trim() || undefined,
      });
      await loadSession(selectedSession.id);
      setFollowUpDraft((current) => ({
        ...current,
        score: '',
        maxScore: '',
        questionType: '',
        errorType: '',
        errorReason: '',
        correction: '',
        assistantAction: '',
        result: 'NOT_ASSESSED',
        notes: '',
      }));
      setMessage('تم حفظ المتابعة الدراسية للطالب');
    } catch (err) {
      setError(getErrorMessage(err, 'تعذر حفظ المتابعة الدراسية'));
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

              <div className="space-y-4 rounded-xl border border-blue-100 bg-blue-50/30 p-4">
                <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                  <h3 className="flex items-center gap-2 text-lg font-black text-slate-900">
                    <BookOpenCheck className="h-5 w-5 text-blue-600" />
                    المتابعة الدراسية والتصحيح
                  </h3>
                  <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-blue-700">
                    {(selectedSession.academic_follow_ups || []).length.toLocaleString('ar-EG')} متابعة
                  </span>
                </div>

                {sessionStudents.length === 0 ? (
                  <div className="rounded-xl border border-slate-100 bg-white p-4 text-sm font-bold text-slate-400">
                    لا يوجد طلبة داخل هذه الحصة.
                  </div>
                ) : (
                  <form onSubmit={saveAcademicFollowUp} className="space-y-3">
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                      <label className="space-y-2 text-sm font-bold text-slate-700">
                        <span>الطالب</span>
                        <select
                          value={followUpDraft.studentId}
                          onChange={(event) => updateFollowUpDraft({ studentId: event.target.value })}
                          className="w-full rounded-xl border border-blue-100 bg-white px-3 py-3 text-sm font-semibold outline-none focus:border-blue-500"
                        >
                          {sessionStudents.map((student) => (
                            <option key={student.id} value={student.id}>
                              {student.full_name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="space-y-2 text-sm font-bold text-slate-700">
                        <span>نوع المتابعة</span>
                        <select
                          value={followUpDraft.activityType}
                          onChange={(event) => updateFollowUpDraft({ activityType: event.target.value as AcademicActivityType })}
                          className="w-full rounded-xl border border-blue-100 bg-white px-3 py-3 text-sm font-semibold outline-none focus:border-blue-500"
                        >
                          {activityOptions.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="space-y-2 text-sm font-bold text-slate-700">
                        <span>درجة الطالب</span>
                        <input
                          type="number"
                          min="0"
                          value={followUpDraft.score}
                          onChange={(event) => updateFollowUpDraft({ score: event.target.value })}
                          className="w-full rounded-xl border border-blue-100 bg-white px-3 py-3 text-sm font-semibold outline-none focus:border-blue-500"
                        />
                      </label>
                      <label className="space-y-2 text-sm font-bold text-slate-700">
                        <span>الدرجة النهائية</span>
                        <input
                          type="number"
                          min="0"
                          value={followUpDraft.maxScore}
                          onChange={(event) => updateFollowUpDraft({ maxScore: event.target.value })}
                          className="w-full rounded-xl border border-blue-100 bg-white px-3 py-3 text-sm font-semibold outline-none focus:border-blue-500"
                        />
                      </label>
                    </div>

                    <div className="grid gap-3 md:grid-cols-3">
                      <input
                        value={followUpDraft.questionType}
                        onChange={(event) => updateFollowUpDraft({ questionType: event.target.value })}
                        placeholder="نوع السؤال"
                        className="rounded-xl border border-blue-100 bg-white px-3 py-3 text-sm font-semibold outline-none focus:border-blue-500"
                      />
                      <input
                        value={followUpDraft.errorType}
                        onChange={(event) => updateFollowUpDraft({ errorType: event.target.value })}
                        placeholder="نوع الغلط"
                        className="rounded-xl border border-blue-100 bg-white px-3 py-3 text-sm font-semibold outline-none focus:border-blue-500"
                      />
                      <select
                        value={followUpDraft.result}
                        onChange={(event) => updateFollowUpDraft({ result: event.target.value as AcademicImprovementStatus })}
                        className="rounded-xl border border-blue-100 bg-white px-3 py-3 text-sm font-semibold outline-none focus:border-blue-500"
                      >
                        {improvementOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="grid gap-3 lg:grid-cols-3">
                      <textarea
                        value={followUpDraft.errorReason}
                        onChange={(event) => updateFollowUpDraft({ errorReason: event.target.value })}
                        placeholder="سبب الغلط"
                        rows={3}
                        className="rounded-xl border border-blue-100 bg-white px-3 py-3 text-sm font-semibold outline-none focus:border-blue-500"
                      />
                      <textarea
                        value={followUpDraft.correction}
                        onChange={(event) => updateFollowUpDraft({ correction: event.target.value })}
                        placeholder="التصحيح المطلوب"
                        rows={3}
                        className="rounded-xl border border-blue-100 bg-white px-3 py-3 text-sm font-semibold outline-none focus:border-blue-500"
                      />
                      <textarea
                        value={followUpDraft.assistantAction}
                        onChange={(event) => updateFollowUpDraft({ assistantAction: event.target.value })}
                        placeholder="إجراء المساعد"
                        rows={3}
                        className="rounded-xl border border-blue-100 bg-white px-3 py-3 text-sm font-semibold outline-none focus:border-blue-500"
                      />
                    </div>

                    <textarea
                      value={followUpDraft.notes}
                      onChange={(event) => updateFollowUpDraft({ notes: event.target.value })}
                      placeholder="ملاحظات إضافية"
                      rows={2}
                      className="w-full rounded-xl border border-blue-100 bg-white px-3 py-3 text-sm font-semibold outline-none focus:border-blue-500"
                    />

                    <button
                      type="submit"
                      disabled={saving || !followUpDraft.studentId}
                      className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-3 text-sm font-black text-white transition hover:bg-blue-700 disabled:opacity-60"
                    >
                      <Save className="h-4 w-4" />
                      حفظ المتابعة الدراسية
                    </button>
                  </form>
                )}

                {(selectedSession.academic_follow_ups || []).length > 0 && (
                  <div className="grid gap-3 md:grid-cols-2">
                    {(selectedSession.academic_follow_ups || []).slice(0, 6).map((entry) => (
                      <div key={entry.id} className="rounded-xl border border-blue-100 bg-white p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <div className="font-black text-slate-900">{entry.student.full_name}</div>
                            <div className="mt-1 text-xs font-bold text-slate-500">
                              {activityLabel(entry.activity_type)}، {new Date(entry.entry_date).toLocaleDateString('ar-EG')}
                            </div>
                          </div>
                          <span className="rounded-full bg-blue-50 px-3 py-1 text-xs font-black text-blue-700">
                            {improvementLabel(entry.result)}
                          </span>
                        </div>
                        {(entry.score != null || entry.max_score != null) && (
                          <div className="mt-3 text-sm font-black text-slate-700">
                            الدرجة: {entry.score ?? '-'} / {entry.max_score ?? '-'}
                          </div>
                        )}
                        {(entry.error_type || entry.correction || entry.assistant_action) && (
                          <div className="mt-3 space-y-1 text-xs font-semibold text-slate-600">
                            {entry.error_type && <div>نوع الغلط: {entry.error_type}</div>}
                            {entry.correction && <div>التصحيح: {entry.correction}</div>}
                            {entry.assistant_action && <div>إجراء المساعد: {entry.assistant_action}</div>}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
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
