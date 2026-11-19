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
import{floodgate as t}from"../floodgate.js";import{loggingApi as o}from"../../common/loggingApi.js";import{isSecureIpcSurfaceActive as c,MAIN_WORLD_INJECT_CAPTURE_PATH as s}from"./module.js";const e="gdocs-inject-hook",r=["https://docs.google.com/*"];let n=null;async function i(){return n||(n=(async()=>{try{const o=await async function(){const[o,s,e]=await Promise.all([t.hasFlag("dc-cv-google-docs-convert-to-pdf-touch-point"),t.hasFlag("dc-cv-google-sheets-convert-to-pdf-touch-point"),t.hasFlag("dc-cv-google-slides-convert-to-pdf-touch-point")]);return(o||s||e)&&c("gdocs_inject")}(),n=(await chrome.scripting.getRegisteredContentScripts({ids:[e]})).length>0;o&&!n?await chrome.scripting.registerContentScripts([{id:e,matches:r,js:[s,"content_scripts/gdocs/main_world/gdocs-fetch-interceptor-hook.js"],runAt:"document_start",world:"MAIN"}]):!o&&n&&await chrome.scripting.unregisterContentScripts({ids:[e]})}catch(t){o.error({message:"Error toggling gdocs-inject-hook content script",error:t?.message,stack:t?.stack})}finally{n=null}})(),n)}export{i as toggleGdocsInjectHooks};