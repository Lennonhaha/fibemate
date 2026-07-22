// SPDX-License-Identifier: GPL-3.0-only
/**
 * EXPERIMENTAL — 仿真非生产
 * 此模块为 Privacy Layer 实验性功能，未经生产审计
 * 请勿用于关键路径或主网
 */




/**
 * FIBEMATE Mix Network Configuration
 * 
 * Configures mix nodes for multi-hop anonymous routing.
 * Each message passes through multiple mix nodes before reaching destination.
 * 
 * Architecture: Sender -> Mix1 -> Mix2 -> Mix3 -> Destination
 * 
 * Security properties:
 * - Mix1 knows sender but not destination
 * - Mix2 knows neither sender nor destination
 * - Mix3 knows destination but not sender
 * - No single node knows both sender and destination
 */

const MIX_CONFIG = {
    // Enable multi-hop routing
    enabled: true,
    
    // Number of hops (3-5 recommended for meaningful anonymity)
    hopCount: 3,
    
    // Mix nodes configuration
    // In production, these would be geographically distributed servers
    // For testing, we use the same server on different ports
    nodes: [
        {
            id: 'mix-node-1',
            name: 'Mix Node Alpha',
            address: (typeof window !== 'undefined' ? 'wss://' + window.location.hostname + ':3001/mix/alpha' : 'wss://fibemate.link:3001/mix/alpha'),
            // Fallback for development
            addressFallback: '' + (window.location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + window.location.host + ''/mix/alpha',
            // Public key for ECDH (P-256)
            // In production, fetched from server or PKI
            publicKey: null, // Will be fetched on init
            location: 'CN-Beijing',
            latency: 50 // ms, for route optimization
        },
        {
            id: 'mix-node-2',
            name: 'Mix Node Beta',
            address: (typeof window !== 'undefined' ? 'wss://' + window.location.hostname + ':3001/mix/beta' : 'wss://fibemate.link:3001/mix/beta'),
            addressFallback: '' + (window.location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + window.location.host + ''/mix/beta',
            publicKey: null,
            location: 'CN-Shanghai',
            latency: 30
        },
        {
            id: 'mix-node-3',
            name: 'Mix Node Gamma',
            address: (typeof window !== 'undefined' ? 'wss://' + window.location.hostname + ':3001/mix/gamma' : 'wss://fibemate.link:3001/mix/gamma'),
            addressFallback: '' + (window.location.protocol === 'https:' ? 'wss:' : 'ws:') + '//' + window.location.host + ''/mix/gamma',
            publicKey: null,
            location: 'CN-Shenzhen',
            latency: 40
        }
    ],
    
    // Batch settings for mix nodes
    batching: {
        enabled: true,
        minBatchSize: 5,      // Minimum messages before flush
        maxBatchSize: 50,     // Maximum messages in batch
        maxDelayMs: 5000,     // Maximum delay before flush (5s)
        minDelayMs: 500       // Minimum delay (500ms)
    },
    
    // Route selection strategy
    routing: {
        strategy: 'random',  // 'random', 'latency-optimized', 'geographic'
        // For latency-optimized: prefer lower latency nodes
        // For geographic: prefer diverse geographic distribution
    },
    
    // Cover traffic settings
    coverTraffic: {
        enabled: true,
        rate: 0.1,           // 10% of messages are cover traffic
        minIntervalMs: 10000, // Minimum 10s between cover messages
        maxIntervalMs: 60000  // Maximum 60s between cover messages
    }
};

/**
 * Get active mix nodes (with public keys)
 */
async function getActiveMixNodes() {
    const activeNodes = [];
    
    for (const node of MIX_CONFIG.nodes) {
        // In production, fetch public key from server
        // For now, use placeholder (will be replaced with real key exchange)
        if (!node.publicKey) {
            // Generate ephemeral key for testing
            // WARNING: In production, this MUST be the server's real public key
            const keyPair = await crypto.subtle.generateKey(
                { name: 'ECDH', namedCurve: 'P-256' },
                true,
                ['deriveKey']
            );
            const publicKeyRaw = await crypto.subtle.exportKey('raw', keyPair.publicKey);
            node.publicKey = btoa(String.fromCharCode(...new Uint8Array(publicKeyRaw)));
        }
        
        activeNodes.push({
            id: node.id,
            address: node.addressFallback || node.address,
            publicKey: node.publicKey
        });
    }
    
    return activeNodes;
}

/**
 * Select route through mix nodes
 * @param {string} strategy - Route selection strategy
 * @returns {Array} Selected mix nodes for the route
 */
function selectRoute(strategy = MIX_CONFIG.routing.strategy) {
    const nodes = [...MIX_CONFIG.nodes];
    
    switch (strategy) {
        case 'random':
            // Fisher-Yates shuffle
            for (let i = nodes.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [nodes[i], nodes[j]] = [nodes[j], nodes[i]];
            }
            break;
            
        case 'latency-optimized':
            // Sort by latency (lowest first)
            nodes.sort((a, b) => a.latency - b.latency);
            break;
            
        case 'geographic':
            // Ensure geographic diversity
            // TODO: Implement geographic diversity selection
            break;
    }
    
    // Return configured number of hops
    return nodes.slice(0, MIX_CONFIG.hopCount);
}

/**
 * Initialize mix network
 */
async function initMixNetwork() {
    if (!MIX_CONFIG.enabled) {
        console.log('[MixConfig] Mix network disabled');
        return null;
    }
    
    const activeNodes = await getActiveMixNodes();
    console.log(`[MixConfig] Initialized ${activeNodes.length} mix nodes`);
    
    return {
        nodes: activeNodes,
        config: MIX_CONFIG,
        selectRoute,
        getActiveMixNodes
    };
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        MIX_CONFIG,
        getActiveMixNodes,
        selectRoute,
        initMixNetwork
    };
}

if (typeof window !== 'undefined') {
    window.MIX_CONFIG = MIX_CONFIG;
    window.initMixNetwork = initMixNetwork;
}
