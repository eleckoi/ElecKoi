import claudeIcon from "../../../assets/model-icons/claude.svg";
import customIcon from "../../../assets/model-icons/whale-maid-thinking.png";
import deepseekIcon from "../../../assets/model-icons/deepseek.svg";
import geminiIcon from "../../../assets/model-icons/gemini.svg";
import grokIcon from "../../../assets/model-icons/grok.svg";
import kimiIcon from "../../../assets/model-icons/kimi.svg";
import moonshotIcon from "../../../assets/model-icons/moonshot.svg";
import novelAiIcon from "../../../assets/model-icons/novelai.svg";
import openAiIcon from "../../../assets/model-icons/openai.svg";
import zaiIcon from "../../../assets/model-icons/zai.svg";
import zhipuIcon from "../../../assets/model-icons/zhipu.svg";

const modelIcons = {
  custom: { label: "自定义模型", icon: customIcon },
  deepseek: { label: "DeepSeek", icon: deepseekIcon },
  zhipu: { label: "智谱", icon: zhipuIcon },
  zai: { label: "Z.ai", icon: zaiIcon, monochrome: true },
  moonshot: { label: "月之暗面", icon: moonshotIcon, monochrome: true },
  kimi: { label: "Kimi", icon: kimiIcon, monochrome: true },
  openai: { label: "OpenAI", icon: openAiIcon, monochrome: true },
  novelai: { label: "NovelAI", icon: novelAiIcon, monochrome: true },
  claude: { label: "Claude", icon: claudeIcon },
  gemini: { label: "Gemini", icon: geminiIcon },
  grok: { label: "Grok", icon: grokIcon, monochrome: true },
};

const modelNameRules = [
  ["deepseek", /deepseek/i],
  ["zhipu", /(?:^|[-_.\s])(?:glm|chatglm|codegeex)(?:[-_.\s]|$)/i],
  ["kimi", /kimi/i],
  ["moonshot", /moonshot/i],
  ["novelai", /(?:novelai|nai[-_.\s]?diffusion)/i],
  ["claude", /(?:claude|anthropic)/i],
  ["gemini", /(?:gemini|gemma)/i],
  ["grok", /(?:grok|(?:^|[-_.\s])xai(?:[-_.\s]|$))/i],
  ["openai", /(?:openai|chatgpt|codex|(?:^|[-_.\s])gpt(?:[-_.\s]|$)|(?:^|[-_.\s])o[134](?:[-_.\s]|$))/i],
];

export function detectModelIconId(modelName, providerId = "") {
  const provider = normalizeProviderIconId(providerId);
  if (provider === "zhipu" || provider === "zai") return provider;
  const model = String(modelName || "").trim();
  const detected = modelNameRules.find(([, pattern]) => pattern.test(model))?.[0];
  if (detected) return detected;
  return modelIcons[provider] ? provider : "";
}

export function modelIdentityMeta(modelName, providerId = "") {
  const iconId = detectModelIconId(modelName, providerId);
  if (iconId) return { id: iconId, ...modelIcons[iconId] };
  const value = String(modelName || providerId || "AI").trim();
  const initials = value.match(/[\p{L}\p{N}]/u)?.[0]?.toLocaleUpperCase() || "AI";
  return { id: "", label: value || "模型", icon: "", initials };
}

function normalizeProviderIconId(providerId) {
  const id = String(providerId || "").trim().toLocaleLowerCase().replaceAll("-", "_");
  if (["zhipuai", "bigmodel", "glm", "chatglm"].includes(id)) return "zhipu";
  if (id === "z_ai") return "zai";
  if (id === "moonshotai") return "moonshot";
  if (["novelai", "nai", "novelai_image"].includes(id)) return "novelai";
  if (["openai_image", "openai_images", "gpt_image"].includes(id)) return "openai";
  if (id === "anthropic") return "claude";
  if (id === "google") return "gemini";
  if (id === "xai") return "grok";
  return id;
}
