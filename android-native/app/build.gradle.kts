plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.android)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
}

android {
    // Same application ID as the Play Store app made with PWABuilder, so this app can update that listing (it must be signed with the same key).
    namespace = "com.hexlands.app"
    compileSdk = 36

    defaultConfig {
        applicationId = "com.vivek.hexlands_r2fs.twa"
        minSdk = 24
        targetSdk = 36
        versionCode = 100
        versionName = "2.0.0-native"
        // The game server. Override for a local server: ./gradlew assembleDebug -PserverUrl=http://10.0.2.2:3000
        val server = (project.findProperty("serverUrl") as String?) ?: "https://hexlands-r2fs.onrender.com"
        buildConfigField("String", "SERVER_URL", "\"$server\"")
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    buildTypes {
        debug {
            // The test build gets its own ID, so it installs next to the Play Store app instead of fighting it (the two are signed with different keys).
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-debug"
        }
        release {
            isMinifyEnabled = false
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
    testOptions {
        unitTests.isReturnDefaultValues = true
        unitTests.isIncludeAndroidResources = true   // Robolectric draws the real screens on the JVM (see ScreenshotTest)
    }
}

// Robolectric (the screen tests) needs an Android runtime jar per SDK it simulates. By default it downloads them itself straight from
// repo1.maven.org, which refuses big repeated downloads from shared build machines. Here Gradle fetches them like any other dependency (and caches
// them), copies them into build/robolectric-runtime, and Robolectric is told to use only that folder.
// One configuration per runtime: two versions of the same artifact in ONE configuration would be "resolved" by Gradle to the newest one only.
val robolectricRuntime34 by configurations.creating
val robolectricRuntime35 by configurations.creating
val copyRobolectricRuntime = tasks.register<Copy>("copyRobolectricRuntime") {
    from(robolectricRuntime34)
    from(robolectricRuntime35)
    into(layout.buildDirectory.dir("robolectric-runtime"))
}
tasks.withType<Test>().configureEach {
    dependsOn(copyRobolectricRuntime)
    systemProperty("robolectric.offline", "true")
    systemProperty("robolectric.dependency.dir", layout.buildDirectory.dir("robolectric-runtime").get().asFile.absolutePath)
}

dependencies {
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.foundation)
    implementation(libs.compose.material3)
    implementation(libs.compose.ui.tooling.preview)
    implementation(libs.okhttp)
    implementation(libs.okhttp.sse)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.kotlinx.coroutines.android)

    testImplementation(libs.junit)
    testImplementation(libs.kotlinx.coroutines.test)
    testImplementation(libs.okhttp)
    testImplementation(libs.okhttp.sse)
    testImplementation(libs.kotlinx.serialization.json)
    testImplementation(libs.robolectric)
    testImplementation(libs.androidx.test.core)
    testImplementation(platform(libs.compose.bom))
    testImplementation(libs.compose.ui.test.junit4)
    debugImplementation(libs.compose.ui.test.manifest)

    // The Android runtimes for Robolectric 4.14.1: SDK 34 (what the tests ask for with @Config(sdk = [34])) and SDK 35. Both are needed: on Java 21 only 34
    // is used, but on Java 17 (what CI runs) Robolectric loads 35 as well, and with the offline setting above a missing file fails every test.
    robolectricRuntime34("org.robolectric:android-all-instrumented:14-robolectric-10818077-i7")
    robolectricRuntime35("org.robolectric:android-all-instrumented:15-robolectric-12650502-i7")
}
