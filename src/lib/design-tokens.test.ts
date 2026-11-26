/// <reference types="node" />
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const SRC = path.join(process.cwd(), "src");

function tsxFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) return tsxFiles(file);
    return entry.name.endsWith(".tsx") ? [file] : [];
  });
}

const files = tsxFiles(SRC).map((file) => ({
  file: path.relative(SRC, file),
  source: readFileSync(file, "utf8"),
}));

describe("驾驶舱设计 token 约束", () => {
  it("字号使用 tailwind.config.js 中的命名字阶，不写任意 px", () => {
    const violations = files
      .filter(({ source }) => /text-\[\d+(?:\.\d+)?px\]/.test(source))
      .map(({ file }) => file);
    expect(violations).toEqual([]);
  });

  it("文字、背景和边框使用语义色，不写任意 hex", () => {
    const violations = files
      .filter(({ source }) => /(?:bg|text|border)-\[#[0-9a-fA-F]{3,8}\]/.test(source))
      .map(({ file }) => file);
    expect(violations).toEqual([]);
  });

  it("主驾驶舱使用语义表面与文字色；ProLanding 保留独立明暗主题", () => {
    const forbidden = [
      /bg-\[#070b12\]/, /bg-\[#0c1320\]/, /bg-\[#0a101c\]/,
      /text-slate-(?:100|200|300|400|500|600|700)\b/,
    ];
    const violations = files
      .filter(({ file }) => file !== "ProLanding.tsx")
      .flatMap(({ file, source }) =>
        forbidden.some((pattern) => pattern.test(source)) ? [file] : [],
      );
    expect(violations).toEqual([]);
  });
});
