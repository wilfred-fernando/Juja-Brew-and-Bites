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
import{floodgate as e}from"../floodgate.js";import{loggingApi as t}from"../../common/loggingApi.js";import{util as i}from"../util.js";import{isImplicitDefaultViewershipEligible as r}from"../implicit-default-viewership-module.js";import{isExpressMenuEnabled as o}from"../express/express-enablement.js";import{isSecureIpcSurfaceActive as s,MAIN_WORLD_INJECT_CAPTURE_PATH as c}from"./module.js";const n="gdrive-inject-hook",a=["https://drive.google.com/*"];let d=null;async function g(){return d||(d=(async()=>{try{const t=await async function(){const[t,c,n,a,d,g,l]=await Promise.all([e.hasFlag("dc-cv-gdrive-default-viewership"),e.hasFlag("dc-cv-gdrive-implicit-default-viewership"),r("gdrive"),o("gdrive-native-viewer"),e.hasFlag("dc-cv-gdrive-edit-pdf"),e.hasFlag("dc-cv-gdrive-convert-excel-ppt-to-pdf"),e.hasFlag("dc-cv-gdrive-convert-image-word-to-pdf")]),p=i.isAcrobatTouchPointEnabled("acrobat-touch-point-in-gdrive"),m=t||c,v=a?.enableGdriveNativeViewerExpressMenu;return(p||m||n||v||d||g||l)&&s("gdrive_inject")}(),d=(await chrome.scripting.getRegisteredContentScripts({ids:[n]})).length>0;t&&!d?await chrome.scripting.registerContentScripts([{id:n,matches:a,js:[c,"content_scripts/gdrive/main_world/gdrive-inject-hook.js"],runAt:"document_start",world:"MAIN"}]):!t&&d&&await chrome.scripting.unregisterContentScripts({ids:[n]})}catch(e){t.error({message:"Error toggling gdrive-inject-hook content script",error:e?.message,stack:e?.stack})}finally{d=null}})(),d)}export{g as toggleGdriveInjectHooks};