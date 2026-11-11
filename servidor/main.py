# main.py - TurboCajas API (actualizado con facturación)
from fastapi import FastAPI, HTTPException, Body, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, StreamingResponse
import traceback
import mysql.connector
import datetime
import secrets
import string
import smtplib
from email.mime.text import MIMEText  
import hashlib
import os
import base64
import hmac
import re
import io
from typing import Optional  # Para tipos opcionales en Python 3.9
import os
from dotenv import load_dotenv

load_dotenv(
    dotenv_path=os.path.join(os.path.dirname(__file__), ".env")
)
# PDF
try:
    from reportlab.pdfgen import canvas
except ImportError:
    canvas = None  # para evitar error si no está instalado; el endpoint de PDF validará esto

# ---------------------------
# Configuración BD (TiDB Cloud)
# ---------------------------
DB_CONFIG = {
    "host": os.environ["DB_HOST"],
    "port": int(os.environ.get("DB_PORT", 4000)),
    "user": os.environ["DB_USER"],
    "password": os.environ["DB_PASSWORD"],
    "database": os.environ["DB_NAME"],
}

def get_conn():
    return mysql.connector.connect(**DB_CONFIG)


# ------------------------------
# Envío de correo de recuperación
# ------------------------------
SMTP_HOST = "smtp.gmail.com"
SMTP_PORT = 587
SMTP_USER = os.environ["SMTP_USER"]
SMTP_PASS = os.environ["SMTP_PASS"]

def send_reset_email(to_email: str, code: str):
    """Envía el código de recuperación al correo del usuario."""
    subject = "Código de recuperación de contraseña - TurboCajas"
    body = (
        "Hola,\n\n"
        "Tu código de recuperación de contraseña es: {code}\n\n"
        "Este código expirará en 15 minutos.\n\n"
        "Si tú no solicitaste este código, por favor ignora este correo.\n\n"
        "Atentamente,\n"
        "Equipo TurboCajas"
    ).format(code=code)

    msg = MIMEText(body)
    msg["Subject"] = subject
    msg["From"] = SMTP_USER
    msg["To"] = to_email

    with smtplib.SMTP(SMTP_HOST, SMTP_PORT) as server:
        server.starttls()
        server.login(SMTP_USER, SMTP_PASS)
        server.send_message(msg)

# ---------------------------
# Utilidades de contraseñas
# ---------------------------
def validate_password_complexity(password: str) -> bool:
    if password is None:
        return False
    if len(password) < 8:
        return False
    if not re.search(r"[A-Z]", password):
        return False
    if not re.search(r"[a-z]", password):
        return False
    if not re.search(r"[0-9]", password):
        return False
    if not re.search(r"[!@#$%^&*(),.?\":{}|<>_\-\[\]/+=;']", password):
        return False
    return True

def make_password_hash(password: str) -> str:
    if password is None:
        password = ""
    salt = os.urandom(16)
    hash_bytes = hashlib.sha256(salt + password.encode("utf-8")).digest()
    salt_b64 = base64.b64encode(salt).decode("utf-8")
    hash_b64 = base64.b64encode(hash_bytes).decode("utf-8")
    return f"{salt_b64}${hash_b64}"

def verify_password(plain_password: str, stored_value: str) -> bool:
    if stored_value is None:
        return False
    if "$" in stored_value:
        try:
            salt_b64, hash_b64 = stored_value.split("$", 1)
            salt = base64.b64decode(salt_b64.encode("utf-8"))
            stored_hash = base64.b64decode(hash_b64.encode("utf-8"))
            test_hash = hashlib.sha256(salt + plain_password.encode("utf-8")).digest()
            return hmac.compare_digest(stored_hash, test_hash)
        except Exception:
            return False
    else:
        return stored_value == plain_password

# ---------------------------
# Utilidades varias
# ---------------------------
def pick(d: dict, *keys, default=None):
    for k in keys:
        if k in d:
            v = d[k]
            if isinstance(v, str):
                v = v.strip()
            if v not in (None, ""):
                return v
    return default

def to_bool_estado(value, default=True):
    if isinstance(value, bool):
        return value
    if value is None:
        return default
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        v = value.strip().lower()
        if v in ("1", "true", "t", "si", "sí", "yes", "y"):
            return True
        if v in ("0", "false", "f", "no", "n"):
            return False
    return default

def map_estado_orden(value) -> int:
    """
    1 = Activa
    2 = Cancelada
    3 = Facturada
    """
    if value is None:
        return 1

    if isinstance(value, (int, float)):
        n = int(value)
        if n in (1, 2, 3):
            return n

    if isinstance(value, str):
        v = value.strip().lower()
        if v in ("1", "activa", "activo", "true", "t"):
            return 1
        if v in ("2", "cancelada", "cancelado"):
            return 2
        if v in ("3", "facturada", "facturado"):
            return 3

    return 1


# ---------------------------
# FastAPI + CORS
# ---------------------------
app = FastAPI(title="TurboCajas API")

origins = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.exception_handler(Exception)
def global_error_handler(request, exc):
    return JSONResponse(
        status_code=500,
        content={
            "ok": False,
            "error": str(exc),
            "type": exc.__class__.__name__,
            "trace": traceback.format_exc().splitlines()[-5:],
        },
    )

# ------------------------------
# PING
# ------------------------------
@app.get("/ping")
def ping():
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("SELECT 1")
        cur.fetchone()
        cur.close()
        conn.close()
        return {"ok": True}
    except mysql.connector.Error as e:
        raise HTTPException(500, f"DB error: {e}")

# ------------------------------
# USUARIOS
# ------------------------------
@app.post("/usuarios", status_code=201)
def crear_usuario(data: dict = Body(...)):
    nom_user = pick(data, "Nom_user", "nom_user", "nombre")
    email    = pick(data, "Email", "email", "correo")
    contra   = pick(data, "Contra_user", "contra_user", "password")

    missing = []
    if not nom_user: missing.append("Nom_user")
    if not email:    missing.append("Email")
    if not contra:   missing.append("Contra_user")
    if missing:
        raise HTTPException(400, {"code": "VALIDATION_ERROR", "missing": missing})

    if not validate_password_complexity(contra):
        raise HTTPException(
            400,
            "La contraseña debe tener mínimo 8 caracteres, "
            "al menos una mayúscula, una minúscula, un número y un símbolo."
        )

    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("SELECT id_user FROM USUARIOS WHERE Email=%s", (email,))
        if cur.fetchone():
            cur.close()
            conn.close()
            raise HTTPException(400, "Ya existe un usuario con ese correo")

        hashed = make_password_hash(contra)
        cur.execute(
            "INSERT INTO USUARIOS (Nom_user, Email, Contra_user) VALUES (%s, %s, %s)",
            (nom_user, email, hashed),
        )
        conn.commit()
        user_id = cur.lastrowid
        cur.close()
        conn.close()

        return {"id_user": user_id, "Nom_user": nom_user, "Email": email}
    except mysql.connector.Error as e:
        raise HTTPException(500, f"DB error: {e}")

@app.get("/usuarios")
def listar_usuarios():
    try:
        conn = get_conn()
        cur = conn.cursor(dictionary=True)
        cur.execute("SELECT id_user, Nom_user, Email FROM USUARIOS ORDER BY id_user")
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return rows
    except mysql.connector.Error as e:
        raise HTTPException(500, f"DB error: {e}")

