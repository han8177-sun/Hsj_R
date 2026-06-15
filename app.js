// --- Global Config & Keys ---

const CLIENT_ID = '1059241393010-dhcs8fm43uqppd65m113eqj4jk8qk6dt.apps.googleusercontent.com';
const API_KEY = 'AIzaSyBSmTQrvXqgFlReBfwGolfgSWlNLHU5_-s';
const DISCOVERY_DOCS = ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"];
const SCOPES = 'https://www.googleapis.com/auth/drive.file';

let tokenClient;
let gapiInited = false;
let gisInited = false;
let driveFileId = null; 

let currentDay = new Date().getDay(); // 0(Sun) ~ 6(Sat)
if(currentDay === 0) currentDay = 7; // Convert Sun(0) to 7 for easier Mon-Sun logic (1-7)

let selectedDateStr = getYYYYMMDD(new Date());

let expenseChartInstance = null; // New chart instance
let editingTransactionId = null; // Explicit transaction lookup ID tracker

// Global XSS Sanitization helper
let lastModalOpenTime = 0; // Ghost click prevention on mobile

function sanitizeHTML(str) {
    if(!str) return "";
    return str.toString()
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function getYYYYMMDD(dateObj) {
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// --- Default Data Structure ---
let appData = {
    title: "CYBER.PLANNER",
    theme: "solid", // solid, gradient, space
    email: "",
    dday: { name: "", date: "" }, // Legacy
    ddays: [], // New array for up to 3 D-Days
    bedTime: "23:30", // Bedtime
    wakeTime: "07:00", // Wakeup time
    schoolGrid: {},
    academy: { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] }, // Mon-Sun
    goals: [],
    finance: []
};

function initEmptyGrid() {
    let grid = {};
    for(let p=1; p<=8; p++) {
        // Only 5 days (Mon-Fri) for school grid
        grid[p] = [null, null, null, null, null]; 
    }
    return grid;
}

// --- Praise Messages ---
const praisesWeekday = [
    "SYSTEM CLEAR! 참 잘했어요! 😎",
    "MISSION ACCOMPLISHED! 오늘 폼 미쳤다 🔥",
    "PERFECT! 완벽해! 이대로만 가자! 🚀",
    "LEVEL UP! 성실함 100점 💯",
    "목표 달성! 너 좀 멋진데? ✨",
    "대단해! 꾸준함이 무기다! ⚔️"
];

const praisesWeekend = [
    "WEEKEND CLEARED! 오늘 주말도 알차게 보냈네! 🎉",
    "노는 것도 계획적으로 하는 네가 챔피언! 🏆",
    "주말 미션 성공적! 푹 쉬고 에너지 충전하자! 🔋",
    "갓생러 인정! 주말까지 완벽하잖아? 🌟"
];

// --- Category Icons Mapping ---
const categoryIcons = {
    'study': { icon: 'menu_book', colorClass: 'cat-study' },
    'exercise': { icon: 'fitness_center', colorClass: 'cat-exercise' },
    'read': { icon: 'auto_stories', colorClass: 'cat-read' },
    'game': { icon: 'sports_esports', colorClass: 'cat-game' },
    'hobby': { icon: 'brush', colorClass: 'cat-hobby' },
    'other': { icon: 'pending_actions', colorClass: 'cat-other' }
};

// --- Initialization ---
document.addEventListener('DOMContentLoaded', () => {
    appData.schoolGrid = initEmptyGrid();
    generateTimeOptions(); // Generate dropdown options
    loadLocalData();
    applyTheme();
    initUI();
    renderAll();

    // Modal backdrop click to close (with ghost-click protection for mobile)
    document.querySelectorAll('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay && Date.now() - lastModalOpenTime > 300) {
                closeModals();
            }
        });
    });

    // Notifications: init after data is loaded
    requestNotificationPermission();
    setTimeout(scheduleNotifications, 2000);
});

function generateTimeOptions() {
    let optionsHTML = '<option value="">선택박스</option>';
    for(let h=0; h<24; h++) {
        for(let m=0; m<60; m+=10) {
            let hourStr = h.toString().padStart(2, '0');
            let minStr = m.toString().padStart(2, '0');
            let timeVal = `${hourStr}:${minStr}`;
            optionsHTML += `<option value="${timeVal}">${timeVal}</option>`;
        }
    }
    
    // Assign to school modal
    document.getElementById('schoolStart').innerHTML = optionsHTML;
    document.getElementById('schoolEnd').innerHTML = optionsHTML;
    
    // Assign to academy modal
    document.getElementById('academyStart').innerHTML = optionsHTML;
    document.getElementById('academyEnd').innerHTML = optionsHTML;
}

function loadLocalData() {
    const saved = localStorage.getItem('cyberPlannerData');
    if (saved) {
        let parsed = JSON.parse(saved);
        appData.title = parsed.title || appData.title;
        appData.theme = parsed.theme || appData.theme;
        appData.email = parsed.email || appData.email;
        appData.sleepTime = (parsed.sleepTime !== undefined) ? parsed.sleepTime : (parsed.baseFreeTime !== undefined ? 8 : 7.5);
        
        // Handle migration from single D-Day to Multi D-Day
        appData.ddays = parsed.ddays || [];
        if (appData.ddays.length === 0 && parsed.dday && parsed.dday.date) {
            appData.ddays.push({ name: parsed.dday.name, date: parsed.dday.date });
        }
        
        // Ensure weekend arrays exist for backward compatibility
        appData.academy = parsed.academy || appData.academy;
        if(!appData.academy[6]) appData.academy[6] = [];
        if(!appData.academy[7]) appData.academy[7] = [];
        
        appData.goals = parsed.goals || [];
        // Map old goals to recurring goal structure safely
        appData.goals = appData.goals.map(g => {
            if(!g.category) g.category = 'study'; // default fallback
            if(!g.color) g.color = 'pastel-pink';
            if(!g.repeat) g.repeat = 'none';
            if(!g.date) g.date = getYYYYMMDD(new Date());
            if(!g.endDate) g.endDate = '';
            
            // Migrate old 'done' boolean to 'doneDates' array
            if(g.doneDates === undefined) {
                g.doneDates = [];
                if(g.done === true) {
                    g.doneDates.push(g.date);
                }
            }
            return g;
        });

        appData.finance = parsed.finance || appData.finance;
        appData.finance.forEach((f, i) => {
            if (!f.id) f.id = 'legacy_' + Date.now() + '_' + i;
        });
        
        for(let p=1; p<=8; p++) {
            if(parsed.schoolGrid && parsed.schoolGrid[p]) {
                parsed.schoolGrid[p].forEach((cell, idx) => {
                    if(typeof cell === 'string' && cell !== "") {
                        appData.schoolGrid[p][idx] = { subject: cell, startTime: "", endTime: "", location: "" };
                    } else if (typeof cell === 'object') {
                        appData.schoolGrid[p][idx] = cell;
                    }
                });
            }
        }
    }
}

function saveLocalData() {
    localStorage.setItem('cyberPlannerData', JSON.stringify(appData));
    calculateFreeTime();
}

function applyTheme() {
    const bgDiv = document.getElementById('dynamicBackground');
    bgDiv.className = 'dynamic-bg ' + (appData.theme || 'solid');
}

// --- Google Drive Logic ---
function gapiLoaded() { gapi.load('client', intializeGapiClient); }
async function intializeGapiClient() {
    await gapi.client.init({ apiKey: API_KEY, discoveryDocs: DISCOVERY_DOCS });
    gapiInited = true; checkAuthReady();
}
function gisLoaded() {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID, scope: SCOPES, callback: ''
    });
    gisInited = true; checkAuthReady();
}
function checkAuthReady() {}

function handleAuth() {
    let hint = appData.email || '';
    tokenClient.callback = async (resp) => {
        if (resp.error !== undefined) throw (resp);
        document.getElementById('authBtn').style.display = 'none';
        document.getElementById('syncBtn').style.display = 'flex';
        document.getElementById('loadBtn').style.display = 'flex';
        document.getElementById('syncStatus').innerText = '클라우드 접속 완료 [SECURE]';
        document.getElementById('syncStatus').style.color = 'var(--neon-green)';
        findDriveFile();
    };
    if (gapi.client.getToken() === null) {
        tokenClient.requestAccessToken({ prompt: 'consent', login_hint: hint });
    } else {
        tokenClient.requestAccessToken({ prompt: '', login_hint: hint });
    }
}

async function findDriveFile() {
     try {
        let response = await gapi.client.drive.files.list({
            q: "name='planner_data.json' and trashed=false",
            fields: 'files(id, name)', spaces: 'drive'
        });
        const files = response.result.files;
        if (files && files.length > 0) {
            driveFileId = files[0].id;
            document.getElementById('syncStatus').innerText = '클라우드 접속됨. (기존 데이터 [FOUND])';
        }
     } catch(err) { console.error(err); }
}

