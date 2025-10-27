/** @type {import('next').NextConfig} */
// const isGithubPages = process.env.GITHUB_PAGES === 'true';
const isGithubPages = true;
const nextConfig = {
  output: 'standalone',
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
  // Suprimir warnings de hydratación causados por extensiones del navegador
  reactStrictMode: true,
}

export default nextConfig
