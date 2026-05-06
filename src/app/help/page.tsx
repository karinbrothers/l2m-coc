// src/app/help/page.tsx
//
// Static-feeling Help page that mirrors the welcome tour but as
// a scrollable reference doc. Stage-aware: an FSP, a middle-stage
// processor, and a brand each see content tailored to what they
// actually do in the system.
//
// Includes a "Restart tour" button that flips
// has_completed_onboarding back to false so the modal reappears
// on next page load. Linked from the sidebar.

import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import RestartTourButton from './RestartTourButton'

export const dynamic = 'force-dynamic'

type Stage =
  | 'first_stage_processor'
  | 'middle_stage_processor'
  | 'final_stage_processor'
  | 'final_brand'
  | null

export default async function HelpPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('organization_id')
    .eq('id', user.id)
    .maybeSingle()

  const { data: org } = await supabase
    .from('organizations')
    .select('name, supply_chain_stage')
    .eq('id', profile?.organization_id ?? '')
    .maybeSingle()

  const stage = (org?.supply_chain_stage as Stage) ?? null
  const orgName = org?.name ?? 'your organization'

  return (
    <div className="max-w-3xl mx-auto px-6 py-10">
      <header className="mb-8">
        <p className="text-sm text-gray-500 uppercase tracking-wide mb-1">
          Help
        </p>
        <h1 className="text-3xl font-semibold text-gray-900">
          How {orgName} uses Land to Market
        </h1>
        <p className="mt-3 text-gray-600 leading-relaxed">
          A quick reference for everything in the app, written for
          your role in the chain. If you&apos;d like to walk
          through it as an interactive tour, click below.
        </p>
        <div className="mt-4">
          <RestartTourButton />
        </div>
      </header>

      <HelpBody stage={stage} />

      <hr className="my-12 border-gray-200" />

      <section className="space-y-3 text-gray-700 leading-relaxed">
        <h2 className="text-xl font-semibold text-gray-900">
          Need a hand?
        </h2>
        <p>
          If something doesn&apos;t look right or you&apos;re
          stuck, email{' '}
          <a
            className="text-[#063359] underline"
            href="mailto:kbrothers@savory.global"
          >
            kbrothers@savory.global
          </a>{' '}
          and we&apos;ll get it sorted.
        </p>
      </section>
    </div>
  )
}

// ---------------------------------------------------------------
// Stage-aware body
// ---------------------------------------------------------------

function HelpBody({ stage }: { stage: Stage }) {
  if (stage === 'first_stage_processor') return <FspHelp />
  if (stage === 'middle_stage_processor' || stage === 'final_stage_processor') {
    return <MiddleHelp />
  }
  if (stage === 'final_brand') return <BrandHelp />
  return <GenericHelp />
}

