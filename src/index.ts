import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
    CallToolRequestSchema,
    ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { tools, handleToolCall } from './tool_handler.js';
import { toolErrorPayload } from './errors.js';

const server = new Server(
    {
        name: 'dynamics365-mcp-server',
        version: '1.0.0',
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
        const progressToken = request.params._meta?.progressToken;
        const result = await handleToolCall(name, args, {signal:extra.signal,
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
