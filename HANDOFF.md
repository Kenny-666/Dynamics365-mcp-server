# 换机继续开发说明

## 2026-10-29 可转发的 Windows x64 便携分发包（最新交付）

产物位于 artifacts/distribution-2026-10-29：dynamics365-mcp-1.0.0-windows-x64-portable.zip（约 71 MB）、标准 npm tgz、使用说明、SHA256SUMS.txt 及验证报告。便携包内置 Node.js 24.18.0、.NET 10.0.13 Runtime，支持解压后配置使用；包含配置模板、自检、客户端配置生成器和中英文说明，无真实连接信息。

最终 ZIP 在中文/空格路径解压验证通过：运行时、84 工具发现、DLL 检查、14 项启动及 3 项接收者配置流程检查通过；84 Schema/256 ZIP 变异检查通过。生产 bundle 与此前 910 项回归基线一致。没有发起 CRM 请求，不改变前述真实验收限制。构建入口 scripts/build-portable.mjs，模板 distribution/windows；npm prepack 收集生产依赖许可声明。每个分发文件的哈希及范围见同目录 VALIDATION.md/json。

## 2026-10-29 新建对象实写及元数据扩展联调（最新状态）

已实际调用 65/84 个工具；20 个工具的指定实写回读路径通过，2 个工具的发布请求已受理（页面效果未验收）。19 个尚未调用。所有本次新建的记录、脚本、表、字段、关系、键、选项集、方案及发布者均已清理，既有业务对象修改数为 0。完整逐项表见 docs/CRM_TOOL_COVERAGE.md。

解除关联仍出现 HTTP 204 但关联未清除，现明确报告 READBACK_MISMATCH；CSDL /$metadata 仍因服务端缓存文件权限返回 500。新建键索引在有界回查中持续 Pending，Upsert 预览被活动键规则阻断；IsCustomizable=false 另阻断重新激活预览。默认非等宽表单区块的字段添加被明确拒绝，添加脚本库路径已单独验证。未调用项包括 CSDL 依赖、插件实写所需可部署 DLL/注册样本和仅由本地套件验证的纯本机工具；键 Upsert 状态见逐项表。

910 项本地回归全部通过，失败/跳过为 0；已加载源码覆盖率：行 98.71%、分支 90.61%、函数 97.21%，不含未加载源码、子进程 bundle 或 .NET。84 个 Schema 和 256 个 ZIP 变异检查通过；两个 Node 24 版本各 14 项解包启动验证通过（与主套件重叠，不累加为真实 CRM 验收）。最新验证包及证据位于 artifacts/crm-tool-coverage-2026-10-29；此前包及初轮 12 项报告保留为历史。所有私有信息仅在忽略目录 .cache。

## 2026-10-29 首轮真实 CRM 基础只读联调（历史阶段）

本项目 84 工具版本已通过本地 stdio 和 AD/NTLM 直接连接真实 CRM 9.1.7.5（用户提供写法 9.1.0007.0005），API v9.1。12 项检查中 11 项通过；get_api_operation 因 CRM 的 /$metadata 返回 HTTP 500 而受阻。原始平台错误是 Windows 服务配置文件目录内 Temp/Cds.ODataMetadata 的缓存文件访问被拒绝，需要 CRM 服务器管理员排查。身份、版本、表/字段/选项/关系、主键记录读取、OData、FetchXML、预览和方案列表已核验。

没有修改 CRM 数据或配置，没有验收写入/发布/插件执行/Ribbon UI；公开摘要见 docs/CRM_READONLY_VALIDATION.md。用户最初提供的远程 MCP 是另一个 11 工具旧版本，不能替代本项目验收；其身份工具仍要求未提供的 callerId。本机 OAuth 令牌及原始联调结果保留在忽略目录 .cache/live-crm-readonly-2026-10-29，不纳入传输清单或公开报告。下述全面本地 QA 结果为之前的独立验证阶段，源码及已验证 bundle 未改。

