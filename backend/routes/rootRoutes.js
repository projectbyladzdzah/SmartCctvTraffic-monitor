function mountRootRoutes(app) {
  app.get('/api/status', (req, res) => {
    res.send('<h2>✅ API Monitoring CCTV Berhasil Terhubung!</h2><p>Data JSON: <a href="/api/cctvs">/api/cctvs</a></p>');
  });
}

module.exports = { mountRootRoutes };
