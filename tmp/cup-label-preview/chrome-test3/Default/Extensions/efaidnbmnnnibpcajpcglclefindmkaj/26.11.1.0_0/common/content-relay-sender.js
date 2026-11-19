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
export function isTrustedContentRelayPage(e){const r=`chrome-extension://${chrome.runtime.id}/`,t=e?.url?.split("?")[0];return e?.id===chrome.runtime.id&&Number.isInteger(e.tab?.id)&&e.tab.id>=0&&[`${r}browser/js/searchWidget.html`,`${r}browser/js/frameUI.html`].includes(t)}