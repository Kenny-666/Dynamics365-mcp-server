# 修改实施记录

## 2026-10-29 可转发的 Windows x64 便携分发包（最新交付）

产物位于 ../artifacts/distribution-2026-10-29：dynamics365-mcp-1.0.0-windows-x64-portable.zip（约 71 MB）、标准 npm tgz、使用说明、SHA256SUMS.txt 及验证报告。便携包内置 Node.js 24.18.0、.NET 10.0.13 Runtime，支持解压后配置使用；包含配置模板、自检、客户端配置生成器和中英文说明，无真实连接信息。

最终 ZIP 在中文/空格路径解压验证通过：运行时、84 工具发现、DLL 检查、14 项启动及 3 项接收者配置流程检查通过；84 Schema/256 ZIP 变异检查通过。生产 bundle 与此前 910 项回归基线一致。没有发起 CRM 请求，不改变前述真实验收限制。构建入口 scripts/build-portable.mjs，模板 distribution/windows；npm prepack 收集生产依赖许可声明。每个分发文件的哈希及范围见同目录 VALIDATION.md/json。

## 2026-10-29：84 工具覆盖、新建元数据与回读修复

已实际调用 65/84 个工具；20 个工具的指定实写回读路径通过，2 个工具的发布请求已受理（页面效果未验收）。19 个尚未调用。所有本次新建的记录、脚本、表、字段、关系、键、选项集、方案及发布者均已清理，既有业务对象修改数为 0。

解除关联仍出现 HTTP 204 但关联未清除，现明确报告 READBACK_MISMATCH；CSDL /$metadata 仍因服务端缓存文件权限返回 500。新建键索引在有界回查中持续 Pending，Upsert 预览被活动键规则阻断；IsCustomizable=false 另阻断重新激活预览。默认非等宽表单区块的字段添加被明确拒绝，添加脚本库路径已单独验证。未调用项包括 CSDL 依赖、插件实写所需可部署 DLL/注册样本和仅由本地套件验证的纯本机工具；键 Upsert 状态见逐项表。

910 项本地回归全部通过，失败/跳过为 0；已加载源码覆盖率：行 98.71%、分支 90.61%、函数 97.21%，不含未加载源码、子进程 bundle 或 .NET。84 个 Schema 和 256 个 ZIP 变异检查通过；两个 Node 24 版本各 14 项解包启动验证通过（与主套件重叠，不累加为真实 CRM 验收）。验证包见 ../artifacts/crm-tool-coverage-2026-10-29，原始证据在忽略目录。

## 2026-10-29：首轮真实 CRM 只读联调

- 当前 84 工具版本经本地 stdio、AD/NTLM 直接连接真实 CRM；确认服务端 9.1.7.5、API v9.1、WhoAmI 身份一致。
- 12 项检查中 11 项通过，包含环境/元数据、记录主键读取、OData、FetchXML/预览和方案列表；记录读取未选择客户名称或业务字段。
- get_api_operation 失败于平台 /$metadata HTTP 500；单独诊断确认为服务端 Temp/Cds.ODataMetadata 缓存文件访问被拒绝。没有为绕过该问题更改代码、权限或服务端配置。
- 本轮没有 CRM 写入/发布或 UI 运行验收。公开摘要 docs/CRM_READONLY_VALIDATION.md 不含内网地址、账号、记录 ID 或令牌；本机私有证据保留在被忽略的 .cache。

## 2026-10-29：全面本地 QA，冻结新增业务功能

- 用户确认暂时没有 CRM 测试环境，本轮全部在本地完成；工具数量维持 84。
- 隔离副本 `npm ci --offline --no-audit --no-fund` 安装 192 个依赖，独立 `build:release` 通过，.NET 构建零警告、零错误。
- 完整回归 903 项全部通过，无失败/跳过；另编译 84 个输入 Schema，核对全部 28 个测试文件已纳入 npm test，执行 256 个固定种子变异 ZIP 检查。
- 修复五类缺陷：调试器非法 JSON/信封错误回显及状态码、Windows 备用数据流/设备路径、五个 XML 入口的 XML 1.0 非法字符/数字引用、Boolean TrueOption/FalseOption 映射、早期元数据查询参数的逻辑标识符校验。修复前失败日志和回归用例均保留。
- V8 已加载 TypeScript 源码覆盖率：行 98.69%，分支 90.55%，函数 97.21%；详细 lcov/JUnit、包校验和边界见 `../artifacts/full-local-test-2026-10-29/REPORT.md`。
- 没有真实 CRM/UI 运行验收；没有 Node 18 实机运行或联网漏洞审计；HTTP handler 已在进程内测试；首次 socket 探测因沙箱 EACCES 受限，随后经授权的本机回环验证完成 10 项真实 TCP/HTTP 检查并关闭服务。

## 2026-10-26：批次 2.1，构建入口与初始化

### 已实现

- build / build:release 均先进行类型检查，再生成 dist/index.cjs；main、start、bin 使用同一入口。
- npm pack 自动构建，明确分发 bundle、CLI 与 README；CLI 在当前 Node 进程加载，不再额外 spawn node。
- 配置读取和校验拆到 src/config.ts，服务在首次 CRM 调用时初始化；无配置时仍可发现全部 15 个工具。
- 配置错误返回 D365_CONFIG_INVALID，提示设置名称；未知工具与 CRM 配置错误分开处理。
- 本地缓存清除不要求 CRM 配置，不提前创建默认 TTL 的缓存实例。
- 更新构建和配置说明；现有 CRM 工具名称及参数未修改。

### 验证

- TypeScript 检查、build、build:release、npm pack prepack 均通过。
- 19 项离线回归测试通过：配置、失败后重新初始化、三种认证的启动和工具枚举等。
- 将实际生成的 npm 包解压到独立目录，没有 node_modules，10 项启动测试通过；npm start --silent 协议握手通过。
- 启动测试通过预加载器阻断网络，未连接实际 CRM。Online / NTLM / IFD 在真实环境中的鉴权仍需后续联调。
- 验证包保存在工作目录 .cache/packages 中，不替换用户原始发布包。

### 原生能力

本批次处理本地 MCP 生命周期和构建，不涉及 CRM 平台操作。后续业务能力按计划优先复用 SDK / Web API 原生消息。

### 下一批次

统一请求、错误、超时与重试，并隔离 Token 缓存及合并并发刷新。

## 2026-10-26：批次 2.2 / 2.3，请求层与环境检查

### 已实现

- 增加 CrmDataClient / CrmRequestClient / CrmResponse 类型，业务服务不再依赖具体认证类；makeRequest 的数据返回方式保持兼容。
- requestWithResponse 返回 HTTP 状态与必要响应头，支持并发条件头和 AbortSignal。
- CRM 和 Token 请求均设置超时；默认 GET 最多重试两次，遵循 Retry-After。超出等待上限时交给调用方，不提前重试。
- 应用层不自动重复写入；写入超时、取消或服务端异常返回 outcome=unknown。NTLM 握手仍由认证库处理。
- GET 收到 401 允许刷新一次，403 不刷新。错误返回平台错误码、请求 ID 等证据，避免序列化 Axios 配置、正文和凭据。
- Token 缓存按组织、认证端点和身份/凭据隔离；同一客户端并发刷新合并，短有效期 Token 正常失效。
- 请求和继续链接限制在同一组织 API 范围内，禁止自动跟随重定向；支持取消 Token 等待而不取消其他调用者的共享获取。
- 新增只读 get_environment_capabilities：使用原生 WhoAmI、RetrieveVersion、EntityDefinitions；区分服务器版本和配置的 API 版本，区分元数据存在与权限、SDK 是否可用。
- 工具数由 15 增至 16，原有工具名称、参数保持。元数据不完整或请求失败时不把缺失项判定为不支持；401/403 原样保留错误性质。

### 验证与边界

- TypeScript / 单文件构建通过；47 项离线测试通过，包括三种认证分支、并发刷新、缓存隔离、重试、错误脱敏、取消和环境元数据分页。
- 最新实际 npm 包再次解压到无 node_modules 的独立目录，10 项启动检查通过；npm start --silent 完成 MCP 握手并发现 16 个工具。原始发布包未替换。
- 本阶段环境检查直接复用 CRM 原生接口，无须新增 .NET SDK 依赖。SDK 适配器明确返回未配置、未验证，不虚报已支持。
- 用户明确要求 Online、AD/NTLM、IFD/ADFS 全部纳入范围。尚未提供各真实环境连接，因此这些环境的实际鉴权、代理/证书和平台权限仍待联调。
- API_VERSION 继续使用显式配置（默认 v9.2）；工具不自动探测或切换版本。收到 401/403 不会尝试其他版本并误报为不支持。

### 下一步

按步骤 3 修复查询状态语义及分页；后续 SDK / 平台操作继续按实际环境能力选择，不仅依据版本号假定支持。

## 2026-10-26：步骤 3，查询状态与分页

### 已实现

- OData / FetchXML 增加 state_mode=legacy/all/values。保留 legacy 数字 0 的意图，依据元数据判断字段和取值；不把 0 一律解释为“活动”。显式 values 与现有根状态条件冲突时报错。
- OData 按词法区分字符串、主表字段、导航路径和 lambda；FetchXML 使用 @xmldom/xmldom 0.9.12 解析，区分根实体、别名、关联条件及字段选择，保留原 OR/AND 语义。
- 原有工具名及 value 记录数组保留，新增 query 和 paging。默认单页请求 500 条；fetch_all 可在 max_records/max_pages 上限内继续读取。
- 复用 Dataverse 原生 @odata.nextLink、FetchXML more-records / 双重编码 paging cookie；不与 top 混用分页参数。无 cookie 时使用受限简单分页，到 50000 行边界仍有数据则明确未完成。
- 页中截断缓存尚未返回的行。续查使用连接内五分钟有效的随机 token，最多 32 个；可调整每次返回上限，不可改变已保存查询。成功后消费旧 token，失败保留，拒绝并发消费。
- 主键可用时补充排序；不为 distinct / aggregate 注入主键列。缺少显式排序时不擅自自动翻页。
- 预览和正式 FetchXML 查询共用执行路径，清理本地缓存同时使续查 token 失效。

### 验证与边界

- TypeScript、单文件构建、76 项离线测试通过。新增 28 项查询测试和一项工具路由测试，覆盖状态范围、无状态字段、页中截断、续查失败/并发/过期、外部/循环链接、cookie 编码、简单分页边界、聚合、预览一致性等。
- 实际 npm 包已重新生成并解压到没有 node_modules 的独立目录，10 项 MCP 启动检查通过，XML 解析依赖随 bundle 分发。测试包仍位于 .cache/packages，未替换原发布包。
- 真实环境尚未连接，因此不宣称 Online / AD / IFD 的实际分页、字段元数据读取权限和所有复杂 FetchXML 场景已经联调通过。
- 分页遵循服务器响应，不构成数据库快照；关联展开集合不独立自动翻页。
- 新增 XML 解析依赖并同步 npm / Yarn 锁定条目；独立 bundle 包含该依赖，不要求用户另行安装 XML 运行时。

### 下一步

按步骤 4 逐项迁移原发布包的 Web 资源和插件步骤能力，再处理并发写入、Upsert、关联和批处理。

## 2026-10-26：步骤 4.1，Web 资源迁移

### 已实现

