using System.Reflection;
using System.Reflection.Metadata;
using System.Reflection.PortableExecutable;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

// Protocol: one canonical base64 PE on stdin; one bounded JSON result on stdout.
// This program never loads the inspected assembly or resolves its dependencies.
try
{
    const int limit = 16 * 1024 * 1024;
    var input = new StringBuilder();
    var buffer = new char[8192];
    int count;
    while ((count = Console.In.Read(buffer, 0, buffer.Length)) > 0)
    {
        input.Append(buffer, 0, count);
        if (input.Length > ((limit + 2) / 3) * 4) throw new BadImageFormatException();
    }
    var bytes = Convert.FromBase64String(input.ToString());
    if (bytes.Length == 0 || bytes.Length > limit) throw new BadImageFormatException();
    using var stream = new MemoryStream(bytes, false);
    using var pe = new PEReader(stream);
    if (!pe.HasMetadata || pe.PEHeaders.CorHeader is not { } cor) throw new BadImageFormatException();
    var reader = pe.GetMetadataReader();
    if (!reader.IsAssembly || reader.TypeDefinitions.Count > 10000 || reader.AssemblyReferences.Count > 1000) throw new BadImageFormatException();
    var assembly = reader.GetAssemblyDefinition();
    string S(StringHandle value) => reader.GetString(value);
    string Full(EntityHandle handle, int depth = 0)
    {
        if (depth > 64) throw new BadImageFormatException();
        if (handle.Kind == HandleKind.TypeDefinition)
        {
            var type = reader.GetTypeDefinition((TypeDefinitionHandle)handle);
            var parent = type.GetDeclaringType();
            return !parent.IsNil ? Full(parent, depth + 1) + "+" + S(type.Name) : (S(type.Namespace) is var ns && ns.Length > 0 ? ns + "." : "") + S(type.Name);
        }
        if (handle.Kind == HandleKind.TypeReference)
        {
            var type = reader.GetTypeReference((TypeReferenceHandle)handle);
            return type.ResolutionScope.Kind == HandleKind.TypeReference ? Full(type.ResolutionScope, depth + 1) + "+" + S(type.Name)
                : (S(type.Namespace) is var ns && ns.Length > 0 ? ns + "." : "") + S(type.Name);
        }
        return "";
    }
    bool External(EntityHandle handle, string name, string scope)
    {
        if (handle.Kind != HandleKind.TypeReference || Full(handle) != name) return false;
        var reference = reader.GetTypeReference((TypeReferenceHandle)handle);
        return reference.ResolutionScope.Kind == HandleKind.AssemblyReference && S(reader.GetAssemblyReference((AssemblyReferenceHandle)reference.ResolutionScope).Name) == scope;
    }
    bool Contract(EntityHandle handle, bool workflow, HashSet<EntityHandle> visited)
    {
        if (visited.Count > 64 || !visited.Add(handle)) return false;
        if (External(handle, workflow ? "System.Activities.CodeActivity" : "Microsoft.Xrm.Sdk.IPlugin", workflow ? "System.Activities" : "Microsoft.Xrm.Sdk")) return true;
        if (handle.Kind != HandleKind.TypeDefinition) return false;
        var type = reader.GetTypeDefinition((TypeDefinitionHandle)handle);
        if (Contract(type.BaseType, workflow, visited)) return true;
        foreach (var item in type.GetInterfaceImplementations())
            if (Contract(reader.GetInterfaceImplementation(item).Interface, workflow, visited)) return true;
        return false;
    }
    bool Unresolved(EntityHandle handle, HashSet<EntityHandle> visited)
    {
        if (handle.IsNil) return false;
        if (visited.Count > 64 || !visited.Add(handle)) return true;
        if (handle.Kind == HandleKind.TypeReference)
        {
            var type = reader.GetTypeReference((TypeReferenceHandle)handle);
            if (type.ResolutionScope.Kind != HandleKind.AssemblyReference) return true;
            var scope = S(reader.GetAssemblyReference((AssemblyReferenceHandle)type.ResolutionScope).Name);
            return scope is not ("mscorlib" or "System.Runtime" or "netstandard")
                && !External(handle, "Microsoft.Xrm.Sdk.IPlugin", "Microsoft.Xrm.Sdk")
                && !External(handle, "System.Activities.CodeActivity", "System.Activities");
        }
        if (handle.Kind != HandleKind.TypeDefinition) return true;
        var definition = reader.GetTypeDefinition((TypeDefinitionHandle)handle);
        if (Unresolved(definition.BaseType, new(visited))) return true;
        foreach (var item in definition.GetInterfaceImplementations())
            if (Unresolved(reader.GetInterfaceImplementation(item).Interface, new(visited))) return true;
        return false;
    }
    string? framework = null;
    foreach (var handle in assembly.GetCustomAttributes())
    {
        var attribute = reader.GetCustomAttribute(handle);
        if (attribute.Constructor.Kind != HandleKind.MemberReference) continue;
        var member = reader.GetMemberReference((MemberReferenceHandle)attribute.Constructor);
        if (Full(member.Parent) != "System.Runtime.Versioning.TargetFrameworkAttribute") continue;
        var blob = reader.GetBlobReader(attribute.Value);
        if (blob.ReadUInt16() != 1 || framework != null) throw new BadImageFormatException();
        framework = blob.ReadSerializedString();
    }
    var key = reader.GetBlobBytes(assembly.PublicKey);
    var token = key.Length == 0 ? "" : Convert.ToHexString(SHA1.HashData(key).TakeLast(8).Reverse().ToArray()).ToLowerInvariant();
    var signature = cor.StrongNameSignatureDirectory;
    bool signaturePresent = signature.Size > 0 && signature.Size <= 16384 && pe.GetSectionData(signature.RelativeVirtualAddress).GetContent(0, signature.Size).Any(value => value != 0);
    var types = new List<object>();
    foreach (var handle in reader.TypeDefinitions)
    {
        var type = reader.GetTypeDefinition(handle);
        var visibility = type.Attributes & TypeAttributes.VisibilityMask;
        if (visibility != TypeAttributes.Public && visibility != TypeAttributes.NestedPublic) continue;
        types.Add(new { name = Full(handle), concrete = (type.Attributes & (TypeAttributes.Abstract | TypeAttributes.Interface)) == 0,
            generic = type.GetGenericParameters().Count != 0, nested = visibility == TypeAttributes.NestedPublic,
            unresolvedInheritance = Unresolved(handle, new()),
            plugin = Contract(handle, false, new()), workflow = Contract(handle, true, new()) });
    }
    if (types.Count > 5000) throw new BadImageFormatException();
    Console.Write(JsonSerializer.Serialize(new { protocol = 1, name = S(assembly.Name), version = assembly.Version.ToString(),
        culture = S(assembly.Culture), publicKeyToken = token, framework,
        ilOnly = cor.Flags.HasFlag(CorFlags.ILOnly) && !cor.Flags.HasFlag(CorFlags.NativeEntryPoint), library = pe.PEHeaders.CoffHeader.Characteristics.HasFlag(Characteristics.Dll),
        signed = cor.Flags.HasFlag(CorFlags.StrongNameSigned) && signaturePresent,
        machine = pe.PEHeaders.CoffHeader.Machine.ToString(), requires32Bit = cor.Flags.HasFlag(CorFlags.Requires32Bit),
        nativeImports = reader.MethodDefinitions.Any(handle => reader.GetMethodDefinition(handle).Attributes.HasFlag(MethodAttributes.PinvokeImpl)),
        types, references = reader.AssemblyReferences.Select(handle => {
            var item = reader.GetAssemblyReference(handle); var keyOrToken = reader.GetBlobBytes(item.PublicKeyOrToken);
            var referenceToken = item.Flags.HasFlag(AssemblyFlags.PublicKey) ? SHA1.HashData(keyOrToken).TakeLast(8).Reverse().ToArray() : keyOrToken;
            return new { name = S(item.Name), version = item.Version.ToString(), culture = S(item.Culture), publicKeyToken = Convert.ToHexString(referenceToken).ToLowerInvariant() };
        }).OrderBy(item => item.name, StringComparer.Ordinal).ThenBy(item => item.version, StringComparer.Ordinal) }));
}
catch
{
    Console.Write("{\"protocol\":1,\"error\":\"INVALID_ASSEMBLY\"}");
    Environment.ExitCode = 2;
}
