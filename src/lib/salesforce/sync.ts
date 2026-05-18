import { createAdminClient } from '@/lib/supabase/admin';

// ============================================================================
// Types
// ============================================================================

interface TokenResponse {
  access_token: string;
  instance_url: string;
}

interface SalesforceLandbase {
  Id: string;
  Name: string;
  Country__c: string | null;
  L2M_Landbase_Eligibility__c: string | null;
  L2M_Landbase_Eligibility_Report_URL__c: string | null;
  L2M_Report_Expiration_Date__c: string | null;
  Latest_Verification_Effective_Date__c: string | null;
  Latitude__c: number | null;
  Longitude__c: number | null;
}

interface SalesforceAccount {
  Id: string;
  Name: string;
  Brand_Partner_Status__c: string | null;
  Supply_Chain_Partner_Status__c: string | null;
  L2M_Retailer_Status__c: string | null;
  Supply_Chain_Stage__c: string | null;
}

interface SalesforceSupplyGroup {
  Id: string;
  Name: string;
  Account__c: string | null;
}

interface SalesforceLandbaseAssoc {
  Id: string;
  Supply_Group__c: string | null;
  Landbase__c: string | null;
  Association_Status__c: string | null;
}

interface PassResult {
  upserted: number;
  total: number;
  errors: string[];
  skipped?: number;
}

type AdminClient = ReturnType<typeof createAdminClient>;

// ============================================================================
// Helpers
// ============================================================================

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

async function runSOQLAll<T>(
  instanceUrl: string,
  accessToken: string,
  soql: string,
): Promise<T[]> {
  const out: T[] = [];
  let url: string | null = `${instanceUrl}/services/data/v60.0/query?q=${encodeURIComponent(soql)}`;
  while (url) {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`SOQL ${res.status}: ${text}`);
    }
    const data = JSON.parse(text) as { records: T[]; nextRecordsUrl?: string };
    out.push(...data.records);
    url = data.nextRecordsUrl ? `${instanceUrl}${data.nextRecordsUrl}` : null;
  }
  return out;
}

// Bulk-upsert in fixed-size chunks. Uses INSERT ... ON CONFLICT (col)
// DO UPDATE under the hood, which means one HTTP round-trip per
// chunk instead of one per row. The old per-row update loop was
// what made the sync time out on Vercel Hobby (60 s function cap).
async function chunkedUpsert(
  supabase: AdminClient,
  table: string,
  rows: Record<string, unknown>[],
  conflictColumn: string,
  chunkSize = 500,
): Promise<{ upserted: number; errors: string[] }> {
  const errors: string[] = [];
  let upserted = 0;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabase
      .from(table)
      .upsert(chunk, { onConflict: conflictColumn });
    if (error) {
      errors.push(`${table} upsert chunk ${i}: ${error.message}`);
      console.error(`[sync] ${table} upsert chunk ${i} error:`, error.message);
    } else {
      upserted += chunk.length;
    }
  }
  return { upserted, errors };
}

async function fetchExistingIds(
  supabase: AdminClient,
  table: string,
  sfIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const chunkSize = 500;
  for (let i = 0; i < sfIds.length; i += chunkSize) {
    const chunk = sfIds.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from(table)
      .select('id, salesforce_id')
      .in('salesforce_id', chunk);
    if (error) throw error;
    (data ?? []).forEach((r: { id: string; salesforce_id: string }) =>
      map.set(r.salesforce_id, r.id),
    );
  }
  return map;
}

// Map Salesforce eligibility values to our internal status enum.
// CRITICAL: "Ineligible" contains the substring "eligible", so we
// must check for it FIRST. Default to 'ineligible' for unknown
// values to err on the side of excluding.
function mapEligibility(raw: string | null): string {
  const elig = String(raw ?? '').toLowerCase().trim();
  if (elig.includes('ineligible')) return 'ineligible';
  if (elig.includes('not eligible')) return 'ineligible';
  if (elig.includes('eligible')) return 'eligible';
  if (elig.includes('expired')) return 'expired';
  if (elig.includes('suspend')) return 'suspended';
  if (elig.includes('pending')) return 'pending';
  return 'ineligible';
}

