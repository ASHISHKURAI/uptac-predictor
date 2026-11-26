import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router'
import { KeyRound, Lock, Mail, MailCheck, User } from 'lucide-react'
import { supabase, errorMessage } from '@/lib/supabase'
import { env } from '@/lib/env'
import { useAuth } from '@/lib/auth'
import { Seo } from '@/components/common/Seo'
import { ConfigNotice } from '@/components/common/ConfigNotice'
import { LogoMark } from '@/components/layout/Logo'
import { Button } from '@/components/ui/Button'
import { Checkbox, Field, Input } from '@/components/ui/Form'
import { Alert } from '@/components/ui/Feedback'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function safeNext(next: string | null): string {
  // Only allow same-site relative paths (prevents open redirects).
  return next && next.startsWith('/') && !next.startsWith('//') ? next : '/dashboard'
}

function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="relative grid min-h-[calc(100dvh-4.5rem)] place-items-center overflow-hidden px-4 py-12">
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-royal-50 to-white" aria-hidden />
      <div className="bg-grid pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" aria-hidden />
      <div className="relative w-full max-w-md animate-fade-up">
        <div className="rounded-3xl border border-navy-100 bg-white p-7 shadow-[var(--shadow-lift)] sm:p-9">
          <LogoMark className="h-11 w-11" />
          <h1 className="mt-5 text-2xl font-extrabold text-navy-950">{title}</h1>
          <p className="mt-1.5 text-sm text-navy-500">{subtitle}</p>
          <div className="mt-7">{supabase ? children : <ConfigNotice compact />}</div>
        </div>
        {footer && <div className="mt-6 text-center text-sm text-navy-600">{footer}</div>}
      </div>
    </div>
  )
}

function GoogleButton({ next }: { next: string }) {
  const [loading, setLoading] = useState(false)
  if (!env.enableGoogleAuth) return null
  return (
    <>
      <Button
        variant="outline"
        className="w-full"
        loading={loading}
        onClick={async () => {
          setLoading(true)
          await supabase?.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: `${env.siteUrl}${next}` } })
        }}
      >
        Continue with Google
      </Button>
      <div className="my-5 flex items-center gap-3 text-xs text-navy-400">
        <span className="h-px flex-1 bg-navy-100" /> or <span className="h-px flex-1 bg-navy-100" />
      </div>
    </>
  )
}

export function LoginPage() {
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const navigate = useNavigate()
  const { user } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState<'password' | 'magic'>('password')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  useEffect(() => {
    if (user) navigate(next, { replace: true })
  }, [user, next, navigate])

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (!EMAIL_RE.test(email)) return setError('Enter a valid email address.')
    if (mode === 'password' && password.length < 8) return setError('Password must be at least 8 characters.')
    setLoading(true)
    try {
      if (mode === 'password') {
        const { error: err } = await supabase!.auth.signInWithPassword({ email: email.trim(), password })
        if (err) throw err
        navigate(next, { replace: true })
      } else {
        const { error: err } = await supabase!.auth.signInWithOtp({ email: email.trim(), options: { emailRedirectTo: `${env.siteUrl}${next}`, shouldCreateUser: false } })
        if (err) throw err
        setSent(true)
      }
    } catch (err) {
      const msg = errorMessage(err)
      setError(/invalid login credentials/i.test(msg) ? 'Incorrect email or password.' : /email not confirmed/i.test(msg) ? 'Please confirm your email address first – check your inbox.' : msg)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell
      title="Welcome back"
      subtitle="Sign in to save colleges, predictions and choice lists."
      footer={
        <>
          New to UPTAC Predictor?{' '}
          <Link to={`/auth/signup${params.get('next') ? `?next=${encodeURIComponent(next)}` : ''}`} className="font-semibold text-royal-600 hover:underline">
            Create a free account
          </Link>
        </>
      }
    >
      <Seo title="Sign in" noindex />
      {sent ? (
        <Alert tone="success" title="Check your email">
          We sent a sign-in link to {email}. Open it on this device to continue.
        </Alert>
      ) : (
        <>
          <GoogleButton next={next} />
          <form onSubmit={submit} className="space-y-4" noValidate>
            {error && <Alert tone="error">{error}</Alert>}
            <Field label="Email">
              {({ id }) => <Input id={id} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} leftIcon={<Mail className="h-4 w-4" />} required />}
            </Field>
            {mode === 'password' && (
              <Field label="Password">
                {({ id }) => (
                  <Input id={id} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} leftIcon={<Lock className="h-4 w-4" />} required />
                )}
              </Field>
            )}
            <div className="flex items-center justify-between text-sm">
              <button type="button" onClick={() => setMode(mode === 'password' ? 'magic' : 'password')} className="font-semibold text-royal-600 hover:underline">
                {mode === 'password' ? 'Email me a sign-in link' : 'Use password instead'}
              </button>
              <Link to="/auth/forgot-password" className="text-navy-500 hover:text-navy-800">
                Forgot password?
              </Link>
            </div>
            <Button type="submit" className="w-full" loading={loading}>
              {mode === 'password' ? 'Sign in' : 'Send sign-in link'}
            </Button>
          </form>
        </>
      )}
    </AuthShell>
  )
}

