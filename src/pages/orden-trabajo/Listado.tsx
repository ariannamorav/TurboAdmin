// src/pages/orden-trabajo/Listado.tsx
// src/pages/orden-trabajo/Listado.tsx
import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import "bootstrap/dist/css/bootstrap.min.css";
import "../../styles/custom.scss";
import {
  Container,
  Card,
  Form,
  Button,
  Table,
  Alert,
  InputGroup,
  FormSelect,
} from "react-bootstrap";

/* ======= Tipos ======= */
type OrdenRow = {
  id_orden: number;
  nom_cliente: string;
  matricula: string;
  estado: "Activa" | "Cancelada" | "Facturada" | string;
  fecha: string;
  id_cliente?: number;
  id_vehiculo?: number;
};

type Paged<T> = { items: T[] };

/* ======= API minimal ======= */
const API = {
  BASE_URL: "http://127.0.0.1:8000",

  async list(): Promise<OrdenRow[] | Paged<OrdenRow>> {
    const r = await fetch(`${API.BASE_URL}/ordenes`, { cache: "no-store" });
    if (!r.ok) throw new Error(`Error al listar: ${r.status}`);
    return r.json();
  },

  async editarOrden(
    id: number | string,
    data: Partial<OrdenRow>
  ): Promise<OrdenRow> {
    const r = await fetch(`${API.BASE_URL}/orden/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    if (!r.ok) throw new Error(`Error al editar: ${r.status}`);
    return r.json();
  },
};

/* ======= Helpers ======= */
function normalizeEstado(raw: any): string {
  const v = String(raw ?? "").trim();
  if (v === "1") return "Activa";
  if (v === "2") return "Cancelada";
  if (v === "3") return "Facturada";
  return v; // por si ya viene como texto
}

/* ======= Página: listado de órdenes de trabajo ======= */
export default function OrdenTrabajoListado() {
  const navigate = useNavigate();
  const estados = ["Activa", "Cancelada", "Facturada"] as const;

  const [ordenes, setOrdenes] = useState<OrdenRow[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [message, setMessage] = useState<string>("");
  const [search, setSearch] = useState<string>("");
  const [estadoSeleccionado, setEstadoSeleccionado] = useState<string>("");

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const raw = await API.list();

        // Normaliza estructura y tipos
        const data: OrdenRow[] = Array.isArray(raw) ? raw : raw?.items ?? [];
        const normalizados: OrdenRow[] = data.map((o: any) => ({
          ...o,
          // 👇 soportamos varios nombres de campo
          nom_cliente: String(
            o.nom_cliente ?? o.Nom_cliente ?? o.nombre_cliente ?? ""
          ),
          matricula: String(
            o.matricula ??
            o.Matricula ??
            o.placa ??
            o.Placa ??
            ""
          ),
          estado: normalizeEstado(o.estado ?? o.Estado),
          fecha: String(o.fecha ?? o.Fecha ?? ""),
        }));

        if (mounted) setOrdenes(normalizados);
      } catch (err) {
        console.error(err);
        setMessage("No se pudo cargar la lista de órdenes.");
      } finally {
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const handleEditarOrden = (orden: OrdenRow) => {
    // 🔒 Por seguridad, no permitir editar si está facturada
    if (String(orden.estado) === "Facturada") {
      setMessage("No se puede editar una orden que ya fue facturada.");
      return;
    }
    navigate(`/orden/form/${orden.id_orden}`);
  };

  const handleCancelarOrden = async (orden: OrdenRow) => {
    // 🔒 No permitir cambiar estado si está facturada
    if (String(orden.estado) === "Facturada") {
      setMessage("No se puede cambiar el estado de una orden facturada.");
      return;
    }

    if (String(orden.estado) === "Cancelada") {
      if (
        !window.confirm(
          `¿Desea activar la orden vinculada a ${orden.nom_cliente} con placa ${orden.matricula}?`
        )
      )
        return;
      try {
        setLoading(true);
        await API.editarOrden(orden.id_orden, { ...orden, estado: "Activa" });
        setOrdenes((curr) =>
          curr.map((o) =>
            o.id_orden === orden.id_orden ? { ...o, estado: "Activa" } : o
          )
        );
        setMessage(`Orden ${orden.id_orden} activada.`);
      } catch (err) {
        console.error(err);
        setMessage("No se pudo activar la orden.");
      } finally {
        setLoading(false);
      }
      return;
    }

    if (
      !window.confirm(
        `¿Desea cancelar la orden vinculada a ${orden.nom_cliente} con placa ${orden.matricula}?`
      )
    )
      return;

    try {
      setLoading(true);
      await API.editarOrden(orden.id_orden, { ...orden, estado: "Cancelada" });
      setOrdenes((curr) =>
        curr.map((o) =>
          o.id_orden === orden.id_orden ? { ...o, estado: "Cancelada" } : o
        )
      );
      setMessage(`Orden ${orden.id_orden} cancelada.`);
    } catch (err) {
      console.error(err);
      setMessage("No se pudo cancelar la orden.");
    } finally {
      setLoading(false);
    }
  };

  /* ======= Búsqueda / filtro (versión segura) ======= */
  const ordenesFiltradas = useMemo(() => {
    const q = String(search ?? "").trim().toLowerCase();

    return ordenes.filter((o) => {
      const estadoStr = String(o?.estado ?? "");
      const nomStr = String(o?.nom_cliente ?? "");
      const placaStr = String(o?.matricula ?? "");
      const idStr = String(o?.id_orden ?? "");

      const estadoLC = estadoStr.toLowerCase();
      const nomLC = nomStr.toLowerCase();
      const placaLC = placaStr.toLowerCase();

      const matchesText =
        nomLC.includes(q) ||
        estadoLC.includes(q) ||
        placaLC.includes(q) ||
        idStr.includes(q);

      const matchesEstado = estadoSeleccionado
        ? estadoStr === estadoSeleccionado
        : true;

      return matchesText && matchesEstado;
    });
  }, [ordenes, search, estadoSeleccionado]);

  return (
    <Container className="py-4">
      <h1 className="mb-4 custom-title">Órdenes de Trabajo</h1>

      {message && (
        <Alert
          variant="info"
          className="custom-alert"
          onClose={() => setMessage("")}
          dismissible
        >
          {message}
        </Alert>
      )}

      <Button
        variant="primary"
        className="me-2 mb-4 custom-btn-primary"
        disabled={loading}
        onClick={() => navigate("/ordenes/form")}
      >
        Crear
      </Button>

      <Card className="custom-card">
        <Card.Header className="d-flex justify-content-between align-items-center custom-card-header gap-2 flex-wrap">
          <span>Órdenes existentes ({ordenesFiltradas.length})</span>

          <FormSelect
            style={{ maxWidth: "250px" }}
            value={estadoSeleccionado}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) =>
              setEstadoSeleccionado(e.target.value)
            }
            className="me-2"
          >
            <option value="">Filtrar por estado</option>
            {estados.map((st) => (
              <option key={st} value={st}>
                {st}
              </option>
            ))}
          </FormSelect>

          <InputGroup style={{ maxWidth: "300px" }}>
            <Form.Control
              type="text"
              placeholder="Buscar..."
              value={search}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                setSearch(e.target.value)
              }
            />
          </InputGroup>
        </Card.Header>

        <Table striped responsive className="mb-0 custom-table">
          <thead>
            <tr>
              <th>Id Orden</th>
              <th>Nombre Cliente</th>
              <th>Placa</th>
              <th>Estado</th>
              <th>Fecha</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {ordenesFiltradas.map((o) => {
              const esFacturada = String(o.estado) === "Facturada";
              return (
                <tr key={o.id_orden}>
                  <td>{o.id_orden}</td>
                  <td>{o.nom_cliente}</td>
                  <td>{o.matricula}</td>
                  <td>{o.estado}</td>
                  <td>{o.fecha}</td>
                  <td>
                    <Button
                      size="sm"
                      variant="outline-primary"
                      className="me-2 custom-btn-edit"
                      onClick={() => handleEditarOrden(o)}
                      // 🔒 NO editar si está facturada
                      disabled={loading || esFacturada}
                    >
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline-danger"
                      className="custom-btn-delete"
                      onClick={() => handleCancelarOrden(o)}
                      // 🔒 NO cambiar estado si está facturada
                      disabled={loading || esFacturada}
                    >
                      Cambiar estado
                    </Button>
                  </td>
                </tr>
              );
            })}
            {ordenesFiltradas.length === 0 && (
              <tr>
                <td colSpan={6} className="text-center py-4">
                  No hay órdenes para mostrar.
                </td>
              </tr>
            )}
          </tbody>
        </Table>
      </Card>
    </Container>
  );
}