// ============================================================================
// Pass 1: Salesforce Account → organizations
// ============================================================================

async function syncOrganizationsPass(
  supabase: AdminClient,
  accessToken: string,
  instanceUrl: string,
): Promise<PassResult> {
  const soql = `
    SELECT Id, Name,
           Brand_Partner_Status__c,
           Supply_Chain_Partner_Status__c,
           L2M_Retailer_Status__c,
           Supply_Chain_Stage__c
    FROM Account
    WHERE Brand_Partner_Status__c = 'Active Brand Partner'
       OR Supply_Chain_Partner_Status__c IN ('Active Supply Chain Partner', 'Non-Partner Supply Chain Actor')
       OR L2M_Retailer_Status__c = 'Active Retailer'
  `.replace(/\s+/g, ' ').trim();

  console.log('[sync] [orgs] Running SOQL...');
  const accounts = await runSOQLAll<SalesforceAccount>(instanceUrl, accessToken, soql);
  console.log('[sync] [orgs] Got', accounts.length, 'records');

  const rows = accounts.map((a) => {
    // Derive the boolean stage flags from the textual stage so
    // the orgs table's NOT NULL columns get populated on INSERT
    // (upsert tries INSERT first; if that fails, no UPDATE
    // happens either).
    const stage = (a.Supply_Chain_Stage__c ?? '').toLowerCase().trim();
    const isFsp =
      stage === 'first_stage_processor' || stage === 'first stage processor';
    const isFinalBrand =
      stage === 'final_brand' || stage === 'final brand';
    return {
      name: a.Name,
      salesforce_id: a.Id,
      type: 'brand',
      brand_partner_status: a.Brand_Partner_Status__c,
      supply_chain_partner_status: a.Supply_Chain_Partner_Status__c,
      l2m_retailer_status: a.L2M_Retailer_Status__c,
      supply_chain_stage: a.Supply_Chain_Stage__c,
      is_first_stage_processor: isFsp,
      is_final_brand: isFinalBrand,
    };
  });

  // Diagnostic: log the first row's payload + key counts so we
  // can see exactly what we're sending to Supabase.
  if (rows.length > 0) {
    console.log(
      '[sync] [orgs] First row payload:',
      JSON.stringify(rows[0]),
    );
    console.log(
      '[sync] [orgs] Keys in payload:',
      Object.keys(rows[0]).join(', '),
    );
  }

  const { upserted, errors } = await chunkedUpsert(
    supabase,
    'organizations',
    rows,
    'salesforce_id',
  );

  console.log('[sync] [orgs] done — upserted', upserted);
  return { upserted, total: accounts.length, errors };
}

// ============================================================================
// Pass 2: Salesforce Land_Base__c → landbases
// ============================================================================

