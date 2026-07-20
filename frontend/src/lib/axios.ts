import axios, { InternalAxiosRequestConfig } from 'axios';
import { getBackendBaseUrl } from './backend-url';
import { formatApiValue } from './error';

const baseConfig = {
  baseURL: getBackendBaseUrl(),
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
};

const api = axios.create(baseConfig);
const refreshClient = axios.create(baseConfig);
let refreshRequest: Promise<void> | null = null;

type RetryableRequestConfig = InternalAxiosRequestConfig & {
  _authRetry?: boolean;
};

function isPublicAuthRequest(url?: string): boolean {
  return [
    '/auth/login',
    '/auth/refresh',
    '/auth/logout',
    '/auth/forgot-password',
    '/auth/reset-password',
    '/auth/verify-email',
    '/auth/resend-verification',
  ].some((path) => url?.includes(path));
}

function normalizeApiError(error: unknown) {
  const candidate = error as {
    response?: { data?: { error?: unknown; message?: unknown } };
  };
  const normalizedError = formatApiValue(candidate.response?.data?.error);
  const normalizedMessage = formatApiValue(candidate.response?.data?.message);
  const normalizedValue = normalizedError || normalizedMessage;

  if (candidate.response?.data && normalizedValue) {
    candidate.response.data.error = normalizedValue;
    candidate.response.data.message = normalizedValue;
  }
}

function redirectToLogin() {
  if (typeof window !== 'undefined' && window.location.pathname !== '/') {
    window.location.replace('/');
  }
}

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const config = error.config as RetryableRequestConfig | undefined;
    const shouldRefresh =
      error.response?.status === 401 &&
      config &&
      !config._authRetry &&
      !isPublicAuthRequest(config.url);

    if (shouldRefresh) {
      config._authRetry = true;
      try {
        if (!refreshRequest) {
          refreshRequest = refreshClient.post('/auth/refresh').then(() => undefined);
        }
        await refreshRequest;
        return api.request(config);
      } catch {
        redirectToLogin();
        normalizeApiError(error);
        return Promise.reject(error);
      } finally {
        refreshRequest = null;
      }
    }

    if (error.response?.status === 401 && config && !isPublicAuthRequest(config.url)) {
      redirectToLogin();
    }

    normalizeApiError(error);
    return Promise.reject(error);
  },
);

export default api;
