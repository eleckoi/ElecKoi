package com.eleckoi.app;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import java.util.*;

/** Tracks the public Session follow journal without replaying completed history on startup. */
final class ReplyCompletionState {
    static final class Window {
        final String sessionId;
        final long after, through, completedAfter;
        Window(String id, long after, long through, long completedAfter) {
            sessionId=id; this.after=after; this.through=through; this.completedAfter=completedAfter;
        }
    }
    static final class Reply {
        final long seq, time;
        final String text;
        Reply(long seq, long time, String text) { this.seq=seq; this.time=time; this.text=text; }
    }
    private static final class Cursor { long seen=-1, start=-1; boolean hasCut, ready; }
    private final Map<String,Cursor> cursors=new HashMap<>();
    void discovered(String id, long seq) {
        Cursor cursor=cursors.computeIfAbsent(id,key->new Cursor());
        if (!cursor.hasCut) { cursor.seen=seq-1; cursor.hasCut=true; }
    }
    void retain(Set<String> ids) { cursors.keySet().retainAll(ids); }
    void forget(String id) { cursors.remove(id); }
    List<Window> follow(String id, JSONObject frame) throws JSONException {
        Cursor cursor=cursors.computeIfAbsent(id,key->new Cursor());
        List<Window> windows=new ArrayList<>();
        switch (frame.getString("type")) {
            case "snapshot": {
                long through=frame.getLong("cursor"), start=-1;
                JSONArray outline=frame.getJSONObject("projections").getJSONObject("values").optJSONArray("turnOutline");
                if (outline!=null && outline.length()>0) {
                    JSONObject last=outline.getJSONObject(outline.length()-1);
                    start=last.getLong("seq");
                }
                JSONArray records=frame.getJSONArray("records");
                for (int i=0;i<records.length();i++) {
                    JSONObject event=records.getJSONObject(i).getJSONObject("event");
                    if (event.getString("type").equals("turn/start") && event.getLong("seq")>=start) {
                        start=event.getLong("seq");
                    }
                }
                if (cursor.hasCut && through>cursor.seen) {
                    long floor=cursor.start>=0?Math.min(cursor.seen,cursor.start-1):cursor.seen;
                    if (start>=0) floor=Math.min(floor,start-1);
                    windows.add(new Window(id,floor,through,cursor.seen));
                }
                cursor.seen=through; cursor.start=start; cursor.hasCut=true; cursor.ready=true;
                break;
            }
            case "event": {
                if (!cursor.ready) throw new JSONException("Session event arrived before its follow snapshot");
                JSONObject event=frame.getJSONObject("event"); long seq=event.getLong("seq");
                if (seq<=cursor.seen) break;
                if (seq!=cursor.seen+1) throw new JSONException("Session follow journal has a sequence gap");
                switch (event.getString("type")) {
                    case "turn/start": cursor.start=seq; break;
                    case "turn/end":
                        if (cursor.start>=0 && "completed".equals(event.getJSONObject("data").getJSONObject("reason").getString("kind")))
                            windows.add(new Window(id,cursor.start-1,seq,cursor.seen));
                        break;
                }
                cursor.seen=seq; break;
            }
            default: throw new JSONException("Unsupported Session follow frame");
        }
        return windows;
    }

    /** Only committed assistant text in successfully completed turns belongs in a reply alert. */
    static List<Reply> replies(List<JSONObject> events) throws JSONException {
        events.sort(Comparator.comparingLong(event -> event.optLong("seq")));
        List<Reply> replies=new ArrayList<>();
        StringBuilder text=new StringBuilder();
        long turn=-1;
        for (JSONObject event:events) {
            switch (event.getString("type")) {
                case "turn/start": turn=event.getJSONObject("data").getLong("turn"); text.setLength(0); break;
                case "assistant/message":
                    if (turn < 0 || !"append".equals(event.opt("surfaceOp"))) break;
                    JSONArray content=event.getJSONObject("data").getJSONObject("message").getJSONArray("content");
                    StringBuilder message=new StringBuilder();
                    for (int i=0; i<content.length(); i++) {
                        JSONObject block=content.getJSONObject(i);
                        if (block.getString("type").equals("text")) message.append(block.getString("text"));
                    }
                    if (message.length()>0) { if (text.length()>0) text.append("\n\n"); text.append(message); }
                    break;
                case "turn/end":
                    JSONObject data=event.getJSONObject("data");
                    if (turn == data.getLong("turn") && "completed".equals(data.getJSONObject("reason").getString("kind"))
                        && !text.toString().trim().isEmpty())
                        replies.add(new Reply(event.getLong("seq"), event.getLong("time"), text.toString()));
                    turn=-1; text.setLength(0); break;
            }
        }
        return replies;
    }
}
