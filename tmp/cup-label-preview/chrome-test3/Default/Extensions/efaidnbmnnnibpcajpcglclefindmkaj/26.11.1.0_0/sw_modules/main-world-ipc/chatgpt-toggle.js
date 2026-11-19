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
import{floodgate as t}from"../floodgate.js";import{loggingApi as r}from"../../common/loggingApi.js";import{isSecureIpcSurfaceActive as e,MAIN_WORLD_INJECT_CAPTURE_PATH as c}from"./module.js";const n="chatgpt-inject-hook",o=["https://chatgpt.com/*"];let s=null;async function i(){return s||(s=(async()=>{try{const r=await async function(){return await t.hasFlag("dc-cv-express-chatgpt-connected-app-moderation")&&e("chatgpt_inject")}(),s=(await chrome.scripting.getRegisteredContentScripts({ids:[n]})).length>0;r&&!s?await chrome.scripting.registerContentScripts([{id:n,matches:o,js:[c,"content_scripts/express/express_chatgpt/main_world/chatgpt-inject-hook.js"],runAt:"document_start",world:"MAIN"}]):!r&&s&&await chrome.scripting.unregisterContentScripts({ids:[n]})}catch(t){r.error({message:"Error toggling chatgpt-inject-hook content script",error:t?.message,stack:t?.stack})}finally{s=null}})(),s)}export{i as toggleChatgptInjectHooks};