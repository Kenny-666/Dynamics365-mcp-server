# Project Structure

Overview of the `dynamics365-mcp-server` directory structure and its core components.

```
MCPServer/
├── src/                          # Source code
│   ├── tool_handler.ts           # Shared tool definitions and execution logic
│   ├── config.ts                 # Environment parsing and configuration validation
│   ├── errors.ts                 # Structured, sanitized tool errors
│   │
│   └── services/                 # Service Layer
│       ├── d365Auth.ts           # OAuth/ADFS token requests and NTLM Web API client
│       ├── requestPolicy.ts      # Retry-After, cancellable waits and bounded backoff
│       ├── queryState.ts         # Explicit state policy and metadata validation
│       ├── queryPaging.ts        # Bounded pagination and buffered continuations
│       ├── queryXml.ts           # Strict XML parsing and native paging-cookie decoding
│       ├── environment.ts        # Native identity/version and metadata inspection
│       ├── webResource.ts        # Web Resource preview/save, concurrency and scoped publication
│       ├── pluginStep.ts         # Native step discovery/query/register/update and phase evidence
│       ├── pluginStepValidation.ts # Alias normalization, validation and configuration-safe errors
│       ├── pluginImage.ts        # Native Pre/Post image plans, concurrency and verified write phases
│       ├── pluginAssembly.ts     # Assembly compatibility preview, conditional PATCH and binary/type readback
│       ├── assemblyInspector.ts  # Bounded local sources and fixed optional .NET metadata-reader process
│       ├── recordMutation.ts      # Shared native write plans, conditions, previews and response evidence
│       ├── recordMutationInput.ts # Mutation argument, JSON-size and reference validation
│       ├── recordMetadata.ts      # Table/key/type/navigation metadata lookup
│       ├── recordBatch.ts         # Independent chunks, atomic groups, progress and cancellation
│       ├── recordBatchWire.ts     # Native multipart composition and bounded response parsing
│       ├── readEvidence.ts        # Read-only validation, bounded paging, projection and source statuses
│       ├── diagnostics.ts         # Current switches, traces, failed jobs and step-ID evidence links
│       ├── securityEvidence.ts    # Visible principal/role catalogs and native effective record access
│       ├── auditEvidence.ts       # Native audit functions, paging and value/metadata boundaries
│       ├── modelMetadata.ts       # Full definitions, schema creation, label PUT and scoped publication
│       ├── modelStructure.ts      # Native 1:N/N:N/Lookup creation and alternate-key index evidence
│       ├── modelMaintenance.ts    # Existing settings/menus/cascades PUT and Failed-key index resubmission
│       ├── modelChoices.ts        # Native global/local choices, option actions and scoped publication
│       ├── modelUi.ts             # Saved/unpublished UI reads, capability-gated PATCH and readback
│       ├── modelUiXml.ts          # Bounded FormXML/FetchXML/LayoutXML structural operations
│       ├── cache.ts              # Caching service (node-cache)
│       ├── entitySchema.ts       # Entity metadata services
│       ├── optionSet.ts          # OptionSet mappings
│       ├── relationship.ts       # Entity relationship logic
│       ├── fetchXml.ts           # FetchXML query processing
│       ├── metadata.ts           # Org and User context service
│       ├── apiOperationMetadata.ts # Bounded namespace-aware CSDL signatures, types and imports
│       ├── apiOperationValues.ts # Typed values, references and native Function alias literals
│       ├── apiOperation.ts       # Operation discovery, binding/overload plans and native invocation
│       ├── solutionSupport.ts    # Solution inputs/errors and bounded same-query native paging
│       ├── solutionComponent.ts  # Supported native component identity resolution without code/configuration
│       ├── solution.ts           # Catalog/membership/dependencies and reviewed AddSolutionComponent
│       └── record.ts             # CRUD operations service
│
├── src/debug/                    # GUI Debugging Tools
│   ├── server.ts                 # Debug bridge HTTP server
│   ├── requestGuard.ts           # Loopback origin/Host checks and static path boundary
│   └── ui/                       # Frontend application (HTML/CSS/JS)
│
├── dist/                         # Build artifacts
│   └── index.cjs                 # Standalone Bundle (all-in-one release)
│
├── bin/                          # CLI entry points
│   └── dynamics365-mcp-server.js # Loads the bundle in the current Node process
├── tests/                        # Offline configuration and startup regression checks
│
├── package.json                  # Dependencies and scripts
├── tsup.config.ts                # Bundling configuration
├── tsconfig.json                 # TypeScript configuration
└── README.md                     # Project documentation
```

`src/tools/webResourceTools.ts` contains the four Web Resource JSON Schemas, included
in the shared tool registry. `tests/webResource.test.mjs` covers their contracts,
native calls and partial failure behavior; `tests/debug.test.mjs` covers the debug
request and static path boundaries.

