import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { syncSalesforceLandbases } from '@/lib/salesforce/sync';

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization');
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!authHeader || authHeader !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = createAdminClient();
  const { data: orgs } = await supabase
    .from('salesforce_credentials')
    .select('organization_id');

  const results = [];
  for (const org of orgs || []) {
    try {
      const result = await syncSalesforceLandbases(org.organization_id);
      results.push({ organization_id: org.organization_id, ...result });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      results.push({ organization_id: org.organization_id, error: msg });
    }
  }

  return NextResponse.json({ ran_at: new Date().toISOString(), results });
}