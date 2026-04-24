import { createAdminClient } from '@/lib/supabase/admin';

interface TokenResponse {
  access_token: string;
  instance_url: string;
}

interface SalesforceLandbase {
  Id: string;
  Name: string;
  L2M_Landbase_Eligibility__c: string | null;
  L2M_Landbase_Eligibility_Report_URL__c: string | null;
  L2M_Report_Expiration_Date__c: string | null;
  Latest_Verification_Effective_Date__c: string | null;
}

interface QueryResponse {
  totalSize: number;
  done: boolean;
  records: SalesforceLandbase[];
}

async function refreshAccessToken(refreshToken: string): Promise<TokenResponse> {
  const loginUrl = process.env.SALESFORCE_LOGIN_URL!;
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: process.env.SALESFORCE_CLIENT_ID!,
    client_secret: process.env.SALESFORCE_CLIENT_SECRET!,
    refresh_token: refreshToken,
  });
  const res = await fetch(`${loginUrl}/services/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Token refresh ${res.status}: ${text}`);
  }
  return JSON.parse(text);
}

async function runSOQL(
  instanceUrl: string,
  accessToken: string,
  soql: string,
): Promise<QueryResponse> {
  const url = `${instanceUrl}/services/data/v60.0/query?q=${encodeURIComponent(soql)}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`SOQL ${res.status}: ${text}`);
  }
  return JSON.parse(text);
}

export async function syncSalesforceLandbases(organizationId: string) {
  console.log('[sync] START for org:', organizationId);
  const supabase = createAdminClient();

  // 1. Load credentials
  const { data: creds, error: credsErr } = await supabase
    .from('salesforce_credentials')
    .select('*')
    .eq('organization_id', organizationId)
    .single();

  if (credsErr || !creds) {
    throw new Error(`No Salesforce credentials: ${credsErr?.message ?? 'not found'}`);
  }
  console.log('[sync] Loaded creds, instance:', creds.instance_url);

  // 2. Refresh access token
  let accessToken: string;
  let instanceUrl: string;
  try {
    const tok = await refreshAccessToken(creds.refresh_token);
    accessToken = tok.access_token;
    instanceUrl = tok.instance_url || creds.instance_url;
    console.log('[sync] Refreshed access token OK, instance:', instanceUrl);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[sync] Token refresh FAILED:', msg);
    await supabase.from('salesforce_credentials').update({
      last_sync_at: new Date().toISOString(),
      last_sync_status: 'error',
      last_sync_error: `Token refresh: ${msg}`,
    }).eq('organization_id', organizationId);
    throw new Error(`Token refresh: ${msg}`);
  }

  // 3. Query Salesforce
  const soql = `SELECT Id, Name, L2M_Landbase_Eligibility__c, L2M_Landbase_Eligibility_Report_URL__c, L2M_Report_Expiration_Date__c, Latest_Verification_Effective_Date__c FROM Land_Base__c`;
  console.log('[sync] Running SOQL...');
  let records: SalesforceLandbase[] = [];
  try {
    const result = await runSOQL(instanceUrl, accessToken, soql);
    records = result.records;
    console.log('[sync] Got', records.length, 'landbases from SF');
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[sync] SOQL FAILED:', msg);
    await supabase.from('salesforce_credentials').update({
      last_sync_at: new Date().toISOString(),
      last_sync_status: 'error',
      last_sync_error: `SOQL: ${msg}`,
    }).eq('organization_id', organizationId);
    throw new Error(`SOQL: ${msg}`);
  }

  // 4. Build rows
  console.log('[sync] Building rows...');
  const rows = records.map((r) => {
    const elig = String(r.L2M_Landbase_Eligibility__c ?? '').toLowerCase();
    const eligibility =
      elig.includes('eligible') ? 'eligible' :
      elig.includes('expired') ? 'expired' :
      elig.includes('suspend') ? 'suspended' : 'eligible';
    return {
      name: r.Name,
      salesforce_id: r.Id,
      eligibility_status: eligibility,
      eligibility_report_id: r.L2M_Landbase_Eligibility_Report_URL__c ?? null,
      expiration_date: r.L2M_Report_Expiration_Date__c ?? null,
      verification_date: r.Latest_Verification_Effective_Date__c ?? null,
    };
  });

  // 5. Find what exists already
  console.log('[sync] Counting existing...');
  const sfIds = rows.map((r) => r.salesforce_id);
  const existingSet = new Set<string>();
  // Batch the IN query to avoid hitting URL length limits
  const idChunkSize = 500;
  for (let i = 0; i < sfIds.length; i += idChunkSize) {
    const idChunk = sfIds.slice(i, i + idChunkSize);
    const { data } = await supabase
      .from('landbases')
      .select('salesforce_id')
      .in('salesforce_id', idChunk);
    (data ?? []).forEach((r) => existingSet.add(r.salesforce_id));
  }

  const toInsert = rows.filter((r) => !existingSet.has(r.salesforce_id));
  const toUpdate = rows.filter((r) => existingSet.has(r.salesforce_id));
  console.log('[sync] Will insert:', toInsert.length, 'will update:', toUpdate.length);

  const errors: string[] = [];
  const insertChunkSize = 500;

  // 6. Bulk insert new rows
  let inserted = 0;
  for (let i = 0; i < toInsert.length; i += insertChunkSize) {
    const chunk = toInsert.slice(i, i + insertChunkSize);
    const { error } = await supabase.from('landbases').insert(chunk);
    if (error) {
      errors.push(`Insert chunk ${i}: ${error.message}`);
      console.error('[sync] Insert chunk', i, 'error:', error.message);
    } else {
      inserted += chunk.length;
    }
  }
  console.log('[sync] Inserted', inserted, 'rows');

  // 7. Update existing rows (one-by-one — unavoidable without ON CONFLICT)
  let updated = 0;
  for (let i = 0; i < toUpdate.length; i++) {
    const row = toUpdate[i];
    const { error } = await supabase
      .from('landbases')
      .update(row)
      .eq('salesforce_id', row.salesforce_id);
    if (error) {
      errors.push(`Update ${row.salesforce_id}: ${error.message}`);
    } else {
      updated++;
    }
    if ((i + 1) % 200 === 0) {
      console.log('[sync] Updated', i + 1, 'of', toUpdate.length);
    }
  }
  console.log('[sync] Final: inserted', inserted, 'updated', updated, 'errors', errors.length);
  if (errors.length > 0) console.log('[sync] Error sample:', errors.slice(0, 3));

  // 8. Write sync status
  await supabase.from('salesforce_credentials').update({
    last_sync_at: new Date().toISOString(),
    last_sync_status: errors.length > 0 ? 'partial' : 'ok',
    last_sync_error: errors.length > 0 ? errors.slice(0, 3).join('; ') : null,
  }).eq('organization_id', organizationId);

  console.log('[sync] DONE');
  return {
    totalFromSalesforce: records.length,
    inserted,
    updated,
    errors,
  };
}