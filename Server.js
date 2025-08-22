// server.js
const express = require('express');
const path = require('path');
const compression = require('compression');

const app = express();
const PORT = process.env.PORT || 9010;
const BUILD = path.join(__dirname, 'build');

app.disable('x-powered-by');
app.use(compression());

// 정적 파일 서빙 (자산 캐싱은 길게, index.html은 no-store)
app.use(express.static(BUILD, {
  index: false,
  maxAge: '1y',
  setHeaders(res, filePath) {
    if (filePath.endsWith('index.html')) {
      res.setHeader('Cache-Control', 'no-store');
    }
  }
}));

// 헬스체크(옵션)
app.get('/healthz', (req, res) => res.status(200).send('ok'));

// SPA 라우팅 fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(BUILD, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server listening on ${PORT}`);
});
