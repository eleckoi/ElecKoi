import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, describe, expect, it, vi } from "vitest";
import { CreatorStudioWindow } from "../../src/app/windows/CreatorStudioWindow.jsx";
import {
  CanvasDotGrid,
  CreatorStudioCanvas,
  normalizeCanvasConnection,
  zoomCanvasViewportWithWheel,
} from "../../src/modules/creatorStudio/components/CreatorStudioCanvas.jsx";
import { getMagneticHandleOffset } from "../../src/modules/creatorStudio/components/CreatorStudioCanvasParts.jsx";
import {
  canvasScreenPointToWorld,
  clampCanvasOverlayCenter,
  CreatorCanvasConnectionLine,
  CreatorCanvasEdge,
  placeCanvasNodeAtAnchor,
} from "../../src/modules/creatorStudio/components/CreatorStudioCanvasFlow.jsx";
import { CreatorStudioPagination, ProjectCollection, paginateCreatorProjects } from "../../src/modules/creatorStudio/components/CreatorStudioProjectHome.jsx";

vi.stubGlobal("React", React);
afterAll(() => vi.unstubAllGlobals());

function renderCreatorStudio() {
  vi.stubGlobal("window", { location: { search: "?view=creator-studio" } });
  return renderToStaticMarkup(<CreatorStudioWindow />);
}

