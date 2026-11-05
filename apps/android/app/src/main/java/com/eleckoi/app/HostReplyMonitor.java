package com.eleckoi.app;

import okhttp3.*;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.Closeable;
import java.io.IOException;
import java.net.URL;
import java.util.*;
import java.util.concurrent.*;
import java.util.function.Consumer;

/** Android-owned consumer of the locked Host's authenticated Remote control stream. */
final class HostReplyMonitor implements Closeable {
    interface Receiver {
        void completed(String sessionId, String name, String avatar, ReplyCompletionState.Reply reply);
        default void running(boolean active) {}
    }
    private final ScheduledExecutorService worker=Executors.newSingleThreadScheduledExecutor();
    private final OkHttpClient http=new OkHttpClient.Builder().followRedirects(false).followSslRedirects(false)
        .connectTimeout(15, TimeUnit.SECONDS).readTimeout(15, TimeUnit.SECONDS).build();
    private final OkHttpClient websocket=http.newBuilder().readTimeout(0, TimeUnit.MILLISECONDS).build();
    private final ReplyCompletionState state=new ReplyCompletionState();
    private final ArrayDeque<ReplyCompletionState.Window> pending=new ArrayDeque<>();
    private final Map<String,String> follows=new HashMap<>();
    private final Set<String> watching=new HashSet<>();
    private final Set<String> childSessions=new HashSet<>();
    private final Set<String> runningSessions=new HashSet<>();
    private String eventClient;
    private long nextStream;
    private final String origin, cookie;
    private final Receiver receiver;
    private final Consumer<String> diagnostic;
    private volatile boolean closed;
    private volatile WebSocket socket;
    private ScheduledFuture<?> retry;

