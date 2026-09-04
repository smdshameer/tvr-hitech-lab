function parseAppDate(input) {
  if (!input) return 0;
  if (input instanceof Date) return isNaN(input.getTime()) ? 0 : input.getTime();
  if (typeof input === 'number') return isNaN(input) ? 0 : input;

  const str = String(input).trim();
  if (!str) return 0;

  // 1. Standard ISO 8601 (e.g. 2026-09-03T12:50:06+05:30, 2026-09-03T07:20:06.000Z, 2026-09-03)
  if (str.length >= 10 && str.charAt(4) === '-' && str.charAt(7) === '-') {
    const parsed = Date.parse(str);
    if (!isNaN(parsed)) return parsed;
  }

  // 2. Tokenize DD/MM/YYYY or MM/DD/YYYY with time
  const clean = str.split(',').join(' ').trim();
  const tokens = clean.split(' ').filter(Boolean);
  const dateToken = tokens[0] || '';
  let dateParts = [];
  if (dateToken.indexOf('/') !== -1) dateParts = dateToken.split('/');
  else if (dateToken.indexOf('-') !== -1) dateParts = dateToken.split('-');

  if (dateParts.length === 3) {
    let part1 = parseInt(dateParts[0], 10);
    let part2 = parseInt(dateParts[1], 10);
    let year = parseInt(dateParts[2], 10);

    if (!isNaN(part1) && !isNaN(part2) && !isNaN(year)) {
      let hours = 0;
      let minutes = 0;
      let seconds = 0;

      const timeToken = tokens[1] || '';
      if (timeToken.indexOf(':') !== -1) {
        const timeParts = timeToken.split(':');
        hours = parseInt(timeParts[0] || '0', 10);
        minutes = parseInt(timeParts[1] || '0', 10);
        seconds = parseInt(timeParts[2] || '0', 10);
      }

      const merToken = (tokens[2] || '').toLowerCase();
      if (merToken.indexOf('pm') !== -1 && hours < 12) hours += 12;
      if (merToken.indexOf('am') !== -1 && hours === 12) hours = 0;

      let day, month;
      if (part1 > 12) {
        day = part1;
        month = part2;
      } else if (part2 > 12) {
        day = part2;
        month = part1;
      } else {
        // Both <= 12: In 2026 September tickets, part1=9 is September, part2 is day
        if (year === 2026 && part1 === 9 && part2 <= 12) {
          day = part2;
          month = 9;
        } else {
          day = part1;
          month = part2;
        }
      }

      // Convert IST parts (UTC+05:30) to epoch milliseconds
      const istOffsetMs = (5 * 60 + 30) * 60 * 1000;
      return Date.UTC(year, month - 1, day, hours, minutes, seconds) - istOffsetMs;
    }
  }

  // 3. Fallback
  const d = Date.parse(str);
  return isNaN(d) ? 0 : d;
}

function formatAppDate(input) {
  const ts = parseAppDate(input);
  if (!ts) return '';
  const istOffsetMs = (5 * 60 + 30) * 60 * 1000;
  const d = new Date(ts + istOffsetMs);
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  let hours = d.getUTCHours();
  const minutes = String(d.getUTCMinutes()).padStart(2, '0');
  const seconds = String(d.getUTCSeconds()).padStart(2, '0');
  const meridiem = hours >= 12 ? 'pm' : 'am';
  let h12 = hours % 12 || 12;
  const h12Str = String(h12).padStart(2, '0');

  return `${day}/${month}/${year}, ${h12Str}:${minutes}:${seconds} ${meridiem}`;
}

function formatRelativeTime(input, fromTime = Date.now()) {
  const ts = parseAppDate(input);
  if (!ts) return '';
  const diffSec = Math.floor((fromTime - ts) / 1000);
  if (diffSec < 0) return 'Just now';
  if (diffSec < 60) return 'Just now';
  if (diffSec < 3600) return Math.floor(diffSec / 60) + 'm ago';
  if (diffSec < 86400) return Math.floor(diffSec / 3600) + 'h ago';
  if (diffSec < 172800) return '1d ago';
  return Math.floor(diffSec / 86400) + 'd ago';
}

function normalizeTicketDate(s) {
  return formatAppDate(s);
}

function parseTicketTimestamp(s) {
  return parseAppDate(s);
}

