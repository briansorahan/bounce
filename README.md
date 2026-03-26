# Bounce

Audio editor built with Electron and FluCoMa.

## Getting Started

```bash
# Clone with submodules
git clone --recursive https://github.com/briansorahan/bounce.git
cd bounce

# Build C++ dependencies first
npm run build:deps

# Install dependencies and build native addon
npm install

# Rebuild native modules for Electron
npm run rebuild

# Build TypeScript and Electron
npm run build:electron

# Run the Electron app
npm run dev:electron
```

## Testing

```bash
# Run unit tests
npm test

# Run the Dockerized tests locally, including Playwright e2e tests
./build.sh
```

## Prerequisites

- Node.js v24+
- npm v11+
- C++ compiler with C++17 support
- Python 3.x (required by node-gyp)
- CMake 3.10+
- **macOS**: Xcode Command Line Tools
- **Linux**: build-essential, BLAS, LAPACK libraries

## Website deployment (bounceaudio.org)

The site source lives in `site/` and is deployed automatically to GitHub Pages whenever changes to that directory are pushed to `main`.

### One-time setup after merging

**1. Enable GitHub Pages in the repository settings**

1. Go to **Settings → Pages** in the GitHub repository.
2. Under *Source*, select **GitHub Actions**.
3. Under *Custom domain*, enter `bounceaudio.org` and click **Save**. GitHub will
   verify the CNAME file already present in `site/` and provision an HTTPS
   certificate automatically (this can take a few minutes).
4. Check **Enforce HTTPS** once the certificate is issued.

**2. Add DNS records at your registrar**

For an apex domain (`bounceaudio.org`) you need **A records** (and optionally
**AAAA records**) pointing to GitHub's Pages servers. Add all four A records so
that traffic is load-balanced and resilient:

| Type | Name | Value |
|------|------|-------|
| A | `@` | `185.199.108.153` |
| A | `@` | `185.199.109.153` |
| A | `@` | `185.199.110.153` |
| A | `@` | `185.199.111.153` |

If you also want `www.bounceaudio.org` to resolve, add a CNAME record:

| Type | Name | Value |
|------|------|-------|
| CNAME | `www` | `briansorahan.github.io` |

DNS propagation typically takes a few minutes but can take up to 48 hours
depending on your registrar and TTL settings. You can check propagation with:

```bash
dig bounceaudio.org +noall +answer
```

Once the A records resolve to GitHub's IPs and the Pages certificate is issued,
the site will be live at `https://bounceaudio.org`.
