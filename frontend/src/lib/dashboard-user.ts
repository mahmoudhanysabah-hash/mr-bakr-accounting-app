'use client';

import { createContext, useContext } from 'react';
import type { AuthUser } from './auth';

export const DashboardUserContext = createContext<AuthUser | null>(null);
export const useDashboardUser = () => useContext(DashboardUserContext);
