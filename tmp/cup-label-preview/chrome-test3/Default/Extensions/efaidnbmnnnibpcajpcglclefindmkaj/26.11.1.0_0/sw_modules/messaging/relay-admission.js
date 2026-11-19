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
import{loggingApi as e}from"../../common/loggingApi.js";import{isTrustedContentRelayPage as o}from"../../common/content-relay-sender.js";import{SENDER_TIER as t}from"../../common/messaging-constants.js";import{classify as n}from"./sender-tier.js";export function rejectUntrustedContentRelay(r,s){return"relay_to_content"===r?.main_op&&((!o(s)||n(s)!==t.EXTENSION_PAGE_EMBEDDED_IN_FOREIGN_TAB)&&(e.warn({message:"DCBrowserExt:Messaging:Rejected",op:"relay_to_content",reason:"relay requires an allowed embedded page and browser host tab",timestamp:Date.now()}),!0))}