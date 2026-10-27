"use client";

import { useEffect, useRef, useState } from "react";
import { PenIcon, RequestForm, SendIcon, TypeIcon, buildContext, submitSupport } from "./support-ui";
import { TYPE_LABEL } from "../../../lib/support-rules";

const GREETING_ON = "Hi! I can answer questions about the dashboard. If I can’t help, I’ll pass it to the developer — you can add a screenshot.";
const GREETING_OFF = "Hi! The assistant is still being set up. Until it is ready, write to the developer: pick what you need below.";
const NOT_READY = "I can’t answer questions yet, but I can pass yours to the developer — they will reply here and in your bell.";

let counter = 0;
const uid = () => `m${(counter += 1)}`;

/**
 * The assistant chat. `mode="page"`: the chat of the Assistant tab, with the "Advanced" button that swaps the input for the
 * full form to the developer. `mode="popup"`: the chat only (the pop-up from the corner button). Everything the person
 * types stays in the chat; "Send to developer" turns the last question into a request and leaves a link to it.
 * `assistantOn` is false until the assistant itself is switched on by the admin.
 */
export default function AssistantChat({ role, mode = "page", assistantOn = false, seed, onSeedUsed, onOpenRequest }) {
  const [messages, setMessages] = useState(() => [{ id: uid(), kind: "bot", body: assistantOn ? GREETING_ON : GREETING_OFF, actions: !assistantOn && mode === "page" }]);
  const [text, setText] = useState("");
  const [form, setForm] = useState(null); // null, or { type, title, text }
  const [thinking, setThinking] = useState(false);
  const [busy, setBusy] = useState(false);
  const box = useRef(null);
  const input = useRef(null);

  // The page asks for the form (the "New request" button, a follow-up): open it with what it brought.
  useEffect(() => {
    if (!seed) return;
    setForm({ type: seed.type ?? "question", title: seed.title ?? "", text: seed.text ?? "" });
    onSeedUsed?.();
  }, [seed]);

  useEffect(() => { box.current?.scrollTo({ top: box.current.scrollHeight }); }, [messages, thinking, form]);

  const push = (...items) => setMessages((list) => [...list.map((m) => (m.chips ? { ...m, chips: null } : m)), ...items.map((item) => ({ id: uid(), ...item }))]);
  const lastQuestion = () => [...messages].reverse().find((m) => m.kind === "user")?.body ?? "";

  async function ask(question) {
    const q = question.trim();
    if (!q || thinking) return;
    setText("");
    push({ kind: "user", body: q });
    setThinking(true);
    // Stage 6 puts the real assistant here; until then it says so and offers the developer.
    await new Promise((done) => setTimeout(done, 450));
    setThinking(false);
    push({ kind: "bot", body: NOT_READY, chips: ["Send to developer"] });
  }

  async function handoff() {
    const question = lastQuestion();
    if (!question || busy) return;
    setBusy(true);
    const result = await submitSupport(
      { action: "create", type: "question", title: question.slice(0, 70), text: question, via: "assistant", context: buildContext({ role, withPage: mode === "popup" }) },
      [],
    );
    setBusy(false);
    if (result.error) return push({ kind: "bot", body: result.error });
    push({ kind: "sys", body: "Sent to the developer", requestId: result.id, number: result.number, type: "question" });
  }

  function sent(result, fields) {
    setForm(null);
    const kind = TYPE_LABEL[fields.type];
    push(
      { kind: "user", body: `${kind}: ${fields.title}${fields.text ? `\n${fields.text}` : ""}`, shots: fields.shots },
      { kind: "sys", body: "Sent to the developer", requestId: result.id, number: result.number, type: fields.type },
      { kind: "bot", body: "Done. You’ll get a bell notification when the developer replies. The conversation continues under My requests." },
    );
  }

  const openForm = (type) => setForm({ type, title: "", text: text.trim() });

  return (
    <div className="sp-chat">
      <div className="sp-msgs" ref={box} aria-live="polite">
        {messages.map((m) => <ChatMessage key={m.id} m={m} onChip={(chip) => (chip === "Send to developer" ? handoff() : ask(chip))} onOpen={onOpenRequest} onAction={(type) => openForm(type)} />)}
        {thinking && <div className="sp-m is-bot"><span className="sp-who" aria-hidden="true">D</span><div className="sp-bub sp-typing"><i /><i /><i /></div></div>}
      </div>
      {form ? (
        <div className="sp-form-wrap">
          <RequestForm key={`${form.type}-${form.title}`} role={role} seed={{ ...form, via: "form" }} onSent={sent} onCancel={() => setForm(null)} cancelLabel="Back to chat" />
        </div>
      ) : (
        <div className="sp-input">
          {mode === "page" && (
            <button type="button" className="sp-ib" title="Write a detailed message straight to the developer, without the assistant" aria-label="Advanced: detailed message to the developer" onClick={() => openForm("question")}>
              <PenIcon />
            </button>
          )}
          <textarea
            ref={input}
            rows={1}
            value={text}
            placeholder="Ask about the dashboard…"
            aria-label="Your question"
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); ask(text); } }}
          />
          <button type="button" className="sp-ib is-primary" title="Send" aria-label="Send" onClick={() => ask(text)} disabled={!text.trim() || thinking}><SendIcon /></button>
        </div>
      )}
    </div>
  );
}

function ChatMessage({ m, onChip, onOpen, onAction }) {
  if (m.kind === "sys") {
    return (
      <div className="sp-sys">
        <TypeIcon type={m.type} size={13} />
        <span>{m.body} · #{m.number}</span>
        <button type="button" className="sp-link" onClick={() => onOpen(m.requestId)}>Open in My requests</button>
      </div>
    );
  }
  const mine = m.kind === "user";
  return (
    <>
      <div className={`sp-m is-${m.kind}${mine ? " is-me" : ""}`}>
        <span className="sp-who" aria-hidden="true">{mine ? "You" : "D"}</span>
        <div>
          <div className="sp-bub"><span className="sp-text">{m.body}</span>{m.shots?.map((url) => /* eslint-disable-next-line @next/next/no-img-element */ <img key={url} className="sp-shot" src={url} alt="Screenshot" />)}</div>
          {m.chips && <div className="sp-chips">{m.chips.map((chip) => <button key={chip} type="button" className={`sp-chip${chip === "Send to developer" ? " is-go" : ""}`} onClick={() => onChip(chip)}>{chip}</button>)}</div>}
        </div>
      </div>
      {m.actions && (
        <div className="sp-chips sp-chips-in">
          <button type="button" className="sp-chip is-go" onClick={() => onAction("bug")}><TypeIcon type="bug" size={13} /> Report a problem</button>
          <button type="button" className="sp-chip is-go" onClick={() => onAction("idea")}><TypeIcon type="idea" size={13} /> Suggest an idea</button>
          <button type="button" className="sp-chip is-go" onClick={() => onAction("question")}><TypeIcon type="question" size={13} /> Ask the developer</button>
        </div>
      )}
    </>
  );
}
