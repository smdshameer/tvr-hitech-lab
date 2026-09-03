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

      var rawDate = row[1];
      var formattedDate = '';
      if (rawDate instanceof Date) {
        formattedDate = Utilities.formatDate(rawDate, "Asia/Kolkata", "dd/MM/yyyy, hh:mm:ss a");
      } else if (rawDate) {
        formattedDate = String(rawDate).trim();
      }

      tickets.push({
        ticketId: tid,
        createdDate: formattedDate || String(rawDate || ''),
        createdAt: formattedDate || String(rawDate || ''),
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

    // 3. ACTION: CREATE TICKET (Hierarchical: District -> School [UDISE] -> Evidence & Completion Photos)
    var distStr = String(data.district || '').trim();
    var udiseStr = String(data.udise || '').trim();
    if (!distStr && udiseStr) {
      distStr = udiseStr.indexOf('3319') === 0 ? 'Nagapattinam' : 'Thiruvarur';
    }
    if (!distStr) distStr = 'Thiruvarur';

    var districtFolder = getOrCreateDistrictFolder(distStr);
    var schoolFolder = getOrCreateSchoolFolder(districtFolder, data.udise, data.schoolName);
    var evidenceFolder = getOrCreateSubFolder(schoolFolder, "Evidence");
    var compFolder = getOrCreateSubFolder(schoolFolder, "Completion Photos"); // Ensure Completion Photos subfolder exists

    var tid = String(data.ticketId || 'TICKET').trim();
    var p1Url = data.photo1Url || saveBase64Image(evidenceFolder, data.photo1Base64, (tid ? tid + "_" : "") + "1_UPS_Display.jpg");
    var p2Url = data.photo2Url || saveBase64Image(evidenceFolder, data.photo2Base64, (tid ? tid + "_" : "") + "2_Overall_Setup.jpg");
    var p3Url = data.photo3Url || saveBase64Image(evidenceFolder, data.photo3Base64, (tid ? tid + "_" : "") + "3_Battery_MCB.jpg");
    var p4Url = data.photo4Url || saveBase64Image(evidenceFolder, data.photo4Base64, (tid ? tid + "_" : "") + "4_Isolation_Transformer.jpg");

    var timeStr = data.createdDate || Utilities.formatDate(new Date(), "Asia/Kolkata", "dd/MM/yyyy, hh:mm:ss a");
    var sheetTimeStr = "'" + timeStr;
    
    // Idempotent Sheet Record Check
    var existingRowIndex = -1;
    var lastRow = sheet.getLastRow();
    if (lastRow > 1) {
      var idValues = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
      for (var r = 0; r < idValues.length; r++) {
        if (String(idValues[r][0]).trim() === tid) {
          existingRowIndex = r + 2;
          break;
        }
      }
    }

    var rowPayload = [
      tid, sheetTimeStr, data.priority || 'High', data.status || 'New / Under Review',
      distStr, data.block || '', data.schoolName || '', data.udise || '',
      data.aiName || '', data.phone || '', data.issue || '', data.duration || '',
      data.serialNo || '', data.remarks || '',
      p1Url || 'No Photo', p2Url || 'No Photo', p3Url || 'No Photo', p4Url || 'No Photo',
      schoolFolder.getUrl()
    ];

    if (existingRowIndex > 0) {
      sheet.getRange(existingRowIndex, 1, 1, rowPayload.length).setValues([rowPayload]);
    } else {
      sheet.appendRow(rowPayload);
    }

    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      ticketId: tid,
      district: distStr,
      rootFolder: districtFolder.getName(),
      districtFolder: districtFolder.getName(),
      schoolFolder: schoolFolder.getName(),
      evidenceFolder: evidenceFolder.getName(),
      completionFolder: compFolder.getName(),
      folderUrl: schoolFolder.getUrl(),
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

      // Handle Completion Evidence Storage inside School Folder
      // Structure: District / [UDISE] - [School Name] / Evidence / (HM Report)
      //                                               / Completion Photos / (GPS Photo)
      var hmUrl = data.hmReportPhotoUrl || '';
      var compUrl = data.completionPhotoUrl || '';
      var districtFolderName = '';
      var schoolFolderName = '';
      var evidenceFolderName = '';
      var compFolderName = '';
      var schoolFolderUrl = '';

      if (data.hmReportPhotoBase64 || data.completionPhotoBase64) {
        try {
          var distStr = String(data.district || '').trim();
          var udiseStr = String(data.udise || '').trim();
          if (!distStr && udiseStr) {
            distStr = udiseStr.indexOf('3319') === 0 ? 'Nagapattinam' : 'Thiruvarur';
          }
          if (!distStr) distStr = 'Thiruvarur';

          var districtFolder = getOrCreateDistrictFolder(distStr);
          var schoolFolder = getOrCreateSchoolFolder(districtFolder, data.udise, data.schoolName);
          var evidenceFolder = getOrCreateSubFolder(schoolFolder, "Evidence");
          var compFolder = getOrCreateSubFolder(schoolFolder, "Completion Photos");

          districtFolderName = districtFolder.getName();
          schoolFolderName = schoolFolder.getName();
          evidenceFolderName = evidenceFolder.getName();
          compFolderName = compFolder.getName();
          schoolFolderUrl = schoolFolder.getUrl();

          var hmName = (tid ? tid + "_" : "") + "HM_Signed_Completion_Report.jpg";
          var compName = (tid ? tid + "_" : "") + "Completion_UPS_GPS.jpg";

          if (data.hmReportPhotoBase64) {
            hmUrl = saveBase64Image(evidenceFolder, data.hmReportPhotoBase64, hmName);
          }
          if (data.completionPhotoBase64) {
            compUrl = saveBase64Image(compFolder, data.completionPhotoBase64, compName);
          }
        } catch(e){}
      }

      return ContentService.createTextOutput(JSON.stringify({
        success: true,
        message: 'Ticket ' + tid + ' updated successfully in Google Sheets',
        ticketId: tid,
        district: distStr || 'Thiruvarur',
        rootFolder: districtFolderName,
        districtFolder: districtFolderName,
        schoolFolder: schoolFolderName,
        evidenceFolder: evidenceFolderName,
        completionFolder: compFolderName,
        folderUrl: schoolFolderUrl,
        hmReportPhotoUrl: hmUrl,
        completionPhotoUrl: compUrl
      })).setMimeType(ContentService.MimeType.JSON);
    }
  }
  return ContentService.createTextOutput(JSON.stringify({ success: false, error: 'Ticket not found for update' })).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Resolves or creates the District folder on Google Drive.
 * Canonical dual-roots:
 *   NAGAPATTINAM: 'Nagapattinam_HTL_UPS_Photos'
 *   THIRUVARUR:   'Thiruvarur_HTL_UPS_Photos'
 * Idempotent: searches existing folders before creating.
 * rootFolder.getFoldersByName and subFolders.hasNext compatibility guard
 */
