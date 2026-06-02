// src/pages/Login.jsx
import React, { useState, useEffect, useMemo, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient.ts";
import { API_ROOT as API_URL, buildAppUrl } from "../config/runtime.ts";
import { detectUniversityFromEmail } from "../config/emailDomains.ts";
import { getUniversityById, UNIVERSITY_OPTIONS, type UniversityOption } from "../config/universities.ts";
import { setStoredUniversityId } from "../utils/plannerPreferences.ts";
import { primeUniversityCatalogCache } from "../utils/catalogWarmup.ts";
import {
  clearLocalAdminSession,
  hasLocalAdminSession,
} from "../utils/localAdminSession.ts";

type AuthView = "login" | "signup" | "reset";

type FieldProps = {
  label: string;
  type: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  name?: string;
};

const LOGIN_PHONE_BY_EMAIL_STORAGE_KEY = "termer:login-phone-by-email";
const CONTACT_PROFILE_TIMEOUT_MS = 1800;

const UNIVERSITY_NAME_ALIASES: Record<string, string[]> = {
  aub: ["aub", "american university of beirut", "mail.aub.edu", "aub.edu.lb"],
  lau: ["lau", "lebanese american university", "lau.edu", "lau.edu.lb"],
  usek: ["usek", "holy spirit university", "kaslik", "universite saint-esprit", "net.usek.edu.lb"],
  bau: ["bau", "beirut arab university", "student.bau.edu.lb", "bau.edu.lb"],
  ndu: ["ndu", "notre dame university", "louaize", "ndu.edu.lb"],
  aust: ["aust", "american university of science and technology", "aust.edu.lb"],
  usj: ["usj", "saint joseph", "saint-joseph", "universite saint-joseph", "net.usj.edu.lb"],
  lu: ["lu", "lebanese university", "universite libanaise", "ul.edu.lb"],
  liu: ["liu", "lebanese international university", "students.liu.edu.lb", "liu.edu.lb"],
};

const LANDING_COURSE_EXAMPLES: Record<string, [string, string, string]> = {
  aub: ["ENGL 203", "MATH 218", "ECON 211"],
  lau: ["ENG 102", "ENG 202", "LAS 204"],
  usek: ["ENG 240", "FENG 102", "STA 220"],
  bau: ["ENGL 001", "COMP 208", "CMPS 244"],
  ndu: ["ENL 213", "FQM 200", "CSC 201"],
  aust: ["ENG 201", "ENG 202", "CSI 200"],
  usj: ["Informatique 1", "Architecture des ordinateurs", "Bases de données"],
  lu: ["LS1ALGE", "LS1ANAL", "LS1ININ"],
  liu: ["CSCI 200", "CSCI 250", "EENG 250"],
  default: ["CLASS123", "CLASS231", "CLASS 321"],
};

function findUniversityFromTypedText(value: string): UniversityOption | null {
  const normalized = value.toLowerCase().trim();
  if (!normalized) return null;

  const detectedFromEmail = detectUniversityFromEmail(value);
  if (detectedFromEmail.universityId) return getUniversityById(detectedFromEmail.universityId);

  const tokens: string[] = normalized.match(/[a-z0-9]+/g) ?? [];
  const compact = normalized.replace(/[^a-z0-9]/g, "");
  return UNIVERSITY_OPTIONS.find((university) => {
    const aliases = UNIVERSITY_NAME_ALIASES[university.id] ?? [];
    return aliases.some((alias) => {
      const aliasLower = alias.toLowerCase();
      const aliasCompact = aliasLower.replace(/[^a-z0-9]/g, "");
      const isDomainAlias = aliasLower.includes(".");
      const isShortCode = aliasCompact.length <= 4 && !aliasLower.includes(" ");

      if (isDomainAlias) return normalized.includes(aliasLower);
      if (isShortCode) return tokens.includes(aliasCompact);
      return normalized.includes(aliasLower) || compact.includes(aliasCompact);
    });
  }) ?? null;
}

function buildLoginTheme(university: UniversityOption | null) {
  const brand = university?.brand;
  const primary = brand?.primary ?? "#20d6ff";
  const secondary = brand?.secondary ?? "#51f0b9";
  const tertiary = brand?.tertiary ?? "#6b9cff";

  const foreground = primary.toUpperCase() === "#FFFFFF" ? "#07111d" : primary;
  return {
    "--login-primary": primary,
    "--login-secondary": secondary,
    "--login-tertiary": tertiary,
    "--login-foreground": foreground,
    "--login-primary-soft": `${primary}38`,
    "--login-secondary-soft": `${secondary}30`,
    "--login-tertiary-soft": `${tertiary}28`,
  } as React.CSSProperties;
}

function hasWindow(): boolean {
  return typeof window !== "undefined";
}

function getRememberedPhoneByEmail(email: string): string {
  if (!hasWindow() || !email) return "";
  try {
    const raw = window.localStorage.getItem(LOGIN_PHONE_BY_EMAIL_STORAGE_KEY);
    if (!raw) return "";
    const phoneByEmail = JSON.parse(raw) as Record<string, string>;
    return typeof phoneByEmail[email] === "string" ? phoneByEmail[email] : "";
  } catch {
    return "";
  }
}

function rememberPhone(email: string, phoneNumber: string): void {
  if (!hasWindow()) return;
  const cleanedPhone = phoneNumber.trim();
  if (!cleanedPhone) return;

  if (!email) return;

  try {
    const raw = window.localStorage.getItem(LOGIN_PHONE_BY_EMAIL_STORAGE_KEY);
    const phoneByEmail = raw ? JSON.parse(raw) as Record<string, string> : {};
    phoneByEmail[email] = cleanedPhone;
    window.localStorage.setItem(LOGIN_PHONE_BY_EMAIL_STORAGE_KEY, JSON.stringify(phoneByEmail));
  } catch {
    window.localStorage.setItem(
      LOGIN_PHONE_BY_EMAIL_STORAGE_KEY,
      JSON.stringify({ [email]: cleanedPhone }),
    );
  }
}

export default function Login() {
  const navigate = useNavigate();
  const [view, setView] = useState<AuthView>("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [catalogPriming, setCatalogPriming] = useState(false);
  const lastPhoneLookupEmailRef = useRef("");
  const lastAutofilledPhoneRef = useRef("");
  const emailDetection = detectUniversityFromEmail(email);
  const typedUniversity = useMemo(() => findUniversityFromTypedText(email), [email]);
  const detectedUniversity = emailDetection.universityId
    ? getUniversityById(emailDetection.universityId)
    : typedUniversity;
  const loginTheme = useMemo(() => buildLoginTheme(detectedUniversity), [detectedUniversity]);
  const courseExamples = LANDING_COURSE_EXAMPLES[detectedUniversity?.id ?? "default"] ?? LANDING_COURSE_EXAMPLES.default;

  useEffect(() => {
    if (hasWindow()) {
      window.localStorage.removeItem("termer:login-phone");
    }

    const params = new URLSearchParams(window.location.search);
    if (params.get("confirmed") === "true") {
      setSuccess("Email confirmed! You can now sign in.");
    }
    if (hasLocalAdminSession()) {
      navigate("/admin", { replace: true });
    }
  }, []);

  useEffect(() => {
    const normalizedEmail = email.trim().toLowerCase();
    const previousLookupEmail = lastPhoneLookupEmailRef.current;
    const emailChanged = previousLookupEmail !== normalizedEmail;
    lastPhoneLookupEmailRef.current = normalizedEmail;

    if (!normalizedEmail) {
      lastAutofilledPhoneRef.current = "";
      setPhoneNumber("");
      return;
    }

    const rememberedPhone = getRememberedPhoneByEmail(normalizedEmail);
    setPhoneNumber((currentValue) => {
      if (emailChanged) {
        lastAutofilledPhoneRef.current = rememberedPhone;
        return rememberedPhone;
      }

      if (!currentValue || currentValue === lastAutofilledPhoneRef.current) {
        lastAutofilledPhoneRef.current = rememberedPhone;
        return rememberedPhone;
      }
      return currentValue;
    });
  }, [email]);

  const resetBanners = () => { setError(""); setInfo(""); setSuccess(""); setCatalogPriming(false); };
  const switchView = (v: AuthView) => {
    resetBanners();
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    lastPhoneLookupEmailRef.current = "";
    lastAutofilledPhoneRef.current = "";
    setPhoneNumber("");
    setView(v);
  };

  const saveContactProfile = async ({
    userId = "",
    userEmail,
    universityId,
  }: {
    userId?: string;
    userEmail: string;
    universityId: string;
  }) => {
    const normalizedPhone = phoneNumber.replace(/[^\d+]/g, "");
    if (!normalizedPhone) return;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), CONTACT_PROFILE_TIMEOUT_MS);
    try {
      const response = await fetch(`${API_URL}/api/account/contact-profile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          userId,
          email: userEmail,
          universityId,
          phoneNumber: normalizedPhone,
        }),
      });
      if (!response.ok) {
        throw new Error("Contact profile save failed.");
      }
    } catch {
      // Keep auth resilient even if contact profile storage misses.
    } finally {
      window.clearTimeout(timeoutId);
    }
  };

  const syncUserProfile = async (userId: string, userEmail: string) => {
    const detection = detectUniversityFromEmail(userEmail);
    if (!detection.allowed || !detection.universityId) return;

    setStoredUniversityId(detection.universityId);

    const fullProfile = {
      id: userId,
      email: userEmail,
      university_id: detection.universityId,
      email_domain: detection.domain,
      needs_manual_review: detection.needsManualReview,
      updated_at: new Date().toISOString(),
    };
    const minimalProfile = { id: userId, email: userEmail };

    const { error: userError } = await supabase.from("users").upsert(fullProfile);
    if (userError) await supabase.from("users").upsert(minimalProfile);

    const { error: profileError } = await supabase.from("profiles").upsert(fullProfile);
    if (profileError) await supabase.from("profiles").upsert({ id: userId });
  };

  const ensureSupportedEmail = (norm: string) => {
    const detection = detectUniversityFromEmail(norm);
    if (!detection.allowed) {
      setError(detection.message);
      return null;
    }
    return detection;
  };

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); resetBanners();
    if (!email || !password) { setError("Please fill in all fields."); return; }
    const norm = email.trim().toLowerCase();
    if (!phoneNumber.trim()) { setError("Please enter a phone number to complete your account."); return; }
    rememberPhone(norm, phoneNumber);
    const detection = ensureSupportedEmail(norm);
    if (!detection) return;
    setLoading(true);
    void saveContactProfile({
      userEmail: norm,
      universityId: detection.universityId,
    });
    clearLocalAdminSession();
    const { data, error: err } = await supabase.auth.signInWithPassword({ email: norm, password });
    if (err) {
      setLoading(false);
      if (err.message?.toLowerCase().includes("email not confirmed"))
        setInfo("Please verify your email first. Check your inbox, then come back to sign in.");
      else setError(err.message || "Sign-in failed. Check your credentials.");
      return;
    }
    if (!data?.user) {
      setLoading(false);
      setError("Authentication failed.");
      return;
    }
    void syncUserProfile(data.user.id, data.user.email ?? norm);
    void saveContactProfile({
      userId: data.user.id,
      userEmail: data.user.email ?? norm,
      universityId: detection.universityId,
    });
    setCatalogPriming(true);
    setInfo("Preparing your university catalog…");
    setLoading(false);
    navigate("/");
    void primeUniversityCatalogCache(detection.universityId, { warmAllTerms: false })
      .catch(() => {
        // Keep sign-in resilient even if catalog warmup misses.
      })
      .finally(() => {
        setCatalogPriming(false);
      });
  };

  const handleSignUp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); resetBanners();
    if (!email || !password || !confirmPassword) { setError("Please fill in all fields."); return; }
    const norm = email.trim().toLowerCase();
    const detection = ensureSupportedEmail(norm);
    if (!detection) return;
    if (!phoneNumber.trim()) { setError("Please enter a phone number to complete your account."); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirmPassword) { setError("Passwords do not match."); return; }
    rememberPhone(norm, phoneNumber);
    setLoading(true);
    void saveContactProfile({
      userEmail: norm,
      universityId: detection.universityId,
    });
    const { data: existingUser } = await supabase.from("users").select("id").eq("email", norm).maybeSingle();
    if (existingUser) {
      setLoading(false);
      setError("An account with this email already exists. Please sign in instead.");
      return;
    }
    const { data, error: err } = await supabase.auth.signUp({
      email: norm,
      password,
      options: {
        emailRedirectTo: buildAppUrl("/login?confirmed=true"),
      },
    });
    setLoading(false);
    if (err) { setError(err.message || "Sign-up failed."); return; }
    if (data?.user?.id) {
      void saveContactProfile({
        userId: data.user.id,
        userEmail: data.user.email ?? norm,
        universityId: detection.universityId,
      });
    }
    setSuccess(`Verification email sent to ${norm}. Click the link in your inbox, then come back to sign in.`);
  };

  const handleReset = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); resetBanners();
    if (!email) { setError("Please enter your email."); return; }
    const norm = email.trim().toLowerCase();
    const detection = ensureSupportedEmail(norm);
    if (!detection) return;
    setLoading(true);
    const { error: err } = await supabase.auth.resetPasswordForEmail(norm, {
      redirectTo: buildAppUrl("/update-password"),
    });
    setLoading(false);
    if (err) { setError(err.message || "Could not send reset email."); return; }
    setSuccess(`Reset link sent to ${norm}. Check your inbox.`);
  };

  return (
    <>
      <style>{css}</style>
      <link
        href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&family=Space+Grotesk:wght@500;600;700&display=swap"
        rel="stylesheet"
      />
      <div className="uf-page" style={loginTheme}>
        <div className="uf-orb uf-orb--one" />
        <div className="uf-orb uf-orb--two" />
        <div className="uf-orb uf-orb--three" />
        <div className="uf-particle uf-particle--one" />
        <div className="uf-particle uf-particle--two" />
        <div className="uf-particle uf-particle--three" />
        <div className="uf-shell">
          <section className="uf-showcase" aria-label="Planner preview">
            <div className="uf-showcase__badge">Live Lebanese university scheduler</div>
            <h1>Build the semester before it builds you.</h1>
            <p>
              Sign in with your university email, land inside your own campus,
              and keep schedules, reviews, saved courses, and planner settings synced.
            </p>
            <div className="uf-visual">
              <div className="uf-visual__top">
                <span>Spring 2026</span>
                <strong>3 schedules</strong>
              </div>
              <div className="uf-grid-preview" aria-hidden="true">
                <span className="uf-grid-preview__line" />
                <span className="uf-grid-preview__line" />
                <span className="uf-grid-preview__line" />
                <span className="uf-class-pill uf-class-pill--one">{courseExamples[0]}</span>
                <span className="uf-class-pill uf-class-pill--two">{courseExamples[1]}</span>
                <span className="uf-class-pill uf-class-pill--three">{courseExamples[2]}</span>
              </div>
              <div className="uf-metrics">
                <span><strong>0</strong> conflicts</span>
                <span><strong>92</strong> health</span>
                <span><strong>AI</strong> assist</span>
              </div>
            </div>
          </section>
          <section className="uf-card" aria-label="Account access">
            <div className="uf-card-glow" />

          <div className="uf-logo">
            <div className="uf-logo-mark">
              <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                <path d="M4.3 9.1h9.4M9.1 4.3l4.6 4.8-4.6 4.6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M3.7 3.8h5.1M3.7 14.2h5.1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity=".55"/>
              </svg>
            </div>
            <div>
              <span className="uf-logo-name">Termer</span>
              <span className="uf-logo-sub">Temporary name</span>
            </div>
          </div>

          <div className="uf-card-copy">
            <span>Student access</span>
            <h2>{view === "reset" ? "Reset your key." : "Enter your campus cockpit."}</h2>
          </div>

          {view !== "reset" && (
            <div className="uf-tabs">
              <button className={"uf-tab" + (view === "login" ? " active" : "")} onClick={() => switchView("login")}>Sign in</button>
              <button className={"uf-tab" + (view === "signup" ? " active" : "")} onClick={() => switchView("signup")}>Sign up</button>
            </div>
          )}

          {error   && <div className="uf-banner uf-banner--error">{error}</div>}
          {info    && <div className="uf-banner uf-banner--info">{info}</div>}
          {success && <div className="uf-banner uf-banner--success">{success}</div>}
          {catalogPriming && <div className="uf-banner uf-banner--info">Preparing your university catalog…</div>}
          {email && detectedUniversity && (
            <div className="uf-detection">
              <span className="uf-detection__badge">{detectedUniversity.shortName}</span>
              <span>
                {emailDetection.allowed
                  ? emailDetection.message
                  : `Previewing ${detectedUniversity.shortName} colors while you type.`}
              </span>
            </div>
          )}

          {view === "login" && (
            <form onSubmit={handleLogin} className="uf-form">
              <Field label="University email" type="text" name="email" autoComplete="username" placeholder="name@mail.aub.edu" value={email} onChange={setEmail} />
              <Field label="Password" type="password" name="password" autoComplete="current-password" placeholder="Enter password" value={password} onChange={setPassword} />
              <Field label="Phone number" type="tel" name="tel" autoComplete="tel" placeholder="+961 03 123 456" value={phoneNumber} onChange={setPhoneNumber} />
              <button type="submit" disabled={loading} className="uf-btn">{loading ? "Signing in…" : "Sign in"}</button>
              <button type="button" className="uf-ghost" onClick={() => switchView("reset")}>Forgot password?</button>
            </form>
          )}

          {view === "signup" && (
            <form onSubmit={handleSignUp} className="uf-form">
              <Field label="University email" type="email" name="email" autoComplete="username" placeholder="name@mail.aub.edu" value={email} onChange={setEmail} />
              <Field label="Password" type="password" name="password" autoComplete="new-password" placeholder="At least 8 characters" value={password} onChange={setPassword} />
              <Field label="Confirm password" type="password" name="confirmPassword" autoComplete="new-password" placeholder="Re-enter password" value={confirmPassword} onChange={setConfirmPassword} />
              <Field label="Phone number" type="tel" name="tel" autoComplete="tel" placeholder="+961 03 123 456" value={phoneNumber} onChange={setPhoneNumber} />
              <p className="uf-reset-hint" style={{ marginTop: -2 }}>
                This is not used for login. We use it for account support and important updates.
              </p>
              <button type="submit" disabled={loading} className="uf-btn">{loading ? "Creating account…" : "Create account"}</button>
            </form>
          )}

          {view === "reset" && (
            <form onSubmit={handleReset} className="uf-form">
              <p className="uf-reset-hint">Enter your email and we'll send you a reset link.</p>
              <Field label="University email" type="email" name="email" autoComplete="username" placeholder="name@mail.aub.edu" value={email} onChange={setEmail} />
              <button type="submit" disabled={loading} className="uf-btn">{loading ? "Sending…" : "Send reset link"}</button>
              <button type="button" className="uf-ghost" onClick={() => switchView("login")}>Back to sign in</button>
            </form>
          )}

          <div className="uf-footer">© 2026 Termer · Lebanese Universities</div>
          </section>
        </div>
      </div>
    </>
  );
}

function Field({ label, type, placeholder, value, onChange, autoComplete, name }: FieldProps) {
  return (
    <div className="uf-field">
      <label className="uf-label">{label}</label>
      <input
        type={type}
        name={name}
        autoComplete={autoComplete}
        placeholder={placeholder}
        value={value}
        onChange={(e: React.ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
        className="uf-input"
      />
    </div>
  );
}

const css = `
  @property --login-primary {
    syntax: '<color>';
    inherits: true;
    initial-value: #20d6ff;
  }

  @property --login-secondary {
    syntax: '<color>';
    inherits: true;
    initial-value: #51f0b9;
  }

  @property --login-tertiary {
    syntax: '<color>';
    inherits: true;
    initial-value: #6b9cff;
  }

  @property --login-foreground {
    syntax: '<color>';
    inherits: true;
    initial-value: #20d6ff;
  }

  @property --login-primary-soft {
    syntax: '<color>';
    inherits: true;
    initial-value: rgba(32, 214, 255, .22);
  }

  @property --login-secondary-soft {
    syntax: '<color>';
    inherits: true;
    initial-value: rgba(81, 240, 185, .18);
  }

  @property --login-tertiary-soft {
    syntax: '<color>';
    inherits: true;
    initial-value: rgba(107, 156, 255, .16);
  }

  .uf-page {
    min-height: 100vh;
    position: relative;
    overflow: hidden;
    display: grid;
    place-items: center;
    padding: 44px 20px;
    background:
      radial-gradient(circle at 15% 15%, var(--login-primary-soft), transparent 30%),
      radial-gradient(circle at 84% 12%, var(--login-secondary-soft), transparent 32%),
      linear-gradient(135deg, #050914 0%, #09111f 48%, #03060c 100%);
    color: #edf7ff;
    font-family: 'Manrope', sans-serif;
    transition:
      --login-primary 900ms cubic-bezier(.2,.8,.2,1),
      --login-secondary 900ms cubic-bezier(.2,.8,.2,1),
      --login-tertiary 900ms cubic-bezier(.2,.8,.2,1),
      --login-foreground 900ms cubic-bezier(.2,.8,.2,1),
      --login-primary-soft 900ms cubic-bezier(.2,.8,.2,1),
      --login-secondary-soft 900ms cubic-bezier(.2,.8,.2,1),
      --login-tertiary-soft 900ms cubic-bezier(.2,.8,.2,1);
  }

  .uf-page::before {
    content: "";
    position: absolute;
    inset: 0;
    opacity: 0.22;
    background-image:
      linear-gradient(rgba(255,255,255,.07) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,.07) 1px, transparent 1px);
    background-size: 54px 54px;
    mask-image: radial-gradient(circle at center, black, transparent 78%);
    animation: ufGridDrift 5.5s linear infinite;
  }

  .uf-page::after {
    content: "";
    position: absolute;
    left: 50%;
    top: 50%;
    width: 180vmax;
    height: 180vmax;
    border-radius: 999px;
    transform: translate(-50%, -50%);
    background:
      conic-gradient(
        from 90deg,
        transparent 0deg,
        var(--login-primary-soft) 72deg,
        transparent 148deg,
        var(--login-secondary-soft) 220deg,
        transparent 292deg,
        var(--login-tertiary-soft) 338deg,
        transparent 360deg
      );
    opacity: .28;
    filter: blur(86px);
    mask-image: radial-gradient(circle at center, black 0%, rgba(0, 0, 0, .92) 48%, transparent 74%);
    -webkit-mask-image: radial-gradient(circle at center, black 0%, rgba(0, 0, 0, .92) 48%, transparent 74%);
    transform-origin: center;
    pointer-events: none;
    animation: ufSpin 18s linear infinite;
  }

  .uf-orb {
    position: absolute;
    width: 260px;
    height: 260px;
    border-radius: 999px;
    filter: blur(28px);
    opacity: .5;
    animation: ufFloat 4.8s ease-in-out infinite;
  }

  .uf-orb--one { left: 7%; bottom: 10%; background: var(--login-primary); }
  .uf-orb--two { right: 8%; top: 9%; background: var(--login-secondary); animation-delay: -1.7s; }
  .uf-orb--three {
    width: 180px;
    height: 180px;
    left: 48%;
    top: 6%;
    background: var(--login-tertiary);
    opacity: .34;
    animation: ufFloatAlt 3.9s ease-in-out infinite;
  }

  .uf-particle {
    position: absolute;
    z-index: 0;
    width: 9px;
    height: 9px;
    border-radius: 999px;
    background: var(--login-secondary);
    box-shadow: 0 0 24px var(--login-secondary);
    opacity: .62;
    animation: ufParticleRun 6s linear infinite;
  }

  .uf-particle--one { left: 13%; top: 26%; }
  .uf-particle--two { left: 58%; top: 78%; animation-delay: -2s; background: var(--login-primary); }
  .uf-particle--three { left: 82%; top: 38%; animation-delay: -4s; background: var(--login-tertiary); }

  .uf-shell {
    position: relative;
    z-index: 1;
    width: min(1080px, 100%);
    display: grid;
    grid-template-columns: minmax(0, 1.05fr) minmax(360px, .78fr);
    gap: 22px;
    align-items: stretch;
  }

  .uf-showcase,
  .uf-card {
    position: relative;
    overflow: hidden;
    border: 1px solid rgba(255,255,255,.12);
    border-radius: 34px;
    background: linear-gradient(145deg, rgba(255,255,255,.12), rgba(255,255,255,.045));
    box-shadow: 0 30px 90px rgba(0,0,0,.42);
    backdrop-filter: blur(22px);
    transition: border-color .9s cubic-bezier(.2,.8,.2,1), box-shadow .9s cubic-bezier(.2,.8,.2,1);
  }

  .uf-showcase {
    border-color: var(--login-primary-soft);
    box-shadow: 0 30px 90px rgba(0,0,0,.42), 0 0 70px var(--login-primary-soft);
  }

  .uf-card {
    border-color: var(--login-secondary-soft);
    box-shadow: 0 30px 90px rgba(0,0,0,.42), 0 0 78px var(--login-secondary-soft);
  }

  .uf-showcase {
    min-height: 620px;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 42px;
  }

  .uf-showcase__badge {
    width: fit-content;
    padding: 9px 13px;
    border: 1px solid var(--login-primary-soft);
    border-radius: 999px;
    background: var(--login-primary-soft);
    color: var(--login-foreground);
    font-size: 12px;
    font-weight: 800;
    letter-spacing: .1em;
    text-transform: uppercase;
  }

  .uf-showcase h1 {
    max-width: 620px;
    margin: 34px 0 16px;
    font-family: 'Space Grotesk', sans-serif;
    font-size: clamp(42px, 6vw, 76px);
    line-height: .92;
    letter-spacing: -.07em;
  }

  .uf-showcase p {
    max-width: 560px;
    margin: 0;
    color: rgba(237,247,255,.68);
    font-size: 16px;
    line-height: 1.8;
  }

  .uf-visual {
    margin-top: 40px;
    border: 1px solid var(--login-primary-soft);
    border-radius: 28px;
    background:
      radial-gradient(circle at 20% 10%, var(--login-primary-soft), transparent 38%),
      radial-gradient(circle at 80% 90%, var(--login-secondary-soft), transparent 42%),
      rgba(3, 8, 18, .58);
    padding: 18px;
  }

  .uf-visual__top,
  .uf-metrics {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    color: rgba(237,247,255,.64);
    font-size: 12px;
    font-weight: 800;
  }

  .uf-visual__top strong { color: var(--login-foreground); }

  .uf-grid-preview {
    position: relative;
    height: 250px;
    margin: 16px 0;
    overflow: hidden;
    border-radius: 22px;
    background:
      linear-gradient(90deg, transparent 24%, var(--login-primary-soft) 24.5%, transparent 25%),
      linear-gradient(180deg, var(--login-tertiary-soft) 1px, transparent 1px),
      linear-gradient(135deg, var(--login-primary-soft), rgba(255,255,255,.035));
    background-size: 25% 100%, 100% 50px, 100% 100%;
    animation: ufPreviewPan 4.2s linear infinite;
  }

  .uf-grid-preview::after {
    content: "";
    position: absolute;
    inset: 0;
    background: linear-gradient(105deg, transparent 0%, var(--login-primary-soft) 42%, transparent 58%);
    transform: translateX(-120%);
    animation: ufScan 2.8s ease-in-out infinite;
  }

  .uf-grid-preview__line {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 1px;
    background: rgba(255,255,255,.08);
  }

  .uf-grid-preview__line:nth-child(1) { left: 25%; }
  .uf-grid-preview__line:nth-child(2) { left: 50%; }
  .uf-grid-preview__line:nth-child(3) { left: 75%; }

  .uf-class-pill {
    position: absolute;
    min-width: 118px;
    padding: 14px 16px;
    border-radius: 18px;
    background: linear-gradient(135deg, var(--login-primary), var(--login-secondary));
    color: #02101c;
    font-size: 12px;
    font-weight: 900;
    box-shadow: 0 18px 38px var(--login-primary-soft);
    animation: ufPulse 2.05s ease-in-out infinite;
    transition:
      background 900ms cubic-bezier(.2,.8,.2,1),
      color 900ms cubic-bezier(.2,.8,.2,1),
      box-shadow 900ms cubic-bezier(.2,.8,.2,1),
      min-width 420ms ease;
  }

  .uf-class-pill--one { left: 7%; top: 28px; }
  .uf-class-pill--two { left: 42%; top: 94px; animation-delay: -.9s; }
  .uf-class-pill--three { right: 7%; top: 155px; animation-delay: -1.8s; }

  .uf-metrics span {
    flex: 1;
    padding: 12px;
    border-radius: 16px;
    background:
      linear-gradient(135deg, var(--login-primary-soft), var(--login-secondary-soft)),
      rgba(255,255,255,.055);
    text-align: center;
  }

  .uf-metrics strong { display: block; color: #ffffff; font-size: 18px; }

  .uf-card {
    min-height: 620px;
    padding: 34px;
  }

  .uf-card-glow {
    position: absolute;
    inset: -1px;
    background:
      radial-gradient(circle at 50% 0%, var(--login-primary-soft), transparent 38%),
      radial-gradient(circle at 15% 80%, var(--login-secondary-soft), transparent 44%);
    pointer-events: none;
  }

  .uf-logo {
    position: relative;
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 28px;
  }

  .uf-logo-mark {
    width: 42px;
    height: 42px;
    display: grid;
    place-items: center;
    border-radius: 16px;
    color: #08111e;
    background: linear-gradient(135deg, var(--login-secondary), var(--login-primary));
    box-shadow: 0 14px 34px var(--login-secondary-soft);
  }

  .uf-logo-name,
  .uf-logo-sub { display: block; }

  .uf-logo-name {
    color: #fff;
    font-family: 'Space Grotesk', sans-serif;
    font-size: 20px;
    font-weight: 700;
  }

  .uf-logo-sub {
    margin-top: 2px;
    color: rgba(237,247,255,.45);
    font-size: 11px;
    font-weight: 800;
    letter-spacing: .12em;
    text-transform: uppercase;
  }

  .uf-card-copy {
    position: relative;
    margin-bottom: 22px;
  }

  .uf-card-copy span {
    color: var(--login-foreground);
    font-size: 11px;
    font-weight: 900;
    letter-spacing: .14em;
    text-transform: uppercase;
  }

  .uf-card-copy h2 {
    margin: 7px 0 0;
    color: #fff;
    font-family: 'Space Grotesk', sans-serif;
    font-size: 30px;
    line-height: 1.05;
    letter-spacing: -.04em;
  }

  .uf-tabs {
    position: relative;
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
    padding: 6px;
    margin-bottom: 18px;
    border: 1px solid rgba(255,255,255,.09);
    border-radius: 18px;
    background:
      linear-gradient(135deg, var(--login-primary-soft), transparent 58%),
      rgba(2,8,18,.42);
  }

  .uf-tab {
    min-height: 42px;
    border: 0;
    border-radius: 13px;
    background: transparent;
    color: rgba(237,247,255,.54);
    font: 800 13px 'Manrope', sans-serif;
    cursor: pointer;
    transition: transform .18s, background .18s, color .18s;
  }

  .uf-tab:hover { color: #fff; transform: translateY(-1px); }
  .uf-tab.active { color: #07111d; background: linear-gradient(135deg, var(--login-secondary), var(--login-primary)); }

  .uf-form {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .uf-field { display: flex; flex-direction: column; gap: 8px; }
  .uf-label {
    color: rgba(237,247,255,.58);
    font-size: 11px;
    font-weight: 900;
    letter-spacing: .1em;
    text-transform: uppercase;
  }

  .uf-input {
    min-height: 54px;
    padding: 0 16px;
    border: 1px solid rgba(255,255,255,.1);
    border-radius: 17px;
    background:
      linear-gradient(135deg, var(--login-primary-soft), transparent 64%),
      rgba(4, 10, 22, .64);
    color: #fff;
    font: 700 14px 'Manrope', sans-serif;
    outline: none;
    transition: border-color .18s, box-shadow .18s, background .18s;
  }

  .uf-input::placeholder { color: rgba(237,247,255,.28); }
  .uf-input:hover { border-color: var(--login-secondary-soft); }
  .uf-input:focus {
    border-color: var(--login-secondary);
    background:
      linear-gradient(135deg, var(--login-secondary-soft), transparent 64%),
      rgba(4, 10, 22, .82);
    box-shadow: 0 0 0 4px var(--login-secondary-soft);
  }

  .uf-btn {
    min-height: 54px;
    margin-top: 6px;
    border: 0;
    border-radius: 18px;
    background: linear-gradient(135deg, var(--login-secondary), var(--login-primary) 58%, var(--login-tertiary));
    color: #06111e;
    font: 900 14px 'Manrope', sans-serif;
    cursor: pointer;
    box-shadow: 0 18px 42px var(--login-primary-soft);
    transition: transform .18s, filter .18s, box-shadow .18s;
  }

  .uf-btn:hover:not(:disabled) {
    transform: translateY(-2px);
    filter: saturate(1.15);
    box-shadow: 0 22px 54px var(--login-secondary-soft);
  }

  .uf-btn:disabled { opacity: .58; cursor: not-allowed; }

  .uf-ghost {
    border: 0;
    background: transparent;
    color: rgba(237,247,255,.56);
    font: 800 13px 'Manrope', sans-serif;
    cursor: pointer;
    transition: color .18s;
  }

  .uf-ghost:hover { color: var(--login-foreground); }

  .uf-reset-hint {
    margin: 0 0 4px;
    color: rgba(237,247,255,.62);
    font-size: 13px;
    line-height: 1.65;
  }

  .uf-banner,
  .uf-detection {
    position: relative;
    padding: 12px 14px;
    border-radius: 16px;
    margin-bottom: 12px;
    font-size: 12px;
    line-height: 1.5;
  }

  .uf-banner--error { background: rgba(255, 96, 96, .11); border: 1px solid rgba(255, 96, 96, .26); color: #ffb5b5; }
  .uf-banner--info { background: rgba(58, 179, 255, .11); border: 1px solid rgba(58, 179, 255, .25); color: #d9efff; }
  .uf-banner--success { background: var(--login-secondary-soft); border: 1px solid var(--login-secondary-soft); color: #edf7ff; }

  .uf-detection {
    display: flex;
    align-items: center;
    gap: 10px;
    background: var(--login-secondary-soft);
    border: 1px solid var(--login-secondary-soft);
    color: #edf7ff;
  }

  .uf-detection__badge {
    min-width: 44px;
    padding: 6px 9px;
    border-radius: 999px;
    background: var(--login-primary-soft);
    color: #edf7ff;
    text-align: center;
    font-size: 11px;
    font-weight: 900;
    letter-spacing: .08em;
  }

  .uf-footer {
    position: relative;
    margin-top: 24px;
    padding-top: 18px;
    border-top: 1px solid rgba(255,255,255,.08);
    color: rgba(237,247,255,.35);
    text-align: center;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: .08em;
    text-transform: uppercase;
  }

  @keyframes ufFloat {
    0%, 100% { transform: translate3d(0,0,0) scale(1); }
    25% { transform: translate3d(46px,-30px,0) scale(1.1); }
    50% { transform: translate3d(18px,-58px,0) scale(1.16); }
    75% { transform: translate3d(-34px,-20px,0) scale(.96); }
  }

  @keyframes ufFloatAlt {
    0%, 100% { transform: translate3d(0,0,0) scale(1); }
    35% { transform: translate3d(-42px,34px,0) scale(1.18); }
    70% { transform: translate3d(52px,24px,0) scale(.92); }
  }

  @keyframes ufPulse {
    0%, 100% { transform: translate3d(0,0,0); }
    50% { transform: translate3d(10px,-12px,0); }
  }

  @keyframes ufGridDrift {
    from { background-position: 0 0, 0 0; }
    to { background-position: 54px 54px, 54px 54px; }
  }

  @keyframes ufSpin {
    to { transform: rotate(360deg); }
  }

  @keyframes ufPreviewPan {
    from { background-position: 0 0, 0 0, 0 0; }
    to { background-position: 25% 0, 0 50px, 0 0; }
  }

  @keyframes ufScan {
    0%, 18% { transform: translateX(-120%); opacity: 0; }
    35% { opacity: 1; }
    75%, 100% { transform: translateX(120%); opacity: 0; }
  }

  @keyframes ufParticleRun {
    0% { transform: translate3d(-8vw, 8vh, 0) scale(.7); opacity: 0; }
    12% { opacity: .75; }
    55% { transform: translate3d(12vw, -16vh, 0) scale(1.25); opacity: .85; }
    100% { transform: translate3d(28vw, -34vh, 0) scale(.55); opacity: 0; }
  }

  @media (max-width: 860px) {
    .uf-shell { grid-template-columns: 1fr; }
    .uf-showcase { min-height: auto; padding: 28px; }
    .uf-card { min-height: auto; padding: 28px; }
  }

  @media (max-width: 560px) {
    .uf-page { padding: 20px 12px; }
    .uf-showcase { display: none; }
    .uf-card { border-radius: 26px; padding: 24px; }
  }
`;