function Section({
  title,
  children,
  href,
  cta,
}: {
  title: string
  children: React.ReactNode
  href?: string
  cta?: string
}) {
  return (
    <section className="border border-gray-200 rounded-2xl p-6 bg-white">
      <h2 className="text-lg font-semibold text-gray-900 mb-2">{title}</h2>
      <div className="text-gray-700 leading-relaxed space-y-3">
        {children}
      </div>
      {href && cta && (
        <Link
          href={href}
          className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-[#063359] hover:underline"
        >
          {cta} <span aria-hidden>→</span>
        </Link>
      )}
    </section>
  )
}

function FspHelp() {
  return (
    <div className="space-y-5">
      <Section title="1. Record purchases from landbases" href="/purchases" cta="Open Purchases">
        <p>
          A purchase is the entry point of L2M-verified wool into
          the chain. You record one for every transaction with a
          landbase &mdash; volume, transaction date, reference
          number.
        </p>
        <p>
          Landbases are pulled from Salesforce, so the dropdown
          only shows ranches your supply group is approved to buy
          from. The system automatically issues an{' '}
          <strong>origin certificate</strong> (OC) for the
          purchase.
        </p>
      </Section>

      <Section title="2. Process into batches" href="/processing" cta="Open Processing">
        <p>
          A processed batch combines one or more purchases into
          finished or semi-finished material. The system tracks
          remaining volume on each purchase, so you can&apos;t
          process more than you&apos;ve received.
        </p>
        <p>
          Origin certificates ride along with each batch, so the
          chain of custody never breaks.
        </p>
      </Section>

      <Section title="3. Sell onward" href="/sales" cta="Open Sales">
        <p>
          When you&apos;re ready to ship to your buyer, log a
          sale. The buyer gets an invitation by email; once they
          accept, a <strong>transaction certificate</strong> (TC)
          is issued automatically with full origin-cert chain.
        </p>
      </Section>

      <Section title="Inventory and certificates" href="/inventory" cta="Open Inventory">
        <p>
          The Inventory page shows how much unprocessed material
          and how much processed material you currently hold.
          Certificates list every OC and TC tied to your
          organization.
        </p>
      </Section>
    </div>
  )
}

function MiddleHelp() {
  return (
    <div className="space-y-5">
      <Section title="1. Inbox &mdash; incoming sales" href="/inbox" cta="Open Inbox">
        <p>
          Your upstream partner sells to you here. Each incoming
          sale shows the volume, the seller, and a preview of the
          full upstream chain &mdash; including the original
          landbases &mdash; <em>before</em> you accept.
        </p>
        <p>
          Accept to add it to your stock; decline to send it back.
        </p>
      </Section>

      <Section title="2. Process into batches" href="/processing" cta="Open Processing">
        <p>
          Once accepted, the wool is in your stock. Combine
          purchases into processed batches. Origin certificates
          carry forward automatically.
        </p>
      </Section>

      <Section title="3. Sell onward" href="/sales" cta="Open Sales">
        <p>
          Log a sale to your downstream buyer. Origin certificates
          accumulate down the chain &mdash; every contributing
          landbase ends up reflected in the final brand&apos;s
          transaction certificate.
        </p>
      </Section>

      <Section title="Trace and certificates" href="/inventory" cta="Open Inventory">
        <p>
          Walk any sale or batch back to source through the Trace
          view. Certificates list every OC and TC tied to your
          organization &mdash; both incoming and outgoing.
        </p>
      </Section>
    </div>
  )
}

function BrandHelp() {
  return (
    <div className="space-y-5">
      <Section title="1. Inbox &mdash; verified wool arrives" href="/inbox" cta="Open Inbox">
        <p>
          Your final-stage processor sends sales to you here.
          Every incoming sale comes with a preview of the full
          upstream chain &mdash; the processors involved and every
          landbase that contributed. Review and accept.
        </p>
      </Section>

      <Section title="2. The transaction certificate" href="/inventory" cta="Open Certificates">
        <p>
          Each accepted sale carries a transaction certificate
          (TC) listing every origin certificate involved. This is
          the document that proves the wool you received was
          sourced from regenerating landbases.
        </p>
      </Section>

      <Section title="3. Walk the chain" href="/inventory" cta="Open Inventory">
        <p>
          Click into any TC and follow the chain back to the
          original landbases. You&apos;ll see who handled the wool
          at every stage and when.
        </p>
      </Section>

      <Section title="4. Your dashboard" href="/" cta="Open Dashboard">
        <p>
          The dashboard rolls up the volume of L2M-verified wool
          that has moved through {`{your organization}`}, the
          landbases behind it, and the partners involved. Use it
          to tell your sustainability story.
        </p>
      </Section>
    </div>
  )
}

function GenericHelp() {
  return (
    <div className="space-y-5">
      <Section title="Dashboard" href="/" cta="Open Dashboard">
        <p>
          Action items and a feed of recent activity for your
          organization.
        </p>
      </Section>
      <Section title="Inbox" href="/inbox" cta="Open Inbox">
        <p>
          Sales sent to you by upstream partners, with a preview
          of the full chain back to landbase.
        </p>
      </Section>
      <Section title="Inventory and certificates" href="/inventory" cta="Open Inventory">
        <p>
          Stock levels and every certificate tied to your
          organization.
        </p>
      </Section>
    </div>
  )
}