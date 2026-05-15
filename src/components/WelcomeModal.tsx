// src/components/WelcomeModal.tsx
//
// Stage-aware first-login welcome tour. Self-bootstrapping:
// drop <WelcomeModal /> into layout.tsx and it handles everything.
//
// Gating: if profiles.full_name is empty, the modal blocks with
// a "tell us your name" step — no Skip, no dismiss — until the
// user saves a name. The cert footer reads "Joe Smith, Acme Wool
// Co." rather than an email, so the name is required by design.
//
// After the name step (or if already set), it runs the stage-
// specific tour: FSP, mid-stream processor, or brand.

'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

type Stage =
  | 'first_stage_processor'
  | 'middle_stage_processor'
  | 'final_stage_processor'
  | 'final_brand'
  | null

type Step = {
  title: string
  body: React.ReactNode
  cta?: { label: string; href: string }
}

export default function WelcomeModal() {
  const [show, setShow] = useState(false)
  const [stage, setStage] = useState<Stage>(null)
  const [orgName, setOrgName] = useState<string>('')
  const [stepIdx, setStepIdx] = useState(0)
  const [closing, setClosing] = useState(false)

  // Name-capture state: when true, we render a blocking name
  // input form INSTEAD of the tour steps. Skip tour is hidden,
  // dismiss is disabled — has to be saved before anything else.
  const [needsName, setNeedsName] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [savingName, setSavingName] = useState(false)
  const [nameError, setNameError] = useState<string | null>(null)
  const [tourDone, setTourDone] = useState(false)

  useEffect(() => {
    let cancelled = false
    const run = async () => {
      const supabase = createClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const { data: profile } = await supabase
        .from('profiles')
        .select('has_completed_onboarding, organization_id, full_name')
        .eq('id', user.id)
        .maybeSingle()

      if (!profile) return

      const missingName =
        !profile.full_name || profile.full_name.trim().length === 0
      const tourDoneAlready = !!profile.has_completed_onboarding

      // If both are done, nothing to show.
      if (!missingName && tourDoneAlready) return

      const { data: org } = await supabase
        .from('organizations')
        .select(
          'name, supply_chain_stage, is_first_stage_processor, is_final_brand',
        )
        .eq('id', profile.organization_id)
        .maybeSingle()

      if (cancelled) return
      setStage(deriveStage(org))
      setOrgName(org?.name ?? '')
      setNeedsName(missingName)
      setTourDone(tourDoneAlready)
      setShow(true)
    }
    run()
    return () => {
      cancelled = true
    }
  }, [])

  if (!show) return null

  const steps = stepsForStage(stage, orgName)
  const step = steps[stepIdx]
  const isLast = stepIdx === steps.length - 1

  const finishTour = async () => {
    setClosing(true)
    const supabase = createClient()
    await supabase.rpc('mark_onboarding_complete')
    setShow(false)
  }

  const saveName = async () => {
    const value = nameDraft.trim()
    if (value.length === 0) {
      setNameError('Please enter your full name.')
      return
    }
    setSavingName(true)
    setNameError(null)
    const supabase = createClient()
    const { error } = await supabase.rpc('set_profile_full_name', {
      p_full_name: value,
    })
    setSavingName(false)
    if (error) {
      setNameError(
        error.message === 'name_required'
          ? 'Please enter your full name.'
          : 'Could not save. Please try again.',
      )
      return
    }
    setNeedsName(false)
    // If the tour was already done in a previous session, we can
    // just close the modal now — they only had to come back for
    // the name. Otherwise, fall through to the tour.
    if (tourDone) {
      setShow(false)
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4"
    >
      <div className="w-full max-w-xl rounded-2xl bg-white shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="bg-[#063359] px-6 py-4 flex items-center justify-between">
          <span className="text-white text-sm font-medium tracking-wide">
            Welcome to Land to Market
          </span>
          {!needsName ? (
            <span className="text-white/70 text-xs">
              Step {stepIdx + 1} of {steps.length}
            </span>
          ) : null}
        </div>

        {/* Progress bar (hidden during name capture) */}
        {!needsName ? (
          <div className="h-1 bg-gray-100">
            <div
              className="h-1 bg-[#063359] transition-all duration-300"
              style={{ width: `${((stepIdx + 1) / steps.length) * 100}%` }}
            />
          </div>
        ) : null}

        {/* Body */}
        {needsName ? (
          <NameCaptureBody
            nameDraft={nameDraft}
            setNameDraft={setNameDraft}
            saving={savingName}
            error={nameError}
            onSave={saveName}
          />
        ) : (
          <div className="px-6 py-6 min-h-[200px]">
            <h2
              id="welcome-title"
              className="text-xl font-semibold text-gray-900 mb-3"
            >
              {step.title}
            </h2>
            <div className="text-gray-700 leading-relaxed text-[15px]">
              {step.body}
            </div>

            {step.cta && (
              <div className="mt-5">
                <Link
                  href={step.cta.href}
                  onClick={finishTour}
                  className="inline-flex items-center gap-2 rounded-lg bg-[#063359] px-4 py-2 text-white text-sm font-medium hover:bg-[#0a4a7e] transition"
                >
                  {step.cta.label}
                  <span aria-hidden>→</span>
                </Link>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        {!needsName ? (
          <div className="px-6 py-4 bg-gray-50 flex items-center justify-between border-t">
            <button
              type="button"
              onClick={() => setStepIdx(Math.max(0, stepIdx - 1))}
              disabled={stepIdx === 0 || closing}
              className="text-sm text-gray-500 hover:text-gray-800 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              ← Back
            </button>

            <button
              type="button"
              onClick={finishTour}
              className="text-xs text-gray-400 hover:text-gray-700"
            >
              Skip tour
            </button>

            {!isLast ? (
              <button
                type="button"
                onClick={() => setStepIdx(stepIdx + 1)}
                disabled={closing}
                className="rounded-lg bg-[#063359] px-4 py-2 text-white text-sm font-medium hover:bg-[#0a4a7e] transition disabled:opacity-50"
              >
                Next →
              </button>
            ) : (
              <button
                type="button"
                onClick={finishTour}
                disabled={closing}
                className="rounded-lg bg-[#063359] px-4 py-2 text-white text-sm font-medium hover:bg-[#0a4a7e] transition disabled:opacity-50"
              >
                {closing ? 'Saving…' : 'Get started'}
              </button>
            )}
          </div>
        ) : (
          <div className="px-6 py-4 bg-gray-50 flex items-center justify-end border-t">
            <button
              type="button"
              onClick={saveName}
              disabled={savingName || nameDraft.trim().length === 0}
              className="rounded-lg bg-[#063359] px-4 py-2 text-white text-sm font-medium hover:bg-[#0a4a7e] transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {savingName ? 'Saving…' : 'Save & continue'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------
// Name capture body
// ---------------------------------------------------------------

function NameCaptureBody({
  nameDraft,
  setNameDraft,
  saving,
  error,
  onSave,
}: {
  nameDraft: string
  setNameDraft: (v: string) => void
  saving: boolean
  error: string | null
  onSave: () => void
}) {
  return (
    <div className="px-6 py-6 min-h-[200px]">
      <h2
        id="welcome-title"
        className="text-xl font-semibold text-gray-900 mb-3"
      >
        First, what should we call you?
      </h2>
      <p className="text-gray-700 leading-relaxed text-[15px] mb-4">
        Your full name appears on every certificate you attest, so chain
        partners and L2M auditors know exactly who confirmed each step. You
        can update it later from your profile.
      </p>
      <label
        htmlFor="full_name"
        className="mb-1 block text-sm font-medium text-slate-700"
      >
        Full name <span className="text-red-600">*</span>
      </label>
      <input
        id="full_name"
        type="text"
        value={nameDraft}
        onChange={(e) => setNameDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !saving && nameDraft.trim().length > 0) {
            onSave()
          }
        }}
        autoFocus
        disabled={saving}
        placeholder="e.g. Joe Smith"
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-slate-900 shadow-sm focus:border-[#063359] focus:outline-none focus:ring-1 focus:ring-[#063359] disabled:opacity-60"
      />
      {error ? (
        <p className="mt-2 text-xs text-red-600">{error}</p>
      ) : (
        <p className="mt-2 text-xs text-slate-500">
          We can&rsquo;t continue without this — it&rsquo;s what makes
          attestations binding.
        </p>
      )}
    </div>
  )
}

// ---------------------------------------------------------------
// Stage derivation: prefer the text column, fall back to booleans
// ---------------------------------------------------------------

type OrgRow = {
  supply_chain_stage?: string | null
  is_first_stage_processor?: boolean | null
  is_final_brand?: boolean | null
} | null

function deriveStage(org: OrgRow): Stage {
  const text = (org?.supply_chain_stage ?? '').toLowerCase().trim()
  if (text === 'first_stage_processor') return 'first_stage_processor'
  if (text === 'middle_stage_processor') return 'middle_stage_processor'
  if (text === 'final_stage_processor') return 'final_stage_processor'
  if (text === 'final_brand') return 'final_brand'

  if (org?.is_final_brand) return 'final_brand'
  if (org?.is_first_stage_processor) return 'first_stage_processor'
  return 'middle_stage_processor'
}

// ---------------------------------------------------------------
// Step content per stage
// ---------------------------------------------------------------

function stepsForStage(stage: Stage, orgName: string): Step[] {
  if (stage === 'first_stage_processor') return fspSteps(orgName)
  if (stage === 'middle_stage_processor' || stage === 'final_stage_processor') {
    return middleSteps(orgName)
  }
  if (stage === 'final_brand') return brandSteps(orgName)
  return genericSteps(orgName)
}

function fspSteps(org: string): Step[] {
  return [
    {
      title: `Welcome${org ? `, ${org}` : ''}.`,
      body: (
        <>
          <p>You&apos;re set up as a <strong>First Stage Processor</strong>. Your role in the L2M chain of custody is to record verified wool you&apos;ve purchased from regenerating landbases and move it forward to your buyers with full traceability.</p>
          <p className="mt-3">This quick tour will show you the four things you&apos;ll do most often.</p>
        </>
      ),
    },
    {
      title: 'Record purchases from landbases',
      body: (
        <>
          <p>Every batch starts with a <strong>purchase</strong> from a verified landbase. Landbases are pulled directly from Salesforce, so you only see the ones you&apos;re approved to buy from.</p>
          <p className="mt-3">Record volume, transaction date, and reference number, and the system creates an <strong>origin certificate</strong> automatically.</p>
        </>
      ),
      cta: { label: 'Open Purchases', href: '/purchases' },
    },
    {
      title: 'Process into batches',
      body: (
        <p>Combine one or more purchases into a <strong>processed batch</strong>. Volumes are tracked automatically — you can&apos;t process more than you&apos;ve purchased, so the chain stays mass-balanced end to end.</p>
      ),
      cta: { label: 'Open Processing', href: '/processing' },
    },
    {
      title: 'Sell onward',
      body: (
        <p>Log a <strong>sale</strong> to your buyer. They&apos;ll get an invitation to accept it. Once accepted, a <strong>transaction certificate</strong> is issued automatically, carrying every origin certificate down the chain.</p>
      ),
      cta: { label: 'Open Sales', href: '/sales' },
    },
    {
      title: 'You’re set.',
      body: (
        <p>Your <strong>dashboard</strong> shows action items, stock levels, and recent activity. If you ever want to revisit this tour, open <Link href="/help" className="text-[#063359] underline">Help</Link> from the sidebar.</p>
      ),
    },
  ]
}

function middleSteps(org: string): Step[] {
  return [
    {
      title: `Welcome${org ? `, ${org}` : ''}.`,
      body: (
        <p>You&apos;re a processor in the middle of the L2M chain. Verified wool will arrive from your upstream partner; you&apos;ll process it and sell it onward to the next stage. The chain of custody follows the wool the entire way.</p>
      ),
    },
    {
      title: 'Check your inbox',
      body: (
        <p>When an upstream partner sells to you, it appears in your <strong>Inbox</strong>. Before you accept, you can preview the full upstream chain — back to the original landbases — so you know exactly what you&apos;re receiving.</p>
      ),
      cta: { label: 'Open Inbox', href: '/inbox' },
    },
    {
      title: 'Process into batches',
      body: (
        <p>Once accepted, the wool joins your stock. Combine purchases into <strong>processed batches</strong> as normal — the system carries every origin certificate forward automatically.</p>
      ),
      cta: { label: 'Open Processing', href: '/processing' },
    },
    {
      title: 'Sell onward',
      body: (
        <p>Log a sale to your downstream buyer. Origin certificates <strong>accumulate</strong> down the chain — the final brand will see provenance for every landbase that contributed to their order.</p>
      ),
      cta: { label: 'Open Sales', href: '/sales' },
    },
    {
      title: 'You’re set.',
      body: (
        <p>Watch your <strong>dashboard</strong> for action items. If you want to revisit this tour, open <Link href="/help" className="text-[#063359] underline">Help</Link> from the sidebar anytime.</p>
      ),
    },
  ]
}

function brandSteps(org: string): Step[] {
  return [
    {
      title: `Welcome${org ? `, ${org}` : ''}.`,
      body: (
        <>
          <p>You&apos;re here as a <strong>brand</strong>. This is where verified wool arrives at your door — with full provenance back to the regenerating landbases it came from.</p>
          <p className="mt-3">A quick tour of the four things you&apos;ll do most.</p>
        </>
      ),
    },
    {
      title: 'Verified wool arrives in your inbox',
      body: (
        <p>When your final-stage processor sends you a sale, it shows up in <strong>Inbox</strong>. You can preview the full upstream chain — every processor, every landbase — before you accept.</p>
      ),
      cta: { label: 'Open Inbox', href: '/inbox' },
    },
    {
      title: 'Walk the chain',
      body: (
        <p>Every accepted sale carries a <strong>transaction certificate</strong> with origin certificates from each contributing landbase. Use the <strong>Certificates</strong> page to walk the full chain back to source.</p>
      ),
      cta: { label: 'Open Certificates', href: '/certificates' },
    },
    {
      title: 'See the regenerative footprint',
      body: (
        <p>Your <strong>dashboard</strong> rolls up the volume of L2M-verified wool that has moved through your organization, the landbases behind it, and the supply chain partners involved. It&apos;s your story, ready to share.</p>
      ),
      cta: { label: 'Open Dashboard', href: '/' },
    },
    {
      title: 'You’re set.',
      body: (
        <p>Watch your <strong>inbox</strong> — verified material from your supply chain will arrive there. If you want to revisit this tour, open <Link href="/help" className="text-[#063359] underline">Help</Link> from the sidebar anytime.</p>
      ),
    },
  ]
}

function genericSteps(org: string): Step[] {
  return [
    {
      title: `Welcome${org ? `, ${org}` : ''}.`,
      body: (
        <p>You&apos;re signed in to Land to Market — Chain of Custody. Your dashboard shows action items and recent activity; the sidebar has everything else.</p>
      ),
    },
    {
      title: 'You’re set.',
      body: (
        <p>If you want to revisit this tour, open <Link href="/help" className="text-[#063359] underline">Help</Link> from the sidebar.</p>
      ),
    },
  ]
}