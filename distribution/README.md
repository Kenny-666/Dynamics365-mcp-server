# 便携包构建

Windows 接收者使用 `dynamics365-mcp-1.0.0-windows-x64-portable.zip`。其根目录包含中文/英文说明、配置模板、自检及客户端配置生成脚本；启动时使用包内 Node.js 和 .NET 10 Runtime。标准 `.tgz` 适合已有 Node.js 环境的接收者。

构建时需要项目开发依赖、.NET 10 SDK，以及准备分发的 Windows x64 Node.js 和 .NET 10 Runtime。先运行 `npm pack`，自动构建并收集生产依赖许可声明，然后执行：

```powershell
node scripts/build-portable.mjs `
  --node-exe 'C:/Program Files/nodejs/node.exe' `
  --node-license 'C:/BuildInputs/node-LICENSE.txt' `
  --dotnet-root 'C:/Program Files/dotnet' `
  --dotnet-version 10.0.13 `
  --output '../artifacts/distribution-2026-10-29' `
  --stage '.cache/portable-build-fresh'
```

`--node-license` 指向与 Node.js 版本对应的官方完整 LICENSE；运行时随附许可证及第三方声明会纳入便携包。构建器只复制选定的运行时文件、已构建服务、公开文档和占位配置模板，输出 ZIP、构建摘要和使用说明；现有暂存目录或 ZIP 不会被覆盖。每次重新构建请使用新的暂存路径，并先保留/重命名之前的 ZIP。

发出前从 ZIP 解压到带中文和空格的目录，运行 `check.cmd --no-pause`、`generate-client-config.cmd --no-pause`；核验生成路径，并使用实际解包 bundle 运行 `tests/startup.test.mjs`。包内 `manifest.json` 校验原始文件，自建 `.env` 和客户端配置不会被加入原始分发包。构建摘要记录本次选定的已验证代码基线；修改功能后应更新基线及验证结果。
