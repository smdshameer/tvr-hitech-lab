/**
 * ====================================================================================
 * GOOGLE APPS SCRIPT CLOUD DATABASE & DRIVE STORAGE ENGINE
 * Thiruvarur District Hi-Tech Lab UPS Incident Resolution System
 * ====================================================================================
 * Instructions:
 * 1. Open your Google Sheet
 * 2. Click Extensions -> Apps Script
 * 3. Replace all code with this file
 * 4. Click Deploy -> New deployment -> Select type: Web app
 * 5. Execute as: Me (your Google account)
 * 6. Who has access: Anyone (முக்கியம்: Anyone என தேர்ந்தெடுக்கவும்)
 * 7. Click Deploy and copy the Web App URL!
 * ====================================================================================
 */

function doGet(e) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getActiveSheet();
    var action = (e && e.parameter && e.parameter.action) || 'getTickets';
    var ticketId = (e && e.parameter && e.parameter.ticketId) || '';

    // Action: Delete via GET (convenience fallback)
    if (action === 'delete' && ticketId) {
      return deleteTicketRow(sheet, ticketId);
    }

    // Default Action: Get All Tickets
    var lastRow = sheet.getLastRow();
    if (lastRow <= 1) {
      return ContentService.createTextOutput(JSON.stringify({ success: true, count: 0, tickets: [] }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    var data = sheet.getRange(2, 1, lastRow - 1, 19).getValues();
    var tickets = [];

    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      var tid = String(row[0] || '').trim();
      if (!tid) continue;

      tickets.push({
        ticketId: tid,
        createdDate: String(row[1] || ''),
        createdAt: String(row[1] || ''),
        priority: String(row[2] || 'High'),
        status: String(row[3] || 'New / Under Review'),
        district: String(row[4] || 'Thiruvarur'),
        block: String(row[5] || ''),
        schoolName: String(row[6] || ''),
        udise: String(row[7] || ''),
        aiName: String(row[8] || ''),
        phone: String(row[9] || ''),
        issue: String(row[10] || ''),
        duration: String(row[11] || ''),
        serialNo: String(row[12] || ''),
        remarks: String(row[13] || ''),
        photo1Url: String(row[14] || ''),
        photo2Url: String(row[15] || ''),
        photo3Url: String(row[16] || ''),
        photo4Url: String(row[17] || ''),
        googleDriveFolderUrl: String(row[18] || '')
      });
    }

    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      count: tickets.length,
      tickets: tickets
    })).setMimeType(ContentService.MimeType.JSON);

  } catch(err) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'Empty payload' })).setMimeType(ContentService.MimeType.JSON);
    }
    var data = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getActiveSheet();
    var action = data.action || 'create';

    ensureHeader(sheet);

    // 1. ACTION: DELETE TICKET
    if (action === 'delete') {
      return deleteTicketRow(sheet, data.ticketId);
    }

    // 2. ACTION: UPDATE TICKET
    if (action === 'update') {
      return updateTicketRow(sheet, data);
    }

    // 3. ACTION: CREATE TICKET (Default - District Aware Dual Drive Roots)
    var distStr = String(data.district || 'Thiruvarur').trim();
    var isNagapattinam = distStr.toLowerCase().indexOf('nagapattinam') !== -1;
    var rootFolderName = isNagapattinam ? "Nagapattinam_HTL_UPS_Photos" : "Thiruvarur_HTL_UPS_Photos";
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

    var p1Url = data.photo1Url || saveBase64Image(ticketFolder, data.photo1Base64, "1_UPS_Display.jpg");
    var p2Url = data.photo2Url || saveBase64Image(ticketFolder, data.photo2Base64, "2_Overall_Setup.jpg");
    var p3Url = data.photo3Url || saveBase64Image(ticketFolder, data.photo3Base64, "3_Battery_MCB.jpg");
    var p4Url = data.photo4Url || saveBase64Image(ticketFolder, data.photo4Base64, "4_Isolation_Transformer.jpg");

    var timeStr = data.createdDate || new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" });
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

function ensureHeader(sheet) {
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
}

function deleteTicketRow(sheet, ticketId) {
  var tid = String(ticketId || '').trim();
  if (!tid) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'Missing ticketId' })).setMimeType(ContentService.MimeType.JSON);
  }
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'Sheet is empty' })).setMimeType(ContentService.MimeType.JSON);
  }
  var data = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < data.length; i++) {
    if (String(data[i][0]).trim() === tid) {
      sheet.deleteRow(i + 2);
      return ContentService.createTextOutput(JSON.stringify({ success: true, message: 'Ticket ' + tid + ' deleted successfully from Google Sheets' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }
  return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'Ticket not found in Google Sheets' })).setMimeType(ContentService.MimeType.JSON);
}

function updateTicketRow(sheet, data) {
  var tid = String(data.ticketId || '').trim();
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'Sheet is empty' })).setMimeType(ContentService.MimeType.JSON);
  }
  var colA = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < colA.length; i++) {
    if (String(colA[i][0]).trim() === tid) {
      var rowNum = i + 2;
      if (data.status) sheet.getRange(rowNum, 4).setValue(data.status);
      if (data.remarks || data.resolutionNotes) {
        var existing = sheet.getRange(rowNum, 14).getValue();
        sheet.getRange(rowNum, 14).setValue((existing ? existing + ' | ' : '') + (data.resolutionNotes || data.remarks));
      }
      return ContentService.createTextOutput(JSON.stringify({ success: true, message: 'Ticket ' + tid + ' updated successfully in Google Sheets' }))
        .setMimeType(ContentService.MimeType.JSON);
    }
  }
  return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'Ticket not found for update' })).setMimeType(ContentService.MimeType.JSON);
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
