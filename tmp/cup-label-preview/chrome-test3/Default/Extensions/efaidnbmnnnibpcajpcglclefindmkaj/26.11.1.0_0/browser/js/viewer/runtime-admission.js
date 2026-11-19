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
import{isTrustedContentRelayPage as e}from"../../../common/content-relay-sender.js";import{classifySender as n}from"../../../common/mediation-core.js";import{SENDER_TIER as o}from"../../../common/messaging-constants.js";export function getAdmittedViewerRuntimeMessage(t,i,r){if(!t||i?.id!==chrome.runtime.id)return null;const m=n(i,chrome.runtime.id);return i.tab||m!==o.SERVICE_WORKER?!Number.isInteger(r)||r<0?null:"relay_to_content"===t.main_op&&"dismiss"===t.content_op&&e(i)&&i.tab.id===r?{main_op:"relay_to_content",content_op:"dismiss"}:"relay_to_content"===t.main_op?null:m===o.EXTENSION_PAGE_OPENED_DIRECTLY&&i.url?.split("?")[0]===`chrome-extension://${chrome.runtime.id}/browser/js/popup.html`&&"viewer_menu"===t.panel_op&&!0===t.reload_in_native&&t.tabId===r?{panel_op:"viewer_menu",reload_in_native:!0,tabId:r}:null:t}