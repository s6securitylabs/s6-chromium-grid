const WebSocket = require('ws');
const http = require('http');
const url = require('url');

class WebSocketGateway {
    constructor(dynamicManager, options = {}) {
        this.dynamicManager = dynamicManager;
        this.port = options.port || 9222;
        this.server = null;
        this.wss = null;
        this.activeConnections = new Map();
        
        console.log(`[WSGateway] Initializing on port ${this.port}`);
    }
    
    start() {
        this.server = http.createServer(async (req, res) => {
            // Handle HTTP requests (for CDP discovery endpoints like /json/version)
            await this.handleHTTPRequest(req, res);
        });

        this.wss = new WebSocket.Server({
            server: this.server,
            path: undefined
        });

        this.wss.on('connection', (clientWs, req) => {
            this.handleConnection(clientWs, req);
        });

        this.server.listen(this.port, '0.0.0.0', () => {
            console.log(`[WSGateway] Listening on ws://0.0.0.0:${this.port}`);
        });
    }

    async handleHTTPRequest(req, res) {
        const parsedUrl = url.parse(req.url);
        const path = parsedUrl.pathname || '/';

        // Extract project name from path
        const projectMatch = path.match(/^\/([a-z0-9][a-z0-9-]*[a-z0-9])(\/.*)?$/);

        if (!projectMatch) {
            res.writeHead(404, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Invalid path format. Use: http://host:port/project-name/json/version' }));
            return;
        }

        const projectName = projectMatch[1];
        const cdpPath = projectMatch[2] || '/';

        try {
            // Get or create instance
            const instance = await this.dynamicManager.getOrCreateInstance(projectName);
            this.dynamicManager.touchInstance(projectName);

            // Proxy HTTP request to Chrome instance
            const targetUrl = `http://127.0.0.1:${instance.cdpPort}${cdpPath}`;

            http.get(targetUrl, (proxyRes) => {
                const chunks = [];

                proxyRes.on('data', (chunk) => {
                    chunks.push(chunk);
                });

                proxyRes.on('end', () => {
                    const body = Buffer.concat(chunks).toString('utf8');

                    // Rewrite WebSocket URLs to route through gateway
                    const rewritten = body.replace(
                        /ws:\/\/127\.0\.0\.1:(\d+)\//g,
                        `ws://${req.headers.host}/${projectName}/`
                    );

                    // Update Content-Length header
                    const headers = { ...proxyRes.headers };
                    headers['content-length'] = Buffer.byteLength(rewritten);

                    res.writeHead(proxyRes.statusCode, headers);
                    res.end(rewritten);
                });
            }).on('error', (err) => {
                console.error(`[WSGateway] HTTP proxy error for ${projectName}:`, err.message);
                res.writeHead(502, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ error: 'Failed to connect to instance' }));
            });

        } catch (err) {
            console.error(`[WSGateway] HTTP request failed for ${projectName}:`, err.message);
            res.writeHead(500, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: err.message }));
        }
    }
    
    async handleConnection(clientWs, req) {
        const parsedUrl = url.parse(req.url);
        const path = parsedUrl.pathname || '/';
        
        console.log(`[WSGateway] New connection: ${path}`);
        
        const projectMatch = path.match(/^\/([a-z0-9][a-z0-9-]*[a-z0-9])\/?/);
        
        if (!projectMatch) {
            console.log(`[WSGateway] Invalid path format: ${path}`);
            clientWs.send(JSON.stringify({
                error: 'Invalid path format. Use: ws://host:port/project-name/'
            }));
            clientWs.close();
            return;
        }
        
        const projectName = projectMatch[1];
        console.log(`[WSGateway] Project: ${projectName}`);
        
        try {
            const instance = await this.dynamicManager.getOrCreateInstance(projectName);
            
            this.dynamicManager.touchInstance(projectName);
            
            const cdpPath = path.replace(/^\/[^/]+/, '');
            const cdpUrl = `ws://127.0.0.1:${instance.cdpPort}${cdpPath}`;
            
            console.log(`[WSGateway] Routing ${projectName} -> ${cdpUrl}`);
            
            const upstreamWs = new WebSocket(cdpUrl);

            const connId = Math.random().toString(36).substr(2, 9);
            const messageBuffer = [];
            let upstreamReady = false;

            this.activeConnections.set(connId, { clientWs, upstreamWs, projectName });

            upstreamWs.on('open', () => {
                console.log(`[WSGateway] ${connId} Connected to CDP for ${projectName}`);
                upstreamReady = true;

                // Flush buffered messages with type preservation
                console.log(`[WSGateway] ${connId} Flushing ${messageBuffer.length} buffered messages`);
                while (messageBuffer.length > 0) {
                    const { data, isBinary } = messageBuffer.shift();
                    upstreamWs.send(data, { binary: isBinary });
                    console.log(`[WSGateway] ${connId} → Flushed message (binary: ${isBinary})`);
                }
            });

            upstreamWs.on('message', (data) => {
                const preview = data.toString().substring(0, 200);
                console.log(`[WSGateway] ${connId} ← Upstream message: ${data.length} bytes - ${preview}`);
                if (clientWs.readyState === WebSocket.OPEN) {
                    clientWs.send(data);
                    console.log(`[WSGateway] ${connId} → Client sent`);
                } else {
                    console.log(`[WSGateway] ${connId} ⚠️ Client not open (state: ${clientWs.readyState})`);
                }
                this.dynamicManager.touchInstance(projectName);
            });

            upstreamWs.on('error', (err) => {
                console.error(`[WSGateway] ${connId} Upstream error:`, err.message, err.code);
                if (clientWs.readyState === WebSocket.OPEN) {
                    clientWs.close(1011, 'Upstream error');
                }
            });

            upstreamWs.on('close', (code, reason) => {
                console.log(`[WSGateway] ${connId} Upstream closed (code: ${code}, reason: ${reason})`);
                if (clientWs.readyState === WebSocket.OPEN) {
                    clientWs.close(code, reason);
                }
                this.activeConnections.delete(connId);
            });

            clientWs.on('message', (data, isBinary) => {
                const preview = data.toString().substring(0, 200);
                console.log(`[WSGateway] ${connId} ← Client message: ${data.length} bytes - ${preview}`);

                if (upstreamReady && upstreamWs.readyState === WebSocket.OPEN) {
                    upstreamWs.send(data, { binary: isBinary });
                    console.log(`[WSGateway] ${connId} → Upstream sent immediately (binary: ${isBinary})`);
                } else {
                    messageBuffer.push({ data, isBinary });
                    console.log(`[WSGateway] ${connId} ⏸️  Buffered (total: ${messageBuffer.length}, binary: ${isBinary}, upstream state: ${upstreamWs.readyState})`);
                }
                this.dynamicManager.touchInstance(projectName);
            });

            clientWs.on('error', (err) => {
                console.error(`[WSGateway] ${connId} Client error:`, err.message, err.code);
                if (upstreamWs.readyState === WebSocket.OPEN) {
                    upstreamWs.close(1011, 'Client error');
                }
            });

            clientWs.on('close', (code, reason) => {
                console.log(`[WSGateway] ${connId} Client closed (code: ${code}, reason: ${reason})`);
                if (upstreamWs.readyState === WebSocket.OPEN) {
                    upstreamWs.close();
                }
                this.activeConnections.delete(connId);
            });
            
        } catch (err) {
            console.error(`[WSGateway] Failed to route ${projectName}:`, err.message);
            clientWs.send(JSON.stringify({
                error: `Failed to create instance: ${err.message}`
            }));
            clientWs.close();
        }
    }
    
    async shutdown() {
        console.log('[WSGateway] Shutting down...');
        
        for (const [connId, { clientWs, upstreamWs }] of this.activeConnections.entries()) {
            try {
                if (clientWs.readyState === WebSocket.OPEN) clientWs.close();
                if (upstreamWs.readyState === WebSocket.OPEN) upstreamWs.close();
            } catch (err) {
                console.error(`[WSGateway] Error closing ${connId}:`, err.message);
            }
        }
        
        this.activeConnections.clear();
        
        if (this.wss) {
            await new Promise(resolve => {
                this.wss.close(resolve);
            });
        }
        
        if (this.server) {
            await new Promise(resolve => {
                this.server.close(resolve);
            });
        }
        
        console.log('[WSGateway] Shutdown complete');
    }
}

module.exports = WebSocketGateway;
