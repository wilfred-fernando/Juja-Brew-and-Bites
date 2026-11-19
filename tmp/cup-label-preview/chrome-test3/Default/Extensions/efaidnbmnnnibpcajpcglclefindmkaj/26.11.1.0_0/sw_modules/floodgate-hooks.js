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
import{toggleExpressTouchpoints as o}from"./express/express-context-menu.js";import{toggleAddWebpageToProjectContextMenu as r}from"./add-webpage-to-project.js";import{toggleOutlookInjectContentScript as e}from"./outlook-module.js";import{toggleGdriveInjectHooks as m}from"./main-world-ipc/gdrive-toggle.js";import{toggleGmailInjectHooks as t}from"./main-world-ipc/gmail-toggle.js";import{toggleGeminiInjectHooks as i}from"./main-world-ipc/gemini-toggle.js";import{toggleLinkedinInjectHooks as p}from"./main-world-ipc/linkedin-toggle.js";import{toggleGdocsInjectHooks as l}from"./main-world-ipc/gdocs-toggle.js";import{toggleChatgptInjectHooks as s}from"./main-world-ipc/chatgpt-toggle.js";import{viewerModuleUtils as g}from"./viewer-module-utils.js";import{communicate as d}from"./communicate.js";import{initForceUpdateAlarm as a}from"./force_updater/force-update.js";import{registerFloodgateHooks as f}from"./floodgate.js";import{updateLightweightEmbeddedViewerCanEmbed as n}from"./lightweight-pdf-viewer-module.js";export const floodgateHooks={onFloodgateCallCompleted(){o(),r(),e(),m(),a(),t(),i(),l(),p(),s(),n()},onViewerFloodgateResponse(){g.updateVariables(d.version),n()}};f(floodgateHooks);