## 2026-10-29 全面本地测试结果（历史阶段）

用户确认功能已足够，并明确暂时没有 CRM 测试环境；当前冻结新增业务功能，完成本地质量验证。84 个工具保持不变。隔离副本离线干净安装 192 个依赖、发布构建、903 项测试全部通过（失败/跳过均为 0）。另完成 84 个输入 Schema 编译和 256 个固定种子 ZIP 变异检查。已加载 TypeScript 源码覆盖率为行 98.69%、分支 90.55%、函数 97.21%，不包含未加载源码、子进程 bundle 或 .NET 代码。

本轮修复调试器错误回显/状态码、Windows 静态路径、XML 非法字符、布尔选项映射、早期元数据标识符校验五类问题，均保留回归测试。当前验证包改为 `artifacts/full-local-test-2026-10-29/dynamics365-mcp-server-1.0.0.tgz`，完整证据与限制见该目录 `REPORT.md`。下文各步骤包及计数是历史记录。真实调试器回环 TCP/HTTP 的 10 项检查也已通过；真实 CRM、实际 Ribbon 页面、Node 18、浏览器呈现和联网依赖漏洞审计未验收。

最近开发日期：2026-10-29。已完成步骤 1–5、步骤 6.1–6.7、步骤 7.1–7.2、7.3/7.4 首批、7.5 经典 Ribbon 本地候选及 7.6 受控既有非受管导入/独立整表发布/定义回读的本地范围。用户指定 Ribbon 优先于尚未实施的 Custom API 定义维护。步骤 6 剩余保留，步骤 7 整体和真实验收尚未完成。

## 压缩包内容

