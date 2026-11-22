import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import type { SupabaseClient } from '@supabase/supabase-js';
import { Button, Feedback } from '../components/ui';

export function SignInForm({ client }: { client: SupabaseClient }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError('');
    try {
      const result = await client.auth.signInWithPassword({
        email: String(form.get('email')).trim(),
        password: String(form.get('password')),
      });
      if (result.error) setError('Sign-in failed. Check your email and password, then try again.');
    } catch {
      setError('Could not reach the sign-in service. Try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form className="auth-form" onSubmit={(event) => void submit(event)}>
      <label className="field-label">Email<input className="select-field mt-2 w-full" type="email" name="email" autoComplete="username" required /></label>
      <label className="field-label">Password<input className="select-field mt-2 w-full" type="password" name="password" autoComplete="current-password" required /></label>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <Button type="submit" variant="primary" disabled={pending}>{pending ? 'Signing in…' : 'Sign in'}</Button>
    </form>
  );
}

type Factors = { verified: { id: string; name: string }[]; incomplete: string[] };
type Enrollment = { id: string; qr: string; secret: string };

export function MfaForm({ client }: { client: SupabaseClient }) {
  const [factors, setFactors] = useState<Factors>();
  const [factorId, setFactorId] = useState('');
  const [enrollment, setEnrollment] = useState<Enrollment>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let current = true;
    async function loadFactors() {
      try {
        const { data, error } = await client.auth.mfa.listFactors();
        if (error) throw error;
        if (!current) return;
        const verified = data.totp.map((factor, index) => ({
          id: factor.id,
          name: factor.friendly_name || `Authenticator ${index + 1}`,
        }));
        setFactors({
          verified,
          incomplete: data.all.filter((factor) => factor.factor_type === 'totp' && factor.status === 'unverified')
            .map((factor) => factor.id),
        });
        setFactorId(verified[0]?.id ?? '');
      } catch {
        if (current) setError('Could not load your verification methods.');
      }
    }
    void loadFactors();
    return () => { current = false; };
  }, [attempt, client]);

  async function enroll() {
    if (!factors) return;
    setPending(true);
    setError('');
    try {
      for (const existing of factors.incomplete) {
        const { error } = await client.auth.mfa.unenroll({ factorId: existing });
        if (error) throw error;
        setFactors((current) => current && { ...current, incomplete: current.incomplete.filter((id) => id !== existing) });
      }
      const { data, error } = await client.auth.mfa.enroll({ factorType: 'totp' });
      if (error) throw error;
      setEnrollment({ id: data.id, qr: data.totp.qr_code, secret: data.totp.secret });
    } catch {
      setError('Could not set up an authenticator. Try again.');
    } finally {
      setPending(false);
    }
  }

  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = String(new FormData(event.currentTarget).get('code')).trim();
    setPending(true);
    setError('');
    try {
      const result = await client.auth.mfa.challengeAndVerify({ factorId: enrollment?.id ?? factorId, code });
      if (result.error) throw result.error;
    } catch {
      setError('Verification failed. Enter a current code from your authenticator and try again.');
    } finally {
      setPending(false);
    }
  }

  if (!factors) {
    return error
      ? <Feedback kind="error" title={error} action={<Button onClick={() => { setError(''); setAttempt(attempt + 1); }}>Retry</Button>} />
      : <Feedback kind="loading" title="Loading verification methods" />;
  }
  if (!enrollment && !factors.verified.length) {
    return (
      <div className="auth-form">
        <p>Set up an authenticator app to verify this account.</p>
        {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        <Button variant="primary" disabled={pending} onClick={() => void enroll()}>Set up authenticator</Button>
      </div>
    );
  }

  return (
    <form className="auth-form" onSubmit={(event) => void verify(event)}>
      {enrollment ? (
        <>
          <p>Scan this code with your authenticator app or enter the setup key.</p>
          <img className="auth-qr" src={enrollment.qr} width="176" height="176" alt="Authenticator setup QR code" />
          <p><strong>Setup key</strong><code className="mt-1 block break-all select-all">{enrollment.secret}</code></p>
        </>
      ) : <p>Enter the current code from your authenticator app.</p>}
      {!enrollment && factors.verified.length > 1 && (
        <label className="field-label">Authenticator
          <select className="select-field mt-2 w-full" value={factorId} onChange={(event) => setFactorId(event.target.value)}>
            {factors.verified.map((factor) => <option key={factor.id} value={factor.id}>{factor.name}</option>)}
          </select>
        </label>
      )}
      <label className="field-label">Verification code
        <input className="select-field mt-2 w-full" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required />
      </label>
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <Button type="submit" variant="primary" disabled={pending}>{pending ? 'Verifying…' : 'Verify code'}</Button>
    </form>
  );
}
