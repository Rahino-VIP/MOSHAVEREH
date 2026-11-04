/* ==========================================================================
   🗂️ ماژول مستقل جعبه لایتنر و فلش‌کارت هوشمند (flashcards.js)
   شامل:
   ۱. صفحه کامل و اختصاصی فلش‌کارت (#view-flashcards) با ظاهر مینیمال موبایل
   ۲. الگوریتم علمی لایتنر با سقف حداکثر ۹۰ کارت در روز (جلوگیری از انباشت مرورها)
   ۳. مرور آزاد واقعی (امکان ورق زدن تمام کارت‌ها بدون تغییر خانه یا تاریخ مرور)
   ۴. دسته‌بندی درس و فصل (بدون تکرار) + فرمول‌ساز پرکردنی + حذف خودکار بسته‌های دانلودشده
   ========================================================================== */

const FlashcardsModule = {
    flashcards: [],
    publicDecks: [],
    chaptersBySubject: {},
    leitnerSettings: {
        daily_new_limit: 8,
        imported_decks: [],
        review_history: {},
        local_updated_at: 0
    },

    fcPageTab: 'dashboard',
    inReviewSession: false,
    isFreePractice: false,
    dueQueue: [],
    currentDueIndex: 0,
    sessionStats: { total: 0, done: 0, correct: 0, wrong: 0 },
    activeLatexTarget: 'inpFcFront',
    activeBuilderType: null,

    // ======================================================================
    // 🚀 ۱. راه‌اندازی و همگام‌سازی ایمن با سوپابیس (بدون پاک شدن کارت‌های لوکال)
    // ======================================================================
    async init() {
        this.ensureFullFlashcardViewInjected();
        await this.loadFlashcardsData();
        this.updateToolsSquareBadges();
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

    // رندر ایمن فرمول‌های KaTeX بدون خراب شدن تگ‌های گرافیکی SVG رادیکال
    renderMathInHtml(rawText) {
        if (!rawText) return '';
        let safe = String(rawText)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        const mathBlocks = [];
        if (window.katex) {
            safe = safe.replace(/\$\$([\s\S]+?)\$\$/g, (_, tex) => {
                try {
                    const html = window.katex.renderToString(tex.trim(), { displayMode: true, throwOnError: false });
                    mathBlocks.push(html);
                    return `@@MATH_${mathBlocks.length - 1}@@`;
                } catch (_) { return `$$${tex}$$`; }
            });
            safe = safe.replace(/\$([^$\n]+?)\$/g, (_, tex) => {
                try {
                    const html = window.katex.renderToString(tex.trim(), { displayMode: false, throwOnError: false });
                    mathBlocks.push(html);
                    return `@@MATH_${mathBlocks.length - 1}@@`;
                } catch (_) { return `$${tex}$`; }
            });
        }

        safe = safe.replace(/\n/g, '<br>');
        safe = safe.replace(/@@MATH_(\d+)@@/g, (_, idx) => mathBlocks[Number(idx)] || '');
        return safe;
    },

    async loadFlashcardsData() {
        const uid = String(AppState.userId || '');
        const localFcKey = `qotbnama_leitner_fc_${uid}`;
        const localSetKey = `qotbnama_leitner_cfg_${uid}`;

        const savedLocalCards = JSON.parse(Storage.get(localFcKey, 'null')) || [];
        const savedCfg = JSON.parse(Storage.get(localSetKey, 'null')) || {};

        this.flashcards = savedLocalCards;
        this.leitnerSettings = {
            daily_new_limit: Math.min(15, parseInt(savedCfg.daily_new_limit, 10) || 8),
            imported_decks: Array.isArray(savedCfg.imported_decks) ? savedCfg.imported_decks : [],
            review_history: savedCfg.review_history || {},
            local_updated_at: Number(savedCfg.local_updated_at) || 0
        };

        this.chaptersBySubject = {};
        if (!uid) return;

        try {
            const grade = AppState.studentGrade || 'دوازدهم';
            const major = AppState.studentMajor || 'تجربی';

            const [userToolsRes, decksRes, kgRes] = await Promise.all([
                supabaseClient.from('student_tools_data').select('*').eq('national_id', uid).maybeSingle(),
                supabaseClient.from('public_flashcard_decks').select('*').eq('is_active', true),
                supabaseClient.from('knowledge_graph').select('book_name, chapter_num, chapter_name').eq('grade', grade).eq('major', major).eq('plan_type', 'micro').order('id', { ascending: true })
            ]);

            if (decksRes.data) {
                this.publicDecks = decksRes.data;
            }

            // استخراج بدون تکرار فصل‌های هر کتاب بر اساس شماره فصل
            if (kgRes.data && kgRes.data.length > 0) {
                const seenChapNums = {};
                kgRes.data.forEach(row => {
                    const bName = window.normalizeSubjectName ? window.normalizeSubjectName(row.book_name) : row.book_name;
                    const cNum = String(row.chapter_num ?? '').trim();
                    const rawName = String(row.chapter_name || '').trim();
                    if (!bName || !rawName || cNum === '0') return;

                    if (!seenChapNums[bName]) seenChapNums[bName] = new Set();
                    if (seenChapNums[bName].has(cNum)) return;
                    seenChapNums[bName].add(cNum);

                    let cleanTitle = rawName;
                    if (!/^(فصل|بخش|درس|الدَّرس)/i.test(rawName) && cNum) {
                        cleanTitle = `فصل ${UI.toEngDigits(cNum).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d])}: ${rawName}`;
                    }

                    if (!this.chaptersBySubject[bName]) this.chaptersBySubject[bName] = [];
                    if (!this.chaptersBySubject[bName].includes(cleanTitle)) {
                        this.chaptersBySubject[bName].push(cleanTitle);
                    }
                });
            }

            if (userToolsRes.data) {
                const d = userToolsRes.data;
                const dbUpdatedTime = d.updated_at ? new Date(d.updated_at).getTime() : 0;
                const localUpdatedTime = this.leitnerSettings.local_updated_at || 0;

                // اگر دیتای لوکال جدیدتر است یا کارت‌های بیشتری دارد (مثلاً قبلاً ذخیره سرور خطا داده)، دیتای لوکال حفظ و به سرور سینک شود!
                if (localUpdatedTime > dbUpdatedTime || (savedLocalCards.length > (d.flashcards || []).length)) {
                    await this.syncFlashcardsToSupabase();
                } else {
                    if (Array.isArray(d.flashcards)) this.flashcards = d.flashcards;
                    if (d.leitner_settings && typeof d.leitner_settings === 'object') {
                        this.leitnerSettings = {
                            daily_new_limit: Math.min(15, parseInt(d.leitner_settings.daily_new_limit, 10) || 8),
                            imported_decks: Array.isArray(d.leitner_settings.imported_decks) ? d.leitner_settings.imported_decks : [],
                            review_history: d.leitner_settings.review_history || {},
                            local_updated_at: dbUpdatedTime
                        };
                    }
                    this.cacheFlashcardsLocally();
                }
            } else {
                await this.syncFlashcardsToSupabase();
            }
        } catch (_) {}
    },

    cacheFlashcardsLocally() {
        const uid = String(AppState.userId || '');
        Storage.set(`qotbnama_leitner_fc_${uid}`, JSON.stringify(this.flashcards));
        Storage.set(`qotbnama_leitner_cfg_${uid}`, JSON.stringify(this.leitnerSettings));
    },

    async syncFlashcardsToSupabase() {
        this.leitnerSettings.local_updated_at = Date.now();
        this.cacheFlashcardsLocally();

        // همگام‌سازی آرایه با ToolsModule برای سازگاری کامل
        if (window.ToolsModule) {
            window.ToolsModule.flashcards = this.flashcards;
            window.ToolsModule.leitnerSettings = this.leitnerSettings;
        }

        const uid = String(AppState.userId || '');
        if (!uid) return;

        try {
            const habitsList = window.ToolsModule?.habitsList || [];
            const habitsLogs = window.ToolsModule?.habitsLogs || {};

            await supabaseClient.from('student_tools_data').upsert([{
                national_id: uid,
                habits_list: habitsList,
                habits_logs: habitsLogs,
                flashcards: this.flashcards,
                leitner_settings: this.leitnerSettings,
                updated_at: new Date().toISOString()
            }], { onConflict: 'national_id' });
        } catch (err) {
            console.warn("Flashcard cloud sync warning:", err);
        }
    },

    // ======================================================================
    // 🗂️ ۲. تزریق نمای تمام‌صفحه و مینیمال فلش‌کارت (#view-flashcards)
    // ======================================================================
    ensureFullFlashcardViewInjected() {
        const appShell = document.getElementById('shell-app');
        if (!appShell) return;

        // اگر از قبل وجود دارد، محتوایش با نسخه جدید جایگزین شود
        let section = document.getElementById('view-flashcards');
        if (!section) {
            section = document.createElement('section');
            section.id = 'view-flashcards';
            section.className = 'spa-view';
            appShell.appendChild(section);
        }

        section.innerHTML = `
            <div class="module-top-bar">
                <div style="display:flex; align-items:center; gap:8px;">
                    <button type="button" class="nav-icon-btn" onclick="FlashcardsModule.closeFlashcardsPage()" title="بازگشت">
                        <i data-lucide="arrow-right" class="icon"></i>
                    </button>
                    <div class="module-title-group">
                        <h2>لایتنر و فلش‌کارت</h2>
                        <p>مرور علمی با سقف استاندارد روزانه</p>
                    </div>
                </div>
                <span class="konkur-pill" id="fcPageTopBadge">۰ کارت</span>
            </div>

            <div class="subtabs-bar" id="fcMainSubtabsBar">
                <button type="button" class="subtab-btn active" id="btnFcPageDash" onclick="FlashcardsModule.switchFcPageTab('dashboard')">
                    <i data-lucide="play-circle" class="icon-sm"></i><span>مرور و آمار</span>
                </button>
                <button type="button" class="subtab-btn" id="btnFcPageCreate" onclick="FlashcardsModule.switchFcPageTab('create')">
                    <i data-lucide="plus-circle" class="icon-sm"></i><span>کارت جدید</span>
                </button>
                <button type="button" class="subtab-btn" id="btnFcPageLib" onclick="FlashcardsModule.switchFcPageTab('library')">
                    <i data-lucide="book-copy" class="icon-sm"></i><span>بسته‌ها و آرشیو</span>
                </button>
            </div>

            <!-- تب ۱: داشبورد و مرور -->
            <div id="fcPageTabDashboard">
                <div id="fcDashboardOverview">
                    <div class="fc-hero-launch" style="padding:14px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                            <strong style="font-size:13.5px; color:var(--primary);">برنامه مرور امروز</strong>
                            <span class="status-pill" id="fcTodayReviewedPill">امروز: ۰ مرور</span>
                        </div>

                        <div class="fc-launch-stats" style="margin:8px 0; padding:10px;">
                            <div class="fc-launch-stat-item">
                                <small>تکرارهای امروز</small>
                                <strong class="primary-text" id="fcDueOldCount">۰</strong>
                            </div>
                            <div class="fc-launch-stat-item">
                                <small>ورودی جدید</small>
                                <strong class="indigo-text" id="fcDueNewCount">۰</strong>
                            </div>
                            <div class="fc-launch-stat-item">
                                <small>مجموع امروز</small>
                                <strong class="gold-text" id="fcDueTotalCount">۰</strong>
                            </div>
                        </div>

                        <div class="form-grid-2" style="gap:8px; margin-bottom:10px;">
                            <div>
                                <label style="font-size:10.5px; color:var(--text-muted); display:block; margin-bottom:3px;">ورودی جدید روزانه (سقف کل: ۹۰ کارت):</label>
                                <select id="selFcDailyLimit" class="modern-input" style="padding:7px 10px; font-size:11.5px;" onchange="FlashcardsModule.updateLeitnerConfig()">
                                    <option value="3">روزی ۳ کارت جدید (~۲۵ مرور روزانه)</option>
                                    <option value="5">روزی ۵ کارت جدید (~۴۰ مرور روزانه)</option>
                                    <option value="8">روزی ۸ کارت جدید (~۶۰ مرور روزانه)</option>
                                    <option value="10">روزی ۱۰ کارت جدید (~۷۵ مرور روزانه)</option>
                                    <option value="12">روزی ۱۲ کارت جدید (~۹۰ مرور روزانه)</option>
                                    <option value="15">روزی ۱۵ کارت جدید (حداکثر فشار)</option>
                                </select>
                            </div>
                            <div>
                                <label style="font-size:10.5px; color:var(--text-muted); display:block; margin-bottom:3px;">فیلتر درس:</label>
                                <select id="selFcReviewFilterSubj" class="modern-input" style="padding:7px 10px; font-size:11.5px;" onchange="FlashcardsModule.onReviewFilterSubjectChange()">
                                    <option value="all">همه دروس</option>
                                </select>
                            </div>
                        </div>

                        <div id="wrapFcReviewFilterChap" style="display:none; margin-bottom:10px;">
                            <select id="selFcReviewFilterChap" class="modern-input" style="padding:7px 10px; font-size:11.5px;" onchange="FlashcardsModule.refreshFlashcardDashboard()">
                                <option value="all">همه فصل‌های این درس</option>
                            </select>
                        </div>

                        <button type="button" class="btn-primary-full" id="btnStartReviewSession" onclick="FlashcardsModule.startReviewSession()">
                            <i data-lucide="play" class="icon-sm"></i>
                            <span id="btnStartReviewLabel">شروع مرور امروز</span>
                        </button>
                    </div>

                    <div class="section-title" style="margin:12px 0 8px 0;">
                        <span class="bar"></span><span>وضعیت ۵ خانه لایتنر</span>
                    </div>
                    <div class="leitner-pipeline-grid" id="fcPipelineBoxes"></div>

                    <div class="section-title" style="margin:12px 0 8px 0;">
                        <span class="bar"></span><span>عملکرد ۷ روز گذشته</span>
                    </div>
                    <div class="card-box" style="padding:12px;">
                        <div class="habit-kpi-row" style="margin-bottom:8px;">
                            <div class="habit-kpi-box">
                                <small>مرور ۷ روز</small>
                                <strong id="fcStat7DaysTotal">۰</strong>
                            </div>
                            <div class="habit-kpi-box">
                                <small>یادآوری موفق</small>
                                <strong class="success-text" id="fcStatAccuracyPct">۰٪</strong>
                            </div>
                            <div class="habit-kpi-box">
                                <small>تثبیت‌شده</small>
                                <strong class="gold-text" id="fcStatMasteredCount">۰</strong>
                            </div>
                        </div>
                        <div class="fc-history-bars" id="fcHistory7DaysBars" style="height:95px;"></div>
                    </div>
                </div>

                <!-- پخش‌کننده تک‌به‌تک و مینیمال کارت‌ها -->
                <div id="fcReviewSessionPlayer" style="display:none;">
                    <div class="fc-review-session-box" style="padding:14px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; gap:6px; margin-bottom:8px;">
                            <div style="display:flex; align-items:center; gap:5px; flex-wrap:wrap;">
                                <span class="konkur-pill" id="fcPlayerSubjBadge">درس</span>
                                <span class="status-pill" id="fcPlayerChapBadge">فصل</span>
                                <span class="dur-badge gold" id="fcPlayerBoxBadge" style="margin:0;">خانه ۱</span>
                            </div>
                            <button type="button" class="del-icon-btn" style="width:30px;height:30px;" onclick="FlashcardsModule.exitReviewSession()" title="خروج از مرور">
                                <i data-lucide="x" class="icon-sm"></i>
                            </button>
                        </div>

                        <div class="progress-header" style="margin-bottom:4px; font-size:11px;">
                            <span id="fcPlayerProgressLabel">۱ / ۱۰</span>
                            <span class="success-text" id="fcPlayerScoreLabel">۰ درست • ۰ غلط</span>
                        </div>
                        <div class="progress-bar-bg" style="height:6px; margin-bottom:10px;">
                            <div class="progress-bar-fill" id="fcPlayerProgressBar" style="width:0%;"></div>
                        </div>

                        <div class="fc-session-stage" id="fcSessionStage" style="min-height:200px; margin:10px 0;" onclick="FlashcardsModule.flipSessionCard()">
                            <div class="fc-session-inner" style="min-height:200px;">
                                <div class="fc-session-face front" style="padding:16px 14px;">
                                    <span class="fc-hint">سوال (لمس برای مشاهده پاسخ)</span>
                                    <div class="fc-face-content" id="fcSessionFrontText" style="font-size:14px;">...</div>
                                    <span></span>
                                </div>
                                <div class="fc-session-face back" style="padding:16px 14px;">
                                    <span class="fc-hint accent">پاسخ کارت</span>
                                    <div class="fc-face-content" id="fcSessionBackText" style="font-size:14px;">...</div>
                                    <span></span>
                                </div>
                            </div>
                        </div>

                        <div id="fcBeforeFlipActions">
                            <button type="button" class="btn-primary-full" style="padding:11px;" onclick="FlashcardsModule.flipSessionCard()">
                                <i data-lucide="eye" class="icon-sm"></i><span>مشاهده پاسخ</span>
                            </button>
                        </div>

                        <div id="fcAfterFlipActions" style="display:none;">
                            <div class="leitner-binary-btns" style="margin-bottom:6px;">
                                <button type="button" class="btn-leitner-bin wrong" style="padding:11px 8px;" onclick="FlashcardsModule.submitSessionCardAnswer(false)">
                                    <i data-lucide="x" class="icon-sm"></i>
                                    <span>یادم نبود</span>
                                </button>
                                <button type="button" class="btn-leitner-bin right" style="padding:11px 8px;" onclick="FlashcardsModule.submitSessionCardAnswer(true)">
                                    <i data-lucide="check" class="icon-sm"></i>
                                    <span id="fcNextIntervalLabel">بلد بودم!</span>
                                </button>
                            </div>
                        </div>

                        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:8px; padding-top:8px; border-top:1px dashed var(--border);">
                            <button type="button" class="link-btn" onclick="FlashcardsModule.prevSessionCard()">
                                <i data-lucide="chevron-right" class="icon-sm"></i><span>قبلی</span>
                            </button>
                            <button type="button" class="link-btn danger-text" onclick="FlashcardsModule.deleteCurrentSessionCard()">
                                <i data-lucide="trash-2" class="icon-sm"></i><span>حذف کارت</span>
                            </button>
                            <button type="button" class="link-btn" onclick="FlashcardsModule.nextSessionCard()">
                                <span>بعدی</span><i data-lucide="chevron-left" class="icon-sm"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <!-- تب ۲: ساخت کارت جدید -->
            <div id="fcPageTabCreate" style="display:none;">
                <div class="card-box">
                    <div class="form-grid-2" style="gap:10px; margin-bottom:10px;">
                        <div class="form-group" style="margin-bottom:0;">
                            <label><i data-lucide="book" class="icon-sm"></i> درس:</label>
                            <select id="inpFcSubject" class="modern-input" onchange="FlashcardsModule.onCreateSubjectChange()"></select>
                        </div>
                        <div class="form-group" style="margin-bottom:0;">
                            <label><i data-lucide="bookmark" class="icon-sm"></i> فصل:</label>
                            <select id="inpFcChapterSelect" class="modern-input" onchange="FlashcardsModule.onCreateChapterSelectChange()"></select>
                        </div>
                    </div>

                    <div class="form-group" id="wrapCustomChapterInput" style="display:none;">
                        <input type="text" id="inpFcCustomChapter" class="modern-input" placeholder="عنوان فصل یا مبحث دلخواه...">
                    </div>

                    <div class="latex-helper-box" style="padding:10px;">
                        <div style="display:flex; justify-content:space-between; align-items:center; gap:6px; margin-bottom:6px; flex-wrap:wrap;">
                            <span style="font-size:11px; font-weight:800; color:var(--text-muted);">فرمول‌ساز سریع:</span>
                            <button type="button" class="btn-copy-inline" style="padding:3px 8px; font-size:10px;" onclick="FlashcardsModule.copyAiLatexPrompt(this)">
                                <i data-lucide="sparkles" class="icon-sm"></i><span>کپی پرامپت فرمول هوش مصنوعی</span>
                            </button>
                        </div>

                        <div class="latex-toolbar" style="margin-bottom:0;">
                            <button type="button" class="latex-btn" onclick="FlashcardsModule.openFormulaBuilder('frac')">➕ کسر</button>
                            <button type="button" class="latex-btn" onclick="FlashcardsModule.openFormulaBuilder('sqrt')">➕ رادیکال</button>
                            <button type="button" class="latex-btn" onclick="FlashcardsModule.openFormulaBuilder('pow')">➕ توان/اندیس</button>
                            <button type="button" class="latex-btn" onclick="FlashcardsModule.openFormulaBuilder('lim')">➕ حد (lim)</button>
                        </div>

                        <div id="fcFormulaBuilderBox" class="formula-builder-Assistant" style="margin-top:8px; margin-bottom:0;"></div>
                    </div>

                    <div class="form-group">
                        <label>روی کارت (سوال یا نکته):</label>
                        <textarea class="modern-input" id="inpFcFront" rows="2" placeholder="سوال را بنویسید..."
                                  onfocus="FlashcardsModule.activeLatexTarget='inpFcFront'"
                                  oninput="FlashcardsModule.updateLatexPreview()"></textarea>
                    </div>

                    <div class="form-group">
                        <label>پشت کارت (پاسخ یا فرمول):</label>
                        <textarea class="modern-input" id="inpFcBack" rows="2" placeholder="پاسخ را بنویسید..."
                                  onfocus="FlashcardsModule.activeLatexTarget='inpFcBack'"
                                  oninput="FlashcardsModule.updateLatexPreview()"></textarea>
                    </div>

                    <div class="latex-preview-card" id="fcLatexLivePreview" style="font-size:12px;">پیش‌نمایش کارت اینجا نمایش داده می‌شود...</div>

                    <button type="button" class="btn-primary-full" onclick="FlashcardsModule.addFlashcard()">
                        <i data-lucide="plus-circle" class="icon-sm"></i><span>افزودن به لایتنر</span>
                    </button>
                </div>
            </div>

            <!-- تب ۳: بسته‌های آماده راهینو و آرشیو کارت‌های من -->
            <div id="fcPageTabLibrary" style="display:none;">
                <div class="section-title" style="margin-top:0;">
                    <span class="bar"></span><span>بسته‌های آماده راهینو</span>
                </div>
                <div id="fcPublicDecksList"></div>

                <div class="section-title">
                    <span class="bar"></span><span>کارت‌های من</span>
                </div>
                <div class="card-box" style="padding:12px;">
                    <div class="form-grid-2" style="gap:8px; margin-bottom:10px;">
                        <select id="selMyCardsFilterSubj" class="modern-input" onchange="FlashcardsModule.renderMyCardsArchive()">
                            <option value="all">همه دروس</option>
                        </select>
                        <select id="selMyCardsFilterBox" class="modern-input" onchange="FlashcardsModule.renderMyCardsArchive()">
                            <option value="all">همه خانه‌ها</option>
                            <option value="0">مخزن جدید</option>
                            <option value="1">خانه ۱</option>
                            <option value="2">خانه ۲</option>
                            <option value="3">خانه ۳</option>
                            <option value="4">خانه ۴</option>
                            <option value="5">خانه ۵</option>
                        </select>
                    </div>
                    <div id="fcMyCardsArchiveList" style="max-height:360px; overflow-y:auto;"></div>
                </div>
            </div>
        `;
    },

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
    // 📊 ۳. منطق علمی لایتنر با سقف ۹۰ کارت در روز
    // ======================================================================
    updateToolsSquareBadges() {
        this.buildTodayDueQueue('all', 'all');
        const dueCount = this.dueQueue.length;
        const totalCount = this.flashcards.length;

        const homeFcEl = document.getElementById('homeFcCount');
        const toolFcEl = document.getElementById('toolFcCountLabel');
        const topBadge = document.getElementById('fcPageTopBadge');

        if (homeFcEl) homeFcEl.innerText = `${dueCount.toLocaleString('fa-IR')} مرور امروز`;
        if (toolFcEl) toolFcEl.innerText = `${dueCount.toLocaleString('fa-IR')} مرور امروز (از ${totalCount.toLocaleString('fa-IR')} کارت)`;
        if (topBadge) topBadge.innerText = `${totalCount.toLocaleString('fa-IR')} کارت`;
    },

    buildTodayDueQueue(filterSubj = 'all', filterChap = 'all') {
        const MAX_DAILY_TOTAL_CAP = 90;
        const todayStr = this.getShamsiDateStr(0);
        const dailyNewLimit = Math.min(15, parseInt(this.leitnerSettings?.daily_new_limit, 10) || 8);
        const todayHist = this.leitnerSettings?.review_history?.[todayStr] || { reviewed: 0, correct: 0, wrong: 0, newEntered: 0 };

        let dueOldCards = [];
        let candidateNewCards = [];

        this.flashcards.forEach(card => {
            if (filterSubj !== 'all' && card.subject !== filterSubj) return;
            if (filterChap !== 'all' && (card.chapter || 'عمومی') !== filterChap) return;

            const box = parseInt(card.box, 10) ?? 1;
            const nextRev = UI.toEngDigits(card.nextReview || todayStr);
            const isBrandNew = (box === 0) || (box === 1 && (parseInt(card.streak, 10) || 0) === 0 && !card.lastReviewed);

            if (isBrandNew) {
                candidateNewCards.push(card);
            } else if (nextRev <= todayStr) {
                dueOldCards.push(card);
            }
        });

        dueOldCards = dueOldCards.slice(0, MAX_DAILY_TOTAL_CAP);

        const remainingNewQuotaToday = Math.max(0, dailyNewLimit - (parseInt(todayHist.newEntered, 10) || 0));
        const remainingCapForToday = Math.max(0, MAX_DAILY_TOTAL_CAP - dueOldCards.length);
        const allowedNewCount = Math.min(remainingNewQuotaToday, remainingCapForToday);

        const dueNewCards = candidateNewCards.slice(0, allowedNewCount);
        this.dueQueue = [...dueOldCards, ...dueNewCards];

        return { oldCount: dueOldCards.length, newCount: dueNewCards.length, total: this.dueQueue.length };
    },

    populateFilterSubjectDropdowns() {
        const selSubj = document.getElementById('selFcReviewFilterSubj');
        if (!selSubj) return;
        const currVal = selSubj.value || 'all';
        const uniqueSubjects = [...new Set(this.flashcards.map(c => c.subject).filter(Boolean))];
        selSubj.innerHTML = `<option value="all">همه دروس (${this.flashcards.length.toLocaleString('fa-IR')} کارت)</option>` +
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
        const val = Math.min(15, parseInt(document.getElementById('selFcDailyLimit')?.value, 10) || 8);
        this.leitnerSettings.daily_new_limit = val;
        this.syncFlashcardsToSupabase();
        this.refreshFlashcardDashboard();
        this.updateToolsSquareBadges();
        UI.showToast(`ورودی کارت جدید روی روزی ${val.toLocaleString('fa-IR')} کارت تنظیم شد.`, 'success');
    },

    refreshFlashcardDashboard() {
        const overviewEl = document.getElementById('fcDashboardOverview');
        const playerEl = document.getElementById('fcReviewSessionPlayer');
        if (!overviewEl || !playerEl) return;

        overviewEl.style.display = this.inReviewSession ? 'none' : 'block';
        playerEl.style.display = this.inReviewSession ? 'block' : 'none';

        const selLimit = document.getElementById('selFcDailyLimit');
        if (selLimit) selLimit.value = String(this.leitnerSettings.daily_new_limit || 8);

        const filterSubj = document.getElementById('selFcReviewFilterSubj')?.value || 'all';
        const filterChap = filterSubj === 'all' ? 'all' : (document.getElementById('selFcReviewFilterChap')?.value || 'all');

        const counts = this.buildTodayDueQueue(filterSubj, filterChap);

        document.getElementById('fcDueOldCount').innerText = counts.oldCount.toLocaleString('fa-IR');
        document.getElementById('fcDueNewCount').innerText = counts.newCount.toLocaleString('fa-IR');
        document.getElementById('fcDueTotalCount').innerText = `${counts.total.toLocaleString('fa-IR')} کارت`;

        const todayStr = this.getShamsiDateStr(0);
        const todayHist = this.leitnerSettings.review_history?.[todayStr] || { reviewed: 0 };
        const revPill = document.getElementById('fcTodayReviewedPill');
        if (revPill) revPill.innerText = `امروز: ${(todayHist.reviewed || 0).toLocaleString('fa-IR')} مرور`;

        const btnLbl = document.getElementById('btnStartReviewLabel');
        if (btnLbl) {
            const totalMatchingCards = this.flashcards.filter(c =>
                (filterSubj === 'all' || c.subject === filterSubj) &&
                (filterChap === 'all' || (c.chapter || 'عمومی') === filterChap)
            ).length;

            btnLbl.innerText = counts.total > 0
                ? `شروع مرور امروز (${counts.total.toLocaleString('fa-IR')} کارت)`
                : `مرور آزاد همه کارت‌ها (${totalMatchingCards.toLocaleString('fa-IR')} کارت)`;
        }

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
                { key: 0, title: 'مخزن جدید', sub: 'در نوبت', cls: 'new-pool' },
                { key: 1, title: 'خانه ۱', sub: '۱ روزه', cls: '' },
                { key: 2, title: 'خانه ۲', sub: '۳ روزه', cls: '' },
                { key: 3, title: 'خانه ۳', sub: '۷ روزه', cls: '' },
                { key: 4, title: 'خانه ۴', sub: '۱۵ روزه', cls: '' },
                { key: 5, title: 'خانه ۵', sub: '۳۰ روزه', cls: 'mastered' }
            ];
            pipeEl.innerHTML = pipeMeta.map(m => `
                <div class="leitner-pipe-box ${m.cls}">
                    <span class="box-title">${m.title}</span>
                    <span class="box-sub">${m.sub}</span>
                    <strong class="box-count">${boxCounts[m.key].toLocaleString('fa-IR')}</strong>
                </div>
            `).join('');
        }

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
            last7Arr.push({ label: i === 0 ? 'امروز' : `${dayNum.toLocaleString('fa-IR')}ام`, count: parseInt(rec.reviewed, 10) || 0 });
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
    // 🎯 ۴. پخش‌کننده مرور (با پشتیبانی کامل از مرور آزاد همه کارت‌ها)
    // ======================================================================
    startReviewSession() {
        const filterSubj = document.getElementById('selFcReviewFilterSubj')?.value || 'all';
        const filterChap = filterSubj === 'all' ? 'all' : (document.getElementById('selFcReviewFilterChap')?.value || 'all');

        this.buildTodayDueQueue(filterSubj, filterChap);
        this.isFreePractice = false;

        if (this.dueQueue.length === 0) {
            const fallbackPool = this.flashcards.filter(c =>
                (filterSubj === 'all' || c.subject === filterSubj) &&
                (filterChap === 'all' || (c.chapter || 'عمومی') === filterChap)
            );
            if (fallbackPool.length === 0) {
                UI.showToast('هنوز کارتی در این بخش ندارید! از تب «کارت جدید» یا «بسته‌ها» کارت اضافه کنید.', 'info');
                return;
            }
            this.dueQueue = [...fallbackPool];
            this.isFreePractice = true;
            UI.showToast(`مرور آزاد آغاز شد (${this.dueQueue.length.toLocaleString('fa-IR')} کارت - بدون تغییر خانه لایتنر)`, 'info');
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
        this.isFreePractice = false;
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
            this.isFreePractice = false;
            if (window.confetti) confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
            UI.showToast(`🎉 مرور تکمیل شد! (${this.sessionStats.correct.toLocaleString('fa-IR')} پاسخ درست)`, 'success');
            this.refreshFlashcardDashboard();
            return;
        }

        if (this.currentDueIndex >= this.dueQueue.length) this.currentDueIndex = 0;
        if (this.currentDueIndex < 0) this.currentDueIndex = this.dueQueue.length - 1;

        const card = this.dueQueue[this.currentDueIndex];
        const boxNum = Math.max(1, parseInt(card.box, 10) || 1);

        document.getElementById('fcPlayerSubjBadge').innerText = card.subject || 'عمومی';
        document.getElementById('fcPlayerChapBadge').innerText = card.chapter || 'عمومی';
        document.getElementById('fcPlayerBoxBadge').innerText = this.isFreePractice
            ? `مرور آزاد (خانه ${boxNum.toLocaleString('fa-IR')})`
            : `خانه ${boxNum.toLocaleString('fa-IR')}`;

        const doneCount = this.sessionStats.done;
        const totalCount = Math.max(1, this.sessionStats.total);
        const pct = Math.min(100, Math.round((doneCount / totalCount) * 100));

        document.getElementById('fcPlayerProgressLabel').innerText = `کارت ${(doneCount + 1).toLocaleString('fa-IR')} از ${totalCount.toLocaleString('fa-IR')}`;
        document.getElementById('fcPlayerScoreLabel').innerText = `${this.sessionStats.correct.toLocaleString('fa-IR')} درست • ${this.sessionStats.wrong.toLocaleString('fa-IR')} غلط`;
        document.getElementById('fcPlayerProgressBar').style.width = `${pct}%`;

        document.getElementById('fcSessionFrontText').innerHTML = this.renderMathInHtml(card.front);
        document.getElementById('fcSessionBackText').innerHTML = this.renderMathInHtml(card.back);

        const nextLbl = document.getElementById('fcNextIntervalLabel');
        if (nextLbl) {
            if (this.isFreePractice) {
                nextLbl.innerText = 'بلد بودم';
            } else {
                const nextBox = Math.min(5, boxNum + 1);
                const intervals = { 1: 1, 2: 3, 3: 7, 4: 15, 5: 30 };
                const nextDays = (boxNum === 1 && (parseInt(card.streak, 10) || 0) < 2) ? 1 : intervals[nextBox];
                nextLbl.innerText = nextDays === 1 ? 'بلد بودم (فردا)' : `بلد بودم (خانه ${nextBox.toLocaleString('fa-IR')})`;
            }
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

        if (isCorrect) this.sessionStats.correct++;
        else this.sessionStats.wrong++;

        if (!this.leitnerSettings.review_history) this.leitnerSettings.review_history = {};
        if (!this.leitnerSettings.review_history[todayStr]) {
            this.leitnerSettings.review_history[todayStr] = { reviewed: 0, correct: 0, wrong: 0, newEntered: 0 };
        }
        const dayLog = this.leitnerSettings.review_history[todayStr];
        dayLog.reviewed = (parseInt(dayLog.reviewed, 10) || 0) + 1;
        if (isCorrect) dayLog.correct = (parseInt(dayLog.correct, 10) || 0) + 1;
        else dayLog.wrong = (parseInt(dayLog.wrong, 10) || 0) + 1;

        // در حالت مرور آزاد، خانه کارت و تاریخ مرور بعدی اصلاً دست‌کاری نمی‌شود
        if (!this.isFreePractice) {
            const wasBrandNew = (parseInt(card.box, 10) === 0) || (parseInt(card.box, 10) === 1 && (parseInt(card.streak, 10) || 0) === 0 && !card.lastReviewed);
            let box = Math.max(1, parseInt(card.box, 10) || 1);
            let streak = parseInt(card.streak, 10) || 0;
            let offsetDays = 1;

            if (!isCorrect) {
                box = 1;
                streak = 0;
                offsetDays = 1;
            } else {
                streak++;
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

            if (wasBrandNew) {
                dayLog.newEntered = (parseInt(dayLog.newEntered, 10) || 0) + 1;
            }
        }

        this.sessionStats.done++;
        this.dueQueue.splice(this.currentDueIndex, 1);

        this.syncFlashcardsToSupabase();
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
        this.syncFlashcardsToSupabase();
        this.renderCurrentSessionCard();
        this.updateToolsSquareBadges();
        UI.showToast('کارت حذف شد.', 'info');
    },

    // ======================================================================
    // ➕ ۵. ساخت کارت جدید و مدیریت بسته‌ها
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
            'فصل ۱', 'فصل ۲', 'فصل ۳', 'فصل ۴', 'نکات جامع'
        ];

        selChap.innerHTML = knownChapters.map(ch => `<option value="${ch}">${ch}</option>`).join('') +
            `<option value="__custom__">✍️ سایر (تایپ نام مبحث دلخواه)...</option>`;

        this.onCreateChapterSelectChange();
    },

    onCreateChapterSelectChange() {
        const val = document.getElementById('inpFcChapterSelect')?.value;
        const customWrap = document.getElementById('wrapCustomChapterInput');
        if (customWrap) {
            customWrap.style.display = val === '__custom__' ? 'block' : 'none';
        }
    },

    insertRawTextAtCursor(snippet) {
        const targetId = this.activeLatexTarget || 'inpFcFront';
        const el = document.getElementById(targetId);
        if (!el) return;

        const start = typeof el.selectionStart === 'number' ? el.selectionStart : el.value.length;
        const end = typeof el.selectionEnd === 'number' ? el.selectionEnd : el.value.length;
        el.value = el.value.substring(0, start) + snippet + el.value.substring(end);
        el.focus();
        const newPos = start + snippet.length;
        try { el.setSelectionRange(newPos, newPos); } catch (_) {}
        this.updateLatexPreview();
    },

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
                <div class="fb-inputs-row">
                    <input type="text" id="fbInp1" placeholder="صورت کسر">
                    <span>÷</span>
                    <input type="text" id="fbInp2" placeholder="مخرج کسر">
                    <button type="button" class="btn-modal auto-width" style="padding:7px 12px; font-size:11.5px;" onclick="FlashcardsModule.applyFormulaBuilder('frac')">درج</button>
                </div>
            `;
        } else if (type === 'sqrt') {
            box.innerHTML = `
                <div class="fb-inputs-row">
                    <input type="text" id="fbInp1" placeholder="زیر رادیکال">
                    <input type="text" id="fbInp2" placeholder="فرجه (اختیاری)" style="max-width:110px;">
                    <button type="button" class="btn-modal auto-width" style="padding:7px 12px; font-size:11.5px;" onclick="FlashcardsModule.applyFormulaBuilder('sqrt')">درج</button>
                </div>
            `;
        } else if (type === 'pow') {
            box.innerHTML = `
                <div class="fb-inputs-row">
                    <input type="text" id="fbInp1" placeholder="پایه (x)">
                    <input type="text" id="fbInp2" placeholder="توان بالا">
                    <input type="text" id="fbInp3" placeholder="اندیس پایین">
                    <button type="button" class="btn-modal auto-width" style="padding:7px 12px; font-size:11.5px;" onclick="FlashcardsModule.applyFormulaBuilder('pow')">درج</button>
                </div>
            `;
        } else if (type === 'lim') {
            box.innerHTML = `
                <div class="fb-inputs-row">
                    <input type="text" id="fbInp1" placeholder="x به سمت؟ (0)" value="0">
                    <input type="text" id="fbInp2" placeholder="عبارت جلوی حد">
                    <button type="button" class="btn-modal auto-width" style="padding:7px 12px; font-size:11.5px;" onclick="FlashcardsModule.applyFormulaBuilder('lim')">درج</button>
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

        if (type === 'frac') latex = `$\\frac{${v1}}{${v2 || '2'}}$`;
        else if (type === 'sqrt') latex = v2 ? `$\\sqrt[${v2}]{${v1}}$` : `$\\sqrt{${v1}}$`;
        else if (type === 'pow') latex = `$${v1}${v3 ? `_{${v3}}` : ''}${v2 ? `^{${v2}}` : ''}$`;
        else if (type === 'lim') latex = `$\\lim_{x \\to ${v1 || '0'}} ${v2 || 'f(x)'}$`;

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
            prev.innerHTML = 'پیش‌نمایش کارت اینجا نمایش داده می‌شود...';
            return;
        }
        prev.innerHTML = `
            <div style="margin-bottom:4px;"><strong style="color:var(--primary);">سوال:</strong> ${this.renderMathInHtml(f)}</div>
            <div><strong style="color:var(--accent);">پاسخ:</strong> ${this.renderMathInHtml(b)}</div>
        `;
    },

    copyAiLatexPrompt(btnEl) {
        const promptText = `لطفاً فرمول یا نکته زیر را داخل علامت $...$ به کد استاندارد LaTeX تبدیل کن تا مستقیم در فلش‌کارت قطب‌نما کپی کنم:\n\n[سوال یا فرمول خود را اینجا بنویسید]`;
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
            return UI.showToast('لطفاً سوال و پاسخ کارت را وارد کنید.', 'error');
        }

        this.flashcards.push({
            id: 'fc_' + Date.now(),
            subject: subj,
            chapter: chapter,
            front: f,
            back: b,
            box: 0,
            streak: 0,
            nextReview: this.getShamsiDateStr(0)
        });

        document.getElementById('inpFcFront').value = '';
        document.getElementById('inpFcBack').value = '';
        this.updateLatexPreview();

        this.syncFlashcardsToSupabase();
        this.updateToolsSquareBadges();
        UI.showToast('فلش‌کارت جدید به مخزن لایتنر اضافه شد!', 'success');
    },

    renderPublicDecksLibrary() {
        const libContainer = document.getElementById('fcPublicDecksList');
        if (!libContainer) return;

        const importedIds = this.leitnerSettings.imported_decks || [];
        const availableDecks = (this.publicDecks || []).filter(deck => {
            if (importedIds.includes(deck.id)) return false;
            const cardsArr = Array.isArray(deck.cards) ? deck.cards : [];
            if (cardsArr.length > 0 && this.flashcards.some(fc => fc.front === cardsArr[0].front)) {
                return false;
            }
            return true;
        });

        if (availableDecks.length === 0) {
            libContainer.innerHTML = `
                <div class="card-box center-card" style="padding:16px;">
                    <span style="font-size:12px; color:var(--success); font-weight:800;">✅ تمام بسته‌های آماده فعلی به جعبه لایتنر شما اضافه شده‌اند.</span>
                </div>`;
            return;
        }

        libContainer.innerHTML = availableDecks.map(deck => {
            const cardsArr = Array.isArray(deck.cards) ? deck.cards : [];
            return `
                <div class="card-box" style="padding:12px; margin-bottom:8px; background:var(--surface-2);">
                    <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; flex-wrap:wrap;">
                        <div>
                            <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin-bottom:3px;">
                                <strong style="font-size:13px; color:var(--text-main);">${deck.title}</strong>
                                <span class="konkur-pill">${deck.subject}</span>
                                <span class="status-pill">${deck.chapter || 'مباحث منتخب'}</span>
                            </div>
                            <small style="font-size:11px; color:var(--text-muted);">${cardsArr.length.toLocaleString('fa-IR')} کارت آماده</small>
                        </div>
                        <button type="button" class="btn-modal auto-width" style="padding:7px 12px; font-size:11.5px;"
                                onclick="FlashcardsModule.importPublicDeck('${deck.id}')">
                            <i data-lucide="download" class="icon-sm"></i><span>افزودن</span>
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

        if (!Array.isArray(this.leitnerSettings.imported_decks)) {
            this.leitnerSettings.imported_decks = [];
        }
        if (!this.leitnerSettings.imported_decks.includes(deckId)) {
            this.leitnerSettings.imported_decks.push(deckId);
        }

        this.syncFlashcardsToSupabase();
        this.updateToolsSquareBadges();
        this.renderPublicDecksLibrary();
        this.populateMyCardsFilterDropdown();
        this.renderMyCardsArchive();
        UI.showToast(`${added.toLocaleString('fa-IR')} کارت از «${deck.title}» به مخزن شما اضافه شد!`, 'success');
    },

    populateMyCardsFilterDropdown() {
        const sel = document.getElementById('selMyCardsFilterSubj');
        if (!sel) return;
        const uniqueSubjects = [...new Set(this.flashcards.map(c => c.subject).filter(Boolean))];
        sel.innerHTML = `<option value="all">همه دروس (${this.flashcards.length.toLocaleString('fa-IR')})</option>` +
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
            container.innerHTML = '<div style="text-align:center; padding:18px; color:var(--text-muted); font-size:12px;">کارتی یافت نشد.</div>';
            return;
        }

        container.innerHTML = filtered.map(c => {
            const b = parseInt(c.box, 10) ?? 1;
            const isBrandNew = (b === 0) || (b === 1 && (parseInt(c.streak, 10) || 0) === 0 && !c.lastReviewed);
            const boxLabel = isBrandNew ? 'مخزن جدید' : `خانه ${b.toLocaleString('fa-IR')}`;

            return `
                <div style="background:var(--surface-2); border:1px solid var(--border); border-radius:12px; padding:10px; margin-bottom:7px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; gap:6px; margin-bottom:4px;">
                        <div style="display:flex; gap:5px; align-items:center; flex-wrap:wrap;">
                            <span class="konkur-pill">${c.subject || 'عمومی'}</span>
                            <span class="status-pill">${c.chapter || 'عمومی'}</span>
                            <span class="dur-badge" style="margin:0;">${boxLabel}</span>
                        </div>
                        <button type="button" class="del-icon-btn" style="width:26px;height:26px;" onclick="FlashcardsModule.deleteCardById('${c.id}')">
                            <i data-lucide="trash-2" class="icon-sm" style="width:12px;height:12px;"></i>
                        </button>
                    </div>
                    <div style="font-size:12px; font-weight:800; color:var(--text-main); margin-bottom:3px;">${this.renderMathInHtml(c.front)}</div>
                    <div style="font-size:11.5px; color:var(--text-muted); border-top:1px dashed var(--border); padding-top:3px;">${this.renderMathInHtml(c.back)}</div>
                </div>
            `;
        }).join('');
        UI.refreshIcons();
    },

    deleteCardById(cardId) {
        this.flashcards = this.flashcards.filter(c => c.id !== cardId);
        this.syncFlashcardsToSupabase();
        this.populateMyCardsFilterDropdown();
        this.renderMyCardsArchive();
        this.updateToolsSquareBadges();
    }
};

window.FlashcardsModule = FlashcardsModule;

// اتصال خودکار به ToolsModule برای حفظ سازگاری با دکمه‌های صفحه خانه و ابزارها
if (window.ToolsModule) {
    Object.assign(window.ToolsModule, FlashcardsModule);
    const origToolsInit = window.ToolsModule.init.bind(window.ToolsModule);
    window.ToolsModule.init = async function() {
        await origToolsInit();
        await FlashcardsModule.init();
    };
}
