import { NextResponse } from 'next/server';
import { requireUser } from '@/lib/auth/requireUser';
import crypto from 'crypto';

function base64url(buf: Buffer) {
  return buf
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export async function GET() {
  const profile = await requireUser();
  if (profile.role !== 'admin') {
    return NextResponse.json({ error: 'Admins only' }, { status: 403 });
  }

  const clientId = process.env.SALESFORCE_CLIENT_ID!;
  const redirectUri = process.env.SALESFORCE_REDIRECT_URI!;
  const loginUrl = process.env.SALESFORCE_LOGIN_URL!;

  const state = crypto.randomBytes(16).toString('hex');
  const codeVerifier = base64url(crypto.randomBytes(32));
  const codeChallenge = base64url(
    crypto.createHash('sha256').update(codeVerifier).digest()
  );

  const authUrl = new URL(`${loginUrl}/services/oauth2/authorize`);
  authUrl.searchParams.set('response_type', 'code');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('scope', 'api refresh_token');
  authUrl.searchParams.set('state', state);
  authUrl.searchParams.set('code_challenge', codeChallenge);
  authUrl.searchParams.set('code_challenge_method', 'S256');

  const response = NextResponse.redirect(authUrl.toString());
  const cookieOpts = {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: 600,
    path: '/',
  };
  response.cookies.set('sf_oauth_state', state, cookieOpts);
  response.cookies.set('sf_oauth_verifier', codeVerifier, cookieOpts);

  return response;
}