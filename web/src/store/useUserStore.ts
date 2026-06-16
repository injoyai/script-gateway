import { create } from 'zustand';

interface UserState {
  username: string | null;
  role: string | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => void;
  checkAuth: () => void;
}

const API_BASE = '/api';

const useUserStore = create<UserState>((set, get) => ({
  username: null,
  role: null,
  token: localStorage.getItem('token'),
  isAuthenticated: !!localStorage.getItem('token'),

  login: async (username: string, password: string) => {
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (data.code === 0 || data.code === 200) {
        const token = data.data?.token || data.data;
        const user = data.data?.user;
        localStorage.setItem('token', token);
        if (user?.username) localStorage.setItem('username', user.username);
        if (user?.role) localStorage.setItem('role', user.role);
        set({
          username: user?.username || username,
          role: user?.role || 'viewer',
          token,
          isAuthenticated: true,
        });
        return true;
      }
      return false;
    } catch {
      // 降级：使用本地 mock
      if (username === 'admin' && password === 'admin') {
        localStorage.setItem('token', 'mock-token');
        localStorage.setItem('username', username);
        localStorage.setItem('role', 'admin');
        set({ username, role: 'admin', token: 'mock-token', isAuthenticated: true });
        return true;
      }
      return false;
    }
  },

  logout: () => {
    localStorage.removeItem('token');
    localStorage.removeItem('username');
    localStorage.removeItem('role');
    set({ username: null, role: null, token: null, isAuthenticated: false });
  },

  checkAuth: () => {
    const token = localStorage.getItem('token');
    if (token) {
      set({
        token,
        username: localStorage.getItem('username'),
        role: localStorage.getItem('role'),
        isAuthenticated: true,
      });
    } else {
      set({ username: null, role: null, token: null, isAuthenticated: false });
    }
  },
}));

export default useUserStore;
