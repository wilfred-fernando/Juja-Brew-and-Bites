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
import{setImmediate as t}from"timers";import{getContract as e,listRegisteredContracts as o}from"../../common/message-registry.js";export function receiverOperations(t,i,n){return o().filter(o=>e(o.op,i,t,n)===o).map(t=>t.op)}export async function warmRuntimePolicy(e,o,i,n={},r={id:"id"}){window.acrobatExtensionMessaging.wrapContentScriptListener(e,()=>{},{endpoint:i})({[e]:o,...n},r,()=>{}),await new Promise(e=>t(e))}export async function warmPostPolicy(e,o,i,n={}){const r="https://trusted.example.com";window.acrobatExtensionMessaging.wrapPostMessageListener(e,r,()=>{},{endpoint:i})({origin:r,data:{[e]:o,...n}}),await new Promise(e=>t(e))}