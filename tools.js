/* ==========================================================================
   🧰 ماژول جامع ابزارهای هوشمند و پروفایل کاربری (js/tools.js)
   شامل:
   ۱. صفحه کامل و اختصاصی فلش‌کارت و لایتنر هوشمند (#view-flashcards):
      - داشبورد آمار، نمودار عملکرد ۷ روز گذشته و وضعیت ۵ خانه لایتنر + مخزن جدید
      - جلسه مرور تک‌به‌تک و خلوت (Focus Player) با دکمه‌های واضح و بدون شلوغی
      - دسته‌بندی دوگانه بر اساس «نام درس» و «نام فصل» (متصل به knowledge_graph)
      - فرمول‌ساز ۱۰۰٪ سالم (دکمه‌های لمسی + ویجت فرمول‌ساز پرکردنی برای کسر، رادیکال، توان و حد)
   ۲. ردیاب عادت‌ها (ماتریس ۷ روزه با قابلیت تیک روزهای قبل + هیت‌مپ ماهانه)
   ۳. تایمر پومودورو تمام‌صفحه سینماتیک + چالش بیدارباش خودکار + ماژول پروفایل
   ========================================================================== */

const ToolsModule = {
    // ۱. داده‌های ردیاب عادت‌ها
    habitsList: [],
    habitsLogs: {},
    habitViewMode: 'weekly',
    habitAdherenceChart: null,

    // ۲. داده‌های سیستم جامع فلش‌کارت و لایتنر
    flashcards: [],
    publicDecks: [],
    chaptersBySubject: {}, // { "حسابان ۲": ["فصل ۱: ...", "فصل ۲: ..."] }
    leitnerSettings: {
        daily_new_limit: 10,
        new_filter_subject: 'all',
        review_history: {} // { "1405/08/13": { reviewed: 12, correct: 10, wrong: 2 } }
    },
    fcPageTab: 'dashboard', // 'dashboard' | 'create' | 'library'
    inReviewSession: false,
    dueQueue: [],
    currentDueIndex: 0,
    sessionStats: { total: 0, done: 0, correct: 0, wrong: 0 },
    activeLatexTarget: 'inpFcFront',
    activeBuilderType: null,

    // دیکشنری امن فرمول‌های ریاضی، فیزیک و شیمی (بدون باگ اسکیپ در HTML)
    latexSnippets: {
        frac: String.raw`$\frac{a}{b}$`,
        sqrt: String.raw`$\sqrt{x}$`,
        nthroot: String.raw`$\sqrt[n]{x}$`,
        pow: String.raw`$x^{2}$`,
        sub: String.raw`$x_{1}$`,
        lim: String.raw`$\lim_{x \to 0} f(x)$`,
        int: String.raw`$\int_{a}^{b} f(x)\,dx$`,
        deriv: String.raw`$\left(\frac{u}{v}\right)' = \frac{u'v - v'u}{v^2}$`,
        log: String.raw`$\log_{a}(b)$`,
        sin: String.raw`$\sin(\theta)$`,
        cos: String.raw`$\cos(\theta)$`,
        vec: String.raw`$\vec{F} = m\vec{a}$`,
        Delta: String.raw`$\Delta x$`,
        eq_arrow: String.raw`$\rightleftharpoons$`,
        heat_arrow: String.raw`$\xrightarrow{\Delta}$`,
        h3o: String.raw`$[\text{H}_3\text{O}^+]$`,
        ph: String.raw`$\text{pH} = -\log[\text{H}^+]$`,
        neq: String.raw`$\neq$`,
        leq: String.raw`$\leq$`,
        geq: String.raw`$\geq$`,
        implies: String.raw`$\Rightarrow$`
    },

    // فصل‌های استاندارد پیش‌فرض (در کنار فصل‌های جدول knowledge_graph)
    defaultChaptersMap: {
        'حسابان ۲': ['فصل ۱: تابع', 'فصل ۲: مثلثات', 'فصل ۳: حد و پیوستگی', 'فصل ۴: مشتق', 'فصل ۵: کاربرد مشتق'],
        'حسابان ۱': ['فصل ۱: جبر و معادله', 'فصل ۲: تابع', 'فصل ۳: توابع نمایی و لگاریتمی', 'فصل ۴: مثلثات', 'فصل ۵: حد و پیوستگی'],
        'ریاضی ۳': ['فصل ۱: تابع', 'فصل ۲: مثلثات', 'فصل ۳: حد بی‌نهایت', 'فصل ۴: مشتق', 'فصل ۵: کاربرد مشتق', 'فصل ۶: هندسه', 'فصل ۷: احتمال'],
        'ریاضیات گسسته': ['فصل ۱: آشنایی با نظریه اعداد', 'فصل ۲: گراف و مدل‌سازی', 'فصل ۳: ترکیبیات (شمارش)'],
        'هندسه ۳': ['فصل ۱: ماتریس و کاربردها', 'فصل ۲: مقاطع مخروطی', 'فصل ۳: بردارها'],
        'فیزیک ۳': ['فصل ۱: حرکت بر خط راست', 'فصل ۲: دینامیک', 'فصل ۳: نوسان و امواج', 'فصل ۴: فیزیک اتمی و هسته‌ای'],
        'فیزیک ۲': ['فصل ۱: الکتریسیته ساکن', 'فصل ۲: جریان الکتریکی و مدارها', 'فصل ۳: مغناطیس و القای الکترومغناطیسی'],
        'فیزیک ۱': ['فصل ۱: فیزیک و اندازه‌گیری', 'فصل ۲: ویژگی‌های فیزیکی مواد (فشار)', 'فصل ۳: کار، انرژی و توان', 'فصل ۴: دما و گرما'],
        'شیمی ۳': ['فصل ۱: مولکول‌ها در خدمت تندرستی', 'فصل ۲: آسایش و رفاه در سایه شیمی', 'فصل ۳: شیمی جلوه‌ای از هنر و زیبایی', 'فصل ۴: شیمی راهی به سوی آینده‌ای روشن‌تر'],
        'شیمی ۲': ['فصل ۱: قدر هدایای زمینی را بدانیم', 'فصل ۲: در پی غذای سالم', 'فصل ۳: پوشاک نیازی پایان‌ناپذیر'],
        'شیمی ۱': ['فصل ۱: کیهان زادگاه عنصرها', 'فصل ۲: ردپای گازها در زندگی', 'فصل ۳: آب، آهنگ زندگی'],
        'زیست‌شناسی ۳': ['فصل ۱: مولکول‌های اطلاعاتی', 'فصل ۲: جریان اطلاعات در یاخته', 'فصل ۳: انتقال اطلاعات در نسل‌ها', 'فصل ۴: تغییر در اطلاعات وراثتی', 'فصل ۵: از ماده به انرژی', 'فصل ۶: از انرژی به ماده', 'فصل ۷: فناوری‌های نوین زیستی', 'فصل ۸: رفتارهای جانوران'],
        'زیست‌شناسی ۲': ['فصل ۱: تنظیم عصبی', 'فصل ۲: حواس', 'فصل ۳: دستگاه حرکتی', 'فصل ۴: تنظیم شیمیایی', 'فصل ۵: ایمنی', 'فصل ۶: تقسیم یاخته', 'فصل ۷: تولیدمثل', 'فصل ۸: تولیدمثل نهاندانگان', 'فصل ۹: پاسخ گیاهان به محرک‌ها'],
        'زیست‌شناسی ۱': ['فصل ۱: دنیای زنده', 'فصل ۲: گوارش و جذب مواد', 'فصل ۳: تبادلات گازی', 'فصل ۴: گردش مواد در بدن', 'فصل ۵: تنظیم اسمزی و دفع', 'فصل ۶: از یاخته تا گیاه', 'فصل ۷: جذب و انتقال مواد در گیاهان']
    },

    // ۳. وضعیت تایمر تمام‌صفحه سینماتیک
    pomoConfig: { studyMins: 45, breakMins: 10, totalRounds: 3, theme: 'eclipse' },
    pomoRuntime: {
        isRunning: false,
        isPaused: false,
        phase: 'study',
        currentRound: 1,
        secondsLeft: 2700,
        totalPhaseSeconds: 2700,
        intervalId: null,
        wakeLock: null,
        ambientAudioCtx: null,
        ambientPlaying: false
    },
    activeQuestBlockId: null,
    gameTimerInterval: null,

    // ======================================================================
    // 🚀 ۱. راه‌اندازی اولیه و بارگذاری داده‌های ابزارها و فصل‌های دروس
    // ======================================================================
    async init() {
        this.ensureFullFlashcardViewInjected();
        this.injectEnhancedToolModals();
        await this.loadToolsDataFromSupabase();
        this.renderHomeHabitsSummary();
        this.updateToolsSquareBadges();
        UI.refreshIcons();
    },

    // رندر فرمول‌های ریاضی و شیمی با KaTeX (پشتیبانی از $...$ و $$...$$)
    renderMathInHtml(rawText) {
        if (!rawText) return '';
        let safe = String(rawText)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        if (window.katex) {
            safe = safe.replace(/\$\$([\s\S]+?)\$\$/g, (_, tex) => {
                try {
                    return window.katex.renderToString(tex.trim(), { displayMode: true, throwOnError: false });
                } catch (_) { return `$$${tex}$$`; }
            });
            safe = safe.replace(/\$([^$\n]+?)\$/g, (_, tex) => {
                try {
                    return window.katex.renderToString(tex.trim(), { displayMode: false, throwOnError: false });
                } catch (_) { return `$${tex}$`; }
            });
        }
        return safe.replace(/\n/g, '<br>');
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

    async loadToolsDataFromSupabase() {
        const uid = String(AppState.userId || '');
        const localHabitsKey = `qotbnama_habits_v2_${uid}`;
        const localLogsKey = `qotbnama_habit_logs_v2_${uid}`;
        const localFcKey = `qotbnama_leitner_fc_${uid}`;
        const localSetKey = `qotbnama_leitner_cfg_${uid}`;

        const defaultHabits = [
            { id: 'h_wake', title: 'بیداری قبل از ساعت ۷ صبح', icon: 'sunrise' },
            { id: 'h_test', title: 'روتین تست قرابت و لغت شبانه', icon: 'book-open-check' },
            { id: 'h_phone', title: 'کنترل گوشی زیر ۱.۵ ساعت', icon: 'shield-check' },
            { id: 'h_report', title: 'ثبت گزارش عملکرد شبانه', icon: 'check-square' }
        ];
        const todayStr = this.getShamsiDateStr(0);
        const defaultCards = [
            {
                id: 'fc_1',
                subject: 'حسابان ۲',
                chapter: 'فصل ۴: مشتق',
                front: String.raw`مشتق تابع کسری $\frac{u}{v}$ برابر است با:`,
                back: String.raw`$$\left(\frac{u}{v}\right)' = \frac{u'v - v'u}{v^2}$$`,
                box: 1,
                nextReview: todayStr,
                streak: 0
            },
            {
                id: 'fc_2',
                subject: 'شیمی ۳',
                chapter: 'فصل ۱: مولکول‌ها در خدمت تندرستی',
                front: String.raw`فرمول محاسبه $\text{pH}$ محلول اسیدی چیست؟`,
                back: String.raw`$$\text{pH} = -\log[\text{H}_3\text{O}^+]$$`,
                box: 1,
                nextReview: todayStr,
                streak: 0
            }
        ];

        this.habitsList = JSON.parse(Storage.get(localHabitsKey, 'null')) || defaultHabits;
        this.habitsLogs = JSON.parse(Storage.get(localLogsKey, 'null')) || {};
        this.flashcards = JSON.parse(Storage.get(localFcKey, 'null')) || defaultCards;
        const savedCfg = JSON.parse(Storage.get(localSetKey, 'null')) || {};
        this.leitnerSettings = {
            daily_new_limit: parseInt(savedCfg.daily_new_limit, 10) || 10,
            new_filter_subject: savedCfg.new_filter_subject || 'all',
            review_history: savedCfg.review_history || {}
        };

        this.chaptersBySubject = { ...this.defaultChaptersMap };

        if (!uid) return;

        try {
            const grade = AppState.studentGrade || 'دوازدهم';
            const major = AppState.studentMajor || 'تجربی';

            const [userToolsRes, decksRes, kgRes] = await Promise.all([
                supabaseClient.from('student_tools_data').select('*').eq('national_id', uid).maybeSingle(),
                supabaseClient.from('public_flashcard_decks').select('*').eq('is_active', true),
                supabaseClient.from('knowledge_graph').select('book_name, chapter_num, chapter_name').eq('grade', grade).eq('major', major)
            ]);

            if (decksRes.data) {
                this.publicDecks = decksRes.data;
            }

            // استخراج دقیق نام فصل‌های هر کتاب از جدول knowledge_graph
            if (kgRes.data && kgRes.data.length > 0) {
                kgRes.data.forEach(row => {
                    const bName = window.normalizeSubjectName ? window.normalizeSubjectName(row.book_name) : row.book_name;
                    const chTitle = row.chapter_name
                        ? (String(row.chapter_name).startsWith('فصل') ? row.chapter_name : `فصل ${row.chapter_num || ''}: ${row.chapter_name}`)
                        : null;
                    if (bName && chTitle) {
                        if (!this.chaptersBySubject[bName]) this.chaptersBySubject[bName] = [];
                        if (!this.chaptersBySubject[bName].includes(chTitle)) {
                            this.chaptersBySubject[bName].push(chTitle);
                        }
                    }
                });
            }

            if (userToolsRes.data) {
                const d = userToolsRes.data;
                if (Array.isArray(d.habits_list) && d.habits_list.length > 0) this.habitsList = d.habits_list;
                if (d.habits_logs && typeof d.habits_logs === 'object') this.habitsLogs = d.habits_logs;
                if (Array.isArray(d.flashcards) && d.flashcards.length > 0) this.flashcards = d.flashcards;
                if (d.leitner_settings && typeof d.leitner_settings === 'object') {
                    this.leitnerSettings = {
                        daily_new_limit: parseInt(d.leitner_settings.daily_new_limit, 10) || 10,
                        new_filter_subject: d.leitner_settings.new_filter_subject || 'all',
                        review_history: d.leitner_settings.review_history || {}
                    };
                }
                this.cacheToolsLocally();
            } else {
                await this.syncToolsToSupabase();
            }
        } catch (_) {}
    },

    cacheToolsLocally() {
        const uid = String(AppState.userId || '');
        Storage.set(`qotbnama_habits_v2_${uid}`, JSON.stringify(this.habitsList));
        Storage.set(`qotbnama_habit_logs_v2_${uid}`, JSON.stringify(this.habitsLogs));
        Storage.set(`qotbnama_leitner_fc_${uid}`, JSON.stringify(this.flashcards));
        Storage.set(`qotbnama_leitner_cfg_${uid}`, JSON.stringify(this.leitnerSettings));
    },

    async syncToolsToSupabase() {
        this.cacheToolsLocally();
        const uid = String(AppState.userId || '');
        if (!uid) return;
        try {
            await supabaseClient.from('student_tools_data').upsert([{
                national_id: uid,
                habits_list: this.habitsList,
                habits_logs: this.habitsLogs,
                flashcards: this.flashcards,
                leitner_settings: this.leitnerSettings,
                updated_at: new Date().toISOString()
            }], { onConflict: 'national_id' });
        } catch (_) {}
    },

    // ======================================================================
    // 🗂️ ۲. ساخت صفحه کامل و اختصاصی فلش‌کارت و لایتنر (#view-flashcards)
    // ======================================================================
    ensureFullFlashcardViewInjected() {
        const appShell = document.getElementById('shell-app');
        if (!appShell || document.getElementById('view-flashcards')) return;

        const section = document.createElement('section');
        section.id = 'view-flashcards';
        section.className = 'spa-view';
        section.innerHTML = `
            <!-- هدر بالای صفحه کامل فلش‌کارت -->
            <div class="module-top-bar">
                <div style="display:flex; align-items:center; gap:10px;">
                    <button type="button" class="nav-icon-btn" onclick="ToolsModule.closeFlashcardsPage()" title="بازگشت">
                        <i data-lucide="arrow-right" class="icon"></i>
                    </button>
                    <div class="module-title-group">
                        <h2>جعبه لایتنر و فلش‌کارت هوشمند</h2>
                        <p>مرور زمان‌بندی‌شده به تفکیک درس و فصل با پشتیبانی فرمول</p>
                    </div>
                </div>
                <span class="konkur-pill" id="fcPageTopBadge">۰ کارت کل</span>
            </div>

            <!-- نوار ۳ تایی تب‌های صفحه فلش‌کارت -->
            <div class="subtabs-bar" id="fcMainSubtabsBar">
                <button type="button" class="subtab-btn active" id="btnFcPageDash" onclick="ToolsModule.switchFcPageTab('dashboard')">
                    <i data-lucide="layout-dashboard" class="icon-sm"></i>
                    <span>۱. میز کار و مرور امروز</span>
                </button>
                <button type="button" class="subtab-btn" id="btnFcPageCreate" onclick="ToolsModule.switchFcPageTab('create')">
                    <i data-lucide="plus-circle" class="icon-sm"></i>
                    <span>۲. ساخت کارت جدید</span>
                </button>
                <button type="button" class="subtab-btn" id="btnFcPageLib" onclick="ToolsModule.switchFcPageTab('library')">
                    <i data-lucide="book-copy" class="icon-sm"></i>
                    <span>۳. بانک راهینو و کارت‌های من</span>
                </button>
            </div>

            <!-- ==============================================================
                 تب ۱: میز کار لایتنر، آمار روزهای گذشته و شروع جلسه مرور امروز
                 ============================================================== -->
            <div id="fcPageTabDashboard">
                
                <!-- الف) نمای داشبورد (وقتی هنوز دکمه شروع مرور زده نشده) -->
                <div id="fcDashboardOverview">
                    <div class="fc-hero-launch">
                        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:10px; flex-wrap:wrap;">
                            <div>
                                <h3 style="font-size:16px; font-weight:900; color:var(--primary); display:flex; align-items:center; gap:6px;">
                                    <i data-lucide="Flame" class="icon-sm gold-text"></i>
                                    <span>مأموریت مرور امروز شما</span>
                                </h3>
                                <p style="font-size:11.5px; color:var(--text-muted); margin-top:3px;">
                                    هر روز کارت‌های موعد مرور + سهمیه کارت‌های جدید شما آماده پاسخ‌گویی می‌شوند.
                                </p>
                            </div>
                            <span class="status-pill" id="fcTodayReviewedPill">امروز: ۰ مرور انجام‌شده</span>
                        </div>

                        <div class="fc-launch-stats">
                            <div class="fc-launch-stat-item">
                                <small>مرورهای موعد امروز</small>
                                <strong class="primary-text" id="fcDueOldCount">۰</strong>
                            </div>
                            <div class="fc-launch-stat-item">
                                <small>کارت جدید آماده ورود</small>
                                <strong class="indigo-text" id="fcDueNewCount">۰</strong>
                            </div>
                            <div class="fc-launch-stat-item">
                                <small>مجموع مرور امروز</small>
                                <strong class="gold-text" id="fcDueTotalCount">۰ کارت</strong>
                            </div>
                        </div>

                        <!-- تنظیم شفاف سهمیه روزانه و فیلتر درس/فصل -->
                        <div class="form-grid-2" style="margin-bottom:12px;">
                            <div class="form-group" style="margin-bottom:0;">
                                <label style="font-size:11px;"><i data-lucide="sliders" class="icon-sm"></i> روزی چند کارت جدید وارد چرخه شود؟</label>
                                <select id="selFcDailyLimit" class="modern-input" style="padding:8px 10px;" onchange="ToolsModule.updateLeitnerConfig()">
                                    <option value="5">روزی ۵ کارت جدید</option>
                                    <option value="10">روزی ۱۰ کارت جدید (پیشنهادی)</option>
                                    <option value="15">روزی ۱۵ کارت جدید</option>
                                    <option value="20">روزی ۲۰ کارت جدید</option>
                                    <option value="30">روزی ۳۰ کارت جدید</option>
                                    <option value="50">روزی ۵۰ کارت جدید</option>
                                </select>
                            </div>
                            <div class="form-group" style="margin-bottom:0;">
                                <label style="font-size:11px;"><i data-lucide="filter" class="icon-sm"></i> فیلتر درس برای مرور الان:</label>
                                <select id="selFcReviewFilterSubj" class="modern-input" style="padding:8px 10px;" onchange="ToolsModule.onReviewFilterSubjectChange()">
                                    <option value="all">همه دروس (مرور استاندارد روزانه)</option>
                                </select>
                            </div>
                        </div>

                        <div class="form-group" id="wrapFcReviewFilterChap" style="display:none; margin-bottom:12px;">
                            <label style="font-size:11px;"><i data-lucide="bookmark" class="icon-sm"></i> فیلتر فصل خاص برای مرور:</label>
                            <select id="selFcReviewFilterChap" class="modern-input" style="padding:8px 10px;" onchange="ToolsModule.refreshFlashcardDashboard()">
                                <option value="all">همه فصل‌های این درس</option>
                            </select>
                        </div>

                        <button type="button" class="btn-primary-full" id="btnStartReviewSession" onclick="ToolsModule.startReviewSession()">
                            <i data-lucide="play" class="icon"></i>
                            <span id="btnStartReviewLabel">شروع جلسه مرور امروز</span>
                        </button>
                    </div>

                    <!-- قفسه ۵ خانه لایتنر + مخزن کارت‌های جدید -->
                    <div class="section-title">
                        <span class="bar"></span>
                        <i data-lucide="boxes" class="icon-sm"></i>
                        <span>وضعیت کارت‌های شما در ۵ خانه لایتنر</span>
                    </div>
                    <div class="leitner-pipeline-grid" id="fcPipelineBoxes"></div>

                    <!-- آمار عملکرد ۷ روز گذشته دانش‌آموز -->
                    <div class="section-title">
                        <span class="bar"></span>
                        <i data-lucide="bar-chart-3" class="icon-sm"></i>
                        <span>آمار عملکرد و پیوستگی مرور شما (۷ روز اخیر)</span>
                    </div>
                    <div class="card-box">
                        <div class="habit-kpi-row">
                            <div class="habit-kpi-box">
                                <small>مرور ۷ روز اخیر</small>
                                <strong id="fcStat7DaysTotal">۰ کارت</strong>
                            </div>
                            <div class="habit-kpi-box">
                                <small>نرخ یادآوری موفق</small>
                                <strong class="success-text" id="fcStatAccuracyPct">۰٪</strong>
                            </div>
                            <div class="habit-kpi-box">
                                <small>تثبیت‌شده (خانه ۵)</small>
                                <strong class="gold-text" id="fcStatMasteredCount">۰ کارت</strong>
                            </div>
                        </div>
                        <div class="fc-history-bars" id="fcHistory7DaysBars"></div>
                    </div>
                </div>

                <!-- ب) پخش‌کننده متمرکز مرور تک‌به‌تک (وقتی دانش‌آموز دکمه شروع مرور را می‌زند) -->
                <div id="fcReviewSessionPlayer" style="display:none;">
                    <div class="fc-review-session-box">
                        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:10px; flex-wrap:wrap;">
                            <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                                <span class="konkur-pill" id="fcPlayerSubjBadge">درس</span>
                                <span class="status-pill" id="fcPlayerChapBadge">فصل</span>
                                <span class="dur-badge gold" id="fcPlayerBoxBadge" style="margin:0;">خانه ۱</span>
                            </div>
                            <button type="button" class="btn-copy-inline" onclick="ToolsModule.exitReviewSession()">
                                <i data-lucide="x" class="icon-sm"></i>
                                <span>پایان و بازگشت به میز کار</span>
                            </button>
                        </div>

                        <!-- نوار پیشرفت جلسه مرور -->
                        <div class="progress-header" style="margin-bottom:6px; font-size:11.5px;">
                            <span id="fcPlayerProgressLabel">کارت ۱ از ۱۰</span>
                            <span class="success-text" id="fcPlayerScoreLabel">۰ درست • ۰ مرور مجدد</span>
                        </div>
                        <div class="progress-bar-bg" style="height:7px; margin-bottom:14px;">
                            <div class="progress-bar-fill" id="fcPlayerProgressBar" style="width:0%;"></div>
                        </div>

                        <!-- کارت سه‌بعدی بزرگ -->
                        <div class="fc-session-stage" id="fcSessionStage" onclick="ToolsModule.flipSessionCard()">
                            <div class="fc-session-inner">
                                <div class="fc-session-face front">
                                    <span class="fc-hint">سوال / روی کارت (برای چرخش روی کارت بزنید)</span>
                                    <div class="fc-face-content" id="fcSessionFrontText">...</div>
                                    <small style="font-size:10.5px; color:var(--text-muted);">ابتدا پاسخ را در ذهن خود مرور کنید</small>
                                </div>
                                <div class="fc-session-face back">
                                    <span class="fc-hint accent">پاسخ تشریحی / پشت کارت</span>
                                    <div class="fc-face-content" id="fcSessionBackText">...</div>
                                    <small style="font-size:10.5px; color:var(--accent);">آیا پاسخ را به درستی به یاد آوردید؟</small>
                                </div>
                            </div>
                        </div>

                        <!-- دکمه قبل از چرخش کارت -->
                        <div id="fcBeforeFlipActions">
                            <button type="button" class="btn-primary-full" onclick="ToolsModule.flipSessionCard()">
                                <i data-lucide="eye" class="icon-sm"></i>
                                <span>مشاهده پاسخ کارت</span>
                            </button>
                        </div>

                        <!-- دکمه‌های ثبت نتیجه بعد از چرخش کارت -->
                        <div id="fcAfterFlipActions" style="display:none;">
                            <div class="leitner-binary-btns">
                                <button type="button" class="btn-leitner-bin wrong" onclick="ToolsModule.submitSessionCardAnswer(false)">
                                    <i data-lucide="rotate-ccw" class="icon-sm"></i>
                                    <div style="text-align:right;">
                                        <div>یادم نبود / اشتباه</div>
                                        <small style="font-size:10px; font-weight:700; opacity:0.85; display:block;">بازگشت به خانه ۱ (مرور فردا)</small>
                                    </div>
                                </button>
                                <button type="button" class="btn-leitner-bin right" onclick="ToolsModule.submitSessionCardAnswer(true)">
                                    <i data-lucide="check-circle-2" class="icon-sm"></i>
                                    <div style="text-align:right;">
                                        <div>بلد بودم!</div>
                                        <small id="fcNextIntervalLabel" style="font-size:10px; font-weight:700; opacity:0.85; display:block;">ارتقا به خانه بعدی</small>
                                    </div>
                                </button>
                            </div>
                        </div>

                        <!-- ابزارهای جانبی کارت فعلی -->
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:12px; padding-top:10px; border-top:1px dashed var(--border);">
                            <button type="button" class="link-btn" onclick="ToolsModule.prevSessionCard()">
                                <i data-lucide="chevron-right" class="icon-sm"></i><span>کارت قبلی</span>
                            </button>
                            <button type="button" class="link-btn danger-text" onclick="ToolsModule.deleteCurrentSessionCard()">
                                <i data-lucide="trash-2" class="icon-sm"></i><span>حذف این کارت</span>
                            </button>
                            <button type="button" class="link-btn" onclick="ToolsModule.nextSessionCard()">
                                <span>رد کردن (بعدی)</span><i data-lucide="chevron-left" class="icon-sm"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- ==============================================================
                 تب ۲: ساخت راحت و سریع فلش‌کارت جدید (با درس، فصل و فرمول‌ساز)
                 ============================================================== -->
            <div id="fcPageTabCreate" style="display:none;">
                <div class="card-box">
                    <div class="section-title" style="margin-top:0;">
                        <span class="bar"></span>
                        <i data-lucide="book-open" class="icon-sm"></i>
                        <span>۱. انتخاب درس و فصل فلش‌کارت</span>
                    </div>

                    <div class="form-grid-2">
                        <div class="form-group">
                            <label><i data-lucide="book" class="icon-sm"></i> نام درس:</label>
                            <select id="inpFcSubject" class="modern-input" onchange="ToolsModule.onCreateSubjectChange()"></select>
                        </div>
                        <div class="form-group">
                            <label><i data-lucide="bookmark" class="icon-sm"></i> نام فصل یا مبحث:</label>
                            <select id="inpFcChapterSelect" class="modern-input" onchange="ToolsModule.onCreateChapterSelectChange()"></select>
                        </div>
                    </div>

                    <div class="form-group" id="wrapCustomChapterInput" style="display:none;">
                        <label>عنوان فصل یا مبحث دلخواه را بنویسید:</label>
                        <input type="text" id="inpFcCustomChapter" class="modern-input" placeholder="مثلاً: فصل ۲ - معادلات مثلثاتی">
                    </div>

                    <div class="section-title">
                        <span class="bar"></span>
                        <i data-lucide="calculator" class="icon-sm"></i>
                        <span>۲. دستیار هوشمند درج فرمول ریاضی، فیزیک و شیمی</span>
                    </div>

                    <div class="latex-helper-box">
                        <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:8px; flex-wrap:wrap;">
                            <span style="font-size:11.5px; font-weight:900; color:var(--primary);">
                                ابتدا روی کادر «سوال» یا «پاسخ» کلیک کنید، سپس روی دکمه فرمول دلخواه بزنید:
                            </span>
                            <button type="button" class="btn-copy-inline" style="padding:4px 9px; font-size:10.5px;" onclick="ToolsModule.copyAiLatexPrompt(this)">
                                <i data-lucide="sparkles" class="icon-sm"></i>
                                <span>کپی دستور آماده برای ChatGPT/جمینای</span>
                            </button>
                        </div>

                        <!-- ردیف ۱: فرمول‌سازهای پرکردنی آسان (بدون نیاز به کدنویسی!) -->
                        <div class="latex-toolbar">
                            <button type="button" class="latex-btn" style="border-color:var(--primary); color:var(--primary);" onclick="ToolsModule.openFormulaBuilder('frac')">
                                <span>➕ کسر (صورت و مخرج)</span>
                            </button>
                            <button type="button" class="latex-btn" style="border-color:var(--primary); color:var(--primary);" onclick="ToolsModule.openFormulaBuilder('sqrt')">
                                <span>➕ رادیکال √</span>
                            </button>
                            <button type="button" class="latex-btn" style="border-color:var(--primary); color:var(--primary);" onclick="ToolsModule.openFormulaBuilder('pow')">
                                <span>➕ توان و اندیس</span>
                            </button>
                            <button type="button" class="latex-btn" style="border-color:var(--primary); color:var(--primary);" onclick="ToolsModule.openFormulaBuilder('lim')">
                                <span>➕ حد (lim)</span>
                            </button>
                        </div>

                        <!-- ویجت پرکردنی خودکار فرمول -->
                        <div id="fcFormulaBuilderBox" class="formula-builder-Assistant"></div>

                        <!-- ردیف ۲: نمادهای تک‌کلیکی آماده و ۱۰۰٪ تست‌شده -->
                        <div class="latex-toolbar" style="margin-bottom:0;">
                            <button type="button" class="latex-btn" onclick="ToolsModule.insertFormulaKey('int')">انتگرال ∫</button>
                            <button type="button" class="latex-btn" onclick="ToolsModule.insertFormulaKey('deriv')">مشتق کسر</button>
                            <button type="button" class="latex-btn" onclick="ToolsModule.insertFormulaKey('sin')">sin(θ)</button>
                            <button type="button" class="latex-btn" onclick="ToolsModule.insertFormulaKey('cos')">cos(θ)</button>
                            <button type="button" class="latex-btn" onclick="ToolsModule.insertFormulaKey('log')">لگاریتم log</button>
                            <button type="button" class="latex-btn" onclick="ToolsModule.insertFormulaKey('Delta')">Δ تغییرات</button>
                            <button type="button" class="latex-btn" onclick="ToolsModule.insertFormulaKey('vec')">بردار نیرو</button>
                            <button type="button" class="latex-btn" onclick="ToolsModule.insertFormulaKey('eq_arrow')">واکنش تعادلی ⇌</button>
                            <button type="button" class="latex-btn" onclick="ToolsModule.insertFormulaKey('heat_arrow')">واکنش با گرما →</button>
                            <button type="button" class="latex-btn" onclick="ToolsModule.insertFormulaKey('h3o')">غلظت [H₃O⁺]</button>
                            <button type="button" class="latex-btn" onclick="ToolsModule.insertFormulaKey('ph')">فرمول pH</button>
                            <button type="button" class="latex-btn" onclick="ToolsModule.insertFormulaKey('implies')">نتیجه می‌دهد ⇒</button>
                            <button type="button" class="latex-btn" onclick="ToolsModule.insertFormulaKey('leq')">≤</button>
                            <button type="button" class="latex-btn" onclick="ToolsModule.insertFormulaKey('geq')">≥</button>
                            <button type="button" class="latex-btn" onclick="ToolsModule.insertFormulaKey('neq')">≠</button>
                        </div>
                    </div>

                    <div class="form-group">
                        <label><i data-lucide="help-circle" class="icon-sm"></i> روی کارت (سوال، نکته یا عبارت):</label>
                        <textarea class="modern-input" id="inpFcFront" rows="3" placeholder="سوال را بنویسید..."
                                  onfocus="ToolsModule.activeLatexTarget='inpFcFront'"
                                  oninput="ToolsModule.updateLatexPreview()"></textarea>
                    </div>

                    <div class="form-group">
                        <label><i data-lucide="check-circle" class="icon-sm"></i> پشت کارت (پاسخ، فرمول یا توضیح):</label>
                        <textarea class="modern-input" id="inpFcBack" rows="3" placeholder="پاسخ را بنویسید..."
                                  onfocus="ToolsModule.activeLatexTarget='inpFcBack'"
                                  oninput="ToolsModule.updateLatexPreview()"></textarea>
                    </div>

                    <div style="margin-bottom:14px;">
                        <span style="font-size:11.5px; font-weight:900; color:var(--primary); display:block; margin-bottom:5px;">پیش‌نمایش زنده کارت شما (با رندر فرمول):</span>
                        <div class="latex-preview-card" id="fcLatexLivePreview">در کادر بالا بنویسید تا شکل نهایی فرمول و کارت اینجا نمایش داده شود...</div>
                    </div>

                    <button type="button" class="btn-primary-full" onclick="ToolsModule.addFlashcard()">
                        <i data-lucide="plus-circle" class="icon"></i>
                        <span>ذخیره و افزودن به جعبه لایتنر</span>
                    </button>
                </div>
            </div>

            <!-- ==============================================================
                 تب ۳: بانک بسته‌های آماده راهینو + لیست کارت‌های من (به تفکیک درس و فصل)
                 ============================================================== -->
            <div id="fcPageTabLibrary" style="display:none;">
                <div class="section-title" style="margin-top:0;">
                    <span class="bar"></span>
                    <i data-lucide="package-check" class="icon-sm"></i>
                    <span>بسته‌های فلش‌کارت آماده راهینو (به تفکیک درس و فصل)</span>
                </div>
                <p class="field-hint">هر بسته را که می‌خواهید با یک کلیک به مخزن لایتنر خود اضافه کنید تا روزانه طبق سهمیه شما وارد مرور شوند:</p>
                <div id="fcPublicDecksList"></div>

                <div class="section-title">
                    <span class="bar"></span>
                    <i data-lucide="folder-kanban" class="icon-sm"></i>
                    <span>آرشیو کارت‌های من (فیلتر بر اساس درس و فصل)</span>
                </div>
                <div class="card-box">
                    <div class="form-grid-2" style="margin-bottom:12px;">
                        <select id="selMyCardsFilterSubj" class="modern-input" onchange="ToolsModule.renderMyCardsArchive()">
                            <option value="all">همه دروس من</option>
                        </select>
                        <select id="selMyCardsFilterBox" class="modern-input" onchange="ToolsModule.renderMyCardsArchive()">
                            <option value="all">همه خانه‌های لایتنر</option>
                            <option value="0">مخزن جدید (در نوبت ورود)</option>
                            <option value="1">خانه ۱ (مرور روزانه)</option>
                            <option value="2">خانه ۲ (۳ روزه)</option>
                            <option value="3">خانه ۳ (۷ روزه)</option>
                            <option value="4">خانه ۴ (۱۵ روزه)</option>
                            <option value="5">خانه ۵ (تثبیت‌شده)</option>
                        </select>
                    </div>
                    <div id="fcMyCardsArchiveList" style="max-height:380px; overflow-y:auto;"></div>
                </div>
            </div>
        `;
        appShell.appendChild(section);
    },

    // باز کردن صفحه کامل فلش‌کارت
    openFlashcardsPage() {
        UI.closeModals();
        this.ensureFullFlashcardViewInjected();
        Router.openSubPage('flashcards');
        this.inReviewSession = false;
        this.switchFcPageTab('dashboard');
    },

    closeFlashcardsPage() {
        this.inReviewSession = false;
        Router.switchMainTab(AppState.currentTab || 'tools');
    },

    switchFcPageTab(tabName) {
        this.fcPageTab = tabName;
        document.getElementById('btnFcPageDash')?.classList.toggle('active', tabName === 'dashboard');
        document.getElementById('btnFcPageCreate')?.classList.toggle('active', tabName === 'create');
        document.getElementById('btnFcPageLib')?.classList.toggle('active', tabName === 'library');

        document.getElementById('fcPageTabDashboard').style.display = tabName === 'dashboard' ? 'block' : 'none';
        document.getElementById('fcPageTabCreate').style.display = tabName === 'create' ? 'block' : 'none';
        document.getElementById('fcPageTabLibrary').style.display = tabName === 'library' ? 'block' : 'none';

        if (tabName === 'dashboard') {
            this.populateFilterSubjectDropdowns();
            this.refreshFlashcardDashboard();
        } else if (tabName === 'create') {
            this.populateCreateSubjectAndChapters();
        } else if (tabName === 'library') {
            this.renderPublicDecksLibrary();
            this.populateMyCardsFilterDropdown();
            this.renderMyCardsArchive();
        }
        UI.refreshIcons();
    },

    // ======================================================================
    // 📊 ۳. منطق انتخاب کارت‌های مرور امروز، سهمیه روزانه و آمار ۷ روز اخیر
    // ======================================================================
    updateToolsSquareBadges() {
        this.buildTodayDueQueue('all', 'all');
        const dueCount = this.dueQueue.length;
        const totalCount = this.flashcards.length;

        const homeFcEl = document.getElementById('homeFcCount');
        const toolFcEl = document.getElementById('toolFcCountLabel');
        const topBadge = document.getElementById('fcPageTopBadge');

        if (homeFcEl) homeFcEl.innerText = `${dueCount.toLocaleString('fa-IR')} مرور امروز`;
        if (toolFcEl) toolFcEl.innerText = `${dueCount.toLocaleString('fa-IR')} کارت آماده مرور (از ${totalCount.toLocaleString('fa-IR')} کارت)`;
        if (topBadge) topBadge.innerText = `${totalCount.toLocaleString('fa-IR')} کارت کل`;
    },

    buildTodayDueQueue(filterSubj = 'all', filterChap = 'all') {
        const todayStr = this.getShamsiDateStr(0);
        const dailyNewLimit = parseInt(this.leitnerSettings?.daily_new_limit, 10) || 10;
        const todayHist = this.leitnerSettings?.review_history?.[todayStr] || { reviewed: 0, correct: 0, wrong: 0, newEntered: 0 };
        const remainingNewQuotaToday = Math.max(0, dailyNewLimit - (parseInt(todayHist.newEntered, 10) || 0));

        let dueOldCards = [];
        let dueNewCards = [];

        this.flashcards.forEach(card => {
            if (filterSubj !== 'all' && card.subject !== filterSubj) return;
            if (filterChap !== 'all' && (card.chapter || 'عمومی') !== filterChap) return;

            const box = parseInt(card.box, 10) ?? 1;
            const nextRev = UI.toEngDigits(card.nextReview || todayStr);
            const isBrandNew = (box === 0) || (box === 1 && (parseInt(card.streak, 10) || 0) === 0 && !card.lastReviewed);

            if (isBrandNew) {
                if (dueNewCards.length < remainingNewQuotaToday) {
                    dueNewCards.push(card);
                }
            } else if (nextRev <= todayStr) {
                dueOldCards.push(card);
            }
        });

        this.dueQueue = [...dueOldCards, ...dueNewCards];
        return { oldCount: dueOldCards.length, newCount: dueNewCards.length, total: this.dueQueue.length };
    },

    populateFilterSubjectDropdowns() {
        const selSubj = document.getElementById('selFcReviewFilterSubj');
        if (!selSubj) return;
        const currVal = selSubj.value || 'all';
        const uniqueSubjects = [...new Set(this.flashcards.map(c => c.subject).filter(Boolean))];
        selSubj.innerHTML = `<option value="all">همه دروس (مرور استاندارد روزانه)</option>` +
            uniqueSubjects.map(s => `<option value="${s}">${s}</option>`).join('');
        if (uniqueSubjects.includes(currVal)) selSubj.value = currVal;
    },

    onReviewFilterSubjectChange() {
        const subj = document.getElementById('selFcReviewFilterSubj')?.value || 'all';
        const chapWrap = document.getElementById('wrapFcReviewFilterChap');
        const selChap = document.getElementById('selFcReviewFilterChap');

        if (subj === 'all') {
            if (chapWrap) chapWrap.style.display = 'none';
        } else {
            if (chapWrap) chapWrap.style.display = 'block';
            const uniqueChaps = [...new Set(this.flashcards.filter(c => c.subject === subj).map(c => c.chapter || 'عمومی'))];
            if (selChap) {
                selChap.innerHTML = `<option value="all">همه فصل‌های ${subj}</option>` +
                    uniqueChaps.map(ch => `<option value="${ch}">${ch}</option>`).join('');
            }
        }
        this.refreshFlashcardDashboard();
    },

    updateLeitnerConfig() {
        const val = parseInt(document.getElementById('selFcDailyLimit')?.value, 10) || 10;
        this.leitnerSettings.daily_new_limit = val;
        this.syncToolsToSupabase();
        this.refreshFlashcardDashboard();
        this.updateToolsSquareBadges();
        UI.showToast(`سهمیه ورود کارت جدید روزانه روی ${val.toLocaleString('fa-IR')} کارت تنظیم شد.`, 'success');
    },

    refreshFlashcardDashboard() {
        const overviewEl = document.getElementById('fcDashboardOverview');
        const playerEl = document.getElementById('fcReviewSessionPlayer');
        if (!overviewEl || !playerEl) return;

        overviewEl.style.display = this.inReviewSession ? 'none' : 'block';
        playerEl.style.display = this.inReviewSession ? 'block' : 'none';

        const selLimit = document.getElementById('selFcDailyLimit');
        if (selLimit) selLimit.value = String(this.leitnerSettings.daily_new_limit || 10);

        const filterSubj = document.getElementById('selFcReviewFilterSubj')?.value || 'all';
        const filterChap = filterSubj === 'all' ? 'all' : (document.getElementById('selFcReviewFilterChap')?.value || 'all');

        const counts = this.buildTodayDueQueue(filterSubj, filterChap);

        document.getElementById('fcDueOldCount').innerText = `${counts.oldCount.toLocaleString('fa-IR')} کارت`;
        document.getElementById('fcDueNewCount').innerText = `${counts.newCount.toLocaleString('fa-IR')} کارت`;
        document.getElementById('fcDueTotalCount').innerText = `${counts.total.toLocaleString('fa-IR')} کارت`;

        const todayStr = this.getShamsiDateStr(0);
        const todayHist = this.leitnerSettings.review_history?.[todayStr] || { reviewed: 0 };
        const revPill = document.getElementById('fcTodayReviewedPill');
        if (revPill) revPill.innerText = `امروز: ${(todayHist.reviewed || 0).toLocaleString('fa-IR')} مرور انجام‌شده`;

        const btnStart = document.getElementById('btnStartReviewSession');
        const btnLbl = document.getElementById('btnStartReviewLabel');
        if (btnStart && btnLbl) {
            if (counts.total > 0) {
                btnStart.disabled = false;
                btnLbl.innerText = `شروع جلسه مرور (${counts.total.toLocaleString('fa-IR')} کارت آماده)`;
            } else {
                btnStart.disabled = false;
                btnLbl.innerText = 'مرور امروز تکمیل شده! (تمرین آزاد همه کارت‌ها)';
            }
        }

        // رندر قفسه ۵ خانه لایتنر + مخزن جدید
        const boxCounts = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        this.flashcards.forEach(c => {
            const b = parseInt(c.box, 10) ?? 1;
            const isBrandNew = (b === 0) || (b === 1 && (parseInt(c.streak, 10) || 0) === 0 && !c.lastReviewed);
            if (isBrandNew) boxCounts[0]++;
            else boxCounts[Math.min(5, Math.max(1, b))]++;
        });

        const pipeEl = document.getElementById('fcPipelineBoxes');
        if (pipeEl) {
            const pipeMeta = [
                { key: 0, title: 'مخزن جدید', sub: 'در نوبت ورود', cls: 'new-pool' },
                { key: 1, title: 'خانه ۱', sub: 'مرور ۱ روزه', cls: '' },
                { key: 2, title: 'خانه ۲', sub: 'مرور ۳ روزه', cls: '' },
                { key: 3, title: 'خانه ۳', sub: 'مرور ۷ روزه', cls: '' },
                { key: 4, title: 'خانه ۴', sub: 'مرور ۱۵ روزه', cls: '' },
                { key: 5, title: 'خانه ۵', sub: 'تثبیت ۳۰ روزه', cls: 'mastered' }
            ];
            pipeEl.innerHTML = pipeMeta.map(m => `
                <div class="leitner-pipe-box ${m.cls}">
                    <span class="box-title">${m.title}</span>
                    <span class="box-sub">${m.sub}</span>
                    <strong class="box-count">${boxCounts[m.key].toLocaleString('fa-IR')}</strong>
                </div>
            `).join('');
        }

        // رندر نمودار عملکرد ۷ روز گذشته دانش‌آموز
        const histMap = this.leitnerSettings.review_history || {};
        let sum7Reviewed = 0;
        let sum7Correct = 0;
        const last7Arr = [];

        for (let i = -6; i <= 0; i++) {
            const dStr = this.getShamsiDateStr(i);
            const dayNum = parseInt(dStr.split('/')[2], 10);
            const rec = histMap[dStr] || { reviewed: 0, correct: 0, wrong: 0 };
            sum7Reviewed += (parseInt(rec.reviewed, 10) || 0);
            sum7Correct += (parseInt(rec.correct, 10) || 0);
            last7Arr.push({ dStr, label: i === 0 ? 'امروز' : `${dayNum.toLocaleString('fa-IR')}ام`, count: parseInt(rec.reviewed, 10) || 0 });
        }

        const maxDayCount = Math.max(10, ...last7Arr.map(x => x.count));
        const accPct = sum7Reviewed > 0 ? Math.round((sum7Correct / sum7Reviewed) * 100) : 100;

        document.getElementById('fcStat7DaysTotal').innerText = `${sum7Reviewed.toLocaleString('fa-IR')} کارت`;
        document.getElementById('fcStatAccuracyPct').innerText = `${accPct.toLocaleString('fa-IR')}٪`;
        document.getElementById('fcStatMasteredCount').innerText = `${boxCounts[5].toLocaleString('fa-IR')} کارت`;

        const barsContainer = document.getElementById('fcHistory7DaysBars');
        if (barsContainer) {
            barsContainer.innerHTML = last7Arr.map(item => {
                const hPct = Math.min(100, Math.round((item.count / maxDayCount) * 100));
                return `
                    <div class="fc-hist-col">
                        <span class="fc-hist-val">${item.count.toLocaleString('fa-IR')}</span>
                        <div class="fc-hist-bar-wrap">
                            <div class="fc-hist-bar-fill" style="height:${hPct}%;"></div>
                        </div>
                        <span class="fc-hist-day">${item.label}</span>
                    </div>
                `;
            }).join('');
        }

        this.updateToolsSquareBadges();
    },

    // ======================================================================
    // 🎯 ۴. جلسه مرور تک‌به‌تک و خلوت (Focus Review Player)
    // ======================================================================
    startReviewSession() {
        const filterSubj = document.getElementById('selFcReviewFilterSubj')?.value || 'all';
        const filterChap = filterSubj === 'all' ? 'all' : (document.getElementById('selFcReviewFilterChap')?.value || 'all');

        this.buildTodayDueQueue(filterSubj, filterChap);

        // اگر کارت موعدی نمانده بود، اجازه تمرین آزاد روی کارت‌های آن درس/فصل را بده
        if (this.dueQueue.length === 0) {
            const fallbackPool = this.flashcards.filter(c =>
                (filterSubj === 'all' || c.subject === filterSubj) &&
                (filterChap === 'all' || (c.chapter || 'عمومی') === filterChap)
            );
            if (fallbackPool.length === 0) {
                UI.showToast('هنوز کارتی در این بخش ندارید! از تب «ساخت کارت» یا «بانک راهینو» کارت اضافه کنید.', 'info');
                return;
            }
            this.dueQueue = [...fallbackPool].slice(0, 15);
            UI.showToast('مرورهای موعد امروز تمام شده بود؛ جلسه تمرین آزاد آغاز شد!', 'info');
        }

        this.inReviewSession = true;
        this.currentDueIndex = 0;
        this.sessionStats = { total: this.dueQueue.length, done: 0, correct: 0, wrong: 0 };

        document.getElementById('fcDashboardOverview').style.display = 'none';
        document.getElementById('fcReviewSessionPlayer').style.display = 'block';
        this.renderCurrentSessionCard();
        UI.refreshIcons();
    },

    exitReviewSession() {
        this.inReviewSession = false;
        this.refreshFlashcardDashboard();
        UI.refreshIcons();
    },

    renderCurrentSessionCard() {
        const stage = document.getElementById('fcSessionStage');
        if (stage) stage.classList.remove('flipped');

        document.getElementById('fcBeforeFlipActions').style.display = 'block';
        document.getElementById('fcAfterFlipActions').style.display = 'none';

        if (this.dueQueue.length === 0) {
            this.inReviewSession = false;
            if (window.confetti) confetti({ particleCount: 120, spread: 75, origin: { y: 0.6 } });
            UI.showToast(`🎉 آفرین! جلسه مرور امروز با ${this.sessionStats.correct.toLocaleString('fa-IR')} پاسخ درست تکمیل شد.`, 'success');
            this.refreshFlashcardDashboard();
            return;
        }

        if (this.currentDueIndex >= this.dueQueue.length) this.currentDueIndex = 0;
        if (this.currentDueIndex < 0) this.currentDueIndex = this.dueQueue.length - 1;

        const card = this.dueQueue[this.currentDueIndex];
        const boxNum = Math.max(1, parseInt(card.box, 10) || 1);

        document.getElementById('fcPlayerSubjBadge').innerText = card.subject || 'عمومی';
        document.getElementById('fcPlayerChapBadge').innerText = card.chapter || 'فصل عمومی';
        document.getElementById('fcPlayerBoxBadge').innerText = `خانه ${boxNum.toLocaleString('fa-IR')} لایتنر`;

        const doneCount = this.sessionStats.done;
        const totalCount = Math.max(1, this.sessionStats.total);
        const pct = Math.min(100, Math.round((doneCount / totalCount) * 100));

        document.getElementById('fcPlayerProgressLabel').innerText = `کارت ${(doneCount + 1).toLocaleString('fa-IR')} از ${totalCount.toLocaleString('fa-IR')}`;
        document.getElementById('fcPlayerScoreLabel').innerText = `${this.sessionStats.correct.toLocaleString('fa-IR')} یادآوری موفق • ${this.sessionStats.wrong.toLocaleString('fa-IR')} مرور مجدد`;
        document.getElementById('fcPlayerProgressBar').style.width = `${pct}%`;

        document.getElementById('fcSessionFrontText').innerHTML = this.renderMathInHtml(card.front);
        document.getElementById('fcSessionBackText').innerHTML = this.renderMathInHtml(card.back);

        // محاسبه فاصله مرور بعدی در صورت پاسخ درست
        const nextBox = Math.min(5, boxNum + 1);
        const intervals = { 1: 1, 2: 3, 3: 7, 4: 15, 5: 30 };
        const nextDays = (boxNum === 1 && (parseInt(card.streak, 10) || 0) < 2) ? 1 : intervals[nextBox];
        const nextLbl = document.getElementById('fcNextIntervalLabel');
        if (nextLbl) {
            nextLbl.innerText = nextDays === 1
                ? 'تثبیت اولیه (مرور بعدی: فردا)'
                : `ارتقا به خانه ${nextBox.toLocaleString('fa-IR')} (مرور: ${nextDays.toLocaleString('fa-IR')} روز دیگر)`;
        }
    },

    flipSessionCard() {
        const stage = document.getElementById('fcSessionStage');
        if (!stage) return;
        const isFlipped = stage.classList.toggle('flipped');
        document.getElementById('fcBeforeFlipActions').style.display = isFlipped ? 'none' : 'block';
        document.getElementById('fcAfterFlipActions').style.display = isFlipped ? 'block' : 'none';
    },

    submitSessionCardAnswer(isCorrect) {
        if (this.dueQueue.length === 0) return;
        const card = this.dueQueue[this.currentDueIndex];
        const todayStr = this.getShamsiDateStr(0);

        const wasBrandNew = (parseInt(card.box, 10) === 0) || (parseInt(card.box, 10) === 1 && (parseInt(card.streak, 10) || 0) === 0 && !card.lastReviewed);
        let box = Math.max(1, parseInt(card.box, 10) || 1);
        let streak = parseInt(card.streak, 10) || 0;
        let offsetDays = 1;

        if (!isCorrect) {
            box = 1;
            streak = 0;
            offsetDays = 1;
            this.sessionStats.wrong++;
        } else {
            streak++;
            this.sessionStats.correct++;
            if (box === 1 && streak < 2) {
                box = 1;
                offsetDays = 1;
            } else {
                box = Math.min(5, box + 1);
                const boxIntervals = { 1: 1, 2: 3, 3: 7, 4: 15, 5: 30 };
                offsetDays = boxIntervals[box] || 3;
            }
        }

        card.box = box;
        card.streak = streak;
        card.lastReviewed = todayStr;
        card.nextReview = this.getShamsiDateStr(offsetDays);

        // ثبت در تاریخچه عملکرد روزانه برای رسم نمودار ۷ روز اخیر
        if (!this.leitnerSettings.review_history) this.leitnerSettings.review_history = {};
        if (!this.leitnerSettings.review_history[todayStr]) {
            this.leitnerSettings.review_history[todayStr] = { reviewed: 0, correct: 0, wrong: 0, newEntered: 0 };
        }
        const dayLog = this.leitnerSettings.review_history[todayStr];
        dayLog.reviewed = (parseInt(dayLog.reviewed, 10) || 0) + 1;
        if (isCorrect) dayLog.correct = (parseInt(dayLog.correct, 10) || 0) + 1;
        else dayLog.wrong = (parseInt(dayLog.wrong, 10) || 0) + 1;
        if (wasBrandNew) dayLog.newEntered = (parseInt(dayLog.newEntered, 10) || 0) + 1;

        this.sessionStats.done++;
        this.dueQueue.splice(this.currentDueIndex, 1);

        this.syncToolsToSupabase();
        this.renderCurrentSessionCard();
        this.updateToolsSquareBadges();
    },

    nextSessionCard() {
        this.currentDueIndex++;
        this.renderCurrentSessionCard();
    },

    prevSessionCard() {
        this.currentDueIndex--;
        this.renderCurrentSessionCard();
    },

    deleteCurrentSessionCard() {
        if (this.dueQueue.length === 0) return;
        const target = this.dueQueue[this.currentDueIndex];
        this.flashcards = this.flashcards.filter(c => c.id !== target.id);
        this.dueQueue.splice(this.currentDueIndex, 1);
        this.syncToolsToSupabase();
        this.renderCurrentSessionCard();
        this.updateToolsSquareBadges();
        UI.showToast('کارت از جعبه لایتنر حذف شد.', 'info');
    },

    // ======================================================================
    // ➕ ۵. ساخت کارت جدید با انتخاب «درس و فصل» و «فرمول‌ساز ۱۰۰٪ سالم»
    // ======================================================================
    populateCreateSubjectAndChapters() {
        const selSubj = document.getElementById('inpFcSubject');
        if (!selSubj) return;

        const subjects = (AppState.globalSubjects && AppState.globalSubjects.length > 0)
            ? AppState.globalSubjects.filter(s => s !== 'سایر')
            : ['حسابان ۲', 'فیزیک ۳', 'شیمی ۳', 'زیست‌شناسی ۳', 'فارسی ۳', 'عربی ۳', 'دین و زندگی ۳', 'زبان انگلیسی ۳'];

        selSubj.innerHTML = subjects.map(s => `<option value="${s}">${s}</option>`).join('');
        this.onCreateSubjectChange();
    },

    onCreateSubjectChange() {
        const subj = document.getElementById('inpFcSubject')?.value || '';
        const selChap = document.getElementById('inpFcChapterSelect');
        if (!selChap) return;

        const normSubj = window.normalizeSubjectName ? window.normalizeSubjectName(subj) : subj;
        const knownChapters = this.chaptersBySubject[normSubj] || this.chaptersBySubject[subj] || [
            'فصل ۱', 'فصل ۲', 'فصل ۳', 'فصل ۴', 'فصل ۵', 'نکات ترکیبی و جامع'
        ];

        selChap.innerHTML = knownChapters.map(ch => `<option value="${ch}">${ch}</option>`).join('') +
            `<option value="__custom__">✍️ سایر / تایپ نام فصل یا مبحث دلخواه...</option>`;

        this.onCreateChapterSelectChange();
    },

    onCreateChapterSelectChange() {
        const val = document.getElementById('inpFcChapterSelect')?.value;
        const customWrap = document.getElementById('wrapCustomChapterInput');
        if (customWrap) {
            customWrap.style.display = val === '__custom__' ? 'block' : 'none';
        }
    },

    // درج ۱۰۰٪ سالم نمادها و فرمول‌ها از دیکشنری امن (بدون باگ کاراکترهای اسکیپ)
    insertFormulaKey(key) {
        const snippet = this.latexSnippets[key];
        if (!snippet) return;
        this.insertRawTextAtCursor(snippet);
    },

    insertRawTextAtCursor(snippet) {
        const targetId = this.activeLatexTarget || 'inpFcFront';
        const el = document.getElementById(targetId);
        if (!el) return;

        const start = typeof el.selectionStart === 'number' ? el.selectionStart : el.value.length;
        const end = typeof el.selectionEnd === 'number' ? el.selectionEnd : el.value.length;
        const before = el.value.substring(0, start);
        const after = el.value.substring(end);

        el.value = before + snippet + after;
        el.focus();
        const newPos = start + snippet.length;
        try { el.setSelectionRange(newPos, newPos); } catch (_) {}
        this.updateLatexPreview();
    },

    // باز کردن ویجت فرمول‌ساز پرکردنی (برای دانش‌آموزانی که کد LaTeX بلد نیستند)
    openFormulaBuilder(type) {
        const box = document.getElementById('fcFormulaBuilderBox');
        if (!box) return;

        if (this.activeBuilderType === type && box.classList.contains('open')) {
            box.classList.remove('open');
            this.activeBuilderType = null;
            return;
        }
        this.activeBuilderType = type;
        box.classList.add('open');

        if (type === 'frac') {
            box.innerHTML = `
                <div style="font-size:11.5px; font-weight:900; color:var(--primary);">ساخت سریع کسر ریاضی/فیزیک:</div>
                <div class="fb-inputs-row">
                    <input type="text" id="fbInp1" placeholder="صورت کسر (مثلاً x+1)">
                    <span style="font-weight:900; font-size:16px;">÷</span>
                    <input type="text" id="fbInp2" placeholder="مخرج کسر (مثلاً 2)">
                    <button type="button" class="btn-modal auto-width" style="padding:7px 14px; font-size:12px;" onclick="ToolsModule.applyFormulaBuilder('frac')">درج در کارت</button>
                </div>
            `;
        } else if (type === 'sqrt') {
            box.innerHTML = `
                <div style="font-size:11.5px; font-weight:900; color:var(--primary);">ساخت سریع رادیکال:</div>
                <div class="fb-inputs-row">
                    <input type="text" id="fbInp1" placeholder="عبارت زیر رادیکال (مثلاً x^2 + 1)">
                    <input type="text" id="fbInp2" placeholder="فرجه (اختیاری، مثلاً 3)" style="max-width:130px;">
                    <button type="button" class="btn-modal auto-width" style="padding:7px 14px; font-size:12px;" onclick="ToolsModule.applyFormulaBuilder('sqrt')">درج در کارت</button>
                </div>
            `;
        } else if (type === 'pow') {
            box.innerHTML = `
                <div style="font-size:11.5px; font-weight:900; color:var(--primary);">ساخت توان یا اندیس (پایه و توان):</div>
                <div class="fb-inputs-row">
                    <input type="text" id="fbInp1" placeholder="پایه (مثلاً x یا H)">
                    <input type="text" id="fbInp2" placeholder="توان بالا (مثلاً 2)">
                    <input type="text" id="fbInp3" placeholder="اندیس پایین (مثلاً 1)">
                    <button type="button" class="btn-modal auto-width" style="padding:7px 14px; font-size:12px;" onclick="ToolsModule.applyFormulaBuilder('pow')">درج در کارت</button>
                </div>
            `;
        } else if (type === 'lim') {
            box.innerHTML = `
                <div style="font-size:11.5px; font-weight:900; color:var(--primary);">ساخت سریع حد (Limit):</div>
                <div class="fb-inputs-row">
                    <input type="text" id="fbInp1" placeholder="متغیر به سمت چه عددی؟ (مثلاً 0 یا \\infty)" value="0">
                    <input type="text" id="fbInp2" placeholder="عبارت جلوی حد (مثلاً f(x))">
                    <button type="button" class="btn-modal auto-width" style="padding:7px 14px; font-size:12px;" onclick="ToolsModule.applyFormulaBuilder('lim')">درج در کارت</button>
                </div>
            `;
        }
        document.getElementById('fbInp1')?.focus();
    },

    applyFormulaBuilder(type) {
        const v1 = document.getElementById('fbInp1')?.value.trim() || 'x';
        const v2 = document.getElementById('fbInp2')?.value.trim() || '';
        const v3 = document.getElementById('fbInp3')?.value.trim() || '';
        let latex = '';

        if (type === 'frac') {
            latex = `$\\frac{${v1}}{${v2 || '2'}}$`;
        } else if (type === 'sqrt') {
            latex = v2 ? `$\\sqrt[${v2}]{${v1}}$` : `$\\sqrt{${v1}}$`;
        } else if (type === 'pow') {
            latex = `$${v1}${v3 ? `_{${v3}}` : ''}${v2 ? `^{${v2}}` : ''}$`;
        } else if (type === 'lim') {
            latex = `$\\lim_{x \\to ${v1 || '0'}} ${v2 || 'f(x)'}$`;
        }

        this.insertRawTextAtCursor(latex);
        document.getElementById('fcFormulaBuilderBox')?.classList.remove('open');
        this.activeBuilderType = null;
    },

    updateLatexPreview() {
        const f = document.getElementById('inpFcFront')?.value.trim() || '';
        const b = document.getElementById('inpFcBack')?.value.trim() || '';
        const prev = document.getElementById('fcLatexLivePreview');
        if (!prev) return;

        if (!f && !b) {
            prev.innerHTML = 'در کادر بالا بنویسید تا شکل نهایی فرمول و کارت اینجا نمایش داده شود...';
            return;
        }
        prev.innerHTML = `
            <div style="margin-bottom:6px;"><strong style="color:var(--primary);">روی کارت (سوال):</strong> ${this.renderMathInHtml(f)}</div>
            <div><strong style="color:var(--accent);">پشت کارت (پاسخ):</strong> ${this.renderMathInHtml(b)}</div>
        `;
    },

    copyAiLatexPrompt(btnEl) {
        const promptText = `لطفاً نکات یا سوالات زیر را به فلش‌کارت تبدیل کن. تمام فرمول‌های ریاضی، فیزیک و شیمی را حتماً داخل علامت $...$ به صورت کد استاندارد LaTeX بنویس تا مستقیم در برنامه قطب‌نما کپی کنم:\n\n[سوال یا مبحث خود را اینجا بنویسید]`;
        UI.copyText(promptText, btnEl);
    },

    addFlashcard() {
        const subj = document.getElementById('inpFcSubject')?.value || 'عمومی';
        const chapSel = document.getElementById('inpFcChapterSelect')?.value || 'فصل ۱';
        const customChap = document.getElementById('inpFcCustomChapter')?.value.trim();
        const chapter = chapSel === '__custom__' ? (customChap || 'مبحث عمومی') : chapSel;

        const f = document.getElementById('inpFcFront')?.value.trim();
        const b = document.getElementById('inpFcBack')?.value.trim();

        if (!f || !b) {
            return UI.showToast('لطفاً هم روی کارت (سوال) و هم پشت کارت (پاسخ) را وارد کنید.', 'error');
        }

        const newCard = {
            id: 'fc_' + Date.now(),
            subject: subj,
            chapter: chapter,
            front: f,
            back: b,
            box: 0, // ورود به مخزن جدید تا طبق سهمیه روزانه وارد مرور شود
            streak: 0,
            nextReview: this.getShamsiDateStr(0)
        };

        this.flashcards.push(newCard);
        document.getElementById('inpFcFront').value = '';
        document.getElementById('inpFcBack').value = '';
        this.updateLatexPreview();

        this.syncToolsToSupabase();
        this.updateToolsSquareBadges();
        UI.showToast(`فلش‌کارت جدید در درس «${subj} (${chapter})» ذخیره شد!`, 'success');
    },

    // ======================================================================
    // 📦 ۶. بانک بسته‌های آماده راهینو و آرشیو کارت‌های من (به تفکیک درس و فصل)
    // ======================================================================
    renderPublicDecksLibrary() {
        const libContainer = document.getElementById('fcPublicDecksList');
        if (!libContainer) return;

        if (!this.publicDecks || this.publicDecks.length === 0) {
            libContainer.innerHTML = '<div class="card-box center-card">بسته‌های فلش‌کارت آماده راهینو به‌زودی بارگذاری می‌شوند.</div>';
            return;
        }

        libContainer.innerHTML = this.publicDecks.map(deck => {
            const cardsArr = Array.isArray(deck.cards) ? deck.cards : [];
            const chapterLabel = deck.chapter || 'مباحث منتخب';
            return `
                <div class="card-box" style="padding:14px; margin-bottom:10px; background:var(--surface-2);">
                    <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
                        <div>
                            <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin-bottom:4px;">
                                <strong style="font-size:14px; color:var(--text-main);">${deck.title}</strong>
                                <span class="konkur-pill">${deck.subject}</span>
                                <span class="status-pill">${chapterLabel}</span>
                            </div>
                            <div style="font-size:11.5px; color:var(--text-muted);">
                                شامل ${cardsArr.length.toLocaleString('fa-IR')} فلش‌کارت استاندارد فرمول‌دار
                            </div>
                        </div>
                        <button type="button" class="btn-modal auto-width" style="padding:9px 14px; font-size:12px;"
                                onclick="ToolsModule.importPublicDeck('${deck.id}')">
                            <i data-lucide="download" class="icon-sm"></i>
                            <span>افزودن بسته به لایتنر من</span>
                        </button>
                    </div>
                </div>
            `;
        }).join('');
        UI.refreshIcons();
    },

    importPublicDeck(deckId) {
        const deck = (this.publicDecks || []).find(d => d.id === deckId);
        if (!deck || !Array.isArray(deck.cards)) return;

        const todayStr = this.getShamsiDateStr(0);
        let added = 0;
        deck.cards.forEach((c, idx) => {
            const exists = this.flashcards.some(existing => existing.front === c.front);
            if (!exists) {
                this.flashcards.push({
                    id: `pub_${deck.id}_${idx}_${Date.now()}`,
                    subject: deck.subject || 'عمومی',
                    chapter: deck.chapter || deck.title || 'فصل عمومی',
                    front: c.front,
                    back: c.back,
                    box: 0,
                    streak: 0,
                    nextReview: todayStr
                });
                added++;
            }
        });

        this.syncToolsToSupabase();
        this.updateToolsSquareBadges();
        this.renderMyCardsArchive();
        UI.showToast(`${added.toLocaleString('fa-IR')} کارت از بسته «${deck.title}» به مخزن لایتنر شما اضافه شد.`, 'success');
    },

    populateMyCardsFilterDropdown() {
        const sel = document.getElementById('selMyCardsFilterSubj');
        if (!sel) return;
        const uniqueSubjects = [...new Set(this.flashcards.map(c => c.subject).filter(Boolean))];
        sel.innerHTML = `<option value="all">همه دروس من (${this.flashcards.length.toLocaleString('fa-IR')} کارت)</option>` +
            uniqueSubjects.map(s => `<option value="${s}">${s}</option>`).join('');
    },

    renderMyCardsArchive() {
        const container = document.getElementById('fcMyCardsArchiveList');
        if (!container) return;

        const subjFilter = document.getElementById('selMyCardsFilterSubj')?.value || 'all';
        const boxFilter = document.getElementById('selMyCardsFilterBox')?.value || 'all';

        const filtered = this.flashcards.filter(c => {
            const b = parseInt(c.box, 10) ?? 1;
            const isBrandNew = (b === 0) || (b === 1 && (parseInt(c.streak, 10) || 0) === 0 && !c.lastReviewed);
            const effectiveBox = isBrandNew ? 0 : b;

            const matchSubj = subjFilter === 'all' || c.subject === subjFilter;
            const matchBox = boxFilter === 'all' || String(effectiveBox) === String(boxFilter);
            return matchSubj && matchBox;
        });

        if (filtered.length === 0) {
            container.innerHTML = '<div style="text-align:center; padding:24px; color:var(--text-muted); font-size:12px;">کارتی با این فیلتر یافت نشد.</div>';
            return;
        }

        container.innerHTML = filtered.map(c => {
            const b = parseInt(c.box, 10) ?? 1;
            const isBrandNew = (b === 0) || (b === 1 && (parseInt(c.streak, 10) || 0) === 0 && !c.lastReviewed);
            const boxLabel = isBrandNew ? 'مخزن جدید' : `خانه ${b.toLocaleString('fa-IR')}`;

            return `
                <div style="background:var(--surface-2); border:1px solid var(--border); border-radius:14px; padding:12px; margin-bottom:8px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:6px; flex-wrap:wrap;">
                        <div style="display:flex; gap:6px; align-items:center; flex-wrap:wrap;">
                            <span class="konkur-pill">${c.subject || 'عمومی'}</span>
                            <span class="status-pill">${c.chapter || 'فصل عمومی'}</span>
                            <span class="dur-badge" style="margin:0;">${boxLabel}</span>
                        </div>
                        <button type="button" class="del-icon-btn" style="width:28px;height:28px;" onclick="ToolsModule.deleteCardById('${c.id}')" title="حذف کارت">
                            <i data-lucide="trash-2" class="icon-sm" style="width:13px;height:13px;"></i>
                        </button>
                    </div>
                    <div style="font-size:12.5px; font-weight:800; color:var(--text-main); margin-bottom:4px;">${this.renderMathInHtml(c.front)}</div>
                    <div style="font-size:12px; color:var(--text-muted); border-top:1px dashed var(--border); padding-top:4px;">${this.renderMathInHtml(c.back)}</div>
                </div>
            `;
        }).join('');
        UI.refreshIcons();
    },

    deleteCardById(cardId) {
        this.flashcards = this.flashcards.filter(c => c.id !== cardId);
        this.syncToolsToSupabase();
        this.populateMyCardsFilterDropdown();
        this.renderMyCardsArchive();
        this.updateToolsSquareBadges();
    },

    // ======================================================================
    // 🛠️ ۷. مودال ردیاب عادت‌ها و تایمر تمام‌صفحه سینماتیک
    // ======================================================================
    injectEnhancedToolModals() {
        const habitModal = document.getElementById('habitModal');
        if (habitModal) {
            habitModal.innerHTML = `
                <div class="modal modal-wide">
                    <div class="card-header-row" style="margin-bottom:10px;">
                        <div style="display:flex; align-items:center; gap:8px;">
                            <div class="module-icon-badge" style="width:36px;height:36px;"><i data-lucide="flame" class="icon-sm"></i></div>
                            <h3 style="margin:0; font-size:16px;">ماتریس عادت‌ها و پیوستگی</h3>
                        </div>
                        <div class="segmented-pills compact-pills">
                            <button type="button" class="pill-btn active" id="btnHabitWeekly" onclick="ToolsModule.switchHabitView('weekly')">جدول ۷ روزه</button>
                            <button type="button" class="pill-btn" id="btnHabitMonthly" onclick="ToolsModule.switchHabitView('monthly')">نمای ۳۰ روزه</button>
                        </div>
                    </div>

                    <div class="habit-stats-banner">
                        <div style="display:flex; flex-direction:column; justify-content:center; gap:4px;">
                            <span style="font-size:11px; color:var(--text-muted); font-weight:800;">نرخ پایبندی این ماه:</span>
                            <div style="font-size:22px; font-weight:900; color:var(--primary);" id="habitMonthlyRateText">۰٪</div>
                            <small style="font-size:10.5px; color:var(--text-muted);">برای ثبت روزهای قبل، روی دایره آن روز بزنید</small>
                        </div>
                        <div style="height:85px; position:relative;">
                            <canvas id="habitDonutCanvas"></canvas>
                        </div>
                    </div>

                    <div id="habitWeeklyMatrixWrap" style="max-height:310px; overflow-y:auto; text-align:right; margin-bottom:12px;"></div>

                    <div id="habitMonthlyHeatmapWrap" style="display:none; text-align:right; margin-bottom:12px;">
                        <div style="font-size:11.5px; font-weight:800; color:var(--text-muted); margin-bottom:6px;">تراکم انجام عادت‌ها در ۳۰ روز گذشته:</div>
                        <div class="heatmap-grid" id="habitHeatmapGrid"></div>
                    </div>

                    <div class="habit-add-row">
                        <input type="text" class="modern-input" id="inpNewHabit" placeholder="تعریف عادت جدید (مثلاً: ۲۰ دقیقه مطالعه آزاد)...">
                        <button type="button" class="btn-modal auto-width" onclick="ToolsModule.addCustomHabit()">
                            <i data-lucide="plus" class="icon-sm"></i><span>افزودن</span>
                        </button>
                    </div>
                    <button type="button" class="btn-modal-outline" onclick="UI.closeModals()">بستن</button>
                </div>
            `;
        }

        if (!document.getElementById('immersiveTimerOverlay')) {
            const overlay = document.createElement('div');
            overlay.id = 'immersiveTimerOverlay';
            overlay.className = 'immersive-timer-overlay';
            overlay.innerHTML = `
                <div class="liquid-wave-bg" id="pomoWaveBg"></div>

                <div style="width:100%; max-width:640px; display:flex; justify-content:space-between; align-items:center; z-index:10; flex-wrap:wrap; gap:8px;">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <span class="konkur-pill" id="pomoPhaseBadge" style="background:rgba(119,187,169,0.2); color:#77bba9; font-size:12px; padding:5px 12px;">پارت ۱ از ۳ • مطالعه</span>
                        <span id="pomoTitleDisplay" style="font-size:14px; font-weight:900; color:#e2e8f0;">تمرکز عمیق</span>
                    </div>
                    <div style="display:flex; gap:6px; align-items:center;">
                        <button type="button" class="latex-chip" style="background:rgba(255,255,255,0.08);color:#fff;border-color:rgba(255,255,255,0.2);" onclick="ToolsModule.setPomoTheme('eclipse')">کسوف</button>
                        <button type="button" class="latex-chip" style="background:rgba(255,255,255,0.08);color:#fff;border-color:rgba(255,255,255,0.2);" onclick="ToolsModule.setPomoTheme('wave')">موج آرام</button>
                        <button type="button" class="latex-chip" style="background:rgba(255,255,255,0.08);color:#fff;border-color:rgba(255,255,255,0.2);" onclick="ToolsModule.setPomoTheme('flip')">ورق‌خور</button>
                        <button type="button" class="action-circle" style="background:rgba(255,255,255,0.1);color:#fff;border:none;" onclick="ToolsModule.toggleFullscreenPomo()" title="تمام‌صفحه">
                            <i data-lucide="maximize-2" class="icon-sm"></i>
                        </button>
                        <button type="button" class="action-circle" style="background:rgba(239,68,68,0.2);color:#ef4444;border:none;" onclick="ToolsModule.closeImmersiveTimer()" title="خروج">
                            <i data-lucide="x" class="icon-sm"></i>
                        </button>
                    </div>
                </div>

                <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; z-index:10; width:100%;">
                    <div id="pomoSetupPanel" style="background:rgba(255,255,255,0.06); backdrop-filter:blur(12px); border:1px solid rgba(255,255,255,0.14); border-radius:22px; padding:18px; width:100%; max-width:420px; margin-bottom:16px;">
                        <div style="font-size:13px; font-weight:900; color:#77bba9; margin-bottom:10px; text-align:center;">تنظیم برنامه پارت‌های مطالعه و استراحت خودکار</div>
                        <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:8px; text-align:center;">
                            <div>
                                <small style="font-size:10.5px; color:#94a3b8;">هر پارت مطالعه (دقیقه)</small>
                                <input type="number" id="inpPomoStudyMins" value="45" min="5" max="120" style="width:100%;background:rgba(0,0,0,0.35);border:1px solid rgba(255,255,255,0.2);color:#fff;padding:8px;border-radius:10px;text-align:center;font-weight:900;margin-top:4px;">
                            </div>
                            <div>
                                <small style="font-size:10.5px; color:#94a3b8;">تایم استراحت (دقیقه)</small>
                                <input type="number" id="inpPomoBreakMins" value="10" min="2" max="45" style="width:100%;background:rgba(0,0,0,0.35);border:1px solid rgba(255,255,255,0.2);color:#fff;padding:8px;border-radius:10px;text-align:center;font-weight:900;margin-top:4px;">
                            </div>
                            <div>
                                <small style="font-size:10.5px; color:#94a3b8;">تعداد پارت متوالی</small>
                                <input type="number" id="inpPomoRounds" value="3" min="1" max="10" style="width:100%;background:rgba(0,0,0,0.35);border:1px solid rgba(255,255,255,0.2);color:#fff;padding:8px;border-radius:10px;text-align:center;font-weight:900;margin-top:4px;">
                            </div>
                        </div>
                        <button type="button" class="btn-primary-full" style="margin-top:12px; padding:11px;" onclick="ToolsModule.applyPomoSetupAndStart()">
                            <i data-lucide="play" class="icon-sm"></i><span>اعمال و شروع خودکار پارت‌ها</span>
                        </button>
                    </div>

                    <div class="eclipse-ring-stage" id="pomoEclipseStage">
                        <svg class="eclipse-svg" viewBox="0 0 260 260">
                            <circle class="eclipse-track" cx="130" cy="130" r="116"></circle>
                            <circle class="eclipse-progress" id="pomoRingCircle" cx="130" cy="130" r="116" stroke-dasharray="729" stroke-dashoffset="0"></circle>
                        </svg>
                        <div style="text-align:center;">
                            <div id="pomoMainClock" style="font-size:56px; font-weight:900; font-family:monospace; letter-spacing:2px;">45:00</div>
                            <div id="pomoSubStatus" style="font-size:12px; color:#94a3b8; font-weight:700; margin-top:4px;">آماده شروع تمرکز</div>
                        </div>
                    </div>

                    <div class="flip-clock-stage" id="pomoFlipStage">
                        <div class="flip-card-unit" id="pomoFlipMins">45</div>
                        <div style="font-size:46px; font-weight:900; color:#77bba9;">:</div>
                        <div class="flip-card-unit" id="pomoFlipSecs">00</div>
                    </div>
                </div>

                <div style="display:flex; gap:12px; align-items:center; z-index:10;">
                    <button type="button" class="btn-modal-outline" style="width:auto; padding:10px 16px; background:rgba(255,255,255,0.08); color:#fff; border-color:rgba(255,255,255,0.2);" onclick="ToolsModule.togglePomoSettingsPanel()">
                        <i data-lucide="sliders" class="icon-sm"></i><span>تنظیم پارت</span>
                    </button>
                    <button type="button" id="btnPomoPlayPause" class="btn-primary-full" style="width:auto; padding:12px 28px; border-radius:99px;" onclick="ToolsModule.togglePomoPause()">
                        <i data-lucide="pause" class="icon-sm"></i><span>توقف موقت</span>
                    </button>
                    <button type="button" id="btnPomoAmbient" class="btn-modal-outline" style="width:auto; padding:10px 16px; background:rgba(255,255,255,0.08); color:#fff; border-color:rgba(255,255,255,0.2);" onclick="ToolsModule.toggleAmbientNoise()">
                        <i data-lucide="cloud-rain" class="icon-sm"></i><span>صدای تمرکز</span>
                    </button>
                </div>
            `;
            document.body.appendChild(overlay);
        }

        // هدایت خودکار هر کلیک روی flashcardModal به صفحه کامل و جدید فلش‌کارت!
        const origOpenModal = UI.openModal.bind(UI);
        UI.openModal = (modalId) => {
            if (modalId === 'flashcardModal') {
                this.openFlashcardsPage();
                return;
            }
            origOpenModal(modalId);
            if (modalId === 'habitModal') {
                this.renderHabitModalContent();
            }
        };
    },

    // ======================================================================
    // 🔥 ۸. توابع ردیاب عادت‌ها، تایمر سینماتیک و چالش بیدارباش
    // ======================================================================
    switchHabitView(mode) {
        this.habitViewMode = mode;
        document.getElementById('btnHabitWeekly')?.classList.toggle('active', mode === 'weekly');
        document.getElementById('btnHabitMonthly')?.classList.toggle('active', mode === 'monthly');
        document.getElementById('habitWeeklyMatrixWrap').style.display = mode === 'weekly' ? 'block' : 'none';
        document.getElementById('habitMonthlyHeatmapWrap').style.display = mode === 'monthly' ? 'block' : 'none';
        this.renderHabitModalContent();
    },

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
                <div class="toggle-row" onclick="ToolsModule.toggleHabitOnDate('${h.id}', '${todayStr}')"
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
        UI.refreshIcons();
    },

    renderHabitModalContent() {
        const matrixWrap = document.getElementById('habitWeeklyMatrixWrap');
        if (!matrixWrap) return;

        const last7Days = [];
        const shortWeekdays = ['ی', 'د', 'س', 'چ', 'پ', 'ج', 'ش'];
        for (let i = -6; i <= 0; i++) {
            const dObj = new Date();
            dObj.setDate(dObj.getDate() + i);
            const dateStr = this.getShamsiDateStr(i);
            const dayNum = parseInt(dateStr.split('/')[2], 10);
            const wName = shortWeekdays[dObj.getDay()];
            last7Days.push({ dateStr, dayNum, wName, isToday: i === 0 });
        }

        matrixWrap.innerHTML = this.habitsList.map(h => {
            const logs = this.habitsLogs[h.id] || [];
            const cellsHtml = last7Days.map(day => {
                const isDone = logs.includes(day.dateStr);
                return `
                    <div class="habit-day-cell ${isDone ? 'done' : ''} ${day.isToday ? 'is-today' : ''}"
                         onclick="ToolsModule.toggleHabitOnDate('${h.id}', '${day.dateStr}')">
                        <small>${day.isToday ? 'امروز' : day.wName}</small>
                        <span class="day-num">${day.dayNum.toLocaleString('fa-IR')}</span>
                        <div class="check-dot">
                            ${isDone ? '<i data-lucide="check" class="icon-sm" style="width:12px;height:12px;"></i>' : ''}
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
                        <div style="display:flex; align-items:center; gap:6px;">
                            <span class="status-pill">${logs.length.toLocaleString('fa-IR')} روز کل</span>
                            ${this.habitsList.length > 1 ? `
                                <button type="button" class="del-icon-btn" style="width:26px;height:26px;border-radius:8px;" onclick="ToolsModule.deleteHabit('${h.id}')">
                                    <i data-lucide="trash-2" class="icon-sm" style="width:13px;height:13px;"></i>
                                </button>
                            ` : ''}
                        </div>
                    </div>
                    <div class="habit-days-row">${cellsHtml}</div>
                </div>
            `;
        }).join('');

        let totalPossible30 = Math.max(1, this.habitsList.length * 30);
        let totalDone30 = 0;
        const heatmapGrid = document.getElementById('habitHeatmapGrid');
        let heatmapHtml = '';

        for (let i = -29; i <= 0; i++) {
            const dStr = this.getShamsiDateStr(i);
            const dayNum = parseInt(dStr.split('/')[2], 10);
            let doneCountOnDay = 0;
            this.habitsList.forEach(h => {
                if ((this.habitsLogs[h.id] || []).includes(dStr)) doneCountOnDay++;
            });
            totalDone30 += doneCountOnDay;

            const ratio = this.habitsList.length > 0 ? (doneCountOnDay / this.habitsList.length) : 0;
            let lvlClass = '';
            if (ratio >= 0.85) lvlClass = 'lvl-3';
            else if (ratio >= 0.45) lvlClass = 'lvl-2';
            else if (ratio > 0) lvlClass = 'lvl-1';

            heatmapHtml += `<div class="heatmap-cell ${lvlClass}" title="${dStr}: ${doneCountOnDay} عادت">${dayNum.toLocaleString('fa-IR')}</div>`;
        }

        if (heatmapGrid) heatmapGrid.innerHTML = heatmapHtml;

        const adherencePct = Math.min(100, Math.round((totalDone30 / totalPossible30) * 100));
        const rateEl = document.getElementById('habitMonthlyRateText');
        if (rateEl) rateEl.innerText = `${adherencePct.toLocaleString('fa-IR')}٪`;

        const ctx = document.getElementById('habitDonutCanvas');
        if (ctx && window.Chart) {
            if (this.habitAdherenceChart) this.habitAdherenceChart.destroy();
            this.habitAdherenceChart = new Chart(ctx.getContext('2d'), {
                type: 'doughnut',
                data: {
                    labels: ['انجام شده', 'باقی‌مانده'],
                    datasets: [{
                        data: [adherencePct, Math.max(0, 100 - adherencePct)],
                        backgroundColor: ['#10b981', 'rgba(148, 163, 184, 0.2)'],
                        borderWidth: 0
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '72%',
                    plugins: { legend: { display: false } }
                }
            });
        }
        UI.refreshIcons();
    },

    toggleHabitOnDate(habitId, dateStr) {
        if (!this.habitsLogs[habitId]) this.habitsLogs[habitId] = [];
        const arr = this.habitsLogs[habitId];
        const idx = arr.indexOf(dateStr);
        if (idx >= 0) arr.splice(idx, 1);
        else arr.push(dateStr);

        this.syncToolsToSupabase();
        this.renderHomeHabitsSummary();
        this.renderHabitModalContent();
    },

    addCustomHabit() {
        const inp = document.getElementById('inpNewHabit');
        const title = inp ? inp.value.trim() : '';
        if (!title) return;
        this.habitsList.push({ id: 'hb_' + Date.now(), title: title, icon: 'check-circle-2' });
        inp.value = '';
        this.syncToolsToSupabase();
        this.renderHomeHabitsSummary();
        this.renderHabitModalContent();
        UI.showToast('عادت جدید به ماتریس شما اضافه شد.', 'success');
    },

    deleteHabit(habitId) {
        this.habitsList = this.habitsList.filter(h => h.id !== habitId);
        delete this.habitsLogs[habitId];
        this.syncToolsToSupabase();
        this.renderHomeHabitsSummary();
        this.renderHabitModalContent();
    },

    openImmersiveTimer(title = 'تمرکز عمیق پومودورو', defaultMins = 45) {
        UI.closeModals();
        const overlay = document.getElementById('immersiveTimerOverlay');
        if (!overlay) return;

        document.getElementById('pomoTitleDisplay').innerText = title;
        document.getElementById('inpPomoStudyMins').value = defaultMins;
        overlay.classList.add('active');

        this.requestScreenWakeLock();
        UI.refreshIcons();
    },

    async requestScreenWakeLock() {
        try {
            if ('wakeLock' in navigator) {
                this.pomoRuntime.wakeLock = await navigator.wakeLock.request('screen');
            }
        } catch (_) {}
    },

    releaseScreenWakeLock() {
        try {
            if (this.pomoRuntime.wakeLock) {
                this.pomoRuntime.wakeLock.release();
                this.pomoRuntime.wakeLock = null;
            }
        } catch (_) {}
    },

    toggleFullscreenPomo() {
        const overlay = document.getElementById('immersiveTimerOverlay');
        if (!document.fullscreenElement) {
            overlay?.requestFullscreen?.().catch(() => {});
        } else {
            document.exitFullscreen?.().catch(() => {});
        }
    },

    setPomoTheme(themeName) {
        this.pomoConfig.theme = themeName;
        const eclipseStage = document.getElementById('pomoEclipseStage');
        const flipStage = document.getElementById('pomoFlipStage');
        const waveBg = document.getElementById('pomoWaveBg');

        if (themeName === 'flip') {
            if (eclipseStage) eclipseStage.style.display = 'none';
            if (flipStage) flipStage.style.display = 'flex';
            if (waveBg) waveBg.style.opacity = '0.15';
        } else if (themeName === 'wave') {
            if (eclipseStage) eclipseStage.style.display = 'flex';
            if (flipStage) flipStage.style.display = 'none';
            if (waveBg) waveBg.style.opacity = '1';
        } else {
            if (eclipseStage) eclipseStage.style.display = 'flex';
            if (flipStage) flipStage.style.display = 'none';
            if (waveBg) waveBg.style.opacity = '0.2';
        }
        this.updatePomoVisuals();
    },

    togglePomoSettingsPanel() {
        const panel = document.getElementById('pomoSetupPanel');
        if (panel) {
            panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
        }
    },

    applyPomoSetupAndStart() {
        const sMins = Math.max(1, parseInt(document.getElementById('inpPomoStudyMins')?.value, 10) || 45);
        const bMins = Math.max(1, parseInt(document.getElementById('inpPomoBreakMins')?.value, 10) || 10);
        const rounds = Math.max(1, parseInt(document.getElementById('inpPomoRounds')?.value, 10) || 3);

        this.pomoConfig.studyMins = sMins;
        this.pomoConfig.breakMins = bMins;
        this.pomoConfig.totalRounds = rounds;

        const panel = document.getElementById('pomoSetupPanel');
        if (panel) panel.style.display = 'none';

        this.startPomoPhase('study', 1);
    },

    startPomoPhase(phase, roundNum) {
        clearInterval(this.pomoRuntime.intervalId);
        this.pomoRuntime.phase = phase;
        this.pomoRuntime.currentRound = roundNum;
        this.pomoRuntime.isRunning = true;
        this.pomoRuntime.isPaused = false;

        const mins = phase === 'study' ? this.pomoConfig.studyMins : this.pomoConfig.breakMins;
        this.pomoRuntime.totalPhaseSeconds = mins * 60;
        this.pomoRuntime.secondsLeft = mins * 60;

        const overlay = document.getElementById('immersiveTimerOverlay');
        overlay?.classList.toggle('break-phase', phase === 'break');

        const badge = document.getElementById('pomoPhaseBadge');
        const subStatus = document.getElementById('pomoSubStatus');
        if (badge) {
            badge.innerText = `پارت ${roundNum.toLocaleString('fa-IR')} از ${this.pomoConfig.totalRounds.toLocaleString('fa-IR')} • ${phase === 'study' ? 'مطالعه عمیق' : 'تایم استراحت'}`;
        }
        if (subStatus) {
            subStatus.innerText = phase === 'study' ? 'در حال مطالعه و تمرکز...' : 'استراحت کن و از میز فاصله بگیر';
        }

        this.updatePomoVisuals();

        this.pomoRuntime.intervalId = setInterval(() => {
            if (this.pomoRuntime.isPaused) return;
            this.pomoRuntime.secondsLeft--;
            this.updatePomoVisuals();

            if (this.pomoRuntime.secondsLeft <= 0) {
                this.handlePhaseComplete();
            }
        }, 1000);
    },

    updatePomoVisuals() {
        const secs = Math.max(0, this.pomoRuntime.secondsLeft);
        const total = Math.max(1, this.pomoRuntime.totalPhaseSeconds);
        const mStr = String(Math.floor(secs / 60)).padStart(2, '0');
        const sStr = String(secs % 60).padStart(2, '0');

        const clockEl = document.getElementById('pomoMainClock');
        const fMin = document.getElementById('pomoFlipMins');
        const fSec = document.getElementById('pomoFlipSecs');
        if (clockEl) clockEl.innerText = `${mStr}:${sStr}`;
        if (fMin) fMin.innerText = mStr;
        if (fSec) fSec.innerText = sStr;

        const ring = document.getElementById('pomoRingCircle');
        if (ring) {
            const circumference = 729;
            const elapsedRatio = (total - secs) / total;
            ring.style.strokeDashoffset = String(Math.round(circumference * elapsedRatio));
        }

        const wave = document.getElementById('pomoWaveBg');
        if (wave) {
            const pct = Math.min(100, Math.round(((total - secs) / total) * 100));
            wave.style.height = `${pct}%`;
        }
    },

    handlePhaseComplete() {
        clearInterval(this.pomoRuntime.intervalId);
        this.playGentleChime();

        if (this.pomoRuntime.phase === 'study') {
            if (this.pomoRuntime.currentRound < this.pomoConfig.totalRounds) {
                UI.showToast(`پارت ${this.pomoRuntime.currentRound} تمام شد! تایم استراحت به صورت خودکار شروع شد.`, 'success');
                this.startPomoPhase('break', this.pomoRuntime.currentRound);
            } else {
                UI.showToast('تبریک! تمام پارت‌های مطالعه این جلسه را با موفقیت کامل کردی.', 'success');
                if (window.confetti) confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });
                document.getElementById('pomoSubStatus').innerText = 'جلسه کامل شد!';

                if (this.activeQuestBlockId && window.PlanningModule) {
                    PlanningModule.toggleQuest(this.activeQuestBlockId);
                    this.activeQuestBlockId = null;
                }
            }
        } else {
            const nextRound = this.pomoRuntime.currentRound + 1;
            UI.showToast(`استراحت تمام شد! پارت ${nextRound} مطالعه شروع شد.`, 'info');
            this.startPomoPhase('study', nextRound);
        }
    },

    togglePomoPause() {
        if (!this.pomoRuntime.isRunning) {
            this.applyPomoSetupAndStart();
            return;
        }
        this.pomoRuntime.isPaused = !this.pomoRuntime.isPaused;
        const btn = document.getElementById('btnPomoPlayPause');
        if (btn) {
            btn.innerHTML = this.pomoRuntime.isPaused
                ? '<i data-lucide="play" class="icon-sm"></i><span>ادامه تایمر</span>'
                : '<i data-lucide="pause" class="icon-sm"></i><span>توقف موقت</span>';
            UI.refreshIcons();
        }
    },

    playGentleChime() {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(528, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.6);
            gain.gain.setValueAtTime(0.25, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.4);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 1.4);
        } catch (_) {}
    },

    toggleAmbientNoise() {
        const btn = document.getElementById('btnPomoAmbient');
        if (this.pomoRuntime.ambientPlaying) {
            try { this.pomoRuntime.ambientAudioCtx?.close(); } catch (_) {}
            this.pomoRuntime.ambientPlaying = false;
            if (btn) btn.style.borderColor = 'rgba(255,255,255,0.2)';
            return;
        }
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const bufferSize = 2 * ctx.sampleRate;
            const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
            const output = noiseBuffer.getChannelData(0);
            let lastOut = 0.0;
            for (let i = 0; i < bufferSize; i++) {
                const white = Math.random() * 2 - 1;
                output[i] = (lastOut + (0.02 * white)) / 1.02;
                lastOut = output[i];
                output[i] *= 0.18;
            }
            const whiteNoise = ctx.createBufferSource();
            whiteNoise.buffer = noiseBuffer;
            whiteNoise.loop = true;
            whiteNoise.connect(ctx.destination);
            whiteNoise.start(0);

            this.pomoRuntime.ambientAudioCtx = ctx;
            this.pomoRuntime.ambientPlaying = true;
            if (btn) btn.style.borderColor = '#77bba9';
        } catch (_) {}
    },

    closeImmersiveTimer() {
        clearInterval(this.pomoRuntime.intervalId);
        this.pomoRuntime.isRunning = false;
        if (this.pomoRuntime.ambientPlaying) this.toggleAmbientNoise();
        this.releaseScreenWakeLock();
        if (document.fullscreenElement) {
            document.exitFullscreen?.().catch(() => {});
        }
        document.getElementById('immersiveTimerOverlay')?.classList.remove('active');
    },

    triggerAutoWakeupModal() {
        UI.openModal('wakeupModal');
        this.renderWakeupMiniGame();
    },

    closeWakeupModal() {
        clearInterval(this.gameTimerInterval);
        UI.closeModals();
    },

    renderWakeupMiniGame() {
        clearInterval(this.gameTimerInterval);
        let timeLeft = 15;
        const timerEl = document.getElementById('gameTimerDisplay');
        const container = document.getElementById('quizContainer');
        if (!container) return;

        if (timerEl) timerEl.innerText = `00:15`;
        const targetIndex = Math.floor(Math.random() * 12);

        container.innerHTML = `<div style="margin-bottom:10px; font-weight:900; font-size:13px;">خورشید روشن را از بین ماه‌ها پیدا کن!</div>`;
        const grid = document.createElement('div');
        grid.style.display = 'grid';
        grid.style.gridTemplateColumns = 'repeat(4, 1fr)';
        grid.style.gap = '8px';
        grid.style.width = '100%';

        for (let i = 0; i < 12; i++) {
            const btn = document.createElement('button');
            btn.className = 'btn-modal-outline';
            btn.style.padding = '12px';
            btn.innerHTML = `<i data-lucide="${i === targetIndex ? 'sun' : 'moon'}" class="icon ${i === targetIndex ? 'gold-text' : ''}"></i>`;
            btn.onclick = () => {
                if (i === targetIndex) this.winWakeupChallenge();
                else btn.style.opacity = '0.25';
            };
            grid.appendChild(btn);
        }
        container.appendChild(grid);
        UI.refreshIcons();

        this.gameTimerInterval = setInterval(() => {
            timeLeft--;
            if (timerEl) timerEl.innerText = `00:${String(Math.max(0, timeLeft)).padStart(2, '0')}`;
            if (timeLeft <= 0) {
                clearInterval(this.gameTimerInterval);
                container.innerHTML = `<button type="button" class="btn-modal" onclick="ToolsModule.renderWakeupMiniGame()">تلاش مجدد</button>`;
            }
        }, 1000);
    },

    async winWakeupChallenge() {
        clearInterval(this.gameTimerInterval);
        const uid = String(AppState.userId || '');
        const todayIso = new Date().toISOString().split('T')[0];
        const newStreak = (parseInt(AppState.studentData?.wake_streak, 10) || 0) + 1;

        try {
            await supabaseClient.from('students').update({
                wake_streak: newStreak,
                last_wakeup_date: todayIso,
                consecutive_oversleeps: 0
            }).eq('national_id', uid);

            if (AppState.studentData) AppState.studentData.wake_streak = newStreak;
            const s1 = document.getElementById('streakCount');
            const s2 = document.getElementById('homeStreakCount');
            if (s1) s1.innerText = newStreak;
            if (s2) s2.innerText = newStreak;
        } catch (_) {}

        const todayShamsi = this.getShamsiDateStr(0);
        const wakeHabit = this.habitsList.find(h => h.id === 'h_wake' || h.title.includes('بیداری'));
        if (wakeHabit) {
            if (!this.habitsLogs[wakeHabit.id]) this.habitsLogs[wakeHabit.id] = [];
            if (!this.habitsLogs[wakeHabit.id].includes(todayShamsi)) {
                this.habitsLogs[wakeHabit.id].push(todayShamsi);
                this.syncToolsToSupabase();
                this.renderHomeHabitsSummary();
            }
        }

        UI.closeModals();
        if (window.confetti) confetti({ particleCount: 130, spread: 70, origin: { y: 0.6 } });
        UI.showToast(`آفرین قهرمان! بیداری امروز و زنجیره ${newStreak} روزه‌ات ثبت شد.`, 'success');
    }
};


