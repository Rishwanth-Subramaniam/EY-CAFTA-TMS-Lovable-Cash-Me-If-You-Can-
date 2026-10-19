import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader, Panel, Status, Btn, Select, Note, Metric } from "@/components/ui-kit";
import { cashPositions, entityById, fmtInr, fmtNative, RATES, LOCAL_ISLANDS, REPAY_AT_HOME, forecast, entities } from "@/lib/data";
import { useStore, validate } from "@/lib/store";

export const Route = createFileRoute("/cash")({
  head: () => ({
    meta: [
      { title: "Cash Position by Entity — Project Sangam" },
      { name: "description", content: "Entity cash in native currency with labelled INR equivalents, targets, surplus and restrictions (illustrative)." },
      { property: "og:title", content: "Cash Position by Entity — Project Sangam" },
      { property: "og:description", content: "Native-currency entity cash positions with proposal actions." },
    ],
  }),
  component: Cash,
});

const ACTIONS = [
  { key: "sweep", label: "Simulate Sweep", type: "Pool sweep proposal" },
  { key: "transfer", label: "Propose Transfer", type: "Transfer proposal" },
  { key: "icl", label: "Request Intercompany Loan", type: "Intercompany loan request" },
  { key: "invest", label: "Invest Surplus", type: "Investment proposal" },
] as const;

/** Operating target: largest weekly net outflow in 13-week forecast + 20% buffer (native). */
function operatingTarget(entityId: string) {
  const rows = forecast.filter((f) => f.entity_id === entityId);
  const maxNet = Math.max(0, ...rows.map((r) => r.expected_outflows_native - r.expected_inflows_native));
  return maxNet * 1.2;
}

