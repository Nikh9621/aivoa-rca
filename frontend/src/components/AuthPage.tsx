
import { useState } from "react";
import { FlaskConical, Mail, Lock, User, Loader2, AlertCircle } from "lucide-react";
import { loginUser, registerUser } from "../services/api";
import "./AuthPage.css";

interface AuthPageProps {
  onAuthSuccess: (user: {
    id: number;
    full_name: string;
    email: string;
  }) => void;
}

export default function AuthPage({ onAuthSuccess }: AuthPageProps) {
  const [isRegister, setIsRegister] = useState(false);
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    try {
      setLoading(true);

      const response = isRegister
        ? await registerUser({
            full_name: fullName.trim(),
            email: email.trim(),
            password,
          })
        : await loginUser({
            email: email.trim(),
            password,
          });

      onAuthSuccess(response.user);
    } catch (err: any) {
      setError(err.message || "Authentication failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-layout">
      <div className="auth-card">
        <div className="auth-brand">
          <div className="auth-brand-icon">
            <FlaskConical size={25} />
          </div>
          <div>
            <h1>AIVOA<span>.AI</span></h1>
            <small>QUALITY INTELLIGENCE</small>
          </div>
        </div>

        <div className="auth-heading">
          <span>PHARMACEUTICAL QUALITY MANAGEMENT</span>
          <h2>{isRegister ? "Create your account" : "Welcome back"}</h2>
          <p>
            {isRegister
              ? "Register to access your investigation workspace."
              : "Sign in to continue to your RCA workspace."}
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          {isRegister && (
            <div className="auth-field">
              <label>Full Name</label>
              <div className="auth-input-wrap">
                <User size={17} />
                <input
                  type="text"
                  placeholder="Enter your full name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  minLength={2}
                  maxLength={255}
                  required
                />
              </div>
            </div>
          )}

          <div className="auth-field">
            <label>Email Address</label>
            <div className="auth-input-wrap">
              <Mail size={17} />
              <input
                type="email"
                placeholder="Enter your email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
          </div>

          <div className="auth-field">
            <label>Password</label>
            <div className="auth-input-wrap">
              <Lock size={17} />
              <input
                type="password"
                placeholder="Enter your password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={8}
                maxLength={128}
                required
              />
            </div>
          </div>

          {error && (
            <div className="auth-error">
              <AlertCircle size={17} />
              {error}
            </div>
          )}

          <button className="auth-submit" type="submit" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="auth-spin" size={18} />
                Please wait...
              </>
            ) : isRegister ? (
              "Create Account"
            ) : (
              "Sign In"
            )}
          </button>
        </form>

        <div className="auth-switch">
          {isRegister ? "Already have an account?" : "Don't have an account?"}
          <button
            type="button"
            onClick={() => {
              setIsRegister(!isRegister);
              setError("");
            }}
          >
            {isRegister ? "Sign In" : "Register"}
          </button>
        </div>

        <div className="auth-footer">
          AIVOA.AI · AI-powered Root Cause Analysis
        </div>
      </div>
    </div>
  );
}
