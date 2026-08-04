// ============================================================
// ATTENDANCE.JS — Fully automatic two-session attendance.
//   No punch buttons — the first photo captured in a session
//   window IS the punch IN. Sessions auto-close (punch OUT) at
//   a fixed cutoff time if the supervisor never took a photo
//   after the cutoff to close it themselves.
//
//   Session 1 (morning):  IN = first photo captured before 3:00 PM
//                          OUT = auto-closed at 2:00 PM
//   Session 2 (evening):  IN = first photo captured at/after 3:00 PM
//                          OUT = auto-closed at 11:00 PM
//
//   If a supervisor's FIRST photo of the day is already at/after
//   3:00 PM, Session 1 is skipped entirely (never started, so
//   nothing to auto-close) and Session 2 IN is recorded directly.
// ============================================================

const ATT_LS_KEY = 'vd_attendance';

// Session 2 begins at 3:00 PM — first capture at/after this time is 2nd IN.
const SESSION2_START_MIN   = 15 * 60;       // 3:00 PM
// Auto-close cutoffs (if session was opened but never closed by then).
const SESSION1_AUTOOUT_MIN = 14 * 60;       // 2:00 PM
const SESSION2_AUTOOUT_MIN = 23 * 60;       // 11:00 PM

// ── Persistence (per device, ISO date key) ────────────────────

function _attKey() {
    return `${STATE.currentUser?.id}_${formatDateISO(new Date())}`;
}

function loadAttendanceToday() {
    try {
        const all = JSON.parse(localStorage.getItem(ATT_LS_KEY) || '{}');
        STATE.attendanceToday = all[_attKey()] || {
            in1: null, out1: null, in2: null, out2: null
        };
    } catch (e) {
        STATE.attendanceToday = { in1: null, out1: null, in2: null, out2: null };
    }
}

function saveAttendanceToday() {
    try {
        const all = JSON.parse(localStorage.getItem(ATT_LS_KEY) || '{}');
        all[_attKey()] = STATE.attendanceToday;
        localStorage.setItem(ATT_LS_KEY, JSON.stringify(all));
    } catch (e) { console.warn('Attendance save error', e); }
}

// ── Send a punch to the backend + persist locally ─────────────

async function _recordPunch(punchType, when, auto) {
    const sessionKey = { '1st_in': 'in1', '1st_out': 'out1', '2nd_in': 'in2', '2nd_out': 'out2' }[punchType];

    const pos = STATE.currentPosition || {};
    const time = formatTime(when);

    const punchData = {
        punchType,
        supervisorId:   STATE.currentUser?.id   || 'unknown',
        supervisorName: STATE.currentUser?.name || 'unknown',
        time,
        lat: pos.latitude  ?? null,
        lon: pos.longitude ?? null,
        village: STATE.currentLocationName || 'Unknown',
        date: formatDateISO(when),
        auto: !!auto,
    };

    STATE.attendanceToday[sessionKey] = { time, lat: punchData.lat, lon: punchData.lon, auto: !!auto };
    saveAttendanceToday();

    let statusLabel = '';
    const mins = nowMinutes();
    if (punchType === '1st_in') statusLabel = mins > (7 * 60 + 30) ? ' (Late)' : ' (On-Time)';
    if (punchType === '2nd_in') statusLabel = mins > (17 * 60)     ? ' (Late)' : ' (On-Time)';

    const res = await apiPost('punch', punchData);
    const tag = auto ? ' [auto]' : '';
    if (res.ok && res.data?.success) {
        showMessage(`✅ Attendance recorded at ${time}${statusLabel}${tag}`, 'success');
    } else {
        console.warn('Punch sync issue:', res.data?.error || res.reason);
    }

    updateAttendanceStatusUI();
}

// ── Auto punch-IN, triggered by photo capture ──────────────────
// Call this every time a photo is captured/confirmed. It only ever
// records the FIRST capture of a still-open session — later
// captures in the same window are no-ops for attendance.

function handleAutoPunch() {
    loadAttendanceToday();
    const a = STATE.attendanceToday;
    const now  = new Date();
    const mins = nowMinutes();
    const inSession2Window = mins >= SESSION2_START_MIN;

    if (!inSession2Window) {
        // Before 3 PM → Session 1
        if (!a.in1) {
            _recordPunch('1st_in', now, false);
        }
        // If in1 already set (or out1 already auto/manual-closed), a later
        // photo in the same window does nothing for attendance.
        return;
    }

    // At/after 3 PM → Session 2. Make sure Session 1 has an OUT if it was
    // ever opened (safety net — normally the periodic check already closed it).
    if (a.in1 && !a.out1) {
        _recordPunch('1st_out', now, true);
    }
    if (!a.in2) {
        _recordPunch('2nd_in', now, false);
    }
}

// ── Auto-close check — run on load and on a periodic timer ────
// Closes any session that's still open once its cutoff has passed.

function checkAutoCloseSessions() {
    loadAttendanceToday();
    const a = STATE.attendanceToday;
    const now  = new Date();
    const mins = nowMinutes();

    if (a.in1 && !a.out1 && mins >= SESSION1_AUTOOUT_MIN) {
        _recordPunch('1st_out', now, true);
    }
    if (a.in2 && !a.out2 && mins >= SESSION2_AUTOOUT_MIN) {
        _recordPunch('2nd_out', now, true);
    }
}

// ── Read-only status line (replaces the old punch buttons) ────

function showPunchButton() {
    // Kept for backward-compat naming; now just shows the status line.
    loadAttendanceToday();
    const wrap = document.getElementById('punchActionWrap');
    if (wrap) wrap.style.display = 'block';
    updateAttendanceStatusUI();
}

function updateAttendanceStatusUI() {
    const status = document.getElementById('punchStatus');
    if (!status) return;

    const a = STATE.attendanceToday || {};
    const parts = [];
    if (a.in1)  parts.push(`1st IN ${a.in1.time}`);
    if (a.out1) parts.push(`1st OUT ${a.out1.time}${a.out1.auto ? ' (auto)' : ''}`);
    if (a.in2)  parts.push(`2nd IN ${a.in2.time}`);
    if (a.out2) parts.push(`2nd OUT ${a.out2.time}${a.out2.auto ? ' (auto)' : ''}`);

    status.textContent = parts.length
        ? parts.join('  •  ')
        : 'Attendance is recorded automatically — take a photo to punch in.';
}

// Backwards-compatible alias — some UI code may still call this name.
function updatePunchButton() {
    updateAttendanceStatusUI();
}

// Called when arriving at supervisor page.
function updateAttendanceUI() {
    loadAttendanceToday();
    checkAutoCloseSessions();
    const wrap = document.getElementById('punchActionWrap');
    if (wrap) wrap.style.display = 'block';
    updateAttendanceStatusUI();
}
