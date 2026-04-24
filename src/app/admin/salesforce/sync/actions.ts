'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireUser } from '@/lib/auth/requireUser';
import { syncSalesforceLandbases } from '@/lib/salesforce/sync';

export async function runSalesforceSync() {
  const profile = await requireUser();
  if (profile.role !== 'admin') {
    redirect('/admin/salesforce/connect?sync_error=admin_only');
  }

  let redirectUrl: string;
  try {
    console.log('[action] Calling syncSalesforceLandbases...');
    const result = await syncSalesforceLandbases(profile.organization_id);
    console.log('[action] Sync result:', result);
    const params = new URLSearchParams({
      synced: String(result.totalFromSalesforce),
      added: String(result.inserted),
      updated_count: String(result.updated),
    });
    if (result.errors.length > 0) {
      params.set('sync_error', result.errors.slice(0, 3).join('; '));
    }
    redirectUrl = `/admin/salesforce/connect?${params.toString()}`;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[action] Sync threw:', msg);
    redirectUrl = `/admin/salesforce/connect?sync_error=${encodeURIComponent(msg)}`;
  }

  revalidatePath('/admin/salesforce/connect');
  redirect(redirectUrl);
}