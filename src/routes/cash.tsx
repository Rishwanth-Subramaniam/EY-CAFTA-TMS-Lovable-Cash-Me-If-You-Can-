import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader, Panel, Status, Btn, Select, Note, Metric } from "@/components/ui-kit";
import { accounts, bankName, cashPositions, entities, entityById, fmtInr, fmtNative, forecast, LOCAL_ISLANDS, pools as currencyPools, RATES, REPAY_AT_HOME } from "@/lib/data";
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

const accountsForEntity = (entityId: string) => accounts.filter((a) => a.entity_id === entityId);
const defaultSourceAccount = (entityId: string) =>
  accountsForEntity(entityId).find((a) => a.current_status_demo === "Active" && a.account_type === "Operating account")?.account_id ??
  accountsForEntity(entityId)[0]?.account_id ??
  "";

function IntercompanyLoanRequestForm({ initialEntityId }: { initialEntityId: string }) {
  const [borrowerId, setBorrowerId] = useState(initialEntityId);
  const [amount, setAmount] = useState("");
  const [purpose, setPurpose] = useState("");
  const { dispatch, state } = useStore();
  const navigate = useNavigate();

  const borrower = entityById(borrowerId);
  const currency = borrower?.native_currency ?? "";
  const borrowerPool = borrower?.pool_id
    ? currencyPools.find((p) => p.pool_id === borrower.pool_id && p.currency === currency)
    : undefined;
  const participants = borrowerPool
    ? String(borrowerPool.participant_entity_ids).split(";").map((id) => id.trim())
    : [];
  const masterEntity = borrowerPool ? entityById(borrowerPool.master_entity_id) : undefined;
  const fundingCandidates = borrowerPool
    ? accounts
        .filter(
          (a) =>
            a.entity_id === borrowerPool.master_entity_id &&
            a.currency === borrowerPool.currency &&
            a.bank_id === borrowerPool.bank_id &&
            a.current_status_demo === "Active",
        )
        .sort((a, b) => Number(b.account_type.toLowerCase().includes("master")) - Number(a.account_type.toLowerCase().includes("master")))
    : [];
  const fundingAccount = fundingCandidates.find(
    (a) =>
      a.account_type.toLowerCase().includes("master") ||
      (a.account_type === "Operating account" && masterEntity?.entity_role.toLowerCase().includes("master")),
  );
  const validation = masterEntity
    ? validate({ from_entity_id: masterEntity.entity_id, to_entity_id: borrowerId, currency })
    : { ok: true, reasons: [] as string[] };
  const amountValue = amount.trim() === "" ? NaN : Number(amount);

  const eligibilityErrors: string[] = [];
  if (!borrower) eligibilityErrors.push("Select a borrowing legal entity.");
  if (borrower && borrower.pool_eligible_under_scenario !== true) {
    eligibilityErrors.push("This borrowing entity is not eligible for the funding arrangement under the current scenario.");
  }
  if (!borrowerPool) eligibilityErrors.push("No currency pool matches the borrowing entity and requested currency.");
  if (borrowerPool && borrower && !participants.includes(borrowerId)) {
    eligibilityErrors.push("The borrowing entity is not a participant in this currency pool.");
  }
  if (borrowerPool && borrowerPool.status_demo !== "Simulated target state") {
    eligibilityErrors.push(`The ${borrowerPool.pool_name} is not an active funding arrangement (${borrowerPool.status_demo}).`);
  }
  if (borrowerPool && masterEntity?.entity_id === borrowerId) {
    eligibilityErrors.push("The pool master cannot request an intercompany loan from itself.");
  }
  if (!fundingAccount) eligibilityErrors.push("No active master account is configured at this pool's bank and currency.");
  if (validation.reasons.length) eligibilityErrors.push(...validation.reasons);

  const amountErrors: string[] = [];
  if (!(amountValue > 0)) amountErrors.push("Enter a positive loan amount.");

  const approvedLimit: number | null = null;
  const outstandingUtilisation: number | null = null;
  const availableCredit =
    approvedLimit !== null && outstandingUtilisation !== null
      ? Math.max(0, approvedLimit - outstandingUtilisation)
      : null;
  if (availableCredit !== null && amountValue > availableCredit) {
    amountErrors.push(`Amount exceeds available credit of ${fmtNative(availableCredit, currency)}.`);
  }
  const canSubmit = eligibilityErrors.length === 0 && amountErrors.length === 0 && Boolean(borrowerPool && fundingAccount && masterEntity);

  const submitLoanRequest = () => {
    if (!canSubmit || !borrower || !borrowerPool || !fundingAccount || !masterEntity) return;
    const transactionId = `TRX-${state.seq}`;
    dispatch({
      type: "create",
      txn: {
        transaction_type: "Intercompany loan request",
        is_intercompany_loan_request: true,
        initiator: "Front Office (requester)",
        submitted_timestamp_demo: new Date().toISOString(),
        pool_id: borrowerPool.pool_id,
        from_entity_id: masterEntity.entity_id,
        to_entity_id: borrowerId,
        to_account_id: fundingAccount.account_id,
        funding_source_entity_id: masterEntity.entity_id,
        funding_source_account_id: fundingAccount.account_id,
        borrowing_entity_id: borrowerId,
        currency,
        amount_native: amountValue,
        credit_line_limit_native: approvedLimit,
        outstanding_utilisation_native: outstandingUtilisation,
        available_credit_native: availableCredit,
        credit_capacity_verified: false,
        credit_capacity_review_required: true,
        business_purpose: purpose.trim(),
        decision_rationale: [
          `Funding request for ${borrower.entity_name_demo} from the configured ${borrowerPool.pool_name} master.`,
          "Internal credit-line capacity cannot be verified: no approved limit or outstanding utilisation is recorded.",
          purpose.trim() ? `Business purpose: ${purpose.trim()}` : "",
          `Pool restrictions: ${borrowerPool.eligibility_and_restrictions} ${borrower.pool_rule}`,
        ].filter(Boolean).join(" "),
        required_control: "Independent Middle Office review; credit capacity evidence required before approval",
        execution_note: "Pending review; no cash transferred and no credit utilisation updated",
        policy_ids: "POL-ICL-01",
      },
    });
    navigate({ to: "/pools", search: { tx: transactionId } });
  };

  return (
    <div className="mt-4 space-y-4 rounded-sm border border-border bg-muted p-3 text-xs">
      <div>
        <div className="font-semibold">Request Intercompany Loan — review required</div>
        <p className="mt-1 text-muted-foreground">The funding pool and master account are resolved automatically. This is a funding request, not a cash transfer instruction.</p>
      </div>
      <section className="grid gap-3 rounded-sm border border-border bg-card p-3 md:grid-cols-[1fr_1fr]">
        <label className="block">Borrowing legal entity
          <select value={borrowerId} onChange={(e) => setBorrowerId(e.target.value)} className="mt-1 w-full rounded-sm border border-input bg-card px-2 py-1.5">
            {entities.map((entity) => <option key={entity.entity_id} value={entity.entity_id}>{entity.entity_name_demo}</option>)}
          </select>
        </label>
        <div><div className="eyebrow">Requested currency</div><div className="mt-2 font-semibold">{currency || "—"}</div></div>
      </section>

      <div className="grid gap-3 lg:grid-cols-[1fr_1fr]">
        <section className="space-y-3 rounded-sm border border-border bg-card p-3">
          <h3 className="font-semibold">Requested amount</h3>
          <label className="block">Requested loan amount ({currency || "native"})
            <input type="number" min="0" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={amountErrors.length > 0} className="num mt-1 w-full rounded-sm border border-input bg-card px-2 py-1.5" />
          </label>
          {amountErrors.map((error) => <p key={error} className="text-danger" role="alert">{error}</p>)}
          <label className="block">Business purpose or justification (optional)
            <textarea value={purpose} onChange={(e) => setPurpose(e.target.value)} rows={3} className="mt-1 w-full rounded-sm border border-input bg-card px-2 py-1.5" />
          </label>
        </section>

        <section className="space-y-3 rounded-sm border border-border bg-card p-3">
          <h3 className="font-semibold">Internal credit-line capacity</h3>
          <div className="grid grid-cols-2 gap-2">
            <div><div className="eyebrow">Approved credit-line limit</div><div className="num mt-1 font-semibold">{approvedLimit === null ? "Not recorded" : fmtNative(approvedLimit, currency)}</div></div>
            <div><div className="eyebrow">Outstanding utilisation</div><div className="num mt-1 font-semibold">{outstandingUtilisation === null ? "Not recorded" : fmtNative(outstandingUtilisation, currency)}</div></div>
          </div>
          <div className="rounded-sm border border-warning/30 bg-warning-soft p-2">
            <div className="eyebrow">Remaining available credit</div>
            <div className="num mt-1 text-lg font-semibold">{availableCredit === null ? "Cannot calculate" : fmtNative(availableCredit, currency)}</div>
            <p className="mt-1">Available credit = approved limit − outstanding utilisation. Neither value is present in the internal credit-line data.</p>
          </div>
          <p className="text-warning">This request can be submitted for review only. Middle Office approval and execution are blocked until the credit-line limit and utilisation are recorded and verified.</p>
        </section>
      </div>

      <div className={`rounded-sm border p-3 ${eligibilityErrors.length ? "border-danger/30 bg-danger-soft text-danger" : availableCredit === null ? "border-warning/30 bg-warning-soft text-warning" : "border-success/30 bg-success-soft text-success"}`} role="status">
        <div className="font-semibold">{eligibilityErrors.length ? "Funding arrangement unavailable" : availableCredit === null ? "Funding route resolved · credit review required" : "Funding arrangement resolved"}</div>
        <p className="mt-1">{eligibilityErrors.length ? eligibilityErrors.join(" ") : `${borrowerPool?.pool_name} · ${currency} · borrowing entity is an eligible participant.${availableCredit === null ? " Internal credit-line limit and utilisation are not recorded." : ""}`}</p>
        {borrower && <p className="mt-1">Restrictions: {borrower.pool_rule}{borrowerPool ? ` · ${borrowerPool.eligibility_and_restrictions}` : ""}</p>}
      </div>

      <section className="rounded-sm border-2 border-primary bg-accent p-3">
        <h3 className="font-semibold">Proposed Funding Source</h3>
        <p className="mt-1 text-muted-foreground">Read-only · resolved from the borrowing entity's eligible currency pool</p>
        <div className="mt-3 grid gap-2 md:grid-cols-3">
          <div><div className="eyebrow">Pool master account</div><div className="mt-1 font-semibold">{fundingAccount ? `${fundingAccount.account_id} · ${bankName(fundingAccount.bank_id)}` : "No valid master account"}</div></div>
          <div><div className="eyebrow">Master legal entity</div><div className="mt-1 font-semibold">{masterEntity?.entity_name_demo ?? "—"}</div></div>
          <div><div className="eyebrow">Currency pool</div><div className="mt-1 font-semibold">{borrowerPool?.pool_name ?? "—"}</div></div>
        </div>
        {!fundingAccount && <p className="mt-2 text-danger" role="alert">Submission is blocked because no valid pool master account was found.</p>}
      </section>

      <div className="rounded-sm border border-border bg-card p-3">
        <div className="eyebrow">Request summary</div>
        <p className="mt-1">{borrower?.entity_name_demo ?? "—"} · {amountValue > 0 ? fmtNative(amountValue, currency) : "Amount not entered"} · {currency || "—"} · Credit limit: not recorded · Remaining capacity: unavailable · {borrowerPool?.pool_name ?? "No pool"} · Funding: {fundingAccount?.account_id ?? "unavailable"}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Btn variant="ink" disabled={!canSubmit} onClick={submitLoanRequest}>Submit Loan Request for Review</Btn>
        <span className="text-muted-foreground">Submission creates a pending review request only; it does not transfer cash or update credit utilisation.</span>
      </div>
    </div>
  );
}

