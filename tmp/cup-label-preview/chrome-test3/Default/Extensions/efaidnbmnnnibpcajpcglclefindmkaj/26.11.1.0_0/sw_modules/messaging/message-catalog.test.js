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
import e from"path";import r from"ajv";import{loadCatalogSources as t}from"../../../scripts/message-catalog-sources.js";import o from"./contracts/message-contract.schema.json";const s=jest.requireActual("../../common/message-registry.js");describe("compiled runtime message catalog",()=>{it("contains every validated JSON contract without a public registration API",()=>{expect(s).not.toHaveProperty("register");const r=t({rootDir:e.resolve(__dirname,"../../..")}).contracts,o=e=>JSON.stringify([e.op,e.bus,e.discriminatorField,e.targetEndpoint]),i=e=>[...e].sort((e,r)=>o(e).localeCompare(o(r)));expect(i(s.listRegisteredContracts())).toEqual(i(r))}),it("prevents mutation of contracts, schemas and sender permissions through lookup results",()=>{const e=s.listRegisteredContracts().find(e=>Object.keys(e.schema).length),r=Object.keys(e.schema)[0];expect(()=>{e.allowedSenderTiers.push("external")}).toThrow(TypeError),expect(()=>{e.schema[r].required=!e.schema[r].required}).toThrow(TypeError),expect(()=>{e.targetEndpoint="another-receiver"}).toThrow(TypeError)}),it("keeps every migrated authoring file valid against the editor schema",()=>{const s=new r({allErrors:!0,strict:!1}).compile(o),{inputs:i}=t({rootDir:e.resolve(__dirname,"../../..")});i.forEach(({file:e,text:r})=>{expect({file:e,errors:s(JSON.parse(r))?[]:s.errors}).toEqual({file:e,errors:[]})})})});