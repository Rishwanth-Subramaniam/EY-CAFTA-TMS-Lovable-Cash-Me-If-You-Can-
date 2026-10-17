import { createFileRoute } from "@tanstack/react-router";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PageHeader, Panel, Status, Metric, Note } from "@/components/ui-kit";
import { kpis, CANON, fmtInr, headlineOverlap, ROADMAP } from "@/lib/data";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/reports")({
  head: () => ({
    meta: [
      { title: "Reports & Analytics — Project Sangam" },
      { name: "description", content: "Seven programme KPIs with baselines, targets, deadlines and benefits case (illustrative)." },
      { property: "og:title", content: "Reports & Analytics — Project Sangam" },
      { property: "og:description", content: "Seven treasury KPIs and programme benefits." },
    ],
  }),
  component: Reports,
});

function Reports() {
  const { state } = useStore();
  const released = state.txns.filter((t) => /payment/i.test(t.transaction_type) && /executed|reconciled/i.test(t.status));
  const compliant = released.filter((t) => {
    const ap = state.approvals.filter((a) => a.transaction_id === t.transaction_id);
    return ap.length > 0 && ap.every((a) => a.status_demo === "Approved");
  });
  const breaches = state.txns.filter((t) => /blocked/i.test(t.status)).length;

  // Exactly seven KPIs, in canonical order. Missing baselines are never shown as zero.
  const rows = [
    { id: "KPI-01", base: "Not yet measured (census starts Week 2)", actual: "Pending census", target: "90% / 100%", deadline: "Week 13 / Week 26", variance: "—" },
    { id: "KPI-02", base: "Not yet measured (by Month 3)", actual: "Pending — shadow data only", target: "Within ±10%", deadline: "Month 9", variance: "—" },
    { id: "KPI-03", base: "Not yet measured (from Week 2)", actual: released.length ? `${Math.round((compliant.length / released.length) * 100)}% (${compliant.length}/${released.length}, demo)` : "No released payments in demo", target: "100%", deadline: "Week 4", variance: released.length ? `${Math.round((compliant.length / released.length) * 100) - 100} pp` : "—" },
    { id: "KPI-04", base: "Not yet measured (by Month 3)", actual: `${breaches} blocked items (demo; blocked ≠ unapproved breach)`, target: "0 (count)", deadline: "Month 6", variance: "—" },
    { id: "KPI-05", base: fmtInr(CANON.overlapBefore), actual: `${fmtInr(headlineOverlap)} (demo)`, target: fmtInr(CANON.overlapMonth7), deadline: "Month 7", variance: fmtInr(headlineOverlap - CANON.overlapMonth7) + " above target" },
    { id: "KPI-06", base: `${CANON.fxBaselineBps} bps (assumed; TCA Weeks 2–8)`, actual: "Pending TCA", target: `${CANON.fxTargetBps} bps`, deadline: "Month 6", variance: "—" },
    { id: "KPI-07", base: "Not yet measured (Weeks 2–8)", actual: "Pending", target: "85%", deadline: "Month 12", variance: "—" },
  ];

  return (
    <>
      <PageHeader n={6} title="Reports & Analytics" sub="Exactly seven programme KPIs, in order. Baselines that are not yet measured are shown as pending — never as zero or success." />
      <Panel title="Programme KPIs (7)">
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead><tr><th>#</th><th>KPI & definition</th><th>Baseline</th><th>Actual / demo state</th><th>Target</th><th>Deadline</th><th>Variance</th><th>Owner</th></tr></thead>
            <tbody>
              {rows.map((r, i) => {
                const k = kpis.find((x) => x.kpi_id === r.id)!;
                return (
                  <tr key={r.id}>
                    <td className="num font-semibold">{i + 1}</td>
                    <td className="max-w-sm"><div className="font-semibold">{k.name}</div><div className="text-muted-foreground">{k.calculation}</div><div className="mt-1 text-muted-foreground italic">{k.definition_note}</div></td>
                    <td>{r.base}</td>
                    <td>{/pending|not yet|no released/i.test(r.actual) ? <Status tone="neutral">{r.actual}</Status> : r.actual}</td>
                    <td className="num font-semibold">{r.target}</td>
                    <td>{r.deadline}</td>
                    <td className="num">{r.variance}</td>
                    <td className="text-muted-foreground">{k.owner}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Note>KPI 3 is count-based: released payments with independent approvals and screening ÷ all released payments. KPI 4 is count-based. All actuals are simulated demo states.</Note>
      </Panel>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Panel className="lg:col-span-2" title="Benefits case" note="Annual, illustrative case assumptions (₹ million)">
          <div className="h-56">
            <ResponsiveContainer>
              <BarChart data={[
                { k: "Total benefit", v: CANON.annualBenefit / 1e6 },
                { k: "Running cost", v: CANON.annualRunningCost / 1e6 },
                { k: "Net benefit", v: CANON.netAnnualBenefit / 1e6 },
                { k: "One-time cost", v: CANON.oneTimeCost / 1e6 },
              ]}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="k" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => `₹${Number(v).toFixed(1)} million`} />
                <Bar dataKey="v" fill="var(--color-chart-1)" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            <Metric label="Total annual benefit" value={fmtInr(CANON.annualBenefit)} />
            <Metric label="Annual running cost" value={fmtInr(CANON.annualRunningCost)} />
            <Metric accent label="Net annual benefit" value={fmtInr(CANON.netAnnualBenefit)} />
            <Metric label="One-time cost" value={fmtInr(CANON.oneTimeCost)} sub={`Payback Week ${CANON.paybackWeek} (≈ Month 17)`} />
          </div>
        </Panel>
        <Panel title="Programme milestone (not a KPI)">
          <div className="space-y-2 text-sm">
            <div className="flex justify-between"><span>Banks</span><span className="num font-semibold">{CANON.banksBaseline} → {CANON.banksTarget}</span></div>
            <div className="flex justify-between"><span>Accounts</span><span className="num font-semibold">{CANON.accountsBaseline} → {CANON.accountsTarget}</span></div>
            <div className="flex justify-between"><span>Deadline</span><span className="font-semibold">Week 39</span></div>
            <div className="flex justify-between"><span>Annual fee saving</span><span className="num font-semibold">{fmtInr(CANON.accountFeeSaving)}</span></div>
          </div>
        </Panel>
      </div>

      <Panel className="mt-4" title="Delivery roadmap" note="Relative weeks from programme start, per specification Section 8 (no calendar dates invented)">
        <ol className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
          {ROADMAP.map((r) => (
            <li key={r.when} className="rounded-sm border border-border border-t-4 border-t-primary p-3 text-xs">
              <div className="num font-semibold">{r.when}</div>
              <div className="font-semibold">{r.title}</div>
              <p className="mt-1 text-muted-foreground">{r.text}</p>
            </li>
          ))}
        </ol>
        <Note>Month targets follow the canonical KPIs above (FX 10 bps by Month 6; zero unapproved breaches by Month 6; overlap ₹3,300,000,000 by Month 7; forecast ±10% by Month 9; STP 85% by Month 12).</Note>
      </Panel>
    </>
  );
}
