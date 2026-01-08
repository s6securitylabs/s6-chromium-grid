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
        this.server = http.createServer((req, res) => {
            res.writeHead(404);
            res.end('WebSocket Gateway - Use ws:// protocol');
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
            this.activeConnections.set(connId, { clientWs, upstreamWs, projectName });
            
            upstreamWs.on('open', () => {
                console.log(`[WSGateway] ${connId} Connected to CDP for ${projectName}`);
            });
            
            upstreamWs.on('message', (data) => {
                if (clientWs.readyState === WebSocket.OPEN) {
                    clientWs.send(data);
                }
                this.dynamicManager.touchInstance(projectName);
            });
            
            upstreamWs.on('error', (err) => {
                console.error(`[WSGateway] ${connId} Upstream error:`, err.message);
                if (clientWs.readyState === WebSocket.OPEN) {
                    clientWs.close();
                }
            });
            
            upstreamWs.on('close', () => {
                console.log(`[WSGateway] ${connId} Upstream closed`);
                if (clientWs.readyState === WebSocket.OPEN) {
                    clientWs.close();
                }
                this.activeConnections.delete(connId);
            });
            
            clientWs.on('message', (data) => {
                if (upstreamWs.readyState === WebSocket.OPEN) {
                    upstreamWs.send(data);
                }
                this.dynamicManager.touchInstance(projectName);
            });
            
            clientWs.on('error', (err) => {
                console.error(`[WSGateway] ${connId} Client error:`, err.message);
                if (upstreamWs.readyState === WebSocket.OPEN) {
                    upstreamWs.close();
                }
            });
            
            clientWs.on('close', () => {
                console.log(`[WSGateway] ${connId} Client closed`);
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