- `dynamics365-mcp-server-main/`：当前完整源码、测试、npm/Yarn 锁文件、文档、实施计划、实施记录和 `dist/index.cjs`。
- 同级的 `dynamics365-mcp-server-main.zip`：用户最初提供的源码备份。
- 同级的 `local-d365-meta-mcp-0.1.0.tgz` 和 `.tgz.gtar`：旧发布包，供后续功能迁移参考。
- `artifacts/dynamics365-mcp-server-1.0.0.tgz`：当前本地验证用 npm 包，不代表已经完成全部计划或生产验收。
- `artifacts/step4-webresources/dynamics365-mcp-server-1.0.0.tgz`：步骤 4.1 的最新本地验证包，同目录 VALIDATION.md 记录验证范围。
- `artifacts/step4-plugins/dynamics365-mcp-server-1.0.0.tgz`：步骤 4.2 的最新本地验证包，同目录 VALIDATION.md 记录验证范围；原先各包保留。
- `artifacts/step4-records/dynamics365-mcp-server-1.0.0.tgz`：步骤 4.3 的最新本地验证包，同目录 VALIDATION.md 记录验证范围；包含当前 29 个工具。
- `artifacts/step5-evidence/dynamics365-mcp-server-1.0.0.tgz`：步骤 5 的最新本地验证包，同目录 VALIDATION.md 记录验证范围；包含当前 38 个工具，历史各包保留。
- `artifacts/step6-model/dynamics365-mcp-server-1.0.0.tgz`：步骤 6.1 的最新本地验证包，同目录 VALIDATION.md 记录验证范围；包含当前 43 个工具，历史各包保留。
- `artifacts/step6-structure/dynamics365-mcp-server-1.0.0.tgz`：步骤 6.2 的最新本地验证包，同目录 VALIDATION.md 记录验证范围；包含当前 47 个工具，历史各包保留。
- `artifacts/step6-choices/dynamics365-mcp-server-1.0.0.tgz`：步骤 6.3 的最新本地验证包，同目录 VALIDATION.md 记录验证范围；包含当前 51 个工具，历史各包保留。
- `artifacts/step6-ui/dynamics365-mcp-server-1.0.0.tgz`：步骤 6.4 的最新本地验证包，同目录 VALIDATION.md 记录验证范围；包含当前 55 个工具，历史各包保留。
- `artifacts/step6-images/dynamics365-mcp-server-1.0.0.tgz`：步骤 6.5 的最新本地验证包，同目录 VALIDATION.md 记录验证范围；包含当前 59 个工具，历史各包保留。
- `artifacts/step6-assemblies/dynamics365-mcp-server-1.0.0.tgz`：步骤 6.6 的最新本地验证包，同目录 VALIDATION.md 记录验证范围；包含当前 62 个工具与固定 .NET 元数据读取器，历史各包保留。
- `artifacts/step6-maintenance/dynamics365-mcp-server-1.0.0.tgz`：步骤 6.7 的最新本地验证包，同目录 VALIDATION.md 记录验证范围；包含当前 65 个工具，历史各包保留。
- `artifacts/step7-operations/dynamics365-mcp-server-1.0.0.tgz`：步骤 7.1 的最新本地验证包，同目录 VALIDATION.md 记录验证范围；包含当前 66 个工具，历史各包保留。
- `artifacts/step7-solutions/dynamics365-mcp-server-1.0.0.tgz`：步骤 7.2 的最新本地验证包，同目录 VALIDATION.md 记录验证范围；包含当前 70 个工具，历史各包保留。
- `artifacts/step7-transfer/dynamics365-mcp-server-1.0.0.tgz`：步骤 7.3 首批 ZIP 检查、原生导出/首次非受管异步导入和任务跟踪验证包；74 工具，同目录 VALIDATION.md 记录验证范围，历史包保留。
- `artifacts/step7-verification/dynamics365-mcp-server-1.0.0.tgz`：步骤 7.4 首批选定属性快照、离线跨环境对比、当前目标验证及显式导入日志验证包；78 工具，同目录 VALIDATION.md 记录验证范围，历史包保留。
- `artifacts/step7-ribbon/dynamics365-mcp-server-1.0.0.tgz`：步骤 7.5 首批经典 Ribbon 原生读取、方案检查和本地自定义按钮编辑候选 ZIP 验证包；81 工具，同目录 VALIDATION.md 记录验证范围。
- `artifacts/step7-ribbon-deployment/dynamics365-mcp-server-1.0.0.tgz`：当前最新本地验证包，步骤 7.6 受控既有非受管 Ribbon 整包导入、独立整表发布及定义回读；84 工具，同目录 VALIDATION.md 记录范围和同进程回执限制。
- `MANIFEST_SHA256.json`：原始传输基线，保留不改；继续开发后的最新文件大小和 SHA-256 见 `MANIFEST_CURRENT_SHA256.json`。

`node_modules`、临时测试缓存、编辑器缓存和本机运行配置不随包转移。连接凭据不随包转移；当前已完成首轮真实 CRM 只读联调，没有执行真实 CRM 写入或发布。

## 在公司电脑恢复

1. 将 ZIP 完整解压到任意可写目录，保持目录层级。原发布包与项目文件夹同级，现有文档的相对引用才能继续有效。
2. 使用 Node.js 和 npm。项目声明 Node.js >=18；当前构建和测试验证使用 v24.18.0（此前换机基线为 v24.22.1）。
   新增 DLL 检查/更新需要 .NET 10 Runtime；完整测试也需要它。已包含编译好的读取器，其余工具与程序集元数据查询/发现无需 .NET。重建读取器或 npm pack/build:release 需要 .NET 10 SDK；dotnet 不在 PATH 时设置 D365_DOTNET_PATH 为可执行文件路径。读取器的 .NET 10 与待上传插件的 .NET Framework 4.6.2–4.8 目标是两个要求。
3. 在终端进入解压后的 `dynamics365-mcp-server-main`，执行：

```powershell
npm ci
npm run build
npm test
```

安装开发依赖需要能够访问 `package-lock.json` 中指定的包仓库。已构建的 `dist/index.cjs` 是包含运行依赖的单文件，无须先安装 `node_modules` 即可运行：

```powershell
node .\dist\index.cjs
```