- 核对可读旧包实际入口与服务代码。确认三个 Web 资源工具接受 filePath，而非旧 README 所述的内联 content；迁移保留工具名及旧 camelCase 参数，并支持 snake_case。冲突别名、未知参数和无效类型在访问 CRM 前报错。
- 新增 search_web_resources_by_name、create_web_resource_and_publish、update_web_resource_and_publish；新增 publish_web_resource 支持保存后的单独发布及失败恢复。工具总数由 16 增至 20。保留旧包 operation/version/fromCache/data 结果外壳；version 表示显式配置的 API 版本。
- 查询默认不读取 content，默认 top=50、最大 100；include_unpublished=true 使用 RetrieveUnpublishedMultiple 读取最新保存定义，支持查找只保存尚未发布的资源。
- 创建使用原生 webresourceset POST；检查包含未发布版本的已保存名称，拒绝覆盖，兼容返回实体与 OData-EntityId。可选 MSCRM.SolutionUniqueName 解决方案归属。前置重复检查不等于数据库唯一锁，并发时仍由平台裁决。
- 更新默认使用 If-Match:* 避免误创建，接受具体 if_match ETag 实现乐观并发；412 原样返回，不发布、不自动重试。具体 ETag 未提供时不承诺防止覆盖其他修改。
- 文件从 MCP 服务所在机器的绝对路径异步读取，支持二进制；内联 UTF-8 和规范 Base64 也可用。两种来源互斥，允许空文件/内容，读取上限为编码前 10 MiB；平台可有更低限制。
- create/update 默认 publish=true 延续旧行为；publish=false 仅保存。原生 PublishXml 精确限定一个资源 GUID。
- 保存成功、发布失败时，MCP 返回 isError=true 和 D365_WEBRESOURCE_PUBLISH_FAILED，同时保留 saved=true、资源 ID 和发布阶段状态。超时/5xx 可返回 published=null、publication.status=unknown；不回滚、不重新保存。独立 publish_web_resource 只发布，不上传。
- 创建已成功但缺少可信 ID 时返回 D365_WEBRESOURCE_CREATE_ID_MISSING，保留 saved=true 和名称，不盲目重新创建或发布。
- dry_run 只读预览展示组织、认证方式、API 版本、对象、元数据差异及内容字节数/SHA-256，不返回源码。更新通过 RetrieveUnpublished 比较最新已保存定义；ETag 若存在则返回，供正式更新时显式使用。预览不锁定资源，也不代替平台写入校验。
- 新文件读取工具使调试入口的本地权限更敏感：调试器改为仅监听 127.0.0.1，校验 loopback Host/同源 Origin，拒绝浏览器跨站请求及非 JSON 写入，限制 16 MiB 请求体，静态路径限制在 UI 目录。分块请求保留 UTF-8 字节边界。
- 调试表单只展示规范参数，隐藏兼容别名；整数/布尔值按正确类型发送，未填写的可选字段省略，避免空 file_path 与 content 冲突。Schema 不向别名自动注入默认值，避免兼容调用被客户端默认值覆盖。

### 原生能力及边界

- 使用现有统一请求层与显式 API_VERSION，三种认证继续共用实现；未增加 .NET 进程和运行时依赖。
- Web 资源表、RetrieveUnpublished/Multiple、PublishXml 均使用平台原生操作。401/403 或不支持的接口不静默回退到已发布旧版本，不切换 API 版本、不模拟成功。
- 保存与发布是两个独立操作；发布执行时的最新保存版本，不承诺与前一次保存构成事务或受到该次保存 ETag 的保护。
- 没有真实 CRM 配置，未执行真实环境写入。各环境平台支持、鉴权、权限、受管组件限制和实际发布效果仍需联调。
- 插件步骤工具尚未迁移；通用记录 CRUD 的并发/响应改造、Upsert、关联及批处理仍待步骤 4.2/4.3。当前不宣称可以完整替换旧包。

### 验证和交付

- 本机 Node.js v24.18.0、npm 11.16.0；按原锁文件 npm ci --ignore-scripts 安装。未更改运行时依赖及 npm/Yarn 锁文件。
- 类型检查与单文件构建通过；107 项离线测试全部通过（原 76 项 + 27 项 Web 资源测试 + 4 项调试器测试）。覆盖参数/Schema/路由、文本和二进制、已保存名称、响应头 ID、无 ID、ETag 冲突、未知结果、发布失败恢复、原生接口失败不回退等。
- 调试器本机 HTTP 检查通过：UI 与 20 工具清单、同源本地调用、跨源拒绝、内容类型与路径边界。检查后进程已关闭，没有访问 CRM。
- npm pack 成功；实际包解压到无 node_modules 的目录后通过 10 项 MCP 启动检查（含三种认证的离线发现及 CLI）。
- 本批次包位于 ../artifacts/step4-webresources/dynamics365-mcp-server-1.0.0.tgz，与原包分开保存。版本仍为项目原来的 1.0.0，仅为本地验证交付，不是生产发布。
- 更新 README、实施计划及交接文档。原始 MANIFEST_SHA256.json 保留传输基线；当前文件快照见 ../MANIFEST_CURRENT_SHA256.json。

### 下一步

按步骤 4.2 迁移 d365_plugin_registration_metadata、d365_plugin_steps_query、d365_plugin_step_register 和 d365_plugin_step_update。旧包查询默认读取 Secure Configuration 明文，不沿用该默认值；必须单独验证保密、重复检测、配置保留/设置/清空及多阶段写入失败的状态。

## 2026-10-26：步骤 4.2，插件注册及步骤迁移

### 已实现

- 核对旧包 pluginStepSchemas / Service / Validator，迁移 d365_plugin_registration_metadata、d365_plugin_steps_query、d365_plugin_step_register、d365_plugin_step_update。当前共 24 个工具，保留旧结果 success/items/item 等字段。
- 增加 snake_case 参数及嵌套 camelCase 兼容，等价对象别名不受键顺序影响；未知字段、冲突别名、无效类型与枚举明确报错。没有增加运行时依赖或 .NET 进程，现有工具契约保持。
- 元数据及步骤查询复用原生 plugintypes / pluginassemblies 关联、sdkmessages、sdkmessagefilters、sdkmessageprocessingsteps。列表限额明确，原生分页最多 10 次；同组织校验和循环检测持续生效，不把截断查询当作完整清单。
- 默认不选择/展开 Secure Configuration 明文；查询仅显式 include_secure_configuration=true 时读取。写入前读取、重复检测、写入后回读均不读取 secureconfig；额外返回字段也不会混入默认输出。Unsecure Configuration 查询保留旧默认 true，可显式关闭。
- 注册解析唯一插件类/消息/实体过滤器，拒绝歧义、工作流活动类、私有/停用消息及不允许自定义处理的实体消息。只读元数据仍可查看私有/停用消息。未包含程序集上传或 Image 管理。
- 验证 stage/mode/rank/deployment；异步只允许 PostOperation。过滤字段限实体级 Update，去重/转小写、读取原生元数据验证字段存在并拒绝主键。
- 重复签名使用类型+消息+过滤器（或全局）+阶段+模式；支持 error / return_existing / update_existing。多条重复不任选一条，update_existing 保留未传入可选字段和配置。重复检测是前置读取，不是唯一锁，不能阻止并发创建相同签名。
- 更新只改变显式 patch 字段，配置支持 keep/set/clear，空字符串可显式 set。keep-only 不写入。支持执行身份与启用状态；阶段/模式改变时额外检查重复。
- 更新前读取步骤表 IsOptimisticConcurrencyEnabled。支持时使用指定或刚读取的具体 ETag；缺少 ETag/已过期值则停止。不能确认支持时默认停止写入；仅 allow_unprotected_update=true 可显式使用 If-Match:*，结果报告 concurrencyProtected=false。显式 ETag 不会被降级替换为通配符。
- 注册和更新支持 dry_run，返回环境、解析对象、字段差异及配置操作；不返回配置明文、长度或哈希。并发不支持等情况也可预览，并通过 canWrite/blockedBy 展示阻止实际写入的原因。
- Secure set 总是创建新配置行，再在一步 PATCH 中连同普通字段/Unsecure 变化一起绑定；不直接更新可能共享的旧配置行。Secure clear 同 PATCH 解除引用，不删除历史行。旧行 ID 在 retainedSecureConfigIds 中保留，需核对所有引用后另行清理。
- 步骤/新 Secure Configuration 随 POST 提交预先生成的 GUID。兼容实体 ID、可信响应头及空成功响应；若 ID 不一致，保留已保存证据并要求核查。未知结果也能按提交 ID 定位，不自动重新创建。
- 写入失败返回 D365_PLUGIN_WRITE_FAILED，保留 phase、stepId、saved、Secure Configuration 创建/绑定状态及原 ID。状态区分 not_applied/unknown/write_succeeded/verified/not_confirmed；回读错误不抹掉已确认的 saved=true，不补偿删除、不重放写入。
- 写入和预览不回显两种配置值；错误不转发平台原始消息/请求数据。保留数值证据，合法 GUID 请求 ID/十六进制平台码经脱敏后保留；提交值即使出现在这些证据字段中也会被遮盖。

### 验证和交付

- 类型检查与单文件构建通过；149 项离线回归测试全部通过（原 107 项 + 42 项插件测试）。覆盖参数/Schema/四工具路由、原生分页、默认排除密文、显式只读密文、重复策略、字段校验、配置保留/替换/解绑、ETag/并发能力、已保存但回读失败、绑定未确认、空响应及跨组织 ID 等。
- 以实际 D365AuthService 请求层、模拟 Axios/Token 传输分别验证 Online / NTLM / IFD 插件注册路径，检查目标组织、鉴权分支、写入次数和回读保密；测试未访问外部网络。
- 本批次包：../artifacts/step4-plugins/dynamics365-mcp-server-1.0.0.tgz。版本暂保留 1.0.0，属于独立目录中的本地验证交付，原始包及步骤 4.1 包不替换。
- 实际 npm 包解压到没有 node_modules 的独立目录后，10 项 MCP 启动检查全部通过，包含三种认证工具发现、无配置错误、CLI 及协议输出。
- README、实施计划、交接记录及当前 SHA-256 清单同步更新。

### 兼容与边界

- 有意改变旧包默认读取密文的行为；按 ID 查询仍组合其他显式条件，避免静默忽略筛选。插件类型 ID 与额外名字/程序集也须共同匹配。
- Secure clear 表示解绑，不承诺物理擦除历史 Secret。新配置行创建与步骤绑定为不同原生请求，不是事务；无条件更新不防止并发覆盖。
- 目标环境未提供真实连接；没有真实 CRM 写入。原生接口可用性、步骤表实际并发支持、管理/配置权限、插件实际执行、代理证书和三种认证均仍需真实环境验收。

### 下一步

按步骤 4.3 改造通用记录创建响应和更新/删除并发条件，随后实现替代键 Upsert、关联/取消关联及普通批处理/事务组。步骤 5–8 仍按原计划实施，不将当前包视为全部完成或生产验收通过。

## 2026-10-26：步骤 4.3，通用写入、替代键、关联和批处理

### 已实现

- 保留 create_new_record / update_existing_record / delete_record_by_id 名称和既有必填参数，增加别名、dry_run、并发选项；get_record_by_id 增加 collectionName 兼容及 GUID/select 校验，读取仍返回原始记录。
- 新增 upsert_record_by_key、associate_records、disassociate_records、execute_record_batch、execute_record_transaction。工具共 29 个，Schema/路由共用记录写入计划，不保留绕过条件的旧写入路径。
- 统一检查 EntitySetName/主键/并发元数据，拒绝明确的非 Standard 表（含 Elastic/Virtual）；旧 CE 未返回 TableType 时走原生接口，不声称已经验证所有旧表能力。元数据分页有范围/次数/循环/同组织检查。
- 创建请求 Prefer:return=representation，仅选择主键；兼容实体主键、可信同组织 OData-EntityId 及显式提交的主键。确认保存但无 ID 时返回 saved=true、identityResolved=false，不重建；ID 不可信或矛盾保留已保存证据，异常响应体/异步状态按结果不明处理。
- 更新/删除先读取记录；表支持乐观并发时使用指定或当前 ETag，过期值和缺失记录停止。不能确认支持时仅显式 allow_unprotected_write=true 可使用 If-Match:*；显式 ETag 不降级。写入后超时/非结构化传输异常均不会误报未执行，删除也保留未知结果。
- 原 CRUD 写入返回结构化 success/operation/collectionName/id/saved/deleted/status/etag/concurrencyProtected；创建/Upsert 附加 created/identityResolved/record。相较原始 raw body/null 是有意的返回格式变更，README 记录迁移方式。
- dry_run 展示环境、对象、字段差异和 beforeKnown/canWrite/blockedBy；密码、secret/token/secureconfig/configuration/content 等名称字段保守遮盖。预览不是锁、不是全量平台校验；这也不是替代字段安全的完整 DLP。
- Upsert 读取原生 Keys/Attribute 元数据，要求精确匹配 Active 键，支持复合键及 String/Integer/Picklist/Decimal/Lookup/UTC DateTime。检查特殊字符、引号/URL 编码、数值精度及真实日历日期，拒绝未激活/空/null 键及数据中的键值变更。
- Upsert 使用原生条件 PATCH：不存在时 If-None-Match:* 创建，存在时按并发策略更新；支持 create_only/update_only。读写间竞争返回条件冲突，不自动重试，不模拟 POST+PATCH，不切换后端。Lookup 键场景关系绑定另行操作。
- 关联从 ManyToOne/OneToMany/ManyToMany 元数据解析唯一导航及目标表。单值用条件 PATCH；解除单值时展开具体导航对象核对目标类型/ID，避免多态 Lookup 的同 GUID 错解绑。集合关系用原生 $ref，明确不能由父 ETag 保证成员并发，默认停止，需显式允许无保护写入。不会删除关联目标记录。
- 数据内 OData 引用也限定当前组织，禁止 Content-ID $1 等隐式批内依赖。参数未知字段、非法标识符、非 JSON/非有限数值及越界体积在写入前拒绝。
- 普通批次使用原生 $batch、每操作独立 Change Set，默认每块 25（可 1–100）；单次 1–100 操作，操作 JSON 合计及每块线格式各不超过 10 MiB。所有预检/所有块构造先完成再发送第一块，后块超限不会造成早块先写。
- 事务组使用一个原生 Change Set，绝不拆块或降级到逐项写入。明确区分数据库已提交、确认未提交、结果不明；5xx/408、超时、截断/错误 Content-ID/分组错误不会误报成功或可靠回滚。
- multipart 构造按 CRLF，解析有体积/深度/响应数/头/边界/分组及关联检查。原生逐项拒绝不回滚普通批次的先前成功；缺失或无法关联的结果保留 unknown，不跳过行或盲目续写。
- 批次部分失败返回 MCP isError 与 D365_BATCH_NOT_COMPLETE，data 保留完整逐项状态、HTTP 证据、summary/chunksSent/committed/cancelled。事务已提交但本地主键解析有问题时仍保留 committed=true。
- MCP signal/progressToken 接入新写入与批处理。块间取消保留已完成结果、不发送后块；在途取消可为 unknown；进度通知失败不抹掉写入结果。未知结果始终停止后续块，即使请求 continue_on_error。

