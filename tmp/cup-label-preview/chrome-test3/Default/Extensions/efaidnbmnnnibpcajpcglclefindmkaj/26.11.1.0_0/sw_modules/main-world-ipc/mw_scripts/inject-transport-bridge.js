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
function e(e){const t=window.__acrobat_inject_capture;if(!t)return;const n=t.randomUUID();Object.defineProperty(window,"__acrobat_inject_b",{set(r){if("string"!=typeof r?.token||r.token!==n)return;const{buffer:o,setActiveSend:a}=r;t.importKey("raw",new Uint8Array(e),{name:"AES-GCM"},!1,["encrypt"]).then(e=>{let n=Promise.resolve();const r=({eventType:r,detail:o})=>{n=n.then(()=>{const n=t.getRandomValues(new Uint8Array(12)),a=t.encodeUtf8(t.stringify(o));return t.encrypt({name:"AES-GCM",iv:n},e,a).then(e=>{t.dispatchEvent(new t.CustomEvent(r,{detail:{iv:Array.from(n),ciphertext:Array.from(new Uint8Array(e))}}))}).catch(()=>{})})};a(r),o.splice(0).forEach(r)}).catch(()=>{})},configurable:!1,enumerable:!1}),window.__acrobat_inject_a={token:n}}export{e as injectTransportBridge};