async function syncToDrive() {
    if(!gapi.client.getToken()) return alert("GOOGLE 계정 연결이 필요합니다.");
    document.getElementById('syncStatus').innerText = '데이터 업로드 중... ⏳';
    
    // Clear out single dday parameter before sync to keep clean JSON
    delete appData.dday; 
    
    const fileContent = JSON.stringify(appData);
    const file = new Blob([fileContent], {type: 'application/json'});
    const metadata = { 'name': 'planner_data.json', 'mimeType': 'application/json' };
    try {
        let response;
        if(driveFileId) {
            const url = `https://www.googleapis.com/upload/drive/v3/files/${driveFileId}?uploadType=multipart`;
            const form = new FormData();
            form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
            form.append('file', file);
            response = await fetch(url, { method: 'PATCH', headers: new Headers({ 'Authorization': 'Bearer ' + gapi.client.getToken().access_token }), body: form });
        } else {
            const url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
            const form = new FormData();
            form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
            form.append('file', file);
            response = await fetch(url, { method: 'POST', headers: new Headers({ 'Authorization': 'Bearer ' + gapi.client.getToken().access_token }), body: form });
            const result = await response.json();
            driveFileId = result.id;
        }
        document.getElementById('syncStatus').innerText = '클라우드 업로드 성공 ✅';
        setTimeout(()=> document.getElementById('syncStatus').innerText = '클라우드 연동됨', 3000);
    } catch(err) {
        document.getElementById('syncStatus').innerText = '업로드 실패 ❌';
    }
}

async function loadFromDrive() {
    if(!gapi.client.getToken()) return alert("GOOGLE 계정 연결이 필요합니다.");
    if(!driveFileId) {
        await findDriveFile();
        if(!driveFileId) return alert("드라이브에 저장된 데이터가 없습니다.");
    }
    document.getElementById('syncStatus').innerText = '다운로드 중... ⏳';
    try {
        const response = await gapi.client.drive.files.get({ fileId: driveFileId, alt: 'media' });
        const parsed = response.result;
        appData.title = parsed.title;
        appData.theme = parsed.theme;
        appData.email = parsed.email;
        appData.sleepTime = (parsed.sleepTime !== undefined) ? parsed.sleepTime : (parsed.baseFreeTime !== undefined ? 8 : 7.5);
        
        appData.ddays = parsed.ddays || [];
        if (appData.ddays.length === 0 && parsed.dday && parsed.dday.date) {
            appData.ddays.push({ name: parsed.dday.name, date: parsed.dday.date });
        }
        
        appData.schoolGrid = parsed.schoolGrid;
        
        // Safety checks for older json structures vs 7-day array
        appData.academy = parsed.academy;
        if(!appData.academy[6]) appData.academy[6] = [];
        if(!appData.academy[7]) appData.academy[7] = [];
        
        appData.goals = parsed.goals.map(g => { 
            if(!g.category) g.category='study'; 
            if(!g.color) g.color = 'pastel-pink';
            if(!g.repeat) g.repeat = 'none';
            if(!g.date) g.date = getYYYYMMDD(new Date());
            if(!g.endDate) g.endDate = '';
            if(g.doneDates === undefined) {
                g.doneDates = [];
                if(g.done === true) g.doneDates.push(g.date);
            }
            return g; 
        });
        
        appData.finance = parsed.finance || [];
        appData.finance.forEach((f, i) => {
            if (!f.id) f.id = 'legacy_' + Date.now() + '_' + i;
        });
        
        saveLocalData();
        applyTheme();
        renderAll();
        document.getElementById('syncStatus').innerText = '다운로드 완료 ✅';
        setTimeout(closeModals, 1000);
    } catch(err) {
        document.getElementById('syncStatus').innerText = '다운로드 실패 ❌';
    }
}


// --- UI Initialization ---
function initUI() {
    const daySelector = document.getElementById('daySelector');
    const days = ['월', '화', '수', '목', '금', '토', '일'];
    let html = '';
    
    // Find Monday of the current week
    let d = new Date();
    // JS dates: 0 Sun, 1 Mon... Map to 1 Mon ... 7 Sun
    let currentHtmlDay = d.getDay();
    if(currentHtmlDay === 0) currentHtmlDay = 7;
    
    let diff = d.getDate() - currentHtmlDay + 1;
    let monday = new Date(d.setDate(diff));

    for (let i = 0; i < 7; i++) {
        let loopDate = new Date(monday);
        loopDate.setDate(monday.getDate() + i);
        let dIdx = i + 1; // 1 to 7
        
        let activeClass = (currentDay === dIdx) ? 'active' : '';
        let weekendClass = (dIdx === 6 || dIdx === 7) ? 'weekend-btn' : '';
        let specialActiveClass = (currentDay === dIdx) ? ((dIdx === 6 || dIdx === 7) ? 'weekend-active' : 'weekday-active') : '';

        html += `
            <div id="dayBtn${dIdx}" class="day-btn ${weekendClass} ${activeClass} ${specialActiveClass}" onclick="selectDay(${dIdx})">
                <span class="day-name">${days[i]}</span>
                <span class="date-num">${loopDate.getDate()}</span>
            </div>
        `;
    }
    daySelector.innerHTML = html;

    // Bottom Nav
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active-tab'));
            e.currentTarget.classList.add('active');
            document.getElementById(e.currentTarget.getAttribute('data-target')).classList.add('active-tab');
        });
    });
    
    // Color Picker in Academy Modal
    document.querySelectorAll('#academyColorPicker .color-swatch').forEach(swatch => {
        swatch.addEventListener('click', (e) => {
            document.querySelectorAll('#academyColorPicker .color-swatch').forEach(s => s.classList.remove('active'));
            e.target.classList.add('active');
            document.getElementById('academyColor').value = e.target.getAttribute('data-color');
        });
    });
    
    // Color Picker in Goal Modal
    document.querySelectorAll('#goalColorPicker .color-swatch').forEach(swatch => {
        swatch.addEventListener('click', (e) => {
            document.querySelectorAll('#goalColorPicker .color-swatch').forEach(s => s.classList.remove('active'));
            e.target.classList.add('active');
            document.getElementById('goalColor').value = e.target.getAttribute('data-color');
        });
    });
}

function selectDay(dayIdx) {
    currentDay = dayIdx;
    
    // Calculate precise target date string for recurring logic
    let d = new Date();
    let currentHtmlDay = d.getDay() === 0 ? 7 : d.getDay();
    let diff = d.getDate() - currentHtmlDay + dayIdx;
    let target = new Date(d.setDate(diff));
    selectedDateStr = getYYYYMMDD(target);
    
    // Update active classes on Day Selector
    for(let i=1; i<=7; i++) {
        let btn = document.getElementById(`dayBtn${i}`);
        btn.classList.remove('active', 'weekday-active', 'weekend-active');
        if(i === currentDay) {
            btn.classList.add('active');
            if(i === 6 || i === 7) btn.classList.add('weekend-active');
            else btn.classList.add('weekday-active');
        }
    }
    
    applyWeekendLogic();
    renderSchoolGrid();
    renderAcademyBlocks();
    calculateFreeTime();
    renderGoals(); // re-render goals for this new specific day
}

function applyWeekendLogic() {
    const isWeekend = (currentDay === 6 || currentDay === 7);
    
    if(isWeekend) {
        document.getElementById('weekdayView').style.display = 'none';
        document.getElementById('weekendViewHeader').style.display = 'block';
        document.getElementById('academySectionTitle').innerHTML = '<span class="material-symbols-rounded">festival</span> WEEKEND PLAN / 주말 자율 계획';
        
        // Theme shifts
        document.querySelector('.app-header').classList.replace('neon-border-bottom', 'weekend-border-bottom');
        document.querySelector('.cyber-bottom-nav').classList.add('weekend-nav');
        document.getElementById('freeTimeContainer').classList.add('weekend-widget');
        document.getElementById('freeTimeLabel').innerText = "WEEKEND FREE TIME";
        
    } else {
        document.getElementById('weekdayView').style.display = 'block';
        document.getElementById('weekendViewHeader').style.display = 'none';
        document.getElementById('academySectionTitle').innerHTML = '<span class="material-symbols-rounded">local_fire_department</span> ACADEMY / 학원 및 자습';
        
        // Theme shifts back
        document.querySelector('.app-header').classList.replace('weekend-border-bottom', 'neon-border-bottom');
        document.querySelector('.cyber-bottom-nav').classList.remove('weekend-nav');
        document.getElementById('freeTimeContainer').classList.remove('weekend-widget');
        document.getElementById('freeTimeLabel').innerText = "FREE TIME REMAINING";
    }
}

