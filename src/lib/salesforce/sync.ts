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
}

interface SalesforceAccount {
  Id: string;
  Name: string;
  Brand_Partner_Status__c: string | null;
  Supply_Chain_Partner_Status__c: string | null;
  L2M_Retailer_Status__c: string | null;
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
  inserted: number;
  updated: number;
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
           L2M_Retailer_Status__c
    FROM Account
    WHERE Brand_Partner_Status__c = 'Active Brand Partner'
       OR Supply_Chain_Partner_Status__c IN ('Active Supply Chain Partner', 'Non-Partner Supply Chain Actor')
       OR L2M_Retailer_Status__c = 'Active Retailer'
  `.replace(/\s+/g, ' ').trim();

  console.log('[sync] [orgs] Running SOQL...');
  const accounts = await runSOQLAll<SalesforceAccount>(instanceUrl, accessToken, soql);
  console.log('[sync] [orgs] Got', accounts.length, 'records');

  const sfIds = accounts.map((a) => a.Id);
  const existingMap = await fetchExistingIds(supabase, 'organizations', sfIds);

  const errors: string[] = [];
  const toInsert: Record<string, unknown>[] = [];
  const toUpdate: Array<{ id: string; data: Record<string, unknown> }> = [];

  for (const a of accounts) {
    const base = {
      name: a.Name,
      brand_partner_status: a.Brand_Partner_Status__c,
      supply_chain_partner_status: a.Supply_Chain_Partner_Status__c,
      l2m_retailer_status: a.L2M_Retailer_Status__c,
    };
    const existingId = existingMap.get(a.Id);
    if (existingId) {
      toUpdate.push({ id: existingId, data: base });
    } else {
      toInsert.push({ ...base, salesforce_id: a.Id, type: 'brand' });
    }
  }

  console.log('[sync] [orgs] insert:', toInsert.length, 'update:', toUpdate.length);

  let inserted = 0;
  if (toInsert.length) {
    const { error } = await supabase.from('organizations').insert(toInsert);
    if (error) errors.push(`Orgs insert: ${error.message}`);
    else inserted = toInsert.length;
  }

  let updated = 0;
  for (const { id, data } of toUpdate) {
    const { error } = await supabase.from('organizations').update(data).eq('id', id);
    if (error) errors.push(`Orgs update ${id}: ${error.message}`);
    else updated++;
  }

  console.log('[sync] [orgs] done — inserted', inserted, 'updated', updated);
  return { inserted, updated, total: accounts.length, errors };
}

// ============================================================================
// Pass 2: Salesforce Land_Base__c → landbases
// ============================================================================

async function syncLandbasesPass(
  supabase: AdminClient,
  accessToken: string,
  instanceUrl: string,
): Promise<PassResult> {
  const soql = `SELECT Id, Name, Country__c, L2M_Landbase_Eligibility__c, L2M_Landbase_Eligibility_Report_URL__c, L2M_Report_Expiration_Date__c, Latest_Verification_Effective_Date__c FROM Land_Base__c`;

  console.log('[sync] [landbases] Running SOQL...');
  const records = await runSOQLAll<SalesforceLandbase>(instanceUrl, accessToken, soql);
  console.log('[sync] [landbases] Got', records.length, 'records');

  const rows = records.map((r) => {
    const elig = String(r.L2M_Landbase_Eligibility__c ?? '').toLowerCase();
    const eligibility =
      elig.includes('eligible') ? 'eligible' :
      elig.includes('expired') ? 'expired' :
      elig.includes('suspend') ? 'suspended' : 'eligible';
    return {
      name: r.Name,
      salesforce_id: r.Id,
      country: r.Country__c ?? null,
      eligibility_status: eligibility,
      eligibility_report_url: r.L2M_Landbase_Eligibility_Report_URL__c ?? null,
      expiration_date: r.L2M_Report_Expiration_Date__c ?? null,
      verification_date: r.Latest_Verification_Effective_Date__c ?? null,
    };
  });

  const sfIds = rows.map((r) => r.salesforce_id);
  const existingMap = await fetchExistingIds(supabase, 'landbases', sfIds);

  const toInsert = rows.filter((r) => !existingMap.has(r.salesforce_id));
  const toUpdate = rows.filter((r) => existingMap.has(r.salesforce_id));

  console.log('[sync] [landbases] insert:', toInsert.length, 'update:', toUpdate.length);

  const errors: string[] = [];
  let inserted = 0;
  const insertChunkSize = 500;
  for (let i = 0; i < toInsert.length; i += insertChunkSize) {
    const chunk = toInsert.slice(i, i + insertChunkSize);
    const { error } = await supabase.from('landbases').insert(chunk);
    if (error) errors.push(`Landbases insert chunk ${i}: ${error.message}`);
    else inserted += chunk.length;
  }

  let updated = 0;
  for (let i = 0; i < toUpdate.length; i++) {
    const row = toUpdate[i];
    const { error } = await supabase
      .from('landbases')
      .update(row)
      .eq('salesforce_id', row.salesforce_id);
    if (error) errors.push(`Landbases update ${row.salesforce_id}: ${error.message}`);
    else updated++;
    if ((i + 1) % 200 === 0) {
      console.log('[sync] [landbases] Updated', i + 1, 'of', toUpdate.length);
    }
  }

  console.log('[sync] [landbases] done — inserted', inserted, 'updated', updated);
  return { inserted, updated, total: records.length, errors };
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

  const groupSfIds = groups.map((g) => g.Id);
  const existingMap = await fetchExistingIds(supabase, 'supply_groups', groupSfIds);

  const errors: string[] = [];
  const toInsert: Record<string, unknown>[] = [];
  const toUpdate: Array<{ id: string; data: Record<string, unknown> }> = [];
  let skipped = 0;

  for (const g of groups) {
    const orgId = g.Account__c ? orgMap.get(g.Account__c) : undefined;
    if (!orgId) {
      skipped++;
      continue;
    }
    const payload = { name: g.Name, organization_id: orgId };
    const existingId = existingMap.get(g.Id);
    if (existingId) {
      toUpdate.push({ id: existingId, data: payload });
    } else {
      toInsert.push({ ...payload, salesforce_id: g.Id });
    }
  }

  console.log(
    '[sync] [supply_groups] insert:', toInsert.length,
    'update:', toUpdate.length,
    'skipped:', skipped,
  );

  let inserted = 0;
  if (toInsert.length) {
    const { error } = await supabase.from('supply_groups').insert(toInsert);
    if (error) errors.push(`Supply groups insert: ${error.message}`);
    else inserted = toInsert.length;
  }

  let updated = 0;
  for (const { id, data } of toUpdate) {
    const { error } = await supabase.from('supply_groups').update(data).eq('id', id);
    if (error) errors.push(`Supply groups update ${id}: ${error.message}`);
    else updated++;
  }

  console.log('[sync] [supply_groups] done — inserted', inserted, 'updated', updated);
  return { inserted, updated, total: groups.length, errors, skipped };
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

  const assocSfIds = assocs.map((a) => a.Id);
  const existingMap = await fetchExistingIds(supabase, 'supply_group_landbases', assocSfIds);

  const errors: string[] = [];
  const toInsert: Record<string, unknown>[] = [];
  const toUpdate: Array<{ id: string; data: Record<string, unknown> }> = [];
  let skipped = 0;

  for (const a of assocs) {
    const supply_group_id = a.Supply_Group__c ? sgMap.get(a.Supply_Group__c) : undefined;
    const landbase_id = a.Landbase__c ? lbMap.get(a.Landbase__c) : undefined;
    if (!supply_group_id || !landbase_id) {
      skipped++;
      continue;
    }
    const payload = {
      supply_group_id,
      landbase_id,
      association_status: a.Association_Status__c,
    };
    const existingId = existingMap.get(a.Id);
    if (existingId) {
      toUpdate.push({ id: existingId, data: payload });
    } else {
      toInsert.push({ ...payload, salesforce_id: a.Id });
    }
  }

  console.log(
    '[sync] [junction] insert:', toInsert.length,
    'update:', toUpdate.length,
    'skipped:', skipped,
  );

  let inserted = 0;
  const insertChunkSize = 500;
  for (let i = 0; i < toInsert.length; i += insertChunkSize) {
    const chunk = toInsert.slice(i, i + insertChunkSize);
    const { error } = await supabase.from('supply_group_landbases').insert(chunk);
    if (error) errors.push(`Junction insert chunk ${i}: ${error.message}`);
    else inserted += chunk.length;
  }

  let updated = 0;
  for (const { id, data } of toUpdate) {
    const { error } = await supabase.from('supply_group_landbases').update(data).eq('id', id);
    if (error) errors.push(`Junction update ${id}: ${error.message}`);
    else updated++;
  }

  console.log('[sync] [junction] done — inserted', inserted, 'updated', updated);
  return { inserted, updated, total: assocs.length, errors, skipped };
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
    landbases: { i: landbasesResult.inserted, u: landbasesResult.updated, t: landbasesResult.total },
    supplyGroups: supplyGroupsResult,
    junction: junctionResult,
    errors: allErrors.length,
  }));

  return {
    totalFromSalesforce: landbasesResult.total,
    inserted: landbasesResult.inserted,
    updated: landbasesResult.updated,
    errors: allErrors,
    orgs: orgsResult,
    supplyGroups: supplyGroupsResult,
    junction: junctionResult,
  };
}
