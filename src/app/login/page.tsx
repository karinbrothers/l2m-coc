import { sendMagicLink } from './actions'

type LoginPageProps = {
  searchParams: Promise<{
    sent?: string
    email?: string
    error?: string
    next?: string
  }>
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const { sent, email, error, next } = await searchParams

  return (
    <div className="mx-auto max-w-md">
      <div className="rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
        <h2 className="mb-2 text-2xl font-semibold text-slate-900">Sign in</h2>
        <p className="mb-6 text-sm text-slate-600">
          Enter your email and we&apos;ll send you a one-time sign-in link.
        </p>

        {sent ? (
          <div className="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            <p className="font-medium">Check your inbox</p>
            <p className="mt-1 text-emerald-800">
              We sent a sign-in link to <strong>{email}</strong>. Click it to
              continue. The link is valid for 1 hour.
            </p>
            <p className="mt-3 text-xs text-emerald-700">
              No email? Check spam, or{' '}
              <a href="/login" className="underline">
                try again
              </a>
              .
            </p>
          </div>
        ) : (
          <form action={sendMagicLink} className="space-y-4">
            {next ? <input type="hidden" name="next" value={next} /> : null}
            <div>
              <label
                htmlFor="email"
                className="mb-1 block text-sm font-medium text-slate-700"
              >
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                autoFocus
                className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-[#063359] focus:outline-none focus:ring-1 focus:ring-[#063359]"
                placeholder="you@landtomarket.com"
              />
            </div>

            {error ? (
              <p className="text-sm text-red-600">
                {error === 'missing_email'
                  ? 'Please enter your email address.'
                  : `Sign-in failed: ${error}`}
              </p>
            ) : null}

            <button
              type="submit"
              className="w-full rounded-md bg-[#063359] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#0a4a7e] focus:outline-none focus:ring-2 focus:ring-[#063359] focus:ring-offset-2"
            >
              Send sign-in link
            </button>
          </form>
        )}
      </div>

      <p className="mt-4 text-center text-xs text-slate-500">
        L2M Chain of Custody · development
      </p>
    </div>
  )
}
