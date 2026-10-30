# 84 个工具的联调覆盖表 / 84-tool integration coverage

日期 / Date: 2026-10-29。

## 当前结论 / Current result

已实际调用 65/84 个工具；20 个工具的指定实写回读路径通过，2 个工具的发布请求已受理（页面效果未验收）。19 个尚未调用。所有本次新建的记录、脚本、表、字段、关系、键、选项集、方案及发布者均已清理，既有业务对象修改数为 0。

65/84 tools called; 20 specified write/readback paths passed and 2 publication requests were accepted (UI effects unverified). 19 tools remain uncalled. All objects created for this test were cleaned up; no pre-existing business object was modified.

84 为注册工具数，910 为本地回归用例数；调用、预览、受理、回读及完整验收分别统计。完整 84 工具真实验收尚未完成。/ Registered tools, offline test cases, calls, previews, acceptance and verified outcomes are different measures. Full live acceptance is incomplete.

## 状态统计 / Counts

| 状态 / Status | 工具数 / Tools |
| --- | ---: |
| 只读基本路径通过 / Read path | 28 |
| 只读有限覆盖 / Partial read | 2 |
| 只读空结果路径 / Empty read path | 7 |
| 指定实写回读通过 / Tested write/readback | 20 |
| 发布请求已受理 / Publication accepted | 2 |
| 有效样本被能力检查阻断 / Capability guard | 2 |
| 实测功能未通过 / Functional blocker | 1 |
| 本机调用通过 / Local runtime | 2 |
| 仅本地套件验证 / Local suite | 4 |
| 实测平台阻断 / Platform blocker | 1 |
| 未调：CSDL 前置阻断 / Pending CSDL | 9 |
| 待样本 / Pending fixture | 0 |
| 待专用样本实写 / Pending writes | 6 |

## 逐工具清单 / Per-tool matrix

通过仅针对列出的参数和样本；空集、有限读取、预览、本机夹具和发布受理不等于完整真实验收。/ Every result is scenario-specific.

