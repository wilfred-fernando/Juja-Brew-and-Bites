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
import{getContract as t}from"../../common/message-registry.js";export function contractView(e,r,c,n,o){const s=t(e,r,c,n);if(!s)throw new Error(`Missing catalog contract: ${c}/${n}/${r}/${e}`);return Object.fromEntries(o.map(t=>[t,s[t]]))}export function contractSchema(e,r,c,n,o=[]){const s=t(e,r,c,n);if(!s)throw new Error(`Missing catalog schema: ${c}/${n}/${r}/${e}`);return o.length?Object.freeze(Object.fromEntries(Object.entries(s.schema).filter(([t])=>!o.includes(t)))):s.schema}