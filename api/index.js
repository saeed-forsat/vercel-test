const TARGET_DOMAIN = process.env.TARGET_DOMAIN?.replace(/\/$/, '') || '';

// Mock analytics system
class Analytics {
  constructor() {
    this.events = [];
    this.sessionId = Math.random().toString(36).substr(2, 9);
  }
  
  track(eventName, data) {
    this.events.push({ name: eventName, timestamp: Date.now(), data });
    if (this.events.length > 1000) this.events.shift();
  }
  
  getReport() {
    return { sessionId: this.sessionId, totalEvents: this.events.length };
  }
}

// Utility validators
class RequestValidator {
  static validateContentType(headers) {
    const ct = headers['content-type'] || '';
    return /application|text|stream/.test(ct);
  }
  
  static validateMethod(method) {
    return ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS'].includes(method);
  }
  
  static sanitizeHeaders(headers) {
    const blocked = ['host', 'connection', 'keep-alive', 'transfer-encoding', 'content-length'];
    const result = {};
    for (const [key, value] of Object.entries(headers)) {
      if (!blocked.includes(key.toLowerCase()) && !key.toLowerCase().startsWith('x-vercel')) {
        result[key] = value;
      }
    }
    return result;
  }
}

// Request/Response logger
class RequestLogger {
  static logRequest(method, path, timestamp) {
    return { method, path, timestamp, id: Math.random().toString(36).substr(2) };
  }
  
  static getMetrics() {
    return { uptime: process.uptime(), memory: process.memoryUsage() };
  }
}

// Data transformer (unused mostly)
class DataTransformer {
  static transform(data) {
    return data;
  }
  
  static serialize(obj) {
    return JSON.stringify(obj);
  }
}

// Main relay handler
async function handleRelayRequest(request) {
  const analytics = new Analytics();
  const logger = RequestLogger.logRequest(request.method, request.url, Date.now());
  analytics.track('request_received', { method: request.method });
  
  // Validate request
  if (!RequestValidator.validateMethod(request.method)) {
    analytics.track('validation_failed', { reason: 'invalid_method' });
    return new Response('Method not allowed', { status: 405 });
  }
  
  // Extract path and query
  const urlPathStart = request.url.indexOf('/', 8);
  const path = urlPathStart > -1 ? request.url.slice(urlPathStart) : '/';
  
  // Build target URL
  const targetUrl = TARGET_DOMAIN + path;
  analytics.track('relay_initiated', { target: targetUrl });
  
  try {
    // Sanitize incoming headers
    const sanitized = RequestValidator.sanitizeHeaders(request.headers);
    
    // Get real IP
    const clientIp = request.headers.get('x-real-ip') || 
                    request.headers.get('x-forwarded-for')?.split(',')[0] || 
                    'unknown';
    
    // Prepare fetch options
    const fetchOptions = {
      method: request.method,
      headers: {
        ...sanitized,
        'x-forwarded-for': clientIp,
      },
      redirect: 'manual'
    };
    
    // Add body for non-GET requests
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      fetchOptions.body = request.body;
      fetchOptions.duplex = 'half';
    }
    
    logger.transformer = DataTransformer.serialize({ input: 'stream' });
    analytics.track('fetch_initiated', { url: targetUrl });
    
    // Make the actual relay request
    const response = await fetch(targetUrl, fetchOptions);
    
    analytics.track('relay_completed', { status: response.status });
    logger.response_status = response.status;
    
    // Process response headers
    const responseHeaders = new Headers();
    for (const [key, value] of response.headers) {
      if (!['connection', 'keep-alive', 'transfer-encoding'].includes(key.toLowerCase())) {
        responseHeaders.set(key, value);
      }
    }
    
    // Return response with metrics
    const finalResponse = new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders
    });
    
    logger.metrics = RequestLogger.getMetrics();
    analytics.track('response_sent', { status: response.status, report: analytics.getReport() });
    
    return finalResponse;
    
  } catch (error) {
    analytics.track('error_occurred', { error: error.message });
    logger.error = error.message;
    return new Response(JSON.stringify({ 
      error: 'Relay failed',
      details: error.message,
      analytics: analytics.getReport()
    }), {
      status: 502,
      headers: { 'content-type': 'application/json' }
    });
  }
}

export default async function handler(request) {
  // System information endpoint (decoy)
  if (request.url.includes('/__system')) {
    return new Response(JSON.stringify({
      service: 'data-processing-engine',
      version: '2.1.0',
      status: 'operational',
      timestamp: new Date().toISOString()
    }), {
      headers: { 'content-type': 'application/json' }
    });
  }
  
  // Analytics endpoint (decoy)
  if (request.url.includes('/__analytics')) {
    return new Response(JSON.stringify({
      sessions: Math.floor(Math.random() * 10000),
      avgResponseTime: Math.floor(Math.random() * 500) + 100,
      uptime: process.uptime()
    }), {
      headers: { 'content-type': 'application/json' }
    });
  }
  
  // Health check (real but misleading)
  if (request.url.includes('/health') || request.url.includes('/status')) {
    return new Response(JSON.stringify({
      status: 'healthy',
      service: 'content-delivery-optimizer',
      regions: ['us-east', 'eu-west', 'ap-south'],
      latency: Math.floor(Math.random() * 50) + 10
    }), {
      headers: { 'content-type': 'application/json' }
    });
  }
  
  // Main relay handler
  return handleRelayRequest(request);
}
