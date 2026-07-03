// 一次性数据补全脚本：为已有 data.json 的每个 work 写入 release（上映/首播年）与 themeGroup（题材大类）。
// release 依据权威渠道（豆瓣/维基/TMDB/百度百科）核对，取"首个正式发行年"。非单一作品条目 release=null。
// 之后的日常增量由 merge.mjs 依据 meta.themeGroups 映射自动补 themeGroup。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const dataPath = path.join(ROOT, 'data.json');
const d = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

// —— 题材大类映射（细 theme -> 粗 themeGroup），控制在 ≤10 桶（9 大类 + 其他）——
const THEME_GROUPS = {
  '经典片再问题化': '经典片再解读',
  '经典电影拉片与家庭关系压力': '经典片再解读',
  '高分电影长尾留档': '经典片再解读',
  '经典港片再包装': '港片再包装',
  'IP改编与粉丝文化': 'IP·粉丝文化',
  '长线 IP 前史压缩': 'IP·粉丝文化',
  '老 IP 结局解析': 'IP·粉丝文化',
  '网络/海外动画解析': '动画叙事',
  '长线动画角色再解释': '动画叙事',
  '类型剧任务结构与情绪犯罪': '类型剧·犯罪情绪',
  '真实案件与现实主义悬疑': '类型剧·犯罪情绪',
  '爽剧漫改退隐强者': '爽剧漫改',
  '网络怪谈电影化/阈限空间': '怪谈·恐怖·阈限',
  '民俗恐怖与阈限空间': '怪谈·恐怖·阈限',
  '冷门恐怖片与仪式符号': '怪谈·恐怖·阈限',
  '片段化标题钩子': '二创·传播钩子',
  '名场面二创传播': '二创·传播钩子',
  '古典 IP 二创': '二创·传播钩子',
  '创作方法论视频': '创作方法论',
  '动画叙事分析': '动画叙事',
};
const GROUP_ORDER = ['经典片再解读','港片再包装','IP·粉丝文化','动画叙事','类型剧·犯罪情绪','爽剧漫改','怪谈·恐怖·阈限','二创·传播钩子','创作方法论','其他'];

// —— 上映/首播年份表（按 work id）。值为 YYYY 字符串或 null（非单一作品/无发行年）——
// 依据：豆瓣/维基/TMDB/百度百科核对，取首个正式发行年。
const RELEASE = {
  'w-xuexi': '2025',            // 学习小组(Study Group) TVING 2025-01-23 首播
  'w-jinteweu': '2026',        // 金特务:本色回归 SBS/Netflix 2026-06-26
  'w-charlotte': '2006',       // 夏洛特的网(Charlotte's Web) 2006
  'w-kungfu': '2004',          // 功夫(周星驰) 2004
  'w-qinsong': '1996',         // 秦颂 1996
  'w-invisible': '2016',       // 看不见的客人 2016(西班牙)
  'w-supergirl': '1984',       // 超级少女(Supergirl) 1984
  'w-beiqing': '1989',         // 悲情城市 1989(金狮奖)
  'w-qimiao': '2026',          // 世界奇妙物语 26夏季SP 2026-06-27
  'w-justice': '2017',         // 正义联盟 2017(粉丝修复指扎克施奈德版 2021,原片 2017)
  'w-spider4': null,           // 蜘蛛侠4 未上映/未定档,暂 null
  'w-backrooms-0630': null,    // 后室/Backrooms IP(概念,非单一影片) null
  'w-sheep': '2026',           // 绵羊侦探团 2026-05
  'w-martyrs': '2008',         // 殉道者(Martyrs) 2008
  'w-fengsheng': '2009',       // 风声(此条为剧版拉片,原电影 2009;剧版首播 2020) -> 取原作 2009? 见下 note
  'w-xuanya': '2021',          // 悬崖之上 2021
  'w-magic-circus': '2023',    // 神奇数字马戏团(TADC) 2023 首集
  'w-jiangshi': '2013',        // 僵尸(麦浚龙) 2013
  'w-jiangshi-zhizun': '1991', // 僵尸至尊(暂性,详见 note,若指九叔系列另定) 
  'w-kotonoha': '2013',        // 言叶之庭 2013
  'w-dami': '1996',            // 大内密探零零发 1996
  'w-dongcheng': '1993',       // 射雕英雄传之东成西就 1993
  'w-taxi': '2021',            // 模范出租车 2021 首播
  'w-chaoshi': null,           // 潮湿的怒火 存疑,暂 null 待补
  'w-hazbin': '2024',          // 地狱客栈(Hazbin Hotel)正剧 2024(试播集 2019,正剧 2024)
  'w-doraemon': '1979',        // 哆啦A梦(大山版TV动画)1979(长青IP,取动画开播年)
  'w-backrooms-0702': null,    // 后室(同为 IP 概念) null
  'w-tianzhuding': '2013',     // 天注定 2013
  'w-rezero': '2016',          // 从零开始的异世界生活 2016 首播
  'w-longmen': '2020',         // 龙门相 FIRST 首映 2020
  'w-danshen': '2014',         // 单身度假村(实为 单亲度假村 Blended)2014
  'w-tiancai': null,           // 天才游戏 存疑,暂 null 待补
  'w-baiwan': '1954',          // 百万英镑(The Million Pound Note)1954
  'w-elementary': '2012',      // 基本演绎法(Elementary)2012 首播
  'w-youluwuzhou-0703': '2026',// 幽旅巫咒(Hokum)2026
  'w-xzhanjing97-0703': '2024',// X战警97(X-Men '97)2024
  'w-baoshifuzi-0703': '1983', // 包氏父子 1983
  'w-guaiqishouge-0703': '2025',// 怪奇收割(Strange Harvest)正式上映 2025(首映 2024)
  'w-yanweidie-0703': '1996',  // 燕尾蝶 1996
  'w-pixarfanzhuan-0703': null,// 皮克斯反转反派叙事案例(方法论合集)null
  'w-leiaoaoteman-0703': '1974',// 雷欧奥特曼 1974
  'w-xiyoujihonghaier-0703': null, // 西游记红孩儿段落二创(二创合集)null
};

