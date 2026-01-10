// Subdomain-based VNC URL generation
// This version uses instance subdomains instead of path-based routing

function getVncUrl(wsPort) {
    // Calculate instance ID from websockify port (6080 = instance 0, 6081 = instance 1, etc.)
    const instanceId = wsPort - 6080;

    // Build subdomain URL
    // Example: instance0.grid.s6securitylabs.com, instance1.grid.s6securitylabs.com, etc.
    const instanceSubdomain = `instance${instanceId}.grid.s6securitylabs.com`;

    // Use current protocol (http/https)
    const protocol = window.location.protocol;

    // WebSocket path is just /websockify (subdomain determines which instance)
    const wsPath = '/websockify';

    // noVNC URL pointing to instance subdomain
    // noVNC will connect to wss://instanceX.grid.s6securitylabs.com/websockify
    return `${protocol}//${instanceSubdomain}/vnc.html?path=${encodeURIComponent(wsPath)}&autoconnect=true&resize=scale`;
}

// Alternative: If you want to use the same base domain with query param
function getVncUrlQueryBased(wsPort) {
    const instanceId = wsPort - 6080;
    const instanceSubdomain = `instance${instanceId}.grid.s6securitylabs.com`;
    const protocol = window.location.protocol;

    // Direct URL to instance subdomain noVNC viewer
    return `${protocol}//${instanceSubdomain}/vnc.html?autoconnect=true&resize=scale`;
}

// For CDP endpoint URLs (if needed)
function getCDPEndpoint(instanceId, cdpPort) {
    // CDP can also use subdomains if desired
    // Example: instance0.grid.s6securitylabs.com:9222
    return `instance${instanceId}.grid.s6securitylabs.com:${cdpPort}`;
}
