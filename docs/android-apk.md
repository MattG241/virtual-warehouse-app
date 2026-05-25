# Build the Android APK

Two ways to install the Virtual Warehouse app on your phone:

## 1. Install as a PWA (no APK needed — easiest)

This is the **fastest** and works on every Android phone, no app-store account, no signing key.

1. Open `https://virtual-warehouse-app-production.up.railway.app/` (or wherever the app is hosted) in **Chrome on Android**.
2. After 5–10s, you'll see an "Install Virtual Warehouse" pill near the bottom — tap **Install**.
   - Or use the Chrome menu (⋮) → **Add to Home screen**.
3. The app appears on your home screen as a real icon. Tapping it launches the app full-screen (no Chrome address bar), with offline support for the shell + the last good inventory snapshot.

On iOS the same flow exists via Safari → Share → **Add to Home Screen**.

## 2. Build a signed APK (sideload or upload to Play)

Use the **Build Android APK** GitHub Actions workflow.

### First time

1. **Pick a signing key.** Generate one locally:
   ```bash
   keytool -genkeypair \
     -keystore android.keystore \
     -alias android \
     -keyalg RSA -keysize 2048 \
     -validity 10000 \
     -storepass YOUR_STRONG_PASSWORD
   ```
   Save the keystore file *somewhere safe*. If you lose it you can't push updates to the same Play listing.

2. **Add the keystore as a GitHub secret** (Settings → Secrets and variables → Actions):
   - `KEYSTORE_BASE64` — `base64 -i android.keystore | pbcopy` (Mac) or `base64 -w0 android.keystore` (Linux)
   - `KEYSTORE_PASSWORD` — the password you used above
   - `KEY_ALIAS` — `android`
   - `KEY_PASSWORD` — same as keystore password (unless you set a separate one)

3. **Run the workflow once with `release_track=signed`.** The job will print an `assetlinks.json` snippet with the signing key's SHA-256 fingerprint.

4. **Host `assetlinks.json` on the domain that serves the PWA.** Add a file at `/.well-known/assetlinks.json` with the printed content. Without this, Chrome opens the TWA in a "custom tabs" mode (with an address bar) instead of full-screen.

   For Railway, drop the file into `web/public/.well-known/assetlinks.json` so it gets served by the React build's static handler. (Will need to also configure Express to serve dotfiles — add `serveStatic` option `dotfiles: 'allow'` to the static config.)

5. **Re-run the workflow.** This time the APK + AAB artifacts come out signed. Download from the Actions run page.

### Sideloading the APK

```bash
adb install ./app-release.apk
# Or transfer to the phone via USB / email / drive and tap to install.
# You'll need to allow "Install from this source" for whatever app does the tap.
```

### Uploading to Google Play

Use the `.aab` (Android App Bundle) artifact, not the APK. Play Console → Create app → upload AAB.

## Architecture

The APK is a **Trusted Web Activity** — a thin Chrome wrapper that loads the live PWA URL. So every code change you push to Railway is *instantly* live in the installed app too; you only need to ship a new APK if you change branding (icon / name / package id) or the URL.

This means **users get updates without any app-store review**. The trade-off: the device needs an internet connection on first load (after that, the service worker caches the shell so subsequent launches work offline with last-good data).

## Files involved

- `twa-manifest.json` — Bubblewrap config (host, package id, icons, etc.)
- `.github/workflows/build-android-apk.yml` — CI job that produces the APK
- `web/public/manifest.webmanifest` — PWA manifest (Chrome reads this on install)
- `web/public/sw.js` — service worker (shell caching + offline data)
- `web/public/icon-{192,512}.png` + `icon-maskable-512.png` — required icon sizes for Android
