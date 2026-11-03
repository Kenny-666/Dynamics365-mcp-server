import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { selectTools, handleToolCall, tools as registeredTools } from './tool_handler.js';
import { toolErrorPayload } from './errors.js';

const tools = selectTools().map(tool => ({...tool,inputSchema:{...tool.inputSchema,
    properties:{...tool.inputSchema.properties, environment_profile:{type:'string',pattern:'^[A-Za-z][A-Za-z0-9_]{0,31}$',
      description:'Optional named environment profile for this call; omit to use the configured default.'}}}}));
const enabledTools = new Set(tools.map(tool => tool.name));

const server = new Server(
    {
        name: 'dynamics365-mcp-server',
        version: '1.1.1',
    },
    {
        capabilities: {
            tools: {},
        },
    }
);

server.setRequestHandler(ListToolsRequestSchema, async () => {
    return { tools };
});

server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    const { name, arguments: args } = request.params;
    try {
        if (!registeredTools.some(tool => tool.name === name)) throw new Error(`Unknown tool: ${name}`);
        if (!enabledTools.has(name)) throw new Error(`Tool is not enabled: ${name}`);
        const progressToken = request.params._meta?.progressToken;
        const {environment_profile, ...toolArgs} = args ?? {};
        if (environment_profile !== undefined && typeof environment_profile !== 'string') throw new Error('environment_profile must be a string');
        const result = await handleToolCall(name, toolArgs, {signal:extra.signal, environmentProfile:environment_profile as string | undefined,
          onProgress:progressToken === undefined ? undefined : async (progress,total) => {
            await extra.sendNotification({method:'notifications/progress',params:{progressToken,progress,total}});
          }});
        return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    } catch (error) {
        const payload = toolErrorPayload(error);
        console.error(`Tool execution error: ${name}`, JSON.stringify(payload));
        return {
            content: [{ type: 'text', text: JSON.stringify(payload) }],
            isError: true,
        };
    }
});

async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error('Dynamics 365 MCP Server running on stdio');
}

main().catch((error) => {
    console.error('Fatal error in main():', error);
    process.exit(1);
});
