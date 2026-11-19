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
import{dcLocalStorage as o}from"../../common/local-storage.js";import{checkForImsSidCookie as e}from"../../common/util.js";import{largeBlobStorage as n}from"../../common/large-blob-storage.js";import{isAcrobatViewerHostPage as t}from"../../common/host-page-context.js";import{isGenAiRoute as r,getSidePanelTabId as s}from"./sidePanelUtil.js";export const supportsPanelTourPositioning=o=>"function"==typeof o?.supports&&o.supports("anchor-name","--panel-tour-support-check")&&o.supports("position-try-fallbacks","flip-block");export const isPanelTourEligible=({isHomeOnboardingEnabled:o,isSidePanelHomeEnabled:e,isHomeRoute:n,homeOnboardingTourShown:r,supportsPanelTourPositioning:s,hostPageType:i})=>{const a=!0===e||"true"===e,l=[void 0,null,"",!1,"false"].includes(r);return!0===o&&a&&!0===n&&!t(i)&&!0===s&&l};export const shouldLogPanelTourUnsupportedBrowser=o=>!0!==o.supportsPanelTourPositioning&&isPanelTourEligible({...o,supportsPanelTourPositioning:!0});export const getGenAiPrerenderState=async(t,i)=>{if(!r(t))return null;const a=await(async()=>{try{const o=s();if(!Number.isFinite(o))return!1;const e=await chrome.tabs.sendMessage(o,{main_op:"hasPendingInitialQuestion"});return!!e?.hasPendingInitialQuestion}catch{return!1}})();if(a)return{showPreRendered:!1,ssrHtml:null,hasPendingPrompt:a};const l=!await e(),u=o.getItem("enableCSSSRForAnon"),p=o.getItem("enableCSSSRForSignedIn"),m=l?!!u:!!p,c=l?"anonGenAISSRHtml":"signedInGenAISSRHtml",d=await n.getItem(c);return{showPreRendered:m&&!!d,ssrHtml:d}};export const shouldShowTrefoilLoader=o=>!o?.showPreRendered;