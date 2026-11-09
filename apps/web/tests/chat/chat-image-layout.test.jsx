// @vitest-environment jsdom
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChatImageGallery, agentMessageImageSize } from "../../src/ui/messages/ChatImageGallery.jsx";
import { MessageBubble } from "../helpers/officialMarkdown.jsx";
import { mapChatDetails } from "../../src/modules/chat/api/chatApi.js";

globalThis.React = React;

describe("Agent message images", () => {
  it.each(['generating', 'ready', 'failed'])('renders the %s image through the actual chat adapter at its frame marker', status => {
    const image = { id: 'synthetic-batch:1', batchId: 'synthetic-batch', frameId: 1, status, width: 832, height: 1216,
      ...(status === 'ready' ? { attachmentId: 'synthetic-image', dataUrl: 'data:image/png;base64,YQ==' } : {}),
      ...(status === 'failed' ? { error: '合成生图失败' } : {}) };
    const details = { conversation: { id: 'synthetic-chat' }, messages: [{ id: 'assistant-1', role: 'assistant', status: 'streaming',
      content: '<ACTION_CALL name="generate_image">{"frames":[]}</ACTION_CALL><FINAL>合成正文\n[[IMAGE:1]]\n</FINAL>',
      displayContent: '合成正文\n[[IMAGE:1]]\n', generatedImageAttachments: [image] }] };
    const message = mapChatDetails(details).messages[0];
    const html = renderToStaticMarkup(React.createElement(MessageBubble, { message, layoutMode: 'agent', onRegenerateImage: () => {} }));
    expect(html).not.toContain('[[IMAGE:1]]');
    expect(html).not.toContain('ACTION_CALL');
    expect(html).toContain('chat-image-gallery');
    if (status === 'ready') expect(html).toContain(image.dataUrl);
    if (status === 'failed') expect(html).toContain('重新生成');
    const waiting = renderToStaticMarkup(React.createElement(MessageBubble, { message: { ...message, displayContent: '' }, layoutMode: 'agent' }));
    expect(waiting).not.toContain('chat-image-gallery');
  });
  it("shows generated images after the assistant reply using the existing gallery", () => {
    const html = renderToStaticMarkup(React.createElement(MessageBubble, {
      message: { id: "assistant-1", role: "assistant", content: "合成回复", generatedImageAttachments: [{ attachmentId: "generated-1", dataUrl: "data:image/png;base64,YQ==", width: 480, height: 960 }] }, layoutMode: "agent",
    }));
    expect(html.indexOf('class="chat-image-gallery')).toBeGreaterThan(html.indexOf('class="bubble markdown-message"'));
    expect(html).toContain('class="chat-image-item agent-single interactive-image"');
  });
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
    expect(html).toContain('class="chat-image-item agent-single interactive-image"');
    expect(html).toContain('width:120px;aspect-ratio:120 / 240');
    expect(html.indexOf('class="chat-image-gallery')).toBeLessThan(html.indexOf('class="bubble markdown-message"'));

    const gallery = renderToStaticMarkup(React.createElement(ChatImageGallery, {
      images: [image, { ...image, attachmentId: "image-2" }],
      agentMessage: true,
    }));
    expect(gallery.match(/class="chat-image-item agent-tile interactive-image"/g)).toHaveLength(2);
  });
});
