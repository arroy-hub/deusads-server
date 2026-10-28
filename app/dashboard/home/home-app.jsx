"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ART, GUIDE_CARDS, GUIDE_LIST, LATEST, NEWS, NTYPE, TIPS, guideBySlug, slugOf } from "../../../lib/home-content";
import Ic from "./icons";

// The blocks a person can switch on and off, in the order they appear in the menu.
const BLOCKS = [
  ["attention", "Needs attention"],
  ["activity", "Recent activity"],
  ["setup", "Get started checklist"],
  ["guides", "Guides"],
  ["news", "What’s new"],
  ["tips", "Tips"],
];
const STORE = "deusads-home-blocks";
const TIP_MS = 10000;
const EASE = "cubic-bezier(.4,0,.2,1)";
const COVER = "linear-gradient(105deg,color-mix(in srgb,var(--tone) 34%,#fff),color-mix(in srgb,var(--tone) 22%,#fff) 55%,color-mix(in srgb,var(--tone) 9%,#fff))";
const BLOCK_ICON = { "Welcome to DeusADS": "flag", "Get started": "flag", Guides: "book", "Needs attention": "alert", "Recent activity": "pulse", "What’s new": "mega", Tip: "bulb" };
const PILL = { important: "hm-warn", patch: "hm-info", news: "hm-info" };
const HOME = "/dashboard/home";

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const viewOf = (path) => (path.startsWith(`${HOME}/news`) ? { name: "news" } : path.startsWith(`${HOME}/guides/`) ? { name: "guide", slug: path.slice(`${HOME}/guides/`.length).split("/")[0] } : { name: "home" });

/** One block of Home: icon and title on the left, whatever `right` holds on the right. */
function Block({ title, right, left, cls = "", id, children, className = "" }) {
  return (
    <section className={`hm-panel hm-blk ${className}`} id={id}>
      <div className="hm-blk-h">
        {BLOCK_ICON[title] && <span className="hm-blk-ic"><Ic name={BLOCK_ICON[title]} size={24} /></span>}
        <h2>{title}</h2>
        {left}
        <span className="hm-sp" />
        {right}
      </div>
      <div className={`hm-blk-b ${cls}`}>{children}</div>
    </section>
  );
}

function Strip({ item }) {
  return (
    <Link href={item.href} className="cx-strip" style={{ "--tone": `var(--cx-${item.tone})`, "--sh": "64px" }}>
      <div className="cx-scover"><div className="cx-pic" style={{ background: COVER }} /></div>
      <div className="cx-splate">
        <span className="cx-ic"><span className="rd-tile"><Ic name={item.icon} size={20} /></span></span>
        <div className="cx-txt"><h3>{item.title}</h3><div className="cx-sub">{item.text}</div></div>
      </div>
      <div className="cx-right"><span className={`hm-btn hm-sm${item.primary ? " hm-pri" : ""}`}>{item.action}</span></div>
    </Link>
  );
}

function Attention({ strips }) {
  const [all, setAll] = useState(false);
  const [scroll, setScroll] = useState(false);
  const clip = useRef(null);
  const n = strips.length;
  useEffect(() => {
    if (!all) { setScroll(false); return; }
    const timer = setTimeout(() => setScroll(true), 520);
    return () => clearTimeout(timer);
  }, [all]);
  const toggle = () => {
    if (all) clip.current?.scrollTo({ top: 0, behavior: "smooth" });
    setAll(!all);
  };
  if (n === 0) {
    return (
      <Block title="Needs attention">
        <div className="hm-attn-empty">
          <span className="hm-ok"><Ic name="check" size={24} width={2.4} /></span>
          <div><h3>You’re all caught up</h3><p>Nothing needs your action right now. New items will appear here.</p></div>
        </div>
      </Block>
    );
  }
  const many = n > 3;
  const list = <div className="cx-strips">{strips.map((item) => <Strip key={item.key} item={item} />)}</div>;
  const label = all ? "Show less" : `Show all ${n}`;
  return (
    <Block title="Needs attention" cls={many ? "hm-attn" : ""} left={<span className="hm-cnt" title={`${n} items wait for your action`}>{n}</span>}>
      {many ? <div ref={clip} className={`hm-attn-clip${all ? " hm-open" : ""}${scroll ? " hm-scroll" : ""}`}>{list}</div> : list}
      {many && (
        <div className="hm-attn-more">
          <button type="button" className={`hm-attn-tgl${all ? " hm-open" : ""}`} title={label} aria-label={label} aria-expanded={all} onClick={toggle}><Ic name="chevd" size={18} /></button>
        </div>
      )}
    </Block>
  );
}

