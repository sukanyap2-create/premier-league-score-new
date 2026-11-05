const app = require('../server');
const INTERNAL_PATH_QUERY = '__vercel_express_path';

module.exports = (req, res) => {
  const requestUrl = new URL(req.url, 'http://localhost');
  const apiPath = requestUrl.searchParams.get(INTERNAL_PATH_QUERY);

  if (apiPath) {
    requestUrl.searchParams.delete(INTERNAL_PATH_QUERY);
    if (req.query && Object.hasOwn(req.query, INTERNAL_PATH_QUERY)) {
      delete req.query[INTERNAL_PATH_QUERY];
    }
    const query = requestUrl.searchParams.toString();
    req.url = `/api/${apiPath}${query ? `?${query}` : ''}`;
  }

  return app(req, res);
};
