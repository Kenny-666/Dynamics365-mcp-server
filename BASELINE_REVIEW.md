# 实施基线检查

检查日期：2026-10-25。来源为用户提供的 ZIP 源码与可读 TGZ 发布包；未连接 CRM。

本文保留修改前的基线发现和当时验证结果。2026-10-26 起的修复及验证见 IMPLEMENTATION_PROGRESS.md，不以本文件的历史状态判断当前实现。

## 基线身份

| 内容 | ZIP 源码 | 可读 TGZ |
|---|---|---|
| 包名 | dynamics365-mcp-server | @local/d365-meta-mcp |
| 版本 | 1.0.0 | 0.1.0 |
| 工具数量 | 15（src/tool_handler.ts 静态注册表） | 22（dist/index.js 的 server.tool 注册） |
| 模块格式 | TypeScript ESM，另有 tsup CJS 构建 | 编译后的 CommonJS |
| 配置方式 | 环境变量 / dotenv | 初始化工具及配置文件 |
| 认证实现 | axios / axios-ntlm | axios / httpntlm |

两项目有 8 个相同工具名，但参数命名和返回格式不保证兼容。

## 工具对照

| 范围 | 工具 |
|---|---|
| 两者同名 | get_current_user_context、query_by_fetchxml、search_records_by_odata、get_record_by_id、create_new_record、update_existing_record、delete_record_by_id、call_d365_api_action |
| 仅源码中同名存在 | get_entity_metadata_summary、get_field_picklist_options、get_entity_navigation_links、preview_fetchxml_query、clear_server_cache、list_all_entity_definitions、get_detailed_field_metadata |
| 仅可读包中同名存在 | init_d365_metadata、query_metadata、list_entities、get_entity_attributes、get_attribute_optionset、search_web_resources_by_name、update_web_resource_and_publish、create_web_resource_and_publish、d365_plugin_registration_metadata、d365_plugin_steps_query、d365_plugin_step_register、d365_plugin_step_update、clear_runtime_config、get_runtime_config |

“仅存在”是工具名称对照，不代表没有可复用的相似服务功能。

## 已确认的代码发现

1. 两个项目均会隐式追加 statecode=0。通过字符串 includes 判断，不能准确区分过滤条件、字段选择、关联实体或字符串内容；也没有先判断目标表是否有该字段。
2. 源码 query_by_fetchxml 工具描述声称返回所有匹配记录，但实现只执行一次数据请求；数据查询没有自动翻页循环。
3. 源码 FetchXML 查询逻辑在 tool_handler.ts 和 services/fetchXml.ts 重复。
4. 源码 D365AuthService 使用全局 CacheService 与固定 d365_access_token 键；多身份或多实例共享进程时缺乏缓存隔离。
5. 源码构造 D365AuthService 时直接对组织 URL 调用 replace。没有配置时可能在 checkConfig 之前就因 undefined 抛错，影响离线工具发现和错误说明。
6. 源码 makeRequest 仅返回 response.data；必要的状态码和响应头没有形成统一返回接口，影响创建 ID、并发、限流和故障诊断。
7. 源码请求未显式设置超时；当前代码未提供有限重试/Retry-After 策略。
8. 源码 Action/Function 参数以字符串拼接，需完善引号转义、编码、复杂类型及绑定操作。
9. 源码 npm run build 输出 ESM dist/index.js；bin 启动 dist/index.cjs，依赖单独的发布构建。需验证并明确 npm 分发构建契约。
10. 可读 TGZ 的 Web 资源工具实际要求 filePath；其 README 描述 content/contentEncoding。文档与程序存在偏差。
11. 可读 TGZ 包含 actionService/ribbonService 等内部文件，但入口未注册相应专用工具。内部文件存在不能证明已对 MCP 客户端开放。
12. 源码调试 HTTP 服务默认监听地址未限制，工具调用入口没有认证，静态资源路径也缺少显式边界校验；投入使用前应作为调试器完善项处理。当前没有启动此服务。
13. 已通过构建确认：build:release 设置 clean=true，会清理 tsc 输出，仅保留 dist/index.cjs；此时 package.json 的 main 和 start 仍指向不存在的 dist/index.js。npm dry-run 包包含 CJS 入口但不包含所声明的 main。下一步统一构建和分发契约。

## 原包校验值（SHA-256）

- local-d365-meta-mcp-0.1.0.tgz：EE3E5658CD8C84DD4189A14C6DD138C57D66B32C8D357064E5934A68DCD013A3
- local-d365-meta-mcp-0.1.0.tgz.gtar：7EC2B521F312AF0164DF547FFC70CD9DAC22B8577A67C599E246DC5B7588A3B4

## 验证状态

- 已解压源码并完成静态检查。
- Node.js 可用：v24.22.1；pnpm 可用：11.25.0。
- PATH 中无独立 npm 命令；dotnet --list-sdks 未列出已安装 SDK。引入 .NET 项目前需准备相应开发工具。
- 普通执行环境下载依赖遇到 DNS ENOTFOUND；在获准联网的执行环境重试成功。通过临时 npm 10.9.9 执行 ci，遵循原 package-lock，安装时关闭 lifecycle scripts、audit、fund，未修改项目依赖声明或锁文件。
- TypeScript 编译通过；tsup 单文件构建通过。
- ESM dist/index.js 在 TypeScript 构建后通过 MCP initialize / tools/list；CJS dist/index.cjs 和 bin 入口在发布构建后均通过同一验证，各返回 15 个工具。
- 离线握手使用 .invalid 组织地址及占位凭据，只进行 MCP 协议握手和工具枚举，不发送 CRM 工具调用；不能据此认定 CRM 功能联调通过。
- npm pack --dry-run 成功，未生成新发布包；发布入口失配如上，需修复后再交付版本。
- 当前仅新增计划和基线报告，业务源码尚未修改。原始三个压缩包保留。
