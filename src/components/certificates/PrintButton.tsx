'use client'

export function PrintButton({ label = 'Download PDF' }: { label?: string }) {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-[#063359] focus:ring-offset-2 print:hidden"
    >
      <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
        <path fillRule="evenodd" d="M5 4a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v3.5h.5A2.5 2.5 0 0 1 18 10v3a2.5 2.5 0 0 1-2.5 2.5H15v.5a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-.5h-.5A2.5 2.5 0 0 1 2 13v-3a2.5 2.5 0 0 1 2.5-2.5H5V4Zm8 1.5H7V4h6v1.5ZM7 14.5h6v2H7v-2Z" clipRule="evenodd" />
      </svg>
      {label}
    </button>
  )
}