@app.post("/login")
def login(data: dict = Body(...)):
    email    = pick(data, "Email", "email", "correo")
    password = pick(data, "password", "Contra_user", "contra_user")

    if not email or not password:
        raise HTTPException(400, "email y password/contra_user son requeridos")

    try:
        conn = get_conn()
        cur = conn.cursor(dictionary=True)
        cur.execute("SELECT Nom_user, Contra_user FROM USUARIOS WHERE Email=%s", (email,))
        u = cur.fetchone()
        cur.close()
        conn.close()

        if not u:
            raise HTTPException(401, "Credenciales incorrectas")

        stored = u["Contra_user"]
        if not verify_password(password, stored):
            raise HTTPException(401, "Credenciales incorrectas")

        return {"ok": True, "message": f"Bienvenido {u['Nom_user']}"}
    except mysql.connector.Error as e:
        raise HTTPException(500, f"DB error: {e}")

# ------------------------------
# Recuperación de contraseña
# ------------------------------
@app.post("/password/request-reset")
def request_password_reset(data: dict = Body(...)):
    email = pick(data, "Email", "email", "correo")
    if not email:
        raise HTTPException(400, "Email es requerido")

    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("SELECT id_user FROM USUARIOS WHERE Email=%s", (email,))
        user = cur.fetchone()

        if not user:
            cur.close()
            conn.close()
            return {
                "ok": True,
                "message": "Si el correo existe en el sistema, se ha enviado un código de recuperación.",
            }

        code = "".join(secrets.choice(string.digits) for _ in range(6))
        expires_at = datetime.datetime.utcnow() + datetime.timedelta(minutes=15)

        cur.execute(
            """
            INSERT INTO RESET_PASSWORD (email, code, expires_at, used)
            VALUES (%s, %s, %s, 0)
            """,
            (email, code, expires_at),
        )
        conn.commit()
        cur.close()
        conn.close()

        try:
            send_reset_email(email, code)
        except Exception as e:
            raise HTTPException(500, f"No se pudo enviar el correo de recuperación: {e}")

        return {
            "ok": True,
            "message": "Si el correo existe en el sistema, se ha enviado un código de recuperación.",
        }
    except mysql.connector.Error as e:
        raise HTTPException(500, f"DB error: {e}")

@app.post("/password/reset")
def reset_password(data: dict = Body(...)):
    email    = pick(data, "Email", "email", "correo")
    code     = pick(data, "code", "codigo")
    new_pass = pick(data, "password", "Contra_user", "contra_user")

    if not email or not code or not new_pass:
        raise HTTPException(400, "Email, código y nueva contraseña son requeridos")

    if not validate_password_complexity(new_pass):
        raise HTTPException(
            400,
            "La contraseña debe tener mínimo 8 caracteres, "
            "al menos una mayúscula, una minúscula, un número y un símbolo."
        )

    try:
        conn = get_conn()
        cur = conn.cursor(dictionary=True)
        cur.execute(
            """
            SELECT * FROM RESET_PASSWORD
            WHERE email=%s AND code=%s AND used = 0
            ORDER BY id DESC
            LIMIT 1
            """,
            (email, code),
        )
        reset_row = cur.fetchone()

        if not reset_row:
            cur.close()
            conn.close()
            raise HTTPException(400, "Código inválido o ya utilizado.")

        expires_at = reset_row["expires_at"]
        now_utc = datetime.datetime.utcnow()
        if now_utc > expires_at:
            cur.close()
            conn.close()
            raise HTTPException(400, "El código ha expirado.")

        cur.execute("UPDATE RESET_PASSWORD SET used = 1 WHERE id = %s", (reset_row["id"],))
        hashed = make_password_hash(new_pass)
        cur.execute("UPDATE USUARIOS SET Contra_user=%s WHERE Email=%s", (hashed, email))
        conn.commit()
        cur.close()
        conn.close()

        return {"ok": True, "message": "Contraseña actualizada correctamente."}
    except mysql.connector.Error as e:
        raise HTTPException(500, f"DB error: {e}")

