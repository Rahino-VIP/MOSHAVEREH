/* ==========================================================================
   🏠 ماژول مستقل صفحه خانه، رادار یادآورهای هوشمند، پیام‌ها و بیدارباش (home.js)
   شامل:
   ۱. رادار هوشمند یادآورها (هشدار انقضای اشتراک از ۷ روز قبل، سررسید اقساط، درخواست برنامه آخر هفته، تحلیل جمعه با ۶ گزارش)
   ۲. باکس بنر تبلیغاتی مستطیلی (پشتیبانی از عکس آپلودشده + هدایت هوشمند به خرید اشتراک)
   ۳. لیست خلوت عادت‌های امروز (حذف خودکار هر عادت پس از تیک خوردن در صفحه خانه)
   ۴. نمایش انگیزشی وضعیت فلش‌کارت (نمایش «تکمیل شد + تعداد مرور امروز» به جای «۰ مرور»)
   ۵. اتصال دوگانه صندوق پیام‌ها به هر دو جدول students و users (پانسیون)
   ۶. چالش بیدارباش خودکار بین ساعت ۰۵:۰۰ تا ۰۷:۳۰ صبح با ۳ مینی‌گیم متنوع
   ========================================================================== */

const HomeModule = {
    // 🖼️ تنظیمات بنر تبلیغاتی مستطیلی صفحه خانه:
    // هر زمان عکس مستطیلی جدید با هوش مصنوعی ساختید و آپلود کردید، فقط لینک آن را در imageUrl قرار دهید:
    promoBannerConfig: {
        enabled: true,
        imageUrl: '', // 👈 لینک مستقیم عکس مستطیلی آپلودشده را اینجا بگذارید (مثلاً https://.../banner.jpg). اگر خالی باشد، بنر گرافیکی پیش‌فرض نمایش داده می‌شود.
        altText: 'اشتراک مشاوره و برنامه‌ریزی هوشمند قطب‌نما',
        targetRoute: 'store-renew', // با کلیک روی بنر به صفحه خرید/ارتقای اشتراک می‌رود
        fallbackTitle: '🚀 جهش تراز با برنامه‌ریزی هوشمند و مشاوره قطب‌نما',
        fallbackSub: 'برنامه ساعتی منطبق با بودجه آزمون + کالبدشکافی کارنامه و رادار تراز',
        fallbackBtnText: 'مشاهده طرح‌ها'
    },

    userInstallments: [],
    gameTimerInterval: null,

    toFa(val) {
        if (val === null || val === undefined) return '';
        return String(val).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
    },

    getTodayShamsiStr(daysOffset = 0) {
        const d = new Date();
        d.setDate(d.getDate() + daysOffset);
        const shamsi = new Intl.DateTimeFormat('fa-IR', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }).format(d);
        return UI.toEngDigits(shamsi);
    },

    // ======================================================================
    // 🚀 ۱. راه‌اندازی کامل تب خانه و اتصال خودکار به هسته برنامه
    // ======================================================================
    async init() {
        this.bindOverrides();
        await Promise.all([
            this.loadDualMessagesFromDB(),
            this.loadUserInstallmentsFromDB()
        ]);
        this.refreshHomeView();
        this.checkAutoMorningWakeup();
    },

    bindOverrides() {
        // ۱. بازنویسی رندر عادت‌های صفحه خانه تا عادت‌های تیک‌خورده حذف شوند و صفحه خلوت بماند
        if (window.HabitsModule) {
            window.HabitsModule.renderHomeHabitsSummary = () => this.renderCleanHomeHabits();
        }
        // ۲. بازنویسی وضعیت فلش‌کارت در خانه تا وقتی مرور تمام شده، ننویسد «۰ مرور»
        if (window.FlashcardsModule) {
            const origUpdateBadges = window.FlashcardsModule.updateToolsSquareBadges.bind(window.FlashcardsModule);
            window.FlashcardsModule.updateToolsSquareBadges = () => {
                origUpdateBadges();
                this.renderSmartFlashcardKpi();
            };
        }
        // ۳. بازنویسی بررسی بیدارباش در AppCore برای بازه ۵:۰۰ تا ۷:۳۰ صبح
        if (window.AppCore) {
            window.AppCore.checkAutoMorningWakeup = () => this.checkAutoMorningWakeup();
            window.AppCore.renderMessagesModal = () => this.renderMessagesModal();
        }
        // ۴. بروزرسانی خودکار خانه هر بار که کاربر به تب خانه برمی‌گردد
        if (window.Router && !window.Router._homeHooked) {
            const origSwitch = window.Router.switchMainTab.bind(window.Router);
            window.Router.switchMainTab = (tabId) => {
                origSwitch(tabId);
                if (tabId === 'home') {
                    this.refreshHomeView();
                }
            };
            window.Router._homeHooked = true;
        }
    },

    refreshHomeView() {
        // ۱. بروزرسانی زنجیره سحرخیزی در هدر خانه
        const streak = parseInt(AppState.studentData?.wake_streak, 10) || 0;
        const streakEl = document.getElementById('homeStreakCount');
        if (streakEl) streakEl.innerText = this.toFa(streak);

        // ۲. بروزرسانی وضعیت گزارش امروز در کارت KPI دوم
        const todayStr = this.getTodayShamsiStr(0);
        const todayReport = (AppState.dailyReports || []).find(r => UI.toEngDigits(r.report_date) === todayStr);
        const repValEl = document.getElementById('homeReportStatus');
        const repSubEl = document.getElementById('homeReportSub');

        if (repValEl) {
            if (todayReport) {
                let dTime = 0, dTests = 0;
                (todayReport.courses || []).forEach(c => {
                    dTime += (parseFloat(c.edu) || 0) + (parseFloat(c.study) || 0);
                    dTests += (parseInt(c.tests, 10) || 0);
                });
                repValEl.innerHTML = `<span class="success-text">✅ ثبت شد</span>`;
                if (repSubEl) repSubEl.innerText = `امروز: ${this.toFa(Number(dTime.toFixed(1)))} ساعت • ${this.toFa(dTests)} تست`;
            } else {
                repValEl.innerText = 'ثبت نشده';
                if (repSubEl) repSubEl.innerText = 'ثبت ساعت مطالعه و تست';
            }
        }

        // ۳. رندر بخش‌های چهارگانه صفحه خانه
        this.renderSmartFlashcardKpi();
        this.renderCleanHomeHabits();
        this.renderSmartActionAlerts();
        this.renderPromoBanner();
        UI.refreshIcons();
    },

    // ======================================================================
    // 🗂️ ۲. وضعیت هوشمند فلش‌کارت در خانه (جلوگیری از نوشتن «۰ مرور» پس از تلاش دانش‌آموز)
    // ======================================================================
    renderSmartFlashcardKpi() {
        const homeFcEl = document.getElementById('homeFcCount');
        const homeFcSub = document.getElementById('homeFcSub');
        if (!homeFcEl || !window.FlashcardsModule) return;

        const fm = window.FlashcardsModule;
        fm.buildTodayDueQueue('all', 'all');
        const dueCount = fm.dueQueue.length;
        const totalCards = fm.flashcards.length;

        const todayStr = this.getTodayShamsiStr(0);
        const todayHist = fm.leitnerSettings?.review_history?.[todayStr] || { reviewed: 0, correct: 0 };
        const reviewedToday = parseInt(todayHist.reviewed, 10) || 0;

        if (totalCards === 0) {
            homeFcEl.innerText = 'شروع لایتنر';
            if (homeFcSub) homeFcSub.innerText = 'افزودن اولین فلش‌کارت';
        } else if (dueCount === 0 && reviewedToday > 0) {
            // دانش‌آموز امروز مرورهایش را انجام داده و تمام کرده است!
            homeFcEl.innerHTML = `<span class="success-text">✅ تکمیل شد</span>`;
            if (homeFcSub) homeFcSub.innerText = `امروز ${this.toFa(reviewedToday)} کارت مرور کردی!`;
        } else if (dueCount === 0) {
            homeFcEl.innerHTML = `<span class="primary-text">✅ در مدار</span>`;
            if (homeFcSub) homeFcSub.innerText = `تمام ${this.toFa(totalCards)} کارت مرور شده‌اند`;
        } else {
            homeFcEl.innerText = `${this.toFa(dueCount)} مرور آماده`;
            if (homeFcSub) {
                homeFcSub.innerText = reviewedToday > 0
                    ? `${this.toFa(reviewedToday)} مرور انجام شده • ادامه مرور`
                    : `از مجموع ${this.toFa(totalCards)} کارت شما`;
            }
        }
    },

    // ======================================================================
    // ✅ ۳. لیست خلوت عادت‌های امروز در خانه (عادت تیک‌خورده حذف می‌شود)
    // ======================================================================
    renderCleanHomeHabits() {
        const homeContainer = document.getElementById('homeHabitsContainer');
        const progEl = document.getElementById('habitProgressText');
        if (!homeContainer || !window.HabitsModule) return;

        const hm = window.HabitsModule;
        const todayStr = this.getTodayShamsiStr(0);
        const allHabits = hm.habitsList || [];

        const remainingHabits = [];
        let doneCount = 0;

        allHabits.forEach(h => {
            const logs = hm.habitsLogs[h.id] || [];
            if (logs.includes(todayStr)) {
                doneCount++;
            } else {
                remainingHabits.push(h);
            }
        });

        if (progEl) {
            progEl.innerText = `${this.toFa(doneCount)} از ${this.toFa(allHabits.length)} انجام شده`;
        }

        // اگر تمام عادت‌های امروز تیک خورده‌اند، لیست را جمع کن و پیام تبریک مینیمال نشان بده
        if (remainingHabits.length === 0 && allHabits.length > 0) {
            homeContainer.style.gridTemplateColumns = '1fr';
            homeContainer.innerHTML = `
                <div style="background:var(--success-fade); border:1px dashed var(--success); border-radius:14px; padding:12px; text-align:center; font-size:12px; font-weight:800; color:var(--success); display:flex; align-items:center; justify-content:center; gap:6px;">
                    <i data-lucide="sparkles" class="icon-sm"></i>
                    <span>ایول قهرمان! تمام ${this.toFa(allHabits.length)} عادت امروزت رو کامل انجام دادی.</span>
                </div>
            `;
            UI.refreshIcons();
            return;
        }

        homeContainer.style.gridTemplateColumns = '';
        homeContainer.innerHTML = remainingHabits.map(h => `
            <div class="toggle-row" onclick="HabitsModule.toggleHabitOnDate('${h.id}', '${todayStr}', false)"
                 style="margin-bottom:0; border-color:var(--border); background:var(--surface-2);">
                <div style="display:flex; align-items:center; gap:8px; font-size:12px; font-weight:800;">
                    <i data-lucide="${h.icon || 'check-circle'}" class="icon-sm primary-text"></i>
                    <span>${this.toFa(h.title)}</span>
                </div>
                <div style="width:20px; height:20px; border-radius:6px; border:2px solid var(--primary); background:transparent; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                </div>
            </div>
        `).join('');

        UI.refreshIcons();
    },

    // ======================================================================
    // 🚨 ۴. رادار هشدارها و یادآورهای هوشمند در بالای صفحه خانه
    // ======================================================================
    async loadUserInstallmentsFromDB() {
        const uid = String(AppState.userId || '');
        const uphone = String(AppState.userPhone || AppState.studentData?.phone_number || uid);
        if (!uid) return;

        try {
            const { data } = await supabaseClient
                .from('installments')
                .select('*')
                .or(`student_nid.eq.${uid},user_phone.eq.${uphone}`)
                .order('due_date', { ascending: true });
            if (data) {
                this.userInstallments = data;
                AppState.installments = data;
            }
        } catch (_) {}
    },

    renderSmartActionAlerts() {
        const container = document.getElementById('homeSmartAlertsContainer');
        if (!container) return;

        const alerts = [];
        const now = new Date();
        const iranNow = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Tehran" }));
        const jsDay = iranNow.getDay(); // 4 = پنجشنبه، 5 = جمعه
        const hour = iranNow.getHours();

        // ۱. هشدار انقضای اشتراک از ۷ روز قبل (مشاوره، پرو یا پانسیون)
        (AppState.subscriptions || []).forEach(sub => {
            if (!sub.end_date) return;
            const eDate = new Date(sub.end_date);
            const remainDays = Math.ceil((eDate - now) / (1000 * 3600 * 24));
            if (remainDays >= 0 && remainDays <= 7) {
                alerts.push({
                    type: remainDays <= 2 ? 'danger' : 'warn',
                    icon: 'hourglass',
                    title: `⏳ ${this.toFa(remainDays)} روز تا پایان اشتراک ${this.toFa(sub.service_type || 'قطب‌نما')}`,
                    sub: 'برای جلوگیری از قطع شدن برنامه‌های هفتگی و تحلیل‌ها، اشتراک خود را تمدید کنید.',
                    btnText: 'تمدید اشتراک',
                    onClick: "Router.openSubPage('store-renew')"
                });
            }
        });

        // ۲. هشدار سررسید اقساط پرداخت‌نشده (از ۷ روز قبل از سررسید)
        const pendingInst = (this.userInstallments || []).find(inst => {
            const st = String(inst.status || '').toLowerCase();
            if (st === 'paid' || st === 'approved' || st === 'completed') return false;
            if (!inst.due_date) return true;
            const dDate = new Date(inst.due_date);
            const diffDays = Math.ceil((dDate - now) / (1000 * 3600 * 24));
            return diffDays <= 7;
        });

        if (pendingInst) {
            const amtFa = this.toFa(UI.formatMoney(pendingInst.amount || 0));
            alerts.push({
                type: 'danger',
                icon: 'credit-card',
                title: `💳 یادآوری سررسید قسط (${amtFa} تومان)`,
                sub: 'موعد پرداخت قسط شما فرا رسیده است؛ لطفاً فیش واریزی را در بخش پروفایل بارگذاری کنید.',
                btnText: 'پرداخت قسط',
                onClick: "Router.openSubPage('profile')"
            });
        }

        // ۳. یادآور آخر هفته (پنجشنبه و جمعه) برای درخواست برنامه جدید
        const isThursdayOrFriday = (jsDay === 4 && hour >= 16) || (jsDay === 5);
        if (isThursdayOrFriday && window.PlanningModule) {
            const alreadyRequested = window.PlanningModule.hasScheduleForCurrentCycle(true) ||
                (window.PlanningModule.allUserSchedulesHistory || []).some(s => s.status === 'pending');

            if (!alreadyRequested) {
                alerts.push({
                    type: 'primary',
                    icon: 'calendar-plus',
                    title: '🗓️ پنجره دریافت برنامه هفته آینده باز است!',
                    sub: 'معذوریت‌های زمانی و امتحانات هفته آینده خود را ثبت کنید تا برنامه جدید تدوین شود.',
                    btnText: 'درخواست برنامه',
                    onClick: "Router.switchMainTab('planning'); PlanningModule.switchSubtab('request', document.querySelectorAll('#tab-planning .subtab-btn')[2]);"
                });
            }
        }

        // ۴. یادآور روزهای جمعه برای دریافت تحلیل هفتگی و آزمون (به شرط داشتن حداقل ۶ گزارش در هفته اخیر)
        if (jsDay === 5 && window.AnalyticsModule) {
            const latestWeek = (window.AnalyticsModule.weekCalendars || [])[0];
            if (latestWeek) {
                const startStr = UI.toEngDigits(latestWeek.start_date);
                const endStr = UI.toEngDigits(latestWeek.end_date);
                const weekReportsCount = (AppState.dailyReports || []).filter(r => {
                    const rd = UI.toEngDigits(r.report_date);
                    return rd >= startStr && rd <= endStr;
                }).length;

                const alreadyAnalyzed = (AppState.examResults || []).some(ex =>
                    UI.toEngDigits(ex.period_start) === startStr && UI.toEngDigits(ex.period_end) === endStr
                );

                if (weekReportsCount >= 6 && !alreadyAnalyzed) {
                    const isExWeek = String(latestWeek.week_type || '').toLowerCase().includes('exam');
                    alerts.push({
                        type: 'accent',
                        icon: 'brain-circuit',
                        title: isExWeek ? '📊 تحلیل کارنامه آزمون و عملکرد هفته آماده است!' : '📊 قفل تحلیل هوشمند این هفته‌ات باز شد!',
                        sub: `شما ${this.toFa(weekReportsCount)} گزارش در «${this.toFa(latestWeek.title)}» ثبت کرده‌اید؛ همین الان تحلیل هوشمند خود را دریافت کنید.`,
                        btnText: 'دریافت تحلیل',
                        onClick: "Router.switchMainTab('analytics'); AnalyticsModule.switchSubtab('clinic', document.querySelectorAll('#tab-analytics .subtab-btn')[1]);"
                    });
                }
            }
        }

        if (alerts.length === 0) {
            container.style.display = 'none';
            container.innerHTML = '';
            return;
        }

        container.style.display = 'flex';
        container.innerHTML = alerts.map(a => `
            <div class="smart-alert-card ${a.type}" onclick="${a.onClick}">
                <div class="smart-alert-info">
                    <div class="module-icon-badge" style="width:36px;height:36px;"><i data-lucide="${a.icon}" class="icon-sm"></i></div>
                    <div>
                        <div class="smart-alert-title">${a.title}</div>
                        <div class="smart-alert-sub">${a.sub}</div>
                    </div>
                </div>
                <button type="button" class="smart-alert-btn">
                    <span>${a.btnText}</span>
                    <i data-lucide="arrow-left" class="icon-sm" style="width:13px;height:13px;"></i>
                </button>
            </div>
        `).join('');
    },

    // ======================================================================
    // 🖼️ ۵. رندر باکس بنر تبلیغاتی مستطیلی (پشتیبانی از عکس هوش مصنوعی)
    // ======================================================================
    renderPromoBanner() {
        const container = document.getElementById('homePromoBannerContainer');
        if (!container) return;

        const cfg = this.promoBannerConfig;
        if (!cfg.enabled) {
            container.innerHTML = '';
            return;
        }

        // اگر لینک عکس مستطیلی در imageUrl قرار داده شده باشد، خود عکس نمایش داده شود
        if (cfg.imageUrl && cfg.imageUrl.trim() !== '') {
            container.innerHTML = `
                <div class="home-promo-banner" onclick="Router.openSubPage('${cfg.targetRoute}')">
                    <img src="${cfg.imageUrl}" alt="${cfg.altText}" loading="lazy">
                </div>
            `;
            return;
        }

        // اگر کاربر اشتراک VIP ندارد، بنر گرافیکی ارتقا به مشاوره یا اشتراک پرو نمایش داده شود
        if (AppState.accessTier === 'vip') {
            container.innerHTML = '';
            return;
        }

        const bannerTitle = AppState.accessTier === 'free'
            ? '🚀 فعال‌سازی اشتراک قطب‌نما پرو و مشاوره اختصاصی'
            : '💎 ارتقا به طرح مشاوره VIP با نظارت مستقیم مشاور';
        const bannerSub = AppState.accessTier === 'free'
            ? 'دریافت برنامه ساعتی منطبق با بودجه‌بندی آزمون + کالبدشکافی کارنامه'
            : 'بررسی تک‌به‌تک گزارش‌های شبانه، تماس هفتگی و تنظیم برنامه توسط مشاور';

        container.innerHTML = `
            <div class="home-promo-banner" onclick="Router.openSubPage('${cfg.targetRoute}')">
                <div class="home-promo-fallback">
                    <div style="display:flex; align-items:center; gap:10px;">
                        <div class="module-icon-badge" style="background:rgba(251,191,36,0.2); color:#fbbf24; border-color:rgba(251,191,36,0.4);">
                            <i data-lucide="crown" class="icon"></i>
                        </div>
                        <div style="text-align:right;">
                            <div style="font-size:13px; font-weight:900; color:#f8fafc; margin-bottom:2px;">${bannerTitle}</div>
                            <div style="font-size:11px; color:#cbd5e1; font-weight:600;">${bannerSub}</div>
                        </div>
                    </div>
                    <span class="smart-alert-btn" style="background:#fbbf24; color:#0f172a;">
                        <span>${cfg.fallbackBtnText}</span>
                        <i data-lucide="chevron-left" class="icon-sm" style="width:13px;height:13px;"></i>
                    </span>
                </div>
            </div>
        `;
    },

    // ======================================================================
    // 🔔 ۶. اتصال دوگانه صندوق پیام‌ها به هر دو جدول students و users (پانسیون)
    // ======================================================================
    async loadDualMessagesFromDB() {
        const uid = String(AppState.userId || '').trim();
        if (!uid) return;

        const rawPhone = String(AppState.userPhone || AppState.studentData?.phone_number || uid).trim();
        const phoneWithZero = rawPhone.startsWith('0') ? rawPhone : ('0' + rawPhone);
        const phoneNoZero = rawPhone.replace(/^0+/, '');

        const nidsSet = new Set([uid, phoneWithZero, phoneNoZero]);
        const phonesSet = new Set([uid, phoneWithZero, phoneNoZero]);

        // بررسی جدول users (اعضای پانسیون) برای دریافت کد ملی یا شماره موبایل ثبت‌شده در پانسیون
        try {
            const { data: panUser } = await supabaseClient
                .from('users')
                .select('phone_number, national_code')
                .or(`phone_number.eq.${phoneWithZero},phone_number.eq.${phoneNoZero},national_code.eq.${uid}`)
                .limit(1)
                .maybeSingle();

            if (panUser) {
                if (panUser.national_code) nidsSet.add(String(panUser.national_code).trim());
                if (panUser.phone_number) {
                    const p = String(panUser.phone_number).trim();
                    phonesSet.add(p);
                    phonesSet.add(p.startsWith('0') ? p : ('0' + p));
                    phonesSet.add(p.replace(/^0+/, ''));
                }
            }
        } catch (_) {}

        // ساخت شرط OR جامع برای دریافت پیام‌های هر دو سیستم (student_nid و phone_number)
        const orClauses = [];
        nidsSet.forEach(val => { if (val) orClauses.push(`student_nid.eq.${val}`); });
        phonesSet.forEach(val => { if (val) orClauses.push(`phone_number.eq.${val}`); });

        try {
            const { data: msgs } = await supabaseClient
                .from('messages')
                .select('*')
                .or(orClauses.join(','))
                .order('created_at', { ascending: false })
                .limit(35);

            if (msgs) {
                AppState.messages = msgs;
                this.renderMessagesModal();
            }
        } catch (err) {
            console.warn("Dual messages fetch warning:", err);
        }
    },

    renderMessagesModal() {
        const msgs = AppState.messages || [];
        const unread = msgs.filter(m => !m.is_read);
        const badge = document.getElementById('msgBadge');

        if (badge) {
            if (unread.length > 0) {
                badge.innerText = this.toFa(unread.length);
                badge.style.display = 'flex';
            } else {
                badge.style.display = 'none';
            }
        }

        const listEl = document.getElementById('messagesListContainer');
        if (!listEl) return;

        if (msgs.length === 0) {
            listEl.innerHTML = '<div style="text-align:center;color:var(--text-muted);font-size:12.5px;padding:24px;">پیامی در صندوق شما وجود ندارد.</div>';
            return;
        }

        listEl.innerHTML = msgs.map(m => {
            const dateFa = m.created_at
                ? new Date(m.created_at).toLocaleDateString('fa-IR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                : '';

            // تبدیل دکمه‌های قدیمی داخل متن پیام‌های تمدید اشتراک به مسیریاب جدید اپلیکیشن
            let cleanBody = String(m.body || m.content || '')
                .replace(/onclick="alert\([^)]*\)"/g, `onclick="UI.closeModals(); Router.openSubPage('store-renew');"`);

            return `
                <div style="background:${m.is_read ? 'var(--surface-2)' : 'var(--primary-fade)'}; border:1px solid ${m.is_read ? 'var(--border)' : 'var(--primary)'}; border-radius:14px; padding:12px 14px; margin-bottom:8px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:4px;">
                        <div style="font-size:12.5px; font-weight:900; color:var(--primary);">${this.toFa(m.title || 'پیام سیستم')}</div>
                        <small style="font-size:10px; color:var(--text-muted); white-space:nowrap;">${dateFa}</small>
                    </div>
                    <div style="font-size:11.5px; color:var(--text-main); line-height:1.75;">${this.toFa(cleanBody)}</div>
                </div>
            `;
        }).join('');
    },

    async openMessagesModal() {
        UI.openModal('messagesModal');
        this.renderMessagesModal();

        // علامت‌گذاری پیام‌های خوانده‌نشده به عنوان خوانده‌شده (is_read = true)
        const unreadIds = (AppState.messages || []).filter(m => !m.is_read).map(m => m.id);
        if (unreadIds.length > 0) {
            (AppState.messages || []).forEach(m => { m.is_read = true; });
            const badge = document.getElementById('msgBadge');
            if (badge) badge.style.display = 'none';

            try {
                await supabaseClient
                    .from('messages')
                    .update({ is_read: true })
                    .in('id', unreadIds);
            } catch (_) {}
        }
    },

    // ======================================================================
    // 🌅 ۷. چالش بیدارباش خودکار در خانه (هر روز از ۵:۰۰ تا ۷:۳۰ صبح با ۳ بازی متنوع)
    // ======================================================================
    checkAutoMorningWakeup() {
        try {
            const iranNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Tehran" }));
            const hour = iranNow.getHours();
            const minute = iranNow.getMinutes();
            const totalMins = (hour * 60) + minute;

            const todayIso = iranNow.toISOString().split('T')[0];
            const uid = String(AppState.userId || '');
            const lastWakeDb = AppState.studentData?.last_wakeup_date;
            const lastWakeLocal = Storage.get(`qotbnama_wakeup_done_${uid}`);

            // بازه دقیق ۵:۰۰ صبح (۳۰۰ دقیقه) تا ۷:۳۰ صبح (۴۵۰ دقیقه)
            const isInMorningWindow = totalMins >= 300 && totalMins <= 450;

            if (isInMorningWindow && lastWakeDb !== todayIso && lastWakeLocal !== todayIso) {
                setTimeout(() => this.openRandomWakeupGame(), 700);
            }
        } catch (_) {}
    },

    openRandomWakeupGame() {
        UI.openModal('wakeupModal');
        const games = ['sun_hunt', 'math_spark', 'memory_order'];
        const chosenGame = games[Math.floor(Math.random() * games.length)];
        this.startWakeupMiniGame(chosenGame);
    },

    startWakeupMiniGame(gameType) {
        clearInterval(this.gameTimerInterval);
        let timeLeft = 18;
        const timerEl = document.getElementById('gameTimerDisplay');
        const container = document.getElementById('quizContainer');
        if (!container) return;

        if (timerEl) timerEl.innerText = this.toFa(`00:${timeLeft}`);

        // بازی ۱: شکار خورشید صبحگاهی
        if (gameType === 'sun_hunt') {
            const targetIndex = Math.floor(Math.random() * 12);
            container.innerHTML = `<div style="margin-bottom:10px; font-weight:900; font-size:12.5px;">☀️ خورشید درخشان را از بین ماه‌ها پیدا کن!</div>`;
            const grid = document.createElement('div');
            grid.style.cssText = 'display:grid; grid-template-columns:repeat(4, 1fr); gap:8px; width:100%;';

            for (let i = 0; i < 12; i++) {
                const btn = document.createElement('button');
                btn.className = 'btn-modal-outline';
                btn.style.padding = '12px';
                btn.innerHTML = `<i data-lucide="${i === targetIndex ? 'sun' : 'moon'}" class="icon ${i === targetIndex ? 'gold-text' : ''}"></i>`;
                btn.onclick = () => {
                    if (i === targetIndex) this.winMorningWakeup();
                    else btn.style.opacity = '0.2';
                };
                grid.appendChild(btn);
            }
            container.appendChild(grid);
        }
        // بازی ۲: جرقه محاسباتی مغز
        else if (gameType === 'math_spark') {
            const a = Math.floor(Math.random() * 7) + 4;
            const b = Math.floor(Math.random() * 6) + 3;
            const c = Math.floor(Math.random() * 9) + 2;
            const correctAns = (a * b) + c;

            const options = new Set([correctAns]);
            while (options.size < 4) {
                options.add(correctAns + (Math.floor(Math.random() * 11) - 5));
            }
            const shuffled = [...options].sort(() => Math.random() - 0.5);

            container.innerHTML = `
                <div style="margin-bottom:8px; font-weight:800; font-size:12px; color:var(--text-muted);">🧠 حاصل عبارت زیر را سریع انتخاب کن:</div>
                <div style="font-size:22px; font-weight:900; color:var(--primary); direction:ltr; margin-bottom:12px;">
                    (${this.toFa(a)} × ${this.toFa(b)}) + ${this.toFa(c)} = ?
                </div>
                <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; width:100%;" id="mathOptsGrid"></div>
            `;
            const grid = container.querySelector('#mathOptsGrid');
            shuffled.forEach(opt => {
                const btn = document.createElement('button');
                btn.className = 'btn-modal-outline';
                btn.style.fontSize = '15px';
                btn.style.fontWeight = '900';
                btn.innerText = this.toFa(opt);
                btn.onclick = () => {
                    if (opt === correctAns) this.winMorningWakeup();
                    else { btn.style.borderColor = 'var(--danger)'; btn.style.opacity = '0.35'; }
                };
                grid.appendChild(btn);
            });
        }
        // بازی ۳: قطب‌نمای اعداد ترتیبی (۱ تا ۶)
        else {
            let nextExpected = 1;
            const nums = [1, 2, 3, 4, 5, 6].sort(() => Math.random() - 0.5);
            container.innerHTML = `<div style="margin-bottom:10px; font-weight:900; font-size:12.5px;">⚡ اعداد ۱ تا ۶ را به ترتیب از کوچک به بزرگ لمس کن!</div>`;
            const grid = document.createElement('div');
            grid.style.cssText = 'display:grid; grid-template-columns:repeat(3, 1fr); gap:8px; width:100%;';

            nums.forEach(n => {
                const btn = document.createElement('button');
                btn.className = 'btn-modal-outline';
                btn.style.padding = '12px';
                btn.style.fontSize = '16px';
                btn.style.fontWeight = '900';
                btn.innerText = this.toFa(n);
                btn.onclick = () => {
                    if (n === nextExpected) {
                        btn.style.background = 'var(--success)';
                        btn.style.color = '#fff';
                        nextExpected++;
                        if (nextExpected > 6) this.winMorningWakeup();
                    } else {
                        btn.style.borderColor = 'var(--danger)';
                    }
                };
                grid.appendChild(btn);
            });
            container.appendChild(grid);
        }

        UI.refreshIcons();

        this.gameTimerInterval = setInterval(() => {
            timeLeft--;
            if (timerEl) timerEl.innerText = this.toFa(`00:${String(Math.max(0, timeLeft)).padStart(2, '0')}`);
            if (timeLeft <= 0) {
                clearInterval(this.gameTimerInterval);
                container.innerHTML = `
                    <div style="margin-bottom:10px; color:var(--danger); font-weight:800;">زمان تمام شد! بیدار شو قهرمان:</div>
                    <button type="button" class="btn-modal" onclick="HomeModule.openRandomWakeupGame()">چالش جدید بیدارباش</button>
                `;
            }
        }, 1000);
    },

    async winMorningWakeup() {
        clearInterval(this.gameTimerInterval);
        const uid = String(AppState.userId || '');
        const iranNow = new Date(new Date().toLocaleString("en-US", { timeZone: "Asia/Tehran" }));
        const todayIso = iranNow.toISOString().split('T')[0];
        const newStreak = (parseInt(AppState.studentData?.wake_streak, 10) || 0) + 1;

        Storage.set(`qotbnama_wakeup_done_${uid}`, todayIso);

        try {
            await supabaseClient.from('students').update({
                wake_streak: newStreak,
                last_wakeup_date: todayIso,
                consecutive_oversleeps: 0
            }).eq('national_id', uid);

            if (AppState.studentData) {
                AppState.studentData.wake_streak = newStreak;
                AppState.studentData.last_wakeup_date = todayIso;
            }
        } catch (_) {}

        // تیک خوردن خودکار عادت سحرخیزی امروز (و حذف شدنش از باکس عادت‌های باقی‌مانده خانه)
        const todayShamsi = this.getTodayShamsiStr(0);
        if (window.HabitsModule) {
            const wakeHabit = window.HabitsModule.habitsList.find(h => h.id === 'h_wake' || h.title.includes('بیداری'));
            if (wakeHabit) {
                const logs = window.HabitsModule.habitsLogs[wakeHabit.id] || [];
                if (!logs.includes(todayShamsi)) {
                    window.HabitsModule.toggleHabitOnDate(wakeHabit.id, todayShamsi, false);
                }
            }
        }

        this.refreshHomeView();
        UI.closeModals();
        if (window.confetti) confetti({ particleCount: 140, spread: 75, origin: { y: 0.6 } });
        UI.showToast(`☀️ صبح بخیر قهرمان! حضور ساعت ۵ تا ۷:۳۰ صبح و زنجیره ${this.toFa(newStreak)} روزه‌ات ثبت شد!`, 'success');
    }
};

window.HomeModule = HomeModule;

// اتصال خودکار به چرخه راه‌اندازی اپلیکیشن بدون نیاز به دستکاری core.js
if (window.ToolsModule) {
    const origToolsInit = window.ToolsModule.init.bind(window.ToolsModule);
    window.ToolsModule.init = async function() {
        await origToolsInit();
        await HomeModule.init();
    };
}
