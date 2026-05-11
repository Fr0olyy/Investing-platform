import { Navigate, useLocation } from "react-router-dom";
import { authStorage } from "../api/client";

export default function RequireAuth({ children }) {
  const location = useLocation();
  const token = authStorage.getToken();

  if (!token) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  return children;
}
