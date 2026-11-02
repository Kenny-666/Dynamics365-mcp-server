# SiteMap 发布问题与修复 / SiteMap publication fix

日期：2026-11-02。修复版本：1.0.1，工具总数 85。

## 已确认的原因

对 1.0.0 便携 ZIP 做了本地协议检查：84 个工具中没有站点地图专用发布入口。`update_existing_record` 对 `sitemaps` 的更新只执行保存；现有 `publish_model_table`、Web Resource、选项集和 Ribbon 发布工具没有包含 SiteMap 发布范围。保存成功不代表导航已经发布。

旧版的 `call_d365_api_action` 可以尝试调用 `PublishXml`，但先读取 `/$metadata` 以验证 Action 定义。模拟此读取失败时，发布请求不会发出。此前测试环境发生过元数据缓存权限导致的 HTTP 500；目前没有收到同事的原始错误，因此不能断言其环境出现了相同故障，也不能排除权限或超时问题。

依据：[微软发布说明](https://learn.microsoft.com/en-us/dynamics365/customerengagement/on-premises/developer/customize-dev/publish-customizations?view=op-9-1)、[PublishXml 参数](https://learn.microsoft.com/en-us/dotnet/api/microsoft.crm.sdk.messages.publishxmlrequest.parameterxml?view=dataverse-sdk-latest)、[发布 XML Schema](https://learn.microsoft.com/en-us/dynamics365/customerengagement/on-premises/developer/customize-dev/publish-request-schema?view=op-9-1)、[SiteMap 表](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/reference/entities/sitemap)。

## 修复后的使用方法

1. 使用现有记录工具保存 `sitemapxml`。结果现在附带 `publication.status=not_requested` 和 `nextTool=publish_sitemap`，明确提示发布状态尚未验证。
2. 使用目标 SiteMap 的 `sitemapid` 预览发布。使用 CRM 中实际的 GUID；下列 ID 只是占位示例。

```json
{
  "name": "publish_sitemap",
  "arguments": {
    "id": "11111111-2222-3333-4444-555555555555",
    "dry_run": true
  }
}
```

3. 核对目标、环境和发布范围，再将返回的 `planHash` 原样填入执行参数：

```json
{
  "name": "publish_sitemap",
  "arguments": {
    "id": "11111111-2222-3333-4444-555555555555",
    "dry_run": false,
    "expected_hash": "REPLACE_WITH_THE_PREVIEW_PLAN_HASH",
    "allow_sitemap_scope_publish": true
  }
}
```

执行调用原生 `/PublishXml`，只构造 `<sitemaps>` 发布段，不再依赖 CSDL 读取。不会重新保存 SiteMap，也不会自动调用全组织 `PublishAllXml`。预览指纹检测读到的基线变化，不提供原生原子锁。旧版 PublishXml 可能忽略 SiteMap ID，发布更广的 SiteMap 组件范围；执行参数用于明确接受这一范围及其中其他待发布导航修改。

预览使用原生 `RetrieveUnpublishedMultiple` 精确读取最新已保存版本，执行后用普通 SiteMap GET 独立回读已发布版本，比较 XML 结构及属性。格式空白、注释和属性顺序不导致误判。返回值只表示定义验证，不证明浏览器、权限裁剪或应用运行效果。

## 结果判读

| 返回状态 | 含义 |
| --- | --- |
| `dryRun=true` | 只预览，未发送发布请求 |
| `publicationStatus=already_matches` | 已发布 XML 已与已保存版本一致，未重复发布 |
| `published=true`、`publishedDefinitionVerified=true` | 原生发布受理且已发布 XML 回读匹配 |
| `D365_SITEMAP_CONFLICT` | 基线已变化，需要重新预览 |
| `D365_SITEMAP_READBACK_MISMATCH` | HTTP 请求成功，但已发布 XML 未匹配，不能声称发布生效 |
| `D365_SITEMAP_READBACK_FAILED` | 已受理发布，但无法读取或验证结果；保留 `publicationAccepted=true`、`published=null` |
| `D365_SITEMAP_PUBLISH_FAILED` | 发布被拒绝或结果未知，具体以 `outcome` 和 `publicationAccepted` 为准 |

请求超时后不会自动重放。可先重新预览，看已发布版本是否已匹配，再判断下一步。发布耗时较长时可按实际情况配置 `REQUEST_TIMEOUT_MS`（最多 300000 ms），并设置相应的 MCP 客户端工具超时。HTTP 403 仍需检查连接身份的定制/发布权限。

应用专用站点地图与 AppModule 发布属于不同状态；本工具不发布 AppModule，也不验证页面。定义回读匹配后仍需重新打开/刷新目标应用检查导航；如果修改了应用关联或应用组件，还需完成相应的应用发布。

## ZIP 升级

将 1.0.1 ZIP 解压至新目录，使用自己的 `.env` 配置；执行 `generate-client-config.cmd` 更新客户端路径并重新连接。客户端应显示版本 1.0.1、85 个工具，并能找到 `publish_sitemap`。原有目录与 ZIP 保留为历史，不会被覆盖。

## 验证范围

- 修复前：旧 ZIP 缺少发布入口、通用 CRUD 只保存、CSDL 错误阻断通用 Action 的三种路径已复现。
- 新增 32 项专项回归，包括别名/非法输入、最新已保存定义、预览指纹、独立发布、无变化、回读不一致、权限/超时脱敏、取消、MCP 路由，以及 Online、AD/NTLM、IFD 三种真实请求分支与模拟传输。
- 当前 943 项本地回归全部通过。
- 实际 stdio 服务与本机假 CRM HTTP 服务联调通过：验证成功发布，以及 HTTP 204 但 XML 未生效时正确报错；没有读取 CSDL或调用 PublishAllXml。
- 没有连接或发布同事/用户的真实 CRM；该补丁仍需在同事环境验证。

## English

Version 1.0.0 had no dedicated SiteMap publication tool. Generic record updates saved `sitemapxml`, while the generic Action tool required readable CSDL before calling `PublishXml`. The colleague's original error is unavailable, so the old test server's CSDL failure is a possible additional blocker, not a confirmed diagnosis of their environment.

Version 1.0.1 adds `publish_sitemap` (85 tools total), explicitly marks generic SiteMap saves as publication-unverified, and calls native PublishXml directly. Preview with `id`, then execute using `dry_run=false`, the returned `planHash` as `expected_hash`, and `allow_sitemap_scope_publish=true`. Legacy servers can ignore the ID and publish wider SiteMap scope; the preview states this boundary. Published XML is independently read and compared; accepted requests, unknown results and failed verification remain distinct. No save retry, automatic publication retry or PublishAllXml fallback occurs. AppModule/UI acceptance remains separate.

All 943 local tests pass, including 32 new targeted cases and a real stdio-to-local-fake-CRM integration check. This patch has not been tested against the colleague's live CRM. Upgrade the ZIP, regenerate client paths, reconnect, and verify that `publish_sitemap` appears in the 85-tool inventory.
