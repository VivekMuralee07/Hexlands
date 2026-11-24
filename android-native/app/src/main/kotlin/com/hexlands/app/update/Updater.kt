package com.hexlands.app.update

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.flowOn
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.long
import okhttp3.OkHttpClient
import okhttp3.Request
import java.io.File
import java.io.IOException

/** A build that is newer than the one installed: its number, what changed, and where its APK is. */
data class UpdateInfo(val versionCode: Int, val notes: String, val apkUrl: String, val sizeBytes: Long)

/** Where the update stands, for the screen to show. */
sealed interface UpdateState {
    data object Idle : UpdateState
    data object Checking : UpdateState
    data object UpToDate : UpdateState
    data class Available(val info: UpdateInfo) : UpdateState
    data class Downloading(val info: UpdateInfo, val percent: Int) : UpdateState
    /** Downloaded; Android's installer is next (it asks for your OK, and for permission to install from this app the first time). */
    data class Ready(val info: UpdateInfo, val file: File) : UpdateState
    data class Failed(val message: String) : UpdateState
}

/**
 * The test build updates itself from the GitHub Releases of this repository: every merged build is published as a release named `app-<number>`
 * with `hexlands-test.apk` attached. [parseRelease] reads the newest release; Android only accepts the new APK over the installed app if it is
 * signed with the same key (test-signing.jks), so nothing else can replace the app this way.
 */
object Updater {
    const val APK_NAME = "hexlands-test.apk"

    /** Reads GitHub's "latest release" answer. Returns null for a draft, a pre-release, or a release that is not one of ours. */
    fun parseRelease(json: String, repo: String): UpdateInfo? {
        val o = runCatching { Json.parseToJsonElement(json).jsonObject }.getOrNull() ?: return null
        if (o.bool("draft") || o.bool("prerelease")) return null
        val tag = o["tag_name"]?.jsonPrimitive?.contentOrNull ?: return null
        val code = Regex("^app-(\\d{1,9})$").find(tag)?.groupValues?.get(1)?.toIntOrNull() ?: return null
        val asset = (o["assets"] as? JsonArray)?.map { it.jsonObject }?.firstOrNull { it["name"]?.jsonPrimitive?.contentOrNull == APK_NAME } ?: return null
        val url = asset["browser_download_url"]?.jsonPrimitive?.contentOrNull ?: return null
        if (!url.startsWith("https://github.com/$repo/releases/download/")) return null   // only this repository's own releases
        val size = runCatching { asset["size"]!!.jsonPrimitive.long }.getOrDefault(0L)
        return UpdateInfo(code, o["body"]?.jsonPrimitive?.contentOrNull.orEmpty().trim(), url, size)
    }

    private fun JsonObject.bool(key: String) = runCatching { this[key]!!.jsonPrimitive.boolean }.getOrDefault(false)

    /** The newest build if it is newer than [installedCode]; null if the installed one is current (or the release cannot be used). */
    fun newerThan(installedCode: Int, latest: UpdateInfo?): UpdateInfo? = latest?.takeIf { it.versionCode > installedCode }

    /** Asks GitHub for the newest release. Throws [IOException] when it cannot be reached. */
    fun fetchLatest(http: OkHttpClient, repo: String): UpdateInfo? {
        val req = Request.Builder().url("https://api.github.com/repos/$repo/releases/latest").header("Accept", "application/vnd.github+json").build()
        http.newCall(req).execute().use { r ->
            if (r.code == 404) return null   // no release yet
            if (!r.isSuccessful) throw IOException("GitHub answered ${r.code}")
            return parseRelease(r.body?.string().orEmpty(), repo)
        }
    }

    /**
     * Downloads the APK into [dir]; emits the percentage as it goes (0 to 100), and the finished file last. The file is only given its final name when it is
     * complete and the size matches what GitHub says.
     */
    fun download(http: OkHttpClient, info: UpdateInfo, dir: File): Flow<Result<Pair<Int, File?>>> = flow {
        dir.mkdirs()
        val part = File(dir, "$APK_NAME.part"); val done = File(dir, APK_NAME)
        part.delete(); done.delete()
        try {
            http.newCall(Request.Builder().url(info.apkUrl).build()).execute().use { r ->
                if (!r.isSuccessful) throw IOException("The download failed (${r.code}).")
                val body = r.body ?: throw IOException("The download was empty.")
                val total = body.contentLength().takeIf { it > 0 } ?: info.sizeBytes
                var got = 0L; var last = -1
                body.byteStream().use { input ->
                    part.outputStream().use { out ->
                        val buf = ByteArray(64 * 1024)
                        while (true) {
                            val n = input.read(buf); if (n < 0) break
                            out.write(buf, 0, n); got += n
                            val pct = if (total > 0) (100 * got / total).toInt().coerceIn(0, 100) else 0
                            if (pct != last) { last = pct; emit(Result.success(pct to null)) }
                        }
                    }
                }
                if (info.sizeBytes > 0 && got != info.sizeBytes) throw IOException("The download was cut short ($got of ${info.sizeBytes} bytes).")
            }
            if (!part.renameTo(done)) throw IOException("Could not save the download.")
            emit(Result.success(100 to done))
        } catch (e: Exception) {
            part.delete()
            emit(Result.failure(if (e is IOException) e else IOException(e.message ?: "The download failed.", e)))
        }
    }.flowOn(Dispatchers.IO)

    fun updatesDir(context: Context) = File(context.cacheDir, "updates")

    /** True if Android lets this app start an install (from Android 8 you allow it once per app). */
    fun canInstall(context: Context) = Build.VERSION.SDK_INT < 26 || context.packageManager.canRequestPackageInstalls()

    /** Opens the "allow installing apps from Hexlands" setting. */
    fun openInstallPermissionSettings(context: Context) {
        if (Build.VERSION.SDK_INT >= 26) context.startActivity(
            Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:${context.packageName}")).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK),
        )
    }

    /** Hands the downloaded APK to Android's installer, which asks you to confirm the update. */
    fun install(context: Context, apk: File) {
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.fileprovider", apk)
        context.startActivity(
            Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive")
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_ACTIVITY_NEW_TASK),
        )
    }
}