# ------------------------------
# CLIENTES
# ------------------------------
@app.post("/clientes", status_code=201)
def crear_cliente(data: dict = Body(...)):
    nom_cliente = pick(data, "Nom_cliente", "nom_cliente", "nombre")
    num_doc     = pick(data, "Num_doc", "num_doc", "documento")
    telefono    = pick(data, "Telefono", "telefono")
    direccion   = pick(data, "Direccion", "direccion")
    correo      = pick(data, "Correo", "correo", "Email", "email")

    missing = []
    if not nom_cliente: missing.append("Nom_cliente")
    if not num_doc:     missing.append("Num_doc")
    if missing:
        raise HTTPException(400, {"code": "VALIDATION_ERROR", "missing": missing})

    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("SELECT id_cliente FROM CLIENTES WHERE Num_doc=%s", (num_doc,))
        if cur.fetchone():
            cur.close()
            conn.close()
            raise HTTPException(400, "Ya existe un cliente con ese documento")

        if correo:
            cur.execute("SELECT id_cliente FROM CLIENTES WHERE Correo=%s", (correo,))
            if cur.fetchone():
                cur.close()
                conn.close()
                raise HTTPException(400, "Ya existe un cliente con ese correo")

        cur.execute(
            """
            INSERT INTO CLIENTES (Nom_cliente, Num_doc, Telefono, Direccion, Correo)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (nom_cliente, num_doc, telefono, direccion, correo),
        )
        conn.commit()
        id_cliente = cur.lastrowid
        cur.close()
        conn.close()

        return {
            "id_cliente": id_cliente,
            "Nom_cliente": nom_cliente,
            "Num_doc": num_doc,
            "Telefono": telefono,
            "Direccion": direccion,
            "Correo": correo,
        }
    except mysql.connector.Error as e:
        raise HTTPException(500, f"DB error: {e}")

@app.get("/clientes")
def listar_clientes():
    try:
        conn = get_conn()
        cur = conn.cursor(dictionary=True)
        cur.execute(
            "SELECT id_cliente, Nom_cliente, Num_doc, Telefono, Direccion, Correo "
            "FROM CLIENTES ORDER BY id_cliente"
        )
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return rows
    except mysql.connector.Error as e:
        raise HTTPException(500, f"DB error: {e}")

@app.get("/clientes/nombres")
def listar_clientes_nombres():
    try:
        conn = get_conn()
        cur = conn.cursor(dictionary=True)
        cur.execute("SELECT id_cliente, Nom_cliente FROM CLIENTES ORDER BY Nom_cliente")
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return rows
    except mysql.connector.Error as e:
        raise HTTPException(500, f"DB error: {e}")

@app.get("/clientes/{id_cliente}")
def obtener_cliente(id_cliente: int):
    try:
        conn = get_conn()
        cur = conn.cursor(dictionary=True)
        cur.execute(
            "SELECT id_cliente, Nom_cliente, Num_doc, Telefono, Direccion, Correo "
            "FROM CLIENTES WHERE id_cliente=%s",
            (id_cliente,),
        )
        row = cur.fetchone()
        cur.close()
        conn.close()
        if not row:
            raise HTTPException(404, "Cliente no encontrado")
        return row
    except mysql.connector.Error as e:
        raise HTTPException(500, f"DB error: {e}")

@app.put("/clientes/{id_cliente}")
def actualizar_cliente(id_cliente: int, data: dict = Body(...)):
    nom_cliente = pick(data, "Nom_cliente", "nom_cliente", "nombre")
    num_doc     = pick(data, "Num_doc", "num_doc", "documento")
    telefono    = pick(data, "Telefono", "telefono")
    direccion   = pick(data, "Direccion", "direccion")
    correo      = pick(data, "Correo", "correo", "Email", "email")

    try:
        conn = get_conn()
        cur = conn.cursor(dictionary=True)
        cur.execute("SELECT * FROM CLIENTES WHERE id_cliente=%s", (id_cliente,))
        existing = cur.fetchone()
        if not existing:
            cur.close()
            conn.close()
            raise HTTPException(404, "Cliente no encontrado")

        if num_doc and num_doc != existing["Num_doc"]:
            cur.execute("SELECT id_cliente FROM CLIENTES WHERE Num_doc=%s", (num_doc,))
            if cur.fetchone():
                cur.close()
                conn.close()
                raise HTTPException(400, "Ya existe un cliente con ese documento")

        if correo and correo != existing["Correo"]:
            cur.execute("SELECT id_cliente FROM CLIENTES WHERE Correo=%s", (correo,))
            if cur.fetchone():
                cur.close()
                conn.close()
                raise HTTPException(400, "Ya existe un cliente con ese correo")

        nom_final = nom_cliente or existing["Nom_cliente"]
        doc_final = num_doc or existing["Num_doc"]
        tel_final = telefono or existing["Telefono"]
        dir_final = direccion or existing["Direccion"]
        cor_final = correo or existing["Correo"]

        cur2 = conn.cursor()
        cur2.execute(
            """
            UPDATE CLIENTES
            SET Nom_cliente=%s, Num_doc=%s, Telefono=%s, Direccion=%s, Correo=%s
            WHERE id_cliente=%s
            """,
            (nom_final, doc_final, tel_final, dir_final, cor_final, id_cliente),
        )
        conn.commit()
        cur2.close()
        cur.close()
        conn.close()

        return {
            "id_cliente": id_cliente,
            "Nom_cliente": nom_final,
            "Num_doc": doc_final,
            "Telefono": tel_final,
            "Direccion": dir_final,
            "Correo": cor_final,
        }
    except mysql.connector.Error as e:
        raise HTTPException(500, f"DB error: {e}")

@app.delete("/clientes/{id_cliente}", status_code=204)
def eliminar_cliente(id_cliente: int):
    conn = None
    try:
        conn = get_conn()
        cur = conn.cursor()

        cur.execute("SELECT id_vehiculo FROM VEHICULOS WHERE id_cliente=%s", (id_cliente,))
        vehiculos_rows = cur.fetchall()
        vehiculos = [v[0] for v in vehiculos_rows]

        ordenes = []
        if vehiculos:
            in_veh = ",".join(["%s"] * len(vehiculos))
            cur.execute(
                f"SELECT id_orden FROM ORDEN_TRABAJO WHERE id_vehiculo IN ({in_veh})",
                vehiculos,
            )
            ordenes += [o[0] for o in cur.fetchall()]

        cur.execute("SELECT id_orden FROM ORDEN_TRABAJO WHERE id_cliente=%s", (id_cliente,))
        ordenes += [o[0] for o in cur.fetchall()]
        ordenes = list(set(ordenes))

        if ordenes:
            in_orden = ",".join(["%s"] * len(ordenes))
            cur.execute(f"DELETE FROM DETALLES_REP WHERE id_orden IN ({in_orden})", ordenes)
            cur.execute(f"DELETE FROM DETALLES_SERV WHERE id_orden IN ({in_orden})", ordenes)
            cur.execute(f"DELETE FROM ORDEN_TRABAJO WHERE id_orden IN ({in_orden})", ordenes)

        cur.execute("DELETE FROM FACTURACION WHERE id_cliente=%s", (id_cliente,))
        if vehiculos:
            in_veh = ",".join(["%s"] * len(vehiculos))
            cur.execute(f"DELETE FROM FACTURACION WHERE id_vehiculo IN ({in_veh})", vehiculos)

        cur.execute("DELETE FROM VEHICULOS WHERE id_cliente=%s", (id_cliente,))
        cur.execute("DELETE FROM CLIENTES WHERE id_cliente=%s", (id_cliente,))
        if cur.rowcount == 0:
            conn.rollback()
            cur.close()
            conn.close()
            raise HTTPException(404, "Cliente no encontrado")

        conn.commit()
        cur.close()
        conn.close()
        return None
    except mysql.connector.Error as e:
        if conn:
            try:
                conn.rollback()
            except Exception:
                pass
        raise HTTPException(500, f"DB error al borrar cliente: {e}")

# ------------------------------
# VEHICULOS
# ------------------------------
@app.post("/vehiculos", status_code=201)
def crear_vehiculo(data: dict = Body(...)):
    for campo in ["id_cliente", "matricula", "marca", "modelo"]:
        if campo not in data or (campo in ["matricula", "marca", "modelo"] and not data.get(campo)):
            raise HTTPException(400, f"{campo} es requerido")

    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("SELECT id_cliente FROM CLIENTES WHERE id_cliente=%s", (data["id_cliente"],))
        if not cur.fetchone():
            cur.close()
            conn.close()
            raise HTTPException(400, "El cliente no existe")

        cur.execute("SELECT id_vehiculo FROM VEHICULOS WHERE matricula=%s", (data["matricula"],))
        if cur.fetchone():
            cur.close()
            conn.close()
            raise HTTPException(400, "Ya existe un vehículo con esa matrícula")

        cur.execute(
            """
            INSERT INTO VEHICULOS (id_cliente, matricula, marca, modelo)
            VALUES (%s, %s, %s, %s)
            """,
            (data["id_cliente"], data["matricula"], data["marca"], data["modelo"]),
        )
        conn.commit()
        id_vehiculo = cur.lastrowid
        cur.close()
        conn.close()
        return {
            "id_vehiculo": id_vehiculo,
            "id_cliente": data["id_cliente"],
            "matricula": data["matricula"],
            "marca": data["marca"],
            "modelo": data["modelo"],
        }
    except mysql.connector.Error as e:
        raise HTTPException(500, f"DB error: {e}")

@app.get("/vehiculos")
def listar_vehiculos():
    try:
        conn = get_conn()
        cur = conn.cursor(dictionary=True)
        cur.execute(
            """
            SELECT v.id_vehiculo, v.id_cliente, v.matricula, v.marca, v.modelo,
                   c.Nom_cliente
            FROM VEHICULOS v
            INNER JOIN CLIENTES c ON v.id_cliente = c.id_cliente
            ORDER BY v.id_vehiculo
            """
        )
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return rows
    except mysql.connector.Error as e:
        raise HTTPException(500, f"DB error: {e}")

@app.get("/vehiculos/{id_vehiculo}")
def obtener_vehiculo(id_vehiculo: int):
    try:
        conn = get_conn()
        cur = conn.cursor(dictionary=True)
        cur.execute(
            """
            SELECT v.id_vehiculo, v.id_cliente, v.matricula, v.marca, v.modelo,
                   c.Nom_cliente
            FROM VEHICULOS v
            INNER JOIN CLIENTES c ON v.id_cliente = c.id_cliente
            WHERE v.id_vehiculo=%s
            """,
            (id_vehiculo,),
        )
        row = cur.fetchone()
        cur.close()
        conn.close()
        if not row:
            raise HTTPException(404, "Vehículo no encontrado")
        return row
    except mysql.connector.Error as e:
        raise HTTPException(500, f"DB error: {e}")

@app.put("/vehiculos/{id_vehiculo}")
def actualizar_vehiculo(id_vehiculo: int, data: dict = Body(...)):
    try:
        conn = get_conn()
        cur = conn.cursor(dictionary=True)
        cur.execute("SELECT * FROM VEHICULOS WHERE id_vehiculo=%s", (id_vehiculo,))
        existing = cur.fetchone()
        if not existing:
            cur.close()
            conn.close()
            raise HTTPException(404, "Vehículo no encontrado")

        id_cliente = data.get("id_cliente", existing["id_cliente"])
        matricula  = data.get("matricula", existing["matricula"])
        marca      = data.get("marca", existing["marca"])
        modelo     = data.get("modelo", existing["modelo"])

        cur.execute("SELECT id_cliente FROM CLIENTES WHERE id_cliente=%s", (id_cliente,))
        if not cur.fetchone():
            cur.close()
            conn.close()
            raise HTTPException(400, "El cliente no existe")

        if matricula != existing["matricula"]:
            cur.execute("SELECT id_vehiculo FROM VEHICULOS WHERE matricula=%s", (matricula,))
            if cur.fetchone():
                cur.close()
                conn.close()
                raise HTTPException(400, "Ya existe un vehículo con esa matrícula")

        cur2 = conn.cursor()
        cur2.execute(
            """
            UPDATE VEHICULOS
            SET id_cliente=%s, matricula=%s, marca=%s, modelo=%s
            WHERE id_vehiculo=%s
            """,
            (id_cliente, matricula, marca, modelo, id_vehiculo),
        )
        conn.commit()
        cur2.close()
        cur.close()
        conn.close()

        return {
            "id_vehiculo": id_vehiculo,
            "id_cliente": id_cliente,
            "matricula": matricula,
            "marca": marca,
            "modelo": modelo,
        }
    except mysql.connector.Error as e:
        raise HTTPException(500, f"DB error: {e}")

@app.delete("/vehiculos/{id_vehiculo}", status_code=204)
def eliminar_vehiculo(id_vehiculo: int):
    conn = None
    try:
        conn = get_conn()
        cur = conn.cursor()

        cur.execute("SELECT id_orden FROM ORDEN_TRABAJO WHERE id_vehiculo=%s", (id_vehiculo,))
        ordenes_rows = cur.fetchall()
        ordenes = [o[0] for o in ordenes_rows]

        if ordenes:
            in_orden = ",".join(["%s"] * len(ordenes))
            cur.execute(f"DELETE FROM DETALLES_REP WHERE id_orden IN ({in_orden})", ordenes)
            cur.execute(f"DELETE FROM DETALLES_SERV WHERE id_orden IN ({in_orden})", ordenes)
            cur.execute(f"DELETE FROM ORDEN_TRABAJO WHERE id_orden IN ({in_orden})", ordenes)

        cur.execute("DELETE FROM FACTURACION WHERE id_vehiculo=%s", (id_vehiculo,))
        cur.execute("DELETE FROM VEHICULOS WHERE id_vehiculo=%s", (id_vehiculo,))
        if cur.rowcount == 0:
            conn.rollback()
            cur.close()
            conn.close()
            raise HTTPException(404, "Vehículo no encontrado")

        conn.commit()
        cur.close()
        conn.close()
        return None
    except mysql.connector.Error as e:
        if conn:
            try:
                conn.rollback()
            except Exception:
                pass
        raise HTTPException(500, f"DB error al borrar vehículo: {e}")

@app.get("/vehiculos/cliente/{id_cliente}")
def buscar_vehiculos_por_cliente(id_cliente: int):
    try:
        conn = get_conn()
        cur = conn.cursor(dictionary=True)
        cur.execute(
            """
            SELECT v.id_vehiculo, v.matricula, v.id_cliente
            FROM VEHICULOS v
            INNER JOIN CLIENTES c ON v.id_cliente = c.id_cliente
            WHERE c.id_cliente = %s
            """,
            (id_cliente,),
        )
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return rows
    except mysql.connector.Error as e:
        raise HTTPException(500, f"DB error: {e}")

# ------------------------------
# SERVICIOS
# ------------------------------
@app.post("/servicios", status_code=201)
def crear_servicio(data: dict = Body(...)):
    nom_serv = pick(data, "nom_serv", "Nom_serv", "nombre")
    precio   = data.get("precio")
    estado   = to_bool_estado(data.get("estado", True))

    if not nom_serv:
        raise HTTPException(400, "nom_serv es requerido")
    if precio is None:
        raise HTTPException(400, "precio es requerido")

    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute(
            "INSERT INTO SERVICIOS (nom_serv, precio, estado) VALUES (%s, %s, %s)",
            (nom_serv, precio, estado),
        )
        conn.commit()
        id_serv = cur.lastrowid
        cur.close()
        conn.close()
        return {"id_serv": id_serv, "nom_serv": nom_serv, "precio": precio, "estado": estado}
    except mysql.connector.Error as e:
        raise HTTPException(500, f"DB error: {e}")

@app.get("/servicios")
def listar_servicios():
    try:
        conn = get_conn()
        cur = conn.cursor(dictionary=True)
        cur.execute("SELECT * FROM SERVICIOS ORDER BY id_serv")
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return rows
    except mysql.connector.Error as e:
        raise HTTPException(500, f"DB error: {e}")

@app.put("/servicios/{id_serv}")
def actualizar_servicio(id_serv: int, data: dict = Body(...)):
    nom_serv = pick(data, "nom_serv", "Nom_serv", "nombre")
    precio   = data.get("precio")
    estado   = data.get("estado")

    try:
        conn = get_conn()
        cur = conn.cursor(dictionary=True)
        cur.execute("SELECT * FROM SERVICIOS WHERE id_serv=%s", (id_serv,))
        existing = cur.fetchone()
        if not existing:
            cur.close()
            conn.close()
            raise HTTPException(404, "Servicio no encontrado")

        nom_final = nom_serv or existing["nom_serv"]
        precio_final = precio if precio is not None else existing["precio"]
        estado_final = to_bool_estado(estado, existing["estado"])

        cur2 = conn.cursor()
        cur2.execute(
            "UPDATE SERVICIOS SET nom_serv=%s, precio=%s, estado=%s WHERE id_serv=%s",
            (nom_final, precio_final, estado_final, id_serv),
        )
        conn.commit()
        cur2.close()
        cur.close()
        conn.close()
        return {
            "id_serv": id_serv,
            "nom_serv": nom_final,
            "precio": precio_final,
            "estado": estado_final,
        }
    except mysql.connector.Error as e:
        raise HTTPException(500, f"DB error: {e}")

@app.delete("/servicios/{id_serv}", status_code=204)
def eliminar_servicio(id_serv: int):
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("DELETE FROM SERVICIOS WHERE id_serv=%s", (id_serv,))
        if cur.rowcount == 0:
            conn.rollback()
            cur.close()
            conn.close()
            raise HTTPException(404, "Servicio no encontrado")
        conn.commit()
        cur.close()
        conn.close()
        return None
    except mysql.connector.Error as e:
        raise HTTPException(500, f"DB error: {e}")

# ------------------------------
# REPUESTOS
# ------------------------------
@app.post("/repuestos", status_code=201)
def crear_repuesto(data: dict = Body(...)):
    nom_rep = pick(data, "nom_rep", "Nom_rep", "nombre")
    precio  = data.get("precio")
    codigo  = pick(data, "codigo", "Codigo")
    estado  = to_bool_estado(data.get("estado", True))

    if not nom_rep:
        raise HTTPException(400, "nom_rep es requerido")
    if precio is None:
        raise HTTPException(400, "precio es requerido")
    if not codigo:
        raise HTTPException(400, "codigo es requerido")

    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("SELECT id_rep FROM REPUESTOS WHERE codigo=%s", (codigo,))
        if cur.fetchone():
            cur.close()
            conn.close()
            raise HTTPException(400, "Ya existe un repuesto con ese código")

        cur.execute(
            "INSERT INTO REPUESTOS (nom_rep, precio, codigo, estado) VALUES (%s, %s, %s, %s)",
            (nom_rep, precio, codigo, estado),
        )
        conn.commit()
        id_rep = cur.lastrowid
        cur.close()
        conn.close()
        return {"id_rep": id_rep, "nom_rep": nom_rep, "precio": precio, "codigo": codigo, "estado": estado}
    except mysql.connector.Error as e:
        raise HTTPException(500, f"DB error: {e}")

@app.get("/repuestos")
def listar_repuestos():
    try:
        conn = get_conn()
        cur = conn.cursor(dictionary=True)
        cur.execute("SELECT * FROM REPUESTOS ORDER BY id_rep")
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return rows
    except mysql.connector.Error as e:
        raise HTTPException(500, f"DB error: {e}")

@app.put("/repuestos/{id_rep}")
def actualizar_repuesto(id_rep: int, data: dict = Body(...)):
    nom_rep = pick(data, "nom_rep", "Nom_rep", "nombre")
    precio  = data.get("precio")
    codigo  = pick(data, "codigo", "Codigo")
    estado  = data.get("estado")

    try:
        conn = get_conn()
        cur = conn.cursor(dictionary=True)
        cur.execute("SELECT * FROM REPUESTOS WHERE id_rep=%s", (id_rep,))
        existing = cur.fetchone()
        if not existing:
            cur.close()
            conn.close()
            raise HTTPException(404, "Repuesto no encontrado")

        nom_final = nom_rep or existing["nom_rep"]
        precio_final = precio if precio is not None else existing["precio"]
        codigo_final = codigo or existing["codigo"]
        estado_final = to_bool_estado(estado, existing["estado"])

        if codigo_final != existing["codigo"]:
            cur.execute("SELECT id_rep FROM REPUESTOS WHERE codigo=%s", (codigo_final,))
            if cur.fetchone():
                cur.close()
                conn.close()
                raise HTTPException(400, "Ya existe un repuesto con ese código")

        cur2 = conn.cursor()
        cur2.execute(
            "UPDATE REPUESTOS SET nom_rep=%s, precio=%s, codigo=%s, estado=%s WHERE id_rep=%s",
            (nom_final, precio_final, codigo_final, estado_final, id_rep),
        )
        conn.commit()
        cur2.close()
        cur.close()
        conn.close()
        return {
            "id_rep": id_rep,
            "nom_rep": nom_final,
            "precio": precio_final,
            "codigo": codigo_final,
            "estado": estado_final,
        }
    except mysql.connector.Error as e:
        raise HTTPException(500, f"DB error: {e}")

@app.delete("/repuestos/{id_rep}", status_code=204)
def eliminar_repuesto(id_rep: int):
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("DELETE FROM REPUESTOS WHERE id_rep=%s", (id_rep,))
        if cur.rowcount == 0:
            conn.rollback()
            cur.close()
            conn.close()
            raise HTTPException(404, "Repuesto no encontrado")
        conn.commit()
        cur.close()
        conn.close()
        return None
    except mysql.connector.Error as e:
        raise HTTPException(500, f"DB error: {e}")

# ------------------------------
# ORDENES DE TRABAJO
# ------------------------------
@app.post("/orden", status_code=201)
@app.post("/orden", status_code=201)
def crear_orden(data: dict = Body(...)):
    for campo in ["id_cliente", "id_vehiculo", "fecha", "total"]:
        if campo not in data or (campo == "fecha" and not data.get(campo)):
            raise HTTPException(400, f"{campo} es requerido")
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("SELECT id_cliente FROM CLIENTES WHERE id_cliente=%s", (data["id_cliente"],))
        if not cur.fetchone():
            cur.close()
            conn.close()
            raise HTTPException(400, "Cliente no existe")

        cur.execute("SELECT id_vehiculo FROM VEHICULOS WHERE id_vehiculo=%s", (data["id_vehiculo"],))
        if not cur.fetchone():
            cur.close()
            conn.close()
            raise HTTPException(400, "Vehículo no existe")

        fecha = data["fecha"]
        if isinstance(fecha, str):
            fecha = datetime.datetime.strptime(fecha, "%Y-%m-%d").date()

        # ✅ usar el mapeo 1/2/3
        estado = map_estado_orden(data.get("estado", 1))
        total  = data.get("total", 0)

        cur.execute(
            """
            INSERT INTO ORDEN_TRABAJO (id_cliente, id_vehiculo, fecha, estado, total)
            VALUES (%s, %s, %s, %s, %s)
            """,
            (data["id_cliente"], data["id_vehiculo"], fecha, estado, total),
        )
        conn.commit()
        id_orden = cur.lastrowid
        cur.close()
        conn.close()
        return {
            "id_orden": id_orden,
            "id_cliente": data["id_cliente"],
            "id_vehiculo": data["id_vehiculo"],
            "fecha": str(fecha),
            "estado": estado,
            "total": total,
        }
    except mysql.connector.Error as e:
        raise HTTPException(500, f"DB error: {e}")


@app.put("/orden/{id_orden}")
def actualizar_orden(id_orden: int, data: dict = Body(...)):
    try:
        conn = get_conn()
        cur = conn.cursor(dictionary=True)
        cur.execute("SELECT * FROM ORDEN_TRABAJO WHERE id_orden=%s", (id_orden,))
        existing = cur.fetchone()
        if not existing:
            cur.close()
            conn.close()
            raise HTTPException(404, "Orden no encontrada")

        id_cliente = data.get("id_cliente", existing["id_cliente"])
        id_vehiculo = data.get("id_vehiculo", existing["id_vehiculo"])
        fecha = data.get("fecha", existing["fecha"])
        estado_raw = data.get("estado", existing["estado"])
        total = data.get("total", existing["total"])

        if isinstance(fecha, str):
            fecha = datetime.datetime.strptime(fecha, "%Y-%m-%d").date()

        # ✅ convertir a 1/2/3 según valor recibido ("Activa", "Cancelada", "Facturada" o número)
        estado = map_estado_orden(estado_raw)

        cur2 = conn.cursor()
        cur2.execute(
            """
            UPDATE ORDEN_TRABAJO
            SET id_cliente=%s, id_vehiculo=%s, fecha=%s, estado=%s, total=%s
            WHERE id_orden=%s
            """,
            (id_cliente, id_vehiculo, fecha, estado, total, id_orden),
        )
        conn.commit()
        cur2.close()
        cur.close()
        conn.close()

        return {
            "id_orden": id_orden,
            "id_cliente": id_cliente,
            "id_vehiculo": id_vehiculo,
            "fecha": str(fecha),
            "estado": estado,
            "total": total,
        }
    except mysql.connector.Error as e:
        raise HTTPException(500, f"DB error: {e}")

from fastapi import FastAPI, HTTPException
import mysql.connector

# ... ya tienes DB_CONFIG y el resto arriba

@app.delete("/facturas/{id_factura}")
def eliminar_factura(id_factura: int):
    cnx = None
    cur = None
    try:
        cnx = mysql.connector.connect(**DB_CONFIG)
        cur = cnx.cursor(dictionary=True)

        # 1. Buscar la factura y obtener la orden asociada
        cur.execute(
            "SELECT id_orden FROM FACTURACION WHERE id_factura = %s",
            (id_factura,),
        )
        factura = cur.fetchone()

        if not factura:
            raise HTTPException(status_code=404, detail="Factura no encontrada")

        id_orden = factura["id_orden"]

        # 2. Eliminar la factura
        cur.execute(
            "DELETE FROM FACTURACION WHERE id_factura = %s",
            (id_factura,),
        )

        # 3. Reactivar la orden de trabajo (estado = 1 => Activa)
        if id_orden is not None:
            cur.execute(
                "UPDATE ORDEN_TRABAJO SET estado = 1 WHERE id_orden = %s",
                (id_orden,),
            )

        cnx.commit()
        return {"detail": "Factura eliminada y orden reactivada correctamente"}

    except HTTPException:
        if cnx:
            cnx.rollback()
        raise
    except Exception as e:
        if cnx:
            cnx.rollback()
        print("Error al eliminar factura:", e)
        raise HTTPException(
            status_code=500,
            detail="Error al eliminar la factura",
        )
    finally:
        if cur:
            cur.close()
        if cnx:
            cnx.close()

@app.get("/ordenes")
def listar_ordenes():
    try:
        conn = get_conn()
        cur = conn.cursor(dictionary=True)
        cur.execute(
            """
            SELECT o.id_orden, o.id_cliente, o.id_vehiculo, o.fecha, o.estado, o.total,
                   c.Nom_cliente AS nom_cliente,
                   v.matricula
            FROM ORDEN_TRABAJO o
            INNER JOIN CLIENTES c ON o.id_cliente = c.id_cliente
            INNER JOIN VEHICULOS v ON o.id_vehiculo = v.id_vehiculo
            ORDER BY o.id_orden DESC
            """
        )
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return rows
    except mysql.connector.Error as e:
        raise HTTPException(500, f"DB error: {e}")

@app.get("/orden/{id_orden}")
def obtener_orden(id_orden: int):
    try:
        conn = get_conn()
        cur = conn.cursor(dictionary=True)
        cur.execute(
            """
            SELECT o.id_orden, o.id_cliente, o.id_vehiculo, o.fecha, o.estado, o.total,
                   c.Nom_cliente AS nom_cliente,
                   v.matricula
            FROM ORDEN_TRABAJO o
            INNER JOIN CLIENTES c ON o.id_cliente = c.id_cliente
            INNER JOIN VEHICULOS v ON o.id_vehiculo = v.id_vehiculo
            WHERE o.id_orden=%s
            """,
            (id_orden,),
        )
        row = cur.fetchone()
        cur.close()
        conn.close()
        if not row:
            raise HTTPException(404, "Orden no encontrada")
        return row
    except mysql.connector.Error as e:
        raise HTTPException(500, f"DB error: {e}")

# ------------------------------
# DETALLES REPUESTOS
# ------------------------------
@app.post("/detalles_rep", status_code=201)
def crear_detalle_rep(data: dict = Body(...)):
    for campo in ["id_orden", "id_rep", "cantidad", "subtotal"]:
        if campo not in data:
            raise HTTPException(400, f"{campo} es requerido")
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO DETALLES_REP (id_orden, id_rep, cantidad, subtotal)
            VALUES (%s, %s, %s, %s)
            """,
            (data["id_orden"], data["id_rep"], data["cantidad"], data["subtotal"]),
        )
        conn.commit()
        cur.close()
        conn.close()
        return {
            "id_orden": data["id_orden"],
            "id_rep": data["id_rep"],
            "cantidad": data["cantidad"],
            "subtotal": data["subtotal"],
        }
    except mysql.connector.Error as e:
        raise HTTPException(500, f"DB error: {e}")

