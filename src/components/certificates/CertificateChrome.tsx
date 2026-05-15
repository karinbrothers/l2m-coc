// src/components/certificates/CertificateChrome.tsx
//
// Industry-standard L2M certificate format: numbered boxes in a
// black-on-white grid, formal declaration block, signature, and
// round Verified seal — modeled on the official L2M Digital Origin
// and Transaction Certificate templates.
//
// Layout (top to bottom):
//   1. Header band: L2M logo (left) + title (centered, large)
//   2. Metadata band: Certificate ID, Issued date, and the
//      "valid original version" notice.
//   3. Numbered box grid.
//   4. Declaration block + signature + seal.
//   5. Optional attestation footer (renders inside the chrome
//      border so it travels with the printed/PDF document).
//
// Print: aggressive size shrinking via print: variants so the
// whole document fits on a single A4 / US Letter page.

import Image from 'next/image';
import type { ReactNode } from 'react';

type DocumentType = 'origin' | 'transaction';

const TITLES: Record<DocumentType, string> = {
  origin: 'LAND TO MARKET DIGITAL ORIGIN CERTIFICATE',
  transaction: 'LAND TO MARKET DIGITAL TRANSACTION CERTIFICATE',
};

const DECLARATION_NUMBER: Record<DocumentType, number> = {
  origin: 7,
  transaction: 8,
};

const DECLARATION_TEXT: Record<DocumentType, { p1: string; p2: string }> = {
  origin: {
    p1: 'This is to verify that, based on the documentation provided by the buyer named in Box 2, the product listed in Box 3 and quantified in Box 4 has been produced in accordance with the Land to Market Guidelines.',
    p2: 'This Origin Certificate does not entitle the seller or buyer/consignee of the products to use the Land to Market Seal or make reference to Land to Market. The rules for labelling of Land to Market verified goods is outlined in the Claims Guidelines.',
  },
  transaction: {
    p1: 'This is to verify that, based on the documentation provided by the seller named in Box 2, the product listed in Box 6 and quantified in Box 7 has been produced in accordance with the Land to Market Guidelines.',
    p2: 'This Transaction Certificate does not entitle the seller or buyer/consignee of the products to use the Land to Market Seal or make reference to Land to Market. The rules for labelling of Land to Market verified goods is outlined in the Claims Guidelines.',
  },
};

