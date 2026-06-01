import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient.ts";
import { Navigate } from "react-router-dom";

export default function ProtectedRoute({ children }: any) {
  const [loading, setLoading] = useState(true);
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      // If this is an email confirmation or password recovery redirect, block access
      const hash = window.location.hash;
      if (hash.includes("type=signup") || hash.includes("type=recovery")) {
        await supabase.auth.signOut();
        setAuthenticated(false);
        setLoading(false);
        return;
      }

      const { data } = await supabase.auth.getSession();
      setAuthenticated(!!data.session);
      setLoading(false);
    };

    checkAuth();
  }, []);

  if (loading) return <div>Loading...</div>;

  if (!authenticated) return <Navigate to="/login" />;

  return children;
}
