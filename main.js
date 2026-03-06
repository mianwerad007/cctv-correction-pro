const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

// Initialize Database in the project folder
const db = new sqlite3.Database('./correction_db.sqlite');

db.serialize(() => {
    db.run(`CREATE TABLE IF NOT EXISTS corrections (
        sr_no INTEGER PRIMARY KEY AUTOINCREMENT,
        emp_code TEXT,
        entry_date DATE,
        in_time TEXT,
        out_time TEXT,
        remarks TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);
});

function createWindow() {
    const win = new BrowserWindow({
        width: 1200,
        height: 850,
        backgroundColor: '#0b0e14',
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });
    win.loadFile('index.html');
}

app.whenReady().then(createWindow);

// --- IPC LISTENERS ---

// 1. Data Insertion
ipcMain.on('add-entry', (event, data) => {
    const sql = `INSERT INTO corrections (emp_code, entry_date, in_time, out_time, remarks) VALUES (?, ?, ?, ?, ?)`;
    db.run(sql, [data.emp_code, data.entry_date, data.in_time, data.out_time, data.remarks], (err) => {
        event.reply('entry-response', err ? 'Error' : 'Success');
    });
});

// 2. Data Fetching
ipcMain.on('get-entries', (event) => {
    db.all("SELECT * FROM corrections ORDER BY sr_no DESC", [], (err, rows) => {
        event.reply('entries-data', rows || []);
    });
});

// 3. Data Deletion
ipcMain.on('delete-entry', (event, id) => {
    db.run("DELETE FROM corrections WHERE sr_no = ?", [id], (err) => {
        event.reply('entry-response', err ? 'Error' : 'Success');
    });
});

// 4. Data Update
ipcMain.on('update-entry', (event, data) => {
    const sql = `UPDATE corrections SET emp_code = ?, entry_date = ?, in_time = ?, out_time = ?, remarks = ? WHERE sr_no = ?`;
    db.run(sql, [data.emp_code, data.entry_date, data.in_time, data.out_time, data.remarks, data.sr_no], (err) => {
        event.reply('entry-response', err ? 'Error' : 'Success');
    });
});
// Handle Reset Database (Delete All)
ipcMain.on('reset-db', (event) => {
    db.run("DELETE FROM corrections", [], (err) => {
        if (err) {
            console.error(err.message);
            event.reply('entry-response', 'Error');
        } else {
            // Reset the auto-increment counter so SR. No starts at 1 again
            db.run("DELETE FROM sqlite_sequence WHERE name='corrections'");
            event.reply('entry-response', 'Success');
        }
    });
});