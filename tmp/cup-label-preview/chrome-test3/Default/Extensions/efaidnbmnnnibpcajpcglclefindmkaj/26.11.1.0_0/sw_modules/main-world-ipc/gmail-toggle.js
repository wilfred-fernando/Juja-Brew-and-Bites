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
import{floodgate as t}from"../floodgate.js";import{loggingApi as i}from"../../common/loggingApi.js";import{isSecureIpcSurfaceActive as o,MAIN_WORLD_INJECT_CAPTURE_PATH as a}from"./module.js";const c="gmail-inject-hook",r=["https://mail.google.com/*"];let e=null;async function n(){return e||(e=(async()=>{try{const i=await async function(){const[i,a,c,r,e]=await Promise.all([t.hasFlag("dc-cv-gmail-acrobat-touch-point"),t.hasFlag("dc-cv-gmail-pdftools-touch-point"),t.hasFlag("dc-cv-gmail-implicit-default-viewership"),t.hasFlag("dc-cv-gmail-default-viewership"),t.hasFlag("dc-cv-gmail-convert-to-pdf")]);return(i||a||c||r||e)&&o("gmail_inject")}(),e=(await chrome.scripting.getRegisteredContentScripts({ids:[c]})).length>0;i&&!e?await chrome.scripting.registerContentScripts([{id:c,matches:r,js:[a,"content_scripts/gmail/main_world/gmail-inject-hook.js"],runAt:"document_start",world:"MAIN"}]):!i&&e&&await chrome.scripting.unregisterContentScripts({ids:[c]})}catch(t){i.error({message:"Error toggling gmail-inject-hook content script",error:t?.message,stack:t?.stack})}finally{e=null}})(),e)}export{n as toggleGmailInjectHooks};