@app.put("/detalle_rep/{id_rep}/{id_orden}")
def actualizar_detalle_rep(id_rep: int, id_orden: int, data: dict = Body(...)):
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute(
            "UPDATE DETALLES_REP SET cantidad=%s, subtotal=%s WHERE id_rep=%s AND id_orden=%s",
            (data.get("cantidad"), data.get("subtotal"), id_rep, id_orden),
        )
        if cur.rowcount == 0:
            conn.rollback()
            cur.close()
            conn.close()
            raise HTTPException(404, "Detalle no encontrado")
        conn.commit()
        cur.close()
        conn.close()
        return {"ok": True}
    except mysql.connector.Error as e:
        raise HTTPException(500, f"DB error: {e}")

@app.delete("/detalle_rep/{id_rep}/{id_orden}", status_code=204)
def eliminar_detalle_rep(id_rep: int, id_orden: int):
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute(
            "DELETE FROM DETALLES_REP WHERE id_rep=%s AND id_orden=%s",
            (id_rep, id_orden),
        )
        if cur.rowcount == 0:
            conn.rollback()
            cur.close()
            conn.close()
            raise HTTPException(404, "Detalle no encontrado")
        conn.commit()
        cur.close()
        conn.close()
        return None
    except mysql.connector.Error as e:
        raise HTTPException(500, f"DB error: {e}")

