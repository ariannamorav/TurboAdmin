import { useEffect, useMemo, useState } from "react";
import { Container, Row, Col, Card, Spinner, Badge } from "react-bootstrap";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
} from "recharts";

const API_BASE = "http://127.0.0.1:8000";

/** ===== Tipos muy flexibles para evitar errores de TS ===== */
type AnyObj = { [key: string]: any };

/** ===== Colores reutilizados (paleta oscura / azul / violeta) ===== */
const COLORS = {
  bgMain: "#020b1f",
  bgCard1: "#050f25",
  bgCard2: "#0C1628",
  accentBlue: "#3b82f6",
  accentPink: "#ec4899",
  accentGreen: "#22c55e",
  accentYellow: "#eab308",
  border: "#1f335a",
  textSoft: "#9ca3af",
};

const BRAND_COLORS = ["#3b82f6", "#ec4899", "#22c55e", "#eab308", "#8b5cf6"];

/** ===========================
 *  COMPONENTE PRINCIPAL
 *  =========================== */
export default function Home() {
  const [clientes, setClientes] = useState<AnyObj[]>([]);
  const [vehiculos, setVehiculos] = useState<AnyObj[]>([]);
  const [repuestos, setRepuestos] = useState<AnyObj[]>([]);
  const [servicios, setServicios] = useState<AnyObj[]>([]);
  const [ordenes, setOrdenes] = useState<AnyObj[]>([]);
  const [detallesServ, setDetallesServ] = useState<AnyObj[]>([]);
  const [facturas, setFacturas] = useState<AnyObj[]>([]);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  /** ----- Cargar datos del backend ----- */
  useEffect(() => {
    async function cargar() {
      try {
        setLoading(true);
        setError(null);

        const [
          rClientes,
          rVehiculos,
          rRepuestos,
          rServicios,
          rOrdenes,
          rDetServ,
          rFacturas,
        ] = await Promise.all([
          fetch(`${API_BASE}/clientes`),
          fetch(`${API_BASE}/vehiculos`),
          fetch(`${API_BASE}/repuestos`),
          fetch(`${API_BASE}/servicios`),
          fetch(`${API_BASE}/ordenes`), // ajusta al endpoint real si es distinto
          fetch(`${API_BASE}/detalles-serv`).catch(() => null),
          fetch(`${API_BASE}/facturas`).catch(() => null),
        ]);

        if (!rClientes.ok) throw new Error("Error al cargar clientes");
        if (!rVehiculos.ok) throw new Error("Error al cargar vehículos");
        if (!rRepuestos.ok) throw new Error("Error al cargar repuestos");
        if (!rServicios.ok) throw new Error("Error al cargar servicios");
        if (!rOrdenes.ok) throw new Error("Error al cargar órdenes");

        setClientes(await rClientes.json());
        setVehiculos(await rVehiculos.json());
        setRepuestos(await rRepuestos.json());
        setServicios(await rServicios.json());
        setOrdenes(await rOrdenes.json());

        if (rDetServ && rDetServ.ok) {
          setDetallesServ(await rDetServ.json());
        }
        if (rFacturas && rFacturas.ok) {
          setFacturas(await rFacturas.json());
        }
      } catch (e: any) {
        console.error(e);
        setError(e.message ?? "Error cargando datos");
      } finally {
        setLoading(false);
      }
    }

    cargar();
  }, []);

  /** ----- Cálculos de KPIs y datos de gráficas ----- */
  const {
    vehiculosPorMarcaData,
    clientesFrecuentesData,
    kpis,
    mesMasFacturadoLabel,
    mesMasFacturadoValor,
  } = useMemo(() => {
    // VEHÍCULOS POR MARCA
    const marcasMap = new Map<string, number>();
    vehiculos.forEach((v) => {
      const marca = v.marca || v.Marca || "Sin marca";
      marcasMap.set(marca, (marcasMap.get(marca) || 0) + 1);
    });
    const vehMarcaData = Array.from(marcasMap.entries())
      .map(([marca, cantidad]) => ({ marca, cantidad }))
      .sort((a, b) => b.cantidad - a.cantidad)
      .slice(0, 7);

    // CLIENTES MÁS FRECUENTES (por número de órdenes)
    const clienteCount = new Map<number, number>();
    ordenes.forEach((o) => {
      const idCli = o.id_cliente || o.Id_cliente;
      if (!idCli) return;
      clienteCount.set(idCli, (clienteCount.get(idCli) || 0) + 1);
    });

    const clientesFrecuentes = Array.from(clienteCount.entries())
      .map(([idCli, numOrdenes]) => {
        const cli =
          clientes.find(
            (c) =>
              c.id_cliente === idCli ||
              c.Id_cliente === idCli ||
              c.id === idCli
          ) || {};
        const nombre =
          cli.Nom_cliente || cli.nom_cliente || cli.nombre || `Cliente ${idCli}`;
        return { nombre, numOrdenes };
      })
      .sort((a, b) => b.numOrdenes - a.numOrdenes)
      .slice(0, 5);

    // ÓRDENES ACTIVAS
    const ordenesActivas = ordenes.filter(
      (o) =>
        o.estado === "Activa" ||
        o.estado === 1 ||
        o.estado === true
    ).length;

    // FACTURACIÓN MENSUAL (solo para el mes más facturado)
    const meses = [
      "Ene",
      "Feb",
      "Mar",
      "Abr",
      "May",
      "Jun",
      "Jul",
      "Ago",
      "Sep",
      "Oct",
      "Nov",
      "Dic",
    ];

    const factMap = new Map<number, number>();
    facturas.forEach((f) => {
      const fecha = new Date(f.fecha || f.Fecha);
      if (isNaN(fecha.getTime())) return;
      const mes = fecha.getMonth(); // 0-11
      const total = Number(f.Total ?? f.total ?? 0);
      factMap.set(mes, (factMap.get(mes) || 0) + total);
    });

    const factData = meses.map((m, i) => ({
      mes: m,
      total: factMap.get(i) || 0,
    }));

    let mesMaxLabel = "Sin datos";
    let mesMaxValor = 0;
    if (factData.length > 0) {
      const max = factData.reduce(
        (acc, cur) => (cur.total > acc.total ? cur : acc),
        { mes: "Sin datos", total: 0 }
      );
      mesMaxLabel = max.mes;
      mesMaxValor = max.total;
    }

    // KPIS
    const kpis = {
      clientesRegistrados: clientes.length,
      vehiculosRegistrados: vehiculos.length,
      totalOrdenes: ordenes.length,
      ordenesActivas,
      totalServicios: servicios.length, // se usa para que "servicios" no quede sin referencia
    };

    return {
      vehiculosPorMarcaData: vehMarcaData,
      clientesFrecuentesData: clientesFrecuentes,
      kpis,
      mesMasFacturadoLabel: mesMaxLabel,
      mesMasFacturadoValor: mesMaxValor,
    };
  }, [clientes, vehiculos, repuestos, servicios, ordenes, detallesServ, facturas]);

  if (loading) {
    return (
      <Container fluid style={{ padding: "2rem" }}>
        <div
          style={{
            minHeight: "60vh",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "1rem",
          }}
        >
          <Spinner animation="border" />
          <span>Cargando dashboard...</span>
        </div>
      </Container>
    );
  }

  if (error) {
    return (
      <Container fluid style={{ padding: "2rem" }}>
        <Card
          style={{
            background: COLORS.bgCard1,
            borderRadius: 24,
            border: `1px solid ${COLORS.border}`,
            color: "#fff",
          }}
        >
          <Card.Body>
            <h3>Error al cargar el dashboard</h3>
            <p>{error}</p>
          </Card.Body>
        </Card>
      </Container>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        width: "100%",
        background: COLORS.bgMain,
        padding: "1.5rem",
      }}
    >
      <Container fluid>
        {/* HEADER */}
        <Row className="g-4 mb-2">
          <Col md={8}>
            <Card
              style={{
                background:
                  "radial-gradient(circle at top left, #3b82f6 0%, #050f25 50%, #020b1f 100%)",
                borderRadius: 26,
                border: "none",
                color: "#fff",
                padding: "0.75rem 1.5rem",
              }}
            >
              <Card.Body
                style={{
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.35rem",
                }}
              >
                <small style={{ color: COLORS.textSoft }}>
                  Bienvenido de nuevo
                </small>
                <h3 style={{ margin: 0 }}>Panel general del taller</h3>
                <p
                  style={{
                    margin: 0,
                    color: COLORS.textSoft,
                    fontSize: 13,
                  }}
                >
                  Resumen de clientes, vehículos, servicios, repuestos y
                  facturación.
                </p>
              </Card.Body>
            </Card>
          </Col>
          {/* TARJETA Mes más facturado */}
          <Col md={4}>
            <Card
              style={{
                background:
                  "linear-gradient(135deg, #f97316 0%, #c026d3 50%, #4c1d95 100%)",
                borderRadius: 26,
                border: "none",
                color: "#fff",
              }}
            >
              <Card.Body>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                  }}
                >
                  <div>
                    <small style={{ opacity: 0.8 }}>Mes más facturado</small>
                    <h3 style={{ margin: "0.25rem 0" }}>
                      {mesMasFacturadoLabel}
                    </h3>
                    <p style={{ margin: 0, fontSize: 14 }}>
                      Valor máximo por mes:{" "}
                      <strong>
                        $
                        {mesMasFacturadoValor.toLocaleString("es-CO", {
                          minimumFractionDigits: 0,
                        })}
                      </strong>
                    </p>
                  </div>
                  <Badge
                    bg="dark"
                    style={{
                      backgroundColor: "rgba(15,23,42,0.45)",
                      padding: "0.35rem 0.75rem",
                      borderRadius: 999,
                      fontSize: 11,
                    }}
                  >
                    Facturación
                  </Badge>
                </div>
              </Card.Body>
            </Card>
          </Col>
        </Row>

        {/* KPIs PRINCIPALES */}
        <Row className="g-4 mb-1">
          {[
            {
              label: "Clientes registrados",
              value: kpis.clientesRegistrados,
              sub: "Total en sistema",
            },
            {
              label: "Vehículos registrados",
              value: kpis.vehiculosRegistrados,
              sub: "Autos / motos",
            },
            {
              label: "Órdenes de trabajo",
              value: kpis.totalOrdenes,
              sub: "Histórico",
            },
            {
              label: "Órdenes activas",
              value: kpis.ordenesActivas,
              sub: `de ${kpis.totalOrdenes} órdenes`,
            },
          ].map((kpi, idx) => (
            <Col key={idx} xs={12} sm={6} md={4} lg={3}>
              <Card
                style={{
                  background: idx % 2 === 0 ? COLORS.bgCard1 : COLORS.bgCard2,
                  borderRadius: 22,
                  border: `1px solid ${COLORS.border}`,
                  color: "#fff",
                }}
              >
                <Card.Body>
                  <small style={{ color: COLORS.textSoft }}>
                    {kpi.label}
                  </small>
                  <h3 style={{ margin: "0.35rem 0" }}>{kpi.value}</h3>
                  <span style={{ fontSize: 12, color: COLORS.textSoft }}>
                    {kpi.sub}
                  </span>
                </Card.Body>
              </Card>
            </Col>
          ))}
        </Row>

        {/* FILA 2: Vehículos por marca + Clientes frecuentes */}
        <Row className="g-4 mb-1 mt-1">
          {/* VEHÍCULOS POR MARCA */}
          <Col md={6}>
            <Card
              style={{
                background: COLORS.bgCard2,
                borderRadius: 24,
                border: `1px solid ${COLORS.border}`,
                color: "#fff",
                height: "100%",
              }}
            >
              <Card.Body>
                <h5 style={{ marginBottom: "0.5rem" }}>
                  Cantidad de vehículos por marca
                </h5>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={vehiculosPorMarcaData}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.1} />
                    <XAxis dataKey="marca" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip />
                    <Bar dataKey="cantidad" radius={[6, 6, 0, 0]}>
                      {vehiculosPorMarcaData.map((_, index) => (
                        <Cell
                          key={`cell-marca-${index}`}
                          fill={BRAND_COLORS[index % BRAND_COLORS.length]}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </Card.Body>
            </Card>
          </Col>

          {/* CLIENTES MÁS FRECUENTES */}
          <Col md={6}>
            <Card
              style={{
                background: COLORS.bgCard1,
                borderRadius: 24,
                border: `1px solid ${COLORS.border}`,
                color: "#fff",
                height: "100%",
              }}
            >
              <Card.Body>
                <h5 style={{ marginBottom: "0.5rem" }}>
                  Clientes más frecuentes
                </h5>
                {clientesFrecuentesData.length === 0 && (
                  <p style={{ fontSize: 13, color: COLORS.textSoft }}>
                    Aún no hay órdenes de trabajo registradas.
                  </p>
                )}
                <div
                  style={{ display: "flex", flexDirection: "column", gap: 8 }}
                >
                  {clientesFrecuentesData.map((c, idx) => (
                    <div
                      key={idx}
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        backgroundColor: "rgba(15,23,42,0.6)",
                        borderRadius: 999,
                        padding: "0.3rem 0.7rem",
                        fontSize: 13,
                      }}
                    >
                      <span>{c.nombre}</span>
                      <span
                        style={{
                          backgroundColor: "rgba(59,130,246,0.16)",
                          borderRadius: 999,
                          padding: "0.1rem 0.55rem",
                        }}
                      >
                        {c.numOrdenes} órdenes
                      </span>
                    </div>
                  ))}
                </div>
              </Card.Body>
            </Card>
          </Col>
        </Row>

        {/* No hay fila 3 (ya se eliminaron las otras gráficas) */}
      </Container>
    </div>
  );
}
