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
import e from"fs";import t from"path";import{TextEncoder as n}from"util";import{getAuthUserBridgeFunc as r}from"./get-auth-user-bridge.js";global.TextEncoder=n;const o=e.readFileSync(t.resolve(__dirname,"../../../content_scripts/shared/main-world-inject-capture.js"),"utf8"),i=[1,2,3,4,5,6,7,8];function a(){const e={importKey:jest.fn(async()=>({})),encrypt:jest.fn(async()=>new Uint8Array([9,9,9]).buffer)};return Object.defineProperty(window,"crypto",{configurable:!0,value:{getRandomValues:e=>e,randomUUID:()=>"11111111-2222-4333-8444-555555555555",subtle:e}}),e}describe("getAuthUserBridgeFunc",()=>{it("does nothing when the crypto prelude was not registered",async()=>{const e=a();window._docs_flag_initialData={gaia_session_id:"42"},r(i),await new Promise(e=>{setTimeout(e,0)}),expect(e.importKey).not.toHaveBeenCalled()}),it("re-running the prelude keeps the first frozen capture",()=>{a(),new Function(o)();const e=window.__acrobat_inject_capture;expect(()=>new Function(o)()).not.toThrow(),expect(window.__acrobat_inject_capture).toBe(e)})});