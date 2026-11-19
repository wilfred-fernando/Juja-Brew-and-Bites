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
import{dcLocalStorage as e}from"./local-storage.js";beforeEach(()=>{e.storage={},e.storageApi.set.mockReset(),e.storageApi.set.mockResolvedValue(void 0),jest.spyOn(e,"logQuotaError").mockResolvedValue(void 0)}),afterEach(()=>{jest.restoreAllMocks()}),test("setItemOrThrow persists the handoff before publishing it in the cache",async()=>{e.storageApi.set.mockImplementation(async()=>{expect(e.getItem("tabIdMap")).toBe("")}),await e.setItemOrThrow("tabIdMap",{101:1}),expect(e.storageApi.set).toHaveBeenCalledWith({tabIdMap:{101:1}}),expect(e.getItem("tabIdMap")).toEqual({101:1})}),test("setItemOrThrow rejects failed persistence without changing the cache",async()=>{e.storage.tabIdMap={100:5},e.storageApi.set.mockRejectedValue(new Error("quota")),await expect(e.setItemOrThrow("tabIdMap",{101:1})).rejects.toThrow("quota"),expect(e.getItem("tabIdMap")).toEqual({100:5}),expect(e.logQuotaError).toHaveBeenCalledWith("tabIdMap",expect.any(String))}),test("legacy setItem callers retain the non-throwing contract",async()=>{e.storageApi.set.mockRejectedValue(new Error("quota")),await expect(e.setItem("existing-key","value")).resolves.toBeUndefined()});