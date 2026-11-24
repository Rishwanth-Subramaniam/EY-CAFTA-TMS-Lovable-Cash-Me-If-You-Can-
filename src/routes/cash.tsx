import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useRef, useState } from "react";
import { PageHeader, Panel, Status, Btn, Select, Note, Metric } from "@/components/ui-kit";
import {
  accounts,
  bankName,
  cashPositions as seedCashPositions,
  entities,
  entityById,
  fmtInr,
  fmtNative,
  forecast,
  pools as currencyPools,
  RATES,
  targetAccounts,
} from "@/lib/data";
import { useStore } from "@/lib/store";

export const Route = createFileRoute("/cash")({
  head: () => ({
    meta: [
      { title: "Cash Position by Entity — Project Sangam" },
      {
        name: "description",
        content: "Illustrative entity cash positions and automated end-of-day pool sweeps.",
      },
      { property: "og:title", content: "Cash Position by Entity — Project Sangam" },
      {
        property: "og:description",
        content:
          "Review entity liquidity and simulate configured end-of-day sweeps to currency pool headers.",
      },
    ],
  }),
  component: Cash,
});

/** Operating target: largest weekly net outflow in 13-week forecast + 20% buffer (native). */
function operatingTarget(entityId: string) {
  const rows = forecast.filter((f) => f.entity_id === entityId);
  const maxNet = Math.max(
    0,
    ...rows.map((r) => r.expected_outflows_native - r.expected_inflows_native),
  );
  return maxNet * 1.2;
}

function accountForSweep(entityId: string, currency: string, destination: boolean) {
  const active = accounts
    .filter(
      (account) =>
        account.entity_id === entityId &&
        account.currency === currency &&
        account.current_status_demo === "Active" &&
        (account.account_type === "Operating account" ||
          (destination && account.account_type.toLowerCase().includes("master"))),
    )
    .sort(
      (a, b) =>
        Number(b.account_type.toLowerCase().includes("master")) -
        Number(a.account_type.toLowerCase().includes("master")),
    );
  if (active[0]) return active[0];

  const target = targetAccounts.find(
    (account) =>
      account.entity_id === entityId &&
      account.currency === currency &&
      (account.account_type === "Operating account" ||
        (destination && account.account_type.toLowerCase().includes("pool header"))),
  );
  return target
    ? {
        account_id: target.target_account_id,
        entity_id: target.entity_id,
        currency: target.currency,
        bank_id: target.bank_id,
        account_type: target.account_type,
        current_status_demo: target.target_state_status,
      }
    : undefined;
}

function poolSweepTransfers(poolList: typeof currencyPools, positions: typeof seedCashPositions) {
  return poolList.flatMap((pool) => {
    const participants = String(pool.participant_entity_ids)
      .split(";")
      .map((id) => id.trim());
    const masterId = pool.master_entity_id;
    return participants.flatMap((sourceEntityId) => {
      if (sourceEntityId === masterId) return [];
      const position = positions.find((row) => row.entity_id === sourceEntityId);
      if (!position || position.currency !== pool.currency || position.surplus_inr_equivalent <= 0)
        return [];
      const amountInr = Math.min(
        position.surplus_inr_equivalent,
        position.cash_balance_inr_equivalent,
      );
      const amountNative = amountInr / RATES[pool.currency];
      if (!(amountNative > 0)) return [];
      const sourceAccount = accountForSweep(sourceEntityId, pool.currency, false);
      const destinationAccount = accountForSweep(masterId, pool.currency, true);
      return [
        {
          pool_id: pool.pool_id,
          source_entity_id: sourceEntityId,
          source_account_id: sourceAccount?.account_id,
          destination_entity_id: masterId,
          destination_account_id: destinationAccount?.account_id,
          currency: pool.currency,
          amount_native: amountNative,
          amount_inr: amountInr,
        },
      ];
    });
  });
}

