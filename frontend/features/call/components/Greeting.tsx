// Приветствие Здравушки над микрофоном.

export default function Greeting() {
  return (
    <div className="greeting" data-tip="Здравушка — голосовой помощник. Записывает, переносит и отменяет приёмы, отвечает на вопросы о работе поликлиники.">
      <img src="/img/mascot-circle.png" width={118} height={118} alt="Здравушка" className="mascot-circle" />
      <p>Привет! Я Здравушка. Чем могу помочь?</p>
    </div>
  );
}
