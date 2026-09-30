package com.tms.apparatus;

import android.content.Context;

import androidx.annotation.NonNull;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;

/**
 * Best-effort background sample of the step counter every ~15 minutes so steps land on
 * the right day even when the app is not opened. Some devices withhold sensor events from
 * background work; foreground samples then fill in when the app is next opened.
 */
public class StepSampleWorker extends Worker {
    private static final String UNIQUE_NAME = "apparatus-daily-steps";

    public StepSampleWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    public static void schedule(Context context) {
        PeriodicWorkRequest request = new PeriodicWorkRequest.Builder(StepSampleWorker.class, 15, TimeUnit.MINUTES).build();
        WorkManager.getInstance(context.getApplicationContext())
            .enqueueUniquePeriodicWork(UNIQUE_NAME, ExistingPeriodicWorkPolicy.KEEP, request);
    }

    public static void cancel(Context context) {
        WorkManager.getInstance(context.getApplicationContext()).cancelUniqueWork(UNIQUE_NAME);
    }

    @NonNull
    @Override
    public Result doWork() {
        if (!DailyStepCounter.isAutoTrackingEnabled(getApplicationContext())) {
            return Result.success();
        }
        CountDownLatch done = new CountDownLatch(1);
        DailyStepCounter.sample(getApplicationContext(), counter -> done.countDown());
        try {
            done.await(6, TimeUnit.SECONDS);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
        }
        return Result.success();
    }
}
