import Link from 'next/link';
import { Buscador } from './buscador';

export default function Page() {
  return (
    <>
      <div className="cabecera-pagina">
        <h1>Consultar stock y precio</h1>
        <Link className="boton-secundario" href="/libros/nuevo">
          Cargar un libro
        </Link>
      </div>
      <Buscador />
    </>
  );
}