function SweepProposalForm({ initialEntityId }: { initialEntityId: string }) {
  const [sourceEntityId, setSourceEntityId] = useState(initialEntityId);
  const [sourceAccountId, setSourceAccountId] = useState(defaultSourceAccount(initialEntityId));
  const [amount, setAmount] = useState("");
  const { dispatch, state } = useStore();
  const navigate = useNavigate();

  const sourceEntity = entityById(sourceEntityId);
  const sourceAccount = accounts.find((a) => a.account_id === sourceAccountId);
  const cashPosition = cashPositions.find((c) => c.entity_id === sourceEntityId);
  const sourceCurrency = sourceAccount?.currency ?? sourceEntity?.native_currency ?? "";
  const sourcePool = sourceEntity?.pool_id && sourceAccount
    ? currencyPools.find(
        (p) =>
          p.pool_id === sourceEntity.pool_id &&
          p.currency === sourceCurrency &&
          String(p.participant_entity_ids).split(";").map((id) => id.trim()).includes(sourceEntityId),
      )
    : undefined;
  const availableBalance = sourceAccount ? Number(sourceAccount.balance_inr_equivalent_demo) / (RATES[sourceCurrency] ?? 1) : 0;
  const operatingRequirement = sourceEntity ? operatingTarget(sourceEntityId) : 0;
  const maximumSweep = Math.max(0, availableBalance - operatingRequirement);
  const masterCandidates = sourcePool
    ? accounts
        .filter((a) => a.entity_id === sourcePool.master_entity_id && a.currency === sourcePool.currency && a.bank_id === sourcePool.bank_id && a.current_status_demo === "Active")
        .sort((a, b) => Number(b.account_type.toLowerCase().includes("master")) - Number(a.account_type.toLowerCase().includes("master")))
    : [];
  const masterAccount = masterCandidates.find(
    (a) =>
      a.account_type.toLowerCase().includes("master") ||
      (a.account_type === "Operating account" && entityById(a.entity_id)?.entity_role.toLowerCase().includes("master")),
  );
  const masterEntity = masterAccount ? entityById(masterAccount.entity_id) : undefined;
  const amountValue = amount.trim() === "" ? NaN : Number(amount);
  const routeValidation =
    sourceEntity && masterEntity && sourceAccount
      ? validate({ from_entity_id: sourceEntityId, to_entity_id: masterEntity.entity_id, currency: sourceCurrency })
      : { ok: true, reasons: [] as string[] };

  const sourceErrors: string[] = [];
  if (!sourceEntity) sourceErrors.push("Select a source legal entity.");
  if (!sourceAccount) sourceErrors.push("Select a source bank account.");
  if (sourceAccount && sourceAccount.current_status_demo !== "Active") sourceErrors.push("The source account is not active.");
  if (sourceAccount && sourceAccount.account_type !== "Operating account") sourceErrors.push("Only an active operating account is eligible for routine sweeps.");
  if (sourceEntity && sourceAccount && sourceAccount.currency !== sourceEntity.native_currency) sourceErrors.push("The source account currency does not match the legal entity's native currency.");
  if (sourceEntity && sourceEntity.pool_eligible_under_scenario !== true) sourceErrors.push("This legal entity is not eligible for a pool sweep under the current scenario.");
  if (cashPosition && cashPosition.pool_eligible_under_scenario !== true) sourceErrors.push("The cash position is marked ineligible for pooling.");
  if (!sourcePool) sourceErrors.push("No matching currency pool is configured for this source account and legal entity.");
  if (sourcePool && !String(sourcePool.participant_entity_ids).split(";").map((id) => id.trim()).includes(sourceEntityId)) {
    sourceErrors.push("The source legal entity is not a participant in this currency pool.");
  }
  if (sourcePool && sourcePool.status_demo !== "Simulated target state") sourceErrors.push(`The ${sourcePool.pool_name} is not configured for routine sweeps (${sourcePool.status_demo}).`);
  if (!masterAccount) sourceErrors.push("No active master account is configured at this pool's master bank and currency.");
  if (sourceAccount && masterAccount && sourceAccount.account_id === masterAccount.account_id) {
    sourceErrors.push("The source account is the pool master account; it cannot sweep to itself.");
  }
  if (routeValidation.reasons.length) sourceErrors.push(...routeValidation.reasons);

  const amountErrors: string[] = [];
  if (!(amountValue > 0)) amountErrors.push("Enter a positive sweep amount.");
  else if (amountValue > maximumSweep) amountErrors.push(`Amount exceeds the eligible maximum of ${fmtNative(maximumSweep, sourceCurrency)} after the operating cash requirement.`);
  const canSubmit = sourceErrors.length === 0 && amountErrors.length === 0 && Boolean(sourcePool && masterAccount && masterEntity);

  const submitSweep = () => {
    if (!canSubmit || !sourceEntity || !sourceAccount || !sourcePool || !masterAccount || !masterEntity) return;
    const transactionId = `TRX-${state.seq}`;
    dispatch({
      type: "create",
      txn: {
        transaction_type: "Pool sweep proposal",
        is_sweep_proposal: true,
        initiator: "Treasury Analyst (maker)",
        submitted_timestamp_demo: new Date().toISOString(),
        pool_id: sourcePool.pool_id,
        from_entity_id: sourceEntityId,
        from_account_id: sourceAccount.account_id,
        to_entity_id: masterEntity.entity_id,
        to_account_id: masterAccount.account_id,
        currency: sourceCurrency,
        amount_native: amountValue,
        decision_rationale: `Sweep proposal from ${sourceEntity.entity_name_demo} to the configured ${sourcePool.pool_name} master account. Available balance ${fmtNative(availableBalance, sourceCurrency)} less operating cash requirement ${fmtNative(operatingRequirement, sourceCurrency)}; validated maximum ${fmtNative(maximumSweep, sourceCurrency)}.`,
        required_control: "Authorised independent Middle Office review before execution",
        execution_note: "Pending review; no cash deducted and no live bank movement",
        policy_ids: "POL-CASH-01;POL-POOL-01",
      },
    });
    navigate({ to: "/pools", search: { tx: transactionId } });
  };

  return (
    <div className="mt-4 space-y-4 rounded-sm border border-border bg-muted p-3 text-xs">
      <div>
        <div className="font-semibold">Simulate Sweep — proposal for review</div>
        <p className="mt-1 text-muted-foreground">The system selects the master account configured for this currency pool. The destination cannot be changed.</p>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_1fr_0.9fr]">
        <section className="space-y-3 rounded-sm border border-border bg-card p-3">
          <h3 className="font-semibold">Source details</h3>
          <label className="block">Source legal entity
            <select value={sourceEntityId} onChange={(e) => { setSourceEntityId(e.target.value); setSourceAccountId(defaultSourceAccount(e.target.value)); }} className="mt-1 w-full rounded-sm border border-input bg-card px-2 py-1.5">
              {entities.map((e) => <option key={e.entity_id} value={e.entity_id}>{e.entity_name_demo}</option>)}
            </select>
          </label>
          <label className="block">Source bank account
            <select value={sourceAccountId} onChange={(e) => setSourceAccountId(e.target.value)} className="mt-1 w-full rounded-sm border border-input bg-card px-2 py-1.5">
              {accountsForEntity(sourceEntityId).map((a) => <option key={a.account_id} value={a.account_id}>{a.account_id} · {bankName(a.bank_id)} · {a.account_type} · {a.current_status_demo}</option>)}
            </select>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <div><div className="eyebrow">Currency</div><div className="mt-1 font-semibold">{sourceCurrency || "—"}</div></div>
            <div><div className="eyebrow">Available balance</div><div className="num mt-1 font-semibold">{sourceAccount ? fmtNative(availableBalance, sourceCurrency) : "—"}</div></div>
          </div>
          <div><div className="eyebrow">Required operating cash balance</div><div className="num mt-1 font-semibold">{sourceEntity ? fmtNative(operatingRequirement, sourceCurrency) : "—"}</div><p className="mt-1 text-muted-foreground">13-week forecast net outflow plus 20% buffer.</p></div>
          {sourceErrors.length > 0 && <p className="text-danger" role="alert">{sourceErrors.join(" ")}</p>}
        </section>

        <section className="space-y-3 rounded-sm border border-border bg-card p-3">
          <h3 className="font-semibold">Sweep amount and validation</h3>
          <label className="block">Proposed sweep amount ({sourceCurrency || "native"}, native)
            <input type="number" min="0" step="any" value={amount} onChange={(e) => setAmount(e.target.value)} aria-invalid={amountErrors.length > 0} className="num mt-1 w-full rounded-sm border border-input bg-card px-2 py-1.5" />
          </label>
          {amountErrors.length > 0 && <p className="text-danger" role="alert">{amountErrors.join(" ")}</p>}
          <div className="rounded-sm border border-border bg-muted p-2">
            <div className="eyebrow">Maximum eligible sweep</div>
            <div className="num mt-1 font-semibold">{fmtNative(maximumSweep, sourceCurrency)}</div>
            <div className="mt-1 text-muted-foreground">{fmtNative(availableBalance, sourceCurrency)} available − {fmtNative(operatingRequirement, sourceCurrency)} operating requirement</div>
          </div>
          <div>
            <div className="eyebrow">Relevant currency pool</div>
            <div className="mt-1 font-semibold">{sourcePool?.pool_name ?? "No configured pool"}</div>
            {sourcePool && <p className="mt-1 text-muted-foreground">{sourcePool.currency} · {sourcePool.sweep_cadence}</p>}
          </div>
          <div className={`rounded-sm border p-2 ${sourceErrors.length || amountErrors.length ? "border-danger/30 bg-danger-soft text-danger" : "border-success/30 bg-success-soft text-success"}`} role="status">
            <div className="font-semibold">{sourceErrors.length || amountErrors.length ? "Not eligible for submission" : "Validation passed"}</div>
            <p className="mt-1">{sourceErrors.length || amountErrors.length ? [...sourceErrors, ...amountErrors].join(" ") : "Amount, source eligibility, same-currency pool, master account and restrictions are valid."}</p>
          </div>
        </section>

        <section className="space-y-3 rounded-sm border-2 border-primary bg-accent p-3">
          <div>
            <h3 className="font-semibold">Automatic destination</h3>
            <p className="mt-1 text-muted-foreground">Read-only · selected from the source currency pool</p>
          </div>
          <label className="block">Destination master account
            <input readOnly value={masterAccount ? `${masterAccount.account_id} · ${bankName(masterAccount.bank_id)}` : "No valid master account configured"} className="mt-1 w-full rounded-sm border border-input bg-muted px-2 py-1.5 text-muted-foreground" />
          </label>
          <div><div className="eyebrow">Master legal entity</div><div className="mt-1 font-semibold">{masterEntity?.entity_name_demo ?? "—"}</div></div>
          <div><div className="eyebrow">Currency</div><div className="mt-1 font-semibold">{masterAccount?.currency ?? "—"}</div></div>
          <div><div className="eyebrow">Pool</div><div className="mt-1 font-semibold">{sourcePool?.pool_name ?? "—"}</div></div>
          {!masterAccount && <p className="text-danger" role="alert">Submission is blocked because this pool has no matching active master account.</p>}
        </section>
      </div>

      <div className="rounded-sm border border-border bg-card p-3">
        <div className="eyebrow">Transaction summary</div>
        <p className="mt-1">{sourceEntity?.entity_name_demo ?? "—"} · {sourceAccount?.account_id ?? "No source account"} → {masterAccount?.account_id ?? "No master account"} · {amountValue > 0 ? fmtNative(amountValue, sourceCurrency) : "Amount not entered"} · {sourceCurrency || "—"} · {sourcePool?.pool_name ?? "No pool"}</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Btn variant="ink" disabled={!canSubmit} onClick={submitSweep}>Submit Sweep for Review</Btn>
        <span className="text-muted-foreground">Submission creates a pending proposal; it does not deduct cash or execute the sweep.</span>
      </div>
    </div>
  );
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
              {action?.key === "sweep" ? (
                <SweepProposalForm key={selected.entity_id} initialEntityId={selected.entity_id} />
              ) : action?.key === "icl" ? (
                <IntercompanyLoanRequestForm key={selected.entity_id} initialEntityId={selected.entity_id} />
              ) : action && (
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
