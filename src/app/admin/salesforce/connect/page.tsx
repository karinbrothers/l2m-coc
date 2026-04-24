import { redirect } from 'next/navigation';
import { requireUser } from '@/lib/auth/requireUser';
import { createClient } from '@/lib/supabase/server';
import { runSalesforceSync } from '@/app/admin/salesforce/sync/actions';

export default async function SalesforceConnectPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | undefined }>;
}) {
  const params = await searchParams;
  const profile = await requireUser();
  if (profile.role !== 'admin') redirect('/');

  const supabase = await createClient();
  const { data: creds } = await supabase
    .from('salesforce_credentials')
    .select('*')
    .eq('organization_id', profile.organization_id)
    .maybeSingle();

  async function handleSync() {
    'use server';
    await runSalesforceSync();
  }

  return (
    <div className="p-8 max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">Salesforce Connection</h1>

      {params.synced && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded">
          ✓ Synced {params.synced} landbases from Salesforce
          {params.added && ` — ${params.added} added`}
          {params.updated_count && `, ${params.updated_count} updated`}
        </div>
      )}
      {params.sync_error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded">
          ✗ Sync error: <code className="text-xs">{params.sync_error}</code>
        </div>
      )}
      {params.connected && (
        <div className="mb-4 p-4 bg-green-50 border border-green-200 rounded">
          ✓ Connected to Salesforce
        </div>
      )}

      {creds ? (
        <div className="space-y-3 border border-gray-200 rounded p-4">
          <div className="flex items-center gap-2">
            <span className="inline-block w-2 h-2 rounded-full bg-green-500"></span>
            <span className="font-medium">Connected</span>
          </div>
          <dl className="text-sm space-y-1">
            <div className="flex gap-2">
              <dt className="text-gray-500 w-32">Instance:</dt>
              <dd className="font-mono text-xs">{creds.instance_url}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-gray-500 w-32">Connected at:</dt>
              <dd>{new Date(creds.connected_at).toLocaleString()}</dd>
            </div>
            {creds.last_sync_at && (
              <div className="flex gap-2">
                <dt className="text-gray-500 w-32">Last sync:</dt>
                <dd>
                  {new Date(creds.last_sync_at).toLocaleString()}{' '}
                  <span
                    className={
                      creds.last_sync_status === 'ok'
                        ? 'text-green-600'
                        : 'text-red-600'
                    }
                  >
                    ({creds.last_sync_status})
                  </span>
                </dd>
              </div>
            )}
            {creds.last_sync_error && (
              <div className="flex gap-2">
                <dt className="text-gray-500 w-32">Last error:</dt>
                <dd className="text-red-600 text-xs">{creds.last_sync_error}</dd>
              </div>
            )}
          </dl>

          <div className="flex gap-2 mt-3">
            <form action={handleSync}>
              <button
                type="submit"
                className="px-4 py-2 bg-[#063359] text-white rounded hover:bg-[#0a4a7a] text-sm"
              >
                Sync now
              </button>
            </form>
            <form action="/api/salesforce/oauth/start" method="GET">
              <button
                type="submit"
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 rounded text-sm"
              >
                Reconnect
              </button>
            </form>
          </div>
        </div>
      ) : (
        <div className="border border-gray-200 rounded p-6">
          <p className="text-gray-700 mb-4">
            Connect your Salesforce org to automatically sync Landbase eligibility
            data.
          </p>
          <form action="/api/salesforce/oauth/start" method="GET">
            <button
              type="submit"
              className="px-4 py-2 bg-[#063359] text-white rounded hover:bg-[#0a4a7a]"
            >
              Connect Salesforce
            </button>
          </form>
        </div>
      )}
    </div>
  );
}