import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'GraphicView — Análisis técnico',
  icons: { icon: '/icon.png', apple: '/icon.png' },
  description:
    'GraphicView: gráficos de Bitcoin, acciones e índices con herramientas de análisis técnico.',
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
