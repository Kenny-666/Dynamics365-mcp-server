# Dynamics 365 MCP portable package (Windows x64)

Includes the built MCP server, Node.js and .NET 10 Runtime. Extract and configure it without installing Node.js, npm, the .NET SDK or project dependencies. This package targets Windows x64. Other operating systems can use the accompanying npm archive with their own runtimes.

[中文](README.md) · [Full documentation](app/README.en.md) · [84-tool coverage](app/docs/CRM_TOOL_COVERAGE.md)

## Connect

1. Extract the entire folder to a permanent writable location, such as `D:\MCP\Dynamics365-MCP`.
2. Run `configure.cmd`, fill in your CRM settings in `.env`, and save. The default template uses on-premises AD/NTLM. For Online or IFD, copy `.env.online.example` or `.env.ifd.example` to `.env` first. Use the organization root URL and the API version supported by your environment.
3. Run `generate-client-config.cmd`. Merge the server entry from `mcp-client.generated.json` into a stdio-capable MCP client, then restart or reconnect it. The generated command uses the bundled Node.js and an absolute path to `launch.cjs`. Regenerate it after moving the folder. Map `command` and `args` to your client's JSON/TOML format as needed.

Credentials are read from the package-root `.env`. CRM settings supplied by the client process environment take precedence over matching `.env` entries.

## Local check

Run `check.cmd`. It verifies SHA-256 hashes, bundled runtimes, MCP initialization, the 84-tool inventory, and local DLL metadata inspection through the bundled .NET reader. It sends no CRM requests. Authentication, network access and CRM privileges are validated when CRM tools are called.

The client normally starts the server automatically. `start-mcp.cmd` starts the stdio server manually; waiting for protocol input is expected. `launch.cjs` locates the bundled files and `.env` independently of the client's working directory. Paths containing spaces and Chinese characters are supported.

## Capabilities and validation

The 84 tools cover records/OData/FetchXML, tables and columns, relationships/keys/choices, forms/views, Web Resources, plugins and DLL inspection, audit/security/diagnostics, solutions and classic Ribbon workflows. See the full documentation for parameters.

As of 2026-10-29, all 910 local regression tests pass. Live CRM testing has called 65/84 tools: 20 specified write/readback paths passed and two publication requests were accepted. Full live and UI acceptance remains incomplete. Known limitations include the test server's CSDL cache permissions, ineffective relationship clearing, and Pending key indexes. Plugin execution and Ribbon UI acceptance need additional testing; the coverage matrix records each boundary.

Write, delete, import and publish tools use the configured identity's real CRM privileges. Some execute directly by default; inspect their parameters and preview support before use.

## Sharing

Share the original ZIP. Before repackaging a configured folder, remove `.env`, real credentials and user-generated CRM files. The original archive contains placeholder templates only.

`runtime/` contains runtimes; `app/` contains the server, DLL reader and documentation; `licenses/` contains notices; `manifest.json` records original file hashes; `release-info.json` records versions and validation. User-created configuration files are outside the original hash manifest. This is the locally validated 1.0.0 build. See the included license declarations.
