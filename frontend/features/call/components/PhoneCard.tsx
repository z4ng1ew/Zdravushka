// Основной канал — телефон; сайт показывает тот же разговор.

export default function PhoneCard() {
  return (
    <div className="phone-card" data-tip="Основной канал — телефон; этот сайт — демонстрация того же разговора">
      <span className="phone-ico" aria-hidden="true">☎</span>
      <div><b>Позвонить по телефону: 049</b><small>с софтфона Linphone — помощник ответит голосом</small></div>
    </div>
  );
}