async function syncLandbasesPass(
  supabase: AdminClient,
  accessToken: string,
  instanceUrl: string,
): Promise<PassResult> {
  const soql = `SELECT Id, Name, Country__c, L2M_Landbase_Eligibility__c, L2M_Landbase_Eligibility_Report_URL__c, L2M_Report_Expiration_Date__c, Latest_Verification_Effective_Date__c, Latitude__c, Longitude__c FROM Land_Base__c`;

  console.log('[sync] [landbases] Running SOQL...');
  const records = await runSOQLAll<SalesforceLandbase>(instanceUrl, accessToken, soql);
  console.log('[sync] [landbases] Got', records.length, 'records');

  // Diagnostic: tally what Salesforce is sending back so we can
  // see at a glance whether the raw data has the variety we
  // expect (eligible, ineligible, pending, etc.).
  const rawValueCounts = new Map<string, number>();
  for (const r of records) {
    const key = r.L2M_Landbase_Eligibility__c ?? '(null)';
    rawValueCounts.set(key, (rawValueCounts.get(key) ?? 0) + 1);
  }
  console.log(
    '[sync] [landbases] Raw eligibility values from Salesforce:',
    Object.fromEntries(rawValueCounts.entries()),
  );

  const rows = records.map((r) => ({
    name: r.Name,
    salesforce_id: r.Id,
    country: r.Country__c ?? null,
    eligibility_status: mapEligibility(r.L2M_Landbase_Eligibility__c),
    eligibility_report_url: r.L2M_Landbase_Eligibility_Report_URL__c ?? null,
    expiration_date: r.L2M_Report_Expiration_Date__c ?? null,
    verification_date: r.Latest_Verification_Effective_Date__c ?? null,
    latitude: r.Latitude__c ?? null,
    longitude: r.Longitude__c ?? null,
  }));

  // Diagnostic: how many of each mapped status will we write?
  const mappedCounts = new Map<string, number>();
  for (const r of rows) {
    mappedCounts.set(
      r.eligibility_status,
      (mappedCounts.get(r.eligibility_status) ?? 0) + 1,
    );
  }
  console.log(
    '[sync] [landbases] Mapped status counts:',
    Object.fromEntries(mappedCounts.entries()),
  );

  const { upserted, errors } = await chunkedUpsert(
    supabase,
    'landbases',
    rows,
    'salesforce_id',
  );

  console.log('[sync] [landbases] done — upserted', upserted);
  return { upserted, total: records.length, errors };
}

// ============================================================================
// Pass 3: Salesforce Supply_Group__c → supply_groups
// ============================================================================

async function syncSupplyGroupsPass(
  supabase: AdminClient,
  accessToken: string,
  instanceUrl: string,
): Promise<PassResult> {
  const soql = 'SELECT Id, Name, Account__c FROM Supply_Group__c';
  console.log('[sync] [supply_groups] Running SOQL...');
  const groups = await runSOQLAll<SalesforceSupplyGroup>(instanceUrl, accessToken, soql);
  console.log('[sync] [supply_groups] Got', groups.length, 'records');

  const accountSfIds = Array.from(
    new Set(groups.map((g) => g.Account__c).filter((x): x is string => !!x)),
  );
  const orgMap = await fetchExistingIds(supabase, 'organizations', accountSfIds);

  const rows: Record<string, unknown>[] = [];
  let skipped = 0;
  for (const g of groups) {
    const orgId = g.Account__c ? orgMap.get(g.Account__c) : undefined;
    if (!orgId) {
      skipped++;
      continue;
    }
    rows.push({
      name: g.Name,
      salesforce_id: g.Id,
      organization_id: orgId,
    });
  }

  const { upserted, errors } = await chunkedUpsert(
    supabase,
    'supply_groups',
    rows,
    'salesforce_id',
  );

  console.log(
    '[sync] [supply_groups] done — upserted',
    upserted,
    'skipped',
    skipped,
  );
  return { upserted, total: groups.length, errors, skipped };
}

// ============================================================================
// Pass 4: Salesforce Landbase_Association__c → supply_group_landbases
// ============================================================================

