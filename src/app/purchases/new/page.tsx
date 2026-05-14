import Link from 'next/link'
import { redirect } from 'next/navigation'
import { requireUser } from '@/lib/auth/requireUser'
import { createClient } from '@/lib/supabase/server'
import PurchaseForm from './PurchaseForm'

type PageProps = {
  searchParams: Promise<{
    error?: string
  }>
}

type LandbaseOption = {
  id: string
  name: string
  country: string | null
  verification_date: string | null
  expiration_date: string | null
  eligibility_status: string | null
}

function errorCopy(code: string | undefined): string | null {
  if (!code) return null
  if (code === 'missing_landbase') return 'Please choose a landbase.'
  if (code === 'missing_shearing_date')
    return 'Please enter the date of shearing.'
  if (code === 'missing_product_name') return 'Please pick a product name.'
  if (code === 'invalid_volume') return 'Volume must be a positive number.'
  if (code === 'invalid_fibre')
    return 'Fibre diameter must be a positive number.'
  if (code === 'invalid_year') return 'Year of clip looks invalid.'
  if (code === 'landbase_not_found')
    return 'That landbase is not visible to your organization.'
  if (code === 'landbase_missing_verification')
    return 'That landbase has no verification dates on record. Ask an admin to confirm the verification window before recording a purchase.'
  if (code === 'landbase_not_eligible_on_date')
    return 'That landbase was not eligible on the shearing date you entered. Adjust the date or pick a different landbase.'
  if (code === 'code_conflict')
    return 'Two purchases were created at the same instant. Try again.'
  if (code === 'attestation_required')
    return 'Please tick the attestation checkbox at the bottom of the form before submitting.'
  return `Error: ${code}`
}

export default async function NewPurchasePage({ searchParams }: PageProps) {
  const user = await requireUser()
  const supabase = await createClient()
  const { error } = await searchParams

  // Gate: only first-stage processors can record direct purchases
  const { data: org } = await supabase
    .from('organizations')
    .select('is_first_stage_processor')
    .eq('id', user.organization_id)
    .maybeSingle()

  if (!org?.is_first_stage_processor) {
    redirect('/purchases?error=not_first_stage')
  }

  // Load every landbase the FSP has access to (RLS handles supply-
  // group scoping). We deliberately do NOT filter by current
  // eligibility_status — eligibility is judged against the SHEARING
  // date, not "right now". The client-side form filters the
  // dropdown to whichever landbases were eligible on the selected
  // shearing date.
  const { data: landbases } = await supabase
    .from('landbases')
    .select(
      'id, name, country, verification_date, expiration_date, eligibility_status',
    )
    .order('name', { ascending: true })
    .returns<LandbaseOption[]>()

  const options = landbases ?? []

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <div className="text-xs text-slate-500">
          <Link href="/purchases" className="hover:text-slate-700">
            ← Back to purchases
          </Link>
        </div>
        <h2 className="mt-2 text-2xl font-semibold text-slate-900">
          New purchase
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Record a wool purchase from a verified landbase. A purchase code
          will be generated automatically.
        </p>
      </div>

      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          {errorCopy(error)}
        </div>
      ) : null}

      {options.length === 0 ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          No landbases are visible to your organization yet. Ask an admin to
          add a landbase before recording a purchase.
        </div>
      ) : (
        <PurchaseForm landbases={options} />
      )}
    </div>
  )
}