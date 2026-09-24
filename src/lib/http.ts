import axios, { AxiosError, type AxiosRequestConfig, type InternalAxiosRequestConfig } from 'axios';
import { toast } from 'sonner';
import type { ApiResponse } from './types';
import { useAuthStore } from '@/stores/auth';

const instance = axios.create({
  baseURL: '/api',
  timeout: 15000,
});

// 请求拦截器：自动携带 access token
instance.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = useAuthStore.getState().accessToken;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// 响应拦截器：解构 ApiResponse + 401 自动刷新
let isRefreshing = false;
let pendingQueue: Array<(token: string | null) => void> = [];

/** 会话彻底失效：清空队列并跳转登录页（整页重载，保证状态干净） */
function forceRelogin() {
  pendingQueue.forEach((cb) => cb(null));
  pendingQueue = [];
  isRefreshing = false;
  useAuthStore.getState().logout();
  const current = window.location.pathname + window.location.search;
  const target = current.startsWith('/login')
    ? '/login'
    : `/login?redirect=${encodeURIComponent(current)}`;
  if (window.location.pathname + window.location.search !== target) {
    window.location.href = target;
  }
}

instance.interceptors.response.use(
  (response) => {
    const data = response.data as ApiResponse;
    if (data.code === 0) {
      return data.data as never;
    }
    toast.error(data.message || '请求失败');
    return Promise.reject(new Error(data.message));
  },
  async (error: AxiosError<ApiResponse>) => {
    const status = error.response?.status;
    const originalRequest = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    // 401：尝试 refresh token 自动续期
    if (status === 401 && originalRequest && !originalRequest._retry) {
      // 刷新接口自身 401 = refresh token 已失效，直接判定会话失效（避免队列死锁）
      if (originalRequest.url?.includes('/auth/refresh')) {
        forceRelogin();
        return Promise.reject(error);
      }

      const auth = useAuthStore.getState();

      if (!auth.refreshToken) {
        forceRelogin();
        return Promise.reject(error);
      }

      // 已在刷新中，挂起到队列
      if (isRefreshing) {
        return new Promise((resolve, reject) => {
          pendingQueue.push((token) => {
            if (!token) {
              reject(error);
              return;
            }
            originalRequest._retry = true;
            originalRequest.headers.Authorization = `Bearer ${token}`;
            resolve(instance(originalRequest));
          });
        });
      }

      // 触发刷新
      originalRequest._retry = true;
      isRefreshing = true;
      try {
        const newTokens = await auth.refresh();
        pendingQueue.forEach((cb) => cb(newTokens.accessToken));
        pendingQueue = [];
        originalRequest.headers.Authorization = `Bearer ${newTokens.accessToken}`;
        return instance(originalRequest);
      } catch (e) {
        forceRelogin();
        toast.warning('登录已过期，请重新登录');
        return Promise.reject(e);
      } finally {
        isRefreshing = false;
      }
    }

    const message = error.response?.data?.message || error.message || '网络错误';
    toast.error(message);
    return Promise.reject(error);
  },
);

/** 类型化请求包装：拦截器已解包 ApiResponse.data */
export const http = {
  get: <T>(url: string, config?: AxiosRequestConfig) => instance.get<T>(url, config) as Promise<T>,
  post: <T>(url: string, body?: unknown, config?: AxiosRequestConfig) =>
    instance.post<T>(url, body, config) as Promise<T>,
  put: <T>(url: string, body?: unknown, config?: AxiosRequestConfig) =>
    instance.put<T>(url, body, config) as Promise<T>,
  patch: <T>(url: string, body?: unknown, config?: AxiosRequestConfig) =>
    instance.patch<T>(url, body, config) as Promise<T>,
  delete: <T = unknown>(url: string, config?: AxiosRequestConfig) =>
    instance.delete<T>(url, config) as Promise<T>,
};

export default http;
