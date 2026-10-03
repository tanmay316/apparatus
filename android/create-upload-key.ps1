# Creates the Play Store upload key (android/apparatus-upload.jks) and android/keystore.properties.
# Run once from the repo root:  powershell -ExecutionPolicy Bypass -File android/create-upload-key.ps1
# Back up the .jks file and its password somewhere safe (password manager + offline copy).
# Losing it means asking Google Play support to reset the upload key.
$ErrorActionPreference = 'Stop'
$android = $PSScriptRoot
$jks = Join-Path $android 'apparatus-upload.jks'
$props = Join-Path $android 'keystore.properties'
$keytool = 'C:\Program Files\Java\jdk-21\bin\keytool.exe'
if (-not (Test-Path $keytool)) { $keytool = 'keytool' }

if (Test-Path $jks) {
  Write-Host "Upload key already exists: $jks" -ForegroundColor Yellow
} else {
  $secure = Read-Host 'Choose a keystore password (min 8 characters)' -AsSecureString
  $pass = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure))
  if ($pass.Length -lt 8) { throw 'Password must be at least 8 characters.' }
  $name = Read-Host 'Your name or company (shown in the certificate)'
  $org = (Get-Content (Join-Path $android '..\brand.config.json') -Raw | ConvertFrom-Json).name
  & $keytool -genkeypair -keystore $jks -storetype PKCS12 -alias upload -keyalg RSA -keysize 4096 -validity 10000 `
    -storepass $pass -keypass $pass -dname "CN=$name, O=$org, C=IN"
  if ($LASTEXITCODE -ne 0) { throw 'keytool failed.' }
  @"
storeFile=apparatus-upload.jks
storePassword=$pass
keyAlias=upload
keyPassword=$pass
"@ | Set-Content -Path $props -Encoding ASCII
  Write-Host "Created $jks and $props (both are git-ignored)." -ForegroundColor Green
}

Write-Host "`nUpload key fingerprints (add SHA-1 and SHA-256 to Firebase > Project settings > Android app):" -ForegroundColor Cyan
& $keytool -list -v -keystore $jks -alias upload | Select-String 'SHA1:|SHA256:'
Write-Host "`nAfter the first upload, also add the 'App signing key' SHA-1/SHA-256 from Play Console > Setup > App signing." -ForegroundColor Cyan
