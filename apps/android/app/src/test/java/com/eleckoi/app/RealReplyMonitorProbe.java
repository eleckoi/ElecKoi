package com.eleckoi.app;

import org.json.JSONObject;
import java.net.URL;
import java.io.*;
import java.nio.charset.StandardCharsets;

/** Executed only against an isolated synthetic Host by the Android integration probe. */
public final class RealReplyMonitorProbe {
    private static synchronized void emit(JSONObject value) { System.out.println(value.toString()); System.out.flush(); }
    public static void main(String[] args) throws Exception {
        System.setOut(new PrintStream(new FileOutputStream(FileDescriptor.out),true,StandardCharsets.UTF_8));
        try (HostReplyMonitor monitor=new HostReplyMonitor(new URL(args[0]),args[1],new HostReplyMonitor.Receiver() {
            public void completed(String id,String name,String avatar,ReplyCompletionState.Reply reply) {
                try { emit(new JSONObject().put("type","completed").put("seq",reply.seq).put("text",reply.text)); }
                catch(Exception error) { throw new IllegalStateException(error); }
            }
            public void running(boolean active) {
                try { emit(new JSONObject().put("type","running").put("active",active)); }
                catch(Exception error) { throw new IllegalStateException(error); }
            }
        },message -> {
            try { emit(new JSONObject().put("type","diagnostic").put("message",message)); }
            catch(Exception error) { throw new IllegalStateException(error); }
        })) {
            monitor.start();
            while(System.in.read()!=-1) {}
        }
    }
}
