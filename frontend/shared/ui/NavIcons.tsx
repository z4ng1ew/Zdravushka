// Линейные иконки для меню, карточек и таблиц кабинетов (SVG, без внешних библиотек)
type P = { size?: number };
const b = (size: number) => ({
  width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
  strokeWidth: 1.9, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true,
});

export const IHome = ({ size = 22 }: P) => (
  <svg {...b(size)}><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" /></svg>
);
export const IChat = ({ size = 22 }: P) => (
  <svg {...b(size)}><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" />
    <circle cx="8.5" cy="12" r=".9" fill="currentColor" /><circle cx="12" cy="12" r=".9" fill="currentColor" /><circle cx="15.5" cy="12" r=".9" fill="currentColor" /></svg>
);
export const ICalendar = ({ size = 22 }: P) => (
  <svg {...b(size)}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
);
export const IUsers = ({ size = 22 }: P) => (
  <svg {...b(size)}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.6-3.4 3.3-5.5 6.5-5.5s5.9 2.1 6.5 5.5M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c1.9.7 3.2 2.6 3.5 5.2" /></svg>
);
export const IChart = ({ size = 22 }: P) => (
  <svg {...b(size)}><path d="M4 20h16M7 16v-4M12 16V7M17 16v-7" /></svg>
);
export const ISettings = ({ size = 22 }: P) => (
  <svg {...b(size)}><circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
);
export const IProfile = ({ size = 22 }: P) => (
  <svg {...b(size)}><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="11" r="2.3" /><path d="M14 10h4M14 14h4M5.8 16.5c.6-1.5 1.8-2.2 3.2-2.2s2.6.7 3.2 2.2" /></svg>
);
export const ITicket = ({ size = 22 }: P) => (
  <svg {...b(size)}><path d="M3 7a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v3a2 2 0 0 0 0 4v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3a2 2 0 0 0 0-4z" /><path d="M14 5v2M14 11v2M14 17v2" /></svg>
);
export const IPhoneWave = ({ size = 22 }: P) => (
  <svg {...b(size)}><path d="M5 4h3.5l1.8 4.5-2.2 1.4a10.5 10.5 0 0 0 4.9 4.9l1.4-2.2L19 14.4V18a2 2 0 0 1-2 2A15 15 0 0 1 3 6a2 2 0 0 1 2-2Z" /><path d="M14.5 3.5a6 6 0 0 1 6 6M14.5 7a2.5 2.5 0 0 1 2.5 2.5" /></svg>
);
export const ICheck = ({ size = 22 }: P) => (
  <svg {...b(size)}><circle cx="12" cy="12" r="9" /><path d="m8 12.2 2.7 2.7L16 9.6" /></svg>
);
export const IHeadset = ({ size = 22 }: P) => (
  <svg {...b(size)}><path d="M4 15v-3a8 8 0 0 1 16 0v3" /><rect x="3" y="14" width="4.5" height="6" rx="1.8" /><rect x="16.5" y="14" width="4.5" height="6" rx="1.8" /></svg>
);
export const IBell = ({ size = 22 }: P) => (
  <svg {...b(size)}><path d="M18 9a6 6 0 0 0-12 0c0 6.5-2.5 8.5-2.5 8.5h17S18 15.5 18 9M13.7 20.5a2 2 0 0 1-3.4 0" /></svg>
);
export const IJournal = ({ size = 22 }: P) => (
  <svg {...b(size)}><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 3v3h6V3M8.5 11h7M8.5 15h4" /><path d="m14 17.5 1.5 1.5 3-3" /></svg>
);
export const IPhoneOut = ({ size = 22 }: P) => (
  <svg {...b(size)}><path d="M5 4h3.5l1.8 4.5-2.2 1.4a10.5 10.5 0 0 0 4.9 4.9l1.4-2.2L19 14.4V18a2 2 0 0 1-2 2A15 15 0 0 1 3 6a2 2 0 0 1 2-2Z" /><path d="M15 3h6v6M21 3l-6 6" /></svg>
);
export const IPlay = ({ size = 16 }: P) => (
  <svg {...b(size)}><circle cx="12" cy="12" r="9" /><path d="m10 8.5 5 3.5-5 3.5z" fill="currentColor" /></svg>
);
export const IChevron = ({ size = 16 }: P) => (
  <svg {...b(size)}><path d="m6 9 6 6 6-6" /></svg>
);
export const IAlert = ({ size = 15 }: P) => (
  <svg {...b(size)}><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01" /></svg>
);
export const IAlertCircle = ({ size = 15 }: P) => (
  <svg {...b(size)}><circle cx="12" cy="12" r="9" /><path d="M12 8v4M12 16h.01" /></svg>
);
export const IQuestion = ({ size = 15 }: P) => (
  <svg {...b(size)}><circle cx="12" cy="12" r="9" /><path d="M9.2 9.3a3 3 0 0 1 5.6 1.2c0 2-2.8 2.5-2.8 4M12 17.5h.01" /></svg>
);
export const IMegaphone = ({ size = 15 }: P) => (
  <svg {...b(size)}><path d="M3 10v4h4l6 4V6L7 10zM16 9a4 4 0 0 1 0 6M19 6.5a8 8 0 0 1 0 11" /></svg>
);
export const IPrint = ({ size = 18 }: P) => (
  <svg {...b(size)}><path d="M6 9V3h12v6M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v7H6z" /></svg>
);
export const IPin = ({ size = 18 }: P) => (
  <svg {...b(size)}><path d="M12 21s-7-6.2-7-12a7 7 0 0 1 14 0c0 5.8-7 12-7 12Z" /><circle cx="12" cy="9" r="2.5" /></svg>
);
export const IClock = ({ size = 18 }: P) => (
  <svg {...b(size)}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
);
export const IStetho = ({ size = 18 }: P) => (
  <svg {...b(size)}><path d="M6 3v6a5 5 0 0 0 10 0V3M6 3H4.5M16 3h1.5M11 14v2a5 5 0 0 0 10 0v-1" /><circle cx="21" cy="13" r="2" /></svg>
);
export const ISearch = ({ size = 18 }: P) => (
  <svg {...b(size)}><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></svg>
);

// Иконки меню из макета (картинки команды, public/img/icons)
const navImg = (file: string) => function NavImg({ size = 22 }: P) {
  return <img src={`/img/icons/${file}`} width={size} height={size} alt="" className="nav-img" />;
};
export const NChat = navImg("nav-chat.png");
export const NCalendar = navImg("nav-calendar.png");
export const NUsers = navImg("nav-users.png");
export const NStats = navImg("nav-stats.png");
export const NSettings = navImg("nav-settings.png");