    HostReplyMonitor(URL ready, String issuedCookie, Receiver receiver, Consumer<String> diagnostic) throws IOException {
        if (!"http".equals(ready.getProtocol()) || !"127.0.0.1".equals(ready.getHost()) || ready.getPort()<=0)
            throw new IOException("Invalid notification Host authority");
        if (HostPageCookies.sessionName(issuedCookie)==null) throw new IOException("Missing notification Host session");
        origin="http://127.0.0.1:"+ready.getPort(); cookie=issuedCookie.split(";",2)[0];
        this.receiver=receiver; this.diagnostic=diagnostic;
    }
    void start() { submit(this::connect); }
    private void submit(Runnable action) {
        if (closed) return;
        try { worker.execute(() -> { if (!closed) action.run(); }); }
        catch (RejectedExecutionException ignored) { /* Service disposal already owns cancellation. */ }
    }
    private Request.Builder request(String path) {
        return new Request.Builder().url(origin+path).header("Cookie",cookie).header("Origin",origin);
    }
    private void connect() {
        if (closed) return;
        try { drain(); }
        catch (Exception error) { reconnect("Reply history read failed"); return; }
        follows.clear(); watching.clear(); childSessions.clear(); runningSessions.clear(); eventClient=null;
        socket=websocket.newWebSocket(request("/api/remote.mux").build(),new WebSocketListener() {
            @Override public void onOpen(WebSocket ws, Response response) {
                if (closed) { ws.cancel(); return; }
                try {
                    open(ws,"android-events","$events");
                } catch (Exception error) { ws.cancel(); reconnect("Reply control subscription failed"); }
            }
            @Override public void onMessage(WebSocket ws, String text) {
                submit(() -> {
                    if (socket!=ws) return;
                    try {
                        JSONObject frame=new JSONObject(text);
                        String stream=frame.getString("streamId");
                        // Disposed logical streams may still have already-queued downlink frames.
                        if (!stream.equals("android-events") && !stream.equals("android-replies") && !follows.containsKey(stream)) return;
                        if (!frame.getString("type").equals("item")) {
                            String id=follows.remove(stream);
                            if (id!=null && (frame.getString("type").equals("end") || "session/not-found".equals(frame.optJSONObject("error")==null?"":frame.getJSONObject("error").optString("code")))) {
                                watching.remove(id); state.forget(id); runningSessions.remove(id); publishRunning(); return;
                            }
                            throw new IOException("Reply stream ended");
                        }
                        JSONObject value=frame.getJSONObject("value");
                        if (stream.equals("android-events")) event(ws,value);
                        else if (stream.equals("android-replies")) control(ws,value);
                        else {
                            String id=follows.get(stream);
                            if (id==null) throw new IOException("Unexpected Remote stream identity");
                            pending.addAll(state.follow(id,value));
                            if (value.getString("type").equals("snapshot")) diagnostic.accept("Reply journal synchronized");
                        }
                        publishRunning(); drain();
                    } catch (Exception error) { ws.cancel(); reconnect("Reply control connection interrupted"); }
                });
            }
            @Override public void onClosing(WebSocket ws, int code, String reason) { ws.close(code,null); }
            @Override public void onClosed(WebSocket ws, int code, String reason) { submit(() -> { if (socket==ws) reconnect("Reply control connection closed"); }); }
            @Override public void onFailure(WebSocket ws, Throwable error, Response response) {
                submit(() -> { if (socket==ws) reconnect("Reply control connection unavailable"); });
            }
        });
    }
    private void open(WebSocket ws,String stream,String endpoint) throws Exception {
        if (!ws.send(new JSONObject().put("type","open").put("streamId",stream).put("endpoint",endpoint)
            .put("payload",new JSONObject().put("args",new JSONObject())).toString()))
            throw new IOException("Reply subscription failed");
    }
    private void publishRunning() { receiver.running(!runningSessions.isEmpty()); }
    private void event(WebSocket ws,JSONObject frame) throws Exception {
        if (eventClient==null && !frame.getString("type").equals("ready")) throw new IOException("Remote event opening missing");
        switch (frame.getString("type")) {
            case "ready":
                if (eventClient!=null) throw new IOException("Duplicate Remote event opening");
                eventClient=frame.getString("clientId"); open(ws,"android-replies","session/control"); break;
            case "waterfall":
                // This observer owns no human-interaction handlers; delegate through the official result contract.
                if (eventClient==null) throw new IOException("Remote event opening missing");
                call("$events/result",new JSONObject().put("clientId",eventClient).put("eventId",frame.getString("eventId"))
                    .put("outcome",new JSONObject().put("kind","next"))); break;
            case "cancel": break;
            case "emit": {
                JSONArray args=frame.getJSONArray("args");
                switch (frame.getString("event")) {
                    case "api-session/status": {
                        String id=args.getString(0);
                        if (args.getBoolean(1) && !childSessions.contains(id)) runningSessions.add(id);
                        else runningSessions.remove(id);
                        break;
                    }
                    case "api-session/added": follow(ws,args.getJSONObject(0).getString("sessionId")); break;
                    case "api-session/removed": {
                        String id=args.getString(0);
                        for (Iterator<Map.Entry<String,String>> it=follows.entrySet().iterator();it.hasNext();) {
                            Map.Entry<String,String> entry=it.next();
                            if (!entry.getValue().equals(id)) continue;
                            String stream=entry.getKey(); it.remove();
                            ws.send(new JSONObject().put("type","cancel").put("streamId",stream).toString());
                        }
                        watching.remove(id); childSessions.remove(id); runningSessions.remove(id); state.forget(id);
                        pending.removeIf(window -> window.sessionId.equals(id));
                        diagnostic.accept("Reply Session released; journal subscription retired"); break;
                    }
                }
                break;
            }
            default: throw new IOException("Unsupported Remote event frame");
        }
    }
    private void control(WebSocket ws, JSONObject frame) throws Exception {
        switch (frame.getString("type")) {
            case "baseline": {
                JSONObject projections=frame.getJSONObject("value").getJSONObject("projections");
                Set<String> ids=new HashSet<>();
                for (Iterator<String> it=projections.keys();it.hasNext();) ids.add(it.next());
                state.retain(ids);
                for (String id:ids) follow(ws,id);
                diagnostic.accept("Reply observer connected: "+ids.size()+" Session journals");
                break;
            }
            case "projection": {
                String id=frame.getString("sessionId");
                if ("turnOutline".equals(frame.getString("key"))) {
                    JSONArray outline=frame.getJSONArray("value");
                    if (outline.length()>0 && outline.getJSONObject(outline.length()-1).getLong("seq")==frame.getLong("seq"))
                        state.discovered(id,frame.getLong("seq"));
                }
                follow(ws,id); break;
            }
            default: throw new IOException("Unsupported Session control frame");
        }
    }
    private void follow(WebSocket ws, String id) throws Exception {
        if (watching.contains(id) || childSessions.contains(id)) return;
        JSONObject listed=(JSONObject)call("session/list",new JSONObject().put("_request",new JSONObject()));
        JSONArray items=listed.getJSONArray("items");
        JSONObject identity=null;
        for (int i=0;i<items.length();i++) {
            JSONObject row=items.getJSONObject(i);
            if (id.equals(row.getString("sessionId"))) { identity=row; break; }
        }
        if (identity==null) return;
        if ("subagent".equals(identity.optString("origin"))) {
            childSessions.add(id); runningSessions.remove(id); state.forget(id); return;
        }
        if (identity.getBoolean("running")) runningSessions.add(id); else runningSessions.remove(id);
        watching.add(id);
        String stream="journal-"+(++nextStream); follows.put(stream,id);
        JSONObject address=new JSONObject().put("kind","session").put("sessionId",id);
        if (!ws.send(new JSONObject().put("type","open").put("streamId",stream).put("endpoint","session/follow")
            .put("payload",new JSONObject().put("args",new JSONObject().put("request",new JSONObject().put("address",address)))).toString()))
            throw new IOException("Reply journal subscription failed");
    }
    private void reconnect(String message) {
        submit(() -> {
            if (retry!=null && !retry.isDone()) return;
            diagnostic.accept(message);
            retry=worker.schedule(() -> { retry=null; connect(); },2,TimeUnit.SECONDS);
        });
    }
    private Object call(String endpoint, JSONObject args) throws Exception {
        JSONObject envelope=new JSONObject().put("type","client-request").put("rpcId",UUID.randomUUID().toString())
            .put("method",endpoint).put("payload",new JSONObject().put("args",args));
        try (Response response=http.newCall(request("/api/"+endpoint).post(RequestBody.create(
                envelope.toString(), MediaType.get("application/json"))).build()).execute()) {
            if (!response.isSuccessful() || response.body()==null) throw new IOException("Reply Remote HTTP "+response.code());
            JSONObject result=new JSONObject(response.body().string()).getJSONObject("result");
            if (!result.getBoolean("ok")) throw new IOException("Reply Remote rejected "+endpoint);
            return result.opt("value");
        }
    }
    private void drain() throws Exception {
        for (Iterator<ReplyCompletionState.Window> it=pending.iterator();!closed && it.hasNext();) {
            ReplyCompletionState.Window window=it.next();
            // The official running flag settles the generation; the committed end reason selects success.
            if (runningSessions.contains(window.sessionId)) continue;
            JSONObject metadata=metadata(window.sessionId);
            if (metadata!=null) {
                List<JSONObject> events=new ArrayList<>();
                Long before=null;
                while (!closed) {
                    JSONObject query=new JSONObject().put("address",new JSONObject().put("kind","session").put("sessionId",window.sessionId))
                        .put("throughSeq",window.through);
                    if (before!=null) query.put("beforeSeq",before);
                    JSONObject page=(JSONObject)call("session/page",new JSONObject().put("request",query));
                    JSONArray records=page.getJSONArray("records");
                    long first=Long.MAX_VALUE;
                    for (int i=0; i<records.length(); i++) {
                        JSONObject event=records.getJSONObject(i).getJSONObject("event");
                        long seq=event.getLong("seq"); first=Math.min(first,seq);
                        if (seq>window.after && seq<=window.through) events.add(event);
                    }
                    if (!page.getBoolean("hasMore") || first<=window.after) break;
                    if (first==Long.MAX_VALUE || before!=null && first>=before) throw new IOException("Reply history did not advance");
                    before=first;
                }
                if (!closed) for (ReplyCompletionState.Reply reply:ReplyCompletionState.replies(events))
                    if (reply.seq>window.completedAfter) receiver.completed(window.sessionId,metadata.getString("name"),metadata.getString("avatar"),reply);
            }
            it.remove();
        }
    }
    private JSONObject metadata(String sessionId) throws Exception {
        JSONArray conversations=(JSONArray)call("eleckoiConversations/list",new JSONObject());
        for (int i=0;i<conversations.length();i++) {
            JSONObject row=conversations.getJSONObject(i);
            if (!sessionId.equals(row.getString("runtimeSessionId"))) continue;
            JSONObject metadata=row.getJSONObject("metadata");
            String name=metadata.getString("characterName");
            return new JSONObject().put("name",name.isEmpty()?row.getString("title"):name).put("avatar",metadata.getString("characterAvatar"));
        }
        JSONArray studios=(JSONArray)call("eleckoiCreatorStudioSessions/list",new JSONObject());
        for (int i=0;i<studios.length();i++) {
            JSONObject row=studios.getJSONObject(i);
            if (sessionId.equals(row.getString("sessionId")))
                return new JSONObject().put("name",row.getString("title")).put("avatar","");
        }
        return null;
    }
    byte[] avatar(String reference) throws IOException {
        HttpUrl url=HttpUrl.get(origin+"/eleckoi/media/asset").newBuilder().addQueryParameter("reference",reference).build();
        try (Response response=http.newCall(request("/eleckoi/media/asset").url(url).build()).execute()) {
            if (!response.isSuccessful() || response.body()==null) throw new IOException("Reply avatar unavailable");
            return response.body().bytes();
        }
    }
    @Override public void close() {
        closed=true;
        WebSocket active=socket; if (active!=null) active.cancel();
        worker.shutdownNow(); http.dispatcher().cancelAll(); http.connectionPool().evictAll();
        http.dispatcher().executorService().shutdown();
    }
}