# ------------------------------
# DETALLES SERVICIOS
# ------------------------------
@app.post("/detalles_serv", status_code=201)
def crear_detalle_serv(data: dict = Body(...)):
    for campo in ["id_orden", "id_serv", "cantidad", "subtotal"]:
        if campo not in data:
            raise HTTPException(400, f"{campo} es requerido")
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute(
            """
            INSERT INTO DETALLES_SERV (id_orden, id_serv, cantidad, subtotal)
            VALUES (%s, %s, %s, %s)
            """,
            (data["id_orden"], data["id_serv"], data["cantidad"], data["subtotal"]),
        )
        conn.commit()
        cur.close()
        conn.close()
        return {
            "id_orden": data["id_orden"],
            "id_serv": data["id_serv"],
            "cantidad": data["cantidad"],
            "subtotal": data["subtotal"],
        }
    except mysql.connector.Error as e:
        raise HTTPException(500, f"DB error: {e}")

@app.put("/detalle_serv/{id_serv}/{id_orden}")
def actualizar_detalle_serv(id_serv: int, id_orden: int, data: dict = Body(...)):
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute(
            "UPDATE DETALLES_SERV SET cantidad=%s, subtotal=%s WHERE id_serv=%s AND id_orden=%s",
            (data.get("cantidad"), data.get("subtotal"), id_serv, id_orden),
        )
        if cur.rowcount == 0:
            conn.rollback()
            cur.close()
            conn.close()
            raise HTTPException(404, "Detalle no encontrado")
        conn.commit()
        cur.close()
        conn.close()
        return {"ok": True}
    except mysql.connector.Error as e:
        raise HTTPException(500, f"DB error: {e}")

