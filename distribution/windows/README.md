# Dynamics 365 MCP 便携包（Windows x64）

本包包含已构建的 MCP 服务、Node.js 和 .NET 10 Runtime。解压后即可配置使用，无需安装 Node.js、npm、.NET SDK 或下载依赖。适用于 Windows x64；其他操作系统可使用随附的标准 npm 包并安装相应运行时。

[English](README.en.md) · [完整功能说明](app/README.md) · [84 工具联调覆盖表](app/docs/CRM_TOOL_COVERAGE.md)

## 三步接入

1. 将整个文件夹解压到一个固定、可写的目录，例如 `D:\MCP\Dynamics365-MCP`。先解压全部文件，再运行脚本。
2. 双击 `configure.cmd`，在打开的 `.env` 中填写自己的 CRM 地址、域、账号和密码并保存。默认模板为本地 CRM 的 AD/NTLM；Online 使用 `.env.online.example`，IFD 使用 `.env.ifd.example`，将相应模板复制为 `.env` 后填写。`ORG_URL` 使用组织根地址；`API_VERSION` 根据实际版本填写 v9.1 或 v9.2。
3. 双击 `generate-client-config.cmd`，将生成的 `mcp-client.generated.json` 中的服务器条目合并到支持 stdio 的 MCP 客户端配置，随后重启客户端或重新连接 MCP。

生成的配置使用解压目录的绝对路径，并通过包内 Node.js 启动 `launch.cjs`。移动文件夹后重新生成客户端配置。客户端自己的 JSON/TOML 设置格式请按其要求填写相同的 `command` 和 `args`。CRM 凭据保存在本包根目录 `.env` 中，客户端可通过进程环境变量覆盖同名 CRM 设置。

## 本地自检

双击 `check.cmd`。检查文件 SHA-256、内置运行时、MCP 初始化、84 个工具列表，以及通过内置 .NET 读取器完成的本地 DLL 元数据检查。自检不连接 CRM；CRM 认证、权限及网络连通性在调用 CRM 工具时验证。

`start-mcp.cmd` 可手动启动 stdio 服务。启动后等待客户端协议输入属于正常状态；通常由 MCP 客户端自动启动。`launch.cjs` 自动定位本包的 `.env`、服务及内置运行时，支持中文和带空格的解压路径。

## 功能与验证状态

共 84 个工具，覆盖记录/OData/FetchXML、表与字段、关系/备用键/选项集、表单和视图、Web Resource、插件注册与 DLL 检查、审计/权限/诊断、解决方案与经典 Ribbon。详见完整功能说明。

2026-10-29 的本地回归为 910 项通过；真实 CRM 已调用 65/84 个工具，20 个指定实写回读路径通过、2 个发布请求受理。全部真实功能及页面效果仍未完整验收。已知限制包括测试环境 CSDL 缓存权限、解除关联实际无效、备用键索引 Pending；插件真实执行和 Ribbon 页面验收仍待测试条件。逐项边界见覆盖表。

写入、删除、导入和发布工具会使用所配置身份的真实 CRM 权限；部分工具默认直接执行，请先查看工具参数和预览能力。接收者需要使用自己的环境和身份。

## 转发与文件

直接转发原始 ZIP 即可。重新打包已配置的文件夹前，移除 `.env`、实际凭据及自行产生的导入包/导出文件。原始分发包只含占位模板，不包含开发者的 CRM 地址、账号、密码或令牌。

- `runtime/`：内置 Node.js 和 .NET 运行时。
- `app/`：已构建服务、DLL 读取器、完整中英文说明及工具文档。
- `licenses/`：运行时许可证和第三方依赖声明。
- `manifest.json`：原始包内文件的 SHA-256；自建 `.env` 和生成的客户端配置不在其中。
- `release-info.json`：构建版本、运行时和验证范围。

本包的本地源码验证版本为 1.0.0。许可证按随附项目及第三方声明执行。
