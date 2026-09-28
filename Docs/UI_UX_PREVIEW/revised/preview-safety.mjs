const LOOPBACK_HOSTS = new Set(['127.0.0.1', 'localhost', '[::1]']);

export function requireLoopbackBase(value) {
  const url = new URL(value);
  if (!LOOPBACK_HOSTS.has(url.hostname)) {
    throw new Error(`PREVIEW_URL must use a loopback host, received: ${url.origin}`);
  }
  return url;
}

export async function blockUnsafeRequests(page, baseURL, { external = [], writes = [] } = {}) {
  await page.route('**/*', async route => {
    const request = route.request();
    const requestURL = request.url();
    if (/^(blob:|data:)/.test(requestURL)) {
      await route.continue();
      return;
    }

    const url = new URL(requestURL);
    const isLocalRead = url.origin === baseURL.origin && request.method() === 'GET';
    if (isLocalRead) {
      await route.continue();
      return;
    }

    if (url.origin !== baseURL.origin) external.push(requestURL);
    if (request.method() !== 'GET') writes.push(requestURL);
    await route.abort('blockedbyclient');
  });
}