# ------------------------------
# CONSULTAS DETALLES / TOTALES
# ------------------------------
@app.get("/detalles_rep/orden/{id_orden}")
def detalles_rep_por_orden(id_orden: int):
    try:
        conn = get_conn()
        cur = conn.cursor(dictionary=True)
        cur.execute(
            """
            SELECT d.id_orden, d.id_rep, d.cantidad, d.subtotal, r.nom_rep, r.precio
            FROM DETALLES_REP d
            INNER JOIN REPUESTOS r ON d.id_rep = r.id_rep
            WHERE d.id_orden=%s
            """,
            (id_orden,),
        )
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return rows
    except mysql.connector.Error as e:
        raise HTTPException(500, f"DB error: {e}")

@app.get("/detalles_serv/orden/{id_orden}")
def detalles_serv_por_orden(id_orden: int):
    try:
        conn = get_conn()
        cur = conn.cursor(dictionary=True)
        cur.execute(
            """
            SELECT d.id_orden, d.id_serv, d.cantidad, d.subtotal, s.nom_serv, s.precio
            FROM DETALLES_SERV d
            INNER JOIN SERVICIOS s ON d.id_serv = s.id_serv
            WHERE d.id_orden=%s
            """,
            (id_orden,),
        )
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return rows
    except mysql.connector.Error as e:
        raise HTTPException(500, f"DB error: {e}")

