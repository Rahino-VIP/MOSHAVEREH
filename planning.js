/* ==========================================================================
   🗓️ ماژول جامع برنامه‌ریزی هوشمند (js/planning.js) - نسخه فرانت‌اند امن و مینیمال
   شامل:
   ۱. پشتیبانی از ۳ سطح اشتراک:
      - رایگان (free_trial): امکان دریافت ۱ بار برنامه هوشمند رایگان
      - پرو بدون مشاور (pro_auto): باز بودن در طول هفته برای رسیدن به بودجه آزمون + قفل ضدتکرار هفتگی
      - با مشاور (consultant): باز شدن در پنجره آخر هفته + ارسال به میز مشاور
   ۲. سیستم ثبت معذوریت‌های زمانی با روز، ساعت و «عنوان و علت معذوریت» + هشدار عدم تایید دلایل غیرموجه
   ۳. اتصال مستقیم پارت‌های عملیات امروز به تایمر سینماتیک کوپه قطار (TimerModule)
   ۴. حذف کامل الگوریتم از فرانت‌اند و فراخوانی امن از بک‌اند (generate_smart_schedule_rpc)
   ========================================================================== */

const PlanningModule = {
    daysArr: ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'],
    todayNameFa: 'شنبه',
    renderDayFa: 'شنبه',
    isInitialScheduleLoad: true,
    hasCelebratedToday: false,

    classCount: 0,
    busySlotCount: 0,
    selectedStartSubjects: [],
    selectedEndSubjects: [],
    selectedStrengths: [],
    selectedWeaknesses: [],
    studyStartHour: 7.0,
    studyEndHour: 23.5,

    allUserSchedulesHistory: [], // شاملទាំង برنامه‌های approved و pending برای کنترل سهمیه و جلوگیری از تکرار
    activeCalendarWeek: null,

    toFa(val) {
        if (val === null || val === undefined) return '';
        return String(val).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
    },

    // ======================================================================
    // 🧭 ۱. راه‌اندازی، بارگذاری تاریخچه درخواست‌ها و بررسی سطح اشتراک
    // ======================================================================
    async init() {
        try {
            this.todayNameFa = new Intl.DateTimeFormat('fa-IR', { weekday: 'long' }).format(new Date());
            if (this.daysArr.includes(this.todayNameFa)) {
                this.renderDayFa = this.todayNameFa;
            }
        } catch (_) {
            this.todayNameFa = 'شنبه';
        }

        await this.loadPlanningMetaFromDB();
        this.updateTopTierBadge();

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
                    <div class="card-box center-card" style="padding: 28px 16px;">
                        <i data-lucide="calendar-plus" class="icon-xl primary-text" style="margin-bottom:8px;"></i>
                        <h3 style="font-size:14px; font-weight:900; margin-bottom:6px;">هنوز برنامه‌ای برای این هفته شما ثبت نشده است</h3>
                        <p class="muted-desc" style="font-size:11.5px;">از تب «۳. اتاق فکر» می‌توانید برنامه هفتگی هوشمند خود را دریافت کنید.</p>
                        <button type="button" class="btn-primary-full" style="max-width:230px; margin:0 auto;" onclick="PlanningModule.switchSubtab('request', document.querySelectorAll('#tab-planning .subtab-btn')[2])">
                            <i data-lucide="sparkles" class="icon-sm"></i>
                            <span>رفتن به اتاق فکر</span>
                        </button>
                    </div>`;
            }
            this.showWeekEmptyState("هنوز برنامه‌ای برای نمایش در تقویم ثبت نشده است.");
        }

        this.populateVipSetupUI();
        await this.initRequestSubtab();
        UI.refreshIcons();
    },

    async loadPlanningMetaFromDB() {
        const uid = String(AppState.userId || '');
        if (!uid) return;
        try {
            const [schRes, calRes] = await Promise.all([
                supabaseClient.from('ai_schedules').select('id, week_label, status, target_start_date, created_at').eq('national_id', uid).order('created_at', { ascending: false }),
                supabaseClient.from('week_status_calendar').select('*').order('start_date', { ascending: false }).limit(2)
            ]);
            this.allUserSchedulesHistory = schRes.data || [];
            if (calRes.data && calRes.data.length > 0) {
                this.activeCalendarWeek = calRes.data[0];
            }
        } catch (_) {}
    },

    // تعیین حالت دسترسی کاربر:
    // 'consultant' (اشتراک پلاس یا VIP با مشاور) | 'pro_auto' (اشتراک پرو بدون مشاور) | 'free_trial' (نسخه رایگان با ۱ بار سهمیه تست)
    getUserPlanningAccessMode() {
        if (AppState.isConsultant) return 'consultant';
        if (AppState.isPlusOrHigher || AppState.accessTier === 'pro') return 'pro_auto';
        return 'free_trial';
    },

    updateTopTierBadge() {
        const bdg = document.getElementById('planningTierBadge');
        if (!bdg) return;
        const mode = this.getUserPlanningAccessMode();
        if (mode === 'consultant') bdg.innerText = 'با نظارت مشاور';
        else if (mode === 'pro_auto') bdg.innerText = 'اشتراک پرو (هوشمند)';
        else bdg.innerText = 'نسخه رایگان (۱ تست هدیه)';
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
        if (lbl) lbl.innerText = isHidden ? 'بستن' : 'ویرایش هسته';
        UI.refreshIcons();
    },

    timeStrToMins(timeStr) {
        if (!timeStr) return 0;
        const clean = UI.toEngDigits(String(timeStr));
        const parts = clean.split(':');
        let h = parseInt(parts[0], 10) || 0;
        const m = parseInt(parts[1], 10) || 0;
        if (h < 5) h += 24;
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
        return this.toFa(`${h < 10 ? '0' + h : h}:${m === 0 ? '00' : '30'}`);
    },

    formatExtendedTimeDisplay(val) {
        const num = parseFloat(val);
        let h = Math.floor(num);
        const m = (num - h) * 60;
        const suffix = h >= 24 ? ' بامداد' : '';
        if (h >= 24) h -= 24;
        return this.toFa(`${h < 10 ? '0' + h : h}:${m === 0 ? '00' : '30'}${suffix}`);
    },

    // ======================================================================
    // 🎯 ۲. عملیات امروز و اتصال مستقیم به تایمر سینماتیک کوپه قطار
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
                p.type !== 'busy' &&
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

        const motivationBox = document.getElementById('aiMotivationBox');
        const motivationText = document.getElementById('aiMotivationText');
        if (AppState.currentScheduleObj.ai_motivations && motivationBox && motivationText) {
            const aiMotivations = typeof AppState.currentScheduleObj.ai_motivations === 'string'
                ? JSON.parse(AppState.currentScheduleObj.ai_motivations)
                : AppState.currentScheduleObj.ai_motivations;

            const todaysMessage = aiMotivations?.daily_motivations?.[this.renderDayFa];
            const uid = String(AppState.userId || '');
            if (todaysMessage && Storage.get(`dismissed_daily_${uid}`) !== todaysMessage) {
                motivationText.innerText = this.toFa(todaysMessage);
                motivationBox.style.display = 'block';
            } else {
                motivationBox.style.display = 'none';
            }
        }

        const todaysBlocks = planArr.filter(p =>
            p.day === this.renderDayFa &&
            p.subject !== 'بانک جبرانی' &&
            p.type !== 'busy' &&
            !String(p.subject).includes('ناهار') &&
            !String(p.subject).includes('شام') &&
            (p.type !== 'class' || p.topic === 'کلاس آنلاین')
        );

        todaysBlocks.sort((a, b) => this.timeStrToMins(a.start_time) - this.timeStrToMins(b.start_time));
        const pendingTasks = todaysBlocks.filter(p => p.status === 'pending');

        if (todaysBlocks.length > 0 && pendingTasks.length === 0) {
            container.innerHTML = `
                <div class="card-box" style="text-align:center; padding: 28px 18px; background: var(--success-fade); border-color: var(--success);">
                    <i data-lucide="trophy" class="icon-xl" style="color:var(--success); margin-bottom:8px;"></i>
                    <h3 style="color: var(--success); margin-bottom: 4px; font-weight:900; font-size:15px;">آفرین قهرمان!</h3>
                    <p style="color:var(--text-muted); font-size: 12px;">تمام مأموریت‌های ${this.renderDayFa} را با موفقیت تکمیل کردی.</p>
                </div>`;
            this.updateProgressBar();
            UI.refreshIcons();
            return;
        }

        if (todaysBlocks.length === 0) {
            container.innerHTML = `<div class="card-box" style="text-align:center; color:var(--text-muted); padding:28px;">امروز مأموریتی در برنامه ثبت نشده است.</div>`;
            this.updateProgressBar();
            return;
        }

        todaysBlocks.forEach(part => {
            if (part.status === 'shifted') return;
            const cardClass = part.status === 'completed' ? 'completed' : '';
            const safeSubj = String(part.subject || '').replace(/'/g, "\\'");
            const safeTopic = String(part.topic || '').replace(/'/g, "\\'");
            const startFa = this.toFa(part.start_time);
            const endFa = this.toFa(part.end_time);

            container.innerHTML += `
                <div class="quest-card ${cardClass}" id="card_${part.block_id}">
                    <div class="quest-info">
                        <div class="quest-time"><i data-lucide="clock" class="icon-sm" style="width:12px;height:12px;"></i><span>از ${startFa} تا ${endFa}</span></div>
                        <div class="quest-title">${this.toFa(part.subject)}</div>
                        <div class="quest-desc">${this.toFa(part.topic || '')}</div>
                    </div>
                    <div class="quest-actions">
                        <button type="button" class="action-circle" onclick="PlanningModule.shiftQuest('${part.block_id}')" title="انتقال به بانک جبرانی">
                            <i data-lucide="refresh-cw" class="icon-sm"></i>
                        </button>
                        ${part.type !== 'class' ? `
                            <button type="button" class="action-circle" onclick="PlanningModule.startQuestWithCinematicTimer('${part.block_id}', '${safeSubj}', '${safeTopic}', '${part.start_time}', '${part.end_time}')" title="شروع با تایمر کوپه قطار">
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

    // ✅ اتصال مستقیم به تایمر جدید کوپه قطار با پیش‌فرض ۹۰ دقیقه مطالعه و ۱۵ دقیقه استراحت
    startQuestWithCinematicTimer(blockId, subject, topic, startTime, endTime) {
        let durationMins = this.timeStrToMins(endTime) - this.timeStrToMins(startTime);
        if (durationMins <= 0 || durationMins > 180) durationMins = 90;

        const fullTitle = `${subject}${topic ? ' • ' + topic : ''}`;
        if (window.TimerModule && typeof window.TimerModule.openImmersiveTimer === 'function') {
            window.TimerModule.activeQuestBlockId = blockId;
            window.TimerModule.openImmersiveTimer(fullTitle, durationMins);
        } else if (window.ToolsModule && typeof window.ToolsModule.openImmersiveTimer === 'function') {
            window.ToolsModule.activeQuestBlockId = blockId;
            window.ToolsModule.openImmersiveTimer(fullTitle, durationMins);
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
                    UI.showToast('باکس جبرانی خالی نبود؛ این مبحث برای برنامه بعدی شما ذخیره شد.', 'info');
                } else {
                    origBlock.status = 'shifted';
                    for (let i = 0; i < neededMakeups; i++) {
                        const mIdx = availableMakeups[i];
                        planArr[mIdx].subject = origBlock.subject + (neededMakeups > 1 ? ` (بخش ${this.toFa(i + 1)})` : " (جبرانی)");
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
            p.type !== 'busy' &&
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

        if (progressText) progressText.innerText = `${this.toFa(percent)}٪`;
        if (progressBar) progressBar.style.width = `${percent}%`;
        if (homeProg) homeProg.innerText = `${this.toFa(percent)}٪`;

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
    // 📅 ۳. تقویم گرافیکی هفته (بدون قابلیت ویرایش دستی) + دانلود عکس و PDF
    // ======================================================================
    setupWeekSelectorDropdown() {
        const container = document.getElementById('weekDropdownContainer');
        if (!container || !AppState.allSchedules || AppState.allSchedules.length === 0) return;

        const currentLabel = this.toFa(AppState.currentScheduleObj?.week_label || 'هفته جاری');
        const itemsHtml = AppState.allSchedules.map(sch => `
            <div class="custom-select-item ${sch.id === AppState.currentScheduleObj?.id ? 'selected' : ''}"
                 onclick="PlanningModule.selectScheduleWeek('${sch.id}', '${this.toFa(sch.week_label || 'برنامه هفته')}')">
                <span>${this.toFa(sch.week_label || 'برنامه هفته')}</span>
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
        AppState.currentScheduleObj = (AppState.allSchedules || []).find(s => String(s.id) === String(schId)) || AppState.currentScheduleObj;
        const lbl = document.getElementById('weekSelectLabel');
        if (lbl) lbl.innerText = label;

        document.getElementById('weekSelectWrap')?.classList.remove('open');

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
            p.type !== 'busy' &&
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

        document.getElementById('successPercentText').innerText = `${this.toFa(compPercent)}٪ انجام شده`;
        document.getElementById('dangerPercentText').innerText = `${this.toFa(shiftPercent)}٪ جبرانی`;
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
            timeColHtml += `<div class="gcal-time-slot">${this.toFa(String(displayH).padStart(2, '0'))}:۰۰</div>`;
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
                else if (part.type === 'busy') bgColor = "#7c2d12"; // رنگ مشخص برای معذوریت‌های شخصی درج‌شده در برنامه
                else if (part.subject === 'بانک جبرانی') bgColor = "#64748b";
                else if (String(part.subject).includes("ناهار") || String(part.subject).includes("شام")) bgColor = "#475569";

                if (part.status === 'completed' && part.type !== 'break' && part.type !== 'busy') bgColor = "var(--success)";
                else if (part.status === 'shifted') bgColor = "var(--danger)";

                const statusClass = part.status === 'completed' ? 'completed' : (part.status === 'shifted' ? 'shifted' : '');
                const topicHtml = part.topic ? `<div class="event-topic">${this.toFa(part.topic)}</div>` : '';

                dayHtml += `
                    <div class="gcal-event ${statusClass}" style="top: ${topPx}px; height: ${heightPx}px; background: ${bgColor};">
                        <div style="font-weight:900;font-size:10px;">${this.toFa(part.subject)}</div>
                        ${topicHtml}
                        <div style="font-size:8.5px; margin-top:auto;">${this.toFa(part.start_time)} تا ${this.toFa(part.end_time)}</div>
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
                <div style="padding: 44px 18px; text-align: center; width: 100%;">
                    <i data-lucide="calendar-x" class="icon-xl" style="color:var(--text-muted); margin-bottom:8px;"></i>
                    <h3 style="color: var(--text-muted); font-size: 13px;">${msg}</h3>
                </div>`;
        }
        const progBox = document.getElementById('weeklyProgressBox');
        if (progBox) progBox.style.display = 'none';
    },

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

        ctx.fillStyle = '#0e1514';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

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
        ctx.fillText(`${this.toFa(AppState.currentScheduleObj.week_label || 'برنامه هفتگی')} • پایه ${AppState.studentGrade} ${AppState.studentMajor}`, 1540, 95);

        const startY = 130;
        const rowH = 130;

        this.daysArr.forEach((day, dIdx) => {
            const y = startY + (dIdx * rowH);
            ctx.fillStyle = dIdx % 2 === 0 ? '#16201e' : '#1b2725';
            ctx.fillRect(30, y, 1540, rowH - 10);

            ctx.fillStyle = '#639889';
            ctx.fillRect(1450, y, 120, rowH - 10);
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 20px Vazirmatn, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(day, 1510, y + 68);

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

                ctx.fillStyle = blk.type === 'class' ? '#334155' : (blk.type === 'busy' ? '#7c2d12' : (blk.subject === 'بانک جبرانی' ? '#475569' : '#243b35'));
                ctx.fillRect(bx, y + 10, boxW, rowH - 30);
                ctx.strokeStyle = blk.status === 'completed' ? '#10b981' : '#77bba9';
                ctx.lineWidth = 1.5;
                ctx.strokeRect(bx, y + 10, boxW, rowH - 30);

                ctx.fillStyle = '#77bba9';
                ctx.font = 'bold 13px Vazirmatn, sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(`از ${this.toFa(blk.start_time)} تا ${this.toFa(blk.end_time)}`, bx + boxW / 2, y + 34);

                ctx.fillStyle = '#ffffff';
                ctx.font = 'bold 15px Vazirmatn, sans-serif';
                ctx.fillText(this.toFa(String(blk.subject).slice(0, 22)), bx + boxW / 2, y + 62);

                ctx.fillStyle = '#cbd5e1';
                ctx.font = '12px Vazirmatn, sans-serif';
                ctx.fillText(this.toFa(String(blk.topic || '').slice(0, 26)), bx + boxW / 2, y + 86);
            });
        });

        const link = document.createElement('a');
        link.download = `Qotbnama-Schedule-${AppState.userId}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();
        UI.showToast('تصویر باکیفیت برنامه هفتگی دانلود شد.', 'success');
    },

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
                    <div style="font-size:11px; color:#0f766e; font-weight:bold;">از ${this.toFa(b.start_time)} تا ${this.toFa(b.end_time)}</div>
                    <div style="font-size:13px; font-weight:900; color:#1e293b; margin:3px 0;">${this.toFa(b.subject)}</div>
                    <div style="font-size:10.5px; color:#64748b;">${this.toFa(b.topic || '')}</div>
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
                <style>
                    @page { size: A4 landscape; margin: 10mm; }
                    body { font-family: 'Vazirmatn', Tahoma, sans-serif; direction: rtl; color: #1e293b; }
                    .header { display:flex; justify-content:space-between; align-items:center; border-bottom:3px solid #0f766e; padding-bottom:10px; margin-bottom:14px; }
                    table { width: 100%; border-collapse: collapse; table-layout: fixed; }
                </style>
            </head>
            <body>
                <div class="header">
                    <div>
                        <h2 style="margin:0; color:#0f766e;">برنامه مطالعاتی هوشمند قطب‌نمای راهینو</h2>
                        <small>${this.toFa(AppState.currentScheduleObj.week_label || 'برنامه هفتگی')}</small>
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
    // 💡 ۴. اتاق فکر، سیستم ثبت معذوریت با «عنوان اجباری» و کنترل قوانین اشتراک
    // ======================================================================
    buildHourOptionsHtml(defaultVal = 16, isEnd = false) {
        let html = !isEnd ? `<option value="full_day">کل روز (عدم مطالعه در کل روز)</option>` : '';
        const startH = isEnd ? 7 : 6;
        const endH = isEnd ? 26 : 24;
        for (let h = startH; h <= endH; h += 0.5) {
            const label = this.formatExtendedTimeDisplay(h);
            const sel = Number(h) === Number(defaultVal) ? 'selected' : '';
            html += `<option value="${h}" ${sel}>${isEnd ? 'تا ' : 'از '}${label}</option>`;
        }
        return html;
    },

    onBusyStartSelectChange(selEl, rowId) {
        const endSel = document.querySelector(`#busySlot_${rowId} .busy-end`);
        if (!endSel) return;
        if (selEl.value === 'full_day') {
            endSel.style.display = 'none';
        } else {
            endSel.style.display = 'block';
        }
    },

    // ✅ افزودن ردیف معذوریت شامل: روز هفته + بازه ساعت (یا کل روز) + عنوان و علت معذوریت
    addBusySlotRow() {
        this.busySlotCount++;
        const id = this.busySlotCount;
        const container = document.getElementById('busySlotsListContainer');
        if (!container) return;

        const row = document.createElement('div');
        row.className = 'busy-slot-item';
        row.id = `busySlot_${id}`;

        const dayOpts = this.daysArr.map(d => `<option value="${d}">${d}</option>`).join('');
        row.innerHTML = `
            <div class="busy-slot-top">
                <select class="modern-input busy-day" style="padding:7px 8px; font-size:11.5px;">${dayOpts}</select>
                <select class="modern-input busy-start" style="padding:7px 8px; font-size:11.5px;" onchange="PlanningModule.onBusyStartSelectChange(this, ${id})">
                    ${this.buildHourOptionsHtml(16, false)}
                </select>
                <select class="modern-input busy-end" style="padding:7px 8px; font-size:11.5px;">
                    ${this.buildHourOptionsHtml(20, true)}
                </select>
                <button type="button" class="del-icon-btn" style="width:32px;height:32px;" onclick="document.getElementById('busySlot_${id}').remove()" title="حذف">
                    <i data-lucide="trash-2" class="icon-sm"></i>
                </button>
            </div>
            <input type="text" class="modern-input busy-reason" style="padding:8px 10px; font-size:11.5px;"
                   placeholder="عنوان و علت دقیق معذوریت (الزامی - مثلاً: نوبت دندان‌پزشکی، مهمانی خانوادگی...)">
        `;
        container.appendChild(row);
        UI.refreshIcons();
    },

    // بررسی اینکه آیا دانش‌آموز قبلاً برای چرخه هفته فعلی برنامه گرفته است یا خیر (جلوگیری از ساخت چند برنامه در یک هفته)
    hasScheduleForCurrentCycle(isThursdayFridayWindow) {
        if (!this.allUserSchedulesHistory || this.allUserSchedulesHistory.length === 0) return false;

        // ۱. اگر در پنجره پنجشنبه شب/جمعه هستیم، بررسی کن آیا در ۳۶ ساعت اخیر برنامه جدیدی برای هفته آینده گرفته است؟
        const nowMs = Date.now();
        const latestSch = this.allUserSchedulesHistory[0];
        const latestCreatedMs = latestSch.created_at ? new Date(latestSch.created_at).getTime() : 0;

        if (isThursdayFridayWindow) {
            return (nowMs - latestCreatedMs) < (36 * 3600 * 1000);
        }

        // ۲. در طول هفته (شنبه تا پنجشنبه عصر): اگر برنامه فعالی دارد که مربوط به همین هفته است
        if (this.activeCalendarWeek && latestSch.week_label && latestSch.week_label.includes(this.activeCalendarWeek.title)) {
            return true;
        }
        // یا اگر در ۵ روز اخیر برنامه‌ای دریافت کرده است
        if ((nowMs - latestCreatedMs) < (5 * 24 * 3600 * 1000)) {
            return true;
        }

        return false;
    },

    async initRequestSubtab() {
        const accessMode = this.getUserPlanningAccessMode();
        const iranTime = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Tehran" }));
        const currentDay = iranTime.getDay(); // 4 = پنجشنبه، 5 = جمعه
        const currentHour = iranTime.getHours();
        const isThursdayFridayWindow = (currentDay === 4 && currentHour >= 20) || (currentDay === 5 && currentHour <= 23);

        const lockMsg = document.getElementById('timeLockMessage');
        const formContent = document.getElementById('requestFormContent');
        const btnLabel = document.getElementById('btnRequestPlanLabel');
        const freeBanner = document.getElementById('freeTrialPlanBanner');
        const warnNote = document.getElementById('consultantStrictnessNote');

        if (freeBanner) freeBanner.style.display = accessMode === 'free_trial' ? 'block' : 'none';
        if (warnNote) {
            warnNote.innerHTML = accessMode === 'consultant'
                ? `<i data-lucide="alert-triangle" class="icon-sm"></i><span><strong>تذکر بسیار مهم مشاور:</strong> روز، ساعت و <strong>عنوان دقیق معذوریت</strong> خود را بنویسید تا در برنامه‌تان ثبت شود. اگر به دلیل غیرموجهی اعلام معذوریت کنید، مشاور آن را تایید نکرده و در آن تایم نیز برایتان برنامه مطالعاتی می‌چیند!</span>`
                : `<i data-lucide="info" class="icon-sm" style="color:var(--primary);"></i><span>روز، ساعت و <strong>عنوان معذوریت</strong> خود را وارد کنید تا عنوان آن در تقویم هفتگی شما ثبت شده و در آن ساعت برایتان پارت درسی چیده نشود.</span>`;
        }

        // الف) بررسی وضعیت کاربر رایگان (فقط ۱ بار سهمیه کل)
        if (accessMode === 'free_trial') {
            if (this.allUserSchedulesHistory.length >= 1) {
                if (formContent) formContent.style.display = 'none';
                if (lockMsg) {
                    lockMsg.style.display = 'block';
                    lockMsg.style.borderColor = 'var(--gold)';
                    lockMsg.style.background = 'var(--gold-fade)';
                    lockMsg.innerHTML = `
                        <i data-lucide="crown" class="icon-xl gold-text"></i>
                        <h4 class="gold-text">سهمیه ۱ بار برنامه رایگان شما استفاده شده است</h4>
                        <p style="margin-bottom:12px;">شما ۱ بار برنامه هوشمند هدیه خود را دریافت کرده‌اید. برای دریافت مستمر برنامه در تمام هفته‌ها تا روز کنکور، اشتراک پرو یا مشاوره تهیه فرمایید.</p>
                        <button type="button" class="btn-primary-full" style="max-width:240px; margin:0 auto;" onclick="Router.openSubPage('store-renew')">
                            <i data-lucide="sparkles" class="icon-sm"></i><span>مشاهده و تهیه اشتراک</span>
                        </button>
                    `;
                }
                UI.refreshIcons();
                return;
            } else {
                // کاربر رایگان که هنوز ۱ بار سهمیه‌اش را استفاده نکرده -> فرم برایش باز است
                if (lockMsg) lockMsg.style.display = 'none';
                if (formContent) formContent.style.display = 'block';
                if (btnLabel) btnLabel.innerText = 'دریافت اولین برنامه هوشمند (هدیه رایگان)';
                await this.loadDynamicSwitches();
                UI.refreshIcons();
                return;
            }
        }

        // ب) بررسی وضعیت کاربر «پرو - بدون مشاور» (همیشه باز برای هفته بدون برنامه، اما قفل پس از دریافت برنامه همان هفته)
        if (accessMode === 'pro_auto') {
            const alreadyHasForThisCycle = this.hasScheduleForCurrentCycle(isThursdayFridayWindow);
            if (alreadyHasForThisCycle) {
                if (formContent) formContent.style.display = 'none';
                if (lockMsg) {
                    lockMsg.style.display = 'block';
                    lockMsg.style.borderColor = 'var(--success)';
                    lockMsg.style.background = 'var(--success-fade)';
                    lockMsg.innerHTML = `
                        <i data-lucide="check-circle-2" class="icon-xl success-text"></i>
                        <h4 class="success-text">برنامه این هفته شما صادر و فعال شده است!</h4>
                        <p>برنامه شما در تب «عملیات امروز» و «تقویم هفته» فعال است. جهت حفظ نظم مطالعاتی، امکان ساخت چند برنامه در یک هفته وجود ندارد. پنجره دریافت برنامه هفته آینده از <strong>پنجشنبه ساعت ۲۰:۰۰</strong> باز می‌شود.</p>
                    `;
                }
            } else {
                if (lockMsg) lockMsg.style.display = 'none';
                if (formContent) formContent.style.display = 'block';
                if (btnLabel) btnLabel.innerText = 'ساخت و دریافت فوری برنامه هوشمند';
                await this.loadDynamicSwitches();
            }
            UI.refreshIcons();
            return;
        }

        // ج) بررسی وضعیت شاگرد «با مشاور» (فقط پنجشنبه ۲۰:۰۰ تا جمعه شب + بررسی عدم ارسال تکراری)
        const latestPending = this.allUserSchedulesHistory.find(s => s.status === 'pending');
        if (latestPending) {
            if (formContent) formContent.style.display = 'none';
            if (lockMsg) {
                lockMsg.style.display = 'block';
                lockMsg.style.borderColor = 'var(--gold)';
                lockMsg.style.background = 'var(--gold-fade)';
                lockMsg.innerHTML = `
                    <i data-lucide="hourglass" class="icon-xl gold-text"></i>
                    <h4 class="gold-text">درخواست شما روی میز مشاور قرار دارد</h4>
                    <p>فرم استراتژی شما ثبت شده است و به محض بررسی و تایید توسط مشاور، برنامه هفته جدید در تقویم شما فعال خواهد شد.</p>
                `;
            }
        } else if (!isThursdayFridayWindow) {
            if (formContent) formContent.style.display = 'none';
            if (lockMsg) {
                lockMsg.style.display = 'block';
                lockMsg.style.borderColor = 'var(--danger)';
                lockMsg.style.background = 'var(--danger-fade)';
                lockMsg.innerHTML = `
                    <i data-lucide="lock" class="icon-xl danger-text"></i>
                    <h4>پنجره درخواست برنامه هفتگی بسته است</h4>
                    <p>فرم ثبت معذوریت‌ها و درخواست برنامه هفتگی، هر هفته از <strong>پنجشنبه ساعت ۲۰:۰۰</strong> تا <strong>جمعه شب</strong> باز می‌شود.</p>
                `;
            }
        } else {
            if (lockMsg) lockMsg.style.display = 'none';
            if (formContent) formContent.style.display = 'block';
            if (btnLabel) btnLabel.innerText = 'ارسال استراتژی و معذوریت‌ها به میز مشاور';
            await this.loadDynamicSwitches();
        }
        UI.refreshIcons();
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
                            <span style="font-size:12px; font-weight:800;">${this.toFa(sw.title)}</span>
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

    // جمع‌آوری و اعتبارسنجی معذوریت‌های زمانی دانش‌آموز (روز + ساعت + عنوان اجباری)
    collectAndValidateBusyConstraints() {
        const busySlots = [];
        const fullOffDays = [];
        let hasMissingReason = false;

        document.querySelectorAll('#busySlotsListContainer .busy-slot-item').forEach(row => {
            const day = row.querySelector('.busy-day')?.value;
            const startVal = row.querySelector('.busy-start')?.value;
            const endVal = parseFloat(row.querySelector('.busy-end')?.value) || 20;
            const reason = row.querySelector('.busy-reason')?.value.trim() || '';

            if (!reason) {
                hasMissingReason = true;
                row.querySelector('.busy-reason')?.focus();
                return;
            }

            if (startVal === 'full_day') {
                if (!fullOffDays.includes(day)) fullOffDays.push(day);
                busySlots.push({
                    day: day,
                    is_full_day: true,
                    startMins: Math.round(this.studyStartHour * 60),
                    endMins: Math.round(this.studyEndHour * 60),
                    start_time: this.minsToTimeStr(Math.round(this.studyStartHour * 60)),
                    end_time: this.minsToTimeStr(Math.round(this.studyEndHour * 60)),
                    title: reason
                });
            } else {
                const sNum = parseFloat(startVal) || 16;
                const eNum = Math.max(sNum + 0.5, endVal);
                busySlots.push({
                    day: day,
                    is_full_day: false,
                    startMins: Math.round(sNum * 60),
                    endMins: Math.round(eNum * 60),
                    start_time: this.minsToTimeStr(Math.round(sNum * 60)),
                    end_time: this.minsToTimeStr(Math.round(eNum * 60)),
                    title: reason
                });
            }
        });

        return { busySlots, fullOffDays, hasMissingReason };
    },

    // 🔐 ارسال درخواست به تابع امن بک‌اند (بدون وجود هیچ‌گونه الگوریتم در فرانت‌اند)
    async sendScheduleRequest() {
        if (!AppState.vipSettings) {
            UI.showToast('لطفاً ابتدا از دکمه بالای صفحه، «ویرایش هسته» (ساعت مطالعه و کلاس‌های ثابت) را ذخیره کنید.', 'error');
            this.toggleSetupPanel();
            return;
        }

        const constraints = this.collectAndValidateBusyConstraints();
        if (constraints.hasMissingReason) {
            return UI.showToast('لطفاً برای تمامی معذوریت‌های زمانی که اضافه کرده‌اید، «عنوان و علت معذوریت» را بنویسید.', 'error');
        }

        const accessMode = this.getUserPlanningAccessMode();
        const btn = document.getElementById('btnRequestPlan');
        const note = document.getElementById('nextWeekNote')?.value.trim() || '';

        const studentOptions = {
            access_mode: accessMode,
            study_start_hour: this.studyStartHour,
            study_end_hour: this.studyEndHour,
            full_off_days: constraints.fullOffDays,
            busy_slots: constraints.busySlots,
            request_day_fa: this.todayNameFa
        };

        document.querySelectorAll('.dynamic-toggle-input').forEach(toggle => {
            const key = toggle.getAttribute('data-key');
            if (key) studentOptions[key] = toggle.checked;
        });

        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span>در حال پردازش در هسته مرکزی...</span>';
        }

        try {
            // فراخوانی تابع الگوریتم در بک‌اند دیتابیس
            const { data: newSchedule, error } = await supabaseClient.rpc('generate_smart_schedule_rpc', {
                p_student_note: note,
                p_student_options: studentOptions
            });

           this.enrichMotivationsWithAiAsync(newSchedule, note);

            if (error) {
                if (error.message && error.message.includes('TRIAL_LIMIT_REACHED')) {
                    UI.openModal('upsellModal');
                    return;
                }
                throw new Error(error.message);
            }

            await this.loadPlanningMetaFromDB();

            if (newSchedule && newSchedule.status === 'approved') {
                AppState.allSchedules.unshift(newSchedule);
                AppState.currentScheduleObj = newSchedule;
                this.determineRenderDay();
                this.renderTodayTab();
                this.setupWeekSelectorDropdown();
                this.updateWeeklyProgress();
                this.renderGCal();
                await this.initRequestSubtab();

                UI.showToast('🎉 برنامه هوشمند شما ساخته شد و هم‌اکنون فعال است!', 'success');
                this.switchSubtab('week', document.querySelectorAll('#tab-planning .subtab-btn')[1]);
            } else {
                await this.initRequestSubtab();
                UI.showToast('✅ استراتژی و معذوریت‌های شما ثبت شد و برای بررسی و تایید به میز مشاور ارسال گردید.', 'success');
            }
        } catch (err) {
            UI.showToast(err.message || 'خطا در ارتباط با هسته برنامه‌ریز', 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i data-lucide="sparkles" class="icon-sm"></i><span>دریافت برنامه هوشمند</span>';
                UI.refreshIcons();
            }
        }
    },

    // ======================================================================
    // ⚙️ ۵. پیکربندی هسته برنامه‌ریز (VIP Setup) با اعداد ۱۰۰٪ فارسی
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
                const clsCountFa = this.toFa((existing.class_schedule || []).length);
                sumEl.innerText = `مطالعه: ${this.formatTimeDisplay(this.studyStartHour)} تا ${this.formatExtendedTimeDisplay(this.studyEndHour)} • ${clsCountFa} کلاس ثبت‌شده`;
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
                startContainer.innerHTML += `<div class="chip ${this.selectedStartSubjects.includes(subj) ? 'active' : ''}" onclick="PlanningModule.toggleVipSubject(this, '${subj}', 'start')">${this.toFa(subj)}</div>`;
            }
            if (endContainer) {
                endContainer.innerHTML += `<div class="chip ${this.selectedEndSubjects.includes(subj) ? 'active' : ''}" onclick="PlanningModule.toggleVipSubject(this, '${subj}', 'end')">${this.toFa(subj)}</div>`;
            }
            if (strContainer) {
                strContainer.innerHTML += `<div class="chip ${this.selectedStrengths.includes(subj) ? 'active' : ''}" onclick="PlanningModule.toggleEvalSubject(this, '${subj}', 'strength')">${this.toFa(subj)}</div>`;
            }
            if (weakContainer) {
                weakContainer.innerHTML += `<div class="chip ${this.selectedWeaknesses.includes(subj) ? 'active' : ''}" onclick="PlanningModule.toggleEvalSubject(this, '${subj}', 'weakness')">${this.toFa(subj)}</div>`;
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
            <div style="display:flex; justify-content:space-between; gap: 8px; margin-bottom: 10px;">
                <input type="text" class="modern-input c-name" placeholder="نام برنامه (مثلاً مدرسه، کلاس فیزیک...)" value="${nameVal}" style="flex:1;">
                <button type="button" class="del-icon-btn" onclick="document.getElementById('class_${id}').remove()" title="حذف کلاس">
                    <i data-lucide="trash-2" class="icon-sm"></i>
                </button>
            </div>
            <div style="margin-bottom: 12px;">
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

            const sNum = parseFloat(card.querySelector('.c-start')?.value) || 16;
            const eNum = parseFloat(card.querySelector('.c-end')?.value) || 17.5;

            if (name !== "" && activeDays.length > 0) {
                classesData.push({
                    name: name,
                    isOnline: isOnline,
                    days: activeDays,
                    start: this.minsToTimeStr(Math.round(sNum * 60)),
                    end: this.minsToTimeStr(Math.round(eNum * 60)),
                    startNum: sNum,
                    endNum: eNum
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
                btn.innerHTML = '<i data-lucide="save" class="icon-sm"></i><span>ذخیره پیکربندی هسته</span>';
                UI.refreshIcons();
            }
        }
    }
};

