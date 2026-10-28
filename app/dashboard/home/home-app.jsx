"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ART, GUIDE_CARDS, GUIDE_LIST, LATEST, NEWS, NTYPE, TIPS, guideBySlug, slugOf } from "../../../lib/home-content";
import Ic from "./icons";
import { GD0, GSPEC, PLATES, applyGlow, glowStyle } from "./glow";

// The blocks a person can switch on and off, in the order they appear in the menu.
const BLOCKS = [
  ["attention", "Needs attention", "na", "alert"],
  ["activity", "Recent activity", "ra", "pulse"],
  ["setup", "Get started checklist", "df", "flag"],
  ["guides", "Guides", "gp", "book"],
  ["news", "What’s new", "wn", "mega"],
  ["tips", "Tips", "tp", "bulb"],
];
const STORE = "deusads-home-blocks";
const TUNE = "deusads-home-c-tune-2"; // only what was changed in the Glow & gradients panel
const TIP_MS = 10000;
const EASE = "cubic-bezier(.4,0,.2,1)";
const HOME = "/dashboard/home";
const READ = ["guide", "news"];
const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const viewOf = (path) =>
  path.startsWith(`${HOME}/news`)
    ? { name: "news" }
    : path.startsWith(`${HOME}/guides/`)
      ? { name: "guide", slug: path.slice(`${HOME}/guides/`.length).split("/")[0] }
      : { name: "home" };
const TITLES = {
  home: ["Home", "Everything that needs you, in one place", "home"],
  guide: ["Guides", null, "book"],
  news: ["What’s new", "News, patches and announcements from the DeusADS team", "mega"],
};

/**
 * A block's head, built like the window header: a gradient band across the top, a white plate on it with the
 * icon tile and the title (plus the left slot), and the right slot on the band.
 */
function Head({ title, icon, left, right, under = null }) {
  return (
    <div className="blk-h bh">
      <span className="bh-band" aria-hidden="true" />
      {under}
      <div className="bh-plate">
        {icon && <span className="blk-ic"><Ic name={icon} size={24} /></span>}
        <h2>{title}</h2>
        {left}
      </div>
      <span className="sp" />
      {right && <span className="bh-r">{right}</span>}
    </div>
  );
}

/** One block of Home: the head, the optional left and right slots, and the body. */
function Block({ id, title, icon, left, right, cls = "", bodyCls = "", hide, children }) {
  const key = BLOCKS.find(([, label]) => label === title)?.[2] ?? id ?? "df";
  return (
    <section className={`panel blk${hide ? " hasx" : ""}${cls ? ` ${cls}` : ""}`} data-k={key}>
      {hide && (
        <button type="button" className="blk-x" onClick={hide} aria-label={`Hide ${title}`} data-tip="Hide this block">
          <Ic name="x" size={14} width={2.2} />
        </button>
      )}
      <Head title={title} icon={icon} left={left} right={right} />
      <div className={`blk-b ${bodyCls}`}>{children}</div>
    </section>
  );
}

function Strip({ item }) {
  return (
    <Link href={item.href} className="cx-strip" data-tone={item.tone} style={{ "--tone": `var(--cx-${item.tone})`, "--sh": "64px" }}>
      <div className="cx-scover"><div className="cx-pic" /></div>
      <div className="cx-splate">
        <span className="cx-ic"><span className="rd-tile"><Ic name={item.icon} size={20} /></span></span>
        <div className="cx-txt"><h3>{item.title}</h3><div className="cx-sub">{item.text}</div></div>
      </div>
      <div className="cx-right"><span className="cx-go" aria-hidden="true"><Ic name="chevr" size={17} width={2.2} /></span></div>
    </Link>
  );
}

