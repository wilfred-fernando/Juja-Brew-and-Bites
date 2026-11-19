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
import{listRegisteredContracts as e}from"../../common/message-registry.js";import{BUS as o}from"../../common/messaging-constants.js";const s=e(),t=s.filter(e=>e.bus===o.RUNTIME_MESSAGE&&"offscreen"===e.targetEndpoint),r=["offscreen-cdn","offscreen-ims","offscreen-ssr"];export const offscreenPostContracts=Object.freeze(s.filter(e=>e.bus===o.POST_MESSAGE&&r.includes(e.targetEndpoint)));export const offscreenRuntimeContracts=Object.freeze(t.filter(e=>"createIframeToLoadAjsWorker"!==e.op));export const offscreenRuntimeOps=Object.freeze(t.map(e=>e.op));function n(e,o="main_op"){return Object.freeze(offscreenPostContracts.filter(s=>s.targetEndpoint===e&&s.discriminatorField===o).map(e=>e.op))}export const offscreenCDNPostOps=n("offscreen-cdn");export const offscreenImsPostOps=n("offscreen-ims");export const offscreenSSRPostOps=n("offscreen-ssr");export const offscreenLegacyPostTypes=n("offscreen-cdn","type");