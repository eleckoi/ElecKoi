package com.eleckoi.app;

import android.content.Context;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.LinearGradient;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.graphics.Shader;
import android.os.SystemClock;

/** An anchored cumulative fill with independently moving pixel starlight. */
final class StartupLoadingBar extends StartupAnimatedView {
    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final RectF rail = new RectF(0, 6, 264, 26);
    private final Path innerClip = new Path();
    private final Path fillClip = new Path();
    private final RectF fillBounds = new RectF();
    private final LinearGradient fill = new LinearGradient(0,0,264,0,
            new int[]{0xff6d9fe5,0xff8a9cdd,0xffb29bdc},null,Shader.TileMode.CLAMP);
    private final LinearGradient sweep = new LinearGradient(-50,0,50,0,
            new int[]{0x00ffffff,0x70ffffff,0x00ffffff},null,Shader.TileMode.CLAMP);
    private final StartupProgress progress = new StartupProgress();
    private boolean dark;
    private float displayedFraction, transitionFrom, targetFraction;
    private long transitionStarted;

    StartupLoadingBar(Context context) {
        super(context);
        // Match the rail's 5px radius after its 2px content inset.
        innerClip.addRoundRect(2, 8, 262, 24, 3, 3, Path.Direction.CW);
    }
    void setProgress(RuntimeInstallProgress value) {
        progress.installation(value); updateTarget();
    }
    void runtimePrepared() { progress.runtimePrepared(); updateTarget(); }
    void hostReady() { progress.hostReady(); updateTarget(); }
    void resetProgress() {
        progress.reset(); displayedFraction = transitionFrom = targetFraction = 0; invalidate();
    }
    private void updateTarget() {
        float next = progress.fraction();
        if (next == targetFraction) return;
        transitionFrom = displayedFraction; targetFraction = next;
        transitionStarted = SystemClock.uptimeMillis();
        if (!canAnimate()) displayedFraction = targetFraction;
        invalidate();
    }
    void setDark(boolean value) { dark = value; invalidate(); }
    void complete() { progress.clientReady(); updateTarget(); }

    @Override protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        float scale = Math.min(getWidth() / 264f, getHeight() / 32f);
        canvas.save(); canvas.translate((getWidth() - 264 * scale) / 2, (getHeight() - 32 * scale) / 2);
        canvas.scale(scale, scale);
        paint.setShader(null); paint.setStyle(Paint.Style.FILL); paint.setColor(dark ? 0xff202638 : 0xffe4e9f5);
        canvas.drawRoundRect(rail, 5, 5, paint);
        paint.setStyle(Paint.Style.STROKE); paint.setStrokeWidth(1); paint.setColor(dark ? 0xff3f4d70 : 0xffc9d3e9);
        canvas.drawRoundRect(.5f,6.5f,263.5f,25.5f,5,5,paint); paint.setStyle(Paint.Style.FILL);
        if (displayedFraction < targetFraction) {
            float t = Math.min(1, (SystemClock.uptimeMillis() - transitionStarted) / 180f);
            displayedFraction = Math.max(displayedFraction,
                    transitionFrom + (targetFraction - transitionFrom) * (1 - (1-t)*(1-t)));
        }
        float end = displayedFraction;
        if (end > 0) {
            canvas.save(); canvas.clipPath(innerClip);
            fillBounds.set(2, 8, 2 + 260 * end, 24);
            fillClip.reset(); fillClip.addRoundRect(fillBounds, 3, 3, Path.Direction.CW);
            canvas.save(); canvas.clipPath(fillClip);
            paint.setShader(fill); canvas.drawRect(2,8,262,24,paint); paint.setShader(null);
            paint.setColor(0x25ffffff);
            for (int x=2;x<264;x+=4) canvas.drawRect(x,8,x+1,24,paint);
            for (int y=8;y<24;y+=4) canvas.drawRect(2,y,262,y+1,paint);
            canvas.save(); canvas.translate(-50 + elapsed % 2700 / 2700f * 364,0);
            paint.setShader(sweep); canvas.drawRect(-50,8,50,24,paint); paint.setShader(null); canvas.restore();
            for (int i=0;i<18;i++) {
                float phase = (elapsed + i * 370) % 1900 / 1900f;
                paint.setColor(Color.argb(Math.round(255 * (.2f + .8f * Math.max(0,1 - Math.abs(phase-.55f)*2))),255,255,255));
                star(canvas,13 + (i*37)%237,10 + (i*7)%11,i%4==0?6:2);
            }
            canvas.restore();
            paint.setColor(0xfffdfbff); star(canvas,2+260*end,16,12);
            paint.setColor(0xffb9a4e8); canvas.drawRect(260*end,14,4+260*end,18,paint);
            canvas.restore();
        }
        paint.setColor(0xffa49ad5); star(canvas,124,3,5); star(canvas,63,30,3);
        canvas.restore();
    }
    private void star(Canvas canvas,float x,float y,float size) {
        float half=size/2, arm=Math.max(.6f,size/6);
        canvas.drawRect(x-arm,y-half,x+arm,y+half,paint);
        canvas.drawRect(x-half,y-arm,x+half,y+arm,paint);
    }
}