function Activity({ items }) {
  return (
    <Block title="Recent activity" cls="hm-flush">
      {items.length === 0 ? (
        <p className="hm-quiet">Nothing yet. Bookings, decisions and answers will show up here.</p>
      ) : (
        <div className="hm-fc">
          {items.map((item) => {
            const row = (
              <>
                <span className="hm-d"><Ic name="pulse" size={12} width={2.4} /></span>
                <b>{item.text}</b>
                <small>{item.when}</small>
              </>
            );
            return item.href ? <Link key={item.id} href={item.href} className="hm-fcr" style={{ "--tone": "var(--cx-mute)" }} title={item.text}>{row}</Link> : <div key={item.id} className="hm-fcr" style={{ "--tone": "var(--cx-mute)" }} title={item.text}>{row}</div>;
          })}
        </div>
      )}
    </Block>
  );
}

function Checklist({ steps, isNew, role }) {
  const done = steps.filter((step) => step.done).length;
  const all = done === steps.length;
  const sub = role === "dev"
    ? isNew ? "Get started: finish these steps to make your game ready for advertisers." : "Finish these to make your game ready for advertisers."
    : isNew ? "Get started: four steps to your first campaign." : "Four steps to your first campaign.";
  const win = role === "dev" ? "Ready for advertisers. Campaigns can start running in your game." : "Done. Your campaign is waiting for moderation.";
  return (
    <Block title={isNew ? "Welcome to DeusADS" : "Get started"} right={<small>{done} of {steps.length}</small>}>
      <div className="hm-setup">
        <p className="hm-sub">{sub}</p>
        <div className="hm-prog"><div className="hm-bar"><i style={{ width: `${(done / steps.length) * 100}%` }} /></div></div>
        {all && <div className="hm-win"><Ic name="check" size={18} width={2.6} /><span>{win}</span></div>}
        {steps.map((step) => (
          <div key={step.key} className={`hm-step${step.done ? " hm-done" : ""}${step.current ? " hm-cur" : ""}`}>
            <span className="hm-ck">{step.done ? "✓" : ""}</span>
            <div className="hm-tx"><b>{step.title}</b><small>{step.hint}</small></div>
            {!step.done && <Link href={step.href} className={`hm-btn hm-sm${step.current ? " hm-pri" : ""}`}>{step.action}</Link>}
          </div>
        ))}
      </div>
    </Block>
  );
}

function Guides({ role, nav }) {
  return (
    <Block title="Guides">
      <div className="hm-gds hm-ga">
        {GUIDE_CARDS[role].map(([title, text]) => (
          <Link key={title} href={`${HOME}/guides/${slugOf(title)}`} className="hm-sheet" onClick={(e) => nav(e, `${HOME}/guides/${slugOf(title)}`)}>
            <span className="hm-sh-eye">Guide</span>
            <h3>{title}</h3>
            <p>{text}</p>
            <span className="hm-sh-foot"><span>Read</span><Ic name="chevr" size={14} width={2.2} /></span>
          </Link>
        ))}
      </div>
    </Block>
  );
}

function News({ role, nav }) {
  const latest = LATEST[role];
  return (
    <Block title="What’s new">
      <div className="hm-news">
        <h3>{latest.title}</h3>
        <p>{latest.text}</p>
        <Link href={`${HOME}/news`} className="hm-link" onClick={(e) => nav(e, `${HOME}/news`)}>See all news →</Link>
      </div>
    </Block>
  );
}