function getOrCreateDistrictFolder(districtName) {
  var dName = String(districtName || '').trim();
  var isNagapattinam = dName.toLowerCase().indexOf('nagapattinam') !== -1;
  var canonicalName = isNagapattinam ? "Nagapattinam_HTL_UPS_Photos" : "Thiruvarur_HTL_UPS_Photos";

  // 1. Search Google Drive for the exact canonical folder name
  var folders = DriveApp.getFoldersByName(canonicalName);
  if (folders.hasNext()) return folders.next();

  // 2. Case-insensitive search across top-level folders to prevent duplicates
  var rootFolders = DriveApp.getFolders();
  while (rootFolders.hasNext()) {
    var f = rootFolders.next();
    var fName = f.getName().trim().toLowerCase();
    if (fName === canonicalName.toLowerCase()) {
      return f;
    }
  }

  // 3. Fallback compatibility: check rootFolder.getFoldersByName
  // IMPORTANT SAFETY RULE: Do NOT rename any unrelated folder named "Nagapattinam"

  // 4. Create new canonical District Root Folder automatically
  var newFolder = DriveApp.createFolder(canonicalName);
  newFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return newFolder;
}

/**
 * Resolves or creates a unique school folder inside the District folder.
 * Uses UDISE Code as the primary reliable identifier to prevent duplicates.
 * Format: "UDISE - School Name"
 */
function getOrCreateSchoolFolder(districtFolder, udise, schoolName) {
  var cleanUdise = String(udise || '').trim();
  var cleanSchool = String(schoolName || 'School').trim().replace(/[\/\\:*?"<>|]/g, ' ');
  var expectedName = cleanUdise ? (cleanUdise + ' - ' + cleanSchool) : cleanSchool;

  // 1. Search for existing school folder by UDISE inside District folder
  if (cleanUdise) {
    var subFolders = districtFolder.getFolders();
    while (subFolders.hasNext()) {
      var folder = subFolders.next();
      var folderName = folder.getName();
      if (folderName.indexOf(cleanUdise) !== -1) {
        return folder;
      }
    }
  }

  // 2. If not found by UDISE, check by school name
  if (cleanSchool && cleanSchool !== 'School') {
    var subFoldersByName = districtFolder.getFolders();
    while (subFoldersByName.hasNext()) {
      var folderByName = subFoldersByName.next();
      var fName = folderByName.getName().toLowerCase();
      if (fName.indexOf(cleanSchool.toLowerCase()) !== -1) {
        return folderByName;
      }
    }
  }

  // 3. Create unique school folder: "[UDISE] - [School Name]"
  var newSchoolFolder = districtFolder.createFolder(expectedName);
  newSchoolFolder.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return newSchoolFolder;
}

/**
 * Resolves or creates a subfolder ("Evidence" or "Completion Photos") inside the School folder.
 * Idempotent: checks existing subfolder before creating.
 */
function getOrCreateSubFolder(schoolFolder, subFolderName) {
  var folders = schoolFolder.getFoldersByName(subFolderName);
  if (folders.hasNext()) {
    return folders.next();
  }
  var newSub = schoolFolder.createFolder(subFolderName);
  newSub.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return newSub;
}

function saveBase64Image(folder, base64Data, filename) {
  if (!base64Data || typeof base64Data !== 'string') return '';
  var raw = base64Data;
  if (raw.indexOf('base64,') !== -1) raw = raw.split('base64,')[1];
  if (!raw || raw.length < 50) return '';
  try {
    var decoded = Utilities.base64Decode(raw);
    var blob = Utilities.newBlob(decoded, 'image/jpeg', filename);
    var existingFiles = folder.getFilesByName(filename);
    if (existingFiles.hasNext()) {
      var existingFile = existingFiles.next();
      existingFile.setContent(decoded);
      return 'https://drive.google.com/thumbnail?id=' + existingFile.getId() + '&sz=w800';
    }
    // Also check for existing file matching the completion category
    var allFiles = folder.getFiles();
    while (allFiles.hasNext()) {
      var f = allFiles.next();
      var fName = f.getName();
      if (fName === filename || 
         (filename.indexOf('HM_Signed') !== -1 && fName.indexOf('HM_Signed') !== -1) || 
         (filename.indexOf('Completion') !== -1 && fName.indexOf('Completion') !== -1)) {
        f.setContent(decoded);
        return 'https://drive.google.com/thumbnail?id=' + f.getId() + '&sz=w800';
      }
    }
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
    return 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w800';
  } catch(e) { return ''; }
}
