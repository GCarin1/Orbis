// The user's health data from Health Connect (specs/android-app, specs/health, change 0062-health-connect):
// Google Fit, Zepp (Amazfit), Samsung Health and Fitbit write there, and the app reads — with the user's
// permission, only what they allowed, only to read — one value per day and metric and the workouts, for the
// page to send to the user's own hub. Nothing is written to Health Connect.
package app.orbis.android

import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.aggregate.AggregateMetric
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.BodyFatRecord
import androidx.health.connect.client.records.DistanceRecord
import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.records.OxygenSaturationRecord
import androidx.health.connect.client.records.Record
import androidx.health.connect.client.records.RestingHeartRateRecord
import androidx.health.connect.client.records.SleepSessionRecord
import androidx.health.connect.client.records.StepsRecord
import androidx.health.connect.client.records.TotalCaloriesBurnedRecord
import androidx.health.connect.client.records.WeightRecord
import androidx.health.connect.client.request.AggregateGroupByPeriodRequest
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import java.time.Instant
import java.time.LocalDate
import java.time.LocalDateTime
import java.time.Period
import java.time.ZoneId
import kotlin.reflect.KClass
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch
import org.json.JSONArray
import org.json.JSONObject

object HealthBridge {
    /** The Health Connect app, on Android 13 and older (Android 14 has it built in). */
    const val PROVIDER = "com.google.android.apps.healthdata"

    /** What the app may read: one record type per permission, read only. */
    private val TYPES: List<KClass<out Record>> = listOf(
        StepsRecord::class,
        DistanceRecord::class,
        ActiveCaloriesBurnedRecord::class,
        TotalCaloriesBurnedRecord::class,
        HeartRateRecord::class,
        RestingHeartRateRecord::class,
        SleepSessionRecord::class,
        ExerciseSessionRecord::class,
        WeightRecord::class,
        BodyFatRecord::class,
        OxygenSaturationRecord::class,
    )

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val main = Handler(Looper.getMainLooper())

    /** What the page gets back, as JSON, on the main thread. */
    fun interface Callback {
        fun done(json: String)
    }

    @JvmStatic
    fun permissions(): Set<String> = TYPES.map { HealthPermission.getReadPermission(it) }.toSet()

    /** "available", "update" (Health Connect must be installed or updated) or "unavailable" (this phone has none). */
    @JvmStatic
    fun status(context: Context): String = when (HealthConnectClient.getSdkStatus(context, PROVIDER)) {
        HealthConnectClient.SDK_AVAILABLE -> "available"
        HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED -> "update"
        else -> "unavailable"
    }

    /** The screen where the user allows reading, one switch per kind of data. */
    @JvmStatic
    fun requestIntent(context: Context): Intent =
        PermissionController.createRequestPermissionResultContract().createIntent(context, permissions())

    @JvmStatic
    fun parseResult(resultCode: Int, data: Intent?): Set<String> =
        PermissionController.createRequestPermissionResultContract().parseResult(resultCode, data)

    /** The permissions the user gave: {"granted":[...]} or {"error":"..."}. */
    @JvmStatic
    fun granted(context: Context, callback: Callback) {
        scope.launch {
            val json = try {
                if (status(context) != "available") JSONObject().put("granted", JSONArray()).put("status", status(context))
                else JSONObject().put("granted", JSONArray(grantedSet(context).toList())).put("status", "available")
            } catch (e: Exception) {
                JSONObject().put("error", e.message ?: e.toString())
            }
            main.post { callback.done(json.toString()) }
        }
    }

    private suspend fun grantedSet(context: Context): Set<String> =
        HealthConnectClient.getOrCreate(context).permissionController.getGrantedPermissions().intersect(permissions())

    /**
     * The last `days` days: {"days":[{date, metrics}], "sessions":[...], "sources":[...], "granted":[...]}, each
     * kind of data only when the user allowed it; or {"error":"..."}.
     */
    @JvmStatic
    fun read(context: Context, days: Int, callback: Callback) {
        scope.launch {
            val json = try {
                readJson(context, days.coerceIn(1, 90))
            } catch (e: Exception) {
                JSONObject().put("error", e.message ?: e.toString())
            }
            main.post { callback.done(json.toString()) }
        }
    }