这是 stdio MCP 服务，需要由 MCP 客户端连接；在普通终端启动后等待输入是正常行为。缺少 CRM 配置时仍可列出工具，实际 CRM 调用会提示缺少配置。

本机路径 `G:\AI\Dynamic 365 MCP\...` 在公司电脑可以不同。MCP 客户端配置应指向新位置的 `dist/index.cjs`，不要照抄旧绝对路径。

## 当前进度

- 步骤 1：源码和发布包的基线检查完成。
- 步骤 2：构建入口、延迟初始化、配置校验、请求层、超时、有限读取重试、Token 隔离、结构化错误和环境检查的本地实现完成。
- 步骤 3：查询状态语义、OData / FetchXML 分页、续查缓冲、排序及预览一致性的本地实现完成。
- 步骤 4.1：Web 资源查询/创建/更新迁移完成，补充保存/发布分离、单独发布、预览、ETag 和参数别名。
- 步骤 4.2：插件注册元数据、步骤查询/注册/更新迁移完成；默认不读取密文，支持预览、重复策略、配置保留/替换/解绑及写入阶段证据。
- 步骤 4.3：通用记录写入、替代键 Upsert、关联/取消关联及原生批处理/事务组完成，支持预览、阶段状态、取消和进度。
- 步骤 5：只读日志/失败作业/步骤关联、当前开关、主体/角色、原生有效访问及审计历史/详情完成；权限失败与证据缺失分开呈现，不编造清理、人员/时间或故障根因。
- 步骤 6.1：完整表/基础字段定义、普通自定义表与 String/Memo/Integer/Decimal 字段创建、完整定义标签 PUT、解决方案/前缀/受管限制和单表发布完成。默认预览；实际标签更新需当前指纹及显式无保护更新，存在并发窗口；回读不匹配/失败保留保存证据。
- 步骤 6.2：1:N/Lookup、N:N 关系定义创建/读取，替代键定义创建/读取与索引状态/可选作业读取完成。资格检查是只读原生 POST；创建后独立回读关系与 Lookup，键保存不等于索引 Active，不自动重建/激活或重放。
- 步骤 6.3：全局/局部选项读取、全局创建、选项插入/标签合并更新、独立发布完成；字段扩展到九类。共享选项须显式全局目标，实际选项写入需当前指纹及无保护参数，分配值/语言/绑定独立回读。受管升级、删除/排序/state/status 不在本批。
- 步骤 6.4：未发布组件发现/读取，Main 表单字段放置/库/事件，公共视图根列/宽度/排序结构化编辑完成。复用兼容原生控件，保留视图筛选/依赖；指纹和原生并发元数据限定 ETag/显式回退，保存后独立回读，不自动发布。脚本资源发布与表单发布分开；没有运行脚本或验证 UI。
- 步骤 6.5：Image 查询/注册/更新/删除完成，写入限实体专属 Create/Update/Delete/Assign/SetState 消息；字段读取资格、阶段和 Pre/Post 别名冲突检查；默认预览/指纹和 Image 表原生并发能力限定，保存回读与未知结果不重放。更新/删除要求确认非受管且可自定义；没有程序集上传/更新或解决方案关联。
- 步骤 6.6：本地 DLL 实际元数据检查、程序集元数据查询和非受管数据库程序集兼容更新完成。安全读取不执行 DLL；同名称/公钥/区域、同主次版本非降级、同框架/引用、相同已注册插件类型集；工作流/包/类型迁移与未解析继承阻断。写入后核对实际二进制哈希、程序集身份和插件类型 ID/名称/版本/区域/公钥。默认预览、指纹与原生并发能力限定；未知结果不重放。
- 步骤 6.7：既有普通自定义字段设置、1:N 菜单/级联及 N:N 双侧菜单完整定义 PUT、Failed 键 ReactivateEntityKey 完成。字段只允许长度/数值范围/精度保留或扩展，受控要求级别/审计/高级查找/默认值/日期显示格式；不改类型/日期行为/安全或业务数据。计划 planHash 绑定环境/补丁/基线，实际执行需 expected_hash=planHash 及 allow_unprotected_write=true，无原子锁。键实际 LogicalName 来自元数据，提交受理、新作业关联、Active 状态分开报告；未知结果不重放。
- 步骤 7.1：新增 get_api_operation，通过当前 CSDL 查询真实签名/绑定/参数类型；完善 call_d365_api_action 的实体/集合绑定、重载选择、类型/值/结构/实体引用验证及 Function 别名编码。保留默认 Action 即时执行/原始数据返回，可选预览（默认隐藏值）/planHash/回执；错误保留未知/拒绝证据，不额外重放 Action。
- 步骤 7.2：解决方案目录、成员/根包含范围、required/dependent/delete 三类依赖查询与受控添加组件完成。分开原对象 GUID/type 与成员行 GUID；校验实际源对象及普通非受管目标，当前 CSDL 验证原生操作，完整可见基线与计划指纹、显式无保护 Action。固定 AddRequiredComponents=false/DoNotIncludeSubcomponents=true，回读成员并报告非事务观察差异，不声称导出闭包/可部署；无组件/解决方案创建、移除、删除或自动发布。
- 步骤 7.3 首批：本地 ZIP 有界头/路径/全内容 CRC 检查和清单身份读取（不解压/执行），原生同步导出至独占新文件并校验身份/哈希，普通非受管方案首次异步导入和独立任务状态/方案身份回读完成。默认预览、当前 CSDL/WhoAmI/包哈希绑定；导入需显式无保护参数。受理、完成、进度、回读、部署验收分开，未知提交保留客户端 ImportJobId，不自动重放。既有方案更新/受管/升级/覆盖、异步导出、完整组件差异及显式日志仍待后续。
- 步骤 7.4 首批：当前环境显式成员/根范围和五类选定属性快照、无 CRM 配置离线对比、当前目标选定范围验证及显式原生 importjob XML 日志完成。以逻辑名称匹配，规范化标签语言/选项值，字节只返哈希；GUID 保留为证据而不参与跨环境匹配。缺口/截断/不稳定/歧义不假通过，不把读取受限的未匹配项当确认缺失。日志默认隐藏正文、显式请求限长脱敏；任务/日志/匹配分开，deploymentVerified 始终 false，不声明全负载/发布/运行时验收。
- 步骤 7.5 首批：原生当前 CSDL/枚举/压缩 RibbonXml.xml 读取；本地非受管方案内单表 RibbonDiffXml 检查、新增独立 JS 自定义按钮、合并多语言文字/顺序、专用矛盾 DisplayRule 隐藏/恢复。引用 JS/图标须在包中，保护共享命令/标签/规则；默认预览与指纹、独占新 ZIP、包/外部 XML/本地文件哈希回读。只改本地候选包，不导入/发布/执行脚本，不支持内置替换/任意规则/现代命令；不是已部署按钮。
- 步骤 7.6 首批：同源/changes 精确重放候选，核对实际组织/调用者/既有普通非受管方案/发布者/版本/可自定义表/完整成员和新鲜原生导出基线，默认预览+指纹/无保护+整包范围后单次异步导入。原生受理签发同进程 HMAC 回执；独立发布需回执绑定、原生成功终态和完成/成功日志，再预览+指纹/无保护/整表范围。发布整表可能带其他 pending，未锁定/完全读取，不发布 JS/图像资源。HTTP 成功后定义回读失败保留 published=true；未知不重放。无回执可只读核对，不证明 UI/运行时、完整部署或持久因果链。
- 最新验证：864 项离线回归测试通过（本批新增 62 项）；步骤 7.6 实际 npm 包解压到无 `node_modules` 目录后，14 项 MCP 启动检查通过。三种认证实际请求分支的导入/独立发布/定义回读模拟传输通过，测试阻断网络，未访问真实 CRM。最新包 SHA-256：C46CDFBD66959D5B17C1817A3210F8121B98FC867343279648212A8392B6BB81。
- 当前 MCP 工具共 84 个；步骤 6 整体、步骤 7 后续和新增能力真实验收均未完成。
- Online、AD/NTLM、IFD/ADFS 都属于支持范围，但尚未提供真实环境连接，实际鉴权、权限、证书/代理和分页仍待分别联调。
- 已引入可选固定 .NET 10 元数据读取进程（无 CRM 连接/SDK 写入功能），程序集更新仍复用同一 Web API 后端；尚未引入 CRM .NET SDK 传输适配器。其他能力优先复用原生消息；未知写入不切换后端重放。

