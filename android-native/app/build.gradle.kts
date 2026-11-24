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
        // CI numbers every build (1000 + the run number), so a newer build always has a higher number and can update the installed one.
        versionCode = (project.findProperty("versionCode") as String?)?.toIntOrNull() ?: 100
        versionName = "2.0.0"
        // The game server. Override for a local server: ./gradlew assembleDebug -PserverUrl=http://10.0.2.2:3000
        val server = (project.findProperty("serverUrl") as String?) ?: "https://hexlands-r2fs.onrender.com"
        buildConfigField("String", "SERVER_URL", "\"$server\"")
        // Where updates for the test build come from (GitHub Releases of this repository).
        buildConfigField("String", "UPDATE_REPO", "\"vivekmuralee07/Hexlands\"")
    }

    // The test build is always signed with the same key (test-signing.jks, in the repository on purpose: it protects nothing, it only lets a new test build
    // replace the installed one, so the app can update itself). The Play Store build is signed with your own upload key, never with this one.
    signingConfigs {
        create("testBuild") {
            storeFile = rootProject.file("test-signing.jks")
            storePassword = "hexlands-test"
            keyAlias = "hexlands-test"
            keyPassword = "hexlands-test"
        }
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    buildTypes {
        debug {
            // The test build gets its own ID, so it installs next to the Play Store app instead of fighting it (the two are signed with different keys).
            applicationIdSuffix = ".debug"
            versionNameSuffix = "-test"
            signingConfig = signingConfigs.getByName("testBuild")
            // Only the test build updates itself; an app from the Play Store is updated by the Play Store.
            buildConfigField("boolean", "SELF_UPDATE", "true")
        }
        release {
            isMinifyEnabled = false
            buildConfigField("boolean", "SELF_UPDATE", "false")
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
// -PnoScreenTests=true runs only the tests that need no Android runtime (the server and card tests), without downloading anything for Robolectric.
val noScreenTests = project.findProperty("noScreenTests") == "true"
tasks.withType<Test>().configureEach {
    if (noScreenTests) {
        filter {
            excludeTestsMatching("com.hexlands.app.ScreenshotTest")
            excludeTestsMatching("com.hexlands.app.BoardTapTest")
        }
    } else {
        dependsOn(copyRobolectricRuntime)
    }
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
