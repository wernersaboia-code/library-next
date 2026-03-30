// next.config.ts
export default {
  experimental: {
    ppr: true,
  },
  logging: {
    fetches: {
      fullUrl: true,
    },
  },
  images: {
    remotePatterns: [
      // Goodreads (pode remover se quiser)
      {
        protocol: 'https',
        hostname: '*.gr-assets.com',
        port: '',
      },
    ],
    // Permite URLs locais via nossa API route
    localPatterns: [
      {
        pathname: '/api/cover/**',
      },
    ],
  },
};