## 下一步：继续实施计划的步骤 7

用户已明确要求“直接继续步骤七”，又指定“继续ribbon按钮”。接续 7.6 首批，下一批优先 Ribbon 引用 Web Resource 的独立发布/内容核对、回执持久恢复与真实 UI 验收准备，再扩展内置按钮、规则和现代命令。实际部署需指定测试环境，当前无真实连接；不把本地导入/发布模拟测试当作按钮已上线。Custom API 定义仍未实施，不自动切回优先项。更多快照/子组件/完整负载/依赖/受管层/发布/运行时验证，以及既有方案通用更新/受管导入/升级/覆盖、异步导出等未覆盖；步骤 6 剩余保留。

步骤 7.6 三工具不重复实现。import_ribbon_solution 只接收两份本地 ZIP 路径、logical_name 和相同结构化 changes；与当前服务重放结果逐字节一致，源与新鲜 ExportSolution 导出全有效负载相符（只忽略压缩元信息/XML格式），并验证当前 WhoAmI、方案/版本/发布者、可自定义表及完整可见成员。不是任意既有方案更新入口。整包导入固定不激活工作流/受管覆盖/跳依赖/holding/upgrade/环境覆盖；无变化不导入。execute 需 planHash+allow_unprotected_write+allow_full_solution_import。原生受理/未知/失败和 GUID/原生键分开，未知不重放。importReceipt HMAC 只在同一服务进程有效，不是 CRM 凭证；重启/篡改即拒绝发布，不可为补回执重新导入。publish_ribbon_solution 需同文件/changes/回执及原生成功导入终态、匹配方案且 completed 的成功日志，独立预览 planHash+allow_unprotected_write+allow_full_table_publish；新鲜非 Ribbon 可导出基线/current CSDL/有效 Ribbon 复核。PublishXml 为整张表，其他 pending 字段/表单/视图也可能发布，pending 未完全读/锁；JS/图标资源未在此发布，需既有单独 Web Resource 发布工具或后续受控扩展。成功但回读差异/失败保留 published=true，unknown为null，不自动重导/重发。verify_ribbon_deployment 无回执只读，比较选定按钮属性、command/actions/参数结构、局部 display rules 和规范化标签，不输出参数值或执行代码；不同/缺失/歧义不假通过，不证明导入/发布行为、资源内容、UI/权限/运行时或完整部署。持久回执采用/重启后恢复发布仍未实现，不自动降级为调用者任意作业 ID。

