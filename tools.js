/* ==========================================================================
   🧰 ماژول جامع ابزارهای هوشمند و پروفایل کاربری (js/tools.js)
   شامل:
   ۱. ردیاب عادت‌ها (ماتریس ۷ روزه با قابلیت تیک روزهای قبل + نمودار پایبندی + هیت‌مپ ماهانه)
   ۲. جعبه لایتنر هوشمند (پشتیبانی کامل از فرمول‌های LaTeX با نوار ابزار لمسی + بسته‌های آماده راهینو)
   ۳. تایمر پومودورو تمام‌صفحه سینماتیک (۳ انیمیشن، چرخه خودکار مطالعه/استراحت، روشن ماندن صفحه)
   ۴. چالش بیدارباش صبحگاهی و ماژول کامل پروفایل (ProfileModule)
   ========================================================================== */

const ToolsModule = {
    // داده‌های عادت‌ها و فلش‌کارت‌ها
    habitsList: [],
    habitsLogs: {}, // { habitId: ["1405/08/01", "1405/08/02"] }
    habitViewMode: 'weekly', // 'weekly' | 'monthly'
    habitAdherenceChart: null,

    flashcards: [],
    publicDecks: [],
    leitnerSettings: { daily_new_limit: 10 },
    fcActiveTab: 'review', // 'review' | 'create' | 'library'
    dueQueue: [],
    currentDueIndex: 0,
    activeLatexTarget: 'inpFcFront',

    // وضعیت تایمر تمام‌صفحه سینماتیک
    pomoConfig: {
        studyMins: 45,
        breakMins: 10,
        totalRounds: 3,
        theme: 'eclipse' // 'eclipse' | 'wave' | 'flip'
    },
    pomoRuntime: {
        isRunning: false,
        isPaused: false,
        phase: 'study', // 'study' | 'break'
        currentRound: 1,
        secondsLeft: 2700,
        totalPhaseSeconds: 2700,
        intervalId: null,
        wakeLock: null,
        ambientAudioCtx: null,
        ambientNode: null,
        ambientPlaying: false
    },

    // مینی‌گیم بیدارباش
    gameTimerInterval: null,

    // ======================================================================
    // 🚀 ۱. راه‌اندازی اولیه، بارگذاری خودکار KaTeX و همگام‌سازی ابری با سوپابیس
    // ======================================================================
    async init() {
        this.ensureKatexLoaded();
        this.injectEnhancedToolModals();
        await this.loadToolsDataFromSupabase();
        this.renderHomeHabitsSummary();
        this.updateToolsSquareBadges();
        UI.refreshIcons();
    },

    // تزریق خودکار کتابخانه KaTeX برای رندر فرمول‌های ریاضی و شیمی بدون نیاز به دستکاری HTML
    ensureKatexLoaded() {
        if (window.katex) return;
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css';
        document.head.appendChild(link);

        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js';
        script.onload = () => {
            if (this.dueQueue.length > 0) this.renderCurrentDueCard();
        };
        document.head.appendChild(script);
    },

    // تبدیل متن حاوی $...$ یا $$...$$ به فرمول ریاضی/شیمی چاپی
    renderMathInHtml(rawText) {
        if (!rawText) return '';
        let safe = String(rawText)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        if (window.katex) {
            // ۱. فرمول‌های بلوکی $$...$$
            safe = safe.replace(/\$\$([\s\S]+?)\$\$/g, (_, tex) => {
                try {
                    return window.katex.renderToString(tex.trim(), { displayMode: true, throwOnError: false });
                } catch (_) { return `$$${tex}$$`; }
            });
            // ۲. فرمول‌های درون‌خطی $...$
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

        // مقادیر پیش‌فرض اولیه
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
                subject: 'حسابان و ریاضی',
                front: 'مشتق تابع کسری $\\frac{u}{v}$ برابر است با:',
                back: '$$\\left(\\frac{u}{v}\\right)\' = \\frac{u\'v - v\'u}{v^2}$$',
                box: 1,
                nextReview: todayStr,
                streak: 0
            },
            {
                id: 'fc_2',
                subject: 'شیمی',
                front: 'فرمول محاسبه $\\text{pH}$ محلول اسیدی چیست؟',
                back: '$$\\text{pH} = -\\log[\\text{H}_3\\text{O}^+]$$',
                box: 1,
                nextReview: todayStr,
                streak: 0
            }
        ];

        this.habitsList = JSON.parse(Storage.get(localHabitsKey, 'null')) || defaultHabits;
        this.habitsLogs = JSON.parse(Storage.get(localLogsKey, 'null')) || {};
        this.flashcards = JSON.parse(Storage.get(localFcKey, 'null')) || defaultCards;
        this.leitnerSettings = JSON.parse(Storage.get(localSetKey, 'null')) || { daily_new_limit: 10 };

        if (!uid) return;

        try {
            const [userToolsRes, decksRes] = await Promise.all([
                supabaseClient.from('student_tools_data').select('*').eq('national_id', uid).maybeSingle(),
                supabaseClient.from('public_flashcard_decks').select('*').eq('is_active', true)
            ]);

            if (decksRes.data) {
                this.publicDecks = decksRes.data;
            }

            if (userToolsRes.data) {
                const d = userToolsRes.data;
                if (Array.isArray(d.habits_list) && d.habits_list.length > 0) this.habitsList = d.habits_list;
                if (d.habits_logs && typeof d.habits_logs === 'object') this.habitsLogs = d.habits_logs;
                if (Array.isArray(d.flashcards) && d.flashcards.length > 0) this.flashcards = d.flashcards;
                if (d.leitner_settings) this.leitnerSettings = d.leitner_settings;

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
    // 🛠️ ۲. ارتقای خودکار پنجره‌های مودال ابزارها و ساخت تایمر تمام‌صفحه
    // ======================================================================
    injectEnhancedToolModals() {
        // ۱. ارتقای مودال ردیاب عادت‌ها به ماتریس ۷ روزه + نمای ماهانه + نمودار پایبندی
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

                    <!-- بنر آمار پایبندی و نمودار دونات -->
                    <div class="habit-stats-banner">
                        <div style="display:flex; flex-direction:column; justify-content:center; gap:4px;">
                            <span style="font-size:11px; color:var(--text-muted); font-weight:800;">نرخ پایبندی این ماه:</span>
                            <div style="font-size:22px; font-weight:900; color:var(--primary);" id="habitMonthlyRateText">۰٪</div>
                            <small style="font-size:10.5px; color:var(--text-muted);" id="habitStreakSummaryText">برای ثبت روزهای قبل، روی دایره آن روز بزنید</small>
                        </div>
                        <div style="height:85px; position:relative;">
                            <canvas id="habitDonutCanvas"></canvas>
                        </div>
                    </div>

                    <!-- نمای جدول ۷ روزه (موبایل‌پسند) -->
                    <div id="habitWeeklyMatrixWrap" style="max-height:310px; overflow-y:auto; text-align:right; margin-bottom:12px;"></div>

                    <!-- نمای هیت‌مپ ۳۰ روزه -->
                    <div id="habitMonthlyHeatmapWrap" style="display:none; text-align:right; margin-bottom:12px;">
                        <div style="font-size:11.5px; font-weight:800; color:var(--text-muted); margin-bottom:6px;">تراکم انجام عادت‌ها در ۳۰ روز گذشته:</div>
                        <div class="heatmap-grid" id="habitHeatmapGrid"></div>
                    </div>

                    <!-- افزودن عادت جدید -->
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

        // ۲. ارتقای مودال فلش‌کارت به جعبه لایتنر + دستیار فرمول‌ساز LaTeX + بانک کارت‌های راهینو
        const fcModal = document.getElementById('flashcardModal');
        if (fcModal) {
            fcModal.innerHTML = `
                <div class="modal modal-wide">
                    <div class="card-header-row" style="margin-bottom:10px;">
                        <div style="display:flex; align-items:center; gap:8px;">
                            <div class="module-icon-badge" style="width:36px;height:36px;"><i data-lucide="layers" class="icon-sm"></i></div>
                            <h3 style="margin:0; font-size:16px;">جعبه لایتنر هوشمند (پشتیبانی فرمول)</h3>
                        </div>
                        <span id="fcIndexBadge" class="status-pill">۰ کارت</span>
                    </div>

                    <!-- تب‌های داخلی فلش‌کارت -->
                    <div class="subtabs-bar" style="margin-bottom:12px;">
                        <button type="button" class="subtab-btn active" id="tabBtnFcReview" onclick="ToolsModule.switchFcTab('review')">
                            <i data-lucide="play" class="icon-sm"></i><span>مرور امروز</span>
                        </button>
                        <button type="button" class="subtab-btn" id="tabBtnFcCreate" onclick="ToolsModule.switchFcTab('create')">
                            <i data-lucide="plus-circle" class="icon-sm"></i><span>ساخت کارت + فرمول‌ساز</span>
                        </button>
                        <button type="button" class="subtab-btn" id="tabBtnFcLibrary" onclick="ToolsModule.switchFcTab('library')">
                            <i data-lucide="book-copy" class="icon-sm"></i><span>بسته‌های آماده راهینو</span>
                        </button>
                    </div>

                    <!-- تب ۱: مرور روزانه به روش لایتنر -->
                    <div id="fcViewReview">
                        <div class="leitner-boxes-bar" id="leitnerBoxesBar"></div>

                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; font-size:11.5px; font-weight:800; color:var(--text-muted);">
                            <span id="fcCurrentSubjBadge" class="konkur-pill">درس عمومی</span>
                            <span>سهمیه کارت جدید روزانه: 
                                <select id="selDailyNewLimit" onchange="ToolsModule.changeDailyLimit(this.value)" style="background:var(--surface-2);color:var(--primary);border:1px solid var(--border);border-radius:6px;padding:2px 6px;font-weight:900;">
                                    <option value="5">۵ کارت</option>
                                    <option value="10">۱۰ کارت</option>
                                    <option value="20">۲۰ کارت</option>
                                    <option value="35">۳۵ کارت</option>
                                    <option value="50">۵۰ کارت</option>
                                </select>
                            </span>
                        </div>

                        <div class="flashcard-stage" id="fcStage" onclick="this.classList.toggle('flipped')">
                            <div class="flashcard-inner">
                                <div class="flashcard-face front">
                                    <small class="fc-hint">سوال / روی کارت (برای دیدن پاسخ لمس کنید)</small>
                                    <div id="fcFrontText" class="fc-text">...</div>
                                </div>
                                <div class="flashcard-face back">
                                    <small class="fc-hint accent">پاسخ تشریحی / پشت کارت</small>
                                    <div id="fcBackText" class="fc-text">...</div>
                                </div>
                            </div>
                        </div>

                        <!-- دکمه‌های ۳ گانه لایتنر -->
                        <div class="leitner-grade-btns" id="leitnerActionBtns">
                            <button type="button" class="btn-leitner hard" onclick="ToolsModule.answerLeitnerCard('hard')">
                                <span>یادم نبود</span>
                                <small>بازگشت به خانه ۱ (مرور فردا)</small>
                            </button>
                            <button type="button" class="btn-leitner medium" onclick="ToolsModule.answerLeitnerCard('medium')">
                                <span>سخت بود</span>
                                <small>تثبیت مجدد (مرور فردا)</small>
                            </button>
                            <button type="button" class="btn-leitner easy" onclick="ToolsModule.answerLeitnerCard('easy')">
                                <span>بلد بودم!</span>
                                <small id="lblNextEasyInterval">ارتقا به خانه بعدی</small>
                            </button>
                        </div>

                        <div style="display:flex; justify-content:space-between; gap:8px; margin-bottom:10px;">
                            <button type="button" class="btn-modal-outline" style="padding:8px;" onclick="ToolsModule.prevFlashcard()">کارت قبلی</button>
                            <button type="button" class="del-icon-btn" onclick="ToolsModule.deleteCurrentFlashcard()" title="حذف این کارت"><i data-lucide="trash-2" class="icon-sm"></i></button>
                            <button type="button" class="btn-modal-outline" style="padding:8px;" onclick="ToolsModule.nextFlashcard()">کارت بعدی</button>
                        </div>
                    </div>

                    <!-- تب ۲: ساخت کارت جدید با دستیار فرمول‌ساز LaTeX برای دانش‌آموز -->
                    <div id="fcViewCreate" style="display:none; text-align:right;">
                        <div class="latex-helper-box">
                            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; flex-wrap:wrap; gap:6px;">
                                <span style="font-size:11.5px; font-weight:900; color:var(--primary);">
                                    <i data-lucide="function-square" class="icon-sm"></i> دستیار درج سریع فرمول ریاضی و شیمی:
                                </span>
                                <button type="button" class="btn-copy-inline" style="padding:4px 9px; font-size:10.5px;" onclick="ToolsModule.copyAiLatexPrompt(this)">
                                    <i data-lucide="sparkles" class="icon-sm"></i>
                                    <span>کپی دستور آماده برای هوش مصنوعی</span>
                                </button>
                            </div>

                            <div class="latex-chips-row">
                                <button type="button" class="latex-chip" onclick="ToolsModule.insertLatexSnippet('$\\frac{a}{b}$')">کسر (a/b)</button>
                                <button type="button" class="latex-chip" onclick="ToolsModule.insertLatexSnippet('$\\sqrt{x}$')">رادیکال √</button>
                                <button type="button" class="latex-chip" onclick="ToolsModule.insertLatexSnippet('$x^{2}$')">توان x²</button>
                                <button type="button" class="latex-chip" onclick="ToolsModule.insertLatexSnippet('$\\text{H}_2\\text{O}$')">فرمول شیمی H₂O</button>
                                <button type="button" class="latex-chip" onclick="ToolsModule.insertLatexSnippet('$\\rightleftharpoons$')">واکنش تعادلی ⇌</button>
                                <button type="button" class="latex-chip" onclick="ToolsModule.insertLatexSnippet('$\\xrightarrow{\\Delta}$')">واکنش با گرما →</button>
                                <button type="button" class="latex-chip" onclick="ToolsModule.insertLatexSnippet('$\\lim_{x \\to 0}$')">حد lim</button>
                                <button type="button" class="latex-chip" onclick="ToolsModule.insertLatexSnippet('$\\int_{a}^{b} x dx$')">انتگرال ∫</button>
                            </div>
                            <p style="font-size:10.5px; color:var(--text-muted); margin:0;">
                                💡 راهنما: روی هر دکمه بالا بزنید تا کد فرمول وارد کادر شود، یا دکمه «کپی دستور هوش مصنوعی» را بزنید و در ChatGPT/جمینای پیست کنید تا فرمول آماده به شما بدهد!
                            </p>
                        </div>

                        <div class="form-group" style="margin-bottom:8px;">
                            <label>نام درس (مرتبط با پایه و رشته شما):</label>
                            <select id="inpFcSubject" class="modern-input" style="padding:10px;"></select>
                        </div>

                        <div class="form-group" style="margin-bottom:8px;">
                            <label>روی کارت (سوال، لغت یا عبارت):</label>
                            <textarea class="modern-input" id="inpFcFront" rows="2" placeholder="سوال را بنویسید... (فرمول‌ها بین علامت $ قرار می‌گیرند)"
                                      onfocus="ToolsModule.activeLatexTarget='inpFcFront'"
                                      oninput="ToolsModule.updateLatexPreview()"></textarea>
                        </div>

                        <div class="form-group" style="margin-bottom:8px;">
                            <label>پشت کارت (پاسخ، معنی یا فرمول):</label>
                            <textarea class="modern-input" id="inpFcBack" rows="2" placeholder="پاسخ را بنویسید..."
                                      onfocus="ToolsModule.activeLatexTarget='inpFcBack'"
                                      oninput="ToolsModule.updateLatexPreview()"></textarea>
                        </div>

                        <!-- پیش‌نمایش زنده فرمول قبل از ذخیره -->
                        <div style="margin-bottom:12px;">
                            <span style="font-size:11px; font-weight:800; color:var(--primary);">پیش‌نمایش زنده ظاهر کارت شما:</span>
                            <div class="latex-live-preview" id="fcLatexLivePreview">هر متنی یا فرمولی بنویسید، پیش‌نمایش چاپ‌شده آن اینجا نمایش داده می‌شود...</div>
                        </div>

                        <button type="button" class="btn-primary-full" style="padding:12px; margin-bottom:10px;" onclick="ToolsModule.addFlashcard()">
                            <i data-lucide="plus-circle" class="icon-sm"></i>
                            <span>افزودن کارت به جعبه لایتنر</span>
                        </button>
                    </div>

                    <!-- تب ۳: بانک فلش‌کارت‌های آماده راهینو -->
                    <div id="fcViewLibrary" style="display:none; text-align:right; max-height:330px; overflow-y:auto; margin-bottom:12px;"></div>

                    <button type="button" class="btn-modal-outline" onclick="UI.closeModals()">بستن</button>
                </div>
            `;
        }

        // ۳. تزریق لایه تمام‌صفحه تایمر سینماتیک (Immersive Pomodoro Overlay)
        if (!document.getElementById('immersiveTimerOverlay')) {
            const overlay = document.createElement('div');
            overlay.id = 'immersiveTimerOverlay';
            overlay.className = 'immersive-timer-overlay';
            overlay.innerHTML = `
                <div class="liquid-wave-bg" id="pomoWaveBg"></div>

                <!-- نوار بالای تایمر تمام‌صفحه -->
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

                <!-- مرکز تایمر: ۳ تم انیمیشنی + تنظیمات اولیه -->
                <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; z-index:10; width:100%;">
                    <!-- پنل تنظیم پارت‌ها قبل از شروع -->
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

                    <!-- نمایشگر تم ۱ و ۲ (کسوف و موج) -->
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

                    <!-- نمایشگر تم ۳ (ساعت ورق‌خور) -->
                    <div class="flip-clock-stage" id="pomoFlipStage">
                        <div class="flip-card-unit" id="pomoFlipMins">45</div>
                        <div style="font-size:46px; font-weight:900; color:#77bba9;">:</div>
                        <div class="flip-card-unit" id="pomoFlipSecs">00</div>
                    </div>
                </div>

                <!-- نوار کنترل پایین تایمر تمام‌صفحه -->
                <div style="display:flex; gap:12px; align-items:center; z-index:10;">
                    <button type="button" class="btn-modal-outline" style="width:auto; padding:10px 16px; background:rgba(255,255,255,0.08); color:#fff; border-color:rgba(255,255,255,0.2);" onclick="ToolsModule.togglePomoSettingsPanel()">
                        <i data-lucide="Sliders" class="icon-sm"></i><span>تنظیم پارت</span>
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

        // اتصال باز شدن مودال‌ها به رندر زنده محتوایشان
        const origOpenModal = UI.openModal.bind(UI);
        UI.openModal = (modalId) => {
            origOpenModal(modalId);
            if (modalId === 'habitModal') {
                this.renderHabitModalContent();
            } else if (modalId === 'flashcardModal') {
                this.prepareFlashcardModal();
            }
        };
    },

    // ======================================================================
    // 🔥 ۳. منطق ردیاب عادت‌ها (جدول ۷ روزه، تیک روزهای قبل و هیت‌مپ ماهانه)
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

        // ساخت آرایه ۷ روز گذشته تا امروز (از ۶ روز پیش تا امروز)
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

        // رندر کارت‌های ماتریس ۷ روزه (کاملاً جا شده در عرض موبایل)
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

        // محاسبه نرخ پایبندی ۳۰ روز گذشته + رسم هیت‌مپ و چارت دایره‌ای
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
        if (idx >= 0) {
            arr.splice(idx, 1);
        } else {
            arr.push(dateStr);
        }
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

    // ======================================================================
    // 📚 ۴. جعبه لایتنر هوشمند + فرمول‌ساز لمسی LaTeX + بانک کارت‌های راهینو
    // ======================================================================
    updateToolsSquareBadges() {
        this.buildTodayDueQueue();
        const dueCount = this.dueQueue.length;
        const totalCount = this.flashcards.length;

        const homeFcEl = document.getElementById('homeFcCount');
        const toolFcEl = document.getElementById('toolFcCountLabel');
        if (homeFcEl) homeFcEl.innerText = `${dueCount.toLocaleString('fa-IR')} مرور امروز`;
        if (toolFcEl) toolFcEl.innerText = `${dueCount.toLocaleString('fa-IR')} کارت آماده مرور (از ${totalCount.toLocaleString('fa-IR')} کارت)`;
    },

    buildTodayDueQueue() {
        const todayStr = this.getShamsiDateStr(0);
        const dailyLimit = parseInt(this.leitnerSettings?.daily_new_limit, 10) || 10;
        let newAdded = 0;

        this.dueQueue = [];
        this.flashcards.forEach(card => {
            const box = parseInt(card.box, 10) || 1;
            const nextRev = UI.toEngDigits(card.nextReview || todayStr);
            if (box === 1 && (card.streak || 0) === 0) {
                if (newAdded < dailyLimit) {
                    this.dueQueue.push(card);
                    newAdded++;
                }
            } else if (nextRev <= todayStr) {
                this.dueQueue.push(card);
            }
        });
    },

    prepareFlashcardModal() {
        // پر کردن لیست دروس پایه و رشته دانش‌آموز در فرم ساخت کارت
        const selSubj = document.getElementById('inpFcSubject');
        if (selSubj) {
            const subjects = (AppState.globalSubjects && AppState.globalSubjects.length > 0)
                ? AppState.globalSubjects
                : ['ریاضی و حسابان', 'فیزیک', 'شیمی', 'زیست', 'فارسی', 'عربی', 'دینی', 'زبان'];
            selSubj.innerHTML = subjects.map(s => `<option value="${s}">${s}</option>`).join('');
        }

        const selLimit = document.getElementById('selDailyNewLimit');
        if (selLimit) {
            selLimit.value = String(this.leitnerSettings?.daily_new_limit || 10);
        }

        this.buildTodayDueQueue();
        this.currentDueIndex = 0;
        this.renderLeitnerBoxesSummary();
        this.renderCurrentDueCard();
        this.renderPublicDecksLibrary();
        UI.refreshIcons();
    },

    switchFcTab(tabName) {
        this.fcActiveTab = tabName;
        document.getElementById('tabBtnFcReview')?.classList.toggle('active', tabName === 'review');
        document.getElementById('tabBtnFcCreate')?.classList.toggle('active', tabName === 'create');
        document.getElementById('tabBtnFcLibrary')?.classList.toggle('active', tabName === 'library');

        document.getElementById('fcViewReview').style.display = tabName === 'review' ? 'block' : 'none';
        document.getElementById('fcViewCreate').style.display = tabName === 'create' ? 'block' : 'none';
        document.getElementById('fcViewLibrary').style.display = tabName === 'library' ? 'block' : 'none';
        UI.refreshIcons();
    },

    renderLeitnerBoxesSummary() {
        const bar = document.getElementById('leitnerBoxesBar');
        if (!bar) return;
        const counts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
        this.flashcards.forEach(c => {
            const b = Math.min(5, Math.max(1, parseInt(c.box, 10) || 1));
            counts[b]++;
        });
        const labels = ['خانه ۱ (روزانه)', 'خانه ۲ (۳ روز)', 'خانه ۳ (۷ روز)', 'خانه ۴ (۱۵ روز)', 'خانه ۵ (تثبیت)'];
        bar.innerHTML = [1, 2, 3, 4, 5].map(num => `
            <div class="leitner-slot">
                <span>${labels[num - 1]}</span>
                <strong>${counts[num].toLocaleString('fa-IR')}</strong>
            </div>
        `).join('');
    },

    renderCurrentDueCard() {
        const stage = document.getElementById('fcStage');
        if (stage) stage.classList.remove('flipped');

        const badgeEl = document.getElementById('fcIndexBadge');
        const frontEl = document.getElementById('fcFrontText');
        const backEl = document.getElementById('fcBackText');
        const subjEl = document.getElementById('fcCurrentSubjBadge');
        const btnsWrap = document.getElementById('leitnerActionBtns');

        if (this.dueQueue.length === 0) {
            if (badgeEl) badgeEl.innerText = '۰ مرور باقی‌مانده';
            if (subjEl) subjEl.innerText = 'تکمیل مرور امروز';
            if (frontEl) frontEl.innerHTML = '🎉 تمام کارت‌های مرور امروزت رو جواب دادی!<br><small style="font-size:11.5px;color:var(--text-muted);">می‌تونی از تب «ساخت کارت» یا «بسته‌های آماده راهینو» کارت جدید اضافه کنی.</small>';
            if (backEl) backEl.innerHTML = 'مرور فردا به موقع یادآوری می‌شود.';
            if (btnsWrap) btnsWrap.style.opacity = '0.4';
            return;
        }

        if (btnsWrap) btnsWrap.style.opacity = '1';
        if (this.currentDueIndex >= this.dueQueue.length) this.currentDueIndex = 0;
        if (this.currentDueIndex < 0) this.currentDueIndex = this.dueQueue.length - 1;

        const card = this.dueQueue[this.currentDueIndex];
        if (badgeEl) {
            badgeEl.innerText = `${(this.currentDueIndex + 1).toLocaleString('fa-IR')} از ${this.dueQueue.length.toLocaleString('fa-IR')}`;
        }
        if (subjEl) {
            subjEl.innerText = `${card.subject || 'عمومی'} • خانه ${(card.box || 1).toLocaleString('fa-IR')}`;
        }

        if (frontEl) frontEl.innerHTML = this.renderMathInHtml(card.front);
        if (backEl) backEl.innerHTML = this.renderMathInHtml(card.back);

        // نمایش فاصله مرور بعدی روی دکمه سبز
        const intervals = { 1: 1, 2: 3, 3: 7, 4: 15, 5: 30 };
        const nextBox = Math.min(5, (parseInt(card.box, 10) || 1) + 1);
        const easyLbl = document.getElementById('lblNextEasyInterval');
        if (easyLbl) {
            easyLbl.innerText = `مرور بعدی: ${intervals[nextBox]} روز دیگر`;
        }
    },

    // پاسخ به کارت لایتنر (الگوریتم هیبریدی: ۳ روز اول پشت سر هم، سپس ۳، ۷، ۱۵ و ۳۰ روز)
    answerLeitnerCard(grade) {
        if (this.dueQueue.length === 0) return;
        const card = this.dueQueue[this.currentDueIndex];
        let box = parseInt(card.box, 10) || 1;
        let streak = parseInt(card.streak, 10) || 0;
        let offsetDays = 1;

        if (grade === 'hard') {
            box = 1;
            streak = 0;
            offsetDays = 1;
        } else if (grade === 'medium') {
            offsetDays = 1;
        } else if (grade === 'easy') {
            streak++;
            // در ۳ بار اول، هر روز پرسیده می‌شود تا کاملاً در حافظه کوتاه‌مدت تثبیت شود
            if (streak < 3 && box === 1) {
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
        card.nextReview = this.getShamsiDateStr(offsetDays);

        // حذف از صف مرور امروز
        this.dueQueue.splice(this.currentDueIndex, 1);
        this.syncToolsToSupabase();
        this.renderLeitnerBoxesSummary();
        this.renderCurrentDueCard();
        this.updateToolsSquareBadges();
    },

    nextFlashcard() {
        this.currentDueIndex++;
        this.renderCurrentDueCard();
    },

    prevFlashcard() {
        this.currentDueIndex--;
        this.renderCurrentDueCard();
    },

    changeDailyLimit(val) {
        this.leitnerSettings.daily_new_limit = parseInt(val, 10) || 10;
        this.syncToolsToSupabase();
        this.prepareFlashcardModal();
        UI.showToast(`سهمیه کارت جدید روزانه روی ${val} کارت تنظیم شد.`, 'success');
    },

    // دستیار درج فرمول LaTeX در محل مکان‌نما
    insertLatexSnippet(snippet) {
        const targetId = this.activeLatexTarget || 'inpFcFront';
        const el = document.getElementById(targetId);
        if (!el) return;

        const start = el.selectionStart || el.value.length;
        const end = el.selectionEnd || el.value.length;
        el.value = el.value.substring(0, start) + snippet + el.value.substring(end);
        el.focus();
        this.updateLatexPreview();
    },

    updateLatexPreview() {
        const f = document.getElementById('inpFcFront')?.value.trim() || '';
        const b = document.getElementById('inpFcBack')?.value.trim() || '';
        const prev = document.getElementById('fcLatexLivePreview');
        if (!prev) return;

        if (!f && !b) {
            prev.innerHTML = 'هر متنی یا فرمولی بنویسید، پیش‌نمایش چاپ‌شده آن اینجا نمایش داده می‌شود...';
            return;
        }
        prev.innerHTML = `
            <div style="margin-bottom:6px;"><strong style="color:var(--primary);">سوال:</strong> ${this.renderMathInHtml(f)}</div>
            <div><strong style="color:var(--accent);">پاسخ:</strong> ${this.renderMathInHtml(b)}</div>
        `;
    },

    copyAiLatexPrompt(btnEl) {
        const promptText = `لطفاً نکات یا سوالات زیر را به فلش‌کارت تبدیل کن. تمام فرمول‌های ریاضی، فیزیک و شیمی را حتماً داخل علامت $...$ به صورت کد استاندارد LaTeX بنویس تا مستقیم در برنامه قطب‌نما کپی کنم:\n\n[سوال یا مبحث خود را اینجا بنویسید]`;
        UI.copyText(promptText, btnEl);
    },

    addFlashcard() {
        const subj = document.getElementById('inpFcSubject')?.value || 'عمومی';
        const f = document.getElementById('inpFcFront')?.value.trim();
        const b = document.getElementById('inpFcBack')?.value.trim();

        if (!f || !b) {
            return UI.showToast('لطفاً هم روی کارت (سوال) و هم پشت کارت (پاسخ) را وارد کنید.', 'error');
        }

        const newCard = {
            id: 'fc_' + Date.now(),
            subject: subj,
            front: f,
            back: b,
            box: 1,
            streak: 0,
            nextReview: this.getShamsiDateStr(0)
        };

        this.flashcards.push(newCard);
        document.getElementById('inpFcFront').value = '';
        document.getElementById('inpFcBack').value = '';
        this.updateLatexPreview();

        this.syncToolsToSupabase();
        this.prepareFlashcardModal();
        this.switchFcTab('review');
        this.updateToolsSquareBadges();
        UI.showToast('کارت جدید با موفقیت به جعبه لایتنر اضافه شد.', 'success');
    },

    deleteCurrentFlashcard() {
        if (this.dueQueue.length === 0) return;
        const targetCard = this.dueQueue[this.currentDueIndex];
        this.flashcards = this.flashcards.filter(c => c.id !== targetCard.id);
        this.dueQueue.splice(this.currentDueIndex, 1);
        this.syncToolsToSupabase();
        this.renderLeitnerBoxesSummary();
        this.renderCurrentDueCard();
        this.updateToolsSquareBadges();
    },

    renderPublicDecksLibrary() {
        const libContainer = document.getElementById('fcViewLibrary');
        if (!libContainer) return;

        if (!this.publicDecks || this.publicDecks.length === 0) {
            libContainer.innerHTML = '<div style="text-align:center; padding:24px; color:var(--text-muted);">بسته‌های فلش‌کارت آماده راهینو به‌زودی بارگذاری می‌شوند.</div>';
            return;
        }

        libContainer.innerHTML = this.publicDecks.map(deck => {
            const cardsArr = Array.isArray(deck.cards) ? deck.cards : [];
            return `
                <div class="card-box" style="padding:14px; margin-bottom:10px; background:var(--surface-2);">
                    <div style="display:flex; justify-content:space-between; align-items:center; gap:10px;">
                        <div>
                            <div style="font-size:14px; font-weight:900; color:var(--text-main);">${deck.title}</div>
                            <div style="font-size:11.5px; color:var(--text-muted); margin-top:2px;">
                                درس: ${deck.subject} • ${cardsArr.length.toLocaleString('fa-IR')} کارت فرمول‌دار آماده
                            </div>
                        </div>
                        <button type="button" class="btn-modal auto-width" style="padding:8px 14px; font-size:12px;"
                                onclick="ToolsModule.importPublicDeck('${deck.id}')">
                            <i data-lucide="download" class="icon-sm"></i>
                            <span>افزودن به لایتنر من</span>
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
                    front: c.front,
                    back: c.back,
                    box: 1,
                    streak: 0,
                    nextReview: todayStr
                });
                added++;
            }
        });

        this.syncToolsToSupabase();
        this.prepareFlashcardModal();
        this.switchFcTab('review');
        this.updateToolsSquareBadges();
        UI.showToast(`${added.toLocaleString('fa-IR')} کارت جدید از بسته «${deck.title}» به لایتنر شما اضافه شد.`, 'success');
    },

    // ======================================================================
    // ⏱️ ۵. تایمر تمرکز تمام‌صفحه سینماتیک (۳ انیمیشن + روشن ماندن صفحه + صدای محیطی)
    // ======================================================================
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

        // ۱. پیشرفت حلقه کسوف
        const ring = document.getElementById('pomoRingCircle');
        if (ring) {
            const circumference = 729;
            const elapsedRatio = (total - secs) / total;
            ring.style.strokeDashoffset = String(Math.round(circumference * elapsedRatio));
        }

        // ۲. ارتفاع موج مایع
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

    // تولیدکننده صدای محیطی باران/نویز قهوه‌ای بدون نیاز به دانلود فایل صوتی
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

    // ======================================================================
    // 🌅 ۶. چالش بیدارباش صبحگاهی
    // ======================================================================
    openWakeupChallenge() {
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
            document.getElementById('streakCount').innerText = newStreak;
            document.getElementById('homeStreakCount').innerText = newStreak;
        } catch (_) {}

        // ثبت خودکار تیک عادت بیداری امروز در هبیت‌ترکر
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

        // ۱. پر کردن فیلدهای فرم پروفایل
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

        // نمایش سوال یک‌بارمصرف نحوه آشنایی (فقط اگر در دیتابیس خالی باشد)
        const refGroup = document.getElementById('referralSourceGroup');
        if (refGroup) {
            refGroup.style.display = (!st.referral_source || st.referral_source.trim() === '') ? 'block' : 'none';
        }

        // ۲. کیف پول و کد دعوت
        const balance = Number(st.wallet_balance) || 0;
        const wEl = document.getElementById('uiWalletBalance');
        if (wEl) wEl.innerText = UI.formatMoney(balance);

        const btnWithdraw = document.getElementById('btnOpenWithdraw');
        if (btnWithdraw) btnWithdraw.style.display = balance >= 500000 ? 'flex' : 'none';

        const refCodeEl = document.getElementById('uiRefCode');
        if (refCodeEl) refCodeEl.innerText = st.referral_code || `RH-${uid.slice(-4)}`;

        // ۳. کارت اشتراک فعال مشاوره
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
                                    <div class="plan-cat"><i data-lucide="compass" class="icon-sm"></i><span>اشتراک مشاوره قطب‌نما</span></div>
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
                        <div>شما اشتراک مشاوره فعالی ندارید. <strong class="primary-text">برای مشاهده و تهیه طرح کلیک کنید.</strong></div>
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

// اتصال دکمه تایمر در تب ابزارها به تایمر تمام‌صفحه سینماتیک
window.ToolsModule = ToolsModule;
window.ProfileModule = ProfileModule;
