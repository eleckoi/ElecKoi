import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterAll, describe, expect, it, vi } from "vitest";
import { AvatarCropModal } from "../src/renderer/src/ui/ui/AvatarCropModal.jsx";
import { AvatarManagerEditor, avatarSetFromPersona } from "../src/renderer/src/ui/ui/AvatarSlotsEditor.jsx";

vi.stubGlobal("React", React);
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
        onSave={() => {}}
      />,
    );

    expect(html).toContain("头像管理");
    expect(html).toContain("更换图片");
    expect(html).toContain("矩形头像");
    expect(html).toContain("圆形与方形");
    expect(html).toContain("圆形头像");
    expect(html).toContain("方形头像");
    expect(html).not.toContain("avatar-crop-stage");
    expect(html).not.toContain(">保存<");
  });

  it("shows a circular safe-area guide inside the shared square crop", () => {
    const html = renderToStaticMarkup(
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
    );

    expect(html).toContain("avatar-crop-frame has-circle-guide");
    expect(html).toContain("avatar-crop-circle-guide");
  });
});