步骤 7.5 三工具不重复实现。get_ribbon_definition 仅原生 RetrieveEntityRibbon，当前 CSDL 校验，All/Form/HomepageGrid/SubGrid 枚举别名，ZIP 的 RibbonXml.xml <=2 MiB 不解压/执行；默认不返原始 XML/参数字面值，完整定义是合并结果，不可直接写回。inspect_ribbon_solution 和 edit_ribbon_solution 无需 CRM 配置，复用 <=32 MiB 安全 ZIP，customizations.xml <=4 MiB/有界 XML；限定普通非受管单表、publisher 前缀 ID、显式当前表插入位置。新增按钮要求包内 JS 类型 3 和图标 5/6/7/10；有序 crm/string/bool/int 参数，不执行或证明函数/图标尺寸/目标位置。update 合并语言/顺序并保留处理器、规则和独立提示引用；visibility 仅专用矛盾 CrmClientTypeRule，保护共享命令/规则，不生成/删除既有 HideCustomAction。show 只移除此 gate，不保证可见或绕权限。默认预览，实际保存需当前 planHash、独占新 .zip；输入不覆盖，只有 customizations.xml 重序列化，其他压缩块/内容及清单版本不变，选定 Ribbon 外语义校验和本地哈希回读。不是完整 XSD/运行时验证。整包导入会应用其他组件，既有 import_solution_async 的首次导入限制仍有效，不能把它当既有 Ribbon 更新后门；导入/发布/并发与回滚需独立工作流及真实验收。

