import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Check } from "lucide-react";
import { PageHeader, Panel, Status, Btn, Select, Note } from "@/components/ui-kit";
import { pools, bankName, entityName, fmtNative, fmtInr, toInr, FRONT_OFFICE_THRESHOLD_INR, policyById } from "@/lib/data";
import { useStore, validate, LIFECYCLE, requiredControls } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/pools")({
  validateSearch: (s: Record<string, unknown>): { tx?: string } => (typeof s.tx === "string" ? { tx: s.tx } : {}),
  head: () => ({
    meta: [
      { title: "Cash Pools & Transfers — Project Sangam" },
      { name: "description", content: "Pools, transaction work queue, approvals, simulated execution, reconciliation and intercompany ledger." },
      { property: "og:title", content: "Cash Pools & Transfers — Project Sangam" },
      { property: "og:description", content: "Guided transfer lifecycle with maker-checker controls (simulated)." },
    ],
  }),
  component: Pools,
});

const stageIndex = (s: string) => {
  if (/reconciled/i.test(s)) return 5;
  if (/executed|scheduled/i.test(s)) return 4;
  if (/approved/i.test(s) && !/pending/i.test(s)) return 3;
  if (/pending/i.test(s)) return 2;
  if (/validated/i.test(s)) return 1;
  return 0;
};

