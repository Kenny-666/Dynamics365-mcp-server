[English](TOOL_REFERENCE.md)

# 开发版本新增功能：工具、环境配置与变更日志

开发版本默认公开 129 个工具，另有 1 个需显式启用的顾问工具。通过 `D365_TOOLSETS` 选择 `query`、`data`、`config`、`deploy`、`diagnostics` 或需显式启用的 `consultant` 组；不设置或设为 `all` 时使用默认 CRM 工具集（仍不包含顾问模块）。MCP 工具调用可通过 `environment_profile` 选择隔离的命名配置；省略时使用进程默认配置。使用 `D365_PROFILE_<NAME>__<SETTING>` 定义配置项；配置和凭据绝不从其他配置继承。

| 工具 | 用途与安全边界 |
| --- | --- |
| `manage_consultant_project` | 需显式启用的本地工作区，支持资料、可编辑实施 DOCX、UAT XLSX、离线 HTML 原型及生成版本的比较和恢复。需要 `D365_CONSULTANT_DIR`；不连接 CRM。 |
| 用户与角色工具 | 预览受 ETag 保护的用户资料和状态更新、非托管角色创建/更新/删除及本地域用户创建；分配/移除直接角色并回读验证；检查直接角色权限掩码；通过 CSDL 验证的原生操作预览/添加/移除单项权限。不假定已计算有效权限或支持跨业务部门操作。 |
| 图表工具 | 列出、检查、预览、创建、更新和删除系统或个人图表。系统图表写入需要解决方案，并须单独发布表；更新和删除需要 ETag。 |
| Word 模板工具 | 列出、下载、预览、创建、更新和删除组织或个人 DOCX 模板；更新和删除需要 ETag。尚未验证 CRM 模板映射及文档生成。 |
| 备注附件工具 | 列出、下载、上传、批量下载标准 CRM 备注附件，并通过 ETag 保护批量删除。上传按顺序执行且有数量/大小限制；不重放失败或结果未知的操作。 |
| `resolve_model_name` | 解析精确的逻辑名、架构名、集合名或本地化标签；标签有歧义时返回候选项。可选 `entity_logical_name` 将解析限制为字段。 |
| `check_model_configuration` | 只读检查表单、必填字段和视图 XML。权限、默认值、脚本、规则、关联字段及别名会限制结论。 |
| `edit_sitemap_xml` | 根据结构化编辑生成本地 SiteMap XML 候选文件。使用 `set_localized_title` 与 `language_code` 编辑单个本地化标题；不保存到 CRM，也不发布。 |
| `plan_sitemap_publication` | 以只读方式汇总站点地图、直接关联应用、有界的必需依赖及各项发布预览；标识不完整的结果。 |
| `inspect_sitemap_applications` | 检查 SiteMap 的直接 AppModule 关联；不证明发布成功，也不构成完整依赖图。 |
| `publish_appmodule` | 使用 `expected_hash` 和 `allow_app_publish=true` 预览并提交 AppModule PublishXml；请求被接受不代表运行时或依赖已验证。 |
| `save_sitemap_with_journal` / `rollback_sitemap_journal` | 使用持久化修改前快照及 ETag，预览并有条件保存/恢复 SiteMap XML；均不发布。 |
| `update_record_with_journal` / `rollback_record_journal` | 预览并有条件更新/恢复简单标量字段；不包含绑定、创建或删除。 |
| `backup_customization` / `restore_customization_backup` | 备份并通过 ETag 保护恢复已保存/未发布的非托管 Web 资源、主表单及公共系统视图。表单/视图恢复需要解决方案；均不发布。 |
| `list_change_journal` / `get_change_journal` | 列出或检查当前 CRM 身份的安全日志摘要；不返回字段值或 XML。 |

将 `D365_JOURNAL_DIR` 设置为受操作系统权限保护的绝对目录。备份条目包含原始 CRM 值及 XML。`D365_AUDIT_WRITES=true` 还会记录写入类工具调用事件，但不存储参数或响应；预览调用也可能被记录。调用完成不代表写入完成，调用事件也不能回滚。这两个备份工具要求 CRM ETag 及经验证的写入后 ETag；回滚必须单独预览。结果未知时不会自动重试。

开发版本已通过 2026-11-02 的全量本地回归（1,033 项测试）及本地契约检查；真实 CRM 环境验收仍待完成。以下参考内容描述较早的 1.0.1 基线。

1.0.1 版本有 85 个工具。新增的 `publish_sitemap` 流程见[站点地图发布](SITEMAP_PUBLISHING.md)；下文已有工具说明仍然适用。

# 工具详细参考

本指南保留详细工具参数、预览行为、并发规则及保存/发布语义。步骤编号用于追溯实现历史。入门请参阅[英文 README](../README.md) 或[中文 README](../README.zh-CN.md)。当前工具名称及输入约束以 MCP tools/list 和 src/tools、src/tool_handler.ts 的实现为准。

这是面向 Microsoft Dataverse / Dynamics 365 的模型上下文协议（MCP）服务器实现，使 Cursor、Windsurf、Claude Desktop 等 AI 助手能够通过标准 MCP 协议直接与 Dynamics 365 环境交互。

## 🌟 核心功能

本项目提供用于元数据发现、记录操作及高级查询的完整工具集：

- **元数据管理**：
  - `get_entity_metadata_summary`：获取实体关键字段和业务摘要。
  - `list_all_entity_definitions`：列出系统中所有可用实体定义。
  - `get_detailed_field_metadata`：获取指定字段的完整属性元数据。
  - `get_field_picklist_options`：获取 OptionSet 元数据值映射。
  - `get_entity_navigation_links`：分析实体之间的关系和导航属性。

- **数据操作（CRUD）**：
  - `get_record_by_id`：按 GUID 获取单条记录。
  - `search_records_by_odata`：使用 OData 语法灵活搜索记录。
  - `create_new_record`：在 Dataverse 中创建记录。
  - `update_existing_record`：更新已有记录。
  - `delete_record_by_id`：按 GUID 删除记录。
  - `upsert_record_by_key`：通过活动备用键执行原生条件 PATCH。
  - `associate_records` / `disassociate_records`：管理经验证的查找或集合引用。
  - `execute_record_batch`：分块执行相互独立的原生变更集，且有数量限制。
  - `execute_record_transaction`：执行单个原生原子变更集。

- **Web 资源**：
  - `search_web_resources_by_name`：按名称查找资源；仅显式选择时返回源内容。
  - `create_web_resource_and_publish`：创建资源，支持只读预览及可选发布。
  - `update_web_resource_and_publish`：按 GUID 更新，支持可选 ETag 并发保护。
  - `publish_web_resource`：发布已保存资源，无须再次上传。

- **插件步骤**：
  - `d365_plugin_registration_metadata`：发现已注册类型、消息及消息筛选器。
  - `d365_plugin_steps_query`：查询步骤；默认排除安全配置。
  - `d365_plugin_step_register`：为已有插件类型注册步骤，带重复检测。
  - `d365_plugin_step_update`：修改步骤并保留/设置/清除其配置，带并发检查和分阶段证据。
  - `d365_plugin_images_query` / `d365_plugin_image_register` / `d365_plugin_image_update` / `d365_plugin_image_delete`：使用显式字段及预览检查管理原生前/后映像。
  - `d365_plugin_assemblies_query`：列出程序集元数据，不返回内容或凭据。
  - `d365_plugin_assembly_inspect`：通过可选的 .NET 读取器检查本地 DLL 的真实元数据。
  - `d365_plugin_assembly_update`：预览并更新兼容的已有程序集，随后回读验证二进制、标识和类型。

- **只读诊断、安全与审计**：
  - `get_diagnostic_settings`：检查当前组织/表的日志及审计开关。
  - `query_plugin_trace_logs` / `query_failed_system_jobs`：读取有界的执行证据。
  - `diagnose_plugin_failure`：关联跟踪、作业及当前步骤元数据，不臆测根因。
  - `query_security_principals` / `get_principal_security_context`：读取可见用户、团队和角色。
  - `get_record_access`：读取原生有效记录权限。
  - `get_record_audit_history` / `get_audit_details`：读取原生审计历史/详情，默认不输出字段值。

- **数据模型开发（步骤 6.1–6.7）**：
  - `get_model_definition`：读取完整表/基础列定义及预览指纹。
  - `create_model_table` / `create_model_column`：检查解决方案和发布者后创建原生架构，默认仅预览。
  - `update_model_labels`：合并本地化标签，保留获取到的完整定义。
  - `publish_model_table`：独立于保存操作发布一整张表。
  - `get_model_relationship` / `create_model_relationship`：检查和创建原生 1:N/查找或 N:N 关系。
  - `get_model_key` / `create_model_key`：检查和创建备用键定义，显式返回异步索引状态。
  - `update_model_column_settings` / `update_model_relationship`：通过完整定义 PUT 维护已审阅的现有列设置及关系菜单/级联配置。
  - `reactivate_model_key`：为 Failed 状态的备用键提交新索引作业，区分 Action 被接受与索引已就绪。
  - `get_model_choices` / `create_model_choices`：检查本地/全局选项，创建全局 Picklist 选项。
  - `change_model_choice_value` / `publish_model_choices`：通过原生操作插入/更新选项标签，单独发布全局选项。
  - `list_model_ui_components` / `get_model_ui_component`：检查原生已保存/未发布的表单和视图定义。
  - `edit_model_form` / `edit_model_view`：在受保护的保存/回读流程中，对字段、库、事件及视图列/排序执行有界的结构编辑。

- **高级查询与扩展**：
  - `get_environment_capabilities`：检查所配置环境的身份、服务器版本及功能表定义。
  - `query_by_fetchxml`：执行复杂 FetchXML，提供明确状态规则、原生分页及可恢复的有界结果。
  - `preview_fetchxml_query`：预览 FetchXML 查询结果以便调试。
  - `get_api_operation`：发现当前原生 Action/Function 的签名、绑定和声明输入类型。
  - `call_d365_api_action`：调用经元数据验证的 Action/Function，支持实体/集合绑定及编码后的参数别名。
  - `get_current_user_context`：获取当前连接用户及组织的上下文。

- **调试工具**：
  - **GUI 调试器**：内置现代 Web 界面，可动态生成表单并测试工具调用。

- **解决方案组件（步骤 7.2）**：
  - `list_solutions` / `list_solution_components`：检查解决方案标识及可见的成员/根范围。
  - `get_solution_component_dependencies`：读取原生必需、依赖或阻止删除的依赖记录。
  - `add_solution_component`：预览/添加已有组件到非托管解决方案，随后验证成员关系。

- **解决方案传输（步骤 7.3，初始范围）**：
  - `inspect_solution_package`：在不配置 CRM、不解压的情况下检查有界的本地 ZIP。
  - `export_solution`：预览/导出非托管源解决方案为托管或非托管 ZIP，写入新本地文件。
  - `import_solution_async`：预览/提交首次普通非托管导入，并返回跟踪回执。
  - `get_solution_import_status`：单次读取各项独立的原生作业状态及解决方案标识。

- **解决方案比较与验证（步骤 7.4，初始范围）**：
  - `get_solution_snapshot`：捕获可见成员及选定的可移植组件属性。
  - `compare_solution_snapshots`：在不配置 CRM 的情况下本地比较两个快照对象。
  - `verify_solution_deployment`：根据快照检查真实目标，可选附带独立的作业/日志观测。
  - `get_solution_import_log`：读取原生解决方案导入结果摘要；错误文本需显式启用。

- **经典 Ribbon 按钮（步骤 7.5，初始范围）**：
  - `get_ribbon_definition`：读取实体有效按钮、命令/规则引用及插入位置。
  - `inspect_ribbon_solution`：检查本地解决方案 ZIP 中一张表的 RibbonDiffXml。
  - `edit_ribbon_solution`：预览/编辑自定义按钮，检查其他内容得到保留后保存新本地 ZIP。

- **受控经典 Ribbon 部署（步骤 7.6，初始范围）**：
  - `import_ribbon_solution`：对照已有解决方案的最新导出审阅/重放本地候选更改，然后提交一次异步导入。
  - `publish_ribbon_solution`：确认导入完成后单独审阅/发布整张表，保留请求接受及回读证据。
  - `verify_ribbon_deployment`：读取修改后的定义，不重新导入或发布。

## 🚀 快速开始

### 1. 安装依赖

> [!IMPORTANT]
> **需要 Node.js 18 或更高版本**。项目使用现代 ESM 语法及 MCP SDK，不支持旧版本。

程序集 DLL 检查/更新还要求 MCP 服务器主机安装 **.NET 10 Runtime**。其他工具、仅列出程序集元数据及启动/工具发现只需 Node 即可运行。npm 包附带固定的元数据读取器，绝不执行被检查的 DLL。若 dotnet 不在 PATH 中，请通过 `D365_DOTNET_PATH` 指定其可执行文件。从源码构建读取器或运行 `npm pack` / `npm run build:release` 需要 .NET 10 SDK。`npm run build` 使用随附读取器重新构建 Node 包。全量测试需要 .NET 10 Runtime，使用预编译测试样本，无须连接目标 CRM。

```bash
node -v # Check version (>= 18)
npm install
```

### 2. 环境配置

常规使用**无须创建 `.env` 文件**。通常直接在 MCP 客户端（如 Cursor、Claude Desktop）的设置中配置这些参数。

服务器根据部署方式支持三种认证方法：

#### 方式 A：Dynamics 365 Online（默认）
- `TENANT_ID`：Azure AD 租户 ID。
- `CLIENT_ID`：应用程序（客户端）ID。
- `CLIENT_SECRET`：客户端密钥。
- `ENVIRONMENT_URL` 或 `ORG_URL`：`https://your-org.crm.dynamics.com`

#### 方式 B：本地部署 AD（NTLM）
- `AUTH_TYPE`：`op_ad`
- `ORG_URL`：内部 Dynamics 365 URL（如 `http://crm.local/org`）
- `AD_DOMAIN`：Active Directory 域
- `AD_USERNAME`：AD 用户名
- `AD_PASSWORD`：AD 密码

#### 方式 C：本地部署 IFD（ADFS）
- `AUTH_TYPE`：`op_ifd`
- `ORG_URL`：面向外部的 IFD URL（如 `https://org.domain.com`）
- `IFD_ADFS_URL`：ADFS 服务器 URL（如 `https://adfs.domain.com`）
- `IFD_CLIENT_ID`：ADFS OAuth 应用客户端 ID
- `IFD_USERNAME`：IFD 用户名
- `IFD_PASSWORD`：IFD 密码

**通用变量：**
- `API_VERSION`：Dataverse API 版本（默认 `v9.2`）。
- `CACHE_TTL`：缓存时长，单位为秒（可选）。

*（注：仅在执行 `npm run dev` 或 `npm run debug` 等本地开发任务时，才需要在根目录创建 `.env` 文件。）*

尚未提供 CRM 设置时，MCP 服务器也能启动并列出工具。CRM 服务在首次调用 CRM 工具时创建；配置不完整或无效会返回代码为 `D365_CONFIG_INVALID` 的 MCP 工具错误，以及需修正的配置项名称。读取工具列表和清理本地缓存不需要连接 CRM。在 MCP 客户端修改环境变量后，须重启服务器使配置生效。

`AUTH_TYPE` 接受 `online`、`op_ad` 或 `op_ifd`。`API_VERSION` 必须采用 `v9.1` 或 `v9.2` 之类的格式。Online 模式下同时提供 `ORG_URL` 和 `ENVIRONMENT_URL` 时，两者必须指向同一组织。`CACHE_TTL` 是非负整数秒数（默认 7200）；也接受别名 `CACHE_TTL_SECONDS`，但 `CACHE_TTL` 优先。IFD 目前支持上述配置的 `password` 授权方式。

请求默认超时为 30 秒（`REQUEST_TIMEOUT_MS`，范围 1–300000）。GET 的临时失败最多默认重试两次（`MAX_READ_RETRIES`，范围 0–5）。GET 收到 HTTP 401 时允许刷新一次令牌；HTTP 403 不刷新。应用层重试策略绝不自动重复写入，即使遇到 HTTP 401、限流或超时（NTLM 认证协商仍由其客户端处理）。写入超时或返回服务器错误时，错误会报告 `outcome: "unknown"`，调用方应先确认是否生效，再决定重试。

重试等待遵循 `Retry-After` 秒数或 HTTP 日期。等待时间超过 `MAX_RETRY_DELAY_MS`（默认 30000，范围 0–300000）时，将其返回调用方，而不会提前重试。没有有效响应头时，读取重试使用 250 ms、500 ms 退避。限制针对每个 HTTP 请求/尝试，而非整个多步骤业务任务。获取令牌不会自动重试。

CRM 工具错误可能包含 `code`、HTTP `status`、`platformCode`、`requestId`、`attempts`、`retryAfterMs`、`retryable` 和 `outcome`。已配置的密钥及当前 Bearer 令牌会被脱敏；不序列化原始 Axios 错误、请求体或凭据。令牌缓存按组织、认证机构及身份隔离，也区分凭据变更；同一客户端的并发刷新共享一次获取。

现有服务继续通过 `makeRequest` 接收数据。新服务可用 `requestWithResponse` 获取 HTTP 状态、ETag 和新建记录响应头，并传入请求头或 `AbortSignal`。请求及后续分页 URL 必须位于配置的组织 API 内；重定向作为错误返回。

`get_environment_capabilities` 使用原生 `WhoAmI`、`RetrieveVersion` 和 `EntityDefinitions` 端点。配置的 API 版本与服务器构建版本分别报告，表是否存在也与权限或写入支持分开报告。元数据不完整时返回 `unknown`，不直接判定不支持；认证/授权错误仍作为错误。工具不更改连接、不探测其他 API 版本，也不声称已安装 SDK 适配器。Online、NTLM 和 IFD 使用各自配置的认证，但检查逻辑相同。

原生参考：[RetrieveVersion](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/retrieveversion?view=dataverse-latest)、[Web API 服务文档](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/web-api-service-documents)。

### 查询状态、排序与分页

`search_records_by_odata` 和 `query_by_fetchxml` 保留原名称，在 `value` 中返回记录，并新增 `query`（实际筛选和排序）及 `paging`（完整性、限制和续传令牌）。查询准备阶段会读取表元数据，因此连接除数据访问权限外，还需元数据读取权限。

| 选项 | 默认值 | 含义 |
|---|---|---|
| `state_mode` | `legacy` | `legacy` 仅在零状态已定义且根实体没有显式状态条件时添加 statecode=0；`all` 不添加状态条件；`values` 使用经验证的 `state_values` |
| `state_values` | 无 | 一个或多个数字状态值；要求 `state_mode=values` |
| `fetch_all` | `false` | 在调用限制内跟随多个服务器分页 |
| `page_size` | 500 | 请求页大小，范围 1–5000；已有 FetchXML count 优先，除非提供相同值 |
| `max_records` | 5000 | 每次调用返回行数上限，范围 1–50000 |
| `max_pages` | 10 | fetch_all=true 时每次调用的服务器页预算，范围 1–100 |
| `formatted_values` | false | 包含服务器提供的显示标签和格式化值 |
| `continuation` | 无 | 恢复已保存查询及缓冲行；不要重复提供 filter/XML/top/page-size 参数 |

`statecode=0` 是旧版数字规则，不是通用的“活动”业务定义。例如，服务案例和商机的状态各有含义。没有 statecode 或未定义零状态的表会跳过默认规则，并在 `query.state.disposition` 中说明原因。在不支持的表上显式指定状态值会报错。`all` 不会移除查询自身已有的状态条件。引号内文本和子实体条件不再阻止添加根实体默认条件；OData lambda 作用域有歧义时保留原查询，不添加条件，并明确报告。