步骤 7.4 四工具不重复实现。get_solution_snapshot 当前组织只读抓取，top 默认 100/max 200，2 MiB 的 d365.solution.snapshot.v1 JSON；profile 支持 1 表、9 全局 Picklist、10 关系、61 Web 资源、91 非包数据库程序集。仅选定属性，二进制 <=16 MiB 只返哈希、不执行；类型/权限/字段/内容缺失明确为缺口。比较用完整 snapshot 对象，分别配置环境采集，不接受临时 URL/凭证或跨组织复用 Token。严格 shape/规范化/哈希只能验证一致性，不能证明来源真实；根引用映射 portable key，标签语言与选项值排序，忽略 per-user 标签/传输 GUID，选项显示顺序不比较。missing/extra 仅在对侧清单完整可解析时确认，否则 unmatched；未知根/重名/不完整/不稳定为 inconclusive，已知差异保留。native 普通读取不证明发布完成，无子组件/完整元数据展开。verify_solution_deployment 只做当前目标 selectedScopeCheck 和可选独立作业/日志观察，不能读成完整部署通过或因果包/作业链已证实。get_solution_import_log 只读 importjobs.data XML（不是数据导入 importlogs），2 MiB 有界/无 DTD/entity；默认不返正文/原始 XML，显式 include_text 时先最佳努力脱敏再限长，任意业务文本仍可能敏感。计数含 manifest/section，不是唯一组件数；未知/空日志和成功 manifest 都不证明异步/部署成功。所有新工具无写入/发布/修复/轮询/调度。

步骤 7.3 新增四工具不重复实现。ZIP <=32 MiB、10000 项、单项膨胀 <=64 MiB/总量 <=256 MiB、solution.xml <=2 MiB；不支持 ZIP64/加密/多磁盘/链接/危险路径/名称冲突。检查不证明可信代码、依赖闭包或可部署。导出仅普通非受管源，可选 managed 输出，目标文件独占创建且失败可能留空/部分文件；不要当作有效产物或自动覆盖重试。导入仅普通非受管首次方案名，当前调用者可见缺席不是组织全局不存在；首次导入仍可改变共享非受管组件，OverwriteUnmanagedCustomizations=false 不是普遍不覆盖承诺。原生 ImportJobId 为执行时客户端 GUID，响应 ImportJobKey 是独立字符串，保留二者/匹配指标；AsyncOperationId 单独跟踪。accepted=true/null/false 与完成/进度/回读分开；进度 100 和方案身份匹配不证明异步成功或部署，调用者给出的两个作业 ID 没有独立关联证明。没有自动轮询/调度/取消/重启/重放或单独发布，状态不选择原始 data/message/日志。后续要新增明确受控的日志、差异和验证范围。

步骤 7.2 的四个工具不重复实现。添加仅操作原生 AddSolutionComponent；源对象 ID 不是成员行 ID，Attribute/Key 需父表 logical_name。允许引用既有受管源组件到普通非受管目标，不等于修改源定义或受管层。预览需完整可见成员/required 基线，执行 expected_hash=planHash 加 allow_unprotected_write=true，无原子锁。固定不自动加依赖/子组件，平台仍可能加父 shell；成员行及观察差异不是导出内容/全图/部署就绪证明。依赖空结果不授权删除，回读失败保留 saved=true，未知添加不重放。Native paging 使用 Prefer+nextLink/$skiptoken，不与 $top/$skip 混用；分页必须保持同服务/集合/过滤/参数范围。当前支持 12 类组件添加，更多类型/范围/移除另行实施。