/** Needs attention: three strips by default, the rest behind the chevron (a neat scroll after it opens). */
function Attention({ strips, hide }) {
  const [all, setAll] = useState(false);
  const [scroll, setScroll] = useState(false);
  const clip = useRef(null);
  const n = strips.length;
  useEffect(() => {
    if (!all) { setScroll(false); return undefined; }
    const timer = setTimeout(() => setScroll(true), 520);
    return () => clearTimeout(timer);
  }, [all]);
  if (n === 0) {
    return (
      <Block title="Needs attention" icon="alert" hide={hide}>
        <div className="attn-empty">
          <span className="ok"><Ic name="check" size={24} width={2.4} /></span>
          <div><h3>You’re all caught up</h3><p>Nothing needs your action right now. New items will appear here.</p></div>
        </div>
      </Block>
    );
  }
  const many = n > 3;
  const list = <div className="cx-strips">{strips.map((item) => <Strip key={item.key} item={item} />)}</div>;
  const label = all ? "Show less" : `Show all ${n}`;
  const toggle = () => {
    if (all) clip.current?.scrollTo({ top: 0, behavior: "smooth" });
    setAll(!all);
  };
  return (
    <Block title="Needs attention" icon="alert" hide={hide} cls="" bodyCls={many ? "attn" : ""} left={<span className="cnt" data-tip={`${n} items wait for your action`}>{n}</span>}>
      {many ? <div ref={clip} className={`attn-clip${all ? " open" : ""}${scroll ? " scroll" : ""}`}>{list}</div> : list}
      {many && (
        <div className="attn-more">
          <button type="button" className={`attn-tgl${all ? " open" : ""}`} data-tip={label} aria-label={label} aria-expanded={all} onClick={toggle}>
            <Ic name="chevd" size={18} />
          </button>
        </div>
      )}
    </Block>
  );
}

function Activity({ items, hide }) {
  return (
    <Block title="Recent activity" icon="pulse" hide={hide}>
      {items.length === 0 ? (
        <p className="sub">Nothing yet. Bookings, decisions and answers will show up here.</p>
      ) : (
        <div className="tl">
          {items.slice(0, 5).map((item) => {
            const row = (
              <>
                <span className="tl-d"><Ic name={item.icon || "pulse"} size={11} width={2.4} /></span>
                <div><b>{item.text}</b><small>{item.when}</small></div>
              </>
            );
            return item.href ? (
              <Link key={item.id} href={item.href} className="tli" style={{ "--tone": `var(--cx-${item.tone || "mute"})` }}>{row}</Link>
            ) : (
              <div key={item.id} className="tli" style={{ "--tone": `var(--cx-${item.tone || "mute"})` }}>{row}</div>
            );
          })}
        </div>
      )}
    </Block>
  );
}

function Checklist({ steps, isNew, role, hide }) {
  const done = steps.filter((step) => step.done).length;
  const all = done === steps.length;
  const sub = role === "dev"
    ? isNew ? "Get started: finish these steps to make your game ready for advertisers." : "Finish these to make your game ready for advertisers."
    : isNew ? "Get started: four steps to your first campaign." : "Four steps to your first campaign.";
  const win = role === "dev" ? "Ready for advertisers. Campaigns can start running in your game." : "Done. Your campaign is waiting for moderation.";
  return (
    <Block id="setup" title={isNew ? "Welcome to DeusADS" : "Get started"} icon="flag" hide={hide}>
      <div className="setup">
        <p className="sub">{sub}<small className="sub-n">{done} of {steps.length}</small></p>
        <div className="prog"><div className="bar"><i style={{ width: `${(done / steps.length) * 100}%` }} /></div></div>
        {all && <div className="win"><Ic name="check" size={18} width={2.6} /><span>{win}</span></div>}
        {steps.map((step) => (
          <div key={step.key} className={`step${step.done ? " done" : ""}${step.current ? " cur" : ""}`}>
            <span className="ck">{step.done ? <Ic name="check" size={14} width={3} /> : null}</span>
            <div className="tx"><b>{step.title}</b><small>{step.hint}</small></div>
            {!step.done && <Link href={step.href} className={`btn sm${step.current ? " pri" : ""}`}>{step.action}</Link>}
          </div>
        ))}
      </div>
    </Block>
  );
}

