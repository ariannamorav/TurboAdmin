import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Container, Row, Col, Card, Form, Button } from "react-bootstrap";
import "../index.css";
import LOGOTURBO from "../assets/LOGOTURBO.png";

export default function Login() {
  const navigate = useNavigate();

  const [correo, setCorreo] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErrorMsg(""); // limpiar error previo

    if (!correo.trim() || !password.trim()) {
      setErrorMsg("Debes ingresar tu correo y contraseña.");
      return;
    }

    try {
      setLoading(true);

      const response = await fetch("http://127.0.0.1:8000/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: correo,
          password: password,
        }),
      });

      if (!response.ok) {
        try {
          const errorData = await response.json();
          const msg =
            typeof errorData.detail === "string"
              ? errorData.detail
              : "Usuario o contraseña incorrectos";
          setErrorMsg(msg);
        } catch {
          setErrorMsg("Usuario o contraseña incorrectos");
        }
        setLoading(false);
        return;
      }

      const data = await response.json();

      if (data.ok) {
        // 🔐 OBTENER TOKEN (ajusta estos campos según tu backend)
        const token =
          data.token || data.access_token || "ok"; // "ok" es un valor de prueba si aún no tienes token real

        // 🧠 GUARDAR SESIÓN EN localStorage
        localStorage.setItem("token", token);
        localStorage.setItem(
          "user",
          JSON.stringify(
            data.usuario || {
              email: correo,
            }
          )
        );

        // 🚀 IR AL DASHBOARD (y reemplazar historial para no volver atrás)
        navigate("/dashboard", { replace: true });
      } else {
        setErrorMsg("Usuario o contraseña incorrectos");
      }
    } catch (err) {
      console.error("Error en login:", err);
      setErrorMsg("Error de conexión con el servidor.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Container fluid className="login-container">
      <Row className="g-0">
        <Col
          md={6}
          className="login-brand-col"
          style={{
            backgroundImage: `url(${LOGOTURBO})`,
            backgroundRepeat: "no-repeat",
            backgroundSize: "cover",
            backgroundPosition: "center",
          }}
        ></Col>

        <Col md={6} className="login-form-col">
          <Card className="login-card p-4">
            <Card.Body>
              <Form onSubmit={handleSubmit}>
                <Form.Group className="mb-3">
                  <Form.Label>Correo Electrónico</Form.Label>
                  <Form.Control
                    type="email"
                    placeholder="correoelectrónico@dominio.com"
                    className="modern-input"
                    value={correo}
                    onChange={(e) => setCorreo(e.target.value)}
                    required
                  />
                </Form.Group>

                <Form.Group className="mb-3">
                  <Form.Label>Contraseña</Form.Label>
                  <Form.Control
                    type="password"
                    placeholder="Contraseña"
                    className="modern-input"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </Form.Group>

                <Button
                  type="submit"
                  className="login-button w-100 mt-3"
                  disabled={loading}
                >
                  {loading ? "Validando..." : "Iniciar Sesión"}
                </Button>

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

                <div className="text-center mt-3 mb-2">
                  <a href="#" className="forgot-password-link">
                    ¿Olvidaste tu contraseña?
                  </a>
                </div>

                <hr className="hr-secondary" />

                <Button
                  type="button"
                  className="recover-button w-100 mt-3"
                  onClick={() => navigate("/recuperar")}
                >
                  Cambiar Contraseña
                </Button>
              </Form>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
}
