import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, describe, expect, it, vi } from "vitest";
import { CommunityDialog } from "../../src/app/windows/shell/components/CommunityDialog.jsx";
import { SidebarRail } from "../../src/app/windows/shell/components/SidebarRail.jsx";
import { CommunityNavIcon, CreatorStudioNavIcon, MessageNavIcon, ModelNavIcon, PersonNavIcon, PresetNavIcon } from "../../src/ui/icons/navIcons.jsx";
import { ELECKOI_QQ_GROUP_NUMBER } from "../../../../packages/shared/src/foundation/community";

vi.stubGlobal("React", React);
afterAll(() => vi.unstubAllGlobals());

describe("community navigation", () => {
  it("keeps each product icon and its active-layer styling", () => {
    const icons = {
      messages: MessageNavIcon,
      character: PersonNavIcon,
      presets: PresetNavIcon,
      creatorStudio: CreatorStudioNavIcon,
      community: CommunityNavIcon,
      model: ModelNavIcon,
    };
    const html = renderToStaticMarkup(
      <SidebarRail
        activeSection="messages"
        navigationItems={[
          { id: "messages", label: "消息", productIcon: true },
          { id: "character", label: "角色列表", productIcon: true },
          { id: "presets", label: "预设", productIcon: true },
          { id: "plugins", label: "插件" },
          { id: "creatorStudio", label: "AI创作工作室", action: true, productIcon: true },
          { id: "community", label: "社区", action: true, productIcon: true },
          { id: "model", label: "模型配置", productIcon: true },
        ]}
        renderSidebarSlot={(name, owner, options) => {
          if (name === "sidebar.panellist") {
            const Icon = icons[options.only];
            return Icon ? <Icon /> : null;
          }
          return owner.content;
        }}
        onSectionChange={() => {}}
        onNavigationAction={() => {}}
      />,
    );

    expect(html.match(/class="message-nav-icon"/g)).toHaveLength(2);
    expect(html).toContain('class="preset-nav-agent"');
    expect(html).toContain('class="creator-studio-nav"');
    expect(html).toContain('class="creator-studio-star"');
    expect(html).toContain('width="19"');
    expect(html).toContain('class="community-nav-group"');
    expect(html).toContain('class="model-nav-cube"');
    expect(html.match(/class="plugin-nav-icon"/g)).toHaveLength(2);
    expect(html).toContain('class="rail-icon-layer active-fill"');
  });

  it("places the creator studio immediately above community and model settings", () => {
    const html = renderToStaticMarkup(
      <SidebarRail
        activeSection="messages"
        navigationItems={[
          { id: "messages", label: "消息", order: -40 },
          { id: "creatorStudio", label: "AI创作工作室", order: 10, action: true },
          { id: "community", label: "社区", order: 20, action: true },
          { id: "model", label: "模型配置", order: 30 },
        ]}
        onSectionChange={() => {}}
        onNavigationAction={() => {}}
        onOpenProfile={() => {}}
        onOpenSettings={() => {}}
      />,
    );

    expect(html.indexOf('aria-label="AI创作工作室"')).toBeGreaterThan(-1);
    expect(html.indexOf('aria-label="社区"')).toBeGreaterThan(-1);
    expect(html.indexOf('aria-label="AI创作工作室"')).toBeLessThan(html.indexOf('aria-label="社区"'));
    expect(html.indexOf('aria-label="社区"')).toBeLessThan(html.indexOf('aria-label="模型配置"'));
  });

  it("renders a DSH-contributed panel in the rail without a product route", () => {
    const html = renderToStaticMarkup(
      <SidebarRail
        activeSection="extension-page"
        navigationItems={[
          { id: "messages", label: "消息", order: -40, icon: "messages" },
          { id: "extension-page", label: "扩展页面", order: 5, icon: "extension-page" },
        ]}
        onSectionChange={() => {}}
        onNavigationAction={() => {}}
        onOpenProfile={() => {}}
        onOpenSettings={() => {}}
      />,
    );

    expect(html).toContain('aria-label="扩展页面"');
    expect(html).toContain('class="plugin-nav-icon"');
    expect(html).toContain('aria-label="扩展页面" aria-current="page"');
    expect(html).not.toContain('aria-label="插件"');
  });

  it("shows the current ElecKoi QQ group with a copy action only", () => {
    const html = renderToStaticMarkup(
      <CommunityDialog open onClose={() => {}} onNotify={() => {}} />,
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain(ELECKOI_QQ_GROUP_NUMBER);
    expect(html).toContain("复制群号");
    expect(html).not.toContain("加入QQ群");
  });
});
