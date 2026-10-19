/* تقویم شمسی (جلالی) - بر پایه الگوریتم jalaali-js (MIT) */
(function (root) {
    'use strict';

    const BREAKS = [-61, 9, 38, 199, 426, 686, 756, 818, 1111, 1181, 1210,
        1635, 2060, 2097, 2192, 2262, 2324, 2394, 2456, 3178];

    const div = (a, b) => Math.trunc(a / b);
    const mod = (a, b) => a - Math.trunc(a / b) * b;

    function jalCal(jy, withoutLeap) {
        const bl = BREAKS.length;
        const gy = jy + 621;
        let leapJ = -14;
        let jp = BREAKS[0];
        let jm, jump = 0, leap, n;

        if (jy < jp || jy >= BREAKS[bl - 1]) throw new Error('Invalid Jalaali year ' + jy);

        for (let i = 1; i < bl; i += 1) {
            jm = BREAKS[i];
            jump = jm - jp;
            if (jy < jm) break;
            leapJ = leapJ + div(jump, 33) * 8 + div(mod(jump, 33), 4);
            jp = jm;
        }
        n = jy - jp;
        leapJ = leapJ + div(n, 33) * 8 + div(mod(n, 33) + 3, 4);
        if (mod(jump, 33) === 4 && jump - n === 4) leapJ += 1;

        const leapG = div(gy, 4) - div((div(gy, 100) + 1) * 3, 4) - 150;
        const march = 20 + leapJ - leapG;

        if (withoutLeap) return { gy, march };

        if (jump - n < 6) n = n - jump + div(jump + 4, 33) * 33;
        leap = mod(mod(n + 1, 33) - 1, 4);
        if (leap === -1) leap = 4;
        return { leap, gy, march };
    }

    function g2d(gy, gm, gd) {
        let d = div((gy + div(gm - 8, 6) + 100100) * 1461, 4)
            + div(153 * mod(gm + 9, 12) + 2, 5) + gd - 34840408;
        d = d - div(div(gy + 100100 + div(gm - 8, 6), 100) * 3, 4) + 752;
        return d;
    }

    function d2g(jdn) {
        let j = 4 * jdn + 139361631;
        j = j + div(div(4 * jdn + 183187720, 146097) * 3, 4) * 4 - 3908;
        const i = div(mod(j, 1461), 4) * 5 + 308;
        const gd = div(mod(i, 153), 5) + 1;
        const gm = mod(div(i, 153), 12) + 1;
        const gy = div(j, 1461) - 100100 + div(8 - gm, 6);
        return { gy, gm, gd };
    }

    function j2d(jy, jm, jd) {
        const r = jalCal(jy, true);
        return g2d(r.gy, 3, r.march) + (jm - 1) * 31 - div(jm, 7) * (jm - 7) + jd - 1;
    }

    function d2j(jdn) {
        const gy = d2g(jdn).gy;
        let jy = gy - 621;
        const r = jalCal(jy, false);
        const jdn1f = g2d(gy, 3, r.march);
        let jd, jm, k = jdn - jdn1f;
        if (k >= 0) {
            if (k <= 185) {
                jm = 1 + div(k, 31);
                jd = mod(k, 31) + 1;
                return { jy, jm, jd };
            }
            k -= 186;
        } else {
            jy -= 1;
            k += 179;
            if (r.leap === 1) k += 1;
        }
        jm = 7 + div(k, 30);
        jd = mod(k, 30) + 1;
        return { jy, jm, jd };
    }

    const JAL = {
        MONTHS: ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور',
            'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'],
        // ایندکس = Date.getDay()  (۰ = یکشنبه)
        WEEKDAYS: ['یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه', 'شنبه'],

        toJalali(gy, gm, gd) { return d2j(g2d(gy, gm, gd)); },
        toGregorian(jy, jm, jd) { return d2g(j2d(jy, jm, jd)); },
        isLeap(jy) { return jalCal(jy, false).leap === 0; },
        monthLength(jy, jm) {
            if (jm <= 6) return 31;
            if (jm <= 11) return 30;
            return JAL.isLeap(jy) ? 30 : 29;
        },
        todayJ() {
            const n = new Date();
            const j = JAL.toJalali(n.getFullYear(), n.getMonth() + 1, n.getDate());
            return { jy: j.jy, jm: j.jm };
        }
    };

    const pad = (n) => String(n).padStart(2, '0');

    /** تاریخ محلی (نه UTC) به رشته YYYY-MM-DD */
    function isoDate(d) {
        return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    }

    function parseISO(iso) {
        const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
        return m ? { y: +m[1], m: +m[2], d: +m[3] } : null;
    }

    /** YYYY-MM-DD -> Date در ساعت محلی (new Date(iso) به UTC تفسیر می‌شود و روز را جابه‌جا می‌کند) */
    function localDate(iso) {
        const p = parseISO(iso);
        return p ? new Date(p.y, p.m - 1, p.d) : new Date(NaN);
    }

    function toFa(x) {
        return String(x).replace(/\d/g, (c) => '۰۱۲۳۴۵۶۷۸۹'[c]);
    }

    /** ISO میلادی -> «۲۶ مهر ۱۴۰۵» */
    function fmtJ(iso, withWeekday) {
        const p = parseISO(iso);
        if (!p) return '—';
        const j = JAL.toJalali(p.y, p.m, p.d);
        let s = toFa(j.jd) + ' ' + JAL.MONTHS[j.jm - 1] + ' ' + toFa(j.jy);
        if (withWeekday) s = JAL.WEEKDAYS[new Date(p.y, p.m - 1, p.d).getDay()] + ' ' + s;
        return s;
    }

    /** ISO میلادی -> «۱۴۰۵/۰۷/۲۶» (برای برچسب نمودار) */
    function fmtJShort(iso) {
        const p = parseISO(iso);
        if (!p) return '';
        const j = JAL.toJalali(p.y, p.m, p.d);
        return toFa(pad(j.jm) + '/' + pad(j.jd));
    }

    /** شمسی -> ISO میلادی */
    function jToISO(jy, jm, jd) {
        const g = JAL.toGregorian(jy, jm, jd);
        return g.gy + '-' + pad(g.gm) + '-' + pad(g.gd);
    }

    Object.assign(root, { JAL, isoDate, parseISO, localDate, toFa, fmtJ, fmtJShort, jToISO });
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = { JAL, isoDate, parseISO, localDate, toFa, fmtJ, fmtJShort, jToISO };
    }
})(typeof window !== 'undefined' ? window : globalThis);