    private suspend fun readJson(context: Context, days: Int): JSONObject {
        val client = HealthConnectClient.getOrCreate(context)
        val granted = grantedSet(context)
        fun allowed(type: KClass<out Record>) = HealthPermission.getReadPermission(type) in granted
        val zone = ZoneId.systemDefault()
        val firstDay = LocalDate.now(zone).minusDays((days - 1).toLong())
        val start = firstDay.atStartOfDay()
        val end = LocalDateTime.now(zone)
        val values = sortedMapOf<LocalDate, MutableMap<String, Double>>()
        val sources = mutableSetOf<String>()
        fun put(day: LocalDate, metric: String, value: Double?) {
            if (value != null && value.isFinite()) values.getOrPut(day) { mutableMapOf() }[metric] = value
        }

        // Day by day totals and averages, as Health Connect merges them across the apps that wrote them.
        val metrics = mutableSetOf<AggregateMetric<*>>()
        if (allowed(StepsRecord::class)) metrics += StepsRecord.COUNT_TOTAL
        if (allowed(DistanceRecord::class)) metrics += DistanceRecord.DISTANCE_TOTAL
        if (allowed(ActiveCaloriesBurnedRecord::class)) metrics += ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL
        if (allowed(TotalCaloriesBurnedRecord::class)) metrics += TotalCaloriesBurnedRecord.ENERGY_TOTAL
        if (allowed(HeartRateRecord::class)) metrics += setOf(HeartRateRecord.BPM_AVG, HeartRateRecord.BPM_MIN, HeartRateRecord.BPM_MAX)
        if (allowed(RestingHeartRateRecord::class)) metrics += RestingHeartRateRecord.BPM_AVG
        if (allowed(SleepSessionRecord::class)) metrics += SleepSessionRecord.SLEEP_DURATION_TOTAL
        if (allowed(ExerciseSessionRecord::class)) metrics += ExerciseSessionRecord.EXERCISE_DURATION_TOTAL
        if (allowed(WeightRecord::class)) metrics += WeightRecord.WEIGHT_AVG
        if (metrics.isNotEmpty()) {
            val groups = client.aggregateGroupByPeriod(
                AggregateGroupByPeriodRequest(metrics, TimeRangeFilter.between(start, end), Period.ofDays(1)),
            )
            for (group in groups) {
                val day = group.startTime.toLocalDate()
                val r = group.result
                r.dataOrigins.forEach { sources += it.packageName }
                put(day, "steps", r[StepsRecord.COUNT_TOTAL]?.toDouble())
                put(day, "distance_m", r[DistanceRecord.DISTANCE_TOTAL]?.inMeters)
                put(day, "active_kcal", r[ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL]?.inKilocalories)
                put(day, "total_kcal", r[TotalCaloriesBurnedRecord.ENERGY_TOTAL]?.inKilocalories)
                put(day, "heart_rate_avg", r[HeartRateRecord.BPM_AVG]?.toDouble())
                put(day, "heart_rate_min", r[HeartRateRecord.BPM_MIN]?.toDouble())
                put(day, "heart_rate_max", r[HeartRateRecord.BPM_MAX]?.toDouble())
                put(day, "resting_heart_rate", r[RestingHeartRateRecord.BPM_AVG]?.toDouble())
                put(day, "sleep_minutes", r[SleepSessionRecord.SLEEP_DURATION_TOTAL]?.toMinutes()?.toDouble())
                put(day, "exercise_minutes", r[ExerciseSessionRecord.EXERCISE_DURATION_TOTAL]?.toMinutes()?.toDouble())
                put(day, "weight_kg", r[WeightRecord.WEIGHT_AVG]?.inKilograms)
            }
        }

        val from = start.atZone(zone).toInstant()
        val until = Instant.now()
        val range = TimeRangeFilter.between(from, until)

        // The stages of each night, on the day it ended.
        if (allowed(SleepSessionRecord::class)) {
            val nights = client.readRecords(ReadRecordsRequest(SleepSessionRecord::class, range)).records
            val spans = nights.flatMap { night ->
                sources += night.metadata.dataOrigin.packageName
                night.stages.map { HealthDays.Span(night.endTime, it.startTime, it.endTime, it.stage) }
            }
            for ((day, stages) in HealthDays.sleepStages(spans, zone)) stages.forEach { (metric, minutes) -> put(day, metric, minutes) }
        }
        if (allowed(OxygenSaturationRecord::class)) {
            val readings = client.readRecords(ReadRecordsRequest(OxygenSaturationRecord::class, range)).records
            val byDay = readings.groupBy { it.time.atZone(zone).toLocalDate() }
            for ((day, list) in byDay) put(day, "oxygen_saturation_avg", list.map { it.percentage.value }.average())
        }
        if (allowed(BodyFatRecord::class)) {
            val readings = client.readRecords(ReadRecordsRequest(BodyFatRecord::class, range)).records
            for ((day, list) in readings.groupBy { it.time.atZone(zone).toLocalDate() }) put(day, "body_fat_pct", list.maxByOrNull { it.time }!!.percentage.value)
        }

        val sessions = JSONArray()
        if (allowed(ExerciseSessionRecord::class)) {
            for (s in client.readRecords(ReadRecordsRequest(ExerciseSessionRecord::class, range)).records) {
                val source = s.metadata.dataOrigin.packageName
                sources += source
                sessions.put(
                    JSONObject()
                        .put("id", s.metadata.id)
                        .put("start", s.startTime.toString())
                        .put("end", s.endTime.toString())
                        .put("type", HealthDays.exerciseName(s.exerciseType))
                        .put("title", s.title ?: JSONObject.NULL)
                        .put("source", source),
                )
            }
        }

        val dayList = JSONArray()
        for ((day, metricsOfDay) in values) {
            val m = JSONObject()
            metricsOfDay.forEach { (k, v) -> m.put(k, Math.round(v * 10) / 10.0) }
            dayList.put(JSONObject().put("date", day.toString()).put("metrics", m))
        }
        return JSONObject()
            .put("days", dayList)
            .put("sessions", sessions)
            .put("sources", JSONArray(sources.filter { it.isNotBlank() }.sorted()))
            .put("granted", JSONArray(granted.toList()))
    }
}
