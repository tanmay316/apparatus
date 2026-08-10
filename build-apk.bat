@echo off
echo ===================================================
echo   Starting Android APK Build Process
echo ===================================================
echo.

echo [1/4] Building web assets...
call npm run build

echo.
echo [2/4] Syncing latest web assets to Android...
call npx cap sync android

echo.
echo [3/4] Configuring Java Runtime and Android SDK...
set JAVA_HOME=C:\Program Files\Android\Android Studio\jbr
set ANDROID_HOME=C:\Users\Tms\AppData\Local\Android\Sdk

echo.
echo [4/4] Compiling the APK (This may take a minute)...
cd android
call .\gradlew.bat assembleDebug
cd ..

copy /y android\app\build\outputs\apk\debug\app-debug.apk apparatus.apk

echo.
echo ===================================================
echo   Build Complete!
echo   Your APK is located right here in your project root:
echo   apparatus.apk
echo ===================================================
pause
