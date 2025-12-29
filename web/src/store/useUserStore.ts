import { create } from 'zustand';

interface UserState {
  username: string | null;
  isAuthenticated: boolean;
  login: (username: string) => void;
  logout: () => void;
}

const useUserStore = create<UserState>((set) => ({
  username: 'admin',
  isAuthenticated: true,
  login: (username) => set({ username, isAuthenticated: true }),
  logout: () => set({ username: null, isAuthenticated: false }),
}));

export default useUserStore;
