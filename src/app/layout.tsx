import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import { headers } from "next/headers";
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
  description:
    "Land to Market — verified grazing supply chain tracking from landbase to brand.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Middleware forwards the pathname so we can render a minimal shell
  // (no sidebar, no sign-out) for public /trace pages.
  const headersList = await headers();
  const pathname = headersList.get("x-pathname") ?? "/";
  const isPublicTraceRoute = pathname.startsWith("/trace");

  // Only fetch auth data for the authenticated app shell — skip it entirely
  // on public trace pages (no cookies needed there).
  let userEmail: string | null = null;
  let isAdmin = false;
  if (!isPublicTraceRoute) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    userEmail = user?.email ?? null;
    if (user) {
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();
      isAdmin = profile?.role === "admin";
    }
  }

  const linkClass =
    "rounded px-2 py-1.5 text-slate-700 hover:bg-slate-100";

  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-slate-50 text-slate-900`}
      >
        {isPublicTraceRoute ? (
          <div className="flex min-h-screen flex-col">
            <header className="bg-[#063359] text-white shadow-sm">
              <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-6">
                <h1 className="text-base font-semibold tracking-tight">
                  Land to Market — Verified Supply Chain
                </h1>
                <span className="text-xs text-white/70">Public trace</span>
              </div>
            </header>
            <main className="mx-auto w-full max-w-5xl flex-1 p-8">
              {children}
            </main>
            <footer className="border-t border-slate-200 bg-white py-4 text-center text-xs text-slate-500">
              Verified by Land to Market · Chain of Custody
            </footer>
          </div>
        ) : (
          <div className="flex min-h-screen flex-col">
            <header className="bg-[#063359] text-white shadow-sm">
              <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
                <h1 className="text-base font-semibold tracking-tight">
                  Land to Market — Chain of Custody
                </h1>
                <div className="flex items-center gap-4 text-xs">
                  {userEmail ? (
                    <>
                      <span className="text-white/80">{userEmail}</span>
                      <form action="/auth/signout" method="post">
                        <button
                          type="submit"
                          className="rounded border border-white/30 px-2 py-1 text-white/90 hover:bg-white/10"
                        >
                          Sign out
                        </button>
                      </form>
                    </>
                  ) : (
                    <span className="text-white/70">v0.1 · development</span>
                  )}
                </div>
              </div>
            </header>

            <div className="mx-auto flex w-full max-w-7xl flex-1">
              <aside className="w-56 shrink-0 border-r border-slate-200 bg-white">
                <nav className="flex flex-col gap-0.5 p-3 text-sm">
                  <div className="px-2 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Navigation
                  </div>
                  <Link href="/" className={linkClass}>Dashboard</Link>
                  <Link href="/inventory" className={linkClass}>Inventory</Link>
                  <Link href="/purchases" className={linkClass}>Purchases</Link>
                  <Link href="/sales" className={linkClass}>Sales</Link>
                  <Link href="#" className={linkClass}>Certificates</Link>

                  {isAdmin ? (
                    <>
                      <div className="mt-4 px-2 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Admin
                      </div>
                      <Link href="/admin/invitations" className={linkClass}>Invitations</Link>
                    </>
                  ) : null}
                </nav>
              </aside>

              <main className="flex-1 p-8">{children}</main>
            </div>
          </div>
        )}
      </body>
    </html>
  );
}
