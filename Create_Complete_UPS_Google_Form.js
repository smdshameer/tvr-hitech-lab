function myFunction() {
  // 1. Create the Google Form
  var formTitle = 'Hi-Tech Lab UPS Complaint Verification - Thiruvarur District';
  var form = FormApp.create(formTitle);
  
  form.setDescription(
    'Tamil Nadu School ICT Project - Thiruvarur District\n' +
    'Official verification form to report and resolve pending Hi-Tech Lab UPS and power backup issues across listed government schools.\n\n' +
    'Note: Only AI Instructors / In-Charges of the 22 listed schools are requested to submit this verification.'
  );
  
  form.setConfirmationMessage(
    'Thank you! Your school UPS complaint has been successfully recorded.\n' +
    'The Field Engineer and technical support team will take necessary action for service and resolution.'
  );
  
  form.setAllowResponseEdits(true);

  // 2. Question 1: School Name Dropdown (22 Target Schools)
  var schoolList = [
    'PUMS, JAMBUVANODAI THARKA (Muthupettai - 33201000507)',
    'PUMS THIRUKKARAVASAL (Thiruvarur - 33200503001)',
    'PUMS KODIMANGALAM (Koradachery - 33200305002)',
    'PUMS SERUVALUR (Nannilam - 33200403101)',
    'PUMS, PAINGATTUR (Kottur - 33200802601)',
    'PUMS, SONAPPETTAI (Needamangalam - 33200700702)',
    'PUMS KOMAL (Thiruvarur - 33200503002)',
    'GGHSS, KORADACHERY (Koradachery - 33200305301)',
    'PUMS, THILLAIVILAGAM-SOUTH (Muthupettai - 33201002104)',
    'PUMS, VALLUR (Kottur - 33200804601)',
    'PUMS SEKAL (Thiruthuraipoondi - 33200902401)',
    'PUMS, THIRURAMESWARAM (Mannargudi - 33200601701)',
    'PUMS PETTAI (Muthupettai - 33201003005)',
    'PUMS, POZHAKUDI (Nannilam - 33200401601)',
    'PUMS, ALATHUR (Kudavasal - 33200200201)',
    'GGHSS, NANNILAM (Nannilam - 33200405311)',
    'PUMS PALAYANGUDI (Thiruthuraipoondi - 33200902102)',
    'PUMS THIRUVIDAIVASAL (Koradachery - 33200302901)',
    'PUMS, THIRUMEEACHUR (Nannilam - 33200401701)',
    'PUMS, PANDARAVADAI (Nannilam - 33200401801)',
    'PUMS VEPPATHANGUDI (Thiruvarur - 33200504101)',
    'PUMS RAJAKOTHAMANGALAM (Thiruthuraipoondi - 33200900401)'
  ];

  form.addListItem()
      .setTitle('1. Select Your School Name')
      .setChoiceValues(schoolList)
      .setRequired(true);

  // 3. Question 2: AI Teacher Name
  form.addTextItem()
      .setTitle('2. AI Instructor / In-Charge Name')
      .setRequired(true);

  // 4. Question 3: AI Mobile / WhatsApp Number
  var phoneItem = form.addTextItem()
      .setTitle('3. AI Mobile / WhatsApp Number')
      .setRequired(true);
  var phoneValidation = FormApp.createTextValidation()
      .setHelpText('Please enter a valid 10-digit mobile number')
      .requireRegex('^[0-9]{10}$')
      .build();
  phoneItem.setValidation(phoneValidation);

  // 5. Question 4: Exact UPS Status
  form.addMultipleChoiceItem()
      .setTitle('4. Current UPS Status / Exact Problem')
      .setChoiceValues([
        'UPS Not Powering ON / Completely Dead',
        'No Battery Backup / Trips immediately during power cuts',
        'Continuous Beep Sound / Warning Indicator Light On',
        'UPS Not Charging / Low Voltage Input Issue',
        'Isolation Transformer / MCB Tripping Issue',
        'Already Repaired / Working Fine Now'
      ])
      .showOtherOption(true)
      .setRequired(true);

  // 6. Question 5: Issue Duration
  form.addMultipleChoiceItem()
      .setTitle('5. Issue Duration')
      .setChoiceValues([
        'Less than 1 week',
        '1 - 3 weeks',
        'More than 1 month',
        'Since Installation / Long Pending'
      ])
      .setRequired(true);

  // 7. Question 6: UPS Serial Number
  form.addTextItem()
      .setTitle('6. UPS Serial Number (Optional)')
      .setHelpText('Refer to the serial number sticker on the front or rear panel of the UPS.');

  // 8. Question 7: Remarks
  form.addParagraphTextItem()
      .setTitle('7. Remarks / Specific Symptoms (Optional)')
      .setHelpText('Mention any additional details, e.g. system shut down immediately when mains fail, strange noise, etc.');

  // 9. Automatically create and link a Google Spreadsheet for responses
  var ss = SpreadsheetApp.create('Hi-Tech Lab UPS Complaints - Thiruvarur (Responses)');
  form.setDestination(FormApp.DestinationType.SPREADSHEET, ss.getId());

  // 10. Print live links
  Logger.log('====================================================');
  Logger.log('🎉 GOOGLE FORM CREATED SUCCESSFULLY!');
  Logger.log('👉 FORM SHARE LINK (For Teachers): ' + form.getPublishedUrl());
  Logger.log('👉 FORM EDIT LINK: ' + form.getEditUrl());
  Logger.log('👉 RESPONSES SPREADSHEET LINK: ' + ss.getUrl());
  Logger.log('====================================================');
}
