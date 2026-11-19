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
import{createTouchpointInit as t}from"./touchpoint-init-factory.js";import{TOUCHPOINT_REGISTRY as e}from"./touchpoint-registry.js";import{CACHE_PURGE_SCHEME as o}from"../constant.js";import{floodgate as r}from"../floodgate.js";import{target as n,getOfferData as a}from"../target.js";import{removeExperimentCodeForAnalytics as i,setExperimentCodeForAnalytics as f}from"../../common/experimentUtils.js";import{loggingApi as s}from"../../common/loggingApi.js";const m=Symbol("target-timed-out");export async function touchpointInitDispatch(o,r){try{if(e[o]){const e=t(o);await e(r)}else r({enabled:!1,state:"Error",error:`Unknown touchpoint: ${o}`})}catch(t){r({enabled:!1,state:"Error",error:t.message})}}function c(t,e){if(!t)return;const o=!0===e?.enable,r=!1===e?.enable;o?f(t.treatment):i(t.treatment),r?f(t.control):i(t.control)}export async function touchpointTargetOfferDispatch(t,i){try{const f=e[t];if(!f?.targetMbox||!await r.hasFlag(f.treatmentFlag,o.NO_CALL))return c(f?.targetExperimentCodes,null),void i({offer:null});let l;const g=new Promise(t=>{l=setTimeout(()=>t(m),5e3)}),u=await Promise.race([n.getTargetOffer([f.targetMbox]),g]);if(clearTimeout(l),u===m)return s.warn({context:"TouchPoint Target offer",message:`Target offer lookup timed out after 5000ms for ${t}`}),c(f.targetExperimentCodes,null),void i({offer:null});const p=a(u,f.targetMbox)||null;c(f.targetExperimentCodes,p),i({offer:p})}catch(o){s.warn({context:"TouchPoint Target offer",message:`Target offer lookup failed for ${t}`,error:o?.message||String(o)}),c(e[t]?.targetExperimentCodes,null),i({offer:null})}}