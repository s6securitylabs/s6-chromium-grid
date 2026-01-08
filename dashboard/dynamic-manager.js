const { spawn, exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');

/**
 * Dynamic Instance Manager
 * 
 * Manages on-demand Chrome browser instances with automatic provisioning,
 * lifecycle management, and cleanup.
 */
class DynamicInstanceManager {
    constructor(options = {}) {
        this.maxInstances = options.maxInstances || 20;
        this.idleTimeout = (options.idleTimeoutMinutes || 30) * 60 * 1000;
        this.baseDisplay = options.baseDisplay || 200;
        this.baseCdpPort = options.baseCdpPort || 20000;
        this.registryPath = options.registryPath || '/data/dynamic-instances.json';
        this.logDir = options.logDir || '/var/log/s6-grid';
        this.screenWidth = options.screenWidth || 1920;
        this.screenHeight = options.screenHeight || 1080;
        this.useGpu = options.useGpu || false;
        
        // Instance registry: projectName -> instance metadata
        this.instances = new Map();
        
        // Track next available resources
        this.nextDisplayNum = this.baseDisplay;
        this.nextCdpPort = this.baseCdpPort;
        
        // Cleanup interval
        this.cleanupInterval = null;
        
        this.loadRegistry();
        this.startCleanupTimer();
        
        console.log('[DynamicManager] Initialized');
        console.log(`[DynamicManager] Max instances: ${this.maxInstances}`);
        console.log(`[DynamicManager] Idle timeout: ${this.idleTimeout / 60000} minutes`);
    }
    
    /**
     * Load instance registry from disk
     */
    loadRegistry() {
        try {
            if (fs.existsSync(this.registryPath)) {
                const data = JSON.parse(fs.readFileSync(this.registryPath, 'utf8'));
                // Restore instances (but don't auto-start processes - they're dead)
                for (const [name, meta] of Object.entries(data)) {
                    this.instances.set(name, {
                        ...meta,
                        status: 'stopped',
                        pid: null,
                        xvfbPid: null,
                        socatPid: null,
                        lastActivity: Date.now()
                    });
                    // Track highest port/display to avoid conflicts
                    if (meta.cdpPort >= this.nextCdpPort) {
                        this.nextCdpPort = meta.cdpPort + 1;
                    }
                    if (meta.displayNum >= this.nextDisplayNum) {
                        this.nextDisplayNum = meta.displayNum + 1;
                    }
                }
                console.log(`[DynamicManager] Loaded ${this.instances.size} instances from registry`);
            }
        } catch (err) {
            console.error('[DynamicManager] Failed to load registry:', err.message);
        }
    }
    
    /**
     * Save instance registry to disk
     */
    saveRegistry() {
        try {
            const data = {};
            for (const [name, meta] of this.instances.entries()) {
                data[name] = {
                    projectName: meta.projectName,
                    displayNum: meta.displayNum,
                    cdpPort: meta.cdpPort,
                    internalCdpPort: meta.internalCdpPort,
                    dataDir: meta.dataDir,
                    created: meta.created
                };
            }
            fs.writeFileSync(this.registryPath, JSON.stringify(data, null, 2));
        } catch (err) {
            console.error('[DynamicManager] Failed to save registry:', err.message);
        }
    }
    
    /**
     * Validate project name
     */
    validateProjectName(name) {
        if (!name || typeof name !== 'string') {
            return { valid: false, error: 'Project name is required' };
        }
        if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(name) || name.length > 50) {
            return { valid: false, error: 'Invalid project name. Use lowercase letters, numbers, and hyphens only (2-50 chars)' };
        }
        return { valid: true };
    }
    
    /**
     * Get or create an instance for a project
     */
    async getOrCreateInstance(projectName) {
        const validation = this.validateProjectName(projectName);
        if (!validation.valid) {
            throw new Error(validation.error);
        }
        
        // Check if instance exists
        if (this.instances.has(projectName)) {
            const instance = this.instances.get(projectName);
            instance.lastActivity = Date.now();
            
            // If stopped, start it
            if (instance.status === 'stopped' || instance.status === 'error') {
                console.log(`[DynamicManager] Restarting existing instance: ${projectName}`);
                await this.startInstance(projectName);
            }
            
            console.log(`[DynamicManager] Returning existing instance: ${projectName} (CDP: ${instance.cdpPort})`);
            return instance;
        }
        
        // Check instance limit
        const runningCount = Array.from(this.instances.values()).filter(i => i.status === 'running').length;
        if (runningCount >= this.maxInstances) {
            throw new Error(`Maximum instances reached (${this.maxInstances}). Stop idle instances first.`);
        }
        
        // Create new instance
        console.log(`[DynamicManager] Creating new instance: ${projectName}`);
        return await this.createInstance(projectName);
    }
    
    /**
     * Create a new instance
     */
    async createInstance(projectName) {
        const displayNum = this.nextDisplayNum++;
        const cdpPort = this.nextCdpPort++;
        const internalCdpPort = cdpPort + 10000;
        const dataDir = `/data/dynamic-${projectName}`;
        const logFile = `${this.logDir}/dynamic-${projectName}.log`;
        
        const instance = {
            projectName,
            displayNum,
            cdpPort,
            internalCdpPort,
            dataDir,
            logFile,
            status: 'starting',
            pid: null,
            xvfbPid: null,
            socatPid: null,
            created: Date.now(),
            lastActivity: Date.now()
        };
        
        this.instances.set(projectName, instance);
        this.saveRegistry();
        
        try {
            // Create data directory
            await this.runCommand(`mkdir -p ${dataDir}`);
            await this.runCommand(`chown chrome:chrome ${dataDir} 2>/dev/null || true`);
            
            // Create log file
            await this.runCommand(`touch ${logFile}`);
            await this.runCommand(`chmod 666 ${logFile}`);
            
            // Start Xvfb
            await this.log(instance, 'Starting Xvfb');
            const xvfbProc = spawn('Xvfb', [
                `:${displayNum}`,
                '-screen', '0', `${this.screenWidth}x${this.screenHeight}x24`,
                '-ac', '+extension', 'GLX', '+render', '-noreset'
            ], { detached: true });
            
            instance.xvfbPid = xvfbProc.pid;
            await this.sleep(500);
            
            // Verify Xvfb started
            if (!await this.isProcessRunning(instance.xvfbPid)) {
                throw new Error('Xvfb failed to start');
            }
            
            // Start fluxbox
            await this.log(instance, 'Starting fluxbox');
            await this.runCommand(`su -s /bin/bash chrome -c "fluxbox -display :${displayNum} 2>&1 | grep -v -i 'background\\|wallpaper\\|fbsetbg' >> ${logFile} &" 2>/dev/null || true`);
            
            // Build Chrome flags
            const glFlags = this.useGpu 
                ? '--use-gl=egl --enable-gpu --enable-webgl --enable-webgl2 --ignore-gpu-blocklist --enable-gpu-rasterization --enable-accelerated-video-decode --enable-features=VaapiVideoDecoder,VaapiVideoEncoder'
                : '--use-gl=angle --use-angle=swiftshader --enable-webgl --enable-webgl2 --ignore-gpu-blocklist';
            
            const chromeFlags = `--no-sandbox --disable-setuid-sandbox --disable-dev-shm-usage --no-first-run --no-default-browser-check --no-pings --noerrdialogs --disable-infobars --disable-session-crashed-bubble --disable-search-engine-choice-screen --disable-sync --disable-sync-preferences --disable-background-networking --disable-client-side-phishing-detection --disable-component-update --disable-default-apps --disable-extensions --disable-features=Translate,OptimizationHints,MediaRouter,DialMediaRouteProvider,CalculateNativeWinOcclusion,InterestFeedContentSuggestions,PasswordManager,AutofillServerCommunication,ChromeWhatsNewUI,HttpsUpgrades,HeavyAdIntervention --disable-hang-monitor --disable-ipc-flooding-protection --disable-popup-blocking --disable-prompt-on-repost --disable-domain-reliability --disable-breakpad --disable-renderer-backgrounding --disable-backgrounding-occluded-windows --disable-background-timer-throttling --aggressive-cache-discard --disable-back-forward-cache --memory-pressure-off --password-store=basic --use-mock-keychain --deny-permission-prompts --disable-notifications --enable-features=NetworkService,NetworkServiceInProcess --force-color-profile=srgb --disable-web-security --allow-running-insecure-content --autoplay-policy=no-user-gesture-required ${glFlags}`;
            
            // Start Chromium
            await this.log(instance, `Starting Chromium on internal port ${internalCdpPort} (exposed as ${cdpPort})`);
            const chromeCmd = `su -s /bin/bash chrome -c "DISPLAY=:${displayNum} /usr/lib/chromium/chromium --remote-debugging-port=${internalCdpPort} --remote-debugging-address=0.0.0.0 --window-size=${this.screenWidth},${this.screenHeight} --user-data-dir=${dataDir} ${chromeFlags} about:blank >> ${logFile} 2>&1 &"`;
            
            await this.runCommand(chromeCmd);
            await this.sleep(1500);
            
            // Get Chrome PID
            const pidResult = await this.runCommand(`pgrep -f "user-data-dir=${dataDir}"`);
            instance.pid = parseInt(pidResult.stdout.trim().split('\n')[0]);
            
            if (!instance.pid || !await this.isProcessRunning(instance.pid)) {
                throw new Error('Chrome failed to start');
            }
            
            // Start socat to forward CDP port
            await this.log(instance, `Starting socat: 0.0.0.0:${cdpPort} -> 127.0.0.1:${internalCdpPort}`);
            const socatProc = spawn('socat', [
                `TCP-LISTEN:${cdpPort},fork,bind=0.0.0.0,reuseaddr`,
                `TCP:127.0.0.1:${internalCdpPort}`
            ], { detached: true, stdio: 'ignore' });
            
            instance.socatPid = socatProc.pid;
            await this.sleep(500);
            
            // Verify CDP endpoint
            const cdpAlive = await this.checkCDP(cdpPort);
            if (!cdpAlive) {
                throw new Error('CDP endpoint not responding');
            }
            
            instance.status = 'running';
            await this.log(instance, `Instance ready! CDP: ws://127.0.0.1:${cdpPort}`);
            console.log(`[DynamicManager] ✓ Instance created: ${projectName} (CDP: ${cdpPort}, PID: ${instance.pid})`);
            
            return instance;
            
        } catch (err) {
            console.error(`[DynamicManager] Failed to create instance ${projectName}:`, err.message);
            instance.status = 'error';
            await this.log(instance, `ERROR: ${err.message}`);
            
            // Cleanup partial resources
            await this.killInstance(projectName);
            
            throw err;
        }
    }
    
    /**
     * Start a stopped instance
     */
    async startInstance(projectName) {
        const instance = this.instances.get(projectName);
        if (!instance) {
            throw new Error(`Instance not found: ${projectName}`);
        }
        
        // Kill any stale processes first
        await this.killInstance(projectName);
        
        // Recreate the instance
        this.instances.delete(projectName);
        return await this.createInstance(projectName);
    }
    
    /**
     * Stop an instance
     */
    async stopInstance(projectName) {
        const instance = this.instances.get(projectName);
        if (!instance) {
            throw new Error(`Instance not found: ${projectName}`);
        }
        
        console.log(`[DynamicManager] Stopping instance: ${projectName}`);
        await this.killInstance(projectName);
        instance.status = 'stopped';
        instance.pid = null;
        instance.xvfbPid = null;
        instance.socatPid = null;
        
        return instance;
    }
    
    /**
     * Delete an instance permanently
     */
    async deleteInstance(projectName) {
        const instance = this.instances.get(projectName);
        if (!instance) {
            throw new Error(`Instance not found: ${projectName}`);
        }
        
        console.log(`[DynamicManager] Deleting instance: ${projectName}`);
        await this.killInstance(projectName);
        
        // Remove data directory
        try {
            await this.runCommand(`rm -rf ${instance.dataDir}`);
            await this.runCommand(`rm -f ${instance.logFile}`);
        } catch (err) {
            console.error(`[DynamicManager] Failed to remove data for ${projectName}:`, err.message);
        }
        
        this.instances.delete(projectName);
        this.saveRegistry();
    }
    
    /**
     * Kill all processes for an instance
     */
    async killInstance(projectName) {
        const instance = this.instances.get(projectName);
        if (!instance) return;
        
        const killCommands = [
            instance.pid ? `kill -9 ${instance.pid} 2>/dev/null || true` : null,
            instance.socatPid ? `kill -9 ${instance.socatPid} 2>/dev/null || true` : null,
            instance.xvfbPid ? `kill -9 ${instance.xvfbPid} 2>/dev/null || true` : null,
            `pkill -9 -f "user-data-dir=${instance.dataDir}"`,
            `pkill -9 -f "remote-debugging-port=${instance.internalCdpPort}"`,
            `pkill -9 -f "socat.*${instance.cdpPort}"`,
            `pkill -9 -f "Xvfb :${instance.displayNum}"`
        ].filter(Boolean);
        
        for (const cmd of killCommands) {
            try {
                await this.runCommand(cmd);
            } catch (err) {
                // Ignore errors during cleanup
            }
        }
        
        await this.sleep(500);
    }
    
    /**
     * Clean up idle instances
     */
    async cleanupIdleInstances() {
        const now = Date.now();
        const toCleanup = [];
        
        for (const [name, instance] of this.instances.entries()) {
            if (instance.status === 'running') {
                const idleTime = now - instance.lastActivity;
                if (idleTime > this.idleTimeout) {
                    console.log(`[DynamicManager] Instance ${name} idle for ${Math.round(idleTime / 60000)} minutes, stopping...`);
                    toCleanup.push(name);
                }
            }
        }
        
        for (const name of toCleanup) {
            try {
                await this.stopInstance(name);
            } catch (err) {
                console.error(`[DynamicManager] Failed to cleanup ${name}:`, err.message);
            }
        }
    }
    
    /**
     * Start periodic cleanup timer
     */
    startCleanupTimer() {
        // Check every 5 minutes
        this.cleanupInterval = setInterval(() => {
            this.cleanupIdleInstances().catch(err => {
                console.error('[DynamicManager] Cleanup error:', err);
            });
        }, 5 * 60 * 1000);
    }
    
    /**
     * Get all instances
     */
    getAllInstances() {
        return Array.from(this.instances.entries()).map(([name, meta]) => ({
            projectName: name,
            status: meta.status,
            cdpPort: meta.cdpPort,
            displayNum: meta.displayNum,
            pid: meta.pid,
            created: meta.created,
            lastActivity: meta.lastActivity,
            idleMinutes: Math.round((Date.now() - meta.lastActivity) / 60000)
        }));
    }
    
    /**
     * Get instance by name
     */
    getInstance(projectName) {
        return this.instances.get(projectName) || null;
    }
    
    /**
     * Update activity timestamp
     */
    touchInstance(projectName) {
        const instance = this.instances.get(projectName);
        if (instance) {
            instance.lastActivity = Date.now();
        }
    }
    
    /**
     * Check if CDP endpoint is alive
     */
    async checkCDP(port) {
        return new Promise((resolve) => {
            const req = http.request({
                hostname: '127.0.0.1',
                port,
                path: '/json/version',
                method: 'GET',
                timeout: 2000
            }, (res) => {
                resolve(res.statusCode === 200);
            });
            req.on('error', () => resolve(false));
            req.on('timeout', () => { req.destroy(); resolve(false); });
            req.end();
        });
    }
    
    /**
     * Check if process is running
     */
    async isProcessRunning(pid) {
        if (!pid) return false;
        try {
            const result = await this.runCommand(`kill -0 ${pid} 2>/dev/null && echo "running" || echo "dead"`);
            return result.stdout.trim() === 'running';
        } catch {
            return false;
        }
    }
    
    /**
     * Write log message
     */
    async log(instance, message) {
        const timestamp = new Date().toISOString();
        const logLine = `[${timestamp}] ${message}\n`;
        try {
            fs.appendFileSync(instance.logFile, logLine);
        } catch (err) {
            console.error(`[DynamicManager] Failed to write log for ${instance.projectName}:`, err.message);
        }
    }
    
    /**
     * Run shell command
     */
    runCommand(cmd) {
        return new Promise((resolve, reject) => {
            exec(cmd, { timeout: 10000 }, (error, stdout, stderr) => {
                if (error) reject(error);
                else resolve({ stdout, stderr });
            });
        });
    }
    
    /**
     * Sleep helper
     */
    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
    
    /**
     * Shutdown manager
     */
    async shutdown() {
        console.log('[DynamicManager] Shutting down...');
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        
        // Stop all running instances
        const promises = [];
        for (const name of this.instances.keys()) {
            promises.push(this.stopInstance(name).catch(err => 
                console.error(`[DynamicManager] Failed to stop ${name}:`, err.message)
            ));
        }
        await Promise.all(promises);
        
        this.saveRegistry();
        console.log('[DynamicManager] Shutdown complete');
    }
}

module.exports = DynamicInstanceManager;