const EMBEDDED_AUTHENTIC_TICKETS = [
  {
    "ticketId": "HTL-TVR-00702",
    "createdDate": "03/09/2026, 12:50:06 pm",
    "priority": "Medium",
    "status": "New / Under Review",
    "district": "Thiruvarur",
    "block": "Needamangalam",
    "schoolName": "PUMS SONAPETTAI",
    "udise": "33200700702",
    "aiName": "Sivaranjini Sathiyavendan",
    "phone": "8754607077",
    "issue": "Continuous Beep Sound / Error Warning Light",
    "duration": "3 Months (3 மாதங்கள்)",
    "serialNo": "",
    "remarks": "Nil",
    "photo1Url": "https://drive.google.com/thumbnail?id=1eZmKpvdjKFbnal-8D_PfTH5-flmIJm-I&sz=w800",
    "photo2Url": "https://drive.google.com/thumbnail?id=1EznZTRsSdWhJTkOeZFu-GYYvvA6rOta-&sz=w800",
    "photo3Url": "https://drive.google.com/thumbnail?id=1eRWy-SCT47gNdgqPcN4_sOOGv5q29RTJ&sz=w800",
    "photo4Url": "https://drive.google.com/thumbnail?id=1NQ1jB5lfsZ9Yd5SsuGpi-5ujB17_30Vs&sz=w800",
    "googleDriveFolderUrl": "https://drive.google.com/drive/folders/1GVON3IHfWtnEJlztmLNDXaPBaHE2ulBW",
    "createdAt": "2026-09-03T07:20:06.000Z",
    "hmReportPhotoUrl": "",
    "completionPhotoUrl": "",
    "timeline": []
  },
  {
    "ticketId": "HTL-NGP-01401",
    "createdDate": "02/09/2026, 04:20:18 pm",
    "priority": "Medium",
    "status": "New / Under Review",
    "district": "Nagapattinam",
    "block": "Vedaranyam",
    "schoolName": "PUMS NEIVILAKKU",
    "udise": "33190601401",
    "aiName": "Porselvi",
    "phone": "9585925661",
    "issue": "Other Technical Glitch",
    "duration": "3 Months (3 மாதங்கள்)",
    "serialNo": "243006075207",
    "remarks": "Completion evidence updated (complete) by AI Teacher (AI Teacher)",
    "photo1Url": "https://drive.google.com/thumbnail?id=1jwO1R0Sx0WvFgpDJ3DJqkDnpm1SXBv8m&sz=w800",
    "photo2Url": "https://drive.google.com/thumbnail?id=1Dy79kQ0pukdkYoL7Lp5yuY4eD3wsfgnS&sz=w800",
    "photo3Url": "https://drive.google.com/thumbnail?id=1tAk5yC0dEP3n6Vc6prQKXFYQyyGLwrYg&sz=w800",
    "photo4Url": "https://drive.google.com/thumbnail?id=1fCcpozeMoc_D35805JT8et9wwdzblwvl&sz=w800",
    "googleDriveFolderUrl": "https://drive.google.com/drive/folders/16RSVeomIBqOxvUCyD35WUxYlw_-oOYkj",
    "createdAt": "02/09/2026, 04:20:18 pm",
    "hmReportPhotoUrl": "",
    "completionPhotoUrl": "",
    "timeline": []
  },
  {
    "ticketId": "HTL-TVR-01501",
    "createdDate": "02/09/2026, 12:14:41 pm",
    "priority": "Critical",
    "status": "New / Under Review",
    "district": "Thiruvarur",
    "block": "Mannargudi",
    "schoolName": "PUMS MELATHIRUPPALKUDI",
    "udise": "33200601501",
    "aiName": "Lakshmi Priya S",
    "phone": "8015336768",
    "issue": "Total Dead / No Power / Lab Off",
    "duration": "Today (இன்று முதல்)",
    "serialNo": "  AV05KVATNHL20254901",
    "remarks": "Nil",
    "photo1Url": "https://drive.google.com/thumbnail?id=1vOGCbxcs1wBkgTjRMt3_tWMcE_vCk5C0&sz=w800",
    "photo2Url": "https://drive.google.com/thumbnail?id=1PR6hCAvl2yoKHO4QC7k0McWTZQWc8aRN&sz=w800",
    "photo3Url": "https://drive.google.com/thumbnail?id=1-y4XQrcrVb7RiEFoKL4cwIvbSUSPMeUJ&sz=w800",
    "photo4Url": "https://drive.google.com/thumbnail?id=1z7V7fUBHTaiHtKjEJwoKthrsSijPdl08&sz=w800",
    "googleDriveFolderUrl": "https://drive.google.com/drive/folders/1RGcSyj4teeEDqcQMGqHdDJ_NvLuKUlBv",
    "createdAt": "02/09/2026, 12:14:41 pm",
    "hmReportPhotoUrl": "",
    "completionPhotoUrl": "",
    "timeline": []
  },
  {
    "ticketId": "HTL-TVR-02201",
    "createdDate": "01/09/2026, 12:02:11 pm",
    "priority": "Critical",
    "status": "New / Under Review",
    "district": "Thiruvarur",
    "block": "Nannilam",
    "schoolName": "PUPS KOILKANDANKUDI",
    "udise": "33200402201",
    "aiName": "SINEKA S",
    "phone": "9384425624",
    "issue": "Total Dead / No Power / Lab Off",
    "duration": "1-3 Days (1-3 நாட்கள்)",
    "serialNo": "AVO1KVAITSCH202411628",
    "remarks": "SMARTBOARD NOT WORKING",
    "photo1Url": "https://drive.google.com/thumbnail?id=1T4ZlnNbcUXtBgUMJHdrFFHQ2sw4Rjco6&sz=w800",
    "photo2Url": "https://drive.google.com/thumbnail?id=1CA7bSWlwt-wxM55aFvhm00eGxYg7nRj7&sz=w800",
    "photo3Url": "https://drive.google.com/thumbnail?id=1U-QFgtsZ6Tqjl_xsCXRXaYqZlMXGGJzd&sz=w800",
    "photo4Url": "https://drive.google.com/thumbnail?id=1VUpczyFWpm9GlXz-ORy048sF9wU5ZZmn&sz=w800",
    "googleDriveFolderUrl": "https://drive.google.com/drive/folders/1Cd5YfnMPvDxnpRwq1AfyJqUqhva9Qb5a",
    "createdAt": "01/09/2026, 12:02:11 pm",
    "hmReportPhotoUrl": "",
    "completionPhotoUrl": "",
    "timeline": []
  },
  {
    "ticketId": "HTL-TVR-04101",
    "createdDate": "21/8/2026, 10:34:32 am",
    "priority": "Medium",
    "status": "New / Under Review",
    "district": "Thiruvarur",
    "block": "Thiruvarur",
    "schoolName": "PUMS VEPPATHANGUDI",
    "udise": "33200504101",
    "aiName": "Kanimozhi N",
    "phone": "9751885293",
    "issue": "Continuous Beep Sound / Error Warning Light",
    "duration": "1 Month (1 மாதம்)",
    "serialNo": "",
    "remarks": "",
    "photo1Url": "https://drive.google.com/file/d/1IqTSVfXQPvsHnybYiojVPt11Tgsks9DN/view?usp=drivesdk",
    "photo2Url": "https://drive.google.com/file/d/1mFoLc04xdmxpt7r0uNHv6Gcbpga2tdsw/view?usp=drivesdk",
    "photo3Url": "https://drive.google.com/file/d/1FRJwayTYDX6y7yAyElES2zZmg6gALOUf/view?usp=drivesdk",
    "photo4Url": "https://drive.google.com/file/d/1EjJv1QnCHPnkeKG5AenBt0MVIx6k3D9e/view?usp=drivesdk",
    "googleDriveFolderUrl": "https://drive.google.com/drive/folders/1WE6hzYya3LbKjQNn-8g1dmRWN-CgSHdK",
    "createdAt": "21/08/2026, 10:34:32 am",
    "hmReportPhotoUrl": "",
    "completionPhotoUrl": "",
    "timeline": []
  },
  {
    "ticketId": "HTL-TVR-01901",
    "createdDate": "21/8/2026, 10:45:12 am",
    "priority": "Critical",
    "status": "New / Under Review",
    "district": "Thiruvarur",
    "block": "Nannilam",
    "schoolName": "PUMS KOTTUR",
    "udise": "33200401901",
    "aiName": "Sineka",
    "phone": "9384425624",
    "issue": "Total Dead / No Power / Lab Off",
    "duration": "Today (இன்று முதல்)",
    "serialNo": "AVO5KVATNHL20244448",
    "remarks": "தானாகவே நின்றுவிட்டது. மறுபடியும் இயக்க முயற்சி செய்தும் இயங்கவில்லை",
    "photo1Url": "https://drive.google.com/file/d/1q3cF0RKnlCT1EuRjspB0LzLw5kKI7pcM/view?usp=drivesdk",
    "photo2Url": "https://drive.google.com/file/d/1sr4yzX4BU8iEcJys7LxwiLwlBmLzZaw9/view?usp=drivesdk",
    "photo3Url": "https://drive.google.com/file/d/1INEnQWxTAWK68DGwHc4b33YiuLri3_Mm/view?usp=drivesdk",
    "photo4Url": "https://drive.google.com/file/d/1AOjC4vH_vBFQYIwWG2_KqLxD-ieF78c2/view?usp=drivesdk",
    "googleDriveFolderUrl": "https://drive.google.com/drive/folders/1LjJOz1jPHdrMUAybrqYbebJnwzq-AY8E",
    "createdAt": "21/08/2026, 10:45:12 am",
    "hmReportPhotoUrl": "",
    "completionPhotoUrl": "",
    "timeline": []
  },
  {
    "ticketId": "HTL-TVR-04101-2",
    "createdDate": "21/8/2026, 10:56:17 am",
    "priority": "Medium",
    "status": "New / Under Review",
    "district": "Thiruvarur",
    "block": "Thiruvarur",
    "schoolName": "PUMS VEPPATHANGUDI",
    "udise": "33200504101",
    "aiName": "Kanimozhi N",
    "phone": "9751885293",
    "issue": "Continuous Beep Sound / Error Warning Light",
    "duration": "1 Month (1 மாதம்)",
    "serialNo": "",
    "remarks": "If the input value low then Ups make beep sound otherwise Ups working properly.",
    "photo1Url": "https://drive.google.com/file/d/1XGVVcM5gk3rUMMTeAcIlrAyEUUt0LjaQ/view?usp=drivesdk",
    "photo2Url": "https://drive.google.com/file/d/1pMyVPaGoXmHpWvFyv-XEuh10cKNB9Lb1/view?usp=drivesdk",
    "photo3Url": "https://drive.google.com/file/d/1-Wtq8rY8v5edezf50un1dx1x5TcNIddw/view?usp=drivesdk",
    "photo4Url": "https://drive.google.com/file/d/1hZruZUKhZR35U028aavYN4usAZ3ghPJ7/view?usp=drivesdk",
    "googleDriveFolderUrl": "https://drive.google.com/drive/folders/1o2BvdSQBQFJ5-XanMUYDFOujEOtx3ioJ",
    "createdAt": "21/08/2026, 10:56:17 am",
    "hmReportPhotoUrl": "",
    "completionPhotoUrl": "",
    "timeline": []
  },
  {
    "ticketId": "HTL-TVR-02102",
    "createdDate": "21/8/2026, 11:00:25 am",
    "priority": "High",
    "status": "New / Under Review",
    "district": "Thiruvarur",
    "block": "Thiruthuraipoondi",
    "schoolName": "PUMS PALAYANKUDI",
    "udise": "33200902102",
    "aiName": "Balapriya Baskaran",
    "phone": "8610894071",
    "issue": "No Battery Backup / Trips Immediately",
    "duration": "1 Month (1 மாதம்)",
    "serialNo": "AVO5KVATNHL20244474",
    "remarks": "Nil",
    "photo1Url": "https://drive.google.com/file/d/1cN5EJckjALo5PXA55NXuIAToQE0xQbH6/view?usp=drivesdk",
    "photo2Url": "https://drive.google.com/file/d/15z-rmQHO7lP8CuAyX6oB7nz_MbD2faoh/view?usp=drivesdk",
    "photo3Url": "https://drive.google.com/file/d/1h98u11q_WRazTmi-H4IGcmNRRbT53I2R/view?usp=drivesdk",
    "photo4Url": "https://drive.google.com/file/d/1suIhC8ApplycieLR4uzx5bE9lfYBbLGQ/view?usp=drivesdk",
    "googleDriveFolderUrl": "https://drive.google.com/drive/folders/1D0R17k1WfpbeFkn-i_naVH_Z9eCxoqLH",
    "createdAt": "21/08/2026, 11:00:25 am",
    "hmReportPhotoUrl": "",
    "completionPhotoUrl": "",
    "timeline": []
  },
  {
    "ticketId": "HTL-TVR-01701-3",
    "createdDate": "21/8/2026, 11:20:11 am",
    "priority": "High",
    "status": "New / Under Review",
    "district": "Thiruvarur",
    "block": "Mannargudi",
    "schoolName": "PUMS THIRURAMESWARAM",
    "udise": "33200601701",
    "aiName": "Rajeshwari Pandian",
    "phone": "9025742224",
    "issue": "No Battery Backup / Trips Immediately",
    "duration": "More than 6 Months (6 மாதங்களுக்கு மேல்)",
    "serialNo": "AV05KVATNHL20254884",
    "remarks": "",
    "photo1Url": "https://drive.google.com/file/d/1pbpRTwn3_KfiK-SkAbPyN3MW8TPDPYSk/view?usp=drivesdk",
    "photo2Url": "https://drive.google.com/file/d/1IuZQEQ-5YlBAr8Up2MNgy8e7no8HvMDu/view?usp=drivesdk",
    "photo3Url": "https://drive.google.com/file/d/1q150v8yRKDCNb_8o-XvfCQHWpNhXG9B8/view?usp=drivesdk",
    "photo4Url": "https://drive.google.com/file/d/1wqpyIetlvzPpvlfcKr7PfSMWxi_ZuCRU/view?usp=drivesdk",
    "googleDriveFolderUrl": "https://drive.google.com/drive/folders/1XBkeLqqXrUbs0zEoXvqKRqfdfjf4h5E5",
    "createdAt": "21/08/2026, 11:20:11 am",
    "hmReportPhotoUrl": "",
    "completionPhotoUrl": "",
    "timeline": []
  },
  {
    "ticketId": "HTL-TVR-04901",
    "createdDate": "21/8/2026, 11:20:50 am",
    "priority": "High",
    "status": "New / Under Review",
    "district": "Thiruvarur",
    "block": "Mannargudi",
    "schoolName": "PUMS VADAPATHI",
    "udise": "33200604901",
    "aiName": "Ragavi Gandhi",
    "phone": "9791426369",
    "issue": "No Battery Backup / Trips Immediately",
    "duration": "6 Months (6 மாதங்கள்)",
    "serialNo": "AV05KVATHL254889",
    "remarks": "",
    "photo1Url": "https://drive.google.com/file/d/1r_TkYnUNOhjyU6SyflZo_g93Oo4o3NV-/view?usp=drivesdk",
    "photo2Url": "https://drive.google.com/file/d/1RFP-UDQ2pWk0VxlmbKgdcJeV98IMjNqJ/view?usp=drivesdk",
    "photo3Url": "https://drive.google.com/file/d/1iF3yRDN9pUtNE8sY7FNA9HqcJwX2znf8/view?usp=drivesdk",
    "photo4Url": "https://drive.google.com/file/d/1Ios_qqP52vTMLEejN0MM0NwtSB25wT3y/view?usp=drivesdk",
    "googleDriveFolderUrl": "https://drive.google.com/drive/folders/1-v6xssgpI1PapHmWiuGG_bCvHZIt_GSw",
    "createdAt": "21/08/2026, 11:20:50 am",
    "hmReportPhotoUrl": "",
    "completionPhotoUrl": "",
    "timeline": []
  },
  {
    "ticketId": "HTL-TVR-01701-2",
    "createdDate": "21/8/2026, 11:35:22 am",
    "priority": "Critical",
    "status": "New / Under Review",
    "district": "Thiruvarur",
    "block": "Nannilam",
    "schoolName": "PUMS THIRUMEEACHUR",
    "udise": "33200401701",
    "aiName": "Renganayaki Govindharajan",
    "phone": "6369055196",
    "issue": "Total Dead / No Power / Lab Off",
    "duration": "More than 6 Months (6 மாதங்களுக்கு மேல்)",
    "serialNo": "AV05KVATNHL20254869",
    "remarks": "UPS Motherboard issue, so we have connected it directly to the power supply",
    "photo1Url": "https://drive.google.com/file/d/1SM4eX2Yvsa8Rn3Pc6Pan1d9JlWAedVvv/view?usp=drivesdk",
    "photo2Url": "https://drive.google.com/file/d/16vocMI-fBAK8M0qCRv8_BqODHNjTEryg/view?usp=drivesdk",
    "photo3Url": "https://drive.google.com/file/d/1-FyZ5px6n7PPJZURzVBu0xW_nlIg6vFR/view?usp=drivesdk",
    "photo4Url": "https://drive.google.com/file/d/18S31ofo2zhsK0ohMebeDrVSDj-UkHfGw/view?usp=drivesdk",
    "googleDriveFolderUrl": "https://drive.google.com/drive/folders/1aom2yRCES6YPCWgfccS_012BP-VGWps-",
    "createdAt": "21/08/2026, 11:35:22 am",
    "hmReportPhotoUrl": "",
    "completionPhotoUrl": "",
    "timeline": []
  },
  {
    "ticketId": "HTL-TVR-00804",
    "createdDate": "21/8/2026, 11:38:29 am",
    "priority": "Medium",
    "status": "New / Under Review",
    "district": "Thiruvarur",
    "block": "Kottur",
    "schoolName": "PUMS NARUVALIKALAPPAL",
    "udise": "33200800804",
    "aiName": "Mahalakshmi",
    "phone": "6369743537",
    "issue": "Other Technical Glitch",
    "duration": "Today (இன்று முதல்)",
    "serialNo": "",
    "remarks": "Ups Not Installed please slove soon as possible",
    "photo1Url": "https://drive.google.com/file/d/18Btjd6G_H6viXeVLPjKmyD2ZZ7fOHRRF/view?usp=drivesdk",
    "photo2Url": "https://drive.google.com/file/d/1i5ynYoXSCvszQuua_v4uSST9fBOTpR6B/view?usp=drivesdk",
    "photo3Url": "https://drive.google.com/file/d/1YqcXmAIEtW6_DLLhJbHFZyxXzlkxAumc/view?usp=drivesdk",
    "photo4Url": "https://drive.google.com/file/d/1DW75fXe22ndNMzNeHJ_J5GavF9DFjE5k/view?usp=drivesdk",
    "googleDriveFolderUrl": "https://drive.google.com/drive/folders/1-Wo7-9S4SYHceANPfVVFZ9hhU1Be1e9C",
    "createdAt": "21/08/2026, 11:38:29 am",
    "hmReportPhotoUrl": "",
    "completionPhotoUrl": "",
    "timeline": []
  },
  {
    "ticketId": "HTL-TVR-03002",
    "createdDate": "21/8/2026, 11:55:25 am",
    "priority": "High",
    "status": "New / Under Review",
    "district": "Thiruvarur",
    "block": "Thiruvarur",
    "schoolName": "PUMS KOMAL",
    "udise": "33200503002",
    "aiName": "Thamilmani Elango",
    "phone": "7708233032",
    "issue": "Isolation Transformer / MCB Tripping",
    "duration": "More than 6 Months (6 மாதங்களுக்கு மேல்)",
    "serialNo": "",
    "remarks": "Isolation Transformer fault இது தனியாக உள்ளது. Direction connection ups with  mcb box ",
    "photo1Url": "https://drive.google.com/file/d/1_RzwnxxuaXcxJWSFoJlFTXvosWQl8Xq_/view?usp=drivesdk",
    "photo2Url": "https://drive.google.com/file/d/1C8maedHXDQLBnJBfh02x2S10uVyhJRBI/view?usp=drivesdk",
    "photo3Url": "https://drive.google.com/file/d/1sh1_cLWpUbUSeslv5ei8ylpNHoiFD1YM/view?usp=drivesdk",
    "photo4Url": "https://drive.google.com/file/d/1YYJVNp66-1P1f5BnzKg7XKHhCx26j_B-/view?usp=drivesdk",
    "googleDriveFolderUrl": "https://drive.google.com/drive/folders/1ZM5ZscE1ZbtptTLFy4P8iVEbLyHPXoZ7",
    "createdAt": "21/08/2026, 11:55:25 am",
    "hmReportPhotoUrl": "",
    "completionPhotoUrl": "",
    "timeline": []
  },
  {
    "ticketId": "HTL-TVR-01401",
    "createdDate": "21/8/2026, 12:18:32 pm",
    "priority": "High",
    "status": "New / Under Review",
    "district": "Thiruvarur",
    "block": "Valangaiman",
    "schoolName": "PUMS KOTTAIYUR",
    "udise": "33200101401",
    "aiName": "Priya Jayabal",
    "phone": "6382311947",
    "issue": "No Battery Backup / Trips Immediately",
    "duration": "More than 6 Months (6 மாதங்களுக்கு மேல்)",
    "serialNo": "AVO5KVATNHL20244305",
    "remarks": "Continuous beep sound also",
    "photo1Url": "https://drive.google.com/thumbnail?id=161hZluU9ucJdeBU-8GKpECtfAiUUrude&sz=w800",
    "photo2Url": "https://drive.google.com/thumbnail?id=1Fr6zlamLP0M8yJSsUzVuRof6XFeqQnyl&sz=w800",
    "photo3Url": "https://drive.google.com/thumbnail?id=15hDIq_wDVUsIQypzN2pKBU95Y_1PPEbA&sz=w800",
    "photo4Url": "https://drive.google.com/thumbnail?id=1sMd7YKpua0JGlcMT2vlgCDSbGW2WDjhL&sz=w800",
    "googleDriveFolderUrl": "https://drive.google.com/drive/folders/1pdDY9-EijjWcz3dCT-RDQHicGtejnmzL",
    "createdAt": "21/08/2026, 12:18:32 pm",
    "hmReportPhotoUrl": "",
    "completionPhotoUrl": "",
    "timeline": []
  },
  {
    "ticketId": "HTL-TVR-01402",
    "createdDate": "21/8/2026, 12:42:22 pm",
    "priority": "Medium",
    "status": "New / Under Review",
    "district": "Thiruvarur",
    "block": "Thiruthuraipoondi",
    "schoolName": "Ghss Nedumbalam",
    "udise": "33200901402",
    "aiName": "Buvaneswari kannadasan",
    "phone": "9688450231",
    "issue": "Continuous Beep Sound / Error Warning Light",
    "duration": "More than 6 Months (6 மாதங்களுக்கு மேல்)",
    "serialNo": "AVO5KVATNHL20244449",
    "remarks": "",
    "photo1Url": "https://drive.google.com/thumbnail?id=1QdFiQuzSLeIXPAAEn-Tc1PudbNYpqc4Z&sz=w800",
    "photo2Url": "https://drive.google.com/thumbnail?id=161u5ntACazNuyV6YU28OgHqw6zVvyQjx&sz=w800",
    "photo3Url": "https://drive.google.com/thumbnail?id=1DdLphw_6Cpbr3yteFZ1bCfdTEuLyd7Y8&sz=w800",
    "photo4Url": "https://drive.google.com/thumbnail?id=1Gq0GqRl_sRtou_LOwLkV2EbMeZRB7QP7&sz=w800",
    "googleDriveFolderUrl": "https://drive.google.com/drive/folders/1rOhE9SGA0sivwgC59NaenoN8yBj9T7WV",
    "createdAt": "21/08/2026, 12:42:22 pm",
    "hmReportPhotoUrl": "",
    "completionPhotoUrl": "",
    "timeline": []
  },
  {
    "ticketId": "HTL-TVR-04601",
    "createdDate": "21/8/2026, 12:47:14 pm",
    "priority": "Medium",
    "status": "New / Under Review",
    "district": "Thiruvarur",
    "block": "Kottur",
    "schoolName": "PUMS VALLUR",
    "udise": "33200804601",
    "aiName": "Vijitha Bharathi",
    "phone": "9786615968",
    "issue": "Continuous Beep Sound / Error Warning Light",
    "duration": "Today (இன்று முதல்)",
    "serialNo": "",
    "remarks": "Power on செய்து இருக்கும் பொழுதும் UPS சில நேரங்களில் Beep sound வருகிறது",
    "photo1Url": "https://drive.google.com/thumbnail?id=1PEfztivvVKbo-xb_E_GcCTZVEGcqh-8C&sz=w800",
    "photo2Url": "https://drive.google.com/thumbnail?id=1A0gVEoFalFvGSeNgkJxaJDLipqlYIAAu&sz=w800",
    "photo3Url": "https://drive.google.com/thumbnail?id=12-YTZ9Sb7CVhW86zVO060VfgUjlV3XQp&sz=w800",
    "photo4Url": "https://drive.google.com/thumbnail?id=1d8KjpLGm0Vvorsd5zVjZ4yaNRIqvqDgF&sz=w800",
    "googleDriveFolderUrl": "https://drive.google.com/drive/folders/13S3U0NPV2sjuXoLjuqN8neBv8vQi3PSA",
    "createdAt": "21/08/2026, 12:47:14 pm",
    "hmReportPhotoUrl": "",
    "completionPhotoUrl": "",
    "timeline": []
  },
  {
    "ticketId": "HTL-TVR-01601",
    "createdDate": "21/8/2026, 1:15:44 pm",
    "priority": "Critical",
    "status": "New / Under Review",
    "district": "Thiruvarur",
    "block": "Nannilam",
    "schoolName": "PUMS POZHAKUDI",
    "udise": "33200401601",
    "aiName": "Sathiya",
    "phone": "6382805484",
    "issue": "Total Dead / No Power / Lab Off",
    "duration": "Today (இன்று முதல்)",
    "serialNo": "AV05KVATNHL20254867",
    "remarks": "UPS MOTHERBOARD ISSUE ",
    "photo1Url": "https://drive.google.com/thumbnail?id=1ZgR72ZaZMdEhhv28qIuX1ke6SKcPg5Dz&sz=w800",
    "photo2Url": "https://drive.google.com/thumbnail?id=1chQzOvfWWwAQvO9GbSTkCLQ0nH6ar603&sz=w800",
    "photo3Url": "https://drive.google.com/thumbnail?id=1VW7XEg4UvIrbCGzPUugwy6qJogsosEYj&sz=w800",
    "photo4Url": "https://drive.google.com/thumbnail?id=1ZQt6mZ0LNBlAWbOqyUQu1sppDh3hY1T2&sz=w800",
    "googleDriveFolderUrl": "https://drive.google.com/drive/folders/1MuXJP3aPlKmEU4pK2pMNhpzKQ8Zbt6ya",
    "createdAt": "21/08/2026, 01:15:44 pm",
    "hmReportPhotoUrl": "",
    "completionPhotoUrl": "",
    "timeline": []
  },
  {
    "ticketId": "HTL-TVR-02701",
    "createdDate": "21/8/2026, 2:15:18 pm",
    "priority": "Medium",
    "status": "New / Under Review",
    "district": "Thiruvarur",
    "block": "Valangaiman",
    "schoolName": "PUMS PADAGACHERI",
    "udise": "33200102701",
    "aiName": "Vinoragavi Dhakshinamoorthy",
    "phone": "9944836934",
    "issue": "Continuous Beep Sound / Error Warning Light",
    "duration": "2 Weeks (2 வாரங்கள்)",
    "serialNo": "AVO5KVATNHL20244485",
    "remarks": "",
    "photo1Url": "https://drive.google.com/thumbnail?id=1P2wO9Ce5VCdiaIJnySOsH4ggifztZeI-&sz=w800",
    "photo2Url": "https://drive.google.com/thumbnail?id=1UK4YJUZxbon-aic2c9IUxXcXGvB2ka7U&sz=w800",
    "photo3Url": "https://drive.google.com/thumbnail?id=1PrVA86sm0mZpMJG2GmeSR8mUsYUE0jf4&sz=w800",
    "photo4Url": "https://drive.google.com/thumbnail?id=1eQbI213QnOGLQOVIT1iocQ2nOsrmJY6O&sz=w800",
    "googleDriveFolderUrl": "https://drive.google.com/drive/folders/1-w5PqPtxSfJQ0q2hQiuFea_14ASxQfxb",
    "createdAt": "21/08/2026, 02:15:18 pm",
    "hmReportPhotoUrl": "",
    "completionPhotoUrl": "",
    "timeline": []
  },
  {
    "ticketId": "HTL-TVR-01901-2",
    "createdDate": "21/8/2026, 2:37:19 pm",
    "priority": "Critical",
    "status": "New / Under Review",
    "district": "Thiruvarur",
    "block": "Kottur",
    "schoolName": "PUMS MAVATTAKUDI",
    "udise": "33200801901",
    "aiName": "Vinitha Veeraselvam",
    "phone": "9597619341",
    "issue": "Total Dead / No Power / Lab Off",
    "duration": "More than 6 Months (6 மாதங்களுக்கு மேல்)",
    "serialNo": "AVO5KVATNHL20256778",
    "remarks": "இணைய இணைப்பு இல்லாத காரணத்தால் இதுவரை Hi Tech Lab செயல்படவில்லை.கடந்த ஒரு மாதமாக இணைய இணைப்பு உள்ளது. ஆனால் யுபிஎஸ் மற்றும் பிரேக்கர் வேலை செய்யவில்லை. ",
    "photo1Url": "https://drive.google.com/thumbnail?id=17pcGwdskorU9i__KaZqZoi0W2X1I0SKE&sz=w800",
    "photo2Url": "https://drive.google.com/thumbnail?id=1M7YFQJvq9jfJRbzw4fRDIbmlaN1UpSCJ&sz=w800",
    "photo3Url": "https://drive.google.com/thumbnail?id=1cfS7Sx-PQv0S3JNtKcxdiL-3yvRf14b7&sz=w800",
    "photo4Url": "https://drive.google.com/thumbnail?id=1l5_tXbcSSuEccy1xKNYCsWU_VIyUCqD0&sz=w800",
    "googleDriveFolderUrl": "https://drive.google.com/drive/folders/1ecJm17ZvF3NBWD-P0fG60Wm57LOJEK35",
    "createdAt": "21/08/2026, 02:37:19 pm",
    "hmReportPhotoUrl": "",
    "completionPhotoUrl": "",
    "timeline": []
  }
];

const DUMMY_TEST_IDS = new Set(["HTL-TVR-99999", "TEST-PING-001"]);

// ========================================================
// GOOGLE SHEETS / DRIVE CLOUD DATABASE ENGINE
// ========================================================
const GOOGLE_APPS_SCRIPT_ENDPOINT = process.env.GOOGLE_APPS_SCRIPT_ENDPOINT || 'https://script.google.com/macros/s/AKfycbxAxg_pWmpqz9C6WloGqW7a_v27bCsUC4QYlLCnJtBVY8B3JKtUu8eTYEupTlftJJY5/exec';

function fetchGasApi(url, method = 'GET', payload = null) {
  return new Promise((resolve) => {
    try {
      const https = require('https');
      const parsed = new URL(url);
      const options = {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        method: method,
        timeout: 10000,
        headers: { 'User-Agent': 'HTL-Database-Engine/2.0' }
      };
      let postData = null;
      if (payload && method === 'POST') {
        postData = JSON.stringify(payload);
        options.headers['Content-Type'] = 'application/json';
        options.headers['Content-Length'] = Buffer.byteLength(postData);
      }
      const req = https.request(options, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          // Following redirect from Google Apps Script Web App must be GET
          return resolve(fetchGasApi(res.headers.location, 'GET', null));
        }
        let data = '';
        res.on('data', c => data += c);
        res.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch(e) {
            resolve(null);
          }
        });
      });
      req.on('error', () => resolve(null));
      req.on('timeout', () => { req.destroy(); resolve(null); });
      if (postData) req.write(postData);
      req.end();
    } catch(e) {
      resolve(null);
    }
  });
}

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const ExcelJS = require('exceljs');

