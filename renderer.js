const { ipcRenderer } = require('electron');
let allRecords = [];
let editModeId = null;

/** --- HELPER: TIME FORMATTING --- */
function formatTo12Hour(timeStr) {
    if (!timeStr || timeStr === "-" || timeStr === "") return "-";
    try {
        let [hours, minutes] = timeStr.split(':');
        hours = parseInt(hours);
        const ampm = hours >= 12 ? 'PM' : 'AM';
        hours = hours % 12 || 12;
        return `${hours.toString().padStart(2, '0')}:${minutes} ${ampm}`;
    } catch (e) { return timeStr; }
}

/** --- NAVIGATION --- */
function showPage(id, linkId) {
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active-page'));
    document.querySelectorAll('.sidebar a').forEach(a => a.classList.remove('active'));

    const targetPage = document.getElementById(id);
    if (targetPage) targetPage.classList.add('active-page');
    if (linkId) document.getElementById(linkId).classList.add('active');

    // Auto-refresh data when moving to record pages
    if (id === 'manage-entries' || id === 'print-page') loadEntries();
}

/** --- DATA SYNC WITH DATABASE --- */
function loadEntries() {
    ipcRenderer.send('get-entries');
}

ipcRenderer.on('entries-data', (event, rows) => {
    allRecords = rows || [];
    renderLogTable(); // Updates Correction Record page
    filterPrint();    // Updates Print Records page (Fixes your video issue)
});

/** --- FORM SUBMISSION (ADD & UPDATE) --- */
document.getElementById('entryForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const entryData = {
        emp_code: document.getElementById('emp_code').value,
        entry_date: document.getElementById('entry_date').value,
        in_time: document.getElementById('in_time').value || '-',
        out_time: document.getElementById('out_time').value || '-',
        remarks: document.getElementById('remarks').value
    };

    if (editModeId !== null) {
        entryData.sr_no = editModeId;
        ipcRenderer.send('update-entry', entryData);
        editModeId = null;
        document.querySelector('#add-page h1').innerText = "Add New CCTV Correction";
    } else {
        ipcRenderer.send('add-entry', entryData);
    }
    document.getElementById('entryForm').reset();
});

ipcRenderer.on('entry-response', (event, res) => {
    if (res === 'Success') {
        showToast("Process Completed Successfully!");
        loadEntries(); // Refresh from DB
    } else {
        alert("Database Error!");
    }
});

function showToast(text) {
    const msg = document.createElement('div');
    msg.style.cssText = "position:fixed; top:20px; right:20px; background:#7aa2f7; color:#0b0e14; padding:15px 25px; border-radius:8px; font-weight:bold; z-index:1000;";
    msg.innerText = text;
    document.body.appendChild(msg);
    setTimeout(() => msg.remove(), 3000);
}

/** --- CRUD ACTIONS --- */
function deleteEntry(id) {
    if (confirm("Permanently delete this record from database?")) {
        ipcRenderer.send('delete-entry', id);
    }
}

function editEntry(id) {
    const record = allRecords.find(r => r.sr_no === id);
    if (!record) return;

    editModeId = id;
    document.getElementById('emp_code').value = record.emp_code;
    document.getElementById('entry_date').value = record.entry_date;
    document.getElementById('in_time').value = record.in_time === '-' ? '' : record.in_time;
    document.getElementById('out_time').value = record.out_time === '-' ? '' : record.out_time;
    document.getElementById('remarks').value = record.remarks;

    document.querySelector('#add-page h1').innerText = "Edit CCTV Correction";
    showPage('add-page', 'link-add');
}

/** --- LOG HISTORY RENDERING --- */
function renderLogTable() {
    const manageTable = document.getElementById('manageTableBody');
    if (!manageTable) return;

    const searchText = document.getElementById('log-search')?.value.toLowerCase() || "";
    const sortOrder = document.getElementById('log-sort')?.value || "desc";

    let filtered = allRecords.filter(r => r.emp_code.toString().toLowerCase().includes(searchText));

    filtered.sort((a, b) => {
        const dateA = new Date(a.entry_date);
        const dateB = new Date(b.entry_date);
        return sortOrder === 'asc' ? (dateA - dateB || a.sr_no - b.sr_no) : (dateB - dateA || b.sr_no - a.sr_no);
    });

    manageTable.innerHTML = filtered.map(r => `
        <tr>
            <td>${r.sr_no}</td>
            <td style="color:#7aa2f7; font-weight:600">${r.emp_code}</td>
            <td>${r.entry_date}</td>
            <td>${formatTo12Hour(r.in_time)}</td>
            <td>${formatTo12Hour(r.out_time)}</td>
            <td>${r.remarks}</td>
            <td class="no-print">
                <button onclick="editEntry(${r.sr_no})" style="background:none; border:none; color:#7aa2f7; cursor:pointer; margin-right:10px;">Edit</button>
                <button onclick="deleteEntry(${r.sr_no})" style="background:none; border:none; color:#f77a7a; cursor:pointer;">Delete</button>
            </td>
        </tr>
    `).join('');
}