export function SignupPage() {
  const [params] = useSearchParams()
  const next = safeNext(params.get('next'))
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [agree, setAgree] = useState(false)
  const [loading, setLoading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [done, setDone] = useState(false)
  const navigate = useNavigate()

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    const errs: Record<string, string> = {}
    if (name.trim().length < 2) errs.name = 'Enter your name.'
    if (!EMAIL_RE.test(email)) errs.email = 'Enter a valid email address.'
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) errs.password = 'Use at least 8 characters with letters and numbers.'
    if (confirm !== password) errs.confirm = 'Passwords do not match.'
    if (!agree) errs.agree = 'Please accept the terms and disclaimer.'
    setErrors(errs)
    if (Object.keys(errs).length) return
    setLoading(true)
    try {
      const { data, error } = await supabase!.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { full_name: name.trim() }, emailRedirectTo: `${env.siteUrl}${next}` },
      })
      if (error) throw error
      if (data.session) navigate(next, { replace: true })
      else setDone(true)
    } catch (err) {
      setErrors({ form: errorMessage(err) })
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell
      title="Create your free account"
      subtitle="Save colleges, keep your prediction history and build choice lists."
      footer={
        <>
          Already have an account?{' '}
          <Link to="/auth/login" className="font-semibold text-royal-600 hover:underline">
            Sign in
          </Link>
        </>
      }
    >
      <Seo title="Create account" noindex />
      {done ? (
        <Alert tone="success" title="Confirm your email">
          <span className="flex items-start gap-2">
            <MailCheck className="h-4 w-4 shrink-0" aria-hidden /> We sent a confirmation link to {email}. Click it to activate your account.
          </span>
        </Alert>
      ) : (
        <>
          <GoogleButton next={next} />
          <form onSubmit={submit} className="space-y-4" noValidate>
            {errors.form && <Alert tone="error">{errors.form}</Alert>}
            <Field label="Full name" error={errors.name}>
              {({ id, invalid }) => <Input id={id} autoComplete="name" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} leftIcon={<User className="h-4 w-4" />} aria-invalid={invalid} />}
            </Field>
            <Field label="Email" error={errors.email}>
              {({ id, invalid }) => <Input id={id} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} leftIcon={<Mail className="h-4 w-4" />} aria-invalid={invalid} />}
            </Field>
            <Field label="Password" error={errors.password} hint="At least 8 characters, with letters and numbers.">
              {({ id, invalid, describedBy }) => (
                <Input id={id} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} leftIcon={<Lock className="h-4 w-4" />} aria-invalid={invalid} aria-describedby={describedBy} />
              )}
            </Field>
            <Field label="Confirm password" error={errors.confirm}>
              {({ id, invalid }) => <Input id={id} type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} leftIcon={<KeyRound className="h-4 w-4" />} aria-invalid={invalid} />}
            </Field>
            <Checkbox
              checked={agree}
              onChange={(e) => setAgree(e.target.checked)}
              label={
                <>
                  I agree to the <Link to="/terms" className="text-royal-600 underline">terms</Link> and understand the{' '}
                  <Link to="/disclaimer" className="text-royal-600 underline">disclaimer</Link>
                </>
              }
            />
            {errors.agree && <p className="text-xs font-medium text-red-600">{errors.agree}</p>}
            <Button type="submit" className="w-full" loading={loading}>
              Create account
            </Button>
          </form>
        </>
      )}
    </AuthShell>
  )
}

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState(false)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!EMAIL_RE.test(email)) return setError('Enter a valid email address.')
    setLoading(true)
    setError(null)
    const { error: err } = await supabase!.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${env.siteUrl}/auth/reset-password` })
    setLoading(false)
    // Always show success to avoid revealing which emails are registered.
    if (err && !/rate limit/i.test(err.message)) console.warn(err.message)
    if (err && /rate limit/i.test(err.message)) setError('Too many requests – please wait a few minutes and try again.')
    else setSent(true)
  }

  return (
    <AuthShell title="Reset your password" subtitle="We will email you a secure link to choose a new password." footer={<Link to="/auth/login" className="font-semibold text-royal-600 hover:underline">Back to sign in</Link>}>
      <Seo title="Reset password" noindex />
      {sent ? (
        <Alert tone="success" title="Check your email">
          If an account exists for {email}, a password reset link is on its way.
        </Alert>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          {error && <Alert tone="error">{error}</Alert>}
          <Field label="Email">
            {({ id }) => <Input id={id} type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} leftIcon={<Mail className="h-4 w-4" />} />}
          </Field>
          <Button type="submit" className="w-full" loading={loading}>
            Send reset link
          </Button>
        </form>
      )}
    </AuthShell>
  )
}

export function ResetPasswordPage() {
  const { session, loading: authLoading } = useAuth()
  const navigate = useNavigate()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) return setError('Use at least 8 characters with letters and numbers.')
    if (password !== confirm) return setError('Passwords do not match.')
    setLoading(true)
    const { error: err } = await supabase!.auth.updateUser({ password })
    setLoading(false)
    if (err) setError(errorMessage(err))
    else navigate('/dashboard', { replace: true })
  }

  return (
    <AuthShell title="Choose a new password" subtitle="Enter a strong password you have not used before.">
      <Seo title="Choose new password" noindex />
      {!authLoading && !session ? (
        <Alert tone="warning" title="Reset link expired or invalid">
          Request a new link from the <Link to="/auth/forgot-password" className="font-semibold underline">forgot password</Link> page.
        </Alert>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          {error && <Alert tone="error">{error}</Alert>}
          <Field label="New password">
            {({ id }) => <Input id={id} type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} leftIcon={<Lock className="h-4 w-4" />} />}
          </Field>
          <Field label="Confirm new password">
            {({ id }) => <Input id={id} type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} leftIcon={<KeyRound className="h-4 w-4" />} />}
          </Field>
          <Button type="submit" className="w-full" loading={loading}>
            Update password
          </Button>
        </form>
      )}
    </AuthShell>
  )
}