步骤 7.1 已有签名查询与调用增强，不重复实现。当前 CSDL 是参数/绑定证据，不能信任调用方声明的类型，也不退回未验证 URL 拼接；不支持的类型/结构/引用在发送前报错。旧 call_d365_api_action 默认仍是即时 Action、直接返回原生数据，与其他模型工具默认预览不同；客户端需显式 dry_run=true。预览默认隐藏参数值，expected_hash 使用该操作 planHash，不能冒充业务记录锁；返回原生响应不代表异步完成或业务回读。

保留之前的维护/插件边界：字段不收缩或迁移类型，键受理/新作业/Active 分开；UI 读未发布基线；程序集实际元数据读取不执行 DLL，固定读取器需 .NET 10 Runtime，其他新操作仍 Node-only；无 CRM .NET SDK 传输后端。保持前缀/解决方案/受管、完整 PUT/MergeLabels、真实并发能力限定、保存/发布分离、独立回读及未知写入/提交不重放。真实权限/发布/级联/索引/插件执行/部署均需另行验收。

注意当前源码项目为 `dynamics365-mcp-server@1.0.0`，旧发布包为 `@local/d365-meta-mcp@0.1.0`，是不同项目形态，不能仅凭版本号判断继承关系。迁移前对照实际工具参数和实现，避免把内部模块存在误当成已经开放为 MCP 工具。

## 继续前应阅读

1. `IMPLEMENTATION_PLAN.md`：完整阶段顺序、原生 SDK/API 对照和验收标准。
2. `IMPLEMENTATION_PROGRESS.md`：已经实施的修改、测试及边界。
3. `BASELINE_REVIEW.md`：修改前的历史基线和功能差异，不能把其中的历史问题全部当成当前仍未修复。
4. `README.md`：当前构建、连接、查询参数及续查契约。

## 可直接复制给新电脑上的 Codex

> 继续 Dynamics 365 MCP 项目，先读 HANDOFF/计划/实施记录/BASELINE_REVIEW/README。用户 Ribbon 优先，不自动切回步骤 6/Custom API。当前步骤 1–5、6.1–6.7、7.1–7.2 和 7.3–7.6 首批本地完成，84 工具、864 离线测试、实际包 14 启动检查通过，最新包 artifacts/step7-ribbon-deployment。下一批优先引用 JS/图像独立发布/内容匹配、持久回执恢复与真实 UI 验收准备，再扩展内置按钮/规则/现代命令。已有本地经典 Ribbon 编辑和受控既有非受管整包导入/独立整表发布/选定定义回读，不重复实现。新导入要求源/候选/changes 精确重放、当前 WhoAmI/目标/publisher/版本/表/完整成员与新鲜导出全负载基线，默认预览和指纹/无保护/整包参数。不是任意既有方案更新。原生受理签发同进程 HMAC 回执；发布需同回执/文件/changes、native成功终态与完成成功日志，独立指纹/无保护/整表范围；可能发布其他 pending，未完全读/锁，JS/图标本请求不发布。回执不能跨进程，丢失/重启不可以重导入补签，持久恢复待做；已有只读verify可查定义，状态/日志也可独立查。原生成功但回读失败保留published=true，unknown为null，不自动重导/重发。不执行脚本/证明UI或完整部署。保留原首次非受管 import_solution_async 限制、ZIP/回执/成员ID与原对象ID/发布及模型UI并发边界。更多快照/子组件/完整负载/受管层/依赖/运行时、通用既有/受管升级/覆盖/异步导出/Custom API 未实现。固定 .NET10读取器只读DLL，其余新路径Node-only，无CRM SDK传输后端。无真实CRM连接/部署/按钮验收；步骤6剩余、7整体和8未完成。每批独立验证、打包并同步文档/校验清单。
