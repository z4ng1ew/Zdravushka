// Логотип ClinicAI (картинка из public/img/logo.png, уже с подписью «Голосовой помощник поликлиники»).
// Для кабинета сотрудника рядом показываем пометку.
export default function Brand({ subtitle }: { subtitle?: string }) {
  return (
    <div className="brand">
      <img src="/img/logo.png" alt="ClinicAI — голосовой помощник поликлиники" className="brand-logo" />
      {subtitle && <span className="brand-badge">{subtitle}</span>}
    </div>
  );
}
