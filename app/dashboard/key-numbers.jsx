// The key numbers of a report: one hero figure (the headline) with a few lines under it, and the other figures around it.
// hero: { value, delta: { text, tone } | null, tail, perDay, bestLabel, best }   items: [{ icon, label, value, of?, sub }]
const ICON = {
  users: 'M9 4.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7zM2.5 20c.5-3.6 3.2-5.5 6.5-5.5s6 1.9 6.5 5.5M16 4.7a3.5 3.5 0 0 1 0 6.6M18 14.8c2 .6 3.3 2.3 3.5 5.2',
  clock: 'M12 7v5l3 2M12 3a9 9 0 100 18 9 9 0 000-18z',
  eye: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 9a3 3 0 100 6 3 3 0 000-6z',
  games: 'M3 7h18v11H3zM8 11v3M6.5 12.5h3',
  pulse: 'M3 12h4l2.5-6 4 12 2.5-6H21',
  user: 'M12 4a4 4 0 100 8 4 4 0 000-8zM4 21c1-6 15-6 16 0',
};

function Kpi({ icon, label, value, of, sub }) {
  return (
    <div className='cr-kpi'>
      <span className='cr-kpi-ic' aria-hidden='true'><svg width='16' height='16' viewBox='0 0 24 24'><path d={ICON[icon]} /></svg></span>
      <div>
        <span className='cr-kpi-label'>{label}</span>
        <span className='cr-kpi-value'>{value}{of ? <span className='cr-kpi-of'> {of}</span> : null}</span>
        <span className='cr-kpi-sub'>{sub}</span>
      </div>
    </div>
  );
}

export default function KeyNumbers({ hero, items }) {
  return (
    <section className='cr-num' aria-label='Key numbers'>
      <div className='cr-num-hero'>
        <div>
          <span className='cr-hero-label'>Impressions</span>
          <div className='cr-hero-value'>{hero.value}</div>
          <div className='cr-hero-delta'>
            {hero.delta ? <span className={`cr-pill-delta ov-${hero.delta.tone}`}>{hero.delta.text}</span> : null}
            <span>{hero.tail}</span>
          </div>
        </div>
        <div className='cr-hero-foot'>
          <div><span>Average per day</span><b>{hero.perDay}</b></div>
          <div><span>{hero.bestLabel}</span><b>{hero.best}</b></div>
        </div>
      </div>
      <div className='cr-kpis'>
        {items.map((item) => <Kpi key={item.label} {...item} />)}
      </div>
    </section>
  );
}
