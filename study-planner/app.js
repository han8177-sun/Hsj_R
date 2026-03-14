// ----------------------------------------------------
// 1. 필수 변수 및 구성설정
// ----------------------------------------------------
const GOOGLE_CLIENT_ID = '1059241393010-dhcs8fm43uqppd65m113eqj4jk8qk6dt.apps.googleusercontent.com';
const GOOGLE_API_KEY = 'AIzaSyBSmTQrvXqgFlReBfwGolfgSWlNLHU5_-s';
const SCOPES = 'https://www.googleapis.com/auth/drive.file';
const DRIVE_FILE_NAME = 'planner_data.json';
const DB_KEY = 'smart_planner_db';

let tokenClient;
let accessToken = null;

// 데이터 초기화 스키마
function getDefaultData() {
    const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    const weekData = {};
    weekDays.forEach(day => {
        weekData[day] = {
            school: Array(8).fill(""),
            academy: [], // { lockup: false, subject, start, end, color, alarm }
            goals: []    // { text: "", done: false }
        };
    });
    return {
        schedules: weekData,
        finance: [], // { type, amount, title }
        settings: { title: "My Planner", ddayName: "", ddayDate: "" }
    };
}

let appData = JSON.parse(localStorage.getItem(DB_KEY));
if (!appData) {
    appData = getDefaultData();
    saveData();
}

function saveData() {
    localStorage.setItem(DB_KEY, JSON.stringify(appData));
    calculateFreeTime();
}

// ----------------------------------------------------
// 2. 날짜 및 뷰 초기화
// ----------------------------------------------------
const today = new Date();
const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const korDays = ['월', '화', '수', '목', '금', '토', '일'];

let currentDayIndex = today.getDay() === 0 ? 6 : today.getDay() - 1; // 월(0)~일(6)
let currentSelectedDay = weekDays[currentDayIndex];

document.addEventListener('DOMContentLoaded', () => {
    // 권한 요청 패리티 (알림)
    if ("Notification" in window && Notification.permission !== "granted" && Notification.permission !== "denied") {
        Notification.requestPermission();
    }

    renderHeader();
    renderDaySelector();
    renderSchool();
    renderAcademy();
    renderGoals();
    renderFinance();
    scheduleAlarms();

    // 탭 네비게이션
    const navItems = document.querySelectorAll('.bottom-nav .nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            navItems.forEach(n => n.classList.remove('active'));
            item.classList.add('active');

            document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active-tab'));
            document.getElementById(item.dataset.target).classList.add('active-tab');
        });
    });

    // 컬러 픽커
    document.querySelectorAll('.color-swatch').forEach(sw => {
        sw.addEventListener('click', () => {
            document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
            sw.classList.add('active');
            document.getElementById('academyColor').value = sw.dataset.color;
        });
    });
});

// ----------------------------------------------------
// 구글 연동 로직
// ----------------------------------------------------
function gapiLoaded() {
    gapi.load('client', () => {
        gapi.client.init({ apiKey: GOOGLE_API_KEY, discoveryDocs: ["https://www.googleapis.com/discovery/v1/apis/drive/v3/rest"] });
    });
}
function gisLoaded() {
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: GOOGLE_CLIENT_ID,
        scope: SCOPES,
        callback: (resp) => {
            if (resp.access_token) {
                accessToken = resp.access_token;
                document.getElementById('authBtn').style.display = 'none';
                document.getElementById('syncBtn').style.display = 'block';
                document.getElementById('loadBtn').style.display = 'block';
                document.getElementById('syncStatus').innerText = "✅ 드라이브 접근 권한 획득됨!";
            }
        },
    });
}
function handleAuth() { if (tokenClient) tokenClient.requestAccessToken({ prompt: 'consent' }); }

async function syncToDrive() {
    if (!accessToken) return;
    document.getElementById('syncStatus').innerText = "☁️ 업로드 중...";
    try {
        const fileContent = JSON.stringify(appData);
        const file = new Blob([fileContent], { type: 'application/json' });
        const resList = await gapi.client.drive.files.list({ q: `name='${DRIVE_FILE_NAME}' and trashed=false`, spaces: 'drive', fields: 'files(id)' });

        const metadata = { name: DRIVE_FILE_NAME, mimeType: 'application/json' };
        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', file);

        let url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';
        let options = { method: 'POST', headers: { 'Authorization': 'Bearer ' + accessToken }, body: form };

        if (resList.result.files && resList.result.files.length > 0) {
            options.method = 'PATCH';
            url = `https://www.googleapis.com/upload/drive/v3/files/${resList.result.files[0].id}?uploadType=multipart`;
        }
        const resp = await fetch(url, options);
        if (resp.ok) {
            document.getElementById('syncStatus').innerText = "✅ 백업이 안전하게 완료되었습니다!";
            alert("구글 드라이브에 성공적으로 백업되었습니다.");
        } else throw new Error("업로드 실패");
    } catch (e) {
        document.getElementById('syncStatus').innerText = "❌ 동기화 실패";
    }
}

