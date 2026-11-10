import { BadRequestException } from '@nestjs/common';

const dayLength = 24 * 60 * 60 * 1000;
const minuteLength = 60 * 1000;
const localCalendar = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Cairo', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

function cairoParts(date: Date) {
  const parts = Object.fromEntries(localCalendar.formatToParts(date).map((part) => [part.type, part.value]));
  return { day: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

export function cairoDateKey(date: Date) {
  return cairoParts(date).day;
}

function dateOnlyUtc(day: string) {
  const nominal = new Date(`${day}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(nominal.getTime()) || nominal.toISOString().slice(0, 10) !== day) {
    throw new BadRequestException('اختار تاريخ حصة صحيح.');
  }
  return nominal.getTime();
}

function localDayStart(day: string, nominal: number) {
  let before = nominal - dayLength;
  let after = nominal + dayLength;
  while (after - before > 1) {
    const middle = Math.floor((before + after) / 2);
    if (cairoDateKey(new Date(middle)) < day) before = middle;
    else after = middle;
  }
  return new Date(after);
}

export function cairoDayRange(day: string) {
  const nominal = dateOnlyUtc(day);
  const following = nominal + dayLength;
  const nextDay = new Date(following).toISOString().slice(0, 10);
  return { gte: localDayStart(day, nominal), lt: localDayStart(nextDay, following) };
}

export function cairoLessonStart(day: string, time: string) {
  if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new BadRequestException('اختار ميعاد حصة صحيح.');
  const range = cairoDayRange(day);
  const offsetAt = (date: Date) => {
    const local = cairoParts(date);
    return Date.parse(`${local.day}T${local.time}:00.000Z`) - Math.floor(date.getTime() / minuteLength) * minuteLength;
  };
  const nominal = Date.parse(`${day}T${time}:00.000Z`);
  const offsets = new Set([offsetAt(range.gte), offsetAt(new Date(range.lt.getTime() - 1))]);
  const match = [...offsets].map((offset) => new Date(nominal - offset)).sort((a, b) => a.getTime() - b.getTime())
    .find((date) => { const local = cairoParts(date); return local.day === day && local.time === time; });
  if (!match) throw new BadRequestException('الميعاد ده مش موجود في اليوم المختار بتوقيت القاهرة.');
  return match;
}