function Pools() {
  const { tx } = Route.useSearch();
  const navigate = useNavigate({ from: "/pools" });
  const { state, dispatch } = useStore();
  const [filter, setFilter] = useState("ALL");
  const t = state.txns.find((x) => x.transaction_id === tx);
  const txApprovals = state.approvals.filter((a) => a.transaction_id === tx);
  const queue = state.txns.filter((x) => filter === "ALL" || (filter === "OPEN" ? stageIndex(x.status) < 4 && !/blocked|reject|failed/i.test(x.status) : filter === "BLOCKED" ? /blocked|reject|failed/i.test(x.status) : stageIndex(x.status) >= 4));
  const ledger = state.txns.filter((x) => /intercompany loan/i.test(x.transaction_type));
  const blocked = /blocked|reject|failed/i.test(t?.status ?? "");
  const linkedExceptions = state.exceptions.filter((e) => e.linked_transaction_id === t?.transaction_id);
  const issueSummary = blocked ? (t?.decision_rationale ?? "Transaction is blocked and needs a human decision.") : linkedExceptions.length > 0 ? linkedExceptions[0].reason : "No issue recorded — the transaction is progressing normally.";

  const runValidation = () => {
    if (!t) return;
    const v = validate(t);
    dispatch({ type: "status", id: t.transaction_id, status: v.ok ? "Validated (simulated)" : "Blocked by policy", actor: "System rule engine", reason: v.ok ? "Same-currency, pool eligibility, cadence and restriction checks passed (simulated)." : v.reasons.join(" "), policy: v.ok ? "POL-POOL-01" : "POL-POOL-01;POL-IN-01" });
  };

  return (
    <>
      <PageHeader n={3} title="Cash Pools & Transfers" sub="Continue proposals started on Screen 2 through validation, approvals, simulated execution and reconciliation. Bank-configured sweeps appear as simulated automated events." about="This is the work queue for every proposed transfer or sweep. Review the lifecycle state, required controls, failure reason and available next step before moving a transaction to approval or reconciliation." />

      <Panel title="Pools and currency groups" note="Primary active headers: EUR at HSBC Netherlands, USD at Citi USA, INR at the existing Indian partner bank. Standby accounts are not pool masters.">
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-5">
          {pools.map((p) => (
            <div key={p.pool_id} className="rounded-sm border border-border p-3 text-xs">
              <div className="flex items-start justify-between gap-1"><span className="font-semibold">{p.pool_name}</span><span className="num rounded-sm bg-ink px-1 text-ink-foreground">{p.currency}</span></div>
              <div className="mt-1 text-muted-foreground">{bankName(p.bank_id)} · {p.sweep_cadence}</div>
              <div className="mt-1">{String(p.participant_entity_ids).split(";").map((x: string) => entityName(x.trim())).join(", ")}</div>
              <div className="mt-2"><Status>{p.status_demo}</Status></div>
            </div>
          ))}
        </div>
      </Panel>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_440px]">
        <Panel title="Transaction work queue" actions={<Select label="Show" value={filter} onChange={setFilter} options={[{ value: "ALL", label: "All" }, { value: "OPEN", label: "In progress" }, { value: "BLOCKED", label: "Blocked / failed" }, { value: "DONE", label: "Executed / reconciled" }]} />}>
          <div className="max-h-[560px] overflow-auto">
            <table className="data-table">
              <thead><tr><th>ID</th><th>Type</th><th>From → To</th><th>Amount (native)</th><th>Status</th></tr></thead>
              <tbody>
                {queue.map((x) => (
                  <tr key={x.transaction_id} onClick={() => navigate({ search: { tx: x.transaction_id } })} className={cn("cursor-pointer", x.transaction_id === tx && "bg-accent")}>
                    <td className="num font-semibold">{x.transaction_id}</td>
                    <td>{x.transaction_type}</td>
                    <td className="text-muted-foreground">{entityName(x.from_entity_id)} → {entityName(x.to_entity_id)}</td>
                    <td className="num">{fmtNative(x.amount_native, x.currency)}</td>
                    <td><Status>{x.status}</Status></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>

        <Panel className="min-w-0" title={t ? `${t.transaction_id} · ${t.transaction_type}` : "Select a transaction"} note={t ? `Created ${t.created_timestamp_demo ?? t.created_at_demo}` : "Proposals from Screen 2 open here automatically."}>
          {t ? (
            <div className="space-y-4 text-xs">
              <ol className="flex flex-wrap gap-1">
                {LIFECYCLE.map((s, i) => {
                  const done = !blocked && stageIndex(t.status) >= i;
                  return <li key={s} className={cn("flex items-center gap-1 rounded-sm border px-1.5 py-1", done ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground")}>{done && <Check className="h-3 w-3" />}{s.replace(" (simulated)", "")}</li>;
                })}
              </ol>
              <div className="grid grid-cols-2 gap-2">
                <div><div className="eyebrow">Amount</div><div className="num font-semibold">{fmtNative(t.amount_native, t.currency)}</div><div className="num text-muted-foreground">{fmtInr(toInr(t.amount_native, t.currency))} INR equiv.</div></div>
                <div><div className="eyebrow">Status</div><Status>{t.status}</Status></div>
                <div><div className="eyebrow">From</div>{entityName(t.from_entity_id)}</div>
                <div><div className="eyebrow">To</div>{entityName(t.to_entity_id)}</div>
              </div>
              {(blocked || linkedExceptions.length > 0) && (
                <div className="rounded-sm border border-danger/30 bg-danger-soft p-2 text-xs">
                  <div className="font-semibold text-danger">Next step required</div>
                  <p className="mt-1">{issueSummary}</p>
                  {linkedExceptions.length > 0 && (
                    <div className="mt-1 text-muted-foreground">Exception: {linkedExceptions[0].exception_id} · {linkedExceptions[0].next_action}</div>
                  )}
                </div>
              )}
              <p><span className="font-semibold">Rationale: </span>{t.decision_rationale}</p>
              <p><span className="font-semibold">Policies: </span>{String(t.policy_ids ?? "").split(";").filter(Boolean).map((p: string) => <Link key={p} to="/policies" className="mr-2 underline">{p} {policyById(p.trim())?.policy_name ? `(${policyById(p.trim())?.policy_name})` : ""}</Link>)}</p>
              <div>
                <div className="eyebrow mb-1">Required controls</div>
                <div className="flex flex-wrap gap-1">{requiredControls(t).map((r) => <span key={r} className="rounded-sm border border-border px-1.5 py-0.5">{r}</span>)}</div>
                <p className="mt-1 text-muted-foreground">Front-office approver required above {fmtInr(FRONT_OFFICE_THRESHOLD_INR)} INR equiv. — Configured threshold, illustrative.</p>
              </div>
              {txApprovals.length > 0 && (
                <table className="data-table">
                  <thead><tr><th>Step</th><th>Role</th><th>Status</th><th></th></tr></thead>
                  <tbody>
                    {txApprovals.map((a) => (
                      <tr key={a.approval_id}>
                        <td>{a.approval_type}<div className="text-muted-foreground">{a.segregation_of_duties_check}</div></td>
                        <td>{a.approver_role}</td>
                        <td><Status>{a.status_demo}</Status></td>
                        <td className="whitespace-nowrap">{a.status_demo === "Pending" && !blocked && (<><Btn onClick={() => dispatch({ type: "approve", id: t.transaction_id, role: a.approval_type, decision: "Approved" })}>Approve</Btn> <Btn variant="danger" onClick={() => dispatch({ type: "approve", id: t.transaction_id, role: a.approval_type, decision: "Rejected" })}>Reject</Btn></>)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <div className="flex flex-wrap gap-2 border-t border-border pt-3">
                {stageIndex(t.status) === 0 && !blocked && <Btn variant="ink" onClick={runValidation}>Run validation</Btn>}
                {(stageIndex(t.status) === 1 || (stageIndex(t.status) === 2 && txApprovals.length === 0)) && <Btn variant="ink" onClick={() => dispatch({ type: "status", id: t.transaction_id, status: "Pending approval", actor: "Treasury Analyst (maker)", reason: "Submitted for independent approval" })}>Submit for approval</Btn>}
                {stageIndex(t.status) === 3 && <Btn variant="primary" onClick={() => dispatch({ type: "status", id: t.transaction_id, status: "Executed (simulated)", actor: "System (simulated)", reason: "Execution simulated — no real money moved" })}>Simulate execution</Btn>}
                {stageIndex(t.status) === 3 && /sweep/i.test(t.transaction_type) && <Btn variant="danger" onClick={() => dispatch({ type: "failSweep", id: t.transaction_id })}>Simulate sweep failure</Btn>}
                {stageIndex(t.status) === 4 && <Btn variant="ink" onClick={() => dispatch({ type: "status", id: t.transaction_id, status: "Reconciled (simulated)", actor: "Statement matching (simulated)", reason: "Matched to next-morning statement (simulated)" })}>Reconcile</Btn>}
                {blocked && <Link to="/risk" className="font-semibold underline">Investigate in Risk & Compliance →</Link>}
                <Link to="/policies" className="font-semibold underline">Why? Decision explanation →</Link>
              </div>
              <p className="text-muted-foreground">{t.execution_note ?? "Simulated only"} · No live bank, TMS or SWIFT connection.</p>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Pick a row in the work queue, or start a proposal from Cash Position.</p>
          )}
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Automated sweep monitor" note="Bank-configured sweeps, simulated">
          <table className="data-table">
            <thead><tr><th>Sweep</th><th>Route</th><th>Amount</th><th>Status</th><th>Reconciliation</th></tr></thead>
            <tbody>
              {state.sweeps.map((s) => (
                <tr key={s.sweep_id}><td className="num">{s.sweep_id}<div className="text-muted-foreground">{s.cutoff_timestamp_demo}</div></td><td>{entityName(s.source_entity_id)} → {entityName(s.destination_entity_id)}</td><td className="num">{fmtNative(s.amount_native, s.currency)}</td><td><Status>{s.sweep_status_demo}</Status></td><td><Status>{s.reconciliation_status_demo}</Status><div className="text-muted-foreground">{s.exception_reference}</div></td></tr>
              ))}
            </tbody>
          </table>
        </Panel>
        <Panel title="Exceptions linked to transfers" actions={<Link to="/risk" className="text-xs font-semibold underline">Queue →</Link>}>
          <ul className="space-y-2 text-xs">
            {state.exceptions.map((e) => (
              <li key={e.exception_id} className="flex justify-between gap-2 rounded-sm border border-border p-2"><div><span className="num font-semibold">{e.exception_id}</span> · {e.exception_type} · <span className="num">{e.linked_transaction_id}</span><div className="text-muted-foreground">{e.reason}</div></div><Status>{e.status_demo}</Status></li>
            ))}
          </ul>
        </Panel>
      </div>

      <div id="ledger" className="mt-4">
        <Panel title="Intercompany loan ledger" note="Detailed intercompany loan records live here (not on Screen 4). Arm’s-length interest/TDS checks required.">
          <table className="data-table">
            <thead><tr><th>ID</th><th>Lender</th><th>Borrower</th><th>Principal</th><th>Status</th><th>Controls</th></tr></thead>
            <tbody>
              {ledger.map((l) => (
                <tr key={l.transaction_id} className="cursor-pointer" onClick={() => navigate({ search: { tx: l.transaction_id } })}><td className="num">{l.transaction_id}</td><td>{entityName(l.from_entity_id)}</td><td>{entityName(l.to_entity_id)}</td><td className="num">{fmtNative(l.amount_native, l.currency)}</td><td><Status>{l.status}</Status></td><td className="text-muted-foreground">{l.required_control}</td></tr>
              ))}
            </tbody>
          </table>
          <Note>Cross-border movements from India require deliberate committee decision and legal/tax review. No daily cross-border INR sweeps.</Note>
        </Panel>
      </div>
    </>
  );
}
