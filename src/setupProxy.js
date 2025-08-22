const { createProxyMiddleware } = require('http-proxy-middleware');

module.exports = function (app) {
  app.use(
    '/hive',
    createProxyMiddleware({
      target: 'https://gw-test-gcl.c2xstation.net:9091',
      changeOrigin: true,
      secure: true,
      cookieDomainRewrite: 'localhost',
      logLevel: 'debug',
      // ↓ 필요시 경로 리라이트(안전)
      // pathRewrite: { '^/hive': '/hive' }, // 또는 target을 '/hive'로 주고 '^/hive':'' 로 비우는 형태
      onProxyReq(proxyReq, req) {
        console.log('[HPM:req]', req.method, req.url);
      },
      onProxyRes(proxyRes, req) {
        console.log('[HPM:res]', proxyRes.statusCode, req.method, req.url);
      },
    })
  );
};
