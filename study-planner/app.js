/* ==========================================
   1. 필수 변수 설정 (앱 최상단 고정)
   ========================================== */
const GOOGLE_CLIENT_ID = '1059241393010-dhcs8fm43uqppd65m113eqj4jk8qk6dt.apps.googleusercontent.com';
const GOOGLE_API_KEY = 'AIzaSyBSmTQrvXqgFlReBfwGolfgSWlNLHU5_-s';
const SCOPES = 'https://www.googleapis.com/auth/drive.file';

let tokenClient;
let gapiInited = false;
let gisInited = false;
let accessToken = null;

const STORAGE_KEY = 'study_planner_app_data_v2';
const SETTINGS_KEY = 'study_planner_settings_v2';
const DRIVE_FILE_NAME = 'planner_data.json';

// ==========================================
// 2. 제목 수정 기능 (로컬스토리지 즉시 동기화)
// ==========================================
function openSettings() {
    const settingsModal = document.getElementById('settingsModal');
    const modalTitleInput = document.getElementById('modalTitleInput');
    const mainTitle = document.getElementById('mainTitle');

    if (settingsModal && modalTitleInput && mainTitle) {
        modalTitleInput.value = mainTitle.innerText;
        settingsModal.style.display = 'block';
    }
}

function closeSettings() {
    const settingsModal = document.getElementById('settingsModal');
    const modalTitleInput = document.getElementById('modalTitleInput');
    const mainTitle = document.getElementById('mainTitle');

    if (settingsModal && modalTitleInput && mainTitle) {
        const newTitle = modalTitleInput.value.trim();
        if (newTitle) {
            mainTitle.innerText = newTitle;
            let userSettings = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
            userSettings.appTitle = newTitle;
            localStorage.setItem(SETTINGS_KEY, JSON.stringify(userSettings));
        }
        settingsModal.style.display = 'none';
    }
}

function closeModals() {
    document.getElementById('addPlannerModal').classList.remove('show');
    document.getElementById('addMissionModal').classList.remove('show');
    document.getElementById('addFinanceModal').classList.remove('show');
}

