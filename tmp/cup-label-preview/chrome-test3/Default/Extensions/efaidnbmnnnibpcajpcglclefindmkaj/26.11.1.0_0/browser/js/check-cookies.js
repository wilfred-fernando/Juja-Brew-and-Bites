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
import"../../content_scripts/content-script-messaging-gateway.js";(async()=>{const e=document.createElement("iframe");e.id="third-party-cookies-checker-cdn",e.style.display="none";const t=new URL((await chrome.storage.local.get("cdnUrl"))?.cdnUrl??"https://acrobat.adobe.com"),o=(await chrome.storage.local.get("env"))?.env??"prod",n=`${t.origin}${"local-dev"!==o?"/dc-chrome-extension":""}/extn-util.html?cdn_op=checkThirdPartyCookies`;var r;let c;e.src=n;let i=!1;c=window.acrobatExtensionMessaging.wrapPostMessageListener("main_op",e=>e.origin===t.origin,o=>{i||o.origin===t.origin&&"thirdPartyCookiesChecked"===o.data.main_op&&(i=!0,e.remove(),window.removeEventListener("message",c),chrome.tabs.getCurrent(e=>{chrome.tabs.sendMessage(e.id,{content_op:"thirdPartyCookiesChecked",status:o?.data?.thirdPartyCookiesBlocked})}),r&&clearTimeout(r))},{endpoint:"cookie-check:post"}),window.addEventListener("message",c);document.getElementById("Adobe-dc-cookie-check").appendChild(e),r=setTimeout(()=>{i=!0;try{document.getElementById("third-party-cookies-checker-cdn")&&(e?.remove?.(),window.removeEventListener("message",c),chrome.tabs.getCurrent(e=>{chrome.tabs.sendMessage(e.id,{content_op:"thirdPartyCookiesChecked",status:!1})}))}catch(e){}},1e4)})();