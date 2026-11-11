// src/App.tsx
import { BrowserRouter, Route, Routes } from "react-router-dom";
import Clientes from "./pages/Clientes.tsx";
import Vehiculos from "./pages/Vehiculos.tsx";
import Layout from "./pages/Layout.tsx";
import Repuestos from "./pages/Repuestos.tsx";
import Servicios from "./pages/Servicios.tsx";
import OrdenTrabajoListado from "./pages/orden-trabajo/Listado.tsx";
import OrdenTrabajoFromulario from "./pages/orden-trabajo/Formulario.tsx";
import Login from "./pages/Login.tsx";
import Home from "./pages/Home.tsx"; // Dashboard
import RecibirPassword from "./pages/RecuperarContra.tsx"; // Recuperar contraseña
import Facturacion from "./pages/Facturacion";
import ProtectedRoute from "./pages/ProtectedRoute.tsx"; // 🔒

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* 🔓 Rutas públicas */}
        <Route path="/" element={<Login />} />
        <Route path="/recuperar" element={<RecibirPassword />} />

        {/* 🔒 Dashboard */}
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <Layout>
                <Home />
              </Layout>
            </ProtectedRoute>
          }
        />

        {/* 🔒 Módulos */}
        <Route
          path="/clientes"
          element={
            <ProtectedRoute>
              <Layout>
                <Clientes />
              </Layout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/vehiculos"
          element={
            <ProtectedRoute>
              <Layout>
                <Vehiculos />
              </Layout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/ordenes"
          element={
            <ProtectedRoute>
              <Layout>
                <OrdenTrabajoListado />
              </Layout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/repuestos"
          element={
            <ProtectedRoute>
              <Layout>
                <Repuestos />
              </Layout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/servicios"
          element={
            <ProtectedRoute>
              <Layout>
                <Servicios />
              </Layout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/ordenes/form"
          element={
            <ProtectedRoute>
              <Layout>
                <OrdenTrabajoFromulario />
              </Layout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/orden/form/:idOrden"
          element={
            <ProtectedRoute>
              <Layout>
                <OrdenTrabajoFromulario />
              </Layout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/facturacion"
          element={
            <ProtectedRoute>
              <Layout>
                <Facturacion />
              </Layout>
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
