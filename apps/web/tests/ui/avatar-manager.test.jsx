// @vitest-environment jsdom
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, describe, expect, it, vi } from "vitest";
import { AvatarCropModal } from "../../src/ui/ui/AvatarCropModal.jsx";
import { AvatarManagerEditor, avatarSetFromPersona } from "../../src/ui/ui/AvatarSlotsEditor.jsx";

vi.stubGlobal("React", React);
vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
afterAll(() => vi.unstubAllGlobals());

describe("avatar manager", () => {
  it("maps the three persisted user avatar results", () => {
    expect(avatarSetFromPersona({
      user_avatar: "circle",
      user_square: "square",
      user_portrait: "portrait",
    }, "user")).toEqual({ circle: "circle", square: "square", portrait: "portrait" });
  });

  it("shows results and keeps the cropper out of the default page", () => {
    const html = renderToStaticMarkup(
      <AvatarManagerEditor
        value={{ circle: "circle.png", square: "square.png", portrait: "portrait.png" }}
        name="你"
        onBack={() => {}}
        onChange={() => {}}
      />,
    );

    expect(html).toContain("头像管理");
    expect(html).not.toContain("更换图片");
    expect(html).not.toContain('avatar-manager-footer');
    expect(html).toContain('aria-label="更换圆形头像"');
    expect(html).toContain("矩形头像");
    expect(html).toContain("圆形与方形");
    expect(html).toContain("圆形头像");
    expect(html).toContain("方形头像");
    expect(html).not.toContain("avatar-crop-stage");
    expect(html).not.toContain(">保存<");
  });

  it("shows a circular safe-area guide inside the shared square crop", async () => {
    const host=document.createElement("div");document.body.append(host);const root=createRoot(host);
    const previous=URL.createObjectURL;URL.createObjectURL=vi.fn(()=>"blob:synthetic-avatar");URL.revokeObjectURL=vi.fn();
    await act(async () => root.render(
      <AvatarCropModal
        file={{ name: "avatar.png" }}
        title="调整圆形与方形头像"
        cropWidth={250}
        cropHeight={250}
        cropRadius="8px"
        showCircleGuide
        outputShape="square"
        onCancel={() => {}}
        onSave={() => {}}
      />,
    ));

    expect(document.querySelector(".avatar-crop-frame.has-circle-guide")).not.toBeNull();
    expect(document.querySelector(".avatar-crop-circle-guide")).not.toBeNull();
    expect(host.querySelector("[role=dialog]")).toBeNull();
    await act(async()=>root.unmount());host.remove();URL.createObjectURL=previous;
  });
});