function Tip({ role, active }) {
  const list = TIPS[role];
  const [index, setIndex] = useState(0);
  const [hover, setHover] = useState(false);
  const [lap, setLap] = useState(0); // restarts the thin progress line after the pointer leaves
  const text = useRef(null);
  const box = useRef(null);
  const busy = useRef(null);
  const n = list.length;

  const step = useCallback((by) => {
    const el = text.current;
    const frame = box.current;
    if (!el || !frame || reduced()) { setIndex((value) => (value + by + n) % n); return; }
    busy.current?.forEach((animation) => animation.cancel());
    const dx = by > 0 ? 18 : -18;
    const before = frame.offsetHeight;
    const out = el.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: `translateX(${-dx}px)` }], { duration: 170, easing: "ease-in", fill: "forwards" });
    busy.current = [out];
    out.onfinish = () => {
      flushSync(() => setIndex((value) => (value + by + n) % n));
      out.cancel();
      const after = frame.offsetHeight;
      const slide = el.animate([{ opacity: 0, transform: `translateX(${dx}px)` }, { opacity: 1, transform: "none" }], { duration: 320, easing: EASE });
      const grow = before !== after ? frame.animate([{ height: `${before}px` }, { height: `${after}px` }], { duration: 320, easing: EASE }) : null;
      busy.current = [slide, ...(grow ? [grow] : [])];
      slide.onfinish = () => { busy.current = null; };
    };
  }, [n]);

  useEffect(() => {
    if (hover || !active) return undefined;
    const timer = setTimeout(() => { if (!document.hidden) step(1); else setLap((value) => value + 1); }, TIP_MS);
    return () => clearTimeout(timer);
  }, [index, hover, lap, active, step]);

  const [title, body] = list[index % n];
  const nav = (
    <span className="hm-tip-nav">
      <button type="button" aria-label="Previous tip" onClick={() => step(-1)}><Ic name="chevl" size={14} /></button>
      <small>{(index % n) + 1} / {n}</small>
      <button type="button" aria-label="Next tip" onClick={() => step(1)}><Ic name="chevr" size={14} /></button>
    </span>
  );
  return (
    <section className="hm-panel hm-blk hm-tipblk" onMouseEnter={() => setHover(true)} onMouseLeave={() => { setHover(false); setLap((value) => value + 1); }}>
      <div className="hm-blk-h">
        <span className="hm-blk-ic"><Ic name="bulb" size={24} /></span>
        <h2>Tip</h2>
        <span className="hm-sp" />
        {nav}
      </div>
      <div className="hm-blk-b" ref={box}>
        <div className="hm-news" ref={text}><h3>{title}</h3><p>{body}</p></div>
      </div>
      <i key={`${index}-${lap}`} className="hm-tip-prog" style={{ animationDuration: `${TIP_MS}ms` }} />
    </section>
  );
}

/** The button that opens the list of blocks, with a checkbox for each. */
function Customize({ role, blocks, setBlocks }) {
  const [open, setOpen] = useState(false);
  const [down, setDown] = useState(false);
  const wrap = useRef(null);
  const shown = BLOCKS.filter(([key]) => blocks[key]).length;
  useEffect(() => {
    if (!open) return undefined;
    setDown(wrap.current ? wrap.current.getBoundingClientRect().top < 340 : false);
    const away = (event) => { if (wrap.current && !wrap.current.contains(event.target)) setOpen(false); };
    const key = (event) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", key);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", key); };
  }, [open]);
  const set = (next) => setBlocks(next);
  return (
    <div className="hm-wm" ref={wrap}>
      <button type="button" className="hm-wm-btn" title={`Customize Home · ${shown} of ${BLOCKS.length} blocks shown`} aria-label="Customize Home" aria-haspopup="true" aria-expanded={open} onClick={() => setOpen(!open)}>
        <Ic name="sliders" size={17} width={1.9} />
      </button>
      {open && (
        <div className={`hm-wm-pop${down ? " hm-down" : ""}`} role="group" aria-label="Home blocks">
          {BLOCKS.map(([key, label]) => (
            <button key={key} type="button" className="hm-wm-item" role="menuitemcheckbox" aria-checked={blocks[key]} onClick={() => set({ ...blocks, [key]: !blocks[key] })}>
              <span className={`hm-wm-box${blocks[key] ? " hm-on" : ""}`} />
              <span>{label}</span>
            </button>
          ))}
          <div className="hm-wm-foot">
            <button type="button" onClick={() => set(Object.fromEntries(BLOCKS.map(([key]) => [key, true])))}>Reset layout</button>
            <button type="button" onClick={() => set(Object.fromEntries(BLOCKS.map(([key]) => [key, false])))}>Clear all</button>
          </div>
        </div>
      )}
    </div>
  );
}

