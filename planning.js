/* ==========================================================================
   🗓️ ماژول مدیریت و پیکربندی برنامه‌ریزی (js/planning.js)
   متصل به تب ۳ اپلیکیشن (#tab-planning) و هماهنگ با حافظه مرکزی (AppState)
   ========================================================================== */

const PlanningModule = {
    daysArr: ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'],
    todayNameFa: '',
    renderDayFa: 'شنبه',
    isInitialScheduleLoad: true,
    hasCelebratedToday: false,

    // وضعیت پلیر صدا و تایمر
    timerInterval: null,
    startTimeout: null,
    currentTrack: 0,
    playbackMode: 'single',
    audioPlayer: new Audio(),
    playlist: [
        { name: 'صدای سفید تمرکز (White Noise)', url: 'https://etlutqwwqeahevsskjih.supabase.co/storage/v1/object/public/music/03-White-Noise-10min.mp3' },
        { name: 'باران آرامش‌بخش مطالعه', url: 'https://etlutqwwqeahevsskjih.supabase.co/storage/v1/object/public/music/unknown%20-%20OST%20(320).mp3' },
        { name: 'امواج ملایم ساحل', url: 'https://raw.githubusercontent.com/YoyoZhang24/RelaX50/main/audios/sea.mp3' }
    ],

    // متغیرهای پیکربندی VIP
    classCount: 0,
    selectedStartSubjects: [],
    selectedEndSubjects: [],
    selectedStrengths: [],
    selectedWeaknesses: [],

    // ======================================================================
    // 🧭 ۱. راه‌اندازی و سوییچ بین زیربخش‌های برنامه‌ریزی
    // ======================================================================
    init() {
        try {
            this.todayNameFa = new Intl.DateTimeFormat('fa-IR', { weekday: 'long' }).format(new Date());
            if (this.daysArr.includes(this.todayNameFa)) {
                this.renderDayFa = this.todayNameFa;
            }
        } catch (_) {
            this.todayNameFa = 'شنبه';
        }

        this.initAudio();

        if (AppState.currentScheduleObj) {
            this.determineRenderDay();
            this.renderTodayTab();
            this.setupWeekSelectorDropdown();
            this.updateWeeklyProgress();
            this.renderGCal();
        } else {
            const container = document.getElementById('questsContainer');
            if (container) {
                container.innerHTML = `
                    <div class="card-box" style="text-align:center; padding: 36px; color: var(--text-muted);">
                        <i data-lucide="calendar-clock" class="icon-xl" style="color:var(--primary); margin-bottom:10px;"></i>
                        <div style="font-weight:800; font-size:14px;">هنوز برنامه فعالی برای این هفته ثبت نشده است.</div>
                    </div>`;
            }
            this.showWeekEmptyState("هنوز هیچ برنامه‌ای برای شما ثبت نشده است.");
        }

        this.initRequestSubtab();
        this.populateVipSetupUI();
        UI.refreshIcons();
    },

    switchSubtab(subId, btnEl) {
        document.querySelectorAll('#tab-planning .subtab-btn').forEach(b => b.classList.remove('active'));
        if (btnEl) btnEl.classList.add('active');

        document.querySelectorAll('#tab-planning .sub-view').forEach(v => v.classList.remove('active'));
        const target = document.getElementById(`subtab-plan-${subId}`);
        if (target) target.classList.add('active');

        if (subId === 'week') {
            this.renderGCal();
        }

        UI.refreshIcons();
    },

    timeStrToMins(timeStr) {
        if (!timeStr) return 0;
        const parts = String(timeStr).split(':');
        return (parseInt(parts[0], 10) * 60) + (parseInt(parts[1], 10) || 0);
    },

    // ======================================================================
    // 🎯 ۲. عملیات امروز (Schedule & Quests)
    // ======================================================================
    determineRenderDay() {
        if (!AppState.currentScheduleObj || !AppState.currentScheduleObj.raw_plan) return;
        const planArr = Array.isArray(AppState.currentScheduleObj.raw_plan)
            ? AppState.currentScheduleObj.raw_plan
            : JSON.parse(AppState.currentScheduleObj.raw_plan || '[]');
        AppState.currentScheduleObj.raw_plan = planArr;

        let todayIdx = this.daysArr.indexOf(this.todayNameFa);
        if (todayIdx === -1) todayIdx = 6;

        for (let i = 0; i <= todayIdx; i++) {
            const dayTasks = planArr.filter(p =>
                p.day === this.daysArr[i] &&
                p.status === 'pending' &&
                p.subject !== 'بانک جبرانی' &&
                !String(p.subject).includes('ناهار') &&
                !String(p.subject).includes('شام') &&
                (p.type !== 'class' || p.topic === 'کلاس آنلاین')
            );
            if (dayTasks.length > 0) {
                this.renderDayFa = this.daysArr[i];
                break;
            }
        }
    },

    renderTodayTab() {
        if (!AppState.currentScheduleObj) return;
        const planArr = AppState.currentScheduleObj.raw_plan || [];
        const container = document.getElementById('questsContainer');
        if (!container) return;
        container.innerHTML = '';

        // مدیریت پیام انگیزشی هوش مصنوعی
        const motivationBox = document.getElementById('aiMotivationBox');
        const motivationText = document.getElementById('aiMotivationText');
        if (AppState.currentScheduleObj.ai_motivations && motivationBox && motivationText) {
            const aiMotivations = typeof AppState.currentScheduleObj.ai_motivations === 'string'
                ? JSON.parse(AppState.currentScheduleObj.ai_motivations)
                : AppState.currentScheduleObj.ai_motivations;

            const todaysMessage = aiMotivations?.daily_motivations?.[this.renderDayFa];
            const uid = String(AppState.userId || '');
            if (todaysMessage && localStorage.getItem(`dismissed_daily_${uid}`) !== todaysMessage) {
                motivationText.innerText = todaysMessage;
                motivationBox.style.display = 'block';
            } else {
                motivationBox.style.display = 'none';
            }
        }

        const todaysBlocks = planArr.filter(p =>
            p.day === this.renderDayFa &&
            p.subject !== 'بانک جبرانی' &&
            !String(p.subject).includes('ناهار') &&
            !String(p.subject).includes('شام') &&
            (p.type !== 'class' || p.topic === 'کلاس آنلاین')
        );

        todaysBlocks.sort((a, b) => this.timeStrToMins(a.start_time) - this.timeStrToMins(b.start_time));
        const pendingTasks = todaysBlocks.filter(p => p.status === 'pending');

        if (todaysBlocks.length > 0 && pendingTasks.length === 0) {
            container.innerHTML = `
                <div class="card-box" style="text-align:center; padding: 34px 20px; background: var(--success-fade); border-color: var(--success);">
                    <i data-lucide="trophy" class="icon-xl" style="color:var(--success); margin-bottom:10px;"></i>
                    <h3 style="color: var(--success); margin-bottom: 6px; font-weight:900;">آفرین قهرمان!</h3>
                    <p style="color:var(--text-muted); font-size: 13px;">تمام مأموریت‌های ${this.renderDayFa} را تکمیل کردی.</p>
                </div>`;
            this.updateProgressBar();
            UI.refreshIcons();
            return;
        }

        if (todaysBlocks.length === 0) {
            container.innerHTML = `<div class="card-box" style="text-align:center; color:var(--text-muted); padding:34px;">امروز مأموریتی در برنامه ثبت نشده است.</div>`;
            this.updateProgressBar();
            return;
        }

        todaysBlocks.forEach(part => {
            if (part.status === 'shifted') return;
            const cardClass = part.status === 'completed' ? 'completed' : '';
            container.innerHTML += `
                <div class="quest-card ${cardClass}" id="card_${part.block_id}">
                    <div class="quest-info">
                        <div class="quest-time"><i data-lucide="clock" class="icon-sm" style="width:13px;height:13px;"></i> ${part.start_time} - ${part.end_time}</div>
                        <div class="quest-title">${part.subject}</div>
                        <div class="quest-desc">${part.topic || ''}</div>
                    </div>
                    <div class="quest-actions">
                        <button type="button" class="action-circle" onclick="PlanningModule.shiftQuest('${part.block_id}')" title="انتقال به بانک جبرانی">
                            <i data-lucide="refresh-cw" class="icon-sm"></i>
                        </button>
                        ${part.type !== 'class' ? `
                            <button type="button" class="action-circle" onclick="PlanningModule.openTimer('${part.subject}', '${part.topic || ''}', '${part.start_time}', '${part.end_time}')" title="تایمر تمرکز">
                                <i data-lucide="play" class="icon-sm"></i>
                            </button>
                        ` : ''}
                        <button type="button" class="action-circle btn-check" onclick="PlanningModule.toggleQuest('${part.block_id}')" title="انجام شد">
                            <i data-lucide="check" class="icon-sm"></i>
                        </button>
                    </div>
                </div>
            `;
        });

        this.updateProgressBar();
        this.isInitialScheduleLoad = false;
        UI.refreshIcons();
    },

    async toggleQuest(blockId) {
        if (!AppState.currentScheduleObj) return;
        const block = AppState.currentScheduleObj.raw_plan.find(p => p.block_id === blockId);
        if (!block) return;

        block.status = block.status === 'completed' ? 'pending' : 'completed';

        try {
            await this.savePlanToDB();
            this.updateProgressBar();
            this.renderTodayTab();
            this.updateWeeklyProgress();
        } catch (err) {
            block.status = block.status === 'completed' ? 'pending' : 'completed';
            UI.showToast('خطا در ذخیره وضعیت مأموریت در سرور.', 'error');
        }
    },

    shiftQuest(blockId) {
        if (!AppState.currentScheduleObj) return;
        const planArr = AppState.currentScheduleObj.raw_plan;
        const origIdx = planArr.findIndex(p => p.block_id === blockId);
        if (origIdx === -1) return;

        const origBlock = planArr[origIdx];
        const isOnlineClass = (origBlock.type === 'class' && origBlock.topic === 'کلاس آنلاین');

        UI.confirm(
            'انتقال به بانک جبرانی',
            isOnlineClass ? 'کلاس آنلاین را از دست دادید؟ به اولین باکس جبرانی منتقل شود؟' : 'این پارت مطالعه به اولین باکس جبرانی خالی منتقل شود؟',
            async () => {
                const duration = this.timeStrToMins(origBlock.end_time) - this.timeStrToMins(origBlock.start_time);
                const neededMakeups = (isOnlineClass && duration > 150) ? 2 : 1;
                const blockDayIdx = this.daysArr.indexOf(origBlock.day);

                const availableMakeups = [];
                for (let i = 0; i < planArr.length; i++) {
                    const p = planArr[i];
                    if (p.subject === "بانک جبرانی" && p.status === 'pending' && this.daysArr.indexOf(p.day) >= blockDayIdx) {
                        availableMakeups.push(i);
                    }
                }

                if (availableMakeups.length < neededMakeups) {
                    const benchClone = JSON.parse(JSON.stringify(origBlock));
                    benchClone.block_id = 'blk_bnch_' + Math.random().toString(36).substr(2, 6);
                    benchClone.day = 'bench';
                    benchClone.status = 'pending';
                    benchClone.is_benched = true;
                    planArr.push(benchClone);
                    origBlock.status = 'shifted';
                    UI.showToast('باکس جبرانی خالی نبود؛ این پارت به نیمکت ذخیره منتقل شد.', 'info');
                } else {
                    origBlock.status = 'shifted';
                    for (let i = 0; i < neededMakeups; i++) {
                        const mIdx = availableMakeups[i];
                        planArr[mIdx].subject = origBlock.subject + (neededMakeups > 1 ? ` (بخش ${i + 1})` : " (جبرانی)");
                        planArr[mIdx].topic = origBlock.topic;
                        planArr[mIdx].type = origBlock.type;
                    }
                    UI.showToast('پارت با موفقیت به باکس جبرانی هفتگی منتقل شد.', 'success');
                }

                try {
                    await this.savePlanToDB();
                    this.updateProgressBar();
                    this.renderTodayTab();
                    this.updateWeeklyProgress();
                } catch (_) {
                    UI.showToast('خطا در بروزرسانی برنامه در سرور.', 'error');
                }
            }
        );
    },

    async savePlanToDB() {
        const { error } = await supabaseClient
            .from('ai_schedules')
            .update({ raw_plan: AppState.currentScheduleObj.raw_plan })
            .eq('id', AppState.currentScheduleObj.id);
        if (error) throw error;
    },

    updateProgressBar() {
        if (!AppState.currentScheduleObj || !AppState.currentScheduleObj.raw_plan) return;
        const activeToday = AppState.currentScheduleObj.raw_plan.filter(p =>
            p.day === this.renderDayFa &&
            p.subject !== 'بانک جبرانی' &&
            !String(p.subject).includes('ناهار') &&
            !String(p.subject).includes('شام') &&
            (p.type !== 'class' || p.topic === 'کلاس آنلاین') &&
            p.status !== 'shifted' &&
            p.day !== 'bench'
        );

        const completedToday = activeToday.filter(p => p.status === 'completed');
        const percent = activeToday.length > 0 ? Math.round((completedToday.length / activeToday.length) * 100) : 0;

        const progressText = document.getElementById('progressText');
        const progressBar = document.getElementById('progressBar');
        const homeProg = document.getElementById('homeTodayProgress');

        if (progressText) progressText.innerText = `${percent}%`;
        if (progressBar) progressBar.style.width = `${percent}%`;
        if (homeProg) homeProg.innerText = `${percent.toLocaleString('fa-IR')}٪`;

        if (percent === 100 && activeToday.length > 0 && !this.isInitialScheduleLoad && !this.hasCelebratedToday) {
            this.hasCelebratedToday = true;
            UI.openModal('celebrationModal');
            if (window.confetti) {
                confetti({ particleCount: 160, spread: 90, origin: { y: 0.6 } });
            }
        } else if (percent < 100) {
            this.hasCelebratedToday = false;
        }
    },

    dismissDailyMotivation() {
        const msgText = document.getElementById('aiMotivationText')?.innerText || '';
        const uid = String(AppState.userId || '');
        localStorage.setItem(`dismissed_daily_${uid}`, msgText);
        const box = document.getElementById('aiMotivationBox');
        if (box) box.style.display = 'none';
    },

    dismissWeeklyMotivation() {
        const msgText = document.getElementById('aiWeeklyMotivationText')?.innerText || '';
        const uid = String(AppState.userId || '');
        if (AppState.currentScheduleObj) {
            localStorage.setItem(`dismissed_weekly_${uid}_${AppState.currentScheduleObj.id}`, msgText);
        }
        const box = document.getElementById('aiWeeklyMotivationBox');
        if (box) box.style.display = 'none';
    },

    // ======================================================================
    // ⏱️ ۳. تایمر تمرکز، تنفس و پخش‌کننده موسیقی محیطی
    // ======================================================================
    initAudio() {
        this.audioPlayer.onended = () => {
            if (this.playbackMode === 'playlist') {
                this.nextMusic();
            } else {
                this.audioPlayer.play().catch(() => {});
            }
        };
    },

    openTimer(subject, topic, startTime, endTime) {
        UI.openModal('timerModal');
        const breathStage = document.getElementById('breathContainer');
        const timerDisplay = document.getElementById('timerDisplay');
        const subjectHeader = document.getElementById('timerSubjectName');
        const musicLabel = document.getElementById('musicTrackName');

        if (breathStage) breathStage.style.display = 'flex';
        if (timerDisplay) timerDisplay.style.display = 'none';
        if (subjectHeader) {
            subjectHeader.innerHTML = `
                <div style="color:var(--primary); font-size: 17px; font-weight:900;">${subject}</div>
                <div style="color:var(--text-muted); font-size: 12.5px;">${topic || ''}</div>`;
        }
        if (musicLabel) musicLabel.innerText = this.playlist[this.currentTrack].name;

        const circle = document.getElementById('breathCircle');
        const bText = document.getElementById('breathText');
        if (bText) bText.innerText = 'نفس عمیق...';
        if (circle) {
            setTimeout(() => { circle.style.transform = 'scale(1.35)'; }, 100);
            setTimeout(() => {
                circle.style.transform = 'scale(0.85)';
                if (bText) bText.innerText = 'رها کن...';
            }, 2400);
        }

        clearTimeout(this.startTimeout);
        clearInterval(this.timerInterval);

        this.startTimeout = setTimeout(() => {
            if (breathStage) breathStage.style.display = 'none';
            if (timerDisplay) timerDisplay.style.display = 'block';

            let t = (this.timeStrToMins(endTime) - this.timeStrToMins(startTime)) * 60;
            if (t <= 0) t = 50 * 60;

            this.timerInterval = setInterval(() => {
                t--;
                const min = String(Math.floor(t / 60)).padStart(2, '0');
                const sec = String(t % 60).padStart(2, '0');
                if (timerDisplay) timerDisplay.innerText = `${min}:${sec}`;

                if (t <= 0) {
                    clearInterval(this.timerInterval);
                    UI.showToast('خسته نباشی! زمان این پارت مطالعه به پایان رسید.', 'success');
                    this.closeTimer();
                }
            }, 1000);
        }, 4800);
    },

    closeTimer() {
        clearTimeout(this.startTimeout);
        clearInterval(this.timerInterval);
        this.audioPlayer.pause();
        const circle = document.getElementById('breathCircle');
        if (circle) circle.style.transform = 'scale(1)';
        UI.closeModals();
    },

    toggleMusic() {
        if (!this.audioPlayer.src || this.audioPlayer.src === window.location.href) {
            this.audioPlayer.src = this.playlist[this.currentTrack].url;
            const musicLabel = document.getElementById('musicTrackName');
            if (musicLabel) musicLabel.innerText = this.playlist[this.currentTrack].name;
        }

        const btn = document.getElementById('playPauseBtn');
        if (this.audioPlayer.paused) {
            this.audioPlayer.play().then(() => {
                if (btn) btn.innerHTML = '<i data-lucide="pause" class="icon"></i>';
                UI.refreshIcons();
            }).catch(() => {});
        } else {
            this.audioPlayer.pause();
            if (btn) btn.innerHTML = '<i data-lucide="play" class="icon"></i>';
            UI.refreshIcons();
        }
    },

    toggleLoopMode() {
        const btn = document.getElementById('loopModeBtn');
        if (this.playbackMode === 'single') {
            this.playbackMode = 'playlist';
            if (btn) btn.innerHTML = '<i data-lucide="repeat" class="icon-sm"></i>';
        } else {
            this.playbackMode = 'single';
            if (btn) btn.innerHTML = '<i data-lucide="repeat-1" class="icon-sm"></i>';
        }
        UI.refreshIcons();
    },

    changeTrack() {
        const wasPlaying = !this.audioPlayer.paused;
        this.audioPlayer.src = this.playlist[this.currentTrack].url;
        const musicLabel = document.getElementById('musicTrackName');
        if (musicLabel) musicLabel.innerText = this.playlist[this.currentTrack].name;
        if (wasPlaying) this.audioPlayer.play().catch(() => {});
    },

    nextMusic() {
        this.currentTrack = (this.currentTrack + 1) % this.playlist.length;
        this.changeTrack();
    },

    prevMusic() {
        this.currentTrack = (this.currentTrack - 1 + this.playlist.length) % this.playlist.length;
        this.changeTrack();
    },

    // ======================================================================
    // 📅 ۴. تقویم گرافیکی هفته (Week Grid & GCal)
    // ======================================================================
    setupWeekSelectorDropdown() {
        const container = document.getElementById('weekDropdownContainer');
        if (!container || !AppState.allSchedules || AppState.allSchedules.length === 0) return;

        const currentLabel = AppState.currentScheduleObj?.week_label || 'هفته جاری';
        const itemsHtml = AppState.allSchedules.map(sch => `
            <div class="custom-select-item ${sch.id === AppState.currentScheduleObj?.id ? 'selected' : ''}"
                 onclick="PlanningModule.selectScheduleWeek('${sch.id}', '${sch.week_label || 'برنامه هفته'}', this)">
                <span>${sch.week_label || 'برنامه هفته'}</span>
                <i data-lucide="check" class="icon-sm"></i>
            </div>
        `).join('');

        container.innerHTML = `
            <div class="custom-select-wrap" id="weekSelectWrap" style="margin-bottom:0;">
                <div class="custom-select-trigger" onclick="UI.toggleDropdown('weekSelectWrap', event)">
                    <span id="weekSelectLabel">${currentLabel}</span>
                    <i data-lucide="chevron-down" class="icon-sm"></i>
                </div>
                <div class="custom-select-menu">${itemsHtml}</div>
            </div>
        `;
        UI.refreshIcons();
    },

    selectScheduleWeek(schId, label, el) {
        AppState.currentScheduleObj = (AppState.allSchedules || []).find(s => s.id === schId) || AppState.currentScheduleObj;
        const lbl = document.getElementById('weekSelectLabel');
        if (lbl) lbl.innerText = label;

        const wrap = document.getElementById('weekSelectWrap');
        if (wrap) wrap.classList.remove('open');

        this.updateWeeklyProgress();
        this.renderGCal();
        this.renderTodayTab();
    },

    updateWeeklyProgress() {
        const progressBox = document.getElementById('weeklyProgressBox');
        if (!progressBox) return;

        if (!AppState.currentScheduleObj || !AppState.currentScheduleObj.raw_plan) {
            progressBox.style.display = 'none';
            return;
        }

        const planArr = typeof AppState.currentScheduleObj.raw_plan === 'string'
            ? JSON.parse(AppState.currentScheduleObj.raw_plan)
            : AppState.currentScheduleObj.raw_plan;

        const taskBlocks = planArr.filter(p =>
            p.type !== 'break' &&
            p.subject !== 'بانک جبرانی' &&
            !String(p.subject).includes('ناهار') &&
            !String(p.subject).includes('شام') &&
            (p.type !== 'class' || p.topic === 'کلاس آنلاین') &&
            p.day !== 'bench'
        );

        const total = taskBlocks.length;
        const completed = taskBlocks.filter(p => p.status === 'completed').length;
        const shifted = taskBlocks.filter(p => p.status === 'shifted').length;
        const compPercent = total > 0 ? Math.round((completed / total) * 100) : 0;
        const shiftPercent = total > 0 ? Math.round((shifted / total) * 100) : 0;

        const succText = document.getElementById('successPercentText');
        const dangText = document.getElementById('dangerPercentText');
        const succBar = document.getElementById('successBar');
        const dangBar = document.getElementById('dangerBar');

        if (succText) succText.innerText = `${compPercent}% انجام شده`;
        if (dangText) dangText.innerText = `${shiftPercent}% جبرانی`;
        if (succBar) succBar.style.width = `${compPercent}%`;
        if (dangBar) dangBar.style.width = `${shiftPercent}%`;

        progressBox.style.display = 'block';
    },

    renderGCal() {
        if (!AppState.currentScheduleObj || !AppState.currentScheduleObj.raw_plan) return;
        const container = document.getElementById('gcalGrid');
        if (!container) return;
        container.innerHTML = '';

        let timeColHtml = `<div class="gcal-time-col"><div class="gcal-time-header">ساعت</div>`;
        for (let i = 6; i <= 23; i++) {
            timeColHtml += `<div class="gcal-time-slot">${String(i).padStart(2, '0')}:00</div>`;
        }
        container.innerHTML += timeColHtml + `</div>`;

        const planArr = typeof AppState.currentScheduleObj.raw_plan === 'string'
            ? JSON.parse(AppState.currentScheduleObj.raw_plan)
            : AppState.currentScheduleObj.raw_plan;

        this.daysArr.forEach(day => {
            const dayBlocks = planArr.filter(p => p.day === day);
            let dayHtml = `<div class="gcal-day-col"><div class="gcal-day-header">${day}</div><div class="gcal-day-grid">`;

            dayBlocks.forEach(part => {
                if (!part.start_time || !part.end_time) return;
                const startMins = this.timeStrToMins(part.start_time);
                const endMins = this.timeStrToMins(part.end_time);
                const topPx = Math.max(0, startMins - 360);
                const heightPx = Math.max(24, endMins - startMins);

                let bgColor = "var(--primary)";
                if (part.type === 'class') bgColor = "#334155";
                else if (String(part.subject).includes("ناهار") || String(part.subject).includes("شام")) bgColor = "#475569";
                if (part.status === 'completed') bgColor = "var(--success)";
                else if (part.status === 'shifted') bgColor = "var(--danger)";

                const statusClass = part.status === 'completed' ? 'completed' : (part.status === 'shifted' ? 'shifted' : '');
                const topicHtml = part.topic ? `<div class="event-topic">${part.topic}</div>` : '';

                dayHtml += `
                    <div class="gcal-event ${statusClass}" style="top: ${topPx}px; height: ${heightPx}px; background: ${bgColor};">
                        <div style="font-weight:900; font-size:10.5px;">${part.subject}</div>
                        ${topicHtml}
                        <div style="font-size:8.5px; font-family:monospace; margin-top:auto;">${part.start_time}-${part.end_time}</div>
                    </div>`;
            });

            dayHtml += `</div></div>`;
            container.innerHTML += dayHtml;
        });

        UI.refreshIcons();
    },

    showWeekEmptyState(msg) {
        const container = document.getElementById('gcalGrid');
        if (container) {
            container.innerHTML = `
                <div style="padding: 50px 20px; text-align: center; width: 100%;">
                    <i data-lucide="calendar-x" class="icon-xl" style="color:var(--text-muted); margin-bottom:10px;"></i>
                    <h3 style="color: var(--text-muted); font-size: 13.5px;">${msg}</h3>
                </div>`;
        }
        const progBox = document.getElementById('weeklyProgressBox');
        if (progBox) progBox.style.display = 'none';
    },

    // ======================================================================
    // 💡 ۵. اتاق فکر و ارسال درخواست استراتژی هفته (Thought Room)
    // ======================================================================
    async initRequestSubtab() {
        const iranTime = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Tehran" }));
        const currentDay = iranTime.getDay();
        const currentHour = iranTime.getHours();

        // پنجره زمانی پنجشنبه ساعت ۲۰ تا جمعه ساعت ۲۰
        const isWindowOpen = (currentDay === 4 && currentHour >= 20) || (currentDay === 5 && currentHour < 20);

        const lockMsg = document.getElementById('timeLockMessage');
        const formContent = document.getElementById('requestFormContent');

        if (!isWindowOpen) {
            if (lockMsg) lockMsg.style.display = 'block';
            if (formContent) formContent.style.display = 'none';
        } else {
            if (lockMsg) lockMsg.style.display = 'none';
            if (formContent) formContent.style.display = 'block';
            await this.loadDynamicSwitches();
        }
    },

    async loadDynamicSwitches() {
        const container = document.getElementById('dynamicSwitchesArea');
        if (!container) return;

        try {
            const { data } = await supabaseClient.from('dynamic_switches').select('*').eq('is_active', true);
            container.innerHTML = '';
            if (data && data.length > 0) {
                data.forEach(sw => {
                    container.innerHTML += `
                        <label class="toggle-row">
                            <span style="font-size:13px; font-weight:800;">${sw.title}</span>
                            <div class="toggle-switch">
                                <input type="checkbox" class="dynamic-toggle-input" data-key="${sw.action_key}" data-title="${sw.title}">
                                <span class="toggle-slider"></span>
                            </div>
                        </label>
                    `;
                });
            }
        } catch (_) {
            container.innerHTML = '';
        }
    },

    async sendScheduleRequest() {
        const btn = document.getElementById('btnRequestPlan');
        const note = document.getElementById('nextWeekNote')?.value || '';
        const studentOptions = {};
        const activeSwitchTitles = [];

        document.querySelectorAll('.dynamic-toggle-input').forEach(toggle => {
            const key = toggle.getAttribute('data-key');
            const title = toggle.getAttribute('data-title');
            studentOptions[key] = toggle.checked;
            if (toggle.checked) activeSwitchTitles.push(title);
        });

        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span>در حال ارسال پرونده...</span>';
        }

        try {
            const response = await fetch(GAS_WEBAPP_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({
                    action: 'generate_schedule_auto',
                    student_id: AppState.userId,
                    student_note: note,
                    student_options: studentOptions,
                    active_switch_titles: activeSwitchTitles,
                    avg_study_hours: 0,
                    avg_test_count: 0
                })
            });

            const result = await response.json();
            if (result.success) {
                UI.showToast('استراتژی شما با موفقیت ثبت شد و به مشاور ارسال گردید.', 'success');
            } else {
                throw new Error(result.error || 'خطا در ثبت درخواست');
            }
        } catch (err) {
            UI.showToast('خطا در ارسال درخواست: ' + err.message, 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i data-lucide="sparkles" class="icon"></i><span>ارسال پرونده به اتاق مشاور</span>';
                UI.refreshIcons();
            }
        }
    },

    // ======================================================================
    // ⚙️ ۶. پیکربندی هسته برنامه‌ریز (VIP Setup)
    // ======================================================================
    populateVipSetupUI() {
        const existing = AppState.vipSettings;
        this.selectedStartSubjects = [];
        this.selectedEndSubjects = [];
        this.selectedStrengths = [];
        this.selectedWeaknesses = [];

        const farhangianSection = document.getElementById('farhangianSection');
        if (farhangianSection && AppState.studentGrade === 'دوازدهم') {
            farhangianSection.style.display = 'block';
        }

        if (existing) {
            const goalInput = document.getElementById('studentGoal');
            if (goalInput && existing.student_goal) goalInput.value = existing.student_goal;

            this.selectedStartSubjects = Array.isArray(existing.start_subject) ? [...existing.start_subject] : [];
            this.selectedEndSubjects = Array.isArray(existing.end_subject) ? [...existing.end_subject] : [];

            const farhToggle = document.getElementById('farhangianToggle');
            if (farhToggle && existing.is_farhangian) farhToggle.checked = true;

            if (Array.isArray(existing.exam_type)) {
                document.querySelectorAll('.exam-chip').forEach(chip => {
                    chip.classList.toggle('active', existing.exam_type.includes(chip.dataset.exam));
                });
            }

            if (Array.isArray(existing.subject_skills)) {
                existing.subject_skills.forEach(s => {
                    if (s.score === 5) this.selectedStrengths.push(s.subject);
                    if (s.score === 1) this.selectedWeaknesses.push(s.subject);
                });
            }
        }

        const startContainer = document.getElementById('startSubjectsContainer');
        const endContainer = document.getElementById('endSubjectsContainer');
        const strContainer = document.getElementById('strengthsContainer');
        const weakContainer = document.getElementById('weaknessesContainer');

        if (startContainer) startContainer.innerHTML = '';
        if (endContainer) endContainer.innerHTML = '';
        if (strContainer) strContainer.innerHTML = '';
        if (weakContainer) weakContainer.innerHTML = '';

        const subjects = (AppState.globalSubjects && AppState.globalSubjects.length > 0)
            ? AppState.globalSubjects.filter(s => s !== 'سایر')
            : ["زیست ۱", "فیزیک ۱", "شیمی ۱", "ریاضی ۱"];

        subjects.forEach(subj => {
            if (startContainer) {
                startContainer.innerHTML += `<div class="chip ${this.selectedStartSubjects.includes(subj) ? 'active' : ''}" onclick="PlanningModule.toggleVipSubject(this, '${subj}', 'start')">${subj}</div>`;
            }
            if (endContainer) {
                endContainer.innerHTML += `<div class="chip ${this.selectedEndSubjects.includes(subj) ? 'active' : ''}" onclick="PlanningModule.toggleVipSubject(this, '${subj}', 'end')">${subj}</div>`;
            }
            if (strContainer) {
                strContainer.innerHTML += `<div class="chip ${this.selectedStrengths.includes(subj) ? 'active' : ''}" onclick="PlanningModule.toggleEvalSubject(this, '${subj}', 'strength')">${subj}</div>`;
            }
            if (weakContainer) {
                weakContainer.innerHTML += `<div class="chip ${this.selectedWeaknesses.includes(subj) ? 'active' : ''}" onclick="PlanningModule.toggleEvalSubject(this, '${subj}', 'weakness')">${subj}</div>`;
            }
        });

        const clsContainer = document.getElementById('classesContainer');
        if (clsContainer) {
            clsContainer.innerHTML = '';
            if (existing && Array.isArray(existing.class_schedule) && existing.class_schedule.length > 0) {
                existing.class_schedule.forEach(cls => this.addClassCard(cls));
            } else {
                this.addClassCard();
            }
        }
    },

    toggleVipSubject(element, subj, type) {
        const targetArray = type === 'start' ? this.selectedStartSubjects : this.selectedEndSubjects;
        if (targetArray.includes(subj)) {
            targetArray.splice(targetArray.indexOf(subj), 1);
            element.classList.remove('active');
        } else {
            if (targetArray.length >= 3) {
                UI.showToast('حداکثر ۳ درس برای این بخش قابل انتخاب است.', 'error');
                return;
            }
            targetArray.push(subj);
            element.classList.add('active');
        }
    },

    toggleEvalSubject(element, subj, type) {
        const targetArray = type === 'strength' ? this.selectedStrengths : this.selectedWeaknesses;
        const oppositeArray = type === 'strength' ? this.selectedWeaknesses : this.selectedStrengths;

        if (targetArray.includes(subj)) {
            targetArray.splice(targetArray.indexOf(subj), 1);
            element.classList.remove('active');
        } else {
            if (targetArray.length >= 3) {
                UI.showToast('حداکثر ۳ درس برای این بخش قابل انتخاب است.', 'error');
                return;
            }
            if (oppositeArray.includes(subj)) {
                UI.showToast('یک درس نمی‌تواند همزمان نقطه قوت و ضعف باشد.', 'error');
                return;
            }
            targetArray.push(subj);
            element.classList.add('active');
        }
    },

    selectClassType(element, isOnline) {
        const parent = element.closest('.class-type-container');
        if (!parent) return;
        parent.querySelectorAll('.type-chip').forEach(c => c.classList.remove('active'));
        element.classList.add('active');
        parent.setAttribute('data-online', isOnline);
    },

    formatTimeDisplay(val) {
        const num = parseFloat(val);
        let h = Math.floor(num);
        const m = (num - h) * 60;
        if (h >= 24) h -= 24;
        return `${h < 10 ? '0' + h : h}:${m === 0 ? '00' : '30'}`;
    },

    addClassCard(existingClass = null) {
        this.classCount++;
        const id = this.classCount;
        const container = document.getElementById('classesContainer');
        if (!container) return;

        const card = document.createElement('div');
        card.className = 'course-card';
        card.id = `class_${id}`;

        const nameVal = existingClass ? existingClass.name : "";
        const startNum = existingClass ? existingClass.startNum : 16;
        const endNum = existingClass ? existingClass.endNum : 17.5;
        const days = existingClass && Array.isArray(existingClass.days) ? existingClass.days : [];
        const isOnline = existingClass ? !!existingClass.isOnline : false;
        const isDayActive = (d) => days.includes(d) ? 'active' : '';

        card.innerHTML = `
            <div style="display:flex; justify-content:space-between; gap: 10px; margin-bottom: 12px;">
                <input type="text" class="modern-input c-name" placeholder="نام برنامه (مثلاً مدرسه، کلاس فیزیک...)" value="${nameVal}" style="flex:1;">
                <button type="button" class="del-icon-btn" onclick="document.getElementById('class_${id}').remove()" title="حذف کلاس">
                    <i data-lucide="trash-2" class="icon-sm"></i>
                </button>
            </div>
            <div style="margin-bottom: 14px;">
                <div class="chips-container class-type-container" data-online="${isOnline}" style="margin-bottom:0;">
                    <div class="chip type-chip ${isOnline ? '' : 'active'}" style="flex:1; justify-content:center;" onclick="PlanningModule.selectClassType(this, 'false')">
                        <i data-lucide="building-2" class="icon-sm"></i><span>حضوری</span>
                    </div>
                    <div class="chip type-chip ${isOnline ? 'active' : ''}" style="flex:1; justify-content:center;" onclick="PlanningModule.selectClassType(this, 'true')">
                        <i data-lucide="monitor" class="icon-sm"></i><span>آنلاین</span>
                    </div>
                </div>
            </div>
            <div class="days-container">
                <div class="day-circle ${isDayActive('شنبه')}" onclick="this.classList.toggle('active')" data-day="شنبه">ش</div>
                <div class="day-circle ${isDayActive('یکشنبه')}" onclick="this.classList.toggle('active')" data-day="یکشنبه">ی</div>
                <div class="day-circle ${isDayActive('دوشنبه')}" onclick="this.classList.toggle('active')" data-day="دوشنبه">د</div>
                <div class="day-circle ${isDayActive('سه‌شنبه')}" onclick="this.classList.toggle('active')" data-day="سه‌شنبه">س</div>
                <div class="day-circle ${isDayActive('چهارشنبه')}" onclick="this.classList.toggle('active')" data-day="چهارشنبه">چ</div>
                <div class="day-circle ${isDayActive('پنجشنبه')}" onclick="this.classList.toggle('active')" data-day="پنجشنبه">پ</div>
                <div class="day-circle ${isDayActive('جمعه')}" onclick="this.classList.toggle('active')" data-day="جمعه">ج</div>
            </div>
            <div class="slider-group">
                <div class="slider-header"><span class="slider-label">ساعت شروع</span><span class="slider-val" id="v_start_${id}">${this.formatTimeDisplay(startNum)}</span></div>
                <input type="range" class="c-start" min="6" max="23" step="0.5" value="${startNum}"
                       oninput="document.getElementById('v_start_${id}').innerText = PlanningModule.formatTimeDisplay(this.value)">
            </div>
            <div class="slider-group" style="margin-bottom:0;">
                <div class="slider-header"><span class="slider-label">ساعت پایان</span><span class="slider-val" id="v_end_${id}">${this.formatTimeDisplay(endNum)}</span></div>
                <input type="range" class="c-end" min="6" max="24" step="0.5" value="${endNum}"
                       oninput="document.getElementById('v_end_${id}').innerText = PlanningModule.formatTimeDisplay(this.value)">
            </div>
        `;

        container.appendChild(card);
        UI.refreshIcons();
    },

    async saveVipSettings() {
        const btn = document.getElementById('saveVipBtn');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span>در حال ذخیره در هسته مرکزی...</span>';
        }

        const selectedExams = [];
        document.querySelectorAll('.exam-chip.active').forEach(chip => selectedExams.push(chip.dataset.exam));
        const customEx = document.getElementById('customExam')?.value.trim() || '';
        if (customEx !== "") selectedExams.push(customEx);

        const subjects = (AppState.globalSubjects && AppState.globalSubjects.length > 0)
            ? AppState.globalSubjects.filter(s => s !== 'سایر')
            : [];

        const skills = subjects.map(subj => ({
            subject: subj,
            score: this.selectedStrengths.includes(subj) ? 5 : (this.selectedWeaknesses.includes(subj) ? 1 : 3)
        }));

        const classesData = [];
        document.querySelectorAll('#classesContainer .course-card').forEach(card => {
            const name = card.querySelector('.c-name')?.value.trim() || '';
            const isOnline = card.querySelector('.class-type-container')?.getAttribute('data-online') === 'true';
            const activeDays = [];
            card.querySelectorAll('.day-circle.active').forEach(circle => activeDays.push(circle.dataset.day));
            const idNum = card.id.split('_')[1];

            if (name !== "" && activeDays.length > 0) {
                classesData.push({
                    name: name,
                    isOnline: isOnline,
                    days: activeDays,
                    start: document.getElementById('v_start_' + idNum)?.innerText || '16:00',
                    end: document.getElementById('v_end_' + idNum)?.innerText || '17:30',
                    startNum: parseFloat(card.querySelector('.c-start')?.value) || 16,
                    endNum: parseFloat(card.querySelector('.c-end')?.value) || 17.5
                });
            }
        });

        const uid = String(AppState.userId || '');
        const payload = {
            national_id: uid,
            student_goal: document.getElementById('studentGoal')?.value.trim() || '',
            exam_type: selectedExams,
            start_subject: this.selectedStartSubjects,
            end_subject: this.selectedEndSubjects,
            subject_skills: skills,
            class_schedule: classesData,
            is_farhangian: document.getElementById('farhangianToggle')?.checked || false,
            updated_at: new Date().toISOString()
        };

        try {
            const { error: vipErr } = await supabaseClient
                .from('vip_settings')
                .upsert([payload], { onConflict: 'national_id' });

            if (vipErr) throw vipErr;

            AppState.vipSettings = payload;
            UI.showToast('تنظیمات هسته برنامه‌ریز با موفقیت ذخیره شد.', 'success');
        } catch (err) {
            UI.showToast('خطا در ذخیره تنظیمات در سرور.', 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i data-lucide="save" class="icon"></i><span>ذخیره تنظیمات هسته برنامه‌ریز</span>';
                UI.refreshIcons();
            }
        }
    }
};

window.PlanningModule = PlanningModule;
