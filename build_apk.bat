@echo off
REM پیش‌نیاز: Node.js 22+، JDK 21، Android SDK (API 36) و متغیر ANDROID_HOME  (یا فقط Android Studio)
cd /d "%~dp0"
call npm install
call npm run sync
cd android
call gradlew.bat assembleDebug
echo.
echo APK: android\app\build\outputs\apk\debug\app-debug.apk
pause