/** --- PRINT FILTERING --- */
function filterPrint() {
    const start = document.getElementById('print-start-date').value;
    const end = document.getElementById('print-end-date').value;
    const table = document.getElementById('printTableBody');
    const label = document.getElementById('print-date-display');

    if (!start || !end || !table) return;

    label.innerText = (start === end) ? `Date: ${start}` : `Range: ${start} to ${end}`;

    const filtered = allRecords.filter(r => r.entry_date >= start && r.entry_date <= end);
    filtered.sort((a, b) => new Date(a.entry_date) - new Date(b.entry_date));

    let html = filtered.map((r, i) => `
        <tr>
            <td>${i + 1}</td>
            <td>${r.emp_code}</td>
            <td>${r.entry_date}</td>
            <td>${formatTo12Hour(r.in_time)}</td>
            <td>${formatTo12Hour(r.out_time)}</td>
            <td>${r.remarks}</td>
        </tr>
    `).join('');

    for (let i = filtered.length; i < 23; i++) {
        html += `<tr><td>${i + 1}</td><td></td><td></td><td></td><td></td><td></td></tr>`;
    }
    table.innerHTML = html;
}

/** --- RESTRICTIONS & STARTUP --- */
function applyDateRestrictions() {
    const today = new Date().toISOString().split('T')[0];
    const minDate = `${new Date().getFullYear()}-01-01`;
    ['entry_date', 'print-start-date', 'print-end-date'].forEach(id => {
        const el = document.getElementById(id);
        if (el) { el.setAttribute('min', minDate); el.setAttribute('max', today); }
    });
}
/** --- RESET DATABASE --- */
function resetDatabase() {
    const confirmation = confirm("WARNING: This will permanently erase ALL records from the database. This action cannot be undone. Are you sure you want to proceed?");

    if (confirmation) {
        const secondCheck = confirm("Double check: Do you have a backup or have you printed your monthly report? Click OK to delete everything.");
        if (secondCheck) {
            ipcRenderer.send('reset-db');
        }
    }
}
/** --- THEME TOGGLE (With Icon Change) --- */
function toggleTheme() {
    const body = document.body;
    body.classList.toggle('light-mode');
    
    // Switch between Moon and Sun icons
    const isLight = body.classList.contains('light-mode');
    const icon = document.getElementById('theme-icon');
    
    if (isLight) {
        icon.classList.remove('fa-moon');
        icon.classList.add('fa-sun');
    } else {
        icon.classList.remove('fa-sun');
        icon.classList.add('fa-moon');
    }
    
    localStorage.setItem('theme', isLight ? 'light' : 'dark');
}

/** --- KEYBOARD SHORTCUTS --- */
window.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 's') { e.preventDefault(); document.getElementById('entryForm').requestSubmit(); }
    if (e.ctrlKey && e.key === 'h') { e.preventDefault(); showPage('manage-entries', 'link-manage'); loadEntries(); }
    if (e.ctrlKey && e.key === 'p') { e.preventDefault(); showPage('print-page', 'link-print'); initPrint(); }
    if (e.ctrlKey && e.key === 'n') { e.preventDefault(); showPage('add-page', 'link-add'); }
});

/** --- INITIALIZE SAVED THEME --- */
window.addEventListener('DOMContentLoaded', () => {
    // 1. Initialize Saved Theme
    const savedTheme = localStorage.getItem('theme');
    const body = document.body;
    const icon = document.getElementById('theme-icon');

    if (savedTheme === 'light') {
        body.classList.add('light-mode');
        icon.classList.remove('fa-moon');
        icon.classList.add('fa-sun');
    } else {
        body.classList.remove('light-mode');
        icon.classList.remove('fa-sun');
        icon.classList.add('fa-moon');
    }

    // ... Rest of your DOMContentLoaded logic (Date restrictions, etc.) ...
});
window.addEventListener('DOMContentLoaded', () => {
    applyDateRestrictions();
    loadEntries(); // Sync with SQLite on startup
    showPage('add-page', 'link-add');
});