function renderAll() {
    document.getElementById('mainTitle').innerText = appData.title || "CYBER.PLANNER";
    
    renderDdays();
    
    applyWeekendLogic();
    renderSchoolGrid();
    renderAcademyBlocks();
    renderGoals();
    renderFinance();
    calculateFreeTime();
    
    // D-7 Checks
    setTimeout(checkD7Alerts, 1000);
}

// --- D-7 Alert Toast ---
function checkD7Alerts() {
    if(sessionStorage.getItem('d7AlertShown')) return; 
    
    const today = new Date();
    today.setHours(0,0,0,0);
    
    let alerts = [];
    appData.goals.forEach(g => {
        if(g.endDate && g.repeat !== 'none') {
            const ed = new Date(g.endDate);
            ed.setHours(0,0,0,0);
            const diffDays = Math.round((ed - today) / (1000 * 60 * 60 * 24));
            
            if (diffDays === 7) {
                alerts.push(g.text);
            }
        }
    });
    
    if (alerts.length > 0) {
        showToastAlert(`알림: [${alerts.join(', ')}] 목표 달성이 1주일 남았습니다!`);
        sessionStorage.setItem('d7AlertShown', 'true');
    }
}

function showToastAlert(msg) {
    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = 'toast-alert';
    toast.innerHTML = `<span><span class="material-symbols-rounded" style="vertical-align:middle;margin-right:8px">alarm</span>${msg}</span>
                       <button onclick="this.parentElement.style.animation='slideUpFade 0.3s forwards'; setTimeout(()=>this.parentElement.remove(),300);" style="background:none;border:none;color:#fff;cursor:pointer;margin-left:15px;display:flex;align-items:center;">
                           <span class="material-symbols-rounded" style="font-size:20px;">close</span>
                       </button>`;
    container.appendChild(toast);
    
    setTimeout(() => {
        if(toast.parentElement) {
            toast.style.animation = 'slideUpFade 0.3s forwards';
            setTimeout(() => toast.remove(), 300);
        }
    }, 8000);
}


function renderDdays() {
    const container = document.getElementById('ddayContainer');
    let html = '';
    const today = new Date(); 
    today.setHours(0,0,0,0);
    
    if(appData.ddays && appData.ddays.length > 0) {
        appData.ddays.forEach(dday => {
            if(dday.name && dday.date) {
                const target = new Date(dday.date);
                const diffDays = Math.ceil((target - today) / (1000 * 60 * 60 * 24));
                let ddayStr = `D-${diffDays}`;
                if(diffDays === 0) ddayStr = "D-Day"; 
                else if(diffDays < 0) ddayStr = `D+${Math.abs(diffDays)}`;
                
                html += `<div class="d-day-badge">${dday.name} ${ddayStr}</div>`;
            }
        });
    }
    container.innerHTML = html;
}

// --- School Grid Cards ---
function renderSchoolGrid() {
    if(currentDay === 6 || currentDay === 7) return; // Do not render on weekends
    
    const grid = document.getElementById('schoolSchedule');
    let html = '';
    const dayIdx = currentDay - 1; 

    for (let period = 1; period <= 8; period++) {
        let block = appData.schoolGrid[period][dayIdx];
        
        if (block && block.subject) {
            let timeStr = (block.startTime && block.endTime) ? `${block.startTime} ~ ${block.endTime}` : (block.startTime || block.endTime || "시간 미정");
            let locStr = block.location ? `<span class="material-symbols-rounded" style="font-size:14px; margin-left:8px;">location_on</span>${block.location}` : "";
            
            let hwHtml = block.homework ? `<div class="card-hw ${block.hwDone ? 'done' : ''}" onclick="event.stopPropagation()"><input type="checkbox" ${block.hwDone ? 'checked' : ''} onchange="toggleSchoolHw(${period}, this)"><span class="hw-text">${block.homework}</span></div>` : "";
            
            html += `
                <div class="school-card" onclick="openSchoolModal(${period})">
                    <div class="sd-left">
                        <div class="sd-period">0${period}</div>
                        <div class="sd-info">
                            <div style="display:flex; justify-content:space-between; align-items:center;">
                                <div class="sd-subject">${block.subject}</div>
                                ${hwHtml}
                            </div>
                            <div class="sd-meta"><span>${timeStr}</span> ${locStr}</div>
                        </div>
                    </div>
                    <div class="sd-right"><span class="material-symbols-rounded">edit</span></div>
                </div>
            `;
        } else {
            html += `
                <div class="school-card empty-card" onclick="openSchoolModal(${period})">
                    <div class="sd-left">
                        <div class="sd-period">0${period}</div>
                        <div class="sd-info">
                            <div class="sd-empty-text">수업 없음 (클릭하여 추가)</div>
                        </div>
                    </div>
                    <div class="sd-right"><span class="material-symbols-rounded">add</span></div>
                </div>
            `;
        }
    }
    grid.innerHTML = html;
}

function openSchoolModal(period) {
    const dayIdx = currentDay - 1;
    const block = appData.schoolGrid[period][dayIdx];
    document.getElementById('schoolModalTitle').innerText = `${period}교시 수업 정보 수정`;
    document.getElementById('schoolPeriod').value = period;
    
    if(block) {
        document.getElementById('schoolSubject').value = block.subject || "";
        document.getElementById('schoolStart').value = block.startTime || "";
        document.getElementById('schoolEnd').value = block.endTime || "";
        document.getElementById('schoolLocation').value = block.location || "";
        document.getElementById('schoolHomework').value = block.homework || "";
    } else {
        document.getElementById('schoolSubject').value = "";
        
        let sh = 8 + period;
        let eh = sh; 
        let sm = "00";
        let em = "50";
        if(sh < 10) sh = "0"+sh;
        if(eh < 10) eh = "0"+eh;
        
        document.getElementById('schoolStart').value = `${sh}:${sm}`;
        document.getElementById('schoolEnd').value = `${eh}:${em}`;
        
        document.getElementById('schoolLocation').value = "";
        document.getElementById('schoolHomework').value = "";
    }
    document.getElementById('schoolModal').classList.add('show');
}

function saveSchoolBlock() {
    const period = parseInt(document.getElementById('schoolPeriod').value);
    const dayIdx = currentDay - 1;
    const subject = document.getElementById('schoolSubject').value;
    const start = document.getElementById('schoolStart').value;
    const end = document.getElementById('schoolEnd').value;
    const location = document.getElementById('schoolLocation').value;
    const homework = document.getElementById('schoolHomework').value;
    
    if(!subject && !start && !end && !location && !homework) {
        appData.schoolGrid[period][dayIdx] = null;
    } else {
        const existing = appData.schoolGrid[period][dayIdx];
        const hwDone = existing && existing.hwDone ? existing.hwDone : false;
        appData.schoolGrid[period][dayIdx] = { subject, startTime: start, endTime: end, location, homework, hwDone };
    }
    
    saveLocalData();
    renderSchoolGrid();
    closeModals();
}

function toggleSchoolHw(period, checkbox) {
    const dayIdx = currentDay - 1;
    if(appData.schoolGrid[period] && appData.schoolGrid[period][dayIdx]) {
        appData.schoolGrid[period][dayIdx].hwDone = checkbox.checked;
        saveLocalData();
        renderSchoolGrid();
    }
}

// --- Academy / Evening (Weekend Plans) ---
function renderAcademyBlocks() {
    const tab = document.getElementById('academyTab');
    const blocks = appData.academy[currentDay] || [];
    blocks.sort((a,b) => a.start.localeCompare(b.start));
    
    let html = '';
    blocks.forEach((block, index) => {
        // Handle legacy isLockup gracefully: Give them a default red look, but otherwise rely on pastel themes
        const colorClass = block.isLockup ? 'theme-pastel-red' : `theme-${block.color}`;
        let locHTML = block.location ? `<div class="block-location"><span class="material-symbols-rounded" style="font-size:14px">place</span>${block.location}</div>` : "";
        
        const extTime = block.extraTime || 0;
        const extPurpose = block.extraPurpose || "🚶 이동";
        let extraHtml = extTime > 0 ? `<div class="extra-time-badge">${extPurpose} ${extTime}분 소요</div>` : '';
        
        const notifyMin = block.notify || 0;
        let notifyHtml = notifyMin > 0 ? `<div class="extra-time-badge" style="border-color:rgba(255,234,0,0.3); color:var(--neon-yellow);">🔔 ${notifyMin}분 전 알림</div>` : '';
        
        let hwHtml = block.homework ? `<div class="card-hw ${block.hwDone ? 'done' : ''}" onclick="event.stopPropagation()"><input type="checkbox" ${block.hwDone ? 'checked' : ''} onchange="toggleAcademyHw(${index}, this)"><span class="hw-text">${block.homework}</span></div>` : "";
        
        let row2Html = (locHTML || extraHtml || notifyHtml) ? `<div style="display:flex; align-items:center; gap:10px; margin-top:6px; padding-right:55px; min-width:0; flex-wrap:wrap;">${locHTML}${extraHtml}${notifyHtml}</div>` : '';
        
        html += `
            <div class="academy-block ${colorClass}">
                <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; padding-right:70px; min-width:0;">
                    <div style="display:flex; align-items:center; gap:8px; min-width:0; flex:1;">
                        <div class="block-time" style="flex-shrink:0;">${block.start}~${block.end}</div>
                        <div class="block-title">${block.subject}</div>
                    </div>
                    ${hwHtml}
                </div>
                ${row2Html}
                <div class="block-actions">
                    <button onclick="openAcademyModal(${index})"><span class="material-symbols-rounded" style="font-size:16px;">edit</span></button>
                    <button onclick="deleteAcademyBlock(${index})"><span class="material-symbols-rounded" style="font-size:16px;">delete</span></button>
                </div>
            </div>
        `;
    });
    tab.innerHTML = html;
}

