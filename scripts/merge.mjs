#!/usr/bin/env node
/*
 * merge.mjs — B站影视灵感雷达 数据合并 / 回填脚本
 *
 * 职责（单一权威数据源 = data.json）：
 *   1. 读取并校验 data.json（结构、字段、id 唯一）。
 *   2. 把 data.json 机械回填进 index.html 的 DATA:START ~ DATA:END 区块，
 *      只替换该区块，页面其余 HTML/CSS/JS 不变，且保持单文件自包含（无外部 src）。
 *
 * 典型用法：
 *   - 校验并回填：      node scripts/merge.mjs
 *   - 追加一天扫描：    node scripts/merge.mjs --append path/to/day.json
 *       day.json 形如：{ "scan": {...meta.scans 单条...}, "works": [ ...当天作品条目... ] }
 *       脚本会把 scan 追加进 meta.scans、works 追加进 works（并做 id 去重校验），
 *       更新 meta.generated，然后回填 index.html。
 *
 * 设计原则：幂等、可无人值守、失败即报错退出（非 0），不静默吞错。
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const DATA_PATH = resolve(ROOT, "data.json");
const HTML_PATH = resolve(ROOT, "index.html");

const START = "/* ==== DATA:START (auto-generated, do not edit by hand; run scripts/merge.mjs) ==== */";
const END = "/* ==== DATA:END ==== */";

const REQ_WORK = ["id", "name", "type", "scanDate", "confidence", "theme", "signal", "contentSignal", "discuss", "inspire", "action", "videos"];
const REQ_VIDEO = ["bv", "up", "pub", "title", "view", "like", "fav", "coin", "reply", "danmaku", "share"];
const CONF = new Set(["high", "medium", "low"]);
// release 允许 null 或 YYYY / YYYY-MM / YYYY-MM-DD
const RELEASE_RE = /^\d{4}(-\d{2}(-\d{2})?)?$/;
const OTHER_GROUP = "其他";

function die(msg) {
  console.error("✗ " + msg);
  process.exit(1);
}

function readJSON(p) {
  if (!existsSync(p)) die(`找不到文件：${p}`);
  try {
    return JSON.parse(readFileSync(p, "utf8"));
  } catch (e) {
    die(`JSON 解析失败 ${p}: ${e.message}`);
  }
}

function validate(data) {
  if (!data || typeof data !== "object") die("data.json 根节点必须是对象");
  if (!data.meta || typeof data.meta !== "object") die("缺少 meta 对象");
  if (!Array.isArray(data.meta.scans)) die("meta.scans 必须是数组");
  if (!Array.isArray(data.works)) die("works 必须是数组");

  const ids = new Set();
  data.works.forEach((w, i) => {
    for (const k of REQ_WORK) {
      if (!(k in w)) die(`works[${i}] (${w.id || "?"}) 缺少字段 ${k}`);
    }
    if (ids.has(w.id)) die(`works 中 id 重复：${w.id}（同名作品跨天应使用不同 id）`);
    ids.add(w.id);
    if (!CONF.has(w.confidence)) die(`works[${i}] confidence 非法：${w.confidence}（须为 high/medium/low）`);
    // release 可缺省/为 null；若有值须匹配 YYYY[-MM[-DD]]
    if (w.release != null && !RELEASE_RE.test(String(w.release))) {
      die(`works[${i}] (${w.id}) release 格式非法：${w.release}（须为 null 或 YYYY / YYYY-MM / YYYY-MM-DD）`);
    }
    if (!Array.isArray(w.inspire)) die(`works[${i}] inspire 必须是数组`);
    if (!Array.isArray(w.videos)) die(`works[${i}] videos 必须是数组`);
    w.videos.forEach((v, j) => {
      for (const k of REQ_VIDEO) {
        if (!(k in v)) die(`works[${i}].videos[${j}] 缺少字段 ${k}`);
      }
    });
  });
  return data;
}

