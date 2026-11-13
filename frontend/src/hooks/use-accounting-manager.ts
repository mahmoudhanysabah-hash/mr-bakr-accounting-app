'use client';

import { useDashboardUser } from '@/lib/dashboard-user';

export default function useAccountingManager() {
  const user = useDashboardUser();
  return user?.role === 'ADMIN' || user?.role === 'FINANCE_MANAGER';
}
