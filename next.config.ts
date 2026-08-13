export default {
  images: {
    remotePatterns: [
      {
        protocol: 'https' as const,
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/covers/**',
      },
    ],
  },
};
