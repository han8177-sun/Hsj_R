/* ==========================================
   1. 필수 변수 설정 (앱 최상단)
   ========================================== */
const GOOGLE_CLIENT_ID = '1059241393010-dhcs8fm43uqppd65m113eqj4jk8qk6dt.apps.googleusercontent.com';
const GOOGLE_API_KEY = 'AIzaSyBSmTQrvXqgFlReBfwGolfgSWlNLHU5_-s';
const SCOPES = 'https://www.googleapis.com/auth/drive.file';

let tokenClient;
let gapiInited = false;
let gisInited = false;
let accessToken = null;

const STORAGE_KEY = 'study_planner_app_data_v1';
const SETTINGS_KEY = 'study_planner_settings_v2';
const DRIVE_FILE_NAME = 'planner_data.json';

// ==========================================
// 2. 제목 수정 기능
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
// 앱 메인 로직 시작
// ==========================================
document.addEventListener('DOMContentLoaded', () => {

    // 제목 초기화
    let userSettings = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || { appTitle: 'Student Planner' };
    const mainTitle = document.getElementById('mainTitle');
    if (mainTitle) mainTitle.innerText = userSettings.appTitle;

    // 탭 전환
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

            const target = item.dataset.tab;
            currentTab = target;

            if (target === 'planner') {
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
    // 3. 구글 드라이브 동기화 기능 (GIS 및 GAPI)
    // ==========================================
    const authBtn = document.getElementById('authBtn');
    const syncBtn = document.getElementById('syncBtn');
    const syncStatus = document.getElementById('syncStatus');

    // GAPI 로드
    function gapiLoaded() {
        if (window.gapi) {
            gapi.load('client', initializeGapiClient);
        }
    }
    window.gapiLoaded = gapiLoaded;

    async function initializeGapiClient() {
        await gapi.client.init({
            apiKey: GOOGLE_API_KEY,
            discoveryDocs: ['https://www.googleapis.com/discovery/v1/apis/drive/v3/rest'],
        });
        gapiInited = true;
        checkAuthSetup();
    }

    // GSI 로드
    function gsiLoaded() {
        if (window.google) {
            tokenClient = google.accounts.oauth2.initTokenClient({
                client_id: GOOGLE_CLIENT_ID,
                scope: SCOPES,
                callback: (tokenResponse) => {
                    if (tokenResponse && tokenResponse.access_token) {
                        accessToken = tokenResponse.access_token;
                        if (authBtn) authBtn.style.display = 'none';
                        if (syncBtn) syncBtn.style.display = 'block';
                        if (syncStatus) syncStatus.innerText = "✅ 구글 계정 연결됨 (드라이브 접근 가능)";
                        // 로그인 성공 시 드라이브에서 데이터 자동 로드 시도
                        loadFromDrive();
                    }
                },
            });
            gisInited = true;
            checkAuthSetup();
        }
    }
    window.gsiLoaded = gsiLoaded;

    function checkAuthSetup() {
        if (gapiInited && gisInited) {
            if (syncStatus && syncStatus.innerText.includes("로드")) {
                syncStatus.innerText = "구글 계정을 연결하여 자동 백업을 활성화하세요.";
            }
        }
    }

    if (authBtn) {
        authBtn.addEventListener('click', () => {
            if (tokenClient) {
                // 권한 요청 팝업 띄우기
                tokenClient.requestAccessToken({ prompt: 'consent' });
            } else {
                syncStatus.innerText = "구글 라이브러리를 준비 중입니다. 잠시 후 다시 시도해주세요.";
            }
        });
    }

    if (syncBtn) {
        syncBtn.addEventListener('click', () => {
            syncToDrive();
        });
    }

    // 드라이브에 저장 (Sync)
    async function syncToDrive() {
        if (!accessToken) return;
        if (syncStatus) syncStatus.innerText = "☁️ 드라이브에 동기화 중...";

        try {
            const allData = {
                appData: JSON.parse(localStorage.getItem(STORAGE_KEY)) || getDefaultData(),
                settings: JSON.parse(localStorage.getItem(SETTINGS_KEY)) || { appTitle: 'Planner' }
            };
            const fileContent = JSON.stringify(allData);
            const file = new Blob([fileContent], { type: 'application/json' });

            // 1. 기존 파일 검색
            const response = await gapi.client.drive.files.list({
                q: `name='${DRIVE_FILE_NAME}' and trashed=false`,
                spaces: 'drive',
                fields: 'files(id, name)'
            });
            const files = response.result.files;

            const metadata = {
                name: DRIVE_FILE_NAME,
                mimeType: 'application/json'
            };

            const form = new FormData();
            form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
            form.append('file', file);

            let fetchOptions = {
                method: 'POST',
                headers: { 'Authorization': 'Bearer ' + accessToken },
                body: form
            };
            let url = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

            if (files && files.length > 0) {
                // 기존 파일 덮어쓰기 (PATCH)
                const fileId = files[0].id;
                fetchOptions.method = 'PATCH';
                url = `https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=multipart`;
            }

            const res = await fetch(url, fetchOptions);
            if (res.ok) {
                if (syncStatus) syncStatus.innerText = "✅ 백업 완료!";
                alert('모든 데이터가 구글 드라이브에 성공적으로 저장되었습니다!');
            } else {
                throw new Error('Upload failed');
            }
        } catch (err) {
            console.error(err);
            if (syncStatus) syncStatus.innerText = "❌ 동기화 실패. 다시 시도해주세요.";
        }
    }

    // 드라이브에서 불러오기 (Load)
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
                const fileRes = await gapi.client.drive.files.get({
                    fileId: fileId,
                    alt: 'media'
                });

                const cloudData = fileRes.result;
                if (cloudData && cloudData.appData) {
                    if (confirm("구글 드라이브에 백업된 데이터가 있습니다. 불러오시겠습니까?\n(현재 기기의 데이터는 덮어씌워집니다)")) {
                        localStorage.setItem(STORAGE_KEY, JSON.stringify(cloudData.appData));
                        if (cloudData.settings) {
                            localStorage.setItem(SETTINGS_KEY, JSON.stringify(cloudData.settings));
                            userSettings = cloudData.settings;
                            if (mainTitle) mainTitle.innerText = userSettings.appTitle;
                        }
                        appData = cloudData.appData;
                        renderPlanner();
                        alert("클라우드 데이터를 성공적으로 불러왔습니다!");
                    }
                }
            }
        } catch (err) {
            console.error("데이터 로드 에러:", err);
        }
    }

    // 초기화를 보장하기 위해 수동 트리거 시도
    if (window.gapi) window.gapiLoaded();
    if (window.google) window.gsiLoaded();

    // ==========================================
    // 4. 데이터 및 요일 관리
    // ==========================================
    const today = new Date();

    function getDefaultData() {
        const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        const weekData = {};
        weekDays.forEach(day => {
            weekData[day] = {
                school: Array.from({ length: 8 }, (_, i) => ({
                    period: i + 1, subject: null, time: '', location: null, color: null, transit: 0
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
    // 5. 학교 1~8교시 인라인 텍스트 및 자습 계산
    // ==========================================
    function calculateFreeTime() {
        const dayData = appData.schedules[currentSelectedDay];
        if (!dayData) return;

        // 하루 자유 시간: 15시간 (900분)
        let totalMins = 900;

        if (currentSelectedDay !== 'Sat') {
            dayData.school.forEach(s => {
                if (s.subject) {
                    totalMins -= 50;
                    if (s.transit) totalMins -= parseInt(s.transit);
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

    const schoolSchedule = document.getElementById('schoolSchedule');
    const plannerTabEvening = document.getElementById('plannerTab');

    function renderPlanner() {
        calculateFreeTime();

        // 1. 학교 정규 시간표 렌더링 (1~8교시)
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

                    // 직접 타이핑할 수 있는 Input 필드로 변경 (1~8교시)
                    div.innerHTML = `
                        <div class="period-num" style="min-width:30px; font-weight:bold; color:var(--primary-color);">${item.period}</div>
                        <div style="flex-grow:1; display:flex; align-items:center;">
                            <input type="text" class="quick-input" placeholder="${item.period}교시 과목 입력" value="${item.subject || ''}" style="width:100%; border:none; background:transparent; font-size:15px; outline:none; font-family:inherit;">
                        </div>
                    `;

                    const inputElement = div.querySelector('input');
                    inputElement.addEventListener('input', (e) => {
                        item.subject = e.target.value.trim() || null;
                        item.color = "var(--color-kor)"; // Default
                        saveData();
                        calculateFreeTime(); // 타이핑 시 즉시 자습시간 업데이트
                    });

                    schoolSchedule.appendChild(div);
                });
            }
        }

        // 2. 저녁 학원 시간표 렌더링
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

            const clicker = document.createElement('div');
            clicker.className = 'evening-empty-clicker';
            clicker.innerHTML = `<span><span class="material-symbols-rounded" style="vertical-align:middle;margin-right:8px;font-size:20px;">add_circle</span>저녁(학원) 일정 추가</span>`;
            clicker.addEventListener('click', () => openPlannerModal('evening', -1, null));
            plannerTabEvening.appendChild(clicker);
        }

        // 3. 미션 리스트
        const renderList = (data, containerId, grpName) => {
            const container = document.getElementById(containerId);
            if (!container) return;
            container.innerHTML = '';
            if (data.length === 0) { container.innerHTML = `<div class="empty-state" style="padding:16px;">추가된 계획이 없습니다.</div>`; return; }
            data.forEach((m, idx) => {
                const li = document.createElement('li'); li.className = `mission-item ${m.done ? 'done' : ''}`;
                const icon = m.category === '운동' ? 'fitness_center' : (m.category === '읽기' ? 'auto_stories' : 'menu_book');

                li.innerHTML = `
                    <div class="mission-checkbox"><span class="material-symbols-rounded">check</span></div>
                    <div class="mission-content">
                        <span class="mission-text">${m.text}</span>
                        <div class="mission-meta">
                            <span class="meta-item"><span class="material-symbols-rounded" style="font-size:14px">${icon}</span>${m.category}</span>
                        </div>
                    </div>
                    <button class="mission-delete"><span class="material-symbols-rounded">close</span></button>
                `;

                li.addEventListener('click', (e) => {
                    if (e.target.closest('.mission-delete')) return;
                    if (e.target.closest('.mission-checkbox')) {
                        m.done = !m.done;
                        saveData(); renderPlanner();
                        return;
                    }
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
    // 6. 학원 및 미션 팝업 모달 관리
    // ==========================================
    const planModal = document.getElementById('addPlannerModal');
    let planTarget = 'evening';
    function openPlannerModal(type, idx, item) {
        planTarget = type;
        document.getElementById('plannerModalTitle').textContent = item ? '학원/방과후 변경' : '학원/방과후 추가';

        document.getElementById('inputPeriodIdx').value = idx;
        document.getElementById('inputSubject').value = item && item.subject ? item.subject : '';

        if (item && item.time) {
            const spl = item.time.split('-');
            document.getElementById('inputStartTime').value = spl[0] ? spl[0].trim() : '';
            document.getElementById('inputEndTime').value = spl[1] ? spl[1].trim() : '';
        } else {
            document.getElementById('inputStartTime').value = '18:00';
            document.getElementById('inputEndTime').value = '20:00';
        }
        document.getElementById('inputTransit').value = item && item.transit ? item.transit : '';
        document.getElementById('inputLocation').value = item && item.location ? item.location : '';

        if (item && item.color) { document.querySelectorAll('input[name="subjectColor"]').forEach(r => { if (r.value === item.color) r.checked = true; }); }
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

    const addHwBtn = document.getElementById('addHomeworkBtn');
    if (addHwBtn) addHwBtn.addEventListener('click', () => openMissionModal('homework', -1, null));
    const addExBtn = document.getElementById('addExerciseBtn');
    if (addExBtn) addExBtn.addEventListener('click', () => openMissionModal('exercise', -1, null));

    const missionModal = document.getElementById('addMissionModal');
    function openMissionModal(grp, idx, item) {
        document.getElementById('inputMissionGrp').value = grp;
        document.getElementById('inputMissionId').value = idx;
        document.getElementById('missionModalTitle').textContent = item ? '수정' : '추가';
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

    // 최하단 플로팅 액션 버튼(+)
    const mainFab = document.getElementById('mainFab');
    if (mainFab) {
        mainFab.addEventListener('click', () => {
            if (currentTab === 'planner') openPlannerModal('evening', -1, null);
            else document.getElementById('addFinanceModal').classList.add('show');
        });
    }

    // 렌더 실행
    renderPlanner();
});
