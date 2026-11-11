import { useEffect, useMemo, useState } from "react";
import "bootstrap/dist/css/bootstrap.min.css";
import "../styles/custom.scss";
import { Container, Row, Col, Card, Form, Button, Table, Alert, InputGroup, FormSelect } from "react-bootstrap";

/* ================= Helpers de errores (normalización) ================= */
type ApiError = {
  status?: number;
  code?: string;          // p.ej. "DUPLICATE"
  field?: string;         // p.ej. "matricula"
  message?: string;
  raw?: any;
};

async function parseMaybeJson(resp: Response) {
  const ct = resp.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    try { return await resp.json(); } catch { return null; }
  }
  try { return await resp.text(); } catch { return null; }
}

function toSafeText(payload: any): string {
  if (typeof payload === "string") return payload;
  if (payload && typeof payload === "object") {
    const m = (payload as any).message ?? (payload as any).detail;
    if (typeof m === "string") return m;
    try { return JSON.stringify(payload); } catch { return String(payload); }
  }
  return String(payload ?? "");
}

// Señales genéricas de duplicado en varios motores/idiomas
function looksLikeDuplicate(payload: any): boolean {
  const s = toSafeText(payload).toLowerCase();
  return /duplicate entry|duplicado|ya existe|unique constraint|violates unique constraint|unique key|índice único|indice unico/.test(s);
}

// Intentar inferir qué campo es el duplicado (en este caso nos interesa "matricula")
function inferDuplicateField(payload: any): string | undefined {
  const t = toSafeText(payload);
  const s = t.toLowerCase();

  // Palabras clave comunes
  if (/\bmatr[ií]cula\b/.test(s) || /\bplaca\b/.test(s) || /license\s*plate/i.test(t) || /\bpatente\b/i.test(t)) {
    return "matricula";
  }

  // MySQL: ... for key 'matricula'
  const mysqlKey = t.match(/key\s+'?([A-Za-z0-9_]+)'?/i);
  if (mysqlKey && mysqlKey[1].toLowerCase() === "matricula") return "matricula";

  // SQLite: UNIQUE constraint failed: vehiculos.matricula
  if (/unique constraint failed.*matricula/i.test(t)) return "matricula";

  // Postgres: violates unique constraint "vehiculos_matricula_key"
  if (/violates unique constraint.*matricula/i.test(t)) return "matricula";

  return undefined;
}

function normalizeHttpError(status: number, payload: any): ApiError {
  const normalized: ApiError = {
    status,
    message:
      (typeof payload === "object" ? (payload?.message || (payload as any)?.detail) : undefined) ||
      (typeof payload === "string" ? payload : undefined) ||
      `HTTP ${status}`,
    raw: payload,
  };

  // Preservar estructura si la trae el backend
  if (payload && typeof payload === "object") {
    if ((payload as any).code) normalized.code = (payload as any).code;
    if ((payload as any).field) normalized.field = (payload as any).field;
  }

  // Heurística de duplicado
  if (status === 409 || status === 400 || looksLikeDuplicate(payload)) {
    normalized.code = normalized.code || "DUPLICATE";
    normalized.field = normalized.field || inferDuplicateField(payload);
  }

  return normalized;
}

