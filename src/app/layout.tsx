import type { Metadata } from "next";
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
  description:
    "Land to Market — verified grazing supply chain tracking from landbase to brand.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-slate-50 text-slate-900`}
      >
        <div className="flex min-h-screen flex-col">
          {/* Top header — L2M navy brand bar */}
          <header className="bg-[#063359] text-white shadow-sm">
            <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
              <h1 className="text-base font-semibold tracking-tight">
                Land to Market — Chain of Custody
              </h1>
              <div className="flex items-center gap-4 text-xs">
                {user ? (
                  <>
                    <span className="text-white/80">{user.email}</span>
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

          {/* Two-column body: sidebar + main */}
          <div className="mx-auto flex w-full max-w-7xl flex-1">
            <aside className="w-56 shrink-0 border-r border-slate-200 bg-white">
              <nav className="flex flex-col gap-0.5 p-3 text-sm">
                <div className="px-2 pb-1 pt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Navigation
                </div>
                <a
                  className="rounded px-2 py-1.5 text-slate-700 hover:bg-slate-100"
                  href="/"
                >
                  Dashboard
                </a>
                <a
                  className="rounded px-2 py-1.5 text-slate-700 hover:bg-slate-100"
                  href="#"
                >
                  Inventory
                </a>
                <a
                  className="rounded px-2 py-1.5 text-slate-700 hover:bg-slate-100"
                  href="#"
                >
                  Purchases
                </a>
                <a
                  className="rounded px-2 py-1.5 text-slate-700 hover:bg-slate-100"
                  href="#"
                >
                  Sales
                </a>
                <a
                  className="rounded px-2 py-1.5 text-slate-700 hover:bg-slate-100"
                  href="#"
                >
                  Certificates
                </a>
              </nav>
            </aside>

            <main className="flex-1 p-8">{children}</main>
          </div>
        </div>
      </body>
    </html>
  );
}
