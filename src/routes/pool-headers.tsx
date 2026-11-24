import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader, Panel, Status, Btn, Note, Metric, Select } from "@/components/ui-kit";
import {
  accounts,
  bankName,
  entityById,
  fmtInr,
  fmtNative,
  pools as currencyPools,
  RATES,
  targetAccounts,
} from "@/lib/data";
import { useStore } from "@/lib/store";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/pool-headers")({
  validateSearch: (search: Record<string, unknown>): { pool?: string } =>
    typeof search.pool === "string" ? { pool: search.pool } : {},
  head: () => ({
    meta: [
      { title: "Pool Header Balances — Project Sangam" },
      {
        name: "description",
        content:
          "Illustrative currency pool header balances, remaining shortfalls, and proposal actions.",
      },
      { property: "og:title", content: "Pool Header Balances — Project Sangam" },
      {
        property: "og:description",
        content:
          "Review pool cash held by each configured header entity and submit funding or investment proposals.",
      },
    ],
  }),
  component: PoolHeaders,
});

function accountFor(entityId: string, currency: string, bankId: string, destination = false) {
  const active = accounts
    .filter(
      (account) =>
        account.entity_id === entityId &&
        account.currency === currency &&
        account.bank_id === bankId &&
        account.current_status_demo === "Active" &&
        (account.account_type === "Operating account" ||
          (destination && /master|pool header/i.test(account.account_type))),
    )
    .sort(
      (a, b) =>
        Number(/master|pool header/i.test(b.account_type)) -
        Number(/master|pool header/i.test(a.account_type)),
    );
  const activeHeader = active.find((account) => /master|pool header/i.test(account.account_type));
  if (activeHeader) {
    return { id: activeHeader.account_id, status: activeHeader.current_status_demo };
  }
  const targetHeader = destination
    ? targetAccounts.find(
        (account) =>
          account.entity_id === entityId &&
          account.currency === currency &&
          account.bank_id === bankId &&
          /pool header|master/i.test(account.account_type),
      )
    : undefined;
  if (targetHeader) {
    return { id: targetHeader.target_account_id, status: targetHeader.target_state_status };
  }
  const activeOperating = active.find((account) => account.account_type === "Operating account");
  if (activeOperating) {
    return { id: activeOperating.account_id, status: activeOperating.current_status_demo };
  }
  const targetOperating = targetAccounts.find(
    (account) =>
      account.entity_id === entityId &&
      account.currency === currency &&
      account.bank_id === bankId &&
      account.account_type === "Operating account",
  );
  return targetOperating
    ? { id: targetOperating.target_account_id, status: targetOperating.target_state_status }
    : undefined;
}

