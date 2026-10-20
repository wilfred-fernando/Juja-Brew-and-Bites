import {createServerClient} from '@supabase/ssr';
import {cookies} from 'next/headers';
import {overlayArchivedReceiptCorrections} from '@/lib/server/receipt-corrections';
import {normalizeSalesData,addDays} from '@/lib/reports/salesReports';
import {FINANCE_SALES_START,financeSalesRange,buildFinanceMonthlySales} from '@/lib/reports/financeMonthlySales';

const headers={'cache-control':'private, no-store'};
async function allRows(query){
 const rows=[];
 for(let offset=0;;offset+=1000){const {data,error}=await query().range(offset,offset+999);if(error)throw error;rows.push(...data);if(data.length<1000)return rows;}
}
export async function GET(request){
 const cookieStore=await cookies();
 const supabase=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,{cookies:{getAll:()=>cookieStore.getAll(),setAll:()=>{}}});
 const {data:auth}=await supabase.auth.getUser();
 if(!auth?.user)return Response.json({error:'Finance administrator access required.'},{status:403,headers});
 const {data:profile}=await supabase.from('profiles').select('role').eq('id',auth.user.id).maybeSingle();
 if(!['admin','super_admin'].includes(String(profile?.role||'').toLowerCase()))return Response.json({error:'Finance administrator access required.'},{status:403,headers});
 const params=new URL(request.url).searchParams,month=params.get('month'),range=financeSalesRange(month);
 if(!range)return Response.json({error:'Choose August 2026 or later. Reporting starts August 11, 2026.'},{status:400,headers});
 try{
  const stores=await supabase.from('stores').select('id,name').order('name');
  if(stores.error)throw stores.error;
  const storeId=params.get('storeId')||String(stores.data?.[0]?.id||'');
  if(!storeId||!stores.data.some(store=>String(store.id)===storeId))return Response.json({error:'Select one valid store. Combined store reports are unavailable.'},{status:400,headers});
  const api=String(process.env.D1_ARCHIVE_API_URL||'').replace(/\/$/,''),token=process.env.D1_ARCHIVE_API_TOKEN;
  if(!api||!token)return Response.json({error:'The sales archive is not configured. Complete historical monthly totals cannot be verified.'},{status:503,headers});
  const target=new URL(`${api}/v1/sales`);target.searchParams.set('from',FINANCE_SALES_START);target.searchParams.set('to',addDays(range.endDate,1));target.searchParams.set('includeItems','1');
  target.searchParams.set('storeId',storeId);
  const response=await fetch(target,{headers:{authorization:`Bearer ${token}`},cache:'no-store'});
  if(!response.ok)throw new Error('The sales archive is unavailable. Please retry; incomplete totals have not been displayed.');
  const archived=await overlayArchivedReceiptCorrections(await response.json());
  const start=`${FINANCE_SALES_START}T00:00:00+08:00`,end=`${addDays(range.endDate,2)}T00:00:00+08:00`,contextStart=`${addDays(FINANCE_SALES_START,-2)}T00:00:00+08:00`;
  const scoped=(table,dateStart)=>supabase.from(table).select('*').gte('created_at',dateStart).lt('created_at',end).order('created_at').order('id').eq('store_id',storeId);
  const results=await Promise.allSettled([
   allRows(()=>scoped('orders',start)),allRows(()=>scoped('web_orders',start)),allRows(()=>scoped('cashier_pos',contextStart)),
   supabase.from('menu_items').select('id,name,category,price'),
  ]);
  const values=results.map(result=>{if(result.status==='rejected')throw result.reason;return result.value;});
  const [orders,webOrders,shiftRecords,menu]=values;
  if(stores.error)throw stores.error;if(menu.error)throw menu.error;
  const items=[];
  for(let offset=0;offset<orders.length;offset+=200){const ids=orders.slice(offset,offset+200).map(row=>row.id);items.push(...await allRows(()=>supabase.from('order_items').select('*').in('order_id',ids).order('id')));}
  const normalized=normalizeSalesData({orders:[...(archived.orders||[]),...orders],webOrders:[...(archived.webOrders||[]),...webOrders],orderItems:[...(archived.orderItems||[]),...items],shiftRecords:[...(archived.shiftRecords||[]),...shiftRecords],stores:stores.data,menuItems:menu.data});
  const report=buildFinanceMonthlySales(normalized,month,storeId);
  return Response.json({...report,storeId,stores:stores.data,archiveThrough:archived.archiveThrough||null},{headers});
 }catch(error){return Response.json({error:error.message||'Unable to load the monthly sales report.'},{status:502,headers});}
}
