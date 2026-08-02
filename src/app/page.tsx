import Link from 'next/link';
import { buscarLibrosAction } from '@/app/actions/busqueda';
import { ESTADO_BUSQUEDA_INICIAL } from '@/app/actions/estados';
import { Buscador } from './buscador';

/**
 * La pantalla lee la base en cada visita, así que no puede prerenderizarse: un
 * catálogo congelado en tiempo de build mostraría datos viejos.
 */
export const dynamic = 'force-dynamic';

export default async function Page() {
  // Con el término vacío la acción devuelve el catálogo activo completo (RF-10),
  // que es lo que se ve al abrir la pantalla sin haber buscado nada.
  const catalogo = await buscarLibrosAction(ESTADO_BUSQUEDA_INICIAL, new FormData());

  return (
    <>
      <div className="cabecera-pagina">
        <h1>Consultar stock y precio</h1>
        <div className="acciones-cabecera">
          <Link className="boton-secundario" href="/excel/alta-masiva">
            Alta masiva por Excel
          </Link>
          <Link className="boton-secundario" href="/libros/nuevo">
            Cargar un libro
          </Link>
        </div>
      </div>
      <Buscador estadoInicial={catalogo} />
    </>
  );
}
