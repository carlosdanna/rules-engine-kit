import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Workspace packages are consumed straight from their TypeScript sources.
  transpilePackages: ['@rules-engine-kit/engine', '@rules-engine-kit/db'],
};

export default nextConfig;
