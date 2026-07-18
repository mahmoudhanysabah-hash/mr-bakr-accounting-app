export function getBackendBaseUrl() {
  if (process.env.NEXT_PUBLIC_BACKEND_URL) return process.env.NEXT_PUBLIC_BACKEND_URL;
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
  return process.env.NODE_ENV === 'production' ? '/api/backend' : 'http://localhost:3003';
}
