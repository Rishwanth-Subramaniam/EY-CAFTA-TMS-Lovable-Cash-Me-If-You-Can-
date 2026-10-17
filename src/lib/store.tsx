import { createContext, useContext, useReducer, type ReactNode } from "react";
import {
  seedTransactions,
  seedApprovals,
  seedAudit,
  seedExceptions,
  seedSweeps,
  entityById,
  toInr,
  LOCAL_ISLANDS,
  FRONT_OFFICE_THRESHOLD_INR,
} from "./data";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Txn = Record<string, any>;
export type Approval = Record<string, any>;
export type AuditRow = Record<string, any>;
export type Exc = Record<string, any>;

type State = {
  txns: Txn[];
  approvals: Approval[];
  audit: AuditRow[];
  exceptions: Exc[];
  sweeps: Record<string, any>[];
  seq: number;
};

const now = () => "2026-10-17 " + new Date().toTimeString().slice(0, 5) + " IST (demo)";

const initial: State = {
  txns: seedTransactions.map((t) => ({ ...t })),
  approvals: seedApprovals.map((a) => ({ ...a })),
  audit: [...seedAudit].reverse(),
  exceptions: seedExceptions.map((e) => ({ ...e })),
  sweeps: seedSweeps.map((s) => ({ ...s })),
  seq: 1021,
};

export const LIFECYCLE = [
  "Draft (simulated)",
  "Validated (simulated)",
  "Pending approval",
  "Approved (simulated)",
  "Executed (simulated)",
  "Reconciled (simulated)",
];

export function requiredControls(t: Txn) {
  const inr = toInr(t.amount_native ?? 0, t.currency);
  const roles = ["Maker", "Independent checker", "Sanctions screening"];
  if (inr > FRONT_OFFICE_THRESHOLD_INR) roles.push("Front-office approver");
  return roles;
}

export function validate(t: Txn): { ok: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const from = entityById(t.from_entity_id);
  const to = entityById(t.to_entity_id);
  if (from && to && from.native_currency !== to.native_currency)
    reasons.push("Cross-currency transfer: needs explicit FX deal (POL-FX-01) — not a sweep.");
  if (LOCAL_ISLANDS.includes(t.currency) && from?.country !== to?.country)
    reasons.push(`${t.currency} is a local cash island — not freely transferable overseas.`);
  if (t.currency === "INR" && to && to.country !== "India")
    reasons.push("No daily cross-border INR sweeps; needs committee decision and legal/tax review.");
  if (["CAD", "MXN"].includes(t.currency) && to && to.native_currency === "USD")
    reasons.push(`${t.currency} is repay-at-home; cannot join the USD pool.`);
  return { ok: reasons.length === 0, reasons };
}

type Action =
  | { type: "create"; txn: Txn }
  | { type: "status"; id: string; status: string; actor: string; reason: string; policy?: string }
  | { type: "approve"; id: string; role: string; decision: "Approved" | "Rejected" }
  | { type: "failSweep"; id: string }
  | { type: "exception"; id: string; status: string; actor: string };

