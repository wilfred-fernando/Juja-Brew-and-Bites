"use client";
import {useState} from "react";
import styles from "./FinanceCashFlow.module.css";
const money=v=>new Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP"}).format(Number(v||0));
export default function FinanceCashPositionOverview({accounts,period,busy,onSave}) {
 const [selected,setSelected]=useState("");
 const [control,setControl]=useState(null),[requestId,setRequestId]=useState(null);
 const shown=accounts.filter(a=>!selected||a.id===selected);
 const sum=key=>shown.reduce((s,a)=>s+Number(a[key]||0),0);
 function edit(a){setControl({account_id:a.id,effective_date:period.to,minimum_balance:String(a.minimum_balance||0),statement_balance:"",notes:""});setRequestId(null);}
 function change(key,value){setControl(p=>({...p,[key]:value}));setRequestId(null);}
 const before=sum("opening")+sum("opening_adjustments")+sum("cash_in")+sum("collections")+sum("transfers_in");
 return <section className={styles.panel}>
  <div className={styles.header}><div><h2>Cash Position</h2><p className={styles.help}>Recorded funds and what remains available after payment commitments.</p></div><label className={styles.field}>Fund source<select value={selected} onChange={e=>setSelected(e.target.value)}><option value="">All fund sources</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label></div>
  <div className={styles.positionCards}>{shown.map(a=><article key={a.id} className={styles.accountCard}>
   <small>{a.kind}{a.petty_store_id?" · Branch petty cash":""}</small><h3>{a.name}</h3><span>Recorded balance</span><strong>{money(a.balance)}</strong>
   <dl><div><dt>Minimum reserve</dt><dd>{money(a.minimum_balance)}</dd></div><div><dt>Released, awaiting clearance</dt><dd>{money(a.released_pending)}</dd></div><div><dt>Scheduled payments</dt><dd>{money(a.scheduled_pending)}</dd></div></dl>
   <div className={styles.available}><span>Available after commitments</span><b className={Number(a.available)<0?styles.negative:""}>{money(a.available)}</b>{Number(a.available)<0&&<small>Funding shortfall</small>}</div>
   {!a.petty_store_id&&<button disabled={busy} onClick={()=>edit(a)}>Reserve & Reconciliation</button>}
  </article>)}</div>
  {!shown.length&&<p>Add a fund source below to start tracking cash position.</p>}
  <div className={styles.positionSplit}><div className={styles.bridge}><h3>Period movement</h3><p>{period.from} to {period.to}</p><dl>{[["Beginning balance",sum("opening")],["Opening balance adjustments",sum("opening_adjustments")],["Cash receipts / other funds",sum("cash_in")],["Non-cash remittances received",sum("collections")],["Transfers received",sum("transfers_in")],["Funds before outflows",before],["Payments cleared",-sum("payments")],["Transfers sent (including fees)",-sum("transfers_out")],["Recorded ending balance",sum("balance")]].map(([label,value])=><div key={label}><dt>{label}</dt><dd>{money(value)}</dd></div>)}</dl><p className={styles.help}>Transfers move funds between accounts. Unremitted sales remain in Collections and are excluded from spendable cash.</p></div>
   <div className={styles.bridge}><h3>Funds you can use</h3><dl>{[["Recorded ending balance",sum("balance")],["Minimum reserves",-sum("minimum_balance")],["Released payments",-sum("released_pending")],["Scheduled payments",-sum("scheduled_pending")],["Available after commitments",sum("available")]].map(([label,value])=><div key={label}><dt>{label}</dt><dd className={value<0&&label==="Available after commitments"?styles.negative:""}>{money(value)}</dd></div>)}</dl><p className={styles.help}>Scheduled and released payments reserve funds. Only clearing a payment changes the recorded account balance. Future-dated commitments already scheduled by {period.to} are included in the reserve.</p></div></div>
  <h3>Account reconciliation</h3><div className={styles.scroll}><table><thead><tr><th>Fund source</th><th>Statement date</th><th>Statement balance</th><th>Recorded at that date</th><th>Difference</th><th>Status</th></tr></thead><tbody>{shown.filter(a=>!a.petty_store_id).map(a=><tr key={a.id}><td>{a.name}</td><td>{a.statement_date||"—"}</td><td>{a.statement_balance==null?"—":money(a.statement_balance)}</td><td>{a.statement_balance==null?"—":money(a.statement_ledger)}</td><td>{a.variance==null?"—":money(a.variance)}</td><td>{a.variance==null?"Not recorded":Math.abs(Number(a.variance))<0.005?"Matched":"Needs review"}</td></tr>)}</tbody></table></div>
  {control&&<form onSubmit={e=>{e.preventDefault();const id=requestId||crypto.randomUUID();setRequestId(id);onSave("finance_cash_save_controls",{p_data:{...control,request_id:id}},"Reserve and reconciliation saved.",()=>{setControl(null);setRequestId(null);});}}><h3>Reserve & reconciliation — {accounts.find(a=>a.id===control.account_id)?.name}</h3><fieldset disabled={busy} className={styles.form}>
   <label className={styles.field}>Effective / statement date<input type="date" required value={control.effective_date} onChange={e=>change("effective_date",e.target.value)}/></label>
   <label className={styles.field}>Minimum balance to retain<input type="number" min="0" step="0.01" required value={control.minimum_balance} onChange={e=>change("minimum_balance",e.target.value)}/></label>
   <label className={styles.field}>Actual statement balance (optional)<input type="number" step="0.01" value={control.statement_balance} onChange={e=>change("statement_balance",e.target.value)}/></label>
   <label className={styles.field}>Statement reference / notes<input value={control.notes} onChange={e=>change("notes",e.target.value)}/></label>
   <p className={styles.help}>The statement is compared with recorded cash on the same date. It does not overwrite your ledger. Leave the statement amount blank to update only the minimum reserve.</p><button>Save</button><button type="button" onClick={()=>setControl(null)}>Cancel</button>
  </fieldset></form>}
 </section>;
}