/* ==========================================================================
   👤 ماژول پروفایل، کیف پول، اقساط و تکمیل پرونده (ProfileModule)
   ========================================================================== */
const ProfileModule = {
    currentUploadingInstId: null,

    init() {
        this.renderProfileView();
    },

    async renderProfileView() {
        const uid = String(AppState.userId || '');
        const st = AppState.studentData || {};

        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.value = val || '';
        };
        setVal('inpName', st.full_name || AppState.fullName);
        setVal('inpGrade', st.grade || AppState.studentGrade);
        setVal('inpMajor', st.major || AppState.studentMajor);
        setVal('inpBirthdate', st.birthdate);
        setVal('inpSchool', st.school_name);
        setVal('inpProvince', st.province);
        setVal('inpCity', st.city);
        setVal('inpPhone', st.phone_number || AppState.userPhone || uid);
        setVal('inpPass', st.password);
        setVal('inpFather', st.father_phone);
        setVal('inpMother', st.mother_phone);

        const refGroup = document.getElementById('referralSourceGroup');
        if (refGroup) {
            refGroup.style.display = (!st.referral_source || st.referral_source.trim() === '') ? 'block' : 'none';
        }

        const balance = Number(st.wallet_balance) || 0;
        const wEl = document.getElementById('uiWalletBalance');
        if (wEl) wEl.innerText = UI.formatMoney(balance);

        const btnWithdraw = document.getElementById('btnOpenWithdraw');
        if (btnWithdraw) btnWithdraw.style.display = balance >= 500000 ? 'flex' : 'none';

        const refCodeEl = document.getElementById('uiRefCode');
        if (refCodeEl) refCodeEl.innerText = st.referral_code || `RH-${uid.slice(-4)}`;

        const subContainer = document.getElementById('profileSubscriptionsContainer');
        if (subContainer) {
            const subs = AppState.subscriptions || [];
            if (subs.length > 0) {
                subContainer.innerHTML = subs.map(sub => {
                    const sDate = new Date(sub.start_date);
                    const eDate = new Date(sub.end_date);
                    const today = new Date();
                    const totalDays = Math.max(1, Math.ceil((eDate - sDate) / (1000 * 3600 * 24)));
                    const passedDays = Math.ceil((today - sDate) / (1000 * 3600 * 24));
                    const remainDays = Math.max(0, totalDays - passedDays);
                    const pct = Math.max(0, 100 - Math.min((passedDays / totalDays) * 100, 100));
                    const shamsiEnd = eDate.toLocaleDateString('fa-IR', { year: 'numeric', month: 'short', day: 'numeric' });

                    return `
                        <div class="sub-card">
                            <div class="sub-header">
                                <div>
                                    <div class="plan-cat"><i data-lucide="compass" class="icon-sm"></i><span>اشتراک قطب‌نما</span></div>
                                    <div class="plan-name">طرح ${sub.service_type}</div>
                                </div>
                                <div class="sub-badge"><i data-lucide="badge-check" class="icon-sm"></i><span>فعال</span></div>
                            </div>
                            <div style="background:rgba(0,0,0,0.18); border-radius:14px; padding:12px 14px;">
                                <div style="display:flex; justify-content:space-between; font-size:12px; margin-bottom:6px;">
                                    <span><strong>${remainDays.toLocaleString('fa-IR')} روز</strong> باقی‌مانده</span>
                                    <span>اعتبار تا ${shamsiEnd}</span>
                                </div>
                                <div class="progress-bar-bg dark-track"><div class="progress-bar-fill" style="width:${pct}%; background:#fff;"></div></div>
                            </div>
                        </div>
                    `;
                }).join('');
            } else {
                subContainer.innerHTML = `
                    <div class="sub-card inactive" onclick="AuthModule.goToBuySubscription()">
                        <i data-lucide="sparkles" class="icon-lg primary-text"></i>
                        <div>شما در حال استفاده از نسخه رایگان هستید. <strong class="primary-text">برای مشاهده و تهیه اشتراک کلیک کنید.</strong></div>
                    </div>
                `;
            }
        }

        UI.refreshIcons();
    },

    copyReferralText(btnEl) {
        const refCode = document.getElementById('uiRefCode')?.innerText || '';
        const text = `سلام! من در سامانه هوشمند قطب‌نمای راهینو ثبت‌نام کردم.\nاگر موقع ثبت‌نام کد معرف من رو وارد کنی، ۱۰۰ هزار تومان هدیه می‌گیری:\nکد معرف: ${refCode}\nhttps://rahinovip.ir`;
        UI.copyText(text, btnEl);
    },

    async saveSettings() {
        const uid = String(AppState.userId || '');
        const phone = UI.toEngDigits(document.getElementById('inpPhone')?.value.trim());
        const father = UI.toEngDigits(document.getElementById('inpFather')?.value.trim());
        const mother = UI.toEngDigits(document.getElementById('inpMother')?.value.trim());
        const pass = UI.toEngDigits(document.getElementById('inpPass')?.value.trim());
        const refSource = document.getElementById('inpReferralSource')?.value.trim();

        if (!phone || phone.length !== 11) {
            return UI.showToast('شماره موبایل دانش‌آموز باید ۱۱ رقم باشد.', 'error');
        }
        if (father && father.length !== 11) {
            return UI.showToast('شماره موبایل پدر باید ۱۱ رقم باشد.', 'error');
        }
        if (mother && mother.length !== 11) {
            return UI.showToast('شماره موبایل مادر باید ۱۱ رقم باشد.', 'error');
        }
        if (!pass || pass.length < 6) {
            return UI.showToast('رمز عبور باید حداقل ۶ کاراکتر باشد.', 'error');
        }

        const updatePayload = {
            phone_number: phone,
            father_phone: father || null,
            mother_phone: mother || null,
            birthdate: UI.toEngDigits(document.getElementById('inpBirthdate')?.value.trim()) || null,
            province: document.getElementById('inpProvince')?.value.trim() || null,
            city: document.getElementById('inpCity')?.value.trim() || null,
            school_name: document.getElementById('inpSchool')?.value.trim() || null,
            password: pass
        };

        if (refSource) {
            updatePayload.referral_source = refSource;
        }

        const btn = document.getElementById('btnSaveProfile');
        if (btn) { btn.disabled = true; btn.innerHTML = '<span>در حال ذخیره...</span>'; }

        try {
            const { error } = await supabaseClient.from('students').update(updatePayload).eq('national_id', uid);
            if (error) throw error;

            AppState.studentData = { ...AppState.studentData, ...updatePayload };
            if (refSource) {
                const refGroup = document.getElementById('referralSourceGroup');
                if (refGroup) refGroup.style.display = 'none';
            }
            UI.showToast('اطلاعات پرونده شما با موفقیت بروزرسانی شد.', 'success');
        } catch (err) {
            UI.showToast('خطا در ذخیره اطلاعات پرونده.', 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i data-lucide="save" class="icon"></i><span>بروزرسانی اطلاعات پرونده</span>';
                UI.refreshIcons();
            }
        }
    },

    async submitWithdrawRequest() {
        const balance = Number(AppState.studentData?.wallet_balance) || 0;
        if (balance < 500000) return;

        const name = document.getElementById('inpWithdrawName')?.value.trim();
        const card = UI.toEngDigits(document.getElementById('inpWithdrawCard')?.value.trim());
        const shaba = UI.toEngDigits(document.getElementById('inpWithdrawShaba')?.value.trim());

        if (!name || card.length !== 16) {
            return UI.showToast('لطفاً نام صاحب حساب و شماره کارت ۱۶ رقمی را به درستی وارد کنید.', 'error');
        }

        const uid = String(AppState.userId);
        try {
            await supabaseClient.from('withdraw_requests').insert([{
                student_nid: uid,
                amount: balance,
                account_holder: name,
                card_number: card,
                shaba_number: shaba || null,
                status: 'pending'
            }]);
            await supabaseClient.from('students').update({ wallet_balance: 0 }).eq('national_id', uid);
            if (AppState.studentData) AppState.studentData.wallet_balance = 0;
            this.renderProfileView();
            UI.showToast('درخواست برداشت وجه با موفقیت ثبت شد.', 'success');
        } catch (_) {
            UI.showToast('خطا در ثبت درخواست برداشت.', 'error');
        }
    }
};

window.ToolsModule = ToolsModule;
window.ProfileModule = ProfileModule;
