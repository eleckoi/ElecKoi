package com.eleckoi.app;

import okhttp3.*;
import okhttp3.mockwebserver.*;
import org.json.*;
import org.junit.Test;
import java.net.URL;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;
import static org.junit.Assert.*;

public final class HostReplyMonitorTest {
    private JSONObject baseline(long seq) throws Exception {
        return new JSONObject("{type:'baseline',value:{projections:{a:{asOfSeq:"+seq+",values:{turnOutline:[]}},child:{asOfSeq:0,values:{turnOutline:[]}}}}}");
    }
    private void send(WebSocket ws, JSONObject value) throws Exception {
        ws.send(new JSONObject().put("type","item").put("streamId","android-replies").put("value",value).toString());
    }
    private void journal(WebSocket ws,String stream,JSONObject value) throws Exception {
        ws.send(new JSONObject().put("type","item").put("streamId",stream).put("value",value).toString());
    }
    private void eventsReady(WebSocket ws) throws Exception {
        journal(ws,"android-events",new JSONObject("{type:'ready',clientId:'synthetic-client',host:{home:'/synthetic'}}"));
    }
    private void emit(WebSocket ws,String name,JSONArray args) throws Exception {
        journal(ws,"android-events",new JSONObject().put("type","emit").put("event",name).put("args",args));
    }
    private MockResponse result(Object value) throws Exception {
        return new MockResponse().setHeader("Content-Type","application/json").setBody(new JSONObject()
            .put("result",new JSONObject().put("ok",true).put("value",value)).toString());
    }
    @Test public void usesAuthenticatedControlAndReadsEveryHistoryPageWithoutDuplicateOnReconnect() throws Exception {
        String cookie="dsh-auth-"+"x".repeat(43)+"=synthetic-session";
        String body="首段"+"正文".repeat(10000)+"末尾";
        BlockingQueue<ReplyCompletionState.Reply> replies=new LinkedBlockingQueue<>();
        BlockingQueue<Throwable> failures=new LinkedBlockingQueue<>();
        CountDownLatch reconnected=new CountDownLatch(1);
        CountDownLatch delegated=new CountDownLatch(2);
        AtomicInteger connections=new AtomicInteger(), pages=new AtomicInteger();
        MockWebServer server=new MockWebServer();
        server.setDispatcher(new okhttp3.mockwebserver.Dispatcher() {
            @Override public MockResponse dispatch(RecordedRequest request) {
                try {
                    assertEquals(cookie,request.getHeader("Cookie"));
                    assertEquals("http://127.0.0.1:"+server.getPort(),request.getHeader("Origin"));
                    if (request.getPath().equals("/api/remote.mux")) return new MockResponse().withWebSocketUpgrade(new WebSocketListener() {
                        @Override public void onMessage(WebSocket ws, String text) {
                            try {
                                JSONObject open=new JSONObject(text);
                                if (open.getString("type").equals("cancel")) return;
                                String endpoint=open.getString("endpoint");
                                if (endpoint.equals("$events")) {
                                    eventsReady(ws);
                                    if (connections.get()==0) for(String name:List.of("approval/request","user-questions/request"))
                                        journal(ws,"android-events",new JSONObject().put("type","waterfall").put("event",name)
                                            .put("eventId",name).put("agentId","a").put("request",new JSONObject()));
                                }
                                else if (endpoint.equals("session/control")) {
                                    assertEquals(0,open.getJSONObject("payload").getJSONObject("args").length());
                                    send(ws,baseline(connections.incrementAndGet()==1?10:20));
                                } else {
                                    assertEquals("session/follow",endpoint);
                                    assertEquals("a",open.getJSONObject("payload").getJSONObject("args").getJSONObject("request").getJSONObject("address").getString("sessionId"));
                                    String stream=open.getString("streamId");
                                    journal(ws,stream,new JSONObject("{type:'snapshot',cursor:"+(connections.get()==1?10:20)+",records:[],projections:{values:{turnOutline:[]}}}"));
                                    if (connections.get()==1) {
                                        journal(ws,stream,new JSONObject("{type:'event',event:{type:'turn/start',seq:11,time:123,data:{turn:1}}}"));
                                        for (int seq=12;seq<20;seq++) journal(ws,stream,new JSONObject("{type:'event',event:{type:'plugin/tick',seq:"+seq+",time:123,data:{}}}"));
                                        journal(ws,stream,new JSONObject("{type:'event',event:{type:'turn/end',seq:20,time:456,data:{turn:1,reason:{kind:'completed'}}}}"));
                                        ws.send("{\"type\":\"end\",\"streamId\":\"android-replies\"}");
                                    } else reconnected.countDown();
                                }
                            } catch (Throwable error) { failures.add(error); }
                        }
                    });
                    JSONObject envelope=new JSONObject(request.getBody().readUtf8());
                    assertEquals("client-request",envelope.getString("type"));
                    if (request.getPath().equals("/api/$events/result")) {
                        JSONObject args=envelope.getJSONObject("payload").getJSONObject("args");
                        assertEquals("synthetic-client",args.getString("clientId"));
                        assertEquals("next",args.getJSONObject("outcome").getString("kind"));
                        assertEquals(1,args.getJSONObject("outcome").length());
                        delegated.countDown();
                        return new MockResponse().setHeader("Content-Type","application/json").setBody("{\"result\":{\"ok\":true}}");
                    }
                    if (request.getPath().equals("/api/session/list")) {
                        JSONObject args=envelope.getJSONObject("payload").getJSONObject("args");
                        assertEquals(1,args.length()); assertEquals(0,args.getJSONObject("_request").length());
                        return result(new JSONObject("{items:[{sessionId:'a',running:false},{sessionId:'child',running:true,origin:'subagent',parentSessionId:'a'}]}"));
                    }
                    if (request.getPath().equals("/api/eleckoiConversations/list")) return result(new JSONArray()
                        .put(new JSONObject("{runtimeSessionId:'a',title:'对话',metadata:{characterName:'角色',characterAvatar:''}}")));
                    JSONObject query=envelope.getJSONObject("payload").getJSONObject("args").getJSONObject("request");
                    assertEquals("a",query.getJSONObject("address").getString("sessionId"));
                    assertEquals(20,query.getLong("throughSeq")); pages.incrementAndGet();
                    if (!query.has("beforeSeq")) return result(new JSONObject("{hasMore:true,records:[{type:'event',event:{type:'step/end',seq:16,time:123,data:{}}},{type:'event',event:{type:'turn/end',seq:20,time:456,data:{turn:1,reason:{kind:'completed'}}}}]}"));
                    assertEquals(16,query.getLong("beforeSeq"));
                    JSONObject message=new JSONObject("{type:'event',event:{type:'assistant/message',surfaceOp:'append',seq:12,time:123,data:{message:{content:[]}}}}");
                    message.getJSONObject("event").getJSONObject("data").getJSONObject("message").getJSONArray("content")
                        .put(new JSONObject().put("type","text").put("text",body));
                    return result(new JSONObject().put("hasMore",false).put("records",new JSONArray()
                        .put(new JSONObject("{type:'event',event:{type:'turn/start',seq:11,time:123,data:{turn:1}}}")).put(message)));
                } catch (Throwable error) { failures.add(error); return new MockResponse().setResponseCode(500); }
            }
        });
        server.start();
        try (HostReplyMonitor monitor=new HostReplyMonitor(new URL("http://127.0.0.1:"+server.getPort()+"/?token=unused"),cookie+"; HttpOnly; Path=/",
                (id,name,avatar,reply) -> { assertEquals("角色",name); replies.add(reply); },message -> {})) {
            monitor.start();
            ReplyCompletionState.Reply reply=replies.poll(10,TimeUnit.SECONDS);
            if (!failures.isEmpty()) throw new AssertionError(failures.peek());
            assertNotNull(reply); assertEquals(body,reply.text); assertEquals(2,pages.get());
            assertTrue(reconnected.await(10,TimeUnit.SECONDS));
            assertTrue(delegated.await(1,TimeUnit.SECONDS));
            assertNull(replies.poll(250,TimeUnit.MILLISECONDS));
            if (!failures.isEmpty()) throw new AssertionError(failures.peek());
        } finally { server.shutdown(); }
    }
    @Test public void refusesNonLocalAuthorityAndUnsupportedCookies() throws Exception {
        try { new HostReplyMonitor(new URL("https://example.com/"),"invalid",(id,n,a,r)->{},message->{}); fail(); }
        catch (java.io.IOException expected) { assertTrue(expected.getMessage().contains("authority")); }
    }
    @Test public void officialSessionLifecycleReplacesFollowAndOfficialStatusOwnsRunningState() throws Exception {
        BlockingQueue<ReplyCompletionState.Reply> replies=new LinkedBlockingQueue<>();
        BlockingQueue<Throwable> failures=new LinkedBlockingQueue<>();
        AtomicInteger connections=new AtomicInteger(), subscriptions=new AtomicInteger();
        CountDownLatch officialRunning=new CountDownLatch(1);
        MockWebServer server=new MockWebServer();
        server.setDispatcher(new okhttp3.mockwebserver.Dispatcher() {
            @Override public MockResponse dispatch(RecordedRequest request) {
                try {
                    if (request.getPath().equals("/api/remote.mux")) return new MockResponse().withWebSocketUpgrade(new WebSocketListener() {
                        { connections.incrementAndGet(); }
                        @Override public void onMessage(WebSocket ws,String text) {
                            try {
                                JSONObject open=new JSONObject(text);
                                if (open.getString("type").equals("cancel")) return;
                                if (open.getString("endpoint").equals("$events")) eventsReady(ws);
                                else if (open.getString("endpoint").equals("session/control")) send(ws,baseline(58));
                                else {
                                    int generation=subscriptions.incrementAndGet();
                                    String stream=open.getString("streamId");
                                    journal(ws,stream,new JSONObject("{type:'snapshot',cursor:"+(generation==1?58:54)+",records:[{type:'event',event:{type:'turn/end',seq:"+(generation==1?58:54)+",data:{turn:4,reason:{kind:'completed'}}}}],projections:{values:{turnOutline:[{turn:4,seq:38}]}}}"));
                                    if (generation==1) {
                                        emit(ws,"api-session/removed",new JSONArray("['a']"));
                                        emit(ws,"api-session/added",new JSONArray("[{sessionId:'a',running:false}]"));
                                        send(ws,new JSONObject("{type:'projection',sessionId:'a',key:'turnOutline',seq:38,value:[{turn:4,seq:38}]}"));
                                        emit(ws,"api-session/status",new JSONArray("['a',true]"));
                                        // These frames belong to the retired subscription and must not restore its old cursor.
                                        journal(ws,stream,new JSONObject("{type:'event',event:{type:'turn/end',seq:59,data:{turn:4,reason:{kind:'completed'}}}}"));
                                    } else {
                                        emit(ws,"api-session/status",new JSONArray("['a',false]"));
                                    }
                                }
                            } catch(Throwable error) { failures.add(error); }
                        }
                    });
                    if (request.getPath().equals("/api/session/list")) return result(new JSONObject("{items:[{sessionId:'a',origin:'user',running:false}]}"));
                    if (request.getPath().equals("/api/eleckoiConversations/list")) return result(new JSONArray("[{runtimeSessionId:'a',title:'对话',metadata:{characterName:'角色',characterAvatar:''}}]"));
                    assertEquals("/api/session/page",request.getPath());
                    JSONObject query=new JSONObject(request.getBody().readUtf8()).getJSONObject("payload").getJSONObject("args").getJSONObject("request");
                    assertEquals(54,query.getLong("throughSeq"));
                    return result(new JSONObject("{hasMore:false,records:[{type:'event',event:{type:'turn/start',seq:38,time:123,data:{turn:4}}},{type:'event',event:{type:'assistant/message',seq:52,time:123,surfaceOp:'append',data:{message:{content:[{type:'text',text:'回退后的新回复'}]}}}},{type:'event',event:{type:'turn/end',seq:54,time:456,data:{turn:4,reason:{kind:'completed'}}}}]}"));
                } catch(Throwable error) { failures.add(error);return new MockResponse().setResponseCode(500); }
            }
        });
        server.start();
        try (HostReplyMonitor monitor=new HostReplyMonitor(new URL("http://127.0.0.1:"+server.getPort()),"dsh-auth-"+"x".repeat(43)+"=synthetic-session",new HostReplyMonitor.Receiver() {
            public void completed(String id,String n,String a,ReplyCompletionState.Reply r) {replies.add(r);}
            public void running(boolean active) {if(active) officialRunning.countDown();}
        },message->{})) {
            monitor.start();
            ReplyCompletionState.Reply reply=replies.poll(10,TimeUnit.SECONDS);
            if (!failures.isEmpty()) throw new AssertionError(failures.peek());
            assertNotNull("A shorter regenerated turn must still notify",reply);
            assertEquals("回退后的新回复",reply.text);assertEquals(1,connections.get());assertEquals(2,subscriptions.get());
            assertTrue(officialRunning.await(1,TimeUnit.SECONDS));
            assertNull(replies.poll(250,TimeUnit.MILLISECONDS));
        } finally {server.shutdown();}
    }
}
