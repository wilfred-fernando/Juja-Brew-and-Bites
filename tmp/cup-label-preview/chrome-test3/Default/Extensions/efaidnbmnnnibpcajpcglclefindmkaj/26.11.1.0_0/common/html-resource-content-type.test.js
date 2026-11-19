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
import{assertResourceContentType as e,validateResourceResponse as t}from"./html-resource-content-type.js";describe("HTML extraction resource content types",()=>{beforeEach(()=>{jest.spyOn(console,"error").mockImplementation(()=>{})}),afterEach(()=>{jest.restoreAllMocks()}),it.each([["text/css","css"],[" Text/CSS ; charset=UTF-8","css"],["image/png","image"],["image/svg+xml","image"],["image/vnd.microsoft.icon","image"],["image/jxl","image"],["image/heic","image"],[' Image/Vnd.Adobe.Photoshop ; name="preview,large.psd"',"image"],["image/unknown","image"],["font/woff2","font"],["font/collection","font"],["font/sfnt","font"],[" FONT/X-Custom+Compressed ; version=1","font"],["application/font-woff","font"],["application/vnd.ms-fontobject","font"],['text/css; name="styles,print.css"',"css"],['image/png; name="image\\",preview.png"',"image"]])("accepts %s for %s",(t,o)=>{expect(()=>e(t,o)).not.toThrow(),expect(console.error).not.toHaveBeenCalled()}),it.each([[null,"css"],["","image"],["text/html","css"],["application/json","image"],["text/css-malicious","css"],["text/css","image"],["image/png","css"],["font/woff2","image"],["image/png","font"],["application/octet-stream","font"],["image/*","image"],["font/*","font"],["image/","image"],["font/","font"],["image/png/extra","image"],["image/png text/html","image"],["image/p*ng","image"],["application/x-custom","font"],["image/png, text/html","image"],["image/png; charset=utf-8, text/html","image"],['image/png; name="image,preview.png", text/html',"image"],['image/png; name="image\\",preview.png", text/html',"image"],["text/css; charset=utf-8, application/json","css"],["font/woff2; charset=utf-8, text/html","font"],['image/png; name="unterminated, text/html',"image"]])("rejects %s for %s",(t,o)=>{expect(()=>e(t,o)).toThrow("Unexpected Content-Type")}),it.each([['application/json; account="private@example.com"',"image","application/json"],['text/html; name="secret"',"font","text/html"],[null,"css","<missing>"]])("logs the rejected %s response for %s without header parameters",(t,o,a)=>{expect(()=>e(t,o)).toThrow();const n=`Unsupported Content-Type for ${o} resource: received ${a}`;expect(console.error).toHaveBeenCalledWith(n)}),it("rejects an error response even when its MIME type matches",()=>{const e={ok:!1,status:403,headers:{get:()=>"image/png"}};expect(()=>t(e,"image")).toThrow("HTTP 403")})});