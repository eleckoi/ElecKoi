import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MessageBubble } from "../src/renderer/src/ui/messages/MessageBubble.jsx";

globalThis.React = React;

describe("message markdown presentation", () => {
  it("matches Android roleplay chat by rendering source line breaks", () => {
    const html = renderToStaticMarkup(React.createElement(MessageBubble, {
      message: {
        id: "message-1",
        role: "assistant",
        content: "第一行\n第二行",
      },
      name: "角色",
    }));

    expect(html).toContain("第一行<br/>\n第二行");
  });

  it("renders GFM tables instead of showing their source pipes", () => {
    const html = renderToStaticMarkup(React.createElement(MessageBubble, {
      message: {
        id: "message-table",
        role: "assistant",
        content: "| 项目 | 内容 |\n| --- | --- |\n| 文件路径 | 新建设定 |",
      },
      name: "角色",
    }));

    expect(html).toContain('<div class="message-table-scroll"><table>');
    expect(html).toMatch(/<th[^>]*>项目<\/th>/);
    expect(html).toMatch(/<td[^>]*>新建设定<\/td>/);
  });

  it("keeps a fenced status block separate from surrounding roleplay wrappers", () => {
    const html = renderToStaticMarkup(React.createElement(MessageBubble, {
      message: {
        id: "message-status-block",
        role: "assistant",
        content: [
          "<status>",
          "```json",
          "第一行",
          "第二行",
          "```",
          "</status>",
          "",
          "<combat_driver>",
          "无",
          "</combat_driver>",
        ].join("\n"),
      },
      name: "角色",
    }));

    expect(html).toContain('data-streamdown="code-block"');
    expect(html).not.toContain("```json");
    expect(html).not.toContain("&lt;status&gt;");
    expect(html).not.toContain("&lt;combat_driver&gt;");
    expect(html).toContain("第一行");
    expect(html).toContain("第二行");
    expect(html).toContain("无");
  });

  it("preserves line breaks inside an unfenced status wrapper", () => {
    const html = renderToStaticMarkup(React.createElement(MessageBubble, {
      message: {
        id: "message-plain-status",
        role: "assistant",
        content: [
          "<status>",
          "状态一",
          "状态二",
          "</status>",
          "",
          "<combat_driver>",
          "无",
          "</combat_driver>",
        ].join("\n"),
      },
      name: "角色",
    }));

    expect(html).toContain("状态一<br/>\n状态二");
    expect(html).not.toContain("&lt;status&gt;");
    expect(html).not.toContain("&lt;combat_driver&gt;");
    expect(html).toContain("无");
  });

  it("keeps wrapper-looking source visible when it belongs to a code fence", () => {
    const html = renderToStaticMarkup(React.createElement(MessageBubble, {
      message: {
        id: "message-xml-example",
        role: "assistant",
        content: "```xml\n<combat_driver>\n示例\n</combat_driver>\n```",
      },
      name: "角色",
    }));

    expect(html).toContain('data-streamdown="code-block"');
    expect(html).toContain("&lt;combat_driver&gt;");
    expect(html).toContain("&lt;/combat_driver&gt;");
  });

  it("marks six dialogue quote pairs without touching inline code", () => {
    const html = renderToStaticMarkup(React.createElement(MessageBubble, {
      message: {
        id: "message-quotes",
        role: "assistant",
        content: '"English" “中文” «French» 「日文」 『双层』 ＂全角＂ `"code"`',
      },
      name: "角色",
    }));

    expect(html.match(/<q>/g)).toHaveLength(6);
    expect(html).toContain('<q>“中文”</q>');
    expect(html).toContain('<q>「日文」</q>');
    expect(html).toMatch(/<code[^>]*>&quot;code&quot;<\/code>/);
  });

  it("keeps italic and underline markup as real elements for theme colors", () => {
    const html = renderToStaticMarkup(React.createElement(MessageBubble, {
      message: {
        id: "message-text-styles",
        role: "assistant",
        content: "*斜体* <u>下划线</u>",
      },
      name: "角色",
    }));

    expect(html).toContain("<em>斜体</em>");
    expect(html).toContain("<ins>下划线</ins>");
  });

  it("places opening navigation on the message edges with the counter below the next control", () => {
    const html = renderToStaticMarkup(React.createElement(MessageBubble, {
      message: {
        id: "opening",
        role: "assistant",
        content: "开场白一",
        selectedOpeningId: "opening-a",
        openingOptions: [
          { id: "opening-a", content: "开场白一" },
          { id: "opening-b", content: "开场白二" },
        ],
      },
      name: "角色",
      layoutMode: "roleplay",
    }));

    expect(html).toContain('class="opening-pager-prev"');
    expect(html).toContain('class="opening-pager-next"');
    expect(html).toContain('class="opening-pager-index"');
    expect(html).toContain('data-prefix="fas"');
    expect(html).toContain('data-icon="chevron-left"');
    expect(html).toContain('data-icon="chevron-right"');
    expect(html).toMatch(/<\/div><div class="opening-pager"/);
    expect(html.indexOf('opening-pager-next')).toBeLessThan(html.indexOf('opening-pager-index'));
  });
});
