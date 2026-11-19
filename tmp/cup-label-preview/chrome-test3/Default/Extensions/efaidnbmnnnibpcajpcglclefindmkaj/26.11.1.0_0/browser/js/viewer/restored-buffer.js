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
import{dcLocalStorage as e}from"../../../common/local-storage.js";import{indexedDBScript as t}from"../../../common/indexDB.js";import{loggingApi as r}from"../../../common/loggingApi.js";import{dcTabStorage as a}from"../tab-storage.js";export async function getRestoredViewerBuffer({isMimeHandled:n,mimeHandlerTabId:o,tabId:m}){let i=m;if(n?i=o:null==i&&(i=(await chrome.tabs.getCurrent())?.id),!Number.isSafeInteger(i)||i<0)return null;const f=e.getItem("tabIdMap"),s=f?.[i];if(!Number.isSafeInteger(s)||s<0)return null;const d=await t.getDataFromIndexedDB(s);if(!d?.fileBuffer)return null;a.setItem("bufferTabId",s),a.setItem("bufferFromIndexedDB",!0);try{const t={...(await e.getItemAsync("tabIdMap")).tabIdMap};t[i]===s&&(delete t[i],Object.keys(t).length?await e.setItemOrThrow("tabIdMap",t):await e.removeItem("tabIdMap"))}catch(e){r.warn({message:"Could not clean up restored viewer buffer mapping"})}return d.fileBuffer}