// ============================================================
// NAVIGATION.JS — Page switching with auth guard
// ============================================================

function showPage(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const target = document.getElementById(pageId);
    if (target) target.classList.add('active');

    // Refresh dynamic content when arriving at a page
    if (pageId === 'page-supervisor') {
        initDateShiftField();
        updateAttendanceUI();
        updateGPSDisplay();
    }
    if (pageId === 'page-admin') {
        initAdminDashboard();
        loadAdminReports();
    }
}

// Called on every app start
function routeOnLoad() {
    if (loadSession()) {
        goToRolePage();
    } else {
        showPage('page-login');
    }
}
