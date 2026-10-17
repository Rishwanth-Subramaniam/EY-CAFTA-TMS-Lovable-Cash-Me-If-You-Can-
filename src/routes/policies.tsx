import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { PageHeader, Panel, Status, Select, Note } from "@/components/ui-kit";
import { policies, decisionLog, entities, entityById, fmtInr, toInr, FRONT_OFFICE_THRESHOLD_INR } from "@/lib/data";
import { useStore, validate, requiredControls } from "@/lib/store";

export const Route = createFileRoute("/policies")({
  head: () => ({
    meta: [
      { title: "Policies, Logic & Decision Transparency — Project Sangam" },
      { name: "description", content: "Read-only policy library, system flow, decision explanations and what-if simulation (illustrative)." },
      { property: "og:title", content: "Policies & Decision Transparency — Project Sangam" },
      { property: "og:description", content: "Why each recommendation or block happened, with evidence and rule." },
    ],
  }),
  component: Policies,
});

const FLOW = ["Bank statements (simulated)", "Cash position & 13-week forecast", "Rule engine checks", "Recommendation / block", "Human maker → checker → screening", "Simulated execution", "Reconciliation & audit"];

function Policies() {
  const { state } = useStore();
  const [pid, setPid] = useState(policies[0].policy_id);
  const [from, setFrom] = useState("ENT-DE");
  const [to, setTo] = useState("ENT-NL");
  const [amt, setAmt] = useState("100000");
  const p = policies.find((x) => x.policy_id === pid)!;
  const fromE = entityById(from);
  const sim = { from_entity_id: from, to_entity_id: to, currency: fromE?.native_currency, amount_native: Number(amt) || 0 };
  const v = validate(sim);
  const blockedLive = state.txns.filter((t) => /blocked/i.test(t.status));

  return (
    <>
      <PageHeader n={8} title="Treasury Policies, Logic & Decision Transparency" sub="Read-only. Policies are owned by the Treasury Committee; employees cannot create, edit, delete or submit policies here." />

      <Panel title="System flow" note="Rules run routine operations; people approve exceptions; machine forecasting must earn its place.">
        <div className="flex flex-wrap items-center gap-1 text-xs">
          {FLOW.map((f, i) => (
            <span key={f} className="flex items-center gap-1"><span className={`rounded-sm border px-2 py-1.5 ${i === 4 ? "border-primary bg-primary text-primary-foreground font-semibold" : "border-border bg-card"}`}>{f}</span>{i < FLOW.length - 1 && <ArrowRight className="h-3 w-3 text-muted-foreground" />}</span>
          ))}
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-3 text-xs">
          <div className="rounded-sm border-l-4 border-l-ink border border-border p-3"><div className="eyebrow">Rules (deterministic)</div>Sweeps at cut-off, target top-ups, statement matching, sanctions checks, duplicate-payment blocks, FX limit blocks.</div>
          <div className="rounded-sm border-l-4 border-l-primary border border-border p-3"><div className="eyebrow">Human decisions</div>Every payment: maker, independent checker, sanctions screening; front-office approver above the configured threshold (illustrative, {fmtInr(FRONT_OFFICE_THRESHOLD_INR)}). Exceptions and overrides.</div>
          <div className="rounded-sm border-l-4 border-l-success border border-border p-3"><div className="eyebrow">AI-assisted (advisory)</div>Machine forecast shadow-runs from Week 39; replaces the human forecast only after outperforming for three consecutive months on the same KPI. Anomaly flags never approve, release or stop payments.</div>
        </div>
      </Panel>

      <div className="mt-4 grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
        <Panel title="Policy library" note="Read-only">
          <ul className="space-y-1 text-xs">
            {policies.map((x) => (
              <li key={x.policy_id}><button onClick={() => setPid(x.policy_id)} className={`w-full rounded-sm px-2 py-1.5 text-left ${pid === x.policy_id ? "bg-primary text-primary-foreground font-semibold" : "hover:bg-muted"}`}><span className="num">{x.policy_id}</span> · {x.policy_name}</button></li>
            ))}
          </ul>
        </Panel>
        <Panel title={`${p.policy_id} — ${p.policy_name}`} note={p.display_status}>
          <div className="space-y-3 text-sm">
            <p className="border-l-4 border-primary bg-accent p-3 font-medium">{p.rule_text}</p>
            <dl className="grid gap-3 text-xs md:grid-cols-2">
              <div><dt className="eyebrow">Scope</dt><dd>{p.scope}</dd></div>
              <div><dt className="eyebrow">Owner / authority</dt><dd>{p.owner_or_authority}</dd></div>
              <div><dt className="eyebrow">Clarification</dt><dd>{p.clarification}</dd></div>
              <div><dt className="eyebrow">Linked objects</dt><dd>{p.linked_objects}</dd></div>
            </dl>
            <div>
              <div className="eyebrow mb-1">Version history</div>
              <table className="data-table"><thead><tr><th>Version</th><th>Effective</th><th>Status</th></tr></thead><tbody><tr><td className="num">{p.version_demo}</td><td>{p.effective_date_demo}</td><td>{p.display_status}</td></tr></tbody></table>
            </div>
            <div>
              <div className="eyebrow mb-1">Transactions applying this rule</div>
              <div className="flex flex-wrap gap-1 text-xs">{state.txns.filter((t) => String(t.policy_ids ?? "").includes(p.policy_id)).map((t) => <Link key={t.transaction_id} to="/pools" search={{ tx: t.transaction_id }} className="rounded-sm border border-border px-1.5 py-0.5 hover:bg-muted"><span className="num">{t.transaction_id}</span> · {t.status}</Link>)}</div>
            </div>
          </div>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Decision explanation centre" note="Evidence and applicable rule per recommendation / block">
          <ul className="space-y-2 text-xs">
            {decisionLog.map((d) => (
              <li key={d.decision_id} className="rounded-sm border border-border p-3">
                <div className="flex flex-wrap justify-between gap-2"><span><span className="num font-semibold">{d.decision_id}</span> · {d.decision_type} · <Link to="/pools" search={{ tx: d.related_transaction_id }} className="num underline">{d.related_transaction_id}</Link></span><Status>{d.outcome}</Status></div>
                <p className="mt-1">{d.explanation}</p>
                <p className="text-muted-foreground"><b>Evidence:</b> {d.evidence_used} · <b>Rule:</b> {d.policy_ids} · <b>Next:</b> {d.next_step}</p>
              </li>
            ))}
            {blockedLive.map((t) => (
              <li key={t.transaction_id} className="rounded-sm border border-danger/30 p-3">
                <div className="flex justify-between"><span className="num font-semibold">{t.transaction_id}</span><Status>{t.status}</Status></div>
                <p className="mt-1">{validate(t).reasons.join(" ") || t.decision_rationale}</p>
                <p className="text-muted-foreground">Override requires a recorded Treasury Committee exception — never automatic.</p>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="What-if simulation" note="Explore how rules would treat a hypothetical transfer. Nothing is created.">
          <div className="grid gap-3 text-xs md:grid-cols-3">
            <Select label="From" value={from} onChange={setFrom} options={entities.map((e) => ({ value: e.entity_id, label: `${e.entity_name_demo} (${e.native_currency})` }))} />
            <Select label="To" value={to} onChange={setTo} options={entities.map((e) => ({ value: e.entity_id, label: `${e.entity_name_demo} (${e.native_currency})` }))} />
            <label className="flex items-center gap-2"><span className="eyebrow">Amount ({fromE?.native_currency})</span><input type="number" value={amt} onChange={(e) => setAmt(e.target.value)} className="num w-28 rounded-sm border border-input bg-card px-2 py-1.5" /></label>
          </div>
          <div className="mt-4 rounded-sm border border-border p-3 text-xs">
            <div className="flex items-center gap-2"><span className="font-semibold">Rule outcome:</span>{v.ok ? <Status tone="ok">Eligible for proposal</Status> : <Status tone="bad">Would be blocked by policy</Status>}</div>
            {v.reasons.map((r) => <p key={r} className="mt-1 text-danger">• {r}</p>)}
            <p className="mt-2">INR equivalent (static illustrative): <span className="num">{fmtInr(toInr(sim.amount_native, sim.currency ?? "INR"))}</span></p>
            <p className="mt-1">Required human controls: {requiredControls(sim).join(" → ")}</p>
          </div>
          <Note>Cash above target is not automatically deployable: same-currency debt, pool eligibility, transfer cadence and legal/tax restrictions are validated first.</Note>
        </Panel>
      </div>
    </>
  );
}
