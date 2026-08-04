// ============================================================
// ADMIN.JS — Admin dashboard: attendance tab, reports tab,
//            clickable map links, export CSV, clear data.
//            Fetches from Google Sheets when SCRIPT_URL is set;
//            falls back to local device data only.
// ============================================================

// ── Init ──────────────────────────────────────────────────────

function initAdminDashboard() {
    // Refresh the employee directory so admin always sees the latest
    // supervisor list (add/delete elsewhere may have changed it).
    refreshEmployeeList().then(() => populateSupervisorFilter());
    populateSupervisorFilter();

    // Default date = today (ISO YYYY-MM-DD — required by <input type="date">)
    const dateEl = document.getElementById('attFilterDate');
    if (dateEl && !dateEl.value) {
        dateEl.value = formatDateISO(new Date());
    }

    switchAdminTab('attendance');
    loadAdminAttendance();
}

// Rebuilds the attendance filter's supervisor dropdown from the current
// employee directory. Safe to call repeatedly (e.g. after add/delete) —
// preserves whatever was selected, if it still exists.
function populateSupervisorFilter() {
    const sel = document.getElementById('attFilterSup');
    if (!sel) return;

    const prev = sel.value;
    sel.innerHTML = '<option value="">All Supervisors</option>';
    getEmployeeList().filter(e => e.role === 'supervisor').forEach(emp => {
        const opt       = document.createElement('option');
        opt.value       = emp.id;
        opt.textContent = emp.name + ' (' + emp.id + ')';
        sel.appendChild(opt);
    });
    if (prev && [...sel.options].some(o => o.value === prev)) sel.value = prev;
}

function switchAdminTab(tab) {
    STATE.adminTab = tab;
    document.querySelectorAll('.admin-tab-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.tab === tab);
    });
    document.querySelectorAll('.admin-tab-panel').forEach(p => {
        p.classList.toggle('active', p.id === 'tab-' + tab);
    });
    // Load reports on first switch to that tab
    if (tab === 'reports') loadAdminReports();
    if (tab === 'supervisors') loadSupervisorsList();
}

// ── Loading state helper ──────────────────────────────────────

function tableLoading(tbodyId, colspan, msg) {
    const el = document.getElementById(tbodyId);
    if (el) el.innerHTML = `<tr><td colspan="${colspan}" class="no-records">${msg}</td></tr>`;
}

// ── Attendance tab ────────────────────────────────────────────

async function loadAdminAttendance() {
    const dateEl  = document.getElementById('attFilterDate');
    const supEl   = document.getElementById('attFilterSup');
    const date    = dateEl?.value || formatDateISO(new Date()); // ISO YYYY-MM-DD
    const supId   = supEl?.value  || '';

    tableLoading('attTableBody', 8, '⏳ Loading attendance...');

    // Try Google Sheets (all devices' data)
    const res = await apiFetchAttendance(date, supId);
    if (res.ok && Array.isArray(res.data?.rows)) {
        STATE.adminAttendance = res.data.rows;
        renderAttendanceTable(res.data.rows);
        return;
    }

    // Fallback: local storage (only THIS device's punches)
    console.warn('Attendance API failed or returned invalid data:', res);
    renderAttendanceFallback(date, supId);
}

function renderAttendanceFallback(date, supId) {
    const all = JSON.parse(localStorage.getItem('vd_attendance') || '{}');
    const rows = getEmployeeList()
        .filter(e => e.role === 'supervisor')
        .filter(emp => !supId || emp.id === supId)
        .map(emp => {
            const att = all[`${emp.id}_${date}`] || {}; // local keys use ISO now
            const g = (slot) => att[slot] || {};
            return {
                name: emp.name, id: emp.id,
                in1: g('in1').time || '--', in1Status: '--', in1Lat: g('in1').lat || null, in1Lon: g('in1').lon || null,
                out1: g('out1').time || '--', out1Lat: g('out1').lat || null, out1Lon: g('out1').lon || null, total1: '--',
                in2: g('in2').time || '--', in2Status: '--', in2Lat: g('in2').lat || null, in2Lon: g('in2').lon || null,
                out2: g('out2').time || '--', out2Lat: g('out2').lat || null, out2Lon: g('out2').lon || null, total2: '--',
                finalTotal: '--'
            };
        });

    renderAttendanceTable(rows);
}

