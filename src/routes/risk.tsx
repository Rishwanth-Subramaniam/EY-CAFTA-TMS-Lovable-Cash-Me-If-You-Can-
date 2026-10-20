import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader, Panel, Status, Metric, Btn, Select, Note } from "@/components/ui-kit";
import { accounts, bankName, entityName, fmtInr, fmtNative, policyById } from "@/lib/data";
import { useStore } from "@/lib/store";

const auditTimestampKey = (timestamp?: string) => {
  const match = timestamp?.match(/^(\d{4}-\d{2}-\d{2})(?:[ T](\d{2}:\d{2}))?/);
  return match ? `${match[1]}T${match[2] ?? "00:00"}` : "";
};

const localDatetimeKey = (date: Date) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
};

export const Route = createFileRoute("/risk")({
  head: () => ({
    meta: [
      { title: "Risk & Compliance — Project Sangam" },
      { name: "description", content: "Treasury exceptions and illustrative transaction audit history." },
      { property: "og:title", content: "Risk & Compliance — Project Sangam" },
      { property: "og:description", content: "Review flagged treasury transactions and the available audit history." },
    ],
  }),
  component: Risk,
});

function Risk() {
  const { state, dispatch } = useStore();
  const [sev, setSev] = useState("ALL");
  const [selectedExceptionId, setSelectedExceptionId] = useState<string | null>(null);
  const [exceptionComments, setExceptionComments] = useState<Record<string, string>>({});
  const [auditDateRange, setAuditDateRange] = useState("LAST_30_DAYS");
  const [auditStartDate, setAuditStartDate] = useState("");
  const [auditEndDate, setAuditEndDate] = useState("");
  const [auditInitiator, setAuditInitiator] = useState("ALL");
  const [auditType, setAuditType] = useState("ALL");
  const [auditIssueStatus, setAuditIssueStatus] = useState("ALL");
  const blocked = state.txns.filter((t) => /blocked/i.test(t.status));
  const paymentTransactionIds = new Set(
    state.txns.filter((t) => /payment/i.test(t.transaction_type)).map((t) => t.transaction_id),
  );
  const paymentExceptionIds = new Set(
    state.exceptions
      .filter((exception) => paymentTransactionIds.has(exception.linked_transaction_id))
      .map((exception) => exception.exception_id),
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

  const auditEntries = useMemo(() => {
    const transactionsById = new Map(state.txns.map((txn) => [txn.transaction_id, txn]));
    const transactionEvents = state.txns
      .filter((txn) => !/payment/i.test(txn.transaction_type))
      .map((txn) => ({
      auditId: `snapshot-${txn.transaction_id}`,
      timestamp: txn.submitted_timestamp_demo ?? txn.created_timestamp_demo ?? txn.created_at_demo ?? "",
      transactionId: txn.transaction_id,
      transaction: txn,
      action: "Transaction record",
      actor: txn.initiator ?? (
        txn.is_intercompany_loan_request || /intercompany loan/i.test(txn.transaction_type)
          ? "Requesting legal entity / local finance"
          : /bank-run|system/i.test(txn.transaction_type)
            ? "System-generated action"
            : "Front Office"
      ),
      oldState: "—",
      newState: txn.status ?? "Status not recorded",
      reason: txn.decision_rationale ?? "No rationale recorded.",
      detail: `${txn.required_control ?? "Control not recorded"}${txn.execution_note ? ` · ${txn.execution_note}` : ""}`,
      isSystemAction: /bank-run|system/i.test(txn.transaction_type) || /system/i.test(txn.initiator ?? ""),
      }));
    const actionEvents = state.audit
      .filter((entry) =>
        !paymentTransactionIds.has(entry.linked_transaction_id ?? entry.linked_object_id) &&
        !paymentExceptionIds.has(entry.linked_object_id),
      )
      .map((entry) => {
        const transactionId = entry.linked_transaction_id ?? entry.linked_object_id;
        const transaction = transactionsById.get(transactionId);
        return {
          auditId: entry.audit_id,
          timestamp: entry.timestamp_demo ?? "",
          transactionId,
          transaction,
          action: entry.action ?? "Treasury action",
          actor: entry.actor_role_demo ?? "Not recorded",
          oldState: entry.old_state ?? "—",
          newState: entry.new_state ?? "—",
          reason: entry.reason ?? "No details recorded.",
          detail: entry.policy_id ? `Policy/control: ${entry.policy_id}` : "",
          isSystemAction: /system|rule engine|screening/i.test(entry.actor_role_demo ?? ""),
        };
      });
    const approvalEvents = state.approvals.flatMap((approval) => {
      const transaction = transactionsById.get(approval.transaction_id);
      if (
        (transaction && /payment/i.test(transaction.transaction_type)) ||
        /payment/i.test(approval.approval_type)
      ) return [];
      return [{
        auditId: `approval-${approval.approval_id}`,
        timestamp: approval.timestamp_demo || transaction?.submitted_timestamp_demo || transaction?.created_timestamp_demo || transaction?.created_at_demo || "",
        transactionId: approval.transaction_id,
        transaction,
        action: `Approval step · ${approval.approval_type}`,
        actor: approval.approver_role ?? "Not recorded",
        oldState: "—",
        newState: approval.status_demo ?? "Pending",
        reason: approval.rationale_or_requirement ?? approval.execution_note ?? "Approval status recorded.",
        detail: approval.segregation_of_duties_check ?? "",
        isSystemAction: /system|screening service/i.test(approval.approver_role ?? ""),
      }];
    });
    const exceptionEvents = state.exceptions.flatMap((exception) => {
      if (
        paymentTransactionIds.has(exception.linked_transaction_id) ||
        /payment/i.test(exception.exception_type)
      ) return [];
      const transaction = transactionsById.get(exception.linked_transaction_id);
      return [{
        auditId: `exception-${exception.exception_id}`,
        timestamp: exception.last_action_timestamp_demo ?? exception.detected_timestamp_demo ?? "",
        transactionId: exception.linked_transaction_id ?? exception.exception_id,
        transaction,
        action: `Exception status record · ${exception.exception_type}`,
        actor: exception.last_action_by ?? exception.owner_role ?? "Not recorded",
        oldState: "—",
        newState: exception.status_demo ?? "Status not recorded",
        reason: exception.last_reviewer_comment
          ? `Reviewer comment / corrective action: ${exception.last_reviewer_comment}`
          : exception.reason ?? "No reason recorded.",
        detail: `Assigned team: ${exception.owner_role ?? "Not recorded"} · Next action: ${exception.next_action ?? "Not recorded"} · SLA: ${exception.sla_or_deadline_demo ?? "Not recorded"}`,
        isSystemAction: false,
      }];
    });
    return [...transactionEvents, ...actionEvents, ...approvalEvents, ...exceptionEvents]
      .map((entry) => {
        const transaction = entry.transaction;
        const rawType = transaction?.transaction_type ?? "";
        const type = /sweep/i.test(rawType)
          ? "Cash sweep"
          : /transfer/i.test(rawType)
            ? "Cash transfer"
            : /intercompany loan/i.test(rawType)
              ? "Intercompany loan"
              : /repay/i.test(rawType)
                ? "Loan repayment"
                : /investment|deposit/i.test(rawType)
                  ? "Investment / deposit"
                  : "Other treasury actions";
        const initiator = transaction?.initiator ??
          (transaction?.is_intercompany_loan_request || /intercompany loan/i.test(rawType)
            ? "Requesting legal entity / local finance"
            : /bank-run|system/i.test(rawType)
              ? "System-generated action"
              : "Front Office");
        const initiatorCategory = entry.isSystemAction || /system-generated|system rule engine/i.test(initiator)
          ? "System-generated action"
          : /requesting legal entity|local finance/i.test(initiator) || /intercompany loan/i.test(rawType)
            ? "Requesting legal entity / local finance"
            : /front office|treasury analyst|maker/i.test(initiator)
              ? "Front Office"
              : initiator;
        const issueStatus = /failed/i.test(`${entry.newState} ${entry.action}`)
          ? "Failed execution"
          : /blocked/i.test(`${entry.newState} ${entry.action}`)
            ? "Blocked by policy"
            : /limit exceeded/i.test(`${entry.newState} ${entry.reason}`)
              ? "Limit exceeded"
              : /investigat/i.test(entry.newState)
                ? "Under investigation"
                : /pending|needs information|validation required|awaiting|not recorded/i.test(entry.newState)
                  ? "Missing information or approval"
                  : /open|corrective|next action/i.test(`${entry.newState} ${entry.detail}`)
                    ? "Awaiting corrective action"
                    : "None";
        return { ...entry, type, initiator, initiatorCategory, issueStatus };
      })
      .sort((a, b) => auditTimestampKey(b.timestamp).localeCompare(auditTimestampKey(a.timestamp)));
  }, [paymentExceptionIds, paymentTransactionIds, state.approvals, state.audit, state.exceptions, state.txns]);
  const namedInitiators = [...new Set(auditEntries.map((entry) => entry.initiator).filter(Boolean))];
  const namedUsers = namedInitiators.filter((name) =>
    !["Front Office", "Requesting legal entity / local finance", "System-generated action"].includes(name) &&
    !/front office|treasury analyst|maker|middle office|reviewer|treasury operations/i.test(name),
  );
  const auditInitiatorOptions = [
    { value: "ALL", label: "All initiators" },
    { value: "CATEGORY:Front Office", label: "Front Office" },
    { value: "CATEGORY:Requesting legal entity / local finance", label: "Requesting legal entity / local finance" },
    { value: "CATEGORY:System-generated action", label: "System-generated action" },
    ...namedUsers.map((name) => ({ value: `USER:${name}`, label: name })),
  ];
  const auditTypeOptions = [
    "ALL",
    "Cash sweep",
    "Cash transfer",
    "Intercompany loan",
    "Loan repayment",
    "Investment / deposit",
    "Other treasury actions",
  ].map((value) => ({ value, label: value === "ALL" ? "All transaction types" : value }));
  const auditIssueOptions = [
    "ALL",
    "Failed execution",
    "Blocked by policy",
    "Missing information or approval",
    "Limit exceeded",
    "Under investigation",
    "Awaiting corrective action",
  ].map((value) => ({ value, label: value === "ALL" ? "All statuses" : value }));
  const today = localDatetimeKey(new Date()).slice(0, 10);
  const rangeStart = auditDateRange === "TODAY"
    ? `${today}T00:00`
    : auditDateRange === "LAST_7_DAYS"
      ? `${localDatetimeKey(new Date(Date.now() - 6 * 24 * 60 * 60 * 1000)).slice(0, 10)}T00:00`
      : auditDateRange === "LAST_30_DAYS"
        ? `${localDatetimeKey(new Date(Date.now() - 29 * 24 * 60 * 60 * 1000)).slice(0, 10)}T00:00`
        : auditStartDate;
  const rangeEnd = auditDateRange === "CUSTOM" ? auditEndDate || localDatetimeKey(new Date()) : localDatetimeKey(new Date());
  const filteredAuditEntries = auditEntries.filter((entry) => {
    const timestamp = auditTimestampKey(entry.timestamp);
    const initiatorMatches = auditInitiator === "ALL" ||
      (auditInitiator.startsWith("CATEGORY:")
        ? entry.initiatorCategory === auditInitiator.slice("CATEGORY:".length)
        : auditInitiator.startsWith("USER:")
          ? entry.initiator === auditInitiator.slice(5)
          : true);
    return (
      (auditDateRange === "ALL" || (Boolean(timestamp) && (!rangeStart || timestamp >= rangeStart) && (!rangeEnd || timestamp <= rangeEnd))) &&
      initiatorMatches &&
      (auditType === "ALL" || entry.type === auditType) &&
      (auditIssueStatus === "ALL" || entry.issueStatus === auditIssueStatus)
    );
  });
  const workflowFor = (entry: (typeof auditEntries)[number]) => {
    const status = entry.transaction?.status ?? entry.newState;
    if (/intercompany loan/i.test(entry.type)) {
      return /executed|reconciled/i.test(status)
        ? "Request → Middle Office review → bank instruction to pool master → execution confirmed → accounting/credit-line update review."
        : /approved/i.test(status)
          ? "Request → Middle Office credit/eligibility review → bank instruction to pool master → awaiting bank execution confirmation."
          : "Request → Middle Office credit/eligibility review → approval → bank instruction to pool master → bank execution and accounting confirmation.";
    }
    if (/sweep/i.test(entry.type)) {
      return /failed|blocked/i.test(status)
        ? "Pool/source validation → authorised review → execution exception → investigate bank response → correct or escalate; no silent retry."
        : /executed|reconciled/i.test(status)
          ? "Pool/source validation → required independent review → authorised execution → statement reconciliation."
          : "Pool/source validation → required independent review → authorised execution → statement reconciliation.";
    }
    if (/transfer/i.test(entry.type)) {
      return "Policy and route validation → maker/checker and screening → required independent approval → execution → reconciliation.";
    }
    if (/investment/i.test(entry.type)) {
      return "Counterparty and limit evidence → independent approval → placement → confirmation and reconciliation.";
    }
    return "Review supporting evidence and applicable control → obtain required approval → execute through authorised process → reconcile.";
  };
  const updateException = (exceptionId: string, status: string, actor: string) => {
    dispatch({
      type: "exception",
      id: exceptionId,
      status,
      actor,
      comment: exceptionComments[exceptionId],
    });
    setExceptionComments((current) => ({ ...current, [exceptionId]: "" }));
  };

  return (
    <>
      <PageHeader n={5} title="Risk & Compliance" sub="Review treasury exceptions, the transaction workflow, and the available event history. All records are illustrative." about="Use this screen to investigate flagged treasury transactions and review recorded changes, responsible actors, statuses, supporting reasons, and next steps. The audit history contains only the prototype's available demo records and current-session events." />
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

      <div id="exceptions" className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Flagged Transactions Queue" actions={<Select label="Severity" value={sev} onChange={setSev} options={["ALL", "High", "Medium", "Low"].map((v) => ({ value: v, label: v }))} />}>
          <ul className="max-h-[36rem] space-y-2 overflow-auto text-xs">
            {exc.map((e) => (
              <li key={e.exception_id} className={`rounded-sm border p-3 ${selectedException?.exception_id === e.exception_id ? "border-primary bg-accent" : "border-border"}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div><span className="num font-semibold">{e.exception_id}</span> · {e.exception_type} · <Status>{e.severity}</Status></div>
                  <Status>{e.status_demo}</Status>
                </div>
                <p className="mt-1">{e.reason}</p>
                <p className="text-muted-foreground">Next: {e.next_action} · Owner: {e.owner_role} · SLA: {e.sla_or_deadline_demo}</p>
                <label className="mt-2 block text-muted-foreground">Reviewer comment, escalation, or corrective action
                  <textarea
                    value={exceptionComments[e.exception_id] ?? ""}
                    onChange={(event) => setExceptionComments((current) => ({ ...current, [e.exception_id]: event.target.value }))}
                    rows={2}
                    className="mt-1 w-full rounded-sm border border-input bg-card px-2 py-1.5 text-foreground"
                    placeholder="Record evidence reviewed, escalation, owner hand-off, or resolution details"
                  />
                </label>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Btn variant="outline" onClick={() => setSelectedExceptionId(e.exception_id)}>
                    {selectedException?.exception_id === e.exception_id ? "Viewing details" : "View details"}
                  </Btn>
                  {e.linked_transaction_id && <Link to="/pools" search={{ tx: e.linked_transaction_id }} className="underline">{e.linked_transaction_id}</Link>}
                  {/open/i.test(e.status_demo) && <Btn onClick={() => updateException(e.exception_id, "Under investigation", "Treasury Operations")}>Start investigation</Btn>}
                  {!/resolved/i.test(e.status_demo) && <Btn variant="ink" onClick={() => updateException(e.exception_id, "Resolved (simulated)", "Group Treasurer")}>Mark resolved</Btn>}
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

      <Panel className="mt-4 w-full" title="Audit trail" note="Shows the History of Transactions">
        <div className="mb-4 flex flex-wrap items-end gap-3">
          <Select
            label="Date and time range"
            value={auditDateRange}
            onChange={setAuditDateRange}
            options={[
              { value: "ALL", label: "All available history" },
              { value: "TODAY", label: "Today" },
              { value: "LAST_7_DAYS", label: "Last 7 days" },
              { value: "LAST_30_DAYS", label: "Last 30 days" },
              { value: "CUSTOM", label: "Custom range" },
            ]}
          />
          {auditDateRange === "CUSTOM" && (
            <>
              <label className="block text-xs">From
                <input type="datetime-local" value={auditStartDate} onChange={(event) => setAuditStartDate(event.target.value)} className="mt-1 block rounded-sm border border-input bg-card px-2 py-1.5" />
              </label>
              <label className="block text-xs">To
                <input type="datetime-local" value={auditEndDate} onChange={(event) => setAuditEndDate(event.target.value)} className="mt-1 block rounded-sm border border-input bg-card px-2 py-1.5" />
              </label>
            </>
          )}
          <Select label="Initiated by" value={auditInitiator} onChange={setAuditInitiator} options={auditInitiatorOptions} />
          <Select label="Transaction type" value={auditType} onChange={setAuditType} options={auditTypeOptions} />
          <Select label="Exception / failure status" value={auditIssueStatus} onChange={setAuditIssueStatus} options={auditIssueOptions} />
        </div>
        <div className="max-h-[44rem] overflow-auto">
          <table className="data-table min-w-[1500px]">
            <thead><tr><th>Date / time</th><th>Transaction</th><th>Type</th><th>Initiated by</th><th>Action / actor</th><th>Event change</th><th>Current status</th><th>Details / reason</th><th>Workflow / next step</th></tr></thead>
            <tbody>
              {filteredAuditEntries.map((entry) => (
                <tr key={entry.auditId}>
                  <td className="num whitespace-nowrap">{entry.timestamp || "Timestamp not recorded"}</td>
                  <td>
                    {entry.transaction ? (
                      <Link to="/pools" search={{ tx: entry.transactionId }} className="num font-semibold underline">{entry.transactionId}</Link>
                    ) : <span className="num">{entry.transactionId}</span>}
                    {entry.transaction && <div className="text-muted-foreground">{entityName(entry.transaction.from_entity_id)} → {entityName(entry.transaction.to_entity_id)}</div>}
                    {entry.transaction && /intercompany loan/i.test(entry.transaction.transaction_type) && <div className="text-muted-foreground">Requesting entity: {entityName(entry.transaction.borrowing_entity_id ?? entry.transaction.to_entity_id)}</div>}
                    {entry.transaction && <div className="num text-muted-foreground">{fmtNative(entry.transaction.amount_native, entry.transaction.currency)}</div>}
                    {entry.transaction?.from_account_id && <div className="text-muted-foreground">From: {accountLabel(entry.transaction.from_account_id)}</div>}
                    {entry.transaction?.to_account_id && <div className="text-muted-foreground">To: {accountLabel(entry.transaction.to_account_id)}</div>}
                  </td>
                  <td>{entry.type}</td>
                  <td>{entry.initiator}</td>
                  <td>{entry.action}<div className="text-muted-foreground">{entry.actor}</div></td>
                  <td>{entry.oldState} → {entry.newState}</td>
                  <td><Status>{entry.transaction?.status ?? entry.newState}</Status></td>
                  <td className="min-w-[18rem]">{entry.reason}<div className="mt-1 text-muted-foreground">{entry.detail}</div></td>
                  <td className="min-w-[22rem]">{workflowFor(entry)}</td>
                </tr>
              ))}
              {filteredAuditEntries.length === 0 && <tr><td colSpan={9} className="text-center text-muted-foreground">No audit events match the selected filters or date range.</td></tr>}
            </tbody>
          </table>
        </div>
        <Note>This prototype shows the available illustrative dataset and events in the current in-memory session. It is not connected to a live TMS or a persistent company-wide historical audit store; missing historical records or user identities are not invented.</Note>
      </Panel>
    </>
  );
}
