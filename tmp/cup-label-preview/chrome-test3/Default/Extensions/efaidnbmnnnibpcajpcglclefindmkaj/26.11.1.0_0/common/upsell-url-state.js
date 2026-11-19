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
const e=new Set(["payment","payment-items","confirmation","paywall","deeplink","sign-in","susi","viewer","email","edit","error","password","accountchooser","business","chooser","faq","id","plans","unknown"]);export const UPSELL_POPUP_CLOSED_LOG_MESSAGE="[v4] [Paywall] Perf: popup window closed";export const UPSELL_POPUP_CLOSED_ANALYTICS_EVENT="DCBrowserExt:Viewer:Paywall:PopupWindowClosed";export function normalizeUpsellUrlState(n){return e.has(n)?n:"unknown"}export function getUpsellUrlStateIdentifier(e){if("string"!=typeof e)return"unknown";try{const{hash:n,pathname:t,search:o}=new URL(e),r=n.startsWith("#/")?n.slice(2).split(/[?#]/)[0]:t,s=normalizeUpsellUrlState((r.split("/").filter(Boolean).pop()||"").replace(/\.html?$/i,""));return"payment"===s&&o.includes("items")?"payment-items":s}catch(e){return"unknown"}}