// 依据 meta.themeGroups 映射，为每个 work 补 themeGroup。
// 已有 themeGroup 的保留；未命中映射的细线归入"其他"并收集提示。
// 返回未命中映射的细线列表（供调用方提示用户扩充映射）。
function applyThemeGroups(data) {
  const map = (data.meta && data.meta.themeGroups) || {};
  const order = (data.meta && data.meta.themeGroupOrder) || [];
  const unmapped = new Map(); // theme -> [work names]
  data.works.forEach((w) => {
    if (w.themeGroup) return; // 已归类的不动（保持历史稳定）
    const g = map[w.theme];
    if (g) {
      w.themeGroup = g;
    } else {
      w.themeGroup = OTHER_GROUP;
      if (!unmapped.has(w.theme)) unmapped.set(w.theme, []);
      unmapped.get(w.theme).push(w.name);
    }
  });
  // 保证"其他"在桶顺序里存在
  if (order.length && !order.includes(OTHER_GROUP)) order.push(OTHER_GROUP);
  return unmapped;
}

function backfill(data) {
  if (!existsSync(HTML_PATH)) die(`找不到 index.html：${HTML_PATH}`);
  let html = readFileSync(HTML_PATH, "utf8");
  const s = html.indexOf(START);
  const e = html.indexOf(END);
  if (s === -1 || e === -1 || e < s) {
    die("index.html 中找不到 DATA:START / DATA:END 标记，无法安全回填");
  }
  const block = `${START}\nconst DATA = ${JSON.stringify(data, null, 2)};\n${END}`;
  const next = html.slice(0, s) + block + html.slice(e + END.length);

  // 单文件自包含校验：不得引入外部脚本 src
  if (/<script[^>]+\bsrc=/.test(next)) {
    die("回填后检测到外部 <script src>，违反单文件自包含约束");
  }
  // const DATA 只应出现一次
  const cnt = (next.match(/const DATA =/g) || []).length;
  if (cnt !== 1) die(`回填后 "const DATA =" 出现 ${cnt} 次，应恰好 1 次`);

  writeFileSync(HTML_PATH, next, "utf8");
}

function warnUnmapped(unmapped) {
  if (!unmapped || unmapped.size === 0) return;
  console.log("\n⚠ 出现未在 meta.themeGroups 中登记的新题材线（已暂归“其他”）：");
  for (const [theme, names] of unmapped) {
    console.log(`  · ${theme}  ← ${names.join("、")}`);
  }
  console.log("  建议：在 data.json 的 meta.themeGroups 里为这些细线指定所属大类，然后重跑 node scripts/merge.mjs。");
}

function main() {
  const args = process.argv.slice(2);
  let data = readJSON(DATA_PATH);

  const ai = args.indexOf("--append");
  if (ai !== -1) {
    const dayPath = args[ai + 1];
    if (!dayPath) die("--append 需要跟一个当天数据文件路径");
    const day = readJSON(resolve(process.cwd(), dayPath));
    if (day.scan) data.meta.scans.push(day.scan);
    if (Array.isArray(day.works)) data.works.push(...day.works);
    if (day.generated) data.meta.generated = day.generated;
    else data.meta.generated = new Date().toISOString().slice(0, 10);
    // 追加后先补题材大类，再校验、写回 data.json
    const unmapped = applyThemeGroups(data);
    validate(data);
    writeFileSync(DATA_PATH, JSON.stringify(data, null, 2) + "\n", "utf8");
    console.log(`✓ 已追加 ${Array.isArray(day.works) ? day.works.length : 0} 个作品到 data.json`);
    warnUnmapped(unmapped);
  } else {
    const unmapped = applyThemeGroups(data);
    validate(data);
    // 校验/回填模式也把可能新补的 themeGroup 写回 data.json，保持两处一致
    writeFileSync(DATA_PATH, JSON.stringify(data, null, 2) + "\n", "utf8");
    warnUnmapped(unmapped);
  }

  backfill(data);
  // 大类数量守护：超过 10 桶时提示（10 = 9 大类 + 其他）
  const groups = new Set(data.works.map((w) => w.themeGroup).filter(Boolean));
  console.log(`✓ 校验通过：${data.works.length} 个作品 / ${data.meta.scans.length} 次扫描 / ${groups.size} 个题材大类`);
  if (groups.size > 10) {
    console.log(`⚠ 题材大类已达 ${groups.size} 个（>10），建议在 data.json 的 meta.themeGroups 里把新线并入已有大类。`);
  }
  console.log(`✓ 已回填 index.html（DATA:START ~ DATA:END）`);
}

main();
