// src/components/certificates/VoidedBanner.tsx
//
// Big red "VOIDED" banner shown at the top of the cert chrome
// when a certificate has been voided by an admin. Renders both
// on screen and in print so a printed/PDF'd voided cert is
// unambiguously marked.

function formatDate(iso: string | null): string {
    if (!iso) return ''
    return new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
  }
  
  export default function VoidedBanner({
    voidedAt,
    reason,
  }: {
    voidedAt: string | null
    reason: string | null
  }) {
    if (!voidedAt) return null
    return (
      <div className="mb-4 border-2 border-red-700 bg-red-50 px-5 py-3 rounded-md">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <div className="font-bold text-red-800 tracking-widest text-lg">
            VOIDED
          </div>
          <div className="text-xs text-red-700">
            Voided {formatDate(voidedAt)}
          </div>
        </div>
        {reason ? (
          <p className="text-sm text-red-900 mt-1 leading-relaxed">
            <strong>Reason:</strong> {reason}
          </p>
        ) : null}
        <p className="text-xs text-red-800 mt-2">
          This certificate has been marked invalid by Land to Market and
          should not be relied on for chain-of-custody verification.
        </p>
      </div>
    )
  }