`src/tools/pluginStepTools.ts` contains four plugin registration/step schemas;
`tests/pluginStep.test.mjs` covers secure configuration, conflict policies,
conditional updates, phase failures and three-auth-mode request integration.

`src/tools/recordMutationTools.ts` registers the existing three CRUD writes and five
key/association/batch tools. `src/types/recordMutation.ts` defines shared native
plans/results. `tests/recordMutation.test.mjs` and `tests/recordBatch.test.mjs` use
`tests/recordMutation.fixture.mjs` for offline table/key/relationship and wire data.
MCP request signal and progress notifications are connected in `src/index.ts`.

`src/tools/evidenceTools.ts` registers nine read-only evidence tools. Their native
shapes, missing/forbidden sources, credential exclusion, paging and three-auth
request paths are covered by `tests/evidence.test.mjs` and `tests/evidence.fixture.mjs`.

## Key Modules

`src/tools/modelMetadataTools.ts` registers five step-6.1 definition/create/label/
publication tools. `tests/modelMetadata.test.mjs` covers native requests, publisher
prefixes, managed properties, multilingual preservation, preview fingerprints,
readback evidence, cancellation and the three authentication request branches.

`src/tools/modelStructureTools.ts` adds relationship/key inspection and creation.
`tests/modelStructure.test.mjs` with `tests/modelStructure.fixture.mjs` covers
read-only native eligibility actions, deep Lookup, N:N intersect, key constraints,
async index/job evidence and failure phases. Validation/request/save primitives
are shared with `modelMetadata.ts`; relationships and keys are not written as
ordinary business records.

`src/tools/modelChoiceTools.ts` registers four choice tools. The expanded
`modelMetadata.ts` resolves nine column types, including native Virtual-backed
MultiSelect, shared global bindings and allocated option readback.
`tests/modelChoices.test.mjs` and `tests/modelChoices.fixture.mjs` cover allocation,
choice identity, MergeLabels, shared/managed scope, new columns and authentication.
The debug form accepts JSON for union types such as Boolean/integer default_value.

`src/tools/modelUiTools.ts` registers four UI component discovery/read/edit tools.
`tests/modelUi.test.mjs` with `tests/modelUi.fixture.mjs` covers field/control
references, libraries/events, view dependency preservation, XML boundaries,
concurrency, save phases and a fully simulated field-to-publish scenario.

### Tool Handler (`src/tool_handler.ts`)
The single source of truth for tool definitions and their respective handlers. It ensures that both the Stdio MCP server and the Debug GUI share the same logic.
CRM services are initialized lazily after configuration validation. Tool discovery and
local cache clearing work without CRM configuration. Configuration failures do not
retain a partially initialized service instance.

### Service Layer (`src/services/`)
Encapsulates all interactions with the Dynamics 365 Web API. Each service is focused on a specific functional area (e.g., Records, Metadata, Auth).

### Debug GUI (`src/debug/`)
A standalone HTTP server that serves a Web UI for testing and debugging MCP tools. It uses dynamic form generation to adapt to any changes in the toolset.

`src/services/pluginImage.ts` and `src/tools/pluginImageTools.ts` add native image
query/register/update/delete. `tests/pluginImage.test.mjs` covers explicit field
selection, step/message availability, alias collision bags, preview fingerprints,
metadata-gated ETags, cancellation, phase evidence and a simulated image lifecycle.
It reuses configuration-safe plugin errors and the shared authenticated transport.

`src/services/assemblyInspector.ts` invokes only the fixed metadata reader in
`bin/assembly-inspector` (.NET 10 Runtime optional for binary tools). Reader source
and rebuild script are under `tools/assembly-inspector` and `scripts/build-inspector.mjs`.
It reads PE/CLI metadata without loading inspected assemblies. It is separate from
CRM transport; native assembly PATCH still uses D365AuthService.

`src/services/pluginAssembly.ts` and `src/tools/pluginAssemblyTools.ts` add local
inspection, bounded metadata listing and a conservative existing-assembly update.
`tests/pluginAssembly.test.mjs` covers real compiled fixtures in
`tests/fixtures/assemblies`; `scripts/build-assembly-fixtures.mjs` regenerates test
binaries using disposable signing keys and a test SDK stub. No fixture is deployed
or executed. Package startup tests also invoke the included reader without CRM
settings; full tests require .NET Runtime but not SDK/fixture compilation.

`src/services/modelMaintenance.ts` extends the existing structure/metadata service
with structured column settings and relationship menus/cascades, plus Failed key
index reactivation. `modelStructure.ts` exposes only its existing read helpers as
protected for reuse. `src/tools/modelMaintenanceTools.ts` adds three tools.
`tests/modelMaintenance.fixture.mjs` and `tests/modelMaintenance.test.mjs` cover
nine column types, full PUT preservation, fingerprints, 1:N/N:N menus/cascades,
Action acceptance versus key/job readiness, safe failure phases and cancellation.
Native metadata PUT/Action remain explicitly unprotected and never reuse business
record concurrency settings as metadata locks. All new paths use Node/Web API.

