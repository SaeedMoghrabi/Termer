// src/pages/UpdatePassword.jsx
import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../supabaseClient.ts";

export default function UpdatePassword() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const hash = window.location.hash.replace("#", "");
    const params = new URLSearchParams(hash);

    // If Supabase returned an error in the URL (e.g. expired link)
    if (params.get("error")) {
      const desc = params.get("error_description") || "Invalid or expired reset link.";
      setError(desc.replace(/\+/g, " "));
      return;
    }

    // If valid tokens are in the URL, set the session
    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    if (accessToken && refreshToken) {
      supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken })
        .then(({ error: err }) => {
          if (!err) setReady(true);
          else setError("Could not verify reset link. Please request a new one.");
        });
      return;
    }

    // Fallback: check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true);
      else setError("Invalid or expired reset link. Please request a new one.");
    });
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    if (!password || !confirmPassword) { setError("Please fill in both fields."); return; }
    if (password.length < 8) { setError("Password must be at least 8 characters."); return; }
    if (password !== confirmPassword) { setError("Passwords do not match."); return; }
    setLoading(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (err) { setError(err.message || "Failed to update password."); return; }
    setSuccess("Password updated! Redirecting to sign in…");
    setTimeout(() => navigate("/login"), 2500);
  };

  return (
    <>
      <style>{css}</style>
      <link
        href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600&display=swap"
        rel="stylesheet"
      />
      <div className="uf-page">
        <div className="uf-card">

          <div className="uf-logo">
            <div className="uf-logo-mark">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M3 8h10M8 3l5 5-5 5" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <span className="uf-logo-name">Termer</span>
          </div>

          <h2 className="uf-heading">Set new password</h2>
          <p className="uf-hint">Choose a strong password for your account.</p>

          {!ready && !error && !success && (
            <div className="uf-banner uf-banner--info">Verifying your reset link…</div>
          )}

          {error && (
            <>
              <div className="uf-banner uf-banner--error">{error}</div>
              <button className="uf-ghost" onClick={() => navigate("/login")}>
                Back to sign in
              </button>
            </>
          )}

          {success && <div className="uf-banner uf-banner--success">{success}</div>}

          {ready && !success && (
            <form onSubmit={handleSubmit} className="uf-form">
              <div className="uf-field">
                <label className="uf-label">New password</label>
                <input
                  type="password"
                  placeholder="At least 8 characters"
                  value={password}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setPassword(e.target.value)}
                  className="uf-input"
                />
              </div>
              <div className="uf-field">
                <label className="uf-label">Confirm new password</label>
                <input
                  type="password"
                  placeholder="Re-enter new password"
                  value={confirmPassword}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => setConfirmPassword(e.target.value)}
                  className="uf-input"
                />
              </div>
              <button type="submit" disabled={loading} className="uf-btn">
                {loading ? "Updating…" : "Update password"}
              </button>
            </form>
          )}

          <div className="uf-footer">© 2026 Termer · Lebanese Universities</div>
        </div>
      </div>
    </>
  );
}

const css = `
  .uf-page {
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #f5f5f4;
    padding: 40px 20px;
    font-family: 'Plus Jakarta Sans', sans-serif;
  }
  .uf-card {
    background: #ffffff;
    border: 1px solid #e5e7eb;
    border-radius: 16px;
    padding: 40px 36px;
    width: 100%;
    max-width: 400px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 4px 16px rgba(0,0,0,0.04);
  }
  .uf-logo { display: flex; align-items: center; gap: 10px; margin-bottom: 28px; }
  .uf-logo-mark {
    width: 32px; height: 32px; border-radius: 8px; background: #2563eb;
    display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  }
  .uf-logo-name { font-size: 17px; font-weight: 600; color: #111827; }
  .uf-heading { font-size: 18px; font-weight: 600; color: #111827; margin-bottom: 6px; }
  .uf-hint { font-size: 13px; color: #6b7280; margin-bottom: 24px; line-height: 1.6; }
  .uf-form { display: flex; flex-direction: column; gap: 16px; }
  .uf-field { display: flex; flex-direction: column; gap: 6px; }
  .uf-label { font-size: 12px; font-weight: 500; color: #6b7280; }
  .uf-input {
    padding: 10px 13px; background: #f9fafb;
    border: 1px solid #e5e7eb; border-radius: 8px;
    font-family: 'Plus Jakarta Sans', sans-serif;
    font-size: 14px; color: #111827; outline: none;
    transition: border-color .2s, box-shadow .2s;
  }
  .uf-input::placeholder { color: #d1d5db; }
  .uf-input:hover { border-color: #d1d5db; }
  .uf-input:focus { border-color: #2563eb; background: #fff; box-shadow: 0 0 0 3px rgba(37,99,235,0.1); }
  .uf-btn {
    width: 100%; padding: 11px; background: #2563eb; border: none; border-radius: 8px;
    color: #fff; font-family: 'Plus Jakarta Sans', sans-serif;
    font-size: 14px; font-weight: 600; cursor: pointer;
    transition: background .15s, transform .15s; margin-top: 2px;
  }
  .uf-btn:hover:not(:disabled) { background: #1d4ed8; transform: translateY(-1px); }
  .uf-btn:active:not(:disabled) { transform: translateY(0); }
  .uf-btn:disabled { opacity: 0.55; cursor: not-allowed; }
  .uf-ghost {
    background: none; border: none; width: 100%; text-align: center;
    font-family: 'Plus Jakarta Sans', sans-serif; font-size: 13px; color: #9ca3af;
    cursor: pointer; transition: color .15s; margin-top: 12px; display: block;
  }
  .uf-ghost:hover { color: #2563eb; }
  .uf-banner { padding: 11px 14px; border-radius: 8px; font-size: 13px; line-height: 1.5; margin-bottom: 16px; }
  .uf-banner--error   { background: #fef2f2; border: 1px solid #fecaca; color: #dc2626; }
  .uf-banner--info    { background: #eff6ff; border: 1px solid #bfdbfe; color: #2563eb; }
  .uf-banner--success { background: #f0fdf4; border: 1px solid #bbf7d0; color: #16a34a; }
  .uf-footer {
    margin-top: 28px; padding-top: 20px; border-top: 1px solid #f3f4f6;
    text-align: center; font-size: 11px; color: #d1d5db;
  }
`;
