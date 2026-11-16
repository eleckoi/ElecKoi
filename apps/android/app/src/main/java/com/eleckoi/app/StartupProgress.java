package com.eleckoi.app;

/** One display unit per archive copy/extraction, then verification, Host and Client admission. */
final class StartupProgress {
    private int archiveCount;
    private float fraction;

    void reset() { archiveCount = 0; fraction = 0; }
    float fraction() { return fraction; }
    void installation(RuntimeInstallProgress progress) {
        if (progress == null) return;
        if (progress.archiveCount > 0) {
            if (archiveCount != 0 && archiveCount != progress.archiveCount)
                throw new IllegalArgumentException("Runtime archive count changed during startup");
            archiveCount = progress.archiveCount;
        }
        switch (progress.stage) {
            case COPYING:
                advance(2.0 * (progress.archiveNumber - 1) + (double) progress.copiedBytes / progress.totalBytes);
                break;
            case EXTRACTING: advance(2.0 * progress.archiveNumber - 1); break;
            case CHECKING: advance(2.0 * archiveCount); break;
            case STARTING: runtimePrepared(); break;
            default: throw new IllegalStateException("Unknown runtime installation stage");
        }
    }
    void runtimePrepared() { advance(2.0 * archiveCount + 1); }
    void hostReady() { advance(2.0 * archiveCount + 2); }
    void clientReady() { fraction = 1; }
    private void advance(double completedUnits) {
        // Later stages retain all confirmed work; repeating an event never empties the bar.
        fraction = Math.max(fraction, (float) (completedUnits / (2.0 * archiveCount + 3)));
    }
}
