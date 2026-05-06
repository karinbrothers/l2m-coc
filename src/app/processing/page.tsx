import Link from 'next/link'
import { requireUser } from '@/lib/auth/requireUser'
import { createClient } from '@/lib/supabase/server'

type Batch = {
  id: string
  input_total_volume: number
  output_volume: number
  output_product: string
  processing_method: string | null
  processing_date: string
  inventory_lots: { code: string; volume_remaining: number }[]
}

export default async function ProcessingPage() {
  await requireUser()
  const supabase = await createClient()

  const { data: batches } = await supabase
    .from('processing_batches')
    .select(
      'id, input_total_volume, output_volume, output_product, processing_method, processing_date, inventory_lots(code, volume_remaining)',
    )
    .order('processing_date', { ascending: false })
    .returns<Batch[]>()

  const list = batches ?? []
  const totalInput = list.reduce((s, b) => s + Number(b.input_total_volume), 0)
  const totalOutput = list.reduce((s, b) => s + Number(b.output_volume), 0)
  const yieldPct =
    totalInput > 0 ? Math.round((totalOutput / totalInput) * 100) : 0

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Processing</h2>
          <p className="mt-1 text-sm text-slate-600">
            Records of unprocessed material processed into inventory lots ready for sale.
          </p>
        </div>
        <Link
          href="/processing/new"
          className="rounded-md bg-[#063359] px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#0a4a7e]"
        >
          + New batch
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-xs font-medium uppercase text-slate-500">
            Batches
          </div>
          <div className="mt-2 text-3xl font-semibold text-slate-900">
            {list.length}
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-xs font-medium uppercase text-slate-500">
            Volume processed
          </div>
          <div className="mt-2 text-3xl font-semibold text-slate-900">
            {totalInput.toFixed(1)} t
          </div>
          <div className="mt-1 text-xs text-slate-500">
            → {totalOutput.toFixed(1)} t output ({yieldPct}% yield)
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-xs font-medium uppercase text-slate-500">
            Lots created
          </div>
          <div className="mt-2 text-3xl font-semibold text-slate-900">
            {list.length}
          </div>
        </div>
      </div>

      {list.length === 0 ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
          No processing batches yet. Record one to convert unprocessed material into
          inventory lots ready for sale.
        </div>
      ) : (
        <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-6 py-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
            All batches
          </div>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-6 py-3">Date</th>
                <th className="px-6 py-3">Output product</th>
                <th className="px-6 py-3">Lot</th>
                <th className="px-6 py-3">Input</th>
                <th className="px-6 py-3">Output</th>
                <th className="px-6 py-3">Yield</th>
                <th className="px-6 py-3">Method</th>
              </tr>
            </thead>
            <tbody>
              {list.map((b) => {
                const lot = b.inventory_lots?.[0]
                const yieldRow =
                  Number(b.input_total_volume) > 0
                    ? Math.round(
                        (Number(b.output_volume) /
                          Number(b.input_total_volume)) *
                          100,
                      )
                    : 0
                return (
                  <tr key={b.id} className="border-t border-slate-100">
                    <td className="px-6 py-3 font-mono text-xs">
                      {b.processing_date}
                    </td>
                    <td className="px-6 py-3">{b.output_product}</td>
                    <td className="px-6 py-3 font-mono text-xs">
                      {lot?.code ?? '—'}
                    </td>
                    <td className="px-6 py-3">
                      {Number(b.input_total_volume).toFixed(1)} t
                    </td>
                    <td className="px-6 py-3">
                      {Number(b.output_volume).toFixed(1)} t
                    </td>
                    <td className="px-6 py-3">{yieldRow}%</td>
                    <td className="px-6 py-3 text-slate-600">
                      {b.processing_method ?? '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}