async function loadFromDrive() {
    if (!accessToken) return;
    document.getElementById('syncStatus').innerText = "☁️ 다운로드 중...";
    try {
        const resList = await gapi.client.drive.files.list({ q: `name='${DRIVE_FILE_NAME}' and trashed=false`, spaces: 'drive', fields: 'files(id)' });
        if (resList.result.files && resList.result.files.length > 0) {
            const fileRes = await gapi.client.drive.files.get({ fileId: resList.result.files[0].id, alt: 'media' });
            if (fileRes.result && fileRes.result.schedules) {
                appData = fileRes.result;
                saveData();
                location.reload(); // 새로고침하여 전체 UI 반영
            }
        } else {
            alert("드라이브에 백업된 파일이 없습니다.");
            document.getElementById('syncStatus').innerText = "백업된 파일 없음";
        }
    } catch (e) {
        document.getElementById('syncStatus').innerText = "❌ 로드 실패";
    }
}

// ----------------------------------------------------
// UI 렌더링 함수들
// ----------------------------------------------------
function renderHeader() {
    document.getElementById('mainTitle').innerText = appData.settings.title;
    const badge = document.getElementById('ddayBadge');
    if (appData.settings.ddayDate && appData.settings.ddayName) {
        const target = new Date(appData.settings.ddayDate);
        target.setHours(0, 0, 0, 0);
        const t2 = new Date(); t2.setHours(0, 0, 0, 0);
        const diff = Math.ceil((target - t2) / (1000 * 60 * 60 * 24));
        badge.innerText = `${appData.settings.ddayName} D${diff > 0 ? '-' + diff : (diff === 0 ? '-Day' : '+' + Math.abs(diff))}`;
    } else {
        badge.innerText = "D-Day 설정";
    }
}

function renderDaySelector() {
    const ds = document.getElementById('daySelector');
    ds.innerHTML = '';

    // 월요일 기준으로 주간 생성
    const diffToMonday = today.getDay() === 0 ? -6 : 1 - today.getDay();
    const monDate = new Date(today);
    monDate.setDate(today.getDate() + diffToMonday);

    weekDays.forEach((day, idx) => {
        const dDate = new Date(monDate);
        dDate.setDate(monDate.getDate() + idx);
        const btn = document.createElement('div');
        btn.className = `day-btn ${day === currentSelectedDay ? 'active' : ''}`;
        btn.innerHTML = `<span class="day-name">${korDays[idx]}</span><span class="date-num">${dDate.getDate()}</span>`;
        btn.onclick = () => {
            currentSelectedDay = day;
            renderDaySelector();
            renderSchool();
            renderAcademy();
            renderGoals();
        };
        ds.appendChild(btn);
    });
}

// 학교 1~8교시 인라인 입력
function renderSchool() {
    const list = document.getElementById('schoolSchedule');
    list.innerHTML = '';
    const dayData = appData.schedules[currentSelectedDay].school;

    if (currentSelectedDay === 'Sat' || currentSelectedDay === 'Sun') {
        list.innerHTML = `<div style="padding: 15px; text-align:center; color:#A0A0A0; font-size:14px;">주말은 학교 일정이 없습니다.</div>`;
        return;
    }

    for (let i = 0; i < 8; i++) {
        const row = document.createElement('div');
        row.className = 'school-row';
        row.innerHTML = `
            <span>${i + 1}교시</span>
            <input type="text" placeholder="과목명 입력" value="${dayData[i]}">
        `;
        row.querySelector('input').addEventListener('input', (e) => {
            appData.schedules[currentSelectedDay].school[i] = e.target.value;
            saveData();
        });
        list.appendChild(row);
    }
    calculateFreeTime();
}

