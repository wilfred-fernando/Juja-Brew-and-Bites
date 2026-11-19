/*************************************************************************
* ADOBE CONFIDENTIAL
* ___________________
*
*  Copyright 2015 Adobe Systems Incorporated
*  All Rights Reserved.
*
* NOTICE:  All information contained herein is, and remains
* the property of Adobe Systems Incorporated and its suppliers,
* if any.  The intellectual and technical concepts contained
* herein are proprietary to Adobe Systems Incorporated and its
* suppliers and are protected by all applicable intellectual property laws,
* including trade secret and or copyright laws.
* Dissemination of this information or reproduction of this material
* is strictly forbidden unless prior written permission is obtained
* from Adobe Systems Incorporated.
**************************************************************************/
import{dcTabStorage as o}from"../tab-storage.js";import{loggingApi as e}from"../../../common/loggingApi.js";export function handleOutlookAttachmentFlow(t,s){return new Promise((r,n)=>{const a=Date.now()+45e3,i=()=>{chrome.runtime.sendMessage({main_op:"get-session",type:"outlook-pdf",sessionId:t}).then(t=>{const l=t?.data;if(l?.outlookTabUrl&&o.setItem("outlookTabUrl",l.outlookTabUrl),l?.url){const o=new URL(l.url);Object.entries(l.queryParams||{}).forEach(([e,t])=>{o.searchParams.set(e,t)});const e=l.token?{Authorization:`Bearer ${l.token}`}:{};return s(o.toString(),e),void r()}"error"!==l?.status?Date.now()<a?setTimeout(i,250):(e.error({message:"Outlook attachment resolution failed",error:"Timed out waiting for outlook attachment session"}),n({message:"Timed out waiting for outlook attachment session"})):n({message:"Outlook attachment resolve failed",error:l.error})}).catch(o=>{e.error({message:"Outlook attachment resolution failed",error:"Failed to resolve outlook attachment session"}),n({message:"Failed to resolve outlook attachment session",error:o?.toString()})})};i()})}export async function resolveLmsDownloadUrl(o){if("string"!=typeof o||!o)throw new Error("Missing LMS download session");const e=await chrome.runtime.sendMessage({main_op:"get-session",type:"lms-viewer-download",sessionId:o});let t;try{t=new URL(e?.data?.url)}catch{throw new Error("Invalid LMS download session")}if("https:"!==t.protocol||!t.hostname.endsWith(".instructure.com")||t.username||t.password)throw new Error("Invalid LMS download session");return t.href}export function handleMsWordDownloadFlow(o,e){return new Promise((t,s)=>{chrome.runtime.sendMessage({main_op:"get-session",type:"msword-document",sessionId:o}).then(o=>{const r=o?.data;if(!r?.url)return void s({message:"No msword download session"});const n=new URL(r.url);Object.entries(r.queryParams||{}).forEach(([o,e])=>{n.searchParams.set(o,e)}),e(n.toString()),t()}).catch(o=>{s({message:"Failed to resolve msword download session",error:o?.toString()})})})}