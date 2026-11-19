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
const t=t=>Math.round(performance.now()-t),e=(t,e)=>`@@@${t}@@@\n${e}`;export const truncateAtWordBoundary=(t,e)=>{if(t.length<=e)return t;const r=t.slice(0,Math.max(e,0)),n=/[\uD800-\uDBFF]$/.test(r)?r.slice(0,-1):r,o=n.search(/\s\S*$/);return o>.9*e?n.slice(0,o):n};export const getTokenCounter=(t,e)=>{const r=t?.measureContextUsage??t?.measureInputUsage;return r?n=>r.call(t,n,{signal:e}):t=>Math.ceil(t.length/4)};export const fitTextToTokenBudget=async(t,e,r,n=3)=>{const o=await r(t);if(o<=e||!Number.isFinite(o)||0===n)return{text:t,tokens:o};const s=Math.floor(t.length*(e/o)*.95);return fitTextToTokenBudget(truncateAtWordBoundary(t,s),e,r,n-1)};export async function buildOnDeviceSummaryPrompt({session:r,text:n,instructions:o,maxPromptTokens:s,signal:a}){if(!s)return{prompt:e(n,o),metrics:{}};const c=performance.now();try{const i=getTokenCounter(r,a),u=await i(e("",o)),p=s-u;if(!Number.isFinite(p)||p<=0)return{prompt:e(n,o),metrics:{}};const m=await fitTextToTokenBudget(n,p,i);return{prompt:e(m.text,o),metrics:{prompt_token_count:u+m.tokens,prompt_truncated:m.text.length<n.length,prompt_preparation_ms:t(c)}}}catch(t){return{prompt:e(n,o),metrics:{prompt_preparation_error:t?.name||"Error"}}}}