import { isValidIanaTimeZone } from "./validation.ts";

export interface UserDateTimeContext {
  timeZone: string;
  formattedDate: string; // DD/MM/AAAA
  formattedTime: string; // HH:mm
  weekdayName: string;
  periodOfDay: string;
  greeting: string;
  dateStr: string;
  tomorrowDateStr: string;
  yesterdayDateStr: string;
  year: number;
}

export function getUserDateTimeContext(requestedTimeZone?: string): UserDateTimeContext {
  const timeZone = isValidIanaTimeZone(requestedTimeZone)
    ? (requestedTimeZone as string)
    : "America/Sao_Paulo";

  const now = new Date();

  // Formatter para a data/hora local
  const formatter = new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    weekday: "long",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(now);
  const getPart = (type: string) => parts.find((p) => p.type === type)?.value || "";

  const day = getPart("day");
  const month = getPart("month");
  const yearStr = getPart("year");
  const hour = parseInt(getPart("hour"), 10) || 0;
  const minute = getPart("minute");
  const weekdayName = getPart("weekday");

  const formattedDate = `${day}/${month}/${yearStr}`;
  const formattedTime = `${String(hour).padStart(2, "0")}:${minute}`;
  const dateStr = `${weekdayName}, ${formattedDate} às ${formattedTime}`;

  // Saudação de acordo com a hora local calculada
  let periodOfDay = "noite";
  let greeting = "Boa noite";
  if (hour >= 5 && hour < 12) {
    periodOfDay = "manhã";
    greeting = "Bom dia";
  } else if (hour >= 12 && hour < 18) {
    periodOfDay = "tarde";
    greeting = "Boa tarde";
  } else if (hour >= 0 && hour < 5) {
    periodOfDay = "madrugada";
    greeting = "Boa madrugada";
  }

  // Operação de calendário real (sem adicionar cegamente 24 horas por conta de DST / fuso)
  const tomorrow = new Date(now.getTime() + 26 * 60 * 60 * 1000);
  const tomorrowParts = new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    weekday: "long",
  }).formatToParts(tomorrow);
  const tDay = tomorrowParts.find((p) => p.type === "day")?.value || "";
  const tMonth = tomorrowParts.find((p) => p.type === "month")?.value || "";
  const tYear = tomorrowParts.find((p) => p.type === "year")?.value || "";
  const tWeekday = tomorrowParts.find((p) => p.type === "weekday")?.value || "";
  const tomorrowDateStr = `${tWeekday}, ${tDay}/${tMonth}/${tYear}`;

  const yesterday = new Date(now.getTime() - 26 * 60 * 60 * 1000);
  const yesterdayParts = new Intl.DateTimeFormat("pt-BR", {
    timeZone,
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    weekday: "long",
  }).formatToParts(yesterday);
  const yDay = yesterdayParts.find((p) => p.type === "day")?.value || "";
  const yMonth = yesterdayParts.find((p) => p.type === "month")?.value || "";
  const yYear = yesterdayParts.find((p) => p.type === "year")?.value || "";
  const yWeekday = yesterdayParts.find((p) => p.type === "weekday")?.value || "";
  const yesterdayDateStr = `${yWeekday}, ${yDay}/${yMonth}/${yYear}`;

  return {
    timeZone,
    formattedDate,
    formattedTime,
    weekdayName,
    periodOfDay,
    greeting,
    dateStr,
    tomorrowDateStr,
    yesterdayDateStr,
    year: parseInt(yearStr, 10) || now.getFullYear(),
  };
}
