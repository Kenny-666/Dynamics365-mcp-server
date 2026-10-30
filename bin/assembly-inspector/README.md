# Fixed assembly metadata reader

This framework-dependent helper requires .NET 10 Runtime. Rebuild with npm run build:inspector (.NET 10 SDK). Source: tools/assembly-inspector. It accepts bounded base64 PE bytes on stdin and emits JSON metadata; it never loads or invokes inspected code or dependencies. It is not a general command runner or a CRM SDK transport. Signing presence is not cryptographic signature verification. Do not replace this helper with the DLL being inspected.
