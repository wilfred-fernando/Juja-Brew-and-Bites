"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
const fresh = () => ({content:{title:"",label:"",offer:"",schedule:"",details:"",image:"",width:1385,height:1136,requiresId:false},is_active:true,starts_on:"",ends_on:"",sort_order:0});
const input="mt-1 w-full rounded-xl border border-slate-300 bg-white p-3 text-slate-900";
export default function PublicPromoManager() {
  const [rows,setRows]=useState([]), [draft,setDraft]=useState(null), [busy,setBusy]=useState(false), [error,setError]=useState(""), [loading,setLoading]=useState(true);
  async function call(method,body) {
    const response=await fetch('/api/admin/public-promos',{method,cache:'no-store',...(body instanceof FormData?{body}:body?{headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}:{})});
    const data=await response.json(); if(!response.ok)throw new Error(data.error); return data;
  }
  async function load(){try{setRows((await call('GET')).rows);}catch(e){setError(e.message);}finally{setLoading(false);}}
  useEffect(()=>{load();},[]);
  async function save(e){e.preventDefault();setBusy(true);setError('');try{await call(draft.id?'PATCH':'POST',draft);setDraft(null);await load();}catch(e){setError(e.message);}finally{setBusy(false);}}
  async function remove(row){if(!confirm(`Delete ${row.content.title} from both promo pages?`))return;setBusy(true);setError('');try{await call('DELETE',{id:row.id});await load();}catch(e){setError(e.message);}finally{setBusy(false);}}
  async function upload(file){if(!file)return;setBusy(true);setError('');try{const form=new FormData();form.append('file',file);const asset=await call('POST',form);setDraft(d=>({...d,content:{...d.content,...asset}}));}catch(e){setError(e.message);}finally{setBusy(false);}}
  return <section className="mt-10 rounded-3xl border border-slate-200 bg-white p-6">
    <div className="mb-6 flex flex-wrap justify-between gap-4"><div><h2 className="text-2xl font-bold text-slate-900">Public &amp; Customer Promos</h2><p className="mt-2 text-sm text-slate-600">Manage artwork and offers shown on both pages. Dates use Manila time.</p></div><button disabled={busy} className="rounded-full bg-slate-600 px-5 py-3 text-white" onClick={()=>{setError('');setDraft(fresh());}}>+ Add Promo</button></div>
    {error&&<p role="alert" className="mb-4 rounded-xl bg-red-50 p-4 text-red-800">{error}</p>}
    {draft&&<form onSubmit={save} className="mb-6 grid gap-4 rounded-2xl bg-slate-50 p-5 md:grid-cols-2"><h3 className="text-lg font-bold md:col-span-2">{draft.id?'Edit Promo':'New Promo'}</h3>
      {Object.entries({title:'Title',label:'Badge label',offer:'Offer',schedule:'Schedule text',image:'Artwork URL'}).map(([key,label])=><label key={key} className="text-sm text-slate-700">{label}<input required disabled={busy} className={input} value={draft.content[key]} onChange={e=>setDraft({...draft,content:{...draft.content,[key]:e.target.value}})}/></label>)}
      <label className="text-sm text-slate-700">Upload artwork<input disabled={busy} className={input} type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>upload(e.target.files?.[0])}/><span className="text-xs">PNG, JPG, WebP · Up to 8 MB</span></label>
      {draft.content.image&&<Image unoptimized src={draft.content.image} width={Number(draft.content.width)||1385} height={Number(draft.content.height)||1136} alt="Promo preview" className="h-auto max-w-[220px] md:col-span-2"/>}
      <label className="text-sm text-slate-700 md:col-span-2">Details and eligibility<textarea required disabled={busy} rows={4} className={input} value={draft.content.details} onChange={e=>setDraft({...draft,content:{...draft.content,details:e.target.value}})}/></label>
      {['starts_on','ends_on'].map(key=><label key={key} className="text-sm text-slate-700">{key==='starts_on'?'Start date':'End date'}<input disabled={busy} className={input} type="date" value={draft[key]||''} onChange={e=>setDraft({...draft,[key]:e.target.value})}/></label>)}
      {['width','height'].map(key=><label key={key} className="text-sm text-slate-700">Artwork {key}<input disabled={busy} required className={input} type="number" min="1" max="20000" value={draft.content[key]} onChange={e=>setDraft({...draft,content:{...draft.content,[key]:Number(e.target.value)}})}/></label>)}
      <label className="text-sm text-slate-700">Display order<input disabled={busy} required className={input} type="number" min="0" max="10000" value={draft.sort_order} onChange={e=>setDraft({...draft,sort_order:Number(e.target.value)})}/></label>
      <div className="flex items-center gap-5 text-sm text-slate-700"><label><input disabled={busy} type="checkbox" checked={draft.is_active} onChange={e=>setDraft({...draft,is_active:e.target.checked})}/> Active</label><label><input disabled={busy} type="checkbox" checked={draft.content.requiresId} onChange={e=>setDraft({...draft,content:{...draft.content,requiresId:e.target.checked}})}/> Require valid ID</label></div>
      <div className="flex gap-3 md:col-span-2"><button disabled={busy} className="rounded-full bg-slate-600 px-6 py-3 text-white">{busy?'Saving…':'Save Promo'}</button><button disabled={busy} type="button" className="rounded-full border bg-white px-6 py-3" onClick={()=>setDraft(null)}>Cancel</button></div>
    </form>}
    {loading?<p>Loading promos…</p>:rows.length===0?<p>No promos added.</p>:<div className="grid gap-4">{rows.map(row=><article key={row.id} className="flex flex-wrap items-center gap-4 rounded-2xl border p-4"><Image unoptimized src={row.content.image} width={row.content.width} height={row.content.height} alt={row.content.label} className="h-auto w-24 rounded-lg"/><div className="flex-1"><h3 className="font-bold text-slate-900">{row.content.title}</h3><p className="text-sm text-slate-600">{row.is_active?'Active':'Disabled'} · {row.starts_on||'No start date'} – {row.ends_on||'No end date'} · Order {row.sort_order}</p></div><button disabled={busy} className="rounded-full border bg-white px-5 py-2" onClick={()=>{setError('');setDraft({...row,content:{...row.content}});}}>Edit</button><button disabled={busy} className="rounded-full border bg-white px-5 py-2" onClick={()=>remove(row)}>Delete</button></article>)}</div>}
  </section>;
}
