/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    appDir: true,
  },
  assetPrefix: isProd ? '/oleonardo.github.io/' : '',
  images: {
    unoptimized: true,
  },
}

module.exports = nextConfig
