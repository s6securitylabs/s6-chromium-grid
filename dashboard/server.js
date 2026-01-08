const express = require('express');
const basicAuth = require('express-basic-auth');
const http = require('http');
const net = require('net');
const path = require('path');
const fs = require('fs');
const { spawn, exec } = require('child_process');

const app = express();
const PORT = process.env.DASHBOARD_PORT || 8080;
const INSTANCE_COUNT = parseInt(process.env.INSTANCE_COUNT || '5');
const BASE_CDP_PORT = parseInt(process.env.BASE_CDP_PORT || '9222');
const BASE_VNC_PORT = parseInt(process.env.BASE_VNC_PORT || '5900');
const BASE_WS_PORT = 6080;
const DASHBOARD_USER = process.env.DASHBOARD_USER || 'admin';
const DASHBOARD_PASS = process.env.DASHBOARD_PASS || 'admin';
const EXTERNAL_PORT_PREFIX = parseInt(process.env.EXTERNAL_PORT_PREFIX || '0');
const NOVNC_PATH = '/opt/novnc';

const websockifyProcesses = new Map();

function toExternalPort(internalPort) {
    if (EXTERNAL_PORT_PREFIX === 0) return internalPort;
    return EXTERNAL_PORT_PREFIX * 10000 + internalPort;
}

app.use(basicAuth({
    users: { [DASHBOARD_USER]: DASHBOARD_PASS },
    challenge: true,
    realm: 'S6 Chromium Grid'
}));

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/novnc', express.static(NOVNC_PATH));

function runCommand(cmd) {
    return new Promise((resolve, reject) => {
        exec(cmd, { timeout: 10000 }, (error, stdout, stderr) => {
            if (error) reject(error);
            else resolve({ stdout, stderr });
        });
    });
}

async function checkCDP(port) {
    return new Promise((resolve) => {
        const req = http.request({
            hostname: '127.0.0.1',
            port,
            path: '/json/version',
            method: 'GET',
            timeout: 2000
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch {
                    resolve(null);
                }
            });
        });
        req.on('error', () => resolve(null));
        req.on('timeout', () => { req.destroy(); resolve(null); });
        req.end();
    });
}

async function checkVNC(port) {
    return new Promise((resolve) => {
        const socket = net.createConnection({ port, host: '127.0.0.1', timeout: 1000 });
        socket.on('connect', () => { socket.destroy(); resolve(true); });
        socket.on('error', () => resolve(false));
        socket.on('timeout', () => { socket.destroy(); resolve(false); });
    });
}

async function getInstanceStatus(index) {
    const id = index + 1;
    const cdpPort = BASE_CDP_PORT + index;
    const vncPort = BASE_VNC_PORT + index;
    const wsPort = BASE_WS_PORT + index;
    
    const [cdpInfo, vncAlive] = await Promise.all([
        checkCDP(cdpPort),
        checkVNC(vncPort)
    ]);
    
    const status = cdpInfo ? 'running' : 'offline';
    
    return {
        id,
        status,
        cdpPort: toExternalPort(cdpPort),
        vncPort: toExternalPort(vncPort),
        wsPort: toExternalPort(wsPort),
        browser: cdpInfo?.Browser || null,
        vncConnected: vncAlive,
        webSocketDebuggerUrl: cdpInfo?.webSocketDebuggerUrl || null
    };
}

app.get('/api/status', async (req, res) => {
    const instances = await Promise.all(
        Array.from({ length: INSTANCE_COUNT }, (_, i) => getInstanceStatus(i))
    );
    res.json({
        total: INSTANCE_COUNT,
        running: instances.filter(i => i.status === 'running').length,
        instances
    });
});

app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Logs API
const LOG_DIR = process.env.LOG_DIR || '/var/log/s6-grid';

app.get('/api/logs', async (req, res) => {
    try {
        const files = await fs.promises.readdir(LOG_DIR);
        const logFiles = files.filter(f => f.endsWith('.log'));
        const stats = await Promise.all(
            logFiles.map(async (file) => {
                const stat = await fs.promises.stat(path.join(LOG_DIR, file));
                return {
                    name: file,
                    size: stat.size,
                    modified: stat.mtime.toISOString()
                };
            })
        );
        res.json({ logs: stats.sort((a, b) => a.name.localeCompare(b.name)) });
    } catch (err) {
        if (err.code === 'ENOENT') {
            res.json({ logs: [], error: 'Log directory not found' });
        } else {
            res.status(500).json({ error: err.message });
        }
    }
});

app.get('/api/logs/:name', async (req, res) => {
    const fileName = req.params.name;
    
    // Security: only allow .log files, no path traversal
    if (!fileName.endsWith('.log') || fileName.includes('/') || fileName.includes('..')) {
        return res.status(400).json({ error: 'Invalid log file name' });
    }
    
    const filePath = path.join(LOG_DIR, fileName);
    const lines = parseInt(req.query.lines) || 500;
    const follow = req.query.follow === 'true';
    
    try {
        const content = await fs.promises.readFile(filePath, 'utf8');
        const allLines = content.split('\n');
        const lastLines = allLines.slice(-lines).join('\n');
        
        res.json({
            name: fileName,
            lines: lastLines,
            totalLines: allLines.length,
            truncated: allLines.length > lines
        });
    } catch (err) {
        if (err.code === 'ENOENT') {
            res.status(404).json({ error: 'Log file not found' });
        } else {
            res.status(500).json({ error: err.message });
        }
    }
});

