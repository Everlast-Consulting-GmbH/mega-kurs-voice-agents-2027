// Small line icons for the app windows (24px grid, stroke follows currentColor).

type P = { size?: number; className?: string; style?: React.CSSProperties };

const base = (size: number) => ({ width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const });

export const Inbox = ({ size = 18, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M3 13l2.5-7.5A2 2 0 0 1 7.4 4h9.2a2 2 0 0 1 1.9 1.5L21 13v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
    <path d="M3 13h5l1.5 2.5h5L16 13h5" />
  </svg>
);
export const Star = ({ size = 18, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z" />
  </svg>
);
export const Send = ({ size = 18, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M21 3L10 14M21 3l-7 18-4-7-7-4z" />
  </svg>
);
export const File = ({ size = 18, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
    <path d="M14 3v5h5" />
  </svg>
);
export const Pencil = ({ size = 18, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M4 20h4L19 9l-4-4L4 16z" />
  </svg>
);
export const Search = ({ size = 18, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="M20 20l-4.2-4.2" />
  </svg>
);
export const Reply = ({ size = 18, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M10 8L4 13l6 5" />
    <path d="M4 13h10a6 6 0 0 1 6 6" />
  </svg>
);
export const Check = ({ size = 18, ...p }: P) => (
  <svg {...base(size)} strokeWidth={2.4} {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </svg>
);
export const Chevron = ({ size = 18, dir = "down", ...p }: P & { dir?: "down" | "left" | "right" }) => (
  <svg {...base(size)} {...p}>
    <path d={dir === "down" ? "M6 9l6 6 6-6" : dir === "left" ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"} />
  </svg>
);
export const Paperclip = ({ size = 18, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M20 11.5l-8 8a5 5 0 0 1-7-7l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7L9.7 17.2a1.7 1.7 0 0 1-2.4-2.4L15 7" />
  </svg>
);
export const Smile = ({ size = 18, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M8.5 14.5a4.5 4.5 0 0 0 7 0M9 10h.01M15 10h.01" />
  </svg>
);
export const At = ({ size = 18, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <circle cx="12" cy="12" r="3.5" />
    <path d="M15.5 12v1.5a2.5 2.5 0 0 0 5 0V12a8.5 8.5 0 1 0-3.5 6.9" />
  </svg>
);
export const Plus = ({ size = 18, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const Bold = ({ size = 18, ...p }: P) => (
  <svg {...base(size)} strokeWidth={2.2} {...p}>
    <path d="M7 5h6a3.5 3.5 0 0 1 0 7H7zM7 12h7a3.5 3.5 0 0 1 0 7H7z" />
  </svg>
);
export const Bell = ({ size = 18, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0" />
  </svg>
);
export const Calendar = ({ size = 18, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </svg>
);
export const Filter = ({ size = 18, ...p }: P) => (
  <svg {...base(size)} {...p}>
    <path d="M4 6h16M7 12h10M10 18h4" />
  </svg>
);
