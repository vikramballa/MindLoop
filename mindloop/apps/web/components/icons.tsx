import { useId, type SVGProps } from "react";

const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export const HomeIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1v-8.5Z" />
  </svg>
);
export const TalkIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <path d="M5 18.5V7a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H8.5L5 18.5Z" />
  </svg>
);
export const ProfileIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <circle cx="12" cy="8.5" r="3.5" />
    <path d="M5 19.5c1.3-3.2 3.8-4.8 7-4.8s5.7 1.6 7 4.8" />
  </svg>
);
export const MicIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <rect x="9" y="3.5" width="6" height="11" rx="3" />
    <path d="M6 11.5a6 6 0 0 0 12 0M12 17.5V20.5" />
  </svg>
);
export const StopIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <rect x="7" y="7" width="10" height="10" rx="2" fill="currentColor" />
  </svg>
);
export const PhoneIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <path d="M6.5 4h3l1.5 4-2 1.2a10 10 0 0 0 5.8 5.8L16 13l4 1.5v3a2 2 0 0 1-2.2 2A15.5 15.5 0 0 1 4.5 6.2 2 2 0 0 1 6.5 4Z" />
  </svg>
);
export const HeartIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <path d="M12 19s-7-4.4-7-9.5A3.8 3.8 0 0 1 12 7a3.8 3.8 0 0 1 7 2.5C19 14.6 12 19 12 19Z" />
  </svg>
);
/** Brand mark: an ink tile with a lime loop and a small sun, matching the app icon. */
export function LogoMark(p: SVGProps<SVGSVGElement>) {
  // Unique per instance: a gradient defined inside a hidden (display:none) copy would not paint.
  const id = `logo${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <svg viewBox="0 0 32 32" aria-hidden {...p}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#2a2533" />
          <stop offset="1" stopColor="#141118" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="10" fill={`url(#${id})`} />
      <circle cx="16" cy="16.5" r="7" fill="none" stroke="#d4f56a" strokeWidth="2.8" />
      <circle cx="21.2" cy="10.8" r="2.1" fill="#ffd76a" />
    </svg>
  );
}
export const CalmIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <path d="M3 9.5c2.5-2 4.5-2 7 0s4.5 2 7 0 3-1.5 4-1" />
    <path d="M3 14.5c2.5-2 4.5-2 7 0s4.5 2 7 0 3-1.5 4-1" />
    <path d="M6 19.5c2-1.3 3.6-1.3 5.6 0" />
  </svg>
);
export const ConnectIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <circle cx="8.5" cy="9" r="3" />
    <circle cx="16.5" cy="9" r="3" />
    <path d="M3.5 19c.8-2.9 2.6-4.3 5-4.3 1.5 0 2.7.5 3.5 1.5.8-1 2-1.5 3.5-1.5 2.4 0 4.2 1.4 5 4.3" />
  </svg>
);
export const WindIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <path d="M3 8h10.5a2.5 2.5 0 1 0-2.5-2.5M3 12h15.5a2.5 2.5 0 1 1-2.5 2.5M3 16h8" />
  </svg>
);
export const HandIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <path d="M8 12V5.5a1.5 1.5 0 0 1 3 0V11m0-6.5a1.5 1.5 0 0 1 3 0V11m0-5a1.5 1.5 0 0 1 3 0v7c0 4-2.5 7-6.5 7-2.6 0-4.3-1.3-5.6-3.4L3.6 13.5a1.5 1.5 0 0 1 2.5-1.6L8 14" />
  </svg>
);
export const SoundIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <path d="M4 10v4M8 7v10M12 4v16M16 8v8M20 11v2" />
  </svg>
);
export const PlayIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <path d="M8 5.5v13l10.5-6.5L8 5.5Z" fill="currentColor" />
  </svg>
);
export const PauseIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <path d="M8 5.5v13M16 5.5v13" strokeWidth="3" />
  </svg>
);
export const CopyIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <rect x="8.5" y="8.5" width="11" height="11" rx="2.5" />
    <path d="M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5" />
  </svg>
);
export const ShareIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <path d="M12 15V4M8 7.5 12 4l4 3.5" />
    <path d="M7 11H6a2 2 0 0 0-2 2v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5a2 2 0 0 0-2-2h-1" />
  </svg>
);
export const ChevronRightIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <path d="m10 6 6 6-6 6" />
  </svg>
);
export const SparkIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <path d="M12 3.5c.6 4.3 2.2 6 6.5 6.5-4.3.6-5.9 2.2-6.5 6.5-.6-4.3-2.2-5.9-6.5-6.5 4.3-.5 5.9-2.2 6.5-6.5Z" />
    <path d="M18.5 16v4M16.5 18h4" />
  </svg>
);
export const CheckIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
);
export const ShieldIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <path d="M12 3.5 5 6v5.5c0 4.2 2.9 7.6 7 9 4.1-1.4 7-4.8 7-9V6l-7-2.5Z" />
    <path d="m9 12 2 2 4-4" />
  </svg>
);

export const PlusIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);
export const XIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </svg>
);
export const ArrowLeftIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </svg>
);
export const ArrowRightIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);
/** Journey: a sprout growing from a line. */
export const JourneyIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <path d="M12 20v-8" />
    <path d="M12 12c0-3.6-2.4-6-6-6 0 3.6 2.4 6 6 6Z" />
    <path d="M12 14.5c0-3 2-5 5-5 0 3-2 5-5 5Z" />
    <path d="M5 20h14" />
  </svg>
);
export const MoonIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <path d="M19.5 14.5A7.5 7.5 0 0 1 9.5 4.5a7.5 7.5 0 1 0 10 10Z" />
  </svg>
);
export const BookIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <path d="M5 5.5A1.5 1.5 0 0 1 6.5 4H19v14H6.5A1.5 1.5 0 0 0 5 19.5v-14Z" />
    <path d="M5 19.5A1.5 1.5 0 0 0 6.5 21H19" />
  </svg>
);
export const LockIcon = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base} {...p}>
    <rect x="5" y="10.5" width="14" height="9.5" rx="2.5" />
    <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
  </svg>
);
