import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Increase body size limit for file uploads (default is 10MB)
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
    // Also increase limit for API route handlers (proxy/middleware)
    proxyClientMaxBodySize: '50mb',
  },
  async redirects() {
    return [
      {
        source: '/',
        destination: '/categories',
        permanent: false,
      },
    ]
  },
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'drive.google.com',
        pathname: '/thumbnail/**',
      },
      {
        protocol: 'https',
        hostname: 'drive.google.com',
        pathname: '/uc/**',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        pathname: '/drive-storage/**',
      },
    ],
  },
  // Configure for Turbopack (Next.js 16 default)
  turbopack: {
    resolveAlias: {
      canvas: './empty-module.js',
      // Force single React instance for react-konva compatibility
      'react': 'react',
      'react-dom': 'react-dom',
    },
  },
  // Ensure react and react-dom are not duplicated
  webpack: (config, { isServer }) => {
    if (!isServer) {
      config.resolve = config.resolve || {};
      config.resolve.alias = {
        ...config.resolve.alias,
        react: require.resolve('react'),
        'react-dom': require.resolve('react-dom'),
      };
    }
    return config;
  },
};

export default nextConfig;