`src/services/apiOperationMetadata.ts` parses bounded namespace-aware CSDL types,
entity sets, signatures and imports. `apiOperationValues.ts` validates structural
values and builds native Function literals; `apiOperation.ts` resolves binding
and overloads, previews, invokes and sanitizes errors. `src/tools/apiOperationTools.ts`
adds signature discovery and owns the enhanced existing invocation schema.
RecordService's source-level legacy method delegates to the same implementation.
`tests/apiOperation.fixture.mjs` / `tests/apiOperation.test.mjs` cover metadata,
legacy responses, binding, types, encoding, limits and all authentication branches.
These paths use Node and the existing Web API client, without .NET requirements.

`solutionSupport.ts` provides strict scalar inputs, safe errors and bounded native
paging that keeps organization/API/path/filter/alias scope. `solutionComponent.ts`
resolves twelve supported native object types without reading code/XML/configuration.
`solution.ts` composes catalogs, native dependency Functions and reviewed membership
adds; it reuses CSDL/value primitives from step 7.1 and never writes solutioncomponent
rows directly. `src/tools/solutionTools.ts` registers four tools. Tests in
`solution.test.mjs` / `solution.fixture.mjs` cover types, paging, dependency direction,
CSDL contracts, plan changes, implicit shells, failure evidence and authentication.

`solutionPackage.ts` provides bounded Node-only ZIP/header/path/CRC validation,
regular-file/base64 reads, manifest identity and hashing without extraction or
execution. `solutionTransfer.ts` validates fixed native transfer contracts, caller
identity and review hashes, exports to exclusive local files, submits first ordinary
unmanaged imports once and reads independent native job/solution observations.
`src/tools/solutionTransferTools.ts` adds four tools. `solutionTransfer.fixture.mjs`
and `solutionTransfer.test.mjs` cover archive attacks, fingerprint/native scope,
artifact checks, acceptance/unknown/readback evidence and all authentication branches.
`tests/fixtures/solutions/transfer-demo.zip` is an inert three-entry offline fixture;
startup calls actual packaged ZIP inspection with no CRM settings or external PATH.

`solutionSnapshotValues.ts` defines the versioned strict JSON shape and five selected
property profiles, canonical labels/options, portable keys and integrity validation.
`solutionSnapshot.ts` captures visible membership/properties and compares two snapshots
locally without credentials; uncertain unmatched keys remain distinct from confirmed
missing/extra rows. `solutionImportLog.ts` parses bounded native importjob XML with
opt-in message text and configured-secret redaction. `solutionVerification.ts`
combines a live selected-scope comparison with independent optional native job/log
observations without claiming full deployment, publication or runtime verification.
`src/tools/solutionVerificationTools.ts` adds four read-only tools. Tests use
`solutionVerification.fixture.mjs` / `solutionVerification.test.mjs`; the inert
`tests/fixtures/solutions/snapshot-v1.json` also exercises actual packaged offline
comparison with no CRM configuration or external PATH. These paths use Node/Web API.

`ribbonXml.ts` parses bounded classic Ribbon XML, summarizes controls/commands and
applies narrow publisher-scoped structured edits without executing handlers. It
preserves labels, independent tooltips, shared command/rule boundaries and outside
subtree semantics. `ribbon.ts` provides current-CSDL native compressed Ribbon reads
plus local package inspection/candidate creation. `solutionPackage.ts` now exposes
the same bounded ZIP validator/selected payload collector for generic Ribbon ZIPs
and preserves unchanged local compressed blocks when replacing one entry.
`src/tools/ribbonTools.ts` adds three tools. `ribbon.fixture.mjs` / `ribbon.test.mjs`
cover native/ZIP/XML/structured edit contracts; `tests/fixtures/solutions/ribbon-demo.zip`
is inert test data used by actual packaged no-CRM preview/save/inspect startup checks.
All Ribbon work is Node-only. No live Ribbon import/publish or modern command editor
is implied by local candidate generation.

`ribbonDeployment.ts` replays the candidate, validates current native solution/
publisher/table/membership and fresh export payloads, submits a narrow controlled
existing-unmanaged import and issues an in-memory process-bound provenance receipt.
Publication is a separate reviewed whole-table PublishXml after native completion/
log checks; accepted publication and definition readback remain separate. Read-only
verification is available without a receipt for recovery and never repairs/replays.
`ribbon.ts` shares its pure candidate builder; `solutionTransfer.ts` shares validated
native contracts/body construction and the single-submit import evidence helper,
without changing the first-import-only public tool contract. `ribbonDeploymentTools.ts`
adds three tools. `ribbonDeployment.fixture.mjs` / `ribbonDeployment.test.mjs` cover
full-scope gates, process receipts, native status/logs and partial acceptance/readback.
Web Resource publication, pending-state locks, durable receipt recovery, UI/runtime
and modern commands are explicitly outside this initial workflow.
