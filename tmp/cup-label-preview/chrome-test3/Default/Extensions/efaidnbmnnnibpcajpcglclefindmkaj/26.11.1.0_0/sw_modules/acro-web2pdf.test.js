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
import{acroweb2pdf as e}from"./acro-web2pdf.js";jest.mock("./util.js",()=>({util:{}})),jest.mock("./communicate.js",()=>({communicate:{registerModule:jest.fn(),registerHandlers:jest.fn()}})),jest.mock("./proxy.js",()=>({Proxy:{proxy(e){return e.bind(this)},handlers:jest.fn()}})),describe("HTML extraction background resource fetch",()=>{beforeEach(()=>{jest.spyOn(console,"error").mockImplementation(()=>{})}),afterEach(()=>{jest.restoreAllMocks(),delete global.fetch}),it.each([[!0,"text/css"],[!0,"application/json"],[!1,"image/png"],[!1,"text/css-invalid"],[!1,null],[!0,"image/png; charset=utf-8, text/html"],[!1,'text/css; name="styles,print.css", application/json']])("rejects isBlob=%s with Content-Type %s before reading the body",async(t,s)=>{const a={ok:!0,headers:{get:()=>s},text:jest.fn(),blob:jest.fn()};global.fetch=jest.fn().mockResolvedValue(a);const o=await new Promise(s=>{e.fetchResource({url:"https://example.com/resource",isBlob:t},{tab:{url:"https://example.com"}},s)});expect(o.success).toBe(!1),expect(a.text).not.toHaveBeenCalled(),expect(a.blob).not.toHaveBeenCalled()}),it("returns a valid stylesheet with MIME parameters",async()=>{global.fetch=jest.fn().mockResolvedValue({ok:!0,headers:{get:()=>"Text/CSS; charset=utf-8"},text:async()=>"p { color: red; }"});const t=await new Promise(t=>{e.fetchResource({url:"https://example.com/styles.css",isBlob:!1},{tab:{url:"https://example.com"}},t)});expect(t).toEqual({success:!0,data:"p { color: red; }"})}),it.each(["image/png","image/jxl"])("returns a valid %s image data URL",async t=>{const s=new Blob(["image"],{type:t});global.fetch=jest.fn().mockResolvedValue({ok:!0,headers:{get:()=>t},blob:async()=>s}),jest.spyOn(FileReader.prototype,"readAsDataURL").mockImplementation(function(){Object.defineProperty(this,"result",{value:`data:${t};base64,aW1hZ2U=`}),this.onloadend()});const a=await new Promise(t=>{e.fetchResource({url:"https://example.com/image.png",isBlob:!0},{tab:{url:"https://example.com"}},t)});expect(a).toEqual({success:!0,data:`data:${t};base64,aW1hZ2U=`})})});