function formatDate(d: Date | string) {
  const date = typeof d === 'string' ? new Date(d) : d;
  return date.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

type CertificateChromeProps = {
  documentType: DocumentType;
  certificateId: string | null;
  issuedAt: Date | string | null;
  children: ReactNode;
  /**
   * Optional attestation footer — rendered inside the chrome
   * after the declaration block so it's part of the printed
   * document. OC and TC components build their own content and
   * pass it in.
   */
  attestationFooter?: ReactNode;
};

export function CertificateChrome({
  documentType,
  certificateId,
  issuedAt,
  children,
  attestationFooter,
}: CertificateChromeProps) {
  const declaration = DECLARATION_TEXT[documentType];
  const declarationNumber = DECLARATION_NUMBER[documentType];

  return (
    <div
      data-cert-print
      className="bg-white text-slate-900 max-w-[860px] mx-auto my-8 p-10 print:max-w-none print:mx-0 print:my-0 print:p-3 print:shadow-none print:text-[10px]"
    >
      {/* Header band: logo (left) + title (centered) on one line.
          A tiny mt on the title nudges it down so it visually
          aligns with the "LAND TO MARKET" wordmark text inside
          the logo, which sits slightly below the logo's geometric
          center (the tick adds height above the wordmark). */}
      <div className="flex items-center gap-4 print:gap-2 mb-2 print:mb-1">
        <div className="shrink-0">
          <Image
            src="/l2m-logo-navy.svg"
            alt="Land to Market"
            width={130}
            height={72}
            priority
            className="print:w-[80px] print:h-auto"
          />
        </div>
        <h1
          className="flex-1 text-center whitespace-nowrap text-lg md:text-xl font-normal tracking-wider print:text-sm translate-y-[14px] print:translate-y-[7px]"
          style={{ color: '#063359' }}
        >
          {TITLES[documentType]}
        </h1>
        {/* Phantom spacer matching logo width to keep title centered */}
        <div className="shrink-0 w-[130px] print:w-[80px]" aria-hidden />
      </div>

      {/* Thin navy rule under header */}
      <div
        className="border-t mb-3 print:mb-2"
        style={{ borderColor: '#063359' }}
      />

      {/* Metadata band: Cert ID + Issued + valid-original notice */}
      <div className="mb-5 print:mb-3 text-sm print:text-[10px] text-slate-800">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <div>
            <span className="text-slate-600">Certificate ID:</span>{' '}
            <span className="font-mono font-medium">
              {certificateId ?? '—'}
            </span>
          </div>
          <div>
            <span className="text-slate-600">Issued:</span>{' '}
            <span className="font-medium">
              {issuedAt ? formatDate(issuedAt) : '—'}
            </span>
          </div>
        </div>
        <p className="mt-1 italic text-xs print:text-[9px] text-slate-600">
          This electronically issued document is the valid original version.
        </p>
      </div>

      {/* Body grid — single border surface */}
      <div className="grid grid-cols-12 border-t border-l border-slate-900">
        {children}

        {/* Declaration block (full width, last in grid) */}
        <div className="col-span-12 border-r border-b border-slate-900 print:break-inside-avoid">
          <div className="px-4 py-3 print:py-2 border-b border-slate-900">
            <p className="font-bold text-sm print:text-[10px] mb-2 print:mb-1">
              {declarationNumber}. Declaration
            </p>
            <p className="text-sm print:text-[9px] leading-relaxed mb-3 print:mb-1.5">
              {declaration.p1}
            </p>
            <p className="text-sm print:text-[9px] leading-relaxed">
              {declaration.p2}
            </p>
          </div>
          <div className="flex items-stretch">
            <div className="flex-1 px-4 py-4 print:py-2 space-y-4 print:space-y-2">
              <p className="text-sm print:text-[10px]">
                <span>Date of Issue: </span>
                <span className="font-medium">
                  {issuedAt ? formatDate(issuedAt) : ''}
                </span>
              </p>
              <div>
                {/* Signature image */}
                <div className="mb-2 max-w-[220px] print:max-w-[140px]">
                  <Image
                    src="/karin-signature.png"
                    alt="Karin Brothers signature"
                    width={220}
                    height={70}
                    className="object-contain print:max-h-[40px]"
                  />
                </div>
                <p className="text-sm print:text-[10px]">
                  <strong>Karin Brothers</strong>, Director of Verification,
                  Land to Market
                </p>
              </div>
            </div>
            <div className="px-6 py-4 print:px-3 print:py-2 flex items-end justify-end">
              <Image
                src="/l2m-seal-navy.svg"
                alt="Land to Market verified seal"
                width={150}
                height={150}
                className="shrink-0 print:w-[90px] print:h-[90px]"
              />
            </div>
          </div>

          {/* Attestation footer — inside the chrome border so it
              prints with the document. Subtle styling so it reads
              as document metadata, not a numbered box. */}
          {attestationFooter ? (
            <div className="border-t border-slate-300 px-4 py-2.5 print:py-1.5 text-xs print:text-[9px] text-slate-700 leading-relaxed bg-slate-50/60">
              {attestationFooter}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------
// Box — a numbered, labeled cell in the certificate grid
// ---------------------------------------------------------------

const SPAN_CLASS: Record<number, string> = {
  1: 'col-span-1',
  2: 'col-span-2',
  3: 'col-span-3',
  4: 'col-span-4',
  5: 'col-span-5',
  6: 'col-span-6',
  7: 'col-span-7',
  8: 'col-span-8',
  9: 'col-span-9',
  10: 'col-span-10',
  11: 'col-span-11',
  12: 'col-span-12',
};

type BoxProps = {
  number?: number | string;
  title: string;
  subtitle?: string;
  span?: keyof typeof SPAN_CLASS;
  /**
   * Screen min-height. Pass 'auto' to skip min-height entirely
   * (used for the wide Input Information box that contains a
   * sub-table and is naturally tall).
   */
  minHeight?: '100px' | '120px' | 'auto';
  children?: ReactNode;
};

const MIN_HEIGHT_CLASS: Record<string, string> = {
  '100px': 'min-h-[100px] print:min-h-0',
  '120px': 'min-h-[120px] print:min-h-0',
  'auto': '',
};

export function Box({
  number,
  title,
  subtitle,
  span = 6,
  minHeight = '100px',
  children,
}: BoxProps) {
  return (
    <div
      className={`${SPAN_CLASS[span]} ${MIN_HEIGHT_CLASS[minHeight]} border-r border-b border-slate-900 px-4 py-3 print:px-2 print:py-1.5 print:break-inside-avoid`}
    >
      <p className="text-sm print:text-[10px] mb-2 print:mb-1 leading-snug">
        {number !== undefined && <strong>{number}. </strong>}
        <strong>{title}</strong>
        {subtitle && (
          <span className="font-normal text-slate-700"> {subtitle}</span>
        )}
      </p>
      {children !== undefined && (
        <div className="text-sm print:text-[10px]">{children}</div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------
// InputTable — for OC Box 3 / TC Box 5 inner tables
// ---------------------------------------------------------------

export function InputTable({
  headers,
  rows,
  emptyMessage = 'No entries.',
}: {
  headers: string[];
  rows: ReactNode[][];
  emptyMessage?: string;
}) {
  if (rows.length === 0) {
    return (
      <p className="text-sm print:text-[10px] text-slate-500 italic">
        {emptyMessage}
      </p>
    );
  }
  return (
    <table className="w-full mt-2 print:mt-1 border-collapse text-sm print:text-[9px]">
      <thead>
        <tr>
          {headers.map((h, i) => (
            <th
              key={i}
              className="text-left font-medium px-2 py-1.5 print:py-1 border border-slate-400 bg-slate-50"
            >
              {h}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row, rIdx) => (
          <tr key={rIdx}>
            {row.map((cell, cIdx) => (
              <td
                key={cIdx}
                className="px-2 py-1.5 print:py-1 border border-slate-400 align-top"
              >
                {cell}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}