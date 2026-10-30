import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { tools, handleToolCall } from '../tool_handler.js';
import { CrmRequestError, toolErrorPayload } from '../errors.js';
import { validateDebugRequest, debugStaticPath, parseDebugCall } from './requestGuard.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3000;

const server = http.createServer(async (req, res) => {
  const url = req.url || '/';
  const rejected = validateDebugRequest(req, PORT);
  if (rejected) {
    res.writeHead(rejected);
    res.end('Request rejected');
    return;
  }
  res.setHeader('X-Content-Type-Options', 'nosniff');

  // API: List Tools
  if (url === '/api/tools' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(tools));
    return;
  }

  // API: Call Tool
  if (url === '/api/call' && req.method === 'POST') {
    let chunks: Buffer[] = [];
    let size = 0;
    let tooLarge = false;
    // A 10 MiB source encoded as Base64 fits within this JSON request limit.
    req.on('data', chunk => {
      size += Buffer.byteLength(chunk);
      if (size > 16 * 1024 * 1024) {
        if (!tooLarge) { res.writeHead(413); res.end('Request body too large'); }
        tooLarge = true;
        chunks = [];
      } else if (!tooLarge) chunks.push(Buffer.from(chunk));
    });
    req.on('end', async () => {
      if (tooLarge) return;
      try {
        const { name, arguments: args } = parseDebugCall(Buffer.concat(chunks).toString('utf8'));
        chunks = [];
        if (!tools.some(tool => tool.name === name)) {
          res.writeHead(404, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({error:'Unknown tool.',code:'D365_DEBUG_TOOL_NOT_FOUND'}));
          return;
        }
        const result = await handleToolCall(name, args);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (error) {
        res.writeHead(error instanceof CrmRequestError && error.code === 'D365_DEBUG_INVALID_REQUEST' ? 400 : 500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(toolErrorPayload(error)));
      }
    });
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, {Allow:'GET, HEAD'});
    res.end('Method not allowed');
    return;
  }

  // Static Files
  const filePath = debugStaticPath(path.join(__dirname, 'ui'), url);
  if (!filePath) { res.writeHead(404); res.end('File not found'); return; }
  const ext = path.extname(filePath);
  const mimeTypes: { [key: string]: string } = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpg',
  };

  const contentType = mimeTypes[ext] || 'application/octet-stream';

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === 'ENOENT') {
        res.writeHead(404);
        res.end('File not found');
      } else {
        res.writeHead(500);
        res.end('Server error: ' + error.code);
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(req.method === 'HEAD' ? undefined : content);
    }
  });
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`\n🚀 Debug GUI is running at: http://localhost:${PORT}`);
  console.log(`Stop the server with Ctrl+C\n`);
});
