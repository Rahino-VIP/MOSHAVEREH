/* ==========================================================================
   🗓️ ماژول جامع برنامه‌ریزی هوشمند و موتور بودجه‌بندی آزمون (js/planning.js)
   متصل به تب ۳ اپلیکیشن (#tab-planning) و هماهنگ با جداول:
   ai_schedules | vip_settings | exam_budgets | knowledge_graph | fixed_schedule_events | week_status_calendar
   ========================================================================== */

const PlanningModule = {
    daysArr: ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'],
    todayNameFa: 'شنبه',
    renderDayFa: 'شنبه',
    isInitialScheduleLoad: true,
    hasCelebratedToday: false,

    // متغیرهای پیکربندی هسته (VIP Setup) و محدودیت‌های هفتگی
    classCount: 0,
    busySlotCount: 0,
    selectedStartSubjects: [],
    selectedEndSubjects: [],
    selectedStrengths: [],
    selectedWeaknesses: [],
    studyStartHour: 7.0,   // پیش‌فرض شروع روز: ۰۷:۰۰ صبح
    studyEndHour: 23.5,    // پیش‌فرض پایان شب: ۲۳:۳۰ شب (قابل افزایش تا ۲۶ = ۰۲:۰۰ بامداد)

    // تشخیص دروس عمومی از اختصاصی برای اجرای قانون ۳۰٪ تمرکز عمیق
    generalBooksList: [
        'فارسی ۱', 'فارسی ۲', 'فارسی ۳', 'فارسی',
        'عربی ۱', 'عربی ۲', 'عربی ۳', 'عربی',
        'دین و زندگی ۱', 'دین و زندگی ۲', 'دین و زندگی ۳', 'دینی',
        'انگلیسی ۱', 'انگلیسی ۲', 'زبان انگلیسی ۳', 'زبان',
        'سلامت و بهداشت', 'هویت اجتماعی', 'تاریخ معاصر ایران'
    ],

    // ======================================================================
    // 🧭 ۱. راه‌اندازی، بررسی سطح دسترسی اشتراک و سوییچ تب‌ها
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

        // بررسی سطح دسترسی کاربر به برنامه‌ریزی
        const accessMode = this.getUserPlanningAccessMode();
        const lockView = document.getElementById('planningLockedView');
        const mainContent = document.getElementById('planningMainContent');

        if (accessMode === 'locked') {
            if (lockView) lockView.style.display = 'block';
            if (mainContent) mainContent.style.display = 'none';
            UI.refreshIcons();
            return;
        }

        if (lockView) lockView.style.display = 'none';
        if (mainContent) mainContent.style.display = 'block';

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
                    <div class="card-box center-card" style="padding: 34px 20px;">
                        <i data-lucide="calendar-plus" class="icon-xl primary-text" style="margin-bottom:10px;"></i>
                        <h3 style="font-size:15px; font-weight:900; margin-bottom:6px;">هنوز برنامه‌ای برای این هفته شما ثبت نشده است</h3>
                        <p class="muted-desc">از تب «اتاق فکر و درخواست برنامه» می‌توانید برنامه هفتگی خود را دریافت کنید.</p>
                        <button type="button" class="btn-primary-full" style="max-width:250px; margin:0 auto;" onclick="PlanningModule.switchSubtab('request', document.querySelectorAll('#tab-planning .subtab-btn')[2])">
                            <i data-lucide="sparkles" class="icon-sm"></i>
                            <span>رفتن به اتاق فکر و دریافت برنامه</span>
                        </button>
                    </div>`;
            }
            this.showWeekEmptyState("هنوز هیچ برنامه‌ای برای شما ثبت نشده است.");
        }

        this.populateVipSetupUI();
        this.initRequestSubtab();
        UI.refreshIcons();
    },

    // تعیین نوع دسترسی کاربر: 'locked' (بدون اشتراک) | 'self_auto' (اشتراک بدون مشاور) | 'consultant' (اشتراک با مشاور)
    getUserPlanningAccessMode() {
        const subs = AppState.subscriptions || [];
        if (subs.length > 0) {
            const stype = String(subs[0].service_type || '').toLowerCase();
            // اگر طرح از نوع خودخوان / پلاس / بدون مشاور باشد -> تحویل آنی توسط الگوریتم
            if (stype.includes('خودخوان') || stype.includes('ابزار') || stype.includes('auto') || stype.includes('plus') || stype.includes('پلاس')) {
                return 'self_auto';
            }
            return 'consultant';
        }
        // اگر اشتراک مشاوره ندارد، قفل است
        return 'locked';
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

    toggleSetupPanel() {
        const panel = document.getElementById('inlineVipSetupPanel');
        const lbl = document.getElementById('btnToggleSetupLabel');
        if (!panel) return;
        const isHidden = panel.style.display === 'none';
        panel.style.display = isHidden ? 'block' : 'none';
        if (lbl) lbl.innerText = isHidden ? 'بستن پیکربندی' : 'ویرایش پیکربندی هسته';
        UI.refreshIcons();
    },

    // تبدیل ساعت متنی (با پشتیبانی از ساعت‌های بامداد 00:00 تا 03:00 به عنوان ادامه شب 24:00 تا 27:00)
    timeStrToMins(timeStr) {
        if (!timeStr) return 0;
        const parts = String(timeStr).split(':');
        let h = parseInt(parts[0], 10) || 0;
        const m = parseInt(parts[1], 10) || 0;
        if (h < 5) h += 24; // ساعت ۰۰:۰۰ تا ۰۴:۳۰ بامداد در امتداد شب محاسبه می‌شوند
        return (h * 60) + m;
    },

    minsToTimeStr(totalMins) {
        let h = Math.floor(totalMins / 60);
        const m = Math.round(totalMins % 60);
        if (h >= 24) h -= 24;
        return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    },

    formatTimeDisplay(val) {
        const num = parseFloat(val);
        let h = Math.floor(num);
        const m = (num - h) * 60;
        if (h >= 24) h -= 24;
        return `${h < 10 ? '0' + h : h}:${m === 0 ? '00' : '30'}`;
    },

    formatExtendedTimeDisplay(val) {
        const num = parseFloat(val);
        let h = Math.floor(num);
        const m = (num - h) * 60;
        const suffix = h >= 24 ? ' بامداد' : '';
        if (h >= 24) h -= 24;
        return `${h < 10 ? '0' + h : h}:${m === 0 ? '00' : '30'}${suffix}`;
    },

    isGeneralSubject(subjName) {
        const norm = window.normalizeSubjectName ? window.normalizeSubjectName(subjName) : String(subjName || '');
        if (this.generalBooksList.includes(norm)) return true;
        return norm.includes('فارسی') || norm.includes('عربی') || norm.includes('دین و زندگی') ||
               norm.includes('انگلیسی') || norm.includes('سلامت') || norm.includes('هویت');
    },

    // ======================================================================
    // 🎯 ۲. عملیات امروز و اتصال مستقیم به تایمر تمام‌صفحه سینماتیک
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

        // پیام انگیزشی روزانه
        const motivationBox = document.getElementById('aiMotivationBox');
        const motivationText = document.getElementById('aiMotivationText');
        if (AppState.currentScheduleObj.ai_motivations && motivationBox && motivationText) {
            const aiMotivations = typeof AppState.currentScheduleObj.ai_motivations === 'string'
                ? JSON.parse(AppState.currentScheduleObj.ai_motivations)
                : AppState.currentScheduleObj.ai_motivations;

            const todaysMessage = aiMotivations?.daily_motivations?.[this.renderDayFa];
            const uid = String(AppState.userId || '');
            if (todaysMessage && Storage.get(`dismissed_daily_${uid}`) !== todaysMessage) {
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
            const safeSubj = String(part.subject || '').replace(/'/g, "\\'");
            const safeTopic = String(part.topic || '').replace(/'/g, "\\'");

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
                            <button type="button" class="action-circle" onclick="PlanningModule.startQuestWithCinematicTimer('${part.block_id}', '${safeSubj}', '${safeTopic}', '${part.start_time}', '${part.end_time}')" title="تایمر تمرکز تمام‌صفحه">
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

    // اتصال مستقیم هر پارت عملیات امروز به تایمر تمام‌صفحه سینماتیک ابزارها
    startQuestWithCinematicTimer(blockId, subject, topic, startTime, endTime) {
        let durationMins = this.timeStrToMins(endTime) - this.timeStrToMins(startTime);
        if (durationMins <= 0 || durationMins > 180) durationMins = 90;

        if (window.ToolsModule && typeof ToolsModule.openImmersiveTimer === 'function') {
            const fullTitle = `${subject}${topic ? ' • ' + topic : ''}`;
            // اگر باکس ۹۰ دقیقه‌ای است، به صورت پیش‌فرض ۲ پارت ۴۵ دقیقه‌ای تنظیم می‌شود
            const studyPartMins = durationMins >= 80 ? Math.round(durationMins / 2) : durationMins;
            const rounds = durationMins >= 80 ? 2 : 1;

            ToolsModule.openImmersiveTimer(fullTitle, studyPartMins);
            const roundsInp = document.getElementById('inpPomoRounds');
            if (roundsInp) roundsInp.value = rounds;
            ToolsModule.activeQuestBlockId = blockId;
        }
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
                    UI.showToast('باکس جبرانی خالی نبود؛ این درس برای هفته آینده ذخیره شد.', 'info');
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
        Storage.set(`dismissed_daily_${uid}`, msgText);
        const box = document.getElementById('aiMotivationBox');
        if (box) box.style.display = 'none';
    },

    dismissWeeklyMotivation() {
        const msgText = document.getElementById('aiWeeklyMotivationText')?.innerText || '';
        const uid = String(AppState.userId || '');
        if (AppState.currentScheduleObj) {
            Storage.set(`dismissed_weekly_${uid}_${AppState.currentScheduleObj.id}`, msgText);
        }
        const box = document.getElementById('aiWeeklyMotivationBox');
        if (box) box.style.display = 'none';
    },

    // ======================================================================
    // 📅 ۳. تقویم گرافیکی هفته (تا ساعت ۰۲:۰۰ بامداد) + دانلود عکس و PDF برنامه
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

    selectScheduleWeek(schId, label) {
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

        document.getElementById('successPercentText').innerText = `${compPercent}% انجام شده`;
        document.getElementById('dangerPercentText').innerText = `${shiftPercent}% جبرانی`;
        document.getElementById('successBar').style.width = `${compPercent}%`;
        document.getElementById('dangerBar').style.width = `${shiftPercent}%`;

        progressBox.style.display = 'block';
    },

    renderGCal() {
        if (!AppState.currentScheduleObj || !AppState.currentScheduleObj.raw_plan) return;
        const container = document.getElementById('gcalGrid');
        if (!container) return;
        container.innerHTML = '';

        const planArr = typeof AppState.currentScheduleObj.raw_plan === 'string'
            ? JSON.parse(AppState.currentScheduleObj.raw_plan)
            : AppState.currentScheduleObj.raw_plan;

        // تشخیص اینکه آیا در برنامه ساعت‌های بعد از نیمه‌شب (تا ۲ بامداد = ۱۵۶۰ دقیقه) وجود دارد یا خیر
        let maxEndHour = 23;
        planArr.forEach(p => {
            if (p.end_time) {
                const em = this.timeStrToMins(p.end_time);
                const h = Math.ceil(em / 60);
                if (h > maxEndHour) maxEndHour = Math.min(26, h);
            }
        });

        const totalHoursCount = maxEndHour - 6 + 1;
        const gridHeightPx = totalHoursCount * 60;

        let timeColHtml = `<div class="gcal-time-col"><div class="gcal-time-header">ساعت</div>`;
        for (let i = 6; i <= maxEndHour; i++) {
            const displayH = i >= 24 ? i - 24 : i;
            timeColHtml += `<div class="gcal-time-slot">${String(displayH).padStart(2, '0')}:00</div>`;
        }
        container.innerHTML += timeColHtml + `</div>`;

        this.daysArr.forEach(day => {
            const dayBlocks = planArr.filter(p => p.day === day);
            let dayHtml = `<div class="gcal-day-col"><div class="gcal-day-header">${day}</div><div class="gcal-day-grid" style="height:${gridHeightPx}px;">`;

            dayBlocks.forEach(part => {
                if (!part.start_time || !part.end_time) return;
                const startMins = this.timeStrToMins(part.start_time);
                const endMins = this.timeStrToMins(part.end_time);
                const topPx = Math.max(0, startMins - 360);
                const heightPx = Math.max(24, endMins - startMins);

                let bgColor = "var(--primary)";
                if (part.type === 'class') bgColor = "#334155";
                else if (part.subject === 'بانک جبرانی') bgColor = "#64748b";
                else if (String(part.subject).includes("ناهار") || String(part.subject).includes("شام")) bgColor = "#475569";
                if (part.status === 'completed') bgColor = "var(--success)";
                else if (part.status === 'shifted') bgColor = "var(--danger)";

                const statusClass = part.status === 'completed' ? 'completed' : (part.status === 'shifted' ? 'shifted' : '');
                const topicHtml = part.topic ? `<div class="event-topic">${part.topic}</div>` : '';

                dayHtml += `
                    <div class="gcal-event ${statusClass}" style="top: ${topPx}px; height: ${heightPx}px; background: ${bgColor};">
                        <div style="font-weight:900;font-size:10.5px;">${part.subject}</div>
                        ${topicHtml}
                        <div style="font-size:8.5px;font-family:monospace; margin-top:auto;">${part.start_time}-${part.end_time}</div>
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

    // 📥 دانلود برنامه هفتگی به صورت پوستر تصویری باکیفیت (PNG)
    downloadWeeklyScheduleImage() {
        if (!AppState.currentScheduleObj || !AppState.currentScheduleObj.raw_plan) {
            return UI.showToast('هنوز برنامه‌ای برای دانلود وجود ندارد.', 'error');
        }

        const planArr = typeof AppState.currentScheduleObj.raw_plan === 'string'
            ? JSON.parse(AppState.currentScheduleObj.raw_plan)
            : AppState.currentScheduleObj.raw_plan;

        const canvas = document.createElement('canvas');
        canvas.width = 1600;
        canvas.height = 1080;
        const ctx = canvas.getContext('2d');

        // پس‌زمینه تیره استاندارد راهینو
        ctx.fillStyle = '#0e1514';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // هدر بالا
        ctx.fillStyle = '#16201e';
        ctx.fillRect(30, 25, 1540, 85);
        ctx.strokeStyle = '#77bba9';
        ctx.lineWidth = 2;
        ctx.strokeRect(30, 25, 1540, 85);

        ctx.fillStyle = '#77bba9';
        ctx.font = 'bold 26px Vazirmatn, sans-serif';
        ctx.textAlign = 'right';
        ctx.fillText(`برنامه مطالعاتی قطب‌نمای راهینو | ${AppState.fullName}`, 1540, 65);

        ctx.fillStyle = '#94a3b8';
        ctx.font = 'bold 18px Vazirmatn, sans-serif';
        ctx.fillText(`${AppState.currentScheduleObj.week_label || 'برنامه هفتگی'} • پایه ${AppState.studentGrade} ${AppState.studentMajor}`, 1540, 95);

        // رسم ۷ ردیف روزهای هفته (از شنبه تا جمعه)
        const startY = 130;
        const rowH = 130;

        this.daysArr.forEach((day, dIdx) => {
            const y = startY + (dIdx * rowH);
            ctx.fillStyle = dIdx % 2 === 0 ? '#16201e' : '#1b2725';
            ctx.fillRect(30, y, 1540, rowH - 10);

            // ستون نام روز در سمت راست
            ctx.fillStyle = '#639889';
            ctx.fillRect(1450, y, 120, rowH - 10);
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 20px Vazirmatn, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(day, 1510, y + 68);

            // فیلتر و مرتب‌سازی باکس‌های مطالعه آن روز
            const blocks = planArr.filter(p =>
                p.day === day &&
                p.type !== 'break' &&
                !String(p.subject).includes('ناهار') &&
                !String(p.subject).includes('شام')
            ).sort((a, b) => this.timeStrToMins(a.start_time) - this.timeStrToMins(b.start_time));

            const maxCols = Math.max(1, blocks.length);
            const availW = 1400;
            const boxW = Math.min(220, Math.floor(availW / maxCols) - 10);

            blocks.forEach((blk, bIdx) => {
                const bx = 1435 - ((bIdx + 1) * (boxW + 8));
                if (bx < 35) return;

                ctx.fillStyle = blk.type === 'class' ? '#334155' : (blk.subject === 'بانک جبرانی' ? '#475569' : '#243b35');
                ctx.fillRect(bx, y + 10, boxW, rowH - 30);
                ctx.strokeStyle = blk.status === 'completed' ? '#10b981' : '#77bba9';
                ctx.lineWidth = 1.5;
                ctx.strokeRect(bx, y + 10, boxW, rowH - 30);

                ctx.fillStyle = '#77bba9';
                ctx.font = 'bold 13px monospace';
                ctx.textAlign = 'center';
                ctx.fillText(`${blk.start_time} - ${blk.end_time}`, bx + boxW / 2, y + 34);

                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 15px Vazirmatn, sans-serif';
                ctx.fillText(String(blk.subject).slice(0, 22), bx + boxW / 2, y + 62);

                ctx.fillStyle = '#cbd5e1';
                ctx.font = '12px Vazirmatn, sans-serif';
                ctx.fillText(String(blk.topic || '').slice(0, 26), bx + boxW / 2, y + 86);
            });
        });

        const link = document.createElement('a');
        link.download = `Qotbnama-Schedule-${AppState.userId}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        UI.showToast('تصویر باکیفیت برنامه هفتگی دانلود شد.', 'success');
    },

    // 🖨️ چاپ یا ذخیره PDF استاندارد در قالب جدول افقی A4
    printWeeklySchedulePdf() {
        if (!AppState.currentScheduleObj || !AppState.currentScheduleObj.raw_plan) {
            return UI.showToast('هنوز برنامه‌ای برای چاپ وجود ندارد.', 'error');
        }
        const planArr = typeof AppState.currentScheduleObj.raw_plan === 'string'
            ? JSON.parse(AppState.currentScheduleObj.raw_plan)
            : AppState.currentScheduleObj.raw_plan;

        const rowsHtml = this.daysArr.map(day => {
            const blocks = planArr.filter(p =>
                p.day === day &&
                p.type !== 'break' &&
                !String(p.subject).includes('ناهار') &&
                !String(p.subject).includes('شام')
            ).sort((a, b) => this.timeStrToMins(a.start_time) - this.timeStrToMins(b.start_time));

            const cells = blocks.map(b => `
                <td style="border:1px solid #cbd5e1; padding:8px; text-align:center; background:${b.type === 'class' ? '#f1f5f9' : '#ffffff'};">
                    <div style="font-size:11px; color:#0f766e; font-weight:bold; direction:ltr;">${b.start_time} - ${b.end_time}</div>
                    <div style="font-size:13px; font-weight:900; color:#1e293b; margin:3px 0;">${b.subject}</div>
                    <div style="font-size:10.5px; color:#64748b;">${b.topic || ''}</div>
                </td>
            `).join('');

            return `
                <tr>
                    <th style="border:1px solid #0f766e; background:#0f766e; color:#fff; padding:10px; width:90px; font-size:14px;">${day}</th>
                    ${cells || '<td style="border:1px solid #cbd5e1; padding:10px; color:#94a3b8;">استراحت / آزاد</td>'}
                </tr>
            `;
        }).join('');

        const printWin = window.open('', '_blank');
        if (!printWin) {
            return UI.showToast('لطفاً اجازه باز شدن پنجره پاپ‌آپ را برای چاپ PDF بدهید.', 'error');
        }
        printWin.document.write(`
            <!DOCTYPE html>
            <html lang="fa" dir="rtl">
            <head>
                <meta charset="UTF-8">
                <title>برنامه هفتگی قطب‌نمای راهینو - ${AppState.fullName}</title>
                <link href="https://cdn.jsdelivr.net/gh/rastikerdar/vazirmatn@v33.003/Vazirmatn-font-face.css" rel="stylesheet" />
                <style>
                    @page { size: A4 landscape; margin: 10mm; }
                    body { font-family: 'Vazirmatn', sans-serif; direction: rtl; color: #1e293b; }
                    .header { display:flex; justify-content:space-between; align-items:center; border-bottom:3px solid #0f766e; padding-bottom:10px; margin-bottom:14px; }
                    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
                </style>
            </head>
            <body>
                <div class="header">
                    <div>
                        <h2 style="margin:0; color:#0f766e;">برنامه مطالعاتی هوشمند قطب‌نمای راهینو</h2>
                        <small>${AppState.currentScheduleObj.week_label || 'برنامه هفتگی'}</small>
                    </div>
                    <div style="text-align:left; font-size:13px; font-weight:bold;">
                        <div>دانش‌آموز: ${AppState.fullName}</div>
                        <div>پایه و رشته: ${AppState.studentGrade} ${AppState.studentMajor}</div>
                    </div>
                </div>
                <table>${rowsHtml}</table>
                <script>window.onload = function(){ setTimeout(function(){ window.print(); }, 400); };<\/script>
            </body>
            </html>
        `);
        printWin.document.close();
    },

    // ======================================================================
    // 💡 ۴. اتاق فکر، محدودیت‌های هفتگی و موتور برنامه‌ریز هوشمند (با قانون ۳۰٪)
    // ======================================================================
    addBusySlotRow() {
        this.busySlotCount++;
        const id = this.busySlotCount;
        const container = document.getElementById('busySlotsListContainer');
        if (!container) return;

        const row = document.createElement('div');
        row.className = 'course-card';
        row.id = `busySlot_${id}`;
        row.style.padding = '12px';
        row.style.marginBottom = '8px';

        const dayOpts = this.daysArr.map(d => `<option value="${d}">${d}</option>`).join('');
        row.innerHTML = `
            <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                <select class="modern-input busy-day" style="flex:1; min-width:100px; padding:8px;">${dayOpts}</select>
                <div style="display:flex; align-items:center; gap:6px; flex:2;">
                    <span style="font-size:11.5px; font-weight:800;">از ساعت:</span>
                    <input type="number" class="modern-input busy-start" min="6" max="24" step="0.5" value="16" style="padding:8px; text-align:center;">
                    <span style="font-size:11.5px; font-weight:800;">تا:</span>
                    <input type="number" class="modern-input busy-end" min="7" max="26" step="0.5" value="20" style="padding:8px; text-align:center;">
                </div>
                <button type="button" class="del-icon-btn" style="width:34px;height:34px;" onclick="document.getElementById('busySlot_${id}').remove()">
                    <i data-lucide="trash-2" class="icon-sm"></i>
                </button>
            </div>
        `;
        container.appendChild(row);
        UI.refreshIcons();
    },

    async initRequestSubtab() {
        const accessMode = this.getUserPlanningAccessMode();
        const iranTime = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Tehran" }));
        const currentDay = iranTime.getDay(); // 4 = پنجشنبه، 5 = جمعه
        const currentHour = iranTime.getHours();

        const isThursdayFridayWindow = (currentDay === 4 && currentHour >= 20) || (currentDay === 5 && currentHour < 20);
        const hasNoCurrentSchedule = !AppState.currentScheduleObj;

        const lockMsg = document.getElementById('timeLockMessage');
        const formContent = document.getElementById('requestFormContent');
        const btnLabel = document.getElementById('btnRequestPlanLabel');
        const subDesc = document.getElementById('requestBoxSubDesc');

        // اگر کاربر اشتراک بدون مشاور دارد و برنامه فعالی ندارد، هر روزی از هفته می‌تواند برنامه بگیرد
        const canRequestNow = isThursdayFridayWindow || (accessMode === 'self_auto' && hasNoCurrentSchedule);

        if (accessMode === 'self_auto') {
            if (btnLabel) btnLabel.innerText = 'ساخت و دریافت فوری برنامه هوشمند هفته';
            if (subDesc) {
                subDesc.innerText = hasNoCurrentSchedule && !isThursdayFridayWindow
                    ? 'شما برای هفته جاری برنامه‌ای ندارید؛ سیستم بودجه آزمون پیش رو را بر اساس روزهای باقی‌مانده هفته برایتان تنظیم و درجا تحویل می‌دهد.'
                    : 'با زدن دکمه زیر، برنامه هفته آینده شما منطبق با بودجه‌بندی آزمون چیده شده و بلافاصله فعال می‌شود.';
            }
        } else {
            if (btnLabel) btnLabel.innerText = 'ارسال پرونده به اتاق مشاور';
        }

        if (!canRequestNow) {
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

    // جمع‌آوری روزها و ساعت‌های غیبت/مهمانی هفته که دانش‌آموز در اتاق فکر انتخاب کرده است
    collectWeeklyOffConstraints() {
        const fullOffDays = [];
        document.querySelectorAll('#dayOffCirclesContainer .day-circle.active').forEach(c => {
            fullOffDays.push(c.getAttribute('data-day'));
        });

        const busySlots = [];
        document.querySelectorAll('#busySlotsListContainer .course-card').forEach(row => {
            const d = row.querySelector('.busy-day')?.value;
            const s = parseFloat(row.querySelector('.busy-start')?.value) || 16;
            const e = parseFloat(row.querySelector('.busy-end')?.value) || 20;
            if (d && e > s) {
                busySlots.push({ day: d, startMins: s * 60, endMins: e * 60 });
            }
        });

        return { fullOffDays, busySlots };
    },

    async sendScheduleRequest() {
        if (!AppState.vipSettings) {
            UI.showToast('لطفاً ابتدا دکمه «ویرایش پیکربندی هسته» در بالای همین صفحه را بزنید و ساعت مطالعه و کلاس‌های خود را ذخیره کنید.', 'error');
            this.toggleSetupPanel();
            return;
        }

        const accessMode = this.getUserPlanningAccessMode();
        const btn = document.getElementById('btnRequestPlan');
        const note = document.getElementById('nextWeekNote')?.value || '';
        const offConstraints = this.collectWeeklyOffConstraints();

        const studentOptions = {
            study_start_hour: this.studyStartHour,
            study_end_hour: this.studyEndHour,
            full_off_days: offConstraints.fullOffDays,
            busy_slots: offConstraints.busySlots
        };
        const activeSwitchTitles = [];

        document.querySelectorAll('.dynamic-toggle-input').forEach(toggle => {
            const key = toggle.getAttribute('data-key');
            const title = toggle.getAttribute('data-title');
            studentOptions[key] = toggle.checked;
            if (toggle.checked) activeSwitchTitles.push(title);
        });

        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span>در حال چینش هوشمند برنامه طبق بودجه آزمون...</span>';
        }

        try {
            // الف) اگر کاربر دارای اشتراک «بدون مشاور» (خودکار) است -> ساخت برنامه با قانون ۳۰٪ و تحویل آنی (approved)
            if (accessMode === 'self_auto') {
                const generatedSchedule = await this.generateSmartScheduleClientSide(note, studentOptions);
                AppState.allSchedules.unshift(generatedSchedule);
                AppState.currentScheduleObj = generatedSchedule;

                this.determineRenderDay();
                this.renderTodayTab();
                this.setupWeekSelectorDropdown();
                this.updateWeeklyProgress();
                this.renderGCal();

                UI.showToast('برنامه هفتگی شما طبق بودجه آزمون و قانون تمرکز ۳۰٪ ساخته شد و هم‌اکنون فعال است!', 'success');
                this.switchSubtab('week', document.querySelectorAll('#tab-planning .subtab-btn')[1]);
                return;
            }

            // ب) اگر کاربر دارای اشتراک «با مشاور» است -> ارسال به میز مشاور (وضعیت pending)
            let extraOffNote = '';
            if (offConstraints.fullOffDays.length > 0) {
                extraOffNote += ` | روزهای تعطیل درخواستی: ${offConstraints.fullOffDays.join('، ')}`;
            }
            if (offConstraints.busySlots.length > 0) {
                const bsTxt = offConstraints.busySlots.map(b => `${b.day} (${this.minsToTimeStr(b.startMins)}-${this.minsToTimeStr(b.endMins)})`).join('، ');
                extraOffNote += ` | ساعت‌های مشغله: ${bsTxt}`;
            }

            const response = await fetch(GAS_WEBAPP_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({
                    action: 'generate_schedule_auto',
                    student_id: AppState.userId,
                    student_note: note + extraOffNote,
                    student_options: studentOptions,
                    active_switch_titles: activeSwitchTitles,
                    avg_study_hours: 0,
                    avg_test_count: 0
                })
            });

            const result = await response.json();
            if (result.success) {
                UI.showToast('استراتژی شما با موفقیت ثبت شد و روی میز مشاور قرار گرفت.', 'success');
            } else {
                throw new Error(result.error || 'خطا در ثبت درخواست');
            }
        } catch (err) {
            UI.showToast('خطا در ساخت برنامه: ' + err.message, 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = `<i data-lucide="sparkles" class="icon"></i><span>${accessMode === 'self_auto' ? 'ساخت و دریافت فوری برنامه هوشمند هفته' : 'ارسال پرونده به اتاق مشاور'}</span>`;
                UI.refreshIcons();
            }
        }
    },

    // ======================================================================
    // 🧠 ۵. موتور الگوریتم برنامه‌ریزی خودکار (منطبق با بودجه آزمون + قانون ۳۰٪ تمرکز عمیق)
    // ======================================================================
    async generateSmartScheduleClientSide(studentNote, studentOptions) {
        const uid = String(AppState.userId);
        const grade = AppState.studentGrade || 'دوازدهم';
        const major = AppState.studentMajor || 'تجربی';
        const vip = AppState.vipSettings || {};

        // ۱. دریافت آخرین بودجه‌بندی آزمون، مباحث knowledge_graph و رویدادهای ثابت از سوپابیس
        const [budgetRes, kgRes, fixedRes, calRes] = await Promise.all([
            supabaseClient.from('exam_budgets').select('*').eq('grade', grade).eq('major', major).order('exam_date', { ascending: false }).limit(1),
            supabaseClient.from('knowledge_graph').select('*').eq('grade', grade).eq('major', major),
            supabaseClient.from('fixed_schedule_events').select('*'),
            supabaseClient.from('week_status_calendar').select('*').order('start_date', { ascending: false }).limit(2)
        ]);

        const kgList = kgRes.data || [];
        const latestBudgetRow = budgetRes.data?.[0] || null;
        const latestWeekCal = calRes.data?.[0] || null;
        const weekType = latestWeekCal?.week_type?.includes('exam') ? 'exam' : 'advance';
        const weekLabel = latestWeekCal?.title ? `برنامه هوشمند (${latestWeekCal.title})` : 'برنامه هوشمند هفتگی';

        // ۲. تشخیص اینکه آیا دانش‌آموز وسط هفته در حال دریافت برنامه برای روزهای باقی‌مانده همین هفته است یا برای کل هفته آینده
        const iranNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Tehran" }));
        const jsDay = iranNow.getDay(); // شنبه = 6، یکشنبه = 0، دوشنبه = 1، سه‌شنبه = 2، چهارشنبه = 3، پنجشنبه = 4، جمعه = 5
        const isMidWeekImmediate = !AppState.currentScheduleObj && (jsDay === 6 || jsDay === 0 || jsDay === 1 || jsDay === 2);
        const todayFaIdx = isMidWeekImmediate ? this.daysArr.indexOf(this.todayNameFa) : 0;

        // ۳. ساخت صف مباحث از روی بودجه آزمون (exam_budgets) و نقاط قوت/ضعف دانش‌آموز
        const skillMap = {};
        (vip.subject_skills || []).forEach(s => {
            skillMap[window.normalizeSubjectName(s.subject)] = Number(s.score) || 3;
        });

        let approvedTopics = [];
        if (latestBudgetRow && Array.isArray(latestBudgetRow.budget_data)) {
            const approvedIds = [];
            latestBudgetRow.budget_data.forEach(item => {
                if (Array.isArray(item.approved_topics)) {
                    approvedIds.push(...item.approved_topics.map(Number));
                }
            });
            approvedTopics = kgList.filter(k => approvedIds.includes(Number(k.id)));
        }
        if (approvedTopics.length === 0) {
            approvedTopics = kgList.filter(k => k.plan_type === 'macro').slice(0, 14);
        }

        // تبدیل هر مبحث به خوشه‌های درسی (Cluster) شامل باکس مطالعه + باکس تست‌زنی
        // اگر دانش‌آموز وسط هفته در هفته آزمون آمده، باکس‌های تکراری تست فشرده می‌شوند تا به بودجه آزمون برسد
        const subjectQueues = {};
        approvedTopics.forEach((topic, seqIdx) => {
            const bookName = window.normalizeSubjectName(topic.book_name);
            const isGen = this.isGeneralSubject(bookName);
            const skillScore = skillMap[bookName] || 3;

            let studyBoxesCount = Math.max(1, parseInt(topic.core_boxes, 10) || 1);
            let testBoxesCount = isGen ? 1 : (skillScore === 1 ? 2 : 1);
            if (isMidWeekImmediate && weekType === 'exam') {
                studyBoxesCount = 1;
                testBoxesCount = 1;
            }

            if (!subjectQueues[bookName]) {
                subjectQueues[bookName] = { isGeneral: isGen, blocks: [] };
            }

            for (let i = 0; i < studyBoxesCount; i++) {
                subjectQueues[bookName].blocks.push({
                    seq: seqIdx,
                    subject: bookName,
                    topic: topic.topic_name,
                    type: isGen ? 'general' : 'core',
                    is_general: isGen,
                    is_test_box: false,
                    duration: 90,
                    status: 'pending'
                });
            }
            for (let j = 0; j < testBoxesCount; j++) {
                subjectQueues[bookName].blocks.push({
                    seq: seqIdx,
                    subject: bookName,
                    topic: `${topic.topic_name} (باکس تست‌زنی)`,
                    type: isGen ? 'general' : 'core',
                    is_general: isGen,
                    is_test_box: true,
                    duration: 90,
                    status: 'pending'
                });
            }
        });

        // ۴. ساخت اسلات‌های زمانی هر روز بر اساس بازه بیداری دانش‌آموز (مثلاً ۱۰ صبح تا ۲ بامداد)
        const rawPlan = [];
        const wakeMins = Math.round((Number(studentOptions.study_start_hour) || this.studyStartHour || 7) * 60);
        const sleepMins = Math.round((Number(studentOptions.study_end_hour) || this.studyEndHour || 23.5) * 60);

        const startPref = (vip.start_subject || []).map(window.normalizeSubjectName);
        const endPref = (vip.end_subject || []).map(window.normalizeSubjectName);

        this.daysArr.forEach((dayName, dIdx) => {
            // اگر وسط هفته ثبت‌نام کرده، روزهای گذشته خالی می‌مانند
            if (dIdx < todayFaIdx || (studentOptions.full_off_days || []).includes(dayName)) {
                return;
            }

            const occupiedIntervals = [];

            // الف) افزودن کلاس‌های مدرسه و کلاس‌های ثابت دانش‌آموز از vip_settings
            (vip.class_schedule || []).forEach(cls => {
                if (Array.isArray(cls.days) && cls.days.includes(dayName)) {
                    const sM = Math.round((parseFloat(cls.startNum) || 16) * 60);
                    const eM = Math.round((parseFloat(cls.endNum) || 17.5) * 60);
                    occupiedIntervals.push({ start: sM, end: eM });
                    rawPlan.push({
                        block_id: 'blk_cls_' + Math.random().toString(36).substr(2, 6),
                        day: dayName,
                        subject: cls.name,
                        topic: cls.isOnline ? 'کلاس آنلاین' : 'کلاس حضوری',
                        type: 'class',
                        start_time: this.minsToTimeStr(sM),
                        end_time: this.minsToTimeStr(eM),
                        status: 'pending'
                    });
                }
            });

            // ب) افزودن ساعت‌های مشغله / مهمانی درخواستی در این هفته
            (studentOptions.busy_slots || []).forEach(bs => {
                if (bs.day === dayName) {
                    occupiedIntervals.push({ start: bs.startMins, end: bs.endMins });
                }
            });

            // ج) افزودن رویدادهای ثابت آزمون (مثل آزمون جمعه صبح در هفته آزمون)
            if (weekType === 'exam') {
                (fixedRes.data || []).forEach(fev => {
                    if (fev.day_of_week === dayName) {
                        const sM = (parseInt(fev.start_time, 10) || 8) * 60;
                        const eM = (parseInt(fev.end_time, 10) || 12) * 60;
                        occupiedIntervals.push({ start: sM, end: eM });
                        rawPlan.push({
                            block_id: 'blk_fix_' + Math.random().toString(36).substr(2, 6),
                            day: dayName,
                            subject: fev.title || 'آزمون آزمایشی',
                            topic: 'برنامه ثابت آزمون',
                            type: 'class',
                            start_time: this.minsToTimeStr(sM),
                            end_time: this.minsToTimeStr(eM),
                            status: 'pending'
                        });
                    }
                });
            }

            // د) افزودن باکس ناهار و شام متناسب با ساعت بیداری دانش‌آموز
            const lunchStart = Math.max(wakeMins + 180, 13 * 60 + 45);
            if (lunchStart + 60 < sleepMins) {
                occupiedIntervals.push({ start: lunchStart, end: lunchStart + 60 });
                rawPlan.push({
                    block_id: 'blk_meal_' + Math.random().toString(36).substr(2, 5),
                    day: dayName,
                    subject: 'ناهار و استراحت',
                    topic: '',
                    type: 'break',
                    start_time: this.minsToTimeStr(lunchStart),
                    end_time: this.minsToTimeStr(lunchStart + 60),
                    status: 'completed'
                });
            }

            const dinnerStart = sleepMins > 24 * 60 ? 20 * 60 + 30 : 19 * 60 + 45;
            if (dinnerStart > wakeMins && dinnerStart + 45 < sleepMins) {
                occupiedIntervals.push({ start: dinnerStart, end: dinnerStart + 45 });
                rawPlan.push({
                    block_id: 'blk_meal_' + Math.random().toString(36).substr(2, 5),
                    day: dayName,
                    subject: 'شام و استراحت',
                    topic: '',
                    type: 'break',
                    start_time: this.minsToTimeStr(dinnerStart),
                    end_time: this.minsToTimeStr(dinnerStart + 45),
                    status: 'completed'
                });
            }

            // هـ) استخراج اسلات‌های ۹۰ دقیقه‌ای خالی در طول روز (با ۱۵ دقیقه استراحت بین هر پارت)
            const freeSlots = [];
            let cursor = wakeMins;
            while (cursor + 90 <= sleepMins) {
                const slotEnd = cursor + 90;
                const conflict = occupiedIntervals.find(iv => !(slotEnd <= iv.start || cursor >= iv.end));
                if (conflict) {
                    cursor = Math.max(cursor + 15, conflict.end);
                } else {
                    freeSlots.push({ startMins: cursor, endMins: slotEnd });
                    cursor = slotEnd + 15;
                }
            }

            if (freeSlots.length === 0) return;

            // اختصاص آخرین اسلات شب در ۳ روز هفته به «بانک جبرانی»
            let studySlots = [...freeSlots];
            if (['دوشنبه', 'چهارشنبه', 'جمعه'].includes(dayName) && studySlots.length >= 3) {
                const mkpSlot = studySlots.pop();
                rawPlan.push({
                    block_id: 'blk_mkp_' + Math.random().toString(36).substr(2, 6),
                    day: dayName,
                    subject: 'بانک جبرانی',
                    topic: 'جایگزینی دروس جا مانده',
                    type: 'makeup',
                    duration: 90,
                    start_time: this.minsToTimeStr(mkpSlot.startMins),
                    end_time: this.minsToTimeStr(mkpSlot.endMins),
                    status: 'pending'
                });
            }

            // 🎯 اجرای قانون طلایی «حداقل ۳۰٪ سهم روزانه برای هر درس اختصاصی»
            const N = studySlots.length;
            const minBlocksPerSpecSubject = Math.max(2, Math.ceil(0.30 * N));

            let slotIdx = 0;
            const usedSpecSubjectsToday = [];

            while (slotIdx < studySlots.length) {
                const remainingSlotsToday = studySlots.length - slotIdx;

                // اگر آخرین اسلات شب است و درس عمومی یا درس آرام‌بخش آخر شب داریم
                if (remainingSlotsToday === 1) {
                    const endSubjCandidate = Object.keys(subjectQueues).find(k =>
                        subjectQueues[k].blocks.length > 0 && (endPref.includes(k) || subjectQueues[k].isGeneral)
                    ) || Object.keys(subjectQueues).find(k => subjectQueues[k].blocks.length > 0);

                    if (endSubjCandidate) {
                        const blk = subjectQueues[endSubjCandidate].blocks.shift();
                        const sl = studySlots[slotIdx++];
                        rawPlan.push({
                            ...blk,
                            block_id: 'blk_' + Math.random().toString(36).substr(2, 8),
                            day: dayName,
                            start_time: this.minsToTimeStr(sl.startMins),
                            end_time: this.minsToTimeStr(sl.endMins)
                        });
                        continue;
                    } else {
                        break;
                    }
                }

                // انتخاب درس اختصاصی بعدی (اولویت پارت اول صبح با قورباغه طلایی start_subject)
                let chosenSpecSubj = null;
                const availableSpecKeys = Object.keys(subjectQueues).filter(k =>
                    !subjectQueues[k].isGeneral &&
                    subjectQueues[k].blocks.length > 0 &&
                    !usedSpecSubjectsToday.includes(k)
                );

                if (slotIdx === 0) {
                    chosenSpecSubj = availableSpecKeys.find(k => startPref.includes(k)) || availableSpecKeys[0];
                } else {
                    chosenSpecSubj = availableSpecKeys[0];
                }

                if (!chosenSpecSubj) {
                    // اگر درس اختصاصی جدید نمانده بود، از هر درسی که باکس دارد بردار
                    chosenSpecSubj = Object.keys(subjectQueues).find(k => subjectQueues[k].blocks.length > 0);
                }

                if (!chosenSpecSubj) break;

                usedSpecSubjectsToday.push(chosenSpecSubj);
                const clusterSize = Math.min(remainingSlotsToday, minBlocksPerSpecSubject, subjectQueues[chosenSpecSubj].blocks.length);

                for (let c = 0; c < clusterSize; c++) {
                    const blk = subjectQueues[chosenSpecSubj].blocks.shift();
                    const sl = studySlots[slotIdx++];
                    rawPlan.push({
                        ...blk,
                        block_id: 'blk_' + Math.random().toString(36).substr(2, 8),
                        day: dayName,
                        start_time: this.minsToTimeStr(sl.startMins),
                        end_time: this.minsToTimeStr(sl.endMins)
                    });
                }
            }
        });

        // ۵. هر مبحثی که در روزهای هفته جا نشد، روی نیمکت ذخیره (bench) قرار می‌گیرد تا هفته بعد اولویت اول باشد
        Object.keys(subjectQueues).forEach(k => {
            subjectQueues[k].blocks.forEach(blk => {
                rawPlan.push({
                    ...blk,
                    block_id: 'blk_bnch_' + Math.random().toString(36).substr(2, 7),
                    day: 'bench',
                    is_benched: true
                });
            });
        });

        // ۶. ذخیره مستقیم در جدول ai_schedules با وضعیت approved (تحویل در لحظه به دانش‌آموز)
        const startIso = new Date().toISOString().split('T')[0];
        const schedulePayload = {
            national_id: uid,
            week_label: weekLabel,
            raw_plan: rawPlan,
            student_note: studentNote,
            status: 'approved',
            target_start_date: startIso,
            student_options: studentOptions,
            week_type: weekType,
            ai_motivations: {
                weekly_motivation: `${AppState.fullName.split(' ')[0]} عزیز! برنامه این هفته‌ات با قانون تمرکز عمیق ۳۰٪ (حداکثر ۲ تا ۳ درس تخصصی در روز) چیده شده تا بیشترین بازدهی و تسلط رو برای آزمون داشته باشی.`,
                daily_motivations: {
                    'شنبه': 'شروع پرقدرت هفته با تمرکز عمیق روی مباحث اصلی!',
                    'یکشنبه': 'استمرار امروز، تراز فردای تو رو می‌سازه.',
                    'دوشنبه': 'هر باکس مطالعه + تست رو کامل ببند و جلو برو!',
                    'سه‌شنبه': 'نیمه راه هفته‌ست؛ با انرژی ادامه بده قهرمان.',
                    'چهارشنبه': 'وقت تثبیت نقاط قوت و بستن مباحث هفته است.',
                    'پنجشنبه': 'مرور و جمع‌بندی نهایی قبل از آزمون!',
                    'جمعه': 'خسته نباشی! ارزیابی، تحلیل و ریکاوری برای هفته جدید.'
                }
            }
        };

        const { data: insertedRows, error } = await supabaseClient
            .from('ai_schedules')
            .insert([schedulePayload])
            .select('*');

        if (error) throw error;
        return insertedRows?.[0] || schedulePayload;
    },

    // ======================================================================
    // ⚙️ ۶. پیکربندی هسته برنامه‌ریز (VIP Setup + ساعت مطالعه شناور تا ۲ بامداد)
    // ======================================================================
    populateVipSetupUI() {
        const existing = AppState.vipSettings;
        this.selectedStartSubjects = [];
        this.selectedEndSubjects = [];
        this.selectedStrengths = [];
        this.selectedWeaknesses = [];

        const uid = String(AppState.userId || '');
        this.studyStartHour = parseFloat(Storage.get(`qotbnama_study_start_${uid}`, '7')) || 7.0;
        this.studyEndHour = parseFloat(Storage.get(`qotbnama_study_end_${uid}`, '23.5')) || 23.5;

        const inpStart = document.getElementById('inpStudyStartHour');
        const inpEnd = document.getElementById('inpStudyEndHour');
        if (inpStart) {
            inpStart.value = this.studyStartHour;
            document.getElementById('val_study_start').innerText = this.formatTimeDisplay(this.studyStartHour);
        }
        if (inpEnd) {
            inpEnd.value = this.studyEndHour;
            document.getElementById('val_study_end').innerText = this.formatExtendedTimeDisplay(this.studyEndHour);
        }

        const farhangianSection = document.getElementById('farhangianSection');
        if (farhangianSection && AppState.studentGrade === 'دوازدهم') {
            farhangianSection.style.display = 'block';
        }

        if (existing) {
            const goalInput = document.getElementById('studentGoal');
            if (goalInput && existing.student_goal) goalInput.value = existing.student_goal;

            this.selectedStartSubjects = Array.isArray(existing.start_subject) ? existing.start_subject.map(window.normalizeSubjectName) : [];
            this.selectedEndSubjects = Array.isArray(existing.end_subject) ? existing.end_subject.map(window.normalizeSubjectName) : [];

            const farhToggle = document.getElementById('farhangianToggle');
            if (farhToggle && existing.is_farhangian) farhToggle.checked = true;

            if (Array.isArray(existing.exam_type)) {
                document.querySelectorAll('.exam-chip').forEach(chip => {
                    chip.classList.toggle('active', existing.exam_type.includes(chip.dataset.exam));
                });
            }

            if (Array.isArray(existing.subject_skills)) {
                existing.subject_skills.forEach(s => {
                    const normS = window.normalizeSubjectName(s.subject);
                    if (s.score === 5) this.selectedStrengths.push(normS);
                    if (s.score === 1) this.selectedWeaknesses.push(normS);
                });
            }

            const sumEl = document.getElementById('vipSetupSummaryText');
            if (sumEl) {
                sumEl.innerText = `بازه مطالعه: ${this.formatTimeDisplay(this.studyStartHour)} تا ${this.formatExtendedTimeDisplay(this.studyEndHour)} • ${(existing.class_schedule || []).length} کلاس ثبت‌شده`;
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
            : ["زیست‌شناسی ۱", "فیزیک ۱", "شیمی ۱", "ریاضی ۱"];

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

        const uid = String(AppState.userId || '');
        this.studyStartHour = parseFloat(document.getElementById('inpStudyStartHour')?.value) || 7.0;
        this.studyEndHour = parseFloat(document.getElementById('inpStudyEndHour')?.value) || 23.5;

        Storage.set(`qotbnama_study_start_${uid}`, String(this.studyStartHour));
        Storage.set(`qotbnama_study_end_${uid}`, String(this.studyEndHour));

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
            this.populateVipSetupUI();
            this.toggleSetupPanel();
            UI.showToast('پیکربندی هسته و بازه ساعت مطالعه با موفقیت ذخیره شد.', 'success');
        } catch (err) {
            UI.showToast('خطا در ذخیره تنظیمات در سرور.', 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i data-lucide="save" class="icon"></i><span>ذخیره پیکربندی هسته</span>';
                UI.refreshIcons();
            }
        }
    }
};

window.PlanningModule = PlanningModule;
