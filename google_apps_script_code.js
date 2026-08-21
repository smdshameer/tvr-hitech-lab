/**
 * =========================================================================
 * THIRUVARUR HI-TECH LAB ITSM — GOOGLE DRIVE & GOOGLE SHEETS SYNC SCRIPT
 * =========================================================================
 * 
 * Instructions:
 * 1. Open Google Sheets (https://sheets.new) -> Name it: "Thiruvarur_HTL_Service_Desk_Live"
 * 2. Go to Extensions -> Apps Script
 * 3. Delete any code in Code.gs and Paste this entire file
 * 4. Click "Deploy" -> "New deployment"
 * 5. Select Type: "Web app"
 * 6. Set Description: "HTL UPS Webhook"
 * 7. Set "Execute as": "Me (your email)"
 * 8. Set "Who has access": "Anyone"  <-- CRITICAL!
 * 9. Click "Deploy" -> Authorize access -> Copy the Web App URL!
 * 10. In Render Dashboard -> Environment:
 *     Add GOOGLE_DRIVE_WEBHOOK_URL = <Your_Web_App_URL>
 */

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'Empty payload' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var data = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getActiveSheet();

    // 1. Setup Header Row if sheet is empty
    if (sheet.getLastRow() === 0) {
      sheet.appendRow([
        'Ticket ID', 'Timestamp', 'Priority', 'Status', 'District', 'Block',
        'School Name', 'UDISE Code', 'AI Teacher Name', 'AI Mobile Number',
        'Reported Issue', 'Duration', 'UPS Serial No', 'Remarks',
        'Photo 1 (Display)', 'Photo 2 (Overall)', 'Photo 3 (Battery/MCB)', 'Photo 4 (Transformer)',
        'Google Drive Folder URL'
      ]);
      sheet.getRange(1, 1, 1, 19).setFontWeight('bold').setBackground('#1e3a8a').setFontColor('#ffffff');
      sheet.setFrozenRows(1);
    }

    // 2. Create or Find Root Folder in Google Drive
    var rootFolderName = "Thiruvarur_HTL_UPS_Photos";
    var rootFolder;
    var folders = DriveApp.getFoldersByName(rootFolderName);
    if (folders.hasNext()) {
      rootFolder = folders.next();
    } else {
      rootFolder = DriveApp.createFolder(rootFolderName);
    }

    // 3. Create Dedicated Folder for this Ticket
    var folderName = (data.ticketId || 'TICKET') + ' - ' + (data.schoolName || 'School') + ' (' + (data.udise || '') + ')';
    var ticketFolder = rootFolder.createFolder(folderName);
    ticketFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    // 4. Save 4 Photos to the Google Drive Folder
    var p1Url = saveBase64Image(ticketFolder, data.photo1Base64, "1_UPS_Display.jpg");
    var p2Url = saveBase64Image(ticketFolder, data.photo2Base64, "2_Overall_Setup.jpg");
    var p3Url = saveBase64Image(ticketFolder, data.photo3Base64, "3_Battery_MCB.jpg");
    var p4Url = saveBase64Image(ticketFolder, data.photo4Base64, "4_Isolation_Transformer.jpg");

    // 5. Append Row to Google Sheet
    var timeStr = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
    sheet.appendRow([
      data.ticketId || '',
      timeStr,
      data.priority || 'High',
      data.status || 'New / Under Review',
      data.district || 'Thiruvarur',
      data.block || '',
      data.schoolName || '',
      data.udise || '',
      data.aiName || '',
      data.phone || '',
      data.issue || '',
      data.duration || '',
      data.serialNo || '',
      data.remarks || '',
      p1Url || 'No Photo',
      p2Url || 'No Photo',
      p3Url || 'No Photo',
      p4Url || 'No Photo',
      ticketFolder.getUrl()
    ]);

    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      ticketId: data.ticketId,
      folderUrl: ticketFolder.getUrl(),
      p1Url: p1Url,
      p2Url: p2Url,
      p3Url: p3Url,
      p4Url: p4Url
    })).setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: err.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

function saveBase64Image(folder, base64Data, filename) {
  if (!base64Data || typeof base64Data !== 'string') return '';
  var raw = base64Data;
  if (raw.indexOf('base64,') !== -1) {
    raw = raw.split('base64,')[1];
  }
  if (!raw || raw.length < 50) return '';
  try {
    var decoded = Utilities.base64Decode(raw);
    var blob = Utilities.newBlob(decoded, 'image/jpeg', filename);
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return file.getUrl();
  } catch(e) {
    return '';
  }
}
