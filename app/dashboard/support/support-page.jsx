"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AssistantChat from "./assistant-chat";
import RequestsTab from "./requests-tab";
import RequestWindow from "./request-window";

const HEAD = {
  assistant: ["Help & feedback", "Ask the assistant, or write to the developer — screenshots welcome."],
  requests: ["Help & feedback", "Everything you sent to the developer, and what came back."],
};

/**
 * Help & feedback for developers and advertisers: the Assistant tab (chat, with a full form to the developer behind the
 * pen button) and My requests (strips, folders, the conversation as a pop-up). The tab and the open request are kept in
 * the address (?tab=requests&open=<id>) so a link from the bell opens the right conversation.
 */
export default function SupportPage({ role, requests, folders, outdated, initialTab, initialOpen }) {
  const router = useRouter();
  const [tab, setTab] = useState(initialTab);
  const [openId, setOpenId] = useState(initialOpen);
  const [seed, setSeed] = useState(null);
  const tabs = useRef({});
  const unread = requests.filter((r) => r.unread).length;
  const [title, lede] = HEAD[tab];

  const setAddress = useCallback((next, id) => {
    try {
      const url = new URL(window.location.href);
      if (next === "requests") url.searchParams.set("tab", "requests"); else url.searchParams.delete("tab");
      if (id) url.searchParams.set("open", id); else url.searchParams.delete("open");
      window.history.replaceState(window.history.state, "", url);
    } catch {}
  }, []);

  // A link to another request while the page is open (the bell): follow it.
  useEffect(() => { if (initialOpen) { setTab("requests"); setOpenId(initialOpen); } }, [initialOpen]);

  function choose(next, focus = false) {
    setTab(next);
    setAddress(next, null);
    window.scrollTo(0, 0);
    if (focus) tabs.current[next]?.focus();
  }
  const onKeyDown = (e) => {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    choose(tab === "requests" ? "assistant" : "requests", true);
  };

  const openRequest = (id) => { setTab("requests"); setOpenId(id); setAddress("requests", id); router.refresh(); };
  const closeRequest = () => { setOpenId(null); setAddress("requests", null); router.refresh(); };
  const startForm = (next) => { setTab("assistant"); setAddress("assistant", null); setSeed(next); };

  return (
    <div className="pg-ic cx-win sp-win" data-tab={tab}>
      <header className="main-head cx-head">
        <div><h1>{title}</h1><p className="lede">{lede}</p></div>
        <div className="cx-tabs" role="tablist" aria-label="Help sections" onKeyDown={onKeyDown}>
          <button type="button" ref={(el) => { tabs.current.assistant = el; }} className="cx-tab" role="tab" id="sp-tab-assistant" aria-selected={tab === "assistant"} aria-controls="sp-panel-assistant" tabIndex={tab === "assistant" ? 0 : -1} onClick={() => choose("assistant")}>Assistant</button>
          <button type="button" ref={(el) => { tabs.current.requests = el; }} className="cx-tab" role="tab" id="sp-tab-requests" aria-selected={tab === "requests"} aria-controls="sp-panel-requests" tabIndex={tab === "requests" ? 0 : -1} onClick={() => choose("requests")}>My requests{unread > 0 && <i>{unread}</i>}</button>
        </div>
      </header>

      <div id="sp-panel-assistant" role="tabpanel" aria-labelledby="sp-tab-assistant" hidden={tab !== "assistant"}>
        <div className="cx-body sp-assistant">
          <div className="sp-chat-card">
            <AssistantChat role={role} mode="page" seed={seed} onSeedUsed={() => setSeed(null)} onOpenRequest={openRequest} />
          </div>
        </div>
      </div>
      <div id="sp-panel-requests" role="tabpanel" aria-labelledby="sp-tab-requests" hidden={tab !== "requests"}>
        <RequestsTab requests={requests} folders={folders} outdated={outdated} onOpen={openRequest} onNew={() => startForm({ type: "question", title: "", text: "" })} />
      </div>

      {openId && (
        <RequestWindow
          key={openId}
          id={openId}
          summary={requests.find((r) => r.id === openId) ?? null}
          onClose={closeRequest}
          onSeen={() => router.refresh()}
          onFollowUp={(request) => { closeRequest(); startForm({ type: request.type === "bug" ? "bug" : "question", title: `Follow-up to #${request.number}: ${request.title}`.slice(0, 140), text: "" }); }}
        />
      )}
    </div>
  );
}
