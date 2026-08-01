import type { Metadata } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: 'Puentes de Papel — Stock y precios',
  description: 'Gestión de stock y precios de la librería Puentes de Papel.',
};

/**
 * Layout base (T022). Deliberadamente mínimo: la navegación y las pantallas
 * llegan con sus historias. Acá sólo está el marco común y el enlace a cada
 * sección, para poder recorrer la aplicación mientras se construye.
 */
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>
        <header className="encabezado">
          <Link className="marca" href="/">
            Puentes de Papel
          </Link>
        </header>
        <main className="contenido">{children}</main>
      </body>
    </html>
  );
}
