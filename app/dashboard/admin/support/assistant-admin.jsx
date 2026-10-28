"use client";

import { useCallback, useEffect, useState } from "react";
import { Info } from "../../metrics-deck";
import { CloseIcon, SendIcon } from "../../support/support-ui";
import { DEFAULT_SETTINGS } from "../../../../lib/support-bot-rules";
import { deleteGuideArticle, loadAssistantPanel, saveBotSettings, saveGuideArticle, switchBot, switchGuideArticle, tryAssistant } from "./assistant-actions";

const SUBTABS = [["overview", "Overview"], ["answers", "Answers"], ["behaviour", "Behaviour"], ["knowledge", "Knowledge"]];
const PERIODS = [["today", "Today"], ["week", "Last 7 days"], ["month", "Last 30 days"]];
const OUTCOME = { answered: ["Answered", "ok"], escalated: ["Passed to you", "brand"], clarified: ["Asked to clarify", "info"], grouped: ["Grouped", "info"], drafted: ["Drafted", "warn"] };

const stamp = (iso) => new Date(iso).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const PALETTE = ["#c94a24", "#3b6fb6", "#2f9e8f", "#b8862b", "#8a63b8", "#c2527a"];
const colorOf = (name) => PALETTE[[...name].reduce((a, c) => a + c.charCodeAt(0), 0) % PALETTE.length];
/** Hours as a short label: minutes, hours, then days. */
const ageOf = (h) => (h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} d`);

/** Stacked bars per day: answered by the assistant (blue) and passed to a person (red). */
function DailyChart({ days }) {
  const W = 420, H = 130, max = Math.max(1, ...days.map((d) => d.answered + d.passed));
  const slot = W / Math.max(1, days.length), bw = Math.max(3, Math.min(22, slot * 0.66));
  return (
    <svg viewBox={`0 0 ${W} ${H + 18}`} width="100%" role="img" aria-label="Answered by the assistant and passed to a person, per day">
      {days.map((d, i) => {
        const x = i * slot + (slot - bw) / 2, ha = (d.answered / max) * H, hp = (d.passed / max) * H;
        return (
          <g key={d.day}>
            <title>{`${d.day}: answered ${d.answered}, passed to you ${d.passed}`}</title>
            <rect x={x} y={H - ha} width={bw} height={ha} rx="3" fill="#3b6fb5" />
            <rect x={x} y={H - ha - hp - 1.5} width={bw} height={hp} rx="3" fill="#c94a24" />
          </g>
        );
      })}
      <text x="0" y={H + 14} fontSize="10.5" fill="#8c7f73">{days[0]?.day.slice(5)}</text>
      <text x={W} y={H + 14} fontSize="10.5" fill="#8c7f73" textAnchor="end">{days[days.length - 1]?.day.slice(5)}</text>
    </svg>
  );
}

/** A switch (role=switch) with an optional label. */
function Switch({ on, onChange, label, disabled }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} disabled={disabled} className="sb-tgl" onClick={() => onChange(!on)}>
      <span className="sb-sw" />
    </button>
  );
}

function Row({ title, hint, children }) {
  return (
    <div className="sb-row">
      <div><b>{title}</b>{hint && <small>{hint}</small>}</div>
      <div className="sb-row-c">{children}</div>
    </div>
  );
}

function Seg({ value, options, onChange }) {
  return (
    <span className="sb-seg">
      {options.map(([key, label]) => <button key={key} type="button" aria-pressed={value === key} onClick={() => onChange(key)}>{label}</button>)}
    </span>
  );
}

/**
 * The assistant's profile for the admin: whether it is on, how it behaves, the guide it answers from, and what it did.
 * Settings are edited as a draft and saved together; the preview uses the draft, so a change can be tried before saving.
 */
export default function AssistantAdmin() {
  const [sub, setSub] = useState("overview");
  const [period, setPeriod] = useState("week");
  const [data, setData] = useState(null);
  const [failed, setFailed] = useState("");
  const [draft, setDraft] = useState(null);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState("");
  const [editing, setEditing] = useState(null); // null, or the article being written
  const [open, setOpen] = useState(() => new Set());
  const [openPeople, setOpenPeople] = useState(() => new Set());
  const [outcome, setOutcome] = useState("all");
  const [order, setOrder] = useState("wait");
  const togglePerson = (key) => setOpenPeople((set) => { const next = new Set(set); if (next.has(key)) next.delete(key); else next.add(key); return next; });

  const load = useCallback(async (p) => {
    const result = await loadAssistantPanel({ period: p });
    if (result?.error) return setFailed(result.error);
    setFailed("");
    setData(result);
    setDraft((current) => current ?? result.settings);
  }, []);
  useEffect(() => { load(period); }, [period, load]);

  const flash = (text) => { setNote(text); setTimeout(() => setNote(""), 2500); };
  if (failed) return <div className="cx-body"><p className="notice" role="alert">{failed}</p></div>;
  if (!data) return <div className="cx-body"><div className="sp-wait"><span className="spinner" aria-hidden="true" /> Loading…</div></div>;
  if (data.outdated) return <div className="cx-body"><p className="notice" role="status">The database needs update <code>0052_support.sql</code> before the assistant works.</p></div>;

  const settings = draft ?? data.settings ?? DEFAULT_SETTINGS;
  const dirty = !same(settings, data.settings);
  const set = (patch) => setDraft({ ...settings, ...patch });
  const setAlways = (key, value) => setDraft({ ...settings, always: { ...settings.always, [key]: value } });
  const live = data.enabled && data.hasKey && data.articles.some((a) => a.enabled);
  const reasonOff = !data.hasKey ? "Waiting for the API key in Vercel" : !data.articles.some((a) => a.enabled) ? "The guide has no answers switched on" : "Paused · every question goes to your queue";

  async function save() {
    setSaving(true);
    const result = await saveBotSettings({ settings });
    setSaving(false);
    if (result?.error) return flash(result.error);
    setData((d) => ({ ...d, settings: result.settings }));
    setDraft(result.settings);
    flash("Assistant settings saved");
  }
  async function flip(next) {
    const result = await switchBot({ enabled: next });
    if (result?.error) return flash(result.error);
    setData((d) => ({ ...d, enabled: next }));
  }
  async function flipArticle(article) {
    const result = await switchGuideArticle({ id: article.id, enabled: !article.enabled });
    if (result?.error) return flash(result.error);
    setData((d) => ({ ...d, articles: d.articles.map((a) => (a.id === article.id ? { ...a, enabled: !a.enabled } : a)) }));
  }
  async function saveArticle() {
    const result = await saveGuideArticle(editing);
    if (result?.error) return setEditing({ ...editing, problem: result.error });
    setEditing(null);
    flash("Answer saved — the assistant uses it from now on");
    load(period);
  }
  async function removeArticle(article) {
    if (!window.confirm(`Delete “${article.title}” from the guide?`)) return;
    const result = await deleteGuideArticle({ id: article.id });
    if (result?.error) return flash(result.error);
    setData((d) => ({ ...d, articles: d.articles.filter((a) => a.id !== article.id) }));
  }

  const s = data.stats;
  const preview = <Preview settings={settings} />;
  const people = data.people
    .filter((p) => outcome === "all" || p.items.some((i) => i.outcome === outcome))
    .map((p) => ({ ...p, items: outcome === "all" ? p.items : p.items.filter((i) => i.outcome === outcome) }))
    .sort((a, b) => {
      if (order === "count") return b.items.length - a.items.length;
      if (order === "recent") return a.lastAt < b.lastAt ? 1 : -1;
      return (b.waitHours > 0) - (a.waitHours > 0) || b.waitHours - a.waitHours;
    });

  return (
    <div className="cx-body sb-body">
      <section className="sb-card">
        <div className="sb-hero">
          <span className="sb-av" aria-hidden="true">D</span>
          <div className="sb-id">
            <h2>Deus Assistant</h2>
            <p><span className={`sb-live${live ? "" : " is-off"}`}>{live ? "Active" : reasonOff}</span></p>
            <small>Model: {data.model} · Guide: {data.articles.filter((a) => a.enabled).length} answers · Replies in {settings.lang === "en" ? "English" : "the user’s language"}</small>
          </div>
          <label className="sb-master">
            <Switch on={data.enabled} onChange={flip} label="Assistant on" />
            <span>Assistant on</span>
          </label>
        </div>
        <div className="cp-ptabs" role="tablist">
          {SUBTABS.map(([key, label]) => (
            <button key={key} type="button" role="tab" className="cp-ptab" aria-selected={sub === key} onClick={() => setSub(key)}>
              {label}{key === "knowledge" && data.gaps.length > 0 && <span className="cp-count" title="Questions it couldn’t answer">{data.gaps.length}</span>}
            </button>
          ))}
        </div>
      </section>

      {sub === "overview" && (
        <>
          <div className="cx-plate">
            <div className="sb-periods" role="group" aria-label="Period">
              {PERIODS.map(([key, label]) => <button key={key} type="button" className="fl-btn" aria-pressed={period === key} onClick={() => setPeriod(key)}>{label}</button>)}
            </div>
            <div className="sb-mini">
              <span><b>{s.total}</b>questions</span>
              <span><b>{s.solvedPct}%</b>solved without you</span>
              <span><b>{s.passed}</b>passed to you</span>
              <span><b>{s.rated ? `${s.helpfulPct}%` : "—"}</b>rated helpful</span>
            </div>
          </div>
          <div className="sb-grid">
            <div className="sb-wd">
              <h2>Activity by person <Info text="Everyone who asked the assistant in this period. A person whose question was passed to you is at the top, the longest-waiting first. Open a person to see their questions." /></h2>
              <div className="sb-tools">
                <label>Outcome <select className="cp-sel" value={outcome} onChange={(e) => setOutcome(e.target.value)}>
                  <option value="all">All</option>
                  {Object.entries(OUTCOME).map(([key, [label]]) => <option key={key} value={key}>{label}</option>)}
                </select></label>
                <label>Sort <select className="cp-sel" value={order} onChange={(e) => setOrder(e.target.value)}>
                  <option value="wait">Waiting first</option>
                  <option value="recent">Most recent</option>
                  <option value="count">Most questions</option>
                </select></label>
              </div>
              {people.length === 0 ? <p className="sb-empty">No questions in this period yet.</p> : people.map((p) => {
                const isOpen = openPeople.has(p.key);
                return (
                  <div className="sb-person" key={p.key}>
                    <button type="button" className="sb-prow" aria-expanded={isOpen} onClick={() => togglePerson(p.key)}>
                      <span className="sb-pav" style={{ background: colorOf(p.name) }} aria-hidden="true">{p.name.charAt(0).toUpperCase()}</span>
                      <span className="sb-pmain"><b>{p.name}</b><small>{p.role} · {p.items.length} {p.items.length === 1 ? "question" : "questions"} · last {stamp(p.lastAt)}</small></span>
                      {p.waitHours > 0 && <span className="sb-pwait" title="Age of the oldest question passed to you">{ageOf(p.waitHours)}</span>}
                      <span className={`sb-caret${isOpen ? " is-open" : ""}`} aria-hidden="true">▾</span>
                    </button>
                    {isOpen && (
                      <table className="sb-log sb-inner"><tbody>
                        {p.items.map((r) => {
                          const [label, tone] = OUTCOME[r.outcome] ?? [r.outcome, "info"];
                          return (
                            <tr key={r.id}>
                              <td className="sb-when">{stamp(r.at)}</td>
                              <td><span className="sb-q">{r.question}</span></td>
                              <td><span className={`sb-pill is-${tone}`}>{label}</span></td>
                              <td className="sb-src">{r.outcome === "answered" ? `${r.source || "—"} · ${r.confidence ?? 0}%` : (r.reason || "—")}</td>
                              <td className="sb-rate">{r.rating === "up" ? "👍" : r.rating === "down" ? "👎" : ""}</td>
                            </tr>
                          );
                        })}
                      </tbody></table>
                    )}
                  </div>
                );
              })}
            </div>
            <div className="sb-col">
              <div className="sb-wd">
                <h2>Answered vs passed to you</h2>
                <small>{period === "today" ? "Today" : `Each day, ${period === "week" ? "last 7 days" : "last 30 days"}`}</small>
                <div className="sb-legend"><span><i style={{ background: "#3b6fb5" }} />Answered by the assistant</span><span><i style={{ background: "#c94a24" }} />Passed to you</span></div>
                <div className="sb-chart"><DailyChart days={data.daily} /></div>
              </div>
              <div className="sb-wd">
                <h2>Why it passed to you</h2>
                {data.reasons.length === 0 ? <p className="sb-empty">Nothing passed on yet.</p> : (
                  <div className="sb-bars">
                    {data.reasons.map((r) => <div key={r.reason}><span>{r.reason}</span><i style={{ "--w": `${Math.round((r.count / Math.max(1, s.passed)) * 100)}%` }} /><em>{r.count}</em></div>)}
                  </div>
                )}
              </div>
              <div className="sb-wd">
                <h2>How users rate it</h2>
                <small>Answers with a rating</small>
                {data.ratings.up + data.ratings.down === 0 ? <p className="sb-empty">No ratings yet.</p> : (
                  <div className="sb-pad">
                    <div className="sb-rbar"><i style={{ width: `${s.helpfulPct}%` }} /></div>
                    <div className="sb-rleg"><span>👍 <b>{data.ratings.up}</b> helpful</span><span><b>{data.ratings.down}</b> not helpful 👎</span></div>
                  </div>
                )}
              </div>
              <div className="sb-wd">
                <h2>What people ask about</h2>
                <small>By the guide answer used, share of questions</small>
                {data.topics.length === 0 ? <p className="sb-empty">No questions yet.</p> : (
                  <div className="sb-bars">
                    {data.topics.map((t) => <div key={t.topic}><span>{t.topic}</span><i style={{ "--w": `${Math.round((t.count / Math.max(1, s.total)) * 100)}%` }} /><em>{Math.round((t.count / Math.max(1, s.total)) * 100)}%</em></div>)}
                  </div>
                )}
              </div>
              <div className="sb-wd">
                <h2>Usage <Info text="Tokens processed by the model in this period. A global daily cap stops the assistant if it is reached." /></h2>
                <div className="sb-usage"><div><b>{s.total}</b><small>questions</small></div><div><b>{(s.tokens / 1000).toFixed(1)}k</b><small>tokens</small></div></div>
              </div>
            </div>
          </div>
        </>
      )}

      {sub === "answers" && (
        <div className="sb-split">
          <div className="sb-col">
            <div className="sb-wd">
              <h2>Voice</h2><small>How the assistant writes</small>
              <Row title="Tone" hint="Friendly may add a greeting word and offer more help"><Seg value={settings.tone} onChange={(tone) => set({ tone })} options={[["friendly", "Friendly"], ["neutral", "Neutral"], ["concise", "Concise"]]} /></Row>
              <Row title="Length" hint="Detailed adds the extra steps from the guide"><Seg value={settings.len} onChange={(len) => set({ len })} options={[["short", "Short"], ["normal", "Normal"], ["detailed", "Detailed"]]} /></Row>
              <Row title="Language" hint="Replies in the language of the question, or always in English"><Seg value={settings.lang} onChange={(lang) => set({ lang })} options={[["match", "Same as the user"], ["en", "English only"]]} /></Row>
            </div>
            <div className="sb-wd">
              <h2>Messages</h2><small>What surrounds every answer</small>
              <div className="sb-row is-col"><div><b>Greeting</b><small>The first message in the Help &amp; feedback chat</small></div><textarea className="field" rows={3} maxLength={400} value={settings.greet} onChange={(e) => set({ greet: e.target.value })} aria-label="Greeting" /></div>
              <Row title="Sign the replies" hint="Adds a signature line to each answer"><Switch on={settings.sig} onChange={(sig) => set({ sig })} label="Sign the replies" /></Row>
              {settings.sig && <div className="sb-row is-col"><div><b>Signature</b></div><input className="field" maxLength={60} value={settings.sigtext} onChange={(e) => set({ sigtext: e.target.value })} aria-label="Signature" /></div>}
              <Row title="Show the source" hint="“Source: … · confidence 88%” under each answer"><Switch on={settings.sources} onChange={(sources) => set({ sources })} label="Show the source" /></Row>
            </div>
          </div>
          {preview}
        </div>
      )}

      {sub === "behaviour" && (
        <div className="sb-split">
          <div className="sb-col">
            <div className="sb-wd">
              <h2>When to pass to you</h2><small>The assistant never guesses: if it is not sure, you answer</small>
              <Row title="Confidence limit" hint="Below this, the question goes to Needs attention">
                <span className="sb-range"><input type="range" min={50} max={95} step={5} value={settings.conf} onChange={(e) => set({ conf: Number(e.target.value) })} aria-label="Confidence limit" /><b>{settings.conf}%</b></span>
              </Row>
              <div className="sb-sub">Always pass to you</div>
              <Row title="Money questions" hint="Payouts, refunds, invoices"><Switch on={settings.always.money} onChange={(v) => setAlways("money", v)} label="Money questions" /></Row>
              <Row title="Account deletion and legal" hint="Anything the guide must not decide"><Switch on={settings.always.legal} onChange={(v) => setAlways("legal", v)} label="Account deletion and legal" /></Row>
              <Row title="Upset messages" hint="Angry or very negative tone"><Switch on={settings.always.angry} onChange={(v) => setAlways("angry", v)} label="Upset messages" /></Row>
              <Row title="“I want a human”" hint="As soon as the user asks for you"><Switch on={settings.always.human} onChange={(v) => setAlways("human", v)} label="I want a human" /></Row>
              <div className="sb-row is-col"><div><b>Message to the user when it passes the question</b></div><textarea className="field" rows={3} maxLength={400} value={settings.hand} onChange={(e) => set({ hand: e.target.value })} aria-label="Message when passing a question" /></div>
            </div>
            <div className="sb-wd">
              <h2>Limits</h2><small>Stops one person from using up the assistant</small>
              <Row title="Messages per user per day" hint="After this the person is pointed to the developer form"><input className="field sb-num" type="number" min={5} max={200} value={settings.maxday} onChange={(e) => set({ maxday: Number(e.target.value) })} aria-label="Messages per user per day" /></Row>
            </div>
          </div>
          {preview}
        </div>
      )}

      {sub === "knowledge" && (
        <div className="sb-split">
          <div className="sb-wd">
            <h2>Guide <Info text="The answers the assistant is allowed to use. It never invents anything outside them." /></h2>
            <small>{data.articles.filter((a) => a.enabled).length} of {data.articles.length} answers are on</small>
            <div className="sb-pad"><button type="button" className="button" onClick={() => setEditing({ id: null, title: "", keywords: "", answer: "", more: "", enabled: true })}>New answer</button></div>
            {data.articles.length === 0 && <p className="sb-empty">The guide is empty. Add the first answer — without it the assistant stays quiet.</p>}
            {data.articles.map((a) => (
              <div className="sb-kb" key={a.id}>
                <button type="button" className="sb-kb-main" aria-expanded={open.has(a.id)} onClick={() => setOpen((o) => { const n = new Set(o); if (n.has(a.id)) n.delete(a.id); else n.add(a.id); return n; })}>
                  <b>{a.title}</b><small>{a.keywords || "no trigger words"}</small>
                </button>
                <span className="sb-uses" title="Times used">{a.uses}×</span>
                <button type="button" className="button button-quiet" onClick={() => setEditing({ ...a })}>Edit</button>
                <Switch on={a.enabled} onChange={() => flipArticle(a)} label={`${a.title}: on`} />
                {open.has(a.id) && (
                  <div className="sb-kb-body">
                    <p>{a.answer}</p>
                    {a.more && <p className="is-dim">{a.more}</p>}
                    <button type="button" className="sb-link" onClick={() => removeArticle(a)}>Delete this answer</button>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="sb-wd">
            <h2>Questions it couldn’t answer <Info text="Topics people asked about that the guide does not cover. Write an answer once and the assistant will use it." /></h2>
            <small>Most asked first · this period</small>
            {data.gaps.length === 0 && <p className="sb-empty">Nothing missing so far.</p>}
            {data.gaps.map((g) => (
              <div className="sb-gap" key={g.question}>
                <span><b>{g.question}</b><small>asked {g.count} {g.count === 1 ? "time" : "times"}</small></span>
                <button type="button" className="button button-quiet" onClick={() => setEditing({ id: null, title: g.question, keywords: "", answer: "", more: "", enabled: true })}>Write answer</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {(sub === "answers" || sub === "behaviour") && dirty && (
        <div className="sb-save" role="status">
          <span>Unsaved changes</span><span className="sb-grow" />
          <button type="button" className="button button-quiet" onClick={() => setDraft(data.settings)}>Discard</button>
          <button type="button" className="button" disabled={saving} onClick={save}>{saving ? <span className="spinner" aria-hidden="true" /> : null} Save changes</button>
        </div>
      )}

      {editing && (
        <div className="sp-veil" onMouseDown={(e) => { if (e.target === e.currentTarget) setEditing(null); }}>
          <div className="sp-dlg sb-dlg" role="dialog" aria-modal="true" aria-label={editing.id ? "Edit answer" : "New answer"}>
            <div className="sb-dlg-top"><h2>{editing.id ? "Edit answer" : "New answer"}</h2><button type="button" className="rd-more" aria-label="Close" onClick={() => setEditing(null)}><CloseIcon /></button></div>
            <div className="sb-form">
              <label>Question<input className="field" maxLength={160} value={editing.title} onChange={(e) => setEditing({ ...editing, title: e.target.value })} /></label>
              <label>Words that should trigger it<input className="field" maxLength={300} placeholder="api key, key" value={editing.keywords} onChange={(e) => setEditing({ ...editing, keywords: e.target.value })} /></label>
              <label>Answer<textarea className="field" rows={4} maxLength={2000} value={editing.answer} onChange={(e) => setEditing({ ...editing, answer: e.target.value })} /></label>
              <label>Extra step for “detailed” replies<textarea className="field" rows={2} maxLength={2000} value={editing.more} onChange={(e) => setEditing({ ...editing, more: e.target.value })} /></label>
              {editing.problem && <p className="sp-problem" role="alert">{editing.problem}</p>}
              <div className="sb-actions"><button type="button" className="button button-quiet" onClick={() => setEditing(null)}>Cancel</button><button type="button" className="button" onClick={saveArticle}>Save answer</button></div>
            </div>
          </div>
        </div>
      )}
      {note && <div className="sb-toast" role="status">{note}</div>}
    </div>
  );
}

/** Try a question with the draft settings: the real assistant, nothing is logged. */
function Preview({ settings }) {
  const [q, setQ] = useState("");
  const [turns, setTurns] = useState([]);
  const [busy, setBusy] = useState(false);

  async function ask() {
    const question = q.trim();
    if (!question || busy) return;
    setQ("");
    setBusy(true);
    setTurns((t) => [...t, { who: "you", text: question }]);
    const result = await tryAssistant({ question, settings });
    setBusy(false);
    const text = result?.error ? result.error : result.outcome === "off" ? "The assistant can’t answer yet: it needs the API key and at least one answer in the guide." : result.reply;
    const meta = result?.outcome === "answered" ? result.source : result?.outcome === "escalated" ? `Would go to Needs attention · ${result.escalation}` : "";
    setTurns((t) => [...t, { who: "bot", text, meta }]);
  }

  return (
    <div className="sb-wd sb-prev">
      <h2>Preview <Info text="Ask the real assistant a question with the settings as they are now, saved or not. Nothing is logged." /></h2>
      <small>This is what the user sees</small>
      <div className="sb-prev-box">
        <div className="sp-m is-bot"><span className="sp-who" aria-hidden="true">D</span><div className="sp-bub"><span className="sp-text">{settings.greet}</span></div></div>
        {turns.map((t, i) => (
          <div key={i} className={`sp-m ${t.who === "you" ? "is-me is-user" : "is-bot"}`}>
            <span className="sp-who" aria-hidden="true">{t.who === "you" ? "You" : "D"}</span>
            <div className="sp-bub"><span className="sp-text">{t.text}</span>{t.meta && <span className="sp-source">{t.meta}</span>}</div>
          </div>
        ))}
        {busy && <div className="sp-m is-bot"><span className="sp-who" aria-hidden="true">D</span><div className="sp-bub sp-typing"><i /><i /><i /></div></div>}
      </div>
      <div className="sb-prev-in">
        <input className="field" placeholder="Try a question…" value={q} aria-label="Try a question" onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); ask(); } }} />
        <button type="button" className="sp-ib is-primary" aria-label="Ask" disabled={!q.trim() || busy} onClick={ask}><SendIcon /></button>
      </div>
    </div>
  );
}