function assignGoalToBlock(subject) {
    document.getElementById('goalText').value = `[${subject}] `;
    openGoalModal(-1);
}

function openAcademyModal(index) {
    document.getElementById('academyIndex').value = index;
    
    if (index > -1 && appData.academy[currentDay] && appData.academy[currentDay][index]) {
        const block = appData.academy[currentDay][index];
        document.getElementById('academySubject').value = block.subject || '';
        document.getElementById('academyStart').value = block.start || '18:00';
        document.getElementById('academyEnd').value = block.end || '19:00';
        document.getElementById('academyLocation').value = block.location || '';
        document.getElementById('academyHomework').value = block.homework || '';
        document.getElementById('academyExtraTime').value = block.extraTime || '0';
        document.getElementById('academyExtraPurpose').value = block.extraPurpose || '🚶 이동';
        document.getElementById('academyNotify').value = block.notify || '30';
        
        document.querySelectorAll('#academyColorPicker .color-swatch').forEach(s => s.classList.remove('active'));
        if(block.color) {
            let swatch = document.querySelector(`#academyColorPicker .color-swatch[data-color="${block.color}"]`);
            if(swatch) swatch.classList.add('active');
            document.getElementById('academyColor').value = block.color;
        } else {
            document.querySelector('#academyColorPicker .color-swatch[data-color="pastel-pink"]').classList.add('active');
            document.getElementById('academyColor').value = 'pastel-pink';
        }
    } else {
        document.getElementById('academySubject').value = '';
        document.getElementById('academyStart').value = '18:00';
        document.getElementById('academyEnd').value = '19:00';
        document.getElementById('academyLocation').value = '';
        document.getElementById('academyHomework').value = '';
        document.getElementById('academyExtraTime').value = '0'; // reset extra time
        document.getElementById('academyExtraPurpose').value = '🚶 이동'; // reset purpose
        document.getElementById('academyNotify').value = '30'; // default 30min
        
        // Default pastel block color reset
        document.querySelectorAll('#academyColorPicker .color-swatch').forEach(s => s.classList.remove('active'));
        document.querySelector('#academyColorPicker .color-swatch[data-color="pastel-pink"]').classList.add('active');
        document.getElementById('academyColor').value = 'pastel-pink';
    }
    
    // Style update based on weekend mode
    if(currentDay === 6 || currentDay === 7) {
        document.getElementById('academyModalTitle').innerText = "주말 계획";
        document.querySelector('#academyModal .cyber-modal-content').classList.add('weekend-modal');
    } else {
        document.getElementById('academyModalTitle').innerText = "방과 후 계획";
        document.querySelector('#academyModal .cyber-modal-content').classList.remove('weekend-modal');
    }
    
    document.getElementById('academyModal').classList.add('show');
    lastModalOpenTime = Date.now();
}

function saveAcademyBlock() {
    const index = parseInt(document.getElementById('academyIndex').value);
    const subject = document.getElementById('academySubject').value;
    const start = document.getElementById('academyStart').value;
    const end = document.getElementById('academyEnd').value;
    const location = document.getElementById('academyLocation').value;
    const color = document.getElementById('academyColor').value;
    const extraTime = parseInt(document.getElementById('academyExtraTime').value) || 0;
    const extraPurpose = document.getElementById('academyExtraPurpose').value || '🚶 이동';
    const homework = document.getElementById('academyHomework').value;
    const notify = parseInt(document.getElementById('academyNotify').value) || 0;
    
    if(!subject || !start || !end) return alert('필수 항목을 모두 입력해주세요.');
    
    if(!appData.academy[currentDay]) appData.academy[currentDay] = [];
    
    if (index > -1) {
        const existing = appData.academy[currentDay][index];
        const hwDone = existing && existing.hwDone ? existing.hwDone : false;
        appData.academy[currentDay][index] = { subject, start, end, location, color, extraTime, extraPurpose, homework, hwDone, notify };
    } else {
        appData.academy[currentDay].push({ subject, start, end, location, color, extraTime, extraPurpose, homework, hwDone: false, notify });
    }
    
    saveLocalData(); renderAcademyBlocks(); closeModals();
    
    // Re-schedule notifications
    scheduleNotifications();
}

function toggleAcademyHw(index, checkbox) {
    if(appData.academy[currentDay] && appData.academy[currentDay][index]) {
        appData.academy[currentDay][index].hwDone = checkbox.checked;
        saveLocalData();
        renderAcademyBlocks();
    }
}

function deleteAcademyBlock(index) {
    if(confirm('SYSTEM: 해당 일정을 삭제하시겠습니까?')) {
        appData.academy[currentDay].splice(index, 1);
        saveLocalData(); renderAcademyBlocks();
    }
}

function calculateFreeTime() {
    const isWeekend = (currentDay === 6 || currentDay === 7);
    const totalDayMins = 24 * 60;
    
    const bTime = appData.bedTime || "23:30";
    const wTime = appData.wakeTime || "07:00";
    const sleepDisplayEl = document.getElementById('sleepDisplay');
    if (sleepDisplayEl) sleepDisplayEl.innerText = `🌙 ${bTime} - ☀️ ${wTime}`;
    
    // Calculate Sleep Minutes
    let sleepMins = 0;
    if(bTime && wTime) {
        const [bh, bm] = bTime.split(':').map(Number);
        const [wh, wm] = wTime.split(':').map(Number);
        const bMins = bh * 60 + bm;
        const wMins = wh * 60 + wm;
        
        if (wMins >= bMins) {
            sleepMins = wMins - bMins;
        } else {
            sleepMins = (wMins + 24*60) - bMins;
        }
    }
    
    let busyMins = 0;
    
    // 2. School Schedule (Weekdays only)
    if (!isWeekend) {
        const dayIdx = currentDay - 1;
        for (let period = 1; period <= 8; period++) {
            let block = appData.schoolGrid[period][dayIdx];
            if (block && block.startTime && block.endTime) {
                const [sh, sm] = block.startTime.split(':').map(Number);
                const [eh, em] = block.endTime.split(':').map(Number);
                const startMins = sh * 60 + sm;
                const endMins = eh * 60 + em;
                if(endMins > startMins) {
                    busyMins += (endMins - startMins);
                }
            }
        }
    }
    
    // 3. Academy/After-School Schedule
    const blocks = appData.academy[currentDay] || [];
    blocks.forEach(b => {
        if(b.start && b.end) {
            const [sh, sm] = b.start.split(':').map(Number);
            const [eh, em] = b.end.split(':').map(Number);
            const startMins = sh * 60 + sm;
            let endMins = eh * 60 + em;
            
            if (endMins < startMins) endMins += (24 * 60);
            busyMins += (endMins - startMins);
            
            // Integrate the new extraTime parameter
            busyMins += (b.extraTime || 0);
        }
    });
    
    const freeMins = totalDayMins - sleepMins - busyMins;
    
    if(freeMins > 0) {
        const h = Math.floor(freeMins / 60);
        const m = freeMins % 60;
        let str = "";
        if(h > 0 && m > 0) str = `${h}<span style="font-size:16px;">시간</span> ${m}<span style="font-size:16px;">분</span>`;
        else if(h > 0 && m === 0) str = `${h}<span style="font-size:16px;">시간</span>`;
        else if(h === 0 && m > 0) str = `${m}<span style="font-size:16px;">분</span>`;
        
        document.getElementById('freeTimeDisplay').innerHTML = str;
    } else {
        document.getElementById('freeTimeDisplay').innerHTML = "<span>여유 시간 없음</span>";
    }
}

