# Cognitive-Fatigue-Detection-AI-Agent

## Focus Lab · V1 数据收集 Web App

用于认知疲劳研究探索的 Web 原型，**不是医学诊断工具，也不提供疲劳预测分数**。这一版重点是建立可分析的数据采集管道，暂不训练机器学习模型。

- [公开测试网页](https://focus-lab-cognitive-v1.sassyhen16.chatgpt.site)
- [私密研究者后台](https://focus-lab-cognitive-v1.sassyhen16.chatgpt.site/research)：仅授权研究者账号可查看、导出和删除结果。

### 已实现

- 本地采集知情同意与摄像头权限；MediaPipe 面部/眼部模型与视频帧在浏览器端处理。
- 眨眼、闭眼时长、头部运动、未经视线校准的虹膜位置波动代理特征；约 10 Hz 数值采样。
- Go / No-Go 注意力任务，记录反应时间、正确率、遗漏、误按和无效试次。
- 测试前后 1–10 疲劳自评、匿名浏览器 ID、会话 UUID、时间戳。
- IndexedDB 本地保存，JSON / CSV 导出及会话仪表盘。
- 单独上传同意（默认不勾选），服务器确认回执、手动重试、会话去重和云端撤回凭证。
- Sites 平台登录、服务器端研究者授权、D1 存储与分页导出。
- 真实摄像头、模拟视觉和仅任务三种模式；模拟特征始终明确标记。

### 隐私边界

摄像头画面不录制、不保存、不上传。不会把已有本地会话自动迁移到云端。只有新会话完成后另行勾选同意并保存，才上传匿名 ID、时间戳、自评、任务表现和数值视觉特征。服务端采用字段白名单，不存储视频、照片、原始面部点位、浏览器信息或自由文本事件。

匿名 ID 可关联同一浏览器的会话，因此是可关联的研究标识，不保证绝对匿名。平台可能处理连接日志。上传记录保留到参与者或研究者删除；删除不能自动撤回已导出的文件。本仓库不包含参与者记录、开发数据库、截图、视频或生产密钥。

### 本地运行

需要 Node.js ≥ 22.13.0（本版使用 Node.js 24 验证）。

```sh
npm run install:ci
npm run build
```

创建不提交到 Git 的 `.dev.vars`，用于本地开发：

```text
RESEARCHER_EMAIL="seedy@sites.test"
RATE_HASH_KEY="choose-a-development-only-random-value"
```

初始化**本地**数据库，再启动预览：

```sh
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_cool_groot.sql
npm run dev -- --hostname 127.0.0.1
```

打开 `http://127.0.0.1:5173/collection/index.html`。本地平台模拟登录使用 `seedy@sites.test`，不属于生产认证。线上登录由 Sites 提供，生产 `RESEARCHER_EMAIL` 和 `RATE_HASH_KEY` 仅保存在托管平台，不写入源码。仅静态 GitHub Pages 无法运行这个版本的私密后台和 D1 API；GitHub 在这里托管源码，线上应用由 Sites 运行。

摄像头需要 HTTPS 或 localhost，并需要浏览器与操作系统许可。Safari 的真实摄像头硬件仍须实际设备验证，模拟模式不能证明硬件或疲劳识别有效。

### 测试

```sh
node --test tests/research.test.mjs
npx tsc --noEmit
npm run build
# 在上述本地预览启动后运行；不要对生产网站执行集成测试
node tests/integration.mjs
```

已通过：5 项数据校验测试、类型检查、生产构建、本地同意门控/授权/去重/导出/撤回/重放拦截验证，以及浏览器 30 秒模拟视觉流程。原始本地 MVP 的 12 项核心/摄像头接口测试亦通过。线上页面、模型与 WASM 可访问；未登录导出被拒绝，后台跳转平台登录，上传许可配置正常。没有声称验证真人摄像头、线上所有者登录或医学有效性。

### 项目结构与后续 ML

`public/collection/` 为浏览器采集与可视化；`app/api/` 为上传和保护接口；`app/research/` 为私密后台；`db/` 和 `drizzle/` 为数据库结构及迁移；`lib/research-data.mjs` 为上传白名单与来源检查。

模型训练可从导出的 JSON / CSV 接入。先排除模拟视觉，保留缺失值与质量标记，按参与者 ID 而非帧/试次划分训练与验证集，并建立可靠标签与独立评估。不能把眨眼变化或自评直接当成医学诊断。

详见 [研究数据与部署说明](RESEARCH.md)、[框架与本地 D1 说明](docs/STARTER.md)。第三方模型/依赖许可保留在 `public/collection/vendor/`、`vendor/` 和 `build/` 对应许可文件中。
