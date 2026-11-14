package com.eleckoi.app;

import android.app.Activity;
import android.net.Uri;
import android.webkit.*;
import androidx.webkit.ScriptHandler;
import androidx.webkit.WebViewCompat;
import androidx.webkit.WebViewFeature;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.function.BooleanSupplier;
import java.util.function.Consumer;

/** System WebView implementation of the shared Android browser boundary. */
final class PlatformBrowser extends BrowserSurface {
    private final WebView web;
    private final Listener listener;
    private final String source;
    private final WebViewChoicePrompts choicePrompts;
    private boolean appearanceDark;
    private ScriptHandler documentScript;
    private volatile String currentUrl="";
    PlatformBrowser(Activity activity, String source, Bridge bridge, Listener listener) {
        this.listener=listener; web=new WebView(activity);
        try(java.io.InputStream script=activity.getAssets().open("standard-choice-prompts.js")) {
            this.source=source+"\n"+RuntimeInstaller.readText(script);
        } catch(java.io.IOException error) { throw new IllegalStateException("Packaged choice UI is missing",error); }
        choicePrompts=new WebViewChoicePrompts(activity,()->appearanceDark,(id,success,result)->{
            try { command("emit",new JSONObject().put("event","eleckoi:platform-result")
                .put("detail",new JSONObject().put("id",id).put("success",success).put("result",result)),null); }
            catch(Exception error) { listener.failure("选择框返回失败："+error); }
        });
        WebSettings settings=web.getSettings(); settings.setJavaScriptEnabled(true); settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true); settings.setAllowFileAccess(false); settings.setAllowContentAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        CookieManager.getInstance().setAcceptCookie(true); CookieManager.getInstance().setAcceptThirdPartyCookies(web,true);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        web.addJavascriptInterface(new Transport(bridge),"ElecKoiAndroidTransport");
        web.setWebViewClient(new WebViewClient() {
            @Override public void onPageStarted(WebView view,String url,android.graphics.Bitmap icon) { choicePrompts.dismiss(); currentUrl=url; }
            @Override public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                if (!"eleckoi-media".equals(request.getUrl().getScheme())) return null;
                Resource result=listener.media(request.getUrl(),request.getMethod(),request.getRequestHeaders());
                return new WebResourceResponse(result.mime,null,result.status,result.reason,result.headers,result.body);
            }
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if(!request.isForMainFrame() || listener.sameHost(request.getUrl().toString())) return false;
                listener.external(request.getUrl().toString()); return true;
            }
            private void ready(String url) { if(listener.sameHost(url)) {
                web.evaluateJavascript(PlatformBrowser.this.source,null); listener.documentReady();
            } }
            @Override public void onPageFinished(WebView view,String url) { ready(url); }
            @Override public void onPageCommitVisible(WebView view,String url) { ready(url); }
            @Override public void onReceivedError(WebView view,WebResourceRequest request,WebResourceError error) {
                if(request.isForMainFrame()) listener.failure("页面加载失败："+error.getDescription());
            }
            @Override public void onReceivedHttpError(WebView view,WebResourceRequest request,WebResourceResponse response) {
                if(request.isForMainFrame()) listener.failure("页面 HTTP "+response.getStatusCode());
            }
            @Override public boolean onRenderProcessGone(WebView view,RenderProcessGoneDetail detail) {
                markRendererExited(); listener.failure("系统 WebView 渲染进程退出，请点击重试重新打开页面，didCrash="+detail.didCrash()); return true;
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public boolean onConsoleMessage(ConsoleMessage message) {
                listener.console(message.messageLevel().toString(),message.message(),message.sourceId(),message.lineNumber()); return true;
            }
            @Override public boolean onShowFileChooser(WebView view,ValueCallback<Uri[]> callback,FileChooserParams options) {
                listener.chooseFiles(options.getAcceptTypes(),options.getMode()==FileChooserParams.MODE_OPEN_MULTIPLE,
                    options.getMode()==FileChooserParams.MODE_SAVE,options.getFilenameHint(),callback::onReceiveValue); return true;
            }
        });
        web.setDownloadListener((url,agent,disposition,mime,length)->listener.download(url,disposition,mime,null));
    }
    public final class Transport {
        private final Bridge bridge;
        Transport(Bridge bridge) { this.bridge=bridge; }
        @JavascriptInterface public String invoke(String method,String arguments) {
            try {
                if(needsRecreation() || !listener.sameHost(getUrl())) throw new SecurityException("Host page not active");
                JSONArray input=new JSONArray(arguments);
                Object value;
                if("nativeChoice".equals(method)) { choicePrompts.handle(input.getString(0),input.getString(1),input.getJSONObject(2)); value=null; }
                else value=bridge.invoke(method,input);
                return new JSONObject().put("success",true).put("result",value==null?JSONObject.NULL:value).toString();
            } catch(Exception error) {
                try { return new JSONObject().put("success",false).put("error",error.toString()).toString(); }
                catch(Exception invalid) { throw new IllegalStateException(invalid); }
            }
        }
    }
    @Override android.view.View view() { return web; }
    @Override void setAppearance(boolean dark,int color) { appearanceDark=dark; setBackgroundColor(color); }
    @Override String getUrl() { return currentUrl; }
    @Override String identity() { android.content.pm.PackageInfo info=WebView.getCurrentWebViewPackage(); return info==null?"unknown":info.packageName+" "+info.versionName; }
    @Override String userAgent() { return web.getSettings().getUserAgentString(); }
    @Override void loadAuthenticated(String url,String cookie,BooleanSupplier current,Consumer<String> failed) {
        if(documentScript!=null) { documentScript.remove(); documentScript=null; }
        if(WebViewFeature.isFeatureSupported(WebViewFeature.DOCUMENT_START_SCRIPT)) {
            Uri parsed=Uri.parse(url); documentScript=WebViewCompat.addDocumentStartJavaScript(web,source,
                java.util.Collections.singleton(parsed.getScheme()+"://"+parsed.getEncodedAuthority()));
        }
        HostPageCookies.install(new HostPageCookies.Store() {
            public String get(String value) { return CookieManager.getInstance().getCookie(value); }
            public void set(String value,String header,HostPageCookies.Completion completion) { CookieManager.getInstance().setCookie(value,header,completion::complete); }
        },url,cookie,current,()->{ CookieManager.getInstance().flush(); currentUrl=url; web.loadUrl(url); },failed);
    }
    @Override void command(String type,JSONObject payload,Consumer<String> completion) {
        if(needsRecreation() || !listener.sameHost(getUrl())) return;
        String command=payload("type",type).toString();
        try { command=new JSONObject(command).put("payload",payload).toString(); } catch(Exception error) { throw new IllegalArgumentException(error); }
        web.evaluateJavascript("window.ElecKoiPlatform?.browserCommand("+command+")",completion==null?null:completion::accept);
    }
    @Override String cookies(String url) { return CookieManager.getInstance().getCookie(url); }
    @Override void stopLoading() { if(!needsRecreation()) web.stopLoading(); }
    @Override boolean canGoBack() { return !needsRecreation() && web.canGoBack(); }
    @Override void goBack() { if(!needsRecreation()) web.goBack(); }
    @Override void onResume() { if(!needsRecreation()) web.onResume(); }
    @Override void onPause() { if(!needsRecreation()) web.onPause(); }
    @Override void destroy() {
        currentUrl=""; choicePrompts.dismiss();
        if(!needsRecreation()) { if(documentScript!=null) documentScript.remove(); web.removeJavascriptInterface("ElecKoiAndroidTransport"); }
        web.destroy();
    }
}
