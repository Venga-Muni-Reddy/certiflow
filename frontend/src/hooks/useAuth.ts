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
  const [currentUser, setCurrentUser] = useState<DemoUser | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('certiflow_token'));
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch demo users list
  const fetchDemoUsers = useCallback(async () => {
    try {
      setIsLoading(true);
      const res = await apiRequest<{ success: boolean; data: DemoUser[] }>('/auth/demo-users');
      setDemoUsers(res.data);

      // Check if saved user matches one of demo users
      const savedUserStr = localStorage.getItem('certiflow_user');
      if (savedUserStr) {
        try {
          const parsed = JSON.parse(savedUserStr);
          const found = res.data.find(u => u.id === parsed.id);
          if (found) {
            setCurrentUser(found);
            return;
          }
        } catch {
          // ignore corrupted storage
        }
      }

      // Default to Anika (Training Centre) or first user
      if (res.data.length > 0) {
        const defaultUser = res.data.find(u => u.role === UserRole.TRAINING_CENTRE) || res.data[0];
        await switchUser(defaultUser.id, res.data);
      }
    } catch (err: any) {
      console.error('Failed to load demo users:', err);
      setError(err.message || 'Failed to initialize authentication');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Switch active persona
  const switchUser = async (userId: string, userList = demoUsers) => {
    try {
      setIsLoading(true);
      setError(null);
      const res = await apiRequest<{
        success: boolean;
        data: {
          token: string;
          user: DemoUser;
        };
      }>('/auth/demo-switch', {
        method: 'POST',
        body: JSON.stringify({ userId })
      });

      localStorage.setItem('certiflow_token', res.data.token);
      localStorage.setItem('certiflow_user', JSON.stringify(res.data.user));
      setToken(res.data.token);
      setCurrentUser(res.data.user);
    } catch (err: any) {
      console.error('Failed to switch user:', err);
      // Fallback: match from local list if backend switch endpoint fails
      const matched = userList.find(u => u.id === userId);
      if (matched) {
        setCurrentUser(matched);
      }
      setError(err.message || 'Failed to switch persona');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDemoUsers();
  }, [fetchDemoUsers]);

  return {
    currentUser,
    token,
    demoUsers,
    switchUser,
    isLoading,
    error,
    refreshDemoUsers: fetchDemoUsers
  };
}
