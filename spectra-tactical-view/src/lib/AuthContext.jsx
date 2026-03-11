/**
 * AuthContext — Phase 1: super-admin always authenticated.
 * The app renders immediately without waiting for the API.
 * spectra-api connection is only needed for RSU/Alert data, not for gating the UI.
 */
import React, { createContext, useState, useContext, useEffect } from 'react';

const AuthContext = createContext();

// Hardcoded super admin — no login required in Phase 1
const SUPER_ADMIN = {
  id:              'superadmin-001',
  email:           'admin@spectra.io',
  full_name:       'Spectra Admin',
  organization_id: 'org-spectra',
  is_super_admin:  true,
  role:            'admin',
  custom_role:     'admin',
};

export const AuthProvider = ({ children }) => {
  // Always authenticated immediately — no async wait
  const [user]               = useState(SUPER_ADMIN);
  const [isAuthenticated]    = useState(true);
  const [isLoadingAuth]      = useState(false);
  const [isLoadingPublicSettings] = useState(false);
  const [authError]          = useState(null);
  const [appPublicSettings]  = useState({ id: 'spectra', public_settings: {} });

  const logout        = () => {};   // Phase 2
  const navigateToLogin = () => {}; // Phase 2

  return (
    <AuthContext.Provider value={{
      user, isAuthenticated, isLoadingAuth, isLoadingPublicSettings,
      authError, appPublicSettings, logout, navigateToLogin,
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
