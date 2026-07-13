import type { ReactElement, SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

const base = (size: number): SVGProps<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
});

export const PlusIcon = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);
export const MinusIcon = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);
export const TrashIcon = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6M14 11v6" />
    <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
  </svg>
);
export const PencilIcon = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
);
export const GearIcon = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
  </svg>
);
export const PlayIcon = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <polygon points="6 4 20 12 6 20 6 4" fill="currentColor" stroke="none" />
  </svg>
);
export const DragHandleIcon = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <line x1="4" y1="8" x2="20" y2="8" />
    <line x1="4" y1="12" x2="20" y2="12" />
    <line x1="4" y1="16" x2="20" y2="16" />
  </svg>
);
export const MenuIcon = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <line x1="4" y1="7" x2="20" y2="7" />
    <line x1="4" y1="12" x2="20" y2="12" />
    <line x1="4" y1="17" x2="20" y2="17" />
  </svg>
);
export const CompassIcon = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <circle cx="12" cy="12" r="9" />
    <polygon points="16 8 14 14 8 16 10 10 16 8" />
  </svg>
);
export const HomeIcon = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="M3 10.5 12 3l9 7.5" />
    <path d="M5 9.5V21h14V9.5" />
  </svg>
);
export const RefreshIcon = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
    <path d="M21 3v5h-5" />
  </svg>
);
export const ExpandIcon = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
  </svg>
);
export const XIcon = ({ size = 18, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);
export const UserIcon = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </svg>
);
export const ChevronUpIcon = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <polyline points="6 15 12 9 18 15" />
  </svg>
);
export const ChevronDownIcon = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <polyline points="6 9 12 15 18 9" />
  </svg>
);
export const CopyIcon = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V5a2 2 0 0 1 2-2h10" />
  </svg>
);
export const HandIcon = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="M8.5 11V6.5a1.5 1.5 0 0 1 3 0V11" />
    <path d="M11.5 10.5V4.8a1.3 1.3 0 0 1 2.6 0V11" />
    <path d="M14.1 10.2V6.1a1.2 1.2 0 0 1 2.4 0V12" />
    <path d="M8.5 11.2V8.2a1.2 1.2 0 0 0-2.4 0v5.1c0 2.8 2.1 4.7 5.3 4.7h2.4c2.4 0 4.2-1.8 4.2-4.2V12" />
    <path d="M6.1 13.2c0 2.3 1.6 3.8 4.1 3.8h3.5" />
  </svg>
);
export const SearchIcon = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <circle cx="11" cy="11" r="7" />
    <line x1="21" y1="21" x2="16.65" y2="16.65" />
  </svg>
);
export const AlertIcon = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="M10.3 3.6 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.6a2 2 0 0 0-3.4 0Z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);
export const InfoIcon = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="11" x2="12" y2="16" />
    <line x1="12" y1="8" x2="12.01" y2="8" />
  </svg>
);
export const SunIcon = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <circle cx="12" cy="12" r="4" />
    <line x1="12" y1="2" x2="12" y2="4.5" />
    <line x1="12" y1="19.5" x2="12" y2="22" />
    <line x1="4.2" y1="4.2" x2="6" y2="6" />
    <line x1="18" y1="18" x2="19.8" y2="19.8" />
    <line x1="2" y1="12" x2="4.5" y2="12" />
    <line x1="19.5" y1="12" x2="22" y2="12" />
    <line x1="4.2" y1="19.8" x2="6" y2="18" />
    <line x1="18" y1="6" x2="19.8" y2="4.2" />
  </svg>
);
export const MoonIcon = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />
  </svg>
);
export const GridIcon = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <rect x="3" y="3" width="7" height="7" rx="1" />
    <rect x="14" y="3" width="7" height="7" rx="1" />
    <rect x="3" y="14" width="7" height="7" rx="1" />
    <rect x="14" y="14" width="7" height="7" rx="1" />
  </svg>
);
export const ListIcon = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <line x1="8" y1="6" x2="21" y2="6" />
    <line x1="8" y1="12" x2="21" y2="12" />
    <line x1="8" y1="18" x2="21" y2="18" />
    <line x1="3" y1="6" x2="3.01" y2="6" />
    <line x1="3" y1="12" x2="3.01" y2="12" />
    <line x1="3" y1="18" x2="3.01" y2="18" />
  </svg>
);

// --- Runway timeline icons ---

