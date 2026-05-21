module.exports = function setupDevHeaders(app) {
  app.use((req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

    if (req.path.endsWith('.wasm')) {
      res.setHeader('Content-Type', 'application/wasm');
    }

    next();
  });
};
