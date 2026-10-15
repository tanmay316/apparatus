# Add project specific ProGuard rules here.
# You can control the set of applied configuration files using the
# proguardFiles setting in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# Readable Play Console stack traces (deobfuscated with the bundled mapping.txt).
-keepattributes SourceFile,LineNumberTable,*Annotation*,Signature,InnerClasses,EnclosingMethod
-renamesourcefileattribute SourceFile

# WebView JS bridges (Capacitor MessageHandler, SystemBars).
-keepclassmembers class * {
    @android.webkit.JavascriptInterface <methods>;
}

# Capacitor plugins are loaded by class name from capacitor.plugins.json / registerPlugin.
-keep @com.getcapacitor.annotation.CapacitorPlugin public class * { *; }
-keep public class * extends com.getcapacitor.Plugin { *; }

# Social login probes these by name with Class.forName.
-keepnames class com.google.android.gms.common.api.ApiException
-keepnames class com.google.android.gms.auth.api.identity.** { *; }

# Optional deps referenced by plugins but not bundled.
-dontwarn com.facebook.**
-dontwarn com.auth0.android.jwt.**
-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn org.conscrypt.**
-dontwarn org.bouncycastle.**
-dontwarn org.openjsse.**
