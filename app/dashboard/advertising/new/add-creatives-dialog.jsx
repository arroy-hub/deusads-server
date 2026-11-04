"use client";

import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import { FORMATS } from '../../../../lib/formats';
import { shapesCovered } from '../../../../lib/wizard-preview';

/**
 * The pop-up for adding creatives to a campaign from its review step: every creative of the library that is not in the
 * campaign yet, as picture cards to look at and tick (several at once), with a search once the library is long and a
 * first card to upload a new one. Nothing changes until 'Add' is pressed.
 */
export default function AddCreativesDialog({ items, onAdd, onUpload, onClose }) {
  const ref = useRef(null);
  const [chosen, setChosen] = useState([]);
  const [query, setQuery] = useState('');
  useLayoutEffect(() => { if (ref.current && !ref.current.open) ref.current.showModal(); }, []);
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? items.filter((item) => item.name.toLowerCase().includes(needle)) : items;
  }, [items, query]);
  const toggle = (id) => setChosen((ids) => (ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id]));
  const count = chosen.length;
  return (
    <dialog ref={ref} className='modal rd-dialog nwc-adlg' aria-labelledby='nwc-ad-title' onClose={onClose} onClick={(event) => { if (event.target === ref.current) ref.current.close(); }}>
      <div className='modal-box'>
        <div className='rd-dhead'>
          <div><h2 id='nwc-ad-title'>Add creatives</h2><p className='rd-dsub'>Tick the ones to run in this campaign. They are shown next to the ones already in it.</p></div>
          <button type='button' className='modal-close' aria-label='Close' onClick={() => ref.current?.close()}>&times;</button>
        </div>
        <div className='modal-body'>
          {items.length > 6 && (
            <input type='search' className='nwc-adsearch' placeholder='Search your creatives' aria-label='Search your creatives' value={query} onChange={(event) => setQuery(event.target.value)} />
          )}
          <ul className='nwc-adgrid'>
            <li>
              <button type='button' className='nwc-adcard is-new' onClick={() => { onUpload(); ref.current?.close(); }}>
                <span className='nwc-adpic'><span className='nwc-adplus' aria-hidden='true'>+</span></span>
                <b>Upload a new creative</b>
                <small>A PNG or JPG. It joins your library and this campaign.</small>
              </button>
            </li>
            {shown.map((item) => {
              const on = chosen.includes(item.id);
              return (
                <li key={item.id}>
                  <button type='button' className={`nwc-adcard${on ? ' is-on' : ''}`} role='checkbox' aria-checked={on} onClick={() => toggle(item.id)}>
                    <span className='nwc-adpic' style={{ backgroundImage: item.url ? `url('${item.url}')` : undefined }}>
                      <span className='nwc-adtick' aria-hidden='true'>{on ? '✓' : ''}</span>
                      {item.status !== 'approved' && <span className='nwc-adflag'>In review</span>}
                    </span>
                    <b>{item.name}</b>
                    <small>{`${shapesCovered(item)} of ${FORMATS.length} shapes`}</small>
                  </button>
                </li>
              );
            })}
          </ul>
          {shown.length === 0 && <p className='rd-dsub nwc-adnone'>{items.length === 0 ? 'Every creative of your library is already in this campaign.' : 'No creative matches this search.'}</p>}
        </div>
        <div className='modal-foot'>
          <span className='muted-line'>{count === 0 ? 'Nothing ticked yet.' : `${count} ticked`}</span>
          <button type='button' className='button button-quiet' onClick={() => ref.current?.close()}>Cancel</button>
          <button type='button' className='button' disabled={count === 0} onClick={() => { onAdd(chosen); ref.current?.close(); }}>{count > 1 ? `Add ${count} creatives` : 'Add to campaign'}</button>
        </div>
      </div>
    </dialog>
  );
}
