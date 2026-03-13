const GOOGLE_CLIENT_ID = '1059241393010-dhcs8fm43uqppd65m113eqj4jk8qk6dt.apps.googleusercontent.com';
const GOOGLE_API_KEY = 'AIzaSyBSmTQrvXqgFlReBfwGolfgSWlNLHU5_-s';

document.addEventListener('DOMContentLoaded', () => {
    // 
    // Google Cloud API (이곳에 키가 안전하게 등록되었습니다!)
    // =========================================================
    // ==========================================
    // 0. TAB NAVIGATION LOGIC (Spread)
    // ==========================================
    const navItems = document.querySelectorAll('.nav-item');
    const plannerTab = document.getElementById('plannerTab');
    const financeTab = document.getElementById('financeTab');
    const daySelector = document.getElementById('daySelector');
    const mainTitle = document.getElementById('mainTitle');
    const mainIcon = document.getElementById('mainIcon');
    let currentTab = 'planner';

    navItems.forEach(item => {
        item.addEventListener('click', () => {
            navItems.forEach(n => n.classList.remove('active'));
            item.classList.add('active');

            const target = item.dataset.tab;
            currentTab = target;

            if (target === 'planner') {
                plannerTab.style.display = 'flex';
                financeTab.style.display = 'none';
                daySelector.style.display = 'flex';
                mainTitle.innerText = 'Planner';
                mainIcon.innerText = 'edit_calendar';
            } else {
                plannerTab.style.display = 'none';
                financeTab.style.display = 'flex';
                daySelector.style.display = 'none';
                mainTitle.innerText = 'Finance';
                mainIcon.innerText = 'account_balance_wallet';
            }
        });
    });

    // ==========================================
    // 1. DATA PERSISTENCE & INITIALIZATION
    // ==========================================
    const STORAGE_KEY = 'study_planner_data_v5'; // Bumped for Saturday
    const today = new Date();

    const defaultFinanceData = { transactions: [] };
    function getDefaultWeekData() {
        const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']; // Added Saturday
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
        return { schedules: weekData, finance: defaultFinanceData };
    }

    let appData = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!appData) {
        let old = JSON.parse(localStorage.getItem('study_planner_data_v4')) || JSON.parse(localStorage.getItem('study_planner_data_v3'));
        appData = getDefaultWeekData();
        if (old) {
            // Merge logic carefully
            appData.finance = old.finance || defaultFinanceData;
            Object.keys(old.schedules || {}).forEach(day => {
                if (appData.schedules[day]) {
                    appData.schedules[day] = old.schedules[day];
                }
            });
        }
        saveData();
    }

    function saveData() { localStorage.setItem(STORAGE_KEY, JSON.stringify(appData)); }

    // ==========================================
    // 2. PLANNER LOGIC (Saturday handled)
    // ==========================================
    const weekDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const korDays = ['월', '화', '수', '목', '금', '토'];
    const currentDayOfWeek = today.getDay(); // 0 is Sun, 6 is Sat
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
        if (day === 'Sat') btn.classList.add('sat'); // Blue styling for Saturday

        btn.innerHTML = `<span class="day-name">${korDays[index]}</span><span class="date-num">${dateNum}</span>`;
        btn.addEventListener('click', () => {
            document.querySelector('.day-btn.active').classList.remove('active');
            btn.classList.add('active');
            currentSelectedDay = day;
            renderPlanner();
        });
        daySelector.appendChild(btn);
    });

    const schoolSection = document.getElementById('schoolSection');
    const schoolList = document.getElementById('schoolList');
    const transitDivider = document.getElementById('transitDivider');
    const eveningBlocks = document.getElementById('eveningBlocks');

    function calculateFreeTime() {
        let totalMins = 900;
        const dayData = appData.schedules[currentSelectedDay];
        if (currentSelectedDay !== 'Sat') {
            dayData.school.forEach(s => { if (s.subject) { totalMins -= 50; if (s.transit) totalMins -= parseInt(s.transit); } });
        }
        dayData.evening.forEach(s => {
            try {
                const [st, et] = s.time.split('-');
                if (st && et) {
                    const [sh, sm] = st.trim().split(':'); const [eh, em] = et.trim().split(':');
                    totalMins -= ((Number(eh) * 60 + Number(em)) - (Number(sh) * 60 + Number(sm)));
                }
            } catch (e) { }
            if (s.transit) totalMins -= parseInt(s.transit);
        });
        if (totalMins < 0) totalMins = 0;
        document.getElementById('freeTimeDisplay').innerText = `${Math.floor(totalMins / 60)}시간 ${totalMins % 60}분`;
    }

    // ================== Planner UI Renderer ================== //
    function renderPlanner() {
        calculateFreeTime();

        // Handle Saturday Holiday visibility
        if (currentSelectedDay === 'Sat') {
            schoolSection.style.display = 'none';
            transitDivider.style.display = 'none';
        } else {
            schoolSection.style.display = 'block';
            transitDivider.style.display = 'flex';

            // Render School list
            schoolList.innerHTML = '';
            appData.schedules[currentSelectedDay].school.forEach((item, index) => {
                if (item.subject && item.transit > 0) {
                    const tr = document.createElement('div'); tr.className = 'transit-block';
                    tr.innerHTML = `<span class="material-symbols-rounded">directions_bus</span><span>이동 중</span><span class="transit-time">${item.transit}분</span>`;
                    schoolList.appendChild(tr);
                }
                const div = document.createElement('div');
                if (item.subject) {
                    div.className = 'period-item'; div.style.cursor = 'pointer';
                    div.style.borderLeft = `6px solid ${item.color}`;
                    div.style.background = `linear-gradient(90deg, ${item.color}08 0%, var(--surface-color) 40%)`;
                    div.innerHTML = `<div class="period-num">${item.period}</div>
                        <div class="period-details">
                            <div class="period-header"><span class="period-subject">${item.subject}</span>
                                <button class="icon-btn delete-btn" style="width:32px;height:32px;padding:4px;box-shadow:none;border:none;"><span class="material-symbols-rounded" style="color:#EF4444;font-size:20px;">delete</span></button>
                            </div>
                            <div class="period-meta"><div class="meta-item"><span class="material-symbols-rounded">schedule</span>${item.time}</div><div class="meta-item"><span class="material-symbols-rounded">location_on</span>${item.location || ''}</div></div>
                        </div>`;
                    div.querySelector('.delete-btn').addEventListener('click', (e) => {
                        e.stopPropagation();
                        if (confirm(`삭제하시겠습니까?`)) { appData.schedules[currentSelectedDay].school[index] = { period: item.period, subject: null, transit: 0 }; saveData(); renderPlanner(); }
                    });
                    div.addEventListener('click', () => openPlannerModal('school', index, item));
                } else {
                    div.className = 'period-item period-empty';
                    div.innerHTML = `<div class="period-num">${item.period}</div><div class="add-slot-content"><span class="material-symbols-rounded">add_circle</span><span>${item.period}교시 추가</span></div>`;
                    div.addEventListener('click', () => openPlannerModal('school', index, item));
                }
                schoolList.appendChild(div);
            });
        }

        // 2. Evening Rendering
        eveningBlocks.innerHTML = '';
        const evData = appData.schedules[currentSelectedDay].evening;

        evData.forEach((item, index) => {
            if (item.transit > 0) {
                const tr = document.createElement('div'); tr.className = 'transit-block';
                tr.innerHTML = `<span class="material-symbols-rounded">directions_bus</span><span>이동 중</span><span class="transit-time">${item.transit}분 소요</span>`;
                eveningBlocks.appendChild(tr);
            }
            const div = document.createElement('div'); div.className = 'period-item'; div.style.cursor = 'pointer';
            div.style.borderLeft = `6px solid ${item.color}`;
            div.innerHTML = `<div class="period-details">
                <div class="period-header"><span class="period-subject">${item.subject}</span>
                    <button class="icon-btn Dlt" style="width:32px;height:32px;padding:4px;border:none;box-shadow:none;"><span class="material-symbols-rounded" style="color:#EF4444;font-size:20px;">delete</span></button>
                </div>
                <div class="period-meta" style="margin-top:4px;"><div class="meta-item"><span class="material-symbols-rounded">schedule</span>${item.time}</div><div class="meta-item"><span class="material-symbols-rounded">location_on</span>${item.location || ''}</div></div>
            </div>`;
            div.querySelector('.Dlt').addEventListener('click', (e) => { e.stopPropagation(); if (confirm('삭제하시겠습니까?')) { evData.splice(index, 1); saveData(); renderPlanner(); } });
            div.addEventListener('click', () => openPlannerModal('evening', index, item));
            eveningBlocks.appendChild(div);
        });

        // Add the empty clicker at the bottom
        const clicker = document.createElement('div');
        clicker.className = 'evening-empty-clicker';
        clicker.innerHTML = `<span><span class="material-symbols-rounded" style="vertical-align:middle;margin-right:8px;font-size:20px;">add_circle</span>여기를 눌러 학원/저녁 일정을 추가하세요</span>`;
        clicker.addEventListener('click', () => openPlannerModal('evening', -1, null));
        eveningBlocks.appendChild(clicker);

        // 3. Missions
        const renderList = (data, containerId, grpName) => {
            const container = document.getElementById(containerId); container.innerHTML = '';
            if (data.length === 0) { container.innerHTML = `<div class="empty-state" style="padding:16px;">등록된 플랜이 없습니다.</div>`; return; }
            data.forEach((m, idx) => {
                const li = document.createElement('li'); li.className = `mission-item ${m.done ? 'done' : ''}`;
                let starsHTML = '';
                if (m.rating && m.rating > 0 && m.done) {
                    starsHTML = `<div style="color: #F59E0B; font-size:1.1rem; display:flex; align-items:center; margin-top:2px;">` + Array(Number(m.rating)).fill('★').join('') + `</div>`;
                }

                const catIconsList = { '공부': 'menu_book', '운동': 'fitness_center', '읽기': 'auto_stories', '기타': 'more_horiz' };
                const icon = catIconsList[m.category] || 'chevron_right';

                li.innerHTML = `
                    <div class="mission-checkbox"><span class="material-symbols-rounded">check</span></div>
                    <div class="mission-content">
                        <span class="mission-text">${m.text}</span>
                        <div class="mission-meta">
                            <span class="meta-item"><span class="material-symbols-rounded" style="font-size:14px">${icon}</span>${m.category}</span>
                            ${m.timeEst ? `<span class="meta-item"><span class="material-symbols-rounded" style="font-size:14px">timer</span>${m.timeEst}</span>` : ''}
                        </div>
                        ${starsHTML}
                    </div>
                    <div class="mission-badge">참 잘했어요!</div>
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
    // 3. MODALS LOGIC
    // ==========================================
    const planModal = document.getElementById('addPlannerModal');
    let planTarget = 'school';
    function openPlannerModal(type, idx, item) {
        planTarget = type;
        document.getElementById('plannerModalTitle').textContent = type === 'school'
            ? (item.subject ? `${item.period}교시 변경` : `${item.period}교시 추가`)
            : (item ? '학원/방과후 변경' : '학원/방과후 추가');

        document.getElementById('inputPeriodIdx').value = idx;
        document.getElementById('inputSubject').value = item && item.subject ? item.subject : '';

        // Handle split time
        if (item && item.time) {
            const spl = item.time.split('-');
            document.getElementById('inputStartTime').value = spl[0] ? spl[0].trim() : '';
            document.getElementById('inputEndTime').value = spl[1] ? spl[1].trim() : '';
        } else {
            document.getElementById('inputStartTime').value = type === 'school' ? '09:00' : '18:00';
            document.getElementById('inputEndTime').value = type === 'school' ? '09:50' : '20:00';
        }

        document.getElementById('inputTransit').value = item && item.transit ? item.transit : '';
        document.getElementById('inputLocation').value = item && item.location ? item.location : '';

        if (item && item.color) {
            document.querySelectorAll('input[name="subjectColor"]').forEach(r => { if (r.value === item.color) r.checked = true; });
        }
        planModal.classList.add('show');
    }

    document.getElementById('scheduleForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const idx = parseInt(document.getElementById('inputPeriodIdx').value);
        const subject = document.getElementById('inputSubject').value;
        const color = document.querySelector('input[name="subjectColor"]:checked').value;
        const stTimeStr = document.getElementById('inputStartTime').value;
        const enTimeStr = document.getElementById('inputEndTime').value;
        const formattedTime = `${stTimeStr} - ${enTimeStr}`;

        const payload = {
            subject, color, time: formattedTime,
            location: document.getElementById('inputLocation').value,
            transit: parseInt(document.getElementById('inputTransit').value) || 0
        };

        if (planTarget === 'school') {
            payload.period = idx + 1;
            appData.schedules[currentSelectedDay].school[idx] = payload;
        } else {
            if (idx > -1) { appData.schedules[currentSelectedDay].evening[idx] = payload; }
            else { appData.schedules[currentSelectedDay].evening.push(payload); }
        }
        saveData(); renderPlanner(); planModal.classList.remove('show');
    });

    // -------- Mission Modal Logic --------
    const missionModal = document.getElementById('addMissionModal');
    const missionForm = document.getElementById('missionForm');
    const evalGroup = document.getElementById('evaluationGroup');
    const stars = document.querySelectorAll('.star-btn');

    function updateStarsUI(val) {
        stars.forEach(s => s.classList.remove('active'));
        if (val && val > 0) {
            for (let i = 0; i < val; i++) stars[i].classList.add('active');
        }
        document.getElementById('inputMissionRating').value = val || 0;
    }

    stars.forEach(s => { s.addEventListener('click', () => updateStarsUI(s.dataset.val)); });

    function openMissionModal(grp, idx, item) {
        document.getElementById('inputMissionGrp').value = grp;
        document.getElementById('inputMissionId').value = idx;

        document.getElementById('missionModalTitle').textContent = item ? '미션 상세 / 평가' : '데일리 미션 추가';
        document.getElementById('inputMissionText').value = item ? item.text : '';
        document.getElementById('inputMissionTime').value = item ? (item.timeEst || '') : '';

        if (item && item.category) {
            document.querySelectorAll('input[name="missCategory"]').forEach(r => { if (r.value === item.category) r.checked = true; });
        }

        if (item && item.done) {
            evalGroup.style.display = 'block';
            updateStarsUI(item.rating);
        } else {
            evalGroup.style.display = 'none';
            updateStarsUI(0);
        }
        missionModal.classList.add('show');
    }

    document.getElementById('addHomeworkBtn').addEventListener('click', () => openMissionModal('homework', -1, null));
    document.getElementById('addExerciseBtn').addEventListener('click', () => openMissionModal('exercise', -1, null));

    missionForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const grp = document.getElementById('inputMissionGrp').value;
        const idx = parseInt(document.getElementById('inputMissionId').value);
        const text = document.getElementById('inputMissionText').value;
        const timeEst = document.getElementById('inputMissionTime').value;
        const category = document.querySelector('input[name="missCategory"]:checked').value;
        const rating = parseInt(document.getElementById('inputMissionRating').value);

        if (idx > -1) {
            let m = appData.schedules[currentSelectedDay].missions[grp][idx];
            m.text = text; m.timeEst = timeEst; m.category = category;
            if (m.done) m.rating = rating;
        } else {
            appData.schedules[currentSelectedDay].missions[grp].push({
                text, timeEst, category, done: false, rating: 0
            });
        }
        saveData(); renderPlanner(); missionModal.classList.remove('show');
    });

    // ==========================================
    // 4. FAB & Close Handlers
    // ==========================================
    document.getElementById('mainFab').addEventListener('click', () => {
        if (currentTab === 'planner') {
            if (currentSelectedDay === 'Sat') {
                openPlannerModal('evening', -1, null);
            } else {
                const emptyIdx = appData.schedules[currentSelectedDay].school.findIndex(i => !i.subject);
                if (emptyIdx !== -1) openPlannerModal('school', emptyIdx, appData.schedules[currentSelectedDay].school[emptyIdx]);
                else openPlannerModal('evening', -1, null);
            }
        } else {
            openFinanceModal();
        }
    });

    document.querySelectorAll('.icon-btn').forEach(btn => {
        if (btn.id.includes('close')) btn.addEventListener('click', () => {
            planModal.classList.remove('show');
            document.getElementById('addFinanceModal').classList.remove('show');
            missionModal.classList.remove('show');
        });
    });

    // ==========================================
    // 5. FINANCE RENDER
    // ==========================================
    const financeAmountInput = document.getElementById('inputFinanceAmount');
    financeAmountInput.addEventListener('input', (e) => {
        let val = e.target.value.replace(/[^0-9]/g, '');
        if (val) val = Number(val).toLocaleString();
        e.target.value = val;
    });
    function renderFinance() {
        const txs = appData.finance.transactions || [];
        const txList = document.getElementById('transactionList');
        let inc = 0, exp = 0; txList.innerHTML = '';
        if (txs.length === 0) { txList.innerHTML = `<div class="empty-state">내역이 없습니다.</div>`; }
        else {
            txs.sort((a, b) => new Date(b.date) - new Date(a.date)).forEach((tx, idx) => {
                if (tx.type === 'income') inc += parseInt(tx.amount);
                if (tx.type === 'expense') exp += parseInt(tx.amount);
                const sign = tx.type === 'income' ? '+' : '-';
                const cMap = { '식비': 'restaurant', '교통': 'directions_bus', '교재': 'book', '취미': 'sports_esports', '용돈': 'payments', '보너스': 'redeem', '기타': 'more_horiz' };
                const amC = tx.type === 'income' ? 'txt-blue' : 'txt-red';
                const item = document.createElement('div'); item.className = 't-item';
                item.innerHTML = `<div class="t-icon"><span class="material-symbols-rounded">${cMap[tx.category] || 'sell'}</span></div><div class="t-details"><span class="t-title">${tx.title}</span><span class="t-date">${tx.date} | ${tx.category}</span></div><div class="t-amount ${amC}">${sign}${Number(tx.amount).toLocaleString()}원</div><button class="t-delete"><span class="material-symbols-rounded">delete</span></button>`;
                item.addEventListener('click', (e) => {
                    if (e.target.closest('.t-delete')) {
                        if (confirm(`정말로 삭제하시겠습니까?`)) { txs.splice(idx, 1); saveData(); renderFinance(); }
                        return;
                    }
                    openFinanceModal(tx, idx);
                });
                txList.appendChild(item);
            });
        }
        document.getElementById('totalIncomeDisplay').innerText = Number(inc).toLocaleString() + '원';
        document.getElementById('totalExpenseDisplay').innerText = Number(exp).toLocaleString() + '원';
        document.getElementById('totalBalanceDisplay').innerText = Number(inc - exp).toLocaleString() + '원';
    }

    function openFinanceModal(tx = null, idx = -1) {
        document.getElementById('inputFinanceId').value = idx;
        document.getElementById('financeModalTitle').innerText = tx ? '내역 수정' : '내역 추가';

        document.getElementById('inputFinanceDate').value = tx ? tx.date : today.toISOString().split('T')[0];
        document.getElementById('inputFinanceAmount').value = tx ? Number(tx.amount).toLocaleString() : '';
        document.getElementById('inputFinanceTitle').value = tx ? tx.title : '';

        const type = tx ? tx.type : 'expense';
        document.querySelector(`input[name="financeType"][value="${type}"]`).checked = true;
        document.querySelector(`input[name="financeType"][value="${type}"]`).dispatchEvent(new Event('change'));

        if (tx && tx.category) {
            const catName = type === 'expense' ? 'finCategory' : 'finCategoryInc';
            const catRadio = document.querySelector(`input[name="${catName}"][value="${tx.category}"]`);
            if (catRadio) catRadio.checked = true;
        }

        document.getElementById('addFinanceModal').classList.add('show');
    }

    document.getElementById('financeForm').addEventListener('submit', (e) => {
        e.preventDefault();
        const idxVal = document.getElementById('inputFinanceId').value;
        const idx = parseInt(idxVal, 10);

        const type = document.querySelector('input[name="financeType"]:checked').value;
        const cat = document.querySelector(type === 'expense' ? 'input[name="finCategory"]:checked' : 'input[name="finCategoryInc"]:checked').value;

        const rawAmount = document.getElementById('inputFinanceAmount').value.replace(/,/g, '');
        const numAmount = parseInt(rawAmount, 10);
        if (isNaN(numAmount)) return;

        const payload = { id: Date.now(), type, date: document.getElementById('inputFinanceDate').value, amount: numAmount, title: document.getElementById('inputFinanceTitle').value, category: cat };

        if (idx > -1) {
            appData.finance.transactions[idx] = payload;
        } else {
            appData.finance.transactions.push(payload);
        }

        saveData(); renderFinance(); document.getElementById('addFinanceModal').classList.remove('show');
    });

    document.querySelectorAll('input[name="financeType"]').forEach(r => {
        r.addEventListener('change', (e) => {
            if (e.target.value === 'expense') {
                document.getElementById('toggleExpense').classList.add('active'); document.getElementById('toggleIncome').classList.remove('active');
                document.getElementById('expenseCategoryGroup').style.display = 'block'; document.getElementById('incomeCategoryGroup').style.display = 'none';
            } else {
                document.getElementById('toggleIncome').classList.add('active'); document.getElementById('toggleExpense').classList.remove('active');
                document.getElementById('incomeCategoryGroup').style.display = 'block'; document.getElementById('expenseCategoryGroup').style.display = 'none';
            }
        });
    });

    // ==========================================
    // 6. SETTINGS & APP TITLE LOGIC
    // ==========================================
    const SETTINGS_KEY = 'study_planner_settings_v1';
    let userSettings = JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {
        darkMode: false,
        monthlyBudget: 0,
        appTitle: 'Planner'
    };
    function saveSettings() { localStorage.setItem(SETTINGS_KEY, JSON.stringify(userSettings)); }

    // Title Logic
    function updateTitleDisplay() { mainTitle.innerText = userSettings.appTitle; }
    updateTitleDisplay();

    // Settings Modal functionality
    const settingsModal = document.getElementById('settingsModal');
    const settingsTitleInput = document.getElementById('settingsTitleInput');

    // Logo area clicks also open settings
    const logoArea = document.getElementById('logoArea');
    if (logoArea) {
        logoArea.addEventListener('click', openSettingsModal);
    }

    document.getElementById('settingsBtn').addEventListener('click', openSettingsModal);

    function openSettingsModal() {
        settingsTitleInput.value = userSettings.appTitle || 'Planner';
        settingsModal.classList.add('show');

        // Handle Google Login UI rendering if not logged in
        if (!isGoogleLoggedIn && window.google) {
            google.accounts.id.initialize({
                client_id: GOOGLE_CLIENT_ID,
                callback: handleGoogleLoginSuccess
            });
            google.accounts.id.renderButton(
                document.getElementById("googleLoginBtnContainer"),
                { theme: "outline", size: "large", width: 300 } // customization attributes
            );
        }
    }

    // Fallback custom button if GSI fails to auto-render (optional standard trigger)
    const customGoogleLoginBtn = document.getElementById('customGoogleLoginBtn');
    if (customGoogleLoginBtn) {
        customGoogleLoginBtn.addEventListener('click', () => {
            // In a real app, this might trigger the OAuth popup directly or GSI library handles it via renderButton.
            alert('Google Identity Services 버튼을 초기화하는 중입니다.');
        });
    }

    function handleGoogleLoginSuccess(response) {
        // 성공 시 JWT credential 파싱 및 상태 업데이트 로직
        console.log("Encoded JWT ID token: " + response.credential);
        isGoogleLoggedIn = true;

        document.getElementById('googleLoginBtnContainer').style.display = 'none';
        document.getElementById('googleBackupContainer').style.display = 'block';
    }

    const googleBackupBtn = document.getElementById('googleBackupBtn');
    if (googleBackupBtn) {
        googleBackupBtn.addEventListener('click', () => {
            alert('구글 드라이브에 동기화를 시작합니다');
            // 향후 gapi.client.drive 등을 사용하여 파일 업로드 로직 추가
        });
    }

    settingsTitleInput.addEventListener('input', (e) => {
        const newTitle = e.target.value.trim() || 'Planner';
        userSettings.appTitle = newTitle;
        updateTitleDisplay();
        saveSettings();
    });

    document.getElementById('closeSettingsBtn').addEventListener('click', () => {
        settingsModal.classList.remove('show');
    });

    // ==========================================
    // 7. SERVICE WORKER FOR PWA
    // ==========================================
    if ('serviceWorker' in navigator) {
        window.addEventListener('load', () => {
            navigator.serviceWorker.register('./sw.js')
                .then(reg => console.log('Service Worker Registered!', reg))
                .catch(err => console.error('Service Worker Registration Failed!', err));
        });
    }

    // Boot
    renderPlanner();
    renderFinance();
});
