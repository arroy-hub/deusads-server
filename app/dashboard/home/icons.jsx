// The line icons of Home (24 × 24 grid, drawn with the current text colour), the same set as the approved mockup.
const PATHS = {
  x: <path d="M6 6l12 12M18 6L6 18" />,
  home: <><path d="M3 11.5 12 4l9 7.5" /><path d="M5 10v10h5v-6h4v6h5V10" /></>,
  warn: <><path d="M12 3 2 20h20L12 3z" /><path d="M12 10v4M12 17.5h.01" /></>,
  plug: <><path d="M9 2v5M15 2v5M6 7h12v4a6 6 0 01-12 0V7zM12 17v5" /><path d="M3 3l18 18" /></>,
  mega: <><path d="M3 11v2a1 1 0 001 1h2l7 4V6L6 10H4a1 1 0 00-1 1z" /><path d="M17 9a4 4 0 010 6" /></>,
  chat: <path d="M21 12a8 8 0 01-11.6 7.1L4 20l1-4.6A8 8 0 1121 12z" />,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  image: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="1.6" /><path d="M21 16l-5-5-8 8" /></>,
  ban: <><circle cx="12" cy="12" r="9" /><path d="M5.6 5.6l12.8 12.8" /></>,
  trend: <><path d="M3 17l6-6 4 4 8-8" /><path d="M15 7h6v6" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  up: <path d="M12 19V5M5 12l7-7 7 7" />,
  book: <><path d="M4 4h10a4 4 0 014 4v12H8a4 4 0 01-4-4V4z" /><path d="M8 4v12" /></>,
  pause: <path d="M9 5v14M15 5v14" />,
  check: <path d="M5 12.5l4.5 4.5L19 7" />,
  flag: <path d="M5 21V4M5 4h11l-2 4 2 4H5" />,
  sliders: <><path d="M4 6h9M19 6h1M4 12h3M13 12h7M4 18h11M21 18h-1" /><circle cx="16" cy="6" r="2.4" /><circle cx="10" cy="12" r="2.4" /><circle cx="18" cy="18" r="2.4" /></>,
  chevl: <path d="M15 5l-7 7 7 7" />,
  chevr: <path d="M9 5l7 7-7 7" />,
  chevd: <path d="M5 9l7 7 7-7" />,
  chevu: <path d="M5 15l7-7 7 7" />,
  box: <><path d="M21 8l-9-5-9 5 9 5 9-5z" /><path d="M3 8v8l9 5 9-5V8M12 13v8" /></>,
  bulb: <><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 00-3.5 10.9c.7.6 1 1.3 1 2.1h5c0-.8.3-1.5 1-2.1A6 6 0 0012 3z" /></>,
  pulse: <path d="M3 12h4l3-8 4 16 3-8h4" />,
  alert: <><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5M12 16h.01" /></>,
  bell: <path d="M6 8a6 6 0 1112 0c0 7 3 8 3 8H3s3-1 3-8M10 20a2 2 0 004 0" />,
};

export default function Ic({ name, size = 20, width = 2 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {PATHS[name]}
    </svg>
  );
}