const os = require('os');
const isServerless = !!(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || __dirname.includes('/var/task') || __dirname.includes('\\var\\task'));
const BUNDLED_DATA_DIR = path.join(__dirname, 'data');
const TMP_DATA_DIR = path.join(os.tmpdir(), 'tvr_data');
const DATA_DIR = isServerless ? TMP_DATA_DIR : BUNDLED_DATA_DIR;
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');
const BUNDLED_DB_FILE = path.join(BUNDLED_DATA_DIR, 'htl_itsm_tickets.json');
const DB_FILE = path.join(DATA_DIR, 'htl_itsm_tickets.json');
const CSV_FILE = path.join(DATA_DIR, 'Thiruvarur_HTL_Service_Desk_Master.csv');
const AUDIT_LOG_FILE = path.join(DATA_DIR, 'audit_log.json');
const SCHOOLS_FILE = path.join(BUNDLED_DATA_DIR, 'master_schools_182.json');

try { if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (e) {}
try { if (!fs.existsSync(BACKUPS_DIR)) fs.mkdirSync(BACKUPS_DIR, { recursive: true }); } catch (e) {}
try { if (!fs.existsSync(TMP_DATA_DIR)) fs.mkdirSync(TMP_DATA_DIR, { recursive: true }); } catch (e) {}

const PERMANENT_TOMBSTONES = new Set([
  'HTL-TVR-P29-8180', 'HTL-TVR-P32-TEST', 'HTL-TVR-P31-TEST', 'HTL-TVR-P29-2662',
  'HTL-TVR-P30-TEST', 'HTL-TVR-P29-7349', 'HTL-TVR-P29-7446', 'HTL-TVR-P29-5529',
  'HTL-TVR-P29-3441', 'HTL-TVR-P29-6413', 'HTL-TVR-P29-5135', 'HTL-NGP-00999',
  'HTL-NGP-00901-2', 'HTL-NGP-00902', 'HTL-TVR-99991', 'HTL-TVR-99999', 'TEST-PING-001',
  'HTL-TVR-79635', 'HTL-TVR-19731', 'HTL-TVR-30463', 'HTL-TVR-49118', 'HTL-TVR-13133',
  'HTL-TVR-44425', 'HTL-TVR-19714', 'HTL-TVR-88239', 'HTL-TVR-38414',
  'HTL-TVR-30090', 'HTL-TVR-50210', 'HTL-TVR-12543', 'HTL-TVR-13043', 'HTL-TVR-29010',
  'HTL-TVR-00101-4', 'HTL-TVR-00101-3', 'HTL-TVR-00101-2',
  'HTL-TVR-AUDIT-8923', 'HTL-TVR-AUDIT-1283', 'HTL-TVR-05301-TMP-9639',
  'HTL-TVR-05301-MOCK-8577',
  'HTL-TVR-28539', 'HTL-TVR-71082', 'HTL-TVR-68753', 'HTL-TVR-84699', 'HTL-TVR-35771', 'HTL-TVR-30829',
  'HTL-TVR-45144', 'HTL-TVR-64993', 'HTL-TVR-59826', 'HTL-TVR-52089', 'HTL-TVR-96361',
  'HTL-TVR-58319', 'HTL-TVR-54608', 'HTL-TVR-18851', 'HTL-TVR-42071', 'HTL-TVR-24349', 'HTL-TVR-91926'
]);

const KNOWN_TEST_PURGED_IDS = new Set([
  'HTL-TVR-28539', 'HTL-TVR-71082', 'HTL-TVR-68753', 'HTL-TVR-84699', 'HTL-TVR-35771', 'HTL-TVR-30829'
].map(s => s.toLowerCase()));

let inMemoryTickets = null;
let deletedTicketIds = new Set();
PERMANENT_TOMBSTONES.forEach(id => {
  deletedTicketIds.add(id);
  deletedTicketIds.add(id.toLowerCase());
});
KNOWN_TEST_PURGED_IDS.forEach(id => {
  deletedTicketIds.add(id);
  PERMANENT_TOMBSTONES.add(id);
});

function extractDriveFileId(url) {
  if (!url || typeof url !== 'string') return '';
  const u = url.trim();
  if (!u || u === 'No Photo') return '';
  if (u.includes('drive.google.com/file/d/')) {
    const parts = u.split('drive.google.com/file/d/')[1];
    return parts.split('/')[0].split('?')[0];
  }
  if (u.includes('googleusercontent.com/d/')) {
    const parts = u.split('googleusercontent.com/d/')[1];
    return parts.split('=')[0].split('?')[0].split('/')[0];
  }
  if (u.includes('id=')) {
    const parts = u.split('id=')[1];
    if (parts) return parts.split('&')[0].split('/')[0];
  }
  if (/^[a-zA-Z0-9_-]{25,45}$/.test(u)) {
    return u;
  }
  return '';
}

function reloadTombstonesFromDisk() {
  try {
    const delFiles = [
      path.join(DATA_DIR, 'htl_deleted_ids.json'),
      path.join(BUNDLED_DATA_DIR, 'htl_deleted_ids.json'),
      path.join(TMP_DATA_DIR, 'htl_deleted_ids.json'),
      path.join(os.tmpdir(), 'htl_deleted_ids.json')
    ];
    delFiles.forEach(f => {
      if (fs.existsSync(f)) {
        try {
          const savedDeleted = JSON.parse(fs.readFileSync(f, 'utf8'));
          if (Array.isArray(savedDeleted)) {
            savedDeleted.forEach(id => {
              const clean = String(id || '').trim();
              if (clean) {
                deletedTicketIds.add(clean);
                PERMANENT_TOMBSTONES.add(clean);
                deletedTicketIds.add(clean.toLowerCase());
                PERMANENT_TOMBSTONES.add(clean.toLowerCase());
              }
            });
          }
        } catch(e) {}
      }
    });
    console.log(`🛡️ [ANTI-RESURRECTION] Loaded ${deletedTicketIds.size} permanently deleted ticket tombstones into memory guard.`);
  } catch(e) {}
}

reloadTombstonesFromDisk();

function safeWriteFileSync(filePath, data, encoding = 'utf8') {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, data, encoding);
  } catch (err) {
    try {
      const tmpPath = path.join(os.tmpdir(), path.basename(filePath));
      const tmpDir = path.dirname(tmpPath);
      if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
      fs.writeFileSync(tmpPath, data, encoding);
    } catch (e) {}
  }
}

function persistTombstones() {
  try {
    const delArr = Array.from(deletedTicketIds);
    safeWriteFileSync(path.join(DATA_DIR, 'htl_deleted_ids.json'), JSON.stringify(delArr, null, 2), 'utf8');
    if (BUNDLED_DATA_DIR !== DATA_DIR) {
      safeWriteFileSync(path.join(BUNDLED_DATA_DIR, 'htl_deleted_ids.json'), JSON.stringify(delArr, null, 2), 'utf8');
    }
    safeWriteFileSync(path.join(os.tmpdir(), 'htl_deleted_ids.json'), JSON.stringify(delArr, null, 2), 'utf8');
    safeWriteFileSync(path.join(TMP_DATA_DIR, 'htl_deleted_ids.json'), JSON.stringify(delArr, null, 2), 'utf8');
  } catch(e) {}
}

function addDeletedTombstones(ids) {
  if (!ids) return;
  if (!Array.isArray(ids)) ids = [ids];
  let changed = false;
  ids.forEach(id => {
    const clean = String(id || '').trim();
    if (clean && !deletedTicketIds.has(clean)) {
      deletedTicketIds.add(clean);
      PERMANENT_TOMBSTONES.add(clean);
      deletedTicketIds.add(clean.toLowerCase());
      PERMANENT_TOMBSTONES.add(clean.toLowerCase());
      changed = true;
    }
  });
  if (changed) {
    persistTombstones();
  }
}

function isDeleted(ticketId) {
  if (!ticketId) return false;
  const clean = String(ticketId).trim();
  const lower = clean.toLowerCase();
  return deletedTicketIds.has(clean) || PERMANENT_TOMBSTONES.has(clean) ||
         deletedTicketIds.has(lower) || PERMANENT_TOMBSTONES.has(lower) ||
         KNOWN_TEST_PURGED_IDS.has(lower);
}

let masterSchools = [];
try {
  masterSchools = require('./data/master_schools_182.json');
} catch(e) {
  if (fs.existsSync(SCHOOLS_FILE)) {
    try { masterSchools = JSON.parse(fs.readFileSync(SCHOOLS_FILE, 'utf8')); } catch(err) { masterSchools = []; }
  }
}

function normalizePriority(val, issueText) {
  const v = (val || '').trim().toLowerCase();
  const issue = (issueText || '').toLowerCase();
  if (v.includes('crit') || issue.includes('dead') || issue.includes('not power') || issue.includes('lab off')) return 'Critical';
  if (v.includes('high') || issue.includes('no battery') || issue.includes('no backup') || issue.includes('trip') || issue.includes('swollen') || issue.includes('smell')) return 'High';
  if (v.includes('low') || issue.includes('minor') || issue.includes('display only')) return 'Low';
  return 'Medium';
}

let pool = null;
let usePostgres = false;

if (process.env.DATABASE_URL) {
  try {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false }
    });
    usePostgres = true;
    console.log('🐘 PostgreSQL / Neon connection pool initialized with DATABASE_URL (SSL Enabled).');
  } catch (err) {
    console.error('❌ Failed to initialize PostgreSQL/Neon pool:', err.message);
    usePostgres = false;
  }
} else {
  console.log('ℹ️ DATABASE_URL not set. Running in local JSON persistence mode.');
}

function isTestOrPurgedTicket(t) {
  if (!t || !t.ticketId) return true;
  const tid = String(t.ticketId).trim();
  const tidLower = tid.toLowerCase();
  const name = String(t.schoolName || '').toLowerCase();
  const iss = String(t.issue || '').toLowerCase();
  const rem = String(t.remarks || '').toLowerCase();

  // 1. Permanent Tombstones & Deleted Status
  if (isDeleted(tid)) return true;
  const u = String(t.udise || '').trim();
  const dt = String(t.createdDate || t.createdAt || '').trim();
  if (u && dt) {
    if (deletedTicketIds.has(`${u}_${dt}`) || PERMANENT_TOMBSTONES.has(`${u}_${dt}`)) return true;
    const normDt = normalizeTicketDate(dt);
    if (normDt && (deletedTicketIds.has(`${u}_${normDt}`) || PERMANENT_TOMBSTONES.has(`${u}_${normDt}`))) return true;
  }

  // 2. Test ID Patterns (never authentic calls)
  if (
    tidLower.includes('test') ||
    tidLower.includes('audit') ||
    tidLower.includes('simulation') ||
    tidLower.includes('dummy') ||
    tidLower.includes('ping') ||
    tidLower.includes('tmp') ||
    tidLower.includes('mock') ||
    tidLower.includes('-p29-') ||
    tidLower.includes('-p30-') ||
    tidLower.includes('-p31-') ||
    tidLower.includes('-p32-') ||
    tidLower.includes('-p33-') ||
    tidLower.includes('9999') ||
    tidLower === 'htl-ngp-00999' ||
    tidLower === 'htl-ngp-00902' ||
    (tidLower.startsWith('htl-tvr-00101-') && tidLower !== 'htl-tvr-00101')
  ) return true;

  // 3. Test School Name Patterns
  if (
    name.includes('test') ||
    name.includes('simulation') ||
    name.includes('dummy') ||
    name.includes('audit lab') ||
    name === 'test'
  ) return true;

  // 4. Test Issue Patterns
  if (
    iss.includes('simulation') ||
    iss.includes('test call') ||
    iss.includes('local ingestion test') ||
    iss.includes('phase 27 completion evidence') ||
    iss.includes('ai teacher completion test') ||
    iss === 'test'
  ) return true;

  return false;
}

function loadTicketsFromJson() {
  let list = [];
  if (fs.existsSync(DB_FILE)) {
    try {
      const b = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
      if (Array.isArray(b) && b.length > 0) list = b;
    } catch(e) {}
  }
  if (list.length === 0 && fs.existsSync(BUNDLED_DB_FILE)) {
    try {
      const b = JSON.parse(fs.readFileSync(BUNDLED_DB_FILE, 'utf8'));
      if (Array.isArray(b) && b.length > 0) list = b;
    } catch(e) {}
  }
  // Strictly filter out any deleted or tombstoned tickets
  list = list.filter(t => t && t.ticketId && !isDeleted(t.ticketId) && !isTestOrPurgedTicket(t));

  // Always ensure all authentic embedded tickets are present in memory (unless deleted or test)
  const localIds = new Set(list.map(t => String(t.ticketId).trim().toLowerCase()));
  EMBEDDED_AUTHENTIC_TICKETS.forEach(bt => {
    const bId = String(bt.ticketId).trim();
    if (isDeleted(bId) || isTestOrPurgedTicket(bt)) return;
    if (!localIds.has(bId.toLowerCase())) {
      list.push(bt);
      localIds.add(bId.toLowerCase());
    }
  });

  // Deduplicate and filter out any simulation/dummy tests
  const seenUnique = new Set();
  const cleanList = [];

  list.forEach(t => {
    if (!t || !t.ticketId || isTestOrPurgedTicket(t) || isDeleted(t.ticketId)) return;

    const issue = String(t.issue || '').toLowerCase();
    const remarks = String(t.remarks || '').toLowerCase();
    if (issue.includes('simulation') || remarks.includes('simulation')) return;

    const u = String(t.udise || '').trim();
    const dt = String(t.createdDate || t.createdAt || '').trim();
    const uniqueKey = u ? `${u}_${dt}` : String(t.ticketId).trim();

    if (!seenUnique.has(uniqueKey)) {
      seenUnique.add(uniqueKey);
      cleanList.push(t);
    }
  });

  return cleanList;
}

// Synchronous version for Google Sheets sync (serverless-safe: reads from DB_FILE directly)
function getAllTicketsSync() {
  return loadTicketsFromJson();
}

