package com.eleckoi.app;

import android.content.Context;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.RectF;

/** Current Logo, intact, with a gentle float and staggered rising bubbles. */
final class StartupMascotView extends StartupAnimatedView {
    private final Bitmap mascot;
    private final Paint imagePaint = new Paint(Paint.ANTI_ALIAS_FLAG | Paint.FILTER_BITMAP_FLAG);
    private final Paint bubblePaint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final RectF imageBounds = new RectF();
    private static final float[][] BUBBLES = {
        {-103,20,17,0}, {-83,-68,9,1600}, {103,-13,24,900}, {81,64,10,2400}, {15,-84,7,3100}
    };

    StartupMascotView(Context context) {
        super(context);
        BitmapFactory.Options options = new BitmapFactory.Options(); options.inScaled = false;
        mascot = BitmapFactory.decodeResource(getResources(), R.drawable.eleckoi_app_icon, options);
        if (mascot == null) throw new IllegalStateException("Startup Logo resource is missing");
        bubblePaint.setColor(Color.rgb(130,155,209)); bubblePaint.setStrokeWidth(1.5f);
    }
    @Override protected void onDraw(Canvas canvas) {
        super.onDraw(canvas);
        float scale = Math.min(getWidth() / 256f, getHeight() / 194f);
        canvas.save();
        canvas.translate((getWidth() - 256 * scale) / 2, (getHeight() - 194 * scale) / 2);
        canvas.scale(scale, scale);
        float offset = -2 + 4 * (float) Math.cos(elapsed % 4000 / 4000f * Math.PI * 2);
        imageBounds.set(52, 21 + offset, 204, 173 + offset);
        canvas.drawBitmap(mascot, null, imageBounds, imagePaint);
        for (float[] bubble : BUBBLES) {
            float phase = (elapsed + bubble[3]) % 4800 / 4800f;
            float opacity = phase < .18f ? phase / .18f * .72f
                    : phase < .72f ? .72f - (phase - .18f) / .54f * .22f : (1 - phase) / .28f * .5f;
            float radius = bubble[2] / 2 * (.55f + .55f * phase);
            float x = 128 + bubble[0], y = 97 + bubble[1] + 25 - 53 * phase;
            bubblePaint.setAlpha(Math.round(255 * opacity)); bubblePaint.setStyle(Paint.Style.STROKE);
            canvas.drawCircle(x, y, radius, bubblePaint);
            bubblePaint.setStyle(Paint.Style.FILL);
            canvas.drawCircle(x + radius * .36f, y - radius * .38f, Math.max(.7f, radius * .14f), bubblePaint);
        }
        bubblePaint.setAlpha(255); canvas.restore();
    }
}
