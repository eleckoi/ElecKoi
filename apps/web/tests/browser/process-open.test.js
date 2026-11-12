import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile, copyFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { isAbsolute, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { expect, it } from "vitest";
import { browserThemeCss } from "../helpers/browserTheme.js";
const require = createRequire(import.meta.url), { build } = createRequire(require.resolve("vite/package.json"))("esbuild");
it("opens the phone process sheet from the real eye action without desktop blur or a delayed toolbar resize", async () => {
  const directory = await mkdtemp(resolve(tmpdir(), "eleckoi-process-open-"));
  try {
    await build({ entryPoints: ["apps/web/tests/browser/process-material.fixture.jsx"], outfile: resolve(directory, "fixture.js"), bundle: true, format: "iife", jsx: "automatic", alias: { "@shared": resolve("packages/shared/src") }, loader: { ".woff2": "file", ".woff": "file", ".ttf": "file", ".png": "file", ".svg": "dataurl" }, logLevel: "silent" });
    for (const [name, exposed] of [["chat", "ReasoningRow,ReasoningContent"], ["tool", "ToolRow"]]) {
      const source = await readFile(require.resolve(`@deepseek-ai/dsh-client-ui-${name}/client`), "utf8");
      if (source.split("return module.exports;").length !== 2) throw Error("Unexpected Client bundle boundary");
      await writeFile(resolve(directory, name + ".js"), source.replace("return module.exports;", `return {...module.exports,${exposed}};`));
    }
    const html = resolve(directory, "fixture.html"), report = resolve(directory, "report.json");
    await writeFile(html, `<!doctype html><html><head><meta charset="utf-8"><style>${browserThemeCss()}</style><link rel="stylesheet" href="fixture.css"></head><body><div id="root"></div><script src="fixture.js"><\/script><script src="chat.js"><\/script><script src="tool.js"><\/script></body></html>`);
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    let failure;
    try {
      await promisify(execFile)(require("electron"), [resolve("apps/web/tests/browser/process-open.probe.cjs"), html, report], { env, windowsHide: true, timeout: 35e3 });
    } catch (error) {
      failure = error;
    }
    const result = JSON.parse(await readFile(report, "utf8"));
    await mkdir(resolve("build/mobile-process-open-check"), { recursive: true });
    await copyFile(report, resolve("build/mobile-process-open-check/browser.json"));
    expect(result.passed, result.error || failure?.message).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.layouts).toHaveLength(2);
  } finally {
    const target = relative(tmpdir(), directory);
    if (!target || target.startsWith("..") || isAbsolute(target)) throw Error("Unexpected probe cleanup target");
    await rm(directory, { recursive: true, force: true, maxRetries: 3 });
  }
}, 45e3);