### 验证和交付

- 类型检查、单文件构建通过。202 项离线回归测试全部通过（原 149 项 + 28 项通用记录/关联/Upsert 测试 + 25 项批处理测试）。原查询、Web 资源、插件步骤回归保持通过。
- Online/NTLM/IFD 经实际 D365AuthService + 模拟传输检查条件头、JSON、multipart 原文及批次结果；均阻断外网，没有连接真实 CRM。
- npm pack 成功；实际包解压到无 node_modules 目录后，10 项 MCP 启动检查通过，发现全部 29 个工具，CLI/协议入口仍正常。
- 最新验证包：../artifacts/step4-records/dynamics365-mcp-server-1.0.0.tgz。原始、步骤 3、4.1、4.2 包保留；版本暂为 1.0.0，仅本地交付，不是生产发布。
- README、实施计划、项目结构、交接和当前 SHA-256 清单同步更新；没有新增依赖或更改 npm/Yarn 锁文件。

### 边界与下一步

- 目标 CRM 未配置，平台版本、权限、并发/键/关系及原生批处理/Change Set 都未真实联调。预检读取在事务外，不是快照；同一记录多次修改可能因相同旧 ETag 冲突，应合并修改。
- 原生数据库事务不承诺撤销插件触发的外部副作用；普通批次取消/失败不会撤销已提交块；未知结果必须核查后再重试。未提供任意 HTTP、批内 Content-ID 依赖及非标准表适配。
- 步骤 4 的本地范围已完成，真实环境验收项继续保留。下一步按步骤 5 实现只读插件跟踪日志、失败系统作业、权限/有效访问及审计证据整理；不自动启用日志或修改权限。步骤 6–8 仍待实施。

## 2026-10-26：步骤 5，只读诊断、权限与审计证据

### 已实现

- 新增 9 个工具：get_diagnostic_settings、query_plugin_trace_logs、query_failed_system_jobs、diagnose_plugin_failure、query_security_principals、get_principal_security_context、get_record_access、get_record_audit_history、get_audit_details。总数 38；CRM 业务请求全部 GET，不启用日志/审计、不重试作业、不改权限。
- 新工具参数支持 snake_case/camelCase 兼容、严格类型及冲突检查；MCP 取消传到原生读取和诊断所用插件步骤查询。没有新增依赖、没有更改锁文件或引入 .NET 进程。
- 当前开关使用 WhoAmI + organization.plugintracelogsetting/isauditenabled；可独立读取表 IsAuditEnabled.Value。false 保持 false，缺失/不可读保持 unknown/forbidden；不把现在的配置当作历史配置，不检查全部字段审计开关。
- 跟踪日志支持时间、关联 ID、步骤 ID、类型名和异常筛选。输入时间必须带时区、校验实际日历日期，默认最近 24 小时。默认不选文本；configuration/secureconfiguration/profile 始终不选择，也不会因额外返回字段进入输出。
- 系统作业使用原生 Failed statuscode=31，按 completedon 查询，避免漏掉较早创建但近期失败的作业；不选择 data/dependencytoken 等负载，message/friendlymessage 显式选择才读取。
- 诊断列表 top 默认 50、最大 100；max_pages 默认 5、最大 20。同组织/循环/无效响应/预算均检查，到达 top 不声明完整清单。文本显式开启时做常见凭据遮盖，默认最多 2000 字符、最大 8000，截断有标记；任意业务数据仍不能靠正则保证匿名化。
- diagnose_plugin_failure 要求关联/步骤/类型锚点，汇集异常日志、失败作业、当前步骤和开关。只使用原生 PluginStepId/OwningExtensionId 建立关联，统一 GUID 大小写；不把关联关系、同类名或当前配置作为历史根因。
- 类型范围内的作业检索须有匹配日志/当前步骤的正面 ID 证据；仅用户传入步骤 ID 不能证明类型匹配。查到的步骤不完整或来源不可读时保持 coverage gap，不扩大成全量作业检索。rootCause 始终 not_determined，由实际证据支持后续人工分析。
- 各诊断来源区分 ok、forbidden、unavailable_or_hidden、invalid_response、failed 等。401/认证错误/取消仍返回错误；可独立读取的来源保留部分结果。404 不直接判定不支持，空结果不判定日志已清理或从未执行；retentionAssessment 保持 unknown。
- 主体目录查询 systemuser/team/role，可按 ID、名称、业务单元筛选；用户 enabled 仅显式应用，不隐式排除停用用户，不读密码/凭据/邮件字段。
- 安全上下文读取主体、直接角色、可见团队和团队角色；默认最多 10 团队、每组 50 角色，最多 25/100，显式显示截断/不可读。保留角色 GUID/业务单元，不把同名角色合并；不模拟完整的组/继承/共享/层级/字段权限来源。
- get_record_access 调用绑定 systemuser/team/organization 的 RetrievePrincipalAccess，原生 Target 引用严格编码，返回记录有效权限；None 与调用失败分开，未知数值权限位保留。不给字段访问或业务规则成功背书，也不臆断权限来源。
- 审计历史使用 RetrieveRecordChangeHistory；每页默认 20、最大 100，原生 MoreRecords/PagingCookie 保留。后续页要求相同目标/页大小的原生 cookie；缺失、重复、超过 16 KiB 或达到 1000 页上限，不提供无效续页，不解析/伪造 XML cookie。
- 审计输出默认不包含旧/新字段值；原生函数可能仍把这些值返回给服务器进程，因此不能声称未读取。显式 include_values 才投影有界属性值，并启发式遮盖敏感字段名；总结果上限 5 MiB。
- Web API 历史可能不返回 AuditRecord，操作人/时间/审计 ID 明确保留缺失，不从当前用户、筛选或数组顺序补猜。非 AttributeAuditDetail 类型只标明类型和未投影细节，不伪造角色/关系审计字段。
- get_audit_details 使用绑定 RetrieveAuditDetails，独立查询审计摘要元数据，分别呈现权限/缺失。原生详情或摘要 ID 不一致时拒绝关联。当前审计开关与历史记录独立展示，缺失历史不等同于已清理。

### 验证和交付

- 类型检查、单文件构建通过。241 项离线回归测试通过（原 202 项 + 39 项证据工具测试），包含九工具 Schema/路由、只读性、脱敏、原生过滤、关联范围、403/404/401、当前开关、审计分页/缺字段/结果大小及取消。
- Online、NTLM、IFD 通过实际 D365AuthService 与模拟传输验证日志和原生权限/审计 GET 路径；网络被测试阻断，没有真实 CRM 连接或修改。
- npm pack 成功；实际包解压到没有 node_modules 的目录后，10 项启动检查通过，发现全部 38 个工具，CLI/协议入口正常。
- 最新包为 ../artifacts/step5-evidence/dynamics365-mcp-server-1.0.0.tgz；同目录 VALIDATION.md 记录范围。版本暂保留 1.0.0，历史阶段包均不替换，不属于生产发布。
- README、实施计划、结构说明、交接和当前 SHA-256 清单更新。

### 边界与下一步

- 本轮实现的是只读证据能力。没有真实目标 CRM，实际故障复现、权限、历史保留/清理证据、审计分页和各部署支持仍待联调；不将空数据认定为日志清理，不保证所有审计细节类型都已完整展示。
- 当前角色/团队清单不构成完整授权解释；原生记录权限与字段安全、业务规则分别处理。自由日志文本和显式审计值可能包含业务信息，启发式遮盖不是完整 DLP。
- 下一步按步骤 6 开发数据模型、表单和视图：表/字段/关系/选项/替代键维护、解决方案归属和受管约束、结构化 FormXML/FetchXML/LayoutXML、插件 Image 与程序集更新检查。步骤 7–8 仍未实施。

## 2026-10-27：步骤 6.1，表与基础字段的数据模型开发

### 实现范围

- 新增 get_model_definition、create_model_table、create_model_column、update_model_labels、publish_model_table，合计 43 个 MCP 工具。复用 EntityDefinitions/Attributes、解决方案/发布者读取及 PublishXml，不新增依赖、锁文件变更或 .NET 适配进程。
- 读取完整表定义，基础字段按派生类型再取完整定义；使用 Consistency: Strong，排除传输注解/UserLocalizedLabel，保留其他返回属性并生成规范化 SHA-256 指纹。2 MiB/嵌套深度限制、身份匹配及 partial nextLink 检查阻止不完整替换。
- 创建普通自定义表及主名称 String 字段，支持 UserOwned/OrganizationOwned；创建 String/Text、Memo/TextArea、Integer、Decimal 字段，校验类型专属设置、数值范围和要求级别。其他字段类型和表/字段设置维护仍待后续批次。
- 新建组件要求已有可见的非受管解决方案，校验发布者前缀，以 MSCRM.SolutionUniqueName 原生头请求归属；创建前检查重复逻辑名，字段创建检查父表 IsCustomizable/CanCreateAttributes。现有组件标签更新也检查适用的受管属性；未返回必需属性时停止，不当成允许。
- 多语言标签按 language_code/text 输入，拒绝重复语言、空标签、只读属性和过大文本；更新标签先读取完整定义，再 PUT，显式 MSCRM.MergeLabels=true，保留其他设置及未指定语言。表 DisplayName/DisplayCollectionName 检查 IsRenameable，表 Description 检查 CanModifyAdditionalSettings。
- 所有新写工具默认 dry_run=true，仅做读取和请求预览；支持 snake_case/camelCase、严格参数和冲突校验。实际标签更新要求当前 expected_hash 和 allow_unprotected_write=true；指纹只检查预览陈旧，不能防止读取到 PUT 之间的并发变化，不声称元数据 ETag 保护已实现。
- 保存与发布分离，不自动操作表单、视图或发布。成功写入后清理本地元数据缓存，并回读对比请求属性；匹配结果列出 checkedProperties。新表的主名称字段完整定义尚未在表投影中单独回读检查，返回此限制。
- 保存成功但回读失败/不匹配的 MCP 错误保留 saved=true；写入结果不明为 saved=null，拒绝写为 false。取消贯穿各阶段；不自动重放写入、切换后端或调用发布。
- publish_model_table 使用单表 PublishXml，预览明确整个表及其他待发布字段/表单/视图/Ribbon 的范围；失败与未知分别返回。原生发布成功不代表实际 UI 已验证。

### 验证与交付

- 类型检查与单文件构建通过。272 项离线回归测试通过（原 241 项 + 本批 31 项），覆盖完整定义、预览、四种字段、前缀/解决方案/受管约束、标签与设置保留、指纹冲突、回读/发布阶段失败、取消、缓存、Schema/路由及实际认证请求层。
- 三种认证（Online、NTLM、IFD）经真实 D365AuthService 与模拟传输验证 PUT 方法及 SolutionUniqueName/MergeLabels 头；测试网络阻断，没有真实 CRM 访问或修改。
- npm pack 成功；实际包解压到无 node_modules 的目录后，10 项 MCP 启动检查通过，发现全部 43 个工具。
- 最新本地验证包：../artifacts/step6-model/dynamics365-mcp-server-1.0.0.tgz；同目录 VALIDATION.md 记录范围，历史各包保留。版本仍为 1.0.0，非生产发布。
- 已同步 README、实施计划、结构说明、换机交接和当前 SHA-256 清单。

### 尚未完成

