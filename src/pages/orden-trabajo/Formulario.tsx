import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import "bootstrap/dist/css/bootstrap.min.css";
import "../../styles/custom.scss";
import {
  Container,
  Row,
  Col,
  Card,
  Form,
  Button,
  Table,
  Alert,
  FormSelect,
} from "react-bootstrap";

/* ================= API ================= */
const API = {
  BASE_URL: "http://127.0.0.1:8000",

  async getJSON(path: string) {
    const r = await fetch(`${API.BASE_URL}${path}`, { cache: "no-store" });
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return r.json();
  },
  async sendJSON(path: string, method: "POST" | "PUT" | "DELETE", body?: any) {
    const r = await fetch(`${API.BASE_URL}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      cache: "no-store",
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return r.status === 204 ? true : r.json();
  },

  // Orden
  listOrdenes() {
    return API.getJSON(`/ordenes`);
  },
  getOrden(id: string | number) {
    return API.getJSON(`/orden/${id}`);
  },
  createOrden(body: any) {
    return API.sendJSON(`/orden`, "POST", body);
  },
  updateOrden(id: string | number, body: any) {
    return API.sendJSON(`/orden/${id}`, "PUT", body);
  },

  // Catálogos
  listarClientes() {
    return API.getJSON(`/clientes`);
  },
  listarVehiculosCliente(id_cliente: string | number) {
    return API.getJSON(`/vehiculos/cliente/${id_cliente}`);
  },
  listarRepuestosDisp() {
    return API.getJSON(`/repuestos-disponibles`);
  },
  listarServiciosDisp() {
    return API.getJSON(`/servicios-disponibles`);
  },

  // Detalles por orden
  listarRepuestosOrden(id_orden: string | number) {
    return API.getJSON(`/detalles_rep/orden/${id_orden}`);
  },
  listarServiciosOrden(id_orden: string | number) {
    return API.getJSON(`/detalles_serv/orden/${id_orden}`);
  },

  // CRUD Detalles
  addRepuesto(body: any) {
    return API.sendJSON(`/detalles_rep`, "POST", body);
  },
  addServicio(body: any) {
    return API.sendJSON(`/detalles_serv`, "POST", body);
  },
  updateRepuesto(id_rep: string | number, id_orden: string | number, body: any) {
    return API.sendJSON(`/detalle_rep/${id_rep}/${id_orden}`, "PUT", body);
  },
  updateServicio(id_serv: string | number, id_orden: string | number, body: any) {
    return API.sendJSON(`/detalle_serv/${id_serv}/${id_orden}`, "PUT", body);
  },
  deleteRepuesto(id_rep: string | number, id_orden: string | number) {
    return API.sendJSON(`/detalle_rep/${id_rep}/${id_orden}`, "DELETE");
  },
  deleteServicio(id_serv: string | number, id_orden: string | number) {
    return API.sendJSON(`/detalle_serv/${id_serv}/${id_orden}`, "DELETE");
  },
};

/* ================= Tipos ================= */
type Orden = {
  id_orden: number | undefined;
  id_cliente: string;
  id_vehiculo: string;
  matricula: string;
  fecha: string;
  estado: string; // "Activa" | "Facturada" | "Cancelada"
  total: number;
};

type DetalleRepuesto = {
  id_orden: number | undefined;
  id_rep: string;
  nom_rep?: string;
  cantidad: string;
  precio: number;
  subtotal: number;
};

type DetalleServicio = {
  id_orden: number | undefined;
  id_serv: string;
  nom_serv?: string;
  cantidad: string;
  precio: number;
  subtotal: number;
};

/* ================= Helpers de visualización ================= */
const safe = (v: any) => (v === null || v === undefined ? "" : String(v));

function displayCliente(c: any) {
  const doc =
    safe(c.Num_doc) ||
    safe(c.num_doc) ||
    safe(c.documento) ||
    safe(c.cedula) ||
    safe(c.NIT) ||
    safe(c.nit) ||
    safe(c.doc) ||
    "";

  const nombre =
    safe(c.Nom_cliente) ||
    safe(c.nom_cliente) ||
    safe(c.nombre) ||
    safe(c.name) ||
    safe(c.razon_social) ||
    "";

  return [doc, nombre].filter(Boolean).join(" - ") || "(cliente sin nombre)";
}

function displayVehiculo(v: any) {
  const placa =
    safe(v.Matricula) ||
    safe(v.matricula) ||
    safe(v.Placa) ||
    safe(v.placa) ||
    safe(v.license_plate) ||
    safe(v.placa_vehiculo) ||
    "";

  const marcaModelo = [
    safe(v.marca ?? v.Marca),
    safe(v.modelo ?? v.Modelo),
    safe(v.linea ?? v.Linea),
    safe(v.marca_modelo),
  ]
    .filter(Boolean)
    .join(" ");

  return [placa, marcaModelo].filter(Boolean).join(" - ") || "(vehículo)";
}

/* ================= Componente ================= */
export default function OrdenTrabajoFromulario() {
  const { idOrden } = useParams();
  const navigate = useNavigate();

  const emptyOrden: Orden = {
    id_orden: undefined,
    id_cliente: "",
    id_vehiculo: "",
    matricula: "",
    fecha: new Date().toISOString().slice(0, 10),
    estado: "Activa",
    total: 0,
  };

  const emptyRepuesto: DetalleRepuesto = {
    id_orden: undefined,
    id_rep: "",
    cantidad: "",
    precio: 0,
    subtotal: 0,
  };
  const emptyServicio: DetalleServicio = {
    id_orden: undefined,
    id_serv: "",
    cantidad: "",
    precio: 0,
    subtotal: 0,
  };

  // Estado principal
  const [form, setForm] = useState<Orden>(emptyOrden);

  // Catálogos
  const [clientes, setClientes] = useState<any[]>([]);
  const [vehiculos, setVehiculos] = useState<any[]>([]);
  const [repuestos, setRepuestos] = useState<any[]>([]);
  const [servicios, setServicios] = useState<any[]>([]);

  // Detalles actuales de la orden
  const [repuestosOrden, setRepuestosOrden] = useState<any[]>([]);
  const [serviciosOrden, setServiciosOrden] = useState<any[]>([]);

  // Formularios de detalle
  const [formRepuesto, setFormRepuesto] =
    useState<DetalleRepuesto>(emptyRepuesto);
  const [formServicio, setFormServicio] =
    useState<DetalleServicio>(emptyServicio);

  // Listas filtradas
  const [repuestosFiltrados, setRepuestosFiltrados] = useState<any[]>([]);
  const [serviciosFiltrados, setServiciosFiltrados] = useState<any[]>([]);

  // Flags UI
  const [loading, setLoading] = useState(false);
  const [loadingRepuestos, setLoadingRepuestos] = useState(false);
  const [loadingServicios, setLoadingServicios] = useState(false);
  const [editandoRepuesto, setEditandoRepuesto] = useState(false);
  const [editandoServicio, setEditandoServicio] = useState(false);
  const [message, setMessage] = useState("");

  const editando = useMemo(
    () => form.id_orden !== undefined,
    [form.id_orden]
  );

  /* ============ Helpers numéricos / total ============ */
  function numberOrZero(v: any) {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
  }

  function calcTotal(reps: any[], servs: any[]) {
    const sumDetalle = (list: any[]) =>
      list.reduce((acc, item) => {
        const cant = numberOrZero(item.cantidad);
        const prec = numberOrZero(item.precio);
        const sub = numberOrZero(item.subtotal);
        return acc + (sub || cant * prec);
      }, 0);

    return sumDetalle(reps) + sumDetalle(servs);
  }

  async function refreshOrdenData(id_orden_actual: number) {
    const [repOrd, serOrd] = await Promise.all([
      API.listarRepuestosOrden(id_orden_actual),
      API.listarServiciosOrden(id_orden_actual),
    ]);

    const repArr = Array.isArray(repOrd) ? repOrd : repOrd?.items ?? [];
    const serArr = Array.isArray(serOrd) ? serOrd : serOrd?.items ?? [];

    setRepuestosOrden(repArr);
    setServiciosOrden(serArr);
    const total = calcTotal(repArr, serArr);
    setForm((prev) => ({ ...prev, total }));
  }

  /* ============ Bootstrap inicial ============ */
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const [dataReps, dataServs, dataClientes] = await Promise.all([
          API.listarRepuestosDisp(),
          API.listarServiciosDisp(),
          API.listarClientes(),
        ]);
        if (!mounted) return;
        setRepuestos(Array.isArray(dataReps) ? dataReps : dataReps?.items ?? []);
        setServicios(Array.isArray(dataServs) ? dataServs : dataServs?.items ?? []);
        setClientes(Array.isArray(dataClientes) ? dataClientes : dataClientes?.items ?? []);

        if (idOrden) {
          const ord = await API.getOrden(idOrden);
          if (!mounted) return;
          setForm((prev) => ({
            ...prev,
            id_orden: ord.id_orden ?? undefined,
            id_cliente: safe(ord.id_cliente),
            id_vehiculo: safe(ord.id_vehiculo),
            matricula: safe(ord.matricula),
            estado: safe(ord.estado || "Activa"),
          }));

          const [vehs, repOrd, serOrd] = await Promise.all([
            API.listarVehiculosCliente(ord.id_cliente),
            API.listarRepuestosOrden(idOrden),
            API.listarServiciosOrden(idOrden),
          ]);
          if (!mounted) return;

          const repArr = Array.isArray(repOrd) ? repOrd : repOrd?.items ?? [];
          const serArr = Array.isArray(serOrd) ? serOrd : serOrd?.items ?? [];
          const total = calcTotal(repArr, serArr);

          setVehiculos(Array.isArray(vehs) ? vehs : vehs?.items ?? []);
          setRepuestosOrden(repArr);
          setServiciosOrden(serArr);
          setForm((prev) => ({ ...prev, total }));
        }
      } catch (err) {
        console.error(err);
        setMessage("No se pudo cargar la información inicial.");
      } finally {
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [idOrden]);

  /* ============ Handlers cabecera ============ */
  async function handleCargarVehiculos(e: React.ChangeEvent<any>) {
    const id_cliente = e.target.value as string;
    setForm((f) => ({ ...f, id_cliente, id_vehiculo: "" }));
    setMessage("");
    if (!id_cliente) {
      setVehiculos([]);
      return;
    }
    try {
      const data = await API.listarVehiculosCliente(id_cliente);
      setVehiculos(Array.isArray(data) ? data : data?.items ?? []);
    } catch (err) {
      console.error(err);
      setMessage("No se pudieron cargar los vehículos del cliente.");
    }
  }

  function handleChangeOrden(e: React.ChangeEvent<any>) {
    const { name, value } = e.target;
    setForm((f) => ({ ...f, [name]: value }));
    setMessage("");
  }

  async function handleGuardarCabecera(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    try {
      setLoading(true);
      if (editando && form.id_orden !== undefined) {
        const updated = await API.updateOrden(form.id_orden, {
          id_cliente: form.id_cliente,
          id_vehiculo: form.id_vehiculo,
          estado: form.estado,
          fecha: form.fecha,
          total: form.total,
        });
        setForm((prev) => ({
          ...prev,
          ...updated,
          id_cliente: safe(updated.id_cliente ?? prev.id_cliente),
          id_vehiculo: safe(updated.id_vehiculo ?? prev.id_vehiculo),
          estado: safe(updated.estado ?? prev.estado),
        }));
        setMessage("Orden actualizada correctamente.");
      } else {
        const created = await API.createOrden({
          id_cliente: form.id_cliente,
          id_vehiculo: form.id_vehiculo,
          estado: form.estado,
          fecha: form.fecha,
          total: form.total,
        });
        setForm((prev) => ({ ...prev, id_orden: created.id_orden, total: 0 }));
        setMessage("Orden creada correctamente.");
      }
    } catch (err) {
      console.error(err);
      setMessage("Ocurrió un error al guardar la orden.");
    } finally {
      setLoading(false);
    }
  }

  /* ============ Repuestos ============ */
  function abrirFormRepuesto() {
    if (!form.id_cliente || !form.id_vehiculo) {
      setMessage("Por favor diligencie cliente y vehículo.");
      return;
    }
    const usados = new Set(repuestosOrden.map((x: any) => String(x.id_rep)));
    const disponibles = repuestos.filter(
      (r: any) => !usados.has(String(r.id_rep))
    );
    setRepuestosFiltrados(disponibles);
    setFormRepuesto({ ...emptyRepuesto, id_orden: form.id_orden });
    setEditandoRepuesto(false);
    setLoadingRepuestos(true);
    setMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleChangeRepuesto(e: React.ChangeEvent<any>) {
    const { name, value } = e.target;
    setFormRepuesto((prev) => {
      const next = { ...prev, [name]: value };
      const cantidad = numberOrZero(next.cantidad);
      const precio =
        name === "id_rep"
          ? numberOrZero(
              repuestos.find(
                (r: any) => String(r.id_rep) === String(value)
              )?.precio
            )
          : next.precio;
      next.precio = precio;
      next.subtotal = cantidad * precio;
      return next;
    });
  }

  async function handleGuardarRepuesto(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    try {
      setLoading(true);

      const cantidadNum = numberOrZero(formRepuesto.cantidad);
      if (cantidadNum <= 0) {
        setMessage("La cantidad de repuestos debe ser mayor que cero.");
        setLoading(false);
        return;
      }

      // Asegurar orden
      let id_orden_actual = form.id_orden;
      if (id_orden_actual === undefined) {
        const ok = window.confirm("¿Crear la orden para agregar el repuesto?");
        if (!ok) return;
        const created = await API.createOrden({
          id_cliente: form.id_cliente,
          id_vehiculo: form.id_vehiculo,
          estado: form.estado,
          fecha: form.fecha,
          total: 0,
        });
        id_orden_actual = created.id_orden;
        setForm((prev) => ({ ...prev, id_orden: id_orden_actual, total: 0 }));
      }

      const precio = numberOrZero(
        repuestos.find(
          (r: any) => String(r.id_rep) === String(formRepuesto.id_rep)
        )?.precio
      );
      const detalle = {
        id_orden: id_orden_actual,
        id_rep: formRepuesto.id_rep,
        cantidad: cantidadNum,
        precio,
        subtotal: cantidadNum * precio,
      };

      if (editandoRepuesto) {
        await API.updateRepuesto(
          formRepuesto.id_rep,
          id_orden_actual!,
          detalle
        );
      } else {
        await API.addRepuesto(detalle);
      }

      await refreshOrdenData(id_orden_actual!);
      setFormRepuesto({ ...emptyRepuesto, id_orden: id_orden_actual });
      setEditandoRepuesto(false);
      setLoadingRepuestos(false);
      setMessage("Repuesto guardado correctamente.");
    } catch (err) {
      console.error(err);
      setMessage("Error al guardar el repuesto.");
    } finally {
      setLoading(false);
    }
  }

  function handleEditarRepuesto(r: any) {
    setEditandoRepuesto(true);
    setLoadingRepuestos(true);
    setFormRepuesto({
      id_orden: form.id_orden,
      id_rep: String(r.id_rep),
      cantidad: String(r.cantidad),
      precio: Number(r.precio) || 0,
      subtotal: Number(r.subtotal) || 0,
    });
    setRepuestosFiltrados(repuestos);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleEliminarRepuesto(r: any) {
    if (repuestosOrden.length === 1 && serviciosOrden.length === 0) {
      setMessage(
        "La orden debe tener al menos un repuesto o servicio. Si no, cancélela."
      );
      return;
    }
    if (!window.confirm(`¿Eliminar repuesto ${r.nom_rep}?`)) return;
    try {
      setLoading(true);
      if (form.id_orden === undefined) return;
      await API.deleteRepuesto(r.id_rep, form.id_orden);
      await refreshOrdenData(form.id_orden);
      setMessage(`Repuesto ${r.nom_rep} eliminado.`);
    } catch (err) {
      console.error(err);
      setMessage("No se pudo eliminar el repuesto.");
    } finally {
      setLoading(false);
    }
  }

  function cancelarRepuesto() {
    setFormRepuesto({ ...emptyRepuesto, id_orden: form.id_orden });
    setEditandoRepuesto(false);
    setLoadingRepuestos(false);
    setMessage("");
  }

  /* ============ Servicios ============ */
  function abrirFormServicio() {
    if (!form.id_cliente || !form.id_vehiculo) {
      setMessage("Por favor diligencie cliente y vehículo.");
      return;
    }
    const usados = new Set(serviciosOrden.map((x: any) => String(x.id_serv)));
    const disponibles = servicios.filter(
      (s: any) => !usados.has(String(s.id_serv))
    );
    setServiciosFiltrados(disponibles);
    setFormServicio({ ...emptyServicio, id_orden: form.id_orden });
    setEditandoServicio(false);
    setLoadingServicios(true);
    setMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleChangeServicio(e: React.ChangeEvent<any>) {
    const { name, value } = e.target;
    setFormServicio((prev) => {
      const next = { ...prev, [name]: value };
      const cantidad = numberOrZero(next.cantidad);
      const precio =
        name === "id_serv"
          ? numberOrZero(
              servicios.find(
                (s: any) => String(s.id_serv) === String(value)
              )?.precio
            )
          : next.precio;
      next.precio = precio;
      next.subtotal = cantidad * precio;
      return next;
    });
  }

  async function handleGuardarServicio(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    try {
      setLoading(true);

      const cantidadNum = numberOrZero(formServicio.cantidad);
      if (cantidadNum <= 0) {
        setMessage("La cantidad de servicios debe ser mayor que cero.");
        setLoading(false);
        return;
      }

      // Asegurar orden
      let id_orden_actual = form.id_orden;
      if (id_orden_actual === undefined) {
        const ok = window.confirm("¿Crear la orden para agregar el servicio?");
        if (!ok) return;
        const created = await API.createOrden({
          id_cliente: form.id_cliente,
          id_vehiculo: form.id_vehiculo,
          estado: form.estado,
          fecha: form.fecha,
          total: 0,
        });
        id_orden_actual = created.id_orden;
        setForm((prev) => ({ ...prev, id_orden: id_orden_actual, total: 0 }));
      }

      const precio = numberOrZero(
        servicios.find(
          (s: any) => String(s.id_serv) === String(formServicio.id_serv)
        )?.precio
      );
      const detalle = {
        id_orden: id_orden_actual,
        id_serv: formServicio.id_serv,
        cantidad: cantidadNum,
        precio,
        subtotal: cantidadNum * precio,
      };

      if (editandoServicio) {
        await API.updateServicio(
          formServicio.id_serv,
          id_orden_actual!,
          detalle
        );
      } else {
        await API.addServicio(detalle);
      }

      await refreshOrdenData(id_orden_actual!);
      setFormServicio({ ...emptyServicio, id_orden: id_orden_actual });
      setEditandoServicio(false);
      setLoadingServicios(false);
      setMessage("Servicio guardado correctamente.");
    } catch (err) {
      console.error(err);
      setMessage("Error al guardar el servicio.");
    } finally {
      setLoading(false);
    }
  }

  function handleEditarServicio(s: any) {
    setEditandoServicio(true);
    setLoadingServicios(true);
    setFormServicio({
      id_orden: form.id_orden,
      id_serv: String(s.id_serv),
      cantidad: String(s.cantidad),
      precio: Number(s.precio) || 0,
      subtotal: Number(s.subtotal) || 0,
    });
    setServiciosFiltrados(servicios);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleEliminarServicio(s: any) {
    if (serviciosOrden.length === 1 && repuestosOrden.length === 0) {
      setMessage(
        "La orden debe tener al menos un repuesto o servicio. Si no, cancélela."
      );
      return;
    }
    if (!window.confirm(`¿Eliminar servicio ${s.nom_serv}?`)) return;
    try {
      setLoading(true);
      if (form.id_orden === undefined) return;
      await API.deleteServicio(s.id_serv, form.id_orden);
      await refreshOrdenData(form.id_orden);
      setMessage(`Servicio ${s.nom_serv} eliminado.`);
    } catch (err) {
      console.error(err);
      setMessage("No se pudo eliminar el servicio.");
    } finally {
      setLoading(false);
    }
  }

  /* ============ Estado Orden ============ */
  async function toggleCancelarOrden() {
    try {
      if (form.id_orden === undefined) return;

      // 🚫 No permitir cambiar estado si está facturada
      if (String(form.estado) === "Facturada") {
        setMessage("No se puede cambiar el estado de una orden facturada.");
        return;
      }

      const estaCancelada = String(form.estado) === "Cancelada";
      const nuevoEstado = estaCancelada ? "Activa" : "Cancelada";
      const ok = window.confirm(
        estaCancelada ? "¿Activar esta orden?" : "¿Cancelar esta orden?"
      );
      if (!ok) return;

      const updated = await API.updateOrden(form.id_orden, {
        ...form,
        estado: nuevoEstado,
      });
      setForm((prev) => ({
        ...prev,
        estado: String(updated.estado ?? nuevoEstado),
      }));
      setMessage(
        estaCancelada ? "Orden activada con éxito." : "Orden cancelada con éxito."
      );
    } catch (err) {
      console.error(err);
      setMessage("No se pudo cambiar el estado de la orden.");
    }
  }

  return (
    <Container className="py-4">
      <h1 className="mb-4 custom-title">Orden de Trabajo</h1>

      {/* Cabecera */}
      <Card className="mb-4 custom-card">
        <Card.Body>
          <Card.Title className="custom-card-title">
            {editando ? "Editar Orden" : "Crear Orden"}
          </Card.Title>
          {message && (
            <Alert variant="info" className="custom-alert">
              {message}
            </Alert>
          )}

          <Form onSubmit={handleGuardarCabecera} className="custom-form">
            <Row className="g-3">
              <Col md={6}>
                <Form.Group controlId="id_cliente">
                  <FormSelect
                    className="custom-input"
                    name="id_cliente"
                    value={form.id_cliente}
                    onChange={handleCargarVehiculos}
                    disabled={editando}
                    required
                  >
                    <option value="">
                      {clientes.length
                        ? "Seleccione un cliente"
                        : "No hay clientes"}
                    </option>
                    {clientes.map((c: any) => (
                      <option
                        key={c.id_cliente ?? c.Id_cliente}
                        value={String(c.id_cliente ?? c.Id_cliente)}
                      >
                        {displayCliente(c)}
                      </option>
                    ))}
                  </FormSelect>
                </Form.Group>
              </Col>

              <Col md={6}>
                <Form.Group controlId="id_vehiculo">
                  <FormSelect
                    className="custom-input"
                    name="id_vehiculo"
                    value={form.id_vehiculo}
                    onChange={handleChangeOrden}
                    disabled={editando}
                    required
                  >
                    <option value="">
                      {vehiculos.length
                        ? "Seleccione un vehículo"
                        : "No hay vehículos"}
                    </option>
                    {vehiculos.map((v: any) => (
                      <option
                        key={v.id_vehiculo ?? v.Id_vehiculo}
                        value={String(v.id_vehiculo ?? v.Id_vehiculo)}
                      >
                        {displayVehiculo(v)}
                      </option>
                    ))}
                  </FormSelect>
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
                {loading
                  ? "Guardando..."
                  : editando
                  ? "Guardar cambios"
                  : "Crear orden"}
              </Button>
            </div>
          </Form>
        </Card.Body>
      </Card>

      {/* Repuestos */}
      <Card className="mb-4 custom-card">
        <Card.Body>
          <Card.Title className="custom-card-title">Repuestos</Card.Title>
          <Button
            type="button"
            variant="primary"
            className="me-2 custom-btn-primary"
            hidden={loadingRepuestos}
            onClick={abrirFormRepuesto}
          >
            Agregar
          </Button>
          {loadingRepuestos && (
            <Form onSubmit={handleGuardarRepuesto} className="custom-form mt-3">
              <Row className="g-3">
                <Col md={6}>
                  <Form.Group controlId="id_rep">
                    <FormSelect
                      className="custom-input"
                      name="id_rep"
                      value={formRepuesto.id_rep}
                      onChange={handleChangeRepuesto}
                      disabled={editandoRepuesto}
                      required
                    >
                      <option value="">Seleccione un repuesto</option>
                      {repuestosFiltrados.map((r: any) => (
                        <option key={r.id_rep} value={String(r.id_rep)}>
                          {r.nom_rep}
                        </option>
                      ))}
                    </FormSelect>
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group controlId="cantidad">
                    <Form.Control
                      type="number"
                      className="custom-input"
                      name="cantidad"
                      value={formRepuesto.cantidad}
                      onChange={handleChangeRepuesto}
                      placeholder="Cantidad"
                      required
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
                  onClick={cancelarRepuesto}
                  disabled={loading}
                >
                  Cancelar
                </Button>
              </div>
            </Form>
          )}
        </Card.Body>

        {repuestosOrden.length > 0 && (
          <Table striped responsive className="mb-0 custom-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Cantidad</th>
                <th>Precio</th>
                <th>Subtotal</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {repuestosOrden.map((r: any) => (
                <tr key={`rep-${r.id_rep}`}>
                  <td>{r.nom_rep}</td>
                  <td>{r.cantidad}</td>
                  <td>{r.precio}</td>
                  <td>{r.subtotal}</td>
                  <td>
                    <Button
                      size="sm"
                      variant="outline-primary"
                      className="me-2 custom-btn-edit"
                      onClick={() => handleEditarRepuesto(r)}
                      disabled={loading}
                    >
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline-danger"
                      className="custom-btn-delete"
                      onClick={() => handleEliminarRepuesto(r)}
                      disabled={loading}
                    >
                      Eliminar
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {/* Servicios */}
      <Card className="mb-4 custom-card">
        <Card.Body>
          <Card.Title className="custom-card-title">Servicios</Card.Title>
          <Button
            type="button"
            variant="primary"
            className="me-2 custom-btn-primary"
            hidden={loadingServicios}
            onClick={abrirFormServicio}
          >
            Agregar
          </Button>
          {loadingServicios && (
            <Form onSubmit={handleGuardarServicio} className="custom-form mt-3">
              <Row className="g-3">
                <Col md={6}>
                  <Form.Group controlId="id_serv">
                    <FormSelect
                      className="custom-input"
                      name="id_serv"
                      value={formServicio.id_serv}
                      onChange={handleChangeServicio}
                      disabled={editandoServicio}
                      required
                    >
                      <option value="">Seleccione un servicio</option>
                      {serviciosFiltrados.map((s: any) => (
                        <option key={s.id_serv} value={String(s.id_serv)}>
                          {s.nom_serv}
                        </option>
                      ))}
                    </FormSelect>
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group controlId="cantidad">
                    <Form.Control
                      type="number"
                      className="custom-input"
                      name="cantidad"
                      value={formServicio.cantidad}
                      onChange={handleChangeServicio}
                      placeholder="Cantidad"
                      required
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
                  onClick={() => {
                    setEditandoServicio(false);
                    setLoadingServicios(false);
                    setFormServicio({
                      ...emptyServicio,
                      id_orden: form.id_orden,
                    });
                  }}
                  disabled={loading}
                >
                  Cancelar
                </Button>
              </div>
            </Form>
          )}
        </Card.Body>

        {serviciosOrden.length > 0 && (
          <Table striped responsive className="mb-0 custom-table">
            <thead>
              <tr>
                <th>Nombre</th>
                <th>Cantidad</th>
                <th>Precio</th>
                <th>Subtotal</th>
                <th>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {serviciosOrden.map((s: any) => (
                <tr key={`serv-${s.id_serv}`}>
                  <td>{s.nom_serv}</td>
                  <td>{s.cantidad}</td>
                  <td>{s.precio}</td>
                  <td>{s.subtotal}</td>
                  <td>
                    <Button
                      size="sm"
                      variant="outline-primary"
                      className="me-2 custom-btn-edit"
                      onClick={() => handleEditarServicio(s)}
                      disabled={loading}
                    >
                      Editar
                    </Button>
                    <Button
                      size="sm"
                      variant="outline-danger"
                      className="custom-btn-delete"
                      onClick={() => handleEliminarServicio(s)}
                      disabled={loading}
                    >
                      Eliminar
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        )}
      </Card>

      {/* Total / Acciones */}
      <Card className="mb-4 custom-card">
        <Card.Body>
          <Card.Title className="custom-card-title">
            Total Orden
            <div>{Number(form.total) || 0}</div>
          </Card.Title>

          <Button
            size="sm"
            variant="outline-primary"
            className="me-2 custom-btn-edit"
            onClick={() => navigate("/ordenes")}
          >
            Volver al Listado de Órdenes
          </Button>

          <Button
            size="sm"
            variant="outline-danger"
            className="custom-btn-delete"
            onClick={toggleCancelarOrden}
            disabled={loading || String(form.estado) === "Facturada"}
          >
            {String(form.estado) === "Cancelada"
              ? "Activar Orden"
              : "Cancelar Orden"}
          </Button>
        </Card.Body>
      </Card>
    </Container>
  );
}
