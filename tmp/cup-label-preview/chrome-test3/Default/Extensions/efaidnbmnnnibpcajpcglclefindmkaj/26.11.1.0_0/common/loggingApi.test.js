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
const e={};jest.mock("./local-storage.js",()=>({dcLocalStorage:{getItem:t=>e[t],setItem:(t,o)=>{e[t]=o},removeItem:t=>{delete e[t]}}})),jest.mock("../sw_modules/floodgate.js",()=>({floodgate:{hasFlag:jest.fn().mockResolvedValue(!0)}})),jest.mock("../sw_modules/splunkAllowedLogs.js",()=>({allowedLogs:{}})),jest.mock("../sw_modules/util.js",()=>({util:{uuid:()=>"request-id"}})),jest.mock("./experimentUtils.js",()=>({getActiveExperimentAnalyticsString:()=>""})),jest.mock("./splunkAllowedEvents.js",()=>({isEventAllowed:()=>!0}));const{loggingApi:t}=require("./loggingApi.js"),{URL_MASK:o}=require("./log-url-mask.js");describe("loggingApi URL masking",()=>{beforeEach(()=>{Object.keys(e).forEach(t=>{delete e[t]}),e.disableLogWhitelisting=!0,e.anonUserUUID="anon-id",global.fetch=jest.fn().mockResolvedValue({})}),it("masks URLs in every flattened field of the Splunk payload",async()=>{const e={message:"Error executing direct verb",error:'Cannot access contents of url "https://www.bing.com/search?q=secret".',url:"https://evil.com/report.pdf?X-Amz-Signature=abc",adobeUrl:"https://acrobat.adobe.com/link/review?uri=abc",details:{sourceTabUrl:"https://mail.example.com/inbox/123"}};t.error(e),await new Promise(e=>{setTimeout(e,0)}),t.flushLogs();const[,s]=global.fetch.mock.calls[0];expect(JSON.parse(s.body)).toEqual([{message:"Error executing direct verb",context:"logger",error:`Cannot access contents of url "https://www.bing.com/${o}".`,url:`https://evil.com/${o}`,adobeUrl:`https://acrobat.adobe.com/${o}`,sourceTabUrl:`https://mail.example.com/${o}`,level:"error",variants:"",anonUserUUID:"anon-id"}]),expect(e.url).toBe("https://evil.com/report.pdf?X-Amz-Signature=abc")})});