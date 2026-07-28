import { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, Bell, CalendarDays, CheckCircle2, CircleAlert, Clock3, ExternalLink, Film, LoaderCircle, Mail, Pause, Play, RefreshCw, ShieldAlert } from "lucide-react";
import type { State, Status } from "./types";

const statusCopy: Record<Status, { title: string; eyebrow: string; tone: string }> = {
  AVAILABLE: { title: "Tickets available", eyebrow: "Booking is open", tone: "green" },
  NOT_AVAILABLE: { title: "Tickets not open", eyebrow: "Watching the box office", tone: "quiet" },
  CHECKING: { title: "Checking now", eyebrow: "Reading the live page", tone: "blue" },
  PAUSED: { title: "Monitoring paused", eyebrow: "Checks are stopped", tone: "quiet" },
  BLOCKED: { title: "Temporarily blocked", eyebrow: "Access protection detected", tone: "amber" },
  PAGE_CHANGED: { title: "Detection needs attention", eyebrow: "Page structure changed", tone: "amber" },
  ERROR: { title: "Check failed", eyebrow: "Automatic retry scheduled", tone: "red" }
};

const since = (iso?: string) => iso ? new Intl.DateTimeFormat("en-IN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso)) : "Not yet";
const duration = (seconds: number) => `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;

async function api(path: string, options?: RequestInit) {
  const response = await fetch(path, { ...options, headers: { "Content-Type": "application/json", ...options?.headers } });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || "Request failed");
  return body;
}

export function App() {
  const [auth, setAuth] = useState<{ required: boolean; authenticated: boolean }>();
  const [state, setState] = useState<State>();
  const [busy, setBusy] = useState<string>();
  const [notice, setNotice] = useState<string>();

  const load = useCallback(async () => {
    const authState = await api("/api/auth");
    setAuth(authState);
    if (authState.authenticated) setState(await api("/api/status"));
  }, []);
  useEffect(() => { void load(); const id = setInterval(() => void load(), 10_000); return () => clearInterval(id); }, [load]);
  if (!auth) return <Splash />;
  if (auth.required && !auth.authenticated) return <Login onDone={load} />;
  if (!state) return <Splash />;

  const action = async (name: string, path: string) => {
    setBusy(name); setNotice(undefined);
    try { await api(path, { method: "POST" }); setNotice(name === "test" ? "Test email sent" : "Done"); await load(); }
    catch (error: any) { setNotice(error.message); }
    finally { setBusy(undefined); }
  };
  const copy = statusCopy[state.currentStatus];
  const enabledShows = state.lastResult?.showtimes.filter((s) => s.enabled) || [];
  const successful = state.history.filter((h) => ["AVAILABLE", "NOT_AVAILABLE", "PAGE_CHANGED"].includes(h.status)).length;
  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand"><div className="brand-mark"><Film size={20} /></div><div><strong>Premiere Watch</strong><span>Allu Cinemas — Premiere Monitor</span></div></div>
        <div className={`live-pill ${state.monitoringEnabled ? "on" : ""}`}><i />{state.monitoringEnabled ? "Monitoring" : "Paused"}</div>
      </header>
      <main>
        <section className={`hero-card tone-${copy.tone}`}>
          <div className="hero-content">
            <div className="eyebrow"><span className="status-orb" />{copy.eyebrow}</div>
            <h1>{copy.title}</h1>
            <p className="muted">{state.lastResult?.reason || "A quiet, persistent watch on premiere showtimes at Allu Cinemas, Kokapet."}</p>
            <div className="meta-row"><span><Clock3 size={15} /> Last checked {since(state.lastAttemptedCheck)}</span><Countdown next={state.nextCheckAt} paused={!state.monitoringEnabled} /></div>
          </div>
          <div className="hero-actions">
            <a className="button secondary" href={state.targetUrl} target="_blank" rel="noreferrer">Open BookMyShow <ExternalLink size={16} /></a>
            <button className="button primary" disabled={Boolean(busy) || state.checking} onClick={() => void action("check", "/api/check-now")}>{busy === "check" ? <LoaderCircle className="spin" size={16} /> : <RefreshCw size={16} />} Check now</button>
          </div>
        </section>

        <section className="grid two">
          <article className="card">
            <div className="section-title"><div><span>Detected sessions</span><h2>Showtimes</h2></div><CalendarDays size={20} /></div>
            <div className="showtimes">{state.lastResult?.showtimes.length ? state.lastResult.showtimes.map((show, i) => <div className={`show-chip ${show.enabled ? "enabled" : ""}`} key={`${show.time}-${i}`}><strong>{show.time}</strong>{show.movieName && <span className="movie-label">{show.movieName}</span>}<span>{[show.format, show.language].filter(Boolean).join(" · ") || (show.enabled ? "Bookable" : "Unavailable")}</span></div>) : <div className="empty">No showtimes detected yet</div>}</div>
            {enabledShows.length > 0 && <p className="tiny"><CheckCircle2 size={14} /> {enabledShows.length} actionable {enabledShows.length === 1 ? "showtime" : "showtimes"} detected</p>}
          </article>
          <article className="card">
            <div className="section-title"><div><span>At a glance</span><h2>Statistics</h2></div><Activity size={20} /></div>
            <div className="stats"><Stat label="Total checks" value={state.history.length} /><Stat label="Successful" value={successful} /><Stat label="Failures" value={state.consecutiveFailures} warn={state.consecutiveFailures > 0} /><Stat label="Alerts sent" value={state.notificationHistory.length} /><Stat label="Uptime" value={duration(state.uptimeSeconds)} /></div>
          </article>
        </section>

        <section className="grid lower">
          <article className="card activity-card">
            <div className="section-title"><div><span>Latest checks</span><h2>Recent activity</h2></div><Clock3 size={20} /></div>
            <div className="activity-list">{state.history.length ? state.history.slice(0, 8).map((item, i) => <div className="activity-item" key={item.id || i}><StatusIcon status={item.status} /><div className="activity-copy"><strong>{statusCopy[item.status].title}</strong><span>{since(item.checkedAt)}{item.reason ? ` · ${item.reason}` : ""}</span></div><div className="activity-meta"><strong>{item.showtimes.length}</strong><span>shows · {item.durationMs ?? 0}ms</span></div></div>) : <div className="empty">Activity will appear after the first check</div>}</div>
          </article>
          <article className="card controls-card">
            <div className="section-title"><div><span>Service</span><h2>Controls</h2></div><Bell size={20} /></div>
            <button className="control" onClick={() => void action(state.monitoringEnabled ? "pause" : "start", state.monitoringEnabled ? "/api/monitor/stop" : "/api/monitor/start")} disabled={Boolean(busy)}>{state.monitoringEnabled ? <Pause /> : <Play />}<span><strong>{state.monitoringEnabled ? "Pause monitoring" : "Start monitoring"}</strong><small>{state.monitoringEnabled ? "Stop scheduled checks" : "Resume scheduled checks"}</small></span></button>
            <button className="control" onClick={() => void action("test", "/api/test-email")} disabled={Boolean(busy)}><Mail /><span><strong>Send test email</strong><small>{state.emailRecipient}</small></span></button>
            <div className="monitor-note"><ShieldAlert size={16} /><span>Public availability only. No seats are reserved or purchased.</span></div>
            {notice && <div className="notice">{notice}</div>}
          </article>
        </section>
      </main>
      <footer>Premiere Watch <span>•</span> Checking every {state.checkIntervalSeconds} seconds <span>•</span> Asia/Kolkata</footer>
    </div>
  );
}

function Countdown({ next, paused }: { next?: string; paused: boolean }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(id); }, []);
  const value = useMemo(() => Math.max(0, Math.ceil((new Date(next || now).getTime() - now) / 1000)), [next, now]);
  return <span><RefreshCw size={15} /> {paused ? "Schedule paused" : `Next check in ${value}s`}</span>;
}
function Stat({ label, value, warn }: { label: string; value: string | number; warn?: boolean }) { return <div><span>{label}</span><strong className={warn ? "warn" : ""}>{value}</strong></div>; }
function StatusIcon({ status }: { status: Status }) {
  if (status === "AVAILABLE") return <CheckCircle2 className="icon success" />;
  if (status === "BLOCKED" || status === "PAGE_CHANGED") return <ShieldAlert className="icon amber" />;
  if (status === "ERROR") return <CircleAlert className="icon danger" />;
  return <Activity className="icon" />;
}
function Splash() { return <div className="splash"><div className="brand-mark"><Film /></div><LoaderCircle className="spin" /></div>; }
function Login({ onDone }: { onDone: () => Promise<void> }) {
  const [password, setPassword] = useState(""); const [error, setError] = useState("");
  const submit = async (event: React.FormEvent) => { event.preventDefault(); try { await api("/api/login", { method: "POST", body: JSON.stringify({ password }) }); await onDone(); } catch (e: any) { setError(e.message); } };
  return <div className="login-page"><form className="login-card" onSubmit={submit}><div className="brand-mark"><Film /></div><span className="eyebrow">PRIVATE MONITOR</span><h1>Welcome back</h1><p>Enter the dashboard password to continue.</p><label>Password<input type="password" autoFocus value={password} onChange={(e) => setPassword(e.target.value)} /></label>{error && <div className="notice">{error}</div>}<button className="button primary">Unlock dashboard</button></form></div>;
}
