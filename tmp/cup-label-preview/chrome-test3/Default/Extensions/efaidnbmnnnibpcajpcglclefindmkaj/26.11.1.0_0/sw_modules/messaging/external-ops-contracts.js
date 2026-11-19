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
import{contractSchema as e}from"./catalog-views.js";export const externalTaskSchemas=["pushBuildSideUserState","detect_extension","detect_desktop","detect_viewer_enabled","enable_viewer","open_acrobat_clicked","upsell_redirect_to_pdf","storage_bulk_read","storage_bulk_write","storage_bulk_remove","openNotificationPreferences","openKeepAcrobatVisiblePreference","openNewTab","openLFASettingsPageWithAnimation","imsSignInDone"].map(t=>[t,e(t,"task","external-message","external-clients:task",["type"])]);