package com.eleckoi.app;

import org.json.*;
import org.junit.Test;
import java.util.*;
import static org.junit.Assert.*;

public final class SessionFollowNotificationStateTest {
    private JSONObject event(String type,long seq,JSONObject data) throws Exception {
        return new JSONObject().put("type",type).put("seq",seq).put("time",123456789).put("data",data);
    }
    private JSONObject frame(JSONObject event) throws Exception { return new JSONObject().put("type","event").put("event",event); }
    private JSONObject end(long seq,long turn,String kind) throws Exception {
        return event("turn/end",seq,new JSONObject().put("turn",turn).put("reason",new JSONObject().put("kind",kind)));
    }
    private JSONObject snapshot(long cursor,long start,long turn,boolean completed) throws Exception {
        JSONArray records=new JSONArray();
        if (completed) records.put(frame(end(cursor,turn,"completed")));
        return new JSONObject().put("type","snapshot").put("cursor",cursor).put("records",records)
            .put("projections",new JSONObject().put("asOfSeq",cursor).put("values",new JSONObject().put("turnOutline",new JSONArray()
                .put(new JSONObject().put("turn",turn).put("seq",start).put("prompt","").put("response",completed?"旧正文":"")))));
    }
    private JSONObject message(long seq,String text) throws Exception {
        return event("assistant/message",seq,new JSONObject().put("message",new JSONObject().put("content",new JSONArray()
            .put(new JSONObject().put("type","reasoning").put("text","private reasoning"))
            .put(new JSONObject().put("type","text").put("text",text))))).put("surfaceOp","append");
    }
    @Test public void publicSnapshotSkipsOldCompletionsAndTracksNewTurnEnd() throws Exception {
        ReplyCompletionState state=new ReplyCompletionState();
        assertTrue(state.follow("a",snapshot(10,4,1,true)).isEmpty());
        state.follow("a",frame(event("turn/start",11,new JSONObject().put("turn",2))));
        state.follow("a",frame(message(12,"新回复")));
        List<ReplyCompletionState.Window> windows=state.follow("a",frame(end(13,2,"completed")));
        assertEquals(10,windows.get(0).after);
        assertEquals(13,windows.get(0).through); assertEquals(12,windows.get(0).completedAfter);
    }
    @Test public void reconnectReadsMissedEndsButDoesNotRepeatAlreadyObservedCompletion() throws Exception {
        ReplyCompletionState state=new ReplyCompletionState(); state.follow("a",snapshot(7,4,1,false));
        List<ReplyCompletionState.Window> windows=state.follow("a",snapshot(15,11,2,true));
        assertEquals(3,windows.get(0).after); assertEquals(7,windows.get(0).completedAfter);
        assertTrue(state.follow("a",snapshot(15,11,2,true)).isEmpty());
    }
    @Test public void fastNewSessionDoesNotLoseCompletionBeforeFollowOpens() throws Exception {
        ReplyCompletionState state=new ReplyCompletionState(); state.discovered("a",4);
        List<ReplyCompletionState.Window> windows=state.follow("a",snapshot(10,4,1,true));
        assertEquals(3,windows.get(0).after); assertEquals(3,windows.get(0).completedAfter);
    }
    @Test public void cancelledTurnsAndRewrittenSnapshotsDoNotReplayOldCompletions() throws Exception {
        ReplyCompletionState state=new ReplyCompletionState(); state.follow("a",snapshot(7,4,1,false));
        assertTrue(state.follow("a",frame(end(8,1,"aborted"))).isEmpty());
        assertTrue(state.follow("a",snapshot(3,1,1,true)).isEmpty());
        state.follow("a",frame(event("turn/start",4,new JSONObject().put("turn",2))));
        state.forget("a");
    }
    @Test(expected=JSONException.class) public void detectsMissingJournalEvents() throws Exception {
        ReplyCompletionState state=new ReplyCompletionState(); state.follow("a",snapshot(10,4,1,true));
        state.follow("a",frame(end(12,2,"completed")));
    }
    @Test public void rewrittenJournalCanCompleteBelowItsPreviousWatermarkWithoutReplayingRetainedTurns() throws Exception {
        ReplyCompletionState state=new ReplyCompletionState();
        state.follow("a",snapshot(58,38,4,true));
        state.forget("a"); state.discovered("a",38);
        List<ReplyCompletionState.Window> windows=state.follow("a",snapshot(54,38,4,true));
        assertEquals(1,windows.size());
        assertEquals(37,windows.get(0).after);
        assertEquals(37,windows.get(0).completedAfter);
        assertEquals(54,windows.get(0).through);
        assertTrue(state.follow("a",snapshot(54,38,4,true)).isEmpty());
    }
    @Test public void keepsAllReplyTextAndIgnoresOpaqueExtensionEventsReasoningAndFailedTurns() throws Exception {
        String text="正文".repeat(20000)+"末尾完整保留";
        List<JSONObject> events=new ArrayList<>(Arrays.asList(event("turn/start",1,new JSONObject().put("turn",1)),
            message(2,text),new JSONObject().put("type","plugin/custom").put("seq",3).put("data","opaque"),end(4,1,"completed"),
            event("turn/start",5,new JSONObject().put("turn",2)),message(6,"取消正文"),end(7,2,"aborted"),
            event("turn/start",8,new JSONObject().put("turn",3)),message(9,"失败正文"),end(10,3,"failed")));
        Collections.reverse(events);
        List<ReplyCompletionState.Reply> replies=ReplyCompletionState.replies(events);
        assertEquals(1,replies.size()); assertEquals(text,replies.get(0).text);
    }
}
