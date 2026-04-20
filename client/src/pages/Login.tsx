import { useAuth } from "@/contexts/AuthContext";
import { useEffect } from "react";

const LoginPage = () => {
  const { login } = useAuth();

  useEffect(() => {
    login();
  }, [login]);

  return <div>Logging in...</div>;
};

export default LoginPage;
