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
import{SENDER_TIER as e}from"../../common/messaging-constants.js";import{OP as t}from"./op-ids.js";import{classifySender as i}from"../../common/mediation-core.js";const d=new Map;export function isMimeHandlerVerificationCandidate(e){return e?.id===chrome.runtime.id&&e.url?.split("?")[0]===chrome.runtime.getURL("viewer.html")&&Number.isInteger(e.tab?.id)&&"string"==typeof e.documentId&&e.documentId.length>0}export function clearMimeHandlerVerificationsForTab(e){d.forEach((t,i)=>{t.tabId===e&&d.delete(i)})}export function verifyNativeMimeHandlerSender(e){if(!isMimeHandlerVerificationCandidate(e))return Promise.resolve(!1);let i=d.get(e.documentId);return i&&i.tabId===e.tab.id||(i={tabId:e.tab.id,verified:!1},d.set(e.documentId,i),i.pending=chrome.tabs.sendMessage(e.tab.id,{main_op:t.VERIFY_MIME_HANDLER_CONTEXT},{documentId:e.documentId}).then(t=>{const n=d.get(e.documentId)===i;return i.verified=n&&!0===t?.isNativeMimeHandler&&t.tabId===e.tab.id,n&&!i.verified&&d.delete(e.documentId),i.verified},t=>{throw d.get(e.documentId)===i&&d.delete(e.documentId),t})),i.pending}export function classify(t){if(isMimeHandlerVerificationCandidate(t)){const i=d.get(t.documentId);if(i?.verified&&i.tabId===t.tab.id)return e.EXTENSION_PAGE_OPENED_DIRECTLY}return i(t,chrome.runtime.id)}