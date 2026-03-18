/**
 * DEV_MODE — single source of truth for auth bypass flag.
 * Set VITE_DEV_MODE=true in .env.local to skip Supabase auth.
 * TODO: remove when auth is fixed.
 */
export const DEV_MODE = import.meta.env.VITE_DEV_MODE === 'true';
