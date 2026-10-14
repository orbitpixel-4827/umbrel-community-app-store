import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'GraphicView — Análisis técnico',
    short_name: 'GraphicView',
    description:
      'Gráficos de Bitcoin, acciones e índices con herramientas de análisis técnico.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#07090d',
    theme_color: '#07090d',
    icons: [
      {
        src: '/icon.png',
        sizes: '256x256',
        type: 'image/png',
        purpose: 'any',
      },
      {
        src: '/icon.png',
        sizes: '256x256',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
