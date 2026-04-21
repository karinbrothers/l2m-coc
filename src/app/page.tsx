export default function Home() {
  return (
    <div className="max-w-3xl">
      <h2 className="mb-2 text-2xl font-semibold text-slate-900">
        Welcome to L2M Chain of Custody
      </h2>
      <p className="mb-8 text-slate-600">
        This is the development build of the verified supply chain tracking
        app. Your Next.js app is live and connected to Supabase.
      </p>

      <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h3 className="mb-4 text-lg font-medium text-slate-900">
          Build status
        </h3>
        <ul className="space-y-2 text-sm text-slate-700">
          <li>✓ Next.js 15 + Tailwind v4 scaffolded</li>
          <li>✓ Supabase clients wired (browser, server, middleware)</li>
          <li>✓ Database schema and RLS deployed (staging + production)</li>
          <li>✓ App shell with L2M navy branding</li>
          <li className="text-slate-400">○ Authentication — coming Day 4</li>
          <li className="text-slate-400">○ Inventory page — coming Day 5</li>
          <li className="text-slate-400">
            ○ Certificate PDFs — coming Day 10–11
          </li>
          <li className="text-slate-400">
            ○ Salesforce sync — coming Day 13–14
          </li>
        </ul>
      </div>

      <p className="mt-8 text-xs text-slate-500">
        Ship target: mid-May 2026 · 20 working days from kickoff
      </p>
    </div>
  );
}
