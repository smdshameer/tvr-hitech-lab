# WEB GPS CAMERA ARCHITECTURE — PRODUCTION DIRECTIVES (PHASE 37)

## 🎯 PRIMARY ARCHITECTURE: IN-BROWSER WEB GPS CAMERA

The application uses an in-browser, mobile-first **Web GPS Camera** as the **primary and only** completion photo capture system for teachers.

**NO APK INSTALLATION IS REQUIRED.**

---

## 📷 WORKFLOW SPECIFICATION

1. **Access:** Teacher opens the Teacher Portal in Chrome on an Android mobile device over trusted HTTPS.
2. **Launch:** Teacher navigates to Slot 2 (UPS Completion Photo) and taps **"Take UPS Photo"**.
3. **Viewfinder:** The full-screen `#webGpsCameraModal` opens inside the portal.
4. **Permissions:** The browser requests Camera and Location permissions.
5. **Streams:**
   - Camera: High-resolution rear camera via `navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } })` with automatic resolution fallbacks.
   - Location: Real-time high-accuracy continuous GPS stream via `navigator.geolocation.watchPosition(..., { enableHighAccuracy: true })`.
6. **Gating:** Shutter button remains strictly **disabled** until GPS accuracy is <= 50 meters and fresh.
7. **Watermark:** HTML5 Canvas burns a permanent visible GPS metadata stamp (Coordinates, Date/Time, School, UDISE, Ticket ID, Source) into the image pixels.
8. **Server-Side EXIF:** On submission to `/api/tickets/completion-evidence`, the server validates coordinates and freshness, and injects genuine TIFF/EXIF GPS tags (`0x8825` GPS IFD) into the stored JPEG file.
9. **Slot 1 Independence:** Slot 1 (HM Signed Completion Report) remains completely independent and requires no GPS watermark.
10. **Data Integrity:** All 262 master schools and ticket lifecycles remain protected and intact.

---

## 🛡️ MANDATORY VERIFICATION PIPELINE

After any changes:
1. Run `node tests/web-gps-camera.test.js`
2. Run `npm test`
3. Verify zero syntax errors in `server.js`
