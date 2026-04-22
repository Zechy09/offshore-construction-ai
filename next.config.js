/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    // pdf.js references canvas for rendering; we only need text extraction
    config.resolve.alias.canvas = false
    return config
  },
}
module.exports = nextConfig