function renderAttendanceTable(rows) {
    const tbody = document.getElementById('attTableBody');
    if (!tbody) return;

    if (!rows || rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" class="no-records">No attendance data for this date</td></tr>';
        return;
    }

    const cell = (time, lat, lon, status) => {
        const loc = (lat && lon)
            ? ` <a href="${mapsLink(lat, lon)}" target="_blank" class="map-link">📍</a>` : '';
        const badge = (status && status !== '--')
            ? `<br><span class="badge ${status === 'On-Time' ? 'badge-green' : 'badge-red'}">${status}</span>` : '';
        return `${time || '--'}${loc}${badge}`;
    };

    // OUT cell: show a red "Missing" flag when the session was started
    // (IN present) but never punched out.
    const outCell = (inTime, outTime, lat, lon) => {
        const started = inTime && inTime !== '--';
        const noOut   = !outTime || outTime === '--' || outTime === 'Missing';
        if (started && noOut) {
            return `<span class="badge badge-red">⚠️ Missing</span>`;
        }
        return cell(outTime, lat, lon);
    };

    tbody.innerHTML = rows.map(r => `<tr>
        <td>${r.name}<br><small style="color:#888">${r.id}</small></td>
        <td>${cell(r.in1, r.in1Lat, r.in1Lon, r.in1Status)}</td>
        <td>${outCell(r.in1, r.out1, r.out1Lat, r.out1Lon)}</td>
        <td>${r.total1 || '--'}</td>
        <td>${cell(r.in2, r.in2Lat, r.in2Lon, r.in2Status)}</td>
        <td>${outCell(r.in2, r.out2, r.out2Lat, r.out2Lon)}</td>
        <td>${r.total2 || '--'}</td>
        <td><strong>${r.finalTotal || '--'}</strong></td>
    </tr>`).join('');
}

function exportAttendanceCSV() {
    const date = document.getElementById('attFilterDate')?.value || formatDateISO(new Date());

    const headers = ['Supervisor', 'ID', '1st IN', '1st Status', '1st OUT', '1st Total',
                     '2nd IN', '2nd Status', '2nd OUT', '2nd Total', 'Final Total'];
    // Export whatever is currently rendered (from the last fetch)
    const rows = (STATE.adminAttendance || []).map(r => [
        r.name, r.id, r.in1, r.in1Status, r.out1, r.total1,
        r.in2, r.in2Status, r.out2, r.total2, r.finalTotal
    ]);

    exportToCSV(headers, rows, `attendance_${formatDateDisplay(date).replace(/\//g, '-')}.csv`);
    showMessage('✅ Attendance CSV exported', 'success');
}

// ── Reports tab ───────────────────────────────────────────────

async function loadAdminReports() {
    tableLoading('reportTableBody', 5, '⏳ Loading reports...');

    // Try Google Sheets (ALL supervisors' reports from all devices)
    const res = await apiFetchReports();
    if (res.ok && Array.isArray(res.data?.rows)) {
        STATE.allRecords = res.data.rows;
        renderReports();
        return;
    }

    // Fallback: local IndexedDB (only records entered on this device)
    console.warn('Reports API failed or returned invalid data:', res);
    await loadAllRecords();
    renderReports();
}

function renderReports() {
    const tbody = document.getElementById('reportTableBody');
    if (!tbody) return;

    if (STATE.allRecords.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="no-records">No reports found</td></tr>';
        updateAdminStats();
        return;
    }

    const query = (document.getElementById('reportSearch')?.value || '').toLowerCase();
    const list  = query
        ? STATE.allRecords.filter(r =>
              r.vendorName?.toLowerCase().includes(query)       ||
              r.dairyName?.toLowerCase().includes(query)        ||
              r.routeName?.toLowerCase().includes(query)        ||
              r.location?.toLowerCase().includes(query)         ||
              r.supervisorName?.toLowerCase().includes(query))
        : STATE.allRecords;

    tbody.innerHTML = list.map(r => {
        const loc = (r.lat && r.lon)
            ? `<a href="${mapsLink(r.lat, r.lon)}" target="_blank" class="map-link">${r.location || '📍 View'}</a>`
            : (r.location || '--');

        // Prefer formatted date/time; fall back to parsing the ISO timestamp
        // Full timestamp: "Fri Jul 03 2026 10:42:20 AM"
        const when = r.timestamp || (r.date && r.time
            ? `${formatDateDisplay(isoOrDmyToIso(r.date))} ${r.time}` : '--');

        return `<tr onclick="viewReport('${r.id}')">
            <td>${when}</td>
            <td>${r.supervisorName || '--'}<br><small>${r.supervisorId || ''}</small></td>
            <td>${loc}</td>
            <td>${r.vendorName || '--'}<br><small style="color:#888">${r.vendorType || ''}</small></td>
            <td>${r.shift || '--'}</td>
        </tr>`;
    }).join('');

    updateAdminStats();
}

function updateAdminStats() {
    const today     = formatDateISO(new Date());        // IST YYYY-MM-DD
    const thisMonth = today.slice(0, 7);                 // YYYY-MM

    // Prefer the ISO date field; fall back to isoStamp for old records.
    const dayOf = (r) => isoOrDmyToIso(r.date || (r.isoStamp || '').slice(0, 10));

    setVal('totalStats', STATE.allRecords.length);
    setVal('todayStats', STATE.allRecords.filter(r => dayOf(r) === today).length);
    setVal('monthStats', STATE.allRecords.filter(r => dayOf(r).startsWith(thisMonth)).length);
}

