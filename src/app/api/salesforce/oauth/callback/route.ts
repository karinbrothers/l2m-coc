import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/requireUser';
import { createClient } from '@/lib/supabase/server';

export async function GET(req: NextRequest) {
  const profile = await requireUser();
  if (profile.role !== 'admin') {
    return NextResponse.redirect(new URL('/', req.url));
  }

  const url = new URL(req.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');

  if (error) {
    return NextResponse.redirect(
      new URL(`/admin/salesforce/connect?error=${encodeURIComponent(error)}`, req.url)
    );
  }

  if (!code) {
    return NextResponse.redirect(
      new URL('/admin/salesforce/connect?error=missing_code', req.url)
    );
  }

  const storedState = req.cookies.get('sf_oauth_state')?.value;
  if (!storedState || storedState !== state) {
    return NextResponse.redirect(
      new URL('/admin/salesforce/connect?error=invalid_state', req.url)
    );
  }

  const codeVerifier = req.cookies.get('sf_oauth_verifier')?.value;
  if (!codeVerifier) {
    return NextResponse.redirect(
      new URL('/admin/salesforce/connect?error=missing_verifier', req.url)
    );
  }

  const loginUrl = process.env.SALESFORCE_LOGIN_URL!;
  const tokenRes = await fetch(`${loginUrl}/services/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: process.env.SALESFORCE_CLIENT_ID!,
      client_secret: process.env.SALESFORCE_CLIENT_SECRET!,
      redirect_uri: process.env.SALESFORCE_REDIRECT_URI!,
      code_verifier: codeVerifier,
    }),
  });

  if (!tokenRes.ok) {
    const errorBody = await tokenRes.text();
    console.error('SF token exchange failed:', errorBody);
    return NextResponse.redirect(
      new URL('/admin/salesforce/connect?error=token_exchange_failed', req.url)
    );
  }

  const tokens = await tokenRes.json();
  const refreshToken = tokens.refresh_token;
  const instanceUrl = tokens.instance_url;

  if (!refreshToken || !instanceUrl) {
    console.error('SF token response missing fields:', tokens);
    return NextResponse.redirect(
      new URL('/admin/salesforce/connect?error=no_refresh_token', req.url)
    );
  }

  const supabase = await createClient();
  const { error: dbError } = await supabase
    .from('salesforce_credentials')
    .upsert(
      {
        organization_id: profile.organization_id,
        instance_url: instanceUrl,
        refresh_token: refreshToken,
        connected_by: profile.id,
        connected_at: new Date().toISOString(),
      },
      { onConflict: 'organization_id' }
    );

  if (dbError) {
    console.error('Failed to save SF creds:', dbError);
    return NextResponse.redirect(
      new URL('/admin/salesforce/connect?error=save_failed', req.url)
    );
  }

  const response = NextResponse.redirect(
    new URL('/admin/salesforce/connect?connected=1', req.url)
  );
  response.cookies.delete('sf_oauth_state');
  response.cookies.delete('sf_oauth_verifier');
  return response;
}