# B站影视灵感雷达 · 三日汇总

一个单文件、自包含的可视化仪表盘，用于浏览与筛选「B站影视灵感雷达」每日扫描沉淀下来的候选作品与视频信号。

> 在线访问：**https://archili2035.github.io/film_radar/**

## 这是什么

「B站影视灵感雷达」按低成本口径，定期用 B 站搜索接口（WBI 签名）扫描影视/动画相关热度视频，落在延迟窗口内做去重、初筛，并对热度靠前的样本读取详情，形成每日日报。本仓库把多天日报聚合成**一个页面**，方便一次性浏览、检索与横向比较，而不必逐天翻看。

数据源为分天扫描，但页面里做统一聚合展示；每个条目都标注了它来自哪一次扫描（`scanDate`）。

## 页面功能

- **以作品为主行**：每张卡片是一个作品，卡片内折叠展示相关视频子列表（BV号 / UP主 / 发布时间 / 播放 / 点赞 / 收藏 / 投币 / 评论 / 弹幕 / 分享）。
- **全文搜索**：作品名、UP主、视频标题、BV号、灵感关键词。
- **多维排序**：播放量、互动量、点赞、收藏、投币、内容信号、扫描日期、名称。
- **多维筛选**：按扫描日期 / 题材线 / 置信度。
- **低置信/噪声样本**：纳入但打标签，默认可通过开关隐藏。

## 文件结构

```
.
├── index.html      # 仪表盘本体（数据在 DATA:START ~ DATA:END 之间内嵌，无外部依赖）
├── data.json       # 权威数据源（人类可读，增量更新以它为准）
├── scripts/
│   └── merge.mjs   # 校验 data.json 并机械回填 index.html 的合并脚本
├── daily/          # 每日扫描原始 Markdown 日报留档
├── 需求说明.md      # 原始需求与确认口径
└── README.md
```

`index.html` 是完全自包含的：数据直接内嵌为 `const DATA`，不请求外部脚本或接口，直接双击或经 GitHub Pages 打开即可运行。`data.json` 是同一份数据的独立副本，作为可维护、可复用的数据源留存。

## 数据结构（data.json）

```jsonc
{
  "meta": {
    "title": "B站影视灵感雷达",
    "generated": "2026-07-02",
    "scans": [
      // 每一次扫描的元信息
      { "date": "2026-07-02", "exec": "...", "window": "...",
        "raw": 780, "dedup": 687, "prefilter": 557, "detail": 110, "keywords": 30 }
    ],
    "note": "热度信号为扫描时公开统计，会持续变化。"
  },
  "works": [
    {
      "id": "w-xxx",              // 唯一 id（同一作品跨天可拆分为多条）
      "name": "作品名",
      "type": "类型（韩剧/电影/动画…）",
      "scanDate": "2026-06-30",   // 该条目来自哪次扫描
      "confidence": "high | medium | low",
      "theme": "题材线（用于筛选分组）",
      "signal": "B站信号简述",
      "contentSignal": "内容信号强弱",
      "discuss": "主要讨论点",
      "inspire": ["可迁移灵感方向…"],
      "action": "后续动作建议",
      "videos": [
        { "bv": "BVxxxx", "up": "UP主", "pub": "发布时间",
          "title": "视频标题",
          "view": 0, "like": 0, "fav": 0, "coin": 0,
          "reply": 0, "danmaku": 0, "share": 0 }
      ]
    }
  ]
}
```

字段说明：

- **confidence（置信度）**：`high` 信号明确、`medium` 有一定信号、`low` 低置信/噪声样本（默认隐藏）。
- **theme（题材线）**：对作品做的题材归组，用于页面筛选，例如「爽剧漫改退隐强者」「网络怪谈电影化/阈限空间」等。
- **同一作品跨天出现**：会拆成多个条目（不同 `id` + `scanDate`），以保留「按扫描时间标注」的原始信息，不做跨天合并。
- **热度数值**：为扫描当时的公开统计快照，会随时间变化；B站热度不等同作品质量或参考优先级。

## 如何更新（推荐用合并脚本）

`data.json` 是唯一权威数据源，`index.html` 里的 `const DATA` 由脚本机械回填，**不要手工编辑 index.html 里的数据**。

**方式 A —— 用当天数据文件追加（推荐）**

把当天扫描结果整理成一个 `day.json`：

```jsonc
{
  "generated": "2026-07-03",              // 可选，缺省用当天日期
  "scan": { "date": "2026-07-03", ... },  // 追加到 meta.scans 的单条扫描元信息
  "works": [ { ...作品条目... } ]           // 追加到 works 的当天条目
}
```

然后运行：

```bash
node scripts/merge.mjs --append day.json
```

脚本会：校验字段与 id 唯一性 → 追加进 `data.json` → 更新 `meta.generated` → 回填 `index.html`（只替换 `DATA:START ~ DATA:END` 区块）→ 校验单文件自包含。任一步失败会非 0 退出并打印原因。

**方式 B —— 手工改 data.json 后回填**

直接编辑 `data.json`（追加 `works` / `meta.scans`），再运行 `node scripts/merge.mjs`（不带参数，只校验+回填）。

**提交**

```bash
git add data.json index.html daily/
git commit -m "扫描 YYYY-MM-DD：合并 N 个作品到雷达页面"
git push origin main
```

GitHub Pages 会自动重新构建。

## 说明

- 本页面仅做信号汇总与浏览，不代表内容评价或参考优先级判断。
- 数据来源于 B 站公开搜索接口的扫描快照，仅用于灵感检索目的。
