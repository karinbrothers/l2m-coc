// src/components/AttestationCheckbox.tsx
//
// Required-checkbox attestation block. Renders the same legal
// language on every submission form (new purchase, processing
// batch, new sale, accept sale). Pair with server-side check
// for attest === 'on' in the action.
//
// Why a server component: nothing dynamic. The `required` attr
// blocks browser submit; the server action belt-and-braces it.

export default function AttestationCheckbox({
    // Pass `false` for forms with multiple submit buttons where
    // only one path should require attestation (e.g., inbox card
    // — Accept needs it, Reject doesn't). Server action still
    // enforces.
    browserRequired = true,
  }: {
    browserRequired?: boolean
  }) {
    return (
      <fieldset className="rounded-md border border-amber-200 bg-amber-50 p-4">
        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            name="attest"
            value="on"
            required={browserRequired}
            className="mt-1 shrink-0"
          />
          <span className="text-xs text-amber-900 leading-relaxed">
            <strong>Attestation.</strong> I do hereby swear and affirm that
            the Land to Market verified product(s) listed remained segregated
            from NON–Land to Market Verified livestock-derived materials
            throughout our ownership of the product(s) (including any storage,
            transportation, processing, and handling by subcontractors), and
            have been handled in accordance with the Land to Market
            Guidelines.
          </span>
        </label>
      </fieldset>
    )
  }