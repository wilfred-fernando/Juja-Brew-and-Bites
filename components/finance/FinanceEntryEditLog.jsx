"use client";
import {useEffect,useRef,useState} from 'react';
import {getSupabaseClient} from '@/lib/supabase/client';
import styles from './FinanceCashFlow.module.css';

const labels={finance_expenses:'Overall Expenses',finance_petty_cash_entries:'Petty Cash Expenses',finance_petty_cash_funds:'Petty Cash Funds',finance_references:'Finance References',finance_delete_requests:'Deletion Requests',finance_daily_inventory_entries:'Daily Inventory',finance_inventory_transfers:'Inventory Transfers',finance_cash_accounts:'Fund Accounts',finance_cash_receivables:'Sales Collections',finance_cash_transactions:'Cash Movements',finance_cash_account_controls:'Reserve / Reconciliation',finance_cash_payment_queue:'Payments & Checks',finance_cash_sales_transfers:'Cash Sales Allocations',finance_cash_closed_shifts:'Closed Shift Sales',payroll_employees:'Employees',payroll_entries:'Payroll Entries',payroll_cash_advances:'Cash Advances',payroll_cash_advance_repayments:'Advance Repayments',payroll_loans:'Employee Loans',payroll_loan_repayments:'Loan Repayments',payroll_misc_deductions:'Payroll Deductions',payroll_periods:'Payroll Cutoffs',payroll_schedules:'Employee Schedules',payroll_attendance:'Attendance',payroll_rate_changes:'Employee Rate Changes'};
const actions={INSERT:'Created',UPDATE:'Edited',DELETE:'Deleted'};
const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Manila',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const initial=()=>({from:today().slice(0,7)+'-01',to:today(),table:'',action:'',actor:'',store:'',search:''});
const time=value=>new Intl.DateTimeFormat('en-PH',{timeZone:'Asia/Manila',dateStyle:'medium',timeStyle:'medium'}).format(new Date(value));
const fieldName=value=>value.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
function valueText(value){if(value==null||value==='')return '—';return typeof value==='object'?JSON.stringify(value,null,2):String(value);}

