import { requireUser } from '@/lib/auth/requireUser'
import { createClient } from '@/lib/supabase/server'

type RawPurchase = {
  id: string
  code: string
  volume_remaining: number
  volume_unit: string
  commodity_type: string
  purchase_date: string
  source_sale_id: string | null
  landbases: { name: string } | null
  source_sale: { seller_org: { name: string } | null } | null
}

type Lot = {
  id: string
  code: string
  product_name: string
  volume_remaining: number
  total_volume: number
  volume_unit: string
  processing_batches: { processing_date: string } | null
}

export default async function InventoryPage() {
  await requireUser()
  const supabase = await createClient()

  const [rawRes, lotsRes] = await Promise.all([
    supabase
    .from('raw_material_purchases')
    .select(
      'id, code, volume_remaining, volume_unit, commodity_type, purchase_date, source_sale_id, landbases:landbase_id(name), source_sale:sales!source_sale_id(seller_org:organization_id(name))',
    )
    .gt('volume_remaining', 0)
      .order('purchase_date', { ascending: false })
      .returns<RawPurchase[]>(),
    supabase
      .from('inventory_lots')
      .select(
        'id, code, product_name, volume_remaining, total_volume, volume_unit, processing_batches:processing_batch_id(processing_date)',
      )
      .gt('volume_remaining', 0)
      .order('code', { ascending: false })
      .returns<Lot[]>(),
  ])

  const raws = rawRes.data ?? []
  const lots = lotsRes.data ?? []

  const rawTotal = raws.reduce((s, x) => s + Number(x.volume_remaining), 0)
  const lotTotal = lots.reduce((s, x) => s + Number(x.volume_remaining), 0)

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-slate-900">Inventory</h2>
        <p className="mt-1 text-sm text-slate-600">
          Raw material on hand and processed inventory lots ready for sale.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-xs font-medium uppercase text-slate-500">
            Unprocessed (raw)
          </div>
          <div className="mt-2 text-3xl font-semibold text-slate-900">
            {rawTotal.toFixed(1)} t
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {raws.length} purchases with stock
          </div>
        </div>
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
          <div className="text-xs font-medium uppercase text-slate-500">
            Processed (ready to sell)
          </div>
          <div className="mt-2 text-3xl font-semibold text-slate-900">
            {lotTotal.toFixed(1)} t
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {lots.length} inventory lots
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Unprocessed raw material
        </div>
        {raws.length === 0 ? (
          <div className="px-6 py-6 text-sm text-slate-500">
            No raw material in stock.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-6 py-3">Purchase</th>
                <th className="px-6 py-3">Commodity</th>
                <th className="px-6 py-3">Landbase</th>
                <th className="px-6 py-3">Purchased</th>
                <th className="px-6 py-3">Remaining</th>
              </tr>
            </thead>
            <tbody>
              {raws.map((r) => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="px-6 py-3 font-mono text-xs">{r.code}</td>
                  <td className="px-6 py-3">{r.commodity_type}</td>
                  <td className="px-6 py-3">
                    {r.source_sale_id
                      ? `Received from ${r.source_sale?.seller_org?.name ?? 'unknown'}`
                      : (r.landbases?.name ?? '—')}
                  </td>
                  <td className="px-6 py-3 text-slate-600">{r.purchase_date}</td>
                  <td className="px-6 py-3">
                    {Number(r.volume_remaining)} {r.volume_unit}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="rounded-lg border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-6 py-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
          Processed inventory lots
        </div>
        {lots.length === 0 ? (
          <div className="px-6 py-6 text-sm text-slate-500">
            No processed lots. Record a processing batch to convert raw material
            into a sellable lot.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-6 py-3">Lot</th>
                <th className="px-6 py-3">Product</th>
                <th className="px-6 py-3">Processed</th>
                <th className="px-6 py-3">Remaining / total</th>
              </tr>
            </thead>
            <tbody>
              {lots.map((l) => (
                <tr key={l.id} className="border-t border-slate-100">
                  <td className="px-6 py-3 font-mono text-xs">{l.code}</td>
                  <td className="px-6 py-3">{l.product_name}</td>
                  <td className="px-6 py-3 text-slate-600">
                    {l.processing_batches?.processing_date ?? '—'}
                  </td>
                  <td className="px-6 py-3">
                    {Number(l.volume_remaining)} / {Number(l.total_volume)}{' '}
                    {l.volume_unit}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}