# Orbis for Android

A small native shell (Java, one `WebView`) that shows the web app your Orbis hub
serves — see [docs/android.md](../../docs/android.md) for getting the APK,
connecting the phone and signing, and ADR 0012 for why it is built this way.

```bash
npm run android:apk                                  # from the repository root
gradle -p packages/android testReleaseUnitTest       # the address rules (Hub.java)
npm run brand:android                                # the launcher icons, from docs/brand
```

The APK is built by `.github/workflows/android.yml` (Actions → Android APK → Run workflow).
