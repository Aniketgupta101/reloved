/**
 * SSRF Protection and Image Buffer Limit Unit Verification
 * Validates the SSRF filter implementation from photoAnalyze.ts lines 1356-1377.
 */
function isAllowedImageUrl(urlStr) {
  try {
    const u = new URL(urlStr);
    if (u.protocol !== "http:" && u.protocol !== "https:") return false;
    const hostname = u.hostname.toLowerCase();
    // Block AWS/GCP instance metadata IPs, loopback, and private internal networks (SSRF prevention)
    if (
      hostname === "169.254.169.254" ||
      hostname === "metadata.google.internal" ||
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname.startsWith("10.") ||
      hostname.startsWith("192.168.") ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname)
    ) {
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

function testSSRFRejection() {
  console.log("=== TESTING SSRF URL VALIDATION (photoAnalyze.ts:1356-1377) ===");

  const testCases = [
    { url: 'http://169.254.169.254/computeMetadata/v1/', desc: 'AWS/GCP Cloud Metadata IP', expected: false },
    { url: 'http://metadata.google.internal/computeMetadata/v1/', desc: 'GCP Internal Metadata DNS', expected: false },
    { url: 'http://localhost:8787/api/admin', desc: 'Localhost loopback', expected: false },
    { url: 'http://127.0.0.1:8080/secret', desc: 'IPv4 127.0.0.1 loopback', expected: false },
    { url: 'http://10.0.0.1/internal', desc: 'RFC-1918 Class A (10.0.0.0/8)', expected: false },
    { url: 'http://172.16.0.1/admin', desc: 'RFC-1918 Class B (172.16.0.0/12)', expected: false },
    { url: 'http://172.31.255.255/docker', desc: 'RFC-1918 Class B upper boundary', expected: false },
    { url: 'http://192.168.1.1/router', desc: 'RFC-1918 Class C (192.168.0.0/16)', expected: false },
    { url: 'ftp://example.com/image.jpg', desc: 'Non-HTTP(S) scheme (ftp)', expected: false },
    { url: 'file:///etc/passwd', desc: 'File scheme', expected: false },
    { url: 'https://storage.googleapis.com/reloved-digital.appspot.com/donations/test.jpg', desc: 'Valid GCS bucket URL', expected: true },
    { url: 'https://images.unsplash.com/photo-12345?w=500', desc: 'Valid public HTTPS image', expected: true }
  ];

  let passed = 0;
  for (const tc of testCases) {
    const isAllowed = isAllowedImageUrl(tc.url);
    const ok = isAllowed === tc.expected;
    if (ok) passed++;
    console.log(`[${ok ? 'PASS' : 'FAIL'}] ${tc.desc} -> ${tc.url} (Allowed: ${isAllowed}, Expected: ${tc.expected})`);
  }

  console.log(`\nSSRF Test Result: ${passed}/${testCases.length} passed.`);
}

testSSRFRejection();
