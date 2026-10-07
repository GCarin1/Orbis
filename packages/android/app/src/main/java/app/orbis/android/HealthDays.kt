// What the app makes of Health Connect's records before sending them (specs/health): sleep stages added up
// per night, on the day the night ended, and a workout's type as a name. Kept apart from HealthBridge so it
// is tested on the computer, without a phone.
package app.orbis.android

import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.SleepSessionRecord
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

object HealthDays {
    /** One stage of a night: when the night ended, and the stage's own start, end and kind. */
    data class Span(val nightEnd: Instant, val start: Instant, val end: Instant, val stage: Int)

    /** Minutes of deep, REM, light sleep and awake time per day (the day each night ended). */
    @JvmStatic
    fun sleepStages(spans: List<Span>, zone: ZoneId): Map<LocalDate, Map<String, Double>> {
        val out = sortedMapOf<LocalDate, MutableMap<String, Double>>()
        for (span in spans) {
            val metric = when (span.stage) {
                SleepSessionRecord.STAGE_TYPE_DEEP -> "sleep_deep_minutes"
                SleepSessionRecord.STAGE_TYPE_REM -> "sleep_rem_minutes"
                SleepSessionRecord.STAGE_TYPE_LIGHT -> "sleep_light_minutes"
                SleepSessionRecord.STAGE_TYPE_AWAKE, SleepSessionRecord.STAGE_TYPE_AWAKE_IN_BED -> "sleep_awake_minutes"
                else -> null
            } ?: continue
            val minutes = Duration.between(span.start, span.end).toMinutes().toDouble()
            if (minutes <= 0) continue
            val day = span.nightEnd.atZone(zone).toLocalDate()
            val ofDay = out.getOrPut(day) { mutableMapOf() }
            ofDay[metric] = (ofDay[metric] ?: 0.0) + minutes
        }
        return out
    }

    /** A workout's type as a word a bot reads; anything else is "other". */
    @JvmStatic
    fun exerciseName(type: Int): String = when (type) {
        ExerciseSessionRecord.EXERCISE_TYPE_RUNNING -> "running"
        ExerciseSessionRecord.EXERCISE_TYPE_RUNNING_TREADMILL -> "treadmill running"
        ExerciseSessionRecord.EXERCISE_TYPE_WALKING -> "walking"
        ExerciseSessionRecord.EXERCISE_TYPE_HIKING -> "hiking"
        ExerciseSessionRecord.EXERCISE_TYPE_BIKING -> "cycling"
        ExerciseSessionRecord.EXERCISE_TYPE_BIKING_STATIONARY -> "stationary cycling"
        ExerciseSessionRecord.EXERCISE_TYPE_SWIMMING_POOL -> "pool swimming"
        ExerciseSessionRecord.EXERCISE_TYPE_SWIMMING_OPEN_WATER -> "open water swimming"
        ExerciseSessionRecord.EXERCISE_TYPE_STRENGTH_TRAINING -> "strength training"
        ExerciseSessionRecord.EXERCISE_TYPE_WEIGHTLIFTING -> "weightlifting"
        ExerciseSessionRecord.EXERCISE_TYPE_HIGH_INTENSITY_INTERVAL_TRAINING -> "HIIT"
        ExerciseSessionRecord.EXERCISE_TYPE_YOGA -> "yoga"
        ExerciseSessionRecord.EXERCISE_TYPE_PILATES -> "pilates"
        ExerciseSessionRecord.EXERCISE_TYPE_ELLIPTICAL -> "elliptical"
        ExerciseSessionRecord.EXERCISE_TYPE_ROWING_MACHINE -> "rowing machine"
        ExerciseSessionRecord.EXERCISE_TYPE_STAIR_CLIMBING -> "stair climbing"
        ExerciseSessionRecord.EXERCISE_TYPE_DANCING -> "dancing"
        ExerciseSessionRecord.EXERCISE_TYPE_SOCCER -> "soccer"
        ExerciseSessionRecord.EXERCISE_TYPE_BASKETBALL -> "basketball"
        ExerciseSessionRecord.EXERCISE_TYPE_TENNIS -> "tennis"
        ExerciseSessionRecord.EXERCISE_TYPE_MARTIAL_ARTS -> "martial arts"
        ExerciseSessionRecord.EXERCISE_TYPE_STRETCHING -> "stretching"
        else -> "other"
    }
}
