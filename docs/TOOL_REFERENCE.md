# Detailed tool reference

This guide retains detailed tool parameters, preview behavior, concurrency rules, and save/publication semantics. Step numbers trace implementation history. Start with the [English README](../README.en.md) or [Chinese README](../README.md). Current tool names and input constraints are defined by MCP tools/list and the implementations in src/tools and src/tool_handler.ts.

A Model Context Protocol (MCP) server implementation for Microsoft Dataverse / Dynamics 365. It enables AI assistants (like Cursor, Windsurf, Claude Desktop) to interact directly with your Dynamics 365 environment through the standard MCP protocol.

## 🌟 Key Features

This project provides a comprehensive set of tools for metadata discovery, record operations, and advanced querying:

- **Metadata Management**:
  - `get_entity_metadata_summary`: Get key fields and business summary for an entity.
  - `list_all_entity_definitions`: List all available entity definitions in the system.
  - `get_detailed_field_metadata`: Get full attribute metadata for a specific field.
  - `get_field_picklist_options`: Get mappings for OptionSet (metadata) values.
  - `get_entity_navigation_links`: Analyze relationships and navigation properties between entities.

- **Data Operations (CRUD)**:
  - `get_record_by_id`: Retrieve a single record by its GUID.
  - `search_records_by_odata`: Flexible record search using OData syntax.
  - `create_new_record`: Create a new record in Dataverse.
  - `update_existing_record`: Update an existing record.
  - `delete_record_by_id`: Delete a record by GUID.
  - `upsert_record_by_key`: Use an active alternate key with native conditional PATCH.
  - `associate_records` / `disassociate_records`: Manage a validated lookup or collection reference.
  - `execute_record_batch`: Run independent native change sets in bounded chunks.
  - `execute_record_transaction`: Run one native atomic change set.

- **Web Resources**:
  - `search_web_resources_by_name`: Find resources by name; source content is opt-in.
  - `create_web_resource_and_publish`: Create with a read-only preview and optional publication.
  - `update_web_resource_and_publish`: Update by GUID with optional ETag concurrency protection.
  - `publish_web_resource`: Publish an already saved resource without uploading again.

- **Plugin Steps**:
  - `d365_plugin_registration_metadata`: Discover registered types, messages and message filters.
  - `d365_plugin_steps_query`: Query steps; Secure Configuration is excluded by default.
  - `d365_plugin_step_register`: Register a step for an existing plugin type, with duplicate detection.
  - `d365_plugin_step_update`: Change a step and keep/set/clear its configuration, with concurrency checks and phase evidence.
  - `d365_plugin_images_query` / `d365_plugin_image_register` / `d365_plugin_image_update` / `d365_plugin_image_delete`: Manage native Pre/Post images with explicit fields and preview checks.
  - `d365_plugin_assemblies_query`: List assembly metadata without content or credentials.
  - `d365_plugin_assembly_inspect`: Inspect actual local DLL metadata using the optional .NET reader.
  - `d365_plugin_assembly_update`: Preview and update a compatible existing assembly, then verify binary/identity/type readback.

- **Read-only Diagnostics, Security and Audit**:
  - `get_diagnostic_settings`: Inspect current organization/table logging and audit switches.
  - `query_plugin_trace_logs` / `query_failed_system_jobs`: Read bounded execution evidence.
  - `diagnose_plugin_failure`: Link traces, jobs and current step metadata without inventing a root cause.
  - `query_security_principals` / `get_principal_security_context`: Read visible users, teams and roles.
  - `get_record_access`: Read native effective record rights.
  - `get_record_audit_history` / `get_audit_details`: Read native audit history/details with values withheld by default.

- **Data Model Development (steps 6.1–6.7)**:
  - `get_model_definition`: Read a full table/basic column definition and preview fingerprint.
  - `create_model_table` / `create_model_column`: Create native schema with solution/publisher checks; preview by default.
  - `update_model_labels`: Merge localized labels while preserving the complete retrieved definition.
  - `publish_model_table`: Publish one entire table separately from saving.
  - `get_model_relationship` / `create_model_relationship`: Inspect and create native 1:N/Lookup or N:N relationships.
  - `get_model_key` / `create_model_key`: Inspect and create alternate-key definitions with explicit asynchronous index state.
  - `update_model_column_settings` / `update_model_relationship`: Maintain reviewed existing column settings and relationship menus/cascades with full-definition PUT.
  - `reactivate_model_key`: Submit a new index job for a Failed alternate key, keeping Action acceptance separate from index readiness.
  - `get_model_choices` / `create_model_choices`: Inspect local/global choices and create global Picklist choices.
  - `change_model_choice_value` / `publish_model_choices`: Insert/update choice labels with native actions; publish a global choice separately.
  - `list_model_ui_components` / `get_model_ui_component`: Inspect native saved/unpublished form and view definitions.
  - `edit_model_form` / `edit_model_view`: Apply bounded structural field/library/event and view-column/order edits with guarded save/readback.

- **Advanced Query & Extensions**:
  - `get_environment_capabilities`: Inspect identity, server version and feature table definitions in the configured environment.
  - `query_by_fetchxml`: Execute complex FetchXML with explicit state rules, native paging and resumable bounded results.
  - `preview_fetchxml_query`: Preview FetchXML query results for debugging.
  - `get_api_operation`: Discover current native Action/Function signatures, binding and declared input types.
  - `call_d365_api_action`: Invoke a metadata-validated Action/Function with entity/collection binding and encoded parameter aliases.
  - `get_current_user_context`: Retrieve context for the currently connected user and organization.

- **Debug Tools**:
  - **Premium GUI Debugger**: Built-in modern Web interface for testing tool calls with dynamic form generation.

- **Solution components (step 7.2)**:
  - `list_solutions` / `list_solution_components`: Inspect solution identity and visible membership/root scope.
  - `get_solution_component_dependencies`: Read native required, dependent or deletion-blocking dependency records.
  - `add_solution_component`: Preview/add an existing component to an unmanaged solution, then verify membership.

- **Solution transfer (step 7.3, initial scope)**:
  - `inspect_solution_package`: Inspect a bounded local ZIP without CRM configuration or extraction.
  - `export_solution`: Preview/export an unmanaged source as a managed or unmanaged ZIP to a new local file.
  - `import_solution_async`: Preview/submit a first ordinary unmanaged import with a tracking receipt.
  - `get_solution_import_status`: Read independent native job states and solution identity once.

- **Solution comparison and verification (step 7.4, initial scope)**:
  - `get_solution_snapshot`: Capture visible membership and selected portable component properties.
  - `compare_solution_snapshots`: Compare two snapshot objects locally without CRM configuration.
  - `verify_solution_deployment`: Check a live target against a snapshot with optional independent job/log observations.
  - `get_solution_import_log`: Read native solution import result summaries; error text is opt-in.

- **Classic Ribbon buttons (step 7.5, initial scope)**:
  - `get_ribbon_definition`: Read effective entity buttons, command/rule references and insertion locations.
  - `inspect_ribbon_solution`: Inspect one table's RibbonDiffXml in a local solution ZIP.
  - `edit_ribbon_solution`: Preview/edit custom buttons and save a new local ZIP with preservation checks.

- **Controlled classic Ribbon deployment (step 7.6, initial scope)**:
  - `import_ribbon_solution`: Review/replay a local candidate against a fresh existing-solution export, then submit one async import.
  - `publish_ribbon_solution`: Separately review/publish the whole table after verified import completion, retaining acceptance/readback evidence.
  - `verify_ribbon_deployment`: Read changed definitions without reimporting or republishing.

## 🚀 Quick Start

### 1. Install Dependencies

> [!IMPORTANT]
> **Node.js 18 or higher is required**. This project uses modern ESM syntax and the MCP SDK; older versions are not supported.

Assembly DLL inspection/update additionally requires **.NET 10 Runtime** on the
MCP server host. Other tools, metadata-only assembly listing and startup/discovery
still run with Node alone. A fixed metadata reader is included in the npm package;
it never executes the inspected DLL. Set `D365_DOTNET_PATH` to the dotnet executable
if it is absent from PATH. Building that reader or running `npm pack` /
`npm run build:release` from source requires .NET 10 SDK. `npm run build` rebuilds
the Node bundle using the included reader. The full test suite requires .NET 10
Runtime and uses precompiled fixtures; no target CRM connection is needed.

```bash
node -v # Check version (>= 18)
npm install
```

### 2. Environment Configuration

For standard use, you **do not need to create a `.env` file**. These parameters are typically configured directly in your MCP client (e.g., Cursor, Claude Desktop) settings. 

The server supports three authentication methods depending on your deployment:

#### Option A: Dynamics 365 Online (Default)
- `TENANT_ID`: Your Azure AD Tenant ID.
- `CLIENT_ID`: Your Application (Client) ID.
- `CLIENT_SECRET`: Your Client Secret.
- `ENVIRONMENT_URL` or `ORG_URL`: `https://your-org.crm.dynamics.com`

#### Option B: On-Premises AD (NTLM)
- `AUTH_TYPE`: `op_ad`
- `ORG_URL`: Your internal Dynamics 365 URL (e.g., `http://crm.local/org`)
- `AD_DOMAIN`: Active Directory domain
- `AD_USERNAME`: AD Username
- `AD_PASSWORD`: AD Password

#### Option C: On-Premises IFD (ADFS)
- `AUTH_TYPE`: `op_ifd`
- `ORG_URL`: Your externally facing IFD URL (e.g., `https://org.domain.com`)
- `IFD_ADFS_URL`: Your ADFS Server URL (e.g., `https://adfs.domain.com`)
- `IFD_CLIENT_ID`: ADFS OAuth Application Client ID
- `IFD_USERNAME`: IFD Username
- `IFD_PASSWORD`: IFD Password

**Common Variables:**
- `API_VERSION`: Dataverse API version (default: `v9.2`).
- `CACHE_TTL`: Cache duration in seconds (optional).

*(Note: Create a `.env` file in the root directory only if you are performing local development tasks like `npm run dev` or `npm run debug`.)*

The MCP server can start and list its tools before CRM settings are supplied. CRM services
are created on the first CRM tool call; incomplete or invalid settings return an MCP tool
error with code `D365_CONFIG_INVALID` and the names of the settings to fix. Reading the
tool list and clearing the local cache do not require a CRM connection. After changing
environment variables in your MCP client configuration, restart the server to apply them.

`AUTH_TYPE` accepts `online`, `op_ad`, or `op_ifd`. `API_VERSION` must use a value such as
`v9.1` or `v9.2`. If both `ORG_URL` and `ENVIRONMENT_URL` are supplied for Online, they must
identify the same organization. `CACHE_TTL` is a non-negative integer in seconds (default
7200); `CACHE_TTL_SECONDS` is accepted as an alias, with `CACHE_TTL` taking precedence.
IFD currently supports the `password` grant configured above.

Requests default to a 30-second timeout (`REQUEST_TIMEOUT_MS`, range 1–300000).
GET requests may retry transient failures up to twice (`MAX_READ_RETRIES`, range 0–5).
HTTP 401 on a GET permits one token refresh; HTTP 403 does not refresh. Writes are
never automatically repeated by the application retry policy, including on HTTP 401,
throttling or timeout (NTLM authentication negotiation remains handled by its client). If a write
times out or returns a server error, the error reports `outcome: "unknown"` so the
caller can check whether it took effect before trying again.

Retry delays honor `Retry-After` seconds or HTTP dates. A delay above
`MAX_RETRY_DELAY_MS` (default 30000, range 0–300000) is returned to the caller instead
of retrying earlier than requested. Without a valid header, read retries use 250 ms
and 500 ms backoff. These limits apply per HTTP request/attempt, not to an entire
multi-step business task. Token acquisition is not automatically retried.

CRM tool errors may include `code`, HTTP `status`, `platformCode`, `requestId`,
`attempts`, `retryAfterMs`, `retryable` and `outcome`. Configured secrets and current
Bearer tokens are redacted; raw Axios errors, request bodies and credentials are not
serialized. Token caches are separated by organization, authority and identity,
including credential changes; simultaneous refreshes within one client share a fetch.

Existing services continue to receive data through `makeRequest`. New services can
use `requestWithResponse` for HTTP status, ETag and created-record headers, and pass
headers or an `AbortSignal`. Requests and continuation URLs must remain within the
configured organization API; redirects are surfaced as errors.

`get_environment_capabilities` uses the native `WhoAmI`, `RetrieveVersion` and
`EntityDefinitions` endpoints. It reports the configured API version separately from
the server build version, and table presence separately from permissions or write
support. Incomplete metadata produces `unknown` rather than an unsupported verdict;
authentication/authorization errors stay errors. It does not change the connection,
probe alternative API versions or claim an SDK adapter is installed. Online, NTLM and
IFD use the same inspection logic with their configured authentication.

Native operation references: [RetrieveVersion](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/retrieveversion?view=dataverse-latest)
and [Web API service documents](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/web-api-service-documents).

### Query state, ordering and paging

`search_records_by_odata` and `query_by_fetchxml` retain their names and return records
in `value`. They now also return `query` (the effective filtering and ordering) and
`paging` (completeness, limits and a continuation token). Query preparation reads
table metadata, so the connection needs metadata read access as well as data access.

| Option | Default | Meaning |
|---|---|---|
| `state_mode` | `legacy` | `legacy` adds statecode=0 only when defined and no explicit root state condition exists; `all` adds no state condition; `values` uses validated `state_values` |
| `state_values` | none | One or more numeric state values; requires `state_mode=values` |
| `fetch_all` | `false` | Follow multiple server pages within the call limits |
| `page_size` | 500 | Requested page size, range 1–5000; an existing FetchXML count takes precedence unless the same value is supplied |
| `max_records` | 5000 | Hard cap on rows returned per call, range 1–50000 |
| `max_pages` | 10 | Server-page budget per call with fetch_all=true, range 1–100 |
| `formatted_values` | false | Include server-provided display labels and formatted values |
| `continuation` | none | Resume the saved query and buffered rows; do not repeat filter/XML/top/page-size arguments |

`statecode=0` is a legacy numeric rule, not a universal business definition of
"Active". For example, states on a case or opportunity have their own meanings.
Tables without statecode, or without a defined zero state, skip the legacy default
and report the reason in `query.state.disposition`. Explicit values on an unsupported
table are errors. `all` does not remove state conditions already in your own query.
Quoted text and child-entity conditions no longer suppress the root default; ambiguous
OData lambda scope is preserved without adding a condition, and reported explicitly.

Default queries now request a page of 500 rows instead of relying on the CRM default
page size. Use `fetch_all:true` to read several pages. OData adds a primary-key sorting
tie-breaker where metadata provides one and supports optional `orderby` and `expand`.
Expanded child collections are not separately traversed. Formatted annotation values
on individual records remain unchanged.

OData `top` is a native query limit (1–5000), separate from `max_records`, and cannot
be combined with `page_size`. FetchXML `top` similarly cannot be combined with
count/page/paging-cookie/page_size. Completing a top-limited query means completing
that query; it does not prove there are no additional records outside its top limit.

FetchXML uses a strict XML parser for filters and cookie encoding. Regular queries
add a primary-key order where available. Distinct/aggregate queries retain their
columns; automatic paging requires an explicit root order. If a single unordered
distinct/aggregate page reports more records, the result is incomplete and requires
the caller to restart with an appropriate order. Queries without a server paging
cookie use simple paging, which stops at the native 50000-row boundary and reports
incompleteness. The server may impose smaller page sizes or other query limits.

`paging.hasMore` and `paging.truncated` indicate that this call did not return the
remaining query result; `paging.complete` indicates completion of the query from its
starting position. `stoppedBecause` explains a limit or ordering restriction. A cap
inside a page buffers the unreturned rows instead of skipping them. Always use
`paging.continuation` to resume; a native `@odata.nextLink` is only retained when no
buffered rows would be lost.

Example: query all states, with bounded automatic paging:

```json
{
  "collection_name": "accounts",
  "state_mode": "all",
  "orderby": "name asc",
  "fetch_all": true,
  "max_records": 2000
}
```

Resume OData with the same collection and only the returned token plus optional
fetch_all/max_records/max_pages settings:

```json
{"collection_name":"accounts","continuation":"<returned-token>","fetch_all":true}
```

Resume `query_by_fetchxml` without resending XML:

```json
{"continuation":"<returned-token>","fetch_all":true}
```

