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
import e from"fs";import t from"path";import{TextEncoder as n}from"util";import{injectTransportBridge as r}from"./mw_scripts/inject-transport-bridge.js";import{MAIN_WORLD_INJECT_FUNCS as o}from"./registry.js";global.TextEncoder=n;const i=e.readFileSync(t.resolve(__dirname,"../../content_scripts/shared/main-world-inject-capture.js"),"utf8"),c=["gdrive_inject","gmail_inject","gemini_inject","gdocs_inject","linkedin_inject","chatgpt_inject"];describe("MAIN_WORLD_INJECT_FUNCS registry",()=>{it.each(c)("maps %s to the shared transport",e=>{expect(o[e].func).toBe(r)})}),describe("injectTransportBridge handshake",()=>{const e=[1,2,3,4,5,6,7,8],t={importKey:jest.fn(async()=>({})),encrypt:jest.fn(async()=>new Uint8Array([9,9,9]).buffer)};let n;beforeAll(()=>{Object.defineProperty(window,"crypto",{configurable:!0,value:{getRandomValues:e=>e,randomUUID:()=>"11111111-2222-4333-8444-555555555555",subtle:t}}),new Function(i)(),Object.defineProperty(window,"__acrobat_inject_a",{configurable:!0,set(e){n.hookSawToken=e.token,window.__acrobat_inject_b={token:e.token,buffer:[{eventType:"buffered-event",detail:{n:1}}],setActiveSend(e){n.send=e}}}})}),beforeEach(()=>{n={},jest.clearAllMocks()}),it("freezes the captured primitives on a non-writable window property",()=>{const e=Object.getOwnPropertyDescriptor(window,"__acrobat_inject_capture");expect(e.writable).toBe(!1),expect(e.configurable).toBe(!1),expect(Object.isFrozen(window.__acrobat_inject_capture)).toBe(!0)}),it("installs the encrypted sender once the token matches",async()=>{r(e),expect(typeof n.hookSawToken).toBe("string"),expect(n.hookSawToken).toBe("11111111-2222-4333-8444-555555555555"),await new Promise(e=>{setTimeout(e,0)}),expect(typeof n.send).toBe("function"),expect(t.importKey).toHaveBeenCalledWith("raw",new Uint8Array(e),{name:"AES-GCM"},!1,["encrypt"])})});