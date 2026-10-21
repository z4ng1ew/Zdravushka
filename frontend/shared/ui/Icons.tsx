// Иконки: часть — картинки команды из public/img/icons, остальные — SVG
type P = { size?: number };
const base = (size: number) => ({
  width: size, height: size, viewBox: "0 0 24 24", fill: "none",
  stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
  "aria-hidden": true,
});

export const MicIcon = ({ size = 40 }: P) => (
  <svg {...base(size)}><rect x="9" y="3" width="6" height="11" rx="3" /><path d="M5 11a7 7 0 0 0 14 0M12 18v3" /></svg>
);
export const HangupIcon = ({ size = 20 }: P) => (
  <img src="/img/icons/hangup.png" width={size} height={size} alt="" className="ico-img" />
);
export const RefreshIcon = ({ size = 20 }: P) => (
  <img src="/img/icons/refresh.png" width={size} height={size} alt="" className="ico-img" />
);
export const ChatIcon = ({ size = 20 }: P) => (
  <img src="/img/icons/chat.png" width={size} height={size} alt="" className="ico-img" />
);
export const DocIcon = ({ size = 20 }: P) => (
  <img src="/img/icons/doc.png" width={size} height={size} alt="" className="ico-img" />
);
export const ClipIcon = ({ size = 20 }: P) => (
  <img src="/img/icons/record.png" width={size} height={size} alt="" className="ico-img" />
);
export const CheckCircle = ({ size = 18 }: P) => (
  <img src="/img/icons/check.png" width={size} height={size} alt="" className="ico-img" />
);
export const CalendarIcon = ({ size = 18 }: P) => (
  <img src="/img/icons/calendar.png" width={size} height={size} alt="" className="ico-img" />
);
export const ClockIcon = ({ size = 18 }: P) => (
  <img src="/img/icons/clock.png" width={size} height={size} alt="" className="ico-img" />
);
export const PinIcon = ({ size = 18 }: P) => (
  <svg {...base(size)}><path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12Z" /><circle cx="12" cy="9" r="2.5" /></svg>
);
export const UserIcon = ({ size = 22 }: P) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="12" cy="8" r="4.2" fill="currentColor" />
    <path d="M3.5 21c.8-4.4 4.3-7 8.5-7s7.7 2.6 8.5 7Z" fill="currentColor" />
  </svg>
);
export const SendIcon = ({ size = 18 }: P) => (
  <svg {...base(size)}><path d="M4 12 20 4l-6 16-3-7Z" /></svg>
);
export const PhoneIcon = ({ size = 18 }: P) => (
  <svg {...base(size)}><path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z" /></svg>
);
export const HeadsetIcon = ({ size = 22 }: P) => (
  <svg {...base(size)}><path d="M4 14v-2a8 8 0 0 1 16 0v2" /><rect x="3" y="14" width="4" height="6" rx="1.5" /><rect x="17" y="14" width="4" height="6" rx="1.5" /><path d="M19 20a4 4 0 0 1-4 2h-2" /></svg>
);