Tokens expire after five minutes, are consumed only by a successful call, and cannot
be used by another server connection or query tool. One connection retains at most
32 saved continuations; creating more may evict the oldest idle token. A restart or
`clear_server_cache` invalidates them. A failed read leaves its input token available
for retry; simultaneous consumption is rejected. The page size and query itself stay
fixed during continuation. Results are not a database snapshot, so CRM changes
between requests can still change later pages.

`preview_fetchxml_query` shares the same preparation/execution path and preserves
`isSuccess`, `sampleData` and `errorMessage`; it adds effective-query and paging
information. A preview remains a sample, not a full query result.

Native paging references: [FetchXML paging and cookie format](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/fetchxml/page-results?tabs=webapi)
and [OData paging](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/query/page-results).

### Web Resource migration (step 4.1)

The server now exposes 55 tools. The three Web Resource tool names from
`@local/d365-meta-mcp@0.1.0` are migrated. Their legacy camelCase parameters work;
snake_case is preferred for new calls. Different values supplied through both forms
are rejected. The result retains the old `{operation, version, fromCache, data}`
envelope; `version` is the configured API version, not a detected server version.
Plugin step and general record write migrations are described below.

| Preferred parameter | Compatibility alias | Meaning |
|---|---|---|
| `name_keyword` | `nameKeyword` | Required name substring for search |
| `include_content` | `includeContent` | Search includes Base64 source only if true; default false |
| `include_unpublished` | `includeUnpublished` | Search latest saved definitions, including unpublished resources; default false |
| `file_path` | `filePath` | Absolute source-file path on the machine running this MCP server |
| `display_name` | `displayName` | Required on create; optional on update |
| `web_resource_type` | `webResourceType` | Required on create, integer 1–12; actual type availability depends on the platform |
| `content_encoding` | `contentEncoding` | Inline `content` encoding: `utf8` (default) or canonical `base64` |
| `solution_unique_name` | `solutionUniqueName` | Optional solution association on create |
| `if_match` | `ifMatch` | Specific ETag for update, for example `W/"123"` |
| `dry_run` | `dryRun` | Read-only preview, default false |

Supply exactly one source: `file_path` or inline `content`. Files are read as bytes;
empty content is allowed. The local upload limit is 10 MiB before Base64 encoding;
the target CRM may impose a lower limit. `content_encoding` applies only to inline
content. Unknown fields and invalid types are rejected before accessing CRM.

Search defaults to published definitions, has a default `top` of 50 (range 1–100), and
preserves the server OData result under `data`. It is a bounded search, not an
automatic inventory of all resources. Set `include_unpublished:true` to find a new
resource saved without publication or inspect its latest saved definition.
Duplicate detection on create uses native
`RetrieveUnpublishedMultiple`, including saved definitions awaiting publication.
This preflight is not a uniqueness lock; the platform decides concurrent creates.

`publish` defaults to true on create/update, preserving old save-and-publish behavior.
Set `publish:false` to save only. Creates use POST, never overwrite an existing saved
name, and accept either a returned entity or `OData-EntityId`. Updates use
`If-Match:*` to prohibit creating a missing resource; a specific `if_match` protects
against changes since an earlier read. HTTP 412 remains an error and does not publish.
Without a specific ETag, existing data can be overwritten. Updating does not rename
the resource or change its type.

Preview creation checks saved names and displays the environment and proposed
metadata. Update preview uses native `RetrieveUnpublished` to compare the latest
saved definition, and returns an ETag if supplied by the server. Content is shown
as byte counts and SHA-256 hashes. A preview does not lock the resource or validate
write privileges. Pass its ETag in a later update to request concurrency protection.
Native operation failures, including authorization failures, are returned directly;
there is no silent fallback to older published definitions or another API version.

For example, preview an update using inline JavaScript:

```json
{"id":"aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee","content":"console.log('hello');","dry_run":true}
```

Then save using the ETag from that preview:

```json
{"id":"aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee","content":"console.log('hello');","if_match":"W/\"123\"","publish":false}
```

Publish the saved definition with `publish_web_resource`:

```json
{"id":"aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee"}
```

Publication calls native `PublishXml` scoped to that GUID. If save succeeds but
publication fails, the MCP call returns `isError:true` with
`code:D365_WEBRESOURCE_PUBLISH_FAILED` and `data.saved:true`, `data.webresourceid`,
and `data.publication.status`. A timeout/server error can produce
`data.published:null` and publication status `unknown`. Inspect the resource and
retry **publication only** with its ID. The save is never automatically replayed
or rolled back. `publish_web_resource` reports `saved:false` because that call does
not save content. Publication applies to the latest saved version at execution time;
it is not an atomic extension of the preceding save and cannot be conditional on
that save's ETag.

If a successful create returns neither a valid entity ID nor a trusted ID header,
`D365_WEBRESOURCE_CREATE_ID_MISSING` retains `data.saved:true` and the name, without
attempting publication. Find the saved resource before retrying; do not blindly
create it again. Use `search_web_resources_by_name` with `include_unpublished:true`
to find the newly saved resource, which may not appear in published-definition searches.

All operations use the existing shared Online / NTLM / IFD request client. Local
tests verify routing and error behavior; actual authentication, platform versions,
managed component restrictions and privileges require each target environment.
No real CRM was used for step 4.1 validation.

Native references: [Web Resource table](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/webresource?view=dataverse-latest),
[PublishXml](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/publishxml?view=dataverse-latest),
[RetrieveUnpublished](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/retrieveunpublished?view=dataverse-latest),
[RetrieveUnpublishedMultiple](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/retrieveunpublishedmultiple?view=dataverse-latest),
and [created entity/ID responses](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/create-entity-web-api).

### Plugin step migration (step 4.2)

The four legacy `d365_plugin_*` tool names are now registered. Use snake_case for
new calls; the old camelCase names remain accepted, including within `plugin_type`
and `patch`. Conflicting aliases and unknown keys are errors. Result envelopes
retain the old `success`, `pluginTypes/messages/messageFilters`, `items/count`,
and `item` fields, with additional preview, paging and write-phase evidence.
This scope manages steps for **already registered plugin types**. Step Images are
covered by step 6.5 below; compatible assembly updates are covered by step 6.6.
Creating assemblies, solution component management and the rest of the
implementation plan are separate work.

`d365_plugin_registration_metadata` accepts exact `plugin_type_name`,
`assembly_name`, `message` and `primary_entity` filters. It reads native
`plugintypes`, `sdkmessages` and `sdkmessagefilters`. Listings are bounded to
100 types, 100 messages and 500 filters and report whether a bound was reached.
Metadata discovery does not prove registration privileges or platform support for
every stage/deployment combination.

`d365_plugin_steps_query` accepts those exact filters plus `step_id`, `stage`,
`mode`, `enabled`, `top` (default 50, range 1–500),
`include_unsecure_configuration` (default true) and
`include_secure_configuration` (**default false**). All supplied filters are
combined, including filters supplied alongside `step_id`; the old package gave
the ID precedence. The query is bounded and `paging.atLimit` does not claim that
all matching registrations were returned. Native pages are followed for up to
10 requests within the configured organization; external/cyclic links are errors.

The old package read Secure Configuration plaintext by default. This default is
deliberately changed. Normal discovery, duplicate detection, mutation reads and
write readback never select/expand `secureconfig`. A query returns its ID/presence
and `included:false`, `value:null`; only an explicit
`include_secure_configuration:true` query requests plaintext. It may require
additional CRM privileges. Write/preview results never echo either configuration
value, and error messages withhold platform text that could echo submitted content.
Structured numeric request evidence is retained; valid GUID request IDs and hex
platform codes are retained after redaction. Arbitrary textual evidence is withheld.

To preview a registration:

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

Stage accepts `10/PreValidation`, `20/PreOperation`, `40/PostOperation` and mode
accepts `0/Synchronous`, `1/Asynchronous`. Async requires stage 40. Rank is a
positive 32-bit integer. Optional `supported_deployment` accepts
`0/ServerOnly`, `1/OfflineOnly`, `2/Both`; the target platform decides whether a
deployment is actually available. Filtering attributes are only accepted for an
entity-specific Update, lowercased/deduplicated and checked against native field
metadata. Primary keys and unknown fields are rejected. Private/inactive messages
and workflow activity types are rejected for registration. `plugin_type.id` can
replace a name; additional supplied class/assembly names must also match.

Duplicate signature is plugin type + SDK message + message filter (or global) +
stage + mode. `conflict_policy` defaults to `error`; `return_existing` makes no
changes, and `update_existing` modifies the unique matched step. Multiple matches
remain an error. `update_existing` preserves omitted optional fields and both
configurations. Duplicate detection is a preflight check, not a platform uniqueness
constraint; concurrent creates may still produce duplicates.

To preview an update:

```json
{
  "step_id":"aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
  "patch":{"rank":2,"enabled":true},
  "unsecure_configuration":{"action":"keep"},
  "secure_configuration":{"action":"clear"},
  "dry_run":true
}
```

`patch` supports name, description, stage, mode, rank, supported_deployment,
filtering_attributes, enabled and impersonating_user_id. `null` impersonation
restores calling-user context. Each configuration supports `keep` (default), `set`
with a string `value` (including an empty string), and `clear` without a value.
Keep-only calls do not send a write. Changing stage/mode also checks for an existing
equivalent step. Previews expose the resolved environment/target and field changes;
configuration changes show the action only, without plaintext, length or hashes.

Updates first read `EntityDefinitions.IsOptimisticConcurrencyEnabled` for the step
table. If confirmed true, a specific `if_match` or the freshly read ETag is used;
a stale supplied ETag fails before allocating configuration, and a server HTTP 412
is never replayed. If support cannot be confirmed, normal writes stop with
`D365_PLUGIN_CONCURRENCY_UNSUPPORTED`. An explicit
`allow_unprotected_update:true` permits a fallback using `If-Match:*`; its result
reports `concurrencyProtected:false`. This prevents upsert but does **not** prevent
overwriting concurrent changes. A supplied specific ETag is never silently replaced
by a wildcard. Dry-run previews remain available and expose `canWrite`/`blockedBy`.
Even `canWrite:true` only means local preflight passed, not that all platform rules
and privileges were verified. Use the preview ETag explicitly in the later call
to protect against changes made since that preview.

Secure `set` allocates a **new configuration row**, then binds that row in the same
step PATCH that contains the field/unsecure changes. It does not mutate a potentially
shared old secure row. `clear` unbinds the secure row in that PATCH and clears unsecure
content in the step when requested. Secure clear does **not erase the old row**.
Old rows are retained and reported under `retainedSecureConfigIds`; check all
references and privileges before any manual deletion. No automatic cleanup/delete
occurs, including after a rejected or unknown binding attempt.

Creates submit generated GUIDs for both the step and any new secure row. Successful
body/header IDs are checked against them; empty successful responses use the submitted
ID. These IDs also allow reconciliation after a timeout. The secure-row allocation
and step write are separate native operations, not a transaction. On failure, the
MCP call returns `isError:true`, `D365_PLUGIN_WRITE_FAILED`, and `data` containing:

- `phase`: `secure_configuration_create`, `step_write` or `readback`.
- `stepId` and `saved`: false, true or `"unknown"` for the step write.
- `secureConfiguration`: action, ID, created status and binding state.
- `previousSecureConfigId`, retained IDs and `reconciliationRequired:true`.

`created` can be false/true/`"unknown"`. Binding states distinguish unchanged,
not_applied, unknown, write_succeeded (HTTP success), verified (readback match) and
not_confirmed (readback mismatch). Readback failures preserve a confirmed `saved:true`;
they do not trigger a rollback or another write. Inspect these native IDs before
retrying. Step-field concurrency is distinct from concurrent registration uniqueness
and from permissions on a separately created configuration row.

All three configured auth modes use the same native request path. Offline tests
exercise Online, NTLM and IFD through that path with mocked network transports;
real authentication, table concurrency capabilities, permissions and plugin execution
remain unverified until each target CRM is supplied.