// --- Smart Date UX Formatting ---
function formatAutoDate(input) {
    let val = input.value.replace(/[^0-9]/g, '');
    if (val.length >= 4 && val.length < 6) {
        val = val.substring(0,4) + '-' + val.substring(4);
    } else if (val.length >= 6) {
        val = val.substring(0,4) + '-' + val.substring(4,6) + '-' + val.substring(6,8);
    }
    input.value = val;
}

function setQuickDate(daysToAdd) {
    if (daysToAdd === 0) {
        document.getElementById('goalEndDateText').value = '';
        document.getElementById('goalEndDate').value = '';
        return;
    }
    const baseDate = new Date(selectedDateStr);
    baseDate.setDate(baseDate.getDate() + daysToAdd);
    const yyyy = baseDate.getFullYear();
    const mm = String(baseDate.getMonth() + 1).padStart(2, '0');
    const dd = String(baseDate.getDate()).padStart(2, '0');
    const finalDate = `${yyyy}-${mm}-${dd}`;
    
    document.getElementById('goalEndDateText').value = finalDate;
    document.getElementById('goalEndDate').value = finalDate;
}

// --- Goals & Recurring Logic ---
function openGoalModal(index = -1) {
    document.getElementById('goalIndex').value = index;
    
    if (index > -1) {
        const g = appData.goals[index];
        document.getElementById('goalText').value = g.text || '';
        const catRadio = document.querySelector(`input[name="goalCategory"][value="${g.category || 'study'}"]`);
        if (catRadio) catRadio.checked = true;
        document.getElementById('goalRepeat').value = g.repeat || 'none';
        document.getElementById('goalEndDateText').value = g.endDate || '';
        document.getElementById('goalEndDate').value = g.endDate || '';
        document.getElementById('goalTargetVal').value = g.targetVal || '';
        document.getElementById('goalTargetUnit').value = g.targetUnit || '';
        document.getElementById('goalReward').value = g.reward || '';
        
        const color = g.color || 'pastel-pink';
        document.querySelectorAll('#goalColorPicker .color-swatch').forEach(s => s.classList.remove('active'));
        const swatch = document.querySelector(`#goalColorPicker .color-swatch[data-color="${color}"]`);
        if(swatch) swatch.classList.add('active');
        document.getElementById('goalColor').value = color;
    } else {
        if(!document.getElementById('goalText').value.startsWith('[')) {
            document.getElementById('goalText').value = '';
        }
        document.querySelector('input[name="goalCategory"][value="study"]').checked = true;
        document.getElementById('goalRepeat').value = 'none';
        document.getElementById('goalEndDateText').value = '';
        document.getElementById('goalEndDate').value = '';
        document.getElementById('goalTargetVal').value = '';
        document.getElementById('goalTargetUnit').value = '';
        document.getElementById('goalReward').value = '';
        
        document.querySelectorAll('#goalColorPicker .color-swatch').forEach(s => s.classList.remove('active'));
        document.querySelector('#goalColorPicker .color-swatch[data-color="pastel-pink"]').classList.add('active');
        document.getElementById('goalColor').value = 'pastel-pink';
    }
    
    document.getElementById('goalModal').classList.add('show');
}

function saveGoal() {
    const index = parseInt(document.getElementById('goalIndex').value);
    const text = document.getElementById('goalText').value;
    const cat = document.querySelector('input[name="goalCategory"]:checked').value;
    const color = document.getElementById('goalColor').value;
    const repeat = document.getElementById('goalRepeat').value;
    const endDate = document.getElementById('goalEndDateText').value;
    const targetVal = document.getElementById('goalTargetVal').value;
    const targetUnit = document.getElementById('goalTargetUnit').value;
    const reward = Number(document.getElementById('goalReward').value) || 0;
    
    if(!text) return;
    
    if (index > -1) {
        // Edit existing goal
        const g = appData.goals[index];
        g.text = text;
        g.targetVal = targetVal;
        g.targetUnit = targetUnit;
        g.reward = reward;
        g.category = cat;
        g.color = color;
        g.repeat = repeat;
        g.endDate = endDate;
    } else {
        // Create new goal
        appData.goals.push({ 
            text: text, 
            targetVal: targetVal,
            targetUnit: targetUnit,
            reward: reward,
            category: cat, 
            color: color,
            repeat: repeat,
            date: selectedDateStr, // Use the currently viewed date as the origin date
            endDate: endDate,
            doneDates: [] 
        });
    }
    
    saveLocalData(); 
    renderGoals(); 
    closeModals();
}

function shouldRenderGoal(g, targetDateStr) {
    if (!g.date) return false;
    
    const targetDate = new Date(targetDateStr);
    targetDate.setHours(0,0,0,0);
    
    const startDate = new Date(g.date);
    startDate.setHours(0,0,0,0);
    
    if (g.endDate) {
        const endDate = new Date(g.endDate);
        endDate.setHours(0,0,0,0);
        if (targetDate > endDate) return false;
    }
    
    if (targetDate < startDate) return false;
    
    if (g.repeat === 'daily') return true;
    if (g.repeat === 'weekly') return targetDate.getDay() === startDate.getDay();
    if (g.repeat === 'monthly') return targetDate.getDate() === startDate.getDate();
    
    // repeat 'none'
    return targetDate.getTime() === startDate.getTime();
}

function renderGoals() {
    const list = document.getElementById('goalList');
    let html = '';
    
    appData.goals.forEach((g, originalIndex) => {
        if(shouldRenderGoal(g, selectedDateStr)) {
            const catObj = categoryIcons[g.category] || categoryIcons['study'];
            const isDone = g.doneDates && g.doneDates.includes(selectedDateStr);
            const colorClass = g.color ? `theme-${g.color}` : 'theme-pastel-pink';
            
            let targetBadge = '';
            if (g.targetVal) {
                let unit = g.targetUnit || '';
                targetBadge = `<span class="goal-target-badge">🎯 ${g.targetVal}${unit}</span>`;
            }
            
            let rewardBadge = '';
            if (g.reward > 0) {
                rewardBadge = `<span style="color:var(--neon-green); font-weight:bold; margin-left:8px; text-shadow:0 0 5px rgba(57,255,20,0.5);">+${g.reward.toLocaleString()}₩</span>`;
            }
            
            html += `
                <li class="goal-item ${isDone ? 'done' : ''} ${colorClass}">
                    <input type="checkbox" ${isDone ? 'checked' : ''} onchange="toggleGoal(${originalIndex}, this)">
                    <span class="icon material-symbols-rounded ${catObj.colorClass}">${catObj.icon}</span>
                    <span class="text" style="flex:1;">${sanitizeHTML(g.text)}${targetBadge}${rewardBadge}</span>
                    <div style="display:flex; align-items:center; gap:5px; flex-shrink:0;">
                        <button style="background:none; border:none; color:var(--text-secondary); cursor:pointer; display:flex; padding:5px;" onclick="openGoalModal(${originalIndex})"><span class="material-symbols-rounded" style="font-size:18px;">edit</span></button>
                        <button class="del-btn" onclick="deleteGoal(${originalIndex})"><span class="material-symbols-rounded">delete</span></button>
                    </div>
                </li>
            `;
        }
    });
    
    if (html === '') {
        html = '<li class="goal-item empty-card" style="justify-content:center; color:var(--text-muted); border-style:dashed;">예정된 일정이나 미션이 없습니다.</li>';
    }
    list.innerHTML = html;
}

function toggleGoal(index, checkbox) {
    const g = appData.goals[index];
    if (!g.doneDates) g.doneDates = [];
    if (!g.rewardClaimedDates) g.rewardClaimedDates = []; 
    
    if (checkbox.checked) {
        if(!g.doneDates.includes(selectedDateStr)) {
            g.doneDates.push(selectedDateStr);
            
            if(g.reward > 0 && !g.rewardClaimedDates.includes(selectedDateStr)) {
                g.rewardClaimedDates.push(selectedDateStr);
                
                appData.finance = appData.finance || [];
                appData.finance.push({
                    id: Date.now(),
                    type: 'income',
                    amount: g.reward,
                    title: '[미션보상] ' + g.text,
                    category: '알바(집안일)', 
                    date: selectedDateStr + "T" + new Date().toISOString().split('T')[1] 
                });
                
                setTimeout(() => {
                    alert(`노동의 대가 ${g.reward.toLocaleString()}원이 입금되었습니다!`);
                    renderFinance();
                }, 400);
            }
        }
        showPraiseAnim();
    } else {
        g.doneDates = g.doneDates.filter(d => d !== selectedDateStr);
    }
    
    saveLocalData();
    renderGoals(); // Update UI cross-outs accurately
}

function deleteGoal(index) {
    if(confirm('SYSTEM: 이 미션을 정말 삭제하시겠습니까? (반복 설정된 미션이라면 앞으로의 모든 일정도 삭제됩니다)')) {
        appData.goals.splice(index, 1);
        saveLocalData(); 
        renderGoals();
    }
}