默认查询现在请求每页 500 行，而非依赖 CRM 默认页大小。用 `fetch_all:true` 读取多页。元数据提供主键时，OData 会补充主键排序以打破同值排序，支持可选 `orderby` 和 `expand`。不会单独遍历展开的子集合。各条记录上的格式化注解值保持不变。

OData `top` 是原生查询限制（1–5000），与 `max_records` 独立，不能与 `page_size` 并用。FetchXML `top` 同样不能与 count/page/paging-cookie/page_size 并用。完成 top 限定查询只表示该查询完成，不代表 top 范围外没有更多记录。

FetchXML 使用严格 XML 解析器处理筛选及 cookie 编码。普通查询在主键可用时添加主键排序；去重/聚合查询保留原列，自动分页要求显式根实体排序。无排序的单页去重/聚合查询若报告更多记录，结果即为不完整，调用方须指定合适排序后重新查询。没有服务器分页 cookie 时采用简单分页，到达原生 50000 行边界即停止并报告不完整。服务器还可能限制更小页大小或其他查询条件。

`paging.hasMore` 和 `paging.truncated` 表示本次调用尚未返回查询剩余结果；`paging.complete` 表示从起始位置执行的查询已完成。`stoppedBecause` 说明限制或排序约束。若上限落在页中间，未返回行会缓冲而非跳过。始终用 `paging.continuation` 续传；仅在不会丢失缓冲行时保留原生 `@odata.nextLink`。

示例：查询所有状态，并在限制内自动分页：

```json
{
  "collection_name": "accounts",
  "state_mode": "all",
  "orderby": "name asc",
  "fetch_all": true,
  "max_records": 2000
}
```

续传 OData 时使用相同集合，仅提供返回的令牌及可选 fetch_all/max_records/max_pages 设置：

```json
{"collection_name":"accounts","continuation":"<returned-token>","fetch_all":true}
```

续传 `query_by_fetchxml` 时无须再次发送 XML：

```json
{"continuation":"<returned-token>","fetch_all":true}
```

令牌五分钟后过期，只有调用成功才消耗，且不能由其他服务器连接或查询工具使用。每个连接最多保留 32 个续传状态；超出时可能淘汰最早的空闲令牌。重启或 `clear_server_cache` 会使其失效。读取失败时输入令牌仍可重试；拒绝并发消费同一令牌。续传过程中页大小及查询本身固定不变。结果不是数据库快照，因此两次请求之间的 CRM 变更仍可能影响后续页。

`preview_fetchxml_query` 使用相同准备/执行路径，保留 `isSuccess`、`sampleData` 和 `errorMessage`，新增实际查询和分页信息。预览仍是样本，并非完整查询结果。

原生参考：[FetchXML 分页及 cookie 格式](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/fetchxml/page-results?tabs=webapi)、[OData 分页](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/query/page-results)。

### Web 资源迁移（步骤 4.1）

本阶段服务器公开 55 个工具，已迁移 `@local/d365-meta-mcp@0.1.0` 的三个 Web 资源工具名称。旧 camelCase 参数仍可用，新调用推荐 snake_case；两种形式同时传入不同值会被拒绝。结果保留旧的 `{operation, version, fromCache, data}` 外层结构；`version` 表示配置的 API 版本，不是检测到的服务器版本。插件步骤和通用记录写入迁移见下文。

| 首选参数 | 兼容别名 | 含义 |
|---|---|---|
| `name_keyword` | `nameKeyword` | 搜索必填的名称子串 |
| `include_content` | `includeContent` | 仅 true 时搜索返回 Base64 源内容；默认 false |
| `include_unpublished` | `includeUnpublished` | 搜索最新已保存定义，包括未发布资源；默认 false |
| `file_path` | `filePath` | MCP 服务器所在机器上的源文件绝对路径 |
| `display_name` | `displayName` | 创建必填，更新可选 |
| `web_resource_type` | `webResourceType` | 创建必填，整数 1–12；实际可用类型取决于平台 |
| `content_encoding` | `contentEncoding` | 内联 `content` 编码：`utf8`（默认）或规范 `base64` |
| `solution_unique_name` | `solutionUniqueName` | 创建时可选的解决方案关联 |
| `if_match` | `ifMatch` | 更新使用的具体 ETag，如 `W/"123"` |
| `dry_run` | `dryRun` | 只读预览，默认 false |

必须且只能提供一种来源：`file_path` 或内联 `content`。文件按字节读取，允许空内容。本地上传限制为 Base64 编码前 10 MiB；目标 CRM 可能有更低限制。`content_encoding` 只适用于内联内容。访问 CRM 前会拒绝未知字段和无效类型。

搜索默认针对已发布定义，`top` 默认 50（范围 1–100），服务器 OData 结果保留在 `data` 中。这是有界搜索，不会自动清点所有资源。设置 `include_unpublished:true` 可查找保存但未发布的新资源，或检查最新保存定义。创建查重使用原生 `RetrieveUnpublishedMultiple`，包含等待发布的已保存定义。预检不提供唯一性锁；并发创建由平台裁决。

创建/更新的 `publish` 默认 true，保留原保存后发布行为。`publish:false` 仅保存。创建使用 POST，不覆盖已有已保存名称，接受返回实体或 `OData-EntityId`。更新使用 `If-Match:*` 禁止意外创建缺失资源；具体 `if_match` 防止覆盖上次读取后的变更。HTTP 412 仍是错误且不会发布。不提供具体 ETag 时可能覆盖已有数据。更新不会重命名资源或更改类型。

创建预览检查已保存名称，展示环境及拟议元数据。更新预览用原生 `RetrieveUnpublished` 对比最新已保存定义，服务器提供 ETag 时一并返回。内容以字节数和 SHA-256 哈希展示。预览不锁定资源，也不验证写入权限；后续更新传入预览 ETag 才能请求并发保护。原生操作失败（含授权失败）直接返回，不会静默回退到旧已发布定义或其他 API 版本。

例如，使用内联 JavaScript 预览更新：

```json
{"id":"aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee","content":"console.log('hello');","dry_run":true}
```

随后使用预览返回的 ETag 保存：

```json
{"id":"aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee","content":"console.log('hello');","if_match":"W/\"123\"","publish":false}
```

使用 `publish_web_resource` 发布已保存定义：

```json
{"id":"aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"}
```

发布调用限定该 GUID 的原生 `PublishXml`。若保存成功但发布失败，MCP 调用返回 `isError:true`、`code:D365_WEBRESOURCE_PUBLISH_FAILED`，以及 `data.saved:true`、`data.webresourceid` 和 `data.publication.status`。超时/服务器错误可能产生 `data.published:null` 及发布状态 `unknown`。应检查资源后，用其 ID **仅重试发布**。保存绝不会自动重放或回滚。`publish_web_resource` 返回 `saved:false`，因为该调用不保存内容。发布针对执行时最新保存版本；它不是前次保存的原子延伸，也不能以该次保存的 ETag 为条件。

若创建成功但既未返回有效实体 ID，也无可信 ID 响应头，`D365_WEBRESOURCE_CREATE_ID_MISSING` 会保留 `data.saved:true` 及名称，不尝试发布。重试前先查找已保存资源，不要盲目再次创建。使用 `search_web_resources_by_name` 搭配 `include_unpublished:true` 查找新保存资源；它可能不会出现在已发布定义搜索中。

全部操作复用现有 Online / NTLM / IFD 共享请求客户端。本地测试验证路由及错误行为；实际认证、平台版本、托管组件限制及权限需在各目标环境验证。步骤 4.1 验证未使用真实 CRM。

原生参考：[Web 资源表](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/webresource?view=dataverse-latest)、[PublishXml](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/publishxml?view=dataverse-latest)、[RetrieveUnpublished](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/retrieveunpublished?view=dataverse-latest)、[RetrieveUnpublishedMultiple](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/retrieveunpublishedmultiple?view=dataverse-latest)、[创建实体/ID 响应](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/create-entity-web-api)。

### 插件步骤迁移（步骤 4.2）

四个旧 `d365_plugin_*` 工具名称现已注册。新调用使用 snake_case，旧 camelCase 名称仍接受，包括 `plugin_type` 和 `patch` 内部。别名冲突和未知键会报错。结果保留原 `success`、`pluginTypes/messages/messageFilters`、`items/count` 和 `item` 字段，新增预览、分页及写入阶段证据。此范围管理**已注册插件类型**的步骤。步骤映像见下文步骤 6.5，兼容程序集更新见步骤 6.6。创建程序集、解决方案组件管理及实施计划其余部分另行处理。

`d365_plugin_registration_metadata` 接受精确 `plugin_type_name`、`assembly_name`、`message` 和 `primary_entity` 筛选。读取原生 `plugintypes`、`sdkmessages` 及 `sdkmessagefilters`；上限分别为 100 个类型、100 条消息、500 个筛选器，并报告是否达到上限。元数据发现不证明拥有注册权限，也不证明平台支持所有阶段/部署组合。

`d365_plugin_steps_query` 接受上述精确筛选，以及 `step_id`、`stage`、`mode`、`enabled`、`top`（默认 50，范围 1–500）、`include_unsecure_configuration`（默认 true）和 `include_secure_configuration`（**默认 false**）。所有筛选组合生效，包括与 `step_id` 同时传入的筛选；旧包则以 ID 优先。查询有界，`paging.atLimit` 不表示返回了全部匹配注册。最多跟随 10 次组织内原生分页请求；外部/循环链接会报错。

旧包默认读取安全配置明文，此默认行为已调整。普通发现、查重、修改前读取及写入后回读绝不选择/展开 `secureconfig`。查询只返回其 ID/是否存在及 `included:false`、`value:null`；只有显式 `include_secure_configuration:true` 才请求明文，且可能需要额外 CRM 权限。写入/预览结果绝不回显两类配置值；错误消息也隐藏可能回显提交内容的平台文本。保留结构化数字请求证据；有效 GUID 请求 ID 和十六进制平台代码经脱敏后保留，不输出任意文本证据。

预览注册：

```json
{
  "plugin_type":{"plugin_type_name":"Company.Plugins.AccountUpdate","assembly_name":"Company.Plugins"},
  "message":"Update",
  "primary_entity":"account",
  "stage":"PreOperation",
  "mode":"Synchronous",
  "rank":1,
  "filtering_attributes":["name","telephone1"],
  "dry_run":true
}
```

stage 接受 `10/PreValidation`、`20/PreOperation`、`40/PostOperation`，mode 接受 `0/Synchronous`、`1/Asynchronous`。异步要求阶段 40。rank 是 32 位正整数。可选 `supported_deployment` 接受 `0/ServerOnly`、`1/OfflineOnly`、`2/Both`，实际可用部署由目标平台决定。仅实体专属 Update 接受筛选属性；属性转小写、去重并校验原生字段元数据，拒绝主键和未知字段。注册拒绝私有/非活动消息及工作流活动类型。`plugin_type.id` 可代替名称；额外提供的类/程序集名称也必须匹配。

重复签名为：插件类型 + SDK 消息 + 消息筛选器（或全局）+ 阶段 + 模式。`conflict_policy` 默认 `error`；`return_existing` 不作修改；`update_existing` 修改唯一匹配步骤；多项匹配仍报错。`update_existing` 保留省略的可选字段及两类配置。查重只是预检，不是平台唯一约束，并发创建仍可能产生重复。

预览更新：

```json
{
  "step_id":"aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  "patch":{"rank":2,"enabled":true},
  "unsecure_configuration":{"action":"keep"},
  "secure_configuration":{"action":"clear"},
  "dry_run":true
}
```

`patch` 支持 name、description、stage、mode、rank、supported_deployment、filtering_attributes、enabled 和 impersonating_user_id。模拟身份设为 `null` 会恢复调用用户上下文。两类配置均支持 `keep`（默认）、带字符串 `value` 的 `set`（允许空字符串），以及不带值的 `clear`。仅保留配置的调用不会写入。更改阶段/模式也会检查等效步骤是否已存在。预览展示解析后的环境/目标及字段变更；配置变更仅展示动作，不展示明文、长度或哈希。

更新先读取步骤表的 `EntityDefinitions.IsOptimisticConcurrencyEnabled`。确认 true 时使用具体 `if_match` 或新读取的 ETag；传入过期 ETag 会在分配配置前失败，服务器 HTTP 412 绝不重放。无法确认支持时，正常写入以 `D365_PLUGIN_CONCURRENCY_UNSUPPORTED` 停止。显式 `allow_unprotected_update:true` 允许使用 `If-Match:*` 回退，并报告 `concurrencyProtected:false`；这防止 upsert，但**不防止覆盖并发变更**。具体 ETag 绝不会静默替换为通配符。只读预览仍可用，展示 `canWrite`/`blockedBy`；即使 `canWrite:true` 也仅表示本地预检通过，不代表全部平台规则和权限已验证。后续调用显式传入预览 ETag，才能防止覆盖预览后的变更。

安全配置 `set` 会分配**新的配置行**，再在包含字段/非安全配置变更的同一次步骤 PATCH 中绑定新行，不修改可能共享的旧安全配置行。`clear` 在该 PATCH 中解除安全配置绑定，并按要求清空步骤中的非安全配置内容。安全配置 clear **不会擦除旧行**；旧行保留并通过 `retainedSecureConfigIds` 报告。手动删除前应检查所有引用及权限。不会自动清理/删除，即使绑定被拒绝或结果未知。

创建时为步骤和新安全配置行提交生成的 GUID；成功响应体/响应头中的 ID 须与之相符；成功空响应使用提交的 ID。这些 ID 也用于超时后核对。分配安全配置行与写入步骤是独立原生操作，不是事务。失败时 MCP 返回 `isError:true`、`D365_PLUGIN_WRITE_FAILED`，以及包含以下内容的 `data`：

- `phase`：`secure_configuration_create`、`step_write` 或 `readback`。
- `stepId` 及步骤写入的 `saved`：false、true 或 `"unknown"`。
- `secureConfiguration`：动作、ID、创建状态和绑定状态。
- `previousSecureConfigId`、保留的 ID 以及 `reconciliationRequired:true`。

`created` 可为 false/true/`"unknown"`。绑定状态区分 unchanged、not_applied、unknown、write_succeeded（HTTP 成功）、verified（回读匹配）和 not_confirmed（回读不匹配）。回读失败保留已确认的 `saved:true`，不触发回滚或再次写入。重试前检查这些原生 ID。步骤字段并发保护与注册唯一性并发、独立创建配置行的权限分别处理。

三种认证模式共用同一原生请求路径。离线测试通过该路径及模拟网络传输覆盖 Online、NTLM、IFD；在提供各目标 CRM 前，真实认证、表并发能力、权限和插件执行仍未验证。

