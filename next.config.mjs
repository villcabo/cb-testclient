/** @type {import('next').NextConfig} */
const isGithubPages = process.env.GITHUB_PAGES == 'true';
const nextConfig = {
  output: isGithubPages ? 'export' : 'standalone',
  basePath: isGithubPages ? '/cb-testclient' : '',
  assetPrefix: isGithubPages ? '/cb-testclient/' : '',
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
