"use client";

export function DownloadButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded bg-[#063359] px-4 py-2 text-sm font-medium text-white hover:bg-[#052745] print:hidden"
    >
      Download PDF
    </button>
  );
}