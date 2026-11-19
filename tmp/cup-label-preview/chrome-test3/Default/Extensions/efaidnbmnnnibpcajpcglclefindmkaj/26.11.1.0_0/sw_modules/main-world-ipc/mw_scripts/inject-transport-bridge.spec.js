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
import e from"fs";import t from"path";import{TextEncoder as n}from"util";import{injectTransportBridge as o}from"./inject-transport-bridge.js";global.TextEncoder=n;const r=e.readFileSync(t.resolve(__dirname,"../../../content_scripts/shared/main-world-inject-capture.js"),"utf8");describe("injectTransportBridge with a mismatched echoed token",()=>{it("does not import the key or install a sender",async()=>{const e={importKey:jest.fn(async()=>({})),encrypt:jest.fn()};let t;Object.defineProperty(window,"crypto",{configurable:!0,value:{getRandomValues:e=>e,randomUUID:()=>"11111111-2222-4333-8444-555555555555",subtle:e}}),new Function(r)(),Object.defineProperty(window,"__acrobat_inject_a",{configurable:!0,set(){window.__acrobat_inject_b={token:"not-the-handshake-token",buffer:[],setActiveSend(e){t=e}}}}),o([1,2,3,4,5,6,7,8]),await new Promise(e=>{setTimeout(e,0)}),expect(e.importKey).not.toHaveBeenCalled(),expect(t).toBeUndefined()})});