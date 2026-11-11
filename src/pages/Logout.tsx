// src/pages/Logout.jsx
import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function Logout() {
    const navigate = useNavigate();
    useEffect(() => {
        // Redirige
        navigate("/salir", { replace: true });
    }, [navigate]);

    return null;
}
