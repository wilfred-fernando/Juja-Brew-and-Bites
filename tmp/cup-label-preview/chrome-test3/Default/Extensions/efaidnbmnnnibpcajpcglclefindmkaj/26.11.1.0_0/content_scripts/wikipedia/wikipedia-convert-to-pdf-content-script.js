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
(()=>{let t=null,e=null;!async function(){const o=chrome.runtime.getURL("content_scripts/wikipedia/wikipedia-touchpoint-service.js");if(e=await import(o).catch(()=>null),!e)return;let r;try{r=await chrome.runtime.sendMessage({main_op:"wikipedia-convert-to-pdf-init"})}catch(t){return}if(!r?.enableWikipediaConvertToPdfTouchpoint)return;await e.initTouchpointService(r),e.startInjectionObserver(),t=()=>e.syncStandaloneNav(),window.addEventListener("resize",t),window.acrobatExtensionMessaging.registerContentScriptMessageHandler("content_op",t=>{const o=r;switch(t?.content_op){case"show-direct-verb-toast":o?.convertToPdfToastMessage&&e.showToast(e.TOAST_PROMOTION_SOURCE,o.convertToPdfToastMessage);break;case"update-direct-verb-progress":{const o=e.getTouchpointElement();e.updateProgress(o,t.progress);break}case"reset-direct-verb-cta":e.resetTouchpointState();break;case"show-direct-verb-error-toast":case"show-direct-verb-tab-close-error-toast":{const r=t=>t?.split("#")[0]??"";if(t.sourceTabUrl&&r(t.sourceTabUrl)!==r(window.location.href))break;e.resetTouchpointState();const n="show-direct-verb-tab-close-error-toast"===t.content_op?o?.convertToPdfTabCloseErrorToastMessage:o?.convertToPdfErrorToastMessage;if(!n)break;const s={variant:"error"};o?.tryAgainText&&(s.actionButton={text:o.tryAgainText,className:"acrobat-toast-action-button--link",onClick:()=>e.retryConversion()}),e.showToast(e.TOAST_PROMOTION_SOURCE,n,s);break}}},{endpoint:"wikipedia-content-script"})}()})();