package com.eleckoi.app;

import org.junit.Test;
import static org.junit.Assert.*;

public final class StartupProgressTest {
    @Test public void allArchivesAndFollowingStartupKeepTheirCompletedFill() {
        StartupProgress progress = new StartupProgress();
        float previous = 0;
        for (int archive=1;archive<=4;archive++) {
            for (long bytes : new long[]{0,17,60,100}) {
                progress.installation(RuntimeInstallProgress.copying(archive,4,bytes,100));
                assertTrue(progress.fraction() >= previous);
                assertEquals((2f*(archive-1)+bytes/100f)/11f,progress.fraction(),.00001f);
                previous = progress.fraction();
            }
            progress.installation(RuntimeInstallProgress.extracting(archive,4));
            assertEquals(previous,progress.fraction(),0f);
            progress.installation(null);
            assertEquals(previous,progress.fraction(),0f);
        }
        progress.installation(RuntimeInstallProgress.checking());
        assertEquals(8f/11,progress.fraction(),.00001f);
        progress.installation(RuntimeInstallProgress.starting());
        assertEquals(9f/11,progress.fraction(),.00001f);
        progress.hostReady();
        assertEquals(10f/11,progress.fraction(),.00001f);
        progress.installation(null);
        assertEquals(10f/11,progress.fraction(),.00001f);
        progress.clientReady(); assertEquals(1,progress.fraction(),0f);
    }
    @Test public void cachedRuntimeUsesConfirmedMilestonesAndOnlyRetryClearsThem() {
        StartupProgress progress = new StartupProgress();
        progress.installation(null); assertEquals(0,progress.fraction(),0f);
        progress.runtimePrepared(); assertEquals(1f/3,progress.fraction(),.00001f);
        progress.hostReady(); assertEquals(2f/3,progress.fraction(),.00001f);
        for(int i=0;i<1000;i++) {
            progress.installation(null); progress.runtimePrepared();
            assertEquals(2f/3,progress.fraction(),.00001f);
        }
        progress.clientReady(); assertEquals(1,progress.fraction(),0f);
        progress.reset(); assertEquals(0,progress.fraction(),0f);
        progress.installation(RuntimeInstallProgress.copying(1,4,50,100));
        assertEquals(.5f/11,progress.fraction(),.00001f);
    }
    @Test public void stalledOrRepeatedCopyEventsNeverRewindOrCompleteTheStartup() {
        StartupProgress progress = new StartupProgress();
        progress.installation(RuntimeInstallProgress.copying(2,4,90,100));
        float retained=progress.fraction();
        for(int i=0;i<1000;i++) {
            progress.installation(RuntimeInstallProgress.copying(2,4,30,100));
            assertEquals(retained,progress.fraction(),0f);
        }
        progress.installation(RuntimeInstallProgress.copying(4,4,100,100));
        assertTrue(progress.fraction()<1);
        progress.reset();
        progress.installation(RuntimeInstallProgress.extracting(3,4));
        assertEquals(5f/11,progress.fraction(),.00001f);
    }
}