// 방과 후 학원 렌더링
function renderAcademy() {
    const list = document.getElementById('academyTab');
    list.innerHTML = '';
    const blocks = appData.schedules[currentSelectedDay].academy;

    // 시간 순 정렬
    blocks.sort((a, b) => a.start.localeCompare(b.start));

    blocks.forEach((b, idx) => {
        const div = document.createElement('div');
        div.className = `academy-block ${b.lockup ? 'lockup' : `bg-${b.color}`}`;

        let bellHtml = b.alarm ? `<span class="material-symbols-rounded" style="font-size:14px; margin-left:5px; vertical-align:middle;">notifications_active</span>` : '';

        div.innerHTML = `
            <div class="block-time">${b.start} ~ ${b.end} ${bellHtml}</div>
            <div class="block-title">${b.subject}</div>
            <div class="block-actions">
                <button onclick="editAcademyBlock(${idx})"><span class="material-symbols-rounded" style="font-size:16px;">edit</span></button>
                <button onclick="deleteAcademyBlock(${idx})"><span class="material-symbols-rounded" style="font-size:16px;">delete</span></button>
            </div>
        `;
        list.appendChild(div);
    });
}

function calculateFreeTime() {
    if (currentSelectedDay === 'Sat' || currentSelectedDay === 'Sun') {
        document.getElementById('freeTimeDisplay').innerText = "주말 자율";
        return;
    }

    let baseMins = 15 * 60; // 15시간

    // 학교 차감
    appData.schedules[currentSelectedDay].school.forEach(s => {
        if (s.trim() !== '') baseMins -= 50;
    });

    // 학원 차감 (이동시간 lockup 포함)
    appData.schedules[currentSelectedDay].academy.forEach(a => {
        try {
            const [sh, sm] = a.start.split(':');
            const [eh, em] = a.end.split(':');
            const diff = (parseInt(eh) * 60 + parseInt(em)) - (parseInt(sh) * 60 + parseInt(sm));
            if (diff > 0) baseMins -= diff;
        } catch (e) { }
    });

    if (baseMins < 0) baseMins = 0;
    document.getElementById('freeTimeDisplay').innerText = `${Math.floor(baseMins / 60)}시간 ${baseMins % 60}분`;
}

// 목표 렌더링
function renderGoals() {
    const list = document.getElementById('goalList');
    list.innerHTML = '';
    const goals = appData.schedules[currentSelectedDay].goals;

    if (goals.length === 0) {
        list.innerHTML = `<div style="padding: 15px; text-align:center; color:#A0A0A0; font-size:14px;">등록된 목표가 없습니다.</div>`;
        return;
    }

    goals.forEach((g, idx) => {
        const li = document.createElement('li');
        li.className = `goal-item ${g.done ? 'done' : ''}`;
        li.innerHTML = `
            <input type="checkbox" ${g.done ? 'checked' : ''} onchange="toggleGoal(${idx})">
            <span class="text">${g.text}</span>
            <button class="del-btn" onclick="deleteGoal(${idx})"><span class="material-symbols-rounded">close</span></button>
        `;
        list.appendChild(li);
    });
}
function toggleGoal(idx) {
    appData.schedules[currentSelectedDay].goals[idx].done = !appData.schedules[currentSelectedDay].goals[idx].done;
    saveData();
    renderGoals();
}
function deleteGoal(idx) {
    appData.schedules[currentSelectedDay].goals.splice(idx, 1);
    saveData();
    renderGoals();
}

// 가계부 렌더링
function renderFinance() {
    const list = document.getElementById('transactionList');
    list.innerHTML = '';
    let totalInc = 0, totalExp = 0;

    appData.finance.forEach((tx, idx) => {
        const val = parseInt(tx.amount);
        if (tx.type === 'income') totalInc += val; else totalExp += val;

        const div = document.createElement('div');
        div.className = 'tx-item';
        div.innerHTML = `
            <span class="tx-title">${tx.title}</span>
            <div style="display:flex; align-items:center; gap:10px;">
                <strong class="tx-amt ${tx.type === 'income' ? 'inc' : 'exp'}">${tx.type === 'income' ? '+' : '-'}${val.toLocaleString()}원</strong>
                <button class="icon-btn" onclick="deleteFinance(${idx})"><span class="material-symbols-rounded" style="color:#EF4444;">delete</span></button>
            </div>
        `;
        list.appendChild(div);
    });

    document.getElementById('totalIncome').innerText = totalInc.toLocaleString() + "원";
    document.getElementById('totalExpense').innerText = totalExp.toLocaleString() + "원";
    document.getElementById('totalBalance').innerText = (totalInc - totalExp).toLocaleString() + "원";
}
function deleteFinance(idx) {
    appData.finance.splice(idx, 1);
    saveData();
    renderFinance();
}

// ----------------------------------------------------
// 모달 열기/저장 관련 로직
// ----------------------------------------------------
function closeModals() {
    document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('show'));
}

