import { useEffect, useMemo, useState } from "react";
import "bootstrap/dist/css/bootstrap.min.css";
import "../styles/custom.scss";
import { Container, Row, Col, Card, Form, Button, Table, Alert, InputGroup } from "react-bootstrap";

/** ===== Tipos ===== */
type Cliente = {
  Id_cliente: number | null;
  Nom_cliente: string;
  Num_doc: string;
  Telefono: string;
  Direccion: string;
  Correo: string;
};

type ApiDupField = "Num_doc" | "Correo";
type ApiError = {
  status?: number;
  code?: string;
  field?: ApiDupField;
  message?: string;
  missing?: string[];
  raw?: any;
};

/** ===== Helpers de normalización de errores ===== */
async function parseMaybeJson(resp: Response) {
  const ct = resp.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    try {
      return await resp.json();
    } catch {
      return null;
    }
  }
  try {
    const txt = await resp.text();
    return txt || null;
  } catch {
    return null;
  }
}

// Convierte cualquier payload a string seguro
function toSafeText(payload: any): string {
  if (typeof payload === "string") return payload;
  if (payload && typeof payload === "object") {
    const maybe = (payload as any).message ?? (payload as any).detail;
    if (typeof maybe === "string") return maybe;
    try {
      return JSON.stringify(payload);
    } catch {
      return String(payload);
    }
  }
  return String(payload ?? "");
}

// Heurística para detectar campo duplicado desde texto
function inferDuplicateFieldFromPayload(payload: any): ApiDupField | undefined {
  const asText = toSafeText(payload);
  const s = asText.toLowerCase();

  // pistas textuales
  if (
    s.includes("num_doc") ||
    s.includes("número de documento") ||
    s.includes("numero de documento") ||
    /\bdoc(umento)?\b/.test(s)
  ) {
    return "Num_doc";
  }
  if (s.includes("correo") || s.includes("email") || s.includes("e-mail")) {
    return "Correo";
  }

  // Formatos de motores SQL / ORMs
  // MySQL: Duplicate entry '...' for key 'Num_doc'/'Correo'
  const mysqlKey = asText.match(/key\s+'?(Num_doc|Correo)'?/i);
  if (mysqlKey) return mysqlKey[1] as ApiDupField;

  // SQLite: UNIQUE constraint failed: Clientes.Correo
  const sqlite = asText.match(/unique constraint failed.*(num_doc|correo)/i);
  if (sqlite) return sqlite[1].toLowerCase() === "num_doc" ? "Num_doc" : "Correo";

  // Postgres: violates unique constraint "clientes_num_doc_key" etc.
  const pg = asText.match(/violates unique constraint.*(num_doc|correo)/i);
  if (pg) return pg[1].toLowerCase() === "num_doc" ? "Num_doc" : "Correo";

  return undefined;
}

// Señales genéricas de duplicado en cualquier idioma/DB
function looksLikeDuplicate(payload: any): boolean {
  const s = toSafeText(payload).toLowerCase();
  return (
    /duplicate entry|duplicado|ya existe|ya registrado|unique constraint|violates unique constraint|unique key|índice único|indice unico/.test(
      s
    )
  );
}

function normalizeHttpError(status: number, payload: any): ApiError {
  const msgFromPayload =
    (typeof payload === "object" ? (payload?.message || (payload as any)?.detail) : undefined) ||
    (typeof payload === "string" ? payload : undefined) ||
    `HTTP ${status}`;

  const normalized: ApiError = {
    status,
    message: msgFromPayload,
    raw: payload,
  };

  // Preservar estructura si viene del backend
  if (payload && typeof payload === "object") {
    if ((payload as any).code) normalized.code = (payload as any).code;
    if ((payload as any).field) normalized.field = (payload as any).field;
    if (Array.isArray((payload as any).missing)) normalized.missing = (payload as any).missing;
  }

  // Regla fuerte: 409/400 => probablemente validación/duplicado
  // Marcamos como DUPLICATE aunque el texto no lo diga explícitamente
  if (status === 409 || status === 400) {
    normalized.code = normalized.code || "DUPLICATE";
  }

  // Señales textuales de duplicado (cubre MySQL, SQLite, Postgres, ORMs)
  if (looksLikeDuplicate(payload)) {
    normalized.code = "DUPLICATE";
  }

  // Intentar identificar el campo
  if (!normalized.field && normalized.code === "DUPLICATE") {
    normalized.field = inferDuplicateFieldFromPayload(payload);
  }

  return normalized;
}

