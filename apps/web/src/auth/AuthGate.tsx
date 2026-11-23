import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createClient } from '@supabase/supabase-js';
import type { Session } from '@supabase/supabase-js';
import { adminProfileSchema, apiErrorResponseSchema } from '@fuel-feet/shared';
import { Fuel } from 'lucide-react';
import { Button, Feedback } from '../components/ui';
import { SignInForm, MfaForm } from './AuthForms';

const url = import.meta.env.VITE_SUPABASE_URL;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const auth = url && key ? createClient(url, key, {
  auth: { detectSessionInUrl: false, storageKey: 'fuel-feet-auth' },
}) : undefined;
const apiBase = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');
const demo = import.meta.env.DEV && import.meta.env.VITE_DEMO_MODE === 'true' && !auth;

type Access = 'allowed' | 'mfa' | 'denied' | 'expired';

async function verifyAccess(token: string, signal: AbortSignal): Promise<Access> {
  const response = await fetch(`${apiBase}/me`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: 'no-store',
    signal,
  });

  if (response.ok) {
    adminProfileSchema.parse(await response.json());
    return 'allowed';
  }
  if (response.status === 401) return 'expired';
  if (response.status === 403) {
    const result = apiErrorResponseSchema.parse(await response.json());
    return result.error.code === 'MFA_REQUIRED' ? 'mfa' : 'denied';
  }
  throw new Error('Unable to verify access');
}

function AuthScreen({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="auth-screen">
      <section className="panel auth-panel">
        <div className="brand"><span className="brand-mark"><Fuel size={19} aria-hidden="true" /></span>Fuel Feet</div>
        <h1>{title}</h1>
        {children}
      </section>
    </main>
  );
}

export function AuthGate({ children }: { children: (account?: ReactNode, accessToken?: string) => ReactNode }) {
  const [state, setState] = useState<{ session: Session | null; revision: number }>();
  const [logout, setLogout] = useState<'idle' | 'pending' | 'error'>('idle');
  const location = useLocation();
  const queries = useQueryClient();
  const session = state?.session;
  const access = useQuery({
    queryKey: ['workspace-access', session?.user.id, state?.revision],
    enabled: Boolean(session),
    queryFn: ({ signal }) => verifyAccess(session!.access_token, signal),
    retry: false,
    gcTime: 0,
    refetchOnWindowFocus: 'always',
    refetchInterval: 60_000,
  });

  useEffect(() => {
    if (!auth) return;
    const { data } = auth.auth.onAuthStateChange((event, nextSession) => {
      if (event === 'SIGNED_OUT') {
        queries.clear();
        setLogout('idle');
      }
      setState((previous) => previous?.session?.access_token === nextSession?.access_token && previous
        ? previous
        : { session: nextSession, revision: (previous?.revision ?? 0) + 1 });
    });
    return () => data.subscription.unsubscribe();
  }, [queries]);

  async function signOut() {
    if (!auth) return;
    setLogout('pending');
    try {
      const { error } = await auth.auth.signOut({ scope: 'local' });
      if (error) throw error;
      queries.clear();
      setLogout('idle');
    } catch {
      setLogout('error');
    }
  }

  const signOutControl = (
    <div className="min-w-0">
      <Button onClick={() => void signOut()} disabled={logout === 'pending'}>{logout === 'pending' ? 'Signing out…' : 'Sign out'}</Button>
      {logout === 'error' && <p role="alert" className="mt-2 text-sm text-danger">Sign-out failed. Try again.</p>}
    </div>
  );

  if (demo) return children();
  if (!auth) return <AuthScreen title="Sign-in unavailable"><p>Configure the workspace authentication service to continue.</p></AuthScreen>;

  const authPage = location.pathname === '/login' || location.pathname === '/mfa';
  const savedReturn: unknown = location.state?.returnTo;
  const returnTo = authPage
    ? typeof savedReturn === 'string' && savedReturn.startsWith('/') && !savedReturn.startsWith('//') && !savedReturn.includes('\\') ? savedReturn : '/'
    : location.pathname + location.search;

  if (!state || session && access.isPending) {
    return <AuthScreen title="Checking access"><Feedback kind="loading" title="Verifying your session" /></AuthScreen>;
  }
  if (!session) {
    if (location.pathname !== '/login') return <Navigate to="/login" state={{ returnTo }} replace />;
    return <AuthScreen title="Sign in"><SignInForm client={auth} /></AuthScreen>;
  }
  if (access.isError || access.data === 'expired' || access.data === 'denied') {
    const title = access.isError ? 'Unable to verify access' : access.data === 'expired' ? 'Session expired' : 'Access denied';
    return (
      <AuthScreen title={title}>
        {access.data === 'denied' && <p>This account does not have workspace access.</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          {access.isError && <Button onClick={() => void access.refetch()} disabled={access.isFetching}>Retry verification</Button>}
          {signOutControl}
        </div>
      </AuthScreen>
    );
  }
  if (access.data === 'mfa') {
    if (location.pathname !== '/mfa') return <Navigate to="/mfa" state={{ returnTo }} replace />;
    return <AuthScreen title="Two-factor verification"><MfaForm client={auth} />{signOutControl}</AuthScreen>;
  }
  if (authPage) return <Navigate to={returnTo} replace />;
  return children(signOutControl, session.access_token);
}
