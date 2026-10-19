import { createFileRoute, Link } from "@tanstack/react-router";
import { PageHeader, Panel, Status, Metric, Note } from "@/components/ui-kit";
import { banks, targetAccounts, currencyGroups, fxDeals, fmtInr, fmtNative, CANON, RATES, entityName } from "@/lib/data";

export const Route = createFileRoute("/banking")({
  head: () => ({
    meta: [
      { title: "Banking & Counterparties — Project Sangam" },
      { name: "description", content: "Target bank relationships, committed facilities, borrowing summary and FX view (illustrative)." },
      { property: "og:title", content: "Banking & Counterparties — Project Sangam" },
      { property: "og:description", content: "Seven target bank relationships and ₹3,000,000,000 committed lines." },
    ],
  }),
  component: Banking,
});

const COVERAGE = [
  { bank: "HSBC", countries: "Germany, France, Italy, Spain, Netherlands, UK" },
  { bank: "Citi", countries: "USA, Canada, Mexico, Brazil, UAE, Bangladesh" },
  { bank: "Standard Bank", countries: "South Africa" },
  { bank: "Scotiabank", countries: "Ireland" },
  { bank: "Existing Indian partner (named Week 4)", countries: "India — parent main accounts" },
  { bank: "Relationship lender A", countries: "Pending loan register review (Day 90) — no operating accounts" },
  { bank: "Relationship lender B", countries: "Pending loan register review (Day 90) — no operating accounts" },
];

const STANDBY = [
  ["EUR standby header", "Citi Netherlands"],
  ["USD standby header", "HSBC USA"],
  ["Indian parent standby", "HSBC India"],
  ["Largest German company standby", "Citi"],
  ["Largest UK company standby", "A relationship lender (pending Day 90)"],
];

