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
jest.mock("../common/local-storage.js",()=>({dcLocalStorage:{}})),describe("extension installation lookup",()=>{let e,t,a;beforeEach(()=>{jest.useFakeTimers(),a=chrome.management.getSelf,t=jest.fn(),chrome.management.getSelf=t,jest.isolateModules(()=>{e=jest.requireActual("./util.js").util})}),afterEach(()=>{chrome.management.getSelf=a,delete chrome.runtime.lastError,jest.useRealTimers()}),it("coalesces concurrent policy lookups and reuses the result",async()=>{const a=e.isDevEnv(),o=e.isDevEnv();expect(t).toHaveBeenCalledTimes(1),t.mock.calls[0][0]({installType:"development"}),expect(await a).toBe(!0),expect(await o).toBe(!0),expect(await e.isDevEnv()).toBe(!0),expect(t).toHaveBeenCalledTimes(1),expect(jest.getTimerCount()).toBe(0)}),it.each(["normal","admin","sideload","other"])("does not classify %s as development",async a=>{t.mockImplementation(e=>e({installType:a})),expect(await e.isDevEnv()).toBe(!1)}),it("rejects browser errors and retries instead of pinning a failed lookup",async()=>{t.mockImplementationOnce(e=>{chrome.runtime.lastError={message:"unavailable"},e(),delete chrome.runtime.lastError}),await expect(e.isDevEnv()).rejects.toThrow("unavailable"),t.mockImplementation(e=>e({installType:"development"})),expect(await e.isDevEnv()).toBe(!0),expect(t).toHaveBeenCalledTimes(2),expect(jest.getTimerCount()).toBe(0)}),it("rejects invalid browser responses rather than guessing the installation type",async()=>{t.mockImplementation(e=>e({})),await expect(e.isDevEnv()).rejects.toThrow("Missing extension installation type"),expect(jest.getTimerCount()).toBe(0)}),it("bounds a stalled lookup and does not let a late callback overwrite a retry",async()=>{const a=e.isDevEnv(),o=expect(a).rejects.toThrow("Extension installation lookup timed out");jest.advanceTimersByTime(5e3),await o;const s=e.isDevEnv();t.mock.calls[0][0]({installType:"development"}),t.mock.calls[1][0]({installType:"normal"}),expect(await s).toBe(!1),expect(await e.isDevEnv()).toBe(!1),expect(t).toHaveBeenCalledTimes(2)}),it("surfaces synchronous API failures and clears their timeout",async()=>{t.mockImplementation(()=>{throw new Error("API failure")}),await expect(e.isDevEnv()).rejects.toThrow("API failure"),expect(jest.getTimerCount()).toBe(0)})});