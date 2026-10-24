"use client";
import {useEffect,useRef,useState} from 'react';
import styles from './FinanceCashFlow.module.css';
const money=value=>new Intl.NumberFormat('en-PH',{style:'currency',currency:'PHP'}).format(Number(value||0));
export default function FinanceShopeeCollections({rows,busy,onRemit,onSave,period,error}){
 const [selected,setSelected]=useState(null),[others,setOthers]=useState(''),[date,setDate]=useState(''),[notes,setNotes]=useState(''),[request,setRequest]=useState(null);
 const dialog=useRef(null);
 useEffect(()=>{if(selected&&!dialog.current?.open)dialog.current?.showModal();},[selected]);
 function edit(row){setSelected(row);setOthers(String(row.others||0));setDate(period.to);setNotes('');setRequest(null);}
 return <><h3>ShopeeFood collections</h3><p className={styles.help}>Commission: −(gross sales × 27% ÷ 1.12). Tax on commission: −12% of commission base. Gross remittance: gross sales × 0.622855. EWT: −0.5% of gross remittance. Net sales include the signed Others adjustment; balance = net sales − remitted.</p>
  <div className={styles.scroll}><table><thead><tr>{['Store','Shift date','Shift','Channel','Gross Sales','Commission','Tax on Comm','Gross Remittance','EWT','Others','Net Sales','Remitted','Balance','Action'].map(label=><th key={label}>{label}</th>)}</tr></thead><tbody>{rows.map(row=><tr key={row.id}><td>{row.store_name}</td><td>{row.period_end}</td><td>{row.shift_id||'Previous manual entry'}</td><td>ShopeeFood</td><td>{money(row.gross_amount)}</td><td>{money(row.commission)}</td><td>{money(row.tax_on_commission)}</td><td>{money(row.gross_remittance)}</td><td>{money(row.ewt)}</td><td>{money(row.others)}</td><td>{money(row.net_sales)}</td><td>{money(row.remitted)}</td><td><strong>{money(row.outstanding)}</strong></td><td><div className={styles.actionRow}>{Number(row.outstanding)>0?<button type="button" disabled={busy} onClick={()=>onRemit(row)}>Add Remittance</button>:<span>{Number(row.outstanding)<0?'Over-remitted · review':'Balanced'}</span>}<button type="button" disabled={busy} onClick={()=>edit(row)}>Edit Others</button></div></td></tr>)}</tbody></table></div>
  <dialog ref={dialog} className={styles.remittanceDialog} aria-labelledby="shopee-others-title" onCancel={event=>{if(busy)event.preventDefault();else setSelected(null);}}>
   {selected&&<form onSubmit={event=>{event.preventDefault();const id=request||crypto.randomUUID();setRequest(id);onSave('finance_shopee_save_adjustment',{p_data:{request_id:id,receivable_id:selected.id,effective_date:date,others,notes}},'ShopeeFood Others adjustment saved and net balance recalculated.',()=>{setSelected(null);dialog.current?.close();});}}><h3 id="shopee-others-title">ShopeeFood Others — {selected.store_name} · {selected.period_end}</h3>{error&&<p role="alert" className={styles.error}>{error}</p>}<fieldset disabled={busy} className={styles.form}>
    <label className={styles.field}>Effective date<input type="date" required min={selected.others_date>selected.period_end?selected.others_date:selected.period_end} value={date} onChange={event=>{setDate(event.target.value);setRequest(null);}}/></label>
    <label className={styles.field}>Others (signed adjustment)<input type="number" required step="0.01" value={others} onChange={event=>{setOthers(event.target.value);setRequest(null);}}/></label>
    <label className={styles.field}>Reason / reference<input required value={notes} onChange={event=>{setNotes(event.target.value);setRequest(null);}}/></label>
    <p className={styles.help}>Use a negative amount for an additional deduction, a positive amount for an addition, or zero to clear Others. Adjustments are dated and logged; earlier as-of reports retain the adjustment applicable then.</p><button>Save Others</button><button type="button" onClick={()=>{setSelected(null);dialog.current?.close();}}>Cancel</button>
   </fieldset></form>}
  </dialog>
 </>;
}