function Banking() {
  const debtTotal = currencyGroups.reduce((s, g) => s + g.debt_inr_equivalent, 0);
  return (
    <>
      <PageHeader n={4} title="Banking & Counterparties" sub={`Target ${CANON.banksTarget} bank relationships from a baseline of ${CANON.banksBaseline}. Ratings are not verified — illustrative placeholders only.`} about="Map the target banking landscape, active pool headers, standby accounts and the pending relationship lenders. This screen summarises the design assumptions and flags where data is intentionally illustrative rather than live bank information." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Metric accent label="Committed external credit lines" value={fmtInr(CANON.committedLines)} sub="Kept ready for liquidity" />
        <Metric label="Gross borrowings (INR equiv.)" value={fmtInr(debtTotal)} />
        <Metric label="Bank relationships" value={`${CANON.banksBaseline} → ${CANON.banksTarget}`} sub="By Week 39" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Target bank map" note="Country coverage per canonical design">
          <table className="data-table">
            <thead><tr><th>Bank</th><th>Coverage</th></tr></thead>
            <tbody>{COVERAGE.map((c) => <tr key={c.bank}><td className="font-medium">{c.bank}</td><td>{c.countries}</td></tr>)}</tbody>
          </table>
        </Panel>
        <Panel title="Active pool headers vs standby accounts" note="Standby accounts are fallbacks, not active pool masters">
          <div className="mb-3 grid grid-cols-3 gap-2 text-xs">
            {[["EUR", "HSBC Netherlands"], ["USD", "Citi USA"], ["INR", "Existing Indian partner"]].map(([c, b]) => (
              <div key={c} className="rounded-sm border-l-4 border-l-primary border border-border p-2"><div className="eyebrow">Active {c} header</div><div className="font-semibold">{b}</div></div>
            ))}
          </div>
          <table className="data-table">
            <thead><tr><th>Standby account</th><th>Bank</th></tr></thead>
            <tbody>{STANDBY.map(([a, b]) => <tr key={a}><td>{a}</td><td>{b} <Status tone="info">Standby</Status></td></tr>)}</tbody>
          </table>
        </Panel>
      </div>

      <Panel className="mt-4" title="Counterparties" note="Target-state banking relationships and target account allocation (42 total)">
        <table className="data-table">
          <thead><tr><th>Target bank</th><th>Role & coverage</th><th>Type</th><th>Rating</th><th>Target accounts</th><th>Note</th></tr></thead>
          <tbody>
            {banks.filter((b) => b.relationship_type !== "Baseline bank candidate; no target relationship").map((b) => (
              <tr key={b.bank_id}>
                <td className="font-medium">{b.bank_name_demo}</td>
                <td>{b.role_and_coverage}</td>
                <td>{b.relationship_type}</td>
                <td><Status tone="warn">{b.rating_demo}</Status></td>
                <td className="num">{targetAccounts.filter((a) => a.bank_id === b.bank_id).length}</td>
                <td className="text-muted-foreground">{b.selection_or_relationship_note}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <Note>The target allocation totals 42 accounts across seven target relationships. Counterparty limits are not provided in the case data — shown as “to be set by Treasury Committee”. No lender winner is invented.</Note>
      </Panel>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Borrowing summary by currency group" note="Compact view · INR equivalent at static illustrative rates">
          <table className="data-table">
            <thead><tr><th>Group</th><th>Debt (INR equiv.)</th><th>Handling</th></tr></thead>
            <tbody>{currencyGroups.map((g) => <tr key={g.group_id}><td className="num">{g.currency}</td><td className="num">{fmtInr(g.debt_inr_equivalent)}</td><td className="text-muted-foreground">{g.handling_rule}</td></tr>)}</tbody>
          </table>
          <p className="mt-2 text-xs"><Link to="/pools" hash="ledger" className="underline">Intercompany loan detail → Screen 3 ledger</Link></p>
        </Panel>
        <Panel title="Maturity calendar" note="Compact">
          <div className="grid grid-cols-4 gap-2 text-xs">
            {["Q4 2026", "Q1 2027", "Q2 2027", "Q3 2027"].map((q) => (
              <div key={q} className="rounded-sm border border-dashed border-border p-3"><div className="eyebrow">{q}</div><div className="mt-2 text-muted-foreground">Maturities pending loan register review (Day 90)</div></div>
            ))}
          </div>
          <Note>Facility maturities and rates are not in the case data; they populate after the Day-90 loan register. Nothing is invented here.</Note>
        </Panel>
      </div>

      <div id="fx" className="mt-4">
        <Panel title="FX & Markets" note={`Rates are static illustrative values — no live market feed. FX cost baseline ${CANON.fxBaselineBps} bps (assumed, TCA Weeks 2–8) → ${CANON.fxTargetBps} bps by Month 6.`}>
          <table className="data-table">
            <thead><tr><th>Deal</th><th>Pair</th><th>Amount</th><th>Mid (demo)</th><th>Proposed</th><th>Spread</th><th>Quotes</th><th>Limit</th><th>State</th></tr></thead>
            <tbody>
              {fxDeals.map((f) => {
                const bps = Math.abs((f.proposed_rate_demo - f.market_mid_demo) / f.market_mid_demo) * 10000;
                return (
                  <tr key={f.fx_deal_id}>
                    <td className="num">{f.fx_deal_id}<div><Link to="/pools" search={{ tx: f.transaction_id }} className="underline">{f.transaction_id}</Link></div></td>
                    <td>{f.direction} {f.base_currency}/{f.quote_currency}</td>
                    <td className="num">{fmtNative(f.amount_native, f.amount_currency)}</td>
                    <td className="num">{f.market_mid_demo}</td>
                    <td className="num">{f.proposed_rate_demo}</td>
                    <td className={`num ${bps > CANON.fxTargetBps ? "text-danger" : "text-success"}`}>{bps.toFixed(1)} bps</td>
                    <td>{f.quote_count} · <span className="text-muted-foreground">{f.quote_evidence_status}</span></td>
                    <td><Status>{f.limit_check_demo}</Status></td>
                    <td><Status>{f.approval_state_demo}</Status></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-muted-foreground">Illustrative INR per unit: {Object.entries(RATES).map(([c, r]) => `${c} ${r}`).join(" · ")}. Not current market rates. Counterparty: {entityName("ENT-IN")} central treasury desk (demo).</p>
        </Panel>
      </div>
    </>
  );
}
