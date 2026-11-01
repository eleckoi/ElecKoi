// @vitest-environment jsdom
import React from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MessageBubble } from "../helpers/officialMarkdown.jsx";
import {
  prepareMarkdownTextTones,
  registerMarkdownTextToneHighlights,
} from "../../src/ui/messages/markdownTextTones.js";

globalThis.React = React;

describe("message markdown presentation", () => {
  it("keeps roleplay source line breaks in the official renderer", () => {
    const html = renderToStaticMarkup(React.createElement(MessageBubble, {
      message: {
        id: "message-1",
        role: "assistant",
        content: "第一行\n第二行",
      },
      name: "角色",
    }));

    expect(html).toContain("<p>第一行\n第二行</p>");
    expect(readFileSync(resolve("apps/web/src/modules/chat/styles/chat-panel.css"), "utf8"))
      .toMatch(/\.markdown-message \.eleckoi-dsh-markdown p\s*\{[^}]*white-space:\s*pre-wrap;/);
  });

  it("strips protocol markers when an assistant has no display projection", () => {
    const html = renderToStaticMarkup(React.createElement(MessageBubble, {
      message: {
        id: "message-final",
        role: "assistant",
        content: "<FINAL>可见正文</FINAL>",
      },
      name: "角色",
    }));

    expect(html).toContain("可见正文");
    expect(html).not.toContain("FINAL");
  });

  it("keeps an explicit empty display projection empty", () => {
    const html = renderToStaticMarkup(React.createElement(MessageBubble, {
      message: {
        id: "message-empty-display",
        role: "assistant",
        content: "<FINAL>正文</FINAL>",
        displayContent: "",
      },
      name: "角色",
    }));

    expect(html).not.toContain("正文");
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

    expect(html).toContain("<table>");
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

    expect(html).toContain('md-code-block');
    expect(html).toContain('data-code-block-banner="true"');
    expect(html).toMatch(/<span[^>]*>json<\/span>/);
    expect(html).toMatch(/<pre[^>]*><code>第一行\n第二行<\/code><\/pre>/);
    expect(html).not.toContain("```json");
    expect(html).not.toContain("&lt;status&gt;");
    expect(html).not.toContain("&lt;combat_driver&gt;");
    expect(html).toContain("第一行");
    expect(html).toContain("第二行");
    expect(html).toContain("无");
  });

  it("keeps the official DSH code toolbar attached to its code card while scrolling", () => {
    const chatStyles = readFileSync(
      resolve("apps/web/src/modules/chat/styles/chat-panel.css"),
      "utf8",
    );

    expect(chatStyles).toMatch(
      /\.markdown-message \.md-code-block > :has\(> \[data-code-block-banner\]\)\s*\{[^}]*position:\s*static;[^}]*z-index:\s*auto;/,
    );
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

    expect(html).toContain("<p>状态一\n状态二</p>");
    expect(html).not.toContain("&lt;status&gt;");
    expect(html).not.toContain("&lt;combat_driver&gt;");
    expect(html).toContain("无");
  });

  it("removes unknown XML wrappers while keeping their body visible", () => {
    const html = renderToStaticMarkup(React.createElement(MessageBubble, {
      message: {
        id: "message-custom-xml",
        role: "assistant",
        content: "<人物 class=\"state\">中文正文</人物>\n<english_word>English body</english_word>",
      },
      name: "角色",
    }));

    expect(html).toContain("中文正文");
    expect(html).toContain("English body");
    expect(html).not.toContain("人物");
    expect(html).not.toContain("english_word");
    expect(html).not.toContain("class=\"state\"");
    expect(html).not.toContain("rich-message-frame");
  });

  it("leaves custom XML examples untouched inside inline and fenced code", () => {
    const html = renderToStaticMarkup(React.createElement(MessageBubble, {
      message: {
        id: "message-custom-code",
        role: "assistant",
        content: "`<人物>行内示例</人物>`\n\n```xml\n<人物>代码示例</人物>\n```",
      },
      name: "角色",
    }));

    expect(html).toContain("&lt;人物&gt;行内示例&lt;/人物&gt;");
    expect(html).toContain("&lt;人物&gt;代码示例&lt;/人物&gt;");
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

    expect(html).toContain('md-code-block');
    expect(html).toMatch(/<span[^>]*>xml<\/span>/);
    expect(html).toMatch(/<pre[^>]*><code>/);
    expect(html).toContain("&lt;combat_driver&gt;");
    expect(html).toContain("&lt;/combat_driver&gt;");
  });

  it("preserves dialogue punctuation and inline code through the official parser", () => {
    const html = renderToStaticMarkup(React.createElement(MessageBubble, {
      message: {
        id: "message-quotes",
        role: "assistant",
        content: '"English" “中文” «French» 「日文」 『双层』 ＂全角＂ `"code"`',
      },
      name: "角色",
    }));

    expect(html).toContain('&quot;English&quot; “中文” «French» 「日文」 『双层』 ＂全角＂');
    expect(html).toMatch(/<code[^>]*>&quot;code&quot;<\/code>/);
  });

  it("keeps the official renderer safe from authored HTML while preserving Markdown emphasis", () => {
    const html = renderToStaticMarkup(React.createElement(MessageBubble, {
      message: {
        id: "message-text-styles",
        role: "assistant",
        content: "*斜体* <u>下划线</u>",
      },
      name: "角色",
    }));

    expect(html).toContain("<em>斜体</em>");
    expect(html).toContain("<p><em>斜体</em> 下划线</p>");
    expect(html).not.toContain("<u>");
  });

  it("keeps ElecKoi text-tone markup around the official Markdown renderer", () => {
    expect(prepareMarkdownTextTones("*斜体* <u>下划线</u> “引号”")).toEqual({
      markdown: "*斜体* 下划线 “引号”",
      underlineTexts: ["下划线"],
    });
    expect(prepareMarkdownTextTones("`<u>代码</u>`\n```html\n<u>代码块</u>\n```")).toEqual({
      markdown: "`<u>代码</u>`\n```html\n<u>代码块</u>\n```",
      underlineTexts: [],
    });
    const styles = readFileSync(resolve("apps/web/src/modules/chat/styles/chat-panel.css"), "utf8");
    expect(styles).not.toContain("::highlight(");

    const root = document.createElement("div");
    root.className = "markdown-message";
    root.textContent = "“引号” 下划线";
    document.body.append(root);
    const dispose = registerMarkdownTextToneHighlights(root, ["下划线"]);
    const runtimeStyles = document.getElementById("eleckoi-markdown-text-tone-highlights")?.textContent || "";
    expect(runtimeStyles).toContain("::highlight(eleckoi-roleplay-underline)");
    expect(runtimeStyles).toContain("::highlight(eleckoi-roleplay-quote)");
    dispose();
    root.remove();
  });

  it("keeps roleplay controls outside the official content width and on shared side axes", () => {
    const html = renderToStaticMarkup(React.createElement(MessageBubble, {
      message: {
        id: "opening",
        role: "assistant",
        content: "开场白一",
        selectedOpeningId: "opening-a",
        canChangeOpening: true,
        openingOptions: [
          { id: "opening-a", content: "开场白一" },
          { id: "opening-b", content: "开场白二" },
        ],
      },
      name: "角色",
      layoutMode: "roleplay",
      onSelectOpening: () => {},
    }));

    expect(html).toContain('class="opening-pager-prev"');
    expect(html).toContain('class="opening-pager-next"');
    expect(html).toContain('class="opening-pager-index"');
    expect(html).toContain('data-prefix="fas"');
    expect(html).toContain('data-icon="chevron-left"');
    expect(html).toContain('data-icon="chevron-right"');
    expect(html).toContain('class="message-tools-leading"');
    expect(html.indexOf('class="message-tools')).toBeLessThan(html.indexOf('class="opening-pager"'));
    expect(html.indexOf('opening-pager-next')).toBeLessThan(html.indexOf('opening-pager-index'));

    const root = document.createElement("div");
    root.innerHTML = html;
    const article = root.querySelector("article.message-roleplay");
    expect(article?.querySelector(":scope > .message-tools")).not.toBeNull();
    expect(article?.querySelector(":scope > .message-content > .message-tools")).toBeNull();

    const chatStyles = readFileSync(
      resolve("apps/web/src/modules/chat/styles/chat-panel.css"),
      "utf8",
    );
    expect(chatStyles).toMatch(
      /\.opening-pager\s*\{[^}]*position:\s*static;/,
    );
    expect(chatStyles).toMatch(
      /\.message-roleplay > \.opening-pager\s*\{[^}]*grid-column:\s*1\s*\/\s*-1;[^}]*grid-row:\s*1;[^}]*grid-template-columns:\s*var\(--chat-roleplay-side-rail\)\s*minmax\(0,\s*1fr\)\s*var\(--chat-roleplay-side-rail\);/,
    );
    expect(chatStyles).toMatch(
      /\.message-roleplay\s*\{[^}]*--chat-roleplay-leading-stack-height:\s*var\(--chat-avatar-height,\s*86\.67px\);/,
    );
    expect(chatStyles).toMatch(
      /\.message-roleplay:has\(> \.message-floor\)\s*\{[^}]*--chat-roleplay-leading-stack-height:\s*calc\([^;]+\);[^}]*min-height:\s*var\(--chat-roleplay-leading-stack-height\);/,
    );
    expect(chatStyles).toMatch(
      /\.message-roleplay\.has-opening-pager\s*\{[^}]*min-height:\s*calc\(var\(--chat-roleplay-leading-stack-height\)\s*\+\s*62px\);/,
    );
    expect(chatStyles).toMatch(
      /\.message-roleplay > \.message-tools\s*\{[^}]*grid-column:\s*3;[^}]*grid-row:\s*1;[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*26px\s*minmax\(0,\s*1fr\);/,
    );
    expect(chatStyles).toMatch(
      /\.message-roleplay > \.opening-pager \.opening-pager-prev\s*\{[^}]*grid-column:\s*1;[^}]*justify-self:\s*center;[^}]*margin-left:\s*0;/,
    );
    expect(chatStyles).toMatch(
      /\.message-roleplay > \.opening-pager :is\(\.opening-pager-next, \.opening-pager-index\)\s*\{[^}]*grid-column:\s*3;[^}]*justify-self:\s*center;/,
    );
    expect(chatStyles).toMatch(
      /\.message-roleplay \.message-content,[^}]*\.message-roleplay\.mine \.message-content\s*\{[^}]*grid-column:\s*2;[^}]*grid-row:\s*1;/,
    );
    const officialContentColumn = chatStyles.match(
      /\.message-roleplay \.message-content,[^}]*\.message-roleplay\.mine \.message-content\s*\{([^}]*)\}/,
    )?.[1] || "";
    expect(officialContentColumn).not.toMatch(/(?:max-)?width|padding-inline/);
  });

  it("places Agent response actions below the answer and keeps the opening pager with them", () => {
    const html = renderToStaticMarkup(React.createElement(MessageBubble, {
      message: {
        id: "opening",
        role: "assistant",
        content: "开场白一",
        process: [{ id: "step-1" }],
        selectedOpeningId: "opening-a",
        canChangeOpening: true,
        openingOptions: [
          { id: "opening-a", content: "开场白一" },
          { id: "opening-b", content: "开场白二" },
        ],
      },
      name: "角色",
      layoutMode: "agent",
      onEdit: () => {},
      onSelectOpening: () => {},
    }));

    expect(html).toContain('class="message theirs message-agent');
    expect(html).toContain('class="agent-message-footer"');
    expect(html.indexOf('class="bubble markdown-message"')).toBeLessThan(html.indexOf('class="agent-message-footer"'));
    expect(html.indexOf('class="opening-pager"')).toBeLessThan(html.indexOf('aria-label="复制"'));
    expect(html).toContain('aria-label="查看过程"');
    expect(html).not.toContain('aria-label="朗读"');
    expect(html).toContain('aria-label="编辑"');
    expect(html).not.toContain('aria-label="重新生成"');
    expect(html).not.toContain('class="message-tools');
  });

  it("keeps the outgoing opening frozen until the replacement is painted", () => {
    const source = readFileSync(
      resolve("apps/web/src/ui/messages/MessageBubble.jsx"),
      "utf8",
    );
    const switchBody = source.match(
      /async function selectOpeningAt\(targetIndex\) \{([\s\S]*?)\r?\n  \}\r?\n  function submitPageJump/,
    )?.[1] || "";

    expect(switchBody).toMatch(
      /await Promise\.resolve\(onSelectOpening\?\.\(message, targetOption\.id\)\);\s*await nextPaint\(\);/,
    );
    expect(switchBody).toMatch(
      /const range = articleRef\.current\.getBoundingClientRect\(\)\.width \+ 30;\s*clearExit\(\);\s*clearExit = \(\) => \{\};\s*const clearEntry = await animateOpeningSlide/,
    );
    expect(source).toContain("setPagerOpeningId(selectedOpeningIdRef.current);");
  });

  it("does not expose process viewing in a user message menu", () => {
    const html = renderToStaticMarkup(React.createElement(MessageBubble, {
      message: { id: "user-1", role: "user", content: "你好", process: [{ id: "step-1" }] },
      name: "用户",
      layoutMode: "roleplay",
    }));

    expect(html).not.toContain('aria-label="查看过程"');
  });

  it("puts Agent regeneration immediately after copy in the persistent footer", () => {
    const html = renderToStaticMarkup(React.createElement(MessageBubble, {
      message: { id: "assistant-1", role: "assistant", content: "你好" },
      name: "角色",
      layoutMode: "agent",
      onRegenerate: () => {},
    }));

    expect(html).toMatch(/aria-label="复制"[^>]*>.*?<\/button><button[^>]*aria-label="重新生成"/);
    expect(html).toMatch(/aria-label="复制"[^>]*><svg /);
    expect(html).toMatch(/aria-label="编辑"[^>]*><svg width="18" height="18"/);
    expect(html).toContain('class="agent-message-footer"');
  });

  it("marks only the latest Agent assistant reply for an always-visible footer", () => {
    const message = { id: "assistant-1", role: "assistant", content: "你好" };
    const latest = renderToStaticMarkup(React.createElement(MessageBubble, { message, layoutMode: "agent", isLatestAssistant: true }));
    const historical = renderToStaticMarkup(React.createElement(MessageBubble, { message, layoutMode: "agent", isLatestAssistant: false }));
    expect(latest).toContain("is-latest-assistant");
    expect(historical).not.toContain("is-latest-assistant");
    expect(historical).toContain('class="agent-message-footer"');
  });

  it("keeps Agent user messages in their own bubble without an assistant footer", () => {
    const html = renderToStaticMarkup(React.createElement(MessageBubble, {
      message: { id: "user-1", role: "user", content: "继续" },
      name: "我",
      layoutMode: "agent",
    }));

    expect(html).toContain('class="message mine message-agent');
    expect(html).toContain('class="bubble markdown-message"');
    expect(html).toContain('class="agent-user-actions"');
    expect(html.indexOf('class="bubble markdown-message"')).toBeLessThan(html.indexOf('class="agent-user-actions"'));
    expect(html).not.toContain('class="message-tools');
    expect(html).not.toContain('class="agent-message-footer"');
  });
});