app.post('/api/instance/:id/restart', async (req, res) => {
    const id = parseInt(req.params.id);
    if (id < 1 || id > INSTANCE_COUNT) {
        return res.status(404).json({ error: 'Instance not found' });
    }
    
    const index = id - 1;
    const displayNum = 99 + id;
    const cdpPort = BASE_CDP_PORT + index;
    
    try {
        await runCommand(`pkill -f "remote-debugging-port=${cdpPort}" || true`);
        await new Promise(r => setTimeout(r, 1000));
        
        const dataDir = `/data/instance-${id}`;
        const screenWidth = process.env.SCREEN_WIDTH || '1920';
        const screenHeight = process.env.SCREEN_HEIGHT || '1080';
        const useGpu = process.env.USE_GPU === 'true';
        
        const glFlags = useGpu 
            ? '--use-gl=egl --enable-gpu --enable-webgl --enable-webgl2 --ignore-gpu-blocklist'
            : '--use-gl=angle --use-angle=swiftshader --enable-webgl --enable-webgl2';
        
        const chromeFlags = `--no-sandbox --disable-setuid-sandbox --disable-dev-shm-usage --no-first-run --disable-background-networking --disable-sync ${glFlags}`;
        
        const cmd = `su -s /bin/bash chrome -c "DISPLAY=:${displayNum} chromium --remote-debugging-port=${cdpPort} --remote-debugging-address=0.0.0.0 --window-size=${screenWidth},${screenHeight} --user-data-dir=${dataDir} ${chromeFlags} about:blank &"`;
        
        await runCommand(cmd);
        await new Promise(r => setTimeout(r, 2000));
        
        const status = await getInstanceStatus(index);
        res.json({ success: true, instance: status });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/instance/:id/stop', async (req, res) => {
    const id = parseInt(req.params.id);
    if (id < 1 || id > INSTANCE_COUNT) {
        return res.status(404).json({ error: 'Instance not found' });
    }
    
    const cdpPort = BASE_CDP_PORT + (id - 1);
    
    try {
        await runCommand(`pkill -f "remote-debugging-port=${cdpPort}" || true`);
        await new Promise(r => setTimeout(r, 500));
        const status = await getInstanceStatus(id - 1);
        res.json({ success: true, instance: status });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/instance/:id/start', async (req, res) => {
    return app.handle({ ...req, url: `/api/instance/${req.params.id}/restart`, method: 'POST' }, res);
});

app.get('/api/instance/:id/pages', async (req, res) => {
    const id = parseInt(req.params.id);
    if (id < 1 || id > INSTANCE_COUNT) {
        return res.status(404).json({ error: 'Instance not found' });
    }
    
    const cdpPort = BASE_CDP_PORT + (id - 1);
    
    try {
        const response = await fetch(`http://localhost:${cdpPort}/json`);
        const pages = await response.json();
        res.json(pages);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

function startWebsockify(index) {
    const wsPort = BASE_WS_PORT + index;
    const vncPort = BASE_VNC_PORT + index;
    
    if (websockifyProcesses.has(index)) {
        try {
            websockifyProcesses.get(index).kill();
        } catch {}
    }
    
    const proc = spawn('websockify', [
        '--web', NOVNC_PATH,
        wsPort.toString(),
        `localhost:${vncPort}`
    ], { 
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false 
    });
    
    proc.on('error', (err) => {
        console.error(`[Websockify ${index + 1}] Error:`, err.message);
    });
    
    proc.on('exit', (code) => {
        if (code !== null && code !== 0) {
            console.log(`[Websockify ${index + 1}] Exited with code ${code}, restarting...`);
            websockifyProcesses.delete(index);
            setTimeout(() => startWebsockify(index), 3000);
        }
    });
    
    websockifyProcesses.set(index, proc);
    console.log(`[Websockify] Instance ${index + 1}: ws://0.0.0.0:${wsPort} -> vnc://localhost:${vncPort}`);
}

function startAllWebsockify() {
    for (let i = 0; i < INSTANCE_COUNT; i++) {
        startWebsockify(i);
    }
}

app.listen(PORT, '0.0.0.0', () => {
    console.log('');
    console.log('='.repeat(50));
    console.log('  S6 Chromium Grid Dashboard');
    console.log('='.repeat(50));
    console.log(`  URL:       http://0.0.0.0:${PORT}`);
    console.log(`  Login:     ${DASHBOARD_USER} / ${'*'.repeat(DASHBOARD_PASS.length)}`);
    console.log(`  Instances: ${INSTANCE_COUNT}`);
    if (EXTERNAL_PORT_PREFIX > 0) {
        console.log(`  Port Prefix: ${EXTERNAL_PORT_PREFIX} (external = ${EXTERNAL_PORT_PREFIX}xxxx)`);
    }
    console.log(`  CDP Ports: ${toExternalPort(BASE_CDP_PORT)}-${toExternalPort(BASE_CDP_PORT + INSTANCE_COUNT - 1)}`);
    console.log(`  VNC Ports: ${toExternalPort(BASE_VNC_PORT)}-${toExternalPort(BASE_VNC_PORT + INSTANCE_COUNT - 1)}`);
    console.log(`  WS Ports:  ${toExternalPort(BASE_WS_PORT)}-${toExternalPort(BASE_WS_PORT + INSTANCE_COUNT - 1)}`);
    console.log('='.repeat(50));
    console.log('');
    
    setTimeout(startAllWebsockify, 2000);
});

process.on('SIGTERM', () => {
    console.log('[Dashboard] Shutting down...');
    websockifyProcesses.forEach(p => { try { p.kill(); } catch {} });
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('[Dashboard] Interrupted...');
    websockifyProcesses.forEach(p => { try { p.kill(); } catch {} });
    process.exit(0);
});
