// src/pages/Layout.tsx
import { Link, useNavigate } from "react-router-dom";
import { Nav } from "react-bootstrap";
import type { ReactNode } from "react";
import "../styles/custom.scss";

type LayoutProps = {
  children: ReactNode;
};

export default function Layout({ children }: LayoutProps) {
  const navigate = useNavigate();

  const handleLogout = () => {
    // 🔐 Limpia la información de sesión
    localStorage.removeItem("token");
    localStorage.removeItem("user");
    // Si quieres limpiar TODO:
    // localStorage.clear();

    // 🔁 Redirige al login y reemplaza en el historial
    navigate("/", { replace: true });
  };

  return (
    <div className="d-flex min-vh-100">
      <aside className="sidebar" style={{ width: "220px" }}>
        <div className="mb-4">
          <div className="d-flex align-items-center mb-2">
            <div
              className="bg-primary text-white rounded-circle d-flex align-items-center justify-content-center"
              style={{ width: "40px", height: "40px" }}
            >
              TA
            </div>
            <div className="ms-2">
              <h2>TurboAdmin</h2>
            </div>
          </div>
        </div>

        <Nav className="flex-column">
          <Nav.Link as={Link} to="/dashboard">
            📊 Dashboard
          </Nav.Link>
          <Nav.Link as={Link} to="/clientes">
            👤 Clientes
          </Nav.Link>
          <Nav.Link as={Link} to="/vehiculos">
            🚗 Vehículos
          </Nav.Link>
          <Nav.Link as={Link} to="/repuestos">
            🛠️ Repuestos
          </Nav.Link>
          <Nav.Link as={Link} to="/servicios">
            🧰 Servicios
          </Nav.Link>
          <Nav.Link as={Link} to="/ordenes">
            📑 Órdenes de Trabajo
          </Nav.Link>
          <Nav.Link as={Link} to="/facturacion">
            🧾 Facturación
          </Nav.Link>

          {/* 🔒 Cerrar sesión */}
          <Nav.Link onClick={handleLogout}>
            🔒 Cerrar Sesión
          </Nav.Link>
        </Nav>
      </aside>

      <main className="content">{children}</main>
    </div>
  );
}
