# Android app (Google Play)

The web game is wrapped with [Capacitor](https://capacitorjs.com) into the native project in `android/`.
The app build (`--mode android`, see `.env.android`) never loads the CrazyGames SDK: it shows AdMob ads instead
(`src/admob.js`, `@capacitor-community/admob`): an interstitial between deliveries and rewarded video for the
double-tips bonus, with Google's consent form for EU players.

## AdMob ids

Until real ids are set the app shows Google's test ads (they never pay). With an AdMob account:
- app id (`ca-app-pub-...~...`) in `android/app/src/main/res/values/strings.xml`, `admob_app_id`;
- interstitial and rewarded ad unit ids (`ca-app-pub-.../...`) in `.env.android`.

Then rebuild. Never tap your own real ads: AdMob bans accounts for it.
The game runs offline from the bundled files; only the world leaderboard needs the internet.

## Build

Needs Node, JDK 21 and the Android SDK (`ANDROID_HOME`, or `android/local.properties` with `sdk.dir=...`).

```bash
npm install
npm run build:android            # web build in app mode + copy into android/
cd android
./gradlew bundleRelease          # app/build/outputs/bundle/release/app-release.aab  (upload to Play)
./gradlew assembleRelease        # app/build/outputs/apk/release/app-release.apk    (install on a phone)
```

Release signing reads `android/keystore.properties` (not in git):

```
storeFile=pizzadriver-upload.jks
storePassword=...
keyAlias=pizzadriver
keyPassword=...
```

Without that file Gradle still builds, but the release outputs are unsigned.

## New version

Raise `versionCode` (by 1, Play rejects a repeated one) and `versionName` in `android/app/build.gradle`, then build again.

## Privacy policy

Play needs a public privacy policy URL because the leaderboard sends the rider name to a server.
`public/privacy.html` is served by the worker at `https://pizza-driver-board.goat-leaderboard.workers.dev/privacy.html`.