function Cash() {
  const [ccy, setCcy] = useState("ALL");
  const [sel, setSel] = useState<string | null>(null);
  const [action, setAction] = useState<(typeof ACTIONS)[number] | null>(null);
  const [amount, setAmount] = useState("");
  const [to, setTo] = useState("");
  const { dispatch, state } = useStore();
  const navigate = useNavigate();

  const ccys = [...new Set(cashPositions.map((c) => c.currency))];
  const rows = useMemo(() => cashPositions.filter((c) => ccy === "ALL" || c.currency === ccy), [ccy]);
  const groups = [...new Set(rows.map((r) => r.currency))];
  const selected = sel ? cashPositions.find((c) => c.entity_id === sel) : null;
  const selEnt = selected ? entityById(selected.entity_id) : null;

  const submit = () => {
    if (!selected || !action) return;
    const native = Number(amount) || 0;
    const toId = action.key === "invest" ? selected.entity_id : to || selected.entity_id;
    const txn = {
      created_at_demo: "2026-10-17",
      transaction_type: action.type,
      pool_id: selEnt?.pool_id,
      from_entity_id: selected.entity_id,
      to_entity_id: toId,
      currency: selected.currency,
      amount_native: native,
      decision_rationale: `Started from Screen 2 by maker. Surplus vs 40% model target ${fmtInr(selected.surplus_inr_equivalent)} (INR equiv.). Not automatically deployable — validate debt, eligibility, cadence, legal/tax.`,
      required_control: "Maker + independent checker + sanctions screening",
      execution_note: "Simulated only; no live bank movement",
      policy_ids: "POL-CASH-01;POL-POOL-01",
    };
    dispatch({ type: "create", txn });
    const id = `TRX-${state.seq}`;
    setAction(null);
    navigate({ to: "/pools", search: { tx: id } });
  };

  const peers = selected ? entities.filter((e) => e.native_currency === selected.currency && e.entity_id !== selected.entity_id) : [];

  return (
    <>
      <PageHeader n={2} title="Cash Position by Entity" sub="Native currency is the record of truth. INR equivalents use static illustrative rates and are shown separately — never mixed into native totals." about="Entity-level view of cash, debt, restrictions and operating targets. Use the actions panel to start a proposal, validate whether it is eligible for movement and carry the transaction through to the pool workflow in Screen 3.">
        <Select label="Currency group" value={ccy} onChange={setCcy} options={[{ value: "ALL", label: "All groups (separated)" }, ...ccys.map((c) => ({ value: c, label: c }))]} />
      </PageHeader>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          {groups.map((g) => {
            const gr = rows.filter((r) => r.currency === g);
            const native = gr.reduce((s, r) => s + r.cash_balance_inr_equivalent / RATES[g], 0);
            const tag = LOCAL_ISLANDS.includes(g) ? "Local cash island" : REPAY_AT_HOME.includes(g) ? "Repay-at-home group" : "Pool / managed group";
            return (
              <Panel key={g} title={`${g} group · ${fmtNative(native, g)}`} note={`${tag} · INR equiv. ${fmtInr(gr.reduce((s, r) => s + r.cash_balance_inr_equivalent, 0))} at ₹${RATES[g]}/${g} (illustrative)`}>
                <div className="overflow-x-auto">
                  <table className="data-table">
                    <thead>
                      <tr><th>Entity</th><th>Cash (native)</th><th>Cash (INR equiv.)</th><th>40% model target</th><th>Operating target*</th><th>Surplus / shortfall</th><th>Same-ccy debt (INR equiv.)</th><th>Pool</th></tr>
                    </thead>
                    <tbody>
                      {gr.map((r) => {
                        const e = entityById(r.entity_id)!;
                        return (
                          <tr key={r.entity_id} onClick={() => setSel(r.entity_id)} className={sel === r.entity_id ? "bg-accent cursor-pointer" : "cursor-pointer"}>
                            <td><div className="font-medium">{e.entity_name_demo}</div><div className="text-muted-foreground">{e.country}</div></td>
                            <td className="num">{fmtNative(r.cash_balance_inr_equivalent / RATES[g], g)}</td>
                            <td className="num">{fmtInr(r.cash_balance_inr_equivalent)}</td>
                            <td className="num">{fmtInr(r.target_balance_inr_equivalent)}</td>
                            <td className="num">{fmtNative(operatingTarget(r.entity_id), g)}</td>
                            <td className={`num ${r.surplus_inr_equivalent >= 0 ? "text-success" : "text-danger"}`}>{fmtInr(r.surplus_inr_equivalent)}</td>
                            <td className="num">{fmtInr(r.borrowing_inr_equivalent)}</td>
                            <td>{r.pool_eligible_under_scenario ? <Status tone="ok">Eligible</Status> : <Status tone="bad">Restricted</Status>}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Panel>
            );
          })}
          <Note>*Operating target = largest weekly net outflow in the 13-week forecast + 20% buffer, reset quarterly and four weeks before seasonal peaks. The 40% of cash figure is only an initial modelling stand-in. Cash above target is not automatically deployable.</Note>
        </div>

        <div className="space-y-4 xl:sticky xl:top-16 xl:self-start">
          {!selected ? (
            <Panel title="Entity actions"><p className="text-sm text-muted-foreground">Select an entity row to view restrictions and start a proposal.</p></Panel>
          ) : (
            <Panel title={selEnt?.entity_name_demo} note={`${selEnt?.entity_id} · ${selEnt?.pool_rule}`}>
              <div className="grid grid-cols-2 gap-2">
                <Metric label="Cash" value={fmtNative(selected.cash_balance_inr_equivalent / RATES[selected.currency], selected.currency)} />
                <Metric label="Surplus (INR eq.)" value={fmtInr(selected.surplus_inr_equivalent)} />
              </div>
              <p className="mt-3 text-xs"><span className="font-semibold">Restriction: </span>{selected.restriction_note}</p>
              <p className="mt-1 text-xs text-muted-foreground">Last statement: {selected.last_statement_timestamp_demo}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                {ACTIONS.map((a) => (
                  <Btn key={a.key} variant={action?.key === a.key ? "primary" : "outline"} onClick={() => { setAction(a); setAmount(""); setTo(peers[0]?.entity_id ?? ""); }}>{a.label}</Btn>
                ))}
                <Link to="/banking" className="rounded-sm border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted">View Borrowings</Link>
                <Link to="/pools" hash="ledger" className="rounded-sm border border-border px-3 py-1.5 text-xs font-semibold hover:bg-muted">View Intercompany Ledger</Link>
              </div>
              {action && (
                <div className="mt-4 space-y-2 rounded-sm border border-border bg-muted p-3 text-xs">
                  <div className="font-semibold">{action.label} — new proposal</div>
                  <label className="block">Amount ({selected.currency}, native)
                    <input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} className="num mt-1 w-full rounded-sm border border-input bg-card px-2 py-1.5" />
                  </label>
                  {action.key !== "invest" && (
                    <label className="block">Destination entity ({selected.currency} only)
                      <select value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 w-full rounded-sm border border-input bg-card px-2 py-1.5">
                        {peers.length === 0 && <option value="">No same-currency peer</option>}
                        {peers.map((p) => <option key={p.entity_id} value={p.entity_id}>{p.entity_name_demo} ({p.country})</option>)}
                      </select>
                    </label>
                  )}
                  {to && !validate({ from_entity_id: selected.entity_id, to_entity_id: to, currency: selected.currency }).ok && (
                    <p className="text-danger">Pre-check: this will be blocked by policy on validation.</p>
                  )}
                  <Btn variant="ink" disabled={!(Number(amount) > 0)} onClick={submit}>Create proposal & continue in Screen 3 →</Btn>
                  <p className="text-muted-foreground">Creates a simulated proposal ID carried into Cash Pools & Transfers. No money moves.</p>
                </div>
              )}
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