async function syncSupplyGroupLandbasesPass(
  supabase: AdminClient,
  accessToken: string,
  instanceUrl: string,
): Promise<PassResult> {
  const soql =
    'SELECT Id, Supply_Group__c, Landbase__c, Association_Status__c FROM Landbase_Association__c';
  console.log('[sync] [junction] Running SOQL...');
  const assocs = await runSOQLAll<SalesforceLandbaseAssoc>(instanceUrl, accessToken, soql);
  console.log('[sync] [junction] Got', assocs.length, 'records');

  const sgSfIds = Array.from(
    new Set(assocs.map((a) => a.Supply_Group__c).filter((x): x is string => !!x)),
  );
  const lbSfIds = Array.from(
    new Set(assocs.map((a) => a.Landbase__c).filter((x): x is string => !!x)),
  );

  const [sgMap, lbMap] = await Promise.all([
    fetchExistingIds(supabase, 'supply_groups', sgSfIds),
    fetchExistingIds(supabase, 'landbases', lbSfIds),
  ]);

  const rows: Record<string, unknown>[] = [];
  let skipped = 0;
  for (const a of assocs) {
    const supply_group_id = a.Supply_Group__c ? sgMap.get(a.Supply_Group__c) : undefined;
    const landbase_id = a.Landbase__c ? lbMap.get(a.Landbase__c) : undefined;
    if (!supply_group_id || !landbase_id) {
      skipped++;
      continue;
    }
    rows.push({
      salesforce_id: a.Id,
      supply_group_id,
      landbase_id,
      association_status: a.Association_Status__c,
    });
  }

  const { upserted, errors } = await chunkedUpsert(
    supabase,
    'supply_group_landbases',
    rows,
    'salesforce_id',
  );

  console.log(
    '[sync] [junction] done — upserted',
    upserted,
    'skipped',
    skipped,
  );
  return { upserted, total: assocs.length, errors, skipped };
}

// ============================================================================
// Orchestrator
// ============================================================================

export async function syncSalesforceLandbases(organizationId: string) {
  console.log('[sync] START for org:', organizationId);
  const supabase = createAdminClient();

  const { data: creds, error: credsErr } = await supabase
    .from('salesforce_credentials')
    .select('*')
    .eq('organization_id', organizationId)
    .single();
  if (credsErr || !creds) {
    throw new Error(`No Salesforce credentials: ${credsErr?.message ?? 'not found'}`);
  }
  console.log('[sync] Loaded creds, instance:', creds.instance_url);

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

  const allErrors: string[] = [];
  let orgsResult: PassResult | undefined;
  let landbasesResult: PassResult | undefined;
  let supplyGroupsResult: PassResult | undefined;
  let junctionResult: PassResult | undefined;

  try {
    orgsResult = await syncOrganizationsPass(supabase, accessToken, instanceUrl);
    allErrors.push(...orgsResult.errors);

    landbasesResult = await syncLandbasesPass(supabase, accessToken, instanceUrl);
    allErrors.push(...landbasesResult.errors);

    supplyGroupsResult = await syncSupplyGroupsPass(supabase, accessToken, instanceUrl);
    allErrors.push(...supplyGroupsResult.errors);

    junctionResult = await syncSupplyGroupLandbasesPass(supabase, accessToken, instanceUrl);
    allErrors.push(...junctionResult.errors);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[sync] Pass FAILED:', msg);
    await supabase.from('salesforce_credentials').update({
      last_sync_at: new Date().toISOString(),
      last_sync_status: 'error',
      last_sync_error: msg.slice(0, 500),
    }).eq('organization_id', organizationId);
    throw e;
  }

  await supabase.from('salesforce_credentials').update({
    last_sync_at: new Date().toISOString(),
    last_sync_status: allErrors.length > 0 ? 'partial' : 'ok',
    last_sync_error: allErrors.length > 0 ? allErrors.slice(0, 3).join('; ') : null,
  }).eq('organization_id', organizationId);

  console.log('[sync] DONE');
  console.log('[sync] Summary:', JSON.stringify({
    orgs: orgsResult,
    landbases: landbasesResult,
    supplyGroups: supplyGroupsResult,
    junction: junctionResult,
    errors: allErrors.length,
  }));

  return {
    totalFromSalesforce: landbasesResult.total,
    upserted: landbasesResult.upserted,
    // Back-compat aliases for existing callers that referenced the
    // old separated insert/update counts. Bulk upsert doesn't
    // distinguish between insert and update, so we surface the
    // total under both names.
    inserted: 0,
    updated: landbasesResult.upserted,
    errors: allErrors,
    orgs: orgsResult,
    supplyGroups: supplyGroupsResult,
    junction: junctionResult,
  };
}