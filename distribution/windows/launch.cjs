const path = require('node:path');
const root = __dirname;
const dotnet = path.join(root, 'runtime', 'dotnet');
process.chdir(root);
process.env.D365_DOTNET_PATH = path.join(dotnet, 'dotnet.exe');
process.env.DOTNET_ROOT = dotnet;
process.env.DOTNET_ROOT_X64 = dotnet;
process.env.DOTNET_MULTILEVEL_LOOKUP = '0';
try {
  require(path.join(root, 'app', 'dist', 'index.cjs'));
} catch {
  console.error('Unable to start Dynamics 365 MCP. Run check.cmd to verify the portable package.');
  process.exitCode = 1;
}