| 工具 / Tool | 当前状态 / Status | 验证边界或剩余事项 / Scope |
| --- | --- | --- |
| `list_solutions` | 只读基本路径通过 / Read path | 只读有界样本，不覆盖全部参数、权限和异常 / Bounded scenario |
| `list_solution_components` | 只读空结果路径 / Empty read path | 只验证空集/无匹配/空方案路径，需非空样本 / Non-empty fixture needed |
| `get_solution_component_dependencies` | 未调：CSDL 前置阻断 / Pending CSDL | 依据代码确认依赖 CSDL，尚未调用，不计实测失败 / Dependency inferred, not executed |
| `add_solution_component` | 未调：CSDL 前置阻断 / Pending CSDL | 依据代码确认依赖 CSDL，尚未调用，不计实测失败 / Dependency inferred, not executed |
| `inspect_solution_package` | 仅本地套件验证 / Local suite | 910 项本地套件证据；本轮未用真实方案/DLL调用 / Offline-suite evidence only |
| `export_solution` | 未调：CSDL 前置阻断 / Pending CSDL | 依据代码确认依赖 CSDL，尚未调用，不计实测失败 / Dependency inferred, not executed |
| `import_solution_async` | 未调：CSDL 前置阻断 / Pending CSDL | 依据代码确认依赖 CSDL，尚未调用，不计实测失败 / Dependency inferred, not executed |
| `get_solution_import_status` | 只读基本路径通过 / Read path | 只读有界样本，不覆盖全部参数、权限和异常 / Bounded scenario |
| `get_solution_snapshot` | 只读空结果路径 / Empty read path | 只验证空集/无匹配/空方案路径，需非空样本 / Non-empty fixture needed |
| `compare_solution_snapshots` | 本机调用通过 / Local runtime | 空方案快照自比较，不是跨环境部署验收 / Empty snapshot self-comparison |
| `verify_solution_deployment` | 只读空结果路径 / Empty read path | 只验证空集/无匹配/空方案路径，需非空样本 / Non-empty fixture needed |
| `get_solution_import_log` | 只读基本路径通过 / Read path | 只读有界样本，不覆盖全部参数、权限和异常 / Bounded scenario |
| `get_ribbon_definition` | 未调：CSDL 前置阻断 / Pending CSDL | 依据代码确认依赖 CSDL，尚未调用，不计实测失败 / Dependency inferred, not executed |
| `inspect_ribbon_solution` | 仅本地套件验证 / Local suite | 910 项本地套件证据；本轮未用真实方案/DLL调用 / Offline-suite evidence only |
| `edit_ribbon_solution` | 仅本地套件验证 / Local suite | 910 项本地套件证据；本轮未用真实方案/DLL调用 / Offline-suite evidence only |
| `import_ribbon_solution` | 未调：CSDL 前置阻断 / Pending CSDL | 依据代码确认依赖 CSDL，尚未调用，不计实测失败 / Dependency inferred, not executed |
| `publish_ribbon_solution` | 未调：CSDL 前置阻断 / Pending CSDL | 依据代码确认依赖 CSDL，尚未调用，不计实测失败 / Dependency inferred, not executed |
| `verify_ribbon_deployment` | 未调：CSDL 前置阻断 / Pending CSDL | 依据代码确认依赖 CSDL，尚未调用，不计实测失败 / Dependency inferred, not executed |
| `get_api_operation` | 实测平台阻断 / Platform blocker | /$metadata HTTP 500；CRM 元数据缓存文件访问被拒绝 / Metadata cache access denied |
| `call_d365_api_action` | 未调：CSDL 前置阻断 / Pending CSDL | 依据代码确认依赖 CSDL，尚未调用，不计实测失败 / Dependency inferred, not executed |
| `update_model_column_settings` | 指定实写回读通过 / Tested write/readback | 预览指纹后扩大新建字段长度，回读匹配 / Fingerprinted length increase/readback |
| `update_model_relationship` | 指定实写回读通过 / Tested write/readback | 仅调整新建关系菜单顺序，指纹和回读匹配 / New relationship menu/readback |
| `reactivate_model_key` | 有效样本被能力检查阻断 / Capability guard | 本次新建键 IsCustomizable=false，预览被 MANAGED_PROPERTY 阻断；未提交重新激活 / Native managed-property guard; no reactivation |
| `d365_plugin_assembly_inspect` | 仅本地套件验证 / Local suite | 910 项本地套件证据；本轮未用真实方案/DLL调用 / Offline-suite evidence only |
| `d365_plugin_assemblies_query` | 只读基本路径通过 / Read path | 只读有界样本，不覆盖全部参数、权限和异常 / Bounded scenario |
| `d365_plugin_assembly_update` | 待新建对象实写及清理 / Pending writes | 需要本次新建、可部署的专用测试 DLL、类型、步骤或 Image；不修改已有插件 / Deployable owned plugin fixtures required |
| `d365_plugin_images_query` | 只读空结果路径 / Empty read path | 只验证空集/无匹配/空方案路径，需非空样本 / Non-empty fixture needed |
| `d365_plugin_image_register` | 待新建对象实写及清理 / Pending writes | 需要本次新建、可部署的专用测试 DLL、类型、步骤或 Image；不修改已有插件 / Deployable owned plugin fixtures required |
| `d365_plugin_image_update` | 待新建对象实写及清理 / Pending writes | 需要本次新建、可部署的专用测试 DLL、类型、步骤或 Image；不修改已有插件 / Deployable owned plugin fixtures required |
| `d365_plugin_image_delete` | 待新建对象实写及清理 / Pending writes | 需要本次新建、可部署的专用测试 DLL、类型、步骤或 Image；不修改已有插件 / Deployable owned plugin fixtures required |
| `list_model_ui_components` | 只读基本路径通过 / Read path | 新建测试样本的有界读取 / Bounded read of owned fixtures |
| `get_model_ui_component` | 只读基本路径通过 / Read path | 新建测试样本的有界读取 / Bounded read of owned fixtures |
| `edit_model_form` | 指定实写回读通过 / Tested write/readback | 仅向新建表单添加本次新建注释脚本库，XML 回读匹配；默认非等宽区块 add_field 预览另被明确拒绝 / New form library/readback; non-uniform add-field layout blocked |
| `edit_model_view` | 指定实写回读通过 / Tested write/readback | 仅在新建表默认视图添加本次新字段，XML 回读匹配 / New table view column/XML readback |
| `get_model_choices` | 只读基本路径通过 / Read path | 只读有界样本，不覆盖全部参数、权限和异常 / Bounded scenario |
| `create_model_choices` | 指定实写回读通过 / Tested write/readback | 在专用新建方案创建全局选项集并回读数值/标签 / New global choices/readback |
| `change_model_choice_value` | 指定实写回读通过 / Tested write/readback | 预览指纹后更新本次新建全局选项标签，原生回读一致 / New choice label/readback |
| `publish_model_choices` | 发布请求已受理 / Publication accepted | 只发布本次新建全局选项集，原生请求受理；页面效果未验收 / New choices PublishXml accepted; UI unverified |
| `get_model_relationship` | 只读基本路径通过 / Read path | 只读有界样本，不覆盖全部参数、权限和异常 / Bounded scenario |
| `create_model_relationship` | 指定实写回读通过 / Tested write/readback | 仅在新建表创建自引用 1:N 和 Lookup，关系/字段回读匹配 / New self-referencing 1:N/lookup |
| `get_model_key` | 只读基本路径通过 / Read path | 读取本次新建键及实际索引/作业状态，不把创建受理当 Active / New key state and job evidence |
| `create_model_key` | 指定实写回读通过 / Tested write/readback | 仅在新建字段创建备用键，定义已回读；索引状态和可用性另报 / New alternate-key definition; index separately reported |
| `get_model_definition` | 只读基本路径通过 / Read path | 只读有界样本，不覆盖全部参数、权限和异常 / Bounded scenario |
| `create_model_table` | 指定实写回读通过 / Tested write/readback | 专用非受管方案内新建表，原生回读匹配；表及其组件已清理 / New table/readback/cleanup |
| `create_model_column` | 指定实写回读通过 / Tested write/readback | 仅在本次新建表创建字符串字段，回读匹配 / New string column/readback |
| `update_model_labels` | 指定实写回读通过 / Tested write/readback | 仅修改新建字段标签，原生回读匹配 / New column labels/readback |
| `publish_model_table` | 发布请求已受理 / Publication accepted | 只发布本次新建表，原生请求受理；页面效果未验收 / New table PublishXml accepted; UI unverified |
| `get_diagnostic_settings` | 只读基本路径通过 / Read path | 只读有界样本，不覆盖全部参数、权限和异常 / Bounded scenario |
| `query_plugin_trace_logs` | 只读空结果路径 / Empty read path | 只验证空集/无匹配/空方案路径，需非空样本 / Non-empty fixture needed |
| `query_failed_system_jobs` | 只读空结果路径 / Empty read path | 只验证空集/无匹配/空方案路径，需非空样本 / Non-empty fixture needed |
| `diagnose_plugin_failure` | 只读空结果路径 / Empty read path | 只验证空集/无匹配/空方案路径，需非空样本 / Non-empty fixture needed |
| `query_security_principals` | 只读基本路径通过 / Read path | 只读有界样本，不覆盖全部参数、权限和异常 / Bounded scenario |
| `get_principal_security_context` | 只读有限覆盖 / Partial read | 角色/团队有数量上限，保留 partial / Bounded role/team context |
| `get_record_access` | 只读基本路径通过 / Read path | 只读有界样本，不覆盖全部参数、权限和异常 / Bounded scenario |
| `get_record_audit_history` | 只读有限覆盖 / Partial read | 审计回查通过；原生 MoreRecords=true、PagingCookie=null，不能续传 / Native continuation unavailable |
| `get_audit_details` | 只读基本路径通过 / Read path | 只读有界样本，不覆盖全部参数、权限和异常 / Bounded scenario |
| `create_new_record` | 指定实写路径通过并清理 / Tested write path | 新建记录后回读确认；最终删除并确认 404 / Create/readback/cleanup |
| `update_existing_record` | 指定实写路径通过并清理 / Tested write path | 仅更新本次新建记录，回读内容后清理 / Update/readback on new record only |
| `delete_record_by_id` | 指定实写路径通过并清理 / Tested write path | 仅删除本次新建记录，删除后读取为 404 / Delete new records, verify 404 |
| `upsert_record_by_key` | 有效样本被能力检查阻断 / Capability guard | 新建键索引尚未 Active，Upsert 预览被阻断；未执行写入 / New index not Active; preview blocked |
| `associate_records` | 指定实写路径通过并清理 / Tested write path | 两个新建账户的单值关联回读通过；测试后删除 / Single navigation bind/readback/cleanup |
| `disassociate_records` | 实测功能未通过 / Functional blocker | 单值关系置空返回 HTTP 204 但回读未解除；现在明确报 READBACK_MISMATCH，不能视作成功。原生 $ref 删除返回 405 / Clear not confirmed; no automatic replay |
| `execute_record_batch` | 指定实写路径通过并清理 / Tested write path | 两条新建记录独立批处理并逐条回读、清理 / Independent batch creates/readback/cleanup |
| `execute_record_transaction` | 指定实写路径通过并清理 / Tested write path | 两条记录提交通过；重复本次测试 ID 导致整组失败，回读确认前项回滚，已有测试行未变 / Commit and atomic rollback verified |
| `search_web_resources_by_name` | 只读基本路径通过 / Read path | 只读有界样本，不覆盖全部参数、权限和异常 / Bounded scenario |
| `create_web_resource_and_publish` | 指定实写路径通过并清理 / Tested write path | 创建全新注释脚本并回读内容；publish=false；发布由独立工具验证 / Save-only create verified |
| `update_web_resource_and_publish` | 指定实写路径通过并清理 / Tested write path | 更新本次新建脚本并回读内容；publish=false / Save-only update verified |
| `publish_web_resource` | 指定实写路径通过并清理 / Tested write path | 仅发布本次新建脚本，已发布内容回读一致；最终删除 / Scoped publication/readback/cleanup |
| `d365_plugin_registration_metadata` | 只读基本路径通过 / Read path | 只读有界样本，不覆盖全部参数、权限和异常 / Bounded scenario |
| `d365_plugin_steps_query` | 只读基本路径通过 / Read path | 只读有界样本，不覆盖全部参数、权限和异常 / Bounded scenario |
| `d365_plugin_step_register` | 待新建对象实写及清理 / Pending writes | 需要本次新建、可部署的专用测试 DLL、类型、步骤或 Image；不修改已有插件 / Deployable owned plugin fixtures required |
| `d365_plugin_step_update` | 待新建对象实写及清理 / Pending writes | 需要本次新建、可部署的专用测试 DLL、类型、步骤或 Image；不修改已有插件 / Deployable owned plugin fixtures required |
| `get_environment_capabilities` | 只读基本路径通过 / Read path | 只读有界样本，不覆盖全部参数、权限和异常 / Bounded scenario |
| `get_entity_metadata_summary` | 只读基本路径通过 / Read path | 只读有界样本，不覆盖全部参数、权限和异常 / Bounded scenario |
| `get_field_picklist_options` | 只读基本路径通过 / Read path | 只读有界样本，不覆盖全部参数、权限和异常 / Bounded scenario |
| `get_entity_navigation_links` | 只读基本路径通过 / Read path | 只读有界样本，不覆盖全部参数、权限和异常 / Bounded scenario |
| `preview_fetchxml_query` | 只读基本路径通过 / Read path | 只读有界样本，不覆盖全部参数、权限和异常 / Bounded scenario |
| `query_by_fetchxml` | 只读基本路径通过 / Read path | 只读有界样本，不覆盖全部参数、权限和异常 / Bounded scenario |
| `clear_server_cache` | 本机调用通过 / Local runtime | 仅清理本次隔离进程缓存 / Isolated process cache |
| `get_current_user_context` | 只读基本路径通过 / Read path | 只读有界样本，不覆盖全部参数、权限和异常 / Bounded scenario |
| `list_all_entity_definitions` | 只读基本路径通过 / Read path | 只读有界样本，不覆盖全部参数、权限和异常 / Bounded scenario |
| `search_records_by_odata` | 只读基本路径通过 / Read path | 只读有界样本，不覆盖全部参数、权限和异常 / Bounded scenario |
| `get_record_by_id` | 只读基本路径通过 / Read path | 只读有界样本，不覆盖全部参数、权限和异常 / Bounded scenario |
| `get_detailed_field_metadata` | 只读基本路径通过 / Read path | 只读有界样本，不覆盖全部参数、权限和异常 / Bounded scenario |