// Celebration Animation
function showPraiseAnim() {
    const container = document.getElementById('praiseContainer');
    container.innerHTML = '';
    
    const isWeekend = (currentDay === 6 || currentDay === 7);
    const praiseList = isWeekend ? praisesWeekend : praisesWeekday;
    
    const div = document.createElement('div');
    div.className = 'praise-popup';
    if(isWeekend) div.classList.add('weekend-praise');
    
    const msg = praiseList[Math.floor(Math.random() * praiseList.length)];
    div.innerText = msg;
    container.appendChild(div);
    
    const colors = isWeekend ? ['#ff3333','#ffbca8','#9dfadc','#39ff14'] : ['#00f3ff','#0bf59c','#ff007f','#39ff14'];
    
    for(let i=0; i<35; i++) {
        const conf = document.createElement('div');
        conf.className = 'confetti';
        conf.style.left = Math.random() * 100 + 'vw';
        conf.style.backgroundColor = colors[Math.floor(Math.random()*colors.length)];
        conf.style.animationDuration = (Math.random() * 0.5 + 0.5) + 's';
        container.appendChild(conf);
    }

    setTimeout(() => {
        div.style.animation = 'popOut 0.3s forwards';
        setTimeout(() => { container.innerHTML = ''; }, 300);
    }, 2000);
}

// --- Finance ---
function openFinanceModal() {
    closeModals();
    editingTransactionId = null;
    document.getElementById('financeAmount').value = '';
    document.getElementById('financeTitle').value = '';
    
    const typeRadio = document.querySelector('input[name="financeType"][value="expense"]');
    if(typeRadio) typeRadio.checked = true;
    
    document.getElementById('financeDate').value = getYYYYMMDD(new Date());
    
    if(typeof updateFinanceCategories === 'function') updateFinanceCategories();
    
    const titleEl = document.getElementById('financeModalTitle');
    if(titleEl) titleEl.innerText = "새 거래 추가";
    const btnEl = document.getElementById('financeSaveBtn');
    if(btnEl) btnEl.innerText = "저장하기";
    
    const modal = document.getElementById('financeModal');
    modal.style.display = 'flex';
    modal.classList.add('show');
    lastModalOpenTime = Date.now();
}

function setFinanceDate(offsetDays) {
    let d = new Date();
    d.setDate(d.getDate() + offsetDays);
    document.getElementById('financeDate').value = getYYYYMMDD(d);
}

function updateFinanceCategories() {
    const typeEl = document.querySelector('input[name="financeType"]:checked');
    if(!typeEl) return;
    const type = typeEl.value;
    const catSelect = document.getElementById('financeCategory');
    if(!catSelect) return;
    
    catSelect.innerHTML = "";
    if(type === 'income') {
        const opts = ["고정용돈", "알바(집안일)", "세뱃돈/선물", "기타"];
        opts.forEach(o => catSelect.innerHTML += `<option value="${o}">${o}</option>`);
    } else {
        const opts = ["도서/학습", "게임/디지털", "간식/식비", "취미/예술", "기타"];
        opts.forEach(o => catSelect.innerHTML += `<option value="${o}">${o}</option>`);
    }
}

function saveFinance() {
    const typeEl = document.querySelector('input[name="financeType"]:checked');
    if(!typeEl) return;
    const type = typeEl.value;
    const amount = Number(document.getElementById('financeAmount').value);
    
    const titleRaw = document.getElementById('financeTitle').value;
    const dateVal = document.getElementById('financeDate') ? document.getElementById('financeDate').value : new Date().toISOString();
    const catVal = document.getElementById('financeCategory') ? document.getElementById('financeCategory').value : "기타";
    
    if(!amount || !titleRaw || !dateVal) return;
    
    // Store raw values (sanitize only at render time to prevent double-encoding)
    const title = titleRaw;
    const category = catVal;
    
    if (editingTransactionId !== null) {
        const index = appData.finance.findIndex(f => String(f.id) === String(editingTransactionId));
        if(index > -1) {
            appData.finance[index].type = type;
            appData.finance[index].amount = amount;
            appData.finance[index].title = title;
            appData.finance[index].date = dateVal;
            appData.finance[index].category = category;
        }
        editingTransactionId = null;
    } else {
        const fallbackId = Date.now();
        appData.finance.push({ id: fallbackId, type, amount, title, date: dateVal, category });
    }
    
    saveLocalData(); 
    renderFinance(); 
    closeModals();
}

function editFinance(id) {
    const targetId = String(id);
    const item = appData.finance.find(f => String(f.id) === targetId);
    if(!item) return;
    
    editingTransactionId = item.id;
    closeModals();
    
    const typeRadio = document.querySelector(`input[name="financeType"][value="${item.type}"]`);
    if(typeRadio) typeRadio.checked = true;
    
    const titleEl = document.getElementById('financeModalTitle');
    if(titleEl) titleEl.innerText = "내역 수정 중...";
    const btnEl = document.getElementById('financeSaveBtn');
    if(btnEl) btnEl.innerText = "변경사항 적용";
    
    document.getElementById('financeAmount').value = item.amount;
    
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = item.title;
    document.getElementById('financeTitle').value = tempDiv.textContent || tempDiv.innerText || item.title;
    
    if(document.getElementById('financeDate')) {
        document.getElementById('financeDate').value = item.date.length > 10 ? item.date.split('T')[0] : item.date;
    }
    
    if(typeof updateFinanceCategories === 'function') updateFinanceCategories();
    
    if(document.getElementById('financeCategory')) {
        const catTemp = document.createElement('div');
        catTemp.innerHTML = item.category || "기타";
        document.getElementById('financeCategory').value = catTemp.textContent || catTemp.innerText || item.category;
    }
    
    const modal = document.getElementById('financeModal');
    modal.style.display = 'flex';
    modal.classList.add('show');
    lastModalOpenTime = Date.now();
}

function deleteFinance(id) {
    if(confirm("SYSTEM: 이 거래 내역을 정말 삭제하시겠습니까?")) {
        appData.finance = appData.finance.filter(f => String(f.id) !== String(id));
        saveLocalData();
        renderFinance();
    }
}

function renderFinance() {
    let inc = 0, exp = 0; let html = '';
    const sorted = [...appData.finance].sort((a,b) => new Date(b.date) - new Date(a.date));
    
    let categoryTotals = {}; 
    
    sorted.forEach((item) => {
        if(item.type === 'income') inc += item.amount; else exp += item.amount;
        const isInc = item.type === 'income';
        
        if(!isInc) {
            let cat = item.category || "기타";
            if(!categoryTotals[cat]) categoryTotals[cat] = 0;
            categoryTotals[cat] += item.amount;
        }
        
        const safeTitle = sanitizeHTML(item.title);
        const safeCategory = sanitizeHTML(item.category || "");
        let catBadge = safeCategory ? `<span style="font-size:12px; padding:3px 8px; border-radius:12px; border:1px solid currentColor; margin-right:10px; opacity:0.9;">${safeCategory}</span>` : '';
        
        let displayDate = "";
        if(item.date && item.date.length <= 10) displayDate = `<div style="font-size:14px; font-weight:bold; color:var(--text-muted); opacity:0.9; margin-top:6px; font-family:'Orbitron', 'Noto Sans KR', sans-serif; letter-spacing:0.5px;">${item.date}</div>`;
        else if(item.date) displayDate = `<div style="font-size:14px; font-weight:bold; color:var(--text-muted); opacity:0.9; margin-top:6px; font-family:'Orbitron', 'Noto Sans KR', sans-serif; letter-spacing:0.5px;">${item.date.split('T')[0]}</div>`;
        
        html += `
            <div class="tx-item">
                <div style="display:flex; flex-direction:column; flex:1;">
                    <div class="tx-title" style="display:flex; align-items:center; ${isInc ? 'color:var(--neon-green) !important' : 'color:var(--neon-red) !important'}">${catBadge}${safeTitle}</div>
                    ${displayDate}
                </div>
                <div style="display:flex; align-items:center; gap:10px;">
                    <div class="tx-amt ${isInc?'inc':'exp'}">${isInc?'+':'-'}${item.amount.toLocaleString()} ₩</div>
                    <div style="display:flex; gap:5px;">
                        <button class="tx-action-btn" onclick="editFinance('${item.id}')"><span class="material-symbols-rounded" style="font-size:18px;">edit</span></button>
                        <button class="tx-action-btn del-btn-outline" onclick="deleteFinance('${item.id}')"><span class="material-symbols-rounded" style="font-size:18px;">delete</span></button>
                    </div>
                </div>
            </div>
        `;
    });
    
    document.getElementById('totalIncome').innerText = inc.toLocaleString() + ' ₩';
    document.getElementById('totalExpense').innerText = exp.toLocaleString() + ' ₩';
    document.getElementById('totalBalance').innerText = (inc - exp).toLocaleString() + ' ₩';
    document.getElementById('transactionList').innerHTML = html;
    
    renderExpenseChart(categoryTotals, inc, inc - exp);
}

