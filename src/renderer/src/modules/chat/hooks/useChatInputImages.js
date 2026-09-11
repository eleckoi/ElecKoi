import { useEffect, useRef, useState } from "react";

const CHAT_IMAGE_LIMIT = 4;
const CHAT_IMAGE_BYTES_LIMIT = 20 * 1024 * 1024;
const CHAT_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);
const CHAT_IMAGE_EXTENSION_TYPES = new Map([
  ["png", "image/png"], ["jpg", "image/jpeg"], ["jpeg", "image/jpeg"],
  ["webp", "image/webp"], ["gif", "image/gif"],
]);

export function useChatInputImages({ modelConfig, isSending }) {
  const [inputImages, setInputImages] = useState([]);
  const inputImagesRef = useRef([]);
  const modelSupportsImages = Boolean(
    modelConfig?.model_options?.find((option) => option.id === modelConfig.model)?.supportsImageInput,
  );

  function replaceInputImages(next) {
    inputImagesRef.current = next;
    setInputImages(next);
  }

  function clearInputImages() {
    for (const image of inputImagesRef.current) URL.revokeObjectURL(image.previewUrl);
    replaceInputImages([]);
  }

  function addInputImages(files) {
    const candidates = [...(files || [])];
    if (!candidates.length) return;
    if (isSending) throw new Error("正在生成，暂时无法添加图片。");
    if (inputImagesRef.current.length + candidates.length > CHAT_IMAGE_LIMIT) {
      throw new Error(`每条消息最多添加 ${CHAT_IMAGE_LIMIT} 张图片。`);
    }
    const validated = candidates.map((file) => {
      const mediaType = resolveImageMediaType(file);
      if (!mediaType) throw new Error("仅支持 PNG、JPEG、WebP 和 GIF 图片。");
      if (!Number.isSafeInteger(file.size) || file.size <= 0) throw new Error("图片内容为空。");
      if (file.size > CHAT_IMAGE_BYTES_LIMIT) throw new Error("单张图片不能超过 20 MB。");
      return { file, mediaType };
    });
    const candidateBytes = validated.reduce((total, image) => total + image.file.size, 0);
    const currentBytes = inputImagesRef.current.reduce((total, image) => total + image.bytes, 0);
    if (currentBytes + candidateBytes > CHAT_IMAGE_BYTES_LIMIT) {
      throw new Error("每条消息的图片总计不能超过 20 MB。");
    }
    const admitted = validated.map(({ file, mediaType }) => ({
      localId: globalThis.crypto?.randomUUID?.() || `image-${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file,
      name: file.name || "图片",
      mediaType,
      bytes: file.size,
      previewUrl: URL.createObjectURL(file),
    }));
    replaceInputImages([...inputImagesRef.current, ...admitted]);
  }

  function removeInputImage(localId) {
    const removed = inputImagesRef.current.find((image) => image.localId === localId);
    if (removed) URL.revokeObjectURL(removed.previewUrl);
    replaceInputImages(inputImagesRef.current.filter((image) => image.localId !== localId));
  }

  useEffect(() => {
    inputImagesRef.current = inputImages;
  }, [inputImages]);

  useEffect(() => () => {
    for (const image of inputImagesRef.current) URL.revokeObjectURL(image.previewUrl);
  }, []);

  return { inputImages, inputImagesRef, modelSupportsImages, addInputImages, removeInputImage, clearInputImages };
}

export async function encodeImageDraft(image) {
  const bytes = new Uint8Array(await image.file.arrayBuffer());
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, Math.min(offset + 0x8000, bytes.length)));
  }
  return { mediaType: image.mediaType, data: btoa(binary), name: image.name };
}

function resolveImageMediaType(file) {
  const declared = String(file.type || "").toLowerCase();
  if (CHAT_IMAGE_TYPES.has(declared)) return declared;
  const extension = String(file.name || "").split(".").pop()?.toLowerCase();
  return CHAT_IMAGE_EXTENSION_TYPES.get(extension) || "";
}
