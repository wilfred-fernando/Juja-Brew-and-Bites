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
import{buildSafeFilenameWithExt as e}from"./sanitise-filename.js";describe("shared filename sanitization",()=>{it.each([["CON.pdf","_CON.pdf"],['bad/\\:*?"<>|\0name.pdf',"badname.pdf"],["///.pdf","Canvas.pdf"]])("sanitizes %s using the existing asset-name rules",(t,a)=>{expect(e(t,"Canvas")).toBe(a)}),it.each([["😀",""],["é","e"],["👩‍💻",""]])("truncates %s at the filename limit without splitting surrogate pairs",(t,a)=>{const s="x".repeat(235),i=e(`${s}${t}tail.pdf`,"Canvas");expect(i).toBe(`${s}${a}.pdf`),expect(i.length).toBeLessThanOrEqual(240),expect(()=>encodeURIComponent(i)).not.toThrow()})});