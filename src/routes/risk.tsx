import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader, Panel, Status, Metric, Btn, Select, Note } from "@/components/ui-kit";
import { accounts, bankName, entityName, fmtInr, fmtNative, policyById, toInr } from "@/lib/data";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/risk")({
  head: () => ({
    meta: [
      { title: "Risk & Compliance — Project Sangam" },
      { name: "description", content: "Policy compliance monitor, exceptions queue, approvals and audit trail (simulated)." },
      { property: "og:title", content: "Risk & Compliance — Project Sangam" },
      { property: "og:description", content: "Maker, checker and sanctions screening on every payment." },
    ],
  }),
  component: Risk,
});

function Risk() {
  const { state, dispatch } = useStore();
  const [sev, setSev] = useState("ALL");
  const [selectedExceptionId, setSelectedExceptionId] = useState<string | null>(null);
  const [quickView, setQuickView] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [typeFilter, setTypeFilter] = useState("ALL");
  const [entityFilter, setEntityFilter] = useState("ALL");
  const [currencyFilter, setCurrencyFilter] = useState("ALL");
  const [ownerFilter, setOwnerFilter] = useState("ALL");
  const blocked = state.txns.filter((t) => /blocked/i.test(t.status));
  const paymentTransactionIds = new Set(
    state.txns.filter((t) => /payment/i.test(t.transaction_type)).map((t) => t.transaction_id),
  );
  const exc = state.exceptions.filter(
    (e) =>
      !paymentTransactionIds.has(e.linked_transaction_id) &&
      !/payment/i.test(e.exception_type) &&
      (sev === "ALL" || e.severity === sev),
  );
  const open = exc.filter((e) => !/resolved/i.test(e.status_demo));
  const selectedException =
    exc.find((e) => e.exception_id === selectedExceptionId) ?? exc[0];
  const selectedTransaction = state.txns.find(
    (t) => t.transaction_id === selectedException?.linked_transaction_id,
  );
  const accountLabel = (accountId?: string) => {
    if (!accountId) return "Not recorded";
    const account = accounts.find((a) => a.account_id === accountId);
    return account ? `${account.account_id} · ${bankName(account.bank_id)}` : accountId;
  };
  const transactionTypeLabel = (type?: string) => {
    if (!type) return "Not recorded";
    if (/sweep/i.test(type)) return "Sweep";
    if (/transfer/i.test(type)) return "Transfer";
    if (/intercompany loan/i.test(type)) return "Intercompany Loan";
    return type;
  };
  const flagRiskExplanation = (exceptionType?: string) => {
    if (/sweep failure/i.test(exceptionType ?? "")) {
      return "The bank movement may not have completed before cut-off, so the recorded cash position could differ from the expected position. Confirm the bank response and statement before considering another action.";
    }
    if (/fx evidence/i.test(exceptionType ?? "")) {
      return "Without quote and market-reference evidence, the price and fairness of the FX deal cannot be independently verified.";
    }
    if (/local island/i.test(exceptionType ?? "")) {
      return "The proposed route may breach local-currency or cross-border restrictions; cash must remain within the permitted local route.";
    }
    if (/counterparty evidence/i.test(exceptionType ?? "")) {
      return "Without current rating and concentration evidence, counterparty suitability and exposure limits cannot be confirmed.";
    }
    return "The control exception means the transaction should be checked against its supporting evidence and applicable policy before a decision is recorded.";
  };

  const approvalRows = useMemo(() => {
    return state.approvals.flatMap((a) => {
      const txn = state.txns.find((t) => t.transaction_id === a.transaction_id);
      if ((txn && /payment/i.test(txn.transaction_type)) || /payment/i.test(a.approval_type)) return [];
      const status = a.status_demo || "Pending";
      return [{
        ...a,
        txn,
        entity: txn ? entityName(txn.from_entity_id) : "—",
        currency: txn?.currency ?? "—",
        amount: txn ? fmtNative(txn.amount_native, txn.currency) : "—",
        amountInr: txn ? fmtInr(toInr(txn.amount_native, txn.currency)) : "—",
        status,
        owner: a.approver_role,
        updated: a.timestamp_demo || "Pending",
      }];
    });
  }, [state.approvals, state.txns]);

  const approvalTypes = ["ALL", ...new Set(approvalRows.map((row) => row.txn?.transaction_type ?? "Other"))];
  const approvalStatuses = ["ALL", ...new Set(approvalRows.map((row) => row.status))];
  const approvalEntities = ["ALL", ...new Set(approvalRows.map((row) => row.entity))];
  const approvalCurrencies = ["ALL", ...new Set(approvalRows.map((row) => row.currency))];
  const approvalOwners = ["ALL", ...new Set(approvalRows.map((row) => row.owner))];
  const filteredApprovals = approvalRows.filter((row) => {
    const matchesQuickView =
      quickView === "ALL" ||
      (quickView === "PENDING" && /pending/i.test(row.status)) ||
      (quickView === "FAILED" && /failed|blocked|reject/i.test(row.status || "") ) ||
      (quickView === "RESOLVED" && /approved|resolved|reconciled|executed/i.test(row.status || "")) ||
      (quickView === "RECENT" && /approved|reconciled|executed/i.test(row.status || ""));
    const matchesStatus = statusFilter === "ALL" || row.status === statusFilter;
    const matchesType = typeFilter === "ALL" || row.txn?.transaction_type === typeFilter;
    const matchesEntity = entityFilter === "ALL" || row.entity === entityFilter;
    const matchesCurrency = currencyFilter === "ALL" || row.currency === currencyFilter;
    const matchesOwner = ownerFilter === "ALL" || row.owner === ownerFilter;
    return matchesQuickView && matchesStatus && matchesType && matchesEntity && matchesCurrency && matchesOwner;
  });
  const auditRows = state.audit.filter((row) => !paymentTransactionIds.has(row.linked_object_id));

  return (
    <>
      <PageHeader n={5} title="Risk & Compliance" sub="Every payment needs a maker, an independent checker and sanctions screening. Anomaly flags inform humans; they never approve, release or stop payments." about="Use this screen to monitor payment controls, open exceptions, approval status and the policy-backed decision trail. The actionable queue makes it easy to find pending approvals, failed sweeps and resolved flows without searching through the entire transaction register." />
      <div className="grid grid-cols-2 gap-3">
        <Metric accent label="Flagged Transactions" value={open.length} />
        <Metric label="Blocked by policy" value={blocked.length} sub="Count-based" />
      </div>

      <div className="mt-4 grid gap-3">
        <div className="rounded-md border border-border bg-card p-3">
          <div className="eyebrow">Exception owner</div>
          <div className="mt-2 text-lg font-semibold text-foreground">Group Treasurer</div>
          <div className="text-xs text-muted-foreground">Human review required before release</div>
        </div>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel id="exceptions" title="Flagged Transactions Queue" actions={<Select label="Severity" value={sev} onChange={setSev} options={["ALL", "High", "Medium", "Low"].map((v) => ({ value: v, label: v }))} />}>
          <ul className="max-h-[36rem] space-y-2 overflow-auto text-xs">
            {exc.map((e) => (
              <li key={e.exception_id} className={`rounded-sm border p-3 ${selectedException?.exception_id === e.exception_id ? "border-primary bg-accent" : "border-border"}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div><span className="num font-semibold">{e.exception_id}</span> · {e.exception_type} · <Status>{e.severity}</Status></div>
                  <Status>{e.status_demo}</Status>
                </div>
                <p className="mt-1">{e.reason}</p>
                <p className="text-muted-foreground">Next: {e.next_action} · Owner: {e.owner_role} · SLA: {e.sla_or_deadline_demo}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Btn variant="outline" onClick={() => setSelectedExceptionId(e.exception_id)}>
                    {selectedException?.exception_id === e.exception_id ? "Viewing details" : "View details"}
                  </Btn>
                  {e.linked_transaction_id && <Link to="/pools" search={{ tx: e.linked_transaction_id }} className="underline">{e.linked_transaction_id}</Link>}
                  {/open/i.test(e.status_demo) && <Btn onClick={() => dispatch({ type: "exception", id: e.exception_id, status: "Under investigation", actor: "Treasury Operations" })}>Start investigation</Btn>}
                  {!/resolved/i.test(e.status_demo) && <Btn variant="ink" onClick={() => dispatch({ type: "exception", id: e.exception_id, status: "Resolved (simulated)", actor: "Treasury Manager" })}>Mark resolved</Btn>}
                </div>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Flagged Transaction Details" note="Read-only · select a flagged item to inspect it">
          {selectedException ? (
            <div className="space-y-4 text-xs">
              <section className="space-y-2">
                <h3 className="font-semibold">Transaction overview</h3>
                <dl className="grid grid-cols-2 gap-2">
                  <div><dt className="eyebrow">Transaction ID</dt><dd className="num mt-1">{selectedTransaction?.transaction_id ?? selectedException.linked_transaction_id ?? "Not linked"}</dd></div>
                  <div><dt className="eyebrow">Type</dt><dd className="mt-1">{transactionTypeLabel(selectedTransaction?.transaction_type)}</dd></div>
                  <div><dt className="eyebrow">Amount</dt><dd className="num mt-1">{selectedTransaction ? fmtNative(selectedTransaction.amount_native, selectedTransaction.currency) : "Not recorded"}</dd></div>
                  <div><dt className="eyebrow">Initiated</dt><dd className="mt-1">{selectedTransaction?.submitted_timestamp_demo ?? selectedTransaction?.created_timestamp_demo ?? selectedTransaction?.created_at_demo ?? selectedException.detected_timestamp_demo ?? "Not recorded"}</dd></div>
                  <div><dt className="eyebrow">Initiating entity</dt><dd className="mt-1">{selectedTransaction ? entityName(selectedTransaction.initiating_entity_id ?? selectedTransaction.from_entity_id) : entityName(selectedException.entity_id)}</dd></div>
                  <div><dt className="eyebrow">Receiving entity</dt><dd className="mt-1">{selectedTransaction?.to_entity_id ? entityName(selectedTransaction.to_entity_id) : "Not applicable / not recorded"}</dd></div>
                  <div><dt className="eyebrow">Source account</dt><dd className="mt-1">{accountLabel(selectedTransaction?.from_account_id)}</dd></div>
                  <div><dt className="eyebrow">Destination account</dt><dd className="mt-1">{accountLabel(selectedTransaction?.to_account_id)}</dd></div>
                </dl>
                <div><span className="eyebrow">Current status</span><div className="mt-1"><Status>{selectedTransaction?.status ?? selectedException.status_demo}</Status></div></div>
              </section>

              <section className="space-y-2 border-t border-border pt-3">
                <h3 className="font-semibold">Why was it flagged?</h3>
                <p>{selectedException.reason}</p>
                <p><span className="font-semibold">Risk in plain language: </span>{flagRiskExplanation(selectedException.exception_type)}</p>
                <p className="text-muted-foreground">
                  {selectedTransaction?.decision_rationale ?? "The transaction was referred for human investigation."}
                </p>
                <div>
                  <div className="eyebrow">Relevant treasury policy or control</div>
                  <p className="mt-1">{selectedTransaction?.required_control ?? "Human investigation required."}</p>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {String(selectedTransaction?.policy_ids ?? "").split(";").filter(Boolean).map((id: string) => (
                      <Link key={id} to="/policies" className="underline">{id.trim()} · {policyById(id.trim())?.policy_name ?? "Policy details"}</Link>
                    ))}
                  </div>
                </div>
              </section>

              <section className="space-y-2 border-t border-border pt-3">
                <h3 className="font-semibold">Required action · Group Treasurer</h3>
                <ol className="list-decimal space-y-1 pl-4">
                  <li>Ask the initiating entity or Front Office for the business purpose, urgency, and supporting records.</li>
                  <li>Ask Middle Office to explain the original flag and confirm the applicable control and evidence gap.</li>
                  <li>Check source, destination, amount, timing, legal restrictions, and whether the item is genuinely time-critical.</li>
                  <li>If urgent, use only the documented escalation and authorised exception process; do not bypass mandatory controls or screening.</li>
                  <li>Record the investigation outcome and decision in the audit trail; escalate unresolved legal or policy concerns.</li>
                </ol>
                <p className="text-muted-foreground">Queue next step: {selectedException.next_action}</p>
              </section>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">No flagged transaction matches the selected severity.</p>
          )}
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Approvals register" note="Simulated approvals — not real sign-offs" actions={
          <div className="flex flex-wrap gap-2">
            {[
              ["ALL", "All actions"],
              ["PENDING", "Pending approvals"],
              ["FAILED", "Failed sweeps"],
              ["RESOLVED", "Resolved actions"],
              ["RECENT", "Recently approved"],
            ].map(([key, label]) => (
              <button key={key} onClick={() => setQuickView(key)} className={quickView === key ? "rounded-sm bg-primary px-2 py-1 text-[0.7rem] font-semibold text-primary-foreground" : "rounded-sm border border-border px-2 py-1 text-[0.7rem] text-muted-foreground hover:bg-muted"}>{label}</button>
            ))}
          </div>
        }>
          <div className="mb-3 flex flex-wrap gap-2">
            <Select label="Status" value={statusFilter} onChange={setStatusFilter} options={approvalStatuses.map((v) => ({ value: v, label: v }))} />
            <Select label="Type" value={typeFilter} onChange={setTypeFilter} options={approvalTypes.map((v) => ({ value: v, label: v }))} />
            <Select label="Entity" value={entityFilter} onChange={setEntityFilter} options={approvalEntities.map((v) => ({ value: v, label: v }))} />
            <Select label="Currency" value={currencyFilter} onChange={setCurrencyFilter} options={approvalCurrencies.map((v) => ({ value: v, label: v }))} />
            <Select label="Owner" value={ownerFilter} onChange={setOwnerFilter} options={approvalOwners.map((v) => ({ value: v, label: v }))} />
            <button onClick={() => { setQuickView("ALL"); setStatusFilter("ALL"); setTypeFilter("ALL"); setEntityFilter("ALL"); setCurrencyFilter("ALL"); setOwnerFilter("ALL"); }} className="rounded-sm border border-border px-2 py-1.5 text-[0.7rem] font-semibold text-foreground hover:bg-muted">Clear filters</button>
          </div>
          <div className="max-h-[22rem] overflow-auto">
            <table className="data-table">
              <thead><tr><th>ID</th><th>Action</th><th>Entity</th><th>Currency</th><th>Amount</th><th>Status</th><th>Owner</th><th>Last updated</th><th>Link</th></tr></thead>
              <tbody>
                {filteredApprovals.map((row) => (
                  <tr key={row.approval_id}>
                    <td className="num">{row.approval_id}</td>
                    <td>
                      <div className="font-medium">{row.approval_type}</div>
                      <div className="text-muted-foreground">{row.txn?.transaction_type ?? "—"}</div>
                    </td>
                    <td>{row.entity}</td>
                    <td className="num">{row.currency}</td>
                    <td className="num">{row.amount}</td>
                    <td><Status>{row.status}</Status></td>
                    <td>{row.owner}</td>
                    <td className="num">{row.updated}</td>
                    <td><Link to="/pools" search={{ tx: row.transaction_id }} className="underline">View</Link></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel title="Audit trail" note="Shows the History of Transactions">
          <div className="max-h-96 overflow-auto">
            <table className="data-table">
              <thead><tr><th>Time</th><th>Object</th><th>Action</th><th>Actor</th><th>Change</th></tr></thead>
              <tbody>{auditRows.map((a) => <tr key={a.audit_id + a.timestamp_demo}><td className="num whitespace-nowrap">{a.timestamp_demo}</td><td className="num">{a.linked_object_id}</td><td>{a.action}<div className="text-muted-foreground">{a.reason}</div></td><td>{a.actor_role_demo}</td><td>{a.old_state} → {a.new_state}</td></tr>)}</tbody>
            </table>
          </div>
        </Panel>
      </div>
      <Note>Maker and checker must be different people (segregation of duties). Sanctions screening is a simulated check; no real screening service is connected.</Note>
    </>
  );
}
