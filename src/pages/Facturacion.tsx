// src/pages/Facturacion.tsx
import { useEffect, useMemo, useState } from "react";
import {
  Container,
  Card,
  Button,
  Form,
  Table,
  Alert,
  InputGroup,
} from "react-bootstrap";
import "bootstrap/dist/css/bootstrap.min.css";
import "../styles/custom.scss";

type OrdenRow = {
  id_orden: number;
  nom_cliente: string;
  matricula: string;
  total: number;
  estado: "Activa" | "Cancelada" | "Facturada" | string;
};

type FacturaRow = {
  id_factura: number;
  id_orden: number;
  nom_cliente: string;
  matricula: string;
  fecha: string;
  metodo_pago: string;
  estado_pago: boolean;
  total: number;
  descuento: number;
};

function normalizeEstado(raw: any): string {
  const v = String(raw ?? "").trim();
  if (v === "1") return "Activa";
  if (v === "2") return "Cancelada";
  if (v === "3") return "Facturada";
  return v;
}

const API = {
  BASE_URL: "http://127.0.0.1:8000",

  async listOrdenes(): Promise<OrdenRow[]> {
    const r = await fetch(`${API.BASE_URL}/ordenes`, { cache: "no-store" });
    if (!r.ok) throw new Error("Error al listar órdenes");
    const raw = await r.json();
    const data: any[] = Array.isArray(raw) ? raw : raw?.items ?? [];

    const mapped: OrdenRow[] = data.map((o: any) => ({
      id_orden: o.id_orden,
      nom_cliente: String(
        o.nom_cliente ?? o.Nom_cliente ?? o.nombre_cliente ?? ""
      ),
      matricula: String(
        o.matricula ?? o.Matricula ?? o.placa ?? o.Placa ?? ""
      ),
      total: Number(o.total ?? 0),
      estado: normalizeEstado(o.estado ?? o.Estado),
    }));

    //  solo órdenes ACTIVAS para facturar
    return mapped.filter((o) => o.estado === "Activa");
  },

  async listFacturas(q?: string): Promise<FacturaRow[]> {
    const params = new URLSearchParams();
    if (q) params.append("q", q);
    const r = await fetch(`${API.BASE_URL}/facturas?${params.toString()}`, {
      cache: "no-store",
    });
    if (!r.ok) throw new Error("Error al listar facturas");
    const data: any[] = await r.json();
    return data.map((f: any) => ({
      id_factura: f.id_factura,
      id_orden: f.id_orden,
      nom_cliente: f.nom_cliente,
      matricula: f.matricula,
      fecha: String(f.fecha),
      metodo_pago: f.metodo_pago ?? f.Metodo_pago,
      estado_pago: Boolean(f.estado_pago ?? f.Estado_pago),
      total: Number(f.total ?? f.Total ?? 0),
      descuento: Number(f.descuento ?? f.Descuento ?? 0),
    }));
  },

  async generarFactura(desdeOrden: {
    id_orden: number;
    descuento: number;
    metodo_pago: string;
    estado_pago: boolean;
  }): Promise<FacturaRow> {
    const r = await fetch(
      `${API.BASE_URL}/facturas/desde-orden/${desdeOrden.id_orden}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id_orden: desdeOrden.id_orden,
          descuento: desdeOrden.descuento,
          metodo_pago: desdeOrden.metodo_pago,
          estado_pago: desdeOrden.estado_pago,
        }),
      }
    );
    if (!r.ok) {
      const txt = await r.text();
      throw new Error(txt || "Error al generar factura");
    }
    return r.json();
  },
};

export default function Facturacion() {
  // Datos
  const [ordenes, setOrdenes] = useState<OrdenRow[]>([]);
  const [facturas, setFacturas] = useState<FacturaRow[]>([]);

  // UI
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string>("");

  // Form generar factura
  const [ordenSeleccionada, setOrdenSeleccionada] = useState<string>("");
  const [descuento, setDescuento] = useState<string>("0");
  const [metodoPago, setMetodoPago] = useState<string>("Efectivo");
  const [estadoPago, setEstadoPago] = useState<boolean>(true);

  // Búsqueda
  const [searchFact, setSearchFact] = useState<string>("");

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const [ords, facts] = await Promise.all([
          API.listOrdenes(),
          API.listFacturas(""),
        ]);
        if (!mounted) return;
        setOrdenes(ords);
        setFacturas(facts);
      } catch (err) {
        console.error(err);
        setMsg("No se pudo cargar la información inicial de facturación.");
      } finally {
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  //  NUEVO: eliminar factura + reactivar orden
  const handleEliminarFactura = async (id_factura: number) => {
    const confirmar = window.confirm(
      "¿Seguro que deseas eliminar esta factura? La orden asociada volverá a estar activa para poder facturarla de nuevo."
    );

    if (!confirmar) return;

    try {
      const resp = await fetch(`${API.BASE_URL}/facturas/${id_factura}`, {
        method: "DELETE",
      });

      if (!resp.ok) {
        const data = await resp.json().catch(() => null);
        throw new Error(data?.detail || "Error al eliminar la factura");
      }

      const data = await resp.json().catch(() => null);
      alert(
        data?.detail ||
          "Factura eliminada correctamente. La orden fue reactivada."
      );

      // Quitar factura de la tabla
      setFacturas((prev) =>
        prev.filter((f) => f.id_factura !== id_factura)
      );

      // Recargar órdenes activas (por si vuelve a aparecer la orden reactivada)
      const ords = await API.listOrdenes();
      setOrdenes(ords);
    } catch (error: any) {
      console.error(error);
      alert(error.message || "Error inesperado al eliminar la factura");
    }
  };

  const facturasFiltradas = useMemo(() => {
    const q = searchFact.trim().toLowerCase();
    if (!q) return facturas;
    return facturas.filter((f) => {
      return (
        f.nom_cliente.toLowerCase().includes(q) ||
        f.matricula.toLowerCase().includes(q) ||
        String(f.id_factura).includes(q) ||
        String(f.id_orden).includes(q)
      );
    });
  }, [facturas, searchFact]);

  async function handleGenerarFactura(e: React.FormEvent) {
    e.preventDefault();
    setMsg("");
    if (!ordenSeleccionada) {
      setMsg("Selecciona una orden de trabajo.");
      return;
    }

    const id_orden = Number(ordenSeleccionada);
    const descNum = Number(descuento) || 0;

    const ok = window.confirm(
      `¿Deseas generar la factura para la orden #${id_orden}?`
    );
    if (!ok) return;

    try {
      setLoading(true);
      const factura = await API.generarFactura({
        id_orden,
        descuento: descNum,
        metodo_pago: metodoPago,
        estado_pago: estadoPago,
      });

      setMsg(`Factura #${factura.id_factura} generada correctamente.`);

      // refrescar listado de facturas
      const facts = await API.listFacturas("");
      setFacturas(facts);

      // 🔥 refrescar órdenes ACTIVAS (esta ya no debe aparecer)
      const ords = await API.listOrdenes();
      setOrdenes(ords);
      setOrdenSeleccionada("");

      // Abrir PDF en nueva pestaña
      window.open(
        `${API.BASE_URL}/facturas/${factura.id_factura}/pdf`,
        "_blank"
      );
    } catch (err: any) {
      console.error(err);
      setMsg(err?.message || "No se pudo generar la factura.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Container className="py-4">
      <h1 className="mb-4 custom-title">Facturación</h1>

      {msg && (
        <Alert
          variant="info"
          className="custom-alert"
          onClose={() => setMsg("")}
          dismissible
        >
          {msg}
        </Alert>
      )}

      {/* === Bloque: Generar factura desde orden === */}
      <Card className="mb-4 custom-card">
        <Card.Body>
          <Card.Title className="custom-card-title">
            Generar factura desde orden de trabajo
          </Card.Title>

          <Form onSubmit={handleGenerarFactura} className="custom-form">
            <Form.Group className="mb-3">
              <Form.Label>Orden de trabajo</Form.Label>
              <Form.Select
                className="custom-input"
                value={ordenSeleccionada}
                onChange={(e) => setOrdenSeleccionada(e.target.value)}
              >
                <option value="">Seleccione una orden</option>
                {ordenes.map((o) => (
                  <option key={o.id_orden} value={o.id_orden}>
                    {`#${o.id_orden} - ${o.nom_cliente} - ${o.matricula} - Total: ${o.total}`}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Descuento (%)</Form.Label>
              <Form.Control
                type="number"
                min={0}
                max={100}
                className="custom-input"
                value={descuento}
                onChange={(e) => setDescuento(e.target.value)}
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Método de pago</Form.Label>
              <Form.Select
                className="custom-input"
                value={metodoPago}
                onChange={(e) => setMetodoPago(e.target.value)}
              >
                <option value="Efectivo">Efectivo</option>
                <option value="Tarjeta">Tarjeta</option>
                <option value="Transferencia">Transferencia</option>
                <option value="Otro">Otro</option>
              </Form.Select>
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Check
                type="switch"
                id="estado-pago"
                label="Pago realizado"
                checked={estadoPago}
                onChange={(e) => setEstadoPago(e.target.checked)}
              />
            </Form.Group>

            <Button
              type="submit"
              variant="primary"
              className="custom-btn-primary"
              disabled={loading}
            >
              {loading ? "Generando..." : "Generar factura"}
            </Button>
          </Form>
        </Card.Body>
      </Card>

      {/* === Bloque: Búsqueda / listado de facturas === */}
      <Card className="custom-card">
        <Card.Header className="d-flex justify-content-between align-items-center custom-card-header gap-2 flex-wrap">
          <span>Facturas generadas ({facturasFiltradas.length})</span>
          <InputGroup style={{ maxWidth: "300px" }}>
            <Form.Control
              type="text"
              placeholder="Buscar por cliente, placa, id..."
              value={searchFact}
              onChange={(e) => setSearchFact(e.target.value)}
            />
          </InputGroup>
        </Card.Header>

        <Table striped responsive className="mb-0 custom-table">
          <thead>
            <tr>
              <th>Id Factura</th>
              <th>Id Orden</th>
              <th>Cliente</th>
              <th>Placa</th>
              <th>Fecha</th>
              <th>Método</th>
              <th>Estado pago</th>
              <th>Descuento (%)</th>
              <th>Total</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {facturasFiltradas.map((f) => (
              <tr key={f.id_factura}>
                <td>{f.id_factura}</td>
                <td>{f.id_orden}</td>
                <td>{f.nom_cliente}</td>
                <td>{f.matricula}</td>
                <td>{f.fecha}</td>
                <td>{f.metodo_pago}</td>
                <td>{f.estado_pago ? "Pagado" : "Pendiente"}</td>
                <td>{f.descuento}</td>
                <td>{f.total}</td>
                <td>
                  <Button
                    size="sm"
                    variant="outline-primary"
                    className="custom-btn-edit me-2"
                    onClick={() => {
                      window.open(
                        `${API.BASE_URL}/facturas/${f.id_factura}/pdf`,
                        "_blank"
                      );
                    }}
                  >
                    Ver PDF
                  </Button>

                  {/* 👉 NUEVO botón Eliminar */}
                  <Button
                    size="sm"
                    variant="outline-danger"
                    onClick={() => handleEliminarFactura(f.id_factura)}
                  >
                    Eliminar
                  </Button>
                </td>
              </tr>
            ))}
            {facturasFiltradas.length === 0 && (
              <tr>
                <td colSpan={10} className="text-center py-4">
                  No hay facturas para mostrar.
                </td>
              </tr>
            )}
          </tbody>
        </Table>
      </Card>
    </Container>
  );
}