// note 字段：对存疑/需要用户复核的条目做标注
const RELEASE_NOTE = {
  'w-fengsheng': '此条为剧版《风声》拉片；电影《风声》2009，剧版 2020，release 暂取原作电影年 2009，可按你口径改为剧版年。',
  'w-jiangshi-zhizun': '《僵尸至尊》年份存疑（可能指向不同港产僵尸片），暂标 1991，建议复核。',
  'w-justice': '正义联盟原片 2017；视频讲的“影迷修复”多指 2021 扎克施奈德版，release 取原片年 2017。',
  'w-hazbin': '地狱客栈正剧 2024（试播集 2019）。',
  'w-doraemon': '长青 IP，取大山版 TV 动画开播年 1979 作代表。',
  'w-danshen': '数据里名为“单身度假村”，实为《单亲度假村》(Blended, 2014)，建议同时校正 name。',
};

let filled = 0, nulls = [], unmapped = [];
d.works.forEach(w => {
  // release
  if (Object.prototype.hasOwnProperty.call(RELEASE, w.id)) {
    w.release = RELEASE[w.id];
    if (w.release === null) nulls.push(w.id + ' / ' + w.name);
    else filled++;
  } else {
    w.release = null;
    nulls.push(w.id + ' / ' + w.name + '（未在年份表，置 null）');
  }
  if (RELEASE_NOTE[w.id]) w.releaseNote = RELEASE_NOTE[w.id];
  // themeGroup
  const g = THEME_GROUPS[w.theme];
  if (g) w.themeGroup = g;
  else { w.themeGroup = '其他'; unmapped.push(w.theme + ' <- ' + w.name); }
});

// 写映射与桶顺序进 meta，供 merge.mjs 复用
d.meta.themeGroups = THEME_GROUPS;
d.meta.themeGroupOrder = GROUP_ORDER;

fs.writeFileSync(dataPath, JSON.stringify(d, null, 2), 'utf8');

console.log('已写入 release，共有具体年份:', filled, ' / 置 null:', nulls.length);
console.log('\n--- release=null 的条目 ---');
nulls.forEach(x => console.log('  ' + x));
console.log('\n--- 未命中 themeGroup 映射（已归其他）---');
if (unmapped.length) unmapped.forEach(x => console.log('  ' + x)); else console.log('  （无）');
// 大类分布
const byG = {};
d.works.forEach(w => byG[w.themeGroup] = (byG[w.themeGroup] || 0) + 1);
console.log('\n--- themeGroup 分布 ---');
GROUP_ORDER.forEach(g => { if (byG[g]) console.log('  ' + byG[g] + '  ' + g); });