function saveTicketsToJson(list) {
  safeWriteFileSync(DB_FILE, JSON.stringify(list, null, 2), 'utf8');
  try {
    if (fs.existsSync(BUNDLED_DB_FILE) && BUNDLED_DB_FILE !== DB_FILE) {
      safeWriteFileSync(BUNDLED_DB_FILE, JSON.stringify(list, null, 2), 'utf8');
    }
  } catch(e) {}
  const headers = [
    'Ticket ID', 'Created At', 'Priority', 'Status', 'Resolution Category', 'District', 'Block', 'School Name', 'UDISE Code',
    'AI Instructor Name', 'AI Instructor Mobile Number', 'Reported UPS Issue', 'Duration', 'UPS Serial Number',
    'Resolution Type', 'Vendor Name', 'Vendor Ticket No', 'Parts Required', 'Resolution Notes',
    'Resolved At', 'Photo 1 (Front Panel)', 'Photo 2 (Overall UPS)', 'Photo 3 (Battery/MCB)', 'Photo 4 (Isolation Transformer)', 'Activity Log History'
  ];
  const rows = list.map(t => [
    '"' + (t.ticketId || '') + '"',
    '"' + (t.createdAt || '') + '"',
    '"' + normalizePriority(t.priority, t.issue) + '"',
    '"' + (t.status || 'New / Under Review') + '"',
    '"' + (t.resolutionCategory || 'Pending') + '"',
    '"' + (t.district || 'Thiruvarur') + '"',
    '"' + (t.block || '') + '"',
    '"' + (t.schoolName || '').replace(/"/g, '""') + '"',
    '"' + (t.udise || '') + '"',
    '"' + (t.aiName || '').replace(/"/g, '""') + '"',
    '"' + (t.phone || '') + '"',
    '"' + (t.issue || '').replace(/"/g, '""') + '"',
    '"' + (t.duration || '') + '"',
    '"' + (t.serialNo || '') + '"',
    '"' + (t.resolutionType || '') + '"',
    '"' + (t.vendorName || '') + '"',
    '"' + (t.vendorTicketNo || '') + '"',
    '"' + (t.partsRequired || '').replace(/"/g, '""') + '"',
    '"' + (t.resolutionNotes || '').replace(/"/g, '""') + '"',
    '"' + (t.resolvedAt || '') + '"',
    '"' + (t.photo1 || 'No Photo') + '"',
    '"' + (t.photo2 || 'No Photo') + '"',
    '"' + (t.photo3 || 'No Photo') + '"',
    '"' + (t.photo4 || 'No Photo') + '"',
    '"' + (t.photo4 || 'No Photo') + '"',
    '"' + (t.timeline || []).map(e => '[' + e.time + '] ' + e.action + ': ' + e.note).join(' | ').replace(/"/g, '""') + '"'
  ]);
  const csvContent = '﻿' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
  safeWriteFileSync(CSV_FILE, csvContent, 'utf8');
  // Removed hardcoded developer path — CSV is saved to DATA_DIR only
}

function mapRowToTicket(r) {
  return {
    ticketId: r.ticket_id,
    createdAt: r.created_date || (r.created_at ? new Date(r.created_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }) : ''),
    createdDate: r.created_date || '',
    priority: r.priority,
    status: r.status,
    resolutionCategory: r.resolution_category,
    district: r.district || 'Thiruvarur',
    block: r.block || '',
    schoolId: r.school_id || '',
    schoolName: r.school_name || '',
    udise: r.udise_code || '',
    aiName: r.ai_instructor_name || '',
    phone: r.ai_instructor_mobile || '',
    issue: r.reported_issue || '',
    duration: r.duration || '',
    serialNo: r.ups_serial_number || '',
    resolutionType: r.resolution_type || '',
    vendorName: r.vendor_name || '',
    vendorTicketNo: r.vendor_ticket_no || '',
    partsRequired: r.parts_required || '',
    resolutionNotes: r.resolution_notes || '',
    resolvedAt: r.resolved_at || '',
    visitDate: r.visit_date || '',
    visitTime: r.visit_time || '',
    diagnosisType: r.diagnosis_type || '',
    actionTaken: r.action_taken || '',
    batteryCondition: r.battery_condition || '',
    photo1Url: r.photo1_data || '',
    photo2Url: r.photo2_data || '',
    photo3Url: r.photo3_data || '',
    photo4Url: r.photo4_data || '',
    hmReportPhotoUrl: r.hm_report_photo_url || '',
    completionPhotoUrl: r.completion_photo_url || '',
    hmDriveFileId: r.hm_drive_file_id || '',
    compDriveFileId: r.comp_drive_file_id || '',
    p1DriveFileId: r.p1_drive_file_id || '',
    p2DriveFileId: r.p2_drive_file_id || '',
    p3DriveFileId: r.p3_drive_file_id || '',
    p4DriveFileId: r.p4_drive_file_id || '',
    p1DriveUrl: r.p1_drive_url || '',
    p2DriveUrl: r.p2_drive_url || '',
    p3DriveUrl: r.p3_drive_url || '',
    p4DriveUrl: r.p4_drive_url || '',
    hmReportPhotoBase64: r.hm_report_photo_base64 || '',
    completionPhotoBase64: r.completion_photo_base64 || '',
    completionEvidence: r.completion_evidence || null,
    completionEvidenceStatus: r.completion_evidence_status || '',
    completionEvidenceRequested: !!r.completion_evidence_requested,
    completionEvidenceRequestedAt: r.completion_evidence_requested_at || '',
    completionEvidenceRequestedBy: r.completion_evidence_requested_by || '',
    completionDate: r.completion_date || '',
    completedBy: r.completed_by || '',
    gpsLatitude: r.gps_latitude || null,
    gpsLongitude: r.gps_longitude || null,
    gpsAccuracy: r.gps_accuracy || null,
    gpsTimestamp: r.gps_timestamp || '',
    googleDriveFolderUrl: r.drive_folder_url || '',
    remarks: r.remarks || '',
    timeline: r.activity_log || []
  };
}

async function initDatabase() {
  if (!usePostgres || !pool) return;
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS tickets (
        ticket_id TEXT PRIMARY KEY,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_date TEXT,
        priority TEXT NOT NULL CHECK (priority IN ('Critical', 'High', 'Medium', 'Low')),
        status TEXT NOT NULL DEFAULT 'New / Under Review',
        resolution_category TEXT DEFAULT 'Pending',
        district TEXT DEFAULT 'Thiruvarur',
        block TEXT,
        school_id TEXT,
        school_name TEXT NOT NULL,
        udise_code TEXT,
        ai_instructor_name TEXT,
        ai_instructor_mobile TEXT,
        reported_issue TEXT,
        duration TEXT,
        ups_serial_number TEXT,
        resolution_type TEXT,
        vendor_name TEXT,
        vendor_ticket_no TEXT,
        parts_required TEXT,
        resolution_notes TEXT,
        resolved_at TEXT,
        photo1_data TEXT,
        photo2_data TEXT,
        photo3_data TEXT,
        photo4_data TEXT,
        remarks TEXT,
        activity_log JSONB DEFAULT '[]'::jsonb
      );
      CREATE INDEX IF NOT EXISTS idx_tickets_udise ON tickets(udise_code);
      CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
      ALTER TABLE tickets ADD COLUMN IF NOT EXISTS photo4_data TEXT;
      ALTER TABLE tickets ADD COLUMN IF NOT EXISTS visit_date TEXT;
      ALTER TABLE tickets ADD COLUMN IF NOT EXISTS visit_time TEXT;
      ALTER TABLE tickets ADD COLUMN IF NOT EXISTS diagnosis_type TEXT;
      ALTER TABLE tickets ADD COLUMN IF NOT EXISTS action_taken TEXT;
      ALTER TABLE tickets ADD COLUMN IF NOT EXISTS battery_condition TEXT;
      ALTER TABLE tickets ADD COLUMN IF NOT EXISTS hm_report_photo_url TEXT;
      ALTER TABLE tickets ADD COLUMN IF NOT EXISTS completion_photo_url TEXT;
      ALTER TABLE tickets ADD COLUMN IF NOT EXISTS hm_report_photo_base64 TEXT;
      ALTER TABLE tickets ADD COLUMN IF NOT EXISTS completion_photo_base64 TEXT;
      ALTER TABLE tickets ADD COLUMN IF NOT EXISTS completion_evidence JSONB;
      ALTER TABLE tickets ADD COLUMN IF NOT EXISTS completion_evidence_status TEXT;
      ALTER TABLE tickets ADD COLUMN IF NOT EXISTS completion_evidence_requested BOOLEAN;
      ALTER TABLE tickets ADD COLUMN IF NOT EXISTS completion_evidence_requested_at TEXT;
      ALTER TABLE tickets ADD COLUMN IF NOT EXISTS completion_evidence_requested_by TEXT;
      ALTER TABLE tickets ADD COLUMN IF NOT EXISTS completion_date TEXT;
      ALTER TABLE tickets ADD COLUMN IF NOT EXISTS completed_by TEXT;
      ALTER TABLE tickets ADD COLUMN IF NOT EXISTS gps_latitude DOUBLE PRECISION;
      ALTER TABLE tickets ADD COLUMN IF NOT EXISTS gps_longitude DOUBLE PRECISION;
      ALTER TABLE tickets ADD COLUMN IF NOT EXISTS gps_accuracy DOUBLE PRECISION;
      ALTER TABLE tickets ADD COLUMN IF NOT EXISTS gps_timestamp TEXT;
      ALTER TABLE tickets ADD COLUMN IF NOT EXISTS hm_drive_file_id TEXT;
      ALTER TABLE tickets ADD COLUMN IF NOT EXISTS comp_drive_file_id TEXT;
      ALTER TABLE tickets ADD COLUMN IF NOT EXISTS p1_drive_file_id TEXT;
      ALTER TABLE tickets ADD COLUMN IF NOT EXISTS p2_drive_file_id TEXT;
      ALTER TABLE tickets ADD COLUMN IF NOT EXISTS p3_drive_file_id TEXT;
      ALTER TABLE tickets ADD COLUMN IF NOT EXISTS p4_drive_file_id TEXT;
      ALTER TABLE tickets ADD COLUMN IF NOT EXISTS p1_drive_url TEXT;
      ALTER TABLE tickets ADD COLUMN IF NOT EXISTS p2_drive_url TEXT;
      ALTER TABLE tickets ADD COLUMN IF NOT EXISTS p3_drive_url TEXT;
      ALTER TABLE tickets ADD COLUMN IF NOT EXISTS p4_drive_url TEXT;
      ALTER TABLE tickets ADD COLUMN IF NOT EXISTS drive_folder_url TEXT;
      DELETE FROM tickets WHERE reported_issue ILIKE '%simulation%' OR remarks ILIKE '%simulation%';
      CREATE TABLE IF NOT EXISTS audit_log (
        id SERIAL PRIMARY KEY,
        timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        formatted_time TEXT,
        ip TEXT,
        action TEXT NOT NULL,
        username TEXT,
        role TEXT,
        ticket_id TEXT,
        outcome TEXT,
        details JSONB
      );
      CREATE TABLE IF NOT EXISTS tickets_backup_history (
        backup_id SERIAL PRIMARY KEY,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        reason TEXT,
        initiated_by TEXT,
        ticket_count INT,
        backup_data JSONB
      );
      CREATE TABLE IF NOT EXISTS deleted_ticket_tombstones (
        ticket_id TEXT PRIMARY KEY,
        deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        deleted_by TEXT,
        deletion_reason TEXT
      );
    `);
    console.log('✅ PostgreSQL Schema & Indexes verified.');
    try {
      const tombRes = await pool.query('SELECT ticket_id FROM deleted_ticket_tombstones');
      tombRes.rows.forEach(r => {
        const clean = String(r.ticket_id).trim();
        deletedTicketIds.add(clean);
        PERMANENT_TOMBSTONES.add(clean);
      });
      if (tombRes.rows.length > 0) {
        console.log(`🛡️ [POSTGRES] Loaded ${tombRes.rows.length} persistent tombstones into memory guard.`);
      }
    } catch(e) {}
    const countRes = await pool.query('SELECT count(*) FROM tickets');
    const rowCount = parseInt(countRes.rows[0].count, 10);
    if (true) { // Always ensure authentic baseline tickets exist
      console.log('🚀 Migrating existing JSON tickets to PostgreSQL...');
      const tickets = EMBEDDED_AUTHENTIC_TICKETS;
      let migratedCount = 0;
      for (const t of tickets) {
        if (isDeleted(t.ticketId) || isTestOrPurgedTicket(t)) continue;
        const canonicalPrio = normalizePriority(t.priority, t.issue);
        await pool.query(`
          INSERT INTO tickets (
            ticket_id, created_date, priority, status, resolution_category,
            district, block, school_id, school_name, udise_code,
            ai_instructor_name, ai_instructor_mobile, reported_issue,
            duration, ups_serial_number, resolution_type, vendor_name,
            vendor_ticket_no, parts_required, resolution_notes,
            resolved_at, photo1_data, photo2_data, photo3_data, photo4_data, remarks, activity_log
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27::jsonb)
          ON CONFLICT (ticket_id) DO NOTHING
        `, [
          t.ticketId,
          t.createdDate || t.createdAt || new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
          canonicalPrio,
          t.status || 'New / Under Review',
          t.resolutionCategory || 'Pending',
          t.district || 'Thiruvarur',
          t.block || '',
          t.schoolId || '',
          t.schoolName || '',
          t.udise || '',
          t.aiName || '',
          t.phone || '',
          t.issue || '',
          t.duration || 'Today',
          t.serialNo || '',
          t.resolutionType || '',
          t.vendorName || '',
          t.vendorTicketNo || '',
          t.partsRequired || '',
          t.resolutionNotes || '',
          t.resolvedAt || '',
          t.photo1Url || '',
          t.photo2Url || '',
          t.photo3Url || '',
          t.photo4Url || '',
          t.remarks || '',
          JSON.stringify(t.timeline || [])
        ]);
        migratedCount++;
      }
      console.log(`🎉 Successfully migrated ${migratedCount} tickets into PostgreSQL!`);
    }
  } catch (err) {
    console.error('❌ Database initialization error:', err.message);
  }
}

let lastGasSyncTime = 0;
let gasSyncPromise = null;

function canonicalizeTicketId(rawId, udise, district) {
  const u = String(udise || '').trim();
  const isNgp = (district && String(district).toLowerCase().includes('nagapattinam')) || (rawId && String(rawId).includes('NGP')) || (u && u.startsWith('3319'));
  const prefix = isNgp ? 'HTL-NGP-' : 'HTL-TVR-';
  const baseId = u.length >= 5 ? `${prefix}${u.slice(-5)}` : (rawId || `${prefix}00000`);
  if (!rawId) return baseId;
  const clean = String(rawId).trim();
  if (/^HTL-(?:TVR|NGP)-\d{5}-\d{2,}$/.test(clean)) {
    return baseId;
  }
  return clean;
}

async function syncGasTickets() {
  if (Date.now() - lastGasSyncTime < 5000) return; // 5s cache
  if (gasSyncPromise) return gasSyncPromise;

  gasSyncPromise = (async () => {
    try {
      if (!GOOGLE_APPS_SCRIPT_ENDPOINT) return;
      const resp = await fetchGasApi(GOOGLE_APPS_SCRIPT_ENDPOINT);
      const remoteTickets = (resp && resp.tickets) ? resp.tickets : (Array.isArray(resp) ? resp : null);
      if (Array.isArray(remoteTickets) && remoteTickets.length > 0) {
        let localTickets = loadTicketsFromJson();
        const existingSignatures = new Set();

        localTickets.forEach(lt => {
          if (lt.googleDriveFolderUrl) existingSignatures.add(String(lt.googleDriveFolderUrl).trim());
          const u = String(lt.udise || '').trim();
          const t = String(lt.createdDate || lt.createdAt || '').trim();
          if (u && t) existingSignatures.add(`${u}_${t}`);
        });

        let added = 0;
        remoteTickets.forEach((rt) => {
          if (!rt || isTestOrPurgedTicket(rt)) return;
          const rawTid = String(rt.ticketId || '').trim();
          const udise = String(rt.udise || '').trim();
          const assignedId = canonicalizeTicketId(rawTid, udise);

          if (isDeleted(rawTid) || isDeleted(assignedId)) return;

          const rawDate = String(rt.createdDate || rt.createdAt || '').trim();
          const normDate = normalizeTicketDate(rawDate);
          if (udise) {
            if (rawDate && (deletedTicketIds.has(`${udise}_${rawDate}`) || PERMANENT_TOMBSTONES.has(`${udise}_${rawDate}`))) return;
            if (normDate && (deletedTicketIds.has(`${udise}_${normDate}`) || PERMANENT_TOMBSTONES.has(`${udise}_${normDate}`))) return;
          }

          const cleanTicket = { 
            ...rt, 
            ticketId: assignedId,
            createdDate: normDate || rt.createdDate,
            createdAt: normDate || rt.createdAt
          };
          const existingIdx = localTickets.findIndex(lt => String(lt.ticketId).trim().toLowerCase() === assignedId.toLowerCase());

          if (existingIdx !== -1) {
            const existing = localTickets[existingIdx];
            localTickets[existingIdx] = {
              ...cleanTicket,
              ...existing,
              // Update status, notes, vendor from Sheets if present
              status: cleanTicket.status || existing.status,
              remarks: cleanTicket.remarks || existing.remarks,
              resolutionCategory: cleanTicket.resolutionCategory || existing.resolutionCategory,
              resolutionNotes: cleanTicket.resolutionNotes || existing.resolutionNotes,
              vendorName: cleanTicket.vendorName || existing.vendorName,
              vendorTicketNo: cleanTicket.vendorTicketNo || existing.vendorTicketNo,
              partsRequired: cleanTicket.partsRequired || existing.partsRequired,
              googleDriveFolderUrl: cleanTicket.googleDriveFolderUrl || existing.googleDriveFolderUrl,

              // NEVER allow Google Sheets sync to erase local completion evidence
              hmReportPhotoUrl: existing.hmReportPhotoUrl || cleanTicket.hmReportPhotoUrl || (existing.completionEvidence?.hmSignedReport?.fileUrl) || '',
              completionPhotoUrl: existing.completionPhotoUrl || cleanTicket.completionPhotoUrl || (existing.completionEvidence?.completionPhoto?.fileUrl) || '',
              hmReportPhotoBase64: existing.hmReportPhotoBase64 || cleanTicket.hmReportPhotoBase64 || (existing.completionEvidence?.hmSignedReport?.data) || '',
              completionPhotoBase64: existing.completionPhotoBase64 || cleanTicket.completionPhotoBase64 || (existing.completionEvidence?.completionPhoto?.data) || '',
              completionEvidence: (function() {
                const baseEv = existing.completionEvidence || cleanTicket.completionEvidence;
                const finalHmId = existing.hmDriveFileId || cleanTicket.hmDriveFileId || baseEv?.hmSignedReport?.driveFileId || extractDriveFileId(existing.hmReportPhotoUrl) || extractDriveFileId(cleanTicket.hmReportPhotoUrl) || '';
                const finalCompId = existing.compDriveFileId || cleanTicket.compDriveFileId || baseEv?.completionPhoto?.driveFileId || extractDriveFileId(existing.completionPhotoUrl) || extractDriveFileId(cleanTicket.completionPhotoUrl) || '';
                if (baseEv) {
                  return {
                    ...baseEv,
                    hmSignedReport: {
                      ...(baseEv.hmSignedReport || {}),
                      driveFileId: finalHmId || baseEv.hmSignedReport?.driveFileId || '',
                      fileUrl: (!baseEv.hmSignedReport?.fileUrl || baseEv.hmSignedReport.fileUrl.startsWith('/uploads/'))
                        ? (finalHmId ? ('https://drive.google.com/thumbnail?id=' + finalHmId + '&sz=w800') : (baseEv.hmSignedReport?.fileUrl || ''))
                        : baseEv.hmSignedReport.fileUrl
                    },
                    completionPhoto: {
                      ...(baseEv.completionPhoto || {}),
                      driveFileId: finalCompId || baseEv.completionPhoto?.driveFileId || '',
                      fileUrl: (!baseEv.completionPhoto?.fileUrl || baseEv.completionPhoto.fileUrl.startsWith('/uploads/'))
                        ? (finalCompId ? ('https://drive.google.com/thumbnail?id=' + finalCompId + '&sz=w800') : (baseEv.completionPhoto?.fileUrl || ''))
                        : baseEv.completionPhoto.fileUrl
                    }
                  };
                }
                if (existing.hmReportPhotoUrl || existing.completionPhotoUrl || existing.hmReportPhotoBase64 || existing.completionPhotoBase64 || finalHmId || finalCompId) {
                  return {
                    hmSignedReport: {
                      uploaded: !!(finalHmId || existing.hmReportPhotoUrl || cleanTicket.hmReportPhotoUrl || existing.hmReportPhotoBase64 || cleanTicket.hmReportPhotoBase64),
                      fileUrl: (finalHmId ? ('https://drive.google.com/thumbnail?id=' + finalHmId + '&sz=w800') : (existing.hmReportPhotoUrl || cleanTicket.hmReportPhotoUrl || '')),
                      data: existing.hmReportPhotoBase64 || cleanTicket.hmReportPhotoBase64 || '',
                      driveFileId: finalHmId,
                      uploadedAt: existing.completionDate || normDate,
                      submittedBy: existing.completedBy || 'AI Teacher',
                      source: 'AI Teacher'
                    },
                    completionPhoto: {
                      uploaded: !!(finalCompId || existing.completionPhotoUrl || cleanTicket.completionPhotoUrl || existing.completionPhotoBase64 || cleanTicket.completionPhotoBase64),
                      fileUrl: (finalCompId ? ('https://drive.google.com/thumbnail?id=' + finalCompId + '&sz=w800') : (existing.completionPhotoUrl || cleanTicket.completionPhotoUrl || '')),
                      data: existing.completionPhotoBase64 || cleanTicket.completionPhotoBase64 || '',
                      driveFileId: finalCompId,
                      uploadedAt: existing.completionDate || normDate,
                      submittedBy: existing.completedBy || 'AI Teacher',
                      source: 'AI Teacher',
                      gpsLatitude: existing.gpsLatitude,
                      gpsLongitude: existing.gpsLongitude,
                      gpsAccuracy: existing.gpsAccuracy,
                      gpsWatermarkRequired: true
                    },
                    status: ((finalHmId || existing.hmReportPhotoUrl || existing.hmReportPhotoBase64) && (finalCompId || existing.completionPhotoUrl || existing.completionPhotoBase64)) ? 'complete' : 'partial',
                    completedAt: existing.completionDate || normDate,
                    completedBy: existing.completedBy || 'AI Teacher'
                  };
                }
                return undefined;
              })(),
              completionEvidenceRequested: (existing.completionEvidenceRequested !== undefined) ? existing.completionEvidenceRequested : cleanTicket.completionEvidenceRequested,
              completionEvidenceRequestedAt: existing.completionEvidenceRequestedAt || cleanTicket.completionEvidenceRequestedAt,
              completionEvidenceRequestedBy: existing.completionEvidenceRequestedBy || cleanTicket.completionEvidenceRequestedBy,
              completionEvidenceStatus: existing.completionEvidenceStatus || cleanTicket.completionEvidenceStatus,
              completionDate: existing.completionDate || cleanTicket.completionDate,
              completedBy: existing.completedBy || cleanTicket.completedBy,
              gpsLatitude: (existing.gpsLatitude !== undefined && existing.gpsLatitude !== null) ? existing.gpsLatitude : cleanTicket.gpsLatitude,
              gpsLongitude: (existing.gpsLongitude !== undefined && existing.gpsLongitude !== null) ? existing.gpsLongitude : cleanTicket.gpsLongitude,
              gpsAccuracy: (existing.gpsAccuracy !== undefined && existing.gpsAccuracy !== null) ? existing.gpsAccuracy : cleanTicket.gpsAccuracy,
              gpsTimestamp: existing.gpsTimestamp || cleanTicket.gpsTimestamp,
              gpsSource: existing.gpsSource || cleanTicket.gpsSource,
              evidencePhotos: (existing.evidencePhotos && existing.evidencePhotos.length > 0) ? existing.evidencePhotos : (cleanTicket.evidencePhotos || []),
              photo1Url: (existing.photo1Url && existing.photo1Url !== 'No Photo') ? existing.photo1Url : (cleanTicket.photo1Url || ''),
              photo2Url: (existing.photo2Url && existing.photo2Url !== 'No Photo') ? existing.photo2Url : (cleanTicket.photo2Url || ''),
              photo3Url: (existing.photo3Url && existing.photo3Url !== 'No Photo') ? existing.photo3Url : (cleanTicket.photo3Url || ''),
              photo4Url: (existing.photo4Url && existing.photo4Url !== 'No Photo') ? existing.photo4Url : (cleanTicket.photo4Url || ''),
              p1DriveUrl: existing.p1DriveUrl || cleanTicket.p1DriveUrl || '',
              p2DriveUrl: existing.p2DriveUrl || cleanTicket.p2DriveUrl || '',
              p3DriveUrl: existing.p3DriveUrl || cleanTicket.p3DriveUrl || '',
              p4DriveUrl: existing.p4DriveUrl || cleanTicket.p4DriveUrl || '',
              p1DriveFileId: existing.p1DriveFileId || cleanTicket.p1DriveFileId || '',
              p2DriveFileId: existing.p2DriveFileId || cleanTicket.p2DriveFileId || '',
              p3DriveFileId: existing.p3DriveFileId || cleanTicket.p3DriveFileId || '',
              p4DriveFileId: existing.p4DriveFileId || cleanTicket.p4DriveFileId || '',
              hmDriveFileId: existing.hmDriveFileId || cleanTicket.hmDriveFileId || extractDriveFileId(existing.hmReportPhotoUrl) || extractDriveFileId(cleanTicket.hmReportPhotoUrl) || '',
              compDriveFileId: existing.compDriveFileId || cleanTicket.compDriveFileId || extractDriveFileId(existing.completionPhotoUrl) || extractDriveFileId(cleanTicket.completionPhotoUrl) || '',
              timeline: (existing.timeline && existing.timeline.length > 0) ? existing.timeline : (cleanTicket.timeline || [])
            };
          } else {
            const finalCleanHmId = cleanTicket.hmDriveFileId || extractDriveFileId(cleanTicket.hmReportPhotoUrl) || '';
            const finalCleanCompId = cleanTicket.compDriveFileId || extractDriveFileId(cleanTicket.completionPhotoUrl) || '';
            cleanTicket.hmDriveFileId = finalCleanHmId;
            cleanTicket.compDriveFileId = finalCleanCompId;
            if (!cleanTicket.completionEvidence && (finalCleanHmId || finalCleanCompId || cleanTicket.hmReportPhotoUrl || cleanTicket.completionPhotoUrl)) {
              cleanTicket.completionEvidence = {
                hmSignedReport: {
                  uploaded: !!(finalCleanHmId || cleanTicket.hmReportPhotoUrl),
                  fileUrl: cleanTicket.hmReportPhotoUrl || (finalCleanHmId ? ('https://drive.google.com/thumbnail?id=' + finalCleanHmId + '&sz=w800') : ''),
                  data: '',
                  driveFileId: finalCleanHmId,
                  uploadedAt: cleanTicket.createdDate || normDate,
                  submittedBy: cleanTicket.completedBy || cleanTicket.aiName || 'AI Teacher',
                  source: 'AI Teacher'
                },
                completionPhoto: {
                  uploaded: !!(finalCleanCompId || cleanTicket.completionPhotoUrl),
                  fileUrl: cleanTicket.completionPhotoUrl || (finalCleanCompId ? ('https://drive.google.com/thumbnail?id=' + finalCleanCompId + '&sz=w800') : ''),
                  data: '',
                  driveFileId: finalCleanCompId,
                  uploadedAt: cleanTicket.createdDate || normDate,
                  submittedBy: cleanTicket.completedBy || cleanTicket.aiName || 'AI Teacher',
                  source: 'AI Teacher',
                  gpsLatitude: cleanTicket.gpsLatitude,
                  gpsLongitude: cleanTicket.gpsLongitude,
                  gpsAccuracy: cleanTicket.gpsAccuracy,
                  gpsWatermarkRequired: true
                },
                status: ((finalCleanHmId || cleanTicket.hmReportPhotoUrl) && (finalCleanCompId || cleanTicket.completionPhotoUrl)) ? 'complete' : 'partial',
                completedAt: cleanTicket.createdDate || normDate,
                completedBy: cleanTicket.completedBy || cleanTicket.aiName || 'AI Teacher'
              };
            }
            localTickets.unshift(cleanTicket);
          }
          added++;
        });

        // Always ensure authentic baseline tickets are preserved in localTickets (unless deleted or test)
        const existingIds = new Set(localTickets.map(t => String(t.ticketId).trim().toLowerCase()));
        EMBEDDED_AUTHENTIC_TICKETS.forEach(bt => {
          const bId = String(bt.ticketId).trim();
          if (isDeleted(bId) || isTestOrPurgedTicket(bt)) return;
          if (!existingIds.has(bId.toLowerCase())) {
            localTickets.push(bt);
            existingIds.add(bId.toLowerCase());
          }
        });

        localTickets = localTickets.filter(t => t && t.ticketId && !isDeleted(t.ticketId) && !isTestOrPurgedTicket(t));
        saveTicketsToJson(localTickets);
        if (added > 0) {
          console.log(`🔄 [CLOUD SYNC] Cleanly added ${added} new tickets from Google Sheets!`);
        }

        // Also seed into PostgreSQL if connected
        if (usePostgres && pool) {
          for (const rt of remoteTickets) {
            if (!rt || isTestOrPurgedTicket(rt)) continue;
            const canonicalPrio = normalizePriority(rt.priority, rt.issue);
            try {
              await pool.query(`
                INSERT INTO tickets (
                  ticket_id, created_date, priority, status, resolution_category,
                  district, block, school_id, school_name, udise_code,
                  ai_instructor_name, ai_instructor_mobile, reported_issue,
                  duration, ups_serial_number, resolution_type, vendor_name,
                  vendor_ticket_no, parts_required, resolution_notes,
                  resolved_at, photo1_data, photo2_data, photo3_data, photo4_data, remarks, activity_log,
                  hm_report_photo_url, completion_photo_url, hm_drive_file_id, comp_drive_file_id, drive_folder_url
                ) VALUES (
                  $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27::jsonb,
                  $28, $29, $30, $31, $32
                )
                ON CONFLICT (ticket_id) DO UPDATE SET
                  hm_report_photo_url = COALESCE(NULLIF(EXCLUDED.hm_report_photo_url, ''), tickets.hm_report_photo_url),
                  completion_photo_url = COALESCE(NULLIF(EXCLUDED.completion_photo_url, ''), tickets.completion_photo_url),
                  hm_drive_file_id = COALESCE(NULLIF(EXCLUDED.hm_drive_file_id, ''), tickets.hm_drive_file_id),
                  comp_drive_file_id = COALESCE(NULLIF(EXCLUDED.comp_drive_file_id, ''), tickets.comp_drive_file_id),
                  drive_folder_url = COALESCE(NULLIF(EXCLUDED.drive_folder_url, ''), tickets.drive_folder_url)
              `, [
                rt.ticketId,
                rt.createdDate || rt.createdAt || new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
                canonicalPrio,
                rt.status || 'New / Under Review',
                rt.resolutionCategory || 'Pending',
                rt.district || 'Thiruvarur',
                rt.block || '',
                rt.schoolId || '',
                rt.schoolName || '',
                rt.udise || '',
                rt.aiName || '',
                rt.phone || '',
                rt.issue || '',
                rt.duration || 'Today',
                rt.serialNo || '',
                rt.resolutionType || '',
                rt.vendorName || '',
                rt.vendorTicketNo || '',
                rt.partsRequired || '',
                rt.resolutionNotes || '',
                rt.resolvedAt || '',
                rt.photo1Url || '',
                rt.photo2Url || '',
                rt.photo3Url || '',
                rt.photo4Url || '',
                rt.remarks || '',
                JSON.stringify(rt.timeline || []),
                rt.hmReportPhotoUrl || null,
                rt.completionPhotoUrl || null,
                rt.hmDriveFileId || null,
                rt.compDriveFileId || null,
                rt.googleDriveFolderUrl || null
              ]);
            } catch(pgErr) {}
          }
        }
      }
      lastGasSyncTime = Date.now();
    } catch (e) {
      console.warn('Gas sync warning:', e.message);
    } finally {
      gasSyncPromise = null;
    }
  })();

  return gasSyncPromise;
}

async function seedPostgresBaseline() {
  if (!usePostgres || !pool) return;
  try {
    for (const t of EMBEDDED_AUTHENTIC_TICKETS) {
      if (isDeleted(t.ticketId) || isTestOrPurgedTicket(t)) continue;
      const canonicalPrio = normalizePriority(t.priority, t.issue);
      await pool.query(`
        INSERT INTO tickets (
          ticket_id, created_date, priority, status, resolution_category,
          district, block, school_id, school_name, udise_code,
          ai_instructor_name, ai_instructor_mobile, reported_issue,
          duration, ups_serial_number, resolution_type, vendor_name,
          vendor_ticket_no, parts_required, resolution_notes,
          resolved_at, photo1_data, photo2_data, photo3_data, photo4_data, remarks, activity_log
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27::jsonb)
        ON CONFLICT (ticket_id) DO NOTHING
      `, [
        t.ticketId,
        t.createdDate || t.createdAt || new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
        canonicalPrio,
        t.status || 'New / Under Review',
        t.resolutionCategory || 'Pending',
        t.district || 'Thiruvarur',
        t.block || '',
        t.schoolId || '',
        t.schoolName || '',
        t.udise || '',
        t.aiName || '',
        t.phone || '',
        t.issue || '',
        t.duration || 'Today',
        t.serialNo || '',
        t.resolutionType || '',
        t.vendorName || '',
        t.vendorTicketNo || '',
        t.partsRequired || '',
        t.resolutionNotes || '',
        t.resolvedAt || '',
        t.photo1Url || '',
        t.photo2Url || '',
        t.photo3Url || '',
        t.photo4Url || '',
        t.remarks || '',
        JSON.stringify(t.timeline || [])
      ]);
    }
  } catch(err) {
    console.warn('Postgres seeding error:', err.message);
  }
}

async function getAllTickets() {
  // Always trigger Google Sheets cloud sync
  try {
    await Promise.race([
      syncGasTickets(),
      new Promise(res => setTimeout(res, 6500))
    ]);
  } catch(e) {}

  let dbRows = [];
  if (usePostgres && pool) {
    try {
      let res = await pool.query('SELECT * FROM tickets ORDER BY created_at DESC');
      if (res.rows.length < 15) {
        await seedPostgresBaseline();
        res = await pool.query('SELECT * FROM tickets ORDER BY created_at DESC');
      }
      dbRows = res.rows.map(mapRowToTicket);
    } catch (e) {}
  } else {
    dbRows = loadTicketsFromJson();
  }

  const bundled = JSON.parse(JSON.stringify(EMBEDDED_AUTHENTIC_TICKETS)).filter(t => !isDeleted(t.ticketId) && !isTestOrPurgedTicket(t));
  const combined = [...dbRows, ...bundled];
  const seenIds = new Set();
  const cleanList = [];

  combined.forEach(t => {
    if (!t || !t.ticketId || isTestOrPurgedTicket(t) || isDeleted(t.ticketId)) return;
    const tid = String(t.ticketId).trim();
    if (seenIds.has(tid.toLowerCase())) return;

    const issue = String(t.issue || '').toLowerCase();
    const remarks = String(t.remarks || '').toLowerCase();
    if (issue.includes('simulation') || remarks.includes('simulation')) return;

    seenIds.add(tid.toLowerCase());
    if (!Array.isArray(t.timeline)) {
      t.timeline = Array.isArray(t.activity_log) ? t.activity_log : [];
    }
    cleanList.push(t);
  });

  return cleanList;
}

async function getCanonicalActiveTickets() {
  const all = await getAllTickets();
  const seenIds = new Set();
  const canonical = [];

  for (const t of all) {
    if (!t || !t.ticketId) continue;
    const tid = String(t.ticketId).trim();
    const tidLower = tid.toLowerCase();

    // 1. Exclude permanently deleted / tombstoned tickets
    if (isDeleted(tid) || isDeleted(tidLower) || KNOWN_TEST_PURGED_IDS.has(tidLower)) continue;

    // 2. Exclude test/purged tickets
    if (isTestOrPurgedTicket(t)) continue;

    // 3. Remove duplicate ticket IDs
    if (seenIds.has(tidLower)) continue;
    seenIds.add(tidLower);

    canonical.push(t);
  }

  // Authoritative chronological sort (newest first)
  canonical.sort((a, b) => {
    return parseAppDate(b.createdDate || b.createdAt) - parseAppDate(a.createdDate || a.createdAt);
  });

  return canonical;
}

async function checkOpenTicketByUdise(cleanUdise) {
  if (!cleanUdise || cleanUdise.length < 6) return null;
  if (usePostgres && pool) {
    try {
      const res = await pool.query(`
        SELECT * FROM tickets 
        WHERE udise_code = $1 
          AND status IN ('New / Under Review', 'Open / Triage', 'In Progress (Remote)', 'Field Visit Scheduled')
        LIMIT 1
      `, [cleanUdise]);
      if (res.rows.length > 0) return mapRowToTicket(res.rows[0]);
      return null;
    } catch (e) {
      console.error('Postgres checkOpenTicket error:', e.message);
    }
  }
  const list = loadTicketsFromJson();
  return list.find(t => {
    const tUdise = String(t.udise || '').replace(/\D/g, '');
    const isOpen = t.status === 'New / Under Review' || t.status === 'Open / Triage' || t.status === 'In Progress (Remote)' || t.status === 'Field Visit Scheduled';
    return tUdise === cleanUdise && isOpen;
  }) || null;
}

async function createTicket(ticketData) {
  if (!ticketData || !ticketData.ticketId) return;
  const cleanId = String(ticketData.ticketId).trim();
  deletedTicketIds.delete(cleanId);
  try {
    const delFilePath = path.join(DATA_DIR, 'htl_deleted_ids.json');
    if (fs.existsSync(delFilePath)) {
      try {
        let delArr = JSON.parse(fs.readFileSync(delFilePath, 'utf8'));
        delArr = delArr.filter(id => id !== cleanId);
        safeWriteFileSync(delFilePath, JSON.stringify(delArr, null, 2), 'utf8');
      } catch(e) {}
    }
  } catch(e) {}

  if (usePostgres && pool) {
    try {
      await pool.query(`
        INSERT INTO tickets (
          ticket_id, created_date, priority, status, resolution_category,
          district, block, school_id, school_name, udise_code,
          ai_instructor_name, ai_instructor_mobile, reported_issue,
          duration, ups_serial_number, resolution_type, vendor_name,
          vendor_ticket_no, parts_required, resolution_notes,
          resolved_at, photo1_data, photo2_data, photo3_data, photo4_data, remarks, activity_log,
          p1_drive_file_id, p2_drive_file_id, p3_drive_file_id, p4_drive_file_id,
          hm_drive_file_id, comp_drive_file_id, hm_report_photo_url, completion_photo_url, drive_folder_url
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27::jsonb,
          $28, $29, $30, $31, $32, $33, $34, $35, $36
        )
        ON CONFLICT (ticket_id) DO UPDATE SET
          created_date = EXCLUDED.created_date,
          reported_issue = EXCLUDED.reported_issue,
          ai_instructor_name = EXCLUDED.ai_instructor_name,
          ai_instructor_mobile = EXCLUDED.ai_instructor_mobile,
          photo1_data = EXCLUDED.photo1_data,
          photo2_data = EXCLUDED.photo2_data,
          photo3_data = EXCLUDED.photo3_data,
          photo4_data = EXCLUDED.photo4_data,
          remarks = EXCLUDED.remarks,
          p1_drive_file_id = COALESCE(NULLIF(EXCLUDED.p1_drive_file_id, ''), tickets.p1_drive_file_id),
          p2_drive_file_id = COALESCE(NULLIF(EXCLUDED.p2_drive_file_id, ''), tickets.p2_drive_file_id),
          p3_drive_file_id = COALESCE(NULLIF(EXCLUDED.p3_drive_file_id, ''), tickets.p3_drive_file_id),
          p4_drive_file_id = COALESCE(NULLIF(EXCLUDED.p4_drive_file_id, ''), tickets.p4_drive_file_id),
          hm_drive_file_id = COALESCE(NULLIF(EXCLUDED.hm_drive_file_id, ''), tickets.hm_drive_file_id),
          comp_drive_file_id = COALESCE(NULLIF(EXCLUDED.comp_drive_file_id, ''), tickets.comp_drive_file_id),
          hm_report_photo_url = COALESCE(NULLIF(EXCLUDED.hm_report_photo_url, ''), tickets.hm_report_photo_url),
          completion_photo_url = COALESCE(NULLIF(EXCLUDED.completion_photo_url, ''), tickets.completion_photo_url),
          drive_folder_url = COALESCE(NULLIF(EXCLUDED.drive_folder_url, ''), tickets.drive_folder_url),
          status = 'New / Under Review'
      `, [
        ticketData.ticketId,
        ticketData.createdAt,
        ticketData.priority,
        ticketData.status,
        ticketData.resolutionCategory,
        ticketData.district,
        ticketData.block,
        ticketData.schoolId,
        ticketData.schoolName,
        ticketData.udise,
        ticketData.aiName,
        ticketData.phone,
        ticketData.issue,
        ticketData.duration,
        ticketData.serialNo,
        ticketData.resolutionType,
        ticketData.vendorName,
        ticketData.vendorTicketNo,
        ticketData.partsRequired,
        ticketData.resolutionNotes,
        ticketData.resolvedAt,
        ticketData.photo1Url,
        ticketData.photo2Url,
        ticketData.photo3Url,
        ticketData.photo4Url,
        ticketData.remarks,
        JSON.stringify(ticketData.timeline || []),
        ticketData.p1DriveFileId || null,
        ticketData.p2DriveFileId || null,
        ticketData.p3DriveFileId || null,
        ticketData.p4DriveFileId || null,
        ticketData.hmDriveFileId || null,
        ticketData.compDriveFileId || null,
        ticketData.hmReportPhotoUrl || null,
        ticketData.completionPhotoUrl || null,
        ticketData.googleDriveFolderUrl || null
      ]);
    } catch (e) {
      console.error('Postgres insert ticket error:', e.message);
    }
  }
  let list = loadTicketsFromJson();
  const existIdx = list.findIndex(t => String(t.ticketId).trim() === cleanId);
  if (existIdx !== -1) {
    list[existIdx] = ticketData;
  } else {
    list.unshift(ticketData);
  }
  saveTicketsToJson(list);
  return { success: true, ticket: ticketData };
}

async function updateTicket(ticketId, updateData) {
  let targetId = ticketId;
  let data = updateData || {};
  if (typeof ticketId === 'object' && ticketId !== null) {
    targetId = ticketId.ticketId || ticketId.id;
    data = ticketId;
  }
  const cleanId = String(targetId || '').trim();
  if (deletedTicketIds.has(cleanId)) {
    return { success: false, error: 'Ticket has been permanently deleted.' };
  }
  updateData = data;
  if (usePostgres && pool) {
    try {
      const res = await pool.query('SELECT * FROM tickets WHERE ticket_id = $1', [ticketId]);
      if (res.rows.length > 0) {
        const existing = res.rows[0];
        const dateStr = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
        const oldStatus = existing.status;
        const newStatus = updateData.status || existing.status;
        const newPriority = normalizePriority(updateData.priority, existing.reported_issue);
        const newResolutionCat = updateData.resolutionCategory || (
          newStatus === 'Resolved Remotely' ? 'Resolved Remotely' :
          (newStatus === 'Solved by Direct Visit' ? 'Solved by Direct Visit' : existing.resolution_category)
        );
        const newVendor = updateData.vendorName !== undefined ? updateData.vendorName : existing.vendor_name;
        const newVendorTicket = updateData.vendorTicketNo !== undefined ? updateData.vendorTicketNo : existing.vendor_ticket_no;
        const newParts = updateData.partsRequired !== undefined ? updateData.partsRequired : existing.parts_required;
        const newNotes = updateData.resolutionNotes !== undefined ? updateData.resolutionNotes : existing.resolution_notes;
        const newSerial = updateData.serialNo !== undefined ? updateData.serialNo : existing.ups_serial_number;
        const newVisitDate = updateData.visitDate !== undefined ? updateData.visitDate : existing.visit_date;
        const newVisitTime = updateData.visitTime !== undefined ? updateData.visitTime : existing.visit_time;
        const newDiagType = updateData.diagnosisType !== undefined ? updateData.diagnosisType : existing.diagnosis_type;
        const newActionTaken = updateData.actionTaken !== undefined ? updateData.actionTaken : existing.action_taken;
        const newBatteryCond = updateData.batteryCondition !== undefined ? updateData.batteryCondition : existing.battery_condition;
        const newPhoto1 = updateData.photo1Url !== undefined ? updateData.photo1Url : existing.photo1_data;
        const newPhoto2 = updateData.photo2Url !== undefined ? updateData.photo2Url : existing.photo2_data;
        const newPhoto3 = updateData.photo3Url !== undefined ? updateData.photo3Url : existing.photo3_data;
        const newPhoto4 = updateData.photo4Url !== undefined ? updateData.photo4Url : existing.photo4_data;
        const newHmUrl = updateData.hmReportPhotoUrl !== undefined ? updateData.hmReportPhotoUrl : existing.hm_report_photo_url;
        const newCompUrl = updateData.completionPhotoUrl !== undefined ? updateData.completionPhotoUrl : existing.completion_photo_url;
        const newHmFileId = updateData.hmDriveFileId !== undefined ? updateData.hmDriveFileId : existing.hm_drive_file_id;
        const newCompFileId = updateData.compDriveFileId !== undefined ? updateData.compDriveFileId : existing.comp_drive_file_id;
        const newP1FileId = updateData.p1DriveFileId !== undefined ? updateData.p1DriveFileId : existing.p1_drive_file_id;
        const newP2FileId = updateData.p2DriveFileId !== undefined ? updateData.p2DriveFileId : existing.p2_drive_file_id;
        const newP3FileId = updateData.p3DriveFileId !== undefined ? updateData.p3DriveFileId : existing.p3_drive_file_id;
        const newP4FileId = updateData.p4DriveFileId !== undefined ? updateData.p4DriveFileId : existing.p4_drive_file_id;
        const newDriveFolderUrl = updateData.googleDriveFolderUrl !== undefined ? updateData.googleDriveFolderUrl : existing.drive_folder_url;
        const newCompEvidence = updateData.completionEvidence !== undefined ? JSON.stringify(updateData.completionEvidence) : (existing.completion_evidence ? JSON.stringify(existing.completion_evidence) : null);
        const newCompStatus = updateData.completionEvidenceStatus !== undefined ? updateData.completionEvidenceStatus : existing.completion_evidence_status;
        const newRemarks = updateData.remarks !== undefined ? updateData.remarks : existing.remarks;
        const newGpsLat = updateData.gpsLatitude !== undefined ? updateData.gpsLatitude : existing.gps_latitude;
        const newGpsLon = updateData.gpsLongitude !== undefined ? updateData.gpsLongitude : existing.gps_longitude;
        const newGpsAcc = updateData.gpsAccuracy !== undefined ? updateData.gpsAccuracy : existing.gps_accuracy;
        const newGpsTime = updateData.gpsTimestamp !== undefined ? updateData.gpsTimestamp : existing.gps_timestamp;
        let resolvedAt = existing.resolved_at;
        if (newStatus === 'Resolved Remotely' || newStatus === 'Solved by Direct Visit' || newStatus === 'Closed / Verified') {
          resolvedAt = dateStr;
        }
        let timeline = existing.activity_log || [];
        timeline.unshift({
          time: dateStr,
          action: newStatus !== oldStatus ? 'Status: ' + newStatus : 'Lifecycle Details Updated',
          note: newNotes || 'Updated by Field Engineer (' + newResolutionCat + ')'
        });
        await pool.query(`
          UPDATE tickets SET
            status = $1, priority = $2, resolution_category = $3,
            vendor_name = $4, vendor_ticket_no = $5, parts_required = $6,
            resolution_notes = $7, photo1_data = $8, photo2_data = $9,
            photo3_data = $10, photo4_data = $11, resolved_at = $12,
            ups_serial_number = $13, visit_date = $14, visit_time = $15,
            diagnosis_type = $16, action_taken = $17, battery_condition = $18,
            activity_log = $19, hm_report_photo_url = $20, completion_photo_url = $21,
            hm_drive_file_id = $22, comp_drive_file_id = $23,
            p1_drive_file_id = $24, p2_drive_file_id = $25, p3_drive_file_id = $26, p4_drive_file_id = $27,
            drive_folder_url = $28, completion_evidence = $29::jsonb, completion_evidence_status = $30,
            remarks = $31, gps_latitude = $32, gps_longitude = $33, gps_accuracy = $34, gps_timestamp = $35
          WHERE ticket_id = $36
        `, [
          newStatus, newPriority, newResolutionCat, newVendor, newVendorTicket,
          newParts, newNotes, newPhoto1, newPhoto2, newPhoto3, newPhoto4, resolvedAt,
          newSerial, newVisitDate, newVisitTime, newDiagType, newActionTaken, newBatteryCond,
          JSON.stringify(timeline), newHmUrl, newCompUrl, newHmFileId, newCompFileId,
          newP1FileId, newP2FileId, newP3FileId, newP4FileId,
          newDriveFolderUrl, newCompEvidence, newCompStatus,
          newRemarks, newGpsLat, newGpsLon, newGpsAcc, newGpsTime,
          ticketId
        ]);
      }
    } catch (e) {
      console.error('Postgres update error:', e.message);
    }
  }
  const list = loadTicketsFromJson();
  let ticket = list.find(t => String(t.ticketId || t.id).trim().toLowerCase() === cleanId.toLowerCase());
  if (!ticket) {
    const emb = EMBEDDED_AUTHENTIC_TICKETS.find(t => String(t.ticketId || t.id).trim().toLowerCase() === cleanId.toLowerCase());
    if (emb) {
      ticket = JSON.parse(JSON.stringify(emb));
      list.push(ticket);
    }
  }
  if (ticket) {
    const dateStr = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
    const oldStatus = ticket.status;
    ticket.status = updateData.status || ticket.status;
    ticket.priority = normalizePriority(updateData.priority, ticket.issue);
    ticket.resolutionCategory = updateData.resolutionCategory || (
      ticket.status === 'Resolved Remotely' ? 'Resolved Remotely' : 
      (ticket.status === 'Solved by Direct Visit' ? 'Solved by Direct Visit' : ticket.resolutionCategory)
    );
    ticket.vendorName = updateData.vendorName !== undefined ? updateData.vendorName : ticket.vendorName;
    ticket.vendorTicketNo = updateData.vendorTicketNo !== undefined ? updateData.vendorTicketNo : ticket.vendorTicketNo;
    ticket.partsRequired = updateData.partsRequired !== undefined ? updateData.partsRequired : ticket.partsRequired;
    ticket.resolutionNotes = updateData.resolutionNotes !== undefined ? updateData.resolutionNotes : ticket.resolutionNotes;
    if (updateData.serialNo !== undefined) ticket.serialNo = updateData.serialNo;
    if (updateData.visitDate !== undefined) ticket.visitDate = updateData.visitDate;
    if (updateData.visitTime !== undefined) ticket.visitTime = updateData.visitTime;
    if (updateData.diagnosisType !== undefined) ticket.diagnosisType = updateData.diagnosisType;
    if (updateData.actionTaken !== undefined) ticket.actionTaken = updateData.actionTaken;
    if (updateData.batteryCondition !== undefined) ticket.batteryCondition = updateData.batteryCondition;
    if (updateData.photo1Url !== undefined) ticket.photo1Url = updateData.photo1Url;
    if (updateData.photo2Url !== undefined) ticket.photo2Url = updateData.photo2Url;
    if (updateData.photo3Url !== undefined) ticket.photo3Url = updateData.photo3Url;
    if (updateData.photo4Url !== undefined) ticket.photo4Url = updateData.photo4Url;
    if (updateData.hmReportPhotoUrl !== undefined) {
      if (updateData.hmReportPhotoUrl || updateData.clearEvidence || updateData.completionEvidence?.hmSignedReport?.uploaded === false) {
        ticket.hmReportPhotoUrl = updateData.hmReportPhotoUrl;
        if (!updateData.hmReportPhotoUrl) ticket.hmReportPhotoBase64 = '';
      }
    }
    if (updateData.completionPhotoUrl !== undefined) {
      if (updateData.completionPhotoUrl || updateData.clearEvidence || updateData.completionEvidence?.completionPhoto?.uploaded === false) {
        ticket.completionPhotoUrl = updateData.completionPhotoUrl;
        if (!updateData.completionPhotoUrl) ticket.completionPhotoBase64 = '';
      }
    }
    if (updateData.hmReportPhotoBase64 !== undefined && updateData.hmReportPhotoBase64) {
      ticket.hmReportPhotoBase64 = updateData.hmReportPhotoBase64;
    }
    if (updateData.completionPhotoBase64 !== undefined && updateData.completionPhotoBase64) {
      ticket.completionPhotoBase64 = updateData.completionPhotoBase64;
    }
    if (updateData.gpsLatitude !== undefined) ticket.gpsLatitude = updateData.gpsLatitude;
    if (updateData.gpsLongitude !== undefined) ticket.gpsLongitude = updateData.gpsLongitude;
    if (updateData.gpsAccuracy !== undefined) ticket.gpsAccuracy = updateData.gpsAccuracy;
    if (updateData.gpsTimestamp !== undefined) ticket.gpsTimestamp = updateData.gpsTimestamp;
    if (updateData.completionDate !== undefined) ticket.completionDate = updateData.completionDate;
    if (updateData.googleDriveFolderUrl !== undefined) ticket.googleDriveFolderUrl = updateData.googleDriveFolderUrl;
    if (updateData.p1DriveUrl !== undefined) ticket.p1DriveUrl = updateData.p1DriveUrl;
    if (updateData.p2DriveUrl !== undefined) ticket.p2DriveUrl = updateData.p2DriveUrl;
    if (updateData.p3DriveUrl !== undefined) ticket.p3DriveUrl = updateData.p3DriveUrl;
    if (updateData.p4DriveUrl !== undefined) ticket.p4DriveUrl = updateData.p4DriveUrl;
    if (updateData.p1DriveFileId !== undefined) ticket.p1DriveFileId = updateData.p1DriveFileId;
    if (updateData.p2DriveFileId !== undefined) ticket.p2DriveFileId = updateData.p2DriveFileId;
    if (updateData.p3DriveFileId !== undefined) ticket.p3DriveFileId = updateData.p3DriveFileId;
    if (updateData.p4DriveFileId !== undefined) ticket.p4DriveFileId = updateData.p4DriveFileId;
    if (updateData.hmDriveFileId === '') {
      ticket.hmDriveFileId = '';
    } else {
      const derivedHmId = updateData.hmDriveFileId || extractDriveFileId(updateData.hmReportPhotoUrl || '') || '';
      if (derivedHmId) ticket.hmDriveFileId = derivedHmId;
      else if (updateData.hmDriveFileId !== undefined && (updateData.hmDriveFileId || !ticket.hmDriveFileId)) ticket.hmDriveFileId = updateData.hmDriveFileId;
    }

    if (updateData.compDriveFileId === '') {
      ticket.compDriveFileId = '';
    } else {
      const derivedCompId = updateData.compDriveFileId || extractDriveFileId(updateData.completionPhotoUrl || '') || '';
      if (derivedCompId) ticket.compDriveFileId = derivedCompId;
      else if (updateData.compDriveFileId !== undefined && (updateData.compDriveFileId || !ticket.compDriveFileId)) ticket.compDriveFileId = updateData.compDriveFileId;
    }

    if (updateData.evidencePhotos !== undefined && Array.isArray(updateData.evidencePhotos)) {
      ticket.evidencePhotos = updateData.evidencePhotos;
    }
    if (updateData.completionEvidenceRequested !== undefined) ticket.completionEvidenceRequested = updateData.completionEvidenceRequested;
    if (updateData.completionEvidenceRequestedAt !== undefined) ticket.completionEvidenceRequestedAt = updateData.completionEvidenceRequestedAt;
    if (updateData.completionEvidenceRequestedBy !== undefined) ticket.completionEvidenceRequestedBy = updateData.completionEvidenceRequestedBy;
    if (updateData.completionEvidenceStatus !== undefined) ticket.completionEvidenceStatus = updateData.completionEvidenceStatus;

    // Structured completionEvidence sync
    if (updateData.completionEvidence) {
      const prevEv = ticket.completionEvidence || {};
      const prevHm = prevEv.hmSignedReport || {};
      const prevComp = prevEv.completionPhoto || {};
      const newHm = updateData.completionEvidence.hmSignedReport || {};
      const newComp = updateData.completionEvidence.completionPhoto || {};
      const activeHmFid = newHm.driveFileId || prevHm.driveFileId || ticket.hmDriveFileId || '';
      const activeCompFid = newComp.driveFileId || prevComp.driveFileId || ticket.compDriveFileId || '';

      ticket.completionEvidence = {
        ...prevEv,
        ...updateData.completionEvidence,
        hmSignedReport: {
          ...prevHm,
          ...newHm,
          uploaded: newHm.uploaded !== undefined ? newHm.uploaded : (prevHm.uploaded || !!activeHmFid || !!ticket.hmReportPhotoUrl || !!ticket.hmReportPhotoBase64),
          fileUrl: (activeHmFid && (!newHm.fileUrl || newHm.fileUrl.startsWith('/uploads/'))) ? ('https://drive.google.com/thumbnail?id=' + activeHmFid + '&sz=w800') : (newHm.fileUrl || prevHm.fileUrl || ticket.hmReportPhotoUrl || ''),
          data: newHm.data || prevHm.data || ticket.hmReportPhotoBase64 || '',
          driveFileId: activeHmFid
        },
        completionPhoto: {
          ...prevComp,
          ...newComp,
          uploaded: newComp.uploaded !== undefined ? newComp.uploaded : (prevComp.uploaded || !!activeCompFid || !!ticket.completionPhotoUrl || !!ticket.completionPhotoBase64),
          fileUrl: (activeCompFid && (!newComp.fileUrl || newComp.fileUrl.startsWith('/uploads/'))) ? ('https://drive.google.com/thumbnail?id=' + activeCompFid + '&sz=w800') : (newComp.fileUrl || prevComp.fileUrl || ticket.completionPhotoUrl || ''),
          data: newComp.data || prevComp.data || ticket.completionPhotoBase64 || '',
          driveFileId: activeCompFid,
          gpsLatitude: newComp.gpsLatitude !== undefined ? newComp.gpsLatitude : (prevComp.gpsLatitude || ticket.gpsLatitude || null),
          gpsLongitude: newComp.gpsLongitude !== undefined ? newComp.gpsLongitude : (prevComp.gpsLongitude || ticket.gpsLongitude || null),
          gpsAccuracy: newComp.gpsAccuracy !== undefined ? newComp.gpsAccuracy : (prevComp.gpsAccuracy || ticket.gpsAccuracy || null),
          gpsWatermarkRequired: true
        },
        status: ((activeHmFid || ticket.hmReportPhotoUrl || ticket.hmReportPhotoBase64 || newHm.fileUrl || newHm.data) && (activeCompFid || ticket.completionPhotoUrl || ticket.completionPhotoBase64 || newComp.fileUrl || newComp.data)) ? 'complete' : 'partial'
      };
    } else if (ticket.hmReportPhotoUrl || ticket.completionPhotoUrl || ticket.hmReportPhotoBase64 || ticket.completionPhotoBase64 || ticket.hmDriveFileId || ticket.compDriveFileId) {
      const prevEv = ticket.completionEvidence || {};
      const prevHm = prevEv.hmSignedReport || {};
      const prevComp = prevEv.completionPhoto || {};
      const activeHmFid = prevHm.driveFileId || ticket.hmDriveFileId || '';
      const activeCompFid = prevComp.driveFileId || ticket.compDriveFileId || '';

      ticket.completionEvidence = {
        hmSignedReport: {
          uploaded: !!(activeHmFid || ticket.hmReportPhotoUrl || ticket.hmReportPhotoBase64),
          fileUrl: (activeHmFid && (!ticket.hmReportPhotoUrl || ticket.hmReportPhotoUrl.startsWith('/uploads/'))) ? ('https://drive.google.com/thumbnail?id=' + activeHmFid + '&sz=w800') : (ticket.hmReportPhotoUrl || ''),
          data: ticket.hmReportPhotoBase64 || prevHm.data || '',
          driveFileId: activeHmFid,
          uploadedAt: prevHm.uploadedAt || ticket.completionDate || dateStr,
          submittedBy: updateData.hmSubmittedBy || prevHm.submittedBy || ticket.completedBy || (updateData.source === 'AI Teacher' ? (ticket.aiName || 'AI Teacher') : 'Mohamed Shameer'),
          source: updateData.hmSource || prevHm.source || (updateData.source === 'AI Teacher' ? 'AI Teacher' : 'Engineer')
        },
        completionPhoto: {
          uploaded: !!(activeCompFid || ticket.completionPhotoUrl || ticket.completionPhotoBase64),
          fileUrl: (activeCompFid && (!ticket.completionPhotoUrl || ticket.completionPhotoUrl.startsWith('/uploads/'))) ? ('https://drive.google.com/thumbnail?id=' + activeCompFid + '&sz=w800') : (ticket.completionPhotoUrl || ''),
          data: ticket.completionPhotoBase64 || prevComp.data || '',
          driveFileId: activeCompFid,
          uploadedAt: prevComp.uploadedAt || ticket.completionDate || dateStr,
          submittedBy: updateData.compSubmittedBy || prevComp.submittedBy || ticket.completedBy || (updateData.source === 'AI Teacher' ? (ticket.aiName || 'AI Teacher') : 'Mohamed Shameer'),
          source: updateData.compSource || prevComp.source || (updateData.source === 'AI Teacher' ? 'AI Teacher' : 'Engineer'),
          gpsLatitude: ticket.gpsLatitude || null,
          gpsLongitude: ticket.gpsLongitude || null,
          gpsAccuracy: ticket.gpsAccuracy || null,
          gpsWatermarkRequired: true
        },
        status: ((activeHmFid || ticket.hmReportPhotoUrl || ticket.hmReportPhotoBase64) && (activeCompFid || ticket.completionPhotoUrl || ticket.completionPhotoBase64)) ? 'complete' : 'partial',
        completedAt: ticket.completionDate || dateStr,
        completedBy: ticket.completedBy || (updateData.source === 'AI Teacher' ? (ticket.aiName || 'AI Teacher') : 'Mohamed Shameer')
      };
    }
    if (ticket.status === 'Resolved Remotely' || ticket.status === 'Solved by Direct Visit' || ticket.status === 'Closed / Verified') {
      ticket.resolvedAt = dateStr;
    }
    if (updateData.timeline) {
      ticket.timeline = updateData.timeline;
    } else {
      if (!ticket.timeline) ticket.timeline = [];
      ticket.timeline.unshift({
        time: dateStr,
        action: updateData.status !== oldStatus ? 'Status updated: ' + updateData.status : 'Details Updated',
        note: updateData.resolutionNotes || 'Updated by Field Engineer (' + ticket.resolutionCategory + ')'
      });
    }
    saveTicketsToJson(list);
    return { success: true, ticket: ticket };
  }
  return { success: false, error: 'Ticket not found or has been permanently deleted.' };
}

async function deleteCompletionEvidence(ticketId, slot) {
  if (!ticketId) return { success: false, error: 'Ticket ID is required' };
  const cleanId = String(ticketId).trim();
  const lowerId = cleanId.toLowerCase();
  const normalizedSlot = String(slot || '').toUpperCase();
  const isSlot1 = normalizedSlot === 'HM_REPORT' || normalizedSlot === '1' || normalizedSlot === 'SLOT1';
  const isSlot2 = normalizedSlot === 'GPS_COMPLETION' || normalizedSlot === '2' || normalizedSlot === 'SLOT2';

  if (!isSlot1 && !isSlot2) {
    return { success: false, error: 'Invalid slot. Must be HM_REPORT or GPS_COMPLETION' };
  }

  const list = loadTicketsFromJson();
  let ticket = list.find(t => String(t.ticketId || t.id).trim().toLowerCase() === lowerId);
  if (!ticket) {
    return { success: false, error: 'Ticket not found.' };
  }

  const dateStr = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });

  if (isSlot1) {
    ticket.hmReportPhotoUrl = '';
    ticket.hmReportPhotoBase64 = '';
    ticket.hmDriveFileId = '';
    if (ticket.completionEvidence) {
      ticket.completionEvidence.hmSignedReport = {
        uploaded: false,
        fileUrl: '',
        data: '',
        driveFileId: '',
        uploadedAt: '',
        submittedBy: '',
        source: ''
      };
      const compUploaded = !!(ticket.compDriveFileId || (ticket.completionEvidence.completionPhoto && ticket.completionEvidence.completionPhoto.uploaded));
      ticket.completionEvidence.status = compUploaded ? 'partial' : 'none';
      ticket.completionEvidenceStatus = compUploaded ? 'PARTIALLY_UPLOADED' : 'PENDING';
    } else {
      const compUploaded = !!(ticket.compDriveFileId || ticket.completionPhotoUrl);
      ticket.completionEvidenceStatus = compUploaded ? 'PARTIALLY_UPLOADED' : 'PENDING';
    }
  } else if (isSlot2) {
    ticket.completionPhotoUrl = '';
    ticket.completionPhotoBase64 = '';
    ticket.compDriveFileId = '';
    ticket.gpsLatitude = null;
    ticket.gpsLongitude = null;
    ticket.gpsAccuracy = null;
    ticket.gpsTimestamp = null;
    if (ticket.completionEvidence) {
      ticket.completionEvidence.completionPhoto = {
        uploaded: false,
        fileUrl: '',
        data: '',
        driveFileId: '',
        uploadedAt: '',
        submittedBy: '',
        source: '',
        gpsLatitude: null,
        gpsLongitude: null,
        gpsAccuracy: null,
        gpsWatermarkRequired: true
      };
      const hmUploaded = !!(ticket.hmDriveFileId || (ticket.completionEvidence.hmSignedReport && ticket.completionEvidence.hmSignedReport.uploaded));
      ticket.completionEvidence.status = hmUploaded ? 'partial' : 'none';
      ticket.completionEvidenceStatus = hmUploaded ? 'PARTIALLY_UPLOADED' : 'PENDING';
    } else {
      const hmUploaded = !!(ticket.hmDriveFileId || ticket.hmReportPhotoUrl);
      ticket.completionEvidenceStatus = hmUploaded ? 'PARTIALLY_UPLOADED' : 'PENDING';
    }
  }

  if (!ticket.timeline) ticket.timeline = [];
  ticket.timeline.unshift({
    time: dateStr,
    action: 'Completion Evidence Deleted: ' + (isSlot1 ? 'HM Signed Report' : 'GPS Completion Photo'),
    note: 'Removed by Field Engineer'
  });

  if (usePostgres && pool) {
    try {
      if (isSlot1) {
        await pool.query(`
          UPDATE tickets SET
            hm_report_photo_url = '',
            hm_drive_file_id = '',
            completion_evidence = $1::jsonb,
            completion_evidence_status = $2
          WHERE ticket_id = $3
        `, [JSON.stringify(ticket.completionEvidence || {}), ticket.completionEvidenceStatus, cleanId]);
      } else if (isSlot2) {
        await pool.query(`
          UPDATE tickets SET
            completion_photo_url = '',
            comp_drive_file_id = '',
            gps_latitude = NULL,
            gps_longitude = NULL,
            gps_accuracy = NULL,
            gps_timestamp = NULL,
            completion_evidence = $1::jsonb,
            completion_evidence_status = $2
          WHERE ticket_id = $3
        `, [JSON.stringify(ticket.completionEvidence || {}), ticket.completionEvidenceStatus, cleanId]);
      }
    } catch (e) {
      console.error('Postgres completion evidence delete error:', e.message);
    }
  }

  saveTicketsToJson(list);
  return { success: true, ticket: ticket, slot: isSlot1 ? 'HM_REPORT' : 'GPS_COMPLETION' };
}

async function deleteTicket(ticketId, reason = 'Deleted by Field Engineer', deletedBy = 'engineer') {
  if (!ticketId) return { success: false, error: 'Ticket ID is required' };
  const cleanId = String(ticketId).trim();
  const lowerId = cleanId.toLowerCase();
  const upperId = cleanId.toUpperCase();
  
  let list = loadTicketsFromJson();
  const targetTicket = list.find(t => String(t.ticketId).trim().toLowerCase() === lowerId);

  deletedTicketIds.add(cleanId);
  PERMANENT_TOMBSTONES.add(cleanId);
  deletedTicketIds.add(lowerId);
  PERMANENT_TOMBSTONES.add(lowerId);
  deletedTicketIds.add(upperId);
  PERMANENT_TOMBSTONES.add(upperId);

  if (targetTicket) {
    const u = String(targetTicket.udise || '').trim();
    const dt = String(targetTicket.createdDate || targetTicket.createdAt || '').trim();
    const normDt = normalizeTicketDate(dt);
    if (u && dt) {
      deletedTicketIds.add(`${u}_${dt}`);
      PERMANENT_TOMBSTONES.add(`${u}_${dt}`);
    }
    if (u && normDt) {
      deletedTicketIds.add(`${u}_${normDt}`);
      PERMANENT_TOMBSTONES.add(`${u}_${normDt}`);
    }
  }

  // 1. Persist Tombstones to DATA_DIR, BUNDLED_DATA_DIR, and tmpdir
  persistTombstones();

  // 2. Persist Rich Audit Tombstone Record
  try {
    const tombstoneFilePath = path.join(DATA_DIR, 'htl_tombstones.json');
    let tombstones = [];
    if (fs.existsSync(tombstoneFilePath)) {
      try { tombstones = JSON.parse(fs.readFileSync(tombstoneFilePath, 'utf8')); } catch(e) {}
    }
    if (!tombstones.some(tb => String(tb.ticketId).toLowerCase() === lowerId)) {
      tombstones.push({
        ticketId: cleanId,
        deletedAt: new Date().toISOString(),
        deletedBy: deletedBy,
        deletionReason: reason,
        district: targetTicket ? targetTicket.district : '',
        schoolName: targetTicket ? targetTicket.schoolName : '',
        udise: targetTicket ? targetTicket.udise : '',
        originalCreatedAt: targetTicket ? (targetTicket.createdDate || targetTicket.createdAt) : ''
      });
      safeWriteFileSync(tombstoneFilePath, JSON.stringify(tombstones, null, 2), 'utf8');
      if (BUNDLED_DATA_DIR !== DATA_DIR) {
        safeWriteFileSync(path.join(BUNDLED_DATA_DIR, 'htl_tombstones.json'), JSON.stringify(tombstones, null, 2), 'utf8');
      }
    }
  } catch(e) {}

  // 3. Delete from PostgreSQL if connected & record permanent tombstone table
  if (usePostgres && pool) {
    try {
      await pool.query('DELETE FROM tickets WHERE LOWER(TRIM(ticket_id)) = LOWER($1)', [cleanId]);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS deleted_ticket_tombstones (
          ticket_id TEXT PRIMARY KEY,
          deleted_at TIMESTAMPTZ DEFAULT NOW(),
          deleted_by TEXT,
          deletion_reason TEXT
        );
      `);
      await pool.query(`
        INSERT INTO deleted_ticket_tombstones (ticket_id, deleted_by, deletion_reason)
        VALUES ($1, $2, $3)
        ON CONFLICT (ticket_id) DO NOTHING
      `, [cleanId, deletedBy, reason]);
    } catch (e) {
      console.error('Postgres delete error:', e.message);
    }
  }

  // 4. Delete from local JSON memory and file
  list = list.filter(t => String(t.ticketId).trim().toLowerCase() !== lowerId);
  saveTicketsToJson(list);

  // 5. Asynchronously call Google Sheets delete action via GET only (avoids legacy doPost appendRow behavior)
  if (GOOGLE_APPS_SCRIPT_ENDPOINT) {
    fetchGasApi(`${GOOGLE_APPS_SCRIPT_ENDPOINT}?action=delete&ticketId=${encodeURIComponent(cleanId)}`).catch(() => {});
  }

  return { success: true, deletedTicketId: cleanId };
}

async function resetAllTickets(userIdentifier, clientIp) {
  deletedTicketIds.clear();
  const currentTickets = await getAllTickets();
  if (usePostgres && pool) {
    try {
      await pool.query(`
        INSERT INTO tickets_backup_history (reason, initiated_by, ticket_count, backup_data)
        VALUES ($1, $2, $3, $4)
      `, [
        'FULL_DATA_RESET',
        userIdentifier,
        currentTickets.length,
        JSON.stringify(currentTickets)
      ]);
      await pool.query('DELETE FROM tickets');
    } catch (e) {
      console.error('Postgres resetAll error:', e.message);
    }
  }
  try {
    const ts = Date.now();
    const backupFile = path.join(BACKUPS_DIR, 'reset_backup_' + ts + '.json');
    safeWriteFileSync(backupFile, JSON.stringify(currentTickets, null, 2), 'utf8');
  } catch(e){}
  saveTicketsToJson([]);
  return { success: true };
}

async function logAudit(event) {
  const entry = {
    timestamp: new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' }),
    isoTime: new Date().toISOString(),
    ...event
  };
  if (usePostgres && pool) {
    try {
      await pool.query(`
        INSERT INTO audit_log (formatted_time, ip, action, username, role, ticket_id, outcome, details)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `, [
        entry.timestamp,
        event.ip || '',
        event.action || '',
        event.user || event.username || '',
        event.role || '',
        event.ticketId || '',
        event.status || event.outcome || '',
        JSON.stringify(event)
      ]);
    } catch (e) {
      console.error('Postgres audit log write error:', e.message);
    }
  }
  try {
    let list = [];
    if (fs.existsSync(AUDIT_LOG_FILE)) {
      try { list = JSON.parse(fs.readFileSync(AUDIT_LOG_FILE, 'utf8')); } catch(e) { list = []; }
    }
    list.unshift(entry);
    if (list.length > 500) list = list.slice(0, 500);
    safeWriteFileSync(AUDIT_LOG_FILE, JSON.stringify(list, null, 2), 'utf8');
  } catch(e) {}
}

function parseExcelDate(val) {
  if (!val) return null;
  const ts = parseAppDate(val);
  if (!ts) return null;
  return new Date(ts);
}

async function generateExcelExport() {
  const tickets = await getAllTickets();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'TVR Hi-Tech Lab ITSM';
  workbook.lastModifiedBy = 'TVR Hi-Tech Lab ITSM';
  workbook.created = new Date();
  workbook.modified = new Date();

  // 1. MASTER TICKETS SHEET
  const ws = workbook.addWorksheet('Master Tickets', {
    views: [{ state: 'frozen', ySplit: 1 }]
  });

  const columns = [
    { header: 'Ticket ID', key: 'ticketId', width: 16 },
    { header: 'Created At', key: 'createdAt', width: 20 },
    { header: 'Priority', key: 'priority', width: 14 },
    { header: 'Status', key: 'status', width: 14 },
    { header: 'Resolution Category', key: 'resolutionCategory', width: 14 },
    { header: 'District', key: 'district', width: 14 },
    { header: 'Block', key: 'block', width: 14 },
    { header: 'School Name', key: 'schoolName', width: 30 },
    { header: 'UDISE Code', key: 'udise', width: 14 },
    { header: 'AI Instructor Name', key: 'aiName', width: 22 },
    { header: 'AI Instructor Mobile Number', key: 'phone', width: 16 },
    { header: 'Remarks / Description', key: 'remarks', width: 35 },
    { header: 'Reported UPS Issue', key: 'issue', width: 35 },
    { header: 'Duration', key: 'duration', width: 18 },
    { header: 'UPS Serial Number', key: 'serialNo', width: 20 },
    { header: 'Resolution Type', key: 'resolutionType', width: 20 },
    { header: 'Vendor Name', key: 'vendorName', width: 20 },
    { header: 'Vendor Ticket No', key: 'vendorTicketNo', width: 20 },
    { header: 'Parts Required', key: 'partsRequired', width: 20 },
    { header: 'Resolution Notes', key: 'resolutionNotes', width: 35 },
    { header: 'Resolved At', key: 'resolvedAt', width: 20 },
    { header: 'Photo 1 (Front Panel)', key: 'photo1', width: 25, hidden: true },
    { header: 'Photo 2 (Overall UPS)', key: 'photo2', width: 25, hidden: true },
    { header: 'Photo 3 (Battery/MCB)', key: 'photo3', width: 25, hidden: true },
    { header: 'Photo 4 (Isolation Transformer)', key: 'photo4', width: 25, hidden: true },
    { header: 'Google Drive Folder', key: 'driveFolder', width: 35, hidden: true },
    { header: 'Activity Log History', key: 'timeline', width: 45, hidden: true }
  ];

  ws.columns = columns;

  // Header Styling
  const headerRow = ws.getRow(1);
  headerRow.height = 28;
  headerRow.font = { name: 'Segoe UI', size: 10.5, bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  headerRow.border = {
    top: { style: 'medium', color: { argb: 'FF1E3A8A' } },
    bottom: { style: 'medium', color: { argb: 'FF1E3A8A' } },
    left: { style: 'thin', color: { argb: 'FF3B82F6' } },
    right: { style: 'thin', color: { argb: 'FF3B82F6' } }
  };

  ws.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: columns.length }
  };

  const thinBorder = {
    top: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    left: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
    right: { style: 'thin', color: { argb: 'FFE2E8F0' } }
  };

  tickets.forEach((t, idx) => {
    const rawCreated = parseExcelDate(t.createdAt);
    const rawResolved = parseExcelDate(t.resolvedAt);
    const timelineStr = (t.timeline || []).map(e => `[${e.time}] ${e.action}: ${e.note}`).join('\n');

    const row = ws.addRow({
      ticketId: t.ticketId || '',
      createdAt: rawCreated,
      priority: normalizePriority(t.priority, t.issue),
      status: t.status || 'New / Under Review',
      resolutionCategory: t.resolutionCategory || 'Pending',
      district: t.district || 'Thiruvarur',
      block: t.block || '',
      schoolName: t.schoolName || '',
      udise: String(t.udise || ''),
      aiName: t.aiName || '',
      phone: String(t.phone || ''),
      remarks: t.remarks || '',
      issue: t.issue || '',
      duration: t.duration || '',
      serialNo: t.serialNo || '',
      resolutionType: t.resolutionType || '',
      vendorName: t.vendorName || '',
      vendorTicketNo: t.vendorTicketNo || '',
      partsRequired: t.partsRequired || '',
      resolutionNotes: t.resolutionNotes || '',
      resolvedAt: rawResolved,
      photo1: t.photo1 || 'No Photo',
      photo2: t.photo2 || 'No Photo',
      photo3: t.photo3 || 'No Photo',
      photo4: t.photo4 || 'No Photo',
      driveFolder: t.googleDriveFolderUrl || 'Pending Sync',
      timeline: timelineStr
    });

    row.height = 24;

    const isEven = idx % 2 === 0;
    const rowFill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: isEven ? 'FFFFFFFF' : 'FFF8FAFC' }
    };

    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.fill = rowFill;
      cell.border = thinBorder;
      cell.font = { name: 'Segoe UI', size: 10, color: { argb: 'FF0F172A' } };

      const colKey = columns[colNumber - 1]?.key;

      if (colKey === 'createdAt' || colKey === 'resolvedAt') {
        if (cell.value instanceof Date) {
          cell.numFmt = 'dd/mm/yyyy hh:mm AM/PM';
        }
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      } else if (colKey === 'udise' || colKey === 'phone') {
        cell.numFmt = '@';
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
      } else if (colKey === 'ticketId' || colKey === 'priority' || colKey === 'status' || colKey === 'resolutionCategory' || colKey === 'district' || colKey === 'block') {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      } else if (colKey === 'issue' || colKey === 'resolutionNotes' || colKey === 'timeline') {
        cell.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true };
      } else {
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
      }

      // Highlight Priority
      if (colKey === 'priority') {
        const val = String(cell.value || '').toLowerCase();
        if (val.includes('critical')) cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFDC2626' } };
        else if (val.includes('high')) cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFEA580C' } };
        else if (val.includes('medium')) cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFD97706' } };
        else if (val.includes('low')) cell.font = { name: 'Segoe UI', size: 10, color: { argb: 'FF16A34A' } };
      }

      // Highlight Status
      if (colKey === 'status') {
        const st = String(cell.value || '');
        if (st.includes('Resolved') || st.includes('Solved')) {
          cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF15803D' } };
        } else if (st.includes('Vendor')) {
          cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FFB91C1C' } };
        } else if (st.includes('Progress') || st.includes('Visit')) {
          cell.font = { name: 'Segoe UI', size: 10, bold: true, color: { argb: 'FF1D4ED8' } };
        }
      }
    });
  });

  // 2. DETAIL SHEET: "Photo & Activity Detail"
  const wsDetail = workbook.addWorksheet('Photo & Activity Detail', {
    views: [{ state: 'frozen', ySplit: 1 }]
  });

  const detailCols = [
    { header: 'Ticket ID', key: 'ticketId', width: 16 },
    { header: 'School Name', key: 'schoolName', width: 30 },
    { header: 'UDISE Code', key: 'udise', width: 14 },
    { header: 'Status', key: 'status', width: 16 },
    { header: 'Photo 1 (Front Panel)', key: 'photo1', width: 28 },
    { header: 'Photo 2 (Overall UPS)', key: 'photo2', width: 28 },
    { header: 'Photo 3 (Battery/MCB)', key: 'photo3', width: 28 },
    { header: 'Photo 4 (Isolation Transformer)', key: 'photo4', width: 28 },
    { header: 'Activity Log History', key: 'timeline', width: 55 }
  ];

  wsDetail.columns = detailCols;

  const dHeader = wsDetail.getRow(1);
  dHeader.height = 28;
  dHeader.font = { name: 'Segoe UI', size: 10.5, bold: true, color: { argb: 'FFFFFFFF' } };
  dHeader.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF0F766E' } }; // Teal Green
  dHeader.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
  dHeader.border = {
    top: { style: 'medium', color: { argb: 'FF0F766E' } },
    bottom: { style: 'medium', color: { argb: 'FF0F766E' } },
    left: { style: 'thin', color: { argb: 'FF14B8A6' } },
    right: { style: 'thin', color: { argb: 'FF14B8A6' } }
  };

  wsDetail.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: detailCols.length }
  };

  tickets.forEach((t, idx) => {
    const timelineStr = (t.timeline || []).map(e => `[${e.time}] ${e.action}: ${e.note}`).join('\n');
    const dRow = wsDetail.addRow({
      ticketId: t.ticketId || '',
      schoolName: t.schoolName || '',
      udise: String(t.udise || ''),
      status: t.status || 'New / Under Review',
      photo1: t.photo1 || 'No Photo',
      photo2: t.photo2 || 'No Photo',
      photo3: t.photo3 || 'No Photo',
      photo4: t.photo4 || 'No Photo',
      timeline: timelineStr
    });

    dRow.height = timelineStr.includes('\n') ? 55 : 28;
    const isEven = idx % 2 === 0;

    dRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      cell.fill = {
        type: 'pattern',
        pattern: 'solid',
        fgColor: { argb: isEven ? 'FFFFFFFF' : 'FFF0FDFA' }
      };
      cell.border = thinBorder;
      cell.font = { name: 'Segoe UI', size: 10, color: { argb: 'FF0F172A' } };

      const colKey = detailCols[colNumber - 1]?.key;
      if (colKey === 'ticketId' || colKey === 'udise' || colKey === 'status') {
        cell.alignment = { vertical: 'middle', horizontal: 'center' };
      } else if (colKey === 'timeline') {
        cell.alignment = { vertical: 'top', horizontal: 'left', wrapText: true };
      } else {
        cell.alignment = { vertical: 'middle', horizontal: 'left' };
      }
    });
  });

  return await workbook.xlsx.writeBuffer();
}

