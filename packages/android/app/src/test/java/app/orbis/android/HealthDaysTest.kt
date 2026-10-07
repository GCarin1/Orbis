package app.orbis.android

import androidx.health.connect.client.records.ExerciseSessionRecord
import androidx.health.connect.client.records.SleepSessionRecord
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import org.junit.Assert.assertEquals
import org.junit.Test

// specs/health — what the app makes of Health Connect's records (change 0062-health-connect).
class HealthDaysTest {
    private val zone = ZoneId.of("America/Sao_Paulo")

    @Test
    fun addsUpEachNightsStagesOnTheDayItEnded() {
        // A night that ends at 07:00 in São Paulo on 7 October (10:00 UTC).
        val end = Instant.parse("2026-10-07T10:00:00Z")
        val spans = listOf(
            HealthDays.Span(end, Instant.parse("2026-10-07T02:00:00Z"), Instant.parse("2026-10-07T03:30:00Z"), SleepSessionRecord.STAGE_TYPE_DEEP),
            HealthDays.Span(end, Instant.parse("2026-10-07T03:30:00Z"), Instant.parse("2026-10-07T04:00:00Z"), SleepSessionRecord.STAGE_TYPE_REM),
            HealthDays.Span(end, Instant.parse("2026-10-07T04:00:00Z"), Instant.parse("2026-10-07T04:20:00Z"), SleepSessionRecord.STAGE_TYPE_DEEP),
            HealthDays.Span(end, Instant.parse("2026-10-07T04:20:00Z"), Instant.parse("2026-10-07T04:30:00Z"), SleepSessionRecord.STAGE_TYPE_AWAKE_IN_BED),
            // Out of bed and unknown stages are not sleep.
            HealthDays.Span(end, Instant.parse("2026-10-07T04:30:00Z"), Instant.parse("2026-10-07T05:00:00Z"), SleepSessionRecord.STAGE_TYPE_OUT_OF_BED),
        )
        val days = HealthDays.sleepStages(spans, zone)
        assertEquals(
            mapOf(LocalDate.parse("2026-10-07") to mapOf("sleep_deep_minutes" to 110.0, "sleep_rem_minutes" to 30.0, "sleep_awake_minutes" to 10.0)),
            days,
        )
    }

    @Test
    fun namesWorkoutTypes() {
        assertEquals("running", HealthDays.exerciseName(ExerciseSessionRecord.EXERCISE_TYPE_RUNNING))
        assertEquals("strength training", HealthDays.exerciseName(ExerciseSessionRecord.EXERCISE_TYPE_STRENGTH_TRAINING))
        assertEquals("other", HealthDays.exerciseName(-1))
    }
}
