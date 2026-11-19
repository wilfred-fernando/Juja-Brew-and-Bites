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
!function(){if(window.__acrobat_inject_capture)return;const e=crypto.subtle,t=new TextEncoder,n={importKey:e.importKey.bind(e),encrypt:e.encrypt.bind(e),getRandomValues:crypto.getRandomValues.bind(crypto),randomUUID:crypto.randomUUID.bind(crypto),dispatchEvent:document.dispatchEvent.bind(document),CustomEvent:CustomEvent,stringify:JSON.stringify.bind(JSON),encodeUtf8:t.encode.bind(t)};Object.defineProperty(window,"__acrobat_inject_capture",{value:Object.freeze(n),writable:!1,configurable:!1,enumerable:!1})}();