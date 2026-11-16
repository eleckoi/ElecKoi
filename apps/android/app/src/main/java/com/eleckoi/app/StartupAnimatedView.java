package com.eleckoi.app;

import android.animation.ValueAnimator;
import android.content.Context;
import android.view.View;
import android.view.animation.LinearInterpolator;

/** Runs startup decoration only while its native surface is visible and active. */
abstract class StartupAnimatedView extends View {
    private ValueAnimator clock;
    private boolean loading, active;
    protected long elapsed;

    StartupAnimatedView(Context context) {
        super(context); setImportantForAccessibility(IMPORTANT_FOR_ACCESSIBILITY_NO);
    }
    final void showLoading() { loading = true; updateAnimation(); }
    final void stopLoading() { loading = false; stopAnimation(); }
    final void setActive(boolean value) { active = value; updateAnimation(); }
    final boolean canAnimate() {
        return active && isAttachedToWindow() && isShown() && getWindowVisibility() == VISIBLE
                && ValueAnimator.areAnimatorsEnabled();
    }
    private void updateAnimation() {
        if (!loading || !canAnimate()) { stopAnimation(); return; }
        if (clock != null) return;
        clock = ValueAnimator.ofFloat(0, 1);
        clock.setDuration(24_000); clock.setRepeatCount(ValueAnimator.INFINITE);
        clock.setInterpolator(new LinearInterpolator());
        clock.addUpdateListener(animation -> { elapsed = animation.getCurrentPlayTime(); invalidate(); });
        clock.start();
    }
    private void stopAnimation() {
        if (clock != null) { clock.removeAllUpdateListeners(); clock.cancel(); clock = null; }
        elapsed = 0; invalidate();
    }
    @Override protected void onAttachedToWindow() { super.onAttachedToWindow(); updateAnimation(); }
    @Override protected void onDetachedFromWindow() { stopAnimation(); super.onDetachedFromWindow(); }
    @Override protected void onWindowVisibilityChanged(int visibility) {
        super.onWindowVisibilityChanged(visibility); updateAnimation();
    }
    @Override protected void onVisibilityChanged(View changedView, int visibility) {
        super.onVisibilityChanged(changedView, visibility); updateAnimation();
    }
}
