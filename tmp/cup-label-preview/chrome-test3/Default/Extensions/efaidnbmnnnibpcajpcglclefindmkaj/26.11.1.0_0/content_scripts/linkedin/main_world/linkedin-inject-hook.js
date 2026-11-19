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
!function(){if(window.acrobatLinkedinInjectHookInstalled)return;window.acrobatLinkedinInjectHookInstalled=!0;const e=[];let t=null;setTimeout(()=>{t||(e.length=0)},1e4),Object.defineProperty(window,"__acrobat_inject_a",{set(n){const a=Object.getOwnPropertyDescriptor(window,"__acrobat_inject_b");a&&a.set&&(window.__acrobat_inject_b={token:n.token,buffer:e,setActiveSend(e){t=e}})},configurable:!1,enumerable:!1});const n=window.fetch;window.fetch=function(...a){return n.apply(this,a).then(n=>(Promise.resolve().then(()=>{let a=null;try{const e=new URL(n.url);"www.linkedin.com"===e.hostname&&e.pathname.includes("/voyager/api/voyagerMessagingGraphQL/graphql")&&decodeURIComponent(e.search).includes("urn:li:msg_conversation")?a="linkedin-chat-messages-data":e.pathname.includes("feedshare-document-master-manifest")&&(a="linkedin-feed-post-data")}catch(e){}if(a)try{n.clone().text().then(n=>{var o,i;o=a,i={responseData:n},t?t({eventType:o,detail:i}):(e.length>=1e3&&e.shift(),e.push({eventType:o,detail:i}))}).catch(()=>{})}catch(e){}}),n)).catch(e=>{throw e})}}();