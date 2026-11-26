import { describe, expect, it } from "vitest";
import { mapConversations } from "../../src/modules/chat/api/chatApi.js";

describe("conversation previews", () => {
  it("only normalizes whitespace in the catalog preview", () => {
    const [conversation] = mapConversations([{
      id: "conversation-1",
      title: "角色",
      preview: " <FINAL>你好，\n\n 今天想去哪？</FINAL> ",
      createdAt: "2026-10-04T00:00:00.000Z",
      updatedAt: "2026-10-04T00:00:01.000Z",
      metadata: {},
    }]);

    expect(conversation.summary).toBe("<FINAL>你好， 今天想去哪？</FINAL>");
  });
});
