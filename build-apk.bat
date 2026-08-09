@echo off
echo ===================================================
echo   Starting Android APK Build Process
echo ===================================================
echo.

echo [1/3] Syncing latest web assets to Android...
call npx cap sync android

echo.
echo [2/3] Configuring Java Runtime and Android SDK...
set JAVA_HOME=C:\Program Files\Android\Android Studio\jbr
set ANDROID_HOME=C:\Users\Tms\AppData\Local\Android\Sdk

echo.
echo [3/3] Compiling the APK (This may take a minute)...
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