export const DotIcon = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <circle cx="12" cy="12" r="5" fill="currentColor" stroke="none" />
  </svg>
);
export const CarIcon = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="M5 16 6.4 9.6A2 2 0 0 1 8.35 8h7.3a2 2 0 0 1 1.95 1.6L19 16" />
    <path d="M3 16h18v3a1 1 0 0 1-1 1h-1.5a1 1 0 0 1-1-1v-1H6.5v1a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1Z" />
    <line x1="7" y1="13" x2="7.01" y2="13" />
    <line x1="17" y1="13" x2="17.01" y2="13" />
  </svg>
);
export const PlaneIcon = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="M21 15.5 3 11V8.5l3-.5 2 2.5 5.5.5L11 4l2.5-.5 4 7L21 12Z" />
    <line x1="7" y1="20" x2="17" y2="20" />
  </svg>
);
export const GraduationCapIcon = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="M12 4 2 9l10 5 10-5Z" />
    <path d="M6 11.5V16c0 1.4 2.7 2.5 6 2.5s6-1.1 6-2.5v-4.5" />
    <line x1="22" y1="9" x2="22" y2="14" />
  </svg>
);
export const HeartIcon = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="M12 20s-7-4.5-9.2-8.6A4.8 4.8 0 0 1 12 6a4.8 4.8 0 0 1 9.2 5.4C19 15.5 12 20 12 20Z" />
  </svg>
);
export const RingIcon = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <circle cx="12" cy="14" r="6" />
    <path d="M9 8 7.5 3h9L15 8" />
  </svg>
);
export const GiftIcon = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <rect x="3" y="8" width="18" height="4" rx="1" />
    <path d="M5 12v8a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-8" />
    <line x1="12" y1="8" x2="12" y2="21" />
    <path d="M12 8S10.5 3.5 8 4.5 9.5 8 12 8Zm0 0s1.5-4.5 4-3.5S14.5 8 12 8Z" />
  </svg>
);
export const UmbrellaIcon = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="M12 3a9 9 0 0 1 9 9H3a9 9 0 0 1 9-9Z" />
    <line x1="12" y1="12" x2="12" y2="19" />
    <path d="M12 19a2.5 2.5 0 0 0 4 0" />
  </svg>
);
export const BankIcon = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="M3 9 12 4l9 5" />
    <line x1="4" y1="20" x2="20" y2="20" />
    <line x1="6" y1="11" x2="6" y2="17" />
    <line x1="10" y1="11" x2="10" y2="17" />
    <line x1="14" y1="11" x2="14" y2="17" />
    <line x1="18" y1="11" x2="18" y2="17" />
  </svg>
);
export const TrophyIcon = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="M7 4h10v5a5 5 0 0 1-10 0Z" />
    <path d="M7 5H4v2a3 3 0 0 0 3 3M17 5h3v2a3 3 0 0 1-3 3" />
    <line x1="12" y1="14" x2="12" y2="18" />
    <path d="M8 21h8M9 21v-1a3 3 0 0 1 6 0v1" />
  </svg>
);
export const StarIcon = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <polygon
      points="12 3 14.6 8.6 20.5 9.3 16 13.4 17.3 19.2 12 16.2 6.7 19.2 8 13.4 3.5 9.3 9.4 8.6 12 3"
      fill="currentColor"
      stroke="none"
    />
  </svg>
);
export const WalletIcon = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="M3 7a2 2 0 0 1 2-2h12v3" />
    <path d="M3 7v10a2 2 0 0 0 2 2h14a1 1 0 0 0 1-1V9a1 1 0 0 0-1-1H5a2 2 0 0 1-2-1Z" />
    <circle cx="16.5" cy="13.5" r="1.2" fill="currentColor" stroke="none" />
  </svg>
);
export const SwapIcon = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="M4 9h13l-3-3M20 15H7l3 3" />
  </svg>
);
export const FlagIcon = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="M5 21V4M5 4h11l-2 3.5L16 11H5" />
  </svg>
);

/** Named icons a runway event can carry (see src/services/runwayEvents.ts). */
export type RunwayIconName =
  | 'dot'
  | 'umbrella'
  | 'bank'
  | 'star'
  | 'car'
  | 'plane'
  | 'graduation'
  | 'heart'
  | 'ring'
  | 'gift'
  | 'home'
  | 'trophy'
  | 'wallet'
  | 'swap'
  | 'alert';

export const RUNWAY_ICONS: Record<RunwayIconName, (p: IconProps) => ReactElement> = {
  dot: DotIcon,
  umbrella: UmbrellaIcon,
  bank: BankIcon,
  star: StarIcon,
  car: CarIcon,
  plane: PlaneIcon,
  graduation: GraduationCapIcon,
  heart: HeartIcon,
  ring: RingIcon,
  gift: GiftIcon,
  home: HomeIcon,
  trophy: TrophyIcon,
  wallet: WalletIcon,
  swap: SwapIcon,
  alert: AlertIcon,
};