- 步骤 6 尚需其他字段类型/设置、关系、选项集、替代键定义、结构化表单/视图编辑、插件 Image 与程序集兼容更新。字段创建不等于添加到表单，更没有自动绑定脚本或改视图。
- 解决方案头是原生归属请求；完整组件/依赖/分层及部署验证属于后续 ALM 范围，当前不据此宣称解决方案部署已验收。
- 无真实连接，三种部署中的元数据权限/版本差异、已启用语言、受管层、发布及 UI 效果仍未验证。步骤 6 的完整业务场景和步骤 7–8 均未完成。

官方依据：[表定义创建/更新](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/create-update-entity-definitions-using-web-api)、[字段定义创建/更新](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/create-update-column-definitions-using-web-api)、[受管属性参考](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/entitymetadata)、[PublishXml 范围](https://learn.microsoft.com/en-us/dotnet/api/microsoft.crm.sdk.messages.publishxmlrequest.parameterxml?view=dataverse-sdk-latest)。

## 2026-10-27：步骤 6.2，关系、Lookup 与替代键定义

### 实现范围

- 新增 get_model_relationship、create_model_relationship、get_model_key、create_model_key，合计 47 个工具。原生路线为 RelationshipDefinitions 及 EntityDefinitions(...)/Keys，沿用认证/取消/错误/缓存和步骤 6.1 的预览、标签、解决方案与前缀校验；没有新增依赖、锁文件变更或 .NET 进程。
- 1:N 创建通过原生 deep insert 一次创建关系和 Lookup，从被引用表元数据解析主 ID。检查双方受管参与属性、引用方 CanCreateAttributes、Lookup 逻辑名与关系 SchemaName 重复；不复用已有普通字段模拟 Lookup。
- 预览也执行平台 CanBeReferenced / CanBeReferencing / CanManyToMany 资格检查。这些原生消息使用只读 POST，不修改元数据。资格否定、权限不足或消息不可用均停止创建，不把错误当成可以参与。
- 1:N 级联配置默认 Delete=Restrict，其余五项 NoCascade；显式 Cascade 在请求预览中展示。支持 Delete 的 Restrict/RemoveLink/Cascade、其他项 NoCascade/Cascade；其他级联模式、自定义导航名及层次关系未开放。
- N:N 支持两个不同表，校验双方资格、前缀和 intersect 表名冲突。自关联 1:N 可以由原生资格决定；自关联 N:N 需要尚未开放的导航配置，本批拒绝。
- 关系保存后按 SchemaName 找唯一 ID，再读取派生类型核对请求属性；1:N 另外直接读取 LookupAttributeMetadata，核对名称、类型、标签、要求级别及唯一目标表。回读失败/不匹配保留 saved=true，写入结果未知不重试。只返回受影响表供发布审查，不自动发布或修改表单。
- 替代键创建支持 1–16 个不同逻辑字段，类型限于原生 String/Integer/Decimal/DateTime/Lookup/Picklist，并要求 IsSecured=false。拒绝 provider-backed 虚拟表、重复 SchemaName/相同字段集合（含 Pending/Failed）及超出本工具十键上限；元数据有续页/错误/重复时不当作查全。
- 不扫描或修改普通业务记录；索引字节限制、平台版本约束与已有数据重复由原生创建/后台索引决定。空值、URL 保留字符、记录权限和编码约束仍需业务场景验证。
- 单独呈现定义 saved 与 EntityKeyIndexStatus：Pending/InProgress/Active/Failed，缺失/未来枚举保持 Unknown；仅 Active 返回 usableForAlternateKeyOperations=true。确认保存但立即索引 Failed 返回 MCP 错误，保留 saved=true、索引状态和 AsyncJob。没有伪造激活、自动轮询/重建/删除/Reactivate。
- get_model_key 的 include_job 可选读取关联作业状态/错误码/时间，默认不查作业，不输出消息/data文本。关联作业权限不足与键证据分开返回；认证/取消错误传播，不伪造作业 ID 或宽泛查询其他作业。
- 创建成功会清理既有元数据缓存；保存与发布继续分离。当前只增加关系/键的创建和读取，未提供既有定义的更新/删除。

### 验证与交付

- 类型检查、构建和 npm pack 通过。307 项离线回归测试通过（原 272 + 本批 35），覆盖 1:N/Lookup、N:N/intersect、资格拒绝/不可用/权限、前缀/受管/重复、级联、六种键字段、索引枚举、作业边界、未知写入、回读不一致、取消和 Schema/路由。
- 三种认证（Online、NTLM、IFD）使用实际 D365AuthService 和模拟传输，验证原生只读资格 POST、关系/键创建 POST、SolutionUniqueName 头及 Pending 索引状态。网络由测试阻断，没有访问或修改真实 CRM。
- 实际包解压到无 node_modules 目录后，10 项 MCP 启动检查全部通过，发现完整 47 个工具。
- 最新本地验证包：../artifacts/step6-structure/dynamics365-mcp-server-1.0.0.tgz；同目录 VALIDATION.md 记录边界。保留全部原始及历史阶段包，版本暂不变更，未进行生产发布。
- 同步 README、实施计划、结构说明、HANDOFF/START_HERE 和当前 SHA-256 文件清单。

### 尚未完成

- 下一批优先补选项集/选项及其他字段类型，后续继续字段设置与既有关系/键维护、结构化表单/视图、插件 Image 和程序集兼容检查。步骤 6 整体、步骤 7–8 均未完成。
- 无真实连接：三种部署中的资格消息/权限/元数据传播、Lookup/级联效果、解决方案归属、索引大小及重复数据导致的实际异步失败、发布和 UI 效果均待联调。离线测试不证明这些已验收。

官方依据：[关系定义及资格消息](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/create-update-entity-relationships-using-web-api)、[关系资格](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/entity-relationship-eligibility)、[替代键约束及后台索引](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/define-alternate-keys-entity)、[EntityKeyMetadata](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/entitykeymetadata)、[索引枚举](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/entitykeyindexstatus)。

## 2026-10-27：步骤 6.3，选项集、选项值与更多字段类型

### 实现范围

- 新增 get_model_choices、create_model_choices、change_model_choice_value、publish_model_choices，合计 51 个工具。复用步骤 6.1 的请求、定义读取、标签、预览、解决方案、前缀、缓存及阶段错误；无新增依赖、锁文件变更或 .NET 进程。
- 全局选择按 Name 读取派生 OptionSetMetadata；局部选择从 Boolean/Picklist/MultiSelect 列的 OptionSet 读取。定义限 2 MiB、1000 选项，拒绝续页、重复/异常值、错误身份；返回多语言标签、原生值、作用域与 SHA-256 指纹。
- 读取局部列引用的共享全局选项时报告 global_reference；修改必须显式提供 global_choice_name，避免将局部参数静默升级成影响其他列的共享修改。state/status 选择仍使用独立原生消息，本批不开放。
- 创建全局 Picklist 选择要求已有非受管解决方案及匹配发布者前缀。选项数值可显式指定非负 Int32，或省略后发送原生 Value=null 由平台按发布者上下文分配；不接受用户显式 null。拒绝重复数值/标签集合及无法唯一回读匹配的自动分配标签，保存后核对显示名/描述/选项并返回实际分配值。
- change_model_choice_value 支持 InsertOptionValue、UpdateOptionValue。全局目标使用 OptionSetName，局部使用 EntityLogicalName/AttributeLogicalName，解决方案使用原生 SolutionUniqueName 参数；更新显式 MergeLabels=true。支持标签或描述合并，不把字段元数据 PUT 当作选项修改。
- 选项写入默认预览；执行要求当前 expected_hash 与 allow_unprotected_write=true。指纹不提供原生锁，读取和 Action 之间仍有窗口。只处理明确非受管且可定制的选项集，受管/归属未知/受管目标值不尝试绕过发布者或升级流程。
- 插入支持平台 NewOptionValue，缺失自动分配值或响应不一致不猜 ID；Boolean 仅允许 0/1 标签维护，不插第三个值。更新后核对身份、数值、提交标签/描述和未修改语言文本。未知写入不重放；已保存但回读失败/不匹配保留 saved=true。
- 全局选项单独 PublishXml，预览明确整个共享选项集及其他待发布修改；局部选项使用已有单表发布。发布失败/未知独立报告，不自动重放保存，不声称 UI 已验证。
- create_model_column 扩展 Money、DateTime、Boolean、Picklist、MultiSelectPicklist，合计九类。类型专属设置严格校验：Money 为列精度 PrecisionSource=0、0–4 位；DateTime 格式与行为区分；Boolean 明确真/假标签；单选/多选在本地 options 与已校验 global_choice_name 之间二选一。
- 全局列绑定使用原生 GlobalOptionSet@odata.bind 并回读核对元数据 ID；不复制共享选项。多选按原生 Virtual + MultiSelectPicklistType 识别，不把任意 Virtual 当多选。单选默认值必须已有明确数值，不猜未来分配；多选不开放默认值。
- get_model_definition/update_model_labels 同步支持九类派生定义及 OptionSet 展开；字段标签 PUT 保留选项定义，选项标签变更走单独工具。调试表单对数组及 Boolean/整数联合类型按 JSON 输入处理。

### 验证与交付

- 类型检查、构建及 npm pack 通过。342 项离线回归测试全部通过（原 307 + 本批 35）；覆盖分配值/歧义、语言合并、全局/局部与受管边界、并发指纹、九类列及绑定、错误/回读阶段、取消、Schema/路由和体积限制。
- Online、NTLM、IFD 通过实际 D365AuthService 与模拟传输验证原生选项 Action 参数、MergeLabels、共享列绑定与读取。测试阻断网络，没有连接或修改真实 CRM。
- 实际 npm 包解压到没有 node_modules 的目录后，10 项 MCP 启动检查通过，发现完整 51 个工具。
- 最新本地验证包：../artifacts/step6-choices/dynamics365-mcp-server-1.0.0.tgz；同目录 VALIDATION.md 记录范围。保留原始及历史阶段包，版本暂保留 1.0.0，非生产发布。
- 同步 README、计划、结构说明、HANDOFF/START_HERE 与当前 SHA-256 文件清单。

### 尚未完成

- 下一批推进结构化表单/视图，再继续插件 Image 与程序集兼容更新。字段设置/其他特殊类型、关系/键的进一步维护、选项排序/删除和受管升级等尚未全部开放；步骤 6 整体及步骤 7–8 仍未完成。
- 未连接真实环境：API 版本/权限、已启用语言、发布者数值分配、受管层、元数据传播、发布与 UI 行为均待验收。字段创建/选项保存不代表已经添加表单、绑定脚本或修改视图。

官方依据：[选项集与原生消息](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/create-update-optionsets)、[InsertOptionValue](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/insertoptionvalue)、[UpdateOptionValue](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/updateoptionvalue)、[字段定义](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/create-update-column-definitions-using-web-api)、[选项导航读取](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/retrieve-metadata-name-metadataid)、[DateTimeBehavior](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/datetimebehavior)、[Money 精度来源](https://learn.microsoft.com/en-us/dotnet/api/microsoft.xrm.sdk.metadata.moneyattributemetadata.precisionsource)。

## 2026-10-28：步骤 6.4，结构化表单、脚本事件与视图编辑

### 实现范围

- 新增 list_model_ui_components、get_model_ui_component、edit_model_form、edit_model_view，合计 55 个工具。复用认证/请求/预览/阶段错误/解决方案与 XML 依赖，不增加依赖、锁文件变更或 .NET 适配进程。
- 使用 systemforms/savedqueries 的原生 RetrieveUnpublishedMultiple/ RetrieveUnpublished 读取已保存及未发布版本。功能不支持、权限不足或读取不完整时停止，不偷偷退到发布版本作为编辑基线。清单有 1–100 的显式限额，原生续页或达到上限均返回 limited，不伪报全量。
- 单条读取核对组件 ID、目标表与类型等元数据，返回 XML、结构清单、SHA-256 指纹和原生 ETag。指纹按 XML 结构和属性比较，忽略排版/属性顺序，保留字面值的有效空白。XML 每份上限 1 MB、4 万节点、64 层；拒绝 DTD/实体/畸形/不支持的命名空间；组件响应限 3 MiB，操作输入限 2 MiB、1–50 项。
- edit_model_form 限 Main(type=2)，支持 add_field、add_library、bind_event。字段放置明确指定 section ID 和兼容现有模板 control ID，检查原生字段类型/格式/行为及 IsValidForForm，不猜 classid；只复制 classid 等新控件必要属性，不复制旧参数/事件/PCF 描述。向显式等宽普通节追加整行，不处理跨行格、Lookup/多选/PCF/无绑定/参数化模板或复杂布局。
- 字段、脚本库和事件分别作为结构化操作，按序在内存应用后一次 PATCH。库必须对应可见原生 JavaScript Web Resource(type=3)；绑定前必须已有/本次先添加库，onchange 字段必须先上表单。支持 onload/onsave/onchange，传执行上下文默认 true，显式 false 保留；拒绝重复/内部事件，不读或执行 JavaScript，不声称函数存在/效果已验收。
- 脚本变更单独返回原生 webResourceId 和未验证发布状态；表单保存/整表发布不代表脚本资源最新内容已发布，需另行 review/publish_web_resource。清单中的 libraryUniqueId 是内部表单 ID，不可混作资源 ID。
- edit_model_view 限公共系统视图(querytype=0)。支持增加/移除根显示列、宽度和简单根字段排序；添加列同时处理 FetchXML 与 LayoutXML，移除显示列保留 FetchXML 投影以避免破坏筛选/排序等依赖。保留原筛选、关联及未改布局属性，不注入状态条件、不执行数据查询。
- 视图检查原生可读字段、布局 object/主 ID、重复列/排序等；必要时显式补主键投影，all-attributes 不改写。拒绝聚合/distinct 重写、链接/别名排序替换、相关列编辑、筛选编辑和任意 XML 替换；保护主键/jump/最后显示列。
- 执行要求当前 expected_hash；校验组件和表可定制属性，并通过已有非受管解决方案请求归属。并发依据 systemform/savedquery 的 IsOptimisticConcurrencyEnabled 元数据：确认支持才使用具体 ETag；不支持/未知需显式 allow_unprotected_write 并用 If-Match:* 防 Upsert。显式 ETag 冲突不回退；无原生锁时仍有读后并发窗口，预览报告 blockedBy。
- 原生 PATCH 保存之后再次读取未发布定义，结构化比较提交的 XML。回读失败/不匹配保留 saved=true；结果未知不重放。无实质变化不发 PATCH。保存与发布继续分离，实际 UI、完整 XSD、脚本运行、分层及部署验证分别标明未完成。

### 验证与交付

- 类型检查、构建、npm pack 通过。377 项离线回归测试通过（原 342 + 本批 35）；覆盖发现/未发布基线、模板/字段/库/事件、视图依赖、XML 边界、指纹/ETag/回退、未知结果/回读失败、取消及 MCP Schema/路由。
- 一条网络阻断的模拟端到端用例完成“创建字段 → 放入表单 → 添加库/绑定 onchange → 改视图 → 单独 PublishXml → 回读”。这是离线实现验证，不认定真实 CRM 或 UI 验收通过。
- Online、NTLM、IFD 经实际 D365AuthService 与模拟传输验证未发布函数、条件 PATCH 和 SolutionUniqueName 头；没有连接或修改真实 CRM。
- 实际包解压到没有 node_modules 的目录后，10 项 MCP 启动检查全部通过，发现 55 个工具。
- 最新本地验证包：../artifacts/step6-ui/dynamics365-mcp-server-1.0.0.tgz；同目录 VALIDATION.md 记录边界。保留原始/历史包，暂维持版本 1.0.0，未进行生产发布。
- 已同步 README、实施计划、结构说明、HANDOFF/START_HERE 与当前 SHA-256 清单。

### 尚未完成

- 下一批继续插件 Image 管理与程序集身份/版本兼容检查。字段特殊设置、进一步关系/键/选项维护、复杂表单/控件/个人视图/筛选等仍未全覆盖。步骤 6 整体及步骤 7–8 尚未完成。
- 真实三种环境中的权限、未发布/ETag/受管分层、布局、库发布/脚本执行、视图效果及整表发布仍待联调。离线流程不能证明表单在模型驱动 UI 中已经可用，也不能替代部署验收。

官方依据：[SystemForm 操作](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/reference/entities/systemform)、[SavedQuery 操作](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/reference/entities/savedquery)、[RetrieveUnpublished](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/retrieveunpublished)、[FormXML Schema](https://learn.microsoft.com/en-us/dynamics365/customerengagement/on-premises/developer/customize-dev/form-xml-schema?view=op-9-1)、[视图 FetchXML/LayoutXML](https://learn.microsoft.com/en-us/dynamics365/customerengagement/on-premises/developer/customize-dev/customize-entity-views?view=op-9-1)。

## 2026-10-28：步骤 6.5，插件 Pre/Post Image 管理（本地范围完成）

### 修改范围

- 新增 d365_plugin_images_query、d365_plugin_image_register、d365_plugin_image_update、d365_plugin_image_delete，合计 59 个 MCP 工具。复用现有认证/请求层与插件安全错误，不读取步骤配置或程序集二进制。
- 原生 sdkmessageprocessingstepimages 精确父步骤查询、客户端 GUID 注册/同 POST 绑定、PATCH 和 DELETE；查询有数量/完整性提示，不跟随 nextLink。写入规划要求完整枚举且低于 500 条，不在不完整基线下判断唯一性。
- 注册/更新限定实体专属 Create、Update、Delete、Assign、SetState，映射 Target/EntityMoniker。Create 仅 Post，Delete 仅 Pre，Post/Both 仅 stage40；合法 Pre 阶段 10/20/40，Async 要求 stage40。其他消息先查询，避免猜测请求属性。
- 1–100 个显式字段，逻辑名称规范化/去重与 IsValidForRead 元数据逐项确认，拒绝空选择和全部字段；名称/别名/说明限制 256 字符，无控制字符。检查同名和 Pre/Post 字典重叠别名，允许不同名称的独立 Pre 与 Post 复用别名。
- 写操作默认预览；实际执行必须带同一操作预览指纹，包含环境、父步骤、原 Image、变更及兄弟 Image。目标/阶段/兄弟变化使预览失效。指纹不提供父步骤锁或服务端唯一约束，竞争窗口明确告知。
- 更新/删除要求非受管且可自定义。按 Image 表 IsOptimisticConcurrencyEnabled 选择具体 ETag；未确认支持时预览阻断，只有显式 allow_unprotected_update 且未指定 ETag 才可用 If-Match:*。既有具体 ETag 冲突不可绕过。
- 每次写入独立回读 ID/父步骤/字段；删除仅原生 404 确认。回读错误/不匹配保留 saved=true 与 Image ID；写入拒绝/未发送保留 false，结果未知保留 unknown；不自动重放或补偿删除。所有新路径传播取消信号；错误不转发平台原始文本或配置。

### 验证与交付

- 类型检查、构建与 npm pack 通过。420 项离线测试全通过（原 377 + 本批 43）；覆盖参数/别名、消息/阶段、字段/受管限制、重复、指纹、并发、取消和写入/回读阶段。
- 模拟注册→更新→查询→删除→空集合完整生命周期通过。Online、AD/NTLM、IFD 经实际 D365AuthService、模拟 Axios 传输验证指定组织/API 的 Image 注册与回读分支；网络被阻断，无真实 CRM 修改。
- 实际 npm 包解压到无 node_modules 目录，10 项 MCP 启动检查通过，发现完整 59 工具。
- 最新包：../artifacts/step6-images/dynamics365-mcp-server-1.0.0.tgz。SHA-256：39E5F0589A8F3AC55C2870A7CF222BD724CF04D85E3570DD7324B8B4849EB742。同目录 VALIDATION.md 保存范围，历史包全部保留。
- 同步 README、计划、结构、HANDOFF/START_HERE 与当前 SHA-256 清单；版本仍为本地验证 1.0.0，不是正式新版本发布。

### 尚未完成

- 下一批程序集身份/版本兼容检查与更新，须安全读取实际二进制身份和类型，不能信任调用方身份声明或运行待检 DLL。本机探测到 .NET SDK 10.0.113，但未引入适配器或改变当前 Node-only 部署要求。
- 更多 Image 消息（Merge/Send/Route/DeliverIncoming/DeliverPromote 等）写入映射、解决方案关联未开放。父步骤并发编辑和同时创建 Image 不具备跨记录原子锁；平台原生规则仍最终裁决。
- 真实三种认证的权限、Image 并发支持、受管层、插件运行时 PreEntityImages/PostEntityImages 内容均待验收；步骤 6 后续元数据/UI 维护以及步骤 7–8 仍未完成。

官方依据：[插件与 Image 注册/可用性](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/register-plug-in)、[原生 Image 表与导航属性](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/sdkmessageprocessingstepimage)。

## 2026-10-28：步骤 6.6，程序集身份/版本兼容检查与更新（本地范围完成）

### 修改范围

- 新增 d365_plugin_assembly_inspect、d365_plugin_assemblies_query、d365_plugin_assembly_update，共 62 工具。本地检查在 CRM 配置校验之前路由，列表只读元数据且不需要 .NET；实际 DLL 检查/更新需要 .NET 10 Runtime。
- 固定 .NET PEReader/MetadataReader 程序接收 stdin 上限 16 MiB 的实际 PE，输出有限 JSON；不 Assembly.Load、不执行待检代码、不解析加载依赖。读取名称/版本/区域/公钥标记、框架声明、签名存在、架构、公开类型/已知插件与工作流契约/本地继承、原生导入与引用身份。
- 读取器进程超时 15 秒，可取消，有输入/输出/继承深度与数量限制、环境变量筛选；错误不暴露 stderr、内容或本地路径。它不是不受信任二进制的安全沙箱；强名称存在不等于密码学签名验证，框架声明不等于运行时/API 行为正确。
- .NET 10 仅用于检查器，不改变待上传插件的 .NET Framework 目标。已包含 DLL/runtimeconfig/deps、读取器源码和重建脚本；release/pack 重建需 .NET 10 SDK，普通部署仅二进制工具需 Runtime，其他 Node 工具/发现继续可用。没有引入 CRM .NET SDK 连接/写入后端。
- 更新预检同时读服务器 content 并解析实际身份、表并发元数据、packageid 能力和少于 500 个完整可见类型；旧本地版本未发现 packageid 时不选择新字段，不在元数据失败时猜测无包。
- 限非受管且可自定义、Database 来源、合法既有隔离模式（Online 必须 Sandbox），拒绝 Microsoft.* 平台程序集、包绑定及工作流。要求实际名称/公钥/区域相同、主次版本相同且 build/revision 不降级；候选 AnyCPU 纯托管 DLL、无32位强制/PInvoke、同 .NET Framework 4.6.2–4.8 目标、同引用名称/版本/区域/公钥身份。
- 候选公开具体非泛型顶层 IPlugin 类型集合必须等于已注册名称；拒绝增删、未解析继承或嵌套插件契约。已有类型还需匹配服务器程序集原身份。没有新增/删除类型或重绑步骤/Image。
- 默认预览列出阻断原因；实际写入要求当前指纹（环境/原行/原字节/候选字节/类型）。按原生并发元数据使用具体 ETag 或显式 If-Match:*，不能绕过已指定 ETag。只发送一次 content+提取版本的 PATCH，不改名称/公钥/区域/隔离/来源；完全相同字节不写。
- 成功后核对实际 content SHA-256、程序集身份/来源/隔离/包绑定，以及类型 ID/名称保留和版本/区域/公钥刷新。失败保留 saved=true；拒绝/未发送 false，未知 unknown；均不自动重放/回滚或切换后端。静态预检与回读不能替代权限/执行/部署验收。

### 验证与交付

- 类型检查、读取器构建、Node 构建与 npm pack 通过，读取器编译无警告/错误。460 项离线测试全通过（420 + 39 专项 + 1 新增启动检查）。
- 18 个实际编译 PE 样本含签名/未签名、版本/公钥/区域/改名、类型增删/本地继承/嵌套、框架/32位/PInvoke 差异。测试专用 SDK stub 和一次性签名密钥不用于生产；样本含禁止执行的静态初始化器，检查过程只读元数据。
- 覆盖读取器缺失/非法 PE/输出/超时/取消、字段/类型/版本/依赖/受管/包边界、指纹/并发、字节与类型身份回读、saved/unknown 阶段和错误脱敏。
- Online、AD/NTLM、IFD 经实际 D365AuthService 与模拟 Axios 验证指定组织/API content PATCH、版本与独立回读；网络被阻断，未访问/修改真实 CRM。
- 实际 npm 包解压到无 node_modules 目录后，11 项 MCP 启动检查通过，包括包内 .NET 读取器真实调用与无 CRM 配置的本地检查；无 PATH Node 查找依赖的既有 CLI 启动检查继续通过。
- 最新包 ../artifacts/step6-assemblies/dynamics365-mcp-server-1.0.0.tgz；SHA-256：5811BC1BBFCDBAEDC60781F3F894A293C2F2973264B80A4E2B33C998F63C333B；包内 11 文件含固定读取器及源码。版本仍为本地验证 1.0.0，非正式新版本发布。同步文档/HANDOFF/START_HERE/校验清单，原包与历史阶段包均保留。

### 尚未完成

- 下一批既有字段设置与关系/替代键维护；选项排序/删除/受管升级与复杂 UI 等仍未全覆盖，步骤 6 整体及步骤 7–8 未完成。
- 程序集新建、主次版本/类型/框架/依赖迁移、工作流/受管/PluginPackage 更新、解决方案关联和部署验证尚未开放；更多 Image 消息仍待实施。
- 真实三种认证上传权限、内容读取/并发能力、版本和类型刷新、签名平台验证、插件运行时与依赖可用性均待验收；不把本地静态 canWrite=true 当生产适用证明。

官方依据：[注册/版本](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/register-plug-in)、[构建约束](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/build-and-package)、[框架支持](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/supported-customizations)、[程序集表](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/pluginassembly)、[类型表](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/plugintype)、[元数据读取器](https://learn.microsoft.com/en-us/dotnet/api/system.reflection.metadata.metadatareader)。

## 2026-10-28：步骤 6.7，既有字段/关系及失败索引维护（本地范围完成）

### 修改范围

- 新增 update_model_column_settings、update_model_relationship、reactivate_model_key，合计 65 个 MCP 工具。ModelMaintenanceService 复用 ModelStructure/ModelMetadata 现有定义读取、身份/解决方案、写入与错误机制；将四个既有只读辅助方法改为 protected 供子类复用，无新增依赖或 .NET 要求。
- 字段维护限九种已支持类型中的非受管普通自定义字段，正向确认主键/主名称/逻辑/SourceType/派生/自动编号限制；禁止类型/名称、日期行为、安全及业务数据修改。String/Memo 长度、Integer/Decimal/Money 范围和列精度仅保留/扩展；拒绝收缩。Money 派生精度不可当列精度改；日期显示保持原行为兼容；Boolean/已有 Picklist 默认值受类型和值域限制。
- 要求级别、审计/高级查找的受管属性 CanBeChanged 必须明确 true，其他设置要求 CanModifyAdditionalSettings。完整派生定义 PUT 保留原标签/选择定义/日期行为/未知属性，MSCRM.MergeLabels=true；回读检查身份、存储、已改/保留设置及关键定义，忽略 HasChanged 和标签排列顺序，不忽略标签值变化。
- 1:N 修改关联菜单与部分六类级联设置；N:N 修改两侧菜单。限制已确认非受管自定义关系与可自定义菜单；合并单语言标签保留其余语言/菜单和视图 ID。完整定义 PUT 保持端点/Lookup/intersect/未改级联，级联原生复杂规则最终由平台验证。保存不自动发布，不执行关系数据迁移。
- 三工具默认预览；planHash 绑定环境、当前完整定义、补丁、父元数据和解决方案。执行使用 expected_hash=planHash（不是 definitionHash）及 allow_unprotected_write=true，原生元数据 PUT/Action 无已确认原子锁，不借用业务表并发能力伪称受保护。无变化 PUT 在执行复核后不发送写入。保存后独立回读，不自动发布；保存未知不重放。
- Failed 键读取真实 LogicalName，原生 POST ReactivateEntityKey；不重建/删除键，不修重复数据或取消作业。Failed 才可提交，其他状态预览阻断。指纹包含索引/旧作业状态；Action 受理、新 AsyncJob 关联与 Active 独立，GUID 大小写不代表新作业。只回读一次，未传播保持未确认、不自动重提；新作业失败保留 submitted=true 并报 KEY_INDEX_FAILED。
- PUT 回读失败/不匹配保留 saved=true；Action 回读失败保留 submitted=true；拒绝/未发送 false，结果不明 null。传播取消，平台文本/原始错误不透出，不切换后端或重放写入/提交。

### 验证与交付

- 类型检查、Node 与固定读取器 release 构建、npm pack 通过。501 项离线回归测试全部通过（460 + 本批 41）。
- 新测试覆盖九类字段合法设置与拒绝边界、完整定义/标签保留、受管/前缀/存储约束、计划变更/无保护显式参数、1:N/N:N 设置、索引状态与作业身份、保存/提交/未知阶段、取消、Schema/别名与路由。
- Online、AD/NTLM、IFD 经实际 D365AuthService 与模拟 Axios 验证指定组织/API 的完整字段 PUT、关系 PUT、原生 key Action 及独立回读。所有测试阻断网络，未访问或修改真实 CRM。
- 实际 npm 包解压至无 node_modules 目录后，11 项 MCP 启动检查通过，包含固定读取器调用；工具完整清单 65 个。
- 最新包 ../artifacts/step6-maintenance/dynamics365-mcp-server-1.0.0.tgz；SHA-256：218855DE00FECFABB5AEF834C6388E94A4DABB9B76AB2C51161572707C49C261。同目录 VALIDATION.md 记录范围。版本保留本地 1.0.0，非正式生产发布；历史包保留，文档/HANDOFF/START_HERE/清单同步。

### 尚未完成

- 下一批选项排序/删除影响预检；进一步特殊字段/设置、关系/键定义迁移或删除、受管升级、复杂 UI/更多插件能力仍未全覆盖，步骤 6 整体及步骤 7–8 未完成。
- 没有数据收缩评估/扫描、字段类型迁移、日期行为转换、选项值变更或键列重定义。级联涉及删除/所有权/访问的真实效果，菜单能力/发布/UI，Failed 根因修正和真实索引恢复需目标环境验收。
- 默认保守限制：正向受管属性和普通存储信息/菜单能力缺失即阻断；平台依赖/级联规则、语言/权限与数据约束不由模拟测试代替。业务表 ETag 不等于元数据 PUT/Action 的原子保护。

官方依据：[字段定义替换](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/create-update-column-definitions-using-web-api)、[关系定义与语言合并](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/create-update-entity-relationships-using-web-api)、[受管要求级别](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/attributerequiredlevelmanagedproperty)、[关系菜单](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/associatedmenuconfiguration)、[索引生命周期](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/define-alternate-keys-entity)、[原生重新激活 Action](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/reactivateentitykey)。

## 2026-10-28：按用户要求转入步骤 7；7.1 Action/Function 调用增强（本地范围完成）

### 优先级与范围

- 用户明确要求“直接继续步骤七”。步骤 6.1–6.7 保留已完成本地范围；剩余选项/元数据/UI/插件扩展仍未完成，不再作为当前优先项。后续继续步骤 7，不自动切回步骤 6。
- 新增 get_api_operation；完善既有 call_d365_api_action，共 66 个工具。保留旧工具名称、默认即时 Action POST、默认原生数据返回，原生 204 为 null；return_details=true 才返回状态/数据/执行回执。
- 每次读取目标组织当前 /$metadata，不缓存可能过期的签名，不信任调用方声明类型；命名空间感知解析 Schema/别名/实体集/EntityType/ComplexType/EnumType/Action/Function/import。禁止 DTD/实体声明、外部引用下载，限制 XML 32 MiB/50万 token/元素/64层、类型/签名/成员数与继承深度。
- 只对当前已暴露的操作构造 URI；未导出的 unbound query function 不可调用。实体/集合绑定校验实际实体集/继承与单 Guid 主键；绑定参数来自 URI，禁止在 body 重复。Bound 使用完整命名空间，unbound 使用 import。
- 从实际参数集合、声明类型/空值/可选注解及绑定筛选重载；多个匹配必须指定查询得到的 signature_id，不能取第一个。参数名/操作名大小写严格，未知参数与导航/深插入等不在支持范围。
- 支持常用 EDM 基元、原生枚举/Flags、结构/集合与实体引用；Int64 精确字符串/安全整数，Decimal 字符串/非指数有限值及原生精度/小数位，IEEE754 JSON 字符串输出；日期/时间/Duration/base64/Unicode/值域有类型校验。复杂类型必需属性与实体部分记录分开。
- 同服务实体引用仅 entityset(Guid)，Function 传 @odata.id JSON，Action 按实际主 Guid 键转实体类型+键值；跨组织 URL、备用键/导航引用及混合引用/数据被拒绝。公开未支持类型不回退不校验请求。
- Function 全部值放参数别名查询串，字符串引号转义并编码保留字符/Unicode，复杂/集合 JSON 序列化，不在路径插入值。编码 URL 限 32 KiB，参数 1 MiB/JSON结构、集合1000项、值遍历1万节点/20层；无效 Unicode/非 JSON/循环/深嵌套拒绝。避免使用 Node 18 早期没有的 URLSearchParams.size。
- 可选 dry_run 只读预览默认隐藏值/完整查询 URL；include_parameter_values 明确选择才显示。可选 expected_hash 检查当前 planHash 绑定元数据、环境、目标与值；不是记录锁。回执仅原生响应，通用工具不猜业务回读或异步完成。取消传播，错误不含参数值/平台原始文本，未知结果保留 null；Action 无额外服务级重放，沿用共享认证刷新和 GET 有限重试机制。
- RecordService.callD365Action 源码旧入口委托同一实现，移除原 URL 字符串拼接旁路；数据型客户端不捏造 HTTP 状态。MCP 使用实际带状态请求层。此批无新依赖或 .NET 要求。

### 验证与交付

- 类型检查、release 构建与 npm pack 通过。549 项离线测试全通过（501 + 本批 48）。覆盖 CSDL/导出可见性、类型/值/继承、单实体/集合绑定、重载选择、别名/特殊字符、精确数值、预览/指纹、错误阶段/脱敏、边界/取消和旧返回。
- Online、AD/NTLM、IFD 经实际 D365AuthService 和模拟 Axios 读取 XML CSDL、绑定 Action POST、编码 Function GET。测试网络被阻断，未访问/修改真实 CRM。
- 实际包解压至无 node_modules 目录后，11 项 MCP 启动检查通过，完整 66 工具及固定读取器调用仍通过。
- 最新包 ../artifacts/step7-operations/dynamics365-mcp-server-1.0.0.tgz；SHA-256：5C690791BE9B49B13207A36980BC8024601A321DA9C1A93CA15CDF541695F0C2。同目录 VALIDATION.md 记录范围。版本仍为本地 1.0.0，非正式生产发布。同步文档/计划/HANDOFF/START_HERE/当前校验清单，历史包保留。

### 下一步与未验收

- 继续步骤 7.2：解决方案组件与依赖检查；再推进导出/导入/异步任务、环境差异/部署验证。Ribbon/现代命令和 Custom API 定义管理尚未实施；调用既有 Custom API 不等于创建定义。
- 当前通用序列化有明确限制：未覆盖所有 EDM/外部类型、导航/深插入/任意 open 属性、备用键/导航绑定或所有服务器差异；真实大组织 CSDL/权限/业务校验/原生序列化和执行均待验收。
- 步骤 6 剩余范围、步骤 7 后续/真实小型解决方案场景及步骤 8 未完成。无真实环境连接，不把模拟测试/原生响应当部署或生产验收。

官方依据：[服务文档/CSDL](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/web-api-service-documents)、[Action 绑定/实体参数](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/use-web-api-actions)、[Function/别名](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/use-web-api-functions)、[OData URL](https://docs.oasis-open.org/odata/odata/v4.01/odata-v4.01-part2-url-conventions.html)。

## 2026-10-28：步骤 7.2，解决方案组件与依赖（本地范围完成）

### 修改范围

- 延续用户指定步骤 7；新增 list_solutions、list_solution_components、get_solution_component_dependencies、add_solution_component，合计 70 工具。无新依赖，无新增 .NET/SDK 写入后端。
- 目录按 exact uniqueName/ID/managed 组合筛选；成员读取明确 objectid/componenttype、solutioncomponentid、root ID/包含范围。返回当前用户可见分页完整性，不把成员行当导出内容或部署闭包。
- Native paging 使用固定 Prefer 最大页大小、server nextLink/$skiptoken 和本地 top/max_pages 限额；不与 $top/$skip 混用。仅目标单记录查找用非分页 $top=2。验证同组织/API/集合或 Function/原始过滤选择排序与参数别名范围，绝不跟随跨域/改路径或查询范围的 nextLink；拒绝循环、重复身份/分页选项、坏结构，页/结果 5 MiB 上限。
- 复用步骤 7.1 CSDL/类型/字面量机制，正向校验 Microsoft.Dynamics.CRM 下的原生 RetrieveRequiredComponents、RetrieveDependentComponents、RetrieveDependenciesForDelete。分别返回 required/dependent/delete 语义和投影依赖边，不计算递归闭包，不把空结果当删除权限；没有 dependencyid 但双方身份有效的记录仍可读取。
- 添加源对象通过专用原生表或元数据 ID 查询，支持类型 1/2/9/10/14/26/60/61/90/91/92/93。Attribute/Key 额外校验父表；不混用源对象 GUID 与成员行 GUID。读取身份/名称/状态，不取脚本/DLL/表单/视图 XML 或插件配置。
- 目标限定唯一可见普通非受管解决方案，拒绝 parent/patch 与 Default/Active/System；允许引用既有受管源组件，不编辑其定义。默认预览，当前 CSDL 固定 AddRequiredComponents=false、DoNotIncludeSubcomponents=true；IncludedComponentSettingsValues 仅在服务声明时发送空集合，旧版本省略，无未校验/更大范围回退。
- 规划要求完整可见成员与 required 依赖基线，最高 5000 行/20 页；执行需同一 planHash 和显式 allow_unprotected_write。指纹绑定目标/源身份字段、CSDL、请求和基线，无原子锁或冻结组件内容。已有显式成员不再次调用，保留原根包含范围；不推断父根隐式包含覆盖。
- 唯一写入为 AddSolutionComponent；不直接 CRUD 只读成员表，不新建/移除/删除组件或解决方案，不自动发布。成功后回读目标和完整成员，确认 object/type 及响应 id 对应成员行 ID；表添加还校验 root behavior=1。报告 added/removed/changed 非事务观察差异，可能含平台隐式父 shell，不把所有变化归因本次请求。
- 写入拒绝/未发送 saved=false，未知 null；已受理但身份/范围/完整性/读取失败保持 saved=true 和 phase=readback，不自动重试/补偿删除。错误不输出平台文本/原始数据，读权限错误与空成功分开；取消贯穿元数据、依赖、成员和 Action。

### 验证与交付

- 类型检查、release 构建和 npm pack 通过；594 项离线测试全部通过（549 + 本批 45）。覆盖十二类对象添加、目录/成员过滤、三类依赖/CSDL、旧/新可选参数、范围与父上下文、分页逃逸/重复、指纹/无变化、隐式 shell、提交/回读证据、取消与路由。
- Online、AD/NTLM、IFD 经实际 D365AuthService 与模拟 Axios 验证指定组织/API 的依赖 Function、AddSolutionComponent 和成员回读。测试阻断网络，没有访问或修改真实 CRM。
- 实际 npm 包解压至无 node_modules 目录，11 项 MCP 启动检查通过，完整 70 工具及固定读取器调用继续通过。
- 最新包 ../artifacts/step7-solutions/dynamics365-mcp-server-1.0.0.tgz；SHA-256：16F89BED14118F9FC29795DD816B295ED347604FE8E9D5BAF2B90095D83722BE。VALIDATION.md 同目录，版本保留本地 1.0.0，非正式生产发布；历史包保留，文档/HANDOFF/START_HERE/当前清单同步。

### 下一步与未验收

- 下一批 7.3 导出/导入与异步任务跟踪，再继续环境差异/部署验证、Custom API 定义与 Ribbon/现代命令。更多组件/包含设置、移除、完整依赖闭包与破坏性清理不在本批。
- 实际源/目标权限、managed 源引用、平台包含/隐式覆盖/父 shell 行为、依赖分页和导出可移植性待真实验证；当前只保证本地请求/校验/阶段契约。没有小型解决方案真实导出/导入/验收场景。
- 步骤 6 剩余保留未完成，不切回主线；步骤 7 整体及步骤 8 尚未完成。

官方依据：[成员表](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/solutioncomponent)、[依赖消息](https://learn.microsoft.com/en-us/power-platform/alm/check-solution-dependencies)、[添加 Action](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/addsolutioncomponent)、[返回成员 ID](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/addsolutioncomponentresponse)、[原生分页](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/query/page-results)。

## 2026-10-28：步骤 7.3 首批——ZIP 检查、原生导出/首次非受管异步导入与任务跟踪

### 修改与边界

- 新增 inspect_solution_package、export_solution、import_solution_async、get_solution_import_status，共 74 个 MCP 工具。新路径复用 Node/Web API，无额外运行时、CLI、CRM SDK 后端或连接切换。
- solutionPackage.ts 有界读本地文件/规范 base64，校验 ZIP 中央与本地头、尺寸、完整 deflate 消耗、所有内容 CRC、连续非重叠范围和安全文件名；不解压或执行。压缩 <=32 MiB/10000 项，单项膨胀 <=64 MiB/总量 <=256 MiB，清单 <=2 MiB。拒绝加密、ZIP64、多磁盘、symlink、名称冲突/危险路径及替代 Unicode 名称。清单仅返回身份/发布者/根与缺失依赖声明数量，不声称组件结构、代码可信性、数字签名、依赖闭包或部署就绪。
- 原生 ExportSolution 校验当前 CSDL 参数/响应和 WhoAmI 组织/调用者身份，源限可见普通非受管方案，可选 managed 输出。默认预览；执行需当前 planHash，独占新 .zip 文件，无发布/覆盖。返回包须匹配方案名/版本/managed，再校验本地字节哈希与文件身份；导出与本地保存状态分开，失败保留阶段和可能为空/部分的保留文件，无自动删除/重放。
- 原生 ImportSolutionAsync 仅普通非受管首次方案名；包字节/CSDL/当前组织与调用者绑定预览。当前调用者可见缺席不是全组织缺席；首次导入仍可能更新共享非受管组件。固定 OverwriteUnmanagedCustomizations/PublishWorkflows=false，可用时 SkipProductUpdateDependencies/HoldingSolution/StageAndUpgrade/SchemaUpdatesOnly=false，ComponentParameters=[]。不使用内部/废弃/覆盖参数，不发送单独发布；没有原子组件锁、全图差异或无副作用保证。
- 导入实际执行需 expected_hash=planHash、allow_unprotected_write=true。执行时生成客户端 ImportJobId，保留响应独立 ImportJobKey、AsyncOperationId 与匹配指标，不把字符串键冒充 GUID。accepted=false/null/true、完成、进度、方案身份和部署验收分别报告。未知提交保留恢复 ID，不自动重试/切后端重放；HTTP 已受理但回执坏仍保留 accepted=true。接受/未知导入清缓存。
- 状态仅单次只读投影 asyncoperation/importjob；3/30、3/31、3/32 分别成功/失败/取消，其余 pending/unknown。operationtype=203 单独作为导入类型证据；progress=100 不证明成功。方案 ID/name 有值时独立回读身份，不校验内容/运行时/发布或声明两个输入作业 ID 有独立关联。403、404/隐藏/删除、读取失败分开，不读取原始 data/message/日志。无自动轮询/调度/取消/重启/回滚。
- 保留既有取消贯穿，安全错误不透出平台文本/请求内容；本地 ZIP 检查在 CRM 配置创建之前路由。受管/既有方案更新/升级/覆盖设置与异步导出留待独立工作流。

### 验证与交付

- 类型检查、release 构建、npm pack 通过。692 项离线测试全部通过（594 + 本批 98）；97 项传输测试覆盖 ZIP 攻击/格式/清单、输入/指纹、当前 CSDL/可选参数、输出独占和身份哈希、请求拒绝/未知/坏回执、状态与回读缺口、取消/MCP 路由，以及三种实际鉴权请求分支的模拟传输。
- 新增实际 MCP 包本地 ZIP 调用启动检查，空外部 PATH、无 CRM 配置；现有读取器/认证/CLI 检查保留。实际包解压到无 node_modules 目录后 12 项启动检查通过。全程测试阻断网络，没有真实 CRM 连接或写入。
- 最新包 ../artifacts/step7-transfer/dynamics365-mcp-server-1.0.0.tgz，SHA-256：98843787E75A10B1D6045044F9D89DC23F075F1F6BAE9BCF2250323843FEB957。VALIDATION.md 同目录，保持本地 1.0.0，历史包保留。
- README/计划/结构/进度/HANDOFF/START_HERE 与当前文件清单同步；原 MANIFEST_SHA256.json 不改。

### 下一步与未验收

- 下一批优先环境/组件差异、部署验证与显式失败日志，然后 Custom API 定义与 Ribbon/现代命令。既有方案更新/受管导入/holding/upgrade、异步导出、覆盖设置、更多成员范围/移除和完整依赖闭包未完成。
- 实际导出内容/权限/包格式兼容、导入原生副作用、状态关联与真实小型方案部署验收未完成；证书/代理和三种鉴权真实联调待提供环境。步骤 6 剩余不切回主线；步骤 7 整体与步骤 8 未完成。

官方依据：[ExportSolution](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/exportsolution)、[导出响应](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/exportsolutionresponse)、[ImportSolutionAsync](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/importsolutionasync)、[导入回执](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/importsolutionasyncresponse)、[异步作业](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/asyncoperation)、[导入作业](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/importjob)。

## 2026-10-28：步骤 7.4 首批——选定属性快照、跨环境离线对比、当前目标验证与导入日志

### 修改与边界

- 新增 get_solution_snapshot、compare_solution_snapshots、verify_solution_deployment、get_solution_import_log，共 78 工具；均只读、Node/Web API，无额外 SDK/CLI/.NET 要求，不写入/发布/修复/导入/轮询/调度或重放。
- solutionSnapshotValues.ts 定义 d365.solution.snapshot.v1 的有界严格 JSON/规范化/完整性规则；solutionSnapshot.ts 抓取当前 WhoAmI/方案、显式可见成员及五类选定属性，回读成员/方案观察变化。2 MiB 快照、max 200 成员/20 页、单组件 64 KiB；局部/截断/权限/未知格式作为缺口，不保证原子或所有定义跨读稳定。
- 初始 profile 为 1 表、9 全局 Picklist、10 关系、61 Web 资源、91 非包数据库程序集。元数据只选身份/标签/核心属性，二进制 <=16 MiB 只返哈希/长度，不运行或输出内容。未支持字段/表单/视图/步骤等、子组件展开、完整模式/管理层/依赖/发布/运行时比较；原生普通读取没有发布证明。
- 对比是无配置的本地 JSON 工具，不接收另一组织 URL/凭证或复用 Token；两端分别配置采集。严格校验 shape、canonical definitions、组件/快照哈希；一致性哈希不认证来源。portable key 以逻辑/模式/Web Resource 名称或程序集身份匹配，传输/环境 GUID 保留证据不参与定义比较。根成员 ID 映射逻辑根，规范化 Label LCID 和 Option Value 顺序，忽略 per-user 标签/元数据 GUID；选项显示顺序不在范围内，代码/二进制内有意义 GUID 不删除。
- 报告确认 missing/extra、changed 的组件引用/属性路径、matched 和缺口；对侧清单不完整/受限时返回 unmatched，不把未知当缺失。重复 portable key、未知/循环根、不稳定/截断/不支持/权限缺口均 inconclusive，已观察差异保留。selectedScopeCheck 仅当前 profile，始终不声明完整部署/发布/子组件通过。
- solutionImportLog.ts 显式读取 native importjobs.data，按官方 importexportxml 解析有界结果，不调用数据导入 importlogs。XML <=2 MiB、depth/nodes 有界、拒绝 DTD/entities/namespaces，无执行。计数含 manifest/section，不是唯一组件数；失败/警告优先输出，可截断列表而保留全部有界 XML 计数。空/未知/成功 manifest/进度不是异步或部署通过证据。
- 日志不返原始 XML，include_text 默认 false。显式启用时先标准凭证模式/配置秘密最佳努力脱敏再按 max_text_chars 限长，任意业务文本仍可能敏感；文本是非可信证据，不是指令。native 403/404/读取/格式失败不假通过、无自动回退。
- solutionVerification.ts 将当前目标选定范围比较与可选原生作业/日志独立呈现，单独核对日志方案名/ID，保留失败/缺口而不丢组件比较。成功 async 不覆盖组件差异；两个调用者作业 ID/源包/当前环境的因果链未独立证明，deploymentVerified/publicationVerified/runtimeVerified 均 false。

### 验证与交付

- 类型检查、release 构建、npm pack 通过。748 项离线测试全部通过（692 + 本批 56）；55 项验证测试覆盖五类 profile、跨环境 GUID/标签规范化、属性/字节变化、根映射/重复/未知/循环、读权限与分页/变化、严格 JSON/哈希、未知与缺失分离、XML 攻击/文本脱敏、独立作业证据、取消和 MCP 路由。
- Online、AD/NTLM、IFD 实际 D365AuthService 分支使用模拟 Axios 执行快照/日志/当前目标验证。网络被阻断，没有真实 CRM 连接/读取/写入。
- 实际 npm 包解压到无 node_modules 目录，13 项 MCP 启动检查通过；新增无 CRM 配置/空外部 PATH 的实际包离线 snapshot comparison。固定读取器、ZIP 和既有认证/CLI 检查继续通过。
- 最新包 ../artifacts/step7-verification/dynamics365-mcp-server-1.0.0.tgz；SHA-256：9748EAF8532A38EE5C1474FB5C8493A0AAFCA419ECF1526295A676944B42E824。同目录 VALIDATION.md，版本保留本地 1.0.0，非正式生产发布；历史包保留，README/计划/结构/进度/HANDOFF/START_HERE 与当前清单同步。

### 下一步与未验收

- 下一批优先 Custom API 定义维护，再继续 Ribbon/现代命令，按当前环境真实能力限定。更多 snapshot profile、字段/复杂 UI/插件步骤、子组件展开、完整负载/管理层/依赖/发布/运行时验收仍待扩展。
- 既有方案更新/受管导入/升级、覆盖参数、异步导出、格式化日志下载等不在本批；原生权限/发布语义/真实跨环境数据与完整小型方案部署尚未验收。步骤 6 剩余不切回主线，步骤 7 整体与步骤 8 未完成。

官方依据：[元数据和类型化关系查询](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/query-metadata-web-api)、[成员/根范围](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/solutioncomponent)、[原生导入结果 XML](https://learn.microsoft.com/en-us/dynamics365/customerengagement/on-premises/developer/work-solutions?view=op-9-1#tracking-import-success)、[importjob 属性](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/importjob)。

## 2026-10-29：步骤 7.5 经典 Ribbon 按钮首批——原生读取及本地候选包

### 修改与范围

- 用户最新指定“继续ribbon按钮”，将 Ribbon 提到 Custom API 定义维护之前；不自动切回步骤 6 或 Custom API。新增 get_ribbon_definition、inspect_ribbon_solution、edit_ribbon_solution，共 81 工具，Node-only。
- RibbonService 验证当前表身份、CSDL Function/参数/枚举/返回结构，通过 typed parameter aliases 调用 RetrieveEntityRibbon，仅 GET。对压缩 ZIP 应用同一安全校验，从 RibbonXml.xml 读取 <=2 MiB 定义，支持 All/Form/HomepageGrid/SubGrid。默认摘要按钮/命令/规则/JS 库和参数类型，完整 XML 显式返回才含参数字面值；不把有效合并定义当可直接写回的差异或可见性/权限/运行时结果。
- 复用 solutionPackage.ts 原有 ZIP 头/路径/尺寸/全内容 CRC/膨胀限制，抽出通用有界 archive/指定 payload 收集；solution wrapper 的清单和格式检查保留。单 entry 重打包保存所有其他原始压缩块，只改中央 offset。避免另写绕过验证的解压/ZIP 路径，无文件提取或执行。
- 本地检查/编辑仅 customizations.xml <=4 MiB 的唯一表 RibbonDiffXml；有界 XML、拒绝 DTD/entities/命名空间 Ribbon。编辑只允许普通非受管、非 parent/patch/reserved 包；自定义 ID 需 publisher prefix，显式 Mscrm.Form/HomepageGrid/SubGrid 当前表 ._children 位置，拒绝内置替换/任意 XML/批量清空/复杂菜单/处理器替换等。
- add_button 创建独立 CustomAction/Button/JS CommandDefinition 与多语言 LocLabel，ordered crm/string/bool/int 参数；包内 WebResources 必须唯一且类型/payload 存在（JS=3，图标 5/6/7/10），支持官方导出的根相对 FileName/反斜线。函数行为、位置真实存在、图标尺寸/内容、资源发布与完整 XSD 不保证。
- update_button 合并指定 LCID 保留其他语言，修改 Button/CustomAction sequence，保留 JS handler/参数、规则、独立 tooltip 引用。共享或歧义标签保护，其他实体/表单/字段/资源保留。
- set_visibility 限唯一不共享自定义命令，通过两条相矛盾 CrmClientTypeRule 生成专用 DisplayRule gate，保留原有规则/actions；显示只移除此 gate。修改/共享/冲突的 gate 拒绝，不生成或移除原有 HideCustomAction，不声称绕权限/层后必然可见。
- 默认预览无落盘，绑定实际输入 ZIP/表/有序 changes/候选字节/解析目标路径的 planHash；实际保存需 expected_hash，独占新 .zip。不覆盖源/旧文件。验证其他压缩块/内容哈希、清单字节和版本、选定 Ribbon 外 XML 语义、候选解析/Ribbon 指纹、本地文件身份和哈希。失败保留 localSaved=false/null 与保留文件线索，不冒充有效产物。
- 没有 CRM 写入/导入/发布或脚本执行，没有直接 PATCH 元数据 RibbonDiffXml。整包导入会应用其他未改组件；当前 import_solution_async 首次导入范围不扩张为既有方案更新。候选生成不等于实际部署，现代命令未实现。

### 验证与交付

- 类型检查、release 构建、npm pack 通过；802 项离线测试全部通过（748 + 本批 54）。53 项 Ribbon 测试覆盖创建/更新/多语言/tooltip/顺序/隐藏恢复、共享边界/资源/位置/输入类型、stored/deflate/descriptor ZIP 重写与压缩块/XML 保留、编码、指纹/独占文件、恶意 XML/ZIP、原生 CSDL/枚举、权限/取消及 MCP 路由。
- ZIP 公用解析改动另通过既有 97 项导入导出/安全格式用例；全量回归已包含这些测试。Online、AD/NTLM、IFD 使用实际请求分支和模拟 Axios 读取压缩 Ribbon；网络被阻断，未访问真实 CRM。
- 实际 npm 包解压至无 node_modules 目录，14 项 MCP 启动检查通过；新增无配置/空 PATH 的实际包 Ribbon 预览、保存候选 ZIP 和重新检查，其他读取器/ZIP/快照/CLI 检查保留。
- 最新包 ../artifacts/step7-ribbon/dynamics365-mcp-server-1.0.0.tgz，SHA-256：7EC1728867FB7379FDD86DF9F280FAA231D781A29427B607A52420D8105ACD8D。同目录 VALIDATION.md，1.0.0 仍为本地验证版；历史包保留。README/计划/结构/进度/HANDOFF/START_HERE 与校验清单同步。

### 下一步与未验收

- 按用户 Ribbon 优先意图，接着做候选包在既有测试方案中的受控导入、独立发布、原生有效定义和 UI/脚本回读；当前没有目标连接、具体按钮部署和真实运行时验收。
- 内置按钮/高级规则/应用全局 Ribbon/现代命令、Custom API 定义、受管/通用既有方案升级、完整环境比较等仍待后续；步骤 6 剩余、步骤 7 整体和步骤 8 未完成。

官方依据：[RetrieveEntityRibbon](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/retrieveentityribbon)、[原生压缩 part](https://learn.microsoft.com/en-us/power-apps/developer/model-driven-apps/export-ribbon-definitions)、[方案导出/编辑/导入路径](https://learn.microsoft.com/en-us/power-apps/developer/model-driven-apps/export-prepare-edit-import-ribbon)、[CustomAction/HideCustomAction](https://learn.microsoft.com/en-us/power-apps/developer/model-driven-apps/define-custom-actions-modify-ribbon)、[显示规则](https://learn.microsoft.com/en-us/power-apps/developer/model-driven-apps/define-ribbon-display-rules)、[动作和参数](https://learn.microsoft.com/en-us/power-apps/developer/model-driven-apps/define-ribbon-actions)。

## 2026-10-29：步骤 7.6 Ribbon 受控既有方案导入、独立发布与定义回读首批

### 修改与范围

- 保持用户 Ribbon 优先。新增 import_ribbon_solution、publish_ribbon_solution、verify_ribbon_deployment，共 84 工具，沿用同一 Node/Web API 与三种认证，无新运行时/传输后端。
- 从 ribbon.ts 共享纯候选构建；两份本地 ZIP/相同 changes 精确重放要求逐字节一致，不允许任意 repack/外部编辑当既有更新。输入 <=1 MiB JSON、文件仍原 ZIP/稳定读限制。当前服务版本序列化/压缩差异保守拒绝，需本地重新生成/审查。
- 预备校验真实 WhoAmI、唯一可见普通非受管方案/同版本/无 parent、实际 publisher 名称/prefix、实际可自定义表，以及完整当前成员含该表。受管但可自定义底层表可承载非受管 Ribbon 层，目标方案仍须非受管。源码需和原生新鲜 ExportSolution 全有效负载匹配：忽略压缩元信息、XML 格式/属性顺序，保留业务 ID/内容和其他文件字节。预览会执行只读性质 ExportSolution POST，失败明确 import 未发；不自动替换/放宽旧基线。
- 执行绑定源/候选/changes、当前配置/原生组织与调用者、方案/publisher/表、CSDL、成员/新鲜导出和请求的 planHash；需 allow_unprotected_write 与 allow_full_solution_import。导入作用于整包，包括其他未改组件，可能更新共享非受管定义，仍有并发/pending 窗口，无原子 Ribbon-only 更新。无变化不提交/不伪造回执。
- 从 solutionTransfer.ts 共享当前 CSDL 原生契约/参数和一次 ImportSolutionAsync 提交；既有 import_solution_async 的首次方案限制不变。新 Ribbon 路径固定不激活工作流/覆盖受管层/跳依赖/holding/upgrade/覆盖值，不发布/轮询。accepted=false/null/true 与客户端 ImportJobId/原生 ImportJobKey/AsyncOperationId 分开，失败/未知或 HTTP 已受理坏回执不重放。
- 有效原生响应签发绑定源/候选/changes/环境身份/目标/原生作业 ID 的 HMAC importReceipt；key 仅内存、同进程有效，不输出/持久化或用于 CRM 鉴权。篡改/重启/目标或调用者不同拒绝发布。不可以为补回执重新导入；只读状态/日志/verify 可恢复检查，持久恢复发布未实现。
- 发布是独立预览/指纹/执行：必须回执绑定、native async succeeded/import 类型、匹配实际方案的 importjob、completed 原生日志且唯一成功 manifest/无 failure/unknown。进度 100 不代替终态，进度较低不覆盖独立成功证据。新鲜非 Ribbon 可导出 payload、当前 CSDL PublishXml 与当前有效 Ribbon 加入计划；执行需 allow_unprotected_write 和 allow_full_table_publish。
- PublishXml 仅整张目标表，包含其他 pending 字段/表单/视图/Ribbon；未完全读取/锁定 pending 内容，不能从已发布导出冒充 pending 快照。引用 JS/图像资源本请求不发布，需单独 Web Resource 发布流程。不执行脚本或声称 UI/权限/布局/运行时有效。
- 发布拒绝 false，未知 null；原生成功后定义回读失败/差异保留 published=true 与 importCompleted/phase，不重导/重发。verify 无回执只读，比较变更按钮属性、command/action/参数结构、局部显示规则和 LCID 标签，不返参数值；缺失/歧义/转化证据保持 different/inconclusive，不证明实际导入/发布、资源内容或完整部署/因果链。

### 验证与交付

- 类型检查、release 构建、npm pack 通过；864 项离线测试全通过（802 + 本批 62）。覆盖精确候选/旧基线/其他组件、发布者版本表成员/CSDL、整体范围与指纹/no-op、拒绝/未知/坏回执、同进程与重启/篡改/调用者绑定、原生作业/日志、独立发布、部分回读、标签顺序、只读恢复/取消和 MCP 路由。
- Online、AD/NTLM、IFD 经实际 D365AuthService 与模拟 Axios 完整导入/独立发布/回读通过；测试及跨进程回执测试阻断网络。共享 helper 的既有导出/导入/Ribbon 编辑回归保留，未访问真实 CRM。
- 实际 npm 包解压至无 node_modules 目录，14 项 MCP 启动检查通过，完整 84 工具发现和本地 Ribbon/ZIP/快照/.NET 读取器启动契约通过。
- 最新包 ../artifacts/step7-ribbon-deployment/dynamics365-mcp-server-1.0.0.tgz；SHA-256：C46CDFBD66959D5B17C1817A3210F8121B98FC867343279648212A8392B6BB81。同目录 VALIDATION.md，1.0.0 为本地阶段验证版，历史包保留。README/结构/计划/进度/HANDOFF/START_HERE/当前清单同步。

### 下一步与未验收

- Ribbon 优先：引用 JS/图标的独立发布/内容核对、持久回执恢复与真实 UI 验收准备，再扩展内置按钮/高级规则/现代命令；Custom API 定义仍未实施。
- 没有真实 CRM 连接，不能把模拟导入/发布当已部署按钮；三种实际鉴权/权限/证书代理、导出规范化、pending 状态窗口、导入副作用、发布/缓存时序、浏览器点击与脚本运行未验收。步骤 6 剩余、步骤 7 整体与步骤 8 未完成。

官方依据：[ImportSolutionAsync](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/importsolutionasync)、[原生回执](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/importsolutionasyncresponse)、[PublishXml](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/publishxml)、[Ribbon 方案导出/编辑/导入/发布](https://learn.microsoft.com/en-us/power-apps/developer/model-driven-apps/export-prepare-edit-import-ribbon)、[原生导入日志](https://learn.microsoft.com/en-us/dynamics365/customerengagement/on-premises/developer/work-solutions?view=op-9-1#tracking-import-success)。
