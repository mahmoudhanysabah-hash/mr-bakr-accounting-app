import axios from 'axios';

const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3003',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  return config;
});

// Intercept responses to handle global 401 Unauthorized errors gracefully
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('user');
      window.location.href = '/';
    }
    
    // Map NestJS validation arrays to the 'error' property
    if (error.response?.data?.message) {
      if (Array.isArray(error.response.data.message)) {
        error.response.data.error = error.response.data.message.join('، ');
      } else if (typeof error.response.data.message === 'string') {
        error.response.data.error = error.response.data.message;
      }
    }

    return Promise.reject(error);
  }
);

export default api;
