# 本机使用说明

## 只看案例

运行 `./demo.ps1`，访问 `http://127.0.0.1:8788/`。环境：Docker Desktop Linux 容器模式、Node.js 24.11+ 与 PowerShell。首次下载镜像和构建较慢，无需模型、搜索密钥或 Python。

脚本只启动数据库、初始化、API 与网页。历史案例可在事件雷达查看；今日关注为空不代表案例缺失。`./demo.ps1 -Port 8789` 更换端口，不关闭其他服务。`engine/.env` 与 `runtime/` 只在本机创建，停止脚本保留数据。发布版使用独立 `game-event-radar-release` Compose 名称。

## 实际研究：显式付费入口

先启动，再编辑 `engine/.env`：

```dotenv
LLM_BASE_URL=https://api.deepseek.com/v1
LLM_API_KEY=
LLM_MODEL=deepseek-flash
RADAR_DEEPSEEK_SEARCH_ENABLED=true
DEEPSEEK_SEARCH_BASE_URL=https://api.deepseek.com/anthropic/v1
DEEPSEEK_SEARCH_MODEL=deepseek-flash
TAVILY_API_KEY=
FIRECRAWL_API_KEY=
```

接口能力和模型标识需按供应商当前账号核实；模板不是可用性保证。密钥仅写本地，不放入对话、截图或 Git。只读使用者明确配置的环境变量及 `.env`，不读取作者私人插件目录。

`./update-radar.ps1 -RunId study-001 -Publish` 显式开启这一轮的调用。DeepSeek 原生搜索优先；获得 URL 后普通 HTTP 读取，失败再 Tavily Extract、Firecrawl。Codex 的实际对话搜索结果可用 `-CodexSearchFile` 追加；无人值守 Docker 没有当前聊天搜索能力。

默认近 3 天、最多 30 条材料。模型调用无固定 8 次硬上限，但阶段修复有限，实际请求和 token 留回执；搜索/提取与 Firecrawl 配额独立。失败用同一 RunId 继续，不重置修复槽或预算；新研究使用新编号。

## 独立复评

自动发布是**待复评**，必须由实际对话完成第二位评分者：

1. 在 `engine` 运行 `node scripts/prepare-review.ts ../runs/study-001/research-input.json`，生成无评分的 `evidence-packets.json`。
2. 仅提供该证据包和五维标准。实际 Codex 先保存 `codex-blind-review.json`，再读取 DeepSeek 分数。不要用格式校验、空模板或另一次 DeepSeek 冒充。
3. 盲评文件放入本轮目录，执行校验和派生导入：

```powershell
cd engine
$root=(Resolve-Path ..).Path.Replace('\','/')
docker compose -f compose.radar.yml run --rm --no-deps -T -v "${root}/runs:/review-output" api node scripts/complete-review.ts /research/study-001/research-input.json /research/study-001/codex-blind-review.json /research/study-001/engine-mapping.json /review-output/study-001-reviewed
cd ..
./import-radar.ps1 -RunId study-001-reviewed
```

程序核对哈希、引用、评分者和完整覆盖；不能证明人真的盲评，使用者须遵守先评分后比较。原输入不覆盖，新结果保持事件映射。

## 每日更新（默认关闭）

配置密钥后显式执行 `./enable-daily-radar.ps1`，启用北京时间每日 08:00、近 3 天、最多 30 条材料。08:00 后首次启动可能补跑当天任务，会产生 API 用量；结果仍待实际 Codex 复评。

停止：在 `engine` 执行 `docker compose -f compose.radar.yml stop radar-scheduler`。普通启动脚本不会自动重新启动定时服务。

## 更换游戏

修改 `engine/industry/sources.json`、`topics.json`、分类及 `engine/modules/game-radar` 来源注册、查询和官方账号识别配置；站点文案位于 `engine/site/site.ts`。仅传 `-Game` 不足以适配新游戏，需核查来源并重新测试。

## 下游交接

事件页下载 JSON，或参考 `examples/*/handoff.json`。内容为事件、日期、来源、平台、已有内容 ID、评分结论、未知项与少量搜索词。它不是直接可执行的采集任务，不含详细策略，不自动抓评论。

MediaCrawler 按自身规则接收并配置采集。新数据库页面 ID 与历史交接 ID 不同是正常的；网页下载使用当前实际导入映射。网页资料不计入评论样本。