// ==========================================
// 앱 주 로직
// ==========================================
document.addEventListener('DOMContentLoaded', () => {

    // 제목 초기화
    let userSettings = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || { appTitle: 'Student Planner' };
    const mainTitle = document.getElementById('mainTitle');
    if (mainTitle) mainTitle.innerText = userSettings.appTitle;

    // 탭 전환기 처리
    const navItems = document.querySelectorAll('.nav-item');
    const plannerView = document.getElementById('plannerView');
    const financeTab = document.getElementById('financeTab');
    const daySelector = document.getElementById('daySelector');
    const mainIcon = document.getElementById('mainIcon');
    let currentTab = 'planner';

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            navItems.forEach(n => n.classList.remove('active'));
            item.classList.add('active');

            currentTab = item.dataset.tab;

            if (currentTab === 'planner') {
                plannerView.style.display = 'block';
                financeTab.style.display = 'none';
                daySelector.style.display = 'flex';
                mainTitle.innerText = userSettings.appTitle || 'Planner';
                mainIcon.innerText = 'edit_calendar';
            } else {
                plannerView.style.display = 'none';
                financeTab.style.display = 'block';
                daySelector.style.display = 'none';
                mainTitle.innerText = 'Finance';
                mainIcon.innerText = 'account_balance_wallet';
            }
        });
    });

    // ==========================================
    // 3. 구글 연동 및 드라이브 저장 로직
    // ==========================================
    const authBtn = document.getElementById('authBtn');
    const syncBtn = document.getElementById('syncBtn');
    const syncStatus = document.getElementById('syncStatus');

    function checkGoogleInit() {
        if (window.gapi) {
            gapi.load('client', initializeGapiClient);
        } else {
            setTimeout(checkGoogleInit, 200);
        }
    }
    checkGoogleInit();

    async function initializeGapiClient() {
        await gapi.client.init({
            apiKey: GOOGLE_API_KEY,
            discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
        });
        gapiInited = true;
        initGsi();
    }

    function initGsi() {
        if (window.google) {
            tokenClient = google.accounts.oauth2.initTokenClient({
                client_id: GOOGLE_CLIENT_ID,
                scope: SCOPES,
                callback: (tokenResponse) => {
                    if (tokenResponse && tokenResponse.access_token) {
                        accessToken = tokenResponse.access_token;
                        if (authBtn) authBtn.style.display = 'none';
                        if (syncBtn) syncBtn.style.display = 'block';
                        if (syncStatus) syncStatus.innerText = "✅ 설정 됨: 클라우드로 저장 가능";
                        loadFromDrive();
                    }
                },
            });
            gisInited = true;
        } else {
            setTimeout(initGsi, 200);
        }
    }

    if (authBtn) {
        authBtn.addEventListener('click', () => {
            if (tokenClient) {
                tokenClient.requestAccessToken({ prompt: 'consent' });
            } else {
                syncStatus.innerText = "로딩 중... 다시 시도해주세요.";
            }
        });
    }

    if (syncBtn) {
        syncBtn.addEventListener('click', () => {
            syncToDrive();
        });
    }

    async function syncToDrive() {
        if (!accessToken) return;
        if (syncStatus) syncStatus.innerText = "☁️ 업로드 중...";

        try {
            const allData = {
                appData,
                settings: JSON.parse(localStorage.getItem(SETTINGS_KEY)) || { appTitle: 'Planner' }
            };
            const fileContent = JSON.stringify(allData);
            const file = new Blob([fileContent], { type: 'application/json' });

            const response = await gapi.client.drive.files.list({
                q: `name='${DRIVE_FILE_NAME}' and trashed=false`,
                spaces: 'drive',
                fields: 'files(id, name)'
            });
            const files = response.result.files;

            const metadata = { name: DRIVE_FILE_NAME, mimeType: 'application/json' };
            const form = new FormData();
            form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
            form.append('file', file);

            let fetchOptions = { method: 'POST', headers: { 'Authorization': 'Bearer ' + accessToken }, body: form };
            let url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

            if (files && files.length > 0) {
                const fileId = files[0].id;
                fetchOptions.method = 'PATCH';
                url = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`;
            }

            const res = await fetch(url, fetchOptions);
            if (res.ok) {
                if (syncStatus) syncStatus.innerText = "✅ 백업이 안전하게 완료되었습니다!";
            } else {
                throw new Error('Upload failed');
            }
        } catch (err) {
            console.error(err);
            if (syncStatus) syncStatus.innerText = "❌ 동기화 실패. 다시 시도해주세요.";
        }
    }

    async function loadFromDrive() {
        if (!accessToken) return;
        try {
            const response = await gapi.client.drive.files.list({
                q: `name='${DRIVE_FILE_NAME}' and trashed=false`,
                spaces: 'drive',
                fields: 'files(id, name)'
            });
            const files = response.result.files;

            if (files && files.length > 0) {
                const fileId = files[0].id;
                const fileRes = await gapi.client.drive.files.get({ fileId: fileId, alt: 'media' });
                const cloudData = fileRes.result;

                if (cloudData && cloudData.appData) {
                    if (confirm("구글 드라이브에 저장된 기존 데이터가 있습니다. 불러오시겠습니까?")) {
                        appData = cloudData.appData;
                        saveData();
                        if (cloudData.settings) {
                            localStorage.setItem(SETTINGS_KEY, JSON.stringify(cloudData.settings));
                            if (mainTitle) mainTitle.innerText = cloudData.settings.appTitle;
                        }
                        renderPlanner();
                        alert("데이터를 성공적으로 불러왔습니다!");
                    }
                }
            }
        } catch (err) {
            console.error("데이터 로드 에러:", err);
        }
    }

    // ==========================================
    // 4. 앱 데이터 저장 & 요일 처리 구성
    // ==========================================
    function getDefaultData() {
        const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const weekData = {};
        weekDays.forEach(day => {
            weekData[day] = {
                school: Array.from({ length: 8 }, (_, i) => ({
                    period: i + 1, subject: '', time: '', location: '', color: 'var(--color-kor)', transit: 0
                })),
                evening: [],
                missions: { homework: [], exercise: [] }
            };
        });
        return { schedules: weekData, finance: { transactions: [] } };
    }

    let appData = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!appData) {
        appData = getDefaultData();
        saveData();
    }
    function saveData() { localStorage.setItem(STORAGE_KEY, JSON.stringify(appData)); }

    const today = new Date();
    const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const korDays = ['월', '화', '수', '목', '금', '토'];
    const currentDayOfWeek = today.getDay();
    const diffToMonday = currentDayOfWeek === 0 ? -6 : 1 - currentDayOfWeek;
    const mondayDate = new Date(today);
    mondayDate.setDate(today.getDate() + diffToMonday);

    let activeDayIndex = (currentDayOfWeek >= 1 && currentDayOfWeek <= 6) ? currentDayOfWeek - 1 : 0;
    let currentSelectedDay = weekDays[activeDayIndex];

    weekDays.forEach((day, index) => {
        const dDate = new Date(mondayDate); dDate.setDate(mondayDate.getDate() + index);
        const dateNum = dDate.getDate();

        const btn = document.createElement('button');
        btn.className = `day-btn ${index === activeDayIndex ? 'active' : ''}`;
        if (day === 'Sat') btn.classList.add('sat');
        btn.innerHTML = `<span class="day-name">${korDays[index]}</span><span class="date-num">${dateNum}</span>`;
        btn.addEventListener('click', () => {
            document.querySelector('.day-btn.active').classList.remove('active');
            btn.classList.add('active');
            currentSelectedDay = day;
            renderPlanner();
        });
        if (daySelector) daySelector.appendChild(btn);
    });

    // ==========================================
    // 5. 자습 시간 계산 로직
    // ==========================================
    function calculateFreeTime() {
        const dayData = appData.schedules[currentSelectedDay];
        if (!dayData) return;

        let totalMins = 900; // 하루 기본 자유시간: 15시간 (오전9시~자정)

        if (currentSelectedDay !== 'Sat') {
            dayData.school.forEach(s => {
                if (s.subject && s.subject.trim() !== '') {
                    totalMins -= 50;
                }
            });
        }
        dayData.evening.forEach(s => {
            try {
                const [st, et] = s.time.split('-');
                if (st && et) {
                    const [sh, sm] = st.trim().split(':');
                    const [eh, em] = et.trim().split(':');
                    const diffMins = ((Number(eh) * 60 + Number(em)) - (Number(sh) * 60 + Number(sm)));
                    if (diffMins > 0) totalMins -= diffMins;
                }
            } catch (e) { }
            if (s.transit) totalMins -= parseInt(s.transit);
        });

        if (totalMins < 0) totalMins = 0;

        const freeTimeDisplay = document.getElementById('freeTimeDisplay');
        if (freeTimeDisplay) {
            freeTimeDisplay.innerText = `${Math.floor(totalMins / 60)}시간 ${totalMins % 60}분`;
        }
    }

    // ==========================================
    // 6. UI 렌더 및 1~8교시 인풋 대응
    // ==========================================
    const schoolSchedule = document.getElementById('schoolSchedule');
    const plannerTabEvening = document.getElementById('plannerTab');

    function renderPlanner() {
        calculateFreeTime();

        // 학교 시간표 1~8교시
        if (currentSelectedDay === 'Sat') {
            if (schoolSchedule && schoolSchedule.parentElement) schoolSchedule.parentElement.style.display = 'none';
            if (document.getElementById('transitDivider')) document.getElementById('transitDivider').style.display = 'none';
        } else {
            if (schoolSchedule && schoolSchedule.parentElement) schoolSchedule.parentElement.style.display = 'block';
            if (document.getElementById('transitDivider')) document.getElementById('transitDivider').style.display = 'flex';

            if (schoolSchedule) {
                schoolSchedule.innerHTML = '';
                appData.schedules[currentSelectedDay].school.forEach((item, index) => {
                    const div = document.createElement('div');
                    div.className = 'period-item';
                    div.style.padding = '8px 16px';
                    div.style.marginBottom = '8px';
                    div.style.background = 'var(--surface-color)';

                    div.innerHTML = `
                        <div class="period-num" style="min-width:30px; font-weight:bold; color:var(--primary-color);">${item.period}</div>
                        <div style="flex-grow:1; display:flex; align-items:center;">
                            <input type="text" class="quick-input" placeholder="${item.period}교시 과목 입력" value="${item.subject || ''}" style="width:100%; border:none; background:transparent; font-size:15px; outline:none; font-family:inherit;">
                        </div>
                    `;

                    const inputElement = div.querySelector('input');
                    inputElement.addEventListener('input', (e) => {
                        item.subject = e.target.value;
                        saveData();
                        calculateFreeTime();
                    });

                    schoolSchedule.appendChild(div);
                });
            }
        }

        // 방과 후 & 학원
        if (plannerTabEvening) {
            plannerTabEvening.innerHTML = '';
            const evData = appData.schedules[currentSelectedDay].evening;

            evData.forEach((item, index) => {
                if (item.transit > 0) {
                    const tr = document.createElement('div'); tr.className = 'transit-block';
                    tr.innerHTML = `<span class="material-symbols-rounded">directions_bus</span><span>이동 중</span><span class="transit-time">${item.transit}분 소요</span>`;
                    plannerTabEvening.appendChild(tr);
                }
                const div = document.createElement('div'); div.className = 'period-item'; div.style.cursor = 'pointer';
                div.style.borderLeft = `6px solid ${item.color}`;
                div.innerHTML = `<div class="period-details">
                    <div class="period-header"><span class="period-subject">${item.subject}</span>
                        <button class="icon-btn Dlt" style="width:32px;height:32px;padding:4px;border:none;box-shadow:none;background:transparent;"><span class="material-symbols-rounded" style="color:#EF4444;font-size:20px;">delete</span></button>
                    </div>
                    <div class="period-meta" style="margin-top:4px;"><div class="meta-item"><span class="material-symbols-rounded">schedule</span>${item.time}</div><div class="meta-item"><span class="material-symbols-rounded">location_on</span>${item.location || ''}</div></div>
                </div>`;
                div.querySelector('.Dlt').addEventListener('click', (e) => { e.stopPropagation(); if (confirm('삭제하시겠습니까?')) { evData.splice(index, 1); saveData(); renderPlanner(); } });
                div.addEventListener('click', () => openPlannerModal('evening', index, item));
                plannerTabEvening.appendChild(div);
            });

            // 추가 버튼
            const clicker = document.createElement('div');
            clicker.className = 'evening-empty-clicker';
            clicker.innerHTML = `<span><span class="material-symbols-rounded" style="vertical-align:middle;margin-right:8px;font-size:20px;">add_circle</span>학원/저녁 일정 추가</span>`;
            clicker.addEventListener('click', () => openPlannerModal('evening', -1, null));
            plannerTabEvening.appendChild(clicker);
        }

        // 데일리 미션
        const renderList = (data, containerId, grpName) => {
            const container = document.getElementById(containerId);
            if (!container) return;
            container.innerHTML = '';
            if (data.length === 0) { container.innerHTML = `<div class="empty-state" style="padding:16px;">미션이 없습니다.</div>`; return; }
            data.forEach((m, idx) => {
                const li = document.createElement('li'); li.className = `mission-item ${m.done ? 'done' : ''}`;
                li.innerHTML = `
                    <div class="mission-checkbox"><span class="material-symbols-rounded">check</span></div>
                    <div class="mission-content">
                        <span class="mission-text">${m.text}</span>
                    </div>
                    <button class="mission-delete"><span class="material-symbols-rounded">close</span></button>
                `;
                li.addEventListener('click', (e) => {
                    if (e.target.closest('.mission-delete')) return;
                    if (e.target.closest('.mission-checkbox')) { m.done = !m.done; saveData(); renderPlanner(); return; }
                    openMissionModal(grpName, idx, m);
                });
                li.querySelector('.mission-delete').addEventListener('click', (e) => { data.splice(idx, 1); saveData(); renderPlanner(); });
                container.appendChild(li);
            });
        };
        renderList(appData.schedules[currentSelectedDay].missions.homework, 'homeworkList', 'homework');
        renderList(appData.schedules[currentSelectedDay].missions.exercise, 'exerciseList', 'exercise');
    }

    // ==========================================
    // 7. 모달 & FAB (플러스) 버튼 이벤트 처리
    // ==========================================
    const planModal = document.getElementById('addPlannerModal');
    function openPlannerModal(type, idx, item) {
        document.getElementById('plannerModalTitle').textContent = item ? '학원/방과후 변경' : '학원/방과후 추가';
        document.getElementById('inputPeriodIdx').value = idx;
        document.getElementById('inputSubject').value = item ? item.subject : '';
        document.getElementById('inputStartTime').value = item && item.time ? item.time.split('-')[0].trim() : '18:00';
        document.getElementById('inputEndTime').value = item && item.time ? item.time.split('-')[1].trim() : '20:00';
        document.getElementById('inputTransit').value = item ? item.transit : '';
        document.getElementById('inputLocation').value = item ? item.location : '';

        if (planModal) planModal.classList.add('show');
    }

    const scheduleForm = document.getElementById('scheduleForm');
    if (scheduleForm) {
        scheduleForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const idx = parseInt(document.getElementById('inputPeriodIdx').value);
            const payload = {
                subject: document.getElementById('inputSubject').value,
                color: document.querySelector('input[name="subjectColor"]:checked').value,
                time: `${document.getElementById('inputStartTime').value} - ${document.getElementById('inputEndTime').value}`,
                location: document.getElementById('inputLocation').value,
                transit: parseInt(document.getElementById('inputTransit').value) || 0
            };
            if (idx > -1) { appData.schedules[currentSelectedDay].evening[idx] = payload; }
            else { appData.schedules[currentSelectedDay].evening.push(payload); }
            saveData(); renderPlanner(); planModal.classList.remove('show');
        });
    }

    const missionModal = document.getElementById('addMissionModal');
    function openMissionModal(grp, idx, item) {
        document.getElementById('inputMissionGrp').value = grp;
        document.getElementById('inputMissionId').value = idx;
        document.getElementById('missionModalTitle').textContent = item ? '상세 수정' : '할 일 추가';
        document.getElementById('inputMissionText').value = item ? item.text : '';
        if (missionModal) missionModal.classList.add('show');
    }

    const missionForm = document.getElementById('missionForm');
    if (missionForm) {
        missionForm.addEventListener('submit', (e) => {
            e.preventDefault();
            const grp = document.getElementById('inputMissionGrp').value;
            const idx = parseInt(document.getElementById('inputMissionId').value);
            const text = document.getElementById('inputMissionText').value;
            const cat = document.querySelector('input[name="missCategory"]:checked').value;

            if (idx > -1) {
                appData.schedules[currentSelectedDay].missions[grp][idx].text = text;
                appData.schedules[currentSelectedDay].missions[grp][idx].category = cat;
            } else {
                appData.schedules[currentSelectedDay].missions[grp].push({ text, category: cat, done: false, rating: 0 });
            }
            saveData(); renderPlanner(); missionModal.classList.remove('show');
        });
    }

    if (document.getElementById('addHomeworkBtn')) document.getElementById('addHomeworkBtn').addEventListener('click', () => openMissionModal('homework', -1, null));
    if (document.getElementById('addExerciseBtn')) document.getElementById('addExerciseBtn').addEventListener('click', () => openMissionModal('exercise', -1, null));

    const mainFab = document.getElementById('mainFab');
    if (mainFab) {
        mainFab.addEventListener('click', () => {
            if (currentTab === 'planner') openPlannerModal('evening', -1, null);
            else document.getElementById('addFinanceModal').classList.add('show'); // stub for finance
        });
    }

    // 초기 렌더링 호출
    renderPlanner();
});
