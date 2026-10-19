// پل بین صفحه‌ی پلنر و قابلیت‌های اندروید (با esbuild به www/assets/native.js بسته‌بندی می‌شود)
import { Capacitor, SystemBars, SystemBarsStyle } from '@capacitor/core';
import { App } from '@capacitor/app';
import { LocalNotifications } from '@capacitor/local-notifications';
import { Filesystem, Directory, Encoding } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { CapacitorCalendar, EventAvailability } from '@ebarooni/capacitor-calendar';

const MAP_KEY = 'proPlannerCalMap';      // taskId -> eventId در تقویم گوشی
const CHANNEL_ID = 'planner-tasks';
const CATEGORY_PREFIX = '📋 ';           // پیشوند عنوان رویدادهایی که خود پلنر می‌سازد
const REMINDER_HOUR = 9;                 // ساعت یادآوری (۹ صبح)
const MAX_NOTIFICATIONS = 200;

const pad = (n) => String(n).padStart(2, '0');
const isoOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localMidnight = (iso) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d, 0, 0, 0, 0);
};
const activeTasks = (tasks) => tasks.filter((t) => t && t.date && t.status !== 'done' && /^\d{4}-\d{2}-\d{2}$/.test(t.date));

function readMap() {
    try { return JSON.parse(localStorage.getItem(MAP_KEY)) || {}; } catch (e) { return {}; }
}
function writeMap(map) {
    try { localStorage.setItem(MAP_KEY, JSON.stringify(map)); } catch (e) { /* ignore */ }
}

// شناسه‌ی عددی ۳۱-بیتی و پایدار برای هر (تسک، نوع یادآوری)
function notifId(taskId, kind) {
    const s = `${taskId}|${kind}`;
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return (h >>> 0) % 2147483647 || 1;
}

// ---------------------------------------------------------------------------
//  راه‌اندازی: نوار وضعیت و دکمه‌ی برگشت
// ---------------------------------------------------------------------------
async function init({ onBack }) {

    try {
        await LocalNotifications.createChannel({
            id: CHANNEL_ID,
            name: 'یادآوری تسک‌ها',
            description: 'یادآوری تسک‌های امروز و فردا',
            importance: 4,
            visibility: 1,
            vibration: true,
        });
    } catch (e) { /* ignore */ }

    App.addListener('backButton', () => {
        try { onBack && onBack(); } catch (e) { App.exitApp(); }
    });
}

function exitApp() { return App.exitApp(); }

// رنگ آیکن‌های نوار وضعیت/ناوبری مطابق تم صفحه (تیره/روشن)
function setDarkUi(isDark) {
    try { SystemBars.setStyle({ style: isDark ? SystemBarsStyle.Dark : SystemBarsStyle.Light }); } catch (e) { /* ignore */ }
}

// ---------------------------------------------------------------------------
//  یادآوری‌ها (اعلان محلی): ۹ صبحِ روز قبل و ۹ صبحِ خودِ روز سررسید
// ---------------------------------------------------------------------------
async function ensureNotifPermission(ask) {
    let p = await LocalNotifications.checkPermissions();
    if (p.display === 'granted') return true;
    if (!ask) return false;
    p = await LocalNotifications.requestPermissions();
    return p.display === 'granted';
}

async function scheduleReminders(tasks) {
    if (!(await ensureNotifPermission(true))) return { ok: false, reason: 'permission' };

    // ابتدا همه‌ی یادآوری‌های قبلی را پاک کن (تسک ممکن است ویرایش/حذف شده باشد)
    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length) {
        await LocalNotifications.cancel({ notifications: pending.notifications.map((n) => ({ id: n.id })) });
    }

    const now = Date.now();
    const list = [];
    for (const t of activeTasks(tasks)) {
        const day = localMidnight(t.date);
        const sameDay = new Date(day); sameDay.setHours(REMINDER_HOUR, 0, 0, 0);
        const dayBefore = new Date(sameDay); dayBefore.setDate(dayBefore.getDate() - 1);
        [[dayBefore, 'before', 'فردا سررسید می‌شود'], [sameDay, 'day', 'امروز سررسید است']].forEach(([at, kind, text]) => {
            if (at.getTime() > now) {
                list.push({
                    id: notifId(t.id, kind),
                    title: '📅 یادآوری پلنر',
                    body: `${t.title} — ${text}`,
                    channelId: CHANNEL_ID,
                    schedule: { at, allowWhileIdle: true },
                    isExactNotification: false,       // نیازی به اجازه‌ی «آلارم دقیق» نیست
                });
            }
        });
    }
    list.sort((a, b) => a.schedule.at - b.schedule.at);
    const batch = list.slice(0, MAX_NOTIFICATIONS);
    if (batch.length) await LocalNotifications.schedule({ notifications: batch });
    return { ok: true, count: batch.length };
}

// ---------------------------------------------------------------------------
//  تقویم گوشی (Calendar Provider اندروید: Google Calendar، سامسونگ و ...)
// ---------------------------------------------------------------------------
async function hasCalendarAccess() {
    try {
        const { result } = await CapacitorCalendar.checkAllPermissions();
        return Object.values(result).some((v) => v === 'granted');
    } catch (e) { return false; }
}