function PoolHeaders() {
  const { pool: initialPoolId } = Route.useSearch();
  const [selectedPoolId, setSelectedPoolId] = useState(initialPoolId ?? "ALL");
  const [borrowerId, setBorrowerId] = useState("");
  const [loanAmount, setLoanAmount] = useState("");
  const [investmentAmount, setInvestmentAmount] = useState("");
  const [detailTab, setDetailTab] = useState<"overview" | "loan" | "investment">("overview");
  const { state, dispatch } = useStore();
  const navigate = useNavigate();

  const selectedPool = currencyPools.find((pool) => pool.pool_id === selectedPoolId);
  const visiblePools = selectedPool ? [selectedPool] : currencyPools;
  const headerEntity = selectedPool ? entityById(selectedPool.master_entity_id) : undefined;
  const headerPosition = state.cashPositions.find(
    (position) => position.entity_id === selectedPool?.master_entity_id,
  );
  const headerAccount =
    selectedPool && headerEntity
      ? accountFor(headerEntity.entity_id, selectedPool.currency, selectedPool.bank_id, true)
      : undefined;
  const memberIds = selectedPool
    ? String(selectedPool.participant_entity_ids)
        .split(";")
        .map((id) => id.trim())
    : [];
  const memberPositions = state.cashPositions.filter((position) =>
    memberIds.includes(position.entity_id),
  );
  const shortfalls = memberPositions.filter(
    (position) =>
      position.entity_id !== selectedPool?.master_entity_id && position.surplus_inr_equivalent < 0,
  );
  const chosenBorrower =
    shortfalls.find((position) => position.entity_id === borrowerId) ?? shortfalls[0];
  const availableHeaderSurplus =
    Math.max(0, headerPosition?.surplus_inr_equivalent ?? 0) / RATES[selectedPool?.currency ?? ""];
  const recordedShortfall = chosenBorrower
    ? Math.abs(chosenBorrower.surplus_inr_equivalent) / RATES[selectedPool?.currency ?? ""]
    : 0;
  const totalParticipantShortfall =
    shortfalls.reduce((total, position) => total + Math.abs(position.surplus_inr_equivalent), 0) /
    RATES[selectedPool?.currency ?? ""];
  const maxLoan = Math.min(recordedShortfall, availableHeaderSurplus);
  const availableInvestment = Math.max(0, availableHeaderSurplus - totalParticipantShortfall);
  const parsedLoanAmount = Number(loanAmount);
  const parsedInvestmentAmount = Number(investmentAmount);
  const loanValid = Boolean(
    headerAccount && chosenBorrower && parsedLoanAmount > 0 && parsedLoanAmount <= maxLoan,
  );
  const investmentValid = Boolean(
    headerAccount && parsedInvestmentAmount > 0 && parsedInvestmentAmount <= availableInvestment,
  );

  const submitLoanProposal = () => {
    if (!selectedPool || !headerEntity || !chosenBorrower || !headerAccount || !loanValid) return;
    const borrower = entityById(chosenBorrower.entity_id);
    if (!borrower) return;
    const borrowerAccount = accountFor(
      borrower.entity_id,
      selectedPool.currency,
      selectedPool.bank_id,
    );
    dispatch({
      type: "create",
      txn: {
        transaction_type: "Intercompany loan proposal",
        is_intercompany_loan_proposal: true,
        initiator: "Front Office",
        submitted_timestamp_demo: new Date().toISOString(),
        pool_id: selectedPool.pool_id,
        funding_source_entity_id: headerEntity.entity_id,
        funding_source_account_id: headerAccount.id,
        borrowing_entity_id: borrower.entity_id,
        from_entity_id: headerEntity.entity_id,
        from_account_id: headerAccount.id,
        to_entity_id: borrower.entity_id,
        to_account_id: borrowerAccount?.id,
        currency: selectedPool.currency,
        amount_native: parsedLoanAmount,
        credit_capacity_verified: false,
        business_purpose: "Working capital support for the recorded cash shortfall",
        decision_rationale: `Front Office proposes a working-capital loan from the ${selectedPool.pool_name} header to ${borrower.entity_name_demo} for independent Middle Office review. Arm’s-length pricing, credit-line capacity, legal/tax treatment, and repayment terms must be verified before any approval or execution.`,
        required_control:
          "Independent Middle Office credit, capacity, arm’s-length pricing, and legal/tax review",
        execution_note:
          "Proposal pending review; no funds advanced and no credit-line utilisation recorded",
        policy_ids: "",
      },
    });
    const transactionId = `TRX-${state.seq}`;
    navigate({ to: "/pools", search: { tx: transactionId } });
  };

  const submitInvestmentProposal = () => {
    if (!selectedPool || !headerEntity || !headerAccount || !investmentValid) return;
    dispatch({
      type: "create",
      txn: {
        transaction_type: "Investment proposal",
        is_investment_proposal: true,
        initiator: "Front Office",
        submitted_timestamp_demo: new Date().toISOString(),
        pool_id: selectedPool.pool_id,
        from_entity_id: headerEntity.entity_id,
        from_account_id: headerAccount.id,
        to_entity_id: headerEntity.entity_id,
        currency: selectedPool.currency,
        amount_native: parsedInvestmentAmount,
        decision_rationale: `Front Office proposes reinvesting surplus held by the ${selectedPool.pool_name} header. Investment instrument, counterparty, tenor, liquidity, concentration, and policy eligibility require independent review before execution.`,
        required_control:
          "Treasury investment policy, counterparty, limit, liquidity, and independent approval checks",
        execution_note: "Proposal pending approval; no investment placed",
        policy_ids: "",
      },
    });
    const transactionId = `TRX-${state.seq}`;
    navigate({ to: "/pools", search: { tx: transactionId } });
  };

  return (
    <>
      <PageHeader
        n={3}
        title="Pool Header Balances"
        sub="Review pool-header liquidity and participant shortfalls after the simulated end-of-day sweep."
        about="Select a currency pool or local cash group on the left. The right panel shows its configured header account, remaining shortfalls, and proposal guidance. Balances are illustrative and remain in memory; proposals do not move funds."
      />

      <div className="grid items-start gap-5 xl:grid-cols-2">
        <Panel
          title="Currency pool headers"
          note="Select a header to view its balance and cash-shortfall details."
          className="min-w-0"
          actions={
            <Select
              label="Currency pool"
              value={selectedPoolId}
              onChange={(poolId) => {
                setSelectedPoolId(poolId);
                setDetailTab("overview");
              }}
              options={[
                { value: "ALL", label: "All pools" },
                ...currencyPools.map((pool) => ({
                  value: pool.pool_id,
                  label: `${pool.currency} · ${pool.pool_name}`,
                })),
              ]}
            />
          }
        >
          <div className="grid max-h-[76vh] gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
            {visiblePools.map((pool) => {
              const entity = entityById(pool.master_entity_id);
              const position = state.cashPositions.find(
                (row) => row.entity_id === pool.master_entity_id,
              );
              const account = entity
                ? accountFor(entity.entity_id, pool.currency, pool.bank_id, true)
                : undefined;
              const participants = String(pool.participant_entity_ids)
                .split(";")
                .map((id) => id.trim());
              const shortfallCount = state.cashPositions.filter(
                (row) =>
                  participants.includes(row.entity_id) &&
                  row.entity_id !== pool.master_entity_id &&
                  row.surplus_inr_equivalent < 0,
              ).length;
              const isSelected = selectedPool?.pool_id === pool.pool_id;
              return (
                <button
                  type="button"
                  key={pool.pool_id}
                  onClick={() => {
                    setSelectedPoolId(pool.pool_id);
                    setDetailTab("overview");
                  }}
                  aria-pressed={isSelected}
                  className={cn(
                    "min-w-0 rounded-md border p-3 text-left transition hover:border-primary/60 hover:bg-muted/50",
                    isSelected
                      ? "border-primary bg-accent ring-1 ring-primary/20"
                      : "border-border bg-card",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-semibold">{pool.pool_name}</span>
                    <span className="num shrink-0 rounded-sm bg-ink px-2 py-0.5 text-xs text-ink-foreground">
                      {pool.currency}
                    </span>
                  </div>
                  <div className="mt-2 text-xs">
                    {entity?.entity_name_demo ?? pool.master_entity_id}
                  </div>
                  <div className="mt-1 break-words text-xs text-muted-foreground">
                    {account
                      ? `${bankName(pool.bank_id)} · ${account.id}`
                      : "Header account not recorded"}
                  </div>
                  {account && account.status !== "Active" && (
                    <div className="mt-1 text-[0.68rem] text-warning">{account.status}</div>
                  )}
                  <div className="mt-3 flex items-end justify-between gap-2">
                    <div>
                      <div className="eyebrow">Header cash</div>
                      <div className="num mt-1 text-sm font-semibold">
                        {position
                          ? fmtNative(
                              position.cash_balance_inr_equivalent / RATES[pool.currency],
                              pool.currency,
                            )
                          : "Not recorded"}
                      </div>
                    </div>
                    <Status>
                      {shortfallCount
                        ? `${shortfallCount} shortfall${shortfallCount === 1 ? "" : "s"}`
                        : "No shortfalls"}
                    </Status>
                  </div>
                </button>
              );
            })}
          </div>
        </Panel>

        <div className="min-w-0 space-y-4">
          <Panel
            title={
              selectedPool
                ? `${selectedPool.currency} header · ${headerEntity?.entity_name_demo ?? selectedPool.master_entity_id}`
                : "Select a pool header"
            }
            note={selectedPool?.pool_name}
          >
            {selectedPool && headerPosition ? (
              <div className="space-y-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Metric
                    label="Header cash balance"
                    value={fmtNative(
                      headerPosition.cash_balance_inr_equivalent / RATES[selectedPool.currency],
                      selectedPool.currency,
                    )}
                    sub={fmtInr(headerPosition.cash_balance_inr_equivalent)}
                  />
                  <Metric
                    label="Available to invest"
                    value={fmtNative(availableInvestment, selectedPool.currency)}
                    sub={`${fmtNative(availableHeaderSurplus, selectedPool.currency)} surplus less ${fmtNative(totalParticipantShortfall, selectedPool.currency)} participant shortfalls`}
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-border px-4 py-3 text-sm">
                  <div>
                    <div className="eyebrow">Header bank account</div>
                    <div className="mt-1 font-semibold">
                      {headerAccount
                        ? `${bankName(selectedPool.bank_id)} · ${headerAccount.id}`
                        : "No account recorded"}
                    </div>
                  </div>
                  {headerAccount && <Status>{headerAccount.status}</Status>}
                </div>

                <div className="rounded-md border border-border bg-muted/40 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold">Participant shortfalls</h3>
                    <Status>
                      {shortfalls.length ? `${shortfalls.length} to review` : "None recorded"}
                    </Status>
                  </div>
                  {shortfalls.length ? (
                    <ul className="mt-3 space-y-2">
                      {shortfalls.map((position) => {
                        const entity = entityById(position.entity_id);
                        return (
                          <li
                            key={position.entity_id}
                            className="flex items-center justify-between gap-3 rounded-sm border border-border bg-card px-3 py-2 text-sm"
                          >
                            <span>{entity?.entity_name_demo ?? position.entity_id}</span>
                            <span className="num font-semibold text-danger">
                              {fmtNative(
                                Math.abs(position.surplus_inr_equivalent) /
                                  RATES[selectedPool.currency],
                                selectedPool.currency,
                              )}
                            </span>
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="mt-2 text-sm text-muted-foreground">
                      No participant shortfalls are recorded for this group.
                    </p>
                  )}
                </div>

                <div className="rounded-md border-l-4 border-primary bg-accent/70 p-4 text-sm">
                  <h3 className="font-semibold">Suggested next steps</h3>
                  <ol className="mt-2 list-decimal space-y-2 pl-5 text-muted-foreground">
                    <li>
                      Review each deficit and confirm its working-capital need with the entity.
                    </li>
                    <li>
                      Use header liquidity for a loan proposal only after checking the amount,
                      credit capacity, and arm’s-length terms.
                    </li>
                    <li>
                      Consider investing only the remaining header surplus under the approved
                      investment policy.
                    </li>
                    <li>
                      Submit proposals for independent review; this screen does not approve,
                      execute, or reconcile them.
                    </li>
                  </ol>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">
                Select a configured pool header to review its cash and participants.
              </p>
            )}
          </Panel>

          {selectedPool && (
            <Panel title="Header actions" note="Create a proposal using this pool’s header account">
              <div className="mb-4 grid grid-cols-3 gap-2">
                {(
                  [
                    ["overview", "Review"],
                    ["loan", "Working-capital loan"],
                    ["investment", "Invest surplus"],
                  ] as const
                ).map(([tab, label]) => (
                  <button
                    type="button"
                    key={tab}
                    onClick={() => setDetailTab(tab)}
                    aria-pressed={detailTab === tab}
                    className={cn(
                      "rounded-sm border px-3 py-2 text-xs font-semibold",
                      detailTab === tab
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card hover:bg-muted",
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {detailTab === "overview" && (
                <div className="rounded-md border border-border p-4 text-sm text-muted-foreground">
                  Select <span className="font-semibold text-foreground">Working-capital loan</span>{" "}
                  to draft support for a listed deficit, or{" "}
                  <span className="font-semibold text-foreground">Invest surplus</span> to submit a
                  policy-controlled investment proposal from the header account.
                </div>
              )}

              {detailTab === "loan" && (
                <div className="space-y-4 text-sm">
                  <p className="text-muted-foreground">
                    Propose a working-capital loan from {headerEntity?.entity_name_demo} to an
                    entity with a recorded shortfall. No cash is advanced until authorised review
                    and execution outside this screen.
                  </p>
                  <label className="block">
                    Borrowing entity
                    <select
                      value={chosenBorrower?.entity_id ?? ""}
                      onChange={(event) => {
                        setBorrowerId(event.target.value);
                        setLoanAmount("");
                      }}
                      disabled={shortfalls.length === 0}
                      className="mt-1 w-full rounded-sm border border-input bg-card px-3 py-2"
                    >
                      {shortfalls.length === 0 && <option value="">No recorded shortfall</option>}
                      {shortfalls.map((position) => (
                        <option key={position.entity_id} value={position.entity_id}>
                          {entityById(position.entity_id)?.entity_name_demo ?? position.entity_id}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    Proposed amount ({selectedPool.currency})
                    <input
                      type="number"
                      min="0"
                      max={maxLoan}
                      step="any"
                      value={loanAmount}
                      onChange={(event) => setLoanAmount(event.target.value)}
                      disabled={!chosenBorrower}
                      className="num mt-1 w-full rounded-sm border border-input bg-card px-3 py-2"
                    />
                  </label>
                  {chosenBorrower && (
                    <p className="text-xs text-muted-foreground">
                      Recorded shortfall: {fmtNative(recordedShortfall, selectedPool.currency)} ·
                      available header surplus:{" "}
                      {fmtNative(availableHeaderSurplus, selectedPool.currency)} · proposal cap:{" "}
                      {fmtNative(maxLoan, selectedPool.currency)}.
                    </p>
                  )}
                  <Btn variant="ink" disabled={!loanValid} onClick={submitLoanProposal}>
                    Submit Loan Proposal for Review
                  </Btn>
                  <Note>
                    Middle Office must verify credit capacity, arm’s-length pricing, and legal/tax
                    terms. No loan is approved or funded here.
                  </Note>
                  {!headerAccount && (
                    <p className="text-danger">
                      No configured header bank account is recorded; proposals are disabled.
                    </p>
                  )}
                </div>
              )}

              {detailTab === "investment" && (
                <div className="space-y-4 text-sm">
                  <p className="text-muted-foreground">
                    Submit an investment proposal from the selected pool’s header account. Use only
                    surplus cash and follow the approved investment policy.
                  </p>
                  <div className="rounded-sm border border-border bg-muted/40 p-3">
                    Available to invest after reserving participant shortfalls:{" "}
                    <span className="num font-semibold">
                      {fmtNative(availableInvestment, selectedPool.currency)}
                    </span>
                  </div>
                  <label className="block">
                    Proposed amount ({selectedPool.currency})
                    <input
                      type="number"
                      min="0"
                      max={availableInvestment}
                      step="any"
                      value={investmentAmount}
                      onChange={(event) => setInvestmentAmount(event.target.value)}
                      className="num mt-1 w-full rounded-sm border border-input bg-card px-3 py-2"
                    />
                  </label>
                  <Btn variant="ink" disabled={!investmentValid} onClick={submitInvestmentProposal}>
                    Submit Investment Proposal for Review
                  </Btn>
                  <Note>
                    Confirm instrument, counterparty, tenor, liquidity, concentration, and policy
                    eligibility during review. No investment is placed here.
                  </Note>
                  {!headerAccount && (
                    <p className="text-danger">
                      No configured header bank account is recorded; proposals are disabled.
                    </p>
                  )}
                </div>
              )}
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