## 发现、修复与边界 / Findings and limits

解除关联仍出现 HTTP 204 但关联未清除，现明确报告 READBACK_MISMATCH；CSDL /$metadata 仍因服务端缓存文件权限返回 500。新建键索引在有界回查中持续 Pending，Upsert 预览被活动键规则阻断；IsCustomizable=false 另阻断重新激活预览。默认非等宽表单区块的字段添加被明确拒绝，添加脚本库路径已单独验证。未调用项包括 CSDL 依赖、插件实写所需可部署 DLL/注册样本和仅由本地套件验证的纯本机工具；键 Upsert 状态见逐项表。

- 基础 AuditDetail 可不带外层 @odata.type；兼容仅限有效 AuditRecord ID、无派生字段的明确基础形状。真实历史/明细回查及 4 项新回归通过。/ Strict base-shape compatibility verified.
- 单值解除关联改用导航属性置空并保留并发条件，增加回读；无效的 204 响应明确报错并保留已受理写入证据，不自动重放。原生 $ref DELETE 在此环境返回 405，解除功能仍未通过。3 项新回归及真实异常识别复验通过。批处理受理回执不冒充关系回读。/ Readback prevents false success; live clearing remains unresolved.
- 原生审计 MoreRecords=true、PagingCookie=null，无法续传；安全上下文 partial、诊断空结果及空快照比较仍保留覆盖边界。/ Partial, empty and paging limits remain explicit.
- 独立创建方案/发布者和元数据夹具已自动完成并清理，无需提供已有方案来完成本轮已测路径。整表删除曾超时，回查确认后才清理方案/发布者。最后一组脚本曾漏记服务端生成的资源 ID，已按唯一名称和精确注释内容找回并删除，再以显式 ID 复验。/ All fixtures cleaned, including timeout and test-driver recovery cases.

参考 / References: [Microsoft AuditDetail](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/auditdetail?view=dataverse-latest), [OData JSON format](https://docs.oasis-open.org/odata/odata-json-format/v4.0/cs02/odata-json-format-v4.0-cs02.html), [Microsoft association/disassociation](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/associate-disassociate-entities-using-web-api).

## 剩余事项 / Remaining work

修复平台 CSDL 缓存权限，调查关系解除无效的服务端原因；准备可部署的专用测试插件 DLL 及注册场景，继续方案/Ribbon 导入发布和实际页面点击验收。其他认证方式、更广泛权限、并发和全部异常路径、联网依赖漏洞审计、生产压力测试仍未完成。/ Platform remediation and deployable plugin fixtures are needed; UI and broader acceptance remain pending.

本公开表不含内网地址、账号、对象 ID、密码或令牌。私有证据仅在被忽略的本机 .cache。/ Raw evidence remains in the ignored local cache.