export default function FinanceEntryEditLog(){
 const supabase=getSupabaseClient(),dialog=useRef(null),detailRequest=useRef(0);
 const [draft,setDraft]=useState(initial),[filters,setFilters]=useState(initial),[page,setPage]=useState(0),[refresh,setRefresh]=useState(0);
 const [options,setOptions]=useState({actors:[],stores:[],tables:[]}),[rows,setRows]=useState([]),[total,setTotal]=useState(0),[loading,setLoading]=useState(true),[error,setError]=useState(''),[detail,setDetail]=useState(null),[detailError,setDetailError]=useState(''),[detailLoading,setDetailLoading]=useState(false);
 const pageSize=50;
 useEffect(()=>{let cancelled=false;supabase.rpc('finance_entry_log_options').then(({data,error:err})=>{if(cancelled)return;if(err)setError(err.message);else setOptions(data);});return()=>{cancelled=true;};},[supabase,refresh]);
 useEffect(()=>{
  let cancelled=false;setLoading(true);setError('');
  supabase.rpc('finance_entry_log_list',{p_from:filters.from,p_to:filters.to,p_table:filters.table||null,p_action:filters.action||null,p_actor:filters.actor||null,p_store:filters.store||null,p_search:filters.search.trim()||null,p_offset:page*pageSize,p_limit:pageSize}).then(({data,error:err})=>{if(cancelled)return;if(err){setError(err.message);setRows([]);setTotal(0);}else{setRows(data.rows);setTotal(Number(data.total));}setLoading(false);});
  return()=>{cancelled=true;};
 },[supabase,filters,page,refresh]);
 useEffect(()=>()=>{detailRequest.current+=1;},[]);
 function change(key,value){setDraft(current=>({...current,[key]:value}));}
 async function inspect(row){
  const request=++detailRequest.current;setDetail(null);setDetailError('');setDetailLoading(true);dialog.current?.showModal();
  const {data,error:err}=await supabase.rpc('finance_entry_log_detail',{p_id:row.id});
  if(request!==detailRequest.current)return;
  if(err)setDetailError(err.message);else setDetail(data);setDetailLoading(false);
 }
 return <div className={`${styles.page} juja-controls`}>
  <header className={styles.header}><div><small>FINANCE / ACTIVITY</small><h1>Entry / Edit Log</h1><p>Who created, edited or deleted Finance records, with the changes recorded at the time.</p></div><button type="button" disabled={loading} onClick={()=>setRefresh(v=>v+1)}>Refresh</button></header>
  <p className={styles.help}>Times use Asia/Manila. History starts when logging was enabled. Linked updates are saved changes made automatically as part of another record, such as a petty cash entry syncing to Payroll or Overall Expenses.</p>
  <form className={styles.form} onSubmit={event=>{event.preventDefault();setPage(0);setFilters({...draft});}}>
   <label className={styles.field}>From<input type="date" required max={draft.to||undefined} value={draft.from} onChange={e=>change('from',e.target.value)}/></label>
   <label className={styles.field}>To<input type="date" required min={draft.from||undefined} value={draft.to} onChange={e=>change('to',e.target.value)}/></label>
   <label className={styles.field}>Record type<select value={draft.table} onChange={e=>change('table',e.target.value)}><option value="">All records</option>{options.tables.map(table=><option key={table} value={table}>{labels[table]||fieldName(table)}</option>)}</select></label>
   <label className={styles.field}>Action<select value={draft.action} onChange={e=>change('action',e.target.value)}><option value="">All actions</option>{Object.entries(actions).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
   <label className={styles.field}>User<select value={draft.actor} onChange={e=>change('actor',e.target.value)}><option value="">All users / system</option>{options.actors.map(actor=><option key={actor.actor_id} value={actor.actor_id}>{actor.actor_name}</option>)}</select></label>
   <label className={styles.field}>Store<select value={draft.store} onChange={e=>change('store',e.target.value)}><option value="">All stores</option>{options.stores.map(store=><option key={store.id} value={store.id}>{store.name}</option>)}</select></label>
   <label className={styles.field}>Search<input type="search" value={draft.search} onChange={e=>change('search',e.target.value)} placeholder="Record, reference, ID or user"/></label>
   <button disabled={loading}>Apply Filters</button>
  </form>
  {error&&<p role="alert" className={styles.error}>{error}</p>}
  {loading?<p role="status">Loading Finance activity…</p>:<><p className={styles.help}>{total} log entries · newest first</p><div className={styles.scroll}><table><thead><tr><th>When (Manila)</th><th>User</th><th>Action</th><th>Record type</th><th>Store</th><th>Record</th><th>Changes</th><th>Details</th></tr></thead><tbody>{rows.map(row=><tr key={row.id}><td>{time(row.recorded_at)}</td><td>{row.actor_name}{row.linked_update&&<small className={styles.note}>Linked update</small>}</td><td>{actions[row.action]}</td><td>{labels[row.source_table]||fieldName(row.source_table)}</td><td>{row.store_name||'—'}</td><td><span className={styles.note}>{row.record_label}</span>{row.reference&&row.reference!==row.record_label&&<small className={styles.note}>Reference: {row.reference}</small>}<small className={styles.note}>{row.record_id}</small></td><td>{row.changed_fields.length} fields</td><td><button type="button" onClick={()=>inspect(row)}>View Changes</button></td></tr>)}</tbody></table></div>{!rows.length&&<p>No log entries match these filters. Earlier edits cannot be reconstructed.</p>}<div className={styles.actionRow}><button type="button" disabled={page===0} onClick={()=>setPage(p=>p-1)}>Previous</button><span>Page {page+1} of {Math.max(1,Math.ceil(total/pageSize))}</span><button type="button" disabled={(page+1)*pageSize>=total} onClick={()=>setPage(p=>p+1)}>Next</button></div></>}
  <dialog ref={dialog} className={styles.cashHistoryDialog} aria-labelledby="finance-log-detail-title" onClose={()=>{detailRequest.current+=1;}}><div className={styles.header}><h2 id="finance-log-detail-title">Finance Record Changes</h2><button type="button" onClick={()=>dialog.current?.close()}>Close</button></div>
   {detailLoading&&<p role="status">Loading changes…</p>}{detailError&&<p role="alert" className={styles.error}>{detailError}</p>}
   {detail&&<><p>{actions[detail.action]} by {detail.actor_name} · {time(detail.recorded_at)}</p><p className={styles.help}>{labels[detail.source_table]} · {detail.record_label} · Record {detail.record_id}<br/>Transaction {detail.transaction_id}{detail.linked_update?' · Linked update':''}</p><div className={styles.scroll}><table><thead><tr><th>Field</th><th>Before</th><th>After</th></tr></thead><tbody>{detail.changed_fields.map(field=><tr key={field}><th>{fieldName(field)}</th><td style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',minWidth:200,maxWidth:500}}>{valueText(detail.before_data?.[field])}</td><td style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere',minWidth:200,maxWidth:500}}>{valueText(detail.after_data?.[field])}</td></tr>)}</tbody></table></div></>}
  </dialog>
 </div>;
}
