import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader, Panel, Status, Metric, Btn, Select, Note } from "@/components/ui-kit";
import { entityName, fmtInr, fmtNative, toInr, FRONT_OFFICE_THRESHOLD_INR, policies } from "@/lib/data";
import { useStore, requiredControls } from "@/lib/store";

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
  const payments = state.txns.filter((t) => /payment/i.test(t.transaction_type));
  const released = payments.filter((t) => /executed|reconciled/i.test(t.status));
  const blocked = state.txns.filter((t) => /blocked/i.test(t.status));
  const exc = state.exceptions.filter((e) => sev === "ALL" || e.severity === sev);
  const open = state.exceptions.filter((e) => !/resolved/i.test(e.status_demo));

  return (
    <>
      <PageHeader n={5} title="Risk & Compliance" sub="Every payment needs a maker, an independent checker and sanctions screening. Anomaly flags inform humans; they never approve, release or stop payments." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric accent label="Open exceptions" value={open.length} />
        <Metric label="Blocked by policy" value={blocked.length} sub="Count-based" />
        <Metric label="Payments in queue" value={payments.length} sub={`${released.length} released (simulated)`} />
        <Metric label="Front-office threshold" value={fmtInr(FRONT_OFFICE_THRESHOLD_INR)} sub="Configured threshold, illustrative" />
      </div>

      <Panel className="mt-4" title="Payment-control compliance monitor" note="Each payment shows its required control set">
        <table className="data-table">
          <thead><tr><th>Payment</th><th>Amount</th><th>INR equiv.</th><th>Maker</th><th>Independent checker</th><th>Sanctions screening</th><th>Front-office approver</th><th>Status</th></tr></thead>
          <tbody>
            {payments.map((p) => {
              const ap = state.approvals.filter((a) => a.transaction_id === p.transaction_id);
              const roles = requiredControls(p);
              const cell = (r: string, match: RegExp) => {
                if (!roles.includes(r)) return <span className="text-muted-foreground">Not required (below threshold)</span>;
                const a = ap.find((x) => match.test(`${x.approval_type} ${x.approver_role}`));
                return <Status>{a?.status_demo ?? (r === "Maker" ? "Approved" : "Pending")}</Status>;
              };
              return (
                <tr key={p.transaction_id}>
                  <td><Link to="/pools" search={{ tx: p.transaction_id }} className="num underline">{p.transaction_id}</Link><div className="text-muted-foreground">{entityName(p.from_entity_id)}</div></td>
                  <td className="num">{fmtNative(p.amount_native, p.currency)}</td>
                  <td className="num">{fmtInr(toInr(p.amount_native, p.currency))}</td>
                  <td>{cell("Maker", /maker|analyst/i)}</td>
                  <td>{cell("Independent checker", /checker|manager/i)}</td>
                  <td>{cell("Sanctions screening", /sanction|screen/i)}</td>
                  <td>{cell("Front-office approver", /front/i)}</td>
                  <td><Status>{p.status}</Status></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Panel>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Exceptions & investigation queue" actions={<Select label="Severity" value={sev} onChange={setSev} options={["ALL", "High", "Medium", "Low"].map((v) => ({ value: v, label: v }))} />}>
          <ul className="space-y-2 text-xs">
            {exc.map((e) => (
              <li key={e.exception_id} className="rounded-sm border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div><span className="num font-semibold">{e.exception_id}</span> · {e.exception_type} · <Status>{e.severity}</Status></div>
                  <Status>{e.status_demo}</Status>
                </div>
                <p className="mt-1">{e.reason}</p>
                <p className="text-muted-foreground">Next: {e.next_action} · Owner: {e.owner_role} · SLA: {e.sla_or_deadline_demo}</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {e.linked_transaction_id && <Link to="/pools" search={{ tx: e.linked_transaction_id }} className="underline">{e.linked_transaction_id}</Link>}
                  {/open/i.test(e.status_demo) && <Btn onClick={() => dispatch({ type: "exception", id: e.exception_id, status: "Under investigation", actor: "Treasury Operations" })}>Start investigation</Btn>}
                  {!/resolved/i.test(e.status_demo) && <Btn variant="ink" onClick={() => dispatch({ type: "exception", id: e.exception_id, status: "Resolved (simulated)", actor: "Treasury Manager" })}>Mark resolved</Btn>}
                </div>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Policy compliance overview" note="Read-only; rules are explained on Screen 8">
          <table className="data-table">
            <thead><tr><th>Policy</th><th>Linked open items</th></tr></thead>
            <tbody>
              {policies.map((p) => {
                const n = state.txns.filter((t) => String(t.policy_ids ?? "").includes(p.policy_id) && /blocked|pending|needs|validation|failed/i.test(t.status)).length;
                return <tr key={p.policy_id}><td><Link to="/policies" className="underline">{p.policy_id}</Link> {p.policy_name}</td><td>{n ? <Status tone="warn">{n} open</Status> : <Status tone="ok">No open items</Status>}</td></tr>;
              })}
            </tbody>
          </table>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Approvals register" note="Simulated approvals — not real sign-offs">
          <div className="max-h-96 overflow-auto">
            <table className="data-table">
              <thead><tr><th>ID</th><th>Txn</th><th>Step</th><th>Role</th><th>Status</th></tr></thead>
              <tbody>{state.approvals.map((a) => <tr key={a.approval_id}><td className="num">{a.approval_id}</td><td className="num">{a.transaction_id}</td><td>{a.approval_type}</td><td>{a.approver_role}</td><td><Status>{a.status_demo}</Status></td></tr>)}</tbody>
            </table>
          </div>
        </Panel>
        <Panel title="Audit trail" note="Updates as you act anywhere in the prototype">
          <div className="max-h-96 overflow-auto">
            <table className="data-table">
              <thead><tr><th>Time</th><th>Object</th><th>Action</th><th>Actor</th><th>Change</th></tr></thead>
              <tbody>{state.audit.map((a) => <tr key={a.audit_id + a.timestamp_demo}><td className="num whitespace-nowrap">{a.timestamp_demo}</td><td className="num">{a.linked_object_id}</td><td>{a.action}<div className="text-muted-foreground">{a.reason}</div></td><td>{a.actor_role_demo}</td><td>{a.old_state} → {a.new_state}</td></tr>)}</tbody>
            </table>
          </div>
        </Panel>
      </div>
      <Note>Maker and checker must be different people (segregation of duties). Sanctions screening is a simulated check; no real screening service is connected.</Note>
    </>
  );
}