原生参考：[注册插件](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/register-plug-in)、[步骤表](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/sdkmessageprocessingstep?view=dataverse-latest)、[安全配置表](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/sdkmessageprocessingstepsecureconfig?view=dataverse-latest)、[条件操作](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/perform-conditional-operations-using-web-api)、[关联/解除关联](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/associate-disassociate-entities-using-web-api)、[客户端分配的创建 ID](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/create-entity-web-api#setting-the-primary-key-value)。

### 通用记录写入、备用键、关联与批处理（步骤 4.3）

保留原创建/更新/删除工具名和必填 snake_case 输入。在适用位置接受 `collectionName`、`ifMatch`、`dryRun`、`allowUnprotectedWrite`、`alternateKey`、`navigationProperty`、`relatedCollectionName`、`relatedId`、`chunkSize` 和 `continueOnError` 别名。别名值不同或参数未知会被拒绝。`get_record_by_id` 也接受 `collectionName`，校验 GUID，并将 `select` 限制为逗号分隔的属性名列表；仍返回原始记录结果。查询状态/分页契约不变。

写入调用现在返回结构化结果，而非原响应体/null：`success`、`operation`、`collectionName`、`id`、`saved`、`deleted`、HTTP `status`、`etag`、`concurrencyProtected`。创建/Upsert 还返回 `created`、`identityResolved` 及可选 `record`。创建接受实体主 ID、可信同组织 `OData-EntityId` 或请求中显式提交的主键。若均未返回，已确认保存仍保留 `saved:true`、`id:null`、`identityResolved:false`、`identityIssue:D365_RECORD_ID_NOT_RETURNED`；不要仅为获取 ID 再次创建。冲突/不可信 ID 保留保存证据但返回错误。无效的成功响应体视为结果未知。`record` 和预览会屏蔽字段名包含 password、secret、token、secureconfig、configuration 或 content 的值；这是启发式处理，不能替代字段安全或 CRM 授权。

原生表元数据验证每个 EntitySetName 和主键。拒绝报告为非标准 TableType 的表（包括 Elastic/Virtual）；旧 CE 元数据省略 TableType 时仍通过原生 API 执行，实际支持仍需验证。不会无条件从旧元数据中选择仅新版本支持的属性。元数据查询最多跟随 10 个原生页，拒绝不完整、循环或外部续传。

更新/删除先读取记录及表并发能力。`IsOptimisticConcurrencyEnabled=true` 时使用具体 `if_match` 或新读取 ETag；ETag 过期或记录不存在即停止。未确认支持时停止，除非显式 `allow_unprotected_write:true`；回退使用 `If-Match:*`，防止意外 upsert，但不防止并发覆盖。已提供 ETag 绝不降级。现有调用方因此可能需要处理元数据/读取权限或显式回退。应用写入绝不自动重复。

`dry_run:true` 展示环境、目标及包含 `beforeKnown`、`before`、`after` 的属性变更，以及 `canWrite`/`blockedBy` 和选定条件头。未读取的导航数据不会表示为已知旧值。删除预览标识目标，不返回全部业务数据。预览不锁定记录，也不执行全部平台业务/权限检查。后续写入显式传入预览 ETag，防止覆盖预览后的变更。

```json
{"collection_name":"accounts","id":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","data":{"name":"Updated"},"dry_run":true}
```

`upsert_record_by_key` 要求精确提供一个活动原生备用键的全部列。会读取 Keys 和属性元数据；待处理/失败/未声明的键会报错。支持复合键及 String、Integer/Picklist、Decimal、Lookup、UTC DateTime 属性。Lookup 键使用原生 `_attribute_value` 属性。字符串会转义单引号并编码路径字面值；拒绝 URL 保留字符、空/null 键和控制字符。精确大数使用十进制字符串；拒绝不安全大数及指数形式。DateTime 必须是有效 UTC 日历时间戳。这里只支持列出的输入子集，不承诺编码所有原生键类型。

```json
{"collection_name":"accounts","alternate_key":{"accountnumber":"A-001"},"data":{"name":"Customer"},"mode":"upsert"}
```

模式为 `upsert`（默认）、`create_only`、`update_only`，均向键 URL 发原生 PATCH。默认 Upsert 先读目标：不存在时以 `If-None-Match:*` 条件创建，存在时采用更新并发策略。因此并发创建/更改会报错，不会静默覆盖。具体 ETag 要求记录已存在。不自动重试、不回退 POST、不切换后端。请求体不能改变主键或备用键；相同的重复键值会移除。Lookup 属于键时，关系绑定须单独执行。保护流程需要读取及元数据权限。即使旧服务器仅返回 HTTP 204，条件创建/更新也可确定执行分支。

`associate_records` 和 `disassociate_records` 要求 collection_name、id、navigation_property、related_collection_name、related_id。原生 ManyToOne、OneToMany、ManyToMany 元数据必须将属性唯一解析到关联表。单值关联使用条件 Lookup PATCH；解除单值关联前展开指定导航目标，核对 ID（多态查找还核对目标类型）后设为 null。不删除关联记录。集合成员关系使用原生 POST/DELETE `$ref`；父记录 ETag 不能保证成员并发，因此要求 `allow_unprotected_write:true` 并报告 `concurrencyProtected:false`。提供 ETag 不会静默启用回退。

```json
{"collection_name":"accounts","id":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","navigation_property":"primarycontactid","related_collection_name":"contacts","related_id":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","dry_run":true}
```

`execute_record_batch` 和 `execute_record_transaction` 接受 1–100 个 create/update/delete/upsert/associate/disassociate 操作，每项用 `arguments` 对象提供对应工具字段。操作汇总 JSON 和每个原生传输块均不得超过 10 MiB。拒绝任意 HTTP 操作、嵌套批次、Content-ID `$1` 依赖和外部记录引用。在任何批量写入前完成全部本地验证、元数据/读取预检及分块序列化。预检读取位于事务外，且不是数据库快照；重复目标可能冲突，应合并同一行的变更。原生业务校验仍由服务器执行。

```json
{
  "operations":[
    {"operation":"create","arguments":{"collection_name":"accounts","data":{"name":"New"}}},
    {"operation":"update","arguments":{"collection_name":"accounts","id":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","data":{"name":"Updated"}}}
  ],
  "dry_run":true
}
```

普通批处理使用原生 `$batch`，每操作一个独立变更集；`chunk_size` 默认 25，范围 1–100。后续失败不会撤销先前提交。`continue_on_error:true` 请求原生继续执行偏好，允许在已知拒绝后发送后续块。未知结果总会停止后续块；缺失的后续响应不会被假定为未执行。

事务只使用**一个原生变更集**，不分块，也不回退为逐条写入。仅在成功响应完整且分组正确时报告 `committed:true`；已确认原生拒绝时为 false。超时、5xx/408 或格式错误/有歧义响应报告 `committed:null`，需核对。这是平台数据库事务语义，不承诺撤销业务逻辑触发的外部副作用。事务已提交后仍可能返回本地标识问题，不会误标为已回滚。

结果包括每项 `index`、`operation`、`status`、可用 HTTP 状态/证据，以及 `chunksSent`、汇总计数、`cancelled`。条目状态为 `succeeded`、`succeeded_with_issue`、`failed`、`unknown`、`not_sent`、`not_executed` 或 `not_committed`。最后一种表示整组未提交，不臆测未标注操作中哪些在拒绝前执行。不完整或未知结果以 `D365_BATCH_NOT_COMPLETE` MCP 工具错误返回，`data` 中保留完整报告。隐藏可能回显业务值的原生消息体。成功响应的标识问题仍保留确认保存证据。

MCP 取消信号会传到预检和传输层。块间取消保留先前结果，不发送后续块；正在发送的写入结果可能未知。提供 progressToken 的客户端会在块间及最终分类时收到有界进度通知。进度完成不代表所有操作成功。任何取消/重试路径均不重放写入，也不回滚已提交的普通批次块。

离线测试使用模拟传输通过真实请求层覆盖三种认证，包括 multipart 传输文本、条件头及响应关联。未读取或修改真实 CRM 数据。实际目标版本、权限、键/关系元数据、并发及 Change Set 行为仍需环境验证。

原生参考：[创建/ID 响应](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/create-entity-web-api)、[条件写入](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/perform-conditional-operations-using-web-api)、[备用键寻址](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/use-alternate-key-reference-record)、[原生 Upsert](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/use-upsert-insert-update-record)、[关系](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/associate-disassociate-entities-using-web-api)、[批处理/变更集](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/execute-batch-operations-using-web-api)。

### 只读诊断、安全及审计证据（步骤 5）

九个新增工具仅使用 GET，不启用日志/审计，不重试或取消系统作业，不改权限或记录。参数接受 snake_case 及文档列出的 camelCase 别名；拒绝冲突和未知字段。MCP 取消信号传入读取及诊断使用的步骤查询。当前组织设置、当前步骤定义与历史执行证据分开呈现。

`get_diagnostic_settings` 读取 WhoAmI、组织 PluginTraceLogSetting（0 关闭、1 异常、2 全部）及 IsAuditEnabled。可选 `collection_name` 增加表 IsAuditEnabled 托管属性，不检查逐字段审计。各来源状态为 ok、forbidden、unavailable_or_hidden、invalid_response 或 failed。缺失元数据保持 unknown。当前 false 仍返回 false，但不能证明历史时间段也为 false。空结果不被解释为日志已清除；`retentionAssessment` 保持 unknown，因清除结论需要独立正面证据。

`query_plugin_trace_logs` 可按 `correlation_id`、`step_id`、精确 `plugin_type_name` 及 `from_time`/`to_time` 筛选原生行。时间戳必须显式带时区并规范为 UTC；to_time 默认当前时刻，from_time 默认此前 24 小时。`exceptions_only:true` 仅保留原生 exceptiondetails 非空行。`top` 默认 50（1–100），`max_pages` 默认 5（1–20）。分页链接限组织内；循环、无效页、预算耗尽不会静默视为完整。达到 top 的结果仅为有界查询，不是完整清单。诊断列表不提供续传令牌，应缩小时间窗/筛选范围继续调查。

这些工具**绝不选择**跟踪 configuration、secureconfiguration、profile 列。除非 `include_text:true`，也不返回 messageblock/exceptiondetails。文本按常见凭据模式脱敏，并受 `max_text_chars` 限制（默认 2000，范围 100–8000），带明确截断标记。插件文本仍可能包含模式匹配识别不了的业务数据/密钥；显式启用文本不保证已完全匿名化。

`query_failed_system_jobs` 查询原生 Failed 状态 31，以 **completedon** 界定时间窗，因此能找到更早创建但长时间运行后才失败的作业。关联和所属步骤筛选可选。不选择作业数据/依赖负载；原生 message/friendlymessage 与跟踪文本一样需显式启用。可见列表为空不证明未发生故障。

```json
{"correlation_id":"44444444-4444-4444-4444-444444444444","from_time":"2026-10-26T08:00:00+08:00","to_time":"2026-10-26T18:00:00+08:00"}
```

`diagnose_plugin_failure` 至少要求 correlation_id、step_id 或 plugin_type_name 之一，组合异常跟踪、失败作业、当前步骤元数据及当前开关。原生 PluginStepId/OwningExtensionId 提供关联；同 correlation 或类名不直接推导因果。按类型搜索作业使用匹配跟踪/当前步骤中实际观测到的 ID；仅用户提供 ID 不能证明所属类。截断/不可用查询仍是覆盖缺口，不会扩大为无筛选作业搜索。返回 observations、links、gaps、coverage 及 `rootCause.status:not_determined`，用于整理调查证据，不编造业务根因。

常规组件权限/不可用失败与可读来源共同保留。404 表示 unavailable_or_hidden，不直接判定不支持。认证失败和取消仍报错。独立读取 403 返回 D365_READ_FORBIDDEN MCP 错误；隐藏原生平台消息及任意响应数据。当前步骤读取明确排除安全及非安全配置。

`query_security_principals` 有界读取可见 systemuser、team、role 目录行，可按 principal_id、name_keyword、business_unit_id 筛选；`enabled` 仅适用 systemuser 且从不隐式添加。不选择密码、凭据或邮箱字段。`get_principal_security_context` 默认当前用户，也接受用户/团队 ID；读取直接角色，并为用户读取可见团队成员关系/角色。`team_limit` 默认 10（1–25）、`role_limit` 默认 50（1–100）、`include_team_roles` 默认 true。来源被禁止或受限时不伪装为空列表。保留角色 ID/业务部门，不将同名角色副本等同。这是目录观测，不重建全部层级、共享、继承/组团队或字段权限。

`get_record_access` 使用原生绑定 RetrievePrincipalAccess。principal_type 为 systemuser（默认当前用户）、team 或 organization；后两者要求 ID。collection_name 和 record_id 指定目标。返回原生记录权限；None 与读取失败不同。未知数字位保留。结果不解释全部权限来源，不评估字段安全，也不保证后续操作通过业务规则。

```json
{"collection_name":"accounts","record_id":"99999999-9999-9999-9999-999999999999","principal_type":"systemuser"}
```

`get_record_audit_history` 通过 Target 和 PagingInfo 调用原生 RetrieveRecordChangeHistory。`page_size` 默认 20（1–100），`page_number` 默认 1（最大 1000）。后续页须传同目标/页大小的上一页原生 paging_cookie 原值。Cookie 作为不透明 JSON 值传递，不解析/重编码为 XML。仍受 16 KiB cookie 和服务器 URL 长度限制。保留 MoreRecords；cookie 缺失、超大、重复或达到页上限时明确报告续传问题，不编造不可用的下一页。各页不是数据库快照。

```json
{"collection_name":"accounts","record_id":"99999999-9999-9999-9999-999999999999","page_size":20}
```

审计默认输出详情类型及变更字段名，不输出新旧属性值；即使输出关闭，原生函数仍可能将这些值返回服务器进程。`include_values:true` 有界输出新旧值，按敏感字段名启发式屏蔽，不保证完整数据防泄露。长值可能截断。其他审计详情类型通过 `detailFields:not_projected_for_this_detail_type` 标识，不倾倒或编造未支持数据。读取结果上限 5 MiB；过大时减少页大小/文本输出。

Web API 历史函数可能完全省略 AuditRecord，此时操作者/时间/审计 ID 保持 null/unknown，不从数组顺序、时间筛选或当前用户猜测。`get_audit_details` 针对 audit_id 调用原生绑定 RetrieveAuditDetails，并独立尝试读取审计行元数据。两次读取可能需不同权限；摘要元数据不可用不抹除可读详情证据。当前组织/表开关与历史独立报告；空历史不被标记为已清除或从未审计。

离线测试用模拟传输通过共享请求层覆盖三种认证。真实环境、日志保留/设置、访问权限、审计分页/类型行为及可复现真实故障仍需验证。步骤 5 不增加权限修改、日志变更、自动根因裁决，也不完整呈现所有审计详情子类型。

原生参考：[跟踪表](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/plugintracelog?view=dataverse-latest)、[系统作业](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/asyncoperation?view=dataverse-latest)、[跟踪开关](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/logging-tracing)、[有效记录访问权限](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/retrieveprincipalaccess?view=dataverse-latest)、[函数记录引用](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/use-web-api-functions)、[审计历史/详情](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/auditing/retrieve-audit-data)。

### 3. 构建

#### 构建并启动
```bash
npm run build
npm start
```

`build` 和 `build:release` 都会检查源码类型，并将服务器及运行依赖打包为 `dist/index.cjs`。`main`、`npm start`、CLI 和下文 MCP 配置均使用此入口。显式执行发布构建：
```bash
npm run build:release
```
输出文件位于 `dist/index.cjs`。这是**独立打包文件**，无须 `node_modules` 即可在 Node.js 18+ 环境运行。

使用 `npm run typecheck` 只检查类型而不生成文件。开发使用 `npm run dev` 或 `npm run watch`。原直接执行 `dist/index.js` 的方式改为 `node dist/index.cjs`。

`npm pack` 自动执行发布构建，包含打包文件、CLI 和 README。CLI 在同一 Node 进程加载服务器，无须在 `PATH` 中再找到一个 `node` 可执行文件。

构建后运行 `npm test` 检查配置、初始化恢复和启动回归；仅检查启动可用 `npm run test:smoke`。启动测试使用临时设置并阻止网络请求，不连接 CRM，也不验证真实环境权限。

### 4. GUI 调试器

项目内置 Web 调试器，可**自动发现**全部 MCP 工具并生成交互表单。

```bash
npm run debug
```
Then visit: `http://localhost:3000`

调试器仅绑定 `127.0.0.1`。API 请求要求回环 Host 头；拒绝跨源/浏览器跨站请求，写入要求 `Content-Type: application/json`。JSON 请求上限 16 MiB。静态文件路径限制在 UI 目录内。仅在本机会话运行调试器；它拥有与 MCP 服务器进程相同的文件访问及 CRM 权限。

- **动态适配**：新增工具后 UI 自动同步。
- **毛玻璃设计**：现代深色主题界面。

## 🛠️ MCP 配置

将服务器加入 MCP 客户端配置，推荐直接指向构建的 `dist/index.cjs`：

```json
{
  "mcpServers": {
    "dynamics365-online": {
      "command": "node",
      "args": ["location of dist/index.cjs"],
      "env": {
        "TENANT_ID": "...",
        "CLIENT_ID": "...",
        "CLIENT_SECRET": "...",
        "ENVIRONMENT_URL": "https://your-org.crm.dynamics.com"
      }
    },
    "dynamics365-onprem-ad": {
      "command": "node",
      "args": ["location of dist/index.cjs"],
      "env": {
        "AUTH_TYPE": "op_ad",
        "ORG_URL": "http://192.168.1.100/Demo",
        "AD_DOMAIN": "your-domain",
        "AD_USERNAME": "your-username",
        "AD_PASSWORD": "your-password",
        "API_VERSION": "v9.1"
      }
    },
    "dynamics365-onprem-ifd": {
      "command": "node",
      "args": ["location of dist/index.cjs"],
      "env": {
        "AUTH_TYPE": "op_ifd",
        "ORG_URL": "https://org.domain.com",
        "IFD_ADFS_URL": "https://adfs.domain.com",
        "IFD_CLIENT_ID": "your-adfs-client-id",
        "IFD_USERNAME": "your-username",
        "IFD_PASSWORD": "your-password",
        "API_VERSION": "v9.1"
      }
    }
  }
}
```

---
**最后更新**：2026-10-28

## 数据模型开发——步骤 6.1

五个工具实现步骤 6 中有界的第一部分。下文步骤 6.2–6.4 增加关系、备用键、选项、表单/视图操作及更多列类型。更广泛元数据维护和高级布局/查询留待后续批次。步骤 6.5/6.6 增加有界原生插件映像及程序集更新流程。按活动备用键执行记录 Upsert 仍可用；此批次不创建键。

`get_model_definition` 按 `logical_name` 读取表，增加 `attribute_name` 则读取列。列读取/标签更新支持 `String`、`Memo`、`Integer`、`Decimal`、`Money`、`DateTime`、`Boolean`、`Picklist`、`MultiSelectPicklist`，使用完整派生元数据类型，适用时展开原生 OptionSet。读取使用 `Consistency: Strong`；拒绝超过 2 MiB 的定义、原生部分续传和标识不匹配。结果排除传输注解及只读 `UserLocalizedLabel`，保留其他属性并提供 `definitionHash`。指纹覆盖规范化定义，不证明发布状态，也不提供平台锁。

所有新增写入工具在服务层默认**预览**（`dry_run: true`）。预览执行读取，返回环境/目标/原生请求，不执行平台写入校验；`dry_run: false` 才执行。接受 snake_case 及文档说明的 camelCase 参数；拒绝别名冲突和未知属性。本地化标签统一使用以下结构：

```json
[{"language_code":1033,"text":"Reference"},{"language_code":2052,"text":"参考编号"}]
```

提供 1–50 个不重复语言代码。显示标签最多 100 字符，描述最多 2000；语言必须在目标组织已安装/有效，由平台最终检查。此接口合并提供的语言标签，不提供标签删除。

创建带主要文本名称列的普通自定义表：

```json
{
  "schema_name":"new_Project",
  "display_name":[{"language_code":1033,"text":"Project"}],
  "display_collection_name":[{"language_code":1033,"text":"Projects"}],
  "primary_name":{
    "schema_name":"new_Name",
    "display_name":[{"language_code":1033,"text":"Name"}],
    "max_length":100
  },
  "ownership_type":"UserOwned",
  "solution_unique_name":"ExistingUnmanagedSolution"
}
```

`create_model_table` 支持 UserOwned（默认）或 OrganizationOwned，IsActivity/HasActivities/HasNotes 均为 false。`primary_name` 支持 schema/display/description/max_length 及其 camelCase 别名。不提供活动表创建、任意元数据或所有权转换。

使用 `create_model_column` 在现有表中创建列：

```json
{
  "logical_name":"new_project",
  "schema_name":"new_Reference",
  "type":"String",
  "display_name":[{"language_code":1033,"text":"Reference"}],
  "max_length":100,
  "required_level":"None",
  "solution_unique_name":"ExistingUnmanagedSolution"
}
```

支持的类型及设置：

| 类型 | 设置 |
| --- | --- |
| String | Text 格式；max_length 1–4000，默认 1000（主名称列默认 100） |
| Memo | TextArea 格式；max_length 1–1048576，默认 1000 |
| Integer | min_value/max_value 为 ±2147483647 内整数，默认 0/1000000 |
| Decimal | min_value/max_value 为 ±100000000000 内有限数，默认 0/1000000；precision 0–10，默认 2 |
| Money | 工具范围 ±100000000000，默认 0/1000000；precision 0–4，默认 2；固定原生 PrecisionSource=0（列精度） |
| DateTime | format 为 DateAndTime（默认）/DateOnly；date_time_behavior 为 UserLocal（默认）、DateOnly 或 TimeZoneIndependent；DateOnly 行为要求 DateOnly 格式 |
| Boolean | 必填 true_label/false_label；布尔 default_value 默认 false |
| Picklist | local options 与 global_choice_name 二选一；可选数字 default_value 必须已显式定义 |
| MultiSelectPicklist | local options 与 global_choice_name 二选一；不提供 default_value |

`required_level` 为 None（默认）、Recommended 或 ApplicationRequired。文本列不接受数字设置，数字列不接受长度设置，Integer 不接受精度；其他不兼容设置也拒绝。服务器最终验证元数据、类型及权限。支持创建更多类型不等于能更改已有列类型或日期时间行为。

创建要求可见且已存在的**非托管**解决方案。原生 `MSCRM.SolutionUniqueName` 头请求解决方案关联。新表、主名称和列架构名必须采用该解决方案发布者的自定义前缀。添加列前检查重复逻辑名及父表 IsCustomizable/CanCreateAttributes；创建不是 Upsert。解决方案成员关系/部署验证仍属后续 ALM 范围。

`update_model_labels` 接受 logical_name、可选 attribute_name、solution_unique_name，以及 display_name/description 任意项（表还支持 display_collection_name）。读取完整定义，仅修改标签，用原生 **PUT** 及 `MSCRM.MergeLabels: true` 提交。检查 IsCustomizable；显示标签还检查表 IsRenameable，描述检查 CanModifyAdditionalSettings。必需托管属性为 false 或不可用即停止。保留其他设置，不提供架构、类型及必填级别修改。

先按默认预览调用更新。执行时将返回 `definitionHash` 作为 `expected_hash`，并显式设置 `allow_unprotected_write: true`、`dry_run: false`。指纹变化会在 PUT 前停止。此实现不宣称支持条件元数据 PUT；其他编辑者仍可能在预检和保存之间修改定义，应协调目标环境中的元数据变更。

确认保存返回 `saved: true`，并通过强一致性回读比较请求属性。`readback.status: matched` 只覆盖 `checkedProperties`；创建表时，此表投影不会单独检查主名称列定义。模型驱动 UI 及表单放置仍未验证/执行。回读失败或不匹配返回 MCP 错误，保留 **saved: true**。超时/不确定写入为 `saved: null`，绝不自动重放。确认写入会使服务器元数据缓存失效。

保存不请求发布（`publication: not_requested`），也不添加表单控件、库、事件绑定或视图列。用 logical_name 调用 `publish_model_table`，先审阅默认预览。原生 PublishXml 发布**整张表**，包括其他待发布列/表单/视图/Ribbon 变更，不限于工具最后一次编辑。发布失败区分 failed 与 unknown，绝不重放保存。即使原生发布成功，仍须单独验证 UI/行为。

原生参考：[表定义](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/create-update-entity-definitions-using-web-api)、[列定义](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/create-update-column-definitions-using-web-api)、[限定范围发布](https://learn.microsoft.com/en-us/dotnet/api/microsoft.crm.sdk.messages.publishxmlrequest.parameterxml?view=dataverse-sdk-latest)。这些路径已通过 Online/NTLM/IFD 请求分支离线测试。没有目标连接时，实际 CRM 版本、元数据权限、语言包、解决方案分层、发布及 UI 行为仍未测试。

## 关系与备用键定义——步骤 6.2

四个工具扩展步骤 6，支持原生关系/键的**创建与检查**，不更新或删除已有关系/键。复用步骤 6.1 的解决方案/发布者验证、camelCase 别名、默认预览、严格输入、取消、有界原生元数据及不重放行为。此 Web API 范围无须新增依赖或 .NET 进程。

`get_model_relationship` 接受 `schema_name`，找到唯一原生关系，再按 MetadataId 读取完整 1:N 或 N:N 派生定义。排除传输注解/只读用户本地化标签；发布状态仍未知。不将导航集合展开为无限关系图。

用 `create_model_relationship` 创建一对多关系及其新 Lookup：

```json
{
  "type":"one_to_many",
  "schema_name":"new_account_project",
  "referenced_entity":"account",
  "referencing_entity":"new_project",
  "lookup":{
    "schema_name":"new_AccountId",
    "display_name":[{"language_code":1033,"text":"Account"}],
    "required_level":"None"
  },
  "solution_unique_name":"ExistingUnmanagedSolution"
}
```

被引用表为**一端**，其原生 PrimaryIdAttribute 从元数据解析；引用表为**多端**，接收新 Lookup。Lookup 标签/描述/必填规则与基础列一致。关系及 Lookup 架构名必须使用所选发布者前缀。已有 Lookup 逻辑名或关系架构名会阻止创建；不会静默改用现有字段。

两张表均须明确通过托管属性检查，还执行原生 `CanBeReferenced`、`CanBeReferencing`。这些是**只读 POST 操作**，预览时也会执行。检查被拒绝/不可用会在创建架构前停止，不会回退假定合格。

可选 `cascade` 使用小写键 `assign`、`delete`、`merge`、`reparent`、`share`、`unshare`。Delete 默认 **Restrict**，其余五项默认 NoCascade。Delete 接受 Restrict/RemoveLink/Cascade；其他项在本工具中支持 NoCascade/Cascade。显式 Cascade 在原生请求体预览可见，发布后可影响未来关联记录。不提供其他级联模式、层级关系或自定义导航属性名。关联菜单使用 UseCollectionName / Details / order 10000。不创建表单控件或脚本绑定。

多对多关系提供以下参数：

```json
{
  "type":"many_to_many",
  "schema_name":"new_account_project",
  "entity_1":"account",
  "entity_2":"new_project",
  "intersect_entity_name":"new_account_project",
  "solution_unique_name":"ExistingUnmanagedSolution"
}
```

交叉表名默认关系架构名并转为小写。各表须通过 CanBeInManyToMany 及原生 `CanManyToMany`（也是只读 POST）。交叉表名已存在即停止。此批次 N:N 支持不同表；自引用 N:N 需要此处未提供的导航配置。自引用 1:N 在原生资格允许时可执行。拒绝混合 1:N 和 N:N 参数。

实际创建向 RelationshipDefinitions 发送一次带原生解决方案头的 POST。回读验证请求的关系属性；1:N 还按逻辑名和派生 LookupAttributeMetadata 单独读取 Lookup，检查标签、必填性、标识及唯一目标表。回读失败/不匹配保留 **saved: true**。不自动重试或发布。`tablesToReviewForPublication` 列出受影响表；发布任一端前先审阅独立的整表发布范围。

使用 `create_model_key` 创建备用键定义：

```json
{
  "logical_name":"new_project",
  "schema_name":"new_ReferenceKey",
  "key_attributes":["new_reference"],
  "display_name":[{"language_code":1033,"text":"Reference key"}],
  "solution_unique_name":"ExistingUnmanagedSolution"
}
```

提供 1–16 个不重复逻辑列名；工具规范大小写并拒绝重复字段。键架构使用所选发布者前缀。支持 String、Integer、Decimal、DateTime、Lookup、Picklist，各字段必须明确 IsSecured=false。拒绝提供程序支持的虚拟表。检查返回的全部键，排除同架构名或同列集合，包括 Pending/Failed 键。每表最多支持十个定义；旧环境平台上限可能更低。遇到原生续传、无效标识或重复元数据即拒绝，不视为完整/空集合。

向 EntityDefinitions(...)/Keys 的原生 POST 请求解决方案关联，不扫描或修改记录。平台验证索引大小（含文档规定的 900 字节限制）及现有数据唯一性，所以预览不能证明索引能构建成功。实际键值的 null/缺失及保留字符仍需按集成处理；活动索引不保证所有值都可编码进原生 GET/PATCH/Upsert。

**定义已保存与索引已就绪是独立状态。** 确认创建/回读后返回 `saved: true`，将原生 EntityKeyIndexStatus 映射为 Pending / InProgress / Active / Failed；未知或省略保持 Unknown。仅 Active 时 `usableForAlternateKeyOperations` 为 true；仍受记录权限和编码约束。不通过假定成功来等待后台作业。索引立即 Failed 时返回 `D365_MODEL_KEY_INDEX_FAILED`，保留 saved=true 和 AsyncJob 链接。不要为恢复索引失败而重建同一定义。

再次以 logical_name/schema_name 调用 `get_model_key` 读取当前状态。可选 `include_job: true` 仅读取作业 ID/状态/状态原因/错误码/时间戳，排除自由文本和作业数据。链接作业缺失/无权读取与键状态独立报告。认证/取消错误向上传递。不编造作业 ID，不全表搜索作业，不自动重激活/删除或后台轮询。

原生参考：[关系创建及资格检查](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/create-update-entity-relationships-using-web-api)、[备用键约束及异步索引](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/define-alternate-keys-entity)、[原生索引状态](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/entitykeyindexstatus)。离线测试覆盖 Online、NTLM、IFD 原生请求分支。真实关系资格/级联、元数据传播、索引创建、成员关系及发布后 UI 行为仍待联调验证。

## 选项及更多列类型——步骤 6.3

四个新工具增加选项发现、全局选项创建、单项插入/标签更新及独立全局发布。现有模型列工具支持上文九种类型，不改已有工具名。全部写入默认预览，复用前述解决方案/发布者、有界输入、取消、缓存失效及不重放契约。

用 `get_model_choices` 读取共享选项：

```json
{"global_choice_name":"new_colors"}
```

或读取某列使用的选项：

```json
{"logical_name":"new_project","attribute_name":"new_color"}
```

必须且只能选一种定位方式。原生 OptionSet 数据包含语言标签、数字值、托管属性和 `definitionHash`。引用全局选项的本地字段返回 scope=global_reference；编辑共享选项须显式指定 global_choice_name。本地选择器绝不静默修改其他列共享的选项。支持 Boolean、Picklist、MultiSelect；状态/状态原因具有独立原生语义，故排除。缺失标识、原生值无效/重复、元数据续传、超过 1000 项或定义超过 2 MiB 均会停止。

使用 `create_model_choices` 创建全局选项：

```json
{
  "schema_name":"new_colors",
  "display_name":[{"language_code":1033,"text":"Colors"}],
  "options":[
    {"label":[{"language_code":1033,"text":"Red"}]},
    {"value":100000001,"label":[{"language_code":1033,"text":"Blue"}]}
  ],
  "solution_unique_name":"ExistingUnmanagedSolution"
}
```

全局名称转为小写，必须使用所选发布者前缀；名称已存在即停止。1–1000 个选项各接受可选数字 `value`、必填 `label`、可选本地化 `description`。值必须为非负且唯一的 Int32。省略 value 时发送原生 Value=null，由平台按解决方案发布者上下文分配；用户不要显式传 null。标签集必须各不相同，自动分配要求标签可无歧义匹配，以便回读识别分配值。请求上限 2 MiB。确认创建后比较显示标签/描述/选项，返回实际分配值；回读失败仍保留 saved=true。

本地单选/多选在 `create_model_column` 中使用同样的 `options` 结构。复用共享选项时省略 options，改传 global_choice_name。工具解析并验证原生全局选项 ID，发送 `GlobalOptionSet@odata.bind`，不复制为新本地集合；回读验证全局绑定。MultiSelect 使用原生 Virtual 属性类型及 MultiSelectPicklistType，不接受任意 Virtual 列。单选的可选 default_value 须匹配显式选项值或已有全局值，不能在创建前猜测新分配值。

创建 Boolean 时按标准本地化标签数组提供 true_label、false_label，可选布尔 default_value；原生值仍为 1 和 0。Money 使用列精度（PrecisionSource=0），而非组织或记录币种精度。DateTime 行为须明确：UserLocal 行为的 DateOnly 显示与 DateOnly 存储行为不同。现有日期转换、币种配置、计算/汇总列、文件/图像列及更广泛设置不属此批次。

使用 `change_model_choice_value` 操作单个选项：

```json
{
  "global_choice_name":"new_colors",
  "operation":"update",
  "value":100000001,
  "label":[{"language_code":1033,"text":"Navy"}],
  "solution_unique_name":"ExistingUnmanagedSolution"
}
```

插入要求 label；省略 value 则请求原生分配。更新要求已有 value 及 label 或 description。本地选项使用 logical_name 和 attribute_name，不用 global_choice_name。请求体使用原生 OptionSetName 或 EntityLogicalName/AttributeLogicalName，以及 **SolutionUniqueName** 操作参数。UpdateOptionValue 发送 **MergeLabels=true**。这与字段标签 PUT 不同；更改列 DisplayName 不会更新选项标签。

先审阅默认预览，再将其 definitionHash 作为 expected_hash，并设 allow_unprotected_write=true、dry_run=false 执行。哈希过期会在操作前停止，但原生选项操作在读取后仍有并发窗口。仅修改明确非托管/可自定义选项；托管或所有权未知、目标选项托管时，需要此处未实现的发布者/解决方案流程。支持更新 Boolean 标签，不支持插入第三个 Boolean 值。

回读检查选项标识、数字值、提供的标签/描述及未改语言文本。自动分配插入读取原生 NewOptionValue；响应缺失/不一致时保留 saved=true 并报错，不编造 ID。超时/结果未知不重放。此批次不支持删除、重新编号、重排选项或修改状态/状态原因。

`publish_model_choices` 接受 global_choice_name，默认预览。原生 PublishXml 发布**整个共享全局选项**，包括其他待发布更改。本地选项用 publish_model_table，范围为整张表。保存或发布都不会自动编辑表单/视图，也不证明 UI 行为正确。

原生参考：[选项消息及分配](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/create-update-optionsets)、[InsertOptionValue](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/insertoptionvalue)、[UpdateOptionValue 与 MergeLabels](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/updateoptionvalue)、[列定义](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/create-update-column-definitions-using-web-api)、[选项导航](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/retrieve-metadata-name-metadataid)、[日期行为](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/datetimebehavior)、[货币精度](https://learn.microsoft.com/en-us/dotnet/api/microsoft.xrm.sdk.metadata.moneyattributemetadata.precisionsource)。Online/NTLM/IFD 请求路径已离线测试。真实语言包、托管层、发布者分配、API 版本支持、传播、发布及 UI 行为仍待目标 CRM 验证。

## 表单与视图结构编辑——步骤 6.4

四个工具检查已保存/未发布 UI 组件，编辑已有**主表单（type=2）**或**公共系统视图（querytype=0）**。写入使用原生 systemforms / savedqueries PATCH，与元数据定义 PUT 不同。不引入新依赖、任意 XML 替换、表单/视图创建、删除或自动发布。个人视图和其他表单类型可能需要独立流程。

使用 `list_model_ui_components` 发现 ID：

```json
{"kind":"form","logical_name":"new_project","top":50,"name_keyword":"Main"}
```

视图使用 kind=view。原生 RetrieveUnpublishedMultiple 限制为一批 1–100 条请求项。出现续传或达到上限会报告 limited=true；应缩小 name_keyword，而非视为完整列表。未发布检索不可用/无权限时不回退已发布记录。

`get_model_ui_component` 接受 kind、id、logical_name，返回原生已保存 XML、结构清单、definitionHash 及可用原生 ETag。表单 section ID 规范化为无大括号，便于操作复用。XML 清单中的 libraryUniqueId 为表单内部标识，与 Web 资源 ID 不同。每份 XML 限 1 MB、40000 节点、64 层；拒绝 DTD/实体、格式错误或不支持的命名空间根节点。组件响应限 3 MiB。哈希比较 XML 结构/属性而非缩进，并保留有意义的字面空白。

`edit_model_form` 预览示例：

```json
{
  "id":"11111111-1111-1111-1111-111111111111",
  "logical_name":"new_project",
  "solution_unique_name":"ExistingUnmanagedSolution",
  "operations":[
    {
      "action":"add_field",
      "attribute_name":"new_reference",
      "section_id":"33333333-3333-3333-3333-333333333333",
      "template_control_id":"new_name",
      "label":[{"language_code":1033,"text":"Reference"}]
    },
    {"action":"add_library","library_name":"new_/project.js"},
    {
      "action":"bind_event",
      "event_name":"onchange",
      "attribute_name":"new_reference",
      "library_name":"new_/project.js",
      "function_name":"Project.onReferenceChange",
      "pass_execution_context":true
    }
  ]
}
```

操作在内存按顺序执行，随后**一次 PATCH** 保存。add_field 在已有等宽 section 末尾添加全宽行（显式 columns 编码 1/11/111/1111，无跨行单元格）；字段不得已出现。显式指定的兼容已有控件提供原生 class ID；检查来源/目标标量类型、格式/行为和 IsValidForForm。支持 String、Memo、Integer、Decimal、Money、DateTime、Boolean、Picklist 模板，不复制已有处理器/参数或 PCF 控件描述。Lookup、MultiSelect、未绑定/参数化控件、新 section/tab、移动及复杂布局不属此操作。control_id 默认字段逻辑名。

add_library 验证精确可见 JavaScript Web 资源名称（type=3），不读取或执行源码。bind_event 要求库已存在或在同一操作列表更早加入。支持 onload/onsave、onchange；onchange 还要求字段已放在表单上。函数名为点分隔标识符。执行上下文默认 true，显式 false 会保留。拒绝重复库/处理器及内部应用事件；保留现有事件顺序和无关 XML。不承诺检查函数存在或运行时行为。新增时强制原生 50 个库/处理器限制。

脚本变更返回 **webResourceId** 及 webResourcePublication=not_verified。保存/发布表单不证明脚本资源的最新内容已发布；需要时审阅并用现有 publish_web_resource 发布该 ID。JavaScript Web 资源发布及 UI 行为须单独检查。

`edit_model_view` 预览示例：

```json
{
  "id":"22222222-2222-2222-2222-222222222222",
  "logical_name":"new_project",
  "solution_unique_name":"ExistingUnmanagedSolution",
  "operations":[
    {"action":"add_column","attribute_name":"new_reference","width":180},
    {"action":"set_width","attribute_name":"new_name","width":250},
    {"action":"set_order","order":[{"attribute_name":"new_reference","descending":false}]}
  ]
}
```

add_column 同步根 FetchXML 属性及 LayoutXML 单元格，保留 all-attributes 选择。remove_column 仅移除显示单元格，保留筛选/排序/其他依赖使用的 FetchXML 属性。不能移除主列、跳转列和最后一个显示列。宽度 25–2000，新增默认 150。set_order 以 1–10 个不重复字段替换简单根排序。检查原生可读字段元数据及布局表/主 ID 标识；非 distinct 视图缺主键投影时显式补充。保留筛选、连接、关联列和无关布局属性。不提供聚合/distinct 重写、关联/别名排序替换、关联列编辑、筛选编辑及原始 FetchXML/LayoutXML 替换。不隐式添加活动状态筛选或执行查询。

编辑默认 dry_run=true，接受 1–50 个操作，输入上限 2 MiB。审阅 request/changes 后，以当前 definitionHash 作为 expected_hash 并设 dry_run=false 执行。源组件/表必须明确可自定义。解决方案头请求关联到选定已有非托管解决方案；完整成员关系/部署验证仍属后续 ALM。

并发检查使用 systemform/savedquery 表原生 IsOptimisticConcurrencyEnabled。确认支持时使用具体原生/传入 ETag；缺失时要求有效 if_match。不支持或未知时要求 allow_unprotected_write=true，使用 If-Match:* 仅防止意外 upsert。绝不绕过具体 ETag。未满足并发要求时预览展示 blockedBy。指纹能检测过期审阅，但不是显式无保护写入期间的锁。

确认保存后重新读取未发布组件，结构化比较全部提交 XML。回读失败/不匹配保留 saved=true；PATCH 结果未知保留 saved=null，绝不重放。无变更返回 saved=false、noChange=true，不发 PATCH。原生保存成功与完整 XSD、运行时、UI、发布及部署验收分别处理。仅在审阅整表范围及其他待发布更改后使用 publish_model_table。

离线测试阻断网络，覆盖模拟的创建字段 → 放置表单 → 绑定脚本 → 编辑视图 → 单独发布 → 重新读取流程。真实 Online/NTLM/IFD 权限、未发布/ETag 语义、托管层、控件布局、脚本执行及已发布 UI 行为仍未验证。

原生参考：[系统表单操作](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/reference/entities/systemform)、[保存视图操作](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/reference/entities/savedquery)、[未发布定义检索](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/retrieveunpublished)、[FormXML 架构](https://learn.microsoft.com/en-us/dynamics365/customerengagement/on-premises/developer/customize-dev/form-xml-schema?view=op-9-1)、[视图查询/布局自定义](https://learn.microsoft.com/en-us/dynamics365/customerengagement/on-premises/developer/customize-dev/customize-entity-views?view=op-9-1)。

## 插件实体映像——步骤 6.5

四个工具管理原生 `sdkmessageprocessingstepimages`，不请求步骤配置或程序集内容：

| 工具 | 操作 |
|---|---|
| `d365_plugin_images_query` | 按精确 `step_id` 列出，`top` 1–500（默认 100），明确返回 `complete` |
| `d365_plugin_image_register` | 注册具名称、别名及显式字段的前/后/双映像 |
| `d365_plugin_image_update` | 按 `image_id` 修改名称、描述、别名、映像类型或选定字段 |
| `d365_plugin_image_delete` | 删除指定映像，保留父步骤 |

使用 snake_case，也接受 camelCase 别名（`stepId`、`imageId`、`entityAlias`、`imageType`、`dryRun`、`expectedFingerprint`、`ifMatch`、`allowUnprotectedUpdate`）；冲突或未知键校验失败。patch 内也接受字段别名。查询只投影映像元数据，不跟随原生续传链接。步骤缺失可能返回空查询结果，不能证明步骤存在或调用方可见全部注册。

注册预览示例：

```json
{
  "step_id":"11111111-1111-1111-1111-111111111111",
  "name":"Account before update",
  "entity_alias":"Before",
  "image_type":"PreImage",
  "attributes":["name","telephone1"]
}
```

注册/更新仅支持实体专属插件类型步骤上的 **Create、Update、Delete、Assign、SetState**。前四者使用 Target，SetState 使用 EntityMoniker。映像类型为 0/PreImage、1/PostImage、2/Both。Create 仅 PostImage，Delete 仅 PreImage；PostImage/Both 要求阶段 40/PostOperation。消息支持时 PreImage 允许阶段 10、20、40。异步要求阶段 40。暂不提供 Merge、Send、Route、DeliverIncoming/DeliverPromote 等消息属性映射的注册/更新；仍可查询其已有映像，精确定位的非托管可自定义映像可预览/删除。

字段必须为非空的 1–100 个逻辑名，转小写、去重并检查原生 IsValidForRead。拒绝空/全列选择。名称、别名、描述最多 256 字符，拒绝控制字符。注册要求名称、别名、类型、字段；更新要求非空 patch，保留省略字段。空字符串用于清除描述。不重写不支持的已有消息/关联属性映射。

修改默认 **dry_run=true**。审阅 `changes`、`step`、`canWrite`、`blockedBy`，然后以 `dry_run=false` 及预览 `fingerprint` 作为 `expected_fingerprint` 提交相同操作。映像、父上下文或同级注册变更会使预览失效。指纹是过期审阅检查，不是锁或服务器唯一约束；父步骤编辑及并发创建映像仍可能竞争，最终以原生平台校验为准。规划要求完整同级列表（最多 499 个映像）。禁止同一 Pre/Post 映像包中重叠的重复名称或别名；独立 Pre/Post 映像可名称不同但别名相同。

更新/删除要求明确 `ismanaged=false`、`iscustomizable.Value=true`，并检查映像表原生 IsOptimisticConcurrencyEnabled。为 true 时要求当前/传入具体 ETag；false/unknown 时预览阻止执行，除非显式 `allow_unprotected_update=true`，此时 If-Match:* 防止 upsert，但不防止并发修改。即使显式启用也不绕过具体 ETag 冲突。创建分配客户端 GUID，并在同一 POST 中绑定步骤。

成功写入后精确回读：创建/更新验证 ID、父步骤及保存字段；删除要求原生 404。回读失败保留 `saved=true` 和映像 ID。写入超时/传输不确定保留 `saved="unknown"`；确认拒绝/未发送为 false。不重放、不补偿删除。取消传入读取及写入；保存后取消可能导致回读无法确认。映像写入不发布表，也不证明插件运行时收到预期映像。不附加解决方案关联或程序集更新。

测试覆盖 Schema/别名、可用性、字段元数据、重复映像包、过期预览、并发、取消、已保存/未知失败阶段、模拟完整生命周期，以及模拟传输且阻断网络的 Online/NTLM/IFD 实际请求分支。真实权限、映像并发支持和运行时插件上下文仍须目标环境验证。

原生参考：[插件映像可用性及注册](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/register-plug-in)、[SDK 消息处理步骤映像 Web API 表](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/sdkmessageprocessingstepimage)。

## 程序集标识与兼容更新——步骤 6.6

| 工具 | 操作 |
|---|---|
| `d365_plugin_assembly_inspect` | 本地 DLL 元数据检查；无 CRM 设置也可运行 |
| `d365_plugin_assemblies_query` | 有界原生程序集元数据列表，可按精确 ID/名称筛选 |
| `d365_plugin_assembly_update` | 兼容性预览及已有程序集条件更新 |

检查/更新要求 `file_path` 或 `content_base64` 二选一，解码字节上限 16 MiB。Base64 必须规范；本地输入须为常规文件，采用有界读取及变更检查。不接受 URL 下载或调用方提供的标识清单。支持 assemblyId、filePath、contentBase64、dryRun、expectedFingerprint、ifMatch、allowUnprotectedUpdate 别名，拒绝未知键和别名冲突。

随附 `bin/assembly-inspector/AssemblyInspector.dll` 是从 `tools/assembly-inspector` 构建的小型 **.NET 10** 元数据读取器。Node 仅启动此固定辅助程序，经 stdin 传入 PE 字节。PEReader/MetadataReader 检查标识、TargetFrameworkAttribute、签名标志/签名是否存在、公共类型、已知 IPlugin/CodeActivity 继承、原生导入标志和程序集引用。不加载或调用被检查代码及其依赖。本地继承遍历有深度/循环限制，不解析外部/泛型继承。进程具有输入/输出上限、15 秒超时、取消支持，环境经清理以排除 CRM 凭据及 .NET 启动钩子设置。读取错误不含 stderr、DLL 字节或文件路径。这是进程分离和有界元数据解析，不是任意不可信二进制的安全沙箱；输入应是可信构建产物。

`inspection` 包含名称、四段版本、culture、publicKeyToken、框架、架构/标志、公共契约类型、引用、大小和 SHA-256。报告 `codeExecuted=false`、`cryptographicSignatureVerified=false`、`dependenciesResolved=false`。强名称令牌及非空签名字段属于标识证据，不证明签名密码学有效、IL 正确或目标服务器可加载/执行。

更新预览示例：

```json
{
  "assembly_id":"11111111-1111-1111-1111-111111111111",
  "file_path":"D:\\build\\Company.Plugins.dll"
}
```

预检读取已存程序集内容及真实元数据、原生并发设置、包列能力和少于 500 个已注册插件类型的完整可见列表。不读取步骤配置或程序集凭据。仅在表元数据发现 PackageId 后选择它，以兼容旧本地架构；能力查询不支持时失败，不假定没有包。程序集列表排除内容、用户名/密码及包专属新列，报告完整性且不跟随续传链接。

首批更新要求同时满足：

- 已有程序集明确非托管/可自定义、Database 来源、现有隔离模式为支持的 None/Sandbox；Online 要求 Sandbox。阻止 Microsoft.* 平台程序集及插件包程序集。
- 候选名称、规范 culture、公钥令牌与已存标识一致；已存标识也与实际字节相符，且有签名元数据。
- 四段版本保持 major/minor 不变，build/revision 不降低；允许同版本重建。major/minor 变化须另行规划注册/步骤迁移，本工具不创建或重定向步骤。
- 候选为 AnyCPU 托管 DLL（I386、仅 IL、无 Requires32Bit 或 P/Invoke 导入），且与旧二进制声明**相同 .NET Framework 目标**，支持范围 4.6.2–4.8。读取器 .NET 10 与插件目标无关；即使本地部署也禁止更改框架。
- 程序集引用的名称/版本/culture/公钥令牌元数据不变。依赖可用性及 SDK 真实性仍由平台验证。
- 每个可见注册类型保留名称、ID、程序集标识。候选公共、具体、非泛型、顶层 IPlugin 类型集合须与已注册名称完全一致。阻止增删类型、工作流类型、未解析继承及嵌套插件契约。不发送 PluginType POST/PATCH/DELETE，也不修改映像/步骤。

这些是保守静态检查。`canWrite=true` 不证明写权限、目标框架/API 可用、构造函数、业务行为、完整平台注册有效性，也不证明没有隐藏/未列出依赖。最终以原生平台为准。

更新默认 `dry_run=true`。审阅 `existing`、`candidate`、`registeredTypes`、`blockedBy`、`fingerprint`，随后以 `dry_run=false` 和该 `expected_fingerprint` 执行相同操作。已存二进制、程序集行、类型列表或候选字节变化会使审阅失效。指纹不锁定插件类型/步骤/依赖。内容完全相同时，验证预览及兼容性后返回 noChange，不写入。

二进制有变化时，由原生 IsOptimisticConcurrencyEnabled 决定保护方式。true 时要求当前/传入具体 ETag；false/unknown 时默认阻止，除非显式 `allow_unprotected_update=true` 且未提供具体 ETag，此时 If-Match:* 防止 upsert，但仍有并发窗口。具体 ETag 冲突绝不绕过。唯一写入是一次原生 PATCH，包含实际 Base64 内容及提取的版本；名称、culture、令牌、来源和隔离模式不可由调用方编辑。

保存后重读内容，比较 SHA-256 及程序集标识；还检查来源/隔离/包绑定，保留全部类型 ID/名称/工作流标志，并检查每个类型版本/culture/令牌与新二进制一致。回读失败/不匹配保留 saved=true 和程序集 ID。拒绝/未发送为 false；未知结果为 saved="unknown"。不重试、不选第二后端、不回滚。回读只确认存储元数据；插件执行及部署仍须独立验收。不自动 PublishXml 或关联解决方案。

使用 `npm run build:inspector`（.NET 10 SDK）构建辅助程序，或用 `npm run build:release` 重建完整发布。npm 包包含已编译读取器、runtimeconfig/deps 文件及读取器源码/构建脚本。安装包中的两个二进制工具需要 .NET 10 Runtime，元数据列表不需要。缺少读取器/运行时时，其他纯 Node 工具仍可用；专用错误为 D365_ASSEMBLY_INSPECTOR_UNAVAILABLE。

离线测试使用 `scripts/build-assembly-fixtures.mjs` 生成的真实签名 PE 样本，仅引用测试 SDK 桩，不是生产 SDK，不能部署。重新生成需要 .NET SDK 和 .NET Framework mscorlib 引用目录（可由 D365_FRAMEWORK_REFERENCE_DIR 指定）；普通测试使用随附样本。覆盖标识/版本、签名标志、原生导入、类型/继承边界、框架/依赖检查、并发/指纹、有界读取器失败、已保存/未知结果、全部认证分支及安装包本地检查。真实上传权限、原生版本/类型刷新、强名称验证及插件运行时行为仍未测试。

原生参考：[程序集注册/版本控制](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/register-plug-in)、[程序集约束](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/build-and-package)、[支持的 .NET Framework 目标](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/supported-customizations)、[程序集表](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/pluginassembly)、[类型标识字段](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/plugintype)、[元数据读取器](https://learn.microsoft.com/en-us/dotnet/api/system.reflection.metadata.metadatareader)。

## 现有字段、关系与键维护——步骤 6.7

三个工具通过原生元数据 PUT 和 ReactivateEntityKey 提供有界维护流程。Online、AD/NTLM、IFD 共用 Web API 传输，无须可选 .NET 二进制读取器。

| 工具 | 维护范围 |
|---|---|
| `update_model_column_settings` | 已有普通非托管自定义列中经审阅的设置 |
| `update_model_relationship` | 自定义 1:N 菜单/级联或 N:N 双侧菜单 |
| `reactivate_model_key` | 为已有 Failed 备用键提交新原生索引作业 |

均要求已有 `solution_unique_name`，已有架构名须采用其发布者前缀。PUT 解决方案头请求关联，但此处不验证成员关系/部署验收。重新激活只改变索引作业状态，不改变成员关系，原生 Action 请求体不带解决方案头。表/组件须明确允许自定义。此范围阻止虚拟/提供程序表、托管组件及未确认标识/权限。

全部默认 **dry_run=true**。预览强一致性原生读取并返回 `planHash`。审阅后用相同参数加 `dry_run=false`、`expected_hash` 等于 **planHash**、`allow_unprotected_write=true` 执行。不要使用 `definitionHash`：planHash 还绑定操作、patch、环境、解决方案及父元数据。计划变化会使审阅失效。此范围未确认元数据替换或索引 Action 有原子并发机制，指纹不是锁，不从业务表并发设置推断 If-Match 保护。无实际变更的 PUT 计划经审阅后返回 saved=false/noChange=true，不写入。写入/提交绝不自动重放。

camelCase 别名含 logicalName、attributeName、schemaName、solutionUniqueName、dryRun、expectedHash、allowUnprotectedWrite。字段 patch 还接受 maxLength、minValue、maxValue、requiredLevel、defaultValue、isAuditEnabled、isValidForAdvancedFind；关系 patch 接受 entity1Menu、entity2Menu。冲突/未知键失败。参数及完整元数据定义上限 2 MiB。保存与发布独立。

### 现有列设置

预览示例：

```json
{
  "logical_name":"new_project",
  "attribute_name":"new_reference",
  "solution_unique_name":"ExistingUnmanagedSolution",
  "patch":{"max_length":250,"required_level":"Recommended"}
}
```

从当前完整派生定义发现原生类型，支持 String、Memo、Integer、Decimal、Money、DateTime、Boolean、Picklist、MultiSelectPicklist 九种基础类型。列须明确为普通自定义存储：非托管、非主列、非逻辑、SourceType=0、AttributeOf=null、无自动编号格式。不重写计算、汇总、主名称/ID、伴生、自动编号、提供程序及其他类型。不接受类型/架构/名称变更、DateTimeBehavior 转换、字段安全变更或任意元数据 JSON。

| patch 设置 | 约束 |
|---|---|
| `max_length` | String 1–4000 或 Memo 1–1048576；只能保持或增加长度 |
| `min_value`, `max_value` | Integer/Decimal/Money；只能扩大当前范围 |
| `precision` | Decimal 0–10 或 Money 0–4；只能保持/增加，Money PrecisionSource 必须为 0 |
| `required_level` | None/Recommended/ApplicationRequired；当前级别也须属于这三种 |
| `is_audit_enabled`, `is_valid_for_advanced_find` | 显式布尔值，且原生托管属性允许修改 |
| `default_value` | Boolean true/false 或已有 Picklist 数字值；不支持清空默认值或 MultiSelect 默认值 |
| `format` | DateTime DateOnly/DateAndTime，须与保持不变的原生 DateTimeBehavior 兼容 |

Integer 范围 -2147483648–2147483647；此批次 Decimal/Money 范围 ±100000000000。修改前当前设置须可用且有效。缩短长度、收窄范围、降低精度须另行评估数据，此处拒绝。不扫描、重写或回填业务数据。必填/审计/搜索效果取决于原生平台及客户端；仅字段审计不会启用表/环境审计。

列/表 IsCustomizable 须允许修改。RequiredLevel/audit/advanced-find 须确认 CanBeChanged=true；其他设置要求 CanModifyAdditionalSettings.Value=true。保留完整定义，通过 PUT 和 MSCRM.MergeLabels=true 发送，移除传输注解及每用户标签。负载保留标签、选项定义、日期行为及无关属性。回读检查提交设置、列标识/存储和保留的关键定义；忽略原生 HasChanged 标志及标签数组顺序，但标签值变化仍属不匹配。列标签及选项值/标签变更仍用独立已有工具。

### 现有关系设置

提供 `schema_name`、`solution_unique_name` 和非空 `patch`。仅支持明确非托管的自定义关系。按原生类型读取完整定义，保留两端表/属性及交叉表标识。所有参与表须允许自定义。

1:N 使用 `patch.menu` 修改关联菜单、`patch.cascade` 修改指定级联值；N:N 使用 `patch.entity_1_menu` 和/或 `patch.entity_2_menu`，拒绝级联和共享菜单。不创建或修改查找目标、端点、架构、交叉表或基数。

菜单 patch 接受 behavior（UseCollectionName/UseLabel/DoNotDisplay）、group（Details/Sales/Service/Marketing）、非负 Int32 order 及本地化 `label`（`language_code`、`text`）。当前菜单须明确 IsCustomizable=true，UseLabel 要求可用标签。语言变更合并入现有标签，保留其他语言和原生菜单/视图 ID。旧服务器缺菜单能力时阻止编辑，不假定支持。

级联 patch 接受 assign/delete/merge/reparent/share/unshare。Delete 支持 Restrict/RemoveLink/Cascade，其他公开动作支持 NoCascade/Cascade。保留省略值及额外原生级联设置。其他级联选项/复杂关系不属此批次。级联变化可影响未来关联记录的删除、所有权、访问。MCP 不模拟原生父子/跨关系限制，预览不证明平台会接受配置。

保存向 RelationshipDefinitions(id) 发完整类型定义 PUT，带 MSCRM.MergeLabels=true。回读检查端点/交叉表标识，以及已改和保留的菜单/级联设置。通过审阅后的 publish_model_table 单独发布相关整表，可能包含其他待发布自定义。运行时级联及菜单 UI 须真实验收。

### 失败备用键索引的重新激活

预览示例：

```json
{
  "logical_name":"new_project",
  "schema_name":"new_ReferenceKey",
  "solution_unique_name":"ExistingUnmanagedSolution"
}
```

仅明确非托管/可自定义且原生索引状态 Failed 的键可用。Pending/InProgress/Active/Unknown 预览返回 canSubmit=false，禁止执行。从键元数据读取真实 LogicalName，以 EntityKeyLogicalName 和 EntityLogicalName 调用 `ReactivateEntityKey`。不从 SchemaName 猜测逻辑名，不改键列，不删除重建键，不修重复、不清记录或取消作业。提交前使用 get_model_key 及可选作业检查调查并修正原因。

Action 成功只代表 **submitted=true**，与 Active 独立。随后一次元数据读取检查键标识/列及当前索引。新非零 AsyncJob GUID 与旧 GUID 不同时才确认新作业链接；大小写不同不算。Pending/InProgress 不代表可用，仅观测到 Active 才是。仍显示旧作业或 Failed 时报告 accepted_new_job_not_confirmed，不重复提交。新关联作业已 Failed 时，D365_MODEL_KEY_INDEX_FAILED 保留 submitted=true。稍后用 get_model_key 检查；不轮询或安排后续任务。

PUT 回读失败/不匹配保留 saved=true；原生 Action 回读失败保留 submitted=true，不撤销接受状态。确认拒绝/未发送为 false；不确定 PUT/提交为 null，重试前须检查。取消传入全部读写。保存成功或 Action 被接受均不证明已发布、索引完成、运行时正确或部署成功。

离线测试覆盖九种列类型、限制/托管属性、完整定义/标签保留、1:N/N:N 设置、指纹、未知/已保存/已提交阶段、原生键状态/作业标识、取消及模拟传输的三种认证分支。不请求真实 CRM。权限、元数据 PUT/Action 支持、级联规则、发布/UI 效果及实际索引恢复仍未验证。

原生参考：[列替换](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/create-update-column-definitions-using-web-api)、[关系替换及 MergeLabels](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/create-update-entity-relationships-using-web-api)、[托管必填级别](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/attributerequiredlevelmanagedproperty)、[关系菜单](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/associatedmenuconfiguration)、[键索引生命周期](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/define-alternate-keys-entity)、[ReactivateEntityKey](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/reactivateentitykey)。

## 原生 Action/Function 调用——步骤 7.1

按用户要求，开发进入步骤 7。步骤 6 余下选项/元数据/UI/插件扩展仍明确未完成。此批次新增 `get_api_operation` 并强化已有 `call_d365_api_action`，不创建 Custom API 定义、Ribbon 命令或解决方案。

### 兼容性与发现

原调用工具保留名称和默认行为：`is_function=false` 立即用 POST 调用 Action，`dry_run=false`，结果仍为原生数据，无新外层结构。原生 204 返回 null。`return_details=true` 可返回含 HTTP 状态/数据、所选签名及执行/提交状态的回执；不证明异步过程已完成，也不执行业务专用回读。源码级 RecordService.callD365Action 也复用同一实现；仅数据客户端不编造 HTTP 状态。

新校验要求访问当前 `GET /$metadata`。CSDL 不支持/缺失、类型错误、未声明名称、重载歧义，以及旧字符串拼接曾接受的任意 URL，现均在调用前失败，无跳过校验回退。名称及原生参数/属性名区分大小写。Action 仅 POST，Function 仅 GET，并从对应 CSDL 元素选择。调用的 `is_function` 仍默认 false。

`get_api_operation` 接受精确 `action_name` 及可选 `is_function`、`binding`、`signature_id`，返回重载签名、输入可空性/约束、绑定、返回类型、导入名及直接输入类型定义。不递归展开嵌套输入类型。无可调用导入的未绑定查询函数标记 invocable=false。元数据可见不证明有调用权限，也不证明序列化器支持全部公布类型。

每次调用读取最新 CSDL，不缓存可能过期的签名。架构别名解析为限定名，不获取外部引用。XML 校验命名空间，限制 32 MiB、500000 个 token/元素、64 层，拒绝 DTD/实体声明、重复签名/属性及不支持的继承循环。操作/类型/成员集合均有界；类型继承最多 32 层。大型环境超过上限明确失败，不切换为未校验调用。

### 绑定与重载

绑定 Action 的预览示例（该操作须真实存在）：

```json
{
  "action_name":"new_ProcessAccount",
  "binding":{
    "collection_name":"accounts",
    "id":"11111111-1111-1111-1111-111111111111"
  },
  "parameters":{"Comment":"Reviewed"},
  "dry_run":true
}
```

实体集来自当前 CSDL，实际实体类型须可赋给原生绑定类型。单实体绑定要求 GUID `id`，集合绑定省略 id。首个 CSDL 参数由 URI 提供，不能再出现在 `parameters` 中。绑定调用使用完整原生限定操作名；未绑定调用使用公开导入名，不接受调用方拼装端点。暂不提供导航绑定路径或备用键绑定。

多个重载通过绑定和值校验时，调用以歧义失败；应查询签名并提供选定 `signature_id`，服务绝不取第一个匹配项。必填缺失或多余参数均失败。Action 可省略可空参数；Function 要求参数出现，除非 CSDL 带 OptionalParameter 注解。显式 null 须被声明类型允许。绑定及已知输入继承使用同一当前文档校验。

### 输入值与 Function 编码

支持的基础输入含 String/Boolean、Byte/SByte/Int16/Int32/Int64、Decimal/Single/Double、Guid、Date/DateTimeOffset/TimeOfDay/Duration、Binary 及有界集合。Stream/地理空间/未声明外部类型等非 null 值会被拒绝。校验原生枚举成员名和 IsFlags 列表。结构化复杂属性使用声明类型及必填字段。实体对象是部分记录，不是整行替换。

Int64 接受安全 JavaScript 整数或原生范围内的精确有符号十进制字符串。Decimal 接受有限、非指数形式数字/字符串，强制显式原生 precision/scale（未指定 precision 时本地上限 38 位）。无法用 JavaScript 数字精确表示的值请用字符串。POST 使用 application/json;IEEE754Compatible=true，并将 Int64/Decimal 输出为字符串。Single/Double 必须有限。时间值使用显式原生 ISO 格式；DateTimeOffset 要求 Z 或 ±14 小时以内偏移。Binary 必须规范 Base64。String 拒绝无效未配对 Unicode 代理项。

结构化/实体输入可用显式 @odata.type 选择已知具体兼容类型；抽象实体必须提供，除非引用已给出类型。仅接受已声明结构属性。不支持导航/深度插入属性、@odata.bind 或任意开放属性。

如 {"@odata.id":"accounts(GUID)"} 的引用必须指定当前服务实体集和 GUID。拒绝完整 URL、导航路径、引用/数据混合对象和备用键 URI。Function 将相对 @odata.id 引用序列化为 JSON；Action 转换为 @odata.type 加 CSDL 中该表实际单一 Guid 主键属性。递归验证兼容内联记录及复杂值。集合最多 1000 项，值遍历最多 10000 节点/20 层，全部参数最多 1 MiB 且为有界无循环 JSON。调用方字符串不会当作 OData 表达式。

每个 Function 值放入编码查询别名，不直接放入操作路径。例如 O'Brien / 中文 会表示为单引号重复转义的引号字面值，再对完整别名值进行百分号编码。复杂/集合值用 JSON 别名；枚举/duration/binary 用原生字面形式。编码后 Function URL 上限 32 KiB。不跟随外部引用或原生分页链接。

### 预览、回执与失败证据

`dry_run=true` 仅读元数据并校验/序列化请求，返回 `planHash`、解析签名/绑定和参数名。默认隐藏值及 Function 查询 URL；显式 `include_parameter_values=true` 才显示规范化明文值、端点和 POST 请求体。预览不调用操作，也不验证业务数据/权限。

可选 `expected_hash` 等于预览 planHash 时，执行前检查当前元数据、环境、绑定及规范化参数；不锁定记录或防止并发业务变更。为保持兼容，已有即时调用工具不强制预览或指纹。

`return_details=true` 为原生数据/状态增加 executed/submitted 信息。成功仅表示收到原生响应，不泛指发布完成、索引就绪或业务完成。确认拒绝/未发送为 false；结果不确定保留 null。错误不回显参数值、原始传输错误或平台文本。服务不重试 Action 或切换后端；仍采用共享认证刷新及有界 GET 重试。成功 Action 清空现有缓存。取消传入元数据及调用请求。

支持 actionName、isFunction、signatureId、dryRun、expectedHash、returnDetails、includeParameterValues、binding.collectionName 别名。拒绝冲突和未知顶层/绑定键。原生参数/属性名不做别名规范化。

离线测试覆盖 CSDL 解析/可见性、精确签名/重载、实体/集合绑定、继承类型、基础类型/约束/枚举/复杂值、相对引用、特殊字符编码、限制、预览、失败阶段、旧响应及三种模拟认证请求分支。真实 CSDL 大小、权限、自定义业务规则、服务器序列化差异和实际执行未验证，未连接真实 CRM。

原生参考：[服务 CSDL](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/web-api-service-documents)、[Action 绑定及实体参数](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/use-web-api-actions)、[Function 绑定及别名](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/use-web-api-functions)、[OData URL 字面值及参数别名](https://docs.oasis-open.org/odata/odata/v4.01/odata-v4.01-part2-url-conventions.html)。

## 解决方案成员关系与依赖检查——步骤 7.2

四个工具使用原生 solution/solutioncomponent 读取、三个依赖 Function 及 AddSolutionComponent。只需 Node 和现有 Web API 传输，不引入 SDK 进程、UI 自动化或新依赖。

| 工具 | 范围 |
|---|---|
| `list_solutions` | 可选精确唯一名称/解决方案 ID/托管筛选 |
| `list_solution_components` | 指定解决方案的可见成员行，可按对象 ID/类型筛选 |
| `get_solution_component_dependencies` | required、dependent 或 delete 方向依赖 |
| `add_solution_component` | 将一个已有受支持组件受控添加到普通非托管解决方案 |

### ID、可见性与分页

组件的**原生对象/元数据 GUID** 与 **solutioncomponent 成员行 GUID** 不同。component_id 应提供前者，component_type 提供原生组件类型码。表的对象 GUID 是 MetadataId，不是 ObjectTypeCode 或业务记录 ID。成员读取分别返回 solutioncomponentid、objectid、componenttype、解决方案 ID、根组件 ID 和 rootcomponentbehavior。

根行为 0 表示包含子组件，1 表示不包含子组件，2 表示仅外壳。行描述所选成员关系和根设置，不列举实际导出 ZIP 内容，不计算父表隐式覆盖或全部传递部署需求。完整可见成员列表不是可移植/可部署证明。

读取返回 count、items、含 complete/hasMore/页边界的 paging、visibility=current_caller、snapshot=false。top 是本地返回行上限（默认 500，最大 5000），max_pages 默认 5，最大 20。原生请求一致使用 Prefer:odata.maxpagesize 及服务器 nextLink/skiptoken，不混用原生 $top，不构建 $skip。可能额外读一行仅识别截断，不返回该行。

续传必须保持配置组织/API、集合或 Function、filter/select/order 和参数别名范围一致。支持绝对及同服务根相对链接。跨服务/路径/查询变更、重复页/ID、重复分页选项、格式错误行及超大页会失败，不视为完整。页/结果上限 5 MiB，每原生页最多 5000 行。不接受调用方任意续传。后续调用重新开始有界查询，不提供新持久游标。

目录可检查托管/系统解决方案。受控添加要求唯一解析的可见非托管解决方案，无父/补丁方案，拒绝 Default/Active/System 目标。成功添加后重读目标标识/状态。可在非托管目标引用源托管组件，但本工具不编辑其定义/托管属性。最终以原生权限及平台限制为准。

### 依赖方向

提供 component_id/component_type 及 direction（默认 required）：

| direction | 原生 Function | 含义 |
|---|---|---|
| required | RetrieveRequiredComponents | 所选组件直接需要的组件 |
| dependent | RetrieveDependentComponents | 直接依赖所选组件的组件 |
| delete | RetrieveDependenciesForDelete | 可能阻止删除的原生依赖记录 |

当前 CSDL 须公开预期的未绑定 Microsoft.Dynamics.CRM Function 及 ObjectId/ComponentType 参数。复用步骤 7.1 的解析、值校验和 Function 字面序列化。结果投影依赖类型、必需/依赖对象 ID/类型、父/基础解决方案 ID 及可选 dependencyid。两端标识可用时允许无 dependencyid；格式错误端点不静默丢弃。不返回任意代码、插件配置或原生响应文本。

依赖读取不删除或移除任何内容。空结果不证明权限充分、不存在任何阻碍、已得到传递闭包或部署成功。canDelete 保持 not_assessed。禁止/不可用请求与成功空集合明确区分。不支持契约或分页时显式失败，不替换成未校验 Function 请求。

### 受控添加

预览示例：

```json
{
  "solution_unique_name":"ExistingUnmanagedSolution",
  "component_id":"11111111-1111-1111-1111-111111111111",
  "component_type":61
}
```

Attribute（2）及 Entity Key（14）还须提供父表 logical_name。解析器读取原生组件，验证 GUID、父上下文、标识/显示信息及状态。支持添加：

| 类型 | 组件 |
|---|---|
| 1 | 表/实体元数据 |
| 2 | 属性元数据；要求父表 logical_name |
| 9 | 全局选项集元数据 |
| 10 | 标准实体关系元数据 |
| 14 | 实体键元数据；要求父表 logical_name |
| 26 | 公共保存查询 |
| 60 | 系统表单 |
| 61 | Web 资源 |
| 90 / 91 / 92 / 93 | 插件类型 / 程序集 / 步骤 / 映像 |

其他类型仍可通过原生依赖 Function 查询，但本批次不提供受控添加。源读取仅选标识字段，排除 DLL/脚本内容、FetchXML/FormXML、安全/非安全配置。仅验证已有对象标识，不是逐字节审阅完整定义或导出负载。

添加默认 **dry_run=true**。预检读取目标、真实组件、当前 CSDL、完整可见成员清单及原生必需依赖。成员/依赖基线最多 5000 行/20 页；不完整即阻止规划。预览显示原生请求、所选对象、当前成员关系和依赖证据。

范围固定为 AddRequiredComponents=false、DoNotIncludeSubcomponents=true，不提供自动展开全部依赖或包含整表对象的选项。仅当前 CSDL 声明 IncludedComponentSettingsValues 时发送空集合，旧契约省略。缺控制标志、类型改变、其他命名空间或未知参数均判定不支持，不扩大范围回退。平台仍可能创建隐式父外壳或其他成员产物。

审阅后以相同参数加 dry_run=false、expected_hash=planHash、allow_unprotected_write=true 执行。计划绑定环境、解决方案/源标识字段、CSDL、请求、可见成员和必需依赖基线；它不是锁，不冻结组件内容，也不防止并发解决方案/关系图变更。不将业务表 ETag 当作解决方案/依赖锁。

已有匹配显式成员行时返回 noChange=true/saved=false，保留现有根范围，不收窄已有更广包含关系。不从父根推断隐式成员/导出覆盖。唯一修改为原生 AddSolutionComponent POST，不直接创建/更新 solutioncomponent 行，也不创建、移除或删除组件/解决方案。

确认 Action 响应后重读解决方案及完整成员清单，验证对象/类型成员关系，若响应含 **id** 则关联匹配 **solutioncomponentid**。添加表还验证 rootcomponentbehavior=1。新增/删除/改变成员行仅作为非事务前后观测报告，不证明每项差异均由本请求导致；隐式外壳行保留在差异中。不自动 PublishXml、导出、部署或包含全部依赖。

拒绝/未发送保留 saved=false，Action 未知保留 saved=null。回读失败/不匹配/清单不完整保留 saved=true、phase=readback、目标及对象标识。不重放 Action 或补偿删除。取消传入元数据、依赖、成员读取及原生 Action。结果不确定时先检查解决方案，再判断是否还需操作。

别名含 solutionUniqueName、solutionId、componentId、componentType、logicalName、maxPages、dryRun、expectedHash、allowUnprotectedWrite。原生成员/依赖响应字段名不变。拒绝未知输入、别名冲突和全零对象/解决方案 ID。

测试覆盖十二种添加类型、目录/成员筛选、依赖方向、CSDL 差异、原生分页/范围校验、源/目标边界、预览指纹、重复/无变更、隐式外壳、已保存/未知阶段、回读标识、取消及三种模拟认证实际请求分支。未连接真实 CRM；原生权限、实际包含行为、导出内容和部署可移植性未验证。初始导入/导出及异步跟踪见下文；组件移除、传递图分析和破坏性清理不属此范围。

原生参考：[解决方案组件成员关系](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/solutioncomponent)、[依赖消息](https://learn.microsoft.com/en-us/power-platform/alm/check-solution-dependencies)、[AddSolutionComponent](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/addsolutioncomponent)、[返回的成员行 ID](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/addsolutioncomponentresponse)、[原生 OData 分页](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/query/page-results)。

## 解决方案 ZIP 传输与异步导入——步骤 7.3 初始范围

四个工具使用 Node 和同一配置 Web API 客户端，无须 .NET、PAC CLI、PowerShell 模块或独立 SDK 传输。Online、AD/NTLM、IFD 使用现有认证分支。当前 CSDL 须公开精确支持的原生 Action/响应契约；不可用/不兼容时提交前拒绝，不切换后端或调用未校验 URL。

`inspect_solution_package` 要求 `file_path` 或 `content_base64` 二选一。本地路径须绝对，不支持网络/设备路径。接受 camelCase，拒绝冲突。无 CRM 设置也可检查，不解压文件、不执行脚本/DLL；返回 ZIP SHA-256、大小、条目数及精简 `solution.xml` 标识摘要：唯一名、版本、托管标志、发布者/前缀、根数量、声明缺依赖数。不返回包 Base64、完整 XML、脚本或 DLL 字节。

ZIP 范围有界：压缩后 ≤32 MiB、≤10000 条目、每项声明解压内容 ≤64 MiB、总计 ≤256 MiB、solution.xml ≤2 MiB。支持 stored/deflate、有/无签名数据描述符、ASCII 及严格 NFC UTF-8 文件名。检查头、local/central 大小、全部负载 CRC、完整 deflate 消费及文件范围不重叠。拒绝加密、多磁盘/ZIP64、符号链接、替代 Unicode 名称扩展、绝对/遍历/设备路径、重复/大小写冲突及文件前缀冲突。必须包含 solution.xml、customizations.xml、[Content_Types].xml。清单支持有界无命名空间 ImportExportXml、UTF-8 或带 BOM UTF-16LE；拒绝 DTD/实体、错误/歧义标识及过度结构。这是归档/清单标识验证，不是完整组件 XML Schema 检查、代码审计、数字签名验证、依赖闭包、环境对比或部署就绪证明。归档可包含任意组件内容，实际导入语义仍由平台验证。

`export_solution` 要求可见普通非托管源解决方案及新的绝对 `output_path`（.zip 结尾）。`managed` 默认 false，true 请求从同一非托管源导出托管包。补丁、内置/保留方案及托管源不属此流程。默认预览：

```json
{
  "solution_unique_name": "TransferDemo",
  "output_path": "D:\\Exports\\TransferDemo.zip"
}
```

使用 `dry_run:false` 和返回的 `planHash` 作为 `expected_hash` 执行。指纹绑定配置环境、原生 WhoAmI 组织/用户/业务部门、源标识/状态、当前 CSDL、请求体及解析后的输出目标，不冻结源内容，也不使预览成为快照。仅调用原生 ExportSolution；声明的设置导出标志均为 false，不使用弃用 TargetVersion、内部或组件选择参数。不发布；导出遵循原生已发布状态语义。

执行在原生导出前独占预留目标，不覆盖现有文件。返回归档须匹配审阅名称/版本/托管模式、通过 ZIP 校验，并匹配本地回读哈希和文件标识。成功区分 `exported:true` 与 `localSaved:true`。原生/验证/文件系统失败保留阶段/导出证据及预留路径；文件可能为空或不完整，不能当作有效导出。后续尝试应选择新目标。不自动删除文件、覆盖产物或重放超时导出。

`import_solution_async` 同样默认预览，输入与检查工具相同。首批仅允许普通**非托管首次导入**，当前不得可见同唯一名解决方案。托管导入、已有方案更新、补丁/暂存/升级及环境变量/连接引用覆盖需后续流程。可见不存在仅限当前调用方，不证明全平台不存在或权限充分。

```json
{
  "file_path": "D:\\Exports\\TransferDemo.zip",
  "dry_run": true
}
```

审阅清单、目标环境和公开原生请求体后，以相同输入、`dry_run:false`、`expected_hash:planHash`、`allow_unprotected_write:true` 执行。每次调用只读一次包字节并保留；指纹使用真实哈希，不只文件名。字节、原生调用者/组织、CSDL 或计划变化会使审阅失效。Action 未确认有原子计划/解决方案/组件锁。**首次导入也可能改变共享非托管组件。** OverwriteUnmanagedCustomizations=false 只保护原生 API 说明的特定托管覆盖层行为，不普遍保证已有非托管定义不变。

原生请求体固定 OverwriteUnmanagedCustomizations/PublishWorkflows=false；声明时还固定 SkipProductUpdateDependencies/HoldingSolution/StageAndUpgrade/SchemaUpdatesOnly=false、ComponentParameters=[]。不跳过依赖、不请求激活工作流、不暂存升级、不覆盖环境，也不单独发送 PublishXml/PublishAll。导入仍可能产生平台副作用，不能由这些标志推断更广泛的不发布/不激活保证。

执行时为原生 **ImportJobId** 生成客户端 GUID。接受响应返回 **AsyncOperationId** 和 **ImportJobKey**；后者是字符串键，与提交 GUID 分开保留并明确报告是否匹配。提交的 importJobId 尚未回读验证。`accepted:true` 不代表 `completed:true` 或部署已验证。拒绝/未发送为 accepted=false；网络/服务器结果未知为 accepted=null，并保留提交 importJobId。考虑新提交前先检查该作业。HTTP 已接受但回执格式错误保留 accepted=true。任何路径均不自动重提、切换传输、补偿或发布。现有请求层认证刷新不变。

`get_solution_import_status` 接受回执 `async_operation_id` 和/或 `import_job_id`。每次仅执行一次有界读取，不 sleep、自动轮询、调度、取消、重启或重提。异步 state 3 配 status 30/31/32 分别为 succeeded/failed/cancelled；未终结仍 pending 或 unknown。原生 operationtype=203 独立作为解决方案导入类型证据。importjob progress（含 100）不证明成功。若提供解决方案 ID/名，可单独查目录验证标识，但不验证内容、相对包版本、发布、运行时/UI 或用户所给作业 ID 的因果关联。禁止、不可用/隐藏/删除和读取失败与成功空结果区分。不选择/返回原始数据、消息、日志、配置。接受、异步终态、进度、标识回读和完整部署验证是独立概念。

离线覆盖错误 ZIP、源/包/元数据/调用者变化、契约兼容、独占输出与标识/哈希校验、拒绝/未知/接受提交、无效回执、独立状态/回读缺口、取消、路由及三种模拟真实请求分支。真实导入/导出、证书/代理/权限及平台副作用未验证。初始环境对比、选定范围检查、显式日志检索见下文；审阅后的已有/托管/升级流程及异步导出仍待实现。

原生参考：[ExportSolution](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/exportsolution)、[导出响应](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/exportsolutionresponse)、[ImportSolutionAsync](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/importsolutionasync)、[导入回执](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/importsolutionasyncresponse)、[系统作业状态](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/asyncoperation)、[导入作业字段](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/importjob)。

## 可移植解决方案快照、选定范围检查与导入日志——步骤 7.4 初始范围

四个工具均只读，使用 Node 和现有 Web API 客户端，无须 .NET/PAC CLI 或第二认证后端。绝不发布、导入、修复、删除、重试已提交导入、自动轮询或安排任务。

`get_solution_snapshot` 捕获**当前配置**环境，接受 `solution_unique_name`、`top`（默认 100，最多 200 个可见成员）及 `max_pages`（默认 5，最大 20）。示例：

```json
{"solution_unique_name":"TransferDemo","top":100,"max_pages":5}
```

结果 `snapshot` 对象版本为 d365.solution.snapshot.v1，含 capturedAt、WhoAmI 组织/用户/业务部门、解决方案标识、显式成员/根、选定定义/哈希及完整性/稳定性证据。将完整对象保存为 JSON 或直接传比较工具。源和目标通过分别配置的 MCP 服务器/会话捕获。不接受目标 URL/凭据，不将一个环境令牌切换/复用于另一个。

初始组件配置覆盖：

| 类型 | 选定属性 |
| --- | --- |
| 1 表 | 逻辑/架构/集合/主属性名、所有权/活动/审计值及本地化标签/描述 |
| 9 全局 Picklist | 名称/类型/全局范围、标签/描述、值及选项标签/描述/颜色 |
| 10 关系 | 架构/类型、1:N 端点/Lookup 名及六项级联设置，或 N:N 端点/交叉表名 |
| 61 Web 资源 | 原生名称/显示名/类型及精确内容字节 SHA-256/长度 |
| 91 插件程序集 | 名称/版本/culture/公钥/来源/隔离及精确二进制 SHA-256/长度；仅非包 Database 来源 |

每个 Web 资源/程序集二进制内容上限 16 MiB，绝不返回或执行。这是字节比较，不是脚本语义规范化或 DLL 行为/签名验证。包/不支持程序集、内容缺失均明确为缺口；环境缺选定原生属性也可能为缺口。快照 ≤2 MiB、选定组件 ≤64 KiB、每标签集合 ≤128 语言、全局 Picklist ≤1000 值。成员分页沿用同服务/路径/查询检查。部分定义续传、无效 ID/标签、不支持配置和读取失败不能变成完整定义。

仅捕获选定属性，不含表属性/子组件展开、完整关系菜单/设置、表单/视图 XML、工作流/步骤/映像定义、Custom API、Ribbon、托管层、依赖闭包及环境变量/连接引用比较。根 include-all 不证明其嵌套负载已检查。按普通方式读定义，不请求未发布读取或发布，发布状态仍未验证。会重读成员/方案状态检测已观测变化，但不冻结定义、不宣称原子快照。调用方可见性、截断、不支持组件和检测到的变化在 `coverage` 中明确保留。

`compare_solution_snapshots` **无须 CRM 配置**，接受源和目标 `snapshot` 对象（`source_snapshot` / `target_snapshot`），严格验证版本结构、大小、规范属性、组件哈希及 snapshotHash。哈希检测一致性，不保证真实性，调用方可编辑并重算；解释结果应使用可信基线。

可移植键使用逻辑/架构名、Web 资源名或程序集标识。环境/解决方案/组件/成员/标签 GUID 保留作证据，但不参与选定定义匹配。根成员引用经可移植根键映射。LocalizedLabels 按 LCID 排序，忽略 UserLocalizedLabel 及传输 ID；选项按数字值排序。**选项显示顺序不在比较范围。** 不剥离代码/二进制中有意义的 GUID 字面值，二进制须精确匹配。

结果包括方案名称/版本/托管差异、`missingInTarget`、`extraInTarget`、变更组件引用及属性路径、匹配键、歧义标识、未解析根范围和证据缺口。`expected_managed` 可显式选择目标状态，例如非托管源导出托管包时 true；版本仍与基线比较。

`selectedScopeCheck` 为 matched、different 或 inconclusive。不支持/隐藏/禁止组件、不稳定/不完整清单、重复可移植键及未知根会令结论不确定，已知差异仍报告。对侧清单有未解析行时，未匹配键置于 `unmatchedInSource` / `unmatchedInTarget`，不断言确认缺失/额外。始终保持 deploymentVerified=false、publicationVerified=false、nestedComponentsVerified=false；即使完整匹配也只覆盖本配置。

`verify_solution_deployment` 接受 `expected_snapshot`、可选 `expected_managed` 和同样分页限制，捕获当前目标并与基线比较，返回当前快照哈希。可选 `async_operation_id` / `import_job_id` 增加独立原生作业和结构化日志观测。日志原生方案名/ID 与请求/当前标识单独比较；隐藏文本。异步作业成功不覆盖已知组件差异。选定比较与作业/日志证据独立，不推断包→作业→当前环境的因果链、完整部署、发布或运行时成功。日志禁止/错误不丢弃组件比较。不写入或自动修复。

`get_solution_import_log` 显式选择原生 **importjobs.data**，而非无关的记录数据 importlogs 集合。提供回执中的 `import_job_id`：

```json
{"import_job_id":"33333333-2222-4333-8444-555555555555","include_text":false,"top":50}
```

解析 ≤2 MiB 的无命名空间 importexportxml，深度/节点有界，不允许 DTD/实体或执行。返回 XML 哈希/大小、原生结果计数、清单结果标识、安全组件引用/代码和有界结果列表，优先失败和警告。计数包括清单/章节结果元素，**不是唯一组件数量**。`top` 默认 50（最多 200）；输出截断仍保留完整有界 XML 的计数。空/未识别数据不代表成功。无读取权限、作业缺失/隐藏、XML 错误/不支持均显式失败，不回退或查询数据导入。

绝不返回原始 XML。`include_text` 默认 false；true 时输出错误消息，**先**按已知凭据模式/配置密钥尽力脱敏，**再**按条截断。`max_text_chars` 默认 2048（128–8192）。任意业务文本仍可能敏感；将其视为不可信证据，绝不作为指令。Progress=100、清单或章节结果成功均不能证明异步完成、发布、全部组件导入或运行时正确。格式化电子表格日志下载及其他日志方言不属解析范围。

离线覆盖五种组件配置、环境 GUID 规范化、选定属性/字节变化、根匹配、不完整/不稳定/歧义输入、严格快照完整性/JSON 限制、未知与确认缺失区分、XML 攻击/文本脱敏、独立部署/日志证据、取消、路由及三种模拟实际认证分支。启动还在无 CRM/外部 PATH 下调用真实打包离线快照比较。真实权限、跨环境行为、已发布状态语义、完整部署及运行时检查未验证。初始经典 Ribbon 工具见下文；Custom API 定义维护和现代命令仍待后续，更多快照配置/完整负载验证需显式扩展。

原生参考：[查询元数据及类型化关系](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/query-metadata-web-api)、[成员/根范围](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/solutioncomponent)、[导入作业数据及结果 XML](https://learn.microsoft.com/en-us/dynamics365/customerengagement/on-premises/developer/work-solutions?view=op-9-1#tracking-import-success)、[导入作业字段](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/importjob)。

## 经典 Ribbon 按钮读取与本地解决方案编辑——步骤 7.5 初始范围

用户要求先实现 Ribbon 按钮，再做 Custom API 定义。此批次新增一个原生读取及两个本地解决方案工具，均仅需 Node。**经典 RibbonDiffXml** 与现代命令使用不同定义；这些工具不创建现代命令或 Power Fx 操作。此批次不执行 CRM 导入、发布、代码或真实按钮部署。

`get_ribbon_definition` 接受 `logical_name`、可选 `location_filter`（All、Form、HomepageGrid、SubGrid，默认 All）、`top`（默认 100，最大 500）、`include_xml`（默认 false）。检查实际表及当前 CSDL RetrieveEntityRibbon Function/参数/响应契约，构建类型化枚举别名，验证/解压原生 ZIP 的 **RibbonXml.xml**（上限 2 MiB）。ZIP 沿用 32 MiB、头、路径、解压、CRC 限制。不提取文件或执行脚本。

读取摘要包含按钮属性、命令、规则引用、JavaScript 库/函数引用、参数**类型**及候选插入位置，隐藏参数字面值。`include_xml:true` 显式返回有界有效 XML，可能含敏感参数字面值。截断明确标识。合并后有效 Ribbon XML 是 ID/位置证据，不是可编辑方案差异、逐用户可见性/安全结果、发布证明或浏览器处理器正常工作的确认。

`inspect_ribbon_solution` 无须 CRM 设置。提供绝对本地 `file_path` 或规范 `content_base64` 二选一，加表 `logical_name`。复用完整 ZIP 校验，在 **customizations.xml** 定位唯一 Entities/Entity/Name 及 RibbonDiffXml，返回有界摘要。可选 `include_xml:true` 仅返回该表差异，不返回其他自定义或资源负载。不支持应用/全局 Ribbon，不接受原生合并定义替代差异。

`edit_ribbon_solution` 是本地候选构建器。接受同样包输入/表、1–20 个有序 `changes`、新的绝对 .zip `output_path`，及可选 `dry_run`/`expected_hash`。顶层接受 camelCase；嵌套 changes 使用精确 snake_case Schema。输入须为普通非托管包，不得是托管、补丁/父方案或保留内置方案。

支持的变更：

| operation | 范围 |
| --- | --- |
| add_button | 新增独立 CustomAction/Button 和 JS CommandDefinition、多语言标签、包内两个栅格/ICO Web 资源图标及显式有序参数 |
| update_button | 修改发布者范围内已有独立自定义按钮的标签和/或顺序；保留处理器/规则及独立提示引用 |
| set_visibility | 为未共享、发布者范围内的自定义命令添加/移除专用恒假显示规则门控；其他显示规则/层仍生效 |

ID 必须以解决方案发布者前缀加 `.` 或 `_` 开头，互不重复且不与已有定义 ID 冲突。不支持内置替换、任意命令/XML、嵌套菜单/弹出菜单编辑、处理器替换、通用规则编辑、全局 Ribbon、全部删除操作或托管层变更。

新增要求**显式**当前表位置，如 Mscrm.Form.demo_table.MainTab.Actions.Controls._children。先用原生读取检查当前 ID；本地编辑器只校验位置格式/表范围，不验证真实目标是否存在，不假定所有环境同一分组。支持 Form、HomepageGrid、SubGrid。调用方提供限定 JavaScript 函数及有序 crm/string/bool/int 参数。支持 PrimaryControl、SelectedControl、SelectedControlSelectedItemIds、SelectedControlSelectedItemReferences。不执行或证明函数存在、签名或浏览器/上下文行为。

JS 和图标引用必须唯一存在于同包 WebResources 元数据，具已有 ZIP 内容且类型受支持：JS=3，图标=5/6/7/10。根相对 FileName 引用及反斜杠仅在已验证归档内解析。不假定缺失但目标环境可能有的资源存在。不创建/上传资源，不验证图片尺寸/内容有效性或资源发布。标签编辑保留现有动作。

以下预览假设包发布者前缀为 **demo**，且已包含指定 JS/图标资源：

```json
{
  "file_path":"D:\\Exports\\RibbonDev.zip",
  "logical_name":"demo_table",
  "output_path":"D:\\Drafts\\RibbonDev.buttons.zip",
  "changes":[{
    "operation":"add_button",
    "button_id":"demo.table.Check",
    "command_id":"demo.table.Check.Command",
    "custom_action_id":"demo.table.Check.Action",
    "location":"Mscrm.Form.demo_table.MainTab.Actions.Controls._children",
    "sequence":200,
    "labels":[{"language_code":2052,"text":"检查资料"},{"language_code":1033,"text":"Check details"}],
    "library":"demo_/buttons.js",
    "function_name":"Demo.checkDetails",
    "parameters":[{"type":"crm","value":"PrimaryControl"}],
    "image_16":"demo_/icon.png",
    "image_32":"demo_/icon.png"
  }]
}
```

默认预览不写文件，返回 planHash、源/候选包哈希、前后摘要、变更和保留证据。相同输入加 `dry_run:false`、`expected_hash` 等于返回 planHash 才执行。哈希绑定真实源字节、表、有序变更、候选字节和解析目标；源字节/变更/路径改变会使审阅失效。独占写入**新文件**，不覆盖输入或已有目标。验证文件/哈希回读。文件系统失败可能留下空/部分预留文件，报告 localSaved=false/null，不当作有效产物。

本地化文本合并所提供 LCID，保留其他语言；共享或有歧义目标标签拒绝。按钮顺序同时更新 Button 和 CustomAction。共享命令、被修改/共享的专用隐藏规则均拒绝，避免影响其他控件。隐藏使用含两个矛盾 CrmClientTypeRule（Web 及取反 Web）的新 DisplayRule，保留全部既有规则/动作，不生成 HideCustomAction。显示仅移除此门控，保留已有 HideCustomAction 和其他规则，不承诺运行时可见或绕过权限。

仅重序列化 customizations.xml，其他 ZIP 内容**及本地压缩块**保留。方案清单/版本不变。编辑器检查所选 Ribbon 子树外语义相等，重解析候选验证 Ribbon 哈希。修改后的 XML 从 UTF-8/带 BOM UTF-16LE 统一为 UTF-8。customizations.xml 限 4 MiB，深度/节点有界，拒绝 DTD/实体或带命名空间 RibbonDiffXml；不是完整平台/XSD 或 JavaScript 校验器。不执行无关定义或文件内容。

**保存候选不等于部署。** 导入应用整包，包括其他未改组件。不推断 Ribbon 独立原子写入、当前目标并发锁、实时规则/处理器/位置检查或安全回滚。已有 import_solution_async 仅支持首次非托管导入，不能用来更新此流程已安装源方案。已有方案导入、独立发布和有效 Ribbon/UI 回读需要单独审阅流程及真实测试环境；初始受控流程见下文。不使用 EntityDefinitions.RibbonDiffXml PATCH 或直接系统表修改。

离线测试覆盖新增/更新/隐藏/显示、语言/提示/处理器保留、共享引用、显式资源/位置范围、ZIP stored/deflate/描述符、未变压缩内容/XML、编码、审阅/独占文件、恶意 XML/ZIP、原生 CSDL/类型别名、取消、路由及所有模拟认证请求分支。打包启动还在无 CRM/外部 PATH 下预览、写入并检查实际本地候选。真实权限、导入、发布、有效按钮行为及现代命令依情况仍未验证/实现。

原生参考：[RetrieveEntityRibbon](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/retrieveentityribbon)、[压缩 Ribbon 部件](https://learn.microsoft.com/en-us/power-apps/developer/model-driven-apps/export-ribbon-definitions)、[支持的导出/编辑/导入路径](https://learn.microsoft.com/en-us/power-apps/developer/model-driven-apps/export-prepare-edit-import-ribbon)、[自定义动作](https://learn.microsoft.com/en-us/power-apps/developer/model-driven-apps/define-custom-actions-modify-ribbon)、[显示规则语义](https://learn.microsoft.com/en-us/power-apps/developer/model-driven-apps/define-ribbon-display-rules)、[动作参数](https://learn.microsoft.com/en-us/power-apps/developer/model-driven-apps/define-ribbon-actions)。

## 受控已有解决方案 Ribbon 导入、独立发布与回读——步骤 7.6 初始范围

三个工具扩展经典 Ribbon 候选流程，不改变 import_solution_async **仅首次导入**的契约。不允许任意已有方案更新、托管/暂存/升级流程、目标 URL 覆盖、环境/连接覆盖、后端回退或现代命令更新。全部使用配置组织及现有 Online/AD/NTLM/IFD Web API 客户端。

三工具均要求本地 `source_file_path`、`candidate_file_path`、`logical_name` 及 edit_ribbon_solution 使用的同一有序 `changes`。路径须绝对常规本地文件，符合 32 MiB ZIP 限制；拒绝网络/设备路径。每次读取稳定字节并重放结构编辑。**候选字节必须与当前服务器版本的重放结果完全一致。** 若重新打包、工具外编辑或由不兼容序列化/压缩器版本生成，须重新生成/审阅，不静默放宽。沿用编辑器的其他负载/清单/Ribbon 外保留检查。文件/changes 是有界 JSON，不是任意导入体。预览不返回原始包 Base64 或动作参数字面值。

`import_ribbon_solution` 默认预览，检查原生 WhoAmI、同名称/版本且无父方案的精确可见普通非托管方案、真实发布者名/前缀、可自定义表、当前 CSDL，以及包含该真实表的完整可见成员清单。底层表可托管但须可自定义；目标方案本身必须普通非托管。

预检调用原生 **ExportSolution POST**，managed=false、设置标志=false。这是读取/导出，不是导入或元数据修改；即使预览也可能需导出权限并耗时。新包须与源的完整可导出负载匹配：忽略 ZIP 压缩/时间戳及 XML 格式/属性顺序，但保留 ID、实质 XML、清单及其他全部字节。不普遍剥离 GUID 或业务数据。源过旧/不同、无关组件变化、清单不完整、发布者/版本错误、契约不兼容都会在导入前阻止。平台导出规范化/版本差异可能保守地要求新基线；不自动替换源、编辑目标或绕过校验。

planHash 绑定包/变更哈希、配置及原生组织/调用者、方案/发布者/表标识、当前 CSDL、成员和新导出指纹及原生公开请求体。执行要求 `dry_run:false`、当前 `expected_hash`、`allow_unprotected_write:true`、`allow_full_solution_import:true`。原生导入应用**整个已有非托管方案**，含其他未改组件，不是原子 Ribbon 独立更新。剩余并发/待发布自定义窗口不锁定。源/候选/目标变更使审阅失效。所选 Ribbon 无变化时 noChange，不提交或签发导入回执。

唯一提交为带客户端生成 ImportJobId 的 ImportSolutionAsync。固定 OverwriteUnmanagedCustomizations/PublishWorkflows=false；公开时还固定 SkipProductUpdateDependencies/HoldingSolution/StageAndUpgrade/SchemaUpdatesOnly=false、ComponentParameters=[]。overwrite 标志不普遍保证共享非托管组件不被覆盖。不使用内部/弃用参数或环境覆盖。不随即发布或自动轮询。拒绝/未发送保留 accepted=false；传输/服务器未知保留 accepted=null 及恢复 ImportJobId；HTTP 接受后跟踪格式错误保留 accepted=true。任何路径均不自动重导或重试已提交导入。

有效原生接受还返回 `importReceipt`。负载绑定组织/调用者/方案/表、源/候选/变更及原生异步/导入作业 ID，由内存 HMAC 保护完整性。**仅同一运行服务器进程内有效**，不是持久跨进程凭据，也不证明 CRM 权限。请保持进程运行至独立发布阶段。篡改、重启或其他进程回执会在发布前拒绝。**不要为重建遗失/过期回执而重新导入。** 用 get_solution_import_status、get_solution_import_log、verify_ribbon_deployment 只读恢复；持久回执接管及恢复发布须另行审阅扩展。无隐式放行或手动 ID 回退。

`publish_ribbon_solution` 要求相同文件/变更及未修改 `import_receipt`。重查原生上下文之外，要求回执实际异步操作 completed/succeeded 且为方案导入类型，导入作业匹配原生方案 ID/名称，有界匹配的已完成导入日志中有一个成功方案清单且无失败/未知结果。警告保留为计数；progress=100 单独不能放行，较低进度也不覆盖独立验证的原生终态/日志成功。禁止、缺失、未完成或格式错误证据均阻止发布。

发布有**自己的预览和 planHash**。再次对照源检查可导出非 Ribbon 负载、当前有效 Ribbon 和 CSDL PublishXml，并与回执/导入证据绑定。单独执行需 `dry_run:false`、当前 `expected_hash`、`allow_unprotected_write:true`、`allow_full_table_publish:true`。原生请求体只发布所指定表：

```xml
<importexportxml><entities><entity>demo_table</entity></entities></importexportxml>
```

此范围包括**该表其他待发布字段、表单、视图及 Ribbon 自定义**。不会完整读取或锁定待发布内容；新的已发布/可导出快照不是完整待发布状态快照。该标志明确确认原生范围/并发限制。所引用 JavaScript/图像 Web 资源**不由该仅表发布请求发布**，须独立 Web 资源操作。不执行代码、不完整验证包/运行时，不回滚、不 PublishAll、不隐式发布资源。

原生发布拒绝/未发送保留 published=false；结果未知为 published=null。成功响应后即使回读失败或定义不同，也保留 published=true。错误保留发布阶段及导入完成证据，绝不重放导入/发布。结果未知或元数据传播延迟时使用只读验证，不自动再次写入。现有请求层认证刷新不变。

接受后的自动回读及 `verify_ribbon_deployment` 只比较变更按钮与原生有效经典定义：所选按钮属性、命令/动作/参数结构、本地显示规则及本地化标签（LCID 规范化）。不输出原始值/参数字面值。缺失、歧义或被转换证据保持不同/不确定，不误判匹配。不评估客户端布局/位置、有效权限、逐用户可见性、Web 资源内容/发布、JavaScript 行为或 UI。即使选定定义匹配，deploymentVerified/runtimeVerified 仍为 false。

`verify_ribbon_deployment` 只读，无须回执，不导出、导入、发布、重试或修复。验证本地候选并解析当前配置目标，返回原生定义比较。匹配不独立证明包已导入/发布，也不建立持久作业→当前状态因果链。可用于回执遗失或提交不确定后检查结果，而不产生再次写入。

离线测试覆盖精确重放、过期导出负载、发布者/版本/表/成员/CSDL 门控、完整范围审阅、无操作、全部原生提交结果、同进程回执绑定/篡改/进程遗失、终态/日志检查、独立发布、部分回读证据、定义不匹配、标签排序、取消、路由及三种模拟真实认证分支。已有传输/编辑器契约保留回归覆盖。未执行真实导入、发布、权限/证书/代理、待发布状态行为、导出规范化、客户端按钮显示或脚本/运行时验证。现代命令和更广泛 Ribbon/自定义流程仍属独立工作。

原生参考：[ImportSolutionAsync](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/importsolutionasync)、[导入响应 ID](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/importsolutionasyncresponse)、[PublishXml](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/publishxml)、[Ribbon 导出/编辑/导入及发布](https://learn.microsoft.com/en-us/power-apps/developer/model-driven-apps/export-prepare-edit-import-ribbon)、[原生导入日志数据](https://learn.microsoft.com/en-us/dynamics365/customerengagement/on-premises/developer/work-solutions?view=op-9-1#tracking-import-success)。

## 跨环境主表单比较（开发中）

真实环境复测前提、测试范围与清理步骤见[跨环境表单与云流程验收记录](FORM_FLOW_LIVE_ACCEPTANCE.zh-CN.md)。

`create_unmanaged_solution` 使用已有发布者创建普通非托管解决方案，参数为 `unique_name`、`friendly_name`、`publisher_id` 和可选的四段 `version`（默认 1.0.0.0）。默认只预览；执行时传入预览的 `planHash` 作为 `expected_hash` 并设置 `dry_run=false`。服务会重新检查身份、发布者与名称并回读创建结果；若提交结果未知，先检查环境，不要盲目重试。已在 CRM 9.1 测试环境创建并清理专用测试方案，其他版本仍须分别验证。

`compare_environment_forms` 接受 `source_profile`、`target_profile`、`logical_name`、`source_form_id`、`target_form_id`，两个配置均须显式命名且不同。工具只读取各环境已保存的主表单定义，按 XML 位置报告属性和内容变化，并汇总字段和脚本库引用的差异。

`endpointRelationship` 报告两侧配置地址是否相同；`organizationRelationship` 根据两侧独立 `WhoAmI` 的组织 ID 报告同一组织、不同组织或未知。地址不同可能是同一组织的别名或代理；组织身份读取失败时报告未知，不推断为不同组织。这些读取不是平台锁。

该比较保留原始 ID 和节点顺序：跨环境生成的 ID 不同或节点移动时可能出现额外差异。字段与脚本引用清单不是组件定义比较或依赖闭包；结果不判断发布状态，不代表解决方案装包完成。请先在目标环境审核全部差异。

`plan_form_solution_package` 在上述参数之外要求 `solution_unique_name`，读取两侧主表单后，调用来源环境现有解决方案组件预览，为整个表单进行成员和直接依赖预检，并列出需要独立检查的字段及脚本引用。此计划工具只预览；审阅候选后可通过独立的 `apply_form_solution_package` 选择并添加组件。两个工具都不会自动导出、发布或导入；字段和脚本内容仅作有限范围比较，完整依赖闭包尚未实现。CRM CSDL 或依赖读取不可用时预检会失败。

引用清单包括普通控件和 `hiddencontrols/data` 中的字段，以及 `Library/name` 和事件 `Handler/libraryName` 中的脚本名称。脚本名称无法唯一解析时列入未解决项目，不推断其不存在。表单中 `WebResourceId` 的原始值以 `references.resourceIds` 列出；来源侧的值同时列入 `unresolvedComponents`，需人工确认其身份、内容和依赖，不能仅凭名称或跨环境 ID 推断一致，也不会自动加入解决方案。自定义控件及其他未识别引用仍需独立审阅。识别范围参考 [CRM 9.1 表单 XML 架构](https://learn.microsoft.com/en-us/dynamics365/customerengagement/on-premises/developer/customize-dev/form-xml-schema?view=op-9-1)。

装包预览现额外读取两侧字段的选定元数据属性及同名脚本资源的保存版本，比较字段属性摘要、脚本字节 SHA-256 和类型；字段差异报告 `differingProperties` 属性名，不返回属性值。显示名称和说明按语言代码及文本比较，忽略标签 ID 和返回顺序；标签集合不完整或语言重复时结果为未知。字段比较仍不是完整定义比较，其他原生元数据中的环境差异可能造成误报。字段最多 100 项、脚本最多 40 项，脚本内容最大 2 MiB。读取失败、结果不唯一、内容格式错误或超过上限均不判作相同。字段完整定义、脚本运行行为、发布状态和传递依赖仍需独立验证。

对来源可读取且两侧选定属性或脚本内容不同的字段、脚本，以及目标读取状态未知的来源组件，预览会按来源环境解析出的组件 ID 分别调用现有组件添加预检。目标未知不被推断为缺失，相关候选标记为需要人工审阅。每个候选的预检相互独立，增加任一组件后成员基线会改变，执行前必须重新预览。候选不代表依赖完整，也不自动提交更改。

对选项集不同或比较未知、且来源能确认全局 Picklist ID 的引用字段，规划还会生成类型 9 全局选项集候选；多个字段引用相同 ID 时合并，并记录关联字段。执行该候选前重新比较关联字段。此能力仅涵盖可解析的全局 Picklist，不代表已发现全部依赖；无可靠 ID 或类型不支持的全局选项集列为未解决项目。

同一来源选项集 ID 在相关字段中若出现不同名称或选定定义，候选标为 `inconsistent_source`，不可执行；独立原生组件预检返回的 ID 或名称与字段引用不一致时也不可执行。需要先查明数据或读取时间差，再重新规划。

字段共同属性缺失，或任一侧未返回另一侧有的属性时，`missingProperties` 列出缺口；缺失不能单独证明属性不同。没有已确认差异但存在缺口时比较结果为 `unknown`，有缺口的候选须人工审阅。来源读取失败或无法确定组件 ID 的项目列在 `unresolvedComponents`，不能作为可执行候选。

受支持的字段选项集比较类型、全局选项集名称、父选项集名称、显示标签、说明、选项顺序、值、标签及选定属性，忽略选项和标签的平台元数据 ID；不完整、重复或不受支持的选项数据标为未知。布尔、选项集和虚拟多选字段如果未返回选项集，即使两边均缺失，也不会判为一致。其他选项集元数据与跨环境全局依赖仍需独立检查，选定属性一致不证明完整定义一致。

`apply_form_solution_package` 对所选表单和候选组件提供独立预览，返回绑定环境、表单定义及选择的 `planHash`。以 `dry_run=false`、`expected_hash` 和 `allow_unprotected_write=true` 执行时逐项重新预检并调用原生添加接口；遇到失败或未知结果立即停止，返回已完成步骤。该过程不具备事务性、不自动重试、不自动导出或验证导出包。未知引用仍需人工审阅，组件添加结果不能证明所有依赖已包含。

执行和导出包检查每次最多选择 241 项（1 个表单、最多 100 个字段、100 个全局选项集和 40 个脚本候选）。每项均要单独预检和回读，大批量可能耗时较长；发生失败或取消时保留已完成步骤，应先检查实际成员再决定如何继续。

为控制批量返回大小，候选组件预览仅附最多 20 条依赖样本、总数和截断标记；需要完整依赖时应单独调用依赖查询工具。执行结果对每项保留添加状态、回读状态、组件成员 ID 和观察到的变更数量，不重复返回完整成员变更列表；数量只表示两次读取之间观察到的变化，不证明全部由本次操作引起。

如果平台已接受添加但成员回读失败，步骤状态为 `accepted_unverified`，流程停止；应先只读检查解决方案成员，不要盲目重复添加。每次添加字段或脚本前重新读取两侧已比较的字段属性或脚本摘要，发生变化时停止；这不是锁，检查之后仍可能发生并发变化，且只涵盖选定属性，需在导出后核对内容。

`inspect_form_solution_package` 可只读检查本地 ZIP 的解决方案清单，核对所选表单、字段、全局选项集和 Web 资源是否以相同 ID 显式声明为根组件。未匹配可能是嵌套在表中或以架构名称表示，不可直接认定缺失；根声明本身不证明组件内容、依赖闭包或部署成功；工具还会单独检查受支持表单 XML 和 Web 资源负载哈希。工具不解压或执行内容。

检查类型 9 全局选项集时，可在组件项传入 `schema_name`。工具按名称查找 `customizations.xml` 的顶层选项集定义，并报告序列化 XML 摘要及按名称匹配的根声明数量。名称由调用者提供，包内按名称找到定义不证明其与传入 GUID 的对应关系、语义一致或依赖完整；重复定义标为歧义。[微软导出文件结构](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/customization-solutions-file-schema)使用名称标识选项集定义。

检查类型 2 字段时，可同时提供表逻辑名 `logical_name` 和字段逻辑名 `schema_name`，工具在标准表定义容器中查找嵌套字段并报告序列化 XML 摘要。这个名称匹配不证明字段与传入 GUID 的对应关系或完整语义一致；缺少名称、重复表或字段，以及包内无可识别逻辑名时分别报告，不能直接推断字段缺失。

## Power Automate 云端流程（开发中）

`list_cloud_flows` 和 `get_cloud_flow` 仅用于 Online Dataverse 配置，分别提供有界流程列表和流程状态、定义哈希、触发器/动作/连接引用名称。详情不返回完整定义或连接凭据，也不证明连接可用、具有许可或流程能运行。本地 CRM 的 AD/IFD 配置会在发送请求前拒绝。流程创建、更新、启停和连接引用检查已实现本地验证，仍待真实云环境验收。

`prepare_cloud_flow` 在本地生成受支持的手动、定时或 Dataverse 事件触发器及有限动作定义；`create_cloud_flow` 对指定 Online 环境和非托管解决方案先预览，再创建并分别报告流程状态与解决方案成员回读；`set_cloud_flow_state` 支持状态预览、特定 ETag 保护的启停及独立回读。三个工具尚未经过真实 Power Platform 验证；流程设计器兼容性、连接许可和运行结果不由创建或状态回读证明。

草稿动作 `dataverse_get` 可按 `entity_set` 和记录 ID 读取一行；ID 可由固定 GUID、Dataverse 事件字段或直接依赖的前置记录动作输出提供。后续动作可引用其字段输出，仍须显式声明直接依赖。连接引用必须已存在；此动作尚未在真实云环境验证。接口依据 [Microsoft Dataverse 连接器的 Get a row by ID](https://learn.microsoft.com/en-us/connectors/commondataserviceforapps/) 定义。

`dataverse_list` 可附带有界的 `select`（1–50 个字段）、`order_by`（1–5 个 `{field,direction}` 项）和 `filter`。筛选固定为最多 10 个条件的 `and` 合取：`{"conditions":[{"field":"statecode","operator":"eq","value":0}]}`；比较运算仅支持 `eq`、`ne`、`gt`、`ge`、`lt`、`le`，值仅支持字符串、有限数值和布尔值。字段名必须是受限标识符（支持 `_ownerid_value`），重复选择或排序字段会被拒绝。实现只生成经过验证的 OData 字面量，并将字符串单引号转义为双单引号；不接受原始 OData、表达式、函数、`or`、日期/GUID 字面量或动态筛选值。该范围不验证字段是否存在、字段类型、连接器解释、分页或真实云端运行结果。

条件动作可使用原有 `variable_name`，或使用 `condition_source` 指定 `trigger`、`variable` 或前置 Dataverse 记录动作的字段，与 `value` 做相等判断；两种来源方式只能选择一种。前置动作或变量初始化必须列在 `after` 中，触发字段仅适用于 Dataverse 事件。两个分支可分别使用固定值 `then_value` / `else_value`，或使用 `then_actions` / `else_actions` 提供 1–5 个 Compose、Dataverse 查询、读取、创建或更新动作；每个分支二选一，分支内动作按顺序执行。分支可引用触发字段、条件 `after` 中的外层动作，以及同一分支内已完成的记录读取或写入动作；不支持跨分支引用、嵌套条件或在分支外引用分支输出。此扩展尚未测试或真实云端验证。

`for_each` 可使用数组变量 `variable_name`，或使用 `items_from_action` 引用 `after` 中的 Dataverse 列表动作。可选 `loop_actions` 允许逐项顺序执行 1–5 个 Compose 或受支持的 Dataverse 动作；写入字段使用 `{"source":"item","name":"字段逻辑名"}` 引用当前记录，读取/更新动作可用 `record_id_from_item` 指定当前记录的 GUID 字段。循环中的后续记录动作也可引用当前循环内前面的记录动作。循环范围取决于列表返回的记录，且执行不是跨记录事务；此扩展尚未测试或真实云端验证。

创建后 `definitionReadback` 将保存的 JSON 结构与提交的草稿分别比较，返回 `matched`、`different` 或 `unknown`；平台对定义的规范化也可能导致差异。它与草稿状态和解决方案成员回读分开，均不能证明流程可运行。

`list_cloud_flow_connections` 只读列出当前 Online 环境中可见的连接引用名称、连接器、状态及是否配置连接，不返回连接 ID 或凭据；该检查不证明连接可用、调用者可使用、许可满足或 DLP 允许。草稿可引用已有 Dataverse 连接引用；创建预览会检查引用，但不能验证连接授权与运行状态。

`update_cloud_flow` 可在 Online 环境预览并替换停用流程的受支持定义，使用特定 ETag 防止覆盖并发更新；保存后独立回读并比较 JSON 结构，分别报告 `matched`、`different` 和 `unknown`。对象键顺序和空白不影响比较；平台规范化也可能导致结构不同。该操作替换整个受支持定义，不能保留草稿规格中未表达的原有动作；平台兼容性、连接可用性和运行效果仍需真实环境验证。

真实 CRM 9.1 只读验证中，系统表单组件的直接读取不支持选择 `modifiedon`。组件预览已移除该字段；复测中解决方案读取及表单组件读取返回 200，后续 `/$metadata` 仍返回 500，因此添加预检尚未完成，未发送写入。

导出包检查还会在 `customizations.xml` 的标准表单容器中按表单 ID 查找实际 `<form>` 并报告其 XML 哈希。重复 ID 标为歧义；未找到不证明表单缺失。导出内容可能含平台附加标记，哈希不同不等于语义不同；此检查仍不证明字段、资源或依赖完整。`customizations.xml` 当前上限 4 MiB。

### 示例：主表单比较与装包

下面的名称和 GUID 仅为占位示例。先配置 `TEST`、`PROD` 两套命名环境，分别指向测试和正式环境。对比与装包计划只读取正式环境；添加操作只作用于 `source_profile`。

```json
{
  "source_profile": "TEST",
  "target_profile": "PROD",
  "logical_name": "account",
  "source_form_id": "11111111-1111-1111-1111-111111111111",
  "target_form_id": "22222222-2222-2222-2222-222222222222"
}
```

将上述参数传给 `compare_environment_forms`。添加 `solution_unique_name` 后传给 `plan_form_solution_package`，审阅表单整体变化、候选组件和未知项。调用 `apply_form_solution_package` 时再提供明确的 `components`，例如 `[{"component_type":60,"component_id":"11111111-1111-1111-1111-111111111111"}]`；默认仅预览。执行需在相同选择和环境下提供预览 `planHash` 作为 `expected_hash`，并设置 `dry_run=false`、`allow_unprotected_write=true`。执行按步骤停止并报告结果，不是事务。

### 示例：Dataverse 事件云端流程草稿

以下规格可传给 `prepare_cloud_flow`；输出仅为本地草稿。传给 `create_cloud_flow` 时，作为 `spec` 字段并补充已有云端非托管 `solution_unique_name`，先预览并审阅，再带 `expected_hash` 执行。连接引用须已存在并配置；创建、连接和运行均未经过真实云端环境验收。

```json
{
  "name": "Account event example",
  "dataverse_connection": "example_dataverse_reference",
  "trigger": {"kind":"dataverse_event","entity_name":"account","message":3,"scope":4,"filtering_attributes":["name"]},
  "actions": [
    {"name":"Update","kind":"dataverse_update","entity_set":"accounts","record_id_from_trigger":"accountid","fields":{"description":{"source":"trigger","name":"name"}}}
  ]
}
```

记录更新可能再次触发同一流程；上线前应结合过滤条件、数据变更和业务逻辑检查循环触发风险。草稿生成不验证连接授权、许可、DLP、动作字段元数据或 Power Automate 运行结果。

真实 CRM 9.1 只读抽查：从可见 account 主表单的字段引用中选取 12 个，逐一调用字段定义读取，12 个请求均成功；此抽样不证明所有 59 个引用或两套不同环境可比较。未发送 CRM 写入。

导出包检查对选中的 Web 资源按 `WebResourceId` 查找标准资源清单，并核对 `FileName` 指向的包内条目，返回该条目的字节数和 SHA-256；路径异常、条目缺失或元数据重复会分别报告，不读取执行脚本。哈希可与来源的内容哈希人工比较，仍不代表脚本行为或依赖已验证。

检查导出包时，可为类型 60 表单或类型 61 Web 资源在 `components` 项中提供来源 `expected_hash`，返回 `matched`、`different` 或 `not_requested`。表单 XML 可能包含导出附加标记，哈希差异需要人工解释；字段元数据不支持此哈希比较。


### `list_cloud_flow_runs`

在 Online Dataverse 中按云流程 ID 查询有限数量的运行元数据（`id`，可选 `top` 1–100），只返回运行 ID、状态及开始/结束时间，不返回输入、输出或错误正文。Dataverse 运行记录可能延迟、未启用、受权限过滤或不完整；空结果不能证明流程没有运行。此功能尚未在真实云端环境验证。

参考：[Microsoft Flow Run 表](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/flowrun?view=dataverse-latest)、[云流程运行历史](https://learn.microsoft.com/en-us/power-automate/dataverse/cloud-flow-run-metadata)。
