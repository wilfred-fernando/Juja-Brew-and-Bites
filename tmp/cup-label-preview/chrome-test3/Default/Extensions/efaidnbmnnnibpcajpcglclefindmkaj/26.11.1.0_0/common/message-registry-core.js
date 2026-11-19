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
export function createRegistry(t){const i=new Map;return t.forEach(t=>{let r=i.get(t.op);if(r||(r={plain:[],byDiscriminator:new Map},i.set(t.op,r)),void 0===t.discriminatorField)r.plain.push(t);else{const i=r.byDiscriminator.get(t.discriminatorField)||[];i.push(t),r.byDiscriminator.set(t.discriminatorField,i)}}),Object.freeze({getContract:function(t,r,e,n){const o=i.get(t);if(!o)return;const s=t=>(void 0===e||t.bus===e)&&(void 0===n||void 0===t.targetEndpoint||[t.targetEndpoint].flat().includes(n));if(void 0!==r){const t=(o.byDiscriminator.get(r)||[]).filter(s);if(t.length>0)return 1===t.length?t[0]:void 0}const a=o.plain.filter(s);return 1===a.length?a[0]:void 0},assertNoDuplicate:function(t,r,e,n){const o=i.get(t);if(!o)return;if((void 0===r?o.plain:o.byDiscriminator.get(r)||[]).some(t=>(void 0===e||t.bus===e)&&(void 0===n||void 0===t.targetEndpoint||[n].flat().some(i=>[t.targetEndpoint].flat().includes(i)))))throw new Error(`duplicate op: ${t}`)},listRegisteredOps:()=>Array.from(i.keys()),listRegisteredContracts:()=>Array.from(i.values()).flatMap(({plain:t,byDiscriminator:i})=>[...t,...Array.from(i.values()).flat()])})}