import { describe, expect, it } from "vitest";
import { ApiError } from "@/shared/api/ApiError";
import { callReducer, initialCall, type CallState } from "@/features/call/model/callState";
import { canCall, canTalk, pillView, recordTag, statusText } from "@/features/call/model/callView";
import { lastBotIndex, patientSpoke } from "@/features/call/model/feed";
import { GIVE_UP, MIC_TEXT, NOT_HEARD, silenceReaction } from "@/features/call/model/speechMisses";
import { reply } from "./fixtures";

const quiet = { listening: false, transcribing: false, speaking: false };
const active = (s: Partial<CallState> = {}): CallState => ({ ...callReducer(initialCall, { type: "reset" }), ...s });
const esc = { rule: "R-01", reason: "боль в груди", priority: "P1", emergency: true, summary: "" };

describe("callReducer — состояние звонка", () => {
  it("новый звонок: номер растёт, лента пустая, звонок активен", () => {
    const s = callReducer({ ...initialCall, callNo: 4, feed: [{ type: "notice", text: "x", at: "" }] }, { type: "reset" });
    expect(s).toMatchObject({ callNo: 5, phase: "active", feed: [], sending: false });
  });
  it("ответ с переводом — ждём регистратора, звонок не обрывается", () => {
    const s = callReducer(active(), { type: "reply", r: reply({ escalation: esc, done: true }), tags: [], booking: null, ticket: null });
    expect(s).toMatchObject({ mode: "waiting", phase: "active", escalation: esc });
  });
  it("done без перевода — звонок завершён", () => {
    expect(callReducer(active(), { type: "reply", r: reply({ done: true }), tags: [], booking: null, ticket: null }).phase).toBe("ended");
  });
  it("пустой ответ бота не добавляет пустую реплику", () => {
    expect(callReducer(active(), { type: "reply", r: reply({ reply: "" }), tags: [], booking: null, ticket: null }).feed).toEqual([]);
  });
  it("ошибка сохраняет фразу для «Отправить ещё раз»", () => {
    const s = callReducer(active(), { type: "error", error: new ApiError(503, "POST", "/api/chat", "нет"), retry: "да" });
    expect(s.feed[0]).toMatchObject({ type: "error", status: 503, retry: "да" });
  });
  it("перехват: регистратор на линии с именем", () => {
    expect(callReducer(active(), { type: "mode", mode: "operator", operator: "Анна" })).toMatchObject({ mode: "operator", operator: "Анна" });
  });
});

describe("что показать по звонку", () => {
  it("звонить можно, только когда звонка нет и запрос не идёт", () => {
    expect([canCall(initialCall), canCall(active()), canCall({ ...initialCall, sending: true })]).toEqual([true, false, false]);
  });
  it("говорить нельзя, пока Здравушка говорит или думает, и когда на линии регистратор", () => {
    expect(canTalk(active(), quiet)).toBe(true);
    expect(canTalk(active(), { ...quiet, speaking: true })).toBe(false);
    expect(canTalk(active({ mode: "operator" }), quiet)).toBe(false);
  });
  it("подпись под микрофоном", () => {
    expect(statusText(initialCall, quiet)).toBe("Здравушка готов помочь");
    expect(statusText(active(), { ...quiet, listening: true })).toBe("Слушаю — говорите");
    expect(statusText(active({ mode: "waiting" }), quiet)).toBe("Соединяю с регистратором…");
  });
  it("плашка «кто ведёт» и метка записи", () => {
    expect(pillView(active({ mode: "operator", operator: "Анна" })).text).toBe("На линии регистратор Анна");
    expect(recordTag(active({ escalation: esc })).text).toBe("Срочно: 103 / 112");
    expect(recordTag(active()).text).toBe("Пусто");
  });
  it("лента: последняя реплика бота и говорил ли пациент", () => {
    const feed = [{ type: "line" as const, line: { speaker: "bot" as const, text: "a", at: "" } }, { type: "notice" as const, text: "b", at: "" }];
    expect([lastBotIndex(feed), patientSpoke(feed)]).toEqual([0, false]);
  });
});

describe("тишина и микрофон", () => {
  it("15 с тишины — слушаем дальше молча; 30 с — выключаем с подсказкой", () => {
    expect(silenceReaction(1)).toEqual({ listen: true, notice: null });
    expect(silenceReaction(2)).toEqual({ listen: false, notice: NOT_HEARD });
  });
  it("у каждой причины недоступного микрофона своя подсказка, и все предлагают текст", () => {
    expect(Object.values(MIC_TEXT).every((t) => /текст/i.test(t))).toBe(true);
    expect(MIC_TEXT.insecure).toMatch(/https/);
    expect(GIVE_UP).toMatch(/Регистратор/);
  });
});
