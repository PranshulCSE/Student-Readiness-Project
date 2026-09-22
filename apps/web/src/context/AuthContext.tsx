import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { UserRole } from '@student-readiness/shared';
import { setAuthTokenGetter } from '../api/client.js';

export interface AuthState {
  tenantId: string;
  tenantName: string;
  userId: string;
  role: UserRole;
  email: string;
  token: string;
}

interface AuthContextType {
  auth: AuthState;
  switchTenant: (newTenant: {
    tenantId: string;
    tenantName: string;
    token?: string;
    role?: UserRole;
    userId?: string;
    email?: string;
  }) => void;
  setToken: (token: string, details?: Partial<AuthState>) => void;
}

// Preset tenants for defense demonstration and live testing
export const DEMO_TENANTS = [
  {
    tenantId: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    tenantName: 'Acme Institute of Tech',
    userId: '11111111-1111-1111-1111-111111111111',
    role: 'admin' as UserRole,
    email: 'admin@acme.edu',
    token: 'token-acme',
  },
  {
    tenantId: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    tenantName: 'Nexus University',
    userId: '33333333-3333-3333-3333-333333333333',
    role: 'evaluator' as UserRole,
    email: 'evaluator@nexus.edu',
    token: 'token-b',
  },
];

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();

  const [auth, setAuth] = useState<AuthState>(() => {
    const saved = localStorage.getItem('auth_state');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        // Fallback
      }
    }
    const demo = DEMO_TENANTS[0];
    const initialToken = localStorage.getItem('token') || demo.token;
    setAuthTokenGetter(() => initialToken);
    return {
      tenantId: demo.tenantId,
      tenantName: demo.tenantName,
      userId: demo.userId,
      role: demo.role,
      email: demo.email,
      token: initialToken,
    };
  });

  useEffect(() => {
    setAuthTokenGetter(() => auth.token);
    localStorage.setItem('token', auth.token);
    localStorage.setItem('auth_state', JSON.stringify(auth));
  }, [auth]);

  /**
   * Safe Tenant Switch (§8.3 & §10):
   * 1. Updates token getters synchronously
   * 2. Cancels all in-flight queries via queryClient.cancelQueries()
   * 3. Clears client cache so data from tenant A cannot bleed into tenant B
   * 4. Updates auth state
   */
  const switchTenant = (newTenant: {
    tenantId: string;
    tenantName: string;
    token?: string;
    role?: UserRole;
    userId?: string;
    email?: string;
  }) => {
    const targetToken = newTenant.token || (DEMO_TENANTS.find((t) => t.tenantId === newTenant.tenantId)?.token || auth.token);

    // Synchronously set token getter so subsequent requests use the new token immediately
    localStorage.setItem('token', targetToken);
    setAuthTokenGetter(() => targetToken);

    // 1. Abort all in-flight requests immediately
    queryClient.cancelQueries();

    // 2. Wipe cached data across all queries
    queryClient.clear();

    // 3. Update state
    setAuth({
      tenantId: newTenant.tenantId,
      tenantName: newTenant.tenantName,
      userId: newTenant.userId || auth.userId,
      token: targetToken,
      role: newTenant.role || auth.role,
      email: newTenant.email || auth.email,
    });
  };

  const setToken = (token: string, details?: Partial<AuthState>) => {
    localStorage.setItem('token', token);
    setAuthTokenGetter(() => token);
    setAuth((prev) => ({
      ...prev,
      token,
      ...(details || {}),
    }));
  };

  return (
    <AuthContext.Provider value={{ auth, switchTenant, setToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return ctx;
}
