/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ['child_process', 'path'],
  turbopack: {},
};

export default nextConfig;
