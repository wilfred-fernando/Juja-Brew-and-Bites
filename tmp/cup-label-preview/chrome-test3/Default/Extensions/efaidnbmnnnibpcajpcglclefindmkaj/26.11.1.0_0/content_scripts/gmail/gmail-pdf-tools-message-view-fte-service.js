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
import{sendAnalytics,sendErrorLog}from"../utils/util.js";import{createFteTooltip,addFteCloseButtonListener,updateFteToolTipCoolDown}from"../utils/fte-utils.js";import state from"./state.js";const SOURCE="gmail_chrome",GMAIL_PDF_TOOLS_MESSAGE_VIEW_WORKFLOW="gmail_acrobat_tools_dialog",MESSAGE_VIEW_FTE_STORAGE_KEY="ac-gm-acrobat-tools-fte",FTE_TYPE="gmailAcrobatTools",ALWAYS_THROTTLE_CONFIG={frequency:"always"};export const addFte=async()=>{try{const o=state?.gmailAcrobatToolsFteState?.ctaContainerForFTE;if(!o)return;const t=state?.gmailAcrobatToolsConfig,e=t?.fteTooltipStrings||{},s=createFteTooltip({title:e.title,description:e.description,button:e.button},FTE_TYPE),a=()=>{s.remove(),s.keepAliveObserver?.disconnect(),s.clickOutsideHandler&&document.removeEventListener("click",s.clickOutsideHandler,!0),s.keydownHandler&&document.removeEventListener("keydown",s.keydownHandler,!0)};s.dismiss=a,s.clickOutsideHandler=o=>{s.contains(o.target)||(a(),sendAnalytics([["DCBrowserExt:AcrobatTools:Fte:Dismissed",{source:SOURCE,workflow:"gmail_acrobat_tools_dialog"},ALWAYS_THROTTLE_CONFIG]]))},s.keydownHandler=t=>{const e=("Enter"===t.key||" "===t.key)&&"pdf-tools-button-shadow-host"===t.target?.id&&o.contains(t.target);("Escape"===t.key||e)&&(a(),sendAnalytics([["DCBrowserExt:AcrobatTools:Fte:Dismissed",{source:SOURCE,workflow:"gmail_acrobat_tools_dialog"},ALWAYS_THROTTLE_CONFIG]]))},addFteCloseButtonListener(s,{fteType:FTE_TYPE,onClose:()=>{a(),sendAnalytics([["DCBrowserExt:AcrobatTools:Fte:Closed",{source:SOURCE,workflow:"gmail_acrobat_tools_dialog"},ALWAYS_THROTTLE_CONFIG]])},sendErrorLog:sendErrorLog}),document.addEventListener("click",s.clickOutsideHandler,!0),document.addEventListener("keydown",s.keydownHandler,!0),o.appendChild(s),sendAnalytics([["DCBrowserExt:AcrobatTools:Fte:Shown",{source:SOURCE,workflow:"gmail_acrobat_tools_dialog"},ALWAYS_THROTTLE_CONFIG]]),await updateFteToolTipCoolDown(t?.fteConfig?.tooltip,"ac-gm-acrobat-tools-fte")}catch(o){sendErrorLog("GmailPdfToolsMessageViewFte","Failure in adding FTE to PDF tools message view")}finally{state?.gmailAcrobatToolsFteState&&(state.gmailAcrobatToolsFteState.ctaContainerForFTE=null)}};