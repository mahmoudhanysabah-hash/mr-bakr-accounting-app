'use client';

import React, { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Edit3,
  LockKeyhole,
  Plus,
  Save,
  Search,
  ShieldCheck,
  UserCog,
  UserCheck,
} from 'lucide-react';
import api from '@/lib/axios';
import { Modal } from '@/components/ui/Modal';

type AccountingRole = 'ADMIN' | 'FINANCE_MANAGER' | 'ACCOUNTANT' | 'ASSISTANT';
type UserStatus = 'ACTIVE' | 'INACTIVE' | 'BANNED';

type AdminUser = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  role: AccountingRole;
  status: UserStatus;
  email_verified: boolean;
  created_at: string;
  updated_at: string;
};

type UserForm = {
  name: string;
  email: string;
  phone: string;
  password: string;
  role: AccountingRole;
  status: UserStatus;
};

const roleOptions: Array<{ value: AccountingRole; label: string; tone: string }> = [
  { value: 'ADMIN', label: 'مدير النظام', tone: 'bg-purple-50 text-purple-800 border-purple-100' },
  { value: 'FINANCE_MANAGER', label: 'مدير مالي', tone: 'bg-blue-50 text-blue-800 border-blue-100' },
  { value: 'ACCOUNTANT', label: 'محاسب', tone: 'bg-emerald-50 text-emerald-800 border-emerald-100' },
  { value: 'ASSISTANT', label: 'مساعد', tone: 'bg-amber-50 text-amber-800 border-amber-100' },
];

const statusOptions: Array<{ value: UserStatus; label: string; tone: string }> = [
  { value: 'ACTIVE', label: 'نشط', tone: 'bg-emerald-50 text-emerald-800 border-emerald-100' },
  { value: 'INACTIVE', label: 'موقوف', tone: 'bg-slate-100 text-slate-700 border-slate-200' },
  { value: 'BANNED', label: 'محظور', tone: 'bg-red-50 text-red-800 border-red-100' },
];

const blankForm: UserForm = {
  name: '',
  email: '',
  phone: '',
  password: '',
  role: 'ACCOUNTANT',
  status: 'ACTIVE',
};

function unwrapData<T>(payload: T | { data: T }): T {
  return 'data' in Object(payload) ? (payload as { data: T }).data : (payload as T);
}

function getErrorMessage(error: unknown, fallback: string) {
  const response = (error as { response?: { data?: { error?: string; message?: string | string[] } } }).response;
  const message = response?.data?.message;
  if (response?.data?.error) return response.data.error;
  if (Array.isArray(message)) return message.join('، ');
  if (message) return message;
  return fallback;
}

function roleMeta(role: AccountingRole) {
  return roleOptions.find((item) => item.value === role) ?? roleOptions[2];
}

function statusMeta(status: UserStatus) {
  return statusOptions.find((item) => item.value === status) ?? statusOptions[1];
}

