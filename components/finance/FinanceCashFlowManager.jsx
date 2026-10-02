"use client";
import { useCallback, useEffect, useState } from "react";
import { getSupabaseClient } from "@/lib/supabase/client";
import styles from "./FinanceCashFlow.module.css";
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
 const [receivable,setReceivable] = useState(() => ({channel:"GrabFood",period_start:today(),period_end:today(),due_date:"",gross_amount:"",reference:"",notes:""}));
 const [reversal,setReversal] = useState(null), [reason,setReason] = useState(""), [reverseDate,setReverseDate] = useState(today);
 const load = useCallback(async () => {
  setLoading(true);
  try { const result = await supabase.rpc("finance_cash_snapshot",{p_from:period.from,p_to:period.to}); if(result.error) throw result.error; setData(result.data); setError(""); }
  catch(e) {setData(null);setError(e.message.includes("finance_cash_") ? "Apply supabase/migrations/20261002090000_finance_cash_flow.sql, then refresh. " + e.message : e.message);}
  finally {setLoading(false);}
 },[supabase,period.from,period.to]);
 useEffect(() => {load();},[load]);
 async function run(name,args,message,reset) {
  if(busy) return; setBusy(true);setError("");setNotice("");
  try {const result = await supabase.rpc(name,args);if(result.error) throw result.error;reset?.();setNotice(message);await load();}
  catch(e){setError(e.message);}finally{setBusy(false);}
 }
 const accounts=data?.accounts || [], receivables=data?.receivables || [];
 const names=Object.fromEntries(accounts.map(a=>[a.id,a.name]));
 const total=accounts.reduce((s,a)=>s+Number(a.balance),0), opening=accounts.reduce((s,a)=>s+Number(a.opening),0);
 function update(key,value){setForm(p=>({...p,[key]:value}));setRequestId(null);}
 function collect(r){setForm({...fresh(),kind:"collection",receivable_id:r.id,amount:String(r.outstanding),reference:r.reference});setRequestId(null);setTab("post");}
 function accountSelect(key,exclude){return <select required value={form[key]} onChange={e=>update(key,e.target.value)}><option value="">Select fund source</option>{accounts.filter(a=>a.id!==exclude).map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select>;}
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
   <div className={styles.metrics}>{[["Cash position",total],["Opening position",opening],["Net collections & inflows",data.flow.inflow],["Payments & transfer fees",data.flow.outflow],["Outstanding collections",receivables.reduce((s,r)=>s+Number(r.outstanding),0)]].map(([label,value])=><div key={label}><span>{label}</span><strong>{money(value)}</strong></div>)}</div>
   <p className={styles.help}>Balances include postings through {period.to}. Internal transfers do not count as income or expense. Fees and deductions: {money(data.flow.fees)}. Historical expenses and POS sales are not automatically posted; establish opening balances and record subsequent cash movements here.</p>
   <nav className={styles.tabs} aria-label="Cash flow sections">{[["position","Fund Sources"],["post","Record Movement"],["collections","Collections"],["ledger","Cash Ledger"]].map(([key,label])=><button key={key} aria-pressed={tab===key} onClick={()=>setTab(key)}>{label}</button>)}</nav>
   {tab==="position"&&<section className={styles.panel}><h2>Fund sources</h2><div className={styles.scroll}><table><thead><tr><th>Fund source</th><th>Type</th><th>Opening</th><th>Period change</th><th>Closing balance</th></tr></thead><tbody>{accounts.map(a=><tr key={a.id}><td>{a.name}</td><td>{a.kind}</td><td>{money(a.opening)}</td><td>{money(Number(a.balance)-Number(a.opening))}</td><td>{money(a.balance)}</td></tr>)}</tbody></table></div>
    {!accounts.length&&<p>Add accounts or import your existing finance fund sources.</p>}
    <button disabled={busy} onClick={()=>run("finance_cash_sync_sources",{},"Fund sources imported.")}>Import Finance Fund Sources</button>
    <h3>Add fund source</h3><form className={styles.form} onSubmit={e=>{e.preventDefault();run("finance_cash_create_account",{p_name:account.name,p_kind:account.kind},"Fund source added. Record its opening balance if needed.",()=>setAccount({name:"",kind:"bank"}));}}>
     <Field label="Fund / account name"><input required value={account.name} onChange={e=>setAccount({...account,name:e.target.value})} placeholder="Operating Bank or GCash -9393"/></Field><Field label="Type"><select value={account.kind} onChange={e=>setAccount({...account,kind:e.target.value})}>{["cash","bank","wallet"].map(k=><option key={k}>{k}</option>)}</select></Field><button disabled={busy}>Add Fund Source</button>
    </form></section>}
   {tab==="post"&&<section className={styles.panel}><h2>Record cash movement</h2><form className={styles.form} onSubmit={e=>{e.preventDefault();const id=requestId||crypto.randomUUID();setRequestId(id);run("finance_cash_post",{p_data:{...form,request_id:id}},"Movement posted.",()=>{setForm(fresh());setRequestId(null);});}}>
    <Field label="Movement"><select value={form.kind} onChange={e=>{setForm({...fresh(),kind:e.target.value});setRequestId(null);}}>{[["transfer","Fund Transfer"],["collection","Collection / Settlement"],["inflow","Other Cash In"],["outflow","Cash Out / Payment"],["opening","Opening Balance"]].map(([k,label])=><option key={k} value={k}>{label}</option>)}</select></Field>
    <Field label="Date"><input type="date" required value={form.transaction_date} onChange={e=>update("transaction_date",e.target.value)}/></Field>
    {form.kind==="collection"&&<Field label="Outstanding receivable"><select required value={form.receivable_id} onChange={e=>{const r=receivables.find(r=>r.id===e.target.value);setForm({...form,receivable_id:e.target.value,amount:r?String(r.outstanding):""});setRequestId(null);}}><option value="">Select collection</option>{receivables.filter(r=>Number(r.outstanding)>0).map(r=><option key={r.id} value={r.id}>{r.channel} · {r.reference} · {money(r.outstanding)}</option>)}</select></Field>}
    {["outflow","transfer"].includes(form.kind)&&<Field label="From fund source">{accountSelect("from_account_id",form.to_account_id)}</Field>}
    {form.kind!=="outflow"&&<Field label="Receiving fund source">{accountSelect("to_account_id",form.from_account_id)}</Field>}
    <Field label={form.kind==="collection"?"Gross amount settled":"Amount"}><input type="number" min="0.01" step="0.01" required value={form.amount} onChange={e=>update("amount",e.target.value)}/></Field>
    {["collection","transfer"].includes(form.kind)&&<Field label="Fees / deductions"><input type="number" min="0" step="0.01" required value={form.fee} onChange={e=>update("fee",e.target.value)}/></Field>}
    <Field label="Reference / settlement number"><input required value={form.reference} onChange={e=>update("reference",e.target.value)}/></Field><Field label="Notes"><input value={form.notes} onChange={e=>update("notes",e.target.value)}/></Field>
    <p className={styles.help}>{["collection","transfer"].includes(form.kind)?`Net received: ${money(Number(form.amount)-Number(form.fee))}. Transfers debit the full amount from the source; collections reduce the receivable by the gross settled amount.`:"Use the actual movement date and include the expense or receipt reference. Opening balances are excluded from cash flow."}</p><button disabled={busy||!accounts.length}>{busy?"Saving…":"Post Movement"}</button>
   </form></section>}
   {tab==="collections"&&<section className={styles.panel}><h2>Aggregator & payment-channel collections</h2><p className={styles.help}>Enter amounts due from statements or batches. Partial collections are supported; record fees and deductions during settlement.</p><div className={styles.scroll}><table><thead><tr><th>Channel</th><th>Period</th><th>Due</th><th>Reference</th><th>Gross</th><th>Outstanding</th><th>Action</th></tr></thead><tbody>{receivables.map(r=><tr key={r.id}><td>{r.channel}</td><td>{r.period_start} – {r.period_end}</td><td>{r.due_date||"—"}{r.due_date&&r.due_date<today()&&Number(r.outstanding)>0?" · Overdue":""}</td><td>{r.reference}</td><td>{money(r.gross_amount)}</td><td>{money(r.outstanding)}</td><td>{Number(r.outstanding)>0?<button onClick={()=>collect(r)}>Collect</button>:"Collected"}</td></tr>)}</tbody></table></div>
    <h3>Add amount for collection</h3><form className={styles.form} onSubmit={e=>{e.preventDefault();run("finance_cash_create_receivable",{p_data:receivable},"Receivable recorded.",()=>setReceivable({...receivable,gross_amount:"",reference:"",notes:""}));}}>
     <Field label="Channel"><input list="collection-channels" required value={receivable.channel} onChange={e=>setReceivable({...receivable,channel:e.target.value})}/><datalist id="collection-channels">{["GrabFood","ShopeeFood","GCash","QRPH","GrabPay","Foodpanda"].map(c=><option key={c} value={c}/>)}</datalist></Field>
     {[["period_start","Period start"],["period_end","Period end"],["due_date","Expected collection date"]].map(([key,label])=><Field key={key} label={label}><input type="date" required={key!=="due_date"} value={receivable[key]} onChange={e=>setReceivable({...receivable,[key]:e.target.value})}/></Field>)}
     <Field label="Gross amount due"><input type="number" required min="0.01" step="0.01" value={receivable.gross_amount} onChange={e=>setReceivable({...receivable,gross_amount:e.target.value})}/></Field>
     <Field label="Unique statement / batch reference"><input required value={receivable.reference} onChange={e=>setReceivable({...receivable,reference:e.target.value})}/></Field><Field label="Notes"><input value={receivable.notes} onChange={e=>setReceivable({...receivable,notes:e.target.value})}/></Field><button disabled={busy}>Add Receivable</button>
    </form></section>}
   {tab==="ledger"&&<section className={styles.panel}><div className={styles.header}><h2>Cash ledger</h2><button onClick={exportCsv}>Export CSV</button></div><div className={styles.scroll}><table><thead><tr><th>Date</th><th>Type</th><th>From</th><th>To</th><th>Amount</th><th>Fees</th><th>Reference / Notes</th><th>Action</th></tr></thead><tbody>{data.transactions.map(t=><tr key={t.id}><td>{t.transaction_date}</td><td>{t.kind}{t.reversed?" · Reversed":""}</td><td>{names[t.from_account_id]||"—"}</td><td>{names[t.to_account_id]||"—"}</td><td>{money(t.amount)}</td><td>{money(t.fee)}</td><td>{t.reference}<small className={styles.note}>{t.notes}</small></td><td>{t.kind!=="reversal"&&!t.reversed&&<button disabled={busy} onClick={()=>{setReversal(t);setReason("");setReverseDate(today());}}>Reverse</button>}</td></tr>)}</tbody></table></div>{!data.transactions.length&&<p>No movements in this period.</p>}
    {reversal&&<form className={styles.form} onSubmit={e=>{e.preventDefault();run("finance_cash_reverse",{p_id:reversal.id,p_date:reverseDate,p_reason:reason},"Reversal posted; original retained.",()=>setReversal(null));}}><h3>Reverse {reversal.reference}</h3><Field label="Reversal date"><input type="date" required min={reversal.transaction_date} value={reverseDate} onChange={e=>setReverseDate(e.target.value)}/></Field><Field label="Reason"><input required value={reason} onChange={e=>setReason(e.target.value)}/></Field><button disabled={busy}>Post Reversal</button><button type="button" onClick={()=>setReversal(null)}>Cancel</button></form>}
   </section>}
  </>}
 </div>;
}