// ارسال برنامه چیده‌شده روزبه‌روز (raw_plan) + یادداشت دانش‌آموز به هوش مصنوعی برای تولید جملات اختصاصی هر روز
    enrichMotivationsWithAiAsync(scheduleObj, studentNote) {
        if (!scheduleObj || !scheduleObj.id || typeof GAS_WEBAPP_URL === 'undefined') return;
        try {
            const rawPlan = Array.isArray(scheduleObj.raw_plan)
                ? scheduleObj.raw_plan
                : JSON.parse(scheduleObj.raw_plan || '[]');

            // استخراج خلاصه دقیق برنامه چیده‌شده برای هر روز هفته (از شنبه تا جمعه)
            const dailyPlanSummary = {};
            this.daysArr.forEach(day => {
                const dayBlocks = rawPlan.filter(b => b.day === day && b.type !== 'break');
                dailyPlanSummary[day] = dayBlocks.map(b => `${b.subject}${b.topic ? ' (' + b.topic + ')' : ''} [${b.start_time}-${b.end_time}]`);
            });

            fetch(GAS_WEBAPP_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({
                    action: 'enrich_schedule_motivations',
                    schedule_id: scheduleObj.id,
                    student_id: AppState.userId,
                    student_name: AppState.fullName,
                    student_goal: AppState.vipSettings?.student_goal || '',
                    student_note: studentNote || '',
                    week_type: scheduleObj.week_type || 'advance',
                    daily_plan_summary: dailyPlanSummary, // 👈 برنامه واقعی هر روز هفته (شنبه تا جمعه)
                    raw_plan: rawPlan
                })
            }).then(r => r.json()).then(res => {
                if (res && res.ai_motivations && AppState.currentScheduleObj?.id === scheduleObj.id) {
                    AppState.currentScheduleObj.ai_motivations = res.ai_motivations;
                    this.renderTodayTab();
                }
            }).catch(() => {});
        } catch (_) {}
    },

window.PlanningModule = PlanningModule;
