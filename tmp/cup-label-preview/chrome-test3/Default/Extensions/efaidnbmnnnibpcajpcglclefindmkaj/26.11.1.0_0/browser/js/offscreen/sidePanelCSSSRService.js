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
import{extractWebpageHTML as e}from"../../../resources/addWebpage/extractWebpageHTML.js";import{largeBlobStorage as t}from"../../../common/large-blob-storage.js";import{dcLocalStorage as n}from"./offscrenUtil.js";import"../../../content_scripts/content-script-messaging-gateway.js";import{offscreenSSRPostOps as o}from"../../../sw_modules/messaging/offscreen-ops-contracts.js";export const saveGenAISidePanelRenderedHTML=async o=>{if(document.querySelector("iframe#sidepanel"))return;const[r,s,a,i]=await Promise.all([n.getItem("sidepanelUrl"),n.getItem("appLocale"),n.getItem("theme"),n.getItem("isSidePanelDarkModeEnabled")]),m=new URL(r);m.hash=o.hashRoute;const c=m.origin;m.searchParams.append("la",!1),m.searchParams.append("ca",chrome.runtime.id),m.searchParams.append("locale",s),m.searchParams.append("utl",!0),i&&m.searchParams.append("theme",a||"auto");const d=(e=>{const t=document.createElement("iframe");return t.setAttribute("id","sidepanel"),t.width="373px",t.height="914px",t.border="none",t.onerror=e=>{console.error("Error in loading sidepanel iframe",e)},t.src=e,t})(m.href);let l;document.body.appendChild(d);let p,g=!1,h=!1;const u=()=>{g||(g=!0,clearTimeout(p),l&&window.removeEventListener("message",l),d.remove())};p=setTimeout(u,35e3);const w=(()=>{let e;return{promise:new Promise((t,n)=>{const o=setTimeout(()=>{n(new Error("Hosted sidepanel ready event timeout"))},2e4);e=()=>{clearTimeout(o),t()}}),resolver:e}})();var f;l=window.acrobatExtensionMessaging.wrapPostMessageListener("main_op",e=>!!c&&e.origin===c&&!!d.contentWindow&&e.source===d.contentWindow,async n=>{if(!g&&n.origin===c)switch(n.data.main_op){case"saveHtmlContent":if(h)return;h=!0,window.removeEventListener("message",l),await async function(n){const o=(new DOMParser).parseFromString(n.htmlContent,"text/html"),r=await e(o);if(g)return;const s=n.isAnonUser?"anonGenAISSRHtml":"signedInGenAISSRHtml";r?.html&&await t.setItem(s,r.html),u()}(n.data);break;case"cdnReady":w.resolver()}},{endpoint:"offscreen-ssr"}),window.addEventListener("message",l),f={type:"sidepanelHtmlContent",htmlContent:"<html><body><h1>Hello</h1></body></html>",disqualified:!1,pageLanguage:"en",url:"https://www.hello.com",touchpoint:"offscreen"},d&&w.promise.then(()=>d.contentWindow.postMessage(f,c)).catch(e=>{console.error("Error in sending message to sidepanel:",e.toString()),u()})};