import { Resend } from 'resend'
import { createClient } from '@/lib/supabase/server'

const FROM_EMAIL = 'L2M Chain of Custody <onboarding@resend.dev>'

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

function emailLayout(contentHtml: string) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" style="padding:24px;">
    <table width="600" cellpadding="0" cellspacing="0" border="0" style="background:#fff;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
      <tr><td style="background:#063359;color:#fff;padding:20px 24px;"><h1 style="margin:0;font-size:18px;font-weight:600;">L2M Chain of Custody</h1></td></tr>
      <tr><td style="padding:24px;color:#0f172a;font-size:14px;line-height:1.6;">${contentHtml}</td></tr>
      <tr><td style="padding:16px 24px;border-top:1px solid #e2e8f0;color:#64748b;font-size:12px;text-align:center;">Land to Market · Verified Provenance</td></tr>
    </table>
  </td></tr></table></body></html>`
}

const codeStyle = "font-family:monospace;background:#f1f5f9;padding:2px 6px;border-radius:3px;"
const buttonStyle = "display:inline-block;background:#063359;color:#fff;text-decoration:none;padding:10px 20px;border-radius:6px;font-weight:500;"

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

  const html = emailLayout(`
    <p>You have a new sale waiting for your decision.</p>
    <p><strong>${args.sellerOrgName}</strong> sent you <strong>${args.volume} tonnes</strong>${args.productName ? ` of <strong>${args.productName}</strong>` : ''} (sale code <code style="${codeStyle}">${args.saleCode}</code>).</p>
    <p>Review the upstream chain of custody, then accept to receive the volume and a transaction certificate, or reject to return it to the seller's inventory.</p>
    <p style="margin:24px 0;">
      <a href="${APP_URL}/inbox" style="${buttonStyle}">Open inbox →</a>
      &nbsp;&nbsp;
      <a href="${APP_URL}/trace/${args.saleCode}" style="color:#063359;text-decoration:underline;">Verify provenance</a>
    </p>
    <p style="font-size:12px;color:#64748b;">If you don't respond within 14 days, this sale will expire.</p>
  `)

  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: recipients,
    subject: `New sale ${args.saleCode} from ${args.sellerOrgName}`,
    html,
  })
  if (error) console.error('[email] notifySaleArrived failed:', error)
}

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

  const html = emailLayout(`
    <p>Good news — your sale was accepted.</p>
    <p><strong>${args.buyerOrgName}</strong> accepted sale <code style="${codeStyle}">${args.saleCode}</code> (${args.volume} tonnes). The transaction certificate has been issued.</p>
    ${args.notes ? `<p style="background:#f1f5f9;border-left:3px solid #063359;padding:12px 16px;margin:16px 0;font-style:italic;">"${args.notes}"</p>` : ''}
    <p style="margin:24px 0;">
      <a href="${APP_URL}/sales" style="${buttonStyle}">View sale →</a>
    </p>
  `)

  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: recipients,
    subject: `Sale ${args.saleCode} accepted by ${args.buyerOrgName}`,
    html,
  })
  if (error) console.error('[email] notifySaleAccepted failed:', error)
}

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

  const html = emailLayout(`
    <p>Your sale was declined.</p>
    <p><strong>${args.buyerOrgName}</strong> rejected sale <code style="${codeStyle}">${args.saleCode}</code> (${args.volume} tonnes). The volume has been returned to your inventory and is available to sell again.</p>
    ${args.notes ? `<p style="background:#fef2f2;border-left:3px solid #dc2626;padding:12px 16px;margin:16px 0;font-style:italic;">"${args.notes}"</p>` : ''}
    <p style="margin:24px 0;">
      <a href="${APP_URL}/sales" style="${buttonStyle}">View sales →</a>
    </p>
  `)

  const { error } = await resend.emails.send({
    from: FROM_EMAIL,
    to: recipients,
    subject: `Sale ${args.saleCode} declined by ${args.buyerOrgName}`,
    html,
  })
  if (error) console.error('[email] notifySaleRejected failed:', error)
}