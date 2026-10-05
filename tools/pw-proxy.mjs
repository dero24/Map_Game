// A browser behind an egress proxy (a cloud session's): node and curl read HTTPS_PROXY, Chromium
// doesn't — so the tools hand it over as launch flags, the dev server and a local worker staying
// direct. (Playwright's own `proxy` option sends localhost through the proxy too.) An intercepting
// proxy signs with its own CA: Chromium trusts exactly the certificates node is told to trust
// (NODE_EXTRA_CA_CERTS), by their keys. Nothing at all when no proxy is set (a desk, CI).
//   chromium.launch({ headless: true, args: [...ownArgs, ...proxyArgs()] })
import { readFileSync } from 'node:fs';
import { X509Certificate, createHash } from 'node:crypto';

export function proxyArgs() {
  const server = process.env.HTTPS_PROXY || process.env.https_proxy || process.env.HTTP_PROXY || process.env.http_proxy;
  if (!server) return [];
  const args = [`--proxy-server=${server}`, '--proxy-bypass-list=localhost;127.0.0.1'];
  const bundle = process.env.NODE_EXTRA_CA_CERTS;
  if (bundle) {
    try {
      const pems = readFileSync(bundle, 'utf8').match(/-----BEGIN CERTIFICATE-----[\s\S]+?-----END CERTIFICATE-----/g) ?? [];
      const keys = pems.map((p) => createHash('sha256').update(new X509Certificate(p).publicKey.export({ type: 'spki', format: 'der' })).digest('base64'));
      if (keys.length) args.push(`--ignore-certificate-errors-spki-list=${keys.join(',')}`);
    } catch { /* (no bundle to read: the proxy's own CA must already be trusted) */ }
  }
  return args;
}
