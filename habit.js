/* ==========================================================================
   🔥 ماژول مستقل مهندسی عادت‌ها و تحلیلگر رفتار (habits.js)
   شامل:
   ۱. صفحه کامل و اختصاصی ردیاب عادت‌ها (#view-habits)
   ۲. ماتریس ۷ روزه با قابلیت ورق زدن به هفته‌های قبل + نوار مدار عصبی ۲۱/۶۶ روزه
   ۳. آزمایشگاه نمودارها:
      - نمودار ترکیبی روند هفتگی و ماهانه (۷ روزه / ۳۰ روزه)
      - نمودار الگوی نظم در روزهای هفته (شنبه تا جمعه)
      - نمودار مقایسه قدرت تک‌تک عادت‌ها + هیت‌مپ ۳۰ روزه
      - مشاور هوشمند تحلیل رفتار (مقایسه با هفته قبل و کشف نقاط ضعف/قوت)
   ۴. بانک عادت‌های پیشنهادی رتبه‌برترها + ساخت عادت با انتخاب آیکون
   ========================================================================== */

const HabitsModule = {
    habitsList: [],
    habitsLogs: {}, // { habitId: ["1405/08/10", "1405/08/11"] }
    localUpdatedAt: 0,

    activeSubtab: 'matrix', // 'matrix' | 'analytics' | 'manage'
    weekOffset: 0,          // 0 = هفته جاری، -1 = هفته قبل، ...
    trendPeriod: '7d',      // '7d' | '30d'
    selectedNewIcon: 'check-circle-2',

    // رفرنس نمودارهای Chart.js برای جلوگیری از تداخل حافظه
    trendChartInstance: null,
    weekdayChartInstance: null,
    strengthChartInstance: null,

    // بانک عادت‌های آماده کنکوری
    presetHabitsBank: [
        { title: 'ممنوعیت گوشی در پارت‌های مطالعه', icon: 'smartphone-off', desc: 'گذاشتن گوشی در اتاق دیگر هنگام مطالعه' },
        { title: '۱۵ دقیقه مرور لایتنر قبل از خواب', icon: 'layers', desc: 'تثبیت فرمول‌ها در حافظه بلندمدت در پایان شب' },
        { title: 'تحلیل تست‌های غلط و نزده همان روز', icon: 'file-check-2', desc: 'یادداشت علت اشتباهات بلافاصله بعد از تست‌زنی' },
        { title: 'شروع پارت اول صبح قبل از ساعت ۸', icon: 'sun', desc: 'خوردن قورباغه طلایی در ابتدای صبح' },
        { title: '۲۰ دقیقه ورزش سبک یا کشش روزانه', icon: 'activity', desc: 'افزایش خون‌رسانی به مغز و رفع خستگی عضلات' },
        { title: 'نوشیدن حداقل ۸ لیوان آب در روز', icon: 'droplets', desc: 'جلوگیری از افت تمرکز و سردرد در پارت‌های عصر' }
    ],

    // ======================================================================
    // 🚀 ۱. راه‌اندازی، بارگذاری ایمن و همگام‌سازی با سوپابیس
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
    // 🧠 ۲. محاسبات علمی زنجیره (Streak)، مرحله عادت‌سازی و درجه نظم
    // ======================================================================
    getHabitStats(habitId) {
        const logs = Array.isArray(this.habitsLogs[habitId]) ? this.habitsLogs[habitId] : [];
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

        // ۲. محاسبه نرخ انجام در ۳۰ روز اخیر
        let last30Done = 0;
        for (let i = -29; i <= 0; i++) {
            if (logs.includes(this.getShamsiDateStr(i))) last30Done++;
        }
        const rate30 = Math.round((last30Done / 30) * 100);

        // ۳. مرحله عصبی شکل‌گیری عادت (بر اساس استاندارد ۲۱ و ۶۶ روز)
        let stageTitle = '🌱 فاز جوانه‌زنی';
        let stageClass = 'stage-1';
        let targetDays = 21;
        if (totalDays >= 66) {
            stageTitle = '💎 عادت خودکار (تثبیت کامل)';
            stageClass = 'stage-4';
            targetDays = 66;
        } else if (totalDays >= 21) {
            stageTitle = '🔥 فاز تثبیت عمیق (۲۱+ روز)';
            stageClass = 'stage-3';
            targetDays = 66;
        } else if (totalDays >= 7) {
            stageTitle = '⚡ سیم‌کشی عصبی (۷+ روز)';
            stageClass = 'stage-2';
            targetDays = 21;
        }
        const neuroProgressPct = Math.min(100, Math.round((totalDays / targetDays) * 100));

        return { totalDays, currentStreak, last30Done, rate30, stageTitle, stageClass, targetDays, neuroProgressPct };
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
            { min: 100, max: 220, title: '👑 استاد پیوستگی', next: 'افسانه اراده راهینو' },
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
                <div class="toggle-row" onclick="HabitsModule.toggleHabitOnDate('${h.id}', '${todayStr}')"
                     style="margin-bottom:0; border-color:${isDone ? 'var(--primary)' : 'var(--border)'}; background:${isDone ? 'var(--primary-fade)' : 'var(--surface-2)'};">
                    <div style="display:flex; align-items:center; gap:8px; font-size:12.5px; font-weight:800;">
                        <i data-lucide="${h.icon || 'check-circle'}" class="icon-sm primary-text"></i>
                        <span style="${isDone ? 'text-decoration:line-through; opacity:0.75;' : ''}">${h.title}</span>
                    </div>
                    <div style="width:22px; height:22px; border-radius:7px; border:2px solid var(--primary); background:${isDone ? 'var(--primary)' : 'transparent'}; color:#fff; display:flex; align-items:center; justify-content:center;">
                        ${isDone ? '<i data-lucide="check" class="icon-sm" style="width:14px;height:14px;"></i>' : ''}
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
            topBadge.innerText = `${this.habitsList.length.toLocaleString('fa-IR')} عادت فعال`;
        }
    },

    // ======================================================================
    // 🗂️ ۴. تزریق صفحه کامل و اختصاصی عادت‌ها (#view-habits)
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

        section.innerHTML = `
            <div class="module-top-bar">
                <div style="display:flex; align-items:center; gap:8px;">
                    <button type="button" class="nav-icon-btn" onclick="HabitsModule.closeHabitsPage()" title="بازگشت">
                        <i data-lucide="arrow-right" class="icon"></i>
                    </button>
                    <div class="module-title-group">
                        <h2>مهندسی عادت‌ها و نظم روزانه</h2>
                        <p>سیم‌کشی عصبی عادت‌های رتبه برتر و پایش نموداری</p>
                    </div>
                </div>
                <span class="konkur-pill" id="hbPageTopBadge">۴ عادت فعال</span>
            </div>

            <!-- نوار ۳ تایی تب‌های صفحه کامل عادت‌ها -->
            <div class="subtabs-bar">
                <button type="button" class="subtab-btn active" id="btnHbTabMatrix" onclick="HabitsModule.switchSubtab('matrix')">
                    <i data-lucide="calendar-check" class="icon-sm"></i>
                    <span>۱. میز عادت و جدول هفتگی</span>
                </button>
                <button type="button" class="subtab-btn" id="btnHbTabAnalytics" onclick="HabitsModule.switchSubtab('analytics')">
                    <i data-lucide="bar-chart-3" class="icon-sm"></i>
                    <span>۲. نمودارها و تحلیل رفتار</span>
                </button>
                <button type="button" class="subtab-btn" id="btnHbTabManage" onclick="HabitsModule.switchSubtab('manage')">
                    <i data-lucide="plus-circle" class="icon-sm"></i>
                    <span>۳. ساخت و بانک عادت‌ها</span>
                </button>
            </div>

            <!-- ==============================================================
                 تب ۱: میز عادت، درجه نظم و ماتریس ۷ روزه قابل ورق زدن
                 ============================================================== -->
            <div id="hbTabMatrix">
                <!-- کارت درجه نظم و امتیاز کل عادت‌سازی -->
                <div class="hb-level-hero">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; flex-wrap:wrap; gap:6px;">
                        <div style="display:flex; align-items:center; gap:8px;">
                            <div class="module-icon-badge" style="width:38px;height:38px;"><i data-lucide="award" class="icon"></i></div>
                            <div>
                                <div style="font-size:11px; color:var(--text-muted); font-weight:800;">درجه اراده و پیوستگی شما:</div>
                                <div style="font-size:15px; font-weight:900; color:var(--primary);" id="hbRankTitle">⚡ متعهد کنکوری</div>
                            </div>
                        </div>
                        <div style="text-align:left;">
                            <strong style="font-size:16px; color:var(--success);" id="hbTotalChecksCount">۰ تیک موفق</strong>
                            <small style="display:block; font-size:10px; color:var(--text-muted);" id="hbNextRankLabel">هدف بعدی</small>
                        </div>
                    </div>
                    <div class="progress-bar-bg" style="height:7px;">
                        <div class="progress-bar-fill" id="hbRankProgressBar" style="width:0%;"></div>
                    </div>
                </div>

                <!-- نوار ورق زدن بین هفته‌ها -->
                <div class="habit-week-nav">
                    <button type="button" class="link-btn" onclick="HabitsModule.changeWeekOffset(-1)">
                        <i data-lucide="chevron-right" class="icon-sm"></i><span>هفته قبل</span>
                    </button>
                    <span id="hbWeekRangeLabel" style="color:var(--primary);">هفته جاری (۷ روز اخیر)</span>
                    <button type="button" class="link-btn" id="btnHbNextWeek" onclick="HabitsModule.changeWeekOffset(1)">
                        <span>هفته بعد</span><i data-lucide="chevron-left" class="icon-sm"></i>
                    </button>
                </div>

                <!-- لیست کارت‌های ماتریس عادت‌ها -->
                <div id="hbWeeklyCardsContainer"></div>
            </div>

            <!-- ==============================================================
                 تب ۲: آزمایشگاه نمودارها، رادار روزهای هفته و هیت‌مپ ماهانه
                 ============================================================== -->
            <div id="hbTabAnalytics" style="display:none;">
                
                <!-- باکس تحلیلگر هوشمند رفتار -->
                <div class="hb-insight-box" id="hbSmartInsightBox">
                    در حال تحلیل الگوی رفتاری شما...
                </div>

                <!-- ۴ شاخص کلیدی عملکرد عادت‌ها -->
                <div class="kpi-grid-4">
                    <div class="kpi-card">
                        <div class="kpi-top"><span>پایبندی ۷ روز اخیر</span><i data-lucide="zap" class="icon-sm primary-text"></i></div>
                        <div class="kpi-val primary-text" id="hbKpi7dRate">۰٪</div>
                        <div class="kpi-sub">عملکرد این هفته</div>
                    </div>
                    <div class="kpi-card">
                        <div class="kpi-top"><span>پایبندی ۳۰ روزه</span><i data-lucide="calendar" class="icon-sm indigo-text"></i></div>
                        <div class="kpi-val indigo-text" id="hbKpi30dRate">۰٪</div>
                        <div class="kpi-sub">میانگین یک ماه اخیر</div>
                    </div>
                    <div class="kpi-card highlight-record">
                        <div class="kpi-top"><span>بهترین زنجیره فعال</span><i data-lucide="flame" class="icon-sm gold-text"></i></div>
                        <div class="kpi-val gold-text" id="hbKpiBestStreak">۰ روز</div>
                        <div class="kpi-sub">بیشترین پیوستگی</div>
                    </div>
                    <div class="kpi-card">
                        <div class="kpi-top"><span>روزهای ۱۰۰٪ کامل</span><i data-lucide="trophy" class="icon-sm success-text"></i></div>
                        <div class="kpi-val success-text" id="hbKpiPerfectDays">۰ روز</div>
                        <div class="kpi-sub">در ۳۰ روز گذشته</div>
                    </div>
                </div>

                <!-- نمودار ۱: روند پایبندی روزانه (قابل سوییچ بین ۷ روزه و ۳۰ روزه) -->
                <div class="card-box">
                    <div class="chart-header-Controls">
                        <div class="section-inline-title">
                            <i data-lucide="trending-up" class="icon-sm primary-text"></i>
                            <span id="hbTrendChartTitle">روند پایبندی روزانه (۷ روز اخیر)</span>
                        </div>
                        <div class="segmented-pills compact-pills">
                            <button type="button" class="pill-btn active" id="btnHbTrend7d" onclick="HabitsModule.setTrendPeriod('7d')">هفتگی (۷ روز)</button>
                            <button type="button" class="pill-btn" id="btnHbTrend30d" onclick="HabitsModule.setTrendPeriod('30d')">ماهانه (۳۰ روز)</button>
                        </div>
                    </div>
                    <div class="chart-container-fixed" style="height:220px;">
                        <canvas id="hbTrendChartCanvas"></canvas>
                    </div>
                </div>

                <!-- نمودار ۲: الگوی نظم در روزهای هفته (کشف روزهای طلایی و روزهای افت) -->
                <div class="card-box">
                    <div class="section-inline-title" style="margin-bottom:4px;">
                        <i data-lucide="compass" class="icon-sm gold-text"></i>
                        <span>کالبدشکافی روزهای هفته (در کدام روزها منظم‌تری؟)</span>
                    </div>
                    <p class="field-hint" style="margin-top:0;">میانگین درصد انجام عادت‌ها به تفکیک روزهای هفته (شنبه تا جمعه)</p>
                    <div class="chart-container-fixed small" style="height:200px;">
                        <canvas id="hbWeekdayChartCanvas"></canvas>
                    </div>
                </div>

                <!-- نمودار ۳: مقایسه قدرت تک‌تک عادت‌ها -->
                <div class="card-box">
                    <div class="section-inline-title" style="margin-bottom:4px;">
                        <i data-lucide="bar-chart-horizontal" class="icon-sm accent-text"></i>
                        <span>ترازوی قدرت عادت‌ها (۳۰ روز اخیر)</span>
                    </div>
                    <p class="field-hint" style="margin-top:0;">کدام عادت به بخشی از وجودت تبدیل شده و کدام عادت نیاز به توجه بیشتری دارد؟</p>
                    <div class="chart-container-fixed small" style="height:210px;">
                        <canvas id="hbStrengthChartCanvas"></canvas>
                    </div>
                </div>

                <!-- هیت‌مپ ۳۰ روزه -->
                <div class="section-title">
                    <span class="bar"></span>
                    <i data-lucide="grid" class="icon-sm"></i>
                    <span>نقشه حرارتی پیوستگی ماهانه (۳۰ روز گذشته)</span>
                </div>
                <div class="heatmap-grid" id="hbMonthlyHeatmapGrid"></div>
            </div>

            <!-- ==============================================================
                 تب ۳: ساخت عادت شخصی + بانک عادت‌های پیشنهادی رتبه‌برترها
                 ============================================================== -->
            <div id="hbTabManage" style="display:none;">
                <div class="card-box">
                    <div class="section-title" style="margin-top:0;">
                        <span class="bar"></span>
                        <i data-lucide="plus-circle" class="icon-sm"></i>
                        <span>تعریف عادت جدید</span>
                    </div>
                    <div class="form-group">
                        <label>عنوان عادت روزانه:</label>
                        <input type="text" id="inpNewCustomHabitTitle" class="modern-input" placeholder="مثلاً: حل ۱۵ تست قرابت معنایی هر شب">
                    </div>
                    <div class="form-group">
                        <label>انتخاب آیکون عادت:</label>
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
                    <span>بانک عادت‌های طلایی رتبه‌برترها (افزودن با یک کلیک)</span>
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
        if (nextOff > 0) return; // هفته آینده هنوز نرسیده است
        this.weekOffset = nextOff;
        this.renderMatrixTab();
    },

    // ======================================================================
    // 📅 ۵. رندر تب ۱: ماتریس ۷ روزه + نوار مدار عصبی شکل‌گیری عادت
    // ======================================================================
    renderMatrixTab() {
        const rankInfo = this.getOverallDisciplineRank();
        document.getElementById('hbRankTitle').innerText = rankInfo.title;
        document.getElementById('hbTotalChecksCount').innerText = `${rankInfo.totalChecks.toLocaleString('fa-IR')} تیک موفق`;
        document.getElementById('hbNextRankLabel').innerText = `درجه بعدی: ${rankInfo.next}`;
        document.getElementById('hbRankProgressBar').style.width = `${rankInfo.pct}%`;

        const startOffset = (this.weekOffset * 7) - 6;
        const endOffset = this.weekOffset * 7;

        const nextBtn = document.getElementById('btnHbNextWeek');
        if (nextBtn) nextBtn.style.opacity = this.weekOffset === 0 ? '0.35' : '1';

        const rangeLbl = document.getElementById('hbWeekRangeLabel');
        if (rangeLbl) {
            rangeLbl.innerText = this.weekOffset === 0
                ? 'هفته جاری (۷ روز اخیر)'
                : `${Math.abs(this.weekOffset).toLocaleString('fa-IR')} هفته قبل (${this.getShamsiDateStr(startOffset)} تا ${this.getShamsiDateStr(endOffset)})`;
        }

        const shortWeekdays = ['ی', 'د', 'س', 'چ', 'پ', 'ج', 'ش'];
        const daysWindow = [];
        for (let i = startOffset; i <= endOffset; i++) {
            const dObj = new Date();
            dObj.setDate(dObj.getDate() + i);
            const dateStr = this.getShamsiDateStr(i);
            const dayNum = parseInt(dateStr.split('/')[2], 10);
            const wName = shortWeekdays[dObj.getDay()];
            daysWindow.push({ dateStr, dayNum, wName, isToday: i === 0 });
        }

        const container = document.getElementById('hbWeeklyCardsContainer');
        if (!container) return;

        container.innerHTML = this.habitsList.map(h => {
            const logs = this.habitsLogs[h.id] || [];
            const st = this.getHabitStats(h.id);

            const cellsHtml = daysWindow.map(day => {
                const isDone = logs.includes(day.dateStr);
                return `
                    <div class="habit-day-cell ${isDone ? 'done' : ''} ${day.isToday ? 'is-today' : ''}"
                         onclick="HabitsModule.toggleHabitOnDate('${h.id}', '${day.dateStr}')">
                        <small>${day.isToday ? 'امروز' : day.wName}</small>
                        <span class="day-num">${day.dayNum.toLocaleString('fa-IR')}</span>
                        <div class="check-dot">
                            ${isDone ? '<i data-lucide="check" class="icon-sm" style="width:11px;height:11px;"></i>' : ''}
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
                        <div style="display:flex; align-items:center; gap:5px;">
                            <span class="hb-neuro-badge ${st.stageClass}">${st.stageTitle}</span>
                            ${st.currentStreak > 0 ? `<span class="dur-badge gold" style="margin:0;">🔥 ${st.currentStreak.toLocaleString('fa-IR')} روز پیاپی</span>` : ''}
                            ${this.habitsList.length > 1 ? `
                                <button type="button" class="del-icon-btn" style="width:26px;height:26px;border-radius:8px;" onclick="HabitsModule.deleteHabit('${h.id}')" title="حذف عادت">
                                    <i data-lucide="trash-2" class="icon-sm" style="width:12px;height:12px;"></i>
                                </button>
                            ` : ''}
                        </div>
                    </div>

                    <!-- نوار مدار عصبی تبدیل رفتار به عادت خودکار -->
                    <div style="display:flex; justify-content:space-between; font-size:10px; color:var(--text-muted); margin-bottom:3px; font-weight:700;">
                        <span>مدار عادت‌سازی (${st.totalDays.toLocaleString('fa-IR')} از ${st.targetDays.toLocaleString('fa-IR')} روز)</span>
                        <span>پایبندی ماهانه: ${st.rate30.toLocaleString('fa-IR')}٪</span>
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

    toggleHabitOnDate(habitId, dateStr) {
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

        // اگر تمام عادت‌های امروز کامل شد، جشن کوچک نشان بده
        const todayStr = this.getShamsiDateStr(0);
        if (wasAdded && dateStr === todayStr) {
            const allDoneToday = this.habitsList.every(h => (this.habitsLogs[h.id] || []).includes(todayStr));
            if (allDoneToday && window.confetti) {
                confetti({ particleCount: 90, spread: 65, origin: { y: 0.65 } });
                UI.showToast('🔥 فوق‌العاده! تمام عادت‌های امروزت رو ۱۰۰٪ تکمیل کردی!', 'success');
            }
        }
    },

    // ======================================================================
    // 📊 ۶. رندر تب ۲: نمودارهای هفتگی/ماهانه، رادار روزهای هفته و تحلیل هوشمند
    // ======================================================================
    setTrendPeriod(period) {
        this.trendPeriod = period;
        document.getElementById('btnHbTrend7d')?.classList.toggle('active', period === '7d');
        document.getElementById('btnHbTrend30d')?.classList.toggle('active', period === '30d');
        const titleEl = document.getElementById('hbTrendChartTitle');
        if (titleEl) {
            titleEl.innerText = period === '7d' ? 'روند پایبندی روزانه (۷ روز اخیر)' : 'روند پایبندی ماهانه (۳۰ روز اخیر)';
        }
        this.renderTrendChart();
    },

    renderAnalyticsTab() {
        const numHabits = Math.max(1, this.habitsList.length);

        // ۱. محاسبه آمار ۷ روز اخیر، هفته قبل و ۳۰ روز اخیر
        let done7 = 0, donePrev7 = 0, done30 = 0, perfectDays30 = 0;
        const heatmapGrid = document.getElementById('hbMonthlyHeatmapGrid');
        let heatmapHtml = '';

        // آمار روزهای هفته: شنبه (6) تا جمعه (5)
        const weekdayTotals = { 6: { sum: 0, count: 0 }, 0: { sum: 0, count: 0 }, 1: { sum: 0, count: 0 }, 2: { sum: 0, count: 0 }, 3: { sum: 0, count: 0 }, 4: { sum: 0, count: 0 }, 5: { sum: 0, count: 0 } };

        for (let i = -29; i <= 0; i++) {
            const dObj = new Date();
            dObj.setDate(dObj.getDate() + i);
            const dStr = this.getShamsiDateStr(i);
            const dayNum = parseInt(dStr.split('/')[2], 10);

            let doneOnDay = 0;
            this.habitsList.forEach(h => {
                if ((this.habitsLogs[h.id] || []).includes(dStr)) doneOnDay++;
            });

            done30 += doneOnDay;
            if (doneOnDay === numHabits) perfectDays30++;
            if (i >= -6) done7 += doneOnDay;
            if (i >= -13 && i <= -7) donePrev7 += doneOnDay;

            const dayPct = Math.round((doneOnDay / numHabits) * 100);
            const wDay = dObj.getDay();
            weekdayTotals[wDay].sum += dayPct;
            weekdayTotals[wDay].count++;

            const ratio = doneOnDay / numHabits;
            let lvlClass = '';
            if (ratio >= 0.85) lvlClass = 'lvl-3';
            else if (ratio >= 0.45) lvlClass = 'lvl-2';
            else if (ratio > 0) lvlClass = 'lvl-1';

            heatmapHtml += `<div class="heatmap-cell ${lvlClass}" title="${dStr}: ${dayPct}%">${dayNum.toLocaleString('fa-IR')}</div>`;
        }

        if (heatmapGrid) heatmapGrid.innerHTML = heatmapHtml;

        const rate7 = Math.min(100, Math.round((done7 / (numHabits * 7)) * 100));
        const ratePrev7 = Math.min(100, Math.round((donePrev7 / (numHabits * 7)) * 100));
        const rate30 = Math.min(100, Math.round((done30 / (numHabits * 30)) * 100));

        const habitStatsList = this.habitsList.map(h => ({ habit: h, ...this.getHabitStats(h.id) }));
        const bestStreak = habitStatsList.reduce((max, x) => Math.max(max, x.currentStreak), 0);

        document.getElementById('hbKpi7dRate').innerText = `${rate7.toLocaleString('fa-IR')}٪`;
        document.getElementById('hbKpi30dRate').innerText = `${rate30.toLocaleString('fa-IR')}٪`;
        document.getElementById('hbKpiBestStreak').innerText = `${bestStreak.toLocaleString('fa-IR')} روز`;
        document.getElementById('hbKpiPerfectDays').innerText = `${perfectDays30.toLocaleString('fa-IR')} روز`;

        // ۲. تولید متن مشاور هوشمند تحلیل رفتار
        const sortedByStrength = [...habitStatsList].sort((a, b) => b.rate30 - a.rate30);
        const strongestHabit = sortedByStrength[0];
        const weakestHabit = sortedByStrength[sortedByStrength.length - 1];

        const faDaysOrder = [
            { jsDay: 6, name: 'شنبه‌ها' },
            { jsDay: 0, name: 'یکشنبه‌ها' },
            { jsDay: 1, name: 'دوشنبه‌ها' },
            { jsDay: 2, name: 'سه‌شنبه‌ها' },
            { jsDay: 3, name: 'چهارشنبه‌ها' },
            { jsDay: 4, name: 'پنجشنبه‌ها' },
            { jsDay: 5, name: 'جمعه‌ها' }
        ];
        const weekdayAvgs = faDaysOrder.map(d => ({
            name: d.name,
            avg: weekdayTotals[d.jsDay].count > 0 ? Math.round(weekdayTotals[d.jsDay].sum / weekdayTotals[d.jsDay].count) : 0
        }));
        const weakestWeekday = [...weekdayAvgs].sort((a, b) => a.avg - b.avg)[0];

        const diffWeek = rate7 - ratePrev7;
        const trendSentence = diffWeek > 0
            ? `📈 <strong>روند صعودی عالی:</strong> پایبندی تو در ۷ روز اخیر <strong>${diffWeek.toLocaleString('fa-IR')}٪ بیشتر</strong> از هفته گذشته شده است!`
            : (diffWeek < 0
                ? `⚠️ <strong>هشدار افت خفیف:</strong> نظم این هفته‌ات نسبت به هفته قبل ${Math.abs(diffWeek).toLocaleString('fa-IR')}٪ کمتر شده؛ از همین امروز زنجیره رو دوباره ببند.`
                : `⚡ <strong>ثبات قدم:</strong> پایبندی این هفته‌ات روی ${rate7.toLocaleString('fa-IR')}٪ ثابت مانده است.`);

        const insightBox = document.getElementById('hbSmartInsightBox');
        if (insightBox) {
            insightBox.innerHTML = `
                <div>${trendSentence}</div>
                ${strongestHabit ? `<div>💎 <strong>قوی‌ترین عادت تو:</strong> «${strongestHabit.habit.title}» با ${strongestHabit.rate30.toLocaleString('fa-IR')}٪ پایبندی ماهانه در حال تبدیل شدن به یک رفتار کاملاً خودکار است.</div>` : ''}
                ${weakestHabit && weakestHabit.habit.id !== strongestHabit?.habit.id ? `<div>🎯 <strong>نقطه تمرکز:</strong> عادت «${weakestHabit.habit.title}» بیشترین جا افتادگی را دارد؛ سعی کن آن را به یک عادت قوی‌تر گره بزنی.</div>` : ''}
                <div>📅 <strong>الگوی روزهای هفته:</strong> آمار نشان می‌دهد در <strong>${weakestWeekday.name}</strong> بیشترین افت نظم را داری؛ حواست به این روز باشد!</div>
            `;
        }

        // ۳. رسم ۳ نمودار تحلیلی
        this.renderTrendChart();
        this.renderWeekdayPatternChart(weekdayAvgs);
        this.renderHabitStrengthChart(sortedByStrength);
    },

    renderTrendChart() {
        const canvas = document.getElementById('hbTrendChartCanvas');
        if (!canvas || !window.Chart) return;

        const daysCount = this.trendPeriod === '7d' ? 7 : 30;
        const numHabits = Math.max(1, this.habitsList.length);
        const labels = [];
        const dataPct = [];

        for (let i = -(daysCount - 1); i <= 0; i++) {
            const dStr = this.getShamsiDateStr(i);
            const parts = dStr.split('/');
            labels.push(i === 0 ? 'امروز' : `${parseInt(parts[2], 10).toLocaleString('fa-IR')}/${parseInt(parts[1], 10).toLocaleString('fa-IR')}`);

            let done = 0;
            this.habitsList.forEach(h => {
                if ((this.habitsLogs[h.id] || []).includes(dStr)) done++;
            });
            dataPct.push(Math.round((done / numHabits) * 100));
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
                        borderColor: '#f59e0b',
                        borderWidth: 2,
                        pointRadius: this.trendPeriod === '7d' ? 3 : 0,
                        tension: 0.35,
                        fill: false
                    },
                    {
                        type: 'bar',
                        label: 'درصد تحقق عادت‌ها',
                        data: dataPct,
                        backgroundColor: 'rgba(119, 187, 169, 0.55)',
                        borderColor: '#77bba9',
                        borderWidth: 1,
                        borderRadius: 6
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true, max: 100, ticks: { callback: v => v + '%' } }
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
                    backgroundColor: weekdayAvgs.map(x => x.avg >= 75 ? '#10b981' : (x.avg >= 45 ? '#77bba9' : '#e59ea3')),
                    borderRadius: 8
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: { beginAtZero: true, max: 100, ticks: { callback: v => v + '%' } }
                },
                plugins: { legend: { display: false } }
            }
        });
    },

    renderHabitStrengthChart(sortedStats) {
        const canvas = document.getElementById('hbStrengthChartCanvas');
        if (!canvas || !window.Chart) return;

        if (this.strengthChartInstance) this.strengthChartInstance.destroy();
        this.strengthChartInstance = new Chart(canvas.getContext('2d'), {
            type: 'bar',
            data: {
                labels: sortedStats.map(x => x.habit.title.slice(0, 22)),
                datasets: [{
                    label: 'پایبندی ۳۰ روزه',
                    data: sortedStats.map(x => x.rate30),
                    backgroundColor: 'rgba(129, 140, 248, 0.65)',
                    borderColor: '#818cf8',
                    borderWidth: 1,
                    borderRadius: 6
                }]
            },
            options: {
                indexAxis: 'y',
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { beginAtZero: true, max: 100, ticks: { callback: v => v + '%' } }
                },
                plugins: { legend: { display: false } }
            }
        });
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
            <div class="card-box" style="padding:12px 14px; margin-bottom:8px; background:var(--surface-2);">
                <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <div class="module-icon-badge" style="width:36px;height:36px;"><i data-lucide="${p.icon}" class="icon-sm"></i></div>
                        <div>
                            <strong style="font-size:13px; color:var(--text-main); display:block;">${p.title}</strong>
                            <small style="font-size:11px; color:var(--text-muted);">${p.desc}</small>
                        </div>
                    </div>
                    <button type="button" class="btn-modal auto-width" style="padding:7px 12px; font-size:11.5px;" onclick="HabitsModule.addPresetHabit(${idx})">
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
        UI.showToast(`عادت «${target.title}» به میز عادت‌های شما اضافه شد!`, 'success');
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
