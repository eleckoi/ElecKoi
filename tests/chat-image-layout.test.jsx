import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChatImageGallery, agentMessageImageSize } from "../src/renderer/src/modules/chat/components/ChatImageGallery.jsx";
import { MessageBubble } from "../src/renderer/src/ui/messages/MessageBubble.jsx";

globalThis.React = React;

describe("Agent message images", () => {
  it("bounds a single image by its long edge and preserves smaller originals", () => {
    expect(agentMessageImageSize(480, 960)).toMatchObject({ width: 120, height: 240 });
    expect(agentMessageImageSize(960, 480)).toMatchObject({ width: 240, height: 120 });
    expect(agentMessageImageSize(30, 15)).toMatchObject({ width: 30, height: 15 });
    expect(agentMessageImageSize(100, 1000)).toMatchObject({ width: 60, height: 240, objectPosition: "center top" });
  });

  it("keeps user attachments above the right-aligned bubble and groups multiple images as tiles", () => {
    const image = { attachmentId: "image-1", dataUrl: "data:image/png;base64,YQ==", width: 480, height: 960 };
    const html = renderToStaticMarkup(React.createElement(MessageBubble, {
      message: { id: "user-1", role: "user", content: "看这张图", inputImageAttachments: [image] },
      layoutMode: "agent",
      name: "访客",
    }));
    expect(html).toContain('class="chat-image-gallery agent-message-images"');
    expect(html).toContain('class="chat-image-item agent-single"');
    expect(html).toContain('width:120px;aspect-ratio:120 / 240');
    expect(html.indexOf('class="chat-image-gallery')).toBeLessThan(html.indexOf('class="bubble markdown-message"'));

    const gallery = renderToStaticMarkup(React.createElement(ChatImageGallery, {
      images: [image, { ...image, attachmentId: "image-2" }],
      agentMessage: true,
    }));
    expect(gallery.match(/class="chat-image-item agent-tile"/g)).toHaveLength(2);
  });
});
