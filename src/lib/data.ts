import raw from "@/data/dataset.json";

/* eslint-disable @typescript-eslint/no-explicit-any */
type Row = Record<string, any>;
const d = raw as unknown as Record<string, Row[]>;

export const entities = d["Entities"];
export const cashPositions = d["Cash Positions"];
export const banks = d["Banks"];
export const accounts = d["Accounts"];
export const targetAccounts = d["Target Accounts"];
export const pools = d["Pools"];
export const seedTransactions = d["Transactions"];
export const seedApprovals = d["Approvals"];
export const policies = d["Policies"];
export const decisionLog = d["Decision Log"];
export const kpis = d["KPIs"];
export const assumptions = d["Assumptions"];
export const fxDeals = d["FX Deals"];
export const forecast = d["13W Forecast"];
export const seedSweeps = d["Sweep History"];
export const seedExceptions = d["Exceptions"];
export const seedAudit = d["Audit Trail"];
export const consultations = d["Account Consultations"];
export const currencyGroups = d["Currency Groups"].filter((g) => g.group_id !== "TOTAL");

/** Static illustrative INR per native unit — NOT market rates. */
export const RATES: Record<string, number> = Object.fromEntries(
  currencyGroups.map((g) => [g.currency, g.illustrative_inr_per_native_unit]),
);
export const LOCAL_ISLANDS = ["BRL", "BDT", "ZAR"];
export const REPAY_AT_HOME = ["CAD", "MXN"];

/** Configured threshold, illustrative — above this an extra front-office approver signs. */
export const FRONT_OFFICE_THRESHOLD_INR = 5_000_000;

export const CANON = {
  groupCash: 12_000_000_000,
  groupDebt: 15_000_000_000,
  overlapBefore: 9_300_000_000,
  overlapMonth7: 3_300_000_000,
  annualBenefit: 139_073_200,
  annualRunningCost: 46_169_250,
  netAnnualBenefit: 92_903_950,
  oneTimeCost: 85_025_100,
  paybackWeek: 71,
  accountFeeSaving: 6_973_200,
  committedLines: 3_000_000_000,
  accountsBaseline: 102,
  accountsTarget: 42,
  banksBaseline: 25,
  banksTarget: 7,
  fxBaselineBps: 15,
  fxTargetBps: 10,
  usdRate: 96.85,
};

export const DEMO_DATE = "17 Oct 2026";

export const entityById = (id: string) => entities.find((e) => e.entity_id === id);
export const entityName = (id?: string) => (id ? entityById(id)?.entity_name_demo ?? id : "—");
export const bankName = (id?: string) => banks.find((b) => b.bank_id === id)?.bank_name_demo ?? id ?? "—";
export const poolById = (id?: string) => pools.find((p) => p.pool_id === id);
export const policyById = (id: string) => policies.find((p) => p.policy_id === id);
export const toInr = (amount: number, ccy: string) => amount * (RATES[ccy] ?? 1);

/** Headline overlap computed from gross cash & gross debt, local islands excluded. */
export const headlineOverlap = currencyGroups
  .filter((g) => g.included_in_headline_overlap === "Yes")
  .reduce((s, g) => s + Math.min(g.cash_inr_equivalent, g.debt_inr_equivalent), 0);

export const fmtInr = (v: number | null | undefined) =>
  v == null || Number.isNaN(v) ? "—" : "₹" + Math.round(v).toLocaleString("en-US");
export const fmtInrM = (v: number) =>
  "₹" + (v / 1_000_000).toLocaleString("en-US", { maximumFractionDigits: 1 }) + " million";
export const fmtNative = (v: number, ccy: string) =>
  `${ccy} ${Math.round(v).toLocaleString("en-US")}`;

export const groupCash = cashPositions.reduce((s, c) => s + c.cash_balance_inr_equivalent, 0);
export const groupDebt = cashPositions.reduce((s, c) => s + c.borrowing_inr_equivalent, 0);

/** Group forecast in INR-equivalent per week (explicit static illustrative conversion). */
export const groupForecast = Array.from({ length: 13 }, (_, i) => {
  const rows = forecast.filter((f) => f.week_number === i + 1);
  const sum = (k: string) => rows.reduce((s, r) => s + toInr(r[k], r.currency), 0);
  return {
    week: `W${i + 1}`,
    weekStart: rows[0]?.week_start_demo,
    closing: sum("forecast_closing_balance_native"),
    inflows: sum("expected_inflows_native"),
    outflows: sum("expected_outflows_native"),
  };
});

export const ROADMAP = [
  { when: "Weeks 0–4", title: "Lock controls", text: "Dual approval on bank portals; remove inactive users; callback for supplier bank-detail changes; structured address fields ahead of SWIFT requirement from 14 Nov 2026." },
  { when: "Weeks 2–13", title: "Establish visibility", text: "Weekly cash census from Week 2; 13-week forecast from Week 4; daily portal views by Week 8; 90% cash visible daily by Week 13." },
  { when: "Weeks 4–12", title: "Tender", text: "Tender for TMS and bank services; avoid interfaces for banks planned to exit." },
  { when: "Week 13", title: "Contract signed", text: "TMS contract target." },
  { when: "Week 16", title: "EUR / INR pools", text: "Legal/tax setup, agreements, board resolutions, KYC/mandates, test sweeps and parallel run." },
  { when: "Week 24", title: "USD pool — US entities only", text: "Target go-live after controls and setup." },
  { when: "Week 26", title: "TMS foundation", text: "Daily statements, cash positioning, 13-week forecast with variance, bank-account register." },
  { when: "Week 34", title: "Workflow", text: "Payment workflow, maker-checker approvals and sanctions screening for pooled entities." },
  { when: "Week 39", title: "Bank/account & AI forecast", text: "7 banks / 42 accounts milestone; machine forecast begins shadow-running." },
  { when: "Week 52", title: "Advanced treasury", text: "Intercompany loan ledger with arm’s-length interest/TDS; FX deal capture; one SWIFT channel." },
];
