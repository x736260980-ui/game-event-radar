# 游戏事件雷达：运行引擎

请从 [项目首页](../README.md) 与 [使用说明](../docs/usage.md) 开始。这里保留 AIHOT 的框架源码与内部 `@aihot/*` 包名，网站使用自己的名称与标识。

`modules/game-radar` 是游戏发现、证据、双评分与交接模块；`site` 与 `industry` 是默认站点及游戏配置。上游通用文档保留在 `docs`，其中服务器、推送、日报等能力不等于本项目已启用。

检查：Node.js 24.11+，`npm ci`、`npm run typecheck`、`npm run build -w @aihot/web`。数据库测试：`docker compose -f compose.radar.yml --profile test run --rm tests`。

保留 [MIT](LICENSE)、[版权与字体说明](NOTICE)。默认配置不启用付费调用或定时任务。
