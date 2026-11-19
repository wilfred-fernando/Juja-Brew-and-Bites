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
import{floodgate as e}from"../floodgate.js";import{toggleGmailInjectHooks as t}from"./gmail-toggle.js";jest.mock("../floodgate.js",()=>({floodgate:{hasFlag:jest.fn(),getFeatureMeta:jest.fn(()=>JSON.stringify({surfaces:["gmail_inject"]}))}})),jest.mock("../../common/loggingApi.js",()=>({loggingApi:{error:jest.fn()}})),describe("toggleGmailInjectHooks eligibility",()=>{beforeEach(()=>{global.chrome={scripting:{getRegisteredContentScripts:jest.fn(async()=>[]),registerContentScripts:jest.fn(async()=>{}),unregisterContentScripts:jest.fn(async()=>{})}}}),it("registers the hook when only the convert-to-PDF flag is enabled",async()=>{e.hasFlag.mockImplementation(async e=>"dc-cv-main-world-script-ab-ipc"===e||"dc-cv-gmail-convert-to-pdf"===e),await t(),expect(global.chrome.scripting.registerContentScripts).toHaveBeenCalledWith([expect.objectContaining({id:"gmail-inject-hook"})])}),it("does not register the hook when the master secure-IPC flag is off",async()=>{e.hasFlag.mockImplementation(async e=>"dc-cv-gmail-convert-to-pdf"===e),await t(),expect(global.chrome.scripting.registerContentScripts).not.toHaveBeenCalled()}),it("does not register the hook when no Gmail feature flag is enabled",async()=>{e.hasFlag.mockResolvedValue(!1),await t(),expect(global.chrome.scripting.registerContentScripts).not.toHaveBeenCalled()})});