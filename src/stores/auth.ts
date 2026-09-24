import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { authApi } from '@/lib/api';
import type { AuthTokens, User } from '@/lib/types';

interface AuthState {
  user: User | null;
  accessToken: string | null;
  refreshToken: string | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, username: string, password: string) => Promise<void>;
  refresh: () => Promise<AuthTokens>;
  logout: () => void;
  setUser: (user: User) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      isAuthenticated: false,

      login: async (email, password) => {
        const res = await authApi.login({ email, password });
        set({ user: res.user, accessToken: res.accessToken, refreshToken: res.refreshToken, isAuthenticated: true });
      },

      register: async (email, username, password) => {
        const res = await authApi.register({ email, username, password });
        set({ user: res.user, accessToken: res.accessToken, refreshToken: res.refreshToken, isAuthenticated: true });
      },

      refresh: async () => {
        const current = useAuthStore.getState().refreshToken;
        if (!current) throw new Error('no refresh token');
        const tokens = await authApi.refresh(current);
        set({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
        return tokens;
      },

      logout: () => set({ user: null, accessToken: null, refreshToken: null, isAuthenticated: false }),

      setUser: (user) => set({ user }),
    }),
    {
      name: 'summit-okr-react-auth',
      partialize: (s) => ({
        user: s.user,
        accessToken: s.accessToken,
        refreshToken: s.refreshToken,
        isAuthenticated: s.isAuthenticated,
      }),
    },
  ),
);
