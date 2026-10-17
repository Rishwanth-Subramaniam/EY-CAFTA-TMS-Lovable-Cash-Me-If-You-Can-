import { createFileRoute, Link } from "@tanstack/react-router";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PageHeader, Panel, Metric, Status, Note } from "@/components/ui-kit";
import { CANON, currencyGroups, fmtInr, fmtInrM, groupCash, groupDebt, groupForecast, headlineOverlap, entityName, fmtNative } from "@/lib/data";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Treasury Overview — Project Sangam" },
      { name: "description", content: "Group cash, debt, same-currency overlap, liquidity and alerts for fictional GCPL (illustrative)." },
      { property: "og:title", content: "Treasury Overview — Project Sangam" },
      { property: "og:description", content: "Control tower for GCPL treasury transformation prototype." },
    ],
  }),
  component: Overview,
});

const m = (v: number) => Math.round(v / 1e6);

function Overview() {
  const { state } = useStore();
  const openExc = state.exceptions.filter((e) => e.status_demo !== "Resolved (simulated)");
  const pending = state.txns.filter((t) => /pending|validation|needs|draft/i.test(t.status));
  const overlapData = currencyGroups.map((g) => ({
    ccy: g.currency + (g.included_in_headline_overlap === "Yes" ? "" : " (island)"),
    Cash: m(g.cash_inr_equivalent),
    Debt: m(g.debt_inr_equivalent),
  }));
  return (
    <>
      <PageHeader n={1} title="Treasury Overview — Control Tower" sub="Group-level headlines across 25 illustrative entities in 15 countries. All INR figures are equivalents at static illustrative rates (₹96.85 per USD), not market rates." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric accent label="Group cash (INR equiv.)" value={fmtInr(groupCash)} sub={groupCash === CANON.groupCash ? "Reconciles to case total" : "Check vs case total"} />
        <Metric label="Group borrowings (INR equiv.)" value={fmtInr(groupDebt)} sub="Gross external debt" />
        <Metric accent label="Same-currency cash/debt overlap" value={fmtInr(headlineOverlap)} sub={<>Target {fmtInr(CANON.overlapMonth7)} by Month 7 · gross basis, islands excluded</>} />
        <Metric label="Committed external credit lines" value={fmtInr(CANON.committedLines)} sub="Kept ready · see Screen 4" />
        <Metric label="Net annual benefit" value={fmtInr(CANON.netAnnualBenefit)} sub={<>Benefit {fmtInr(CANON.annualBenefit)} − running cost {fmtInr(CANON.annualRunningCost)}</>} />
        <Metric label="One-time cost" value={fmtInr(CANON.oneTimeCost)} sub={`Payback Week ${CANON.paybackWeek} (≈ Month 17)`} />
        <Metric label="FX cost vs market mid" value={`${CANON.fxBaselineBps} bps`} sub={`Assumed baseline; TCA Weeks 2–8 · target ${CANON.fxTargetBps} bps by Month 6`} />
        <Metric label="Banks / accounts" value={`${CANON.banksBaseline} → ${CANON.banksTarget} · ${CANON.accountsBaseline} → ${CANON.accountsTarget}`} sub="Programme milestone, Week 39" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Panel className="lg:col-span-2" title="Cash vs debt by currency group" note="₹ million, INR equivalent. Overlap = Σ min(cash, debt) for INR, EUR, USD, CAD, MXN, GBP, AED.">
          <div className="h-64">
            <ResponsiveContainer>
              <BarChart data={overlapData}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="ccy" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => `₹${v.toLocaleString("en-US")} million`} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="Cash" fill="var(--color-chart-2)" />
                <Bar dataKey="Debt" fill="var(--color-chart-1)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <Note>USD group contains only the three US companies. CAD and MXN are separate repay-at-home groups. BRL, BDT, ZAR are local cash islands and excluded from the headline.</Note>
        </Panel>
        <Panel title="Alerts" note="Simulated" actions={<Link to="/risk" className="text-xs font-semibold underline">Risk →</Link>}>
          <ul className="space-y-2 text-xs">
            {openExc.map((e) => (
              <li key={e.exception_id} className="rounded-sm border border-border p-2">
                <div className="flex justify-between gap-2"><span className="num font-semibold">{e.exception_id}</span><Status>{e.severity}</Status></div>
                <div className="mt-1 text-muted-foreground">{e.exception_type} · {entityName(e.entity_id)}</div>
              </li>
            ))}
            <li className="rounded-sm border border-border p-2">
              <Link to="/pools" className="font-semibold underline">{pending.length} transactions awaiting validation/approval</Link>
            </li>
          </ul>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Panel className="lg:col-span-2" title="13-week liquidity forecast — group" note="Human forecast, illustrative. ₹ million INR equivalent at static rates.">
          <div className="h-56">
            <ResponsiveContainer>
              <AreaChart data={groupForecast.map((w) => ({ week: w.week, Closing: m(w.closing), Outflows: m(w.outflows) }))}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="week" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => `₹${v.toLocaleString("en-US")} million`} />
                <Area dataKey="Closing" stroke="var(--color-chart-1)" fill="var(--color-chart-2)" fillOpacity={0.35} />
                <Area dataKey="Outflows" stroke="var(--color-chart-5)" fill="transparent" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Recent simulated movements" actions={<Link to="/pools" className="text-xs font-semibold underline">Work queue →</Link>}>
          <ul className="divide-y divide-border text-xs">
            {state.txns.slice(0, 7).map((t) => (
              <li key={t.transaction_id} className="flex items-start justify-between gap-2 py-2">
                <div>
                  <Link to="/pools" search={{ tx: t.transaction_id }} className="num font-semibold underline">{t.transaction_id}</Link>
                  <div className="text-muted-foreground">{t.transaction_type} · {fmtNative(t.amount_native, t.currency)}</div>
                </div>
                <Status>{t.status}</Status>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
      <p className="mt-4 text-xs text-muted-foreground">Overlap reduction target: {fmtInrM(CANON.overlapBefore)} → {fmtInrM(CANON.overlapMonth7)} by Month 7 (illustrative model target).</p>
    </>
  );
}
