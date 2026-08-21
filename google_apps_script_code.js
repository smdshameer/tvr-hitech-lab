function doGet(e) {
  return ContentService.createTextOutput("✅ Google Drive Webhook is LIVE and Ready!").setMimeType(ContentService.MimeType.TEXT);
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'Empty payload' })).setMimeType(ContentService.MimeType.JSON);
    }
    var data = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getActiveSheet();

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

    var rootFolderName = "Thiruvarur_HTL_UPS_Photos";
    var rootFolder;
    var folders = DriveApp.getFoldersByName(rootFolderName);
    if (folders.hasNext()) {
      rootFolder = folders.next();
    } else {
      rootFolder = DriveApp.createFolder(rootFolderName);
    }

    var folderName = (data.ticketId || 'TICKET') + ' - ' + (data.schoolName || 'School') + ' (' + (data.udise || '') + ')';
    var ticketFolder = rootFolder.createFolder(folderName);
    ticketFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    var p1Url = saveBase64Image(ticketFolder, data.photo1Base64, "1_UPS_Display.jpg");
    var p2Url = saveBase64Image(ticketFolder, data.photo2Base64, "2_Overall_Setup.jpg");
    var p3Url = saveBase64Image(ticketFolder, data.photo3Base64, "3_Battery_MCB.jpg");
    var p4Url = saveBase64Image(ticketFolder, data.photo4Base64, "4_Isolation_Transformer.jpg");

    var timeStr = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
    sheet.appendRow([
      data.ticketId || '', timeStr, data.priority || 'High', data.status || 'New / Under Review',
      data.district || 'Thiruvarur', data.block || '', data.schoolName || '', data.udise || '',
      data.aiName || '', data.phone || '', data.issue || '', data.duration || '',
      data.serialNo || '', data.remarks || '',
      p1Url || 'No Photo', p2Url || 'No Photo', p3Url || 'No Photo', p4Url || 'No Photo',
      ticketFolder.getUrl()
    ]);

    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      ticketId: data.ticketId,
      folderUrl: ticketFolder.getUrl(),
      p1Url: p1Url, p2Url: p2Url, p3Url: p3Url, p4Url: p4Url
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}

function saveBase64Image(folder, base64Data, filename) {
  if (!base64Data || typeof base64Data !== 'string') return '';
  var raw = base64Data;
  if (raw.indexOf('base64,') !== -1) raw = raw.split('base64,')[1];
  if (!raw || raw.length < 50) return '';
  try {
    var decoded = Utilities.base64Decode(raw);
    var blob = Utilities.newBlob(decoded, 'image/jpeg', filename);
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return file.getUrl();
  } catch(e) { return ''; }
}
