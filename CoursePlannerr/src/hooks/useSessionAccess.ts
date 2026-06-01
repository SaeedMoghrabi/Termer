import { useEffect, useMemo, useState } from "react";
import { detectUniversityFromEmail } from "../config/emailDomains.ts";
import { supabase } from "../supabaseClient.ts";
import { getUniversityById, type UniversityId } from "../config/universities.ts";

type SessionAccessState = {
  isAdmin: boolean;
  userId: string | null;
  userEmail: string;
};

async function resolveIsAdmin(userId: string) {
  const { data: userRecord } = await supabase
    .from("users")
    .select("is_admin")
    .eq("id", userId)
    .single();

  if (userRecord?.is_admin) {
    return true;
  }

  const { data: profileRecord } = await supabase
    .from("profiles")
    .select("is_admin")
    .eq("id", userId)
    .single();

  return Boolean(profileRecord?.is_admin);
}

function detectLockedUniversityId(userEmail: string): UniversityId | null {
  const detection = detectUniversityFromEmail(userEmail);
  if (!detection.allowed || !detection.universityId) {
    return null;
  }

  return getUniversityById(detection.universityId).id;
}

export function useSessionAccess() {
  const [state, setState] = useState<SessionAccessState>({
    isAdmin: false,
    userId: null,
    userEmail: "",
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const syncFromSession = async (sessionUser: { id: string; email?: string | null } | null | undefined) => {
      if (!active) return;

      if (!sessionUser) {
        setState({
          isAdmin: false,
          userId: null,
          userEmail: "",
        });
        setLoading(false);
        return;
      }

      const nextUserId = sessionUser.id;
      const nextUserEmail = String(sessionUser.email ?? "").trim().toLowerCase();
      const nextIsAdmin = await resolveIsAdmin(nextUserId).catch(() => false);

      if (!active) return;

      setState({
        isAdmin: nextIsAdmin,
        userId: nextUserId,
        userEmail: nextUserEmail,
      });
      setLoading(false);
    };

    supabase.auth.getUser()
      .then(({ data }) => syncFromSession(data.user))
      .catch(() => {
        if (!active) return;
        setState({
          isAdmin: false,
          userId: null,
          userEmail: "",
        });
        setLoading(false);
      });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      void syncFromSession(session?.user);
    });

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  const lockedUniversityId = useMemo(() => {
    if (state.isAdmin) {
      return null;
    }

    return detectLockedUniversityId(state.userEmail);
  }, [state.isAdmin, state.userEmail]);

  return {
    ...state,
    loading,
    canChooseAnyUniversity: state.isAdmin,
    lockedUniversityId,
  };
}
