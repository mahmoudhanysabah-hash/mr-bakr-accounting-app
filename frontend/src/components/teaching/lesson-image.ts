import { AttendanceStatus, attendanceText, cairoDateText, Classwork, Grade, gradeText, numberText } from './lesson-shared';

export type ShareableLesson = {
  groupName: string;
  title: string | null;
  date: string;
  hasAttendance: boolean;
  hasAcademic: boolean;
  rows: {
    name: string;
    canAttendance: boolean;
    attendance: AttendanceStatus | null;
    homework: Grade | null;
    classwork: Classwork | null;
    points: number | null;
  }[];
};

export type LessonImage = { blob: Blob; width: number; height: number; name: string };

export async function createLessonImages(sheet: ShareableLesson): Promise<LessonImage[]> {
  await document.fonts.ready;
  const font = getComputedStyle(document.body).getPropertyValue('--font-cairo').trim() || 'Arial';
  const perImage = 70;
  const images: LessonImage[] = [];
  const pages = Math.ceil(sheet.rows.length / perImage);
  const width = 1280;
  const margin = 36;
  const innerWidth = width - 2 * margin;
  const rowHeight = 55;
  const gridTop = 132;
  const headers = ['الطالب', ...(sheet.hasAttendance ? ['الحضور'] : []), ...(sheet.hasAcademic ? ['الواجب', 'الكلاس ورك', 'درجات فاشل بالحصة'] : [])];
  const firstWidth = headers.length > 1 ? 432 : innerWidth;
  const otherWidth = (innerWidth - firstWidth) / Math.max(1, headers.length - 1);
  for (let page = 0; page < pages; page++) {
    const rows = sheet.rows.slice(page * perImage, (page + 1) * perImage);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = gridTop + (rows.length + 1) * rowHeight + 55;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('المتصفح مش قادر يجهّز الصورة.');
    ctx.direction = 'rtl';
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'right';
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, width, canvas.height);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, width, 112);
    ctx.fillStyle = '#fff';
    ctx.font = `700 30px ${font}, Arial, sans-serif`;
    ctx.fillText(`شيت الحصة · ${sheet.groupName}`, width - margin, 35, innerWidth);
    ctx.fillStyle = '#cbd5e1';
    ctx.font = `600 21px ${font}, Arial, sans-serif`;
    ctx.fillText(`${cairoDateText(sheet.date)}${sheet.title ? ` · ${sheet.title}` : ''}`, width - margin, 77, innerWidth);

    ctx.fillStyle = '#0f766e';
    ctx.fillRect(margin, gridTop, innerWidth, rowHeight);
    const textCells = (cells: string[], y: number, color: string, bold = false) => {
      ctx.fillStyle = color;
      ctx.font = `${bold ? 700 : 600} 21px ${font}, Arial, sans-serif`;
      cells.forEach((cell, column) => {
        ctx.direction = column > 0 && /^[0-9٠-٩]/.test(cell) ? 'ltr' : 'rtl';
        if (column === 0) {
          ctx.textAlign = 'right';
          ctx.fillText(cell, width - margin - 18, y, firstWidth - 32);
        } else {
          ctx.textAlign = 'center';
          ctx.fillText(cell, width - margin - firstWidth - (column - 0.5) * otherWidth, y, otherWidth - 20);
        }
      });
    };
    textCells(headers, gridTop + rowHeight / 2, '#fff', true);
    rows.forEach((row, index) => {
      const y = gridTop + (index + 1) * rowHeight;
      ctx.fillStyle = index % 2 ? '#f1f5f9' : '#fff';
      ctx.fillRect(margin, y, innerWidth, rowHeight);
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(margin, y + rowHeight - 1, innerWidth, 1);
      textCells([
        row.name,
        ...(sheet.hasAttendance ? [row.canAttendance ? attendanceText(row.attendance) : '—'] : []),
        ...(sheet.hasAcademic ? [gradeText(row.homework), gradeText(row.classwork), row.points == null ? '—' : numberText(row.points)] : []),
      ], y + rowHeight / 2, '#0f172a');
    });
    ctx.fillStyle = '#475569';
    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    ctx.font = `600 17px ${font}, Arial, sans-serif`;
    ctx.fillText(`نتائج محفوظة · ${numberText(sheet.rows.length)} طالب${pages > 1 ? ` · صفحة ${numberText(page + 1)} من ${numberText(pages)}` : ''}`, width - margin, canvas.height - 24);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((image) => image ? resolve(image) : reject(new Error('تعذر تجهيز الصورة.')), 'image/png'));
    const group = sheet.groupName.replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').slice(0, 80);
    images.push({ blob, width, height: canvas.height, name: `شيت-${group}-${sheet.date.slice(0, 10)}${pages > 1 ? `-${page + 1}` : ''}.png` });
  }
  return images;
}
