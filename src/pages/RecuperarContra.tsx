import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Container, Card, Form, Button } from "react-bootstrap";
import "../index.css";

export default function RecibirPassword() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [loadingSend, setLoadingSend] = useState(false);
  const [loadingReset, setLoadingReset] = useState(false);

  const [errorMsg, setErrorMsg] = useState("");
  const [infoMsg, setInfoMsg] = useState("");

  const API_URL = "http://127.0.0.1:8000";

  // misma validación fuerte que tenías
  const passwordStrongRegex =
    /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>_\-\[\]/+=;']).{8,}$/;

  // ------------------------------------------------------------------
  // 1) ENVIAR CÓDIGO AL CORREO  ->  POST /password/request-reset
  // ------------------------------------------------------------------
  async function handleSendCode() {
    setErrorMsg("");
    setInfoMsg("");

    if (!email.trim()) {
      setErrorMsg("Debes ingresar tu correo electrónico.");
      return;
    }

    try {
      setLoadingSend(true);
      const res = await fetch(`${API_URL}/password/request-reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (!res.ok) {
        const msg =
          typeof data.detail === "string"
            ? data.detail
            : data.message || "Error al solicitar el código.";
        setErrorMsg(msg);
        return;
      }

      setInfoMsg(
        data.message ||
          "El correo fue enviado con éxito. Revisa tu bandeja de entrada o spam."
      );
    } catch (err) {
      console.error(err);
      setErrorMsg("Error de conexión con el servidor.");
    } finally {
      setLoadingSend(false);
    }
  }

  // ------------------------------------------------------------------
  // 2) RESTABLECER CONTRASEÑA  ->  POST /password/reset
  // ------------------------------------------------------------------
  async function handleResetPassword() {
    setErrorMsg("");
    setInfoMsg("");

    if (!email.trim() || !code.trim()) {
      setErrorMsg("Debes ingresar el correo y el código de recuperación.");
      return;
    }

    if (!newPassword.trim() || !confirmPassword.trim()) {
      setErrorMsg("Debes ingresar y confirmar la nueva contraseña.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg("Las contraseñas no coinciden.");
      return;
    }

    // Validación de complejidad en el front
    if (!passwordStrongRegex.test(newPassword)) {
      setErrorMsg(
        "La contraseña debe tener mínimo 8 caracteres, incluir mayúscula, minúscula, número y un carácter especial."
      );
      return;
    }

    try {
      setLoadingReset(true);
      const res = await fetch(`${API_URL}/password/reset`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          code,
          // 🔴 ANTES: new_password: newPassword,
          // ✅ AHORA: el backend espera "password"
          password: newPassword,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        const msg =
          typeof data.detail === "string"
            ? data.detail
            : data.message || "No se pudo actualizar la contraseña.";
        setErrorMsg(msg);
        return;
      }

      setInfoMsg(data.message || "Contraseña actualizada correctamente.");

      // Opcional: volver al login después de unos segundos
      setTimeout(() => navigate("/"), 1500);
    } catch (err) {
      console.error(err);
      setErrorMsg("Error de conexión con el servidor.");
    } finally {
      setLoadingReset(false);
    }
  }

  return (
    <Container
      fluid
      className="recover-container d-flex align-items-center justify-content-center"
    >
      <Card className="recover-card p-4 p-md-5">
        <Card.Body>
          {/* Texto superior */}
          <p className="recover-title">
            Ingresa tu correo electrónico y te enviaremos un código de acceso
            para que actualices tu contraseña
          </p>

          {/* Campo correo */}
          <Form.Group className="mb-3">
            <Form.Control
              type="email"
              placeholder="correoelectrónico@dominio.com"
              className="recover-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Form.Group>

          {/* Botón enviar código */}
          <Button
            type="button"
            className="recover-btn-primary w-100 mb-3"
            onClick={handleSendCode}
            disabled={loadingSend}
          >
            {loadingSend ? "Enviando..." : "Enviar Código"}
          </Button>

          {/* Línea con texto */}
          <div className="divider-with-text my-3">
            <span>¿Aún no lo has recibido?</span>
          </div>

          {/* Botón reenviar */}
          <Button
            type="button"
            className="recover-btn-secondary w-100 mb-4"
            onClick={handleSendCode}
            disabled={loadingSend}
          >
            {loadingSend ? "Reenviando..." : "Reenviar Código"}
          </Button>

          {/* Segunda parte: código + nueva contraseña */}
          <p className="recover-title mt-3">
            Ahora ingresa el código que llegó a tu correo y escribe tu nueva
            contraseña
          </p>

          {/* Código */}
          <Form.Group className="mb-3">
            <Form.Control
              type="text"
              placeholder="Código de recuperación"
              className="recover-input"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </Form.Group>

          {/* Nueva contraseña */}
          <Form.Group className="mb-3">
            <Form.Control
              type="password"
              placeholder="Nueva contraseña"
              className="recover-input"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
            />
          </Form.Group>

          {/* Confirmar contraseña */}
          <Form.Group className="mb-3">
            <Form.Control
              type="password"
              placeholder="Confirmar contraseña"
              className="recover-input"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
            />
          </Form.Group>

          {/* Botón actualizar */}
          <Button
            type="button"
            className="recover-btn-primary w-100"
            onClick={handleResetPassword}
            disabled={loadingReset}
          >
            {loadingReset ? "Actualizando..." : "Continuar"}
          </Button>

          {/* Mensajes de error / info */}
          {errorMsg && (
            <div
              style={{
                color: "#ff4d4f",
                marginTop: "12px",
                fontWeight: "bold",
                textAlign: "center",
                fontSize: "15px",
              }}
            >
              {errorMsg}
            </div>
          )}

          {infoMsg && (
            <div
              style={{
                color: "#4caf50",
                marginTop: "12px",
                fontWeight: "bold",
                textAlign: "center",
                fontSize: "15px",
              }}
            >
              {infoMsg}
            </div>
          )}
        </Card.Body>
      </Card>
    </Container>
  );
}
