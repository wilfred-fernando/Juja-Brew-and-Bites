"use client";
import { useEffect, useRef, useState } from "react";
import styles from "./FinanceCashFlow.module.css";
const money=value=>new Intl.NumberFormat("en-PH",{style:"currency",currency:"PHP"}).format(Number(value||0));
const today=()=>new Intl.DateTimeFormat("en-CA",{timeZone:"Asia/Manila",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date());
export default function FinanceShiftCollections({rows,accounts,busy,onSave,period,error}) {
 const [store,setStore]=useState(""),[channel,setChannel]=useState("");
 const [selected,setSelected]=useState(null),[draft,setDraft]=useState({date:today(),amount:"",deductions:"0",account:"",reference:""}),[requestId,setRequestId]=useState(null);
 const stores=Object.entries(Object.fromEntries(rows.filter(r=>r.store_id).map(r=>[r.store_id,r.store_name])));
 const filtered=rows.filter(r=>(!store||r.store_id===store)&&(!channel||r.channel===channel)&&(r.period_end>=period.from||Number(r.outstanding)>0));
 const summary=Object.values(filtered.reduce((groups,r)=>{const key=r.store_id||"manual";const g=groups[key]||{name:r.store_name,sales:0,remitted:0,deductions:0,balance:0};g.sales+=Number(r.gross_amount);g.remitted+=Number(r.remitted);g.deductions+=Number(r.deductions);g.balance+=Number(r.outstanding);groups[key]=g;return groups;},{}));
 function change(key,value){setDraft(p=>({...p,[key]:value}));setRequestId(null);}
 function remit(r){setSelected(r.id);setDraft({date:today(),amount:String(r.outstanding),deductions:"0",account:"",reference:""});setRequestId(null);}
 const row=rows.find(r=>r.id===selected);
 const dialog=useRef(null);
 useEffect(()=>{if(selected&&dialog.current&&!dialog.current.open)dialog.current.showModal();},[selected]);
 return <section className={styles.panel}>
  <h2>Non-cash Sales & Remittances</h2>
  <p className={styles.help}>Closed-shift non-cash sales are added automatically per store and payment channel. Balance = non-cash sales − remittances − deductions. Open shifts are excluded. Earlier unpaid shifts remain visible.</p>
  <div className={styles.period}><label className={styles.field}>Store<select value={store} onChange={e=>setStore(e.target.value)}><option value="">All stores</option>{stores.map(([id,name])=><option key={id} value={id}>{name}</option>)}</select></label><label className={styles.field}>Payment channel<select value={channel} onChange={e=>setChannel(e.target.value)}><option value="">All non-cash channels</option>{[...new Set(rows.map(r=>r.channel))].sort().map(c=><option key={c}>{c}</option>)}</select></label></div>
  <div className={styles.scroll}><table><thead><tr><th>Store</th><th>Non-cash sales</th><th>Remitted</th><th>Deductions</th><th>Balance for collection</th></tr></thead><tbody>{summary.map(g=><tr key={g.name}><td>{g.name}</td><td>{money(g.sales)}</td><td>{money(g.remitted)}</td><td>{money(g.deductions)}</td><td><strong>{money(g.balance)}</strong></td></tr>)}</tbody></table></div>
  <h3>Closed-shift collections</h3><div className={styles.scroll}><table><thead><tr><th>Store</th><th>Shift date</th><th>Shift</th><th>Channel</th><th>Non-cash sales</th><th>Remitted</th><th>Deductions</th><th>Balance</th><th>Action</th></tr></thead><tbody>{filtered.map(r=><tr key={r.id}><td>{r.store_name}</td><td>{r.period_end}</td><td>{r.shift_id||"Previous manual entry"}</td><td>{r.channel}</td><td>{money(r.gross_amount)}</td><td>{money(r.remitted)}</td><td>{money(r.deductions)}</td><td>{money(r.outstanding)}</td><td>{Number(r.outstanding)>0?<button type="button" disabled={busy} onClick={()=>remit(r)}>Add Remittance</button>:"Balanced"}</td></tr>)}</tbody></table></div>
  {!filtered.length&&<p>No non-cash collections for this selection. Sales appear after the shift closes online.</p>}
  {row&&<dialog ref={dialog} className={styles.remittanceDialog} aria-labelledby="remittance-title" onCancel={e=>{if(busy)e.preventDefault();else setSelected(null);}}><form onSubmit={e=>{e.preventDefault();const id=requestId||crypto.randomUUID();setRequestId(id);onSave("finance_cash_post",{p_data:{request_id:id,kind:"collection",transaction_date:draft.date,receivable_id:row.id,to_account_id:draft.account,amount:(Number(draft.amount)+Number(draft.deductions)).toFixed(2),fee:draft.deductions,reference:draft.reference,notes:`Remittance for ${row.store_name} / ${row.channel} / ${row.shift_id||row.reference}`}},"Remittance recorded and collection balance updated.",()=>{setSelected(null);setRequestId(null);});}}>
   <h3 id="remittance-title">Add remittance — {row.store_name} · {row.channel} · {row.period_end}</h3>{error&&<p role="alert" className={styles.error}>{error}</p>}{!accounts.length&&<p role="alert" className={styles.error}>Add a treasury fund source under Cash Position before saving a remittance.</p>}<fieldset disabled={busy} className={styles.form}>
    <label className={styles.field}>Remittance date<input autoFocus type="date" required min={row.period_end} value={draft.date} onChange={e=>change("date",e.target.value)}/></label>
    <label className={styles.field}>Remittance amount<input type="number" required min="0.01" max={row.outstanding} step="0.01" value={draft.amount} onChange={e=>change("amount",e.target.value)}/></label>
    <label className={styles.field}>Fees / other deductions<input type="number" required min="0" max={Math.max(0,Number(row.outstanding)-Number(draft.amount))} step="0.01" value={draft.deductions} onChange={e=>change("deductions",e.target.value)}/></label>
    <label className={styles.field}>Receiving fund source<select required value={draft.account} onChange={e=>change("account",e.target.value)}><option value="">Select receiving account</option>{accounts.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
    <label className={styles.field}>Remittance reference<input required value={draft.reference} onChange={e=>change("reference",e.target.value)}/></label>
    <p className={styles.help}>Outstanding: {money(row.outstanding)} · Remaining after this remittance: {money(Number(row.outstanding)-Number(draft.amount)-Number(draft.deductions))}. The receiving account is credited with the remittance amount.</p>
    <button disabled={busy||!accounts.length}>{busy?"Saving…":"Save Remittance"}</button><button type="button" onClick={()=>setSelected(null)}>Cancel</button>
   </fieldset>
  </form></dialog>}
  <h3>Remittance history</h3><div className={styles.scroll}><table><thead><tr><th>Store</th><th>Channel</th><th>Remittance date</th><th>Amount</th><th>Deductions</th><th>Reference</th><th>Status</th></tr></thead><tbody>{filtered.flatMap(r=>(r.remittances||[]).map(t=><tr key={t.id}><td>{r.store_name}</td><td>{r.channel}</td><td>{t.date}</td><td>{money(t.amount)}</td><td>{money(t.deductions)}</td><td>{t.reference}</td><td>{t.kind==="reversal"?"Reversal":t.reversed?"Reversed":"Posted"}</td></tr>))}</tbody></table></div>
 </section>;
}
