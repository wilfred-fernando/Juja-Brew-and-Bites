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
export const URL_MASK="[REDACTED]";const e=/(?:https?|file)(?::\/\/|%3A%2F%2F)/gi,t=/[\t\n\r]+|[^\S\t\n\r]|[/?#"<>`]/g,n=/[\t\n\r]+|[^\S\t\n\r]|["<>`]/g,s=/[\s/?#&"<>`]|%(?:2F|3F|23)/gi,l=/[\s&"<>`]/g,r=/^(?:[/?#]|%(?:2F|3F|23))/i,i=/[\s,;)\]}<>`]/,c=/[^\s/?#<>`@]*@/y,o=/[\t\n\r]/g,f=/\s/,a=/^(\[[0-9a-f:.]*\]|[\w.-]*)(:\d*)?$/i,u=`/${URL_MASK}`;function x(e,t=0){let n=e.length;for(;n>t&&")].,;:!'\"\\".includes(e[n-1]);)n-=1;return n}function d(e){if(e.startsWith(u)&&x(e,u.length)===u.length)return[u,e.slice(u.length)];const t=x(e);return[e.slice(0,t),e.slice(t)]}function g(e,t,n){return n.lastIndex=t,n.exec(e)?.index??e.length}function h(e,t,n,s){n.lastIndex=t;let l=-1,r=n.exec(e);for(;r;){const t=r.index+r[0].length;if(t>=e.length||f.test(e[t]))break;if('"'===r[0]){if(i.test(e[t])&&(s&&r.index>=l&&(c.lastIndex=t,l=c.test(e)?c.lastIndex:-1),r.index>=l))break}else if(!"\t\n\r".includes(r[0][0]))break;r=n.exec(e)}return r?r.index:e.length}function I(e){const t=e.replace(/%([0-9a-f]{2})/gi,(e,t)=>String.fromCharCode(parseInt(t,16)));const n=t.lastIndexOf("@"),s=t.slice(n+1);return s===URL_MASK||a.test(s.replace(o,""))?n>=0?`${URL_MASK}@${s}`:s:null}function p(e){return e&&"/"!==e?u:e}export function maskUrls(i){let c="",o=0;e.lastIndex=0;let f=e.exec(i);for(;f;){const a=e.lastIndex,u=f[0].includes("%"),S=u?g(i,a,s):h(i,a,t,!0),U=i.slice(a,S);let $=I(U),k="",A="",F=S;if(r.test(i.slice(S,S+3)))F=u?g(i,S,l):h(i,S,n,!1),[k,A]=d(i.slice(S,F));else if(null===$){const e=x(U);A=U.slice(e),$=I(U.slice(0,e))}c+=`${i.slice(o,a)}${$??URL_MASK}${p(k)}${A}`,o=F,e.lastIndex=F,f=e.exec(i)}return c+i.slice(o)}export function maskUrlsInLog(e){const t={...e};return Object.keys(t).forEach(e=>{"string"==typeof t[e]&&(t[e]=maskUrls(t[e]))}),t}