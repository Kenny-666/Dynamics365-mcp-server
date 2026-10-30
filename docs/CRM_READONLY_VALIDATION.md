# Real CRM read-only validation / 真实 CRM 只读联调

Date / 日期：2026-10-29。

本页保留最初 12 项检查的历史记录。最新已扩展到 65 个不同工具及新建对象实写；当前状态见 [84 工具覆盖表](CRM_TOOL_COVERAGE.md)。/ This is the initial 12-check history; current coverage is tracked in the [84-tool matrix](CRM_TOOL_COVERAGE.md).

## Scope / 范围

The current project was started through its local stdio entry and connected directly to a real Dynamics 365 CE organization using AD/NTLM. This is an initial read-only integration pass, not acceptance of all 84 tools.

本项目通过本地 stdio 入口启动，并使用 AD/NTLM 直接连接真实 Dynamics 365 CE 组织。本轮是基础只读联调，不代表全部 84 个工具均完成真实环境验收。

| Item / 项目 | Observed / 实测 |
| --- | --- |
| MCP server | dynamics365-mcp-server 1.0.0 |
| Discovered tools / 发现工具数 | 84 |
| CRM build / 服务端版本 | 9.1.7.5，等同于 9.1.0007.0005 |
| Web API | v9.1 |
| Authentication / 认证 | op_ad / AD/NTLM |
| Checks / 检查结果 | 11 passed / 通过；1 blocked by a platform error / 被平台错误阻断 |
| CRM writes / CRM 写入 | 0 |

Tested bundle SHA-256:

`B3AF28572873E4614EDE82987D947759D5115F33D43EE9BBE4E226515E871459`

## Results / 结果

| Tool | Result / 结果 | Validation / 核验内容 |
| --- | --- | --- |
| get_current_user_context | Passed / 通过 | Native WhoAmI returned user, organization, and business-unit IDs / 返回原生用户、组织、业务部门 ID |
| get_environment_capabilities | Passed / 通过 | Identity matched WhoAmI; build and API versions verified; feature metadata completed without issues / 身份一致，版本已核验，能力元数据读取完整 |
| get_entity_metadata_summary | Passed / 通过 | account logical name, primary key, and business attributes / 表逻辑名、主键及业务字段 |
| get_detailed_field_metadata | Passed / 通过 | accountcategorycode definition and Picklist type / 字段定义及类型 |
| get_field_picklist_options | Passed / 通过 | Non-empty choice mappings / 非空选项映射 |
| get_entity_navigation_links | Passed / 通过 | Typed relationship collections and account/contact relationship evidence / 关系分类及关联证据 |
| get_record_by_id | Passed / 通过 | One selected account primary key / 只读取一条记录的主键 |
| search_records_by_odata | Passed / 通过 | Explicit ID filter; one primary-key result / 显式 ID 筛选，返回一条主键 |
| query_by_fetchxml | Passed / 通过 | Same record and primary key as OData / 与 OData 的记录主键一致 |
| preview_fetchxml_query | Passed / 通过 | Successful preview with the same primary key / 预览成功，主键一致 |
| get_api_operation | Blocked / 受阻 | CRM returned HTTP 500 for the service CSDL / CRM 的服务 CSDL 请求返回 HTTP 500 |
| list_solutions | Passed / 通过 | Read at most five solution metadata rows / 最多读取五条方案元数据 |

The record checks selected only accountid, without retrieving customer names or business field values. Successful results were checked for expected structure, identity consistency, and matching primary keys, rather than treating HTTP success alone as a pass.

记录检查只选择 accountid，没有读取客户名称或业务字段值。除调用成功外，还核验了返回结构、身份一致性及主键一致性。

## Platform blocker / 平台阻断

The native `/$metadata` request returned HTTP 500. A separate read through the project's request client confirmed a CRM server error: access was denied to an existing metadata cache file under `Temp\Cds.ODataMetadata` in the Windows service profile.

原生 `/$metadata` 请求返回 HTTP 500。使用本项目请求客户端单独读取，确认底层错误为 CRM 服务端 Windows 服务配置文件目录中 `Temp\Cds.ODataMetadata` 下的元数据缓存文件访问被拒绝。

- MCP error: `D365_OPERATION_METADATA_UNAVAILABLE`.
- Underlying request error: `D365_HTTP_ERROR`, status `500`.
- No operation was invoked by this signature-discovery request.
- EntityDefinitions reads succeeded, but they do not establish availability of the separate CSDL endpoint.

CRM 服务器管理员需要排查该缓存目录及对应文件的访问权限。处理后应重新验证 `/$metadata` 和 `get_api_operation`，再继续依赖 CSDL 的 Action/Function、方案及 Ribbon 相关流程。没有通过修改客户端校验或替换平台响应来掩盖失败。

The CRM server administrator needs to investigate access to that cache directory and file. Recheck `/$metadata` and `get_api_operation` after remediation, before continuing CSDL-dependent Action/Function, solution, and Ribbon workflows. Client validation was not weakened and platform responses were not substituted.

## Remaining acceptance / 尚待验收

- CRM writes, deletion, transactions, schema changes, plugin updates, and publication / CRM 写入、删除、事务、模型变更、插件更新和发布。
- Solution import/export and controlled Ribbon deployment / 方案导入导出与 Ribbon 受控部署。
- Ribbon UI display, effective privileges, and JavaScript click behavior / Ribbon 页面显示、实际权限与 JavaScript 点击行为。
- Real Online and IFD authentication / 真实 Online、IFD 认证。
- Broader permission, version, negative-path, and load testing / 更广泛的权限、版本、异常路径与负载测试。

This public summary omits organization URLs, internal IP addresses, account names, record IDs, credentials, and tokens. Local connection details and raw results remain in the ignored `.cache` directory. No new application defect was confirmed in this pass; the observed failure is the real CRM server's CSDL cache access error.

本公开摘要不包含组织 URL、内网 IP、账号名、记录 ID、凭据或令牌。本机连接细节和原始结果保留在已忽略的 `.cache` 目录。本轮未确认新增应用代码缺陷，观察到的失败为真实 CRM 服务端 CSDL 缓存访问错误。
