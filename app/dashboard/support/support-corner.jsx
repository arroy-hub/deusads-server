"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import AssistantChat from "./assistant-chat";
import { ChatIcon, CloseIcon, PenIcon, RequestForm } from "./support-ui";
import { navigating } from "../_cabinet/nav";

const OpenIcon = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 4h6v6M20 4l-8 8M10 6H5v13h13v-5" /></svg>;

/**
 * The round help button in the bottom-right corner of every dashboard page (developer and advertiser). It opens a small
 * menu with two choices: message the developer (a form, straight to the developer) or ask the assistant (a chat). The
 * chat keeps its conversation while the person moves between pages. Not shown on the Help & feedback page itself.
 */
export default function SupportCorner({ role, unread = 0, assistantOn = false, greeting }) {
  const pathname = usePathname();
  const router = useRouter();
  const [menu, setMenu] = useState(false);
  const [mode, setMode] = useState(null); // null | "dev" | "bot"
  const [sent, setSent] = useState(null); // { id, number } after a message to the developer
  const [botSeen, setBotSeen] = useState(false); // the chat stays mounted once opened, so it keeps its messages
  const zone = useRef(null);

  useEffect(() => {
    if (!menu) return;
    const away = (e) => { if (!zone.current?.contains(e.target)) setMenu(false); };
    const key = (e) => e.key === "Escape" && setMenu(false);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", key); };
  }, [menu]);
  useEffect(() => { setMenu(false); setMode(null); }, [pathname]);

  if (pathname.startsWith("/dashboard/support")) return null;

  // An admin has no one to write to (the admin is the developer): the button opens the assistant chat at once.
  const isAdmin = role === "admin";
  const choose = (next) => { setMenu(false); setSent(null); setMode(next); if (next === "bot") setBotSeen(true); };
  const close = () => { setMode(null); setSent(null); };
  const goRequests = (id) => { close(); navigating(); router.push(id ? `/dashboard/support?tab=requests&open=${id}` : "/dashboard/support?tab=requests"); };
  const popOpen = mode !== null;

  return (
    <div className="sp-corner" ref={zone}>
      <button type="button" className="sp-fab" aria-label="Help and feedback" aria-haspopup="menu" aria-expanded={menu || popOpen} onClick={() => (popOpen ? close() : isAdmin ? choose("bot") : setMenu((v) => !v))}>
        <ChatIcon size={24} />
        {unread > 0 && <i aria-label={`${unread} unread`}>{unread}</i>}
      </button>

      {menu && (
        <div className="sp-fmenu" role="menu" aria-label="Help and feedback">
          <button type="button" role="menuitem" onClick={() => choose("dev")}>
            <span className="sp-fm-ic"><PenIcon /></span>
            <span><b>Message the developer</b><small>Report a problem, suggest an idea or ask a question</small></span>
          </button>
          <button type="button" role="menuitem" onClick={() => choose("bot")}>
            <span className="sp-fm-ic is-bot">D</span>
            <span><b>Ask the assistant</b><small>Quick answers about the dashboard</small></span>
          </button>
          {unread > 0 && <button type="button" role="menuitem" className="sp-fm-note" onClick={() => goRequests()}>{unread === 1 ? "1 new reply" : `${unread} new replies`} · open My requests</button>}
        </div>
      )}

      {(popOpen || botSeen) && (
        <section className="sp-pop" hidden={!popOpen} aria-label={mode === "dev" ? "Message the developer" : "Ask the assistant"}>
          <header className="sp-pop-top">
            <span className={`sp-fm-ic${mode === "dev" ? "" : " is-bot"}`}>{mode === "dev" ? <PenIcon /> : "D"}</span>
            <div><b>{mode === "dev" ? "Message the developer" : "Ask the assistant"}</b><small>{mode === "dev" ? "Goes straight to the developer" : "Quick answers about the dashboard"}</small></div>
            <span className="sp-grow" />
            {mode === "bot" && <button type="button" className="sp-ib is-flat" title="Open in full window" aria-label="Open in full window" onClick={() => { close(); navigating(); router.push("/dashboard/support"); }}><OpenIcon /></button>}
            <button type="button" className="sp-ib is-flat" title="Close" aria-label="Close" onClick={close}><CloseIcon size={16} /></button>
          </header>
          <div className="sp-pop-body">
            {mode === "dev" && (sent ? (
              <div className="sp-sent">
                <span className="sp-ok">✓</span>
                <h3>Sent to the developer · #{sent.number}</h3>
                <p>You’ll get a bell notification when the developer replies. The conversation continues under My requests.</p>
                <div className="sp-form-actions"><button type="button" className="button button-quiet" onClick={close}>Close</button><button type="button" className="button" onClick={() => goRequests(sent.id)}>Open request</button></div>
              </div>
            ) : (
              <div className="sp-form-wrap is-full">
                <RequestForm key="dev-form" role={role} seed={{ type: "bug" }} withContext onSent={(result) => setSent({ id: result.id, number: result.number })} onCancel={close} />
              </div>
            ))}
            <div className="sp-bot-wrap" hidden={mode !== "bot"}>
              {botSeen && <AssistantChat role={role} mode="popup" canHandOver={!isAdmin} assistantOn={assistantOn} greeting={greeting} onOpenRequest={goRequests} />}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