function reducer(s: State, a: Action): State {
  const audit = (obj: string, action: string, actor: string, oldS: string, newS: string, reason: string, policy = "") => ({
    audit_id: `AUD-${9000 + s.audit.length + 1}`,
    timestamp_demo: now(),
    linked_object_id: obj,
    action,
    actor_role_demo: actor,
    old_state: oldS,
    new_state: newS,
    reason,
    policy_id: policy,
    data_status: "Simulated audit record",
  });
  switch (a.type) {
    case "create": {
      const t: Txn = { ...a.txn, transaction_id: `TRX-${s.seq}`, status: "Draft (simulated)", created_timestamp_demo: now() };
      return {
        ...s,
        seq: s.seq + 1,
        txns: [t, ...s.txns],
        audit: [audit(t.transaction_id, "Proposal created", "Treasury Analyst (maker)", "—", t.status, t.decision_rationale), ...s.audit],
      };
    }
    case "status": {
      const t = s.txns.find((x) => x.transaction_id === a.id)!;
      let approvals = s.approvals;
      if (a.status === "Pending approval" && !s.approvals.some((x) => x.transaction_id === a.id)) {
        approvals = [
          ...s.approvals,
          ...requiredControls(t).map((role, i) => ({
            approval_id: `APR-${2100 + s.approvals.length + i}`,
            transaction_id: a.id,
            approval_type: role,
            approver_role: role === "Maker" ? "Treasury Analyst" : role === "Independent checker" ? "Treasury Manager (independent)" : role === "Sanctions screening" ? "Screening service (simulated)" : "Front-office approver",
            status_demo: role === "Maker" ? "Approved" : "Pending",
            timestamp_demo: role === "Maker" ? now() : "",
            segregation_of_duties_check: role === "Maker" ? "Initiator" : "Must differ from maker",
            execution_note: "Simulated only; no real approval",
          })),
        ];
      }
      return {
        ...s,
        approvals,
        txns: s.txns.map((x) => (x.transaction_id === a.id ? { ...x, status: a.status, last_state_timestamp_demo: now() } : x)),
        audit: [audit(a.id, "State change", a.actor, t.status, a.status, a.reason, a.policy), ...s.audit],
      };
    }
    case "approve": {
      const approvals = s.approvals.map((x) =>
        x.transaction_id === a.id && x.approval_type === a.role ? { ...x, status_demo: a.decision, timestamp_demo: now() } : x,
      );
      const mine = approvals.filter((x) => x.transaction_id === a.id);
      const t = s.txns.find((x) => x.transaction_id === a.id)!;
      let status = t.status;
      if (a.decision === "Rejected") status = "Rejected (simulated)";
      else if (mine.length && mine.every((x) => x.status_demo === "Approved")) status = "Approved (simulated)";
      return {
        ...s,
        approvals,
        txns: s.txns.map((x) => (x.transaction_id === a.id ? { ...x, status } : x)),
        audit: [audit(a.id, `${a.role}: ${a.decision}`, a.role, t.status, status, "Human approval step (simulated)"), ...s.audit],
      };
    }
    case "failSweep": {
      const id = `EXC-${8000 + s.exceptions.length + 1}`;
      const t = s.txns.find((x) => x.transaction_id === a.id)!;
      return {
        ...s,
        txns: s.txns.map((x) => (x.transaction_id === a.id ? { ...x, status: "Failed — investigate" } : x)),
        exceptions: [
          {
            exception_id: id,
            exception_type: "Sweep failure",
            severity: "High",
            linked_transaction_id: a.id,
            entity_id: t.from_entity_id,
            detected_timestamp_demo: now(),
            owner_role: "Treasury Operations",
            status_demo: "Open",
            sla_or_deadline_demo: "Before next bank cut-off",
            reason: "Simulated sweep failure; verify bank response and statement.",
            next_action: "No automatic retry; manual maker-checker if cut-off missed.",
            policy_id: "POL-POOL-01",
          },
          ...s.exceptions,
        ],
        audit: [audit(a.id, "Sweep failed (simulated)", "System rule engine", t.status, "Failed — investigate", `Exception ${id} created`, "POL-POOL-01"), ...s.audit],
      };
    }
    case "exception": {
      const e = s.exceptions.find((x) => x.exception_id === a.id)!;
      return {
        ...s,
        exceptions: s.exceptions.map((x) => (x.exception_id === a.id ? { ...x, status_demo: a.status } : x)),
        audit: [audit(a.id, "Exception updated", a.actor, e.status_demo, a.status, "Investigation step (simulated)", e.policy_id), ...s.audit],
      };
    }
  }
}

const Ctx = createContext<{ state: State; dispatch: (a: Action) => void } | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, initial);
  return <Ctx.Provider value={{ state, dispatch }}>{children}</Ctx.Provider>;
}

export function useStore() {
  const c = useContext(Ctx);
  if (!c) throw new Error("StoreProvider missing");
  return c;
}
