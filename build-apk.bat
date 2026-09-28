@echo off
setlocal
cd /d "%~dp0"

set "JAVA_HOME=C:\Program Files\Java\jdk-21"
set "ANDROID_HOME=C:\Users\Tms\AppData\Local\Android\Sdk"
set "PATH=%JAVA_HOME%\bin;%PATH%"

echo ===================================================
echo   Apparatus Android build
echo ===================================================

echo.
echo [1/5] Bumping native version...
rem A new nativeVersion changes versionCode and the OTA runtimeVersion, so the
rem installed app drops any previously downloaded web bundle on first launch.
call node -e "const fs=require('fs');const p=JSON.parse(fs.readFileSync('package.json','utf8'));const v=(p.nativeVersion||'1.0.0').split('.').map(Number);v[2]++;p.nativeVersion=v.join('.');fs.writeFileSync('package.json',JSON.stringify(p,null,2)+'\n');console.log('   nativeVersion = '+p.nativeVersion)"
if errorlevel 1 goto :fail

echo.
echo [2/5] Building web assets...
if exist dist rmdir /s /q dist
call npm run build
if errorlevel 1 goto :fail

echo.
echo [3/5] Syncing web assets and plugins to Android...
call npx cap sync android
if errorlevel 1 goto :fail

echo.
if exist android\keystore.properties (
  echo [4/5] Compiling signed release APK + Play Store bundle...
  pushd android
  call gradlew.bat clean assembleRelease bundleRelease
  if errorlevel 1 ( popd & goto :fail )
  popd
  copy /y android\app\build\outputs\apk\release\app-release.apk Apparatus.apk >nul
  copy /y android\app\build\outputs\bundle\release\app-release.aab Apparatus.aab >nul
  set "OUT=Apparatus.apk (install) and Apparatus.aab (upload to Play Console)"
) else (
  echo [4/5] No android\keystore.properties found - compiling DEBUG APK only...
  pushd android
  call gradlew.bat clean assembleDebug
  if errorlevel 1 ( popd & goto :fail )
  popd
  copy /y android\app\build\outputs\apk\debug\app-debug.apk Apparatus.apk >nul
  set "OUT=Apparatus.apk (debug build, not for Play Store)"
)
if errorlevel 1 goto :fail

echo.
echo [5/5] Done.
echo ===================================================
echo   Output: %OUT%
echo ===================================================
exit /b 0

:fail
echo.
echo ===================================================
echo   BUILD FAILED - see the errors above.
echo ===================================================
exit /b 1
