package com.eleckoi.app;

import android.app.Activity;
import android.net.Uri;
import android.view.View;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.InputStream;
import java.util.Map;
import java.util.function.BooleanSupplier;
import java.util.function.Consumer;

/** Browser-specific transport; platform operations and the local Host remain shared. */
abstract class BrowserSurface {
    private volatile boolean rendererExited;
    final boolean needsRecreation() { return rendererExited; }
    final void markRendererExited() { rendererExited = true; }
    interface Bridge { Object invoke(String method, JSONArray arguments) throws Exception; }
    interface Listener {
        boolean sameHost(String url);
        void external(String url);
        void failure(String message);
        void console(String level, String message, String source, int line);
        default void diagnostic(JSONObject event) { }
        void documentReady();
        void chooseFiles(String[] types, boolean multiple, boolean save, String name, Consumer<Uri[]> completion);
        void download(String url, String disposition, String mime, InputStream body);
        Resource media(Uri url, String method, Map<String, String> headers);
    }
    static final class Resource {
        final String mime, reason; final int status; final Map<String,String> headers; final InputStream body;
        Resource(String mime, int status, String reason, Map<String,String> headers, InputStream body) {
            this.mime=mime; this.status=status; this.reason=reason; this.headers=headers; this.body=body;
        }
    }
    abstract View view();
    abstract String getUrl();
    abstract String identity();
    abstract String userAgent();
    abstract void loadAuthenticated(String url, String cookie, BooleanSupplier current, Consumer<String> failed);
    abstract void command(String type, JSONObject payload, Consumer<String> completion);
    abstract String cookies(String url) throws Exception;
    abstract void stopLoading();
    abstract boolean canGoBack();
    abstract void goBack();
    abstract void onResume();
    abstract void onPause();
    abstract void destroy();
    void setBackgroundColor(int color) { view().setBackgroundColor(color); }
    void setAppearance(boolean dark, int color) { setBackgroundColor(color); }
    static JSONObject payload(String key, Object value) {
        try { return new JSONObject().put(key,value); } catch(Exception error) { throw new IllegalArgumentException(error); }
    }
}
