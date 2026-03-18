/**
 * AuthContext — Supabase Auth integration.
 * Uses Supabase session management with auto-refresh.
 * On first login, backend auto-creates a User row from the Supabase JWT.
 */
import React, { createContext, useState, useContext, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { spectra } from '@/api/spectraClient';

import { DEV_MODE } from '@/lib/devmode';

const DEV_USER = {
  id: 'superadmin-001',
  email: 'amir@flycomm.co',
  full_name: 'Dev User',
  organization_id: 'org-spectra',
  role: 'admin',
  is_super_admin: true,
  custom_role: 'admin',
};

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(DEV_MODE ? DEV_USER : null);
  const [isAuthenticated, setIsAuthenticated] = useState(DEV_MODE);
  const [isLoadingAuth, setIsLoadingAuth] = useState(!DEV_MODE);
  const [authError, setAuthError] = useState(null);
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false);
  const [appPublicSettings] = useState({ id: 'spectra', public_settings: {} });

  useEffect(() => {
    // In DEV_MODE, skip all Supabase auth logic
    if (DEV_MODE) return;

    // Detect recovery hash before anything else
    const hash = window.location.hash;
    const isRecoveryFlow = hash.includes('type=recovery');

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (event === 'PASSWORD_RECOVERY' && session) {
          // Don't redirect — just flag recovery mode (keeps session alive)
          setIsPasswordRecovery(true);
          setIsLoadingAuth(false);
          return;
        }
        if (event === 'SIGNED_IN' && session) {
          try {
            const me = await spectra.auth.me();
            setUser(me);
            setIsAuthenticated(true);
            setAuthError(null);
          } catch {
            setAuthError({ type: 'auth_required' });
          }
          setIsLoadingAuth(false);
        }
        if (event === 'SIGNED_OUT') {
          setUser(null);
          setIsAuthenticated(false);
          setAuthError({ type: 'auth_required' });
          setIsLoadingAuth(false);
        }
      }
    );

    // If recovery flow, skip normal init — let onAuthStateChange handle it
    if (isRecoveryFlow) {
      return () => subscription.unsubscribe();
    }

    const initAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        try {
          const me = await spectra.auth.me();
          setUser(me);
          setIsAuthenticated(true);
        } catch {
          await supabase.auth.signOut();
          setAuthError({ type: 'auth_required' });
        }
      } else {
        setAuthError({ type: 'auth_required' });
      }
      setIsLoadingAuth(false);
    };
    initAuth();

    return () => subscription.unsubscribe();
  }, []);

  const logout = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{
      user, setUser, isAuthenticated, setIsAuthenticated,
      isLoadingAuth, isLoadingPublicSettings: false,
      authError, appPublicSettings, logout,
      isPasswordRecovery, setIsPasswordRecovery,
      navigateToLogin: () => { window.location.href = '/login'; },
      checkAppState: () => {},
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