function renderExpenseChart(catData, totalInc, totalBal) {
    const canvas = document.getElementById('expenseChart');
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    
    if(expenseChartInstance) {
        expenseChartInstance.destroy();
    }
    
    let maxBase = totalInc > 0 ? totalInc : (totalBal > 0 ? totalBal : 1);
    
    const labels = [];
    const data = [];
    const chartDynamicColors = [];
    
    const baseColors = [
        'rgba(0, 243, 255, 0.85)',   // Neon Blue
        'rgba(11, 245, 156, 0.85)',  // Neon Emerald
        'rgba(255, 234, 0, 0.85)',   // Neon Yellow
        'rgba(255, 0, 127, 0.85)',   // Neon Pink
        'rgba(150, 50, 255, 0.85)'   // Purple
    ];
    let cIdx = 0;
    
    for(let k in catData) {
        let amt = catData[k];
        let pct = maxBase > 1 ? Math.round((amt / maxBase) * 100) : 0;
        
        labels.push(`${k} ${amt.toLocaleString()}₩ (${pct}%)`);
        data.push(amt);
        
        if(pct >= 30) {
            chartDynamicColors.push('rgba(255, 51, 51, 1)'); // Neon Red Warning
        } else {
            chartDynamicColors.push(baseColors[cIdx % baseColors.length]);
            cIdx++;
        }
    }
    
    if(labels.length === 0) {
        ctx.clearRect(0,0,canvas.width,canvas.height);
        ctx.font = "12px Orbitron";
        ctx.textAlign = "center";
        ctx.fillStyle = "rgba(255,255,255,0.2)";
        ctx.fillText("NO EXPENSE DATA", canvas.width/2, canvas.height/2);
        return;
    }

    try {
        if(typeof Chart !== 'undefined') {
            expenseChartInstance = new Chart(ctx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        data: data,
                        backgroundColor: chartDynamicColors,
                        borderRadius: 4,
                        borderWidth: 0,
                        barPercentage: 0.85,
                        categoryPercentage: 0.9
                    }]
                },
                options: {
                    indexAxis: 'y', // Horizontal bars
                    responsive: true,
                    maintainAspectRatio: false,
                    layout: {
                        padding: { top: 0, bottom: 0, left: 0, right: 15 }
                    },
                    plugins: {
                        legend: {
                            display: false
                        },
                        tooltip: {
                            backgroundColor: 'rgba(18,18,25,0.9)',
                            titleColor: '#E8E8E8',
                            bodyColor: '#E8E8E8',
                            borderColor: 'rgba(0,243,255,0.3)',
                            borderWidth: 1,
                            callbacks: {
                                label: function(context) {
                                    let label = context.label || '';
                                    if (label) label += ': ';
                                    if (context.parsed.x !== null) label += context.parsed.x.toLocaleString() + ' ₩';
                                    return label;
                                }
                            }
                        }
                    },
                    scales: {
                        x: {
                            max: maxBase > 1 ? maxBase : undefined,
                            display: false,
                            grid: { display: false }
                        },
                        y: {
                            grid: { display: false, drawBorder: false },
                            ticks: {
                                color: '#E8E8E8',
                                font: { family: 'Noto Sans KR', size: 11 }
                            }
                        }
                    }
                }
            });
        } else {
             ctx.clearRect(0,0,canvas.width,canvas.height);
             ctx.font = "11px Noto Sans KR";
             ctx.textAlign = "center";
             ctx.fillStyle = "rgba(255,255,255,0.5)";
             ctx.fillText("차트 모듈을 불러오는 중입니다...", canvas.width/2, canvas.height/2);
        }
    } catch(e) {
        console.warn("Chart.js error:", e);
    }
}

function carryOverFinance() {
    const today = new Date().getDate();
    let msg = "SYSTEM: 정말로 이달의 모든 기록을 결산하고 이월하시겠습니까? 기존 기록은 모두 삭제되며 전월 이월금으로 통합됩니다.";
    if(today < 28) {
        msg = "SYSTEM: 아직 월말이 아닙니다만, 이번 달 모든 거래 기록을 '미리 결산'하고 이월하시겠습니까? 기존 기록은 즉시 삭제됩니다.";
    }
    
    if(!confirm(msg)) return;
    
    let inc = 0, exp = 0;
    appData.finance.forEach(item => {
        if(item.type === 'income') inc += item.amount;
        else exp += item.amount;
    });
    let bal = inc - exp;
    
    appData.finance = [];
    if(bal !== 0) {
        appData.finance.push({
            id: Date.now(),
            type: bal > 0 ? 'income' : 'expense',
            amount: Math.abs(bal),
            title: '전월 이월금',
            category: '기타',
            date: new Date().toISOString()
        });
    }
    saveLocalData();
    renderFinance();
    closeModals();
}

function openReportModal() {
    closeModals();
    let inc = 0, exp = 0;
    let catTotals = {};
    
    appData.finance.forEach(item => {
        if(item.type === 'income') inc += item.amount;
        else {
            exp += item.amount;
            let cat = item.category || "기타";
            catTotals[cat] = (catTotals[cat] || 0) + item.amount;
        }
    });
    
    let bal = inc - exp;
    
    document.getElementById('reportInc').innerText = inc.toLocaleString() + ' ₩';
    document.getElementById('reportExp').innerText = exp.toLocaleString() + ' ₩';
    document.getElementById('reportBal').innerText = bal.toLocaleString() + ' ₩';
    
    let topCat = "없음";
    let maxAmt = 0;
    for(let k in catTotals) {
        if(catTotals[k] > maxAmt) { maxAmt = catTotals[k]; topCat = k; }
    }
    
    document.getElementById('reportTopCat').innerText = `가장 많이 쓴 카테고리: ${topCat} (${maxAmt.toLocaleString()} ₩)`;
    
    const statusEl = document.getElementById('reportStatus');
    if(bal > 0) {
        statusEl.innerText = "🏆 훌륭합니다! 흑자(Plus) 달성!";
        statusEl.style.color = "var(--neon-green)";
    } else if(bal < 0) {
        statusEl.innerText = "🚨 주의! 적자(Minus) 상태입니다.";
        statusEl.style.color = "var(--neon-red)";
    } else {
        statusEl.innerText = "⚖️ 수입과 지출이 동일합니다.";
        statusEl.style.color = "var(--text-secondary)";
    }
    
    document.getElementById('reportModal').classList.add('show');
}

// --- Settings Modals ---
function openSettings() {
    console.log("설정창 열기 시도함");
    const modal = document.getElementById('settings-modal');
    
    // 안전장치: HTML에 존재하는 요소만 값을 넣도록 try-catch와 if문으로 방어
    try {
        if(document.getElementById('settingTitle')) document.getElementById('settingTitle').value = appData.title || "";
        if(document.getElementById('settingBackground')) document.getElementById('settingBackground').value = appData.theme || "solid";
        
        // Sleep Settings fallback
        if(document.getElementById('bedTimeInput')) document.getElementById('bedTimeInput').value = appData.bedTime || "23:30";
        if(document.getElementById('wakeTimeInput')) document.getElementById('wakeTimeInput').value = appData.wakeTime || "07:00";
        if(document.getElementById('settingSleepTime')) document.getElementById('settingSleepTime').value = appData.baseFreeTime || 9;
        if(document.getElementById('settingEmail')) document.getElementById('settingEmail').value = appData.email || "";
        
        if(!appData.ddays) appData.ddays = [];
        for(let i=0; i<3; i++) {
            const dday = appData.ddays[i] || {name:'', date:''};
            const nameEl = document.getElementById(`settingDdayName${i+1}`);
            const dateEl = document.getElementById(`settingDdayDate${i+1}`);
            if(nameEl) nameEl.value = dday.name;
            if(dateEl) dateEl.value = dday.date;
        }
    } catch(e) { console.error("데이터 바인딩 중 경미한 에러:", e); }

    if (modal) {
        modal.classList.add('show');
    } else {
        console.error("HTML에서 id='settings-modal' 요소를 찾을 수 없습니다.");
    }
}

