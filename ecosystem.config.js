// PM2 Production Cluster Configuration
// Optimized for 1,000 to 5,000 Concurrent Users
// Usage:
//   npm install -g pm2
//   pm2 start ecosystem.config.js
//   pm2 status
//   pm2 monit

module.exports = {
  apps: [
    {
      name: 'imrd-assistant',
      script: './server.js',
      instances: 'max', // Scales across all available CPU cores automatically
      exec_mode: 'cluster',
      watch: false,
      max_memory_restart: '1G', // Automatically restart worker if memory leak exceeds 1GB
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
        UV_THREADPOOL_SIZE: 64,
        MAX_CONCURRENT_LLM_CALLS: 40,
        RATE_LIMIT_PER_MINUTE: 45
      },
      // Zero-downtime rolling reload configuration
      wait_ready: true,
      listen_timeout: 10000,
      kill_timeout: 5000
    }
  ]
};

