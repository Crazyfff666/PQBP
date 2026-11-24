# 考试习题平台

多题库在线练习平台，支持 **D建模拟题**、**投资类业务模拟题**、**CCSA 标准化人员资格考试**、**电力交易员考试** 四大题库。纯静态站点，零依赖、零构建，可直接部署至 Cloudflare Pages。

## 功能

| 模块 | 说明 |
| --- | --- |
| 用户登录 | 本地账号注册 / 登录，密码经 SHA-256 加盐哈希后存储，多用户数据互相隔离 |
| 多题库切换 | 4 个独立题库，各题库学习进度、错题库、收藏互不干扰 |
| 题型支持 | 单选 / 多选 / 判断 / 简答（简答题含参考答案展示，不自动判分） |
| 练习模式 | 顺序练习、乱序练习、随机 20 题、只练没做过的、收藏题目、分类练习；即时判卷 |
| 模拟考试 | 自定义题量（20/30/50/100）、出题范围、限时（10–60 分钟）；交卷后统一评分 |
| 错题库 | 答错自动收录，记录错误次数与最近错误时间；支持按分类筛选、单题重做、全部重练、手动移出 |
| 错题重练 | 错误次数多的题目优先出现；本轮答对即自动移出错题库 |
| 数据备份 | 学习数据一键导出 / 导入 JSON（含题库标识），便于换设备迁移 |

其他细节：答题卡快速跳题、题目收藏、键盘快捷键（`1-6` / `A-F` 选择答案，`←` `→` 切题）、移动端自适应。

## 题库数据

| 题库 | 题量 | 题型构成 | 数据来源 |
| --- | --- | --- | --- |
| D建模拟题 | 100 | 单选 ×100 | 党建应知应会题库（2026年8月版）PDF 提取 |
| 投资类业务模拟题 | 410 | 单选 ×269 / 多选 ×62 / 判断 ×79 | 投资类业务考试题库 |
| CCSA 标准化人员资格考试 | 128 | 单选 ×71 / 多选 ×32 / 判断 ×20 / 简答 ×5 | CCSA 标准化考试题库 |
| 电力交易员考试 | 790 | 单选 ×350 / 多选 ×200 / 判断 ×240 | 电力交易员考试题库 |

**合计 1428 题。**

各题库数据以 `window.X_BANK` 全局变量形式嵌入页面，支持本地 `file://` 直接打开，无需构建。

## 目录结构

```
.
├── index.html              页面骨架（登录页 + 主应用）
├── assets/
│   ├── style.css           样式（含题库选择卡片、多选确认、简答输入等）
│   ├── store.js            本地数据层：账号、密码哈希、各题库进度/错题库（按题库隔离）
│   ├── quiz.js             多题库管理器 + 答题会话逻辑（支持单选/多选/判断/简答）
│   └── app.js              视图渲染与交互（题库选择 → 练习/考试/错题库/个人中心）
├── data/
│   ├── DJTK_BANK.js        D建模拟题数据（window.DJTK_BANK）
│   ├── TZTZ_BANK.js       投资类业务模拟题数据（window.TZTZ_BANK）
│   ├── CCSA_BANK.js        CCSA标准化题库数据（window.CCSA_BANK）
│   ├── DIANK_BANK.js       电力交易员题库数据（window.DIANK_BANK）
│   ├── DJTK_BANK.json      D建模拟题数据（标准 JSON）
│   ├── TZTZ_BANK.json      投资类业务模拟题数据（标准 JSON）
│   ├── CCSA_BANK.json      CCSA标准化题库数据（标准 JSON）
│   └── DIANK_BANK.json     电力交易员题库数据（标准 JSON）
├── build/
│   └── build_data.py       数据构建脚本：读取原始 JSON → 生成统一格式 JS + JSON
├── _headers                Cloudflare Pages 响应头配置
└── README.md
```

## 本地运行

任选其一：

```bash
# 方式一：直接双击 index.html（数据已内联为 JS，file:// 可正常运行）

# 方式二：起一个本地静态服务
python -m http.server 8080
# 浏览器访问 http://localhost:8080
```

## 部署到 Cloudflare Pages

1. 将本仓库推送到 GitHub。
2. 登录 Cloudflare Dashboard → **Workers & Pages** → **Create** → **Pages** → **Connect to Git**。
3. 选择本仓库，构建配置如下：

   | 配置项 | 值 |
   | --- | --- |
   | Framework preset | `None` |
   | Build command | *（留空）* |
   | Build output directory | `/` |

4. 点击 **Save and Deploy**。构建完成后即可通过 `https://<项目名>.pages.dev` 访问。
5. 后续推送到默认分支会自动触发重新部署。

> 本项目为纯静态站点，无需构建步骤，也不需要 Node 环境。

## 数据存储说明

账号与学习记录均保存在浏览器 `localStorage`，**不会上传到任何服务器**。因此：

- 同一浏览器内多账号数据互相隔离；
- 各题库学习进度、错题库、收藏按题库独立存储，互不干扰；
- 更换浏览器 / 设备、清理浏览器数据会导致记录丢失，请通过「个人中心 → 导出备份」定期备份；
- 密码采用随机盐 + SHA-256 哈希存储，不保存明文，但本地存储不具备服务端级别的安全强度，请勿使用与其他系统相同的重要密码。

## 题库数据更新

使用 `build/build_data.py` 脚本重新生成题库数据文件：

```bash
cd build
python build_data.py
# 读取原始 JSON → 生成 data/*.js + data/*.json
```

原始 JSON 来源：
- `_tmp_djtk/data/questions.json`（D建模拟题）
- `jinkai-quiz/site/data/questions.json`（投资类业务模拟题）
- `jinkai-quiz/site/data/ccsa_questions.json`（CCSA 标准化）
- `_tmp_shuati/docs/questions.json`（电力交易员）

> 重新生成后需同时更新 `data/*.js` 和 `data/*.json`，`_headers` 中 `data/*` 已设为 `no-cache`，部署后无需手动清缓存。

## 许可

题库内容版权归原编制单位所有，本仓库代码仅用于内部学习培训用途。
