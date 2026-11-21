import { useState, useEffect, useCallback } from 'react';
import { UserRole } from '@certiflow/shared';
import { apiRequest } from '../api/client';

export interface DemoUser {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  districtId?: string | null;
  trainingCentreId?: string | null;
  district?: { id: string; name: string; code: string } | null;
  trainingCentre?: { id: string; name: string; code: string } | null;
}

export function useAuth() {
  const [demoUsers, setDemoUsers] = useState<DemoUser[]>([]);
  const [currentUser, setCurrentUser] = useState<DemoUser | null>(() => {
    try {
      const saved = localStorage.getItem('certiflow_user');
      return saved ? JSON.parse(saved) : null;
    } catch {
      return null;
    }
  });
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('certiflow_token'));
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Switch active persona and acquire a new signed JWT
  const switchUser = useCallback(async (userId: string, userList?: DemoUser[]) => {
    try {
      setIsLoading(true);
      setError(null);

      const res = await apiRequest<any>('/auth/demo-switch', {
        method: 'POST',
        body: JSON.stringify({ userId })
      });

      const token = res.token || res.data?.token;
      const user = res.user || res.data?.user;

      if (token && user) {
        localStorage.setItem('certiflow_token', token);
        localStorage.setItem('certiflow_user', JSON.stringify(user));
        setToken(token);
        setCurrentUser(user);
        return { token, user };
      }
      throw new Error('Authentication response did not contain token or user.');
    } catch (err: any) {
      console.error('Failed to switch user:', err);
      if (userList) {
        const fallback = userList.find(u => u.id === userId);
        if (fallback) setCurrentUser(fallback);
      }
      setError(err.message || 'Failed to switch persona');
      throw err;
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initialize demo users list and set default persona if missing
  const initAuth = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await apiRequest<any>('/auth/demo-users');
      const usersList: DemoUser[] = res.users || res.data || (Array.isArray(res) ? res : []);
      setDemoUsers(usersList);

      const savedToken = localStorage.getItem('certiflow_token');
      const savedUserStr = localStorage.getItem('certiflow_user');

      if (savedToken && savedUserStr) {
        try {
          const parsed = JSON.parse(savedUserStr);
          const found = usersList.find(u => u.id === parsed.id);
          if (found) {
            setCurrentUser(found);
            setToken(savedToken);
            setIsLoading(false);
            return;
          }
        } catch {
          // ignore parsing error
        }
      }

      // Default to Anika (Training Centre)
      if (usersList.length > 0) {
        const defaultUser = usersList.find(u => u.role === UserRole.TRAINING_CENTRE) || usersList[0];
        await switchUser(defaultUser.id, usersList);
      }
    } catch (err: any) {
      console.error('Failed to initialize demo users:', err);
      setError(err.message || 'Failed to initialize authentication');
    } finally {
      setIsLoading(false);
    }
  }, [switchUser]);

  useEffect(() => {
    initAuth();
  }, [initAuth]);

  return {
    currentUser,
    token,
    demoUsers,
    switchUser,
    isLoading,
    error,
    refreshDemoUsers: initAuth
  };
}
