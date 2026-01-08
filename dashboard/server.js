const express = require('express');
const basicAuth = require('express-basic-auth');
const http = require('http');
const net = require('net');
const path = require('path');
const fs = require('fs');
const { spawn, exec } = require('child_process');
const crypto = require('crypto');

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
const SCREENSHOT_DIR = '/tmp/screenshots';
const RECORDING_DIR = '/recordings';

const websockifyProcesses = new Map();
const screenshotCache = new Map();
const recordingProcesses = new Map();
const instanceState = new Map();

if (!fs.existsSync(SCREENSHOT_DIR)) {
    fs.mkdirSync(SCREENSHOT_DIR, { recursive: true, mode: 0o755 });
}
if (!fs.existsSync(RECORDING_DIR)) {
    fs.mkdirSync(RECORDING_DIR, { recursive: true, mode: 0o777 });
}

for (let i = 1; i <= INSTANCE_COUNT; i++) {
    instanceState.set(i, {
        gpuEnabled: false,
        recording: false,
        recordingFile: null,
        recordingStartTime: null,
        recordingSettings: {
            fps: 15,
            quality: 23,
            scale: '1280:720',
            maxSize: 1024 * 1024 * 1024
        }
    });
}

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
    const state = instanceState.get(id);
    
    return {
        id,
        status,
        cdpPort: toExternalPort(cdpPort),
        vncPort: toExternalPort(vncPort),
        wsPort: toExternalPort(wsPort),
        browser: cdpInfo?.Browser || null,
        vncConnected: vncAlive,
        webSocketDebuggerUrl: cdpInfo?.webSocketDebuggerUrl || null,
        gpuEnabled: state.gpuEnabled,
        recording: state.recording,
        recordingFile: state.recordingFile,
        recordingStartTime: state.recordingStartTime
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

async function killChromeInstance(id) {
    const index = id - 1;
    const internalCdpPort = BASE_CDP_PORT + 10000 + index;
    const dataDir = `/data/instance-${id}`;
    
    const killCommands = [
        `pkill -9 -f "user-data-dir=${dataDir}"`,
        `pkill -9 -f "remote-debugging-port=${internalCdpPort}"`,
        `pgrep -f "user-data-dir=${dataDir}" | xargs -r kill -9`,
        `pgrep -f "remote-debugging-port=${internalCdpPort}" | xargs -r kill -9`,
        `killall -9 chromium || true`
    ];
    
    for (const cmd of killCommands) {
        try {
            await runCommand(cmd);
        } catch (err) {
            console.log(`[Kill Instance ${id}] Command failed: ${cmd}`);
        }
    }
    
    await new Promise(r => setTimeout(r, 1500));
}

app.post('/api/instance/:id/restart', async (req, res) => {
    const id = parseInt(req.params.id);
    if (id < 1 || id > INSTANCE_COUNT) {
        return res.status(404).json({ error: 'Instance not found' });
    }
    
    const index = id - 1;
    const displayNum = 99 + id;
    const internalCdpPort = BASE_CDP_PORT + 10000 + index;
    
    try {
        console.log(`[API] Restarting instance ${id}`);
        await killChromeInstance(id);
        
        const dataDir = `/data/instance-${id}`;
        const screenWidth = process.env.SCREEN_WIDTH || '1920';
        const screenHeight = process.env.SCREEN_HEIGHT || '1080';
        const state = instanceState.get(id);
        const useGpu = state.gpuEnabled;
        
        const glFlags = useGpu 
            ? '--use-gl=egl --enable-gpu --enable-webgl --enable-webgl2 --ignore-gpu-blocklist --enable-gpu-rasterization --enable-accelerated-video-decode --enable-features=VaapiVideoDecoder,VaapiVideoEncoder'
            : '--use-gl=angle --use-angle=swiftshader --enable-webgl --enable-webgl2 --ignore-gpu-blocklist';
        
        const chromeFlags = `--no-sandbox --disable-setuid-sandbox --disable-dev-shm-usage --no-first-run --no-default-browser-check --no-pings --noerrdialogs --disable-infobars --disable-session-crashed-bubble --disable-search-engine-choice-screen --disable-sync --disable-sync-preferences --disable-background-networking --disable-client-side-phishing-detection --disable-component-update --disable-default-apps --disable-extensions --disable-features=Translate,OptimizationHints,MediaRouter,DialMediaRouteProvider,CalculateNativeWinOcclusion,InterestFeedContentSuggestions,PasswordManager,AutofillServerCommunication,ChromeWhatsNewUI,HttpsUpgrades,HeavyAdIntervention --disable-hang-monitor --disable-ipc-flooding-protection --disable-popup-blocking --disable-prompt-on-repost --disable-domain-reliability --disable-breakpad --disable-renderer-backgrounding --disable-backgrounding-occluded-windows --disable-background-timer-throttling --aggressive-cache-discard --disable-back-forward-cache --memory-pressure-off --password-store=basic --use-mock-keychain --deny-permission-prompts --disable-notifications --enable-features=NetworkService,NetworkServiceInProcess --force-color-profile=srgb --disable-web-security --allow-running-insecure-content --autoplay-policy=no-user-gesture-required ${glFlags}`;
        
        const cmd = `su -s /bin/bash chrome -c "DISPLAY=:${displayNum} /usr/lib/chromium/chromium --remote-debugging-port=${internalCdpPort} --remote-debugging-address=0.0.0.0 --window-size=${screenWidth},${screenHeight} --user-data-dir=${dataDir} ${chromeFlags} about:blank >> /var/log/s6-grid/instance-${id}.log 2>&1 &"`;
        
        console.log(`[API] Starting Chrome for instance ${id}`);
        await runCommand(cmd);
        await new Promise(r => setTimeout(r, 2500));
        
        const status = await getInstanceStatus(index);
        console.log(`[API] Instance ${id} status after restart: ${status.status}`);
        res.json({ success: true, instance: status });
    } catch (err) {
        console.error(`[API] Restart instance ${id} error:`, err.message);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/instance/:id/stop', async (req, res) => {
    const id = parseInt(req.params.id);
    if (id < 1 || id > INSTANCE_COUNT) {
        return res.status(404).json({ error: 'Instance not found' });
    }
    
    try {
        console.log(`[API] Stopping instance ${id}`);
        await killChromeInstance(id);
        const status = await getInstanceStatus(id - 1);
        console.log(`[API] Instance ${id} status after stop: ${status.status}`);
        res.json({ success: true, instance: status });
    } catch (err) {
        console.error(`[API] Stop instance ${id} error:`, err.message);
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

async function captureScreenshot(id) {
    const displayNum = 99 + id;
    const screenshotPath = path.join(SCREENSHOT_DIR, `instance-${id}.jpg`);
    const tempPath = `${screenshotPath}.tmp`;
    
    try {
        await runCommand(`DISPLAY=:${displayNum} import -window root -quality 85 -resize 800x600 "${tempPath}"`);
        
        if (fs.existsSync(tempPath)) {
            fs.renameSync(tempPath, screenshotPath);
            screenshotCache.set(id, {
                path: screenshotPath,
                timestamp: Date.now(),
                etag: crypto.randomBytes(8).toString('hex')
            });
            return true;
        }
        return false;
    } catch (err) {
        console.error(`[Screenshot] Failed for instance ${id}:`, err.message);
        return false;
    }
}

app.get('/api/instance/:id/screenshot', async (req, res) => {
    const id = parseInt(req.params.id);
    if (id < 1 || id > INSTANCE_COUNT) {
        return res.status(404).json({ error: 'Instance not found' });
    }
    
    const status = await getInstanceStatus(id - 1);
    if (status.status !== 'running') {
        return res.status(404).json({ error: 'Instance not running' });
    }
    
    const cached = screenshotCache.get(id);
    const now = Date.now();
    const needsRefresh = !cached || (now - cached.timestamp) > 30000;
    
    if (needsRefresh) {
        await captureScreenshot(id);
    }
    
    const screenshot = screenshotCache.get(id);
    if (!screenshot || !fs.existsSync(screenshot.path)) {
        return res.status(404).json({ error: 'Screenshot not available' });
    }
    
    if (req.headers['if-none-match'] === screenshot.etag) {
        return res.status(304).end();
    }
    
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=30');
    res.setHeader('ETag', screenshot.etag);
    fs.createReadStream(screenshot.path).pipe(res);
});

app.post('/api/instance/:id/gpu', async (req, res) => {
    const id = parseInt(req.params.id);
    if (id < 1 || id > INSTANCE_COUNT) {
        return res.status(404).json({ error: 'Instance not found' });
    }
    
    const { enabled } = req.body;
    const state = instanceState.get(id);
    state.gpuEnabled = enabled === true;
    instanceState.set(id, state);
    
    res.json({ success: true, gpuEnabled: state.gpuEnabled });
});

app.post('/api/instance/:id/recording/start', async (req, res) => {
    const id = parseInt(req.params.id);
    if (id < 1 || id > INSTANCE_COUNT) {
        return res.status(404).json({ error: 'Instance not found' });
    }
    
    const state = instanceState.get(id);
    if (state.recording) {
        return res.status(400).json({ error: 'Already recording' });
    }
    
    const { fps, quality, scale, maxSize } = req.body;
    if (fps) state.recordingSettings.fps = parseInt(fps);
    if (quality) state.recordingSettings.quality = parseInt(quality);
    if (scale) state.recordingSettings.scale = scale;
    if (maxSize) state.recordingSettings.maxSize = parseInt(maxSize);
    
    const displayNum = 99 + id;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `instance-${id}-${timestamp}.mp4`;
    const filepath = path.join(RECORDING_DIR, filename);
    
    const ffmpegArgs = [
        '-f', 'x11grab',
        '-framerate', state.recordingSettings.fps.toString(),
        '-video_size', '1920x1080',
        '-i', `:${displayNum}`,
        '-vf', `scale=${state.recordingSettings.scale}`,
        '-c:v', 'libx264',
        '-crf', state.recordingSettings.quality.toString(),
        '-preset', 'fast',
        '-f', 'mp4',
        '-movflags', '+faststart',
        filepath
    ];
    
    const proc = spawn('ffmpeg', ffmpegArgs, {
        stdio: ['ignore', 'pipe', 'pipe']
    });
    
    proc.on('error', (err) => {
        console.error(`[Recording ${id}] Error:`, err.message);
        state.recording = false;
        recordingProcesses.delete(id);
    });
    
    proc.on('exit', () => {
        state.recording = false;
        recordingProcesses.delete(id);
    });
    
    const sizeCheckInterval = setInterval(async () => {
        try {
            if (fs.existsSync(filepath)) {
                const stats = fs.statSync(filepath);
                if (stats.size >= state.recordingSettings.maxSize) {
                    console.log(`[Recording ${id}] Max size reached, stopping`);
                    clearInterval(sizeCheckInterval);
                    proc.kill('SIGINT');
                }
            }
        } catch (err) {
            console.error(`[Recording ${id}] Size check error:`, err.message);
        }
    }, 5000);
    
    proc.on('exit', () => clearInterval(sizeCheckInterval));
    
    recordingProcesses.set(id, { proc, sizeCheckInterval });
    state.recording = true;
    state.recordingFile = filename;
    state.recordingStartTime = Date.now();
    instanceState.set(id, state);
    
    res.json({ success: true, recording: true, filename });
});

app.post('/api/instance/:id/recording/stop', async (req, res) => {
    const id = parseInt(req.params.id);
    if (id < 1 || id > INSTANCE_COUNT) {
        return res.status(404).json({ error: 'Instance not found' });
    }
    
    const state = instanceState.get(id);
    if (!state.recording) {
        return res.status(400).json({ error: 'Not recording' });
    }
    
    const recData = recordingProcesses.get(id);
    if (recData) {
        clearInterval(recData.sizeCheckInterval);
        recData.proc.kill('SIGINT');
        recordingProcesses.delete(id);
    }
    
    state.recording = false;
    const filename = state.recordingFile;
    state.recordingFile = null;
    state.recordingStartTime = null;
    instanceState.set(id, state);
    
    await new Promise(r => setTimeout(r, 1000));
    
    res.json({ success: true, recording: false, filename });
});

app.get('/api/recordings', async (req, res) => {
    try {
        const files = fs.readdirSync(RECORDING_DIR);
        const recordings = files
            .filter(f => f.endsWith('.mp4'))
            .map(f => {
                const stats = fs.statSync(path.join(RECORDING_DIR, f));
                return {
                    filename: f,
                    size: stats.size,
                    created: stats.birthtime.toISOString()
                };
            })
            .sort((a, b) => new Date(b.created) - new Date(a.created));
        
        res.json({ recordings });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/recordings/:filename', async (req, res) => {
    const filename = req.params.filename;
    
    if (!filename.endsWith('.mp4') || filename.includes('/') || filename.includes('..')) {
        return res.status(400).json({ error: 'Invalid filename' });
    }
    
    const filepath = path.join(RECORDING_DIR, filename);
    
    if (!fs.existsSync(filepath)) {
        return res.status(404).json({ error: 'Recording not found' });
    }
    
    const stats = fs.statSync(filepath);
    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Length', stats.size);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    fs.createReadStream(filepath).pipe(res);
});

app.delete('/api/recordings/:filename', async (req, res) => {
    const filename = req.params.filename;
    
    if (!filename.endsWith('.mp4') || filename.includes('/') || filename.includes('..')) {
        return res.status(400).json({ error: 'Invalid filename' });
    }
    
    const filepath = path.join(RECORDING_DIR, filename);
    
    try {
        if (fs.existsSync(filepath)) {
            fs.unlinkSync(filepath);
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'Recording not found' });
        }
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/metrics', async (req, res) => {
    try {
        const diskUsage = await runCommand('df -B1 / | tail -1');
        const diskParts = diskUsage.stdout.trim().split(/\s+/);
        const diskTotal = parseInt(diskParts[1]);
        const diskUsed = parseInt(diskParts[2]);
        const diskFree = parseInt(diskParts[3]);
        
        const memInfo = await runCommand('cat /proc/meminfo');
        const memLines = memInfo.stdout.split('\n');
        const memTotal = parseInt(memLines.find(l => l.startsWith('MemTotal')).split(/\s+/)[1]) * 1024;
        const memFree = parseInt(memLines.find(l => l.startsWith('MemAvailable')).split(/\s+/)[1]) * 1024;
        const memUsed = memTotal - memFree;
        
        const cpuStat = await runCommand('cat /proc/stat | head -1');
        const cpuValues = cpuStat.stdout.trim().split(/\s+/).slice(1).map(Number);
        const cpuTotal = cpuValues.reduce((a, b) => a + b, 0);
        const cpuIdle = cpuValues[3];
        const cpuUsage = ((cpuTotal - cpuIdle) / cpuTotal) * 100;
        
        const instanceMetrics = [];
        for (let i = 1; i <= INSTANCE_COUNT; i++) {
            const state = instanceState.get(i);
            const status = await getInstanceStatus(i - 1);
            instanceMetrics.push({
                id: i,
                status: status.status,
                recording: state.recording,
                gpuEnabled: state.gpuEnabled
            });
        }
        
        res.json({
            disk: { total: diskTotal, used: diskUsed, free: diskFree },
            memory: { total: memTotal, used: memUsed, free: memFree },
            cpu: { usage: cpuUsage.toFixed(2) },
            instances: instanceMetrics
        });
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
