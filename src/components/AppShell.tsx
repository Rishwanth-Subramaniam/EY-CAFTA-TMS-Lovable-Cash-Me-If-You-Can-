import { Link, Outlet } from "@tanstack/react-router";
import { LayoutDashboard, Wallet, Repeat, Landmark, ShieldCheck, BarChart3, FolderTree, BookOpen, ArrowLeftRight } from "lucide-react";
import { DEMO_DATE } from "@/lib/data";

const NAV = [
  { to: "/", label: "Treasury Overview", icon: LayoutDashboard },
  { to: "/cash", label: "Cash Position", icon: Wallet },
  { to: "/pools", label: "Cash Pools & Transfers", icon: Repeat },
  { to: "/banking", label: "Banking & Counterparties", icon: Landmark },
  { to: "/risk", label: "Risk & Compliance", icon: ShieldCheck },
  { to: "/reports", label: "Reports & Analytics", icon: BarChart3 },
  { to: "/accounts", label: "Banks & Accounts", icon: FolderTree },
  { to: "/policies", label: "Policies & Logic", icon: BookOpen },
] as const;

const NAV_INDEX = Object.fromEntries(NAV.map((n, index) => [n.to, index + 1]));
const GROUPS = [
  { title: "Monitor", items: [NAV[0], NAV[1], NAV[2]] },
  { title: "Structure", items: [NAV[3], NAV[6]] },
  { title: "Control", items: [NAV[4], NAV[5], NAV[7]] },
] as const;

export function AppShell() {
  return (
    <div className="flex min-h-screen bg-background">
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col bg-sidebar text-sidebar-foreground md:flex">
        <div className="border-b border-sidebar-border px-5 py-5">
          <div className="flex items-center gap-2">
            <span className="h-5 w-1.5 bg-sidebar-primary" />
            <span className="text-base font-semibold tracking-tight text-sidebar-accent-foreground">Project Sangam</span>
          </div>
          <div className="mt-1 text-[0.7rem] text-ink-muted">GCPL Treasury Control Tower</div>
        </div>
        <nav className="flex-1 space-y-4 overflow-y-auto p-3">
          {GROUPS.map((group) => (
            <div key={group.title} className="space-y-1.5">
              <div className="px-2 text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-sidebar-foreground/65">{group.title}</div>
              {group.items.map((n, index) => (
                <Link
                  key={n.to}
                  to={n.to}
                  activeOptions={{ exact: true }}
                  className="flex items-center gap-3 rounded-md px-3 py-2 text-[0.8rem] font-medium text-sidebar-foreground/80 transition hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                  activeProps={{ className: "bg-sidebar-primary text-sidebar-primary-foreground hover:bg-sidebar-primary hover:text-sidebar-primary-foreground" }}
                >
                  <n.icon className="h-4 w-4" />
                  <span className="flex-1">{n.label}</span>
                  <span className="num text-[0.65rem] opacity-60">{NAV_INDEX[n.to]}</span>
                </Link>
              ))}
            </div>
          ))}
          <Link to="/banking" hash="fx" className="mt-2 flex items-center gap-3 rounded-md px-3 py-2 text-[0.8rem] text-sidebar-foreground/80 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground">
            <ArrowLeftRight className="h-4 w-4" /> FX & Markets
            <span className="ml-auto text-[0.6rem] opacity-70">in 4</span>
          </Link>
        </nav>
        <div className="border-t border-sidebar-border p-4 text-[0.65rem] leading-relaxed text-ink-muted">
          GCPL is fictional. All records are illustrative/simulated. Not an official EY product. No live bank, TMS, ERP or SWIFT connection.
        </div>
      </aside>
      <div className="min-w-0 flex-1 overflow-x-hidden">
        <header className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-border bg-card px-6 py-2.5">
          <nav className="flex gap-1 overflow-x-auto md:hidden">
            {NAV.map((n, i) => (
              <Link key={n.to} to={n.to} activeOptions={{ exact: true }} className="rounded-sm px-2 py-1 text-xs" activeProps={{ className: "bg-primary text-primary-foreground font-semibold" }}>
                {i + 1}
              </Link>
            ))}
          </nav>
          <div className="hidden text-xs text-muted-foreground md:block">EY CAFTA Case Championship 2026 · Treasury transformation prototype</div>
          <div className="flex items-center gap-2 text-xs">
            <span className="rounded-sm border border-warning/40 bg-warning-soft px-2 py-0.5 font-semibold text-warning">Illustrative demo data</span>
            <span className="num text-muted-foreground">As of {DEMO_DATE} · 10:00 IST (demo)</span>
          </div>
        </header>
        <main className="mx-auto max-w-[1400px] p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