describe("AI creator studio surface", () => {
  it("places the simple entry before the restricted developer entry", () => {
    const html = renderCreatorStudio();

    expect(html).toContain("AI创作工作室");
    expect(html).toContain("进入简易版");
    expect(html).toContain("开发者专用");
    expect(html).toContain("勿进");
    expect(html).toContain("进入开发版");
    expect(html.indexOf("进入简易版")).toBeLessThan(html.indexOf("进入开发版"));
  });

  it("paginates the same project collection used by both views", () => {
    const projects = Array.from({ length: 27 }, (_, index) => ({ id: String(index + 1) }));

    expect(paginateCreatorProjects(projects, 2, 20)).toMatchObject({
      currentPage: 2,
      totalPages: 2,
      items: projects.slice(20),
    });
    expect(paginateCreatorProjects(projects, 4, 10)).toMatchObject({
      currentPage: 3,
      totalPages: 3,
      items: projects.slice(20),
    });
  });

  it("renders the reference pagination controls with real page state", () => {
    const html = renderToStaticMarkup(<CreatorStudioPagination
      pageSize={20}
      currentPage={1}
      totalPages={3}
      onPageSizeChange={() => {}}
      onPageChange={() => {}}
    />);

    expect(html).toContain('aria-label="项目分页"');
    expect(html).toContain("每页显示");
    expect(html).toContain('aria-label="每页显示条数"');
    expect(html).toContain("上一页");
    expect(html).toContain('aria-label="页码"');
    expect(html).toContain("下一页");
  });

  it("makes the project surface and current-page action enter the project canvas", () => {
    const project = {
      id: "project-1",
      name: "角色项目",
      rootPath: "D:\\Projects\\角色项目",
      coverImage: "",
      updatedAt: "2026-09-13T15:03:00.000Z",
    };
    const onOpenProject = vi.fn();
    const collectionProps = {
      projects: [project],
      viewMode: "list",
      pendingDeletionId: "",
      deletingProjectId: "",
      deleteError: "",
      onOpenProject,
      onRequestDelete: () => {},
      onCancelDelete: () => {},
      onConfirmDelete: () => {},
    };
    let collection;
    function InspectCollection() { collection = ProjectCollection(collectionProps); return collection; }
    const html = renderToStaticMarkup(<InspectCollection />);
    const projectCard = collection.props.children[0];
    projectCard.props.children[0].props.onClick();

    expect(html).toContain('aria-label="进入项目 角色项目"');
    expect(html).toContain("当前页查看");
    expect(html).not.toContain("打开文件夹");
    expect(onOpenProject).toHaveBeenCalledWith(project);
  });

  it("renders an honest empty project canvas with ElecKoi creation objects", () => {
    const html = renderToStaticMarkup(<CreatorStudioCanvas
      project={{ id: "project-1", name: "角色项目" }}
      assistantOpen={false}
      onAssistantOpenChange={() => {}}
      onDirtyChange={() => {}}
    />);

    expect(html).toContain('aria-label="角色项目项目画布"');
    expect(html).toContain("快速添加创作对象");
    expect(html).toContain("文本");
    expect(html).toContain("图片");
    expect(html).toContain("音频");
    expect(html).toContain("视频");
    expect(html).not.toContain("快速添加角色节点");
    expect(html).not.toContain("快速添加设定节点");
    expect(html).not.toContain("快速添加变量节点");
    expect(html).not.toContain("快速添加正则节点");
    expect(html).toContain("--canvas-grid-size:12.06px");
    expect(html).toContain("--canvas-dot-size:0.75375px");
    expect(html).toContain("creator-canvas-dot-grid is-glow");
    expect(html).toContain("--canvas-glow-opacity:0");
    expect(html).not.toContain("3D导演");
    expect(html).not.toContain("多轨道");
    expect(html).not.toContain("未命名项目");
  });

  it("uses the same scalable SVG dot pattern for every canvas region", () => {
    const html = renderToStaticMarkup(<CanvasDotGrid
      id="shared-grid"
      viewport={{ x: 18, y: 64, zoom: 0.5 }}
      className="is-titlebar"
    />);

    expect(html).toContain("creator-canvas-dot-grid is-titlebar");
    expect(html).toContain('patternUnits="userSpaceOnUse"');
    expect(html).toContain('x="18"');
    expect(html).toContain('y="64"');
    expect(html).toContain('width="6.03"');
    expect(html).toContain('height="6.03"');
    expect(html).toContain('r="0.376875"');
  });

  it("zooms directly with the wheel while keeping the pointer over the same world point", () => {
    const viewport = { x: 40, y: -20, zoom: 1 };
    const pointer = { x: 420, y: 280 };
    const before = {
      x: (pointer.x - viewport.x) / viewport.zoom,
      y: (pointer.y - viewport.y) / viewport.zoom,
    };
    const zoomed = zoomCanvasViewportWithWheel(viewport, pointer, -100);

    expect(zoomed.zoom).toBeGreaterThan(1);
    expect((pointer.x - zoomed.x) / zoomed.zoom).toBeCloseTo(before.x);
    expect((pointer.y - zoomed.y) / zoomed.zoom).toBeCloseTo(before.y);
    expect(zoomCanvasViewportWithWheel(viewport, pointer, -10000).zoom).toBe(2);
    expect(zoomCanvasViewportWithWheel(viewport, pointer, 10000).zoom).toBe(0.35);
  });

  it("caps magnetic port following at the same 24px interaction radius", () => {
    expect(getMagneticHandleOffset(112, 106, 100, 100)).toEqual({ x: 12, y: 6 });
    const capped = getMagneticHandleOffset(200, 100, 100, 100);
    expect(capped.x).toBe(24);
    expect(capped.y).toBe(0);
  });

  it("converts screen points with the current canvas viewport", () => {
    expect(canvasScreenPointToWorld({ x: 120, y: -40, zoom: 2 }, { x: 520, y: 160 }))
      .toEqual({ x: 200, y: 100 });
  });

  it("places a node boundary exactly at the released connection endpoint", () => {
    const anchor = { x: 900, y: 300 };
    const size = { width: 420, height: 260 };

    expect(placeCanvasNodeAtAnchor(anchor, size, "right", 16)).toEqual({ x: 900, y: 170 });
    expect(placeCanvasNodeAtAnchor(anchor, size, "left", 16)).toEqual({ x: 480, y: 170 });
    expect(placeCanvasNodeAtAnchor(anchor, size, "", 16)).toEqual({ x: 706, y: 186 });
  });

  it("centers the connection menu on the released endpoint unless a viewport edge clamps it", () => {
    expect(clampCanvasOverlayCenter(455, 288, 1024)).toBe(455);
    expect(clampCanvasOverlayCenter(40, 288, 1024)).toBe(156);
    expect(clampCanvasOverlayCenter(1000, 288, 1024)).toBe(868);
  });

  it("normalizes left-side connections into an incoming edge", () => {
    expect(normalizeCanvasConnection({
      source: "target-card",
      sourceHandle: "left",
      target: "source-card",
      targetHandle: "right",
    })).toEqual({
      source: "source-card",
      sourceHandle: "right",
      target: "target-card",
      targetHandle: "left",
    });
    expect(normalizeCanvasConnection({ source: "same", target: "same" })).toBeNull();
  });

  it("draws completed edges all the way to both card boundaries", () => {
    const html = renderToStaticMarkup(<svg><CreatorCanvasEdge
      id="edge-1"
      sourceX={100}
      sourceY={200}
      targetX={400}
      targetY={240}
      sourcePosition="right"
      targetPosition="left"
      selected={false}
    /></svg>);

    expect(html).toContain('d="M88,200 C250,200 250,240 412,240"');
  });

  it("starts an in-progress connection at the visible plus control", () => {
    const html = renderToStaticMarkup(<svg><CreatorCanvasConnectionLine
      fromX={100}
      fromY={200}
      toX={400}
      toY={240}
      fromPosition="right"
      toPosition="left"
    /></svg>);

    expect(html).toContain('d="M126,200 C263,200 263,240 400,240"');
  });
});
