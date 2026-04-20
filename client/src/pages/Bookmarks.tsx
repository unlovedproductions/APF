import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useState } from "react";
import { Navigate, Outlet } from "wouter";

const ProtectedRoute = () => {
  const { isAuthenticated } = useAuth();
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Simulate authentication check
    setTimeout(() => {
      setLoading(false);
    }, 1000);
  }, []);

  if (loading) return <div>Loading...</div>;

  if (!isAuthenticated) return <Navigate to="/login" />;

  return <Outlet />;
};

export default ProtectedRoute;
