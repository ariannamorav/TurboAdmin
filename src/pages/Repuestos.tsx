import { useEffect, useMemo, useState } from "react";
import "bootstrap/dist/css/bootstrap.min.css";
import "../styles/custom.scss";
import { Container, Row, Col, Card, Form, Button, Table, Alert, InputGroup, FormSelect } from "react-bootstrap";

/* ================= Helpers de errores (normalización) ================= */
type ApiError = {
  status?: number;
  code?: string;     // "DUPLICATE", etc.
  field?: string;    // "codigo"
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

function looksLikeDuplicate(payload: any): boolean {
  const s = toSafeText(payload).toLowerCase();
  return /duplicate entry|duplicado|ya existe|ya registrado|unique constraint|violates unique constraint|unique key|índice único|indice unico/.test(s);
}

// Intentar identificar el campo duplicado (código / referencia)
function inferDuplicateField(payload: any): string | undefined {
  const t = toSafeText(payload);
  const s = t.toLowerCase();

  if (/\bc[oó]digo\b/.test(s) || /\breferencia\b/.test(s) || /\bref\b/.test(s) || /\bcode\b/i.test(t)) {
    return "codigo";
  }
  const mysqlKey = t.match(/key\s+'?([A-Za-z0-9_]+)'?/i);
  if (mysqlKey && mysqlKey[1].toLowerCase() === "codigo") return "codigo";
  if (/unique constraint failed.*codigo/i.test(t)) return "codigo";
  if (/violates unique constraint.*codigo/i.test(t)) return "codigo";
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

  if (payload && typeof payload === "object") {
    if ((payload as any).code)  normalized.code  = (payload as any).code;
    if ((payload as any).field) normalized.field = (payload as any).field;
  }

  if (status === 409 || status === 400 || looksLikeDuplicate(payload)) {
    normalized.code  = normalized.code  || "DUPLICATE";
    normalized.field = normalized.field || inferDuplicateField(payload);
  }
  return normalized;
}

/* ================= Utilidades de estado (filtro y labels) ================= */
function canonEstadoToken(val: any): "disponible" | "no_disponible" | "" {
  if (val === null || val === undefined) return "";
  if (val === true || val === 1 || val === "1") return "disponible";
  if (val === false || val === 0 || val === "0") return "no_disponible";

  const s = String(val).toLowerCase().trim().replace(/[_-]+/g, " ");
  if (!s) return "";
  if (s === "disponible" || /^disp/.test(s) || s === "available" || s === "si" || s === "sí") return "disponible";
  if (s === "no disponible" || /^no\s*disp/.test(s) || s === "not available" || s === "no") return "no_disponible";
  return "";
}

// Siempre mostrar label “bonito”
function estadoLabel(val: any): "Disponible" | "No disponible" | string {
  const t = canonEstadoToken(val);
  if (t === "disponible") return "Disponible";
  if (t === "no_disponible") return "No disponible";
  return String(val ?? "");
}

/* ================= API minimal (ajusta BASE_URL a tu backend) ================= */
const API = {
  BASE_URL: "http://127.0.0.1:8000",

  async list() {
    const r = await fetch(`${this.BASE_URL}/repuestos`);
    if (!r.ok) throw new Error(`Error al listar: ${r.status}`);
    return r.json();
  },

  async create(body: any) {
    const r = await fetch(`${this.BASE_URL}/repuestos`, {
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
    const r = await fetch(`${this.BASE_URL}/repuestos/${id}`, {
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
};

/* ================= Componente ================= */
export default function Repuestos() {
  const estadoLabels = ["Disponible", "No disponible"];

  // precio: "" para NO mostrar 0 por defecto
  const empty = { id_rep: null as number | null, nom_rep: "", codigo: "", precio: "" as number | string, estado: "" };

  const [form, setForm] = useState(empty);
  const [repuestos, setRepuestos] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [estadoSeleccionado, setEstadoSeleccionado] = useState(""); // label del select

  const editando = useMemo(() => form.id_rep !== null && form.id_rep !== undefined, [form.id_rep]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const data = await API.list();
        if (mounted) setRepuestos(Array.isArray(data) ? data : data?.items ?? []);
      } catch (err) {
        console.error(err);
        setMessage("No se pudo cargar la lista de repuestos.");
      } finally {
        setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) {
    const { name, value } = e.target as any;
    if (name === "precio") {
      if (value === "") {
        setForm((f) => ({ ...f, precio: "" }));
      } else {
        const n = Number(value);
        setForm((f) => ({ ...f, precio: Number.isFinite(n) ? n : value }));
      }
    } else if (name === "estado") {
      setForm((f) => ({ ...f, estado: value }));
    } else {
      setForm((f) => ({ ...f, [name]: value }));
    }
  }

  async function handleGuardar(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");

    try {
      setLoading(true);

      const precioNum = typeof form.precio === "string" ? Number(form.precio) : form.precio;
      const payload = { ...form, precio: precioNum };

      if (editando && form.id_rep !== null) {
        const updated = await API.update(form.id_rep, payload);
        setRepuestos((curr) => curr.map((r) => (r.id_rep === form.id_rep ? { ...r, ...updated } : r)));
        setMessage("Repuesto actualizado correctamente.");
      } else {
        const created = await API.create(payload);
        setRepuestos((curr) => [{ ...created }, ...curr]);
        setMessage("Repuesto creado correctamente.");
      }

      const data = await API.list();
      setRepuestos(Array.isArray(data) ? data : data?.items ?? []);
      setForm(empty);
    } catch (err: any) {
      console.error(err);

      if (err?.code === "DUPLICATE" || err?.status === 409 || err?.status === 400 || looksLikeDuplicate(err?.raw || err?.message)) {
        const field = (err?.field as string) || inferDuplicateField(err?.raw || err?.message);
        if ((field || "").toLowerCase() === "codigo") {
          setMessage("Ya hay un repuesto con esa referencia.");
        } else {
          setMessage("Registro duplicado.");
        }
      } else if (typeof err?.message === "string" && err.message.trim()) {
        setMessage(err.message);
      } else {
        setMessage("Ocurrió un error al guardar el repuesto.");
      }
    } finally {
      setLoading(false);
    }
  }

  function handleCancelar() {
    setForm(empty);
    setMessage("");
  }

  function handleEditar(repuesto: any) {
    setForm({
      id_rep: repuesto?.id_rep ?? null,
      nom_rep: repuesto?.nom_rep ?? "",
      codigo: repuesto?.codigo ?? "",
      precio: (repuesto?.precio === 0 || typeof repuesto?.precio === "number") ? repuesto?.precio : "",
      estado: repuesto?.estado ?? "",
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Filtro robusto por texto + estado
  const repuestosFiltrados = repuestos.filter((r) => {
    const q = (search || "").toLowerCase();

    const coincideTexto =
      ((r?.nom_rep ?? "") + "").toLowerCase().includes(q) ||
      ((r?.codigo ?? "") + "").toLowerCase().includes(q);

    const selectedToken = canonEstadoToken(estadoSeleccionado); // "disponible" | "no_disponible" | ""
    const itemToken     = canonEstadoToken(r?.estado);          // idem

    const coincideEstado = selectedToken ? (itemToken === selectedToken) : true;

    return coincideTexto && coincideEstado;
  });

  return (
    <Container className="py-4">
      <h1 className="mb-4 custom-title">Gestión de Repuestos</h1>

      <Card className="mb-4 custom-card">
        <Card.Body>
          <Card.Title className="custom-card-title">
            {editando ? "Editar repuesto" : "Crear repuesto"}
          </Card.Title>

        {message && <Alert variant="info" className="custom-alert">{message}</Alert>}

          <Form onSubmit={handleGuardar} className="custom-form">
            <Row className="g-3">
              <Col md={6}>
                <Form.Group controlId="nom_rep">
                  <Form.Control
                    className="custom-input"
                    name="nom_rep"
                    value={form.nom_rep}
                    onChange={handleChange}
                    disabled={loading}
                    required
                    placeholder="Nombre"
                  />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group controlId="precio">
                  <Form.Control
                    type="number"
                    step="0.01"
                    className="custom-input"
                    name="precio"
                    value={form.precio}
                    onChange={handleChange}
                    disabled={loading}
                    required
                    placeholder="Precio"
                  />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group controlId="codigo">
                  <Form.Control
                    className="custom-input"
                    name="codigo"
                    value={form.codigo}
                    onChange={handleChange}
                    disabled={loading}
                    required
                    placeholder="Código / Referencia"
                  />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group controlId="estado">
                  <FormSelect
                    className="custom-input"
                    name="estado"
                    value={form.estado}
                    onChange={handleChange}
                    disabled={loading}
                    required
                  >
                    <option value="">Seleccione un estado</option>
                    {estadoLabels.map((e) => (
                      <option key={e} value={e}>{e}</option>
                    ))}
                  </FormSelect>
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
          <span>Repuestos registrados ({repuestosFiltrados.length})</span>
          <div className="d-flex gap-2">
            <FormSelect
              style={{ maxWidth: "250px" }}
              value={estadoSeleccionado}
              onChange={(e) => setEstadoSeleccionado(e.target.value)}
              className="me-2"
            >
              <option value="">Filtrar por estado</option>
              {estadoLabels.map((e) => (
                <option key={e} value={e}>{e}</option>
              ))}
            </FormSelect>
            <InputGroup style={{ maxWidth: "400px" }}>
              <Form.Control
                type="text"
                placeholder="Buscar..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </InputGroup>
          </div>
        </Card.Header>
        <Table striped responsive className="mb-0 custom-table">
          <thead>
            <tr>
              <th>Nombre</th>
              <th>Precio</th>
              <th>Código</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {repuestosFiltrados.map((r) => (
              <tr key={r.id_rep}>
                <td>{r.nom_rep}</td>
                <td>{r.precio}</td>
                <td>{r.codigo}</td>
                {/* Mostrar label siempre (nunca 0/1) */}
                <td>{estadoLabel(r.estado)}</td>
                <td>
                  <Button
                    size="sm"
                    variant="outline-primary"
                    className="me-2 custom-btn-edit"
                    onClick={() => handleEditar(r)}
                    disabled={loading}
                  >
                    Editar
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
