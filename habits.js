/* ==========================================================================
   🔥 ماژول مستقل مهندسی عادت‌ها و تحلیلگر رفتار (habits.js)
   نسخه بهینه‌سازی‌شده برای موبایل:
   ۱. تقویم هفتگی استاندارد ایرانی (شروع از شنبه تا جمعه)
   ۲. محاسبه هوشمند پایبندی «ماه جاری شمسی» + تقویم حرارتی ماه شمسی
   ۳. نمودارهای تمام‌عرض موبایل + ترازوی قدرت عادت‌ها بدون بریدگی متن
   ========================================================================== */

const HabitsModule = {
    habitsList: [],
    habitsLogs: {},
    localUpdatedAt: 0,

    activeSubtab: 'matrix', // 'matrix' | 'analytics' | 'manage'
    weekOffset: 0,          // 0 = هفته جاری (شنبه تا جمعه)، -1 = هفته قبل
    trendPeriod: 'shamsi_month', // 'week' | 'shamsi_month' | '30d'
    selectedNewIcon: 'check-circle-2',

    trendChartInstance: null,
    weekdayChartInstance: null,

    presetHabitsBank: [
        { title: 'ممنوعیت گوشی در پارت‌های مطالعه', icon: 'phone-off', desc: 'گذاشتن گوشی در اتاق دیگر هنگام مطالعه' },
        { title: '۱۵ دقیقه مرور لایتنر قبل از خواب', icon: 'layers', desc: 'تثبیت فرمول‌ها در حافظه بلندمدت در پایان شب' },
        { title: 'تحلیل تست‌های غلط و نزده همان روز', icon: 'file-check-2', desc: 'یادداشت علت اشتباهات بلافاصله بعد از تست‌زنی' },
        { title: 'شروع پارت اول صبح قبل از ساعت ۸', icon: 'sun', desc: 'خوردن قورباغه طلایی در ابتدای صبح' },
        { title: '۲۰ دقیقه ورزش سبک یا کشش روزانه', icon: 'activity', desc: 'افزایش خون‌رسانی به مغز و رفع خستگی عضلات' },
        { title: 'نوشیدن حداقل ۸ لیوان آب در روز', icon: 'droplets', desc: 'جلوگیری از افت تمرکز و سردرد در پارت‌های عصر' }
    ],

    // ======================================================================
    // 🚀 ۱. راه‌اندازی و همگام‌سازی ایمن با سوپابیس
    // ======================================================================
    async init() {
        this.ensureFullHabitsViewInjected();
        await this.loadHabitsData();
        this.renderHomeHabitsSummary();
        this.updateToolsCardSummary();
        UI.refreshIcons();
    },

    getShamsiDateStr(daysOffset = 0) {
        const d = new Date();
        d.setDate(d.getDate() + daysOffset);
        const shamsi = new Intl.DateTimeFormat('fa-IR', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).format(d);
        return UI.toEngDigits(shamsi);
    },

    getCurrentShamsiMonthInfo() {
        const todayStr = this.getShamsiDateStr(0); // مثلاً "1405/08/14"
        const parts = todayStr.split('/');
        const year = parts[0];
        const month = parts[1];
        const todayDayNum = parseInt(parts[2], 10) || 1;
        const monthName = new Intl.DateTimeFormat('fa-IR', { month: 'long' }).format(new Date());
        const maxDaysInMonth = parseInt(month, 10) <= 6 ? 31 : (parseInt(month, 10) <= 11 ? 30 : 29);

        return { year, month, todayDayNum, monthName, maxDaysInMonth, prefix: `${year}/${month}/` };
    },

    async loadHabitsData() {
        const uid = String(AppState.userId || '');
        const localHabitsKey = `qotbnama_habits_v2_${uid}`;
        const localLogsKey = `qotbnama_habit_logs_v2_${uid}`;
        const localTimeKey = `qotbnama_habit_time_${uid}`;

        const defaultHabits = [
            { id: 'h_wake', title: 'بیداری قبل از ساعت ۷ صبح', icon: 'sunrise' },
            { id: 'h_test', title: 'روتین تست قرابت و لغت شبانه', icon: 'book-open-check' },
            { id: 'h_phone', title: 'کنترل گوشی زیر ۱.۵ ساعت', icon: 'shield-check' },
            { id: 'h_report', title: 'ثبت گزارش عملکرد شبانه', icon: 'check-square' }
        ];

        const savedList = JSON.parse(Storage.get(localHabitsKey, 'null'));
        const savedLogs = JSON.parse(Storage.get(localLogsKey, 'null'));
        this.localUpdatedAt = Number(Storage.get(localTimeKey, '0')) || 0;

        this.habitsList = Array.isArray(savedList) && savedList.length > 0 ? savedList : defaultHabits;
        this.habitsLogs = (savedLogs && typeof savedLogs === 'object') ? savedLogs : {};

        if (!uid) return;

        try {
            const { data } = await supabaseClient
                .from('student_tools_data')
                .select('habits_list, habits_logs, updated_at')
                .eq('national_id', uid)
                .maybeSingle();

            if (data) {
                const dbTime = data.updated_at ? new Date(data.updated_at).getTime() : 0;
                const localLogCount = Object.values(this.habitsLogs).reduce((acc, arr) => acc + (Array.isArray(arr) ? arr.length : 0), 0);
                const dbLogCount = Object.values(data.habits_logs || {}).reduce((acc, arr) => acc + (Array.isArray(arr) ? arr.length : 0), 0);

                if (this.localUpdatedAt > dbTime || localLogCount > dbLogCount) {
                    await this.syncHabitsToSupabase();
                } else {
                    if (Array.isArray(data.habits_list) && data.habits_list.length > 0) this.habitsList = data.habits_list;
                    if (data.habits_logs && typeof data.habits_logs === 'object') this.habitsLogs = data.habits_logs;
                    this.cacheHabitsLocally();
                }
            } else {
                await this.syncHabitsToSupabase();
            }
        } catch (_) {}
    },

    cacheHabitsLocally() {
        const uid = String(AppState.userId || '');
        Storage.set(`qotbnama_habits_v2_${uid}`, JSON.stringify(this.habitsList));
        Storage.set(`qotbnama_habit_logs_v2_${uid}`, JSON.stringify(this.habitsLogs));
        Storage.set(`qotbnama_habit_time_${uid}`, String(this.localUpdatedAt));

        if (window.ToolsModule) {
            window.ToolsModule.habitsList = this.habitsList;
            window.ToolsModule.habitsLogs = this.habitsLogs;
        }
    },

    async syncHabitsToSupabase() {
        this.localUpdatedAt = Date.now();
        this.cacheHabitsLocally();

        const uid = String(AppState.userId || '');
        if (!uid) return;

        try {
            const fcList = window.FlashcardsModule?.flashcards || [];
            const fcCfg = window.FlashcardsModule?.leitnerSettings || { daily_new_limit: 8 };

            await supabaseClient.from('student_tools_data').upsert([{
                national_id: uid,
                habits_list: this.habitsList,
                habits_logs: this.habitsLogs,
                flashcards: fcList,
                leitner_settings: fcCfg,
                updated_at: new Date().toISOString()
            }], { onConflict: 'national_id' });
        } catch (_) {}
    },

    // ======================================================================
    // 🧠 ۲. محاسبات هوشمند زنجیره (Streak) و پایبندی ماه شمسی
    // ======================================================================
    getHabitStats(habitId) {
        const logs = Array.isArray(this.habitsLogs[habitId]) ? [...this.habitsLogs[habitId]].sort() : [];
        const totalDays = logs.length;

        // ۱. محاسبه زنجیره فعلی (Current Streak)
        let currentStreak = 0;
        const todayStr = this.getShamsiDateStr(0);
        const yesterdayStr = this.getShamsiDateStr(-1);
        let checkOffset = logs.includes(todayStr) ? 0 : (logs.includes(yesterdayStr) ? -1 : null);

        if (checkOffset !== null) {
            while (true) {
                const dStr = this.getShamsiDateStr(checkOffset);
                if (logs.includes(dStr)) {
                    currentStreak++;
                    checkOffset--;
                } else {
                    break;
                }
            }
        }

        // ۲. محاسبه هوشمند پایبندی در «ماه جاری شمسی»
        // اگر دانش‌آموز تازه چند روز است شروع کرده، مخرج کسر از اولین روز فعالیتش در این ماه حساب می‌شود تا درصد کاذب پایین نگیرد!
        const mInfo = this.getCurrentShamsiMonthInfo();
        const logsThisMonth = logs.filter(d => d.startsWith(mInfo.prefix));
        const doneThisMonth = logsThisMonth.length;

        let activeDaysDenominator = mInfo.todayDayNum;
        if (logsThisMonth.length > 0) {
            const firstLogDayNum = parseInt(logsThisMonth[0].split('/')[2], 10) || 1;
            const daysSinceFirstLog = Math.max(1, mInfo.todayDayNum - firstLogDayNum + 1);
            // اگر کل سابقه عادت کمتر از روزهای ماه است، از روز شروع عادت حساب کن
            if (totalDays <= daysSinceFirstLog) {
                activeDaysDenominator = daysSinceFirstLog;
            }
        }
        const shamsiMonthRate = Math.min(100, Math.round((doneThisMonth / Math.max(1, activeDaysDenominator)) * 100));

        // ۳. مرحله عصبی شکل‌گیری عادت (۲۱ و ۶۶ روز)
        let stageTitle = '🌱 جوانه‌زنی';
        let stageClass = 'stage-1';
        let targetDays = 21;
        if (totalDays >= 66) {
            stageTitle = '💎 عادت خودکار';
            stageClass = 'stage-4';
            targetDays = 66;
        } else if (totalDays >= 21) {
            stageTitle = '🔥 تثبیت عمیق';
            stageClass = 'stage-3';
            targetDays = 66;
        } else if (totalDays >= 7) {
            stageTitle = '⚡ سیم‌کشی عصبی';
            stageClass = 'stage-2';
            targetDays = 21;
        }
        const neuroProgressPct = Math.min(100, Math.round((totalDays / targetDays) * 100));

        return {
            totalDays,
            currentStreak,
            doneThisMonth,
            shamsiMonthRate,
            stageTitle,
            stageClass,
            targetDays,
            neuroProgressPct
        };
    },

    getOverallDisciplineRank() {
        let totalChecks = 0;
        Object.values(this.habitsLogs).forEach(arr => {
            if (Array.isArray(arr)) totalChecks += arr.length;
        });

        const levels = [
            { min: 0, max: 15, title: '🌱 نوآموز نظم', next: 'متعهد کنکوری' },
            { min: 15, max: 45, title: '⚡ متعهد کنکوری', next: 'معمار عادت‌ها' },
            { min: 45, max: 100, title: '🔥 معمار عادت‌ها', next: 'استاد پیوستگی' },
            { min: 100, max: 220, title: '👑 استاد پیوستگی', next: 'افسانه اراده' },
            { min: 220, max: 9999, title: '💎 افسانه اراده راهینو', next: 'سقف افتخار' }
        ];

        const cur = levels.find(l => totalChecks >= l.min && totalChecks < l.max) || levels[levels.length - 1];
        const pct = Math.min(100, Math.round(((totalChecks - cur.min) / Math.max(1, cur.max - cur.min)) * 100));
        return { totalChecks, title: cur.title, next: cur.next, pct };
    },

    // ======================================================================
    // 🏠 ۳. بروزرسانی خلاصه عادت‌ها در صفحه خانه و کارت ابزارها
    // ======================================================================
    renderHomeHabitsSummary() {
        const homeContainer = document.getElementById('homeHabitsContainer');
        if (!homeContainer) return;

        const todayStr = this.getShamsiDateStr(0);
        let doneToday = 0;

        homeContainer.innerHTML = this.habitsList.map(h => {
            const logs = this.habitsLogs[h.id] || [];
            const isDone = logs.includes(todayStr);
            if (isDone) doneToday++;
            return `
                <div class="toggle-row" onclick="HabitsModule.toggleHabitOnDate('${h.id}', '${todayStr}', false)"
                     style="margin-bottom:0; border-color:${isDone ? 'var(--primary)' : 'var(--border)'}; background:${isDone ? 'var(--primary-fade)' : 'var(--surface-2)'};">
                    <div style="display:flex; align-items:center; gap:8px; font-size:12px; font-weight:800;">
                        <i data-lucide="${h.icon || 'check-circle'}" class="icon-sm primary-text"></i>
                        <span style="${isDone ? 'text-decoration:line-through; opacity:0.75;' : ''}">${h.title}</span>
                    </div>
                    <div style="width:20px; height:20px; border-radius:6px; border:2px solid var(--primary); background:${isDone ? 'var(--primary)' : 'transparent'}; color:#fff; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                        ${isDone ? '<i data-lucide="check" class="icon-sm" style="width:13px;height:13px;"></i>' : ''}
                    </div>
                </div>
            `;
        }).join('');

        const progEl = document.getElementById('habitProgressText');
        if (progEl) {
            progEl.innerText = `${doneToday.toLocaleString('fa-IR')} از ${this.habitsList.length.toLocaleString('fa-IR')}`;
        }
        this.updateToolsCardSummary();
        UI.refreshIcons();
    },

    updateToolsCardSummary() {
        const todayStr = this.getShamsiDateStr(0);
        let doneToday = 0;
        this.habitsList.forEach(h => {
            if ((this.habitsLogs[h.id] || []).includes(todayStr)) doneToday++;
        });
        const lbl = document.getElementById('toolHabitSummaryLabel');
        if (lbl) {
            lbl.innerText = `امروز: ${doneToday.toLocaleString('fa-IR')} از ${this.habitsList.length.toLocaleString('fa-IR')} عادت انجام شده`;
        }
        const topBadge = document.getElementById('hbPageTopBadge');
        if (topBadge) {
            topBadge.innerText = `${this.habitsList.length.toLocaleString('fa-IR')} عادت`;
        }
    },

    // ======================================================================
    // 🗂️ ۴. تزریق صفحه کامل و مینیمال عادت‌ها (#view-habits)
    // ======================================================================
    ensureFullHabitsViewInjected() {
        const appShell = document.getElementById('shell-app');
        if (!appShell) return;

        let section = document.getElementById('view-habits');
        if (!section) {
            section = document.createElement('section');
            section.id = 'view-habits';
            section.className = 'spa-view';
            appShell.appendChild(section);
        }

        const mInfo = this.getCurrentShamsiMonthInfo();

        section.innerHTML = `
            <!-- هدر اصلاح‌شده (عنوان و زیرعنوان در یک ستون عمودی) -->
            <div class="module-top-bar">
                <div style="display:flex; align-items:center; gap:8px;">
                    <button type="button" class="nav-icon-btn" onclick="HabitsModule.closeHabitsPage()" title="بازگشت">
                        <i data-lucide="arrow-right" class="icon"></i>
                    </button>
                    <div class="module-title-group">
                        <div>
                            <h2>مهندسی عادت‌ها و نظم</h2>
                            <p>تقویم شنبه تا جمعه و پایش مدار عادت‌سازی</p>
                        </div>
                    </div>
                </div>
                <span class="konkur-pill" id="hbPageTopBadge">۴ عادت</span>
            </div>

            <!-- نوار ۳ تایی تب‌ها (کوتاه و کاملاً جا شده در یک خط موبایل) -->
            <div class="subtabs-bar">
                <button type="button" class="subtab-btn active" id="btnHbTabMatrix" onclick="HabitsModule.switchSubtab('matrix')">
                    <i data-lucide="calendar-check" class="icon-sm"></i>
                    <span>۱. جدول هفتگی</span>
                </button>
                <button type="button" class="subtab-btn" id="btnHbTabAnalytics" onclick="HabitsModule.switchSubtab('analytics')">
                    <i data-lucide="bar-chart-3" class="icon-sm"></i>
                    <span>۲. آمار و نمودار</span>
                </button>
                <button type="button" class="subtab-btn" id="btnHbTabManage" onclick="HabitsModule.switchSubtab('manage')">
                    <i data-lucide="plus-circle" class="icon-sm"></i>
                    <span>۳. مدیریت عادت</span>
                </button>
            </div>

            <!-- ==============================================================
                 تب ۱: جدول هفتگی (از شنبه تا جمعه)
                 ============================================================== -->
            <div id="hbTabMatrix">
                <div class="hb-level-hero">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
                        <div style="display:flex; align-items:center; gap:8px;">
                            <div class="module-icon-badge" style="width:34px;height:34px;"><i data-lucide="award" class="icon-sm"></i></div>
                            <div>
                                <div style="font-size:10px; color:var(--text-muted); font-weight:800;">درجه پیوستگی شما:</div>
                                <div style="font-size:13.5px; font-weight:900; color:var(--primary);" id="hbRankTitle">⚡ متعهد کنکوری</div>
                            </div>
                        </div>
                        <div style="text-align:left;">
                            <strong style="font-size:14px; color:var(--success);" id="hbTotalChecksCount">۰ تیک</strong>
                            <small style="display:block; font-size:9.5px; color:var(--text-muted);" id="hbNextRankLabel">هدف بعدی</small>
                        </div>
                    </div>
                    <div class="progress-bar-bg" style="height:6px;">
                        <div class="progress-bar-fill" id="hbRankProgressBar" style="width:0%;"></div>
                    </div>
                </div>

                <!-- نوار ورق زدن هفته (شنبه تا جمعه) -->
                <div class="habit-week-nav">
                    <button type="button" class="link-btn" onclick="HabitsModule.changeWeekOffset(-1)">
                        <i data-lucide="chevron-right" class="icon-sm"></i><span>هفته قبل</span>
                    </button>
                    <span id="hbWeekRangeLabel" style="color:var(--primary); font-size:11.5px;">هفته جاری (شنبه تا جمعه)</span>
                    <button type="button" class="link-btn" id="btnHbNextWeek" onclick="HabitsModule.changeWeekOffset(1)">
                        <span>هفته بعد</span><i data-lucide="chevron-left" class="icon-sm"></i>
                    </button>
                </div>

                <div id="hbWeeklyCardsContainer"></div>
            </div>

            <!-- ==============================================================
                 تب ۲: آمار، نمودارهای تمام‌عرض و تقویم حرارتی ماه شمسی
                 ============================================================== -->
            <div id="hbTabAnalytics" style="display:none;">
                <div class="hb-insight-box" id="hbSmartInsightBox">در حال تحلیل الگوی رفتاری شما...</div>

                <div class="kpi-grid-4">
                    <div class="kpi-card">
                        <div class="kpi-top"><span>این هفته (ش تا ج)</span><i data-lucide="zap" class="icon-sm primary-text"></i></div>
                        <div class="kpi-val primary-text" id="hbKpiWeekRate">۰٪</div>
                        <div class="kpi-sub">روزهای سپری‌شده هفته</div>
                    </div>
                    <div class="kpi-card">
                        <div class="kpi-top"><span>پایبندی ${mInfo.monthName}</span><i data-lucide="calendar" class="icon-sm indigo-text"></i></div>
                        <div class="kpi-val indigo-text" id="hbKpiMonthRate">۰٪</div>
                        <div class="kpi-sub">از ۱ ${mInfo.monthName} تا امروز</div>
                    </div>
                    <div class="kpi-card highlight-record">
                        <div class="kpi-top"><span>بهترین زنجیره</span><i data-lucide="flame" class="icon-sm gold-text"></i></div>
                        <div class="kpi-val gold-text" id="hbKpiBestStreak">۰ روز</div>
                        <div class="kpi-sub">بیشترین پیوستگی فعال</div>
                    </div>
                    <div class="kpi-card">
                        <div class="kpi-top"><span>روزهای ۱۰۰٪ کامل</span><i data-lucide="trophy" class="icon-sm success-text"></i></div>
                        <div class="kpi-val success-text" id="hbKpiPerfectDays">۰ روز</div>
                        <div class="kpi-sub">در ${mInfo.monthName} ماه</div>
                    </div>
                </div>

                <!-- نمودار ۱: روند پایبندی روزانه (با دکمه‌های یک‌خطی) -->
                <div class="card-box">
                    <div style="display:flex; justify-content:space-between; align-items:center; gap:6px; margin-bottom:10px; flex-wrap:wrap;">
                        <div class="section-inline-title" style="font-size:12.5px;">
                            <i data-lucide="trending-up" class="icon-sm primary-text"></i>
                            <span id="hbTrendChartTitle">روند پایبندی (${mInfo.monthName} ماه)</span>
                        </div>
                        <div class="segmented-pills compact-pills">
                            <button type="button" class="pill-btn" id="btnHbTrendWeek" onclick="HabitsModule.setTrendPeriod('week')">این هفته</button>
                            <button type="button" class="pill-btn active" id="btnHbTrendShamsi" onclick="HabitsModule.setTrendPeriod('shamsi_month')">${mInfo.monthName}</button>
                            <button type="button" class="pill-btn" id="btnHbTrend30d" onclick="HabitsModule.setTrendPeriod('30d')">۳۰ روزه</button>
                        </div>
                    </div>
                    <div class="chart-container-fixed" style="height:195px;">
                        <canvas id="hbTrendChartCanvas"></canvas>
                    </div>
                </div>

                <!-- نمودار ۲: کالبدشکافی روزهای هفته (شنبه تا جمعه) -->
                <div class="card-box">
                    <div class="section-inline-title" style="font-size:12.5px; margin-bottom:3px;">
                        <i data-lucide="compass" class="icon-sm gold-text"></i>
                        <span>کالبدشکافی روزهای هفته (شنبه تا جمعه)</span>
                    </div>
                    <p class="field-hint" style="margin-top:0; font-size:10.5px;">میانگین درصد انجام عادت‌ها در هر روز هفته</p>
                    <div class="chart-container-fixed small" style="height:185px;">
                        <canvas id="hbWeekdayChartCanvas"></canvas>
                    </div>
                </div>

                <!-- بخش ۳: ترازوی قدرت عادت‌ها (با نوارهای پیشرفت بومی و خوانا بدون بریده شدن متن) -->
                <div class="card-box">
                    <div class="section-inline-title" style="font-size:12.5px; margin-bottom:3px;">
                        <i data-lucide="award" class="icon-sm accent-text"></i>
                        <span>ترازوی قدرت عادت‌های شما (در ${mInfo.monthName} ماه)</span>
                    </div>
                    <p class="field-hint" style="margin-top:0; font-size:10.5px;">رتبه‌بندی عادت‌ها بر اساس درصد پایبندی و زنجیره فعلی</p>
                    <div class="hb-strength-list" id="hbStrengthNativeList"></div>
                </div>

                <!-- تقویم حرارتی ماه جاری شمسی -->
                <div class="section-title" style="margin:14px 0 8px 0;">
                    <span class="bar"></span>
                    <i data-lucide="grid" class="icon-sm"></i>
                    <span>تقویم حرارتی ${mInfo.monthName} ماه (روز ۱ تا ${mInfo.maxDaysInMonth.toLocaleString('fa-IR')})</span>
                </div>
                <div class="heatmap-grid" id="hbMonthlyHeatmapGrid"></div>
            </div>

            <!-- ==============================================================
                 تب ۳: مدیریت، ساخت عادت و بانک عادت‌های آماده
                 ============================================================== -->
            <div id="hbTabManage" style="display:none;">
                <div class="card-box">
                    <div class="section-title" style="margin-top:0;">
                        <span class="bar"></span>
                        <i data-lucide="plus-circle" class="icon-sm"></i>
                        <span>تعریف عادت شخصی جدید</span>
                    </div>
                    <div class="form-group">
                        <label>عنوان عادت روزانه:</label>
                        <input type="text" id="inpNewCustomHabitTitle" class="modern-input" placeholder="مثلاً: حل ۱۵ تست قرابت معنایی هر شب">
                    </div>
                    <div class="form-group">
                        <label>انتخاب آیکون:</label>
                        <div class="hb-icon-picker" id="hbIconPickerRow">
                            ${['check-circle-2', 'sunrise', 'book-open-check', 'shield-check', 'flame', 'brain', 'timer', 'layers', 'droplets', 'activity'].map(ic => `
                                <div class="hb-icon-opt ${ic === 'check-circle-2' ? 'active' : ''}" onclick="HabitsModule.selectNewHabitIcon('${ic}', this)">
                                    <i data-lucide="${ic}" class="icon-sm"></i>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                    <button type="button" class="btn-primary-full" onclick="HabitsModule.createCustomHabitFromPage()">
                        <i data-lucide="plus" class="icon-sm"></i>
                        <span>افزودن به عادت‌های من</span>
                    </button>
                </div>

                <div class="section-title">
                    <span class="bar"></span>
                    <i data-lucide="sparkles" class="icon-sm"></i>
                    <span>بانک عادت‌های طلایی رتبه‌برترها</span>
                </div>
                <div id="hbPresetsBankContainer"></div>
            </div>
        `;
    },

    openHabitsPage() {
        UI.closeModals();
        this.ensureFullHabitsViewInjected();
        Router.openSubPage('habits');
        this.weekOffset = 0;
        this.switchSubtab('matrix');
    },

    closeHabitsPage() {
        Router.switchMainTab(AppState.currentTab || 'tools');
    },

    switchSubtab(tabName) {
        this.activeSubtab = tabName;
        document.getElementById('btnHbTabMatrix')?.classList.toggle('active', tabName === 'matrix');
        document.getElementById('btnHbTabAnalytics')?.classList.toggle('active', tabName === 'analytics');
        document.getElementById('btnHbTabManage')?.classList.toggle('active', tabName === 'manage');

        document.getElementById('hbTabMatrix').style.display = tabName === 'matrix' ? 'block' : 'none';
        document.getElementById('hbTabAnalytics').style.display = tabName === 'analytics' ? 'block' : 'none';
        document.getElementById('hbTabManage').style.display = tabName === 'manage' ? 'block' : 'none';

        if (tabName === 'matrix') {
            this.renderMatrixTab();
        } else if (tabName === 'analytics') {
            this.renderAnalyticsTab();
        } else if (tabName === 'manage') {
            this.renderPresetsBank();
        }
        UI.refreshIcons();
    },

    changeWeekOffset(delta) {
        const nextOff = this.weekOffset + delta;
        if (nextOff > 0) return;
        this.weekOffset = nextOff;
        this.renderMatrixTab();
    },

    // ======================================================================
    // 📅 ۵. رندر جدول هفتگی با شروع استاندارد از «شنبه تا جمعه»
    // ======================================================================
    getSaturdayToFridayWindow(weekOffset = 0) {
        const now = new Date();
        const todayJsDay = now.getDay(); // شنبه = 6، یکشنبه = 0، دوشنبه = 1، ...، جمعه = 5
        const daysSinceSaturday = (todayJsDay + 1) % 7; // شنبه = 0، یکشنبه = 1، ...، چهارشنبه = 4، جمعه = 6

        const startOffset = (weekOffset * 7) - daysSinceSaturday;
        const faShortDays = ['ش', 'ی', 'د', 'س', 'چ', 'پ', 'ج'];
        const faFullDays = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'];

        const daysWindow = [];
        for (let idx = 0; idx < 7; idx++) {
            const offset = startOffset + idx;
            const dateStr = this.getShamsiDateStr(offset);
            const dayNum = parseInt(dateStr.split('/')[2], 10);
            daysWindow.push({
                dateStr,
                dayNum,
                wName: faShortDays[idx],
                fullDayName: faFullDays[idx],
                isToday: offset === 0,
                isFuture: offset > 0
            });
        }
        return { daysWindow, daysSinceSaturday };
    },

    renderMatrixTab() {
        const rankInfo = this.getOverallDisciplineRank();
        document.getElementById('hbRankTitle').innerText = rankInfo.title;
        document.getElementById('hbTotalChecksCount').innerText = `${rankInfo.totalChecks.toLocaleString('fa-IR')} تیک`;
        document.getElementById('hbNextRankLabel').innerText = `بعدی: ${rankInfo.next}`;
        document.getElementById('hbRankProgressBar').style.width = `${rankInfo.pct}%`;

        const { daysWindow } = this.getSaturdayToFridayWindow(this.weekOffset);
        const mInfo = this.getCurrentShamsiMonthInfo();

        const nextBtn = document.getElementById('btnHbNextWeek');
        if (nextBtn) nextBtn.style.opacity = this.weekOffset === 0 ? '0.35' : '1';

        const rangeLbl = document.getElementById('hbWeekRangeLabel');
        if (rangeLbl) {
            const firstD = daysWindow[0].dayNum.toLocaleString('fa-IR');
            const lastD = daysWindow[6].dayNum.toLocaleString('fa-IR');
            rangeLbl.innerText = this.weekOffset === 0
                ? `هفته جاری (شنبه ${firstD} تا جمعه ${lastD} ${mInfo.monthName})`
                : `${Math.abs(this.weekOffset).toLocaleString('fa-IR')} هفته قبل (شنبه ${firstD} تا جمعه ${lastD})`;
        }

        const container = document.getElementById('hbWeeklyCardsContainer');
        if (!container) return;

        container.innerHTML = this.habitsList.map(h => {
            const logs = this.habitsLogs[h.id] || [];
            const st = this.getHabitStats(h.id);

            const cellsHtml = daysWindow.map(day => {
                const isDone = logs.includes(day.dateStr);
                return `
                    <div class="habit-day-cell ${isDone ? 'done' : ''} ${day.isToday ? 'is-today' : ''} ${day.isFuture ? 'is-future' : ''}"
                         onclick="HabitsModule.toggleHabitOnDate('${h.id}', '${day.dateStr}', ${day.isFuture})">
                        <small>${day.isToday ? 'امروز' : day.wName}</small>
                        <span class="day-num">${day.dayNum.toLocaleString('fa-IR')}</span>
                        <div class="check-dot">
                            ${isDone ? '<i data-lucide="check" class="icon-sm" style="width:10px;height:10px;"></i>' : ''}
                        </div>
                    </div>
                `;
            }).join('');

            return `
                <div class="habit-matrix-card">
                    <div class="habit-card-top">
                        <div class="habit-card-title">
                            <i data-lucide="${h.icon || 'flame'}" class="icon-sm primary-text"></i>
                            <span>${h.title}</span>
                        </div>
                        <div style="display:flex; align-items:center; gap:4px; flex-shrink:0;">
                            ${st.currentStreak > 0 ? `<span class="dur-badge gold" style="margin:0; padding:2px 6px;">🔥 ${st.currentStreak.toLocaleString('fa-IR')}</span>` : ''}
                            <span class="hb-neuro-badge ${st.stageClass}">${st.stageTitle}</span>
                            ${this.habitsList.length > 1 ? `
                                <button type="button" class="del-icon-btn" style="width:24px;height:24px;border-radius:7px;" onclick="HabitsModule.deleteHabit('${h.id}')" title="حذف">
                                    <i data-lucide="trash-2" class="icon-sm" style="width:11px;height:11px;"></i>
                                </button>
                            ` : ''}
                        </div>
                    </div>

                    <div style="display:flex; justify-content:space-between; font-size:9.5px; color:var(--text-muted); margin-bottom:3px; font-weight:700;">
                        <span>مدار عادت (${st.totalDays.toLocaleString('fa-IR')} از ${st.targetDays.toLocaleString('fa-IR')} روز)</span>
                        <span>پایبندی ${mInfo.monthName}: <strong class="primary-text">${st.shamsiMonthRate.toLocaleString('fa-IR')}٪</strong></span>
                    </div>
                    <div class="habit-mini-prog">
                        <div class="habit-mini-prog-fill" style="width:${st.neuroProgressPct}%;"></div>
                    </div>

                    <div class="habit-days-row">${cellsHtml}</div>
                </div>
            `;
        }).join('');

        UI.refreshIcons();
    },

    toggleHabitOnDate(habitId, dateStr, isFuture = false) {
        if (isFuture) {
            return UI.showToast('این روز از هفته هنوز نرسیده است!', 'info');
        }

        if (!Array.isArray(this.habitsLogs[habitId])) {
            this.habitsLogs[habitId] = [];
        }
        const arr = this.habitsLogs[habitId];
        const idx = arr.indexOf(dateStr);
        const wasAdded = idx === -1;

        if (wasAdded) arr.push(dateStr);
        else arr.splice(idx, 1);

        this.syncHabitsToSupabase();
        this.renderHomeHabitsSummary();

        if (this.activeSubtab === 'matrix') {
            this.renderMatrixTab();
        } else if (this.activeSubtab === 'analytics') {
            this.renderAnalyticsTab();
        }

        const todayStr = this.getShamsiDateStr(0);
        if (wasAdded && dateStr === todayStr) {
            const allDoneToday = this.habitsList.every(h => (this.habitsLogs[h.id] || []).includes(todayStr));
            if (allDoneToday && window.confetti) {
                confetti({ particleCount: 90, spread: 65, origin: { y: 0.65 } });
                UI.showToast('🔥 عالی بود! تمام عادت‌های امروزت رو کامل کردی!', 'success');
            }
        }
    },

    // ======================================================================
    // 📊 ۶. رندر تب ۲: آمار ماه شمسی، نمودارهای تمام‌عرض و تقویم حرارتی
    // ======================================================================
    setTrendPeriod(period) {
        this.trendPeriod = period;
        const mInfo = this.getCurrentShamsiMonthInfo();
        document.getElementById('btnHbTrendWeek')?.classList.toggle('active', period === 'week');
        document.getElementById('btnHbTrendShamsi')?.classList.toggle('active', period === 'shamsi_month');
        document.getElementById('btnHbTrend30d')?.classList.toggle('active', period === '30d');

        const titleEl = document.getElementById('hbTrendChartTitle');
        if (titleEl) {
            titleEl.innerText = period === 'week'
                ? 'روند این هفته (شنبه تا امروز)'
                : (period === 'shamsi_month' ? `روند ${mInfo.monthName} ماه (از ۱ ${mInfo.monthName})` : 'روند ۳۰ روز اخیر');
        }
        this.renderTrendChart();
    },

    renderAnalyticsTab() {
        const numHabits = Math.max(1, this.habitsList.length);
        const mInfo = this.getCurrentShamsiMonthInfo();
        const { daysWindow, daysSinceSaturday } = this.getSaturdayToFridayWindow(0);

        // ۱. محاسبه پایبندی این هفته (از شنبه تا امروز)
        let doneThisWeek = 0;
        const elapsedDaysInWeek = daysSinceSaturday + 1;
        for (let i = 0; i < elapsedDaysInWeek; i++) {
            const dStr = daysWindow[i].dateStr;
            this.habitsList.forEach(h => {
                if ((this.habitsLogs[h.id] || []).includes(dStr)) doneThisWeek++;
            });
        }
        const weekRate = Math.min(100, Math.round((doneThisWeek / (numHabits * elapsedDaysInWeek)) * 100));

        // ۲. محاسبه تقویم حرارتی ماه جاری شمسی (از ۱ ماه تا پایان ماه)
        const heatmapGrid = document.getElementById('hbMonthlyHeatmapGrid');
        let heatmapHtml = '';
        let perfectDaysInMonth = 0;

        for (let day = 1; day <= mInfo.maxDaysInMonth; day++) {
            const dStr = `${mInfo.prefix}${String(day).padStart(2, '0')}`;
            const isFutureDay = day > mInfo.todayDayNum;
            let doneOnDay = 0;

            if (!isFutureDay) {
                this.habitsList.forEach(h => {
                    if ((this.habitsLogs[h.id] || []).includes(dStr)) doneOnDay++;
                });
                if (doneOnDay === numHabits) perfectDaysInMonth++;
            }

            const ratio = isFutureDay ? 0 : (doneOnDay / numHabits);
            let lvlClass = '';
            if (ratio >= 0.85) lvlClass = 'lvl-3';
            else if (ratio >= 0.45) lvlClass = 'lvl-2';
            else if (ratio > 0) lvlClass = 'lvl-1';

            heatmapHtml += `<div class="heatmap-cell ${lvlClass}" style="${isFutureDay ? 'opacity:0.32;border-style:dashed;' : ''}" title="${day} ${mInfo.monthName}">${day.toLocaleString('fa-IR')}</div>`;
        }
        if (heatmapGrid) heatmapGrid.innerHTML = heatmapHtml;

        // ۳. آمار کلی عادت‌ها و میانگین ماه جاری شمسی
        const habitStatsList = this.habitsList.map(h => ({ habit: h, ...this.getHabitStats(h.id) }));
        const avgShamsiMonthRate = Math.round(habitStatsList.reduce((s, x) => s + x.shamsiMonthRate, 0) / numHabits);
        const bestStreak = habitStatsList.reduce((max, x) => Math.max(max, x.currentStreak), 0);

        document.getElementById('hbKpiWeekRate').innerText = `${weekRate.toLocaleString('fa-IR')}٪`;
        document.getElementById('hbKpiMonthRate').innerText = `${avgShamsiMonthRate.toLocaleString('fa-IR')}٪`;
        document.getElementById('hbKpiBestStreak').innerText = `${bestStreak.toLocaleString('fa-IR')} روز`;
        document.getElementById('hbKpiPerfectDays').innerText = `${perfectDaysInMonth.toLocaleString('fa-IR')} روز`;

        // ۴. محاسبه میانگین روزهای هفته (از شنبه تا جمعه در ۳۰ روز اخیر)
        const weekdayTotals = { 6: { sum: 0, count: 0 }, 0: { sum: 0, count: 0 }, 1: { sum: 0, count: 0 }, 2: { sum: 0, count: 0 }, 3: { sum: 0, count: 0 }, 4: { sum: 0, count: 0 }, 5: { sum: 0, count: 0 } };
        for (let i = -29; i <= 0; i++) {
            const dObj = new Date();
            dObj.setDate(dObj.getDate() + i);
            const dStr = this.getShamsiDateStr(i);
            let doneOnDay = 0;
            this.habitsList.forEach(h => {
                if ((this.habitsLogs[h.id] || []).includes(dStr)) doneOnDay++;
            });
            const dayPct = Math.round((doneOnDay / numHabits) * 100);
            weekdayTotals[dObj.getDay()].sum += dayPct;
            weekdayTotals[dObj.getDay()].count++;
        }

        const faDaysOrder = [
            { jsDay: 6, name: 'شنبه' },
            { jsDay: 0, name: 'یکشنبه' },
            { jsDay: 1, name: 'دوشنبه' },
            { jsDay: 2, name: 'سه‌شنبه' },
            { jsDay: 3, name: 'چهارشنبه' },
            { jsDay: 4, name: 'پنجشنبه' },
            { jsDay: 5, name: 'جمعه' }
        ];
        const weekdayAvgs = faDaysOrder.map(d => ({
            name: d.name,
            avg: weekdayTotals[d.jsDay].count > 0 ? Math.round(weekdayTotals[d.jsDay].sum / weekdayTotals[d.jsDay].count) : 0
        }));

        const sortedByStrength = [...habitStatsList].sort((a, b) => b.shamsiMonthRate - a.shamsiMonthRate);
        const strongestHabit = sortedByStrength[0];
        const weakestHabit = sortedByStrength[sortedByStrength.length - 1];
        const bestWeekday = [...weekdayAvgs].sort((a, b) => b.avg - a.avg)[0];

        const insightBox = document.getElementById('hbSmartInsightBox');
        if (insightBox) {
            insightBox.innerHTML = `
                <div>📊 <strong>تراز ${mInfo.monthName} ماه:</strong> میانگین پایبندی فعال تو در این ماه <strong>${avgShamsiMonthRate.toLocaleString('fa-IR')}٪</strong> و در هفته جاری <strong>${weekRate.toLocaleString('fa-IR')}٪</strong> است.</div>
                ${strongestHabit ? `<div>💎 <strong>نقطه قوت:</strong> عادت «${strongestHabit.habit.title}» با ${strongestHabit.shamsiMonthRate.toLocaleString('fa-IR')}٪ پایبندی، پایدارترین روتین توست.</div>` : ''}
                ${weakestHabit && weakestHabit.habit.id !== strongestHabit?.habit.id ? `<div>🎯 <strong>نیازمند توجه:</strong> عادت «${weakestHabit.habit.title}» (${weakestHabit.shamsiMonthRate.toLocaleString('fa-IR')}٪) بیشترین جا افتادگی را دارد.</div>` : ''}
                ${bestWeekday && bestWeekday.avg > 0 ? `<div>⚡ <strong>منظم‌ترین روز هفته:</strong> بیشترین تمرکز و نظم تو در روزهای <strong>${bestWeekday.name}</strong> ثبت شده است.</div>` : ''}
            `;
        }

        this.renderTrendChart();
        this.renderWeekdayPatternChart(weekdayAvgs);
        this.renderNativeStrengthBars(sortedByStrength);
        UI.refreshIcons();
    },

    renderTrendChart() {
        const canvas = document.getElementById('hbTrendChartCanvas');
        if (!canvas || !window.Chart) return;

        const numHabits = Math.max(1, this.habitsList.length);
        const mInfo = this.getCurrentShamsiMonthInfo();
        const labels = [];
        const dataPct = [];

        if (this.trendPeriod === 'week') {
            const { daysWindow, daysSinceSaturday } = this.getSaturdayToFridayWindow(0);
            for (let i = 0; i <= daysSinceSaturday; i++) {
                const d = daysWindow[i];
                labels.push(d.isToday ? 'امروز' : d.fullDayName);
                let done = 0;
                this.habitsList.forEach(h => {
                    if ((this.habitsLogs[h.id] || []).includes(d.dateStr)) done++;
                });
                dataPct.push(Math.round((done / numHabits) * 100));
            }
        } else if (this.trendPeriod === 'shamsi_month') {
            for (let day = 1; day <= mInfo.todayDayNum; day++) {
                const dStr = `${mInfo.prefix}${String(day).padStart(2, '0')}`;
                labels.push(day === mInfo.todayDayNum ? 'امروز' : day.toLocaleString('fa-IR'));
                let done = 0;
                this.habitsList.forEach(h => {
                    if ((this.habitsLogs[h.id] || []).includes(dStr)) done++;
                });
                dataPct.push(Math.round((done / numHabits) * 100));
            }
        } else {
            for (let i = -29; i <= 0; i++) {
                const dStr = this.getShamsiDateStr(i);
                const dayNum = parseInt(dStr.split('/')[2], 10);
                labels.push(i === 0 ? 'امروز' : dayNum.toLocaleString('fa-IR'));
                let done = 0;
                this.habitsList.forEach(h => {
                    if ((this.habitsLogs[h.id] || []).includes(dStr)) done++;
                });
                dataPct.push(Math.round((done / numHabits) * 100));
            }
        }

        if (this.trendChartInstance) this.trendChartInstance.destroy();
        this.trendChartInstance = new Chart(canvas.getContext('2d'), {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        type: 'line',
                        label: 'خط روند',
                        data: dataPct,
                        borderColor: '#fbbf24',
                        borderWidth: 2,
                        pointRadius: labels.length <= 10 ? 3 : 1.5,
                        tension: 0.35
                    },
                    {
                        type: 'bar',
                        label: 'تحقق روزانه',
                        data: dataPct,
                        backgroundColor: 'rgba(119, 187, 169, 0.55)',
                        borderColor: '#77bba9',
                        borderWidth: 1,
                        borderRadius: 5,
                        maxBarThickness: 22
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: { padding: { left: 0, right: 0, top: 4, bottom: 0 } },
                scales: {
                    x: { ticks: { font: { family: 'Vazirmatn', size: 9.5 }, maxRotation: 0 } },
                    y: {
                        position: 'right',
                        beginAtZero: true,
                        max: 100,
                        ticks: { font: { size: 9.5 }, stepSize: 25, callback: v => v + '%' }
                    }
                },
                plugins: { legend: { display: false } }
            }
        });
    },

    renderWeekdayPatternChart(weekdayAvgs) {
        const canvas = document.getElementById('hbWeekdayChartCanvas');
        if (!canvas || !window.Chart) return;

        if (this.weekdayChartInstance) this.weekdayChartInstance.destroy();
        this.weekdayChartInstance = new Chart(canvas.getContext('2d'), {
            type: 'bar',
            data: {
                labels: weekdayAvgs.map(x => x.name),
                datasets: [{
                    label: 'میانگین نظم',
                    data: weekdayAvgs.map(x => x.avg),
                    backgroundColor: weekdayAvgs.map(x => x.avg >= 70 ? '#10b981' : (x.avg >= 40 ? '#77bba9' : '#e59ea3')),
                    borderRadius: 6,
                    maxBarThickness: 26
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: { padding: { left: 0, right: 0, top: 4, bottom: 0 } },
                scales: {
                    x: { ticks: { font: { family: 'Vazirmatn', size: 10 }, maxRotation: 0 } },
                    y: {
                        position: 'right',
                        beginAtZero: true,
                        max: 100,
                        ticks: { font: { size: 9.5 }, stepSize: 25, callback: v => v + '%' }
                    }
                },
                plugins: { legend: { display: false } }
            }
        });
    },

    // ✅ رندر ترازوی قدرت عادت‌ها با نوار پیشرفت بومی (بدون بریده شدن متن در موبایل)
    renderNativeStrengthBars(sortedStats) {
        const listEl = document.getElementById('hbStrengthNativeList');
        if (!listEl) return;

        listEl.innerHTML = sortedStats.map(item => {
            const pct = item.shamsiMonthRate;
            const barColor = pct >= 75 ? 'var(--success)' : (pct >= 40 ? 'var(--primary)' : 'var(--accent)');
            return `
                <div class="hb-strength-item">
                    <div class="hb-strength-top">
                        <span style="display:flex; align-items:center; gap:6px; color:var(--text-main);">
                            <i data-lucide="${item.habit.icon || 'check-circle'}" class="icon-sm primary-text"></i>
                            <span>${item.habit.title}</span>
                        </span>
                        <span style="color:${barColor}; font-weight:900; white-space:nowrap;">
                            ${pct.toLocaleString('fa-IR')}٪ (${item.doneThisMonth.toLocaleString('fa-IR')} روز)
                        </span>
                    </div>
                    <div class="progress-bar-bg" style="height:7px;">
                        <div class="progress-bar-fill" style="width:${pct}%; background:${barColor};"></div>
                    </div>
                </div>
            `;
        }).join('');
    },

    // ======================================================================
    // ➕ ۷. ساخت عادت جدید و بانک عادت‌های پیشنهادی رتبه‌برترها
    // ======================================================================
    selectNewHabitIcon(iconName, el) {
        this.selectedNewIcon = iconName;
        document.querySelectorAll('#hbIconPickerRow .hb-icon-opt').forEach(item => item.classList.remove('active'));
        if (el) el.classList.add('active');
    },

    createCustomHabitFromPage() {
        const inp = document.getElementById('inpNewCustomHabitTitle');
        const title = inp ? inp.value.trim() : '';
        if (!title) {
            return UI.showToast('لطفاً عنوان عادت جدید را بنویسید.', 'error');
        }

        this.habitsList.push({
            id: 'hb_' + Date.now(),
            title: title,
            icon: this.selectedNewIcon || 'check-circle-2'
        });

        inp.value = '';
        this.syncHabitsToSupabase();
        this.renderHomeHabitsSummary();
        this.switchSubtab('matrix');
        UI.showToast('عادت جدید به برنامه روزانه شما اضافه شد!', 'success');
    },

    renderPresetsBank() {
        const container = document.getElementById('hbPresetsBankContainer');
        if (!container) return;

        const availablePresets = this.presetHabitsBank.filter(p =>
            !this.habitsList.some(h => h.title === p.title)
        );

        if (availablePresets.length === 0) {
            container.innerHTML = `<div class="card-box center-card"><span class="success-text" style="font-size:12px; font-weight:800;">✅ تمام عادت‌های پیشنهادی بانک راهینو در لیست شما فعال هستند.</span></div>`;
            return;
        }

        container.innerHTML = availablePresets.map((p, idx) => `
            <div class="card-box" style="padding:11px 12px; margin-bottom:8px; background:var(--surface-2);">
                <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
                    <div style="display:flex; align-items:center; gap:9px;">
                        <div class="module-icon-badge" style="width:34px;height:34px;"><i data-lucide="${p.icon}" class="icon-sm"></i></div>
                        <div>
                            <strong style="font-size:12px; color:var(--text-main); display:block;">${p.title}</strong>
                            <small style="font-size:10.5px; color:var(--text-muted);">${p.desc}</small>
                        </div>
                    </div>
                    <button type="button" class="btn-modal auto-width" style="padding:6px 11px; font-size:11px; flex-shrink:0;" onclick="HabitsModule.addPresetHabit(${idx})">
                        <i data-lucide="plus" class="icon-sm"></i><span>افزودن</span>
                    </button>
                </div>
            </div>
        `).join('');
        UI.refreshIcons();
    },

    addPresetHabit(presetIdx) {
        const availablePresets = this.presetHabitsBank.filter(p =>
            !this.habitsList.some(h => h.title === p.title)
        );
        const target = availablePresets[presetIdx];
        if (!target) return;

        this.habitsList.push({
            id: 'hb_pre_' + Date.now(),
            title: target.title,
            icon: target.icon
        });

        this.syncHabitsToSupabase();
        this.renderHomeHabitsSummary();
        this.renderPresetsBank();
        UI.showToast(`عادت «${target.title}» اضافه شد!`, 'success');
    },

    deleteHabit(habitId) {
        if (this.habitsList.length <= 1) {
            return UI.showToast('حداقل یک عادت فعال باید در سیستم باقی بماند.', 'error');
        }
        this.habitsList = this.habitsList.filter(h => h.id !== habitId);
        delete this.habitsLogs[habitId];
        this.syncHabitsToSupabase();
        this.renderHomeHabitsSummary();
        this.renderMatrixTab();
        UI.showToast('عادت حذف شد.', 'info');
    }
};

window.HabitsModule = HabitsModule;