/* ================= API ================= */
const API = {
  BASE_URL: "http://127.0.0.1:8000",

  async list() {
    const r = await fetch(`${this.BASE_URL}/vehiculos`);
    if (!r.ok) throw new Error(`Error al listar: ${r.status}`);
    return r.json();
  },

  async create(body: any) {
    const r = await fetch(`${this.BASE_URL}/vehiculos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await parseMaybeJson(r);
    if (!r.ok) {
      throw normalizeHttpError(r.status, payload);
    }
    return payload;
  },

  async update(id: number, body: any) {
    const r = await fetch(`${this.BASE_URL}/vehiculos/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await parseMaybeJson(r);
    if (!r.ok) {
      throw normalizeHttpError(r.status, payload);
    }
    return payload;
  },

  async remove(id: number) {
    const r = await fetch(`${this.BASE_URL}/vehiculos/${id}`, { method: "DELETE" });
    const payload = await parseMaybeJson(r);
    if (!r.ok) {
      // Para borrar nos basta con un message legible
      const err = normalizeHttpError(r.status, payload);
      throw new Error(err.message || `Error al borrar: ${r.status}`);
    }
    return {};
  },

  // /clientes para tener Nom_cliente y Num_doc
  async list_clientes() {
    const r = await fetch(`${this.BASE_URL}/clientes`);
    if (!r.ok) throw new Error(`Error al listar: ${r.status}`);
    return r.json();
  },
};

/* ================= Componente ================= */
export default function Vehiculos() {
  // Estado inicial
  const empty = { id_vehiculo: null as number | null, id_cliente: null as number | null, matricula: "", marca: "", modelo: "" };

  const [form, setForm] = useState(empty);
  const [vehiculos, setVehiculos] = useState<any[]>([]);
  const [clientes, setClientes] = useState<Array<{ id_cliente: number; Nom_cliente?: string; Num_doc?: string }>>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");

  const editando = useMemo(
    () => form.id_vehiculo !== null && form.id_vehiculo !== undefined,
    [form.id_vehiculo]
  );

  // Normaliza arreglo de clientes a { id_cliente, Nom_cliente, Num_doc }
  function normalizeClientes(input: any): Array<{ id_cliente: number; Nom_cliente?: string; Num_doc?: string }> {
    const arr = Array.isArray(input) ? input : input?.items ?? [];
    return arr
      .map((c: any) => ({
        id_cliente: Number(c?.id_cliente ?? c?.Id_cliente),
        Nom_cliente: c?.Nom_cliente ?? c?.nom_cliente ?? c?.nombre ?? "",
        Num_doc: c?.Num_doc ?? c?.num_doc ?? c?.documento ?? "",
      }))
      .filter((c: any) => Number.isFinite(c.id_cliente));
  }

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);

        // Vehículos
        const dataVeh = await API.list();
        if (mounted) setVehiculos(Array.isArray(dataVeh) ? dataVeh : dataVeh?.items ?? []);

        // Clientes (normalizados)
        const rawClientes = await API.list_clientes();
        const normClientes = normalizeClientes(rawClientes);
        if (mounted) setClientes(normClientes);
      } catch (err) {
        console.error(err);
        setMessage("No se pudo cargar la lista de vehículos.");
      } finally {
        setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) {
    const { name, value } = e.target as any;
    if (name === "id_cliente") {
      if (value === "" || value === null || value === undefined) {
        setForm((f) => ({ ...f, id_cliente: null }));
      } else {
        const n = Number(value);
        setForm((f) => ({ ...f, id_cliente: Number.isFinite(n) ? n : null }));
      }
    } else {
      setForm((f) => ({ ...f, [name]: value }));
    }
  }

  async function handleGuardar(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");

    try {
      setLoading(true);
      const payload = {
        ...form,
        id_cliente: form.id_cliente === null ? null : Number(form.id_cliente),
      };

      if (editando && form.id_vehiculo !== null) {
        const updated = await API.update(form.id_vehiculo, payload);
        setVehiculos((curr) =>
          curr.map((c) => (c.id_vehiculo === form.id_vehiculo ? { ...c, ...updated } : c))
        );
        setMessage("Vehículo actualizado correctamente.");
      } else {
        const created = await API.create(payload);
        setVehiculos((curr) => [{ ...created }, ...curr]);
        setMessage("Vehículo creado correctamente.");
      }

      const data = await API.list();
      setVehiculos(Array.isArray(data) ? data : data?.items ?? []);
      setForm(empty);
    } catch (err: any) {
      console.error(err);

      // Mensajes específicos: duplicado de matrícula
      if (err?.code === "DUPLICATE" || err?.status === 409 || err?.status === 400 || looksLikeDuplicate(err?.raw || err?.message)) {
        const field = (err?.field as string) || inferDuplicateField(err?.raw || err?.message);
        if ((field || "").toLowerCase() === "matricula") {
          setMessage("Ya existe un vehículo con esa matrícula.");
        } else {
          setMessage("Registro duplicado.");
        }
      } else if (typeof err?.message === "string" && err.message.trim()) {
        setMessage(err.message);
      } else {
        setMessage("Ocurrió un error al guardar.");
      }
    } finally {
      setLoading(false);
    }
  }

  function handleCancelar() {
    setForm(empty);
    setMessage("");
  }

  function handleEditar(vehiculo: any) {
    const idVeh = vehiculo?.id_vehiculo ?? vehiculo?.Id_vehiculo ?? null;
    const idCli = vehiculo?.id_cliente ?? vehiculo?.Id_cliente ?? null;

    setForm({
      id_vehiculo: Number.isFinite(Number(idVeh)) ? Number(idVeh) : null,
      id_cliente: Number.isFinite(Number(idCli)) ? Number(idCli) : null,
      matricula: vehiculo?.matricula ?? "",
      marca: vehiculo?.marca ?? "",
      modelo: vehiculo?.modelo ?? "",
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleBorrar(id_vehiculo: number, matricula: string) {
    const ok = window.confirm("¿Estás seguro de borrar el vehículo de placa: " + matricula + " ?");
    if (!ok) return;
    try {
      setLoading(true);
      await API.remove(id_vehiculo);
      setVehiculos((curr) => curr.filter((c) => c.id_vehiculo !== id_vehiculo));
      if (form.id_vehiculo === id_vehiculo) setForm(empty);
      setMessage("Vehículo borrado.");
    } catch (err: any) {
      console.error(err);
      setMessage(err?.message || "No se pudo borrar el vehículo.");
    } finally {
      const data = await API.list();
      setVehiculos(Array.isArray(data) ? data : data?.items ?? []);
      setLoading(false);
    }
  }

  // Buscar por nombre de cliente, documento, matrícula, marca, modelo (robusto ante nulls)
  const vehiculosFiltrados = vehiculos.filter((c: any) => {
    const q = (search || "").toLowerCase();
    const nom    = ((c?.Nom_cliente ?? "") + "").toLowerCase();
    const doc    = ((c?.Num_doc ?? "") + "").toLowerCase();
    const placa  = ((c?.matricula ?? "") + "").toLowerCase();
    const marca  = ((c?.marca ?? "") + "").toLowerCase();
    const modelo = ((c?.modelo ?? "") + "").toLowerCase();
    return nom.includes(q) || doc.includes(q) || placa.includes(q) || marca.includes(q) || modelo.includes(q);
  });

  return (
    <Container className="py-4">
      <h1 className="mb-4 custom-title">Gestión de Vehículos</h1>

      <Card className="mb-4 custom-card">
        <Card.Body>
          <Card.Title className="custom-card-title">
            {editando ? "Editar vehículo" : "Crear vehículo"}
          </Card.Title>

          {message && (
            <Alert variant="info" className="custom-alert">
              {message}
            </Alert>
          )}

          <Form onSubmit={handleGuardar} className="custom-form">
            <Row className="g-3">
              <Col md={8}>
                <Form.Group controlId="id_cliente">
                  <FormSelect
                    className="custom-input"
                    name="id_cliente"
                    value={form.id_cliente === null ? "" : String(form.id_cliente)}
                    onChange={handleChange}
                    disabled={loading}
                    required
                  >
                    <option value="">Seleccione un cliente</option>
                    {clientes.map((cliente) => (
                      <option key={cliente.id_cliente} value={String(cliente.id_cliente)}>
                        {cliente.Nom_cliente} — {cliente.Num_doc}
                      </option>
                    ))}
                  </FormSelect>
                </Form.Group>
              </Col>

              <Col md={4}>
                <Form.Group controlId="matricula">
                  <Form.Control
                    className="custom-input"
                    name="matricula"
                    value={form.matricula}
                    onChange={handleChange}
                    disabled={loading}
                    required
                    placeholder="Matrícula"
                  />
                </Form.Group>
              </Col>

              <Col md={6}>
                <Form.Group controlId="marca">
                  <Form.Control
                    className="custom-input"
                    name="marca"
                    value={form.marca}
                    onChange={handleChange}
                    disabled={loading}
                    required
                    placeholder="Marca"
                  />
                </Form.Group>
              </Col>

              <Col md={6}>
                <Form.Group controlId="modelo">
                  <Form.Control
                    className="custom-input"
                    name="modelo"
                    value={form.modelo}
                    onChange={handleChange}
                    disabled={loading}
                    required
                    placeholder="Modelo"
                  />
                </Form.Group>
              </Col>
            </Row>

            <div className="mt-3">
              <Button type="submit" variant="primary" className="me-2 custom-btn-primary" disabled={loading}>
                {loading ? "Guardando..." : "Guardar"}
              </Button>
              <Button type="button" variant="secondary" className="custom-btn-secondary" onClick={handleCancelar} disabled={loading}>
                Cancelar
              </Button>
            </div>
          </Form>
        </Card.Body>
      </Card>

      <Card className="custom-card">
        <Card.Header className="d-flex justify-content-between align-items-center custom-card-header">
          <span>Vehículos existentes ({vehiculosFiltrados.length})</span>
          <InputGroup style={{ maxWidth: "300px" }}>
            <Form.Control
              type="text"
              placeholder="Buscar..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </InputGroup>
        </Card.Header>
        <Table striped responsive className="mb-0 custom-table">
          <thead>
            <tr>
              <th>Cliente</th>
              <th>Matrícula</th>
              <th>Marca</th>
              <th>Modelo</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {vehiculosFiltrados.map((c, idx) => (
              <tr key={c?.id_vehiculo ?? `tmp-${idx}-${c?.matricula ?? ""}`}>
                <td>
                  {c.Nom_cliente}
                  {c.Num_doc ? <small className="text-muted"> — {c.Num_doc}</small> : null}
                </td>
                <td>{c.matricula}</td>
                <td>{c.marca}</td>
                <td>{c.modelo}</td>
                <td>
                  <Button
                    size="sm"
                    variant="outline-primary"
                    className="me-2 custom-btn-edit"
                    onClick={() => handleEditar(c)}
                    disabled={loading}
                  >
                    Editar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline-danger"
                    className="custom-btn-delete"
                    onClick={() => handleBorrar(c.id_vehiculo, c.matricula)}
                    disabled={loading}
                  >
                    Eliminar
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </Container>
  );
}