export default function AdminUsersPage() {
  const router = useRouter();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AdminUser | null>(null);
  const [form, setForm] = useState<UserForm>(blankForm);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get('/admin/users');
      setUsers(unwrapData<AdminUser[]>(response.data));
    } catch (err) {
      setError(getErrorMessage(err, 'فشل جلب المستخدمين'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const userStr = localStorage.getItem('user');
    if (!userStr) {
      router.push('/');
      return;
    }

    try {
      const user = JSON.parse(userStr);
      if (user.role !== 'ADMIN') {
        router.push('/dashboard');
        return;
      }
      setIsAuthorized(true);
      void loadUsers();
    } catch {
      router.push('/');
    }
  }, [loadUsers, router]);

  const filteredUsers = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return users;
    return users.filter((user) =>
      [user.name, user.email, user.phone || '', roleMeta(user.role).label, statusMeta(user.status).label]
        .join(' ')
        .toLowerCase()
        .includes(normalized),
    );
  }, [query, users]);

  const openCreateModal = () => {
    setEditingUser(null);
    setForm(blankForm);
    setError('');
    setIsModalOpen(true);
  };

  const openEditModal = (user: AdminUser) => {
    setEditingUser(user);
    setForm({
      name: user.name,
      email: user.email,
      phone: user.phone || '',
      password: '',
      role: user.role,
      status: user.status,
    });
    setError('');
    setIsModalOpen(true);
  };

  const closeModal = () => {
    if (saving) return;
    setIsModalOpen(false);
    setEditingUser(null);
    setForm(blankForm);
  };

  const updateForm = <K extends keyof UserForm>(key: K, value: UserForm[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');

    const payload: Partial<UserForm> = {
      name: form.name.trim(),
      email: form.email.trim(),
      phone: form.phone.trim(),
      role: form.role,
      status: form.status,
    };
    if (!editingUser || form.password.trim()) {
      payload.password = form.password;
    }

    try {
      if (editingUser) {
        await api.patch(`/admin/users/${editingUser.id}`, payload);
      } else {
        await api.post('/admin/users', payload);
      }
      closeModal();
      await loadUsers();
    } catch (err) {
      setError(getErrorMessage(err, 'تعذر حفظ الحساب'));
    } finally {
      setSaving(false);
    }
  };

  if (!isAuthorized) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-r-2 border-t-2 border-emerald-500" />
      </div>
    );
  }

  return (
    <div className="space-y-6 font-cairo" dir="rtl">
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-100 bg-white p-6 shadow-sm md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900">
            <ShieldCheck className="h-6 w-6 text-emerald-600" />
            مستخدمي النظام
          </h1>
          <p className="mt-1 text-sm font-medium text-slate-500">إدارة حسابات العمل والصلاحيات المالية</p>
        </div>
        <button
          type="button"
          onClick={openCreateModal}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white transition-colors hover:bg-emerald-700"
        >
          <Plus className="h-4 w-4" />
          إضافة حساب
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm font-bold text-red-700">
          {error}
        </div>
      )}

      <div className="rounded-2xl border border-slate-100 bg-white shadow-sm">
        <div className="flex flex-col gap-3 border-b border-slate-100 p-4 md:flex-row md:items-center md:justify-between">
          <div className="relative w-full md:max-w-md">
            <Search className="pointer-events-none absolute right-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="بحث بالاسم أو البريد أو الصلاحية"
              className="w-full rounded-xl border border-slate-200 bg-white py-3 pl-4 pr-12 text-sm font-semibold text-slate-800 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15"
            />
          </div>
          <div className="text-sm font-bold text-slate-500">{filteredUsers.length} حساب</div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-right text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="p-4 font-bold">المستخدم</th>
                <th className="p-4 font-bold">التليفون</th>
                <th className="p-4 font-bold">الصلاحية</th>
                <th className="p-4 font-bold">الحالة</th>
                <th className="p-4 font-bold">تاريخ الإنشاء</th>
                <th className="p-4 font-bold">إجراء</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-sm font-bold text-slate-400">
                    جاري تحميل المستخدمين...
                  </td>
                </tr>
              ) : filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-sm font-bold text-slate-400">
                    لا توجد حسابات مطابقة
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => {
                  const role = roleMeta(user.role);
                  const status = statusMeta(user.status);
                  return (
                    <tr key={user.id} className="transition-colors hover:bg-slate-50/60">
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                            <UserCog className="h-5 w-5" />
                          </div>
                          <div>
                            <div className="font-black text-slate-900">{user.name}</div>
                            <div className="text-xs font-semibold text-slate-500">{user.email}</div>
                          </div>
                        </div>
                      </td>
                      <td className="p-4 font-semibold text-slate-600">{user.phone || '-'}</td>
                      <td className="p-4">
                        <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-black ${role.tone}`}>
                          {role.label}
                        </span>
                      </td>
                      <td className="p-4">
                        <span className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-black ${status.tone}`}>
                          <UserCheck className="h-3.5 w-3.5" />
                          {status.label}
                        </span>
                      </td>
                      <td className="p-4 font-semibold text-slate-500">
                        {new Date(user.created_at).toLocaleDateString('ar-EG')}
                      </td>
                      <td className="p-4">
                        <button
                          type="button"
                          onClick={() => openEditModal(user)}
                          className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 transition hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
                        >
                          <Edit3 className="h-4 w-4" />
                          تعديل
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Modal
        isOpen={isModalOpen}
        onClose={closeModal}
        title={editingUser ? 'تعديل حساب' : 'إضافة حساب'}
        className="max-w-2xl"
      >
        <form className="space-y-5" onSubmit={handleSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm font-bold text-slate-700">
              <span>الاسم</span>
              <input
                required
                value={form.name}
                onChange={(event) => updateForm('name', event.target.value)}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 font-semibold outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15"
              />
            </label>

            <label className="space-y-2 text-sm font-bold text-slate-700">
              <span>البريد الإلكتروني</span>
              <input
                required
                type="email"
                value={form.email}
                onChange={(event) => updateForm('email', event.target.value)}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 font-semibold outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15"
              />
            </label>

            <label className="space-y-2 text-sm font-bold text-slate-700">
              <span>التليفون</span>
              <input
                value={form.phone}
                onChange={(event) => updateForm('phone', event.target.value)}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 font-semibold outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15"
              />
            </label>

            <label className="space-y-2 text-sm font-bold text-slate-700">
              <span>{editingUser ? 'كلمة سر جديدة' : 'كلمة السر'}</span>
              <div className="relative">
                <LockKeyhole className="pointer-events-none absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  required={!editingUser}
                  type="password"
                  minLength={8}
                  value={form.password}
                  onChange={(event) => updateForm('password', event.target.value)}
                  className="w-full rounded-xl border border-slate-200 py-3 pl-4 pr-11 font-semibold outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15"
                />
              </div>
            </label>

            <label className="space-y-2 text-sm font-bold text-slate-700">
              <span>الصلاحية</span>
              <select
                value={form.role}
                onChange={(event) => updateForm('role', event.target.value as AccountingRole)}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 font-semibold outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15"
              >
                {roleOptions.map((role) => (
                  <option key={role.value} value={role.value}>
                    {role.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-2 text-sm font-bold text-slate-700">
              <span>حالة الحساب</span>
              <select
                value={form.status}
                onChange={(event) => updateForm('status', event.target.value as UserStatus)}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 font-semibold outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/15"
              >
                {statusOptions.map((status) => (
                  <option key={status.value} value={status.value}>
                    {status.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="flex flex-col-reverse gap-3 border-t border-slate-100 pt-5 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={closeModal}
              disabled={saving}
              className="rounded-xl border border-slate-200 px-5 py-3 text-sm font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-emerald-700 disabled:opacity-60"
            >
              <Save className="h-4 w-4" />
              {saving ? 'جاري الحفظ...' : 'حفظ الحساب'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
