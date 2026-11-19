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
import{STUDENT_TOOLS_TOUCHPOINT_REGISTRY as t,getStudentToolsTouchpointConfig as e,getTouchpointsForSurface as o}from"./student-tools-touchpoint-registry.js";describe('notes (FAB "Generate notes" challenger)',()=>{it("is fab-only, with its own distinct fabRoutingContext for analytics attribution (not study-guide's, not the unrelated 'generateNotes' Notes-tab funnel)",()=>{const t=e("notes"),o=e("study-guide");expect(t.surfaces).toEqual(["fab"]),expect(t.fabRoutingContext).toBe("ExtensionFAB:generateNotesStudyGuide"),expect(t.fabRoutingContext).not.toBe(o.fabRoutingContext),expect(t.fabRoutingContext).not.toBe("ExtensionFAB:generateNotes"),expect(t.contextMenuRoutingContext).toBeUndefined()}),it("has a fabLabelKey distinct from translationTitleKey conceptually but present for the FAB pill",()=>{const t=e("notes");expect(t.fabLabelKey).toBe("studentToolsTouchpointFabNotes"),expect(t.translationTitleKey).toBeTruthy()}),it("is included when filtering touchpoints for the fab surface",()=>{expect(o("fab").map(t=>t.id)).toContain("notes")})}),describe("STUDENT_TOOLS_TOUCHPOINT_REGISTRY — every entry",()=>{it("declares fabRoutingContext for every touchpoint whose surfaces include fab",()=>{Object.values(t).filter(t=>t.surfaces.includes("fab")).forEach(t=>{expect(t.fabRoutingContext).toBeTruthy(),expect(t.fabLabelKey).toBeTruthy()})}),it("declares contextMenuRoutingContext and contextMenuId for every touchpoint whose surfaces include context-menu",()=>{Object.values(t).filter(t=>t.surfaces.includes("context-menu")).forEach(t=>{expect(t.contextMenuRoutingContext).toBeTruthy(),expect(t.contextMenuId).toBeTruthy()})})});