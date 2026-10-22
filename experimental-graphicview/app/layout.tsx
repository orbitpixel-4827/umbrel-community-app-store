import type { Metadata, Viewport } from 'next';
import './globals.css';
import './miestilo.css';

export const metadata: Metadata = {
  title: 'GraphicView — Análisis técnico',
  description:
    'GraphicView: gráficos de Bitcoin, acciones e índices con herramientas de análisis técnico.',
  applicationName: 'GraphicView',
  manifest: '/manifest.webmanifest',
  icons: {
    icon: [{ url: '/icon.png', type: 'image/png', sizes: '256x256' }],
    apple: [{ url: '/icon.png', type: 'image/png', sizes: '256x256' }],
    shortcut: '/icon.png',
  },
  appleWebApp: {
    capable: true,
    title: 'GraphicView',
    statusBarStyle: 'black-translucent',
  },
};

export const viewport: Viewport = {
  themeColor: '#07090d',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