@app.get("/subtotal_serv/{id_orden}/{id_serv}")
def subtotal_serv(id_orden: int, id_serv: int):
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute(
            "SELECT subtotal FROM DETALLES_SERV WHERE id_orden=%s AND id_serv=%s",
            (id_orden, id_serv),
        )
        row = cur.fetchone()
        cur.close()
        conn.close()
        if not row:
            raise HTTPException(404, "Detalle no encontrado")
        return {"subtotal": row[0]}
    except mysql.connector.Error as e:
        raise HTTPException(500, f"DB error: {e}")

@app.get("/subtotal_rep/{id_orden}/{id_rep}")
def subtotal_rep(id_orden: int, id_rep: int):
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute(
            "SELECT subtotal FROM DETALLES_REP WHERE id_orden=%s AND id_rep=%s",
            (id_orden, id_rep),
        )
        row = cur.fetchone()
        cur.close()
        conn.close()
        if not row:
            raise HTTPException(404, "Detalle no encontrado")
        return {"subtotal": row[0]}
    except mysql.connector.Error as e:
        raise HTTPException(500, f"DB error: {e}")

@app.get("/total_orden/{id_orden}")
def total_orden(id_orden: int):
    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute("SELECT COALESCE(SUM(subtotal),0) FROM DETALLES_REP WHERE id_orden=%s", (id_orden,))
        total_rep = cur.fetchone()[0] or 0

        cur.execute("SELECT COALESCE(SUM(subtotal),0) FROM DETALLES_SERV WHERE id_orden=%s", (id_orden,))
        total_serv = cur.fetchone()[0] or 0

        total = float(total_rep) + float(total_serv)
        cur.execute("UPDATE ORDEN_TRABAJO SET total=%s WHERE id_orden=%s", (total, id_orden))
        conn.commit()
        cur.close()
        conn.close()
        return {"id_orden": id_orden, "total": total}
    except mysql.connector.Error as e:
        raise HTTPException(500, f"DB error: {e}")

# ------------------------------
# LISTADOS SIMPLES
# ------------------------------
@app.get("/repuestos-disponibles")
def listar_repuestos_disponibles():
    try:
        conn = get_conn()
        cur = conn.cursor(dictionary=True)
        cur.execute("SELECT * FROM REPUESTOS WHERE estado = TRUE ORDER BY id_rep")
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return rows
    except mysql.connector.Error as e:
        raise HTTPException(500, f"DB error: {e}")

@app.get("/servicios-disponibles")
def listar_servicios_disponibles():
    try:
        conn = get_conn()
        cur = conn.cursor(dictionary=True)
        cur.execute("SELECT * FROM SERVICIOS WHERE estado = TRUE ORDER BY id_serv")
        rows = cur.fetchall()
        cur.close()
        conn.close()
        return rows
    except mysql.connector.Error as e:
        raise HTTPException(500, f"DB error: {e}")

# =======================================================
# FACTURACIÓN
# =======================================================
def _build_factura_pdf(factura: dict, detalles_serv: list, detalles_rep: list) -> io.BytesIO:
    if canvas is None:
        raise HTTPException(500, "La librería reportlab no está instalada en el servidor.")

    buffer = io.BytesIO()
    c = canvas.Canvas(buffer)

    c.setFont("Helvetica-Bold", 16)
    c.drawString(40, 800, "Turbo Cajas Taller Automotriz")
    c.setFont("Helvetica", 10)
    c.drawString(40, 785, "Turbo Cajas")
    c.drawString(40, 770, "NIT xxxxxxxxxxx")
    c.drawString(40, 755, "Calle 797a sur #95-1098 Colombia")
    c.drawString(40, 740, "Tel: 5678908554")
    c.drawString(40, 725, "Email: turbocaj@gmail.com")

    c.setFont("Helvetica-Bold", 14)
    c.drawString(400, 800, f"FACTURA #{factura['id_factura']}")
    c.setFont("Helvetica", 10)
    c.drawString(400, 785, f"FECHA: {factura['fecha']}")
    c.drawString(400, 770, f"ORDEN: {factura['id_orden']}")

    c.setFont("Helvetica-Bold", 11)
    c.drawString(40, 700, "CLIENTE:")
    c.setFont("Helvetica", 10)
    c.drawString(110, 700, factura["nom_cliente"])
    c.drawString(40, 685, "VEHÍCULO:")
    c.drawString(110, 685, f"Placa {factura['matricula']}")

    y = 650
    c.setFont("Helvetica-Bold", 10)
    c.drawString(40, y, "CONCEPTO")
    c.drawString(300, y, "CANT.")
    c.drawString(350, y, "P.UNIT")
    c.drawString(430, y, "SUBTOTAL")
    y -= 15
    c.setFont("Helvetica", 10)

    for item in detalles_rep:
        if y < 80:
            c.showPage()
            y = 800
        c.drawString(40, y, str(item["nom_rep"]))
        c.drawRightString(320, y, str(item["cantidad"]))
        c.drawRightString(410, y, f"{item['precio']:.0f}")
        c.drawRightString(500, y, f"{item['subtotal']:.0f}")
        y -= 15

    for item in detalles_serv:
        if y < 80:
            c.showPage()
            y = 800
        c.drawString(40, y, str(item["nom_serv"]))
        c.drawRightString(320, y, str(item["cantidad"]))
        c.drawRightString(410, y, f"{item['precio']:.0f}")
        c.drawRightString(500, y, f"{item['subtotal']:.0f}")
        y -= 15

    y -= 20
    c.setFont("Helvetica-Bold", 11)
    c.drawRightString(500, y, f"Descuento: {factura['descuento']} %")
    y -= 15
    c.drawRightString(500, y, f"TOTAL COP: {factura['total']:.0f}")

    c.showPage()
    c.save()
    buffer.seek(0)
    return buffer

