#!/usr/bin/env bash
# پیش‌نیاز: Node.js 22+، JDK 21، Android SDK (API 36) و متغیر ANDROID_HOME  (یا فقط Android Studio)
set -e
cd "$(dirname "$0")"
npm install
npm run sync
cd android && ./gradlew assembleDebug
echo "APK: android/app/build/outputs/apk/debug/app-debug.apk"
