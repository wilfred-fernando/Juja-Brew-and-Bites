"use client";
import {useEffect,useState} from 'react';
import MonthlySalesReport from '@/components/admin/MonthlySalesReport';
import FinanceVatReference from './FinanceVatReference';
import {FINANCE_SALES_START,financeSalesRange} from '@/lib/reports/financeMonthlySales';
import {manilaDate} from '@/lib/reports/salesReports';
import styles from './FinanceCashFlow.module.css';

export default function FinanceMonthlySalesReport(){
 const [month,setMonth]=useState(()=>manilaDate().slice(0,7)),[store,setStore]=useState(''),[data,setData]=useState(null),[stores,setStores]=useState([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[refresh,setRefresh]=useState(0);
 const range=financeSalesRange(month);
 useEffect(()=>{
  const controller=new AbortController();setLoading(true);setError('');setData(null);
  fetch(`/api/finance/monthly-sales?${new URLSearchParams({month,storeId:store})}`,{signal:controller.signal,cache:'no-store'}).then(async response=>{const payload=await response.json();if(!response.ok)throw new Error(payload.error||'Unable to load sales.');return payload;}).then(payload=>{if(!controller.signal.aborted){setData(payload);setStores(payload.stores);}}).catch(err=>{if(!controller.signal.aborted)setError(err.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
  return()=>controller.abort();
 },[month,store,refresh]);
 return <div className={`${styles.page} juja-controls`}><header className={styles.header}><div><small>FINANCE / REPORTS</small><h1>Monthly Sales Report</h1><p>Daily sales, discounts and refunds. Reporting starts August 11, 2026.</p></div><button type="button" disabled={loading} onClick={()=>setRefresh(value=>value+1)}>Refresh</button></header>
  <div className={styles.period}><label className={styles.field}>Report month<input type="month" min="2026-08" value={month} onChange={e=>{if(financeSalesRange(e.target.value))setMonth(e.target.value);}}/></label><label className={styles.field}>Store<select value={store||data?.storeId||''} onChange={e=>setStore(e.target.value)}>{!stores.length&&<option value="" disabled>Loading stores…</option>}{stores.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label></div>
  {error&&<p role="alert" className={styles.error}>{error}</p>}{loading&&<p role="status">Loading monthly sales…</p>}
  {data&&!error&&<MonthlySalesReport startDate={range.startDate} endDate={range.endDate} minimumDate={FINANCE_SALES_START} reportData={data.report} showMonthPicker={false} showPaymentTypes branch={stores.find(row=>String(row.id)===String(data.storeId))?.name||'Selected store'} loading={loading} onMonthChange={start=>setMonth(start.slice(0,7))}/>}
  {data?.vatReference&&!error&&<FinanceVatReference report={data.vatReference} month={month} branch={stores.find(row=>String(row.id)===String(data.storeId))?.name||'Selected store'}/>}
 </div>;
}
