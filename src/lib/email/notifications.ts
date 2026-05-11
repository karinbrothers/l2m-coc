// src/lib/email/notifications.ts
//
// Branded transactional emails sent via Resend. Visual style
// matches the Supabase Auth templates: navy header, white body,
// branded button, slate footer.
//
// FROM address is configurable via env so we can swap from the
// `onboarding@resend.dev` sandbox address to a real one
// (`notifications@landtomarket.com` etc.) once the Resend
// domain is verified post-Cloudflare migration.

import { Resend } from 'resend'
import { createClient } from '@/lib/supabase/server'

const FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL ??
  'L2M Chain of Custody <onboarding@resend.dev>'

const APP_URL =
  process.env.NEXT_PUBLIC_APP_URL ??
  (process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'https://l2m-coc.vercel.app')

function getResend() {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[email] RESEND_API_KEY not set; emails disabled')
    return null
  }
  return new Resend(process.env.RESEND_API_KEY)
}

async function getOrgEmails(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orgId: string,
): Promise<string[]> {
  const { data, error } = await supabase.rpc('get_org_user_emails', {
    p_org_id: orgId,
  })
  if (error) {
    console.error('[email] failed to look up org emails:', error)
    return []
  }
  return (data ?? [])
    .map((r: { email: string | null }) => r.email)
    .filter((e: string | null): e is string => !!e)
}

// ---------------------------------------------------------------
// Layout: shared chrome for every transactional email
// ---------------------------------------------------------------

function emailLayout({
  preheader,
  heading,
  body,
  ctaLabel,
  ctaHref,
}: {
  preheader: string
  heading: string
  body: string
  ctaLabel: string
  ctaHref: string
}): string {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${heading}</title>
</head>
<body style="margin:0;padding:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#f1f5f9;">
  <!-- Hidden preheader for the inbox preview line -->
  <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:transparent;">${preheader}</div>

  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#f1f5f9;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560" style="background:#ffffff;border-radius:12px;overflow:hidden;max-width:560px;box-shadow:0 1px 2px rgba(0,0,0,0.04);">

          <tr>
            <td style="background:#063359;padding:32px 40px;">
              <div style="color:rgba(255,255,255,0.7);font-size:11px;letter-spacing:0.22em;text-transform:uppercase;">Land to Market</div>
              <div style="color:#ffffff;font-size:22px;font-weight:600;margin-top:6px;letter-spacing:0.01em;">Chain of Custody</div>
            </td>
          </tr>

          <tr>
            <td style="padding:40px 40px 32px;">
              <h1 style="font-size:22px;color:#0f172a;margin:0 0 16px;font-weight:600;line-height:1.3;">${heading}</h1>
              <div style="font-size:15px;line-height:1.6;color:#475569;">${body}</div>

              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 0;">
                <tr>
                  <td style="background:#063359;border-radius:8px;">
                    <a href="${ctaHref}" style="display:inline-block;padding:14px 28px;color:#ffffff;font-size:15px;font-weight:600;text-decoration:none;letter-spacing:0.01em;">${ctaLabel}</a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <tr>
            <td style="border-top:1px solid #e2e8f0;padding:20px 40px;background:#f8fafc;">
              <p style="font-size:12px;line-height:1.6;color:#94a3b8;margin:0;">
                Land to Market is the outcomes-based regenerative agriculture verification of the Savory Institute.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

const codeStyle =
  "font-family:'SF Mono',Menlo,Monaco,Consolas,monospace;background:#f1f5f9;padding:2px 6px;border-radius:4px;font-size:13px;"

// ---------------------------------------------------------------
// 1. New sale arrived — buyer side
// ---------------------------------------------------------------

export async function notifySaleArrived(
  supabase: Awaited<ReturnType<typeof createClient>>,
  args: {
    saleCode: string
    sellerOrgName: string
    buyerOrgId: string
    volume: number
    productName: string | null
  },
) {
  const resend = getResend()
  if (!resend) return
  const recipients = await getOrgEmails(supabase, args.buyerOrgId)
  if (recipients.length === 0) return

  const html = emailLayout({
    preheader: `${args.sellerOrgName} sent you ${args.volume} tonnes — review and accept in your inbox.`,
    heading: 'You have a new sale to review',
    body: `
      <p style="margin:0 0 14px;"><strong>${args.sellerOrgName}</strong> sent you <strong>${args.volume} tonnes</strong>${args.productName ? ` of <strong>${args.productName}</strong>` : ''}.</p>
      <p style="margin:0 0 14px;">Sale code: <code style="${codeStyle}">${args.saleCode}</code></p>
      <p style="margin:0 0 14px;">Review the full upstream chain of custody, then accept to receive the volume and a transaction certificate, or decline to return it to the seller&rsquo;s inventory.</p>
      <p style="margin:0;font-size:13px;color:#64748b;">If you don&rsquo;t respond within 14 days, this sale will expire.</p>
    `,
    ctaLabel: 'Open inbox',
    ctaHref: `${APP_URL}/inbox`,
  })

  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: recipients,
    subject: `New sale ${args.saleCode} from ${args.sellerOrgName}`,
    html,
  })
  if (error) console.error('[email] notifySaleArrived failed:', error)
}

// ---------------------------------------------------------------
// 2. Sale accepted — seller side
// ---------------------------------------------------------------

