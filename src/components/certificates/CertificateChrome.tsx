import Image from 'next/image';
import type { ReactNode } from 'react';

type CertificateChromeProps = {
  title: string;
  subtitle?: string;
  certificateNumber: string | null;
  issuedAt: Date | string | null;
  description?: string;
  showSeal?: boolean;
  children: ReactNode;
};

export function CertificateChrome({
  title,
  subtitle,
  certificateNumber,
  issuedAt,
  description,
  showSeal = true,
  children,
}: CertificateChromeProps) {
  return (
    <div
      data-cert-print
      className="bg-white max-w-[860px] mx-auto my-8 shadow-md print:max-w-none print:mx-0 print:my-0 print:shadow-none"
    >
      <header className="bg-[#063359] text-white px-10 py-6 flex items-start justify-between gap-6">
        <div className="flex items-center gap-5">
          <Image
            src="/l2m-logo-white.svg"
            alt="Land to Market"
            width={130}
            height={34}
            priority
          />
          <div className="border-l border-white/30 pl-5 max-w-sm">
            <div className="text-[10px] uppercase tracking-[0.18em] opacity-80">
              Chain of Custody
            </div>
            <div className="text-lg font-semibold leading-tight mt-0.5">
              {title}
            </div>
            {subtitle && (
              <div className="text-xs opacity-80 mt-1">{subtitle}</div>
            )}
          </div>
        </div>
        <div className="text-right whitespace-nowrap">
          <div className="text-[10px] uppercase tracking-[0.18em] opacity-80">
            Certificate No.
          </div>
          <div className="text-base font-mono mt-0.5">
            {certificateNumber ?? '—'}
          </div>
          {issuedAt && (
            <div className="text-xs opacity-70 mt-1">
              Issued {formatDate(issuedAt)}
            </div>
          )}
        </div>
      </header>

      <main className="px-10 py-8 text-slate-800">
        {description && (
          <p className="text-xs text-slate-500 italic mb-6 leading-relaxed">
            {description}
          </p>
        )}
        {children}
      </main>

      <footer className="border-t border-slate-200 px-10 py-6 flex items-center justify-between gap-8">
        <div className="text-[11px] text-slate-500 max-w-lg leading-relaxed">
          This certificate is issued by Land to Market and confirms the chain
          of custody for the material described above. Land to Market is the
          outcomes-based regenerative agriculture verification of the Savory
          Institute.
        </div>
        {showSeal && (
          <Image
            src="/l2m-seal-navy.svg"
            alt="Land to Market verified seal"
            width={84}
            height={84}
            className="opacity-95 shrink-0"
          />
        )}
      </footer>
    </div>
  );
}

export function CertificateSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="mb-7 last:mb-0">
      <h2 className="text-[11px] uppercase tracking-[0.18em] text-[#063359] font-semibold mb-3 pb-1.5 border-b border-slate-200">
        {title}
      </h2>
      <div className="grid grid-cols-2 gap-x-8 gap-y-4">{children}</div>
    </section>
  );
}

export function CertificateField({
  label,
  children,
  span,
}: {
  label: string;
  children: ReactNode;
  span?: 1 | 2;
}) {
  return (
    <div className={span === 2 ? 'col-span-2' : ''}>
      <div className="text-[10px] uppercase tracking-[0.16em] text-slate-500">
        {label}
      </div>
      <div className="text-sm font-medium mt-1 text-slate-900">{children}</div>
    </div>
  );
}

function formatDate(d: Date | string) {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}