async function requestCalendarAccess() {
    try {
        const { result } = await CapacitorCalendar.requestFullCalendarAccess();
        return result === 'granted';
    } catch (e) { return false; }
}

/** تسک‌های دارای تاریخ و انجام‌نشده ← رویداد تمام‌روز؛ ویرایش ← به‌روزرسانی؛ انجام/حذف ← پاک شدن از تقویم گوشی */
async function syncCalendar(tasks) {
    if (!(await requestCalendarAccess())) {
        return { ok: false, error: 'اجازه‌ی دسترسی به تقویم داده نشد. از تنظیمات گوشی ← برنامه‌ها ← پلنر ← مجوزها، «تقویم» را فعال کنید.' };
    }
    try {
        const map = readMap();
        const wanted = {};
        activeTasks(tasks).forEach((t) => { wanted[String(t.id)] = t; });
        let created = 0, updated = 0, deleted = 0;

        const stale = Object.keys(map).filter((id) => !(id in wanted));
        if (stale.length) {
            const r = await CapacitorCalendar.deleteEventsById({ ids: stale.map((id) => map[id]) });
            deleted = (r.result && r.result.deleted ? r.result.deleted.length : 0);
            stale.forEach((id) => delete map[id]);
        }

        for (const [tid, t] of Object.entries(wanted)) {
            const start = localMidnight(t.date);
            const end = new Date(start); end.setHours(23, 59, 59, 999);   // پایانِ «شامل» همان روز
            const fields = {
                title: CATEGORY_PREFIX + (t.title || ''),
                description: t.desc || '',
                startDate: start.getTime(),
                endDate: end.getTime(),
                isAllDay: true,
                availability: EventAvailability.FREE,   // تسک‌ها زمان شما را «اشغال» نشان ندهند
            };
            let done = false;
            if (map[tid]) {
                try {
                    await CapacitorCalendar.modifyEvent({ id: map[tid], ...fields });
                    updated++; done = true;
                } catch (e) { /* رویداد در گوشی حذف شده؛ دوباره می‌سازیم */ }
            }
            if (!done) {
                const { id } = await CapacitorCalendar.createEvent(fields);
                if (id) { map[tid] = String(id); created++; }
            }
        }
        writeMap(map);
        return { ok: true, created, updated, deleted };
    } catch (e) {
        return { ok: false, error: `${e && e.message ? e.message : e}` };
    }
}

/** رویدادهای تقویم گوشی (فقط‌خواندنی) برای نمایش در تقویم شمسی پلنر؛ فقط اگر مجوز قبلاً داده شده باشد */
async function listEvents(fromISO, toISO) {
    if (!(await hasCalendarAccess())) return { ok: false, events: [] };
    try {
        const from = localMidnight(fromISO).getTime();
        const to = localMidnight(toISO).getTime() + 24 * 3600 * 1000 - 1;
        const { result } = await CapacitorCalendar.listEventsInRange({ from, to });
        const mine = new Set(Object.values(readMap()).map(String));
        const events = [];
        for (const e of result) {
            if (mine.has(String(e.id))) continue;                 // رویدادهایی که خود پلنر ساخته
            if ((e.title || '').startsWith(CATEGORY_PREFIX)) continue;
            // رویداد تمام‌روز در اندروید با نیمه‌شبِ UTC ذخیره می‌شود؛ پس روزش را با UTC بخوان
            const s = new Date(e.startDate);
            const date = e.isAllDay
                ? `${s.getUTCFullYear()}-${pad(s.getUTCMonth() + 1)}-${pad(s.getUTCDate())}`
                : isoOf(s);
            events.push({
                date,
                time: e.isAllDay ? '' : `${pad(s.getHours())}:${pad(s.getMinutes())}`,
                allDay: !!e.isAllDay,
                title: e.title || '',
            });
        }
        return { ok: true, events };
    } catch (e) {
        return { ok: false, events: [] };
    }
}

// ---------------------------------------------------------------------------
//  خروجی فایل (CSV/JSON) ← برگه‌ی اشتراک‌گذاری اندروید (ذخیره در Drive، ارسال در پیام‌رسان و ...)
// ---------------------------------------------------------------------------
async function exportFile(content, filename, mime) {
    try {
        const data = filename.endsWith('.csv') ? '\uFEFF' + content : content;   // BOM تا اکسل فارسی را درست نشان دهد
        const { uri } = await Filesystem.writeFile({
            path: filename,
            data,
            directory: Directory.Cache,
            encoding: Encoding.UTF8,
        });
        await Share.share({ title: filename, url: uri, dialogTitle: 'ذخیره یا ارسال فایل' });
        return { ok: true };
    } catch (e) {
        const msg = `${e && e.message ? e.message : e}`;
        if (/cancel/i.test(msg)) return { ok: true, cancelled: true };   // کاربر برگه را بست
        return { ok: false, error: msg };
    }
}

window.Native = {
    isNative: () => Capacitor.isNativePlatform(),
    init, exitApp, setDarkUi,
    scheduleReminders,
    hasCalendarAccess, syncCalendar, listEvents,
    exportFile,
};
