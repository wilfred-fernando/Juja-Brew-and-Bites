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
import{floodgate as t}from"../floodgate.js";import{loggingApi as n}from"../../common/loggingApi.js";import{isSecureIpcSurfaceActive as i,MAIN_WORLD_INJECT_CAPTURE_PATH as e}from"./module.js";const o="linkedin-inject-hook",r=["https://www.linkedin.com/*"];let c=null;async function s(){return c||(c=(async()=>{try{const n=await async function(){const n=await t.hasFlag("dc-cv-linkedin-chat-pdf-touch-point");return(!!t.getFeatureMeta("dc-cv-linkedin-pdf-touch-point-updated")||n)&&i("linkedin_inject")}(),c=(await chrome.scripting.getRegisteredContentScripts({ids:[o]})).length>0;n&&!c?await chrome.scripting.registerContentScripts([{id:o,matches:r,js:[e,"content_scripts/linkedin/main_world/linkedin-inject-hook.js"],runAt:"document_start",world:"MAIN"}]):!n&&c&&await chrome.scripting.unregisterContentScripts({ids:[o]})}catch(t){n.error({message:"Error toggling linkedin-inject-hook content script",error:t?.message,stack:t?.stack})}finally{c=null}})(),c)}export{s as toggleLinkedinInjectHooks};