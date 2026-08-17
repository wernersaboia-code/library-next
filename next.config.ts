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
  experimental: {
    staleTimes: {
      // Sem isso (default dynamic: 0), toda navegação entre páginas
      // dinâmicas refaz o render no servidor: voltar para o acervo e trocar
      // de aba ficam lentos. Com 60s, o payload visitado/prefetched fica
      // fresco no cache do cliente e a navegação é instantânea.
      // router.refresh() (usado nos salvamentos) continua invalidando na hora.
      dynamic: 60,
    },
  },
};
