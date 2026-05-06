import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { createClient } from "@/lib/supabase/server";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "L2M Chain of Custody",
  description: "Land to Market Chain of Custody MVP",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const linkClass =
    "block px-3 py-2 rounded text-sm font-medium text-slate-100 hover:bg-[#0a4a7e]";

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let userEmail: string | null = null;
  let userRole: string | null = null;
  let isFinalBrand = false;

  if (user) {
    userEmail = user.email ?? null;
    const { data: profile } = await supabase
      .from("profiles")
      .select("role, organization:organization_id(is_final_brand)")
      .eq("id", user.id)
      .maybeSingle();
    userRole = profile?.role ?? null;
    const org = profile?.organization as unknown as { is_final_brand: boolean } | null;
    isFinalBrand = org?.is_final_brand ?? false;
  }

  const isAdmin = userRole === "admin";

  return (
    <html lang="en">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <div className="flex min-h-screen">
          <aside className="w-56 flex flex-col bg-[#063359] p-4 print:hidden">
            <div className="mb-6 px-2">
              <Image
                src="/chain-of-custody-logo.svg"
                alt="Land to Market — Chain of Custody"
                width={112}
                height={100}
                priority
                className="h-auto w-40"
              />
            </div>
            <nav className="space-y-1 flex-1">
              <Link href="/" className={linkClass}>Dashboard</Link>
              <Link href="/landbases" className={linkClass}>Landbases</Link>
              <Link href="/purchases" className={linkClass}>Purchases</Link>
              <Link href="/inventory" className={linkClass}>Inventory</Link>
              {isFinalBrand ? null : (
                <Link href="/processing" className={linkClass}>Processing</Link>
              )}
              {isFinalBrand ? null : (
                <Link href="/sales" className={linkClass}>Sales</Link>
              )}
              <Link href="/inbox" className={linkClass}>Inbox</Link>
              <Link href="/partner-requests" className={linkClass}>Partner Requests</Link>
              <Link href="/certificates" className={linkClass}>Certificates</Link>
              {isAdmin ? (
                <>
                  <div className="mt-4 pt-4 border-t border-[#0a4a7e]">
                    <p className="px-3 pb-1 text-[10px] uppercase tracking-wide text-slate-400">
                      Admin
                    </p>
                  </div>
                  <Link href="/admin/invitations" className={linkClass}>Invitations</Link>
                  <Link href="/admin/salesforce/connect" className={linkClass}>Salesforce sync</Link>
                </>
              ) : null}
            </nav>
            {userEmail ? (
              <div className="mt-4 border-t border-[#0a4a7e] pt-4">
                <p className="px-3 pb-2 text-xs text-slate-300 truncate" title={userEmail}>
                  {userEmail}
                </p>
                <form action="/auth/signout" method="post">
                  <button
                    type="submit"
                    className="w-full text-left px-3 py-2 rounded text-sm font-medium text-slate-100 hover:bg-[#0a4a7e]"
                  >
                    Sign out
                  </button>
                </form>
              </div>
            ) : null}
          </aside>
          <main className="flex-1 bg-slate-50 p-8">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}