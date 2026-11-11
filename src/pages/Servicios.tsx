import { useEffect, useMemo, useState } from "react";
import "bootstrap/dist/css/bootstrap.min.css";
import "../styles/custom.scss";
import { Container, Row, Col, Card, Form, Button, Table, Alert, InputGroup, FormSelect } from "react-bootstrap";

/* ================= Helpers: parseo y normalización de errores ================= */
type ApiError = {
  status?: number;
  code?: string;     // "DUPLICATE", etc.
  field?: string;    // "nom_serv"
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

// Intentar identificar el campo duplicado (nombre del servicio)
function inferDuplicateFieldServicio(payload: any): string | undefined {
  const t = toSafeText(payload);
  const s = t.toLowerCase();

  if (/\bnom[_\s-]*serv\b/.test(s) || /\bnombre\b/.test(s) || /\bname\b/.test(s) || /\bservicio\b/.test(s)) {
    return "nom_serv";
  }
  const mysqlKey = t.match(/key\s+'?([A-Za-z0-9_]+)'?/i);
  if (mysqlKey && mysqlKey[1].toLowerCase() === "nom_serv") return "nom_serv";
  if (/unique constraint failed.*nom_serv/i.test(t)) return "nom_serv";
  if (/violates unique constraint.*nom[_]serv/i.test(t)) return "nom_serv";
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
    normalized.field = normalized.field || inferDuplicateFieldServicio(payload);
  }
  return normalized;
}

