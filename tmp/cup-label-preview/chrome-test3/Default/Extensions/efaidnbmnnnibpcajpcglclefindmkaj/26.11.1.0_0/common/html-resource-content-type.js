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
const t=/^[a-z0-9][a-z0-9!#$&^_.+-]{0,126}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,126}$/,e={css:new Set(["text/css"]),font:new Set(["application/font-sfnt","application/font-woff","application/vnd.ms-fontobject","application/x-font-opentype","application/x-font-ttf","application/x-font-woff"])};export function assertResourceContentType(o,n){const s=o||"",r=/[",]/.test(s.replace(/"(?:\\.|[^"\\])*"/g,"")),a=s.split(";",1)[0].trim().toLowerCase(),p=t.test(a),i=("image"===n||"font"===n)&&a.startsWith(`${n}/`)||e[n]?.has(a);if(r||!p||!i){let t=s?"<invalid>":"<missing>";p&&(t=a);const e=r?" (malformed header)":"";throw console.error(`Unsupported Content-Type for ${n} resource: received ${t}${e}`),new Error(`Unexpected Content-Type for ${n} resource`)}}export function validateResourceResponse(t,e){if(!t.ok)throw new Error(`HTTP ${t.status}`);assertResourceContentType(t.headers.get("content-type"),e)}