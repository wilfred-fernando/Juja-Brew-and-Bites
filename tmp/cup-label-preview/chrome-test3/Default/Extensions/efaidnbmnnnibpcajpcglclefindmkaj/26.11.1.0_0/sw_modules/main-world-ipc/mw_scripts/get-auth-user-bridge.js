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
function t(t){const n=window.__acrobat_inject_capture;if(!n)return;const e=window._docs_flag_initialData?.gaia_session_id;e&&n.importKey("raw",new Uint8Array(t),{name:"AES-GCM"},!1,["encrypt"]).then(t=>{const r=n.getRandomValues(new Uint8Array(12)),a=n.encodeUtf8(n.stringify({authuser:e}));return n.encrypt({name:"AES-GCM",iv:r},t,a).then(t=>{n.dispatchEvent(new n.CustomEvent("acrobat-gdrive-auth-user-ipc",{detail:{iv:Array.from(r),ciphertext:Array.from(new Uint8Array(t))}}))})}).catch(()=>{})}export{t as getAuthUserBridgeFunc};