/* ================= Normalización de estado para filtro/labels ================= */
function stripDiacritics(s: string) {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
function normText(v: any): string {
  return stripDiacritics(String(v ?? "")).toLowerCase().replace(/[_-]+/g, " ").trim();
}
// Token canónico: "disponible" | "no_disponible" | ""
function canonEstadoToken(v: any): "disponible" | "no_disponible" | "" {
  if (v === true || v === 1 || v === "1") return "disponible";
  if (v === false || v === 0 || v === "0") return "no_disponible";
  const s = normText(v);
  if (!s) return "";
  if (s === "disponible" || /^disp/.test(s) || s === "available" || s === "si" || s === "sí") return "disponible";
  if (s === "no disponible" || /^no\s*disp/.test(s) || s === "not available" || s === "no") return "no_disponible";
  return "";
}
// Mostrar siempre label bonito
function estadoLabel(v: any): "Disponible" | "No disponible" | string {
  const t = canonEstadoToken(v);
  if (t === "disponible") return "Disponible";
  if (t === "no_disponible") return "No disponible";
  // fallback: devuelve lo que haya, pero como string
  return String(v ?? "");
}

/* ================= API minimal (ajusta BASE_URL a tu backend) ================= */
const API = {
  BASE_URL: "http://127.0.0.1:8000",

  async list() {
    const r = await fetch(`${this.BASE_URL}/servicios`);
    if (!r.ok) throw new Error(`Error al listar: ${r.status}`);
    return r.json();
  },

  async create(body: any) {
    const r = await fetch(`${this.BASE_URL}/servicios`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await parseMaybeJson(r);
    if (!r.ok) throw normalizeHttpError(r.status, payload);
    return payload;
  },

  async update(id: number, body: any) {
    const r = await fetch(`${this.BASE_URL}/servicios/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await parseMaybeJson(r);
    if (!r.ok) throw normalizeHttpError(r.status, payload);
    return payload;
  },
};

/* ================= Componente ================= */
export default function Servicios() {
  const estados = ["Disponible", "No disponible"];

  // precio vacío para no mostrar 0 por defecto
  const empty = { id_serv: null as number | null, nom_serv: "", precio: "" as number | string, estado: "" };

  const [form, setForm] = useState(empty);
  const [servicios, setServicios] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [estadoSeleccionado, setEstadoSeleccionado] = useState("");

  const editando = useMemo(() => form.id_serv !== null && form.id_serv !== undefined, [form.id_serv]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const data = await API.list();
        if (mounted) setServicios(Array.isArray(data) ? data : data?.items ?? []);
      } catch (err) {
        console.error(err);
        setMessage("No se pudo cargar la lista de servicios.");
      } finally {
        setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLSelectElement | HTMLInputElement>) {
    const { name, value } = e.target as any;
    if (name === "precio") {
      setForm((f) => ({ ...f, precio: value === "" ? "" : value }));
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
      if (!Number.isFinite(precioNum)) {
        setMessage("El precio no es válido.");
        return;
      }
      const payload = { ...form, precio: precioNum };

      if (editando && form.id_serv !== null) {
        const updated = await API.update(form.id_serv, payload);
        setServicios((curr) => curr.map((s) => (s.id_serv === form.id_serv ? { ...s, ...updated } : s)));
        setMessage("Servicio actualizado correctamente.");
      } else {
        const created = await API.create(payload);
        setServicios((curr) => [{ ...created }, ...curr]);
        setMessage("Servicio creado correctamente.");
      }

      const data = await API.list();
      setServicios(Array.isArray(data) ? data : data?.items ?? []);
      setForm(empty);
    } catch (err: any) {
      console.error(err);
      if (err?.code === "DUPLICATE" || err?.status === 409 || err?.status === 400 || looksLikeDuplicate(err?.raw || err?.message)) {
        const field = (err?.field as string) || inferDuplicateFieldServicio(err?.raw || err?.message);
        if ((field || "").toLowerCase() === "nom_serv") {
          setMessage("El servicio ya existe.");
        } else {
          setMessage("Registro duplicado.");
        }
      } else if (typeof err?.message === "string" && err.message.trim()) {
        setMessage(err.message);
      } else {
        setMessage("Ocurrió un error al guardar el servicio.");
      }
    } finally {
      setLoading(false);
    }
  }

  function handleCancelar() {
    setForm(empty);
    setMessage("");
  }

  function handleEditar(servicio: any) {
    // Normalizamos el estado al label para que el select quede marcado aunque venga 0/1.
    const estLabel = estadoLabel(servicio?.estado);
    setForm({
      id_serv: servicio?.id_serv ?? null,
      nom_serv: servicio?.nom_serv ?? "",
      precio: (servicio?.precio === 0 || typeof servicio?.precio === "number") ? servicio?.precio : "",
      estado: estLabel === "Disponible" || estLabel === "No disponible" ? estLabel : (servicio?.estado ?? ""),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Filtro: texto + estado robusto
  const serviciosFiltrados = servicios.filter((r) => {
    const q = normText(search);
    const coincideTexto = normText(r?.nom_serv).includes(q);

    const selectedToken = canonEstadoToken(estadoSeleccionado);
    const itemToken     = canonEstadoToken(r?.estado);

    let coincideEstado = true;
    if (selectedToken) {
      if (itemToken) {
        coincideEstado = itemToken === selectedToken;
      } else {
        coincideEstado = normText(r?.estado) === normText(estadoSeleccionado);
      }
    }
    return coincideTexto && coincideEstado;
  });

  return (
    <Container className="py-4">
      <h1 className="mb-4 custom-title">Gestión de Servicios</h1>

      <Card className="mb-4 custom-card">
        <Card.Body>
          <Card.Title className="custom-card-title">
            {editando ? "Editar Servicio" : "Crear Servicio"}
          </Card.Title>

          {message && <Alert variant="info" className="custom-alert">{message}</Alert>}

          <Form onSubmit={handleGuardar} className="custom-form">
            <Row className="g-3">
              <Col md={6}>
                <Form.Group controlId="nom_serv">
                  <Form.Control
                    className="custom-input"
                    name="nom_serv"
                    value={form.nom_serv}
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
                    {["Disponible", "No disponible"].map((e) => (
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
          <span>Servicios registrados ({serviciosFiltrados.length})</span>

          <div className="d-flex gap-2">
            <FormSelect
              style={{ maxWidth: "250px" }}
              value={estadoSeleccionado}
              onChange={(e) => setEstadoSeleccionado(e.target.value)}
              className="me-2"
            >
              <option value="">Filtrar por estado</option>
              {["Disponible", "No disponible"].map((e) => (
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
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {serviciosFiltrados.map((r) => (
              <tr key={r.id_serv}>
                <td>{r.nom_serv}</td>
                <td>{r.precio}</td>
                {/* Aquí mostramos siempre el label bonito */}
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