/** ===== API minimal ===== */
const API = {
  BASE_URL: "http://127.0.0.1:8000",

  async list(): Promise<Cliente[]> {
    const r = await fetch(`${this.BASE_URL}/clientes`);
    if (!r.ok) throw new Error(`Error al listar: ${r.status}`);
    return r.json();
  },

  async create(body: Cliente): Promise<Cliente> {
    const r = await fetch(`${this.BASE_URL}/clientes`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        Nom_cliente: body.Nom_cliente,
        Num_doc: body.Num_doc,
        Telefono: body.Telefono,
        Direccion: body.Direccion,
        Correo: body.Correo,
      }),
    });

    const payload = await parseMaybeJson(r);
    if (!r.ok) {
      const err = normalizeHttpError(r.status, payload);
      throw err;
    }
    return (payload ?? {}) as Cliente;
  },

  async update(id: number, body: Cliente): Promise<Cliente> {
    const r = await fetch(`${this.BASE_URL}/clientes/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        Nom_cliente: body.Nom_cliente,
        Num_doc: body.Num_doc,
        Telefono: body.Telefono,
        Direccion: body.Direccion,
        Correo: body.Correo,
      }),
    });

    const payload = await parseMaybeJson(r);
    if (!r.ok) {
      const err = normalizeHttpError(r.status, payload);
      throw err;
    }
    return (payload ?? {}) as Cliente;
  },

  async remove(id: number): Promise<void> {
    const r = await fetch(`${this.BASE_URL}/clientes/${id}`, { method: "DELETE" });
    if (!r.ok) {
      const payload = await parseMaybeJson(r);
      const err = normalizeHttpError(r.status, payload);
      throw new Error(err.message || `Error al borrar: ${r.status}`);
    }
  },
};

/** ===== Página Clientes ===== */
export default function Clientes() {
  const empty: Cliente = {
    Id_cliente: null,
    Nom_cliente: "",
    Num_doc: "",
    Telefono: "",
    Direccion: "",
    Correo: "",
  };

  const [form, setForm] = useState<Cliente>(empty);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const [search, setSearch] = useState("");

  const editando = useMemo(
    () => form.Id_cliente !== null && form.Id_cliente !== undefined,
    [form.Id_cliente]
  );

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const data = await API.list();
        if (mounted) setClientes(Array.isArray(data) ? data : (data as any)?.items ?? []);
      } catch (err) {
        console.error(err);
        setMessage("No se pudo cargar la lista de clientes.");
      } finally {
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
  }

  async function handleGuardar(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    try {
      setLoading(true);
      if (editando && form.Id_cliente !== null) {
        const updated = await API.update(form.Id_cliente, form);
        setClientes((curr) =>
          curr.map((c) => (c.Id_cliente === form.Id_cliente ? { ...c, ...updated } : c))
        );
        setMessage("Cliente actualizado correctamente.");
      } else {
        const created = await API.create(form);
        setClientes((curr) => [created, ...curr]);
        setMessage("Cliente creado correctamente.");
      }
      // refresco
      const data = await API.list();
      setClientes(Array.isArray(data) ? data : (data as any)?.items ?? []);
      setForm(empty);
    } catch (err: any) {
      console.error(err);

      // === Nueva lógica de mensajes ===
      if (err?.code === "DUPLICATE" || err?.status === 409 || err?.status === 400) {
        // Intentar identificar el campo; si no, heurística desde el message/raw
        const field: ApiDupField | undefined =
          err?.field ||
          inferDuplicateFieldFromPayload(err?.raw) ||
          inferDuplicateFieldFromPayload(err?.message);

        if (field === "Num_doc") {
          setMessage("Ya hay un cliente registrado con ese documento.");
        } else if (field === "Correo") {
          setMessage("El correo ya existe.");
        } else {
          // Sigue siendo duplicado pero sin campo claro
          setMessage("Dato duplicado.");
        }
      } else if (Array.isArray(err?.missing)) {
        setMessage("Faltan campos: " + err.missing.join(", "));
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

  function handleEditar(cliente: Cliente) {
    setForm(cliente);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleBorrar(Id_cliente: number, Nom_cliente: string) {
    const ok = window.confirm("¿Estás seguro de borrar a " + Nom_cliente + " ?");
    if (!ok) return;
    try {
      setLoading(true);
      await API.remove(Id_cliente);
      setClientes((curr) => curr.filter((c) => c.Id_cliente !== Id_cliente));
      if (form.Id_cliente === Id_cliente) setForm(empty);
      setMessage("Cliente borrado.");
    } catch (err: any) {
      console.error(err);
      setMessage(err?.message || "No se pudo borrar el cliente.");
    } finally {
      // Refresco suave
      try {
        const data = await API.list();
        setClientes(Array.isArray(data) ? data : (data as any)?.items ?? []);
      } catch {}
      setLoading(false);
    }
  }

  // Buscar
  const clientesFiltrados = clientes.filter((c: Cliente) => {
    const q = search.toLowerCase();
    return (
      c.Nom_cliente?.toLowerCase().includes(q) ||
      c.Num_doc?.toLowerCase().includes(q) ||
      c.Telefono?.toLowerCase().includes(q) ||
      c.Direccion?.toLowerCase().includes(q) ||
      c.Correo?.toLowerCase().includes(q)
    );
  });

  return (
    <Container className="py-4 ">
      <Card className="mb-4 form-section">
        <Card.Body>
          <Card.Title className="custom-card-title">
            {editando ? "Editar Cliente" : "Registrar Cliente"}
          </Card.Title>

          {message && (
            <Alert variant="info" className="custom-alert">
              {message}
            </Alert>
          )}

          <Form onSubmit={handleGuardar} className="custom-form">
            <Row className="g-3">
              <Col md={6}>
                <Form.Group controlId="Nom_cliente">
                  <Form.Control
                    className="custom-input"
                    name="Nom_cliente"
                    value={form.Nom_cliente}
                    onChange={handleChange}
                    disabled={loading}
                    required
                    placeholder="Nombre"
                  />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group controlId="Num_doc">
                  <Form.Control
                    className="custom-input"
                    name="Num_doc"
                    value={form.Num_doc}
                    onChange={handleChange}
                    disabled={loading || editando}  // ← bloqueado al editar
                    required
                    placeholder="Documento"
                  />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group controlId="Direccion">
                  <Form.Control
                    className="custom-input"
                    name="Direccion"
                    value={form.Direccion}
                    onChange={handleChange}
                    disabled={loading}
                    required
                    placeholder="Dirección"
                  />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group controlId="Telefono">
                  <Form.Control
                    className="custom-input"
                    name="Telefono"
                    value={form.Telefono}
                    onChange={handleChange}
                    disabled={loading}
                    required
                    placeholder="Teléfono"
                  />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group controlId="Correo">
                  <Form.Control
                    type="email"
                    className="custom-input"
                    name="Correo"
                    value={form.Correo}
                    onChange={handleChange}
                    disabled={loading}
                    required
                    placeholder="Correo"
                  />
                </Form.Group>
              </Col>
            </Row>
            <div className="mt-3">
              <Button
                type="submit"
                variant="primary"
                className="me-2 custom-btn-primary"
                disabled={loading}
              >
                {loading ? "Guardando..." : "Guardar"}
              </Button>
              <Button
                type="button"
                variant="secondary"
                className="custom-btn-secondary"
                onClick={handleCancelar}
                disabled={loading}
              >
                Cancelar
              </Button>
            </div>
          </Form>
        </Card.Body>
      </Card>

      <Card className="custom-card">
        <Card.Header className="d-flex justify-content-between align-items-center custom-card-header">
          <span>Clientes existentes ({clientesFiltrados.length})</span>
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
              <th>Nombre</th>
              <th>Documento</th>
              <th>Direccion</th>
              <th>Teléfono</th>
              <th>Correo</th>
              <th>Acciones</th>
            </tr>
          </thead>
        <tbody>
            {clientesFiltrados.map((c) => (
              <tr key={c.Id_cliente ?? `${c.Nom_cliente}-${c.Num_doc}`}>
                <td>{c.Nom_cliente}</td>
                <td>{c.Num_doc}</td>
                <td>{c.Direccion}</td>
                <td>{c.Telefono}</td>
                <td>{c.Correo}</td>
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
                  {c.Id_cliente !== null && (
                    <Button
                      size="sm"
                      variant="outline-danger"
                      className="custom-btn-delete"
                      onClick={() => handleBorrar(c.Id_cliente as number, c.Nom_cliente)}
                      disabled={loading}
                    >
                      Borrar
                    </Button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </Container>
  );
}