function Guides({ role, nav, hide }) {
  return (
    <Block title="Guides" icon="book" hide={hide} bodyCls="">
      <div className="gds ga">
        {GUIDE_CARDS[role].map(([title, text]) => (
          <Link key={title} href={`${HOME}/guides/${slugOf(title)}`} className="sheet" onClick={(e) => nav(e, `${HOME}/guides/${slugOf(title)}`)}>
            <span className="sh-eye">Guide</span>
            <h3>{title}</h3>
            <p>{text}</p>
            <span className="sh-foot"><span>Read</span><Ic name="chevr" size={14} width={2.2} /></span>
          </Link>
        ))}
      </div>
    </Block>
  );
}

function News({ role, nav, hide }) {
  const latest = LATEST[role];
  return (
    <Block title="What’s new" icon="mega" hide={hide}>
      <div className="news">
        <h3>{latest.title}</h3>
        <p>{latest.text}</p>
        <Link href={`${HOME}/news`} className="link" style={{ textAlign: "left" }} onClick={(e) => nav(e, `${HOME}/news`)}>See all news →</Link>
      </div>
    </Block>
  );
}

function Tip({ role, active, hide }) {
  const list = TIPS[role];
  const n = list.length;
  const [index, setIndex] = useState(0);
  const [hover, setHover] = useState(false);
  const [lap, setLap] = useState(0);
  const text = useRef(null);
  const box = useRef(null);
  const busy = useRef(null);

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
    <span className="tip-nav">
      <button type="button" aria-label="Previous tip" onClick={() => step(-1)}><Ic name="chevl" size={14} /></button>
      <small>{(index % n) + 1} / {n}</small>
      <button type="button" aria-label="Next tip" onClick={() => step(1)}><Ic name="chevr" size={14} /></button>
    </span>
  );
  return (
    <section className="panel blk hasx tipblk" data-k="tp" onMouseEnter={() => setHover(true)} onMouseLeave={() => { setHover(false); setLap((value) => value + 1); }}>
      {hide && (
        <button type="button" className="blk-x" onClick={hide} aria-label="Hide Tip" data-tip="Hide this block">
          <Ic name="x" size={14} width={2.2} />
        </button>
      )}
      <Head title="Tip" icon="bulb" left={nav} under={<i key={`${index}-${lap}`} className="tip-prog" style={{ animationDuration: `${TIP_MS}ms` }} />} />
      <div className="blk-b" ref={box}>
        <div className="news" ref={text}><h3>{title}</h3><p>{body}</p></div>
      </div>
    </section>
  );
}

