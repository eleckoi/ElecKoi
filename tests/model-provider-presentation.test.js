import { describe, expect, it } from "vitest";
import {
  addableProviderItems,
  blankConfigForProvider,
  filterProviderItems,
  mergeProviderMeta,
} from "../src/renderer/src/modules/models/model/modelProviderCatalog.js";
import {
  detectModelIconId,
  modelIdentityMeta,
} from "../src/renderer/src/modules/models/model/modelIdentity.js";
import { imageSettingsError } from "../src/renderer/src/modules/models/model/modelConfigDraft.js";

describe("model provider presentation", () => {
  it("keeps optional providers out of the library until they are active or configured", () => {
    expect(mergeProviderMeta([]).map((item) => item.id)).toEqual(["custom", "deepseek"]);
    expect(mergeProviderMeta([], [], "zhipu").map((item) => item.id)).toEqual([
      "custom",
      "deepseek",
      "zhipu",
    ]);
    expect(mergeProviderMeta([], [{ provider: "moonshot", name: "Kimi 主力", model: "kimi-k2.5" }])
      .map((item) => item.id)).toEqual(["custom", "deepseek", "moonshot"]);
  });

  it("searches provider metadata and saved configuration names", () => {
    const items = mergeProviderMeta([], [
      { provider: "moonshot", name: "Kimi 主力", model: "kimi-k2.5" },
    ]);
    expect(filterProviderItems(items, "国际平台")).toEqual([]);
    expect(filterProviderItems(items, "KIMI 主力").map((item) => item.id)).toEqual(["moonshot"]);
    expect(filterProviderItems(addableProviderItems([]), "智谱").map((item) => item.id)).toEqual([
      "zhipu",
      "zai",
    ]);
    expect(filterProviderItems(addableProviderItems([]), "绘画").map((item) => item.id)).toEqual([
      "openai_image",
      "novelai_image",
    ]);
  });

  it("uses the Android-aligned connection defaults for every addable provider", () => {
    expect(addableProviderItems([]).map((item) => item.id)).toEqual([
      "zhipu",
      "zai",
      "moonshot",
      "openai_image",
      "novelai_image",
    ]);
    expect(blankConfigForProvider("deepseek")).toMatchObject({
      base_url: "https://api.deepseek.com",
      api_format: "responses",
    });
    expect(blankConfigForProvider("zhipu")).toMatchObject({
      base_url: "https://open.bigmodel.cn/api/paas/v4",
      api_format: "chat_completions",
    });
    expect(blankConfigForProvider("zai")).toMatchObject({
      base_url: "https://api.z.ai/api/paas/v4",
      api_format: "chat_completions",
    });
    expect(blankConfigForProvider("moonshot")).toMatchObject({
      base_url: "https://api.moonshot.cn/v1",
      api_format: "chat_completions",
    });
    expect(blankConfigForProvider("openai_image")).toMatchObject({
      base_url: "https://api.openai.com/v1",
      model: "gpt-image-2",
      enabled: false,
      image_settings: { width: 1024, height: 1536, quality: "auto", background: "auto" },
    });
    expect(blankConfigForProvider("novelai_image")).toMatchObject({
      base_url: "https://image.novelai.net",
      model: "nai-diffusion-4-5-full",
      enabled: false,
      image_settings: { width: 832, height: 1216, steps: 28, scale: 5, sampler: "k_euler_ancestral" },
    });
  });

  it("validates image parameters with the same provider boundaries as Android", () => {
    const openAi = blankConfigForProvider("openai_image");
    const novelAi = blankConfigForProvider("novelai_image");
    expect(imageSettingsError(openAi)).toBe("");
    expect(imageSettingsError(novelAi)).toBe("");
    expect(imageSettingsError({ ...openAi, image_settings: { ...openAi.image_settings, width: 1025 } }))
      .toBe("宽高都需要是 16 的倍数。");
    expect(imageSettingsError({ ...novelAi, image_settings: { ...novelAi.image_settings, steps: 51 } }))
      .toBe("步数需要在 1 到 50 之间。");
  });

  it.each([
    ["deepseek-v4-flash", "custom", "deepseek"],
    ["glm-4.5", "custom", "zhipu"],
    ["glm-4.5", "zai", "zai"],
    ["kimi-k2.5", "custom", "kimi"],
    ["moonshot-v1-128k", "custom", "moonshot"],
    ["gpt-4o", "custom", "openai"],
    ["o3", "custom", "openai"],
    ["claude-sonnet-4", "custom", "claude"],
    ["gemini-2.5-pro", "custom", "gemini"],
    ["grok-4", "custom", "grok"],
  ])("recognizes %s as the %s icon", (modelName, providerId, expected) => {
    expect(detectModelIconId(modelName, providerId)).toBe(expected);
  });

  it("falls back to the provider icon or a stable initial", () => {
    expect(detectModelIconId("unknown-model", "moonshot")).toBe("moonshot");
    expect(modelIdentityMeta("unknown-model", "private-gateway")).toMatchObject({
      id: "",
      initials: "U",
    });
  });
});