function saveSettings() {
    if(document.getElementById('settingTitle')) appData.title = document.getElementById('settingTitle').value;
    if(document.getElementById('settingBackground')) appData.theme = document.getElementById('settingBackground').value;
    
    if(document.getElementById('bedTimeInput')) appData.bedTime = document.getElementById('bedTimeInput').value || "23:30";
    if(document.getElementById('wakeTimeInput')) appData.wakeTime = document.getElementById('wakeTimeInput').value || "07:00";
    if(document.getElementById('settingSleepTime')) appData.baseFreeTime = document.getElementById('settingSleepTime').value;
    if(document.getElementById('settingEmail')) appData.email = document.getElementById('settingEmail').value;
    
    appData.ddays = [];
    for(let i=1; i<=3; i++) {
        let elName = document.getElementById(`settingDdayName${i}`);
        let elDate = document.getElementById(`settingDdayDate${i}`);
        if(elName && elDate && elName.value) {
            appData.ddays.push({ name: elName.value, date: elDate.value });
        }
    }
    
    saveLocalData();
    applyTheme();
    renderAll();
    closeModals();

    // 강제 리렌더링 (저장 버튼 로직)
    const titleEl = document.getElementById('mainTitle');
    if (titleEl) {
        titleEl.innerText = appData.title || "CYBER.PLANNER";
        titleEl.textContent = appData.title || "CYBER.PLANNER"; // 확실한 덮어씌우기
    }
    renderDdays(); // D-Day 뱃지 다시 그리기
}

function closeModals() {
    document.querySelectorAll('.modal-overlay').forEach(m => {
        m.classList.remove('show');
        m.style.display = '';
    });
}

// --- Notification / Alert System ---
let notificationTimers = []; // Active setTimeout IDs

function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        Notification.requestPermission();
    }
}

function scheduleNotifications() {
    // Clear any existing timers
    notificationTimers.forEach(id => clearTimeout(id));
    notificationTimers = [];
    
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    
    const now = new Date();
    const todayDay = now.getDay() === 0 ? 7 : now.getDay();
    const blocks = appData.academy[todayDay] || [];
    
    blocks.forEach(block => {
        if (!block.start || !block.notify || block.notify === 0) return;
        
        const notifyMins = parseInt(block.notify) || 0;
        if (notifyMins <= 0) return;
        
        const [sh, sm] = block.start.split(':').map(Number);
        const alertTime = new Date();
        alertTime.setHours(sh, sm, 0, 0);
        alertTime.setMinutes(alertTime.getMinutes() - notifyMins);
        
        const msUntilAlert = alertTime.getTime() - now.getTime();
        
        if (msUntilAlert > 0 && msUntilAlert < 24 * 60 * 60 * 1000) {
            const timerId = setTimeout(() => {
                new Notification('🔔 CYBER.PLANNER', {
                    body: `${block.subject} 시작 ${notifyMins}분 전입니다! (${block.start})`,
                    icon: './icon.png',
                    tag: `academy-${block.subject}-${block.start}`
                });
                
                // Also show in-app toast
                showToastAlert(`⏰ ${block.subject} 시작 ${notifyMins}분 전! (${block.start})`);
            }, msUntilAlert);
            
            notificationTimers.push(timerId);
        }
    });
}

// initNotifications is now called inside DOMContentLoaded (see top of file)


// --- SMS Card Text Parsing ---
let parsedSmsData = { amount: 0, title: '', date: '' };

function openSmsParseModal() {
    closeModals();
    document.getElementById('smsTextInput').value = '';
    document.getElementById('smsPreview').style.display = 'none';
    parsedSmsData = { amount: 0, title: '', date: '' };
    const modal = document.getElementById('smsModal');
    modal.style.display = 'flex';
    modal.classList.add('show');
    lastModalOpenTime = Date.now();
}

function parseSmsText() {
    const raw = document.getElementById('smsTextInput').value.trim();
    if (!raw) return alert('문자 내용을 붙여넣어 주세요.');
    
    let amount = 0;
    let title = '';
    let dateStr = getYYYYMMDD(new Date()); // default: today
    
    // --- Amount Extraction ---
    // Patterns: "12,000원", "12000원", "금액 12,000", "결제금액 12,000원"
    const amountPatterns = [
        /(\d{1,3}(?:,\d{3})+)\s*원/,         // 12,000원
        /(\d{4,})\s*원/,                       // 12000원
        /금액\s*[:：]?\s*(\d{1,3}(?:,\d{3})+)/, // 금액: 12,000
        /금액\s*[:：]?\s*(\d{4,})/,             // 금액: 12000
        /(\d{1,3}(?:,\d{3})+)\s*(?:승인|결제|사용)/, // 12,000 승인
        /(?:승인|결제|사용)\s*(\d{1,3}(?:,\d{3})+)/, // 승인 12,000
    ];
    
    for (const pat of amountPatterns) {
        const match = raw.match(pat);
        if (match) {
            amount = parseInt(match[1].replace(/,/g, ''));
            break;
        }
    }
    
    // --- Date Extraction ---
    // Patterns: "06/03", "06.03", "2026-06-03", "06월 03일"
    const datePatterns = [
        /(\d{4})[-./](\d{1,2})[-./](\d{1,2})/,  // 2026-06-03
        /(\d{1,2})[/.](\d{1,2})\s+\d{1,2}:/,     // 06/03 15:44
        /(\d{1,2})[/.](\d{1,2})/,                 // 06/03
        /(\d{1,2})월\s*(\d{1,2})일/,              // 6월 3일
    ];
    
    for (const pat of datePatterns) {
        const match = raw.match(pat);
        if (match) {
            if (match.length === 4 && match[1].length === 4) {
                // Full date: 2026-06-03
                dateStr = `${match[1]}-${match[2].padStart(2,'0')}-${match[3].padStart(2,'0')}`;
            } else if (match.length >= 3) {
                // Month/Day only
                const year = new Date().getFullYear();
                dateStr = `${year}-${match[1].padStart(2,'0')}-${match[2].padStart(2,'0')}`;
            }
            break;
        }
    }
    
    // --- Store Name (Merchant) Extraction ---
    const lines = raw.split(/[\n\r]+/).map(l => l.trim()).filter(l => l.length > 0);
    
    // Keywords to skip
    const skipKeywords = [
        '승인', '결제', '취소', '원', '누적', '잔액', '일시불', '할부',
        '카드', '신한', '국민', '삼성', 'NH', '농협', '롯데', '하나', '우리', 'BC', '현대',
        'Web발신', '체크', '토스', 'toss', '님', '월', '일', '합계', 'SMS',
        '본인', '해외', '국내', '온라인'
    ];
    
    for (const line of lines) {
        // Skip lines with amounts
        if (/\d{1,3}(,\d{3})+원/.test(line) || /\d{4,}원/.test(line)) continue;
        // Skip date-only lines
        if (/^\d{1,2}[/.]\d{1,2}\s+\d{1,2}:/.test(line)) continue;
        if (/^\d{4}[-/.]\d{1,2}[-/.]\d{1,2}/.test(line)) continue;
        // Skip lines that are mostly keywords
        const isKeywordLine = skipKeywords.some(kw => {
            const cleaned = line.replace(/[\[\]\(\)]/g, '');
            return cleaned.length < 15 && cleaned.includes(kw);
        });
        
        // Check if line looks like a merchant name (not too long, not too short)
        if (!isKeywordLine && line.length >= 2 && line.length <= 30) {
            // Remove bracket prefixes like [Web발신] 
            let cleaned = line.replace(/^\[.*?\]\s*/, '').trim();
            if (cleaned.length >= 2) {
                title = cleaned;
                break;
            }
        }
    }
    
    // Fallback: try to find merchant after amount line
    if (!title) {
        const amountLineIdx = lines.findIndex(l => /\d{1,3}(,\d{3})*원/.test(l) || /\d{4,}원/.test(l));
        if (amountLineIdx >= 0 && amountLineIdx + 1 < lines.length) {
            title = lines[amountLineIdx + 1].replace(/^\[.*?\]\s*/, '').trim();
        }
    }
    
    if (!title) title = '(가맹점 미확인)';
    
    // --- Display Preview ---
    if (amount > 0) {
        parsedSmsData = { amount, title, date: dateStr };
        
        document.getElementById('smsPreviewAmount').innerText = amount.toLocaleString() + ' ₩';
        document.getElementById('smsPreviewTitle').innerText = title;
        document.getElementById('smsPreviewDate').innerText = dateStr;
        document.getElementById('smsPreview').style.display = 'block';
    } else {
        alert('금액을 추출할 수 없습니다. 문자 내용을 확인해 주세요.');
    }
}

function confirmSmsParse() {
    if (!parsedSmsData.amount || parsedSmsData.amount <= 0) return;
    
    const category = document.getElementById('smsCategory').value;
    
    appData.finance.push({
        id: Date.now(),
        type: 'expense',
        amount: parsedSmsData.amount,
        title: parsedSmsData.title,
        category: category,
        date: parsedSmsData.date
    });
    
    saveLocalData();
    renderFinance();
    closeModals();
    
    showToastAlert(`✅ ${parsedSmsData.title} ${parsedSmsData.amount.toLocaleString()}원 기록 완료!`);
}