/** The Customize control: a block list with checkboxes, plus the Glow & gradients panel. */
function Customize({ blocks, setBlocks, open, setOpen, skip = [] }) {
  const list = BLOCKS.filter(([key]) => !skip.includes(key));
  const wrap = useRef(null);
  const [down, setDown] = useState(false);
  useLayoutEffect(() => { if (open && wrap.current) setDown(wrap.current.getBoundingClientRect().top < 340); }, [open]);
  const on = list.filter(([key]) => blocks[key]).length;
  useEffect(() => {
    if (!open) return undefined;
    const close = (event) => { if (!wrap.current?.contains(event.target)) setOpen(false); };
    const esc = (event) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("click", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("click", close); document.removeEventListener("keydown", esc); };
  }, [open]);
  return (
    <div className="cust-end">
      <div className="wm" ref={wrap}>
        <button type="button" className="wm-btn" onClick={() => setOpen(!open)} data-tip={`Customize Home · ${on} of ${list.length} blocks shown`} aria-label="Customize Home" aria-haspopup="true" aria-expanded={open}>
          <Ic name="sliders" size={17} width={1.9} />
        </button>
        {open && (
          <div className={`wm-pop${down ? " down" : ""}`} role="group" aria-label="Home blocks">
            {list.map(([key, label]) => (
              <button key={key} type="button" className="wm-item" role="menuitemcheckbox" aria-checked={!!blocks[key]} onClick={() => setBlocks({ ...blocks, [key]: !blocks[key] })}>
                <span className={`wm-box${blocks[key] ? " on" : ""}`} />
                <span>{label}</span>
              </button>
            ))}
            <div className="wm-foot">
              <button type="button" onClick={() => setBlocks(Object.fromEntries(BLOCKS.map(([key]) => [key, true])))}>Reset layout</button>
              <button type="button" onClick={() => setBlocks({ ...blocks, ...Object.fromEntries(list.map(([key]) => [key, false])) })}>Clear all</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/** Glow & gradients: one master slider for all plates, then each plate on its own. Values live on the Home root. */
function GlowPanel({ values, setValue, reset, close }) {
  return (
    <div className="blk-pop" role="dialog" aria-label="Glow and gradients">
      {Object.keys(GSPEC).map((key) => (
        <div key={key}>
          <h4 className="g">{GSPEC[key][0]}</h4>
          {GSPEC[key][1].map(([field, label, min, max, step]) => (
            <label key={field} className="gl-row">
              {label}
              {min === "c" ? (
                <input type="color" value={values[key][field]} onChange={(e) => setValue(key, field, e.target.value)} />
              ) : (
                <input type="range" min={min} max={max} step={step} value={values[key][field]} onChange={(e) => setValue(key, field, +e.target.value)} />
              )}
              <output>{values[key][field]}</output>
            </label>
          ))}
        </div>
      ))}
      <div className="gl-foot">
        <button type="button" onClick={() => navigator.clipboard?.writeText(JSON.stringify(values))}>Copy settings</button>
        <button type="button" onClick={reset}>Reset all</button>
        <button type="button" onClick={close}>Close</button>
      </div>
    </div>
  );
}

function HomeView({ role, data, blocks, setBlocks, nav, hello, isNew, custOpen, setCustOpen }) {
  const main = [];
  const side = [];
  const steps = data.checklist;
  const allDone = steps.every((step) => step.done);
  const hideOf = (key) => () => setBlocks({ ...blocks, [key]: false });
  // Until the whole Get started path is done, Get started stands in place of Needs attention,
  // and neither Needs attention nor Recent activity is shown.
  if (!allDone) {
    if (blocks.setup) main.push(<Checklist key="setup" steps={steps} isNew={isNew} role={role} hide={hideOf("setup")} />);
  } else {
    if (blocks.attention) main.push(<Attention key="attention" strips={data.strips} hide={hideOf("attention")} />);
  }
  if (blocks.guides) main.push(<Guides key="guides" role={role} nav={nav} hide={hideOf("guides")} />);
  // The right column: What's new and Tip always sit above Recent activity.
  if (blocks.news) side.push(<News key="news" role={role} nav={nav} hide={hideOf("news")} />);
  if (blocks.tips) side.push(<Tip key="tips" role={role} active hide={hideOf("tips")} />);
  if (allDone && blocks.activity) side.push(<Activity key="activity" items={data.activity} hide={hideOf("activity")} />);
  const empty = !main.length && !side.length;
  // until Get started is done, Needs attention and Recent activity are not offered in Customize either
  const skip = allDone ? [] : ["attention", "activity"];
  return (
    <>
      {hello}
      {empty ? (
        <div className="home-grid off">
          <Customize blocks={blocks} setBlocks={setBlocks} open={custOpen} setOpen={setCustOpen} skip={skip} />
          <div className="panel off-box"><span className="off-ic"><Ic name="sliders" size={26} width={1.8} /></span><h2>Widgets are switched off</h2></div>
        </div>
      ) : (
        <div className="home-grid">
          <div className="col">{main}</div>
          <div className="col">
            {side}
            <Customize blocks={blocks} setBlocks={setBlocks} open={custOpen} setOpen={setCustOpen} skip={skip} />
          </div>
        </div>
      )}
    </>
  );
}

function GuideView({ role, slug, nav }) {
  const guide = guideBySlug(slug);
  if (!guide) {
    return (
      <div className="panel stub">
        <h2>This guide is not here</h2>
        <Link href={HOME} className="btn pri" onClick={(e) => nav(e, HOME)}>← Back to Home</Link>
      </div>
    );
  }
  const list = GUIDE_LIST[role];
  return (
    <>
      <div className="bk-row">
        <Link href={HOME} className="btn sm with-ic" onClick={(e) => nav(e, HOME)}><Ic name="chevl" size={14} width={2.2} />Home</Link>
      </div>
      <div className="rd-grid">
        <div className="col">
          <section className="panel blk" data-k="df">
            <Head title={guide.title} icon="book" right={<small>{guide.min} min read</small>} />
            <div className="blk-b">
              <p className="art-intro">{guide.intro}</p>
              <ol className="art-steps">
                {guide.steps.map(([head, text]) => (
                  <li key={head}><div><h3>{head}</h3><p>{text}</p></div></li>
                ))}
              </ol>
              <div className="art-note"><div><b>{guide.note[0]}</b> {guide.note[1]}</div></div>
              <div className="art-foot">
                <span>Was this helpful?</span>
                <button type="button" className="btn" onClick={() => toast("Thanks for the feedback")}>Yes</button>
                <button type="button" className="btn" onClick={() => toast("Thanks for the feedback")}>Not really</button>
              </div>
            </div>
          </section>
        </div>
        <div className="col">
          <section className="panel blk" data-k="df">
            <Head title="More guides" icon="book" />
            <div className="blk-b">
              <div className="glist">
                {list.map((title) => {
                  const href = `${HOME}/guides/${slugOf(title)}`;
                  return (
                    <button key={title} type="button" aria-current={title === guide.title} onClick={(e) => nav(e, href)}>
                      <span>{title}</span><small>{ART[title].min} min</small>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>
          <section className="panel blk" data-k="df">
            <Head title="Still stuck?" icon="chat" />
            <div className="blk-b">
              <p style={{ fontSize: 13.5, color: "var(--ink-2)", marginBottom: 10 }}>Write to us and we will answer in My requests.</p>
              <Link href="/dashboard/support" className="btn sm">Ask for help</Link>
            </div>
          </section>
        </div>
      </div>
    </>
  );
}

function Magazine({ item, collapse, open }) {
  const foot = (
    <div className="mag-foot">
      <span className="mag-sign">The DeusADS team</span>
      <button type="button" className="nw-up" onClick={collapse} aria-label="Collapse" aria-expanded={open}><Ic name="chevu" size={16} width={2.2} /></button>
    </div>
  );
  if (item.items) {
    return (
      <div className="mag mag-h">
        <div className="mag-head"><p className="lead">{item.lead}</p></div>
        <div className="mag-body">
          <div className="chg">
            {item.items.map(([tag, title, text]) => (
              <section key={title} className="chg-i">
                <span className={`chg-t chg-${tag.toLowerCase()}`}>{tag}</span>
                <div><h4>{title}</h4><p>{text}</p></div>
              </section>
            ))}
          </div>
          {foot}
        </div>
      </div>
    );
  }
  return (
    <div className={`mag${item.type === "important" ? " warn" : ""}`}>
      {item.type === "important" && <div className="mag-eye">What you need to know</div>}
      <p className="lead">{item.body[0]}</p>
      {item.body.slice(1).map((line) => <p key={line}>{line}</p>)}
      {foot}
    </div>
  );
}

function NewsView({ role, nav, open, toggle, filter, setFilter }) {
  const all = NEWS[role];
  const list = all.filter((item) => filter === "all" || item.type === filter);
  const count = (key) => (key === "all" ? all.length : all.filter((item) => item.type === key).length);
  const seg = (
    <span className="fseg">
      {[["all", "All"], ["important", "Important"], ["patch", "Patches"], ["news", "News"]].map(([key, label]) => (
        <button key={key} type="button" aria-pressed={filter === key} onClick={() => setFilter(key)}>{label} <em>{count(key)}</em></button>
      ))}
    </span>
  );
  return (
    <>
      <div className="rel">
        <section className="panel blk" data-k="df">
          <Head title="All news" icon="mega" right={seg} />
          <div className="blk-b flush">
            {list.length ? (
              <div className="nwl">
                {list.map((item) => {
                  const [label, tone, icon] = NTYPE[item.type];
                  const isOpen = !!open[item.id];
                  const has = !!(item.items || item.body);
                  const lead = item.items ? item.lead : item.body ? item.body[0] : item.s;
                  const pill = { important: "warn", patch: "info", news: "brand" }[item.type];
                  const expand = () => toggle(item.id);
                  return (
                    <article key={item.id} className={`nw${item.type === "important" ? " imp" : ""}${item.type === "news" ? " nws" : ""}${isOpen ? " open" : ""}`}>
                      <span className="rd-tile"><Ic name={icon} size={17} width={2} /></span>
                      <div className="nw-b">
                        <div className="nw-t">
                          <b>{item.t}</b>
                          <span className={`pill ${pill}`}>{label}</span>
                          <small className="nw-d">{item.d}</small>
                        </div>
                        <div className="nw-sw">
                          <div>
                            <div className="nw-s" role={has ? "button" : undefined} tabIndex={has ? 0 : undefined} aria-expanded={has ? isOpen : undefined} onClick={has ? expand : undefined} onKeyDown={has ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); expand(); } } : undefined}>
                              <p>{lead}</p>
                              {has && <span className="nw-ch"><Ic name="chevd" size={16} width={2.2} /></span>}
                            </div>
                          </div>
                        </div>
                        {has && <div className="nw-x"><div><Magazine item={item} open={isOpen} collapse={expand} /></div></div>}
                      </div>
                    </article>
                  );
                })}
              </div>
            ) : (
              <p style={{ color: "var(--ink-3)" }}>Nothing here yet.</p>
            )}
          </div>
        </section>
      </div>
      <div className="bk-row bk-under">
        <Link href={HOME} className="btn sm bk-arrow" aria-label="Back to Home" data-tip="Back to Home" onClick={(e) => nav(e, HOME)}><Ic name="arrowl" size={18} width={2.2} /></Link>
      </div>
    </>
  );
}

/**
 * The greeting title stays on one line: when the name is too long for the space, the font shrinks until it fits
 * (never below 24px). Refits on resize and when the fonts finish loading.
 */
function FitTitle({ children }) {
  const ref = useRef(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const fit = () => {
      el.style.fontSize = "";
      const max = parseFloat(getComputedStyle(el).fontSize);
      let size = max;
      if (el.scrollWidth > el.clientWidth) size = Math.max(24, Math.floor((max * el.clientWidth) / el.scrollWidth));
      el.style.fontSize = size === max ? "" : `${size}px`;
      while (el.scrollWidth > el.clientWidth && size > 24) { size -= 1; el.style.fontSize = `${size}px`; }
    };
    fit();
    const watch = typeof ResizeObserver !== "undefined" ? new ResizeObserver(fit) : null;
    watch?.observe(el);
    document.fonts?.ready.then(fit).catch(() => {});
    window.addEventListener("hello-refit", fit);
    return () => { watch?.disconnect(); window.removeEventListener("hello-refit", fit); };
  }, [children]);
  return <h2 ref={ref} className="hello-t">{children}</h2>;
}

let toastTimer = null;
function toast(message) {
  if (typeof document === "undefined") return;
  const el = document.createElement("div");
  el.className = "toast";
  el.textContent = message;
  (document.querySelector(".hm") || document.body).appendChild(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), 2000);
}

export default function HomeApp({ role, data, name, today }) {
  const path = usePathname();
  const router = useRouter();
  const view = viewOf(path);
  const isNew = data.mode === "new";
  const [blocks, setBlocksState] = useState(() => Object.fromEntries(BLOCKS.map(([key]) => [key, true])));
  const [glow, setGlow] = useState(GD0);
  const [glowOpen, setGlowOpen] = useState(false);
  const [custOpen, setCustOpen] = useState(false);
  const [open, setOpen] = useState({});
  const [filter, setFilter] = useState("all");
  const root = useRef(null);
  const pending = useRef(null);
  const previous = useRef(view.name);

  // What a person switched off stays off in this browser.
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE) || "null");
      if (saved?.[role]) setBlocksState((now) => ({ ...now, ...saved[role] }));
    } catch {}
    try {
      const tune = JSON.parse(localStorage.getItem(TUNE) || "null");
      if (tune) setGlow((now) => Object.fromEntries(Object.keys(now).map((key) => [key, { ...now[key], ...(tune[key] || {}) }])));
    } catch {}
  }, [role]);
  useEffect(() => { if (new URLSearchParams(window.location.search).has("tune")) setGlowOpen(true); }, []);
  const tip = useRef(null);
  useEffect(() => {
    const el = root.current;
    const box = tip.current;
    if (!el || !box) return undefined;
    const over = (event) => {
      const host = event.target.closest?.("[data-tip]");
      if (!host || !el.contains(host)) { box.style.opacity = 0; return; }
      box.textContent = host.dataset.tip;
      box.style.opacity = 1;
      const r = host.getBoundingClientRect();
      const w = box.offsetWidth;
      const h = box.offsetHeight;
      const x = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), window.innerWidth - w - 8);
      let y = r.top - h - 8;
      if (y < 8) y = r.bottom + 8;
      box.style.left = `${x}px`;
      box.style.top = `${y}px`;
    };
    const hide = () => { box.style.opacity = 0; };
    document.addEventListener("mouseover", over);
    window.addEventListener("scroll", hide, true);
    return () => { document.removeEventListener("mouseover", over); window.removeEventListener("scroll", hide, true); };
  }, []);
  useEffect(() => { applyGlow(glow, root.current); }, [glow]);
  const saveTune = (next) => { try { localStorage.setItem(TUNE, JSON.stringify(next)); } catch {} };

  const setBlocks = (next) => {
    setBlocksState(next);
    try {
      const saved = JSON.parse(localStorage.getItem(STORE) || "null") || {};
      localStorage.setItem(STORE, JSON.stringify({ ...saved, [role]: next }));
    } catch {}
  };

  const setValue = (key, field, value) => setGlow((now) => {
    const next = { ...now, [key]: { ...now[key], [field]: value } };
    if (key === "all") PLATES.forEach((plate) => { next[plate] = { ...next[plate], [field]: value }; });
    saveTune(next);
    return next;
  });

  /** Follow a link inside the window; Home ↔ a guide or the news list slides, everything else just changes. */
  const nav = useCallback((event, href) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    const target = viewOf(href).name;
    const from = viewOf(window.location.pathname).name;
    const dir = from === "home" && READ.includes(target) ? 1 : READ.includes(from) && target === "home" ? -1 : 0;
    if (dir && !reduced() && root.current) {
      const el = root.current;
      const rect = el.getBoundingClientRect();
      const oldPlate = el.querySelector(".plate");
      const oldW = oldPlate ? oldPlate.getBoundingClientRect().width : 0;
      const ghost = el.cloneNode(true);
      ghost.querySelectorAll("[id]").forEach((node) => node.removeAttribute("id"));
      ghost.style.cssText = `position:fixed;z-index:20;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;pointer-events:none;background:transparent`;
      const gh = ghost.querySelector(".hdr");
      if (gh) { gh.style.background = "transparent"; gh.style.borderBottom = "0"; gh.querySelector(".cover")?.remove(); }
      const gp = ghost.querySelector(".plate");
      if (gp) { gp.style.background = "transparent"; gp.style.boxShadow = "none"; }
      document.body.appendChild(ghost);
      document.documentElement.style.overflowX = "hidden";
      const y0 = window.scrollY;
      if (y0 > 0) el.style.minHeight = `${rect.height}px`;
      pending.current = { dir, ghost, y0, oldW };
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
    const { dir, ghost, y0, oldW } = job;
    const D = 90, T = 480, OUT = "cubic-bezier(.3,.7,.4,1)", IN = "cubic-bezier(.22,1,.36,1)", F = "cubic-bezier(.4,0,.6,1)";
    const move = (node, from, to, easing, fill) => node.animate([{ transform: `translateX(${from}px)` }, { transform: `translateX(${to}px)` }], { duration: T, easing, fill });
    const fade = (node, from, to, duration, delay, fill) => node.animate([{ opacity: from }, { opacity: to }], { duration, delay, easing: F, fill });
    ghost.querySelectorAll(".plate-ic, .plate > div").forEach((node) => fade(node, 1, 0, T * 0.45, 0, "forwards"));
    ghost.querySelectorAll(".hm-work").forEach((node) => { move(node, 0, -dir * D, OUT, "forwards"); fade(node, 1, 0, T * 0.5, 0, "forwards"); });
    el.querySelectorAll(".hm-work").forEach((node) => { move(node, dir * D, 0, IN, "backwards"); fade(node, 0, 1, T * 0.55, T * 0.12, "backwards"); });
    const plate = el.querySelector(".plate");
    if (plate) {
      const nw = plate.getBoundingClientRect().width;
      plate.querySelectorAll(".plate-ic, .plate > div").forEach((node) => fade(node, 0, 1, T * 0.55, T * 0.15, "backwards"));
      if (oldW && Math.abs(oldW - nw) > 1) { plate.style.overflow = "hidden"; const grow = plate.animate([{ width: `${oldW}px` }, { width: `${nw}px` }], { duration: T, easing: IN }); grow.onfinish = () => { plate.style.overflow = ""; }; }
    }
    setTimeout(() => {
      ghost.remove();
      document.documentElement.style.overflowX = "";
      if (y0 > 0) { window.scrollTo({ top: 0, behavior: "smooth" }); setTimeout(() => { el.style.minHeight = ""; }, 700); }
    }, T + 40);
  }, [view.name, view.slug]);

  const toggleOpen = (id) => setOpen((now) => ({ ...now, [id]: !now[id] }));
  const hello = (
    <section className="hello">
      <div className="hello-eye">{today}</div>
      <FitTitle>{`${isNew ? "Welcome, " : "Welcome back, "}${name}`}</FitTitle>
      <p>Take a look at what needs your attention, or set up the widgets the way you like.</p>
    </section>
  );

  const [title, lede, icon] = view.name === "guide"
    ? ["Guides", `Step-by-step help for ${role === "dev" ? "developers" : "advertisers"}`, "book"]
    : TITLES[view.name];
  return (
    <div ref={root} className="hm lb pg" data-view={view.name} style={glowStyle(glow)}>
      <div className="hdr">
        <div className="cover"><i /></div>
        <div className="plate-row">
          <div className="plate">
            <span className="plate-ic"><Ic name={icon} size={26} /></span>
            <div><h1>{title}</h1><small>{lede}</small></div>
          </div>
        </div>
        <div style={{ height: 22 }} />
      </div>
      <div className="work hm-work">
        {view.name === "home" && (
          <HomeView role={role} data={data} blocks={blocks} setBlocks={setBlocks} nav={nav} hello={hello} isNew={isNew} custOpen={custOpen} setCustOpen={setCustOpen} />
        )}
        {view.name === "guide" && <GuideView role={role} slug={view.slug} nav={nav} />}
        {view.name === "news" && <NewsView role={role} nav={nav} open={open} toggle={toggleOpen} filter={filter} setFilter={setFilter} />}
      </div>
      <div id="tip" ref={tip} role="tooltip" />
      {glowOpen && <GlowPanel values={glow} setValue={setValue} reset={() => { setGlow(GD0); try { localStorage.removeItem(TUNE); } catch {} }} close={() => setGlowOpen(false)} />}
    </div>
  );
}
