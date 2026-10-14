const P = (d, extra = {}) => ({ size = 16, ...rest }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...extra} {...rest}><path d={d} /></svg>
);
export const IcPause = P("M8 5v14M16 5v14");
export const IcPlay = P("M7 4l13 8-13 8z");
export const IcStop = P("M6 6h12v12H6z");
export const IcCopy = P("M9 9h11v11H9zM5 15V4h11");
export const IcReport = P("M4 19V5M4 5h12l-2 4 2 4H4");
export const IcGrid = P("M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z");
export const IcGear = P("M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 01-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 010-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 014 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 010 4h-.1a1.7 1.7 0 00-1.5 1z");
export const IcFolder = P("M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z");
export const IcFolderPlus = P("M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2zM12 11v5M9.5 13.5h5");
export const IcPencil = P("M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4");
export const IcTrash = P("M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13");
export const IcChevron = P("M6 9l6 6 6-6");
export const IcCaret = P("M9 6l6 6-6 6");
export const IcPlus = P("M12 5v14M5 12h14");
export const IcUpload = P("M12 16V4M7 9l5-5 5 5M4 20h16");
export const IcImage = P("M4 5h16v14H4zM4 16l5-5 4 4 3-3 4 4M9 9h.01");
export const IcLibrary = P("M4 5h16v14H4zM4 9h16M9 9v10");
export const IcGrip = ({ size = 16 }) => (<svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="9" cy="6" r="1.6" /><circle cx="15" cy="6" r="1.6" /><circle cx="9" cy="12" r="1.6" /><circle cx="15" cy="12" r="1.6" /><circle cx="9" cy="18" r="1.6" /><circle cx="15" cy="18" r="1.6" /></svg>);
export const IcCheck = P("M5 12l5 5 9-10");
export const IcWarn = P("M12 4l9 16H3zM12 10v4M12 17h.01");
export const IcMore = ({ size = 18 }) => (<svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>);
export const IcMove = P("M12 3v18M3 12h18M8 7l4-4 4 4M8 17l4 4 4-4M7 8l-4 4 4 4M17 8l4 4-4 4");
export const IcCalendar = P("M5 6h14v14H5zM5 10h14M9 3v5M15 3v5");
export const IcPen = IcPencil;
