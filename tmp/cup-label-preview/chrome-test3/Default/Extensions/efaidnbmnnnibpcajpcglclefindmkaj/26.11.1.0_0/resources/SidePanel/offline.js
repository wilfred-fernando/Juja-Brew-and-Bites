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
import{loggingApi as e}from"../../common/loggingApi.js";import{connectSidePanelPort as o,getSidePanelTabId as t}from"./sidePanelUtil.js";import{util as n}from"../../browser/js/content-util.js";export async function showHomeLoadError(o,t){document.getElementById("sidepanel")?.remove();const r=document.getElementById("offline-error");if(!r)return void e.error({message:"Home load error screen not found"});const[a,s,i]=await Promise.all(["errorBoundaryTitle","errorBoundaryDescription","errorBoundaryRetryButton"].map(async o=>{const t=await n.getTranslationByAppLocale(o);return t||(e.error({message:"Home load error translation unavailable",key:o}),n.getTranslation(o))}));if(o.signal.aborted)return;o.panelLoader.dispose("home-load-failed"),document.getElementById("popupNoConnection").textContent=a,document.getElementById("popupOfflineMessage").textContent=s;const d=document.createElement("button");d.type="button",d.textContent=i,d.addEventListener("click",async()=>{d.disabled=!0;try{await t()}catch{e.error({message:"Home load retry failed"}),d.disabled=!1}}),r.appendChild(d),r.setAttribute("role","alert"),r.classList.remove("hidden")}export function initOfflineMode(n,r){const a=t();r?.port||o(a,n),chrome.runtime.sendMessage({type:"sidepanel_close_reason",tabId:a,reason:"Offline"}),r?.panelLoader?.dispose("offline");const s=document.getElementById("offline-error");s?s.classList.remove("hidden"):e.debug({message:"offline-error element not found in DOM"})}