function setVal(id, val) {
    const el = document.getElementById(id);
    if (el) el.textContent = val;
}

// ── Report detail modal ───────────────────────────────────────

function viewReport(id) {
    const r = STATE.allRecords.find(x => x.id === id);
    if (!r) return;

    const mLink = (r.lat && r.lon)
        ? `<a href="${mapsLink(r.lat, r.lon)}" target="_blank" class="map-link">📍 Open in Google Maps</a>`
        : '--';

    const when = r.timestamp || (r.date && r.time
        ? `${formatDateDisplay(isoOrDmyToIso(r.date))} ${r.time}` : '--');
    document.getElementById('modalTimestamp').textContent  = when;
    document.getElementById('modalShift').textContent      = r.shift        || '--';
    document.getElementById('modalLocation').innerHTML     = mLink;
    document.getElementById('modalGPS').textContent        = (r.lat && r.lon)
        ? `${Number(r.lat).toFixed(6)}, ${Number(r.lon).toFixed(6)}`
        : '--';
    const vt = document.getElementById('modalVendorType');
    if (vt) vt.textContent = r.vendorType || '--';
    document.getElementById('modalVendor').textContent     = r.vendorName      || '--';
    document.getElementById('modalRoute').textContent      = r.routeName       || '--';
    document.getElementById('modalDairy').textContent      = r.dairyName       || '--';
    document.getElementById('modalContact').textContent    = r.contactNo       || '--';
    document.getElementById('modalMilk').textContent       = r.milkLtrs        || '--';
    document.getElementById('modalFatSnf').textContent     = r.fatSnf          || '--';
    document.getElementById('modalRate').textContent       = r.avgRate         || '--';
    document.getElementById('modalAdditional').textContent = r.additionalRate  || '--';
    document.getElementById('modalSalary').textContent     = r.vlccSalary      || '--';
    document.getElementById('modalDiscussion').textContent = r.discussionPoint || '--';
    document.getElementById('modalRemarks').textContent    = r.noteField       || '--';

    const photoEl = document.getElementById('modalPhotoNote');
    if (photoEl) photoEl.textContent = 'Photos shared via Telegram only — not stored in this system.';

    document.getElementById('recordModal').classList.add('active');
}

function closeModal() {
    document.getElementById('recordModal').classList.remove('active');
}

// ── CSV export ────────────────────────────────────────────────

function exportReportsCSV() {
    if (STATE.allRecords.length === 0) {
        showMessage('No reports to export', 'error');
        return;
    }
    const headers = [
        'Date', 'Time', 'Shift', 'Supervisor', 'ID',
        'Location', 'Latitude', 'Longitude',
        'Vendor Type', 'Vendor/VLCC', 'Route', 'Dairy', 'Contact', 'Milk(L)', 'Fat&SNF',
        'Avg Rate', 'Additional Incentive', 'VLCC Salary', 'Discussion', 'Remarks'
    ];
    const rows = STATE.allRecords.map(r => [
        formatDateDisplay(isoOrDmyToIso(r.date)), r.time, r.shift,
        r.supervisorName, r.supervisorId,
        r.location, r.lat, r.lon,
        r.vendorType, r.vendorName, r.routeName, r.dairyName, r.contactNo,
        r.milkLtrs, r.fatSnf, r.avgRate, r.additionalRate, r.vlccSalary,
        r.discussionPoint, r.noteField
    ]);
    exportToCSV(headers, rows, `reports_${formatDateDisplay(new Date()).replace(/\//g, '-')}.csv`);
    showMessage('✅ Reports CSV exported', 'success');
}

// ── Clear local data ──────────────────────────────────────────

async function clearAllDataConfirm() {
    if (confirm('⚠️ This will delete all LOCAL records on this device.\n\nGoogle Sheets data is not affected.\n\nContinue?')) {
        await clearAllData();
        STATE.allRecords = [];
        renderReports();
        showMessage('✅ Local data cleared', 'success');
    }
}

// ── Supervisors tab ───────────────────────────────────────────

async function loadSupervisorsList() {
    const tbody = document.getElementById('supervisorTableBody');
    if (!tbody) return;

    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:20px;">⏳ Loading supervisors...</td></tr>';

    const res = await apiListSupervisors();
    if (res.ok && Array.isArray(res.data?.rows)) {
        renderSupervisorsList(res.data.rows);
    } else {
        console.warn('Failed to load supervisors:', res);
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:20px;color:#d32f2f;">⚠️ Failed to load supervisors</td></tr>';
    }
}

