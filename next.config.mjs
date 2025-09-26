/** @type {import('next').NextConfig} */
const isGithubPages = 'true';
const nextConfig = {
  output: 'export',
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
