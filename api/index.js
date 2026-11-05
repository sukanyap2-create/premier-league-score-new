const app = require('../server');

module.exports = (req, res) => {
  const requestUrl = new URL(req.url, 'http://localhost');
  const apiPath = requestUrl.searchParams.get('__vercel_express_path');

  if (apiPath) {
    requestUrl.searchParams.delete('__vercel_express_path');
    const query = requestUrl.searchParams.toString();
    req.url = `/api/${apiPath}${query ? `?${query}` : ''}`;
  }

  return app(req, res);
};
