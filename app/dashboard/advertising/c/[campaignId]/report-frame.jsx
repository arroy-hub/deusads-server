'use client';

import { createContext, useContext, useEffect, useRef, useState } from 'react';
import DeckBoard from '../../../deck-board';

const Ctx = createContext(null);

/** The button that hides or shows the Statistics panel. It sits in the report's toolbar plaque. */
export function StatToggle() {
  const ctx = useContext(Ctx);
  if (!ctx) return null;
  const tip = ctx.open ? 'Hide statistics' : 'Show statistics';
  return (
    <button type='button' className='cr-ib' data-tip={tip} aria-label={tip} aria-pressed={ctx.open} onClick={ctx.toggle}>
      <svg width='16' height='16' viewBox='0 0 24 24' aria-hidden='true'><path d='M4 20V10M10 20V4M16 20v-8M22 20H2' /></svg>
    </button>
  );
}

/**
 * The page of a campaign report: the numbers and boxes on the left, the Statistics panel (the widget board) floating at the
 * right. While a box sits beside the panel it stays left of it. A box marked data-fw that starts below the panel's lower
 * edge (or when the panel is hidden) stretches to the full width of the window. Measured after every size change.
 */
export default function ReportFrame({ initial, model, series, children }) {
  const [open, setOpen] = useState(initial?.open ?? true);
  const wrap = useRef(null);
  const left = useRef(null);
  const side = useRef(null);

  useEffect(() => {
    const box = wrap.current;
    const col = left.current;
    if (!box || !col) return undefined;
    let raf = 0;
    const fit = () => {
      raf = 0;
      const panel = side.current;
      const narrow = window.matchMedia('(max-width: 1100px)').matches;
      const on = open && !!panel && !narrow;
      const panelH = on ? panel.offsetHeight : 0;
      const shift = on ? panel.offsetWidth + 16 : 0;
      box.style.minHeight = on ? `${panelH}px` : '';
      for (const el of col.children) {
        const below = el.hasAttribute('data-fw') && el.offsetTop >= panelH + 12;
        const value = on && !below ? `${shift}px` : '';
        if (el.style.marginRight !== value) el.style.marginRight = value;
      }
    };
    const queue = () => { if (!raf) raf = requestAnimationFrame(fit); };
    const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(queue);
    if (ro) { ro.observe(box); ro.observe(col); if (side.current) ro.observe(side.current); }
    window.addEventListener('resize', queue);
    queue();
    return () => {
      if (raf) cancelAnimationFrame(raf);
      if (ro) ro.disconnect();
      window.removeEventListener('resize', queue);
    };
  }, [open]);

  return (
    <Ctx.Provider value={{ open, toggle: () => setOpen((v) => !v) }}>
      <div className='rf-wrap' ref={wrap}>
        <div className='rf-left' ref={left}>{children}</div>
        <aside className='rf-side' ref={side} hidden={!open} aria-label='Statistics'>
          <DeckBoard kind='advertiser' model={model} days={series} initial={initial} panel panelOpen={open} scope='Same period as the chart.' />
        </aside>
      </div>
    </Ctx.Provider>
  );
}
