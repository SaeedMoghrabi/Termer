import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient.ts";
import { hasLocalAdminSession } from "../utils/localAdminSession.ts";

export default function AdminRoute({
  children,
}: {
  children: React.ReactNode;
}) {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    if (hasLocalAdminSession()) {
      setAllowed(true);
      setChecking(false);
      return;
    }
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) {
        navigate("/login");
        return;
      }
      const { data: userRecord } = await supabase
        .from("users")
        .select("is_admin")
        .eq("id", data.user.id)
        .single();
      if (userRecord?.is_admin) {
        setAllowed(true);
        setChecking(false);
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("is_admin")
        .eq("id", data.user.id)
        .single();
      if (profile?.is_admin) {
        setAllowed(true);
      } else {
        navigate("/");
      }
      setChecking(false);
    });
  }, []);

  if (checking) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "var(--bg)",
          color: "var(--muted)",
          fontSize: 14,
        }}
      >
        Checking access…
      </div>
    );
  }

  return allowed ? <>{children}</> : null;
}