Native references: [Register a plug-in](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/register-plug-in),
[step table](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/sdkmessageprocessingstep?view=dataverse-latest),
[secure configuration table](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/sdkmessageprocessingstepsecureconfig?view=dataverse-latest),
[conditional operations](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/perform-conditional-operations-using-web-api),
[association/disassociation](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/associate-disassociate-entities-using-web-api)
and [client-assigned create IDs](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/create-entity-web-api#setting-the-primary-key-value).

### General record writes, keys, associations and batches (step 4.3)

The original create/update/delete tool names and required snake_case inputs remain.
`collectionName`, `ifMatch`, `dryRun`, `allowUnprotectedWrite`, `alternateKey`,
`navigationProperty`, `relatedCollectionName`, `relatedId`, `chunkSize` and
`continueOnError` are accepted aliases where applicable. Different alias values and
unknown arguments are rejected. `get_record_by_id` also accepts `collectionName`,
validates GUIDs and restricts `select` to a comma-separated list of attribute names;
it retains its raw record result. Query state/paging contracts are unchanged.

Write calls now return a structured result rather than the previous raw body/null:
`success`, `operation`, `collectionName`, `id`, `saved`, `deleted`, HTTP `status`,
`etag`, and `concurrencyProtected`. Create/Upsert additionally return `created`,
`identityResolved` and optional `record` data. A create accepts an entity primary ID,
trusted same-organization `OData-EntityId`, or a primary key explicitly submitted in
the request. If none is returned, a confirmed save retains `saved:true`, `id:null`,
`identityResolved:false`, `identityIssue:D365_RECORD_ID_NOT_RETURNED`; do not repeat
the create just to obtain an ID. Conflicting/untrusted IDs preserve save evidence
but return an error. Invalid successful response bodies are treated as an unknown
outcome. `record` data and previews mask fields whose names contain password,
secret, token, secureconfig, configuration or content; this heuristic is not field
security and does not replace CRM authorization.

Native table metadata verifies each EntitySetName and primary key. Reported
non-standard TableType values (including Elastic/Virtual) are rejected; old CE
metadata that omits TableType continues through the native API, whose actual
operation support still requires validation. No new-version-only property is
selected unconditionally from older metadata. Metadata lookup follows at most
10 native pages and rejects incomplete, cyclic or external continuations.

For update/delete, the service reads the record and table concurrency capability.
When `IsOptimisticConcurrencyEnabled=true`, it uses the supplied specific `if_match`
or the freshly read ETag. A stale ETag or missing record stops the write. When
support is not confirmed, writes stop unless `allow_unprotected_write:true` was
explicit; that fallback uses `If-Match:*`, which prohibits accidental upsert but
does not prevent concurrent overwrites. A supplied ETag is never downgraded.
Existing callers may therefore need to handle metadata/read privileges or the
explicit fallback. Application writes are never automatically repeated.

`dry_run:true` shows the environment, target and attribute changes with
`beforeKnown`, `before` and `after`, plus `canWrite`/`blockedBy` and the selected
condition headers. Unread navigation data is not represented as a known old value.
Delete preview identifies the target without returning all business data. Previews
do not lock records or perform every platform business/permission check. To guard
against changes since preview, explicitly pass its ETag on the later write.

```json
{"collection_name":"accounts","id":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","data":{"name":"Updated"},"dry_run":true}
```

`upsert_record_by_key` requires exactly the columns of one active native alternate
key. It reads Keys and attribute metadata; pending/failed/undeclared keys are errors.
Composite keys and string, Integer/Picklist, Decimal, Lookup and UTC DateTime
attributes are supported. Lookup keys use their native `_attribute_value` property.
Strings escape apostrophes and encode path literals, while reserved URL characters,
empty/null keys and control characters are rejected. Use decimal strings for exact
large values; unsafe large numbers and exponent literals are rejected. DateTime
values require a valid UTC calendar timestamp. These are supported input subsets,
not a promise to encode every possible native key type.

```json
{"collection_name":"accounts","alternate_key":{"accountnumber":"A-001"},"data":{"name":"Customer"},"mode":"upsert"}
```

Modes are `upsert` (default), `create_only` and `update_only`. All use native PATCH
to the key URL. Default Upsert reads the target: a missing row uses
`If-None-Match:*` for conditional creation, and an existing row uses the update
concurrency policy. Thus a concurrent create/change yields an error instead of
silently overwriting it. A specific ETag requires an existing row. There is no
automatic retry, POST fallback or backend switch. The body cannot change primary
or alternate key values; identical repeated key values are removed. When a lookup
is part of the key, perform relationship bindings separately. Read and metadata
privileges are needed for this guarded behavior. Conditional create/update also
lets the result identify the branch when a legacy server returns only HTTP 204.

`associate_records` and `disassociate_records` require collection_name, id,
navigation_property, related_collection_name and related_id. Native ManyToOne,
OneToMany and ManyToMany metadata must resolve the property uniquely to the related
table. Single-valued association uses conditional lookup PATCH. Single disassociation
expands the specific navigation target and checks the supplied ID, including its
target type for polymorphic lookups, before setting it to null. No related record
is deleted. Collection membership uses native POST/DELETE `$ref`; since a parent
ETag cannot guarantee membership concurrency, it requires
`allow_unprotected_write:true` and reports `concurrencyProtected:false`. Supplying
an ETag does not silently enable that fallback.

```json
{"collection_name":"accounts","id":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","navigation_property":"primarycontactid","related_collection_name":"contacts","related_id":"bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb","dry_run":true}
```

`execute_record_batch` and `execute_record_transaction` accept 1–100 operations
from create/update/delete/upsert/associate/disassociate, each with an `arguments`
object using the corresponding tool fields. The aggregate operation JSON and each
native wire chunk must be at most 10 MiB. Arbitrary HTTP operations, nested batches,
Content-ID `$1` dependencies and external record references are rejected. All local
validation, metadata/read preflight and chunk serialization finish before any
batch write. Preflight reads are outside a transaction and are not a database
snapshot; repeated targets may conflict, so consolidate changes to the same row.
Native business validation remains on the server.

```json
{
  "operations":[
    {"operation":"create","arguments":{"collection_name":"accounts","data":{"name":"New"}}},
    {"operation":"update","arguments":{"collection_name":"accounts","id":"aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa","data":{"name":"Updated"}}}
  ],
  "dry_run":true
}
```

An ordinary batch uses native `$batch`, one independent change set per operation,
and `chunk_size` (default 25, range 1–100). Earlier operations remain committed if a
later one fails. `continue_on_error:true` requests the native continue preference
and permits future chunks after known rejection. Unknown results always stop
future chunks; missing continued responses are not assumed unexecuted.

A transaction uses **one native change set**, never chunking or falling back to
individual writes. It reports `committed:true` only after a complete, correctly
grouped success response; confirmed native rejection reports false. Timeout,
5xx/408 or malformed/ambiguous responses report `committed:null` and require
reconciliation. These are platform database transaction semantics, not a promise
to undo external side effects triggered by business logic. A committed transaction
can still return a local identity issue; it is not mislabeled as rolled back.

Results include per-item `index`, `operation`, `status`, HTTP status/evidence where
available, plus `chunksSent`, summary counts and `cancelled`. Item statuses are
`succeeded`, `succeeded_with_issue`, `failed`, `unknown`, `not_sent`,
`not_executed`, or `not_committed`. The last means the group did not commit; it
does not invent which unlabelled operation ran before rejection. A partial or
unknown result is an MCP tool error with `D365_BATCH_NOT_COMPLETE` and the complete
report under `data`. Native message bodies that might echo business values are
withheld. Successful response identity issues retain confirmed save evidence.

MCP request cancellation is passed into preflight and transport. Cancellation
between chunks leaves prior outcomes intact and sends no later chunks; an in-flight
write can be unknown. Clients that supply a progressToken receive bounded progress
notifications between chunks and at final classification. Completion progress
does not mean every operation succeeded. No cancellation/retry path replays a write
or rolls back previously committed ordinary chunks.

Offline tests cover all three configured auth modes through the real request layer
with mocked transports, including multipart wire text, conditional headers and
response correlation. No actual CRM data was read or modified. Real target versions,
permissions, key/relationship metadata, concurrency and Change Set behavior still
need environment validation.

Native references: [create/ID responses](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/create-entity-web-api),
[conditional writes](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/perform-conditional-operations-using-web-api),
[alternate key addressing](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/use-alternate-key-reference-record),
[native Upsert](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/use-upsert-insert-update-record),
[relationships](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/associate-disassociate-entities-using-web-api)
and [batch/Change Sets](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/execute-batch-operations-using-web-api).

### Read-only diagnostic, security and audit evidence (step 5)

Nine new tools use GET requests only. They do not enable logging/auditing, retry or
cancel system jobs, change permissions, or modify records. Their arguments accept
snake_case and documented camelCase aliases; conflicts and unknown fields are
rejected. MCP cancellation signals reach these reads and the step queries used by
diagnostics. Current organization settings and current step definitions are kept
separate from historical execution evidence.

`get_diagnostic_settings` reads WhoAmI and the organization PluginTraceLogSetting
(0 Off, 1 Exception, 2 All) and IsAuditEnabled. Optional `collection_name` adds the
table IsAuditEnabled managed property; per-field audit settings are not inspected.
Each source has a status: ok, forbidden, unavailable_or_hidden, invalid_response,
or failed. Missing metadata remains unknown. A current false setting is preserved
as false; it does not prove what the setting was during an earlier time window.
No empty-result path claims that logs were purged: `retentionAssessment` remains
unknown because that requires separate positive evidence.

`query_plugin_trace_logs` filters native rows by optional `correlation_id`, `step_id`,
exact `plugin_type_name`, and `from_time`/`to_time`. Timestamps require an explicit
timezone and are normalized to UTC; default to_time is now and from_time is 24 hours
earlier. `exceptions_only:true` restricts rows to nonempty native exceptiondetails.
Default `top` is 50 (1–100) and `max_pages` is 5 (1–20). Native continuation links
remain inside the organization; cycles, invalid pages and exceeded budgets are not
silently treated as complete. A full top-sized result is a bounded query, not a
complete inventory. These diagnostic lists do not expose a resumable query token;
adjust the time window/filters for a narrower investigation.

Trace configuration, secureconfiguration and profile columns are **never selected**
by these tools. Messageblock/exceptiondetails are also excluded unless
`include_text:true`. Included text is redacted for common credential patterns and
limited by `max_text_chars` (default 2000, range 100–8000), with an explicit truncation
marker. Plugin-written text can still contain arbitrary business data/secrets that
pattern matching cannot identify; opt-in text is not guaranteed anonymized.

`query_failed_system_jobs` queries native Failed status 31 and uses **completedon**
for its time window, so a long-running job created earlier can still be found.
Correlation and owning-step filters are optional. Job data/dependency payloads are
not selected; native message/friendlymessage fields are opt-in like trace text.
An empty visible list is not proof that no failure occurred.

```json
{"correlation_id":"44444444-4444-4444-4444-444444444444","from_time":"2026-10-26T08:00:00+08:00","to_time":"2026-10-26T18:00:00+08:00"}
```

`diagnose_plugin_failure` requires at least correlation_id, step_id or
plugin_type_name. It combines exception-filtered traces, failed jobs, current step
metadata and current switches. Native PluginStepId/OwningExtensionId provide links;
a shared correlation or class name is not turned into a causal conclusion. Type
scoped job searches use IDs positively observed in matching traces/current steps;
a user-supplied ID alone does not establish its class. Capped or unavailable lookups
remain coverage gaps, and the tool does not widen into an unfiltered job search.
It reports observations, links, gaps, coverage and `rootCause.status:not_determined`.
This organizes evidence for investigation; it does not fabricate the business cause.

Normal component permission/unavailability failures are retained alongside other
readable sources. A 404 is unavailable_or_hidden, not a definitive unsupported
verdict. Authentication failures and cancellation remain errors. Standalone read
403 failures are MCP errors with D365_READ_FORBIDDEN; native platform message text
and arbitrary response data are withheld from error output. Current step reads
explicitly exclude secure and unsecure configuration.

`query_security_principals` reads bounded visible systemuser, team or role catalog
rows. Optional principal_id, name_keyword and business_unit_id filter them;
`enabled` applies only to systemuser and is never implicitly applied. No password,
credential or email fields are selected. `get_principal_security_context` defaults
to the current user, or takes a user/team ID. It reads direct roles and, for users,
visible team memberships/roles. `team_limit` defaults to 10 (1–25), `role_limit`
to 50 (1–100), and `include_team_roles` to true. Sources can be forbidden or limited
without becoming an empty list. Role IDs/business units are retained rather than
equating same-named role copies. These are catalog observations, not a reconstruction
of all hierarchy, sharing, inherited/group-team or field permissions.

`get_record_access` uses native bound RetrievePrincipalAccess. principal_type is
systemuser (default current user), team or organization; the latter two require an
ID. collection_name and record_id identify the target. The function returns native
record rights; None is distinct from a failed read. Unknown numeric bits are
retained. Results do not explain every source of those rights, evaluate field
security, or guarantee a later operation passes business rules.

```json
{"collection_name":"accounts","record_id":"99999999-9999-9999-9999-999999999999","principal_type":"systemuser"}
```

`get_record_audit_history` calls native RetrieveRecordChangeHistory with Target and
PagingInfo. `page_size` defaults to 20 (1–100), `page_number` to 1 (maximum 1000).
Later pages require the exact prior native paging_cookie for the same target/page
size. Cookies are passed as opaque JSON values, not parsed/re-encoded as XML. The
16 KiB cookie limit and native server URL limits still apply. MoreRecords is
preserved; absent, oversized or repeated cookies, or the page limit, return an
explicit continuation issue instead of an invented/unusable next page. Pages do
not form a database snapshot.

```json
{"collection_name":"accounts","record_id":"99999999-9999-9999-9999-999999999999","page_size":20}
```

By default audit output includes detail type and changed field names, with old/new
attribute values withheld. The native function can return those values to the
server process even when output inclusion is false. `include_values:true` projects
bounded old/new attribute values, masking sensitive field names heuristically;
this is not a full data-loss-prevention guarantee. Long values may be truncated.
Other audit-detail types are named with `detailFields:not_projected_for_this_detail_type`
instead of dumping or inventing unsupported data. Read results are capped at 5 MiB;
reduce page size/text inclusion if the projection is too large.

The Web API history function may omit AuditRecord entirely. Actor/time/audit ID
then remain null/unknown; they are not guessed from array order, time filters or
the current user. `get_audit_details` calls native bound RetrieveAuditDetails for
an audit_id and independently attempts audit-row metadata. These two reads can
require different privileges; unavailable summary metadata does not erase readable
detail evidence. Current organization/table switches are reported independently
of old history, and empty history is not labeled purged or never-audited.

Offline tests exercise all three auth modes through the shared request layer with
mocked transport. Real environments, log retention/settings, access privileges,
audit paging/type behavior and a reproducible actual fault still require validation.
Step 5 does not add permission modifications, logging changes, automatic root-cause
decisions, or a complete rendering of every audit-detail subtype.

Native references: [trace table](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/plugintracelog?view=dataverse-latest),
[system jobs](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/asyncoperation?view=dataverse-latest),
[trace switches](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/logging-tracing),
[effective record access](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/retrieveprincipalaccess?view=dataverse-latest),
[function record references](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/use-web-api-functions),
and [audit history/details](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/auditing/retrieve-audit-data).

### 3. Build

#### Build and Start
```bash
npm run build
npm start
```

Both `build` and `build:release` type-check the source and bundle the server and its
runtime dependencies into `dist/index.cjs`. `main`, `npm start`, the CLI and the MCP
configuration below all use this same entry point. To run the release build explicitly:
```bash
npm run build:release
```
The output file is located at `dist/index.cjs`. This is a **standalone bundle** that can run on any Node.js 18+ environment without requiring `node_modules`.

Use `npm run typecheck` to check types without emitting files. For development, use
`npm run dev` or `npm run watch`. Direct execution of `dist/index.js` is replaced by
`node dist/index.cjs`.

`npm pack` builds the release automatically and includes the bundle, CLI and README.
The CLI loads the server in the same Node process, so it does not need another `node`
executable on `PATH`.

After building, run `npm test` for configuration, initialization recovery and startup
regression checks, or `npm run test:smoke` for startup checks only. Startup checks use
temporary settings and block network requests; they do not contact CRM or validate
permissions in a real environment.

### 4. GUI Debugger

The project includes a high-end Web debugger that **automatically discovers** all MCP tools and generates interactive forms.

```bash
npm run debug
```
Then visit: `http://localhost:3000`

The debugger binds to `127.0.0.1` only. API requests require a loopback Host header;
cross-origin/browser cross-site requests are rejected, and writes require
`Content-Type: application/json`. JSON requests are limited to 16 MiB. Static file
paths are confined to the UI directory. Run the debugger only in your local session;
it has the same file access and CRM privileges as the MCP server process.

- **Dynamic Adaptation**: UI syncs automatically when new tools are added.
- **Glassmorphism Design**: Modern, premium dark theme experience.

## 🛠️ MCP Configuration

Add this server to your MCP client configuration. We recommend pointing directly to the built `dist/index.cjs`:

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
**Last Updated**: 2026-10-28

## Data model development — step 6.1

Five tools add a bounded first part of step 6. Steps 6.2–6.4 below add relationship,
alternate-key, choice and form/view operations plus additional column types. Broader
metadata maintenance and advanced layouts/queries remain future batches.
Steps 6.5/6.6 below add bounded native Plugin Image and assembly update workflows.
Existing record Upsert by an active alternate key remains
available; this batch does not create keys.

`get_model_definition` reads a table by `logical_name`, or a column by adding
`attribute_name`. Column reads/label updates now support `String`, `Memo`, `Integer`,
`Decimal`, `Money`, `DateTime`, `Boolean`, `Picklist` and `MultiSelectPicklist`, using
the complete derived metadata type with native OptionSet expansion where applicable. Reads use
`Consistency: Strong`; definitions above 2 MiB, native partial continuations and
identity mismatches are rejected. The result omits transport annotations and
read-only `UserLocalizedLabel`, preserves other retrieved properties, and includes
`definitionHash`. The fingerprint covers this normalized definition; it does not
prove publication state or provide a platform lock.

Every new write tool defaults to **preview** (`dry_run: true`) in the service.
Previews perform reads, return environment/target/native request and do not execute
platform write validation. `dry_run: false` executes. Snake case arguments and the
documented camel case equivalents are accepted; conflicting aliases and unknown
properties are rejected. Localized labels always use the following structure:

```json
[{"language_code":1033,"text":"Reference"},{"language_code":2052,"text":"参考编号"}]
```

Provide 1–50 unique language codes. Display labels are bounded to 100 characters,
descriptions to 2000; languages must be installed/valid in the target organization,
which remains a platform check. This interface merges supplied language labels and
does not expose label deletion.

Create an ordinary custom table with a primary text name column:

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

`create_model_table` supports UserOwned (default) or OrganizationOwned, with
IsActivity/HasActivities/HasNotes false. `primary_name` supports schema/display/
description/max_length, including their camel case aliases. The tool does not
expose activity-table creation, arbitrary metadata or ownership conversion.

Create a column on an existing table using `create_model_column`:

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

Supported types and settings:

| Type | Settings |
| --- | --- |
| String | Text format; max_length 1–4000, default 1000 (primary name default 100) |
| Memo | TextArea format; max_length 1–1048576, default 1000 |
| Integer | min_value/max_value integers within ±2147483647; defaults 0/1000000 |
| Decimal | finite min_value/max_value within ±100000000000; defaults 0/1000000; precision 0–10, default 2 |
| Money | tool bounds ±100000000000; defaults 0/1000000; precision 0–4, default 2; fixed native PrecisionSource=0 (column precision) |
| DateTime | format DateAndTime (default) / DateOnly; date_time_behavior UserLocal (default), DateOnly or TimeZoneIndependent; DateOnly behavior requires DateOnly format |
| Boolean | required true_label/false_label; Boolean default_value defaults false |
| Picklist | exactly one of local options or global_choice_name; optional numeric default_value must already be explicitly defined |
| MultiSelectPicklist | exactly one of local options or global_choice_name; no default_value exposed |

`required_level` is None (default), Recommended or ApplicationRequired. Numeric
settings are rejected on text columns, length settings on numeric columns and
precision on Integer. Other type-incompatible settings are also rejected. The server
performs final metadata/type/privilege validation. Creating an expanded type is not
the same as changing an existing column's type or date/time behavior.

Creation requires a visible existing **unmanaged** solution. The native
`MSCRM.SolutionUniqueName` header requests solution association. New table, primary
name and column schema names must use that solution publisher's customization
prefix. The tool checks duplicate logical names and the parent table's
IsCustomizable/CanCreateAttributes before adding a column; creation is not Upsert.
Solution membership/deployment verification is still part of the later ALM scope.

`update_model_labels` accepts logical_name, optional attribute_name,
solution_unique_name, and any of display_name/description (plus
display_collection_name for tables). It reads the complete definition, applies only
label edits, and sends native **PUT** with `MSCRM.MergeLabels: true`. It checks
IsCustomizable, table IsRenameable for display labels and table
CanModifyAdditionalSettings for description edits. False or unavailable required
managed properties stop the operation. Other retrieved settings are preserved;
schema, type and requirement-level changes are not exposed by this tool.

First call the update with its default preview. To execute, supply the returned
`definitionHash` as `expected_hash` and explicitly set
`allow_unprotected_write: true`, alongside `dry_run: false`. A changed fingerprint
stops before PUT. This implementation does not claim conditional metadata PUT
support: another editor can still change the definition between preflight and save.
Coordinate metadata changes in the target environment.

Confirmed saves return `saved: true` and compare requested properties with a strong
readback. `readback.status: matched` covers `checkedProperties`; for table creation,
the primary-name column definition is not separately checked in that table
projection. The model-driven UI and form placement remain unverified/unperformed.
Readback failure or mismatch is an MCP error retaining **saved: true**. A timeout or
uncertain write has `saved: null`, and is never automatically replayed. Confirmed
writes invalidate the server metadata cache.

Saving does not request publication (`publication: not_requested`) and does not add
a form control, library, event binding or view column. Use `publish_model_table`
with logical_name and review its default preview before executing. Native PublishXml
publishes the **entire table**, including other pending columns/forms/views/ribbon
changes; it is not limited to this tool's last edit. Publication failures report
failed versus unknown and never replay a save. Native successful publication still
requires separate UI/behavior validation.

Native contracts follow Microsoft guidance on [table definitions](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/create-update-entity-definitions-using-web-api),
[column definitions](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/create-update-column-definitions-using-web-api)
and [scoped publication](https://learn.microsoft.com/en-us/dotnet/api/microsoft.crm.sdk.messages.publishxmlrequest.parameterxml?view=dataverse-sdk-latest).
These paths have offline tests through Online/NTLM/IFD request branches. Actual
CRM versions, metadata permissions, language packs, solution layering, publication
and UI behavior remain untested without target connections.

## Relationship and alternate-key definitions — step 6.2

Four tools extend step 6 with native relationship/key **creation and inspection**.
They do not update or delete an existing relationship/key. Solution/publisher
validation, camel case aliases, default preview, strict inputs, cancellation,
bounded native metadata and no-replay behavior reuse the step-6.1 infrastructure.
No new dependencies or .NET process are required for this Web API scope.

`get_model_relationship` takes `schema_name`, finds exactly one native relationship,
then reads its complete 1:N or N:N derived definition by MetadataId. Transport
annotations/read-only user-localized labels are excluded; publication remains
unknown. Navigation collections are not expanded into an unlimited graph.

Use `create_model_relationship` for a one-to-many relationship and its new Lookup:

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

The referenced table is the **one** side; its native PrimaryIdAttribute is resolved
from metadata. The referencing table is the **many** side and receives the new
Lookup. Lookup labels/description/requirement use the same contracts as basic
columns. Schema names for the relationship and Lookup must use the selected
publisher prefix. Existing Lookup logical names and relationship schema names stop
creation; an existing field is not silently repurposed.

Both tables must pass the tool's positive managed-property checks. In addition,
the tool executes native `CanBeReferenced` and `CanBeReferencing` checks. These are
**read-only POST actions**, including during a preview. A denied/unavailable check
stops before any schema creation, with no fallback that assumes eligibility.

Optional `cascade` uses lowercase keys `assign`, `delete`, `merge`, `reparent`,
`share`, `unshare`. Default Delete is **Restrict**; the other five default to
NoCascade. Delete accepts Restrict/RemoveLink/Cascade; the others support
NoCascade/Cascade in this tool. Any explicit Cascade is visible in the native body
preview and can affect future related records after publication. Other cascade
modes, hierarchy and custom navigation-property names are not exposed here.
Associated menus use UseCollectionName / Details / order 10000. No form control or
script binding is created.

For a many-to-many relationship, supply:

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

The intersect name defaults to the relationship schema name and is normalized to
lowercase. Each table must pass CanBeInManyToMany and native `CanManyToMany` (also
a read-only POST). Existing intersect-table names stop creation. This batch
supports distinct tables for N:N; self-referential N:N needs navigation
configuration not exposed here. Self-referential 1:N can proceed when native
eligibility permits it. Mixing 1:N and N:N arguments is rejected.

Actual creation is one POST to RelationshipDefinitions with a native solution
header. Readback verifies requested relationship properties, and for 1:N separately
retrieves the Lookup by its logical name and derived LookupAttributeMetadata type
to check labels, requirement, identity and the single target table. A failed or
mismatched readback retains **saved: true**. No automatic retry or publish follows.
`tablesToReviewForPublication` lists affected tables; review the separate whole-table
publication scope before publishing either side.

Create an alternate-key definition using `create_model_key`:

```json
{
  "logical_name":"new_project",
  "schema_name":"new_ReferenceKey",
  "key_attributes":["new_reference"],
  "display_name":[{"language_code":1033,"text":"Reference key"}],
  "solution_unique_name":"ExistingUnmanagedSolution"
}
```

Supply 1–16 distinct logical column names; the tool normalizes case and rejects
duplicate fields. Key schema must use the selected publisher prefix. Supported
native field types are String, Integer, Decimal, DateTime, Lookup and Picklist;
every field must explicitly have IsSecured=false. Provider-backed virtual tables
are rejected. The tool checks all returned keys for a duplicate schema name or an
identical column set, including existing Pending/Failed keys. It supports at most
ten definitions per table; older environments may impose stricter platform limits.
Collections with native continuation, invalid identity or duplicate metadata are
rejected instead of being treated as complete/empty.

The native POST to EntityDefinitions(...)/Keys requests solution association. No
records are scanned or modified by this tool. The platform validates index size
(including the documented 900-byte constraint) and existing data uniqueness.
Preview therefore cannot prove the index will build successfully. Null/missing key
values and reserved characters in actual values still require integration-specific
handling; an active index does not guarantee every possible key value can be
encoded in native GET/PATCH/Upsert.

**Definition saved and index ready are separate states.** The tool returns
`saved: true` after confirmed creation/readback and maps native
EntityKeyIndexStatus to Pending / InProgress / Active / Failed. Unknown or omitted
states remain Unknown. `usableForAlternateKeyOperations` is true only for Active;
record permissions and value encoding still apply. The tool never waits for a
background job by assuming success. An immediately Failed index is an MCP error
`D365_MODEL_KEY_INDEX_FAILED` retaining saved=true and the AsyncJob link. Do not
recreate the same definition to recover an index failure.

Call `get_model_key` with logical_name/schema_name again to read the current state.
Optional `include_job: true` reads only job ID/state/status/error code/timestamps;
free-text messages and job data are excluded. Missing/forbidden linked-job evidence
is reported independently from the key state. Authentication/cancellation errors
propagate. No job ID is invented, no record-wide job search is performed, and no
reactivation/deletion or background polling is automatic.

Native basis: [relationship creation and eligibility](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/create-update-entity-relationships-using-web-api),
[alternate-key constraints and asynchronous indexing](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/define-alternate-keys-entity)
and [native index states](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/entitykeyindexstatus).
Offline tests exercise Online, NTLM and IFD native request branches. Real environment
relationship eligibility/cascading, metadata propagation, index creation, solution
membership and published UI behavior are still awaiting integration validation.

## Choices and additional column types — step 6.3

Four new tools add choice discovery, global choice creation, individual option
insert/label update and separate global publication. The existing model column
tool now supports the nine types listed above. No existing tool names are changed.
All writes default to preview, and use the same solution/publisher, bounded input,
cancellation, cache invalidation and no-replay contracts as the earlier model tools.

Read a shared choice using `get_model_choices`:

```json
{"global_choice_name":"new_colors"}
```

Or read the choice used by one column:

```json
{"logical_name":"new_project","attribute_name":"new_color"}
```

Use exactly one selector style. Native OptionSet data includes language labels,
numeric values, managed properties and a `definitionHash`. A local field referring
to a global choice returns scope=global_reference. Editing such shared options
requires explicitly addressing the global_choice_name; a local selector never
silently edits choices used by other columns. Boolean, Picklist and MultiSelect
are supported; state/status options have separate native semantics and are excluded.
Missing identities, invalid/duplicate native values, metadata continuations, more
than 1000 options or definitions larger than 2 MiB stop the operation.

Create a global choice with `create_model_choices`:

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

The global name is normalized to lowercase and must use the selected publisher
prefix. An existing name stops creation. Each of the 1–1000 options accepts optional
numeric `value`, required `label`, and optional localized `description`. Values are
nonnegative Int32 and unique. Omit value to send native Value=null and let the
platform allocate it in the solution publisher context. Do not send null as a
user-supplied value. Label sets must be distinct, and automatic allocations require
unambiguous label matching so readback can identify the assigned values. Requests
are bounded to 2 MiB. Confirmed creation compares the display/description/options,
and returns the actual allocated values; failed readback retains saved=true.

Local single/multi choices use the same `options` structure in `create_model_column`.
To reuse a shared choice, omit options and supply global_choice_name instead. The
tool resolves and validates the native global choice ID, then sends
`GlobalOptionSet@odata.bind`; it does not copy the options into a new local set.
Readback verifies that global binding. MultiSelect uses the native Virtual attribute
type with MultiSelectPicklistType; arbitrary Virtual columns are not accepted.
An optional single-choice default_value must match an explicit option value or an
existing global value; newly allocated values cannot be guessed before creation.

For Boolean creation, supply true_label and false_label using the standard localized
label arrays and optional Boolean default_value. The native values stay 1 and 0.
Money creation in this tool uses column precision (PrecisionSource=0), not the
organization or record currency precision. DateTime behavior is explicit; DateOnly
display with UserLocal behavior is different from DateOnly storage behavior.
Existing date conversions, currency configuration, calculated/rollup columns,
file/image columns and broader settings remain outside this batch.

Use `change_model_choice_value` for an individual option:

```json
{
  "global_choice_name":"new_colors",
  "operation":"update",
  "value":100000001,
  "label":[{"language_code":1033,"text":"Navy"}],
  "solution_unique_name":"ExistingUnmanagedSolution"
}
```

Insert requires label; an omitted value requests native allocation. Update requires
an existing value plus label or description. Local choices use logical_name and
attribute_name instead of global_choice_name. The body uses the native
OptionSetName or EntityLogicalName/AttributeLogicalName and **SolutionUniqueName**
action parameter. UpdateOptionValue sends **MergeLabels=true**. This is separate
from field-label PUT; updating a column's DisplayName does not update option labels.

Review the default preview, then execute with its definitionHash as expected_hash,
allow_unprotected_write=true and dry_run=false. Stale hashes stop before the action,
but native option actions have a concurrency window after the read. The tool only
changes explicitly unmanaged/customizable choices; managed or unknown ownership,
and managed target options, require a publisher/solution workflow not implemented
here. Boolean label updates are supported; inserting a third Boolean value is not.

Readback checks choice identity, numeric value, supplied labels/description and
untouched language text. Insert reads native NewOptionValue for automatic allocation;
missing/inconsistent responses preserve saved=true as an error rather than inventing
an ID. Timeouts/unknown action outcomes are not replayed. There is no option deletion,
renumbering, reordering or state/status mutation in this batch.

`publish_model_choices` takes global_choice_name and defaults to preview. Native
PublishXml includes the **entire shared global choice**, including other pending
changes. Local choices use publish_model_table, whose scope is the entire table.
Neither save nor publication automatically edits forms/views or proves UI behavior.

Native basis: [choice messages and allocation](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/create-update-optionsets),
[InsertOptionValue](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/insertoptionvalue),
[UpdateOptionValue and MergeLabels](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/updateoptionvalue),
[column definitions](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/create-update-column-definitions-using-web-api),
[choice navigation](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/retrieve-metadata-name-metadataid),
[date behavior](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/datetimebehavior)
and [money precision](https://learn.microsoft.com/en-us/dotnet/api/microsoft.xrm.sdk.metadata.moneyattributemetadata.precisionsource).
Online/NTLM/IFD request paths are tested offline. Real language packs, managed layers,
publisher allocation, API-version support, propagation, publication and UI behavior
remain unverified without target CRM connections.

## Structural form and view editing — step 6.4

Four tools inspect saved/unpublished UI components and edit existing **Main forms
(type=2)** or **public system views (querytype=0)**. Writes use native systemforms /
savedqueries PATCH, distinct from metadata-definition PUT. No new dependencies,
arbitrary XML replacement, form/view creation, deletion or automatic publication is
introduced. Personal views and other form types can require separate workflows.

Discover IDs using `list_model_ui_components`:

```json
{"kind":"form","logical_name":"new_project","top":50,"name_keyword":"Main"}
```

Use kind=view for views. Native RetrieveUnpublishedMultiple is bounded to one list
of 1–100 requested entries. A continuation or a full limit reports limited=true;
narrow name_keyword rather than treating a bounded list as complete. There is no
fallback to published records when unpublished retrieval is unavailable/forbidden.

`get_model_ui_component` takes kind, id and logical_name. It returns native saved
XML, a structural inventory, definitionHash and a native ETag when available. Form
sections return normalized IDs without braces for direct reuse in operations.
libraryUniqueId in the XML inventory is an internal form identifier, distinct from
the Web Resource ID. XML is limited to 1 MB per document, 40,000 nodes and depth 64;
DTD/entities, malformed or unsupported namespaced roots are rejected. Component
responses have a 3 MiB bound. Hashes compare XML structure/attributes rather than
indentation, preserving meaningful literal whitespace.

Example `edit_model_form` preview:

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

Operations run in order in memory, then save in **one PATCH**. add_field appends a
new full-width row in an existing equal-width section (explicit columns encoding
1/11/111/1111, without row-spanning cells). The field must not already appear. An
explicit existing compatible control supplies its native class ID; the tool checks
the source/target scalar type, format/behavior and IsValidForForm. Supported
templates are String, Memo, Integer, Decimal, Money, DateTime, Boolean and Picklist.
It copies no existing handlers/parameters or PCF control descriptions. Lookup,
MultiSelect, unbound/parameterized controls, new sections/tabs, moves and complex
layouts are outside this operation. control_id defaults to the field logical name.

add_library verifies an exact visible JavaScript Web Resource name (type=3), without
reading or executing source. bind_event requires that library to already be present
or added earlier in the same operation list. Supported events are onload/onsave and
onchange; onchange also requires a field placed on the form. Function names are
dotted identifiers. Execution context defaults true and explicit false is preserved.
Duplicate libraries/handlers and internal application events are refused; existing
event order and unrelated XML are retained. No function-existence/runtime check is
claimed. The native limits of 50 libraries/handlers are enforced for additions.

Script changes return **webResourceId** and webResourcePublication=not_verified.
Saving/publishing a form does not prove the script resource's latest content is
published. Review and use the existing publish_web_resource tool for that ID when
needed. JavaScript Web Resource publication and UI behavior are separate checks.

Example `edit_model_view` preview:

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

add_column synchronizes a root FetchXML attribute with the LayoutXML cell; it keeps
all-attributes selection intact. remove_column removes only the display cell,
preserving FetchXML attributes used by filters/orders/other dependencies. Primary,
jump and last display columns cannot be removed. Widths are 25–2000 (default add
width 150). set_order replaces simple root ordering with 1–10 distinct fields.
Native readable-field metadata and layout table/primary-ID identity are checked;
missing primary FetchXML projection is explicitly added for non-distinct views.
Filters, joins, linked columns and unrelated layout attributes are preserved.
Aggregate/distinct rewrites, linked/alias order replacement, related-column edits,
filter edits and raw FetchXML/LayoutXML replacement are not exposed in this batch.
No implicit active-state filter or query execution is introduced.

All edit calls default to dry_run=true and allow 1–50 operations (2 MiB input cap).
Review the returned request/changes and execute with the current definitionHash as
expected_hash plus dry_run=false. Source component/table customizability must be
explicitly positive. The solution header requests association with the selected
existing unmanaged solution; full solution membership/deployment verification is
still a later ALM concern.

Concurrency checks use the systemform/savedquery table's native
IsOptimisticConcurrencyEnabled metadata. When confirmed, a specific native/supplied
ETag is used; absence requires supplying a valid if_match. If support is false or
unknown, execution requires allow_unprotected_write=true and uses If-Match:* only
to prevent accidental upsert. A supplied specific ETag is never bypassed. Previews
show blockedBy when the concurrency requirement is unmet. The fingerprint detects
stale reviews but is not a lock during an explicitly unprotected write.

Confirmed saves read the unpublished component again and compare all submitted XML
structurally. Readback failure/mismatch retains saved=true; unknown PATCH outcomes
retain saved=null and are never replayed. No-change edits return saved=false and
noChange=true without PATCH. Native save success is separate from full XSD, runtime,
UI, publication and solution deployment acceptance. Use publish_model_table only
after reviewing its whole-table scope, including other pending changes.

The offline suite covers a simulated create-field → place-on-form → bind-script →
edit-view → separately publish → reread sequence, with network blocked. Real
Online/NTLM/IFD permissions, unpublished/ETag semantics, managed layers, control
layout, script execution and published UI behavior remain untested.

Native basis: [system form operations](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/reference/entities/systemform),
[saved view operations](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/reference/entities/savedquery),
[unpublished retrieval](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/retrieveunpublished),
[FormXML schema](https://learn.microsoft.com/en-us/dynamics365/customerengagement/on-premises/developer/customize-dev/form-xml-schema?view=op-9-1)
and [view query/layout customization](https://learn.microsoft.com/en-us/dynamics365/customerengagement/on-premises/developer/customize-dev/customize-entity-views?view=op-9-1).

## Plugin entity images — step 6.5

Four tools manage native `sdkmessageprocessingstepimages` without requesting step
configuration or assembly content:

| Tool | Operation |
|---|---|
| `d365_plugin_images_query` | Exact `step_id` listing, `top` 1–500 (default 100), explicit `complete` |
| `d365_plugin_image_register` | Register a named Pre/Post/Both image with an alias and explicit fields |
| `d365_plugin_image_update` | Patch name, description, alias, image type or selected fields by `image_id` |
| `d365_plugin_image_delete` | Delete an exact image, keeping its parent step |

Use snake_case; camelCase aliases (`stepId`, `imageId`, `entityAlias`, `imageType`,
`dryRun`, `expectedFingerprint`, `ifMatch`, `allowUnprotectedUpdate`) are accepted.
Conflicting aliases and unknown keys fail validation. Patch objects accept field
aliases too. Query results project image metadata only and never follow native
continuation links. A missing step can produce an empty query result; that is not
proof that the step exists or the caller has visibility to all registrations.

Example registration preview:

```json
{
  "step_id":"11111111-1111-1111-1111-111111111111",
  "name":"Account before update",
  "entity_alias":"Before",
  "image_type":"PreImage",
  "attributes":["name","telephone1"]
}
```

Supported registration/update messages are **Create, Update, Delete, Assign and
SetState**, on entity-specific plugin-type steps only. Target is used for the
first four messages; SetState uses EntityMoniker. Image types are 0/PreImage,
1/PostImage and 2/Both. Create permits only PostImage, Delete permits only PreImage,
and PostImage/Both requires stage 40/PostOperation. PreImage permits stages 10, 20
and 40 where the message supports it. Async mode requires stage 40. Merge, Send,
Route, DeliverIncoming/DeliverPromote and other message-property mappings are not
exposed for registration/update yet. Existing images for those messages remain
queryable, and exact unmanaged customizable images can be previewed/deleted.

Fields are a non-empty list of 1–100 logical names, lowercased/deduplicated and
checked against native IsValidForRead metadata. Empty/all-column selection is
rejected. Name, alias and description have a 256-character cap; control characters
are rejected. Registration requires name, alias, type and fields; update requires
a non-empty patch and preserves omitted fields. Clearing description uses an empty
string. Unsupported existing message/related-attribute mappings are not rewritten.

Mutation calls default to **dry_run=true**. Review `changes`, `step`, `canWrite`
and `blockedBy`, then send the same operation with `dry_run=false` and the preview's
`fingerprint` as `expected_fingerprint`. A changed image, parent context or sibling
registration invalidates the preview. This fingerprint is a stale-review check,
not a lock or server uniqueness constraint. Parent-step edits and concurrent
image creation can still race; native platform validation remains authoritative.
The complete sibling list (up to 499 images) is required for planning. Duplicate
names or aliases that overlap the same Pre/Post bag are blocked; distinct Pre and
Post images can use the same alias with different names.

Updates/deletes require confirmed `ismanaged=false` and `iscustomizable.Value=true`.
They check native IsOptimisticConcurrencyEnabled for the image table. When true,
a current/supplied specific ETag is required. When false or unknown, the preview
is blocked unless `allow_unprotected_update=true` is explicitly selected; then
If-Match:* prevents upsert but does not protect against concurrent modification.
A supplied specific ETag conflict is never bypassed, including with that opt-in.
Creation assigns a client GUID and binds the step in the same POST.

A successful write is followed by an exact readback: create/update verifies ID,
parent and saved fields; delete requires native 404. A readback failure retains
`saved=true` and the image ID. Write timeout/transport uncertainty retains
`saved="unknown"`; confirmed rejection/not-sent retains false. No write is replayed
and no compensating deletion is attempted. Cancellation is propagated on reads
and writes; cancellation after saving can leave readback unconfirmed. Image writes
do not publish tables or prove that plugin execution received the expected image.
No solution association or assembly update is added by these tools.

Tests cover schema/aliases, availability, field metadata, duplicate bags, stale
previews, concurrency, cancellation, saved/unknown failure phases, a full simulated
image lifecycle, and the actual Online/NTLM/IFD request branches with mocked
transport and network blocked. Real permissions, image concurrency support and
runtime plugin contexts must still be validated in the target environment.

Native basis: [plugin image availability and registration](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/register-plug-in)
and [SDK message processing step image Web API table](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/sdkmessageprocessingstepimage).

## Assembly identity and compatible updates — step 6.6

| Tool | Operation |
|---|---|
| `d365_plugin_assembly_inspect` | Local DLL metadata inspection; works without CRM settings |
| `d365_plugin_assemblies_query` | Bounded native assembly metadata listing with optional exact ID/name filters |
| `d365_plugin_assembly_update` | Compatibility preview and conditional update of an existing assembly |

Inspection/update accepts exactly one `file_path` or `content_base64` source,
limited to 16 MiB of decoded bytes. Base64 must be canonical; local input must be a
regular file and is read with a bound and change checks. No URL download or caller
identity manifest is accepted. camelCase aliases are supported for assemblyId,
filePath, contentBase64, dryRun, expectedFingerprint, ifMatch and
allowUnprotectedUpdate. Unknown keys and conflicting aliases are rejected.

The bundled `bin/assembly-inspector/AssemblyInspector.dll` is a small **.NET 10**
metadata reader built from `tools/assembly-inspector`. Node starts only this fixed
helper and passes the PE bytes on stdin. PEReader/MetadataReader inspect identity,
TargetFrameworkAttribute, signing flags/signature presence, public types, known
IPlugin/CodeActivity inheritance, native import flags and assembly references.
Inspected code and its dependencies are never loaded or invoked. Local inheritance
is followed with depth/cycle limits; external/generic inheritance is not resolved.
The process has bounded input/output, a 15-second timeout, cancellation and a
sanitized environment excluding CRM credentials and .NET startup-hook settings.
Reader errors contain no stderr, DLL bytes or file paths. This is process
separation and bounded metadata parsing, not a security sandbox for arbitrary
untrusted binaries. The input should be your trusted build output.

`inspection` contains name, four-part version, culture, publicKeyToken, framework,
architecture/flags, public contract types, references, size and SHA-256. It reports
`codeExecuted=false`, `cryptographicSignatureVerified=false` and
`dependenciesResolved=false`. A strong-name token and non-empty signature field
are identity evidence; neither proves the signature is cryptographically valid,
that IL is correct or that the target server can load/execute the assembly.

Example update preview:

```json
{
  "assembly_id":"11111111-1111-1111-1111-111111111111",
  "file_path":"D:\\build\\Company.Plugins.dll"
}
```

Preflight reads the stored assembly content and its actual metadata, the native
assembly concurrency setting, package-column capability and a complete visible
list of fewer than 500 registered plugin types. It never reads plugin step
configuration or assembly credentials. PackageId is selected only when discovered
in table metadata, preserving older on-premise schemas; unsupported capability
queries fail instead of assuming no package. Assembly listing excludes content,
username/password and package-specific newer columns; it reports completeness and
does not follow continuation links.

This first update scope requires all of the following:

- Existing assembly is confirmed unmanaged/customizable, Database source, with an
  existing supported None/Sandbox isolation mode; Online requires Sandbox. Platform
  assemblies with Microsoft.* names and plugin-package assemblies are blocked.
- Candidate name, normalized culture and public-key token match stored identity;
  stored identity also matches its actual bytes. Signing metadata is present.
- Four-part version keeps major/minor and does not decrease build/revision. Same
  version rebuilds are permitted. Major/minor changes are blocked for a separately
  planned registration/step migration; this tool never creates/retargets steps.
- Candidate is an AnyCPU managed DLL (I386, IL-only, no Requires32Bit or P/Invoke
  imports), with the **same declared .NET Framework target** as the existing binary,
  in the supported 4.6.2–4.8 set. The reader's .NET 10 runtime is independent from
  the plugin target. Changing the framework is blocked, including on-premise.
- Assembly reference name/version/culture/public-key-token metadata is unchanged.
  Dependency availability and SDK authenticity still require platform validation.
- Every visible registered type retains its name, ID and assembly identity.
  The candidate's public concrete non-generic top-level IPlugin contract type set
  must exactly match the registered names. Type addition/removal, workflow types,
  unresolved inheritance and nested plugin contracts are blocked. No PluginType
  POST/PATCH/DELETE or Image/step mutation is issued.

These are conservative static checks. `canWrite=true` does not prove write
permission, target framework/API availability, constructors, business behavior,
full platform registration validity or that no hidden/unlisted dependency exists.
The native platform remains authoritative.

Update defaults to `dry_run=true`. Review `existing`, `candidate`, `registeredTypes`,
`blockedBy` and `fingerprint`; execute the same operation with `dry_run=false` and
that value as `expected_fingerprint`. A changed stored binary, assembly row, type
list or candidate bytes invalidates the review. The fingerprint is not a lock on
plugin types/steps/dependencies. Already identical content returns noChange with
no write after validating the preview and compatibility.

For a changed binary, native IsOptimisticConcurrencyEnabled controls protection.
When true, a current/supplied specific ETag is required. If false/unknown, the
preview blocks writing unless `allow_unprotected_update=true` is explicit and no
specific ETag is supplied; If-Match:* then prevents upsert but permits a concurrency
window. A supplied specific ETag conflict is never bypassed. The only mutation is
one native PATCH containing the actual base64 content and its extracted version;
name, culture, token, source and isolation are not caller-editable metadata.

After saving, the service rereads content and compares its SHA-256 and assembly
identity. It also verifies source/isolation/package binding, preserves every type
ID/name/workflow flag and checks each type's version/culture/token against the
new binary. Readback failures/mismatches retain saved=true and the assembly ID.
Rejected/not-sent writes retain false; unknown outcomes retain saved="unknown".
No write is retried, no second backend is selected and no rollback is attempted.
Readback confirms storage metadata; plugin execution and solution deployment
remain separate acceptance steps. No automatic PublishXml or solution association
is performed.

Build the helper with `npm run build:inspector` (.NET 10 SDK), or rebuild the full
release with `npm run build:release`. npm packages include the compiled reader,
runtimeconfig/deps files and reader sources/build script. Installed packages need
the .NET 10 Runtime for these two binary tools; metadata listing does not. Other
Node-only tools remain available when the reader/runtime is missing. The dedicated
error is D365_ASSEMBLY_INSPECTOR_UNAVAILABLE.

Offline tests use real signed PE fixtures generated by
`scripts/build-assembly-fixtures.mjs`. They reference a test SDK stub, never the
production SDK, and must not be deployed. Regeneration requires .NET SDK plus a
.NET Framework mscorlib reference directory (D365_FRAMEWORK_REFERENCE_DIR can
supply it); normal tests use included fixtures. Coverage includes identity/version,
signing flags, native imports, type/inheritance boundaries, framework/dependency
checks, concurrency/fingerprints, bounded reader failures, saved/unknown outcomes,
all authentication request branches and installed-package local inspection.
Real Online/NTLM/IFD upload permission, native version/type refresh behavior,
strong-name verification and plugin runtime behavior remain untested.

Native basis: [assembly registration/versioning](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/register-plug-in),
[assembly constraints](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/build-and-package),
[supported .NET Framework targets](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/supported-customizations),
[assembly table](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/pluginassembly),
[type identity fields](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/plugintype)
and [metadata reader](https://learn.microsoft.com/en-us/dotnet/api/system.reflection.metadata.metadatareader).

## Existing field, relationship and key maintenance — step 6.7

Three tools add a bounded maintenance workflow using native metadata PUT and
ReactivateEntityKey. They use the shared Web API transport for Online, AD/NTLM and
IFD; they do not require the optional .NET binary reader.

| Tool | Maintained scope |
|---|---|
| `update_model_column_settings` | Reviewed settings of an existing ordinary unmanaged custom column |
| `update_model_relationship` | Custom 1:N menu/cascade or N:N per-side menus |
| `reactivate_model_key` | A new native index job for an existing Failed alternate key |

All require an existing `solution_unique_name`; existing schema names must use its
publisher prefix. The solution header on PUT requests association; solution
membership/deployment acceptance is not verified here. Reactivation changes index
job state, not solution membership, and sends the native Action body without a
solution header. The table/component must explicitly permit customization. Virtual
or provider-backed tables, managed components and unconfirmed identity/permissions
are blocked by this scope.

Every tool defaults to **dry_run=true**. Preview performs native strong-consistency
reads and returns `planHash`. Review the changes and execute the same arguments
with `dry_run=false`, `expected_hash` equal to that **planHash**, and
`allow_unprotected_write=true`. Do not use `definitionHash` for these tools:
planHash also binds operation, patch, environment, solution and parent metadata.
A changed plan invalidates the review. Native metadata replacement and the index
Action have no confirmed atomic concurrency mechanism in this scope; a fingerprint
is not a lock. No If-Match protection is inferred from business-table concurrency
settings. An actual no-change PUT plan returns saved=false/noChange=true without
writing after review. Writes/submissions are never automatically replayed.

camelCase compatibility aliases include logicalName, attributeName, schemaName,
solutionUniqueName, dryRun, expectedHash and allowUnprotectedWrite. Field patches
also accept maxLength, minValue, maxValue, requiredLevel, defaultValue,
isAuditEnabled and isValidForAdvancedFind; relationship patches accept entity1Menu
and entity2Menu. Conflicting aliases/unknown keys fail. Arguments and complete
metadata definitions are bounded to 2 MiB. Saving and publication remain separate.

### Existing column settings

Example preview:

```json
{
  "logical_name":"new_project",
  "attribute_name":"new_reference",
  "solution_unique_name":"ExistingUnmanagedSolution",
  "patch":{"max_length":250,"required_level":"Recommended"}
}
```

The native type is discovered from the full current derived definition. Nine
existing base types are supported: String, Memo, Integer, Decimal, Money, DateTime,
Boolean, Picklist and MultiSelectPicklist. Columns must be confirmed ordinary
custom storage: unmanaged, non-primary, non-logical, SourceType=0, AttributeOf=null
and no autonumber format. Calculated, rollup, primary name/ID, companion, autonumber,
provider-backed and other types are not rewritten. Type/schema/name changes,
DateTimeBehavior conversion, field-security changes and arbitrary metadata JSON
are not accepted.

| Patch setting | Constraint |
|---|---|
| `max_length` | String 1–4000 or Memo 1–1048576; may retain/increase current length |
| `min_value`, `max_value` | Integer/Decimal/Money; may widen the current range only |
| `precision` | Decimal 0–10 or Money 0–4; may retain/increase, Money PrecisionSource must be 0 |
| `required_level` | None/Recommended/ApplicationRequired; current level must also be one of these |
| `is_audit_enabled`, `is_valid_for_advanced_find` | Explicit Boolean values with changeable native managed properties |
| `default_value` | Boolean true/false or an existing Picklist numeric value; no default clearing or MultiSelect default |
| `format` | DateTime DateOnly/DateAndTime compatible with the unchanged native DateTimeBehavior |

Integer bounds are -2147483648–2147483647. This batch's Decimal/Money range scope
is ±100000000000. Current settings must be available and valid before changing
them. Length reductions, range narrowing and precision reductions require a
separate data assessment and are rejected. No existing business data is scanned,
rewritten or backfilled. Requirement/audit/search effects depend on the native
platform and client; field auditing alone does not enable table/environment audit.

IsCustomizable must permit the column/table. RequiredLevel/audit/advanced-find
properties must confirm CanBeChanged=true for their values. Other settings require
CanModifyAdditionalSettings.Value=true. The full retrieved definition is preserved
and sent via PUT with MSCRM.MergeLabels=true; transport annotations and per-user
labels are stripped. Labels, option definitions, date behavior and unrelated
properties are kept in the payload. Readback verifies submitted settings,
column identity/storage and preserved critical definitions. It ignores native
HasChanged flags and label-array ordering; a changed label value is still a mismatch.
Column label changes and option value/label changes remain separate existing tools.

### Existing relationship settings

Use `schema_name`, `solution_unique_name` and a non-empty `patch`. Only confirmed
unmanaged custom relationships are supported. The full relationship definition is
read with its native type, retaining endpoint tables/attributes and intersect
identity. Every participating table must allow customization.

For 1:N, `patch.menu` changes its associated menu and `patch.cascade` changes
selected cascade values. For N:N, use `patch.entity_1_menu` and/or
`patch.entity_2_menu`; cascades and a shared menu are rejected. This does not create
or change lookup targets, endpoints, schemas, intersect tables or cardinality.

Menu patches accept behavior (UseCollectionName/UseLabel/DoNotDisplay), group
(Details/Sales/Service/Marketing), non-negative Int32 order and localized `label`
entries (`language_code`, `text`). The current menu must explicitly report
IsCustomizable=true. UseLabel requires an available label. Language changes merge
into existing labels, retaining other languages and native menu/view IDs. Native
menu capabilities unavailable on an older server block editing instead of being
assumed supported.

Cascade patches accept assign/delete/merge/reparent/share/unshare. Delete permits
Restrict/RemoveLink/Cascade; the other exposed actions permit NoCascade/Cascade.
Omitted values and additional native cascade settings are retained. Other native
cascade options and complex relationships remain outside this batch. Cascading
changes can affect future related-record deletion, ownership and access. Native
parental/cross-relationship restrictions are not emulated by the MCP server;
preview does not prove that the platform will accept a configuration.

Saving sends a complete typed definition to RelationshipDefinitions(id) with PUT
and MSCRM.MergeLabels=true. Readback checks endpoint/intersect identity and both
changed and retained menu/cascade settings. Publish the relevant entire table(s)
separately using a reviewed publish_model_table call; that publication may include
other pending customizations. Runtime cascade effects and UI menus require real
acceptance tests.

### Failed alternate-key index reactivation

Example preview:

```json
{
  "logical_name":"new_project",
  "schema_name":"new_ReferenceKey",
  "solution_unique_name":"ExistingUnmanagedSolution"
}
```

Only a confirmed unmanaged/customizable key whose native index state is Failed is
eligible. Pending/InProgress/Active/Unknown previews show canSubmit=false and
execution is blocked. The tool reads the real LogicalName from key metadata and
sends `ReactivateEntityKey` with EntityKeyLogicalName and EntityLogicalName. It does
not guess the logical name from SchemaName, change key columns, delete/recreate a
key, fix duplicates, clean records or cancel jobs. Use get_model_key with optional
job inspection to investigate and correct the cause before submission.

A successful Action response means **submitted=true**, separate from Active. One
subsequent metadata read checks the key identity/columns and current index. A new
nonzero AsyncJob GUID different from the previous GUID confirms a new job link;
GUID case differences are not a new job. Pending/InProgress does not make the key
usable; only observed Active does. If native metadata still shows the old job or
Failed state, the result reports accepted_new_job_not_confirmed and does not
resubmit. If a newly linked job is already Failed, D365_MODEL_KEY_INDEX_FAILED
retains submitted=true. Inspect get_model_key later; the tool does not poll or
schedule follow-up work.

PUT readback failure/mismatch retains saved=true. Native Action readback failure
retains submitted=true; it does not undo acceptance. Confirmed rejection/not-sent
retains false, while uncertain PUT/submission outcomes retain null and must be
inspected before any retry. Cancellation propagates through all reads and writes.
Neither a successful save nor Action acceptance proves publication, index
completion, runtime behavior or deployment success.

The offline suite exercises all nine column types, restrictions and managed
properties, full definition/label preservation, 1:N/N:N settings, fingerprints,
unknown/saved/submitted phases, native key states/job identity, cancellation and
all three authentication request branches with mocked transport. No real CRM
requests are made. Permission, metadata PUT/Action support, cascading rules,
publication/UI effects and actual index recovery remain unverified.

Native basis: [column replacement](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/create-update-column-definitions-using-web-api),
[relationship replacement and MergeLabels](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/create-update-entity-relationships-using-web-api),
[managed requirement level](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/attributerequiredlevelmanagedproperty),
[relationship menus](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/associatedmenuconfiguration),
[key index lifecycle](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/define-alternate-keys-entity)
and [ReactivateEntityKey](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/reactivateentitykey).

## Native Action/Function invocation — step 7.1

Development has moved to step 7 at the user's request. Step 6's remaining
option/metadata/UI/plugin extensions stay explicitly incomplete. This batch adds
`get_api_operation` and strengthens the existing `call_d365_api_action`; it does
not create Custom API definitions, Ribbon commands or solutions.

### Compatibility and discovery

The existing call tool keeps its name and defaults: `is_function=false` invokes an
Action immediately with POST, `dry_run=false`, and the result is the native data
without a new wrapper. Native 204 returns null. `return_details=true` opts into a
receipt containing HTTP status/data, selected signature and execution/submission
state. It does not prove that an asynchronous process completed or perform a
business-specific readback. Source-level RecordService.callD365Action also uses
the same implementation; a data-only source client reports no invented HTTP status.

New validation requires current `GET /$metadata` access. Unsupported/absent CSDL,
wrong types, undeclared names, ambiguous overloads and arbitrary URLs previously
accepted by the simple string concatenator now fail before operation invocation.
There is no unchecked fallback. Names and native parameter/property names are case
sensitive. Actions use only POST; Functions use only GET and are selected from the
corresponding CSDL element. `is_function` still defaults to false for invocation.

Use `get_api_operation` with an exact `action_name` and optional `is_function`,
`binding` or `signature_id`. It returns overload signatures, input nullability/
facets, binding, return type, import names and direct input type definitions.
Nested input types are not recursively expanded. Unbound query functions without
a callable import are marked invocable=false. Metadata visibility does not prove
permission to invoke the operation or that the full serializer supports every
advertised type.

Each call reads fresh CSDL instead of caching a possibly obsolete signature.
Schema aliases are resolved to qualified names; external references are not
fetched. XML is namespace-checked, bounded to 32 MiB/500000 tokens/elements and
64 levels, and rejects DTD/entity declarations, duplicate signatures/properties
and unsupported inheritance cycles. Operation/type/member collections are bounded.
Type inheritance traversal is limited to 32 levels. Large environments exceeding
these bounds fail explicitly rather than switching to unchecked invocation.

### Binding and overloads

Example bound Action preview (the named action must actually exist):

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

The entity set comes from current CSDL; its actual entity type must be assignable
to the native binding type. A single-entity binding requires a GUID `id`; a
collection binding omits id. The first CSDL parameter is supplied by the URI and
must not also appear in `parameters`. Bound calls use the full native qualified
operation name. Unbound calls use the exposed import name, not a caller-built
endpoint. No navigation binding path or alternate-key binding is exposed yet.

If multiple overloads pass binding and value validation, invocation fails as
ambiguous. Query signatures and pass the chosen `signature_id`; the service never
selects the first matching overload. Missing required or extra parameters fail.
Actions permit omission of nullable parameters; Functions require parameter
presence unless the CSDL has an OptionalParameter annotation. Explicit null must
be permitted by the declared type. Binding and known input inheritance are
validated from the same current document.

### Input values and Function encoding

Supported primitive inputs include String/Boolean, Byte/SByte/Int16/Int32/Int64,
Decimal/Single/Double, Guid, Date/DateTimeOffset/TimeOfDay/Duration and Binary, plus
bounded collections. Types such as Stream/geospatial/undeclared external types
are rejected for non-null values. Native enum member names and IsFlags lists are
validated. Structural complex properties use their declared types and required
fields. Entity objects are partial records, not whole-row replacements.

Int64 accepts a safe JavaScript integer or an exact signed decimal string within
its native range. Decimal accepts a finite non-exponent number/string and enforces
explicit native precision/scale (38-digit local cap if precision is unspecified).
Use strings for values that cannot be represented exactly as JavaScript numbers.
POST uses application/json;IEEE754Compatible=true and emits Int64/Decimal as
strings. Single/Double must be finite. Temporal values use explicit native ISO
forms; DateTimeOffset requires Z or a ±14-hour-bounded offset. Binary input is
canonical base64. String input rejects invalid unpaired Unicode surrogates.

For structured/entity inputs, an explicit @odata.type can select a known concrete
compatible type; abstract entities require it unless a reference supplies the
type. Only declared structural properties are accepted. Navigation/deep-insert
properties, @odata.bind and arbitrary open properties are outside this batch.

A reference such as {"@odata.id":"accounts(GUID)"} must name a current entity set
and GUID within this service. Full URLs, navigation paths, mixed reference/data
objects and alternate-key URIs are rejected. Functions serialize the relative
@odata.id reference as JSON; Actions convert it to @odata.type plus the table's
actual single Guid primary-key property from CSDL. Compatible inline records and
complex values are recursively validated. Collections are limited to 1000 items,
value traversal to 10000 nodes/20 levels, and total arguments to 1 MiB with bounded
acyclic JSON. Caller-supplied strings are not treated as OData expressions.

Every Function value is put in an encoded query alias rather than the operation
path. For example a string O'Brien / 中文 is represented by a quoted literal with
the apostrophe doubled; the complete alias value is percent-encoded in the query.
Complex/collection values use JSON aliases; enum/duration/binary values use native
literal forms. Function URLs are limited to 32 KiB after encoding. No external
reference or native paging link is followed by this tool.

### Preview, receipts and failure evidence

`dry_run=true` only reads metadata and validates/serializes the request. It returns
`planHash`, the resolved signature/binding and parameter names. Values and the
Function query URL are withheld by default; `include_parameter_values=true` is an
explicit opt-in to show plaintext normalized values, endpoint and POST body.
Previews do not invoke the operation or validate business data/permissions.

An optional `expected_hash` equal to the preview's planHash checks current metadata,
environment, binding and normalized arguments before execution. This does not lock
records or prevent concurrent business changes. For compatibility a preview and
fingerprint are not mandatory for the existing immediate invocation tool.

`return_details=true` wraps native data/status with executed/submitted information.
Success means a native response was received, not generic publication, index
readiness or business completion. Failures with confirmed rejection/not-sent
report false; uncertain invocation outcomes retain null. Errors do not echo
parameter values, raw transport errors or platform message text. The operation
service does not retry Actions or switch backends. Existing shared authentication
refresh and bounded GET retry policy remain in effect. Successful Actions flush
existing caches. Cancellation is forwarded through metadata and invocation.

Supported camelCase aliases are actionName, isFunction, signatureId, dryRun,
expectedHash, returnDetails, includeParameterValues and binding.collectionName.
Conflicting aliases and unknown top-level/binding keys are rejected. Native
parameter/property names do not receive alias normalization.

Offline tests cover CSDL parsing/visibility, exact signatures and overloads,
entity/collection binding, inherited types, primitives/facets/enums/complex values,
relative references, special-character encoding, limits, previews, failure phases,
legacy responses and all three authentication request branches. Real CSDL size,
permissions, custom business rules, server serialization variations and actual
execution remain unverified. No real CRM connection was used.

Native basis: [service CSDL](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/web-api-service-documents),
[Action binding and entity parameters](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/use-web-api-actions),
[Function binding and aliases](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/use-web-api-functions)
and [OData URL literals and parameter aliases](https://docs.oasis-open.org/odata/odata/v4.01/odata-v4.01-part2-url-conventions.html).

## Solution membership and dependency checks — step 7.2

Four tools use native solution/solutioncomponent reads, three dependency Functions
and AddSolutionComponent. They require only Node and the existing Web API transport;
no SDK process, UI automation or new dependency is introduced.

| Tool | Scope |
|---|---|
| `list_solutions` | Optional exact unique-name/solution-ID/managed filters |
| `list_solution_components` | Visible membership rows for an exact solution, with optional object-ID/type filters |
| `get_solution_component_dependencies` | required, dependent or delete dependency direction |
| `add_solution_component` | Controlled addition of one existing supported component to an ordinary unmanaged solution |

### IDs, visibility and paging

A component's **native object/metadata GUID** is different from the
**solutioncomponent membership-row GUID**. Supply the former as component_id and
the native solution component type code as component_type. For a table, the object
GUID is its MetadataId; it is not its table ObjectTypeCode or a business row ID.
Membership reads return solutioncomponentid, objectid, componenttype, solution ID,
root-component ID and rootcomponentbehavior separately.

Root behavior 0 means include subcomponents, 1 means do not include subcomponents,
and 2 means shell only. These rows describe selected solution membership and root
settings; they do not enumerate the actual export ZIP payload. Implicit coverage
through an included table and all transitive deployment requirements are not
computed. A complete visible membership list is not a portable/deployable-solution
certificate.

Read tools return count, items and paging with complete/hasMore/page bounds,
visibility=current_caller and snapshot=false. top is a local returned-row limit
(default 500, maximum 5000); max_pages defaults to 5, maximum 20. Native requests
use a consistent Prefer:odata.maxpagesize header and server nextLink/skiptoken,
without combining paging with native $top or constructing $skip. A possible extra
row is retained only to identify truncation, then omitted from the returned list.

Continuations must remain in the same configured organization/API, collection or
Function, filter/select/order and parameter-alias scope. Absolute and same-service
root-relative links are supported. Cross-service/path/query changes, repeated
pages/IDs, duplicate paging options, malformed rows and oversized pages fail
instead of being treated as complete. Page/result sizes are bounded to 5 MiB and
native page rows to 5000. No arbitrary continuation is accepted from the caller.
A later call restarts the bounded query; there is no new durable cursor here.

The catalog may include managed/system solutions for inspection. Controlled adds
require a uniquely resolved visible unmanaged solution, no parent/patch solution,
and reject Default/Active/System targets. The selected solution's identity/state
is reread after successful addition. Source managed components may be referenced
in an unmanaged destination; this tool does not edit their definitions or managed
properties. Native permissions and platform restrictions remain authoritative.

### Dependency directions

Supply component_id/component_type and direction (default required):

| direction | Native Function | Meaning |
|---|---|---|
| required | RetrieveRequiredComponents | Components the selected component directly requires |
| dependent | RetrieveDependentComponents | Components directly depending on the selected component |
| delete | RetrieveDependenciesForDelete | Native dependency records that could block deletion |

The current CSDL must expose the expected unbound Microsoft.Dynamics.CRM Function
and ObjectId/ComponentType parameters. Step 7.1's CSDL parser, value validation and
Function literal serializer are reused. Read results project dependency type,
required/dependent object IDs/types, parent/base-solution IDs and optional native
dependencyid. A dependency record without dependencyid is permitted when both
endpoint identities are available; malformed endpoints are not silently dropped.
No arbitrary code, plugin configuration or native response text is returned.

Dependency reads do not delete or remove anything. Empty results do not prove
permission, absence of every possible blocker, full transitive closure or
successful deployment. canDelete remains not_assessed. Forbidden/unavailable
requests fail distinctly from a successful empty collection. Unsupported contracts
or paging fail explicitly; no unvalidated Function request is substituted.

### Controlled add

Example preview:

```json
{
  "solution_unique_name":"ExistingUnmanagedSolution",
  "component_id":"11111111-1111-1111-1111-111111111111",
  "component_type":61
}
```

For Attribute (2) and Entity Key (14), also provide logical_name for the parent
table. The resolver reads the native component and verifies GUID, parent context,
identity/display information and state. Supported additions are:

| Type | Component |
|---|---|
| 1 | Table/Entity metadata |
| 2 | Attribute metadata; parent logical_name required |
| 9 | Global Option Set metadata |
| 10 | Standard Entity Relationship metadata |
| 14 | Entity Key metadata; parent logical_name required |
| 26 | Public Saved Query |
| 60 | System Form |
| 61 | Web Resource |
| 90 / 91 / 92 / 93 | Plugin Type / Assembly / Step / Image |

Other types may still be queried through native dependency Functions but are not
exposed for controlled add in this batch. Source reads select identity fields;
DLL/script content, FetchXML/FormXML and secure/unsecure configuration are excluded.
This verifies an existing object's identity, not a byte-for-byte review of its
entire definition or export payload.

Addition defaults to **dry_run=true**. Preflight reads the destination, actual
component, current CSDL, complete visible membership inventory and native required
dependencies. Membership/dependency baselines are bounded to 5000 rows/20 pages;
incomplete data blocks planning. Preview shows the native request, selected object,
current membership and dependency evidence.

The requested scope is deliberately fixed: AddRequiredComponents=false and
DoNotIncludeSubcomponents=true. No caller option automatically expands the whole
dependency graph or includes all table objects. IncludedComponentSettingsValues is
sent as an empty collection only when the current CSDL declares it; older contracts
omit that field. Missing control flags, changed types, other operation namespaces
or unknown parameters are unsupported instead of triggering a broader fallback.
The platform can still create implicit parent shells or other membership artifacts.

Review the preview, then repeat the same arguments with dry_run=false,
expected_hash equal to planHash, and allow_unprotected_write=true. The plan binds
environment, solution/source identity fields, CSDL, request, visible membership and
required-dependency baseline. It is not a lock, does not freeze component contents,
and does not prevent concurrent solution/graph changes. The Action does not use a
business-table ETag as a solution/dependency lock.

An already matching explicit membership row produces noChange=true/saved=false
and preserves its existing root scope. Broader existing inclusion is not narrowed.
Implicit membership/export coverage is not inferred from parent roots. The only
mutation is native AddSolutionComponent POST; solutioncomponent rows are never
created/updated directly, and no component or solution is created, removed or deleted.

After a confirmed Action response, the tool rereads the solution and a complete
membership inventory. It verifies object/type membership and, when present, links
the native response's **id** to the matching **solutioncomponentid**. Table additions
also verify rootcomponentbehavior=1. Observed added/removed/changed membership rows
are reported as a nontransactional before/after observation, not proof that this
request caused every difference. Implicit shell rows remain visible in this delta.
No automatic PublishXml, export, deployment or full dependency inclusion is claimed.

A write rejection/not-sent retains saved=false; an unknown Action outcome retains
saved=null. A readback failure/mismatch/incomplete inventory retains saved=true,
phase=readback, destination and object identity. It never replays the Action or
attempts compensating deletion. Cancellation propagates through metadata,
dependency and membership reads and the native Action. Inspect the solution after
an uncertain outcome before deciding whether another operation is needed.

CamelCase aliases include solutionUniqueName, solutionId, componentId,
componentType, logicalName, maxPages, dryRun, expectedHash and allowUnprotectedWrite.
Native member/dependency response field names remain unchanged. Unknown inputs,
conflicting aliases and zero object/solution IDs are rejected.

Tests cover all twelve add types, catalog/membership filters, dependency direction,
CSDL variations, native paging/scope checks, source/target boundaries, preview
fingerprints, duplicate/no-change behavior, implicit shells, saved/unknown phases,
readback identity, cancellation and all three actual authentication request branches
with mocked transport. No real CRM was contacted. Native permissions, actual
component inclusion behavior, export contents and deployment portability remain
unverified. The initial export/import and asynchronous tracking scope follows below;
component removal, transitive graph analysis and destructive cleanup remain outside
this scope.

Native basis: [solution component membership](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/solutioncomponent),
[dependency messages](https://learn.microsoft.com/en-us/power-platform/alm/check-solution-dependencies),
[AddSolutionComponent](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/addsolutioncomponent),
[returned membership ID](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/addsolutioncomponentresponse)
and [native OData paging](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/query/page-results).

## Solution ZIP transfer and asynchronous import — step 7.3 initial scope

These four tools use Node and the same configured Web API request client. They
do not require .NET, PAC CLI, PowerShell modules or a separate SDK transport.
Online, AD/NTLM and IFD use their existing authentication branches. The current
service CSDL must expose the exact supported native Action and response contract;
an unavailable/incompatible operation is rejected before submission, with no
fallback to another backend or unchecked URL invocation.

`inspect_solution_package` accepts exactly one `file_path` or `content_base64`.
Local paths must be absolute; network/device paths are unsupported. Camel-case
aliases are accepted and conflicting aliases fail. Inspection works without CRM
settings, does not extract files or execute scripts/DLLs, and returns ZIP SHA-256,
size, entry count and a small `solution.xml` identity summary: unique name, version,
managed flag, publisher/prefix, root count and declared missing-dependency count.
It never returns package base64, full XML, script content or DLL bytes.

The supported ZIP format is deliberately bounded: compressed bytes <=32 MiB,
<=10,000 entries, each declared inflated payload <=64 MiB, aggregate <=256 MiB,
and solution.xml <=2 MiB. Stored/deflate entries, signed/unsigned data descriptors,
ASCII names and strict NFC UTF-8 names are supported. Headers, local/central sizes,
all payload CRCs, complete deflate consumption and nonoverlapping file ranges are
checked. Encryption, multi-disk/ZIP64, symlinks, alternative Unicode name extras,
absolute/traversal/device paths, duplicates/case collisions and file-prefix
collisions fail. Required files are solution.xml, customizations.xml and
[Content_Types].xml. The manifest accepts bounded non-namespaced ImportExportXml,
UTF-8 or BOM UTF-16LE, and rejects DTD/entities, malformed/ambiguous identity and
excessive structure. This is archive and manifest-identity validation, not a full
component XML schema check, code audit, digital signature check, dependency closure,
environment comparison or proof of deployment readiness. An archive may contain
arbitrary component content; the platform still validates actual import semantics.

`export_solution` requires a visible, ordinary unmanaged source solution and a new
absolute `output_path` ending in .zip. `managed` defaults false; true requests a
managed export from the same unmanaged source. Patches, built-in/reserved solutions
and managed source solutions are outside this workflow. It defaults to preview:

```json
{
  "solution_unique_name": "TransferDemo",
  "output_path": "D:\\Exports\\TransferDemo.zip"
}
```

Execute with `dry_run:false` and the returned `planHash` as `expected_hash`.
The fingerprint binds configured environment, native WhoAmI organization/user/BU,
source identity/state, current CSDL, body and resolved output destination. This
does not freeze source component contents or make the preview a snapshot.
Only native ExportSolution is called. Settings export flags are false when
declared; deprecated TargetVersion, internal and component-selection parameters
are not used. No publish occurs; export reflects native published-state semantics.

Execution reserves the destination exclusively before native export. Existing
files are never overwritten. The returned archive must match reviewed solution
name/version/managed mode, pass the ZIP checks, and match its local readback hash
and file identity. Success separates `exported:true` from `localSaved:true`.
On native/validation/filesystem failure, the error retains phase/export evidence
and the reserved path; that file may be empty or partial and must not be treated
as a valid export. Choose a new destination for a later attempt. The tool does not
automatically delete files, overwrite artifacts or replay a timed-out export.

`import_solution_async` also defaults to preview and accepts the same single ZIP
input as inspection. This first scope permits only ordinary **unmanaged first
imports**, with no currently visible solution of the same unique name. Managed
imports, existing-solution updates, patches/holding/upgrade and environment-variable
or connection-reference overrides require a later workflow. Visible absence is
scoped to the current caller and is not a platform-wide absence/permission proof.

```json
{
  "file_path": "D:\\Exports\\TransferDemo.zip",
  "dry_run": true
}
```

Review the manifest, target environment and public native body, then execute with
the same input, `dry_run:false`, `expected_hash:planHash` and
`allow_unprotected_write:true`. Package bytes are read once per call and held for
that call; the fingerprint uses their actual hash, not just the filename. Changing
bytes, native caller/organization, CSDL or plan invalidates review. The Action has
no confirmed atomic plan/solution/component lock. **A first import can change shared
unmanaged components.** OverwriteUnmanagedCustomizations=false protects the specific
managed-overlay behavior described by the native API; it is not a general guarantee
that existing unmanaged component definitions remain unchanged.

The native body fixes OverwriteUnmanagedCustomizations/PublishWorkflows=false,
and, when exposed, SkipProductUpdateDependencies/HoldingSolution/StageAndUpgrade/
SchemaUpdatesOnly=false and ComponentParameters=[]. It does not skip dependencies,
activate workflows by request, stage upgrades, supply environment overrides or send
a separate PublishXml/PublishAll request. Native import can still have platform
side effects; no broader no-publish/no-activation guarantee is inferred from flags.

A client GUID is generated at execution for native **ImportJobId**. An accepted
response returns **AsyncOperationId** and **ImportJobKey**; the latter is a string
key and is preserved separately from the supplied GUID, with an explicit match
indicator. The supplied importJobId is not yet readback-verified. `accepted:true`
does not imply `completed:true` or deployment verification. A rejected/not-sent
submission retains accepted=false; an unknown network/server result retains
accepted=null and the supplied importJobId. Inspect that job before considering a
new submission. A malformed receipt after HTTP acceptance retains accepted=true.
None of these paths automatically resubmits, switches transport, compensates or
publishes. Existing request-layer authentication refresh remains unchanged.

`get_solution_import_status` takes `async_operation_id` and/or `import_job_id` from
the receipt. Each call performs bounded reads once; no sleep, automatic polling,
schedule, cancel, restart or resubmission is performed. Async completed state 3 with
status 30/31/32 reports succeeded/failed/cancelled; nonterminal observations remain
pending or unknown. Native operationtype=203 is reported separately as solution
import type evidence. Importjob progress (including 100) is not success proof.
If an importjob supplies solution ID/name, a separate native catalog read can verify
that identity; it does not verify component contents, versions against a package,
publication, runtime/UI behavior, or a causal relation between caller-supplied job
IDs. Forbidden, unavailable/hidden/deleted and failed reads stay distinct from an
empty success result. Raw data, messages, logs and configurations are not selected
or returned. Acceptance, async terminal state, progress, identity readback and full
deployment verification remain separate concepts.

Offline coverage includes malformed ZIPs, source/package/metadata/caller changes,
native contract compatibility, exclusive output and identity/hash checks, rejected/
unknown/accepted submissions, invalid receipts, independent status/readback gaps,
cancellation, MCP routing and all three real request-layer branches with mocked
transport. Real CRM export/import, certificates/proxies/permissions and platform
side effects remain unverified. The initial environment comparison, selected-scope
verification and explicit log retrieval scope follows below. Carefully reviewed
existing-solution/managed/upgrade workflows and asynchronous export remain pending.

Native basis: [ExportSolution](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/exportsolution),
[export response](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/exportsolutionresponse),
[ImportSolutionAsync](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/importsolutionasync),
[import receipt](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/importsolutionasyncresponse),
[system job states](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/asyncoperation)
and [import job fields](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/importjob).

## Portable solution snapshots, selected-scope checks and import logs — step 7.4 initial scope

All four tools are read-only. They use Node and the existing Web API client without
.NET/PAC CLI or a second authentication backend. They never publish, import, repair,
delete, retry a submitted import, poll automatically or schedule work.

`get_solution_snapshot` captures the **currently configured** environment. It accepts
`solution_unique_name`, `top` (default 100, max 200 visible memberships) and
`max_pages` (default 5, max 20). Example:

```json
{"solution_unique_name":"TransferDemo","top":100,"max_pages":5}
```

The result's `snapshot` object is versioned as d365.solution.snapshot.v1. It includes
capturedAt, organization/user/BU from WhoAmI, solution identity, explicit membership
and roots, selected definitions/hashes and completeness/stability evidence. Save
that complete object as JSON or pass it directly to the comparison tool. Capture
source and target through separately configured MCP servers/sessions. These tools
do not accept target URLs or credentials and do not switch/reuse one environment's
token for another environment.

The initial component profiles cover:

| Type | Selected properties |
| --- | --- |
| 1 Table | Logical/schema/set/primary attribute names, ownership/activity/audit value and localized labels/descriptions |
| 9 Global Picklist | Name/type/global scope, labels/descriptions, values and option labels/descriptions/colors |
| 10 Relationship | Schema/type and 1:N endpoint/lookup names plus six cascade settings, or N:N endpoint/intersect names |
| 61 Web Resource | Native name/display name/type and exact content byte SHA-256/length |
| 91 Plugin Assembly | Name/version/culture/public key/source/isolation and exact binary byte SHA-256/length; non-package database source only |

Binary content is bounded to 16 MiB per Web Resource/assembly and is never returned
or executed. These are byte comparisons, not semantic script normalization or DLL
behavior/signature validation. Package/unsupported assemblies and missing content
become explicit gaps; environments without the selected native properties can also
return a gap. The snapshot itself is <=2 MiB, a selected component <=64 KiB, each
label collection <=128 languages and global Picklist <=1,000 values. Membership
paging retains the existing same-service/path/query checks. Partial definition
continuations, malformed native IDs/labels, unsupported profiles and read failures
cannot become complete definitions.

Only selected properties are captured. There is no table attribute/child expansion,
full relationship menus/settings, form/view XML, workflow/step/Image definition,
Custom API, ribbon, managed layer, dependency closure or environment-variable/
connection-reference comparison in this format. A root's include-all behavior does
not prove its nested payload was inspected. Native definitions are read normally;
no unpublished retrieval or publish is requested, and publication remains unverified.
The tool rereads membership/solution state to detect observed changes but does not
freeze definitions or claim an atomic snapshot. Caller visibility, truncation,
unsupported components and detected changes remain explicit in `coverage`.

`compare_solution_snapshots` runs **without CRM configuration**. It accepts the
source and target `snapshot` objects as `source_snapshot` / `target_snapshot`.
It validates strict versioned shape, bounds, canonical properties, component hashes
and the snapshotHash. These hashes detect inconsistency, not authenticity: a caller
can edit and recompute them. Use a trusted baseline when interpreting a result.

Portable keys use logical/schema names, Web Resource name, or assembly identity.
Environment/solution/component/member/label GUIDs are retained as evidence but
excluded from matching selected definitions. Root membership references are mapped
through portable root keys. LocalizedLabels sort by LCID and ignore UserLocalizedLabel
and transport IDs; options sort by numeric value. **Option display order is outside
the comparison scope.** Meaningful GUID literals inside code/binary content are not
stripped. Binary content must match exactly.

Results include solution name/version/managed differences, `missingInTarget`,
`extraInTarget`, changed component references and property paths, matched keys,
ambiguous identities, unresolved root scope and evidence gaps. `expected_managed`
can explicitly select the intended target state, such as true for a managed export
of an unmanaged source; version still compares against the baseline.

`selectedScopeCheck` is matched, different or inconclusive. Unsupported/hidden/
forbidden components, unstable/incomplete inventories, duplicate portable keys and
unknown roots make the result inconclusive. Known differences are still reported.
If the opposite inventory has unresolved rows, an unmatched key is placed in
`unmatchedInSource` / `unmatchedInTarget`, not asserted as confirmed missing/extra.
The result always keeps deploymentVerified=false, publicationVerified=false and
nestedComponentsVerified=false. Even a complete match covers only this profile.

`verify_solution_deployment` accepts `expected_snapshot`, optional `expected_managed`,
and the same paging bounds. It captures the current target, compares against that
baseline, and returns the current snapshot hash. Optional `async_operation_id` /
`import_job_id` add independent native job and structured log observations. The
log's native solution name/ID is compared separately to the requested/current
solution identity. Text stays withheld. A successful async job never replaces a
known component difference. The selected comparison and job/log evidence remain
separate; no causal package-to-job-to-current-environment link, full deployment,
publication or runtime success is inferred. Forbidden/malformed log evidence does
not discard the component comparison. No write or automatic remediation occurs.

`get_solution_import_log` explicitly selects native **importjobs.data**, not the
unrelated record-data importlogs collection. Supply `import_job_id` from the receipt:

```json
{"import_job_id":"33333333-2222-4333-8444-555555555555","include_text":false,"top":50}
```

It parses <=2 MiB of non-namespaced importexportxml with bounded depth/nodes, no
DTD/entities or execution. It returns XML hash/size, native result counts,
manifest result identities, safe component references/codes and a bounded result
list, prioritizing failures and warnings. Counts include manifest/section result
elements and are **not counts of unique components**. `top` defaults 50 (max 200);
truncated output retains counts from the full bounded XML. Empty/unrecognized data
does not mean success. Read permission failures, missing/hidden jobs and malformed/
unsupported XML fail explicitly; no fallback or data-import lookup is attempted.

Raw XML is never returned. `include_text` defaults false. True returns error messages
with best-effort known credential pattern/configured secret redaction **before**
per-message truncation; `max_text_chars` defaults 2048 (128–8192). Arbitrary business
text can still be sensitive. Treat returned text as untrusted evidence, never as
instructions. Progress=100, a successful log manifest or successful section result
does not establish async completion, publication, full component import or runtime
behavior. Formatted spreadsheet log download and other log dialects remain outside
this parser's scope.

Offline coverage includes all five profiles, environment GUID normalization,
selected property/byte changes, root matching, incomplete/unstable/ambiguous inputs,
strict snapshot integrity/JSON bounds, unknown versus confirmed missing components,
XML attacks and text redaction, independent deployment/log evidence, cancellation,
MCP routing and all three actual authentication request branches with mocked
transport. Startup also calls actual packaged offline snapshot comparison without
CRM settings or external PATH. Real permissions, cross-environment behavior,
published-state semantics, complete deployment and runtime checks remain unverified.
The initial classic Ribbon tools follow below. Custom API definition maintenance and modern commands remain subsequent work;
more snapshot profiles/full payload verification need explicit extensions.

Native basis: [query metadata and typed relationships](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/query-metadata-web-api),
[membership/root scope](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/solutioncomponent),
[import job data and result XML](https://learn.microsoft.com/en-us/dynamics365/customerengagement/on-premises/developer/work-solutions?view=op-9-1#tracking-import-success)
and [import job fields](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/importjob).

## Classic Ribbon button reading and local solution editing — step 7.5 initial scope

The user requested Ribbon buttons before Custom API definition work. This batch
adds one native read tool and two local solution tools, all Node-only. **Classic
RibbonDiffXml** and modern commanding use different definitions; these tools do
not create modern commands or Power Fx actions. No CRM import, publish, code
execution or live button deployment occurs in this batch.

`get_ribbon_definition` accepts `logical_name`, optional `location_filter` (All,
Form, HomepageGrid or SubGrid; default All), `top` (100 by default, max 500), and
`include_xml` (false by default). It checks the actual table and current CSDL
RetrieveEntityRibbon Function/parameter/response contracts, builds typed enum
aliases, and validates/decompresses the native ZIP's **RibbonXml.xml** part within
2 MiB. The ZIP uses the existing 32 MiB/header/path/inflation/CRC bounds. No files
are extracted and no scripts are evaluated.

The read result summarizes button attributes, commands, rule references, JavaScript
library/function references, parameter **types** and candidate insertion locations.
Parameter literal values are withheld. `include_xml:true` explicitly returns the
bounded effective XML, which can contain sensitive parameter literals. Truncation
is explicit. Effective merged Ribbon XML is evidence for IDs and placement, not
an editable solution diff, per-user visibility/security result, publication proof,
or confirmation that a handler works in the browser.

`inspect_ribbon_solution` works without CRM settings. Supply exactly one absolute
local `file_path` or canonical `content_base64`, plus the table `logical_name`.
It reuses full ZIP validation, locates exactly one Entities/Entity/Name and its
RibbonDiffXml in **customizations.xml**, and returns a bounded summary. Optional
`include_xml:true` returns only that table's diff, never the rest of the solution's
customizations or resource payloads. Application/global ribbons are outside this
scope. Native merged definitions are not accepted as a replacement for a diff.

`edit_ribbon_solution` is a local candidate builder. It accepts the same package
input/table plus 1–20 ordered `changes`, a new absolute .zip `output_path`, and
optional `dry_run`/`expected_hash`. Top-level camelCase aliases are accepted;
nested changes use the exact snake_case schema. The input must be an ordinary
unmanaged package, not managed, patch/parent or a reserved built-in solution.

Supported changes are:

| operation | Scope |
| --- | --- |
| add_button | New standalone CustomAction/Button and JS CommandDefinition, multilingual labels, two packaged raster/ICO Web Resource icons and explicit ordered parameters |
| update_button | Existing publisher-scoped standalone custom button labels and/or sequence; handler/rules and independent tooltip references are preserved |
| set_visibility | Add/remove a dedicated always-false display-rule gate for an unshared publisher-scoped custom command; other display rules/layers still apply |

IDs must begin with the solution publisher prefix followed by `.` or `_`, be
distinct and avoid existing definition IDs. Built-in replacements, arbitrary
commands/XML, nested menu/flyout editing, handler replacement, general rule editing,
global ribbons, delete-all actions and managed layer changes are not supported.

An add requires an **explicit** current-table location such as
Mscrm.Form.demo_table.MainTab.Actions.Controls._children. Use the native read to
inspect current IDs; the local editor checks location shape/table scope, not its
existence in a live target. It never guesses that every environment has the same
group. Form, HomepageGrid and SubGrid locations are supported. The caller supplies
the qualified JavaScript function and ordered crm/string/bool/int parameters.
Supported CRM values are PrimaryControl, SelectedControl,
SelectedControlSelectedItemIds and SelectedControlSelectedItemReferences. Function
existence, signatures and browser/context behavior are not executed or proven.

Referenced JS and icons must be uniquely present in the same package's WebResources
metadata with an existing ZIP payload and supported type: JS=3, icons=5/6/7/10.
Root-relative exported FileName references and backslashes are resolved only inside
the validated archive. Missing target-only resources are not assumed to exist.
No resource is created/uploaded, and image dimensions/content validity or resource
publication is not verified. Existing actions remain unchanged during label edits.

Example preview for a package with publisher prefix **demo** and the specified
JS/icon resources already included:

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

The default preview writes nothing and returns planHash, source/candidate package
hashes, before/after summaries, changes and preservation evidence. Execute with the
same inputs, `dry_run:false` and the returned planHash as `expected_hash`. The hash
binds actual source bytes, table, ordered changes, candidate bytes and resolved
destination. Editing source bytes/changes/path invalidates review. Output is an
exclusive **new** file; input and existing destinations are never overwritten.
File/hash readback is verified. A filesystem failure can leave an empty/partial
reserved file and reports localSaved=false/null rather than a valid artifact.

Localized text merges supplied LCIDs while preserving other languages. A shared or
ambiguous destination label is rejected. Button sequence updates both Button and
its CustomAction. Shared commands or modified/shared dedicated hidden rules are
rejected rather than changing other controls. Hiding uses a new DisplayRule with
two contradictory CrmClientTypeRule checks (Web and inverted Web) and preserves all
existing rules/actions. It does not generate HideCustomAction. Showing removes only
this gate, preserves pre-existing HideCustomAction and other rules, and never
promises runtime visibility or bypasses permissions.

Only customizations.xml is reserialized; other ZIP payloads **and local compressed
blocks** are preserved. The solution manifest/version is unchanged. The editor
checks semantic equality outside the selected Ribbon subtree and reparses the
candidate to verify its Ribbon hash. UTF-8/BOM UTF-16LE input becomes consistent
UTF-8 for the changed XML. customizations.xml is bounded to 4 MiB/depth/nodes and
rejects DTD/entities or namespaced RibbonDiffXml; it is not a full platform/XSD or
JavaScript validator. Unrelated definitions and file content are not executed.

**Saving the candidate is not deployment.** Importing a solution applies the whole
package, including other unchanged components. No Ribbon-only atomic write,
current-target concurrency lock, live rules/handler/location check or safe rollback
is inferred. The existing import_solution_async tool supports first unmanaged
imports and cannot be used to update the already installed source solution through
this workflow. Existing-solution import, independent publication and effective
Ribbon/UI readback require a separately reviewed workflow and real test environment;
the initial controlled classic Ribbon workflow is described below.
No EntityDefinitions.RibbonDiffXml PATCH or direct system-table mutation is used.

Offline tests cover add/update/hide/show, language/tooltip/handler preservation,
shared references, explicit resource/location scope, ZIP stored/deflate/descriptors,
unchanged compressed payloads/XML, encoding, review/exclusive file rules, hostile
XML/ZIP, native CSDL/typed aliases, cancellation, MCP routes and all authentication
request branches with mocked transport. Packaged startup also previews, writes and
inspects an actual local candidate without CRM settings or external PATH. Native
permissions, package import, publish, effective button behavior and modern commands
remain unverified/unimplemented as applicable.

Native basis: [RetrieveEntityRibbon](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/retrieveentityribbon),
[compressed Ribbon part](https://learn.microsoft.com/en-us/power-apps/developer/model-driven-apps/export-ribbon-definitions),
[supported export/edit/import path](https://learn.microsoft.com/en-us/power-apps/developer/model-driven-apps/export-prepare-edit-import-ribbon),
[custom actions](https://learn.microsoft.com/en-us/power-apps/developer/model-driven-apps/define-custom-actions-modify-ribbon),
[display rule semantics](https://learn.microsoft.com/en-us/power-apps/developer/model-driven-apps/define-ribbon-display-rules)
and [action parameters](https://learn.microsoft.com/en-us/power-apps/developer/model-driven-apps/define-ribbon-actions).

## Controlled existing-solution Ribbon import, separate publish and readback — step 7.6 initial scope

These three tools extend the classic Ribbon candidate workflow without changing
the **first-import-only** contract of import_solution_async. They do not permit an
arbitrary existing-solution update, managed/holding/upgrade flow, target URL override,
environment/connection overrides, backend fallback or modern commanding update.
All use the configured organization and existing Online/AD/NTLM/IFD Web API client.

All three tools require local `source_file_path`, `candidate_file_path`,
`logical_name` and the same ordered `changes` used by edit_ribbon_solution. Paths
are absolute regular local files within the existing 32 MiB ZIP bounds; network/
device paths are rejected. Each call reads stable bytes and replays the structured
edits. **The candidate bytes must match this server version's replay exactly.**
If it was repacked, edited outside the tool, or generated by an incompatible
serializer/compressor version, regenerate/review the local candidate; the tool does
not silently relax this check. Other payload/manifest/outside-Ribbon preservation
checks from the editor remain in force. File/changes inputs are bounded JSON, not
an arbitrary import body. No raw package base64 or action parameter literals are
returned in previews.

`import_ribbon_solution` defaults to preview. It checks native WhoAmI, an exact
existing visible ordinary unmanaged solution with the same name/version and no
parent, the actual publisher name/prefix, a customizable table, current CSDL, and
a complete visible membership inventory containing that actual table. A managed
underlying table can be used only when it is customizable; the target solution
itself must be ordinary unmanaged.

Preflight invokes native **ExportSolution POST** with managed=false and settings
flags=false. This is a read/export operation, not an import or metadata mutation.
It can require export permission and take time even in preview. The fresh package
must match the source's complete exportable payloads: ignore ZIP compression/
timestamps and XML formatting/attribute order, but preserve IDs, substantive XML,
manifest and all other payload bytes. No blanket GUID or business-data stripping
is used. An old/different source, changed unrelated component, incomplete inventory,
wrong publisher/version or incompatible contract blocks before import. Platform
export normalization/version differences may conservatively require a new baseline;
no automatic source replacement, target edit or validation bypass is attempted.

The planHash binds package/changes hashes, configured/native organization and caller,
solution/publisher/table identities, current CSDL, membership and fresh export
fingerprints, and the native public body. Execute with `dry_run:false`, current
`expected_hash`, `allow_unprotected_write:true`, and
`allow_full_solution_import:true`. Native import applies the **whole existing
unmanaged solution**, including other unchanged components; this is not an atomic
Ribbon-only update. Remaining concurrent/pending customization windows are not
locked. Source/candidate/target changes invalidate review. An unchanged selected
Ribbon returns noChange without submitting or minting an import receipt.

The only submission is ImportSolutionAsync with a client-generated ImportJobId.
It fixes OverwriteUnmanagedCustomizations/PublishWorkflows=false and, when exposed,
SkipProductUpdateDependencies/HoldingSolution/StageAndUpgrade/SchemaUpdatesOnly=false
and ComponentParameters=[]. The overwrite flag is not a general no-overwrite promise
for shared unmanaged components. Internal/obsolete parameters and environment
overrides are not used. No publish or automatic polling follows. Rejection/not-sent
keeps accepted=false, unknown transport/server outcome keeps accepted=null and the
recovery ImportJobId, and malformed tracking after HTTP acceptance keeps accepted=true.
No path automatically reimports or retries a submitted import.

A valid native acceptance also returns `importReceipt`. Its payload binds the
organization/caller/solution/table, source/candidate/changes and native async/import
job IDs; it is integrity-protected with an in-memory HMAC. **It is valid only in the
same running server process**, not a durable cross-process credential or proof of
CRM permissions. Keep the process running through the separate publish phase.
Modified receipts or receipts from a restarted/different process are rejected
before publication. **Do not reimport to regenerate a lost/expired receipt.** Use
get_solution_import_status, get_solution_import_log and verify_ribbon_deployment
for read-only recovery; durable receipt adoption and recovery publication require
a separate reviewed extension. There is no implicit fail-open/manual-ID fallback.

`publish_ribbon_solution` requires those same files/changes and the unchanged
`import_receipt`. In addition to rechecking native context, it requires the receipt's
actual async operation to be completed/succeeded with solution-import type, its
import job to match the native solution ID/name, and a bounded matching completed
import log with one successful solution manifest and no failure/unknown results.
Warnings are retained as counts; progress=100 alone cannot pass the gate, while a
lower progress number does not override independently verified native terminal/log
success. Forbidden/missing/unfinished/malformed evidence blocks publication.

Publication has its **own preview and planHash**. It checks exportable non-Ribbon
payloads against the source again, current effective Ribbon and CSDL PublishXml,
and binds those observations to the receipt/import evidence. Execute separately
with `dry_run:false`, current `expected_hash`, `allow_unprotected_write:true` and
`allow_full_table_publish:true`. The native body publishes exactly the named table:

```xml
<importexportxml><entities><entity>demo_table</entity></entities></importexportxml>
```

This scope includes **other pending fields, forms, views and Ribbon customizations
on that table**. Pending contents are not completely read or locked; a fresh
published/exportable snapshot is not a complete pending-state snapshot. The flag
explicitly acknowledges that native scope/concurrency limitation. Referenced
JavaScript/image Web Resources are **not published by this table-only request**;
their publication remains a separate Web Resource operation. No code execution,
full package/runtime validation, rollback, PublishAll or hidden resource publish
occurs here.

A native publish rejection/not-sent keeps published=false; unknown outcome keeps
published=null. After a successful response, published=true is preserved even if
readback fails or the definition differs. Errors retain the publish phase and import
completion evidence and never replay import/publish. Use read-only verification
after an unknown outcome or metadata propagation delay rather than automatically
writing again. Existing request-layer authentication refresh remains unchanged.

The automatic post-acceptance readback and `verify_ribbon_deployment` compare only
the changed buttons against native effective classic definitions: selected button
attributes, command/action/parameter structure, local display rules and localized
labels (LCIDs normalized). Raw values/parameter literals are not emitted. Missing,
ambiguous or transformed evidence remains different/inconclusive rather than a
false match. This does not evaluate client layout/location, effective privileges,
per-user visibility, Web Resource content/publication, JavaScript behavior or UI.
deploymentVerified/runtimeVerified remain false even when selected definitions match.

`verify_ribbon_deployment` is read-only, requires no receipt and performs no export,
import, publish, retry or repair. It validates the local candidate and resolves the
current configured target, then returns native definition comparisons. A match
does not independently prove that the package was imported/published or establish a
durable job-to-current-state causal chain. It is usable for inspecting results after
receipt loss or an uncertain submission without causing another write.

Offline tests cover exact replay, stale export payloads, publisher/version/table/
membership/CSDL gates, full-scope review, no-op, all native submit outcomes,
same-process receipt binding/tampering/process loss, terminal/log checks, independent
publish, partial readback evidence, definition mismatches, label ordering,
cancellation, routing, and all three real authentication request branches with
mocked transports. Existing transfer/editor contracts retain regression coverage.
No real CRM import, publish, permission/certificate/proxy, pending-state behavior,
export normalization, client-side button display or script/runtime validation has
been performed. Modern commands and broader Ribbon/customization workflows remain
separate work.

Native basis: [ImportSolutionAsync](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/importsolutionasync),
[import response IDs](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/importsolutionasyncresponse),
[PublishXml](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/publishxml),
[Ribbon export/edit/import and publish](https://learn.microsoft.com/en-us/power-apps/developer/model-driven-apps/export-prepare-edit-import-ribbon)
and [native import log data](https://learn.microsoft.com/en-us/dynamics365/customerengagement/on-premises/developer/work-solutions?view=op-9-1#tracking-import-success).
