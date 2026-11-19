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
!function(){if(window.acrobatGeminiInjectHookInstalled)return;window.acrobatGeminiInjectHookInstalled=!0;const e=[];let t=null;setTimeout(()=>{t||(e.length=0)},1e4),Object.defineProperty(window,"__acrobat_inject_a",{set(n){const o=Object.getOwnPropertyDescriptor(window,"__acrobat_inject_b");o&&o.set&&(window.__acrobat_inject_b={token:n.token,buffer:e,setActiveSend(e){t=e}})},configurable:!1,enumerable:!1});const n=XMLHttpRequest.prototype,o=n.send;n.send=function(...n){return this.addEventListener("load",function(){try{const a=new URL(this.responseURL);"gemini.google.com"===a.hostname&&a.pathname.includes("/_/BardChatUi/data/batchexecute")&&a.search.includes("rpcids=hNvQHb")&&(n="acrobat-gemini-api-data",o={responseData:this.response},t?t({eventType:n,detail:o}):(e.length>=1e3&&e.shift(),e.push({eventType:n,detail:o})))}catch{}var n,o}),o.apply(this,n)}}();