function HomeView({ role, data, blocks, setBlocks, nav, active }) {
  const isNew = data.mode === "new";
  const allDone = data.checklist.every((step) => step.done);
  const main = [];
  const side = [];
  const show = (key) => blocks[key];
  if (isNew) {
    if (show("setup")) main.push(<Checklist key="setup" steps={data.checklist} isNew role={role} />);
  } else {
    if (show("attention")) main.push(<Attention key="attention" strips={data.strips} />);
    if (show("activity")) side.push(<Activity key="activity" items={data.activity} />);
    if (show("setup") && !allDone) side.push(<Checklist key="setup" steps={data.checklist} isNew={false} role={role} />);
  }
  if (show("guides")) main.push(<Guides key="guides" role={role} nav={nav} />);
  if (show("news")) side.push(<News key="news" role={role} nav={nav} />);
  if (show("tips")) side.push(<Tip key="tips" role={role} active={active} />);
  const custom = <div className="hm-cust-end"><Customize role={role} blocks={blocks} setBlocks={setBlocks} /></div>;
  if (!main.length && !side.length) {
    return (
      <div className="hm-home-grid">
        <div className="hm-panel hm-stub"><h2>Everything is switched off</h2><p>Use the sliders button in the right corner to bring blocks back.</p></div>
        <div className="hm-col">{custom}</div>
      </div>
    );
  }
  return (
    <div className="hm-home-grid">
      <div className="hm-col">{main}</div>
      <div className="hm-col">{side}{custom}</div>
    </div>
  );
}

function GuideView({ role, slug, nav }) {
  const guide = guideBySlug(slug);
  const [thanks, setThanks] = useState(false);
  if (!guide) {
    return (
      <div className="hm-panel hm-stub"><h2>This guide does not exist</h2><Link href={HOME} className="hm-btn hm-pri" onClick={(e) => nav(e, HOME)}>← Back to Home</Link></div>
    );
  }
  const list = GUIDE_LIST[role] ?? GUIDE_LIST.dev;
  return (
    <>
      <div className="hm-bk-row"><Link href={HOME} className="hm-btn hm-sm hm-with-ic" onClick={(e) => nav(e, HOME)}><Ic name="chevl" size={14} width={2.2} />Home</Link></div>
      <div className="hm-rd-grid">
        <div className="hm-col">
          <Block title={guide.title} right={<small>{guide.min} min read</small>}>
            <p className="hm-art-intro">{guide.intro}</p>
            <ol className="hm-art-steps">
              {guide.steps.map(([head, text]) => <li key={head}><div><h3>{head}</h3><p>{text}</p></div></li>)}
            </ol>
            <div className="hm-art-note"><span><Ic name="flag" size={16} /></span><div><b>{guide.note[0]}</b> {guide.note[1]}</div></div>
            <div className="hm-art-foot">
              {thanks ? <span>Thanks for the feedback.</span> : <><span>Was this helpful?</span><button type="button" className="hm-btn" onClick={() => setThanks(true)}>Yes</button><button type="button" className="hm-btn" onClick={() => setThanks(true)}>Not really</button></>}
            </div>
          </Block>
        </div>
        <div className="hm-col">
          <Block title="More guides">
            <div className="hm-glist">
              {list.map((title) => (
                <Link key={title} href={`${HOME}/guides/${slugOf(title)}`} aria-current={title === guide.title} onClick={(e) => nav(e, `${HOME}/guides/${slugOf(title)}`)}>
                  <span>{title}</span><small>{ART[title].min} min</small>
                </Link>
              ))}
            </div>
          </Block>
        </div>
      </div>
    </>
  );
}

function Magazine({ item, collapse }) {
  const foot = (
    <div className="hm-mag-foot">
      <span className="hm-mag-sign">The DeusADS team</span>
      <button type="button" className="hm-nw-up" aria-label="Collapse" aria-expanded="true" onClick={collapse}><Ic name="chevu" size={16} width={2.2} /></button>
    </div>
  );
  if (item.items) {
    const groups = ["New", "Improved", "Fixed"].map((group) => [group, item.items.filter((entry) => entry[0] === group)]).filter((group) => group[1].length);
    return (
      <div className="hm-mag">
        <p className="hm-lead">{item.lead}</p>
        {groups.map(([group, entries]) => entries.map((entry, k) => (
          <section className="hm-mag-sec" key={`${group}${entry[1]}`}>
            <div className="hm-mag-eye">{k === 0 ? group : " "}</div>
            <h4>{entry[1]}</h4>
            <p>{entry[2]}</p>
          </section>
        )))}
        {foot}
      </div>
    );
  }
  return (
    <div className={`hm-mag${item.type === "important" ? " hm-warn" : ""}`}>
      {item.type === "important" && <div className="hm-mag-eye">What you need to know</div>}
      <p className="hm-lead">{item.body[0]}</p>
      {item.body.slice(1).map((text) => <p key={text}>{text}</p>)}
      {foot}
    </div>
  );
}

