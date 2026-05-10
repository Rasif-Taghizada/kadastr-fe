import axios from 'axios';
import { openNotification } from '@/common/components/shared/notification';

const gisBaseURL = import.meta.env.VITE_GIS_BASE_URL || 'http://localhost:3001';

const gisInstance = axios.create({
  baseURL: gisBaseURL,
  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  },
});

gisInstance.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers['Authorization'] = `Bearer ${token}`;
  }
  return config;
});

gisInstance.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      window.location.href = '/auth/signin';
      return Promise.reject(error);
    }

    const message = error.response?.data?.message || 'Xəta baş verdi';
    openNotification({
      type: 'error',
      title: 'Xəta',
      content: message,
    });

    return Promise.reject(error);
  }
);

export default gisInstance;
