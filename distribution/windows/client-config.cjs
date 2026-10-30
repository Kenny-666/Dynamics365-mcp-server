const fs = require('node:fs');
const path = require('node:path');
const root = __dirname;
const config = {mcpServers:{'dynamics365-mcp':{
  command:path.join(root,'runtime','node','node.exe'),
  args:[path.join(root,'launch.cjs')],
}}};
const target = path.join(root,'mcp-client.generated.json');
fs.writeFileSync(target, JSON.stringify(config,null,2)+'\n');
console.log('Created mcp-client.generated.json. Copy its server entry into your MCP client configuration.');
console.log('Generate this file again after moving the portable folder. CRM credentials remain in .env.');
