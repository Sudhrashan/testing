// ============================================================
// EVENTS.JS — All addEventListener calls in one place.
//             Called once from app.js after DOM is ready.
// ============================================================

function setupEventListeners() {

    // ── Login page ───────────────────────────────────────────
    on('loginBtn',        'click', () => doLogin());
    on('loginId',         'keypress', e => { if (e.key === 'Enter') doLogin(); });
    on('loginPw',         'keypress', e => { if (e.key === 'Enter') doLogin(); });

    // ── Change-password page ─────────────────────────────────
    on('changePwBtn',     'click', () => doChangePassword());

    // ── Supervisor page — header ─────────────────────────────
    on('logoutBtnSup',    'click', doLogout);
    on('installBtn',      'click', null); // handled in ui.js setupInstallButton()

    // ── Supervisor page — camera & form ─────────────────────
    on('openCameraBtn',   'click', openCamera);
    on('flipCameraBtn',   'click', flipCamera);
    on('captureBtn',      'click', capturePhoto);
    on('confirmPhotoBtn', 'click', confirmPhoto);
    on('retakeBtn',       'click', retakePhoto);
    // punch buttons are created dynamically in updatePunchButton()
    on('submitBtn',       'click', handleSubmitClick);
    on('shareBtn',        'click', handleShareClick);
    on('skipShareBtn',    'click', handleSkipShare);

    // ── Supervisor page — raise a complaint ──────────────────
    on('raiseComplaintBtn', 'click', handleRaiseComplaint);

    // ── Service Team page ─────────────────────────────────────
    on('logoutBtnService',  'click', doLogout);
    on('refreshServiceBtn', 'click', loadServiceComplaints);
    on('svcFilterStatus',   'change', loadServiceComplaints);

    // ── Admin page — complaints tab ───────────────────────────
    on('cmpFilterStatus',  'change', renderAdminComplaints);

    // ── Admin page — header ──────────────────────────────────
    on('logoutBtnAdmin',  'click', doLogout);
    on('refreshBtn',      'click', () => {
        loadAdminAttendance();
        loadAdminReports();
    });

    // ── Admin page — tabs ────────────────────────────────────
    document.querySelectorAll('.admin-tab-btn').forEach(btn => {
        btn.addEventListener('click', () => switchAdminTab(btn.dataset.tab));
    });

    // ── Admin page — attendance tab ──────────────────────────
    on('attFilterFrom',   'change', loadAdminAttendance);
    on('attFilterTo',     'change', loadAdminAttendance);
    on('attFilterSup',    'change', loadAdminAttendance);
    on('exportAttBtn',    'click', exportAttendanceCSV);

    // ── Admin page — reports tab ─────────────────────────────
    on('repFilterFrom',   'change', loadAdminReports);
    on('repFilterTo',     'change', loadAdminReports);
    on('reportSearch',    'input', renderReports);
    on('exportRepBtn',    'click', exportReportsCSV);
    on('clearDataBtn',    'click', clearAllDataConfirm);

    // ── Admin page — supervisors tab ─────────────────────────
    on('addSupervisorBtn', 'click', addSupervisor);

    // ── Modal ────────────────────────────────────────────────
    on('recordModal', 'click', e => {
        if (e.target.id === 'recordModal') closeModal();
    });
}

// Helper: attach event if element exists (no crash if element absent)
function on(id, event, handler) {
    if (!handler) return;
    const el = document.getElementById(id);
    if (el) el.addEventListener(event, handler);
}