function NewsView({ role, nav }) {
  const all = NEWS[role];
  const [filter, setFilter] = useState("all");
  const [opened, setOpened] = useState({});
  const list = all.filter((item) => filter === "all" || item.type === filter);
  const count = (key) => (key === "all" ? all.length : all.filter((item) => item.type === key).length);
  const toggle = (id, row) => {
    const now = !opened[id];
    setOpened({ ...opened, [id]: now });
    if (!now && row) { const top = row.getBoundingClientRect().top; if (top < 40) window.scrollTo({ top: window.scrollY + top - 80, behavior: "smooth" }); }
  };
  const seg = (
    <span className="hm-fseg">
      {[["all", "All"], ["important", "Important"], ["patch", "Patches"], ["news", "News"]].map(([key, label]) => (
        <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}>{label} <em>{count(key)}</em></button>
      ))}
    </span>
  );
  return (
    <>
      <div className="hm-bk-row"><Link href={HOME} className="hm-btn hm-sm hm-with-ic" onClick={(e) => nav(e, HOME)}><Ic name="chevl" size={14} width={2.2} />Home</Link></div>
      <div className="hm-rel">
        <Block title="All news" right={seg} cls="hm-flush">
          {list.length === 0 ? <p className="hm-quiet">Nothing here yet.</p> : (
            <div className="hm-nwl">
              {list.map((item) => {
                const [label, , icon] = NTYPE[item.type];
                const open = Boolean(opened[item.id]);
                const has = Boolean(item.items || item.body);
                const lead = item.items ? item.lead : item.body ? item.body[0] : item.s;
                return (
                  <article key={item.id} className={`hm-nw${item.type === "important" ? " hm-imp" : ""}${open ? " hm-open" : ""}`}>
                    <span className="rd-tile"><Ic name={icon} size={17} /></span>
                    <div className="hm-nw-b">
                      <div className="hm-nw-t"><b>{item.t}</b><span className={`hm-pill ${PILL[item.type]}`}>{label}</span><small className="hm-nw-d">{item.d}</small></div>
                      <div className="hm-nw-sw"><div>
                        <div className="hm-nw-s" {...(has ? { role: "button", tabIndex: 0, "aria-expanded": open, onClick: (e) => toggle(item.id, e.currentTarget.closest(".hm-nw")), onKeyDown: (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggle(item.id, e.currentTarget.closest(".hm-nw")); } } } : {})}>
                          <p>{lead}</p>
                          {has && <span className="hm-nw-ch"><Ic name="chevd" size={16} width={2.2} /></span>}
                        </div>
                      </div></div>
                      {has && <div className="hm-nw-x"><div><Magazine item={item} collapse={(e) => toggle(item.id, e.currentTarget.closest(".hm-nw"))} /></div></div>}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </Block>
      </div>
    </>
  );
}

const TITLES = {
  home: (welcome) => ["Home", welcome],
  guide: (_, role) => ["Guides", `Step-by-step help for ${role === "dev" ? "developers" : "advertisers"}`],
  news: () => ["What’s new", "News, patches and announcements from the DeusADS team"],
};

export default function HomeApp({ role, data, welcome }) {
  const path = usePathname();
  const router = useRouter();
  const view = viewOf(path);
  const [blocks, setBlocksState] = useState(() => Object.fromEntries(BLOCKS.map(([key]) => [key, true])));
  const root = useRef(null);
  const pending = useRef(null);
  const previous = useRef(view.name);

  // What a person switched off stays off in this browser. The store holds both roles, as the mockup did.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE) || "null");
      if (saved?.[role]) setBlocksState((now) => ({ ...now, ...saved[role] }));
    } catch {}
  }, [role]);
  const setBlocks = (next) => {
    setBlocksState(next);
    try {
      const saved = JSON.parse(localStorage.getItem(STORE) || "null") || {};
      localStorage.setItem(STORE, JSON.stringify({ ...saved, [role]: next }));
    } catch {}
  };

  /** Follow a link inside the window; Home ↔ a guide or the news list slides, everything else just changes. */
  const nav = useCallback((event, href) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const target = viewOf(href).name;
    const from = viewOf(window.location.pathname).name;
    const read = ["guide", "news"];
    const dir = from === "home" && read.includes(target) ? 1 : read.includes(from) && target === "home" ? -1 : 0;
    if (dir && !reduced() && root.current) {
      const el = root.current;
      const rect = el.getBoundingClientRect();
      const ghost = document.createElement("div");
      ghost.className = el.className;
      ghost.dataset.view = el.dataset.view;
      ghost.style.cssText = `position:fixed;z-index:20;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;pointer-events:none;background:transparent;padding-bottom:0`;
      const header = el.querySelector(".main-head")?.cloneNode(true);
      if (header) { header.style.background = "transparent"; header.style.borderBottom = "0"; header.style.boxShadow = "none"; ghost.appendChild(header); }
      const work = el.querySelector(".hm-work")?.cloneNode(true);
      if (work) ghost.appendChild(work);
      document.body.appendChild(ghost);
      document.documentElement.style.overflowX = "hidden";
      const y0 = window.scrollY;
      if (y0 > 0) el.style.minHeight = `${rect.height}px`;
      pending.current = { dir, ghost, y0, head: el.querySelector(".main-head > div:first-child")?.getBoundingClientRect() };
    } else {
      window.scrollTo(0, 0);
    }
    router.push(href, { scroll: false });
  }, [router]);

  // The new view is on screen: slide it in, fade the ghost of the old one out.
  useLayoutEffect(() => {
    if (previous.current === view.name && !pending.current) return;
    previous.current = view.name;
    const job = pending.current;
    if (!job || !root.current) return;
    pending.current = null;
    const el = root.current;
    const { dir, ghost, y0 } = job;
    const D = 90, T = 480, OUT = "cubic-bezier(.3,.7,.4,1)", IN = "cubic-bezier(.22,1,.36,1)", F = "cubic-bezier(.4,0,.6,1)";
    const move = (node, from, to, easing, fill) => node.animate([{ transform: `translateX(${from}px)` }, { transform: `translateX(${to}px)` }], { duration: T, easing, fill });
    const fade = (node, from, to, duration, delay, fill) => node.animate([{ opacity: from }, { opacity: to }], { duration, delay, easing: F, fill });
    ghost.querySelectorAll(".main-head > div:first-child").forEach((node) => fade(node, 1, 0, T * 0.45, 0, "forwards"));
    ghost.querySelectorAll(".hm-work").forEach((node) => { move(node, 0, -dir * D, OUT, "forwards"); fade(node, 1, 0, T * 0.5, 0, "forwards"); });
    el.querySelectorAll(".main-head > div:first-child").forEach((node) => fade(node, 0, 1, T * 0.55, T * 0.15, "backwards"));
    el.querySelectorAll(".hm-work").forEach((node) => { move(node, dir * D, 0, IN, "backwards"); fade(node, 0, 1, T * 0.55, T * 0.12, "backwards"); });
    setTimeout(() => {
      ghost.remove();
      document.documentElement.style.overflowX = "";
      if (y0 > 0) { window.scrollTo({ top: 0, behavior: "smooth" }); setTimeout(() => { el.style.minHeight = ""; }, 700); }
    }, T + 40);
  }, [view.name, view.slug]);

  const [title, lede] = TITLES[view.name](welcome, role);
  return (
    <div ref={root} className="pg-ic pg-home hm" data-view={view.name}>
      <header className="main-head">
        <div><h1>{title}</h1><p className="lede">{lede}</p></div>
      </header>
      <div className="hm-work">
        {view.name === "home" && <HomeView role={role} data={data} blocks={blocks} setBlocks={setBlocks} nav={nav} active />}
        {view.name === "guide" && <GuideView role={role} slug={view.slug} nav={nav} />}
        {view.name === "news" && <NewsView role={role} nav={nav} />}
      </div>
    </div>
  );
}