async function generateCsvExport() {
  const list = await getAllTickets();
  const headers = [
    'Ticket ID', 'Created At', 'Priority', 'Status', 'Resolution Category', 'District', 'Block', 'School Name', 'UDISE Code',
    'AI Instructor Name', 'AI Instructor Mobile Number', 'Reported UPS Issue', 'Duration', 'UPS Serial Number',
    'Resolution Type', 'Vendor Name', 'Vendor Ticket No', 'Parts Required', 'Resolution Notes',
    'Resolved At', 'Photo 1 (Front Panel)', 'Photo 2 (Overall UPS)', 'Photo 3 (Battery/MCB)', 'Photo 4 (Isolation Transformer)', 'Activity Log History'
  ];
  const rows = list.map(t => [
    '"' + (t.ticketId || '') + '"',
    '"' + (t.createdAt || '') + '"',
    '"' + normalizePriority(t.priority, t.issue) + '"',
    '"' + (t.status || 'New / Under Review') + '"',
    '"' + (t.resolutionCategory || 'Pending') + '"',
    '"' + (t.district || 'Thiruvarur') + '"',
    '"' + (t.block || '') + '"',
    '"' + (t.schoolName || '').replace(/"/g, '""') + '"',
    '"' + (t.udise || '') + '"',
    '"' + (t.aiName || '').replace(/"/g, '""') + '"',
    '"' + (t.phone || '') + '"',
    '"' + (t.issue || '').replace(/"/g, '""') + '"',
    '"' + (t.duration || '') + '"',
    '"' + (t.serialNo || '') + '"',
    '"' + (t.resolutionType || '') + '"',
    '"' + (t.vendorName || '') + '"',
    '"' + (t.vendorTicketNo || '') + '"',
    '"' + (t.partsRequired || '').replace(/"/g, '""') + '"',
    '"' + (t.resolutionNotes || '').replace(/"/g, '""') + '"',
    '"' + (t.resolvedAt || '') + '"',
    '"' + (t.photo1 || 'No Photo') + '"',
    '"' + (t.photo2 || 'No Photo') + '"',
    '"' + (t.photo3 || 'No Photo') + '"',
    '"' + (t.timeline || []).map(e => '[' + e.time + '] ' + e.action + ': ' + e.note).join(' | ').replace(/"/g, '""') + '"'
  ]);
  return '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
}

function getDatabaseType() {
  if (!usePostgres || !process.env.DATABASE_URL) return 'local-json';
  if (process.env.DATABASE_URL.includes('neon.tech')) return 'neon';
  return 'render-postgres';
}


function registerOrUpdateSchool(info) {
  if (!info || !info.udise) return;
  const cleanUdise = String(info.udise).trim();
  const cleanSchool = String(info.schoolName || '').trim();
  const cleanBlock = String(info.block || '').trim() || 'Other';
  const cleanAi = String(info.aiName || '').trim();
  const cleanPhone = String(info.phone || '').trim();
  const cleanDistrict = String(info.district || 'Thiruvarur').trim();

  if (!cleanUdise || cleanUdise.length < 6 || !cleanSchool) return;

  let existing = masterSchools.find(s => String(s.udise || '').trim() === cleanUdise);
  let updated = false;

  if (existing) {
    if (cleanAi && existing.aiName !== cleanAi) {
      existing.aiName = cleanAi;
      updated = true;
    }
    if (cleanPhone && existing.aiPhone !== cleanPhone) {
      existing.aiPhone = cleanPhone;
      updated = true;
    }
    if (cleanSchool && existing.schoolName !== cleanSchool.toUpperCase()) {
      existing.schoolName = cleanSchool.toUpperCase();
      updated = true;
    }
    if (cleanBlock && (!existing.block || existing.block === 'Other')) {
      existing.block = cleanBlock;
      updated = true;
    }
  } else {
    const newSchoolEntry = {
      id: `TVR-EXT-${cleanUdise.slice(-5)}`,
      slNo: masterSchools.length + 1,
      empId: '',
      district: cleanDistrict,
      block: cleanBlock,
      udise: cleanUdise,
      schoolName: cleanSchool.toUpperCase(),
      category: cleanSchool.toUpperCase().includes('HSS') ? 'HSS' : (cleanSchool.toUpperCase().includes('GHS') ? 'GHS' : (cleanSchool.toUpperCase().includes('PUMS') || cleanSchool.toUpperCase().includes('GMS') ? 'MS' : 'School')),
      aiPhone: cleanPhone,
      aiName: cleanAi
    };
    masterSchools.push(newSchoolEntry);
    updated = true;
    console.log(`✨ [NEW SCHOOL DISCOVERED & SAVED] ${newSchoolEntry.schoolName} (${newSchoolEntry.udise}) added to master directory!`);
  }

  if (updated) {
    try {
      safeWriteFileSync(SCHOOLS_FILE, JSON.stringify(masterSchools, null, 2), 'utf8');
      
      const dirFile = path.join(__dirname, 'Hi-Tech_Lab_Warriors_Thiruvarur_Directory.json');
      if (fs.existsSync(dirFile)) {
        let dirList = JSON.parse(fs.readFileSync(dirFile, 'utf8'));
        let dirItem = dirList.find(d => String(d.udise || '').trim() === cleanUdise);
        if (dirItem) {
          if (cleanAi) dirItem.name = cleanAi;
          if (cleanPhone) dirItem.phone = '+91' + cleanPhone.replace(/\D/g, '');
          if (cleanSchool) dirItem.school = cleanSchool.toUpperCase();
          if (cleanBlock) dirItem.block = cleanBlock;
          dirItem.displayName = `HTL TVR - ${dirItem.name || 'AI'} (${dirItem.school}, ${dirItem.block})`;
        } else {
          dirList.push({
            sno: String(dirList.length + 1),
            empId: '',
            name: cleanAi || 'AI Instructor',
            school: cleanSchool.toUpperCase(),
            block: cleanBlock,
            district: cleanDistrict,
            udise: cleanUdise,
            phone: '+91' + cleanPhone.replace(/\D/g, ''),
            displayName: `HTL TVR - ${cleanAi || 'AI'} (${cleanSchool.toUpperCase()}, ${cleanBlock})`
          });
        }
        safeWriteFileSync(dirFile, JSON.stringify(dirList, null, 2), 'utf8');
      }
    } catch(err) {
      console.error('Error saving updated school directory:', err.message);
    }
  }
}

function normalizeIndianPhone(raw) {
  if (!raw && raw !== 0) return '';
  let str = String(raw).trim();
  if (str === 'null' || str === 'undefined' || str === '-' || str === 'Not Found') return '';
  if (str.startsWith('+91')) {
    str = str.slice(3);
  }
  let digits = str.replace(/\D/g, '');
  if (digits.length === 11 && digits.startsWith('0')) {
    digits = digits.slice(1);
  }
  if (digits.length === 12 && digits.startsWith('91')) {
    digits = digits.slice(2);
  }
  return digits;
}

function isValidIndianPhone(raw) {
  const norm = normalizeIndianPhone(raw);
  return /^[6-9]\d{9}$/.test(norm);
}

function maskPhone(phone) {
  if (!phone) return '[NONE]';
  const str = String(phone).trim();
  if (str.length <= 5) return '*****';
  return str.substring(0, 5) + '*****';
}

async function getAuditLogs() {
  if (usePostgres && pool) {
    try {
      const res = await pool.query('SELECT * FROM audit_log ORDER BY id DESC LIMIT 500');
      return res.rows;
    } catch(e){}
  }
  if (fs.existsSync(AUDIT_LOG_FILE)) {
    try { return JSON.parse(fs.readFileSync(AUDIT_LOG_FILE, 'utf8')); } catch(e){}
  }
  return [];
}

async function createBackup(reason = 'MANUAL_BACKUP', initiatedBy = 'system') {
  const tickets = await getAllTickets();
  const ts = Date.now();
  const backupFile = path.join(BACKUPS_DIR, 'backup_' + ts + '.json');
  safeWriteFileSync(backupFile, JSON.stringify(tickets, null, 2), 'utf8');
  return { success: true, count: tickets.length, file: backupFile };
}

module.exports = {
  safeWriteFileSync,
  initDatabase,
  getAllTickets,
  getAllTicketsSync,
  checkOpenTicketByUdise,
  createTicket,
  updateTicket,
  deleteTicket,
  deleteCompletionEvidence,
  resetAllTickets,
  logAudit,
  getAuditLogs,
  createBackup,
  generateCsvExport,
  generateExcelExport,
  normalizePriority,
  masterSchools,
  registerOrUpdateSchool,
  getDatabaseType,
  isTestOrPurgedTicket,
  PERMANENT_TOMBSTONES,
  deletedTicketIds,
  parseAppDate,
  formatAppDate,
  formatRelativeTime,
  getDeletedIds: () => Array.from(deletedTicketIds),
  addDeletedTombstones,
  isDeleted,
  loadTicketsFromJson,
  getCanonicalActiveTickets,
  KNOWN_TEST_PURGED_IDS,
  normalizeIndianPhone,
  isValidIndianPhone,
  maskPhone,
  syncGasTickets,
  extractDriveFileId
};