function openSettings() {
    document.getElementById('settingTitle').value = appData.settings.title;
    document.getElementById('settingDdayName').value = appData.settings.ddayName;
    document.getElementById('settingDdayDate').value = appData.settings.ddayDate;
    document.getElementById('settingsModal').classList.add('show');
}
function saveSettings() {
    appData.settings.title = document.getElementById('settingTitle').value;
    appData.settings.ddayName = document.getElementById('settingDdayName').value;
    appData.settings.ddayDate = document.getElementById('settingDdayDate').value;
    saveData();
    renderHeader();
    closeModals();
}

function openAcademyModal(idx) {
    const modal = document.getElementById('academyModal');
    document.getElementById('academyIndex').value = idx;

    if (idx === -1) {
        document.getElementById('academyModalTitle').innerText = "일정 추가";
        document.getElementById('academySubject').value = "";
        document.getElementById('academyStart').value = "18:00";
        document.getElementById('academyEnd').value = "20:00";
        document.querySelector('input[name="blockType"][value="study"]').checked = true;
        document.getElementById('academyAlarm').checked = false;
        document.querySelectorAll('.color-swatch')[0].click(); // default blue
    } else {
        document.getElementById('academyModalTitle').innerText = "일정 수정";
        const b = appData.schedules[currentSelectedDay].academy[idx];
        document.getElementById('academySubject').value = b.subject;
        document.getElementById('academyStart').value = b.start;
        document.getElementById('academyEnd').value = b.end;
        document.querySelector(`input[name="blockType"][value="${b.lockup ? 'lockup' : 'study'}"]`).checked = true;
        document.getElementById('academyAlarm').checked = b.alarm;
        document.querySelector(`.color-swatch[data-color="${b.color}"]`).click();
    }
    modal.classList.add('show');
}
function saveAcademyBlock() {
    const idx = parseInt(document.getElementById('academyIndex').value);
    const payload = {
        subject: document.getElementById('academySubject').value,
        start: document.getElementById('academyStart').value,
        end: document.getElementById('academyEnd').value,
        lockup: document.querySelector('input[name="blockType"]:checked').value === "lockup",
        color: document.getElementById('academyColor').value,
        alarm: document.getElementById('academyAlarm').checked
    };
    if (idx === -1) {
        appData.schedules[currentSelectedDay].academy.push(payload);
    } else {
        appData.schedules[currentSelectedDay].academy[idx] = payload;
    }
    saveData();
    renderAcademy();
    scheduleAlarms();
    closeModals();
}
function editAcademyBlock(idx) { openAcademyModal(idx); }
function deleteAcademyBlock(idx) {
    if (confirm("이 일정을 삭제할까요?")) {
        appData.schedules[currentSelectedDay].academy.splice(idx, 1);
        saveData(); renderAcademy();
    }
}

function openGoalModal() {
    document.getElementById('goalText').value = "";
    document.getElementById('goalModal').classList.add('show');
}
function saveGoal() {
    const text = document.getElementById('goalText').value.trim();
    if (text) {
        appData.schedules[currentSelectedDay].goals.push({ text, done: false });
        saveData(); renderGoals(); closeModals();
    }
}

function openFinanceModal() {
    document.getElementById('financeAmount').value = "";
    document.getElementById('financeTitle').value = "";
    document.getElementById('financeModal').classList.add('show');
}
function saveFinance() {
    const amount = document.getElementById('financeAmount').value;
    const title = document.getElementById('financeTitle').value.trim();
    if (amount && title) {
        appData.finance.push({
            type: document.querySelector('input[name="financeType"]:checked').value,
            amount: parseInt(amount),
            title: title
        });
        saveData(); renderFinance(); closeModals();
    }
}

// ----------------------------------------------------
// 8. 노티피케이션 (알림)
// ----------------------------------------------------
let alarmTimeouts = [];
function scheduleAlarms() {
    // 기존 타이머 삭제
    alarmTimeouts.forEach(t => clearTimeout(t));
    alarmTimeouts = [];

    if ("Notification" in window && Notification.permission === "granted") {
        const todayKor = weekDays[today.getDay() === 0 ? 6 : today.getDay() - 1];
        const blocks = appData.schedules[todayKor].academy.filter(b => b.alarm);

        blocks.forEach(b => {
            const [sh, sm] = b.start.split(':');
            let targetTime = new Date();
            targetTime.setHours(parseInt(sh), parseInt(sm), 0, 0);
            targetTime = new Date(targetTime.getTime() - (10 * 60 * 1000)); // 10분 전

            const now = new Date();
            if (targetTime > now) {
                const diff = targetTime.getTime() - now.getTime();
                const tid = setTimeout(() => {
                    new Notification("Smart Planner", {
                        body: `10분 뒤 '${b.subject}' 일정이 시작됩니다!`,
                        icon: "icon.svg"
                    });
                }, diff);
                alarmTimeouts.push(tid);
            }
        });
    }
}