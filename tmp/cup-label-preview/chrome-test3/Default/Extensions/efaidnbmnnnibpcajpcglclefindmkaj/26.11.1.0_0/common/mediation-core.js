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
import{OFFSCREEN_DOCUMENT_PATH as e}from"./offscreen-document-path.js";import{SENDER_TIER as t}from"./messaging-constants.js";export function validateSchema(e,t,r=""){const n=e??{},i=t??{},o=r?`${r}.`:"",a=Object.keys(n).find(e=>!Object.prototype.hasOwnProperty.call(i,e));if(void 0!==a)return{valid:!1,reason:`unexpected field: ${o}${a}`};const s=Object.entries(i).find(([e,t])=>{const r=n[e];if(void 0===r)return!!t.required;if(null===r&&!0===t.nullable)return!1;let i;return i=null===r?"null":Array.isArray(r)?"array":typeof r,Array.isArray(t.type)?!t.type.includes(i):i!==t.type});if(void 0!==s){const[e,t]=s;return{valid:!1,reason:void 0===n[e]?`missing required field: ${o}${e}`:`field ${o}${e} expected type ${[].concat(t.type).join("|")}`}}const d=Object.entries(i).filter(([e,t])=>t.schema&&null!==n[e]&&"object"==typeof n[e]&&!Array.isArray(n[e])).map(([e,t])=>validateSchema(n[e],t.schema,`${o}${e}`)).find(e=>!e.valid);return d||{valid:!0}}export function permit(e,t){return t.allowedSenderTiers.includes(e)}export function stripEnvelopeFields(e,t){if(!t||0===t.length)return e;const r={...e};return t.forEach(e=>delete r[e]),r}export function isEndpointPermitted(e,t){if(void 0===e||!t)return!0;return(Array.isArray(t)?t:[t]).includes(e)}export function describeTargetEndpoint(e){return e?Array.isArray(e)?e.join(" or "):e:"unknown"}export function evaluateContract(e,t,r,n,i){const o=permit(t,e),a=!isEndpointPermitted(i,e.targetEndpoint),s=o&&!a,d=s?validateSchema(stripEnvelopeFields(r,n),e.schema):{valid:!1},l=s&&d.valid;let c;return c=o?a?`endpoint mismatch: expected ${describeTargetEndpoint(e.targetEndpoint)}, got ${i}`:d.reason:"sender tier not permitted",{passes:l,reason:c}}export function classifySender(r,n){if(!r)return t.UNKNOWN;if(r.id===n&&!r.tab&&!r.url)return t.SERVICE_WORKER;const i=`chrome-extension://${n}/`;if(r.url&&r.url.startsWith(i)){const n=r.url.split("?")[0];return n===`${i}${e}`?t.OFFSCREEN:n===`${i}service-worker.js`?t.SERVICE_WORKER:!r.tab||r.tab.url&&r.tab.url.startsWith(i)?t.EXTENSION_PAGE_OPENED_DIRECTLY:t.EXTENSION_PAGE_EMBEDDED_IN_FOREIGN_TAB}return r.tab?r.id===n?t.CONTENT_SCRIPT:t.EXTERNAL:r.id&&r.id!==n?t.EXTERNAL:t.UNKNOWN}