function renderSupervisorsList(supervisors) {
    const tbody = document.getElementById('supervisorTableBody');
    if (!tbody || !supervisors || supervisors.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;padding:20px;">No supervisors found</td></tr>';
        return;
    }

    tbody.innerHTML = supervisors.map(s => `<tr>
        <td>${s.id}</td>
        <td>${s.name}</td>
        <td>${s.lastReset || '--'}</td>
        <td style="text-align:center;white-space:nowrap;">
            <button class="btn btn-primary btn-small" onclick="resetSupervisorPassword('${s.id}', '${s.name}')">🔑 Reset</button>
            <button class="btn btn-danger btn-small" onclick="deleteSupervisor('${s.id}', '${s.name}')">🗑️ Delete</button>
        </td>
    </tr>`).join('');
}

// ── Add supervisor ─────────────────────────────────────────────

async function addSupervisor() {
    const idInput   = document.getElementById('newSupId');
    const nameInput = document.getElementById('newSupName');
    const errEl     = document.getElementById('addSupervisorError');
    const btn       = document.getElementById('addSupervisorBtn');

    const id   = idInput.value.trim();
    const name = nameInput.value.trim();

    errEl.classList.remove('active');

    if (!/^\d{4}$/.test(id)) {
        errEl.textContent = '❌ Employee ID must be exactly 4 digits.';
        errEl.classList.add('active');
        return;
    }
    if (!name) {
        errEl.textContent = '❌ Name is required.';
        errEl.classList.add('active');
        return;
    }

    btn.disabled = true;
    btn.textContent = '⏳ Adding...';

    const res = await apiAddSupervisor(id, name);

    btn.disabled = false;
    btn.textContent = '➕ Add Supervisor';

    if (res.ok && res.data?.success) {
        idInput.value = '';
        nameInput.value = '';
        showMessage(`✅ Supervisor ${name} (${id}) added`, 'success');
        await refreshEmployeeList();
        populateSupervisorFilter();
        loadSupervisorsList();
    } else {
        errEl.textContent = '❌ ' + (res.data?.error || 'Failed to add supervisor');
        errEl.classList.add('active');
    }
}

// ── Delete supervisor ───────────────────────────────────────────

async function deleteSupervisor(supId, supName) {
    if (!confirm(`Remove ${supName} (${supId})?\n\nThey will no longer be able to log in. Their past attendance and report history is kept.`)) return;

    const res = await apiDeleteSupervisor(supId);

    if (res.ok && res.data?.success) {
        showMessage(`✅ Supervisor ${supName} (${supId}) removed`, 'success');
        await refreshEmployeeList();
        populateSupervisorFilter();
        loadSupervisorsList();
    } else {
        showMessage('❌ ' + (res.data?.error || 'Failed to remove supervisor'), 'error');
    }
}

async function resetSupervisorPassword(supId, supName) {
    if (!confirm(`Reset password for ${supName} (${supId})?`)) return;

    const btn = event.target;
    btn.disabled = true;
    btn.textContent = '⏳ Resetting...';

    const res = await apiResetPassword(supId);

    btn.disabled = false;
    btn.textContent = '🔑 Reset';

    if (res.ok && res.data?.tempPassword) {
        showPasswordModal(supName, supId, res.data.tempPassword);
        loadSupervisorsList();
    } else {
        showMessage('❌ Failed to reset password', 'error');
    }
}

function showPasswordModal(supName, supId, tempPassword) {
    const modal = document.createElement('div');
    modal.className = 'modal active';
    modal.innerHTML = `
        <div class="modal-content" style="max-width:400px;">
            <button class="modal-close" onclick="this.closest('.modal').remove()">✕</button>
            <div class="modal-title">🔑 Temporary Password</div>
            <p style="font-size:13px;color:var(--text-secondary);margin:12px 0;">
                Password reset for <strong>${supName} (${supId})</strong>
            </p>
            <div style="background:#f5f5f5;padding:16px;border-radius:8px;margin:12px 0;">
                <div style="font-size:12px;color:#888;margin-bottom:4px;">Temporary Password:</div>
                <div style="font-size:16px;font-weight:bold;color:#1a7a3c;font-family:monospace;word-break:break-all;">
                    ${tempPassword}
                </div>
            </div>
            <div style="background:#fff3cd;border:1px solid #ffc107;padding:12px;border-radius:6px;margin:12px 0;font-size:12px;color:#333;">
                ⚠️ Share this with the supervisor. They will be prompted to change it on next login.
            </div>
            <button class="btn btn-primary" style="width:100%;" onclick="
                navigator.clipboard.writeText('${tempPassword}').then(() => {
                    showMessage('✅ Password copied to clipboard', 'success');
                });
            ">📋 Copy to Clipboard</button>
        </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
}
