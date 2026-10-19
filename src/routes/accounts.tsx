import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PageHeader, Panel, Status, Metric, Select, Note } from "@/components/ui-kit";
import { accounts, targetAccounts, consultations, bankName, fmtInr, CANON } from "@/lib/data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/accounts")({
  head: () => ({
    meta: [
      { title: "Banks & Accounts — Project Sangam" },
      { name: "description", content: "102-account inventory with transparent recommendations and the 42-account target design (illustrative)." },
      { property: "og:title", content: "Banks & Accounts — Project Sangam" },
      { property: "og:description", content: "Account rationalisation assessment, offline decisions only." },
    ],
  }),
  component: Accounts,
});

const opts = (vals: string[]) => [{ value: "ALL", label: "All" }, ...vals.map((v) => ({ value: v, label: v }))];

function Accounts() {
  const [rec, setRec] = useState("ALL");
  const [bank, setBank] = useState("ALL");
  const [country, setCountry] = useState("ALL");
  const [sel, setSel] = useState<string | null>(null);
  const rows = useMemo(() => accounts.filter((a) => (rec === "ALL" || a.recommendation === rec) && (bank === "ALL" || a.bank_id === bank) && (country === "ALL" || a.country === country)), [rec, bank, country]);
  const a = accounts.find((x) => x.account_id === sel);
  const comp = ["Operating account", "Second-currency account", "Pool header", "Local-rule account", "Standby account"].map((t) => ({ t, n: targetAccounts.filter((x) => x.account_type === t).length }));
  const recCounts = ["Retain", "Consolidate candidate", "Review for exit", "Insufficient information"].map((r) => ({ r, n: accounts.filter((x) => x.recommendation === r).length }));

  return (
    <>
      <PageHeader n={7} title="Banks & Accounts" sub="Assessment of the illustrative account inventory. Recommendations require offline follow-up — this prototype contains no closure action or workflow." about="This screen shows the account rationalisation inventory and the recommended treatment for each account. It is designed for decisions and consultation, not for live closure execution; closure remains an offline treasury action beyond this prototype." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Baseline accounts" value={accounts.length} />
        <Metric accent label="Target accounts (Week 39)" value={targetAccounts.length} sub={comp.map((c) => c.n).join(" + ") + ` = ${CANON.accountsTarget}`} />
        <Metric label="Offline rationalisation candidates" value={CANON.accountsBaseline - CANON.accountsTarget} sub="Subject to legal, tax, operational & approval checks" />
        <Metric label="Annual fee saving" value={fmtInr(CANON.accountFeeSaving)} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Panel title="Target composition (42)">
          <table className="data-table"><tbody>{comp.map((c) => <tr key={c.t}><td>{c.t}{c.t === "Pool header" && " (EUR, USD, INR)"}{c.t === "Local-rule account" && " (Brazil, Bangladesh, South Africa)"}</td><td className="num text-right font-semibold">{c.n}</td></tr>)}<tr><td className="font-semibold">Total</td><td className="num text-right font-semibold">{targetAccounts.length}</td></tr></tbody></table>
          <Note>India distributor collections use virtual accounts, not separate physical accounts.</Note>
        </Panel>
        <Panel title="Current recommendations (102)">
          <div className="grid grid-cols-2 gap-2">
            {recCounts.map((r) => (
              <button key={r.r} onClick={() => setRec(rec === r.r ? "ALL" : r.r)} className={cn("rounded-sm border p-3 text-left", rec === r.r ? "border-primary bg-accent" : "border-border")}>
                <Status>{r.r}</Status><div className="num mt-2 text-xl font-semibold">{r.n}</div>
              </button>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Mandatory legal need blocks an exit recommendation regardless of score.</p>
        </Panel>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_400px]">
        <Panel title={`Account inventory · ${rows.length} shown`} actions={<div className="flex flex-wrap gap-2"><Select label="Rec." value={rec} onChange={setRec} options={opts(recCounts.map((r) => r.r))} /><Select label="Bank" value={bank} onChange={setBank} options={[{ value: "ALL", label: "All" }, ...[...new Set(accounts.map((x) => x.bank_id))].map((b) => ({ value: b, label: bankName(b).split(" —")[0] }))]} /><Select label="Country" value={country} onChange={setCountry} options={opts([...new Set(accounts.map((x) => x.country))].sort())} /></div>}>
          <div className="max-h-[600px] overflow-auto">
            <table className="data-table">
              <thead><tr><th>Account</th><th>Entity</th><th>Bank</th><th>Ccy</th><th>Type / purpose</th><th>Score</th><th>Recommendation</th></tr></thead>
              <tbody>
                {rows.map((x) => (
                  <tr key={x.account_id} onClick={() => setSel(x.account_id)} className={cn("cursor-pointer", sel === x.account_id && "bg-accent")}>
                    <td className="num">{x.account_id}</td><td>{x.entity_name_demo}<div className="text-muted-foreground">{x.country}</div></td><td>{bankName(x.bank_id).split(" —")[0]}</td><td className="num">{x.currency}</td><td>{x.account_type}<div className="text-muted-foreground">{x.purpose}</div></td><td className="num">{x.review_score_0_100}</td><td><Status>{x.recommendation}</Status></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel title={a ? a.account_id : "Account detail"} note={a ? `${a.entity_name_demo} · ${bankName(a.bank_id)}` : "Select an account"} className="xl:sticky xl:top-16 xl:self-start">
          {a ? (
            <div className="space-y-3 text-xs">
              <div className="flex items-center gap-2"><Status>{a.recommendation}</Status><span className="num">Score {a.review_score_0_100}/100</span></div>
              <p><span className="font-semibold">Rationale: </span>{a.recommendation_rationale}</p>
              <dl className="grid grid-cols-2 gap-2">
                <div><dt className="eyebrow">Balance (INR eq.)</dt><dd className="num">{fmtInr(a.balance_inr_equivalent_demo)}</dd></div>
                <div><dt className="eyebrow">Monthly fee (INR eq.)</dt><dd className="num">{fmtInr(a.monthly_fee_inr_equivalent_demo)}</dd></div>
                <div><dt className="eyebrow">Last activity</dt><dd>{a.last_activity_date_demo}</dd></div>
                <div><dt className="eyebrow">Status</dt><dd>{a.current_status_demo}</dd></div>
                <div><dt className="eyebrow">Mandatory legal need</dt><dd>{a.mandatory_legal_need_demo}</dd></div>
                <div><dt className="eyebrow">System dependency</dt><dd>{a.system_payment_dependency_demo}</dd></div>
              </dl>
              <div>
                <div className="eyebrow mb-1">Stakeholder consultation</div>
                <table className="data-table"><tbody>
                  {[["Local finance", a.stakeholder_local_finance], ["Payments SSC", a.stakeholder_payments_ssc], ["Tax / legal", a.stakeholder_tax_legal], ["Central treasury", a.stakeholder_central_treasury], ["Authorised approver", a.stakeholder_authorised_approver]].map(([k, v]) => <tr key={k}><td>{k}</td><td><Status>{v}</Status></td></tr>)}
                </tbody></table>
              </div>
              {consultations.filter((c) => c.account_id === a.account_id).map((c) => (
                <div key={c.consultation_id} className="rounded-sm border border-border p-2"><span className="font-semibold">{c.stakeholder_function}</span> · <Status>{c.consultation_status}</Status><p className="mt-1 text-muted-foreground">{c.feedback_demo}</p></div>
              ))}
              <p className="border-t border-border pt-2 text-muted-foreground">{a.execution_boundary}. Closure decisions happen offline and are outside this prototype.</p>
            </div>
          ) : <p className="text-sm text-muted-foreground">Click an account to see rationale and consultation fields.</p>}
        </Panel>
      </div>
    </>
  );
}
