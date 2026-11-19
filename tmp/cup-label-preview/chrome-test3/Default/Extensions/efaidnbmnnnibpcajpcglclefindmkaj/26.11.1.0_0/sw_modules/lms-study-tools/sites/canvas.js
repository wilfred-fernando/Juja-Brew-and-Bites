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
function n(n){return"https:"===n.protocol&&n.hostname.endsWith(".instructure.com")}export function canvasOrigin(o){try{const e=new URL(o?.url),a=new URL(o?.tab?.url);return o.id!==chrome.runtime.id||0!==o.frameId||!Number.isInteger(o.tab.id)||!n(e)||e.origin!==a.origin||o.origin&&o.origin!==e.origin?null:e.origin}catch{return null}}const o=n=>"string"==typeof n&&/^[1-9]\d{0,19}$/.test(n);export const canvasSite={id:"canvas",preferenceKey:"acrobat-touch-point-in-canvas",arms:[{key:"control",flag:"dc-cv-canvas-file-touchpoint-control",code:"CVSC",action:null},{key:"challenger1",flag:"dc-cv-canvas-file-touchpoint-quiz",code:"CVSQ",action:"quiz"},{key:"challenger2",flag:"dc-cv-canvas-file-touchpoint-flashcards",code:"CVSF",action:"flashcards"}],surfaces:{actionsMenu:"ExtensionCanvasActionsMenu",pdfPreviewToolbar:"ExtensionCanvasPdfPreview"},analyticsPrefix:"DCBrowserExt:Canvas:StudyTools",analyticsSource:"canvas_chrome",workflowPrefix:"canvas_study_tools_",title:"Canvas PDF",defaultFileName:"Canvas.pdf",promotionSource:"canvas_chrome-native_view",getOrigin:canvasOrigin,isValidFileId:o,getDownloadUrl(e,a){const t=new URL(e);if(!n(t)||t.origin!==e||!o(a))throw new Error("not_allowed");return new URL(`/files/${a}/download`,e).href},allowsDownloadUrl:(o,e)=>"https:"===o.protocol&&(o.origin===e||n(o)||o.hostname.endsWith(".inscloudgate.net"))};