function Cash() {
  const [poolFilter, setPoolFilter] = useState("ALL");
  const poolFilterRef = useRef("ALL");
  const [selectedEntityId, setSelectedEntityId] = useState<string | null>(null);
  const { dispatch, state } = useStore();
  const navigate = useNavigate();

  const selectedPool = currencyPools.find((pool) => pool.pool_id === poolFilter);
  const poolsToSweep = selectedPool ? [selectedPool] : currencyPools;
  const participantIds = new Set(
    poolsToSweep.flatMap((pool) =>
      String(pool.participant_entity_ids)
        .split(";")
        .map((id) => id.trim()),
    ),
  );
  const rows = state.cashPositions.filter(
    (position) => poolFilter === "ALL" || participantIds.has(position.entity_id),
  );
  const groups = [...new Set(rows.map((row) => row.currency))];
  const selected = rows.find((row) => row.entity_id === selectedEntityId);
  const selectedEntity = selected ? entityById(selected.entity_id) : undefined;

  const transfers = poolSweepTransfers(poolsToSweep, state.cashPositions);

  const simulateSweep = () => {
    const filter = poolFilterRef.current;
    const chosenPool = currencyPools.find((pool) => pool.pool_id === filter);
    const selectedPools = chosenPool ? [chosenPool] : currencyPools;
    dispatch({
      type: "simulatePoolSweeps",
      transfers: poolSweepTransfers(selectedPools, state.cashPositions),
    });
    navigate({ to: "/pool-headers", search: chosenPool ? { pool: chosenPool.pool_id } : {} });
  };

  return (
    <>
      <PageHeader
        n={2}
        title="Cash Position by Entity"
        sub="Review entity cash and surplus in native currency. Balances and rates are illustrative."
        about="This screen is for cash-position visibility. The TMS sweep is simulated as an end-of-day system action and routes each participating non-header entity’s available surplus to its configured currency-pool header. Shortfalls remain unchanged. The header entity’s balance remains in the header account for central investment or lending decisions."
      >
        <Select
          label="Currency pool"
          value={poolFilter}
          onChange={(value) => {
            poolFilterRef.current = value;
            setPoolFilter(value);
          }}
          options={[
            { value: "ALL", label: "All pools" },
            ...currencyPools.map((pool) => ({
              value: pool.pool_id,
              label: `${pool.currency} · ${pool.pool_name}`,
            })),
          ]}
        />
        <Btn variant="ink" disabled={transfers.length === 0} onClick={simulateSweep}>
          Simulate Sweep
        </Btn>
      </PageHeader>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="space-y-4">
          {groups.map((currency) => {
            const groupRows = rows.filter((row) => row.currency === currency);
            const native = groupRows.reduce(
              (sum, row) => sum + row.cash_balance_inr_equivalent / RATES[currency],
              0,
            );
            const inrTotal = groupRows.reduce(
              (sum, row) => sum + row.cash_balance_inr_equivalent,
              0,
            );
            return (
              <Panel
                key={currency}
                title={`${currency} group · ${fmtNative(native, currency)}`}
                note={`INR equivalent ${fmtInr(inrTotal)} at ₹${RATES[currency]}/${currency} (illustrative)`}
              >
                <div className="overflow-x-auto">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Entity</th>
                        <th>Cash (native)</th>
                        <th>Cash (INR equiv.)</th>
                        <th>40% model target</th>
                        <th>Operating target*</th>
                        <th>Surplus / shortfall</th>
                        <th>Same-ccy debt (INR equiv.)</th>
                        <th>Pool</th>
                      </tr>
                    </thead>
                    <tbody>
                      {groupRows.map((row) => {
                        const entity = entityById(row.entity_id)!;
                        const pool = currencyPools.find((item) => item.pool_id === entity.pool_id);
                        return (
                          <tr
                            key={row.entity_id}
                            onClick={() => setSelectedEntityId(row.entity_id)}
                            className={
                              selectedEntityId === row.entity_id
                                ? "bg-accent cursor-pointer"
                                : "cursor-pointer"
                            }
                          >
                            <td>
                              <div className="font-medium">{entity.entity_name_demo}</div>
                              <div className="text-muted-foreground">{entity.country}</div>
                            </td>
                            <td className="num">
                              {fmtNative(
                                row.cash_balance_inr_equivalent / RATES[currency],
                                currency,
                              )}
                            </td>
                            <td className="num">{fmtInr(row.cash_balance_inr_equivalent)}</td>
                            <td className="num">{fmtInr(row.target_balance_inr_equivalent)}</td>
                            <td className="num">
                              {fmtNative(operatingTarget(row.entity_id), currency)}
                            </td>
                            <td
                              className={`num ${row.surplus_inr_equivalent >= 0 ? "text-success" : "text-danger"}`}
                            >
                              {fmtInr(row.surplus_inr_equivalent)}
                            </td>
                            <td className="num">{fmtInr(row.borrowing_inr_equivalent)}</td>
                            <td>
                              <Status>{pool?.pool_name ?? "Not configured"}</Status>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Panel>
            );
          })}
          <Note>
            Simulated sweeps transfer each non-header participant’s positive surplus above the
            configured 40% model target. The configured header retains its own funds and all swept
            balances. Shortfalls are never swept or reduced. No live bank movement occurs.
          </Note>
        </div>

        <div className="space-y-4 xl:sticky xl:top-16 xl:self-start">
          {!selected ? (
            <Panel title="Entity cash position">
              <p className="text-sm text-muted-foreground">
                Select an entity row to review its cash position, debt, and restrictions.
              </p>
            </Panel>
          ) : (
            <Panel
              title={selectedEntity?.entity_name_demo}
              note={`${selectedEntity?.entity_id} · ${selectedEntity?.pool_rule}`}
            >
              <div className="grid grid-cols-2 gap-2">
                <Metric
                  label="Cash"
                  value={fmtNative(
                    selected.cash_balance_inr_equivalent / RATES[selected.currency],
                    selected.currency,
                  )}
                />
                <Metric
                  label="Surplus / shortfall"
                  value={fmtInr(selected.surplus_inr_equivalent)}
                />
                <Metric
                  label="Operating target"
                  value={fmtNative(operatingTarget(selected.entity_id), selected.currency)}
                />
                <Metric
                  label="Same-currency debt"
                  value={fmtInr(selected.borrowing_inr_equivalent)}
                />
              </div>
              <p className="mt-3 text-xs">
                <span className="font-semibold">Restriction: </span>
                {selected.restriction_note}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Last statement: {selected.last_statement_timestamp_demo}
              </p>
            </Panel>
          )}
        </div>
      </div>
    </>
  );
}
