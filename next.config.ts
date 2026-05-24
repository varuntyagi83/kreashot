// Deploy connectivity test after GitHub repo rename to kreashot (2026-05-23)
import type { NextConfig } from "next";
import { withSentryConfig } from '@sentry/nextjs';

const nextConfig: NextConfig = {
  // Required for Docker/Railway deployment (produces server.js + standalone output)
  output: 'standalone',
  // Native Node addons can't be bundled by Turbopack — load at runtime instead
  serverExternalPackages: ['@resvg/resvg-js'],
  // Increase body size limit for file uploads (default is 10MB)
  experimental: {
    serverActions: {
      bodySizeLimit: '50mb',
    },
    // Also increase limit for API route handlers (proxy/middleware)
    proxyClientMaxBodySize: '50mb',
  },
  async headers() {
    const isDev = process.env.NODE_ENV !== 'production'
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "img-src 'self' data: blob: https://lh3.googleusercontent.com https://drive.google.com https://*.supabase.co https://storage.googleapis.com",
              "font-src 'self' data: https://fonts.gstatic.com",
              `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
              "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
              "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://generativelanguage.googleapis.com https://api.openai.com https://www.googleapis.com https://lh3.googleusercontent.com https://drive.google.com https://drive.googleapis.com",
              "frame-ancestors 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join('; '),
          },
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin-allow-popups' },
          { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
        ],
      },
    ]
  },
  async redirects() {
    return []
  },
  images: {
    qualities: [75, 90],
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
        pathname: '/d/**',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        pathname: '/drive-storage/**',
      },
      {
        protocol: 'https',
        hostname: 'storage.googleapis.com',
        pathname: '/**',
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

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  silent: true,
  widenClientFileUpload: true,
  sourcemaps: { disable: true },
});
