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
import{getContract as e}from"../../common/message-registry.js";import{MODE as o,DECISION as n,CLASSIFIABLE_BUSES as t,FIXED_TIER_BUSES as r}from"../../common/messaging-constants.js";import{evaluateContract as s,describeTargetEndpoint as i}from"../../common/mediation-core.js";import{classify as d}from"./sender-tier.js";function c(e,o){return t.includes(e)?d(o):r[e]??"unknown"}export function mediateResolvedMode({busId:e,op:t,contract:r,mode:d,request:a,sender:m,envelopeFields:p,endpoint:u,reportRejectionFn:l,tier:R}){if(!r||d===o.UNMIGRATED)return{decision:n.UNMIGRATED};const E=R??c(e,m),{passes:I,reason:M}=s(r,E,a,p,u);return I||l({bus:e,op:t,tier:E??null,endpoint:u??i(r.targetEndpoint),reason:M,timestamp:Date.now()}),d===o.DARK_LAUNCH?{decision:n.DARK_LAUNCH_PASS}:I?{decision:n.PERMITTED}:{decision:n.REJECTED,reason:M}}export async function mediate({busId:t,op:r,envelopeFields:s,request:i,sender:d,endpoint:a,discriminatorField:m,resolveModeFn:p,reportRejectionFn:u,onModeResolved:l}){const R=e(r,m,t,a)??e(r,m,t);if(!R)return{decision:n.UNMIGRATED};const E=await p(t,r);return l?.(E),E===o.UNMIGRATED?{decision:n.UNMIGRATED}:mediateResolvedMode({busId:t,op:r,contract:R,mode:E,request:i,sender:d,envelopeFields:s,endpoint:a,reportRejectionFn:u,tier:await c(t,d)})}export async function snapshot(n,{resolveModeFn:t}){return Promise.all(n.map(async({busId:n,op:r,discriminatorField:s,endpoint:i})=>{const d=e(r,s,n,i)??e(r,s,n);if(!d||d.bus!==n)return{busId:n,op:r,mode:o.UNMIGRATED,contract:null};const{allowedSenderTiers:c,schema:a,targetEndpoint:m}=d;return{busId:n,op:r,mode:await t(n,r),contract:{allowedSenderTiers:c,schema:a,targetEndpoint:m}}}))}