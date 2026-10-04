"use client";
import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import styles from "./FinanceCashFlow.module.css";
import FinanceShiftCollections from "./FinanceShiftCollections";
import FinanceCashPositionOverview from "./FinanceCashPositionOverview";
import FinanceCashPaymentQueue from "./FinanceCashPaymentQueue";
const money = v => new Intl.NumberFormat("en-PH", {style:"currency",currency:"PHP"}).format(Number(v || 0));
const today = () => new Intl.DateTimeFormat("en-CA", {timeZone:"Asia/Manila",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
const fresh = () => ({kind:"transfer",transaction_date:today(),from_account_id:"",to_account_id:"",amount:"",fee:"0",reference:"",notes:"",receivable_id:""});
function Field({label,children}) { return <label className={styles.field}><span>{label}</span>{children}</label>; }
export default function FinanceCashFlowManager() {
 const supabase = getSupabaseClient();
 const [period,setPeriod] = useState(() => ({from:today().slice(0,7)+"-01",to:today()}));
 const [data,setData] = useState(null), [error,setError] = useState(""), [notice,setNotice] = useState(""), [busy,setBusy] = useState(false), [loading,setLoading] = useState(true), [tab,setTab] = useState("position");
 const [form,setForm] = useState(fresh), [requestId,setRequestId] = useState(null);
 const [account,setAccount] = useState({name:"",kind:"bank"});
 const [reversal,setReversal] = useState(null), [reason,setReason] = useState(""), [reverseDate,setReverseDate] = useState(today);
 const load = useCallback(async () => {
  setLoading(true);
  try { const [result,collections] = await Promise.all([supabase.rpc("finance_cash_position_snapshot",{p_from:period.from,p_to:period.to}),supabase.rpc("finance_cash_collection_snapshot",{p_to:period.to})]); if(result.error) throw result.error; if(collections.error) throw collections.error; setData({...result.data,receivables:collections.data}); setError(""); }
  catch(e) {setData(null);setError(e.message.includes("finance_cash_") ? "Cash flow setup needs an update. " + e.message : e.message);}
  finally {setLoading(false);}
 },[supabase,period.from,period.to]);
 useEffect(() => {load();},[load]);
 async function run(name,args,message,reset) {
  if(busy) return; setBusy(true);setError("");setNotice("");
  try {const result = await supabase.rpc(name,args);if(result.error) throw result.error;reset?.();setNotice(message);await load();}
  catch(e){setError(e.message);}finally{setBusy(false);}
 }
 const accounts=data?.accounts || [], receivables=data?.receivables || [];
 const postingAccounts=accounts.filter(a=>!a.petty_store_id);
 const names=Object.fromEntries(accounts.map(a=>[a.id,a.name]));
 const total=accounts.reduce((s,a)=>s+Number(a.balance),0);
 function update(key,value){setForm(p=>({...p,[key]:value}));setRequestId(null);}
 function accountSelect(key,exclude){return <select required value={form[key]} onChange={e=>update(key,e.target.value)}><option value="">Select fund source</option>{postingAccounts.filter(a=>a.id!==exclude).map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select>;}
 function exportCsv(){
  const rows=[["Date","Type","From","To","Amount","Fees","Reference","Notes","Reversed","Created by","Created at"],...data.transactions.map(t=>[t.transaction_date,t.kind,names[t.from_account_id],names[t.to_account_id],t.amount,t.fee,t.reference,t.notes,t.reversed,t.created_by,t.created_at])];
  const csv=rows.map(r=>r.map(v=>{const s=String(v??"");return '"'+(/^[=+@\-\t\r]/.test(s)?"'":"")+s.replaceAll('"','""')+'"';}).join(",")).join("\r\n");
  const url=URL.createObjectURL(new Blob(["\ufeff",csv],{type:"text/csv;charset=utf-8"}));const a=document.createElement("a");a.href=url;a.download=`cash-flow-${period.from}-${period.to}.csv`;a.click();URL.revokeObjectURL(url);
 }
 return <div className={`${styles.page} juja-controls`}>
  <header className={styles.header}><div><small>FINANCE / TREASURY</small><h1>Cash Flow & Cash Position</h1><p>Funds, transfers, and aggregator settlements.</p></div><button disabled={busy||loading} onClick={load}>Refresh</button></header>
  <div className={styles.period}>{[["from","From"],["to","As of / To"]].map(([key,label])=><Field key={key} label={label}><input type="date" required value={period[key]} onChange={e=>e.target.value&&setPeriod({...period,[key]:e.target.value})}/></Field>)}</div>
  {error&&<p role="alert" className={styles.error}>{error}</p>}{notice&&<p role="status" className={styles.notice}>{notice}</p>}{loading&&<p role="status">Loading cash position…</p>}
  {data&&<>
   <div className={styles.metrics}>{[["Recorded cash",total],["Available after commitments",accounts.reduce((s,a)=>s+Number(a.available||0),0)],["Net collections & inflows",data.flow.inflow],["Payments & transfer fees",data.flow.outflow],["Outstanding collections",receivables.reduce((s,r)=>s+Number(r.outstanding),0)]].map(([label,value])=><div key={label}><span>{label}</span><strong>{money(value)}</strong></div>)}</div>
   <p className={styles.help}>Balances include postings through {period.to}. Internal transfers do not count as income or expense. Fees and deductions: {money(data.flow.fees)}. Petty-cash Cash In and expenses sync automatically, including existing records. Record branch petty-cash movements under Expenses → Petty Cash. Other expenses and POS sales require cash postings; set opening balances without duplicating imported petty-cash movements.</p>
   <nav className={styles.tabs} aria-label="Cash flow sections">{[["position","Cash Position"],["payments","Payments & Checks"],["post","Record Movement"],["collections","Collections"],["ledger","Cash Ledger"]].map(([key,label])=><button key={key} aria-pressed={tab===key} onClick={()=>setTab(key)}>{label}</button>)}</nav>
   {tab==="position"&&<><FinanceCashPositionOverview accounts={accounts} period={period} busy={busy} onSave={run}/><section className={styles.panel}><h2>Manage fund sources</h2>
    {!accounts.length&&<p>Add accounts or import your existing finance fund sources.</p>}
    <button disabled={busy} onClick={()=>run("finance_cash_sync_sources",{},"Fund sources imported.")}>Import Finance Fund Sources</button>
    <h3>Add fund source</h3><form className={styles.form} onSubmit={e=>{e.preventDefault();run("finance_cash_create_account",{p_name:account.name,p_kind:account.kind},"Fund source added. Record its opening balance if needed.",()=>setAccount({name:"",kind:"bank"}));}}>
     <Field label="Fund / account name"><input required value={account.name} onChange={e=>setAccount({...account,name:e.target.value})} placeholder="Operating Bank or GCash -9393"/></Field><Field label="Type"><select value={account.kind} onChange={e=>setAccount({...account,kind:e.target.value})}>{["cash","bank","wallet"].map(k=><option key={k}>{k}</option>)}</select></Field><button disabled={busy}>Add Fund Source</button>
    </form></section></>}
   {tab==="post"&&<section className={styles.panel}><h2>Record cash movement</h2><form className={styles.form} onSubmit={e=>{e.preventDefault();const id=requestId||crypto.randomUUID();setRequestId(id);run("finance_cash_post",{p_data:{...form,request_id:id}},"Movement posted.",()=>{setForm(fresh());setRequestId(null);});}}>
    <Field label="Movement"><select value={form.kind} onChange={e=>{setForm({...fresh(),kind:e.target.value});setRequestId(null);}}>{[["transfer","Fund Transfer"],["inflow","Other Cash In"],["outflow","Cash Out / Payment"],["opening","Opening Balance"]].map(([k,label])=><option key={k} value={k}>{label}</option>)}</select></Field>
    <Field label="Date"><input type="date" required value={form.transaction_date} onChange={e=>update("transaction_date",e.target.value)}/></Field>
    {form.kind==="collection"&&<Field label="Outstanding receivable"><select required value={form.receivable_id} onChange={e=>{const r=receivables.find(r=>r.id===e.target.value);setForm({...form,receivable_id:e.target.value,amount:r?String(r.outstanding):""});setRequestId(null);}}><option value="">Select collection</option>{receivables.filter(r=>Number(r.outstanding)>0).map(r=><option key={r.id} value={r.id}>{r.channel} · {r.reference} · {money(r.outstanding)}</option>)}</select></Field>}
    {["outflow","transfer"].includes(form.kind)&&<Field label="From fund source">{accountSelect("from_account_id",form.to_account_id)}</Field>}
    {form.kind!=="outflow"&&<Field label="Receiving fund source">{accountSelect("to_account_id",form.from_account_id)}</Field>}
    <Field label={form.kind==="collection"?"Gross amount settled":"Amount"}><input type="number" min="0.01" step="0.01" required value={form.amount} onChange={e=>update("amount",e.target.value)}/></Field>
    {["collection","transfer"].includes(form.kind)&&<Field label="Fees / deductions"><input type="number" min="0" step="0.01" required value={form.fee} onChange={e=>update("fee",e.target.value)}/></Field>}
    <Field label="Reference / settlement number"><input required value={form.reference} onChange={e=>update("reference",e.target.value)}/></Field><Field label="Notes"><input value={form.notes} onChange={e=>update("notes",e.target.value)}/></Field>
    <p className={styles.help}>{["collection","transfer"].includes(form.kind)?`Net received: ${money(Number(form.amount)-Number(form.fee))}. Transfers debit the full amount from the source; collections reduce the receivable by the gross settled amount.`:"Use the actual movement date and include the expense or receipt reference. Opening balances are excluded from cash flow."}</p><button disabled={busy||!accounts.length}>{busy?"Saving…":"Post Movement"}</button>
   </form></section>}
   {tab==="payments"&&<FinanceCashPaymentQueue rows={data.payment_queue||[]} accounts={postingAccounts} period={period} busy={busy} onSave={run}/>}
   {tab==="collections"&&<FinanceShiftCollections rows={receivables} accounts={postingAccounts} busy={busy} onSave={run} period={period}/>}
   {tab==="ledger"&&<section className={styles.panel}><div className={styles.header}><h2>Cash ledger</h2><button onClick={exportCsv}>Export CSV</button></div><div className={styles.scroll}><table><thead><tr><th>Date</th><th>Type</th><th>From</th><th>To</th><th>Amount</th><th>Fees</th><th>Reference / Notes</th><th>Action</th></tr></thead><tbody>{data.transactions.map(t=><tr key={t.id}><td>{t.transaction_date}</td><td>{t.kind}{t.reversed?" · Reversed":""}</td><td>{names[t.from_account_id]||"—"}</td><td>{names[t.to_account_id]||"—"}</td><td>{money(t.amount)}</td><td>{money(t.fee)}</td><td>{t.reference}<small className={styles.note}>{t.notes}</small></td><td>{t.kind!=="reversal"&&!t.reversed&&!t.source_table&&<button disabled={busy} onClick={()=>{setReversal(t);setReason("");setReverseDate(today());}}>Reverse</button>}{t.source_table && <small>{t.source_table==="finance_cash_payment_queue"?"Manage in Payments":"Manage in Petty Cash"}</small>}</td></tr>)}</tbody></table></div>{!data.transactions.length&&<p>No movements in this period.</p>}
    {reversal&&<form className={styles.form} onSubmit={e=>{e.preventDefault();run("finance_cash_reverse",{p_id:reversal.id,p_date:reverseDate,p_reason:reason},"Reversal posted; original retained.",()=>setReversal(null));}}><h3>Reverse {reversal.reference}</h3><Field label="Reversal date"><input type="date" required min={reversal.transaction_date} value={reverseDate} onChange={e=>setReverseDate(e.target.value)}/></Field><Field label="Reason"><input required value={reason} onChange={e=>setReason(e.target.value)}/></Field><button disabled={busy}>Post Reversal</button><button type="button" onClick={()=>setReversal(null)}>Cancel</button></form>}
   </section>}
  </>}
 </div>;
}