export async function notifySaleAccepted(
  supabase: Awaited<ReturnType<typeof createClient>>,
  args: {
    saleCode: string
    buyerOrgName: string
    sellerOrgId: string
    volume: number
    notes: string | null
  },
) {
  const resend = getResend()
  if (!resend) return
  const recipients = await getOrgEmails(supabase, args.sellerOrgId)
  if (recipients.length === 0) return

  const html = emailLayout({
    preheader: `${args.buyerOrgName} accepted sale ${args.saleCode}. Transaction certificate issued.`,
    heading: 'Your sale was accepted',
    body: `
      <p style="margin:0 0 14px;"><strong>${args.buyerOrgName}</strong> accepted sale <code style="${codeStyle}">${args.saleCode}</code> (${args.volume} tonnes).</p>
      <p style="margin:0 0 14px;">A transaction certificate has been issued automatically with the full chain of custody.</p>
      ${args.notes
        ? `<div style="background:#f1f5f9;border-left:3px solid #063359;padding:12px 16px;margin:16px 0;font-style:italic;font-size:14px;color:#334155;">&ldquo;${args.notes}&rdquo;</div>`
        : ''}
    `,
    ctaLabel: 'View sale',
    ctaHref: `${APP_URL}/sales`,
  })

  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: recipients,
    subject: `${args.buyerOrgName} accepted sale ${args.saleCode}`,
    html,
  })
  if (error) console.error('[email] notifySaleAccepted failed:', error)
}

// ---------------------------------------------------------------
// 3. Sale rejected — seller side (also used for admin-cancelled)
// ---------------------------------------------------------------

export async function notifySaleRejected(
  supabase: Awaited<ReturnType<typeof createClient>>,
  args: {
    saleCode: string
    buyerOrgName: string
    sellerOrgId: string
    volume: number
    notes: string | null
  },
) {
  const resend = getResend()
  if (!resend) return
  const recipients = await getOrgEmails(supabase, args.sellerOrgId)
  if (recipients.length === 0) return

  const html = emailLayout({
    preheader: `${args.buyerOrgName} declined sale ${args.saleCode}. Volume returned to your inventory.`,
    heading: 'Your sale was declined',
    body: `
      <p style="margin:0 0 14px;"><strong>${args.buyerOrgName}</strong> declined sale <code style="${codeStyle}">${args.saleCode}</code> (${args.volume} tonnes).</p>
      <p style="margin:0 0 14px;">The volume has been returned to your inventory and is available to sell again.</p>
      ${args.notes
        ? `<div style="background:#fef2f2;border-left:3px solid #dc2626;padding:12px 16px;margin:16px 0;font-style:italic;font-size:14px;color:#7f1d1d;">&ldquo;${args.notes}&rdquo;</div>`
        : ''}
    `,
    ctaLabel: 'View sales',
    ctaHref: `${APP_URL}/sales`,
  })

  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: recipients,
    subject: `${args.buyerOrgName} declined sale ${args.saleCode}`,
    html,
  })
  if (error) console.error('[email] notifySaleRejected failed:', error)
}

// ---------------------------------------------------------------
// 4. Transaction certificate issued — buyer side
// ---------------------------------------------------------------
//
// Sent to the buyer once a TC is auto-issued on sale acceptance.
// Useful for distribution: the brand's operations person accepts
// the sale, but the cert needs to land in compliance / marketing
// inboxes too. The email gives them a direct link to the cert
// they can forward, print, or share.

export async function notifyCertificateIssued(
  supabase: Awaited<ReturnType<typeof createClient>>,
  args: {
    certId: string
    certNumber: string | null
    saleCode: string
    sellerOrgName: string
    buyerOrgId: string
    volume: number
  },
) {
  const resend = getResend()
  if (!resend) return
  const recipients = await getOrgEmails(supabase, args.buyerOrgId)
  if (recipients.length === 0) return

  const certLabel = args.certNumber ?? 'transaction certificate'

  const html = emailLayout({
    preheader: `Transaction certificate ${certLabel} for sale ${args.saleCode} is ready to view.`,
    heading: 'Your transaction certificate is ready',
    body: `
      <p style="margin:0 0 14px;">A transaction certificate has been issued for the verified material you just received from <strong>${args.sellerOrgName}</strong>.</p>
      <p style="margin:0 0 6px;font-size:13px;color:#64748b;text-transform:uppercase;letter-spacing:0.1em;">Certificate</p>
      <p style="margin:0 0 14px;"><code style="${codeStyle}">${certLabel}</code></p>
      <p style="margin:0 0 6px;font-size:13px;color:#64748b;text-transform:uppercase;letter-spacing:0.1em;">Sale</p>
      <p style="margin:0 0 14px;"><code style="${codeStyle}">${args.saleCode}</code> &middot; ${args.volume} tonnes</p>
      <p style="margin:0 0 14px;">View the certificate online, download it as PDF, or walk the supply chain back to source landbase.</p>
    `,
    ctaLabel: 'View certificate',
    ctaHref: `${APP_URL}/certificates/${args.certId}`,
  })

  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: recipients,
    subject: `Transaction certificate ${certLabel} issued`,
    html,
  })
  if (error) console.error('[email] notifyCertificateIssued failed:', error)
}