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
import{injectTransportBridge as i}from"./mw_scripts/inject-transport-bridge.js";import{getAuthUserBridgeFunc as t}from"./mw_scripts/get-auth-user-bridge.js";const e={gdrive_inject:{func:i,allowedOrigins:["https://drive.google.com"]},gdrive_auth_user:{func:t,allowedOrigins:["https://drive.google.com"]},gmail_inject:{func:i,allowedOrigins:["https://mail.google.com"]},gemini_inject:{func:i,allowedOrigins:["https://gemini.google.com"]},gdocs_inject:{func:i,allowedOrigins:["https://docs.google.com"]},linkedin_inject:{func:i,allowedOrigins:["https://www.linkedin.com"]},chatgpt_inject:{func:i,allowedOrigins:["https://chatgpt.com"]}};export{e as MAIN_WORLD_INJECT_FUNCS};