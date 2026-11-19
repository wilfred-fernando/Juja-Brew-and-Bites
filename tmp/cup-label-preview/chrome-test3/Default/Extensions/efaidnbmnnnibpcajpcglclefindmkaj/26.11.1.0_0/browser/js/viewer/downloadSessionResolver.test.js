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
import{resolveLmsDownloadUrl as e}from"./downloadSessionResolver.js";jest.mock("../tab-storage.js",()=>({dcTabStorage:{setItem:jest.fn()}})),jest.mock("../../../common/loggingApi.js",()=>({loggingApi:{error:jest.fn()}})),describe("LMS viewer download session",()=>{beforeEach(()=>{chrome.runtime.sendMessage=jest.fn().mockResolvedValue({data:{url:"https://campus.instructure.com/files/42/download"}})}),it("resolves the opaque ID through the worker before fetching the private PDF",async()=>{await expect(e("opaque-id")).resolves.toBe("https://campus.instructure.com/files/42/download"),expect(chrome.runtime.sendMessage).toHaveBeenCalledWith({main_op:"get-session",type:"lms-viewer-download",sessionId:"opaque-id"})}),it.each([void 0,null,""])("rejects a missing session ID %p without fetching",async s=>{await expect(e(s)).rejects.toThrow("Missing LMS download session"),expect(chrome.runtime.sendMessage).not.toHaveBeenCalled()}),it.each([null,{},{url:"invalid"},{url:"http://campus.instructure.com/files/42/download"},{url:"https://attacker.example/files/42/download"},{url:"https://campus.instructure.com.attacker.example/files/42/download"},{url:"https://user:password@campus.instructure.com/files/42/download"}])("rejects invalid or expired worker data %p without fetching",async s=>{chrome.runtime.sendMessage.mockResolvedValue({data:s}),await expect(e("opaque-id")).rejects.toThrow("Invalid LMS download session")}),it("surfaces worker failures",async()=>{chrome.runtime.sendMessage.mockRejectedValueOnce(new Error("worker unavailable")),await expect(e("opaque-id")).rejects.toThrow("worker unavailable")})});