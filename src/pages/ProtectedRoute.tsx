import { Navigate } from "react-router-dom";
import type { ReactNode } from "react";

type ProtectedRouteProps = {
  children: ReactNode;
};

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const token = localStorage.getItem("token"); // ajusta si usas otra clave

  if (!token) {
    // Si no hay token, redirige al login
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
