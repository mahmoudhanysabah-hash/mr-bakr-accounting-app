'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import api from '@/lib/axios';
import { 
  ArrowRight, 
  Wallet, 
  CreditCard, 
  TrendingUp, 
  FileText, 
  Plus, 
  LogOut,
  Calendar,
  AlertCircle,
  CheckCircle,
  FileDown,
  Printer,
  ArrowLeftRight,
  Pencil
} from 'lucide-react';
import { motion } from 'framer-motion';

export default function StudentDetailsPage({ params }: { params: Promise<{ id: string }> }) {
  const router = useRouter();
  const unwrappedParams = React.use(params);
  const { id } = unwrappedParams;

  const [student, setStudent] = useState<any>(null);
  const [groups, setGroups] = useState<any[]>([]);
  const [periods, setPeriods] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<'payments' | 'charges' | 'enrollments' | 'discounts_refunds'>('payments');

  // Modal States
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showRefundModal, setShowRefundModal] = useState(false);
  const [showDiscountModal, setShowDiscountModal] = useState(false);
  const [showEnrollModal, setShowEnrollModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showChargeModal, setShowChargeModal] = useState(false);

  // Form Fields: Edit Student
  const [editFullName, setEditFullName] = useState('');
  const [editStudentPhone, setEditStudentPhone] = useState('');
  const [editGuardianName, setEditGuardianName] = useState('');
  const [editGuardianPhone, setEditGuardianPhone] = useState('');
  const [editStatus, setEditStatus] = useState('ACTIVE');

  // Form Fields: Transfer
  const [transferEnrollmentId, setTransferEnrollmentId] = useState('');
  const [transferGroupId, setTransferGroupId] = useState('');
  const [transferDate, setTransferDate] = useState(new Date().toISOString().split('T')[0]);
  const [transferReason, setTransferReason] = useState('');

  // Form Fields: Payment
  const [editPaymentId, setEditPaymentId] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('CASH');
  const [paymentRef, setPaymentRef] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);

  // Form Fields: Refund
  const [refundAmount, setRefundAmount] = useState('');
  const [refundMethod, setRefundMethod] = useState('CASH');
  const [refundRef, setRefundRef] = useState('');
  const [refundReason, setRefundReason] = useState('');
  const [refundDate, setRefundDate] = useState(new Date().toISOString().split('T')[0]);

  // Form Fields: Discount
  const [discountAmount, setDiscountAmount] = useState('');
  const [discountGroup, setDiscountGroup] = useState('');
  const [discountPeriod, setDiscountPeriod] = useState('');
  const [discountReason, setDiscountReason] = useState('');

  // Form Fields: Enroll
  const [enrollGroup, setEnrollGroup] = useState('');
  const [enrollPrice, setEnrollPrice] = useState('300');
  const [enrollSessions, setEnrollSessions] = useState('8');
  const [enrollDate, setEnrollDate] = useState(new Date().toISOString().split('T')[0]);

  // Form Fields: Manual charge for a late enrollment
  const [chargeEnrollmentId, setChargeEnrollmentId] = useState('');
  const [chargePeriodId, setChargePeriodId] = useState('');
  const [chargeSessions, setChargeSessions] = useState('8');
  const [chargePrice, setChargePrice] = useState('250');
  const [chargeNotes, setChargeNotes] = useState('');

  const [dialogLoading, setDialogLoading] = useState(false);
  const [dialogError, setDialogError] = useState('');

  const loadStudentData = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const res = await api.get(`/accounting/students/${id}`);
      setStudent(res.data?.data || res.data);
    } catch (err: any) {
      console.error(err);
      setError('تعذر تحميل بيانات حساب الطالب.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) {
      loadStudentData();
      // Fetch groups and billing periods for dropdowns
      api.get('/accounting/groups').then(res => setGroups(res.data?.data || []));
      api.get('/accounting/periods').then(res => setPeriods(res.data?.data || []));
    }
  }, [id, loadStudentData]);

  // Handle Form: Payment
  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    setDialogLoading(true);
    setDialogError('');

    try {
      let targetPaymentId = editPaymentId;

      if (editPaymentId) {
        await api.patch(`/accounting/payments/${editPaymentId}`, {
          amount: Number(paymentAmount),
          method: paymentMethod,
          paidAt: new Date(paymentDate).toISOString(),
          externalReference: paymentRef,
          notes: paymentNotes,
        });
      } else {
        const payRes = await api.post('/accounting/payments', {
          studentId: id,
          amount: Number(paymentAmount),
          method: paymentMethod,
          paidAt: new Date(paymentDate).toISOString(),
          externalReference: paymentRef,
          notes: paymentNotes,
        });
        targetPaymentId = payRes.data?.data?.payment?.id || payRes.data?.payment?.id || payRes.data?.data?.id || payRes.data?.id;
      }

      if (targetPaymentId && receiptFile) {
        const formData = new FormData();
        formData.append('file', receiptFile);
        await api.post(`/accounting/payments/${targetPaymentId}/receipt`, formData, {
          headers: { 'Content-Type': 'multipart/form-data' }
        });
      }

      setShowPaymentModal(false);
      setPaymentAmount('');
      setPaymentRef('');
      setPaymentNotes('');
      setEditPaymentId('');
      loadStudentData();
    } catch (err: any) {
      setDialogError(err.response?.data?.message || 'حدث خطأ أثناء تسجيل/تعديل الدفعة');
    } finally {
      setDialogLoading(false);
    }
  };

  // Handle Form: Transfer
  const handleTransferSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setDialogLoading(true);
    setDialogError('');

    try {
      await api.post('/accounting/enrollments/transfer', {
        enrollmentId: transferEnrollmentId,
        toGroupId: transferGroupId,
        effectiveAt: new Date(transferDate).toISOString(),
        reason: transferReason
      });

      setShowTransferModal(false);
      setTransferGroupId('');
      setTransferReason('');
      loadStudentData();
    } catch (err: any) {
      setDialogError(err.response?.data?.message || 'فشل نقل الطالب للمجموعة الأخرى.');
    } finally {
      setDialogLoading(false);
    }
  };

  // Handle Form: Record Refund
  const handleRecordRefund = async (e: React.FormEvent) => {
    e.preventDefault();
    setDialogLoading(true);
    setDialogError('');

    try {
      await api.post('/accounting/refunds', {
        studentId: id,
        amount: Number(refundAmount),
        method: refundMethod,
        reason: refundReason,
        refundedAt: new Date(refundDate).toISOString()
      });

      setShowRefundModal(false);
      setRefundAmount('');
      setRefundReason('');
      setRefundRef('');
      loadStudentData();
    } catch (err: any) {
      setDialogError(err.response?.data?.error || 'فشل تسجيل الارتجاع المالي.');
    } finally {
      setDialogLoading(false);
    }
  };

  // Handle Form: Grant Discount
  const handleGrantDiscount = async (e: React.FormEvent) => {
    e.preventDefault();
    setDialogLoading(true);
    setDialogError('');

    try {
      await api.post('/accounting/discounts', {
        studentId: id,
        amount: Number(discountAmount),
        groupId: discountGroup,
        periodId: discountPeriod,
        reason: discountReason
      });

      setShowDiscountModal(false);
      setDiscountAmount('');
      setDiscountGroup('');
      setDiscountPeriod('');
      setDiscountReason('');
      loadStudentData();
    } catch (err: any) {
      setDialogError(err.response?.data?.error || 'فشل تطبيق الخصم.');
    } finally {
      setDialogLoading(false);
    }
  };

  // Handle Form: Enroll in Group
  const handleEnrollGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    setDialogLoading(true);
    setDialogError('');

    try {
      await api.post('/accounting/enrollments', {
        studentId: id,
        groupId: enrollGroup,
        startsAt: new Date(enrollDate).toISOString(),
        customSessionPrice: enrollPrice ? Number(enrollPrice) : undefined,
        customSessionsPerMonth: enrollSessions ? Number(enrollSessions) : undefined
      });

      setShowEnrollModal(false);
      setEnrollGroup('');
      loadStudentData();
    } catch (err: any) {
      setDialogError(err.response?.data?.error || 'فشل تسجيل الاشتراك بالمجموعة.');
    } finally {
      setDialogLoading(false);
    }
  };

  const openChargeModal = (enrollment: any) => {
    const openPeriod = periods.find((period: any) => period.status === 'OPEN');
    setChargeEnrollmentId(enrollment.id);
    setChargePeriodId(openPeriod?.id || '');
    setChargeSessions(String(enrollment.custom_sessions_per_month || enrollment.group?.default_sessions_per_month || 8));
    setChargePrice(String(enrollment.custom_session_price || enrollment.group?.default_session_price || 250));
    setChargeNotes('');
    setDialogError('');
    setShowChargeModal(true);
  };

  const handleCreateCharge = async (e: React.FormEvent) => {
    e.preventDefault();
    setDialogLoading(true);
    setDialogError('');

    try {
      await api.post('/accounting/charges/from-enrollment', {
        periodId: chargePeriodId,
        enrollmentId: chargeEnrollmentId,
        sessionsCount: Number(chargeSessions),
        sessionPrice: Number(chargePrice),
        notes: chargeNotes || undefined,
      });

      setShowChargeModal(false);
      loadStudentData();
    } catch (err: any) {
      setDialogError(err.response?.data?.message || err.response?.data?.error || 'تعذر إضافة مطالبة للشهر المفتوح');
    } finally {
      setDialogLoading(false);
    }
  };

  // Handle Form: Edit Student
  const handleEditStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    setDialogLoading(true);
    setDialogError('');

    try {
      await api.patch(`/accounting/students/${id}`, {
        fullName: editFullName,
        studentPhone: editStudentPhone,
        guardianName: editGuardianName,
        guardianPhone: editGuardianPhone,
        status: editStatus,
      });

      setShowEditModal(false);
      loadStudentData();
    } catch (err: any) {
      setDialogError(err.response?.data?.message || 'حدث خطأ أثناء الحفظ');
    } finally {
      setDialogLoading(false);
    }
  };

  const handleDeleteReceipt = async (_storageKey: string) => {
    alert('لا يمكن حذف الإيصالات بعد رفعها. لعلاج خطأ مالي، استخدم عكس الدفعة المرتبطة بالإيصال.');
  };

  const handleDeletePayment = async (paymentId: string) => {
    if (!confirm('هل أنت متأكد من عكس هذه الدفعة والتراجع عن أثرها على الفواتير والرصيد؟ سيظل سجل الدفعة والإيصالات محفوظاً.')) return;
    try {
      await api.delete(`/accounting/payments/${paymentId}`);
      loadStudentData();
    } catch (err: any) {
      alert(err.response?.data?.message || 'حدث خطأ أثناء عكس الدفعة');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[70vh]" dir="rtl">
        <div className="text-center space-y-4">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-emerald-500 border-r-2 mx-auto"></div>
          <p className="text-slate-500 font-bold">جاري تحميل كشف الحساب المالي للطالب...</p>
        </div>
      </div>
    );
  }

  if (error || !student) {
    return (
      <div className="text-center py-20 font-cairo space-y-6" dir="rtl">
        <div className="text-red-500 text-6xl">⚠️</div>
        <p className="text-lg font-bold text-slate-800">{error || 'حدث خطأ في تحميل البيانات'}</p>
        <button onClick={() => router.push('/students')} className="bg-emerald-600 text-white px-6 py-3 rounded-xl font-bold">العودة لشؤون الطلاب</button>
      </div>
    );
  }

  // Aggregate outstanding due charges
  let totalDues = 0;
  student.charges?.forEach((c: any) => {
    if (c.status === 'DUE' || c.status === 'PARTIALLY_PAID') {
      const allocated = c.allocations?.reduce((sum: number, a: any) => sum + Number(a.amount || 0), 0) || 0;
      totalDues += Math.max(0, Number(c.net_amount || 0) - allocated);
    }
  });

  // Aggregate paid payments
  let totalPaid = 0;
  student.payments?.forEach((p: any) => {
    if (p.status === 'APPROVED') {
      totalPaid += Number(p.amount || 0);
    }
  });

  return (
    <div className="space-y-8 font-cairo" dir="rtl">
      {/* Top Breadcrumb & Action Header */}
      <div className="flex justify-between items-center bg-white p-6 rounded-2xl border border-slate-100 shadow-sm">
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/students')} className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl cursor-pointer">
            <ArrowRight className="w-5 h-5" />
          </button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-slate-800">{student.full_name}</h1>
              <button 
                onClick={() => {
                  setEditFullName(student.full_name || '');
                  setEditStudentPhone(student.student_phone || '');
                  setEditGuardianName(student.guardian_name || '');
                  setEditGuardianPhone(student.guardian_phone || '');
                  setEditStatus(student.status || 'ACTIVE');
                  setShowEditModal(true);
                }}
                className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-lg cursor-pointer transition-colors"
                title="تعديل بيانات الطالب"
              >
                <Pencil className="w-4 h-4" />
              </button>
            </div>
            <p className="text-slate-500 text-sm mt-0.5">كود الحساب المميز: <span className="font-black text-slate-700">{student.code}</span></p>
          </div>
        </div>
        <div className="flex gap-3">
          <button 
              onClick={() => {
                setEditPaymentId('');
                setPaymentAmount('');
                setPaymentMethod('CASH');
                setPaymentDate(new Date().toISOString().split('T')[0]);
                setPaymentRef('');
                setPaymentNotes('');
                setShowPaymentModal(true);
              }} 
              className="bg-emerald-600 hover:bg-emerald-500 text-white px-4.5 py-3 rounded-xl font-bold flex items-center gap-2 shadow-md shadow-emerald-500/10 cursor-pointer text-sm"
          >
            <Plus className="w-4.5 h-4.5" />
            <span>تسجيل دفعة نقدية</span>
          </button>
          <button 
            onClick={() => setShowEnrollModal(true)} 
            className="bg-slate-800 hover:bg-slate-700 text-white px-4.5 py-3 rounded-xl font-bold flex items-center gap-2 cursor-pointer text-sm"
          >
            <Plus className="w-4.5 h-4.5" />
            <span>تسجيل اشتراك جروب</span>
          </button>
        </div>
      </div>

      {/* Stats Cards Ledger */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-emerald-50/50 border border-emerald-200 p-6 rounded-2xl flex flex-col justify-between h-36">
          <span className="text-sm font-bold text-slate-600">الرصيد الدائن المتاح</span>
          <div className="mt-2 flex justify-between items-end">
            <span className="text-3xl font-black text-emerald-600">{Number(student.credit_balance).toLocaleString('ar-EG')} ج.م</span>
            <Wallet className="w-8 h-8 text-emerald-500" />
          </div>
        </div>

        <div className="bg-indigo-50/50 border border-indigo-200 p-6 rounded-2xl flex flex-col justify-between h-36">
          <span className="text-sm font-bold text-slate-600">إجمالي المدفوعات المؤكدة</span>
          <div className="mt-2 flex justify-between items-end">
            <span className="text-3xl font-black text-indigo-700">{totalPaid.toLocaleString('ar-EG')} ج.م</span>
            <CreditCard className="w-8 h-8 text-indigo-500" />
          </div>
        </div>

        <div className="bg-red-50/50 border border-red-200 p-6 rounded-2xl flex flex-col justify-between h-36">
          <span className="text-sm font-bold text-slate-600">المطالبات المالية المستحقة</span>
          <div className="mt-2 flex justify-between items-end">
            <span className="text-3xl font-black text-red-600">{totalDues.toLocaleString('ar-EG')} ج.م</span>
            <TrendingUp className="w-8 h-8 text-red-500" />
          </div>
        </div>
      </div>

      {/* Tabs Menu */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
        <div className="flex border-b border-slate-100">
          {(['payments', 'charges', 'enrollments', 'discounts_refunds'] as const).map((tab) => {
            const labels = {
              payments: 'سجل المقبوضات والمدفوعات',
              charges: 'الفواتير والمطالبات الشهرية',
              enrollments: 'الاشتراكات بالمجموعات',
              discounts_refunds: 'الخصومات والارتجاعات'
            };
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-6 py-3 font-bold text-sm border-b-2 transition-all cursor-pointer ${
                  activeTab === tab 
                    ? 'border-emerald-500 text-emerald-600' 
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                {labels[tab]}
              </button>
            );
          })}
        </div>

        {/* Tab Contents */}
        <div className="py-6">
          {/* TAB: Payments */}
          {activeTab === 'payments' && (
            <div className="overflow-x-auto">
              <table className="w-full text-right divide-y divide-slate-100 text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="p-4 font-bold text-slate-500">القيمة المستلمة</th>
                    <th className="p-4 font-bold text-slate-500">طريقة التحصيل</th>
                    <th className="p-4 font-bold text-slate-500">تاريخ الدفع</th>
                    <th className="p-4 font-bold text-slate-500">الملاحظات</th>
                    <th className="p-4 font-bold text-slate-500">الحالة</th>
                    <th className="p-4 font-bold text-slate-500">إيصال السداد</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-semibold">
                  {student.payments?.map((payment: any) => (
                    <tr key={payment.id} className="hover:bg-slate-50/50">
                      <td className="p-4 text-slate-900 font-black">{Number(payment.amount).toLocaleString('ar-EG')} ج.م</td>
                      <td className="p-4 text-slate-600">{payment.method}</td>
                      <td className="p-4 text-slate-400">{new Date(payment.paid_at).toLocaleDateString('ar-EG')}</td>
                      <td className="p-4 text-slate-500">{payment.notes || '—'}</td>
                      <td className="p-4">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-black border ${
                          payment.status === 'APPROVED' 
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-100'
                            : payment.status === 'REJECTED'
                            ? 'bg-red-50 text-red-800 border-red-100'
                            : payment.status === 'REVERSED'
                            ? 'bg-slate-100 text-slate-600 border-slate-200'
                            : 'bg-amber-50 text-amber-800 border-amber-100'
                        }`}>
                          {payment.status === 'APPROVED' ? 'مؤكد' : payment.status === 'REJECTED' ? 'مرفوض' : payment.status === 'REVERSED' ? 'معكوس' : 'قيد المراجعة'}
                        </span>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          {payment.receipts?.length > 0 ? (
                            <div className="flex items-center gap-1">
                              <a
                                href={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003'}/accounting/receipts/${payment.receipts[0].storage_key}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 text-xs text-indigo-600 bg-indigo-50 border border-indigo-100 px-3 py-1.5 rounded-xl hover:bg-indigo-100 transition-colors"
                              >
                                <FileDown className="w-3.5 h-3.5" /> الإيصال
                              </a>
                              <button
                                onClick={() => handleDeleteReceipt(payment.receipts[0].storage_key)}
                                className="text-slate-400 bg-slate-100 px-2 py-1.5 rounded-xl transition-colors cursor-help"
                                title="الإيصال محفوظ ولا يحذف"
                              >
                                محفوظ
                              </button>
                            </div>
                          ) : <span className="text-slate-400 text-xs font-bold">بدون إيصال</span>}
                          
                          <a
                            href={`/print/receipt/${payment.id}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs text-slate-700 bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-xl hover:bg-slate-200 transition-colors"
                          >
                            <Printer className="w-3.5 h-3.5" /> طباعة
                          </a>

                          <div className="w-px h-6 bg-slate-200 mx-1"></div>
                          
                          {payment.status === 'APPROVED' && (
                            <button
                              onClick={() => {
                                setEditPaymentId(payment.id);
                                setPaymentAmount(payment.amount);
                                setPaymentMethod(payment.method);
                                setPaymentDate(new Date(payment.paid_at).toISOString().split('T')[0]);
                                setPaymentRef(payment.external_reference || '');
                                setPaymentNotes(payment.notes || '');
                                setShowPaymentModal(true);
                              }}
                              className="text-amber-600 hover:text-amber-700 font-black text-xs px-2 cursor-pointer"
                              title="تعديل الدفعة"
                            >
                              تعديل
                            </button>
                          )}
                           
                          {payment.status === 'APPROVED' && (
                            <button
                              onClick={() => handleDeletePayment(payment.id)}
                              className="text-red-600 hover:text-red-700 font-black text-xs px-2 cursor-pointer"
                              title="عكس الدفعة"
                            >
                              عكس
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {(!student.payments || student.payments.length === 0) && (
                    <tr><td colSpan={6} className="p-12 text-center text-slate-400 font-bold">لا توجد مدفوعات مسجلة للحساب.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB: Charges */}
          {activeTab === 'charges' && (
            <div className="overflow-x-auto">
              <table className="w-full text-right divide-y divide-slate-100 text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="p-4 font-bold text-slate-500">دورة الشهر</th>
                    <th className="p-4 font-bold text-slate-500">المجموعة الدراسية</th>
                    <th className="p-4 font-bold text-slate-500">قيمة الحصة</th>
                    <th className="p-4 font-bold text-slate-500">عدد الحصص</th>
                    <th className="p-4 font-bold text-slate-500">المطالبة الصافية</th>
                    <th className="p-4 font-bold text-slate-500">الحالة المالي</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-semibold">
                  {student.charges?.map((charge: any) => (
                    <tr key={charge.id} className="hover:bg-slate-50/50">
                      <td className="p-4 text-slate-900 font-bold">شهر {charge.period?.month} / {charge.period?.year}</td>
                      <td className="p-4 text-slate-700">{charge.group?.name}</td>
                      <td className="p-4 text-slate-500">{Number(charge.session_price).toLocaleString('ar-EG')} ج.م</td>
                      <td className="p-4 text-slate-500">{charge.sessions_count} حصص</td>
                      <td className="p-4 text-slate-900 font-black">{Number(charge.net_amount).toLocaleString('ar-EG')} ج.م</td>
                      <td className="p-4">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-black border ${
                          charge.status === 'PAID' 
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-100'
                            : charge.status === 'PARTIALLY_PAID'
                            ? 'bg-amber-50 text-amber-800 border-amber-100'
                            : 'bg-red-50 text-red-800 border-red-100'
                        }`}>
                          {charge.status === 'PAID' ? 'مدفوعة كاملة' : charge.status === 'PARTIALLY_PAID' ? 'مدفوعة جزئياً' : 'مستحقة للدفع'}
                        </span>
                      </td>
                    </tr>
                  ))}
                  {(!student.charges || student.charges.length === 0) && (
                    <tr><td colSpan={6} className="p-12 text-center text-slate-400 font-bold">لا توجد مطالبات شهرية مسجلة.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB: Enrollments */}
          {activeTab === 'enrollments' && (
            <div className="overflow-x-auto">
              <table className="w-full text-right divide-y divide-slate-100 text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="p-4 font-bold text-slate-500">المجموعة</th>
                    <th className="p-4 font-bold text-slate-500">سعر الحصة التعاقدي</th>
                    <th className="p-4 font-bold text-slate-500">الحصص الشهرية</th>
                    <th className="p-4 font-bold text-slate-500">تاريخ الاشتراك</th>
                    <th className="p-4 font-bold text-slate-500">حالة الاشتراك</th>
                    <th className="p-4 font-bold text-slate-500">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-semibold">
                  {student.enrollments?.map((enroll: any) => (
                    <tr key={enroll.id} className="hover:bg-slate-50/50">
                      <td className="p-4 text-slate-800 font-bold">{enroll.group?.name}</td>
                      <td className="p-4 text-slate-500">
                        {enroll.custom_session_price 
                          ? `${Number(enroll.custom_session_price).toLocaleString('ar-EG')} ج.م (مخصص)` 
                          : `${Number(enroll.group?.default_session_price || 300).toLocaleString('ar-EG')} ج.م (افتراضي)`}
                      </td>
                      <td className="p-4 text-slate-500">
                        {enroll.custom_sessions_per_month 
                          ? `${enroll.custom_sessions_per_month} حصص` 
                          : `${enroll.group?.default_sessions_per_month || 8} حصص`}
                      </td>
                      <td className="p-4 text-slate-400">{new Date(enroll.starts_at).toLocaleDateString('ar-EG')}</td>
                      <td className="p-4">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-black border ${
                          enroll.status === 'ACTIVE' 
                            ? 'bg-emerald-50 text-emerald-800 border-emerald-100'
                            : 'bg-red-50 text-red-800 border-red-100'
                        }`}>
                          {enroll.status === 'ACTIVE' ? 'نشط' : 'ملغي / منتهي'}
                        </span>
                      </td>
                      <td className="p-4">
                        {enroll.status === 'ACTIVE' && (
                          <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => openChargeModal(enroll)}
                            className="bg-emerald-50 hover:bg-emerald-100 text-emerald-700 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" /> إضافة مطالبة
                          </button>
                          <button
                            onClick={() => {
                              setTransferEnrollmentId(enroll.id);
                              setShowTransferModal(true);
                            }}
                            className="bg-indigo-50 hover:bg-indigo-100 text-indigo-700 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer"
                          >
                            <ArrowLeftRight className="w-3.5 h-3.5" /> نقل لمجموعة
                          </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  {(!student.enrollments || student.enrollments.length === 0) && (
                    <tr><td colSpan={5} className="p-12 text-center text-slate-400 font-bold">الطالب غير مشترك في أي مجموعة حالياً.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* TAB: Discounts & Refunds */}
          {activeTab === 'discounts_refunds' && (
            <div className="space-y-8">
              {/* Actions Header */}
              <div className="flex gap-3 justify-end">
                <button onClick={() => setShowDiscountModal(true)} className="bg-amber-600 hover:bg-amber-500 text-white px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 cursor-pointer">
                  + تطبيق خصم مالي
                </button>
                <button onClick={() => setShowRefundModal(true)} className="bg-slate-900 hover:bg-slate-800 text-white px-4 py-2.5 rounded-xl font-bold text-xs flex items-center gap-2 cursor-pointer">
                  + تسجيل عملية ارتجاع مالي
                </button>
              </div>

              {/* Discounts */}
              <div className="space-y-4">
                <h4 className="font-bold text-slate-800 text-sm border-r-4 border-amber-500 pr-3">سجل الخصومات والتعديلات المالية</h4>
                <table className="w-full text-right divide-y divide-slate-100 text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="p-3 font-bold text-slate-500">قيمة الخصم</th>
                      <th className="p-3 font-bold text-slate-500">المجموعة</th>
                      <th className="p-3 font-bold text-slate-500">الشهر المالي</th>
                      <th className="p-3 font-bold text-slate-500">السبب والتعليق</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-semibold">
                    {student.discounts?.map((discount: any) => (
                      <tr key={discount.id} className="hover:bg-slate-50/50">
                        <td className="p-3 text-amber-600 font-black">-{Number(discount.amount).toLocaleString('ar-EG')} ج.م</td>
                        <td className="p-3 text-slate-700">{discount.group?.name}</td>
                        <td className="p-3 text-slate-400">شهر {discount.period?.month} / {discount.period?.year}</td>
                        <td className="p-3 text-slate-500">{discount.reason}</td>
                      </tr>
                    ))}
                    {(!student.discounts || student.discounts.length === 0) && (
                      <tr><td colSpan={4} className="p-8 text-center text-slate-400 font-bold text-xs">لا توجد خصومات مطبقة على الحساب.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Refunds */}
              <div className="space-y-4">
                <h4 className="font-bold text-slate-800 text-sm border-r-4 border-slate-900 pr-3">سجل الارتجاعات المالية</h4>
                <table className="w-full text-right divide-y divide-slate-100 text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="p-3 font-bold text-slate-500">القيمة المرتجعة</th>
                      <th className="p-3 font-bold text-slate-500">طريقة الارتجاع</th>
                      <th className="p-3 font-bold text-slate-500">التاريخ</th>
                      <th className="p-3 font-bold text-slate-500">السبب والتعليق</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-semibold">
                    {student.refunds?.map((refund: any) => (
                      <tr key={refund.id} className="hover:bg-slate-50/50">
                        <td className="p-3 text-red-600 font-black">-{Number(refund.amount).toLocaleString('ar-EG')} ج.م</td>
                        <td className="p-3 text-slate-700">{refund.method}</td>
                        <td className="p-3 text-slate-400">{new Date(refund.refunded_at).toLocaleDateString('ar-EG')}</td>
                        <td className="p-3 text-slate-500">{refund.reason}</td>
                      </tr>
                    ))}
                    {(!student.refunds || student.refunds.length === 0) && (
                      <tr><td colSpan={4} className="p-8 text-center text-slate-400 font-bold text-xs">لا توجد ارتجاعات مالية مسجلة.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Modal: Record Payment */}
      {showPaymentModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-6">
            <div className="flex justify-between items-center border-b border-slate-100 pb-4">
              <h2 className="text-xl font-bold text-slate-800">{editPaymentId ? 'تعديل بيانات الدفعة' : 'تسجيل دفعة نقدية جديدة'}</h2>
              <button onClick={() => setShowPaymentModal(false)} className="text-slate-400 hover:text-slate-600 font-bold cursor-pointer">✕</button>
            </div>

            {dialogError && (
              <div className="bg-red-50 border border-red-100 text-red-800 px-4 py-2.5 rounded-xl flex items-center gap-2.5 text-xs font-bold">
                <AlertCircle className="w-5 h-5 text-red-500" />
                <span>{dialogError}</span>
              </div>
            )}

            <form onSubmit={handleRecordPayment} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-2">القيمة المالية (ج.م)</label>
                <input required type="number" min="1" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm font-semibold" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-2">طريقة الدفع</label>
                  <select value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm font-semibold">
                    <option value="CASH">كاش (نقدي)</option>
                    <option value="INSTAPAY">إنستا باي (InstaPay)</option>
                    <option value="VODAFONE_CASH">فودافون كاش</option>
                    <option value="BANK_TRANSFER">تحويل بنكي</option>
                    <option value="OTHER">أخرى</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-2">تاريخ الدفع</label>
                  <input required type="date" value={paymentDate} onChange={e => setPaymentDate(e.target.value)} className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm font-semibold" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-2">رقم المرجع الخارجي (اختياري)</label>
                <input type="text" placeholder="مثال: رقم تحويل فودافون كاش" value={paymentRef} onChange={e => setPaymentRef(e.target.value)} className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm font-semibold" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-2">صورة الإيصال / إثبات الدفع</label>
                <input type="file" accept="image/*,application/pdf" onChange={e => setReceiptFile(e.target.files ? e.target.files[0] : null)} className="w-full text-xs text-slate-400 file:mr-4 file:py-2.5 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-slate-100 file:text-slate-700 hover:file:bg-slate-200" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-2">ملاحظات التحصيل</label>
                <textarea rows={2} value={paymentNotes} onChange={e => setPaymentNotes(e.target.value)} className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm font-semibold"></textarea>
              </div>

              <div className="flex gap-4 border-t border-slate-100 pt-4">
                <button type="button" onClick={() => setShowPaymentModal(false)} className="flex-1 bg-slate-100 text-slate-700 py-3 rounded-xl font-bold cursor-pointer">إلغاء</button>
                <button type="submit" disabled={dialogLoading} className="flex-1 bg-emerald-600 text-white py-3 rounded-xl font-bold hover:bg-emerald-500 disabled:bg-emerald-800 cursor-pointer">
                  {dialogLoading ? 'جاري الحفظ...' : 'حفظ المقبوضات'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Enroll in Group */}
      {showEnrollModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-6">
            <div className="flex justify-between items-center border-b border-slate-100 pb-4">
              <h2 className="text-xl font-bold text-slate-800">اشتراك الطالب بمجموعة جديدة</h2>
              <button onClick={() => setShowEnrollModal(false)} className="text-slate-400 hover:text-slate-600 font-bold cursor-pointer">✕</button>
            </div>

            {dialogError && (
              <div className="bg-red-50 border border-red-100 text-red-800 px-4 py-2.5 rounded-xl flex items-center gap-2.5 text-xs font-bold">
                <AlertCircle className="w-5 h-5 text-red-500" />
                <span>{dialogError}</span>
              </div>
            )}

            <form onSubmit={handleEnrollGroup} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-2">المجموعة الدراسية</label>
                <select required value={enrollGroup} onChange={e => setEnrollGroup(e.target.value)} className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm font-semibold">
                  <option value="">اختر المجموعة</option>
                  {groups.map(g => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-2">سعر الحصة التعاقدي</label>
                  <input type="number" value={enrollPrice} onChange={e => setEnrollPrice(e.target.value)} className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm font-semibold" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-2">الحصص الشهرية</label>
                  <input type="number" value={enrollSessions} onChange={e => setEnrollSessions(e.target.value)} className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm font-semibold" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-2">تاريخ بدء الاشتراك</label>
                <input required type="date" value={enrollDate} onChange={e => setEnrollDate(e.target.value)} className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm font-semibold" />
              </div>

              <div className="flex gap-4 border-t border-slate-100 pt-4">
                <button type="button" onClick={() => setShowEnrollModal(false)} className="flex-1 bg-slate-100 text-slate-700 py-3 rounded-xl font-bold cursor-pointer">إلغاء</button>
                <button type="submit" disabled={dialogLoading} className="flex-1 bg-emerald-600 text-white py-3 rounded-xl font-bold hover:bg-emerald-500 disabled:bg-emerald-800 cursor-pointer">
                  {dialogLoading ? 'جاري الاشتراك...' : 'تسجيل الاشتراك'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add charge for late enrollment */}
      {showChargeModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-6">
            <div className="flex justify-between items-center border-b border-slate-100 pb-4">
              <h2 className="text-xl font-bold text-slate-800">إضافة مطالبة للشهر المفتوح</h2>
              <button onClick={() => setShowChargeModal(false)} className="text-slate-400 hover:text-slate-600 font-bold cursor-pointer">×</button>
            </div>

            {dialogError && (
              <div className="bg-red-50 border border-red-100 text-red-800 px-4 py-2.5 rounded-xl flex items-center gap-2.5 text-xs font-bold">
                <AlertCircle className="w-5 h-5 text-red-500" />
                <span>{dialogError}</span>
              </div>
            )}

            <form onSubmit={handleCreateCharge} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-2">الشهر المالي المفتوح</label>
                <select required value={chargePeriodId} onChange={e => setChargePeriodId(e.target.value)} className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm font-semibold">
                  <option value="">اختر شهر مفتوح</option>
                  {periods.filter((p: any) => p.status === 'OPEN').map((p: any) => (
                    <option key={p.id} value={p.id}>{p.month} / {p.year}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-2">عدد الحصص</label>
                  <input required type="number" min="1" value={chargeSessions} onChange={e => setChargeSessions(e.target.value)} className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm font-semibold" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-2">سعر الحصة</label>
                  <input required type="number" min="0" value={chargePrice} onChange={e => setChargePrice(e.target.value)} className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm font-semibold" />
                </div>
              </div>

              <div className="rounded-xl bg-emerald-50 border border-emerald-100 p-3 text-sm font-bold text-emerald-800">
                المطلوب = {(Number(chargeSessions || 0) * Number(chargePrice || 0)).toLocaleString('ar-EG')} ج.م
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-2">ملاحظات</label>
                <textarea rows={2} value={chargeNotes} onChange={e => setChargeNotes(e.target.value)} className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm font-semibold" placeholder="مثال: طالب دخل بعد فتح الشهر" />
              </div>

              <div className="flex gap-4 border-t border-slate-100 pt-4">
                <button type="button" onClick={() => setShowChargeModal(false)} className="flex-1 bg-slate-100 text-slate-700 py-3 rounded-xl font-bold cursor-pointer">إلغاء</button>
                <button type="submit" disabled={dialogLoading} className="flex-1 bg-emerald-600 text-white py-3 rounded-xl font-bold hover:bg-emerald-500 disabled:bg-emerald-800 cursor-pointer">
                  {dialogLoading ? 'جاري الإضافة...' : 'إضافة المطالبة'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Record Refund */}
      {showRefundModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-6">
            <div className="flex justify-between items-center border-b border-slate-100 pb-4">
              <h2 className="text-xl font-bold text-slate-800">تسجيل ارتجاع مالي جديد</h2>
              <button onClick={() => setShowRefundModal(false)} className="text-slate-400 hover:text-slate-600 font-bold cursor-pointer">✕</button>
            </div>

            {dialogError && (
              <div className="bg-red-50 border border-red-100 text-red-800 px-4 py-2.5 rounded-xl flex items-center gap-2.5 text-xs font-bold">
                <AlertCircle className="w-5 h-5 text-red-500" />
                <span>{dialogError}</span>
              </div>
            )}

            <form onSubmit={handleRecordRefund} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-2">المبلغ المرتجع (ج.م)</label>
                <input required type="number" min="1" value={refundAmount} onChange={e => setRefundAmount(e.target.value)} className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm font-semibold" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-2">طريقة الارتجاع</label>
                  <select value={refundMethod} onChange={e => setRefundMethod(e.target.value)} className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm font-semibold">
                    <option value="CASH">كاش (نقدي)</option>
                    <option value="INSTAPAY">إنستا باي (InstaPay)</option>
                    <option value="VODAFONE_CASH">فودافون كاش</option>
                    <option value="BANK_TRANSFER">تحويل بنكي</option>
                    <option value="OTHER">أخرى</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-2">تاريخ الارتجاع</label>
                  <input required type="date" value={refundDate} onChange={e => setRefundDate(e.target.value)} className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm font-semibold" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-2">مرجع خارجي (اختياري)</label>
                <input type="text" value={refundRef} onChange={e => setRefundRef(e.target.value)} className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm font-semibold" />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-2">سبب الارتجاع المالي بالتفصيل</label>
                <textarea required rows={2} value={refundReason} onChange={e => setRefundReason(e.target.value)} className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm font-semibold"></textarea>
              </div>

              <div className="flex gap-4 border-t border-slate-100 pt-4">
                <button type="button" onClick={() => setShowRefundModal(false)} className="flex-1 bg-slate-100 text-slate-700 py-3 rounded-xl font-bold cursor-pointer">إلغاء</button>
                <button type="submit" disabled={dialogLoading} className="flex-1 bg-slate-900 text-white py-3 rounded-xl font-bold hover:bg-slate-800 disabled:bg-slate-700 cursor-pointer">
                  {dialogLoading ? 'جاري الحفظ...' : 'تسجيل الارتجاع'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Grant Discount */}
      {showDiscountModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-6">
            <div className="flex justify-between items-center border-b border-slate-100 pb-4">
              <h2 className="text-xl font-bold text-slate-800">تطبيق خصم مالي مخصص</h2>
              <button onClick={() => setShowDiscountModal(false)} className="text-slate-400 hover:text-slate-600 font-bold cursor-pointer">✕</button>
            </div>

            {dialogError && (
              <div className="bg-red-50 border border-red-100 text-red-800 px-4 py-2.5 rounded-xl flex items-center gap-2.5 text-xs font-bold">
                <AlertCircle className="w-5 h-5 text-red-500" />
                <span>{dialogError}</span>
              </div>
            )}

            <form onSubmit={handleGrantDiscount} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-2">قيمة الخصم الممنوح (ج.م)</label>
                <input required type="number" min="1" value={discountAmount} onChange={e => setDiscountAmount(e.target.value)} className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm font-semibold" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-2">المجموعة</label>
                  <select required value={discountGroup} onChange={e => setDiscountGroup(e.target.value)} className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm font-semibold">
                    <option value="">اختر المجموعة</option>
                    {student.enrollments?.map((en: any) => (
                      <option key={en.group?.id} value={en.group?.id}>{en.group?.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-2">الشهر المالي</label>
                  <select required value={discountPeriod} onChange={e => setDiscountPeriod(e.target.value)} className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm font-semibold">
                    <option value="">اختر الشهر</option>
                    {periods.map(p => (
                      <option key={p.id} value={p.id}>{p.month} / {p.year}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-2">سبب تطبيق الخصم</label>
                <textarea required rows={2} value={discountReason} onChange={e => setDiscountReason(e.target.value)} className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm font-semibold"></textarea>
              </div>

              <div className="flex gap-4 border-t border-slate-100 pt-4">
                <button type="button" onClick={() => setShowDiscountModal(false)} className="flex-1 bg-slate-100 text-slate-700 py-3 rounded-xl font-bold cursor-pointer">إلغاء</button>
                <button type="submit" disabled={dialogLoading} className="flex-1 bg-amber-600 text-white py-3 rounded-xl font-bold hover:bg-amber-500 disabled:bg-amber-800 cursor-pointer">
                  {dialogLoading ? 'جاري التطبيق...' : 'تطبيق الخصم'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Modal: Transfer */}
      {showTransferModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-6">
            <div className="flex justify-between items-center border-b border-slate-100 pb-4">
              <h2 className="text-xl font-bold text-slate-800">نقل لمجموعة أخرى</h2>
              <button onClick={() => setShowTransferModal(false)} className="text-slate-400 hover:text-slate-600 font-bold cursor-pointer">✕</button>
            </div>

            {dialogError && (
              <div className="bg-red-50 border border-red-100 text-red-800 px-4 py-2.5 rounded-xl flex items-center gap-2.5 text-xs font-bold">
                <AlertCircle className="w-5 h-5 text-red-500" />
                <span>{dialogError}</span>
              </div>
            )}

            <form onSubmit={handleTransferSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-2">المجموعة الجديدة</label>
                <select required value={transferGroupId} onChange={e => setTransferGroupId(e.target.value)} className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm font-semibold">
                  <option value="">اختر المجموعة...</option>
                  {groups.map((g: any) => (
                    <option key={g.id} value={g.id}>{g.name}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-2">تاريخ النقل الفعلي</label>
                <input required type="date" value={transferDate} onChange={e => setTransferDate(e.target.value)} className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm font-semibold" />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-2">سبب النقل</label>
                <textarea required rows={2} value={transferReason} onChange={e => setTransferReason(e.target.value)} className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm font-semibold"></textarea>
              </div>

              <div className="flex gap-4 border-t border-slate-100 pt-4">
                <button type="button" onClick={() => setShowTransferModal(false)} className="flex-1 bg-slate-100 text-slate-700 py-3 rounded-xl font-bold cursor-pointer">إلغاء</button>
                <button type="submit" disabled={dialogLoading} className="flex-1 bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-500 disabled:bg-indigo-800 cursor-pointer">
                  {dialogLoading ? 'جاري النقل...' : 'تأكيد النقل'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Modal: Edit Student */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl space-y-6">
            <div className="flex justify-between items-center border-b border-slate-100 pb-4">
              <h2 className="text-xl font-bold text-slate-800">تعديل بيانات الطالب</h2>
              <button onClick={() => setShowEditModal(false)} className="text-slate-400 hover:text-slate-600 font-bold cursor-pointer">✕</button>
            </div>

            {dialogError && (
              <div className="bg-red-50 border border-red-100 text-red-800 px-4 py-2.5 rounded-xl flex items-center gap-2.5 text-xs font-bold">
                <AlertCircle className="w-5 h-5 text-red-500" />
                <span>{dialogError}</span>
              </div>
            )}

            <form onSubmit={handleEditStudent} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-2">اسم الطالب (رباعي)</label>
                <input required type="text" value={editFullName} onChange={e => setEditFullName(e.target.value)} className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm font-semibold" />
              </div>
              
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-2">رقم هاتف الطالب</label>
                <input type="text" value={editStudentPhone} onChange={e => setEditStudentPhone(e.target.value)} className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm font-semibold" dir="ltr" />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-2">اسم ولي الأمر</label>
                <input type="text" value={editGuardianName} onChange={e => setEditGuardianName(e.target.value)} className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm font-semibold" />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-2">رقم هاتف ولي الأمر</label>
                <input type="text" value={editGuardianPhone} onChange={e => setEditGuardianPhone(e.target.value)} className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm font-semibold" dir="ltr" />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-2">حالة الطالب</label>
                <select value={editStatus} onChange={e => setEditStatus(e.target.value)} className="w-full px-4 py-3 border border-slate-200 rounded-xl text-sm font-semibold">
                  <option value="ACTIVE">نشط (Active)</option>
                  <option value="PAUSED">موقوف مؤقتاً (Paused)</option>
                  <option value="WITHDRAWN">منسحب (Withdrawn)</option>
                  <option value="COMPLETED">مكتمل / خريج (Completed)</option>
                </select>
              </div>

              <div className="flex gap-4 border-t border-slate-100 pt-4">
                <button type="button" onClick={() => setShowEditModal(false)} className="flex-1 bg-slate-100 text-slate-700 py-3 rounded-xl font-bold cursor-pointer">إلغاء</button>
                <button type="submit" disabled={dialogLoading} className="flex-1 bg-slate-800 text-white py-3 rounded-xl font-bold hover:bg-slate-700 disabled:bg-slate-900 cursor-pointer">
                  {dialogLoading ? 'جاري الحفظ...' : 'حفظ التعديلات'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