@app.post("/facturas/desde-orden/{id_orden}")
def generar_factura_desde_orden(id_orden: int, data: dict = Body(...)):
    descuento   = float(data.get("descuento", 0))
    metodo_pago = pick(data, "metodo_pago", "Metodo_pago", default="Efectivo")
    estado_pago = to_bool_estado(data.get("estado_pago", True), True)

    try:
        conn = get_conn()
        cur = conn.cursor(dictionary=True)

        # 1. Traer la orden con sus datos
        cur.execute(
            """
            SELECT o.id_orden, o.id_cliente, o.id_vehiculo, o.total,
                   c.Nom_cliente AS nom_cliente,
                   v.matricula
            FROM ORDEN_TRABAJO o
            INNER JOIN CLIENTES c ON o.id_cliente = c.id_cliente
            INNER JOIN VEHICULOS v ON o.id_vehiculo = v.id_vehiculo
            WHERE o.id_orden=%s
            """,
            (id_orden,),
        )
        orden = cur.fetchone()
        if not orden:
            cur.close()
            conn.close()
            raise HTTPException(404, "Orden de trabajo no encontrada")

        # 2. Verificar si ya tiene factura
        cur.execute("SELECT * FROM FACTURACION WHERE id_orden=%s", (id_orden,))
        if cur.fetchone():
            cur.close()
            conn.close()
            raise HTTPException(400, "Esta orden ya tiene una factura")

        # 3. Calcular total con descuento
        total_orden = float(orden["total"] or 0)
        total_final = total_orden - (total_orden * (descuento / 100.0))

        # 4. Insertar factura + actualizar estado de la orden
        hoy = datetime.date.today()
        cur2 = conn.cursor()
        cur2.execute(
            """
            INSERT INTO FACTURACION
                (id_orden, id_cliente, id_vehiculo, fecha, Descuento, Metodo_pago, Estado_pago, Total)
            VALUES (%s, %s, %s, %s, %s, %s, %s, %s)
            """,
            (
                id_orden,
                orden["id_cliente"],
                orden["id_vehiculo"],
                hoy,
                descuento,
                metodo_pago,
                1 if estado_pago else 0,
                total_final,
            ),
        )

        # ✅ Guardar el id de la factura AHORA (después del INSERT, antes del UPDATE)
        id_factura = cur2.lastrowid

        # 🔥 marcar la orden como FACTURADA (3)
        cur2.execute(
            "UPDATE ORDEN_TRABAJO SET estado = 3 WHERE id_orden = %s",
            (id_orden,),
        )

        conn.commit()

        # 5. Volver a leer la factura con joins para devolverla al frontend
        cur.execute(
            """
            SELECT f.*, c.Nom_cliente, v.matricula
            FROM FACTURACION f
            INNER JOIN CLIENTES c ON f.id_cliente = c.id_cliente
            INNER JOIN VEHICULOS v ON f.id_vehiculo = v.id_vehiculo
            WHERE f.id_factura=%s
            """,
            (id_factura,),
        )
        row = cur.fetchone()
        cur.close()
        conn.close()

        if not row:
            raise HTTPException(500, "No se pudo recuperar la factura generada")

        return {
            "id_factura": row["id_factura"],
            "id_orden": row["id_orden"],
            "id_cliente": row["id_cliente"],
            "id_vehiculo": row["id_vehiculo"],
            "fecha": str(row["fecha"]),
            "descuento": float(row["Descuento"] or 0),
            "metodo_pago": row["Metodo_pago"],
            "estado_pago": bool(row["Estado_pago"]),
            "total": float(row["Total"] or 0),
            "nom_cliente": row["Nom_cliente"],
            "matricula": row["matricula"],
        }
    except mysql.connector.Error as e:
        raise HTTPException(500, f"DB error: {e}")

@app.get("/facturas")
def listar_facturas(
    q: Optional[str] = Query(None, description="Buscar por cliente, placa o id"),
    desde: Optional[str] = None,
    hasta: Optional[str] = None,
):
    try:
        conn = get_conn()
        cur = conn.cursor(dictionary=True)

        sql = """
            SELECT f.*, c.Nom_cliente, v.matricula
            FROM FACTURACION f
            INNER JOIN CLIENTES c ON f.id_cliente = c.id_cliente
            INNER JOIN VEHICULOS v ON f.id_vehiculo = v.id_vehiculo
            WHERE 1=1
        """
        params = []

        if q:
            sql += " AND (c.Nom_cliente LIKE %s OR v.matricula LIKE %s OR f.id_factura = %s OR f.id_orden = %s)"
            like = f"%{q}%"
            params.extend([like, like, q, q])

        if desde:
            sql += " AND f.fecha >= %s"
            params.append(desde)
        if hasta:
            sql += " AND f.fecha <= %s"
            params.append(hasta)

        sql += " ORDER BY f.fecha DESC, f.id_factura DESC"

        cur.execute(sql, tuple(params))
        rows = cur.fetchall()
        cur.close()
        conn.close()

        result = []
        for row in rows:
            result.append(
                {
                    "id_factura": row["id_factura"],
                    "id_orden": row["id_orden"],
                    "id_cliente": row["id_cliente"],
                    "id_vehiculo": row["id_vehiculo"],
                    "fecha": str(row["fecha"]),
                    "descuento": float(row["Descuento"] or 0),
                    "metodo_pago": row["Metodo_pago"],
                    "estado_pago": bool(row["Estado_pago"]),
                    "total": float(row["Total"] or 0),
                    "nom_cliente": row["Nom_cliente"],
                    "matricula": row["matricula"],
                }
            )
        return result
    except mysql.connector.Error as e:
        raise HTTPException(500, f"DB error: {e}")

@app.get("/facturas/{id_factura}/pdf")
def descargar_factura_pdf(id_factura: int):
    try:
        conn = get_conn()
        cur = conn.cursor(dictionary=True)
        cur.execute(
            """
            SELECT f.*, c.Nom_cliente, v.matricula
            FROM FACTURACION f
            INNER JOIN CLIENTES c ON f.id_cliente = c.id_cliente
            INNER JOIN VEHICULOS v ON f.id_vehiculo = v.id_vehiculo
            WHERE f.id_factura=%s
            """,
            (id_factura,),
        )
        factura = cur.fetchone()
        if not factura:
            cur.close()
            conn.close()
            raise HTTPException(404, "Factura no encontrada")

        id_orden = factura.get("id_orden")

        cur.execute(
            """
            SELECT d.*, r.nom_rep, r.precio
            FROM DETALLES_REP d
            INNER JOIN REPUESTOS r ON d.id_rep = r.id_rep
            WHERE d.id_orden=%s
            """,
            (id_orden,),
        )
        detalles_rep = cur.fetchall() or []

        cur.execute(
            """
            SELECT d.*, s.nom_serv, s.precio
            FROM DETALLES_SERV d
            INNER JOIN SERVICIOS s ON d.id_serv = s.id_serv
            WHERE d.id_orden=%s
            """,
            (id_orden,),
        )
        detalles_serv = cur.fetchall() or []

        conn.close()

        factura_dict = {
            "id_factura": factura["id_factura"],
            "id_orden": factura["id_orden"],
            "fecha": str(factura["fecha"]),
            "descuento": float(factura["Descuento"] or 0),
            "total": float(factura["Total"] or 0),
            "nom_cliente": factura["Nom_cliente"],
            "matricula": factura["matricula"],
        }

        pdf_buffer = _build_factura_pdf(factura_dict, detalles_serv, detalles_rep)
        return StreamingResponse(
            pdf_buffer,
            media_type="application/pdf",
            headers={"Content-Disposition": f'inline; filename="factura_{id_factura}.pdf"'},
        )
    except mysql.connector.Error as e:
        raise HTTPException(500, f"DB error: {e}")