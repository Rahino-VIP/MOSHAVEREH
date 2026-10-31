/* ==========================================================================
   📦 فایل هسته مرکزی قطب‌نما (js/core.js)
   شامل: تنظیمات اتصال به سوپابیس، مدیریت حافظه (AppState)، مسیریاب (Router) و ابزارهای UI
   ========================================================================== */

// 🔗 ۱. تنظیمات مرکزی اتصال (برای انتقال به سرور داخلی، فقط این ۲ خط را تغییر دهید)
const SUPABASE_URL = 'https://etlutqwwqeahevsskjih.supabase.co'; 
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV0bHV0cXd3cWVhaGV2c3NramloIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2MTYwNjIsImV4cCI6MjA5NzE5MjA2Mn0.kXvSQtGM7w28IffQ4JOtv_xtHenyDV0tC70bOd7N7nQ'; 
const GAS_WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbyUy08rtBxcRePHokg_FT0s_8e6Qj5Y1CcQXE5F_H0oX5VTvO7VhCs_KTfRp6xlKtynbA/exec';

// ایجاد کلاینت سراسری سوپابیس
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ==========================================================================
// 💾 ۲. مدیریت ایمن حافظه مرورگر (Storage Helpers)
// ==========================================================================
const Storage = {
    get(key, fallback = null) {
        try {
            const val = localStorage.getItem(key);
            return val !== null ? val : fallback;
        } catch (_) {
            return fallback;
        }
    },
    set(key, val) {
        try { localStorage.setItem(key, val); } catch (_) {}
    },
    remove(key) {
        try { localStorage.removeItem(key); } catch (_) {}
    }
};

// ==========================================================================
// 🧠 ۳. وضعیت سراسری کش‌شده در حافظه (AppState)
// اطلاعات یک‌بار از دیتابیس خوانده شده و بدون رفرش بین تمام تب‌ها به اشتراک گذاشته می‌شود
// ==========================================================================
const AppState = {
    userId: Storage.get('qotbnama_user_id') || Storage.get('national_id') || null,
    userPhone: Storage.get('qotbnama_phone') || null,
    fullName: Storage.get('qotbnama_full_name', 'دانش‌آموز'),
    userAuthToken: SUPABASE_KEY,

    currentShell: 'auth',      // 'auth' | 'app'
    currentTab: 'home',        // 'home' | 'report' | 'planning' | 'analytics' | 'tools'
    currentSubPage: null,      // 'profile' | 'store-renew' | 'store-swap' | null

    isConsultant: false,
    hasPansionActive: false,
    planType: Storage.get('qotbnama_plan', 'free'),
    userMode: Storage.get('qotbnama_user_mode', 'consult'),

    studentData: {},
    studentGrade: 'دوازدهم',
    studentMajor: 'تجربی',
    globalSubjects: [],

    // داده‌های کش‌شده ماژول‌ها
    dailyReports: [],
    completedDates: [],
    allSchedules: [],
    currentScheduleObj: null,
    vipSettings: null,
    subscriptions: [],
    installments: [],
    withdrawRequests: [],
    examResults: [],
    aiAnalyses: [],
    messages: [],

    // داده‌های فروشگاه (مرحله ۲، تمدید و تعویض)
    services: [],
    promos: [],
    rules: [],
    konkurDateObj: null,
    konkurDurationMonths: 10
};

// 📚 دیکشنری یکپارچه و ۱۰۰٪ منطبق با ستون book_name در جدول knowledge_graph و exam_budgets
const SUBJECTS_DICT = { 
    "دهم": { 
        "ریاضی": ["ریاضی ۱", "هندسه ۱", "فیزیک ۱", "شیمی ۱", "فارسی ۱", "عربی ۱", "دین و زندگی ۱", "انگلیسی ۱", "جغرافیا", "سایر"], 
        "تجربی": ["زیست‌شناسی ۱", "ریاضی ۱", "فیزیک ۱", "شیمی ۱", "فارسی ۱", "عربی ۱", "دین و زندگی ۱", "انگلیسی ۱", "جغرافیا", "سایر"], 
        "انسانی": ["علوم و فنون ادبی ۱", "ریاضی و آمار ۱", "اقتصاد", "تاریخ ۱", "جغرافیا", "جامعه‌شناسی ۱", "منطق", "فارسی ۱", "عربی ۱", "دین و زندگی ۱", "انگلیسی ۱", "سایر"] 
    }, 
    "یازدهم": { 
        "ریاضی": ["حسابان ۱", "هندسه ۲", "آمار و احتمال", "فیزیک ۲", "شیمی ۲", "زمین‌شناسی", "فارسی ۲", "عربی ۲", "دین و زندگی ۲", "انگلیسی ۲", "تاریخ معاصر ایران", "ریاضی ۱", "هندسه ۱", "فیزیک ۱", "شیمی ۱", "سایر"], 
        "تجربی": ["زیست‌شناسی ۲", "ریاضی ۲", "فیزیک ۲", "شیمی ۲", "زمین‌شناسی", "فارسی ۲", "عربی ۲", "دین و زندگی ۲", "انگلیسی ۲", "تاریخ معاصر ایران", "زیست‌شناسی ۱", "ریاضی ۱", "فیزیک ۱", "شیمی ۱", "سایر"], 
        "انسانی": ["علوم و فنون ادبی ۲", "ریاضی و آمار ۲", "تاریخ ۲", "جامعه‌شناسی ۲", "فلسفه ۱", "روان‌شناسی", "فارسی ۲", "عربی ۲", "دین و زندگی ۲", "انگلیسی ۲", "علوم و فنون ادبی ۱", "ریاضی و آمار ۱", "اقتصاد", "منطق", "تاریخ ۱", "جامعه‌شناسی ۱", "جغرافیا", "سایر"] 
    }, 
    "دوازدهم": { 
        "ریاضی": ["حسابان ۲", "حسابان ۱", "ریاضی ۱", "هندسه ۳", "هندسه ۲", "هندسه ۱", "ریاضیات گسسته", "آمار و احتمال", "فیزیک ۳", "فیزیک ۲", "فیزیک ۱", "شیمی ۳", "شیمی ۲", "شیمی ۱", "فارسی ۳", "عربی ۳", "دین و زندگی ۳", "زبان انگلیسی ۳", "سلامت و بهداشت", "هویت اجتماعی", "سایر"], 
        "تجربی": ["زیست‌شناسی ۳", "زیست‌شناسی ۲", "زیست‌شناسی ۱", "ریاضی ۳", "ریاضی ۲", "ریاضی ۱", "فیزیک ۳", "فیزیک ۲", "فیزیک ۱", "شیمی ۳", "شیمی ۲", "شیمی ۱", "زمین‌شناسی", "فارسی ۳", "عربی ۳", "دین و زندگی ۳", "زبان انگلیسی ۳", "سلامت و بهداشت", "هویت اجتماعی", "سایر"], 
        "انسانی": ["علوم و فنون ادبی ۳", "علوم و فنون ادبی ۲", "علوم و فنون ادبی ۱", "ریاضی و آمار ۳", "ریاضی و آمار ۲", "ریاضی و آمار ۱", "اقتصاد", "تاریخ ۳", "تاریخ ۲", "تاریخ ۱", "جغرافیا ۳", "جغرافیا", "جامعه‌شناسی ۳", "جامعه‌شناسی ۲", "جامعه‌شناسی ۱", "فلسفه ۲", "فلسفه ۱", "منطق", "روان‌شناسی", "فارسی ۳", "عربی ۳", "دین و زندگی ۳", "زبان انگلیسی ۳", "سلامت و بهداشت", "هویت اجتماعی", "سایر"] 
    } 
};

// تابع یکسان‌ساز نام دروس (تبدیل نام‌های قدیمی و اعداد انگلیسی به نام استاندارد knowledge_graph)
window.normalizeSubjectName = function(rawName) {
    if (!rawName) return '';
    let s = String(rawName).trim()
        .replace(/1/g, '۱').replace(/2/g, '۲').replace(/3/g, '۳')
        .replace(/ي/g, 'ی').replace(/ك/g, 'ک');
    const map = {
        'زیست ۱': 'زیست‌شناسی ۱', 'زیست ۲': 'زیست‌شناسی ۲', 'زیست ۳': 'زیست‌شناسی ۳',
        'گسسته': 'ریاضیات گسسته',
        'علوم و فنون ۱': 'علوم و فنون ادبی ۱', 'علوم و فنون ۲': 'علوم و فنون ادبی ۲', 'علوم و فنون ۳': 'علوم و فنون ادبی ۳',
        'دینی ۱': 'دین و زندگی ۱', 'دینی ۲': 'دین و زندگی ۲', 'دینی ۳': 'دین و زندگی ۳', 'دینی': 'دین و زندگی ۳',
        'زبان ۱': 'انگلیسی ۱', 'زبان ۲': 'انگلیسی ۲', 'زبان ۳': 'زبان انگلیسی ۳', 'زبان': 'زبان انگلیسی ۳', 'انگلیسی ۳': 'زبان انگلیسی ۳',
        'عربی انسانی ۱': 'عربی ۱', 'عربی انسانی ۲': 'عربی ۲', 'عربی انسانی ۳': 'عربی ۳',
        'جغرافیا ایران': 'جغرافیا', 'جغرافیا ۱': 'جغرافیا',
        'زمین شناسی': 'زمین‌شناسی', 'تاریخ معاصر': 'تاریخ معاصر ایران',
        'فارسی': 'فارسی ۳', 'عربی': 'عربی ۳'
    };
    return map[s] || s;
};
// ==========================================================================
// 🛠️ ۴. ابزارهای ظاهری و توابع کمکی (UI & Formatting Utilities)
// ==========================================================================
const UI = {
    toastTimer: null,

    refreshIcons() {
        try {
            if (window.lucide) window.lucide.createIcons();
        } catch (_) {}
    },

    showLoader(text = 'در حال همگام‌سازی قطب‌نما...') {
        const loader = document.getElementById('globalLoader');
        if (!loader) return;
        const txtEl = loader.querySelector('.loader-text');
        if (txtEl) txtEl.innerText = text;
        loader.style.display = 'flex';
        loader.style.opacity = '1';
    },

    hideLoader() {
        const loader = document.getElementById('globalLoader');
        if (!loader) return;
        loader.style.opacity = '0';
        setTimeout(() => { loader.style.display = 'none'; }, 280);
    },

    showToast(msg, type = 'info') {
        const toast = document.getElementById('appToast');
        const txt = document.getElementById('appToastText');
        if (!toast || !txt) return;
        txt.innerText = msg;
        toast.className = `app-toast show ${type}`;
        clearTimeout(this.toastTimer);
        this.toastTimer = setTimeout(() => { toast.classList.remove('show'); }, 3400);
    },

    showAlertBox(boxId, msg, type = 'error') {
        const box = document.getElementById(boxId);
        if (!box) return;
        if (!msg) {
            box.style.display = 'none';
            return;
        }
        box.className = `alert-box ${type === 'error' ? 'alert-error' : 'alert-success'}`;
        box.innerText = msg;
        box.style.display = 'block';
    },

    openModal(modalId) {
        this.closeModals();
        const modal = document.getElementById(modalId);
        if (modal) modal.classList.add('active');
        this.refreshIcons();
    },

    closeModals() {
        document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('active'));
    },

    confirm(title, text, onYesCallback) {
        const titleEl = document.getElementById('confirmModalTitle');
        const textEl = document.getElementById('confirmModalText');
        const yesBtn = document.getElementById('confirmModalYesBtn');
        if (titleEl) titleEl.innerText = title;
        if (textEl) textEl.innerText = text;
        if (yesBtn) {
            yesBtn.onclick = () => {
                this.closeModals();
                if (typeof onYesCallback === 'function') onYesCallback();
            };
        }
        this.openModal('confirmModal');
    },

    setTheme(mode) {
        if (mode === 'dark') {
            document.documentElement.setAttribute('data-theme', 'dark');
            document.body.setAttribute('data-theme', 'dark');
            Storage.set('theme', 'dark');
            document.getElementById('btnThemeDark')?.classList.add('active');
            document.getElementById('btnThemeLight')?.classList.remove('active');
        } else {
            document.documentElement.removeAttribute('data-theme');
            document.body.removeAttribute('data-theme');
            Storage.set('theme', 'light');
            document.getElementById('btnThemeLight')?.classList.add('active');
            document.getElementById('btnThemeDark')?.classList.remove('active');
        }
    },

    toggleDropdown(wrapId, event) {
        if (event) event.stopPropagation();
        const wrap = document.getElementById(wrapId);
        document.querySelectorAll('.custom-select-wrap.open').forEach(w => {
            if (w !== wrap) w.classList.remove('open');
        });
        if (wrap) wrap.classList.toggle('open');
    },

    selectDropdownItem(wrapId, hiddenInputId, labelId, value, itemEl) {
        const input = document.getElementById(hiddenInputId);
        const label = document.getElementById(labelId);
        const wrap = document.getElementById(wrapId);
        if (input) input.value = value;
        if (label) label.innerText = value;
        if (wrap) {
            wrap.querySelectorAll('.custom-select-item').forEach(i => i.classList.remove('selected'));
            if (itemEl) itemEl.classList.add('selected');
            wrap.classList.remove('open');
        }
    },

    copyText(text, btnEl = null) {
        const doFeedback = () => {
            if (btnEl) {
                const origHtml = btnEl.innerHTML;
                btnEl.classList.add('copied');
                btnEl.innerHTML = '<i data-lucide="check" class="icon-sm"></i><span>کپی شد</span>';
                this.refreshIcons();
                setTimeout(() => {
                    btnEl.classList.remove('copied');
                    btnEl.innerHTML = origHtml;
                    this.refreshIcons();
                }, 1800);
            } else {
                this.showToast('در حافظه کپی شد.', 'success');
            }
        };

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(text).then(doFeedback);
        } else {
            const ta = document.createElement('textarea');
            ta.value = text;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            doFeedback();
        }
    },

    toEngDigits(str) {
        if (!str) return '';
        return String(str)
            .replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d))
            .replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d));
    },

    formatMoney(num) {
        return Math.round(Number(num) || 0).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    },

    roundDown100k(amount) {
        return Math.floor((Number(amount) || 0) / 100000) * 100000;
    }
};

// بستن خودکار منوهای کشویی با کلیک بیرون از آن‌ها
document.addEventListener('click', (e) => {
    if (!e.target.closest('.custom-select-wrap')) {
        document.querySelectorAll('.custom-select-wrap.open').forEach(w => w.classList.remove('open'));
    }
});

// ==========================================================================
// 🧭 ۵. مسیریاب تک‌صفحه‌ای (SPA Router)
// جابه‌جایی آنی بین صفحات احراز هویت، ۵ تب اصلی و صفحات پروفایل/فروشگاه بدون رفرش
// ==========================================================================
const Router = {
    showAuthShell(viewName = 'login') {
        AppState.currentShell = 'auth';
        document.getElementById('shell-app').style.display = 'none';
        document.getElementById('shell-auth').style.display = 'flex';
        this.goToAuthView(viewName);
    },

    goToAuthView(viewName) {
        document.querySelectorAll('#shell-auth .auth-view').forEach(v => v.classList.remove('active'));
        const target = document.getElementById(`view-${viewName}`);
        if (target) target.classList.add('active');

        if (viewName === 'register-step2' && window.StoreModule) {
            StoreModule.initStep2View();
        }
        window.scrollTo({ top: 0, behavior: 'smooth' });
        UI.refreshIcons();
    },

    showAppShell(defaultTab = 'home') {
        AppState.currentShell = 'app';
        document.getElementById('shell-auth').style.display = 'none';
        document.getElementById('shell-app').style.display = 'block';
        this.switchMainTab(defaultTab);
    },

    switchMainTab(tabId) {
        AppState.currentTab = tabId;
        AppState.currentSubPage = null;

        // مخفی کردن تمام نماهای داخل پوسته اپ
        document.querySelectorAll('#shell-app .spa-view').forEach(v => v.classList.remove('active'));
        const targetView = document.getElementById(`tab-${tabId}`);
        if (targetView) targetView.classList.add('active');

        // نمایش نوار ناوبری پایینی و فعال‌سازی تب انتخاب‌شده
        const bottomNav = document.getElementById('mainBottomNav');
        if (bottomNav) bottomNav.style.display = 'grid';

        document.querySelectorAll('.bnav-item').forEach(btn => {
            btn.classList.toggle('active', btn.getAttribute('data-tab') === tabId);
        });

        // رندر نمودارها در صورت ورود به تب تحلیل عملکرد
        if (tabId === 'analytics' && window.AnalyticsModule) {
            AnalyticsModule.renderCharts();
        }

        window.scrollTo({ top: 0, behavior: 'smooth' });
        UI.refreshIcons();
    },

    openSubPage(pageName) {
        AppState.currentSubPage = pageName;
        document.querySelectorAll('#shell-app .spa-view').forEach(v => v.classList.remove('active'));

        const targetView = document.getElementById(`view-${pageName}`);
        if (targetView) targetView.classList.add('active');

        // فراخوانی متدهای مربوط به زیرصفحه
        if (pageName === 'profile' && window.ProfileModule) {
            ProfileModule.renderProfileView();
        } else if (pageName === 'store-renew' && window.StoreModule) {
            StoreModule.initRenewView();
        } else if (pageName === 'store-swap' && window.StoreModule) {
            StoreModule.initSwapView();
        }

        window.scrollTo({ top: 0, behavior: 'smooth' });
        UI.refreshIcons();
    }
};

// ==========================================================================
// 🚀 ۶. راه‌انداز مرکزی اپلیکیشن (App Bootstrapper)
// بارگذاری اولیه اطلاعات کاربر پس از ورود و آماده‌سازی تمام ۵ تب
// ==========================================================================
const AppCore = {
    async init() {
        // ۱. اعمال پوسته ذخیره‌شده
        UI.setTheme(Storage.get('theme', 'dark'));
        UI.refreshIcons();

        // ۲. بررسی سشن فعال سوپابیس و وضعیت لاگین کاربر
        try {
            const { data: { session } } = await supabaseClient.auth.getSession();
            if (session) {
                AppState.userAuthToken = session.access_token;
            }

            const savedUserId = Storage.get('qotbnama_user_id');
            const tempRegNid = Storage.get('temp_reg_nid');

            if (savedUserId && session) {
                AppState.userId = savedUserId;
                await this.bootstrapLoggedInUser();
                Router.showAppShell('home');
            } else if (tempRegNid) {
                Router.showAuthShell('register-step2');
            } else {
                Router.showAuthShell('login');
            }
        } catch (err) {
            console.error("Bootstrap Error:", err);
            Router.showAuthShell('login');
        } finally {
            UI.hideLoader();
        }
    },

    async bootstrapLoggedInUser() {
        UI.showLoader('در حال بارگذاری میز کار شما...');
        const uid = String(AppState.userId);
        const uphone = String(AppState.userPhone || uid);

        // تنظیم تاریخ شمسی امروز در هدر خانه و برنامه‌ریزی
        try {
            const todayFa = new Intl.DateTimeFormat('fa-IR', { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date());
            const dateEl1 = document.getElementById('todayShamsiDate');
            const dateEl2 = document.getElementById('todayDateLabel');
            if (dateEl1) dateEl1.innerText = todayFa;
            if (dateEl2) dateEl2.innerText = todayFa;
        } catch (_) {}

        try {
            // دریافت موازی داده‌های پایه از سوپابیس (فقط یک‌بار در ابتدای باز شدن اپ)
            const [stRes, conSubRes, panSubRes, sysRes, repRes, schRes, vipRes, msgRes, exRes, aiRes] = await Promise.all([
                supabaseClient.from('students').select('*').eq('national_id', uid).maybeSingle(),
                supabaseClient.from('subscriptions').select('*').or(`student_nid.eq.${uid},user_phone.eq.${uphone}`).eq('service_category', 'consult').eq('status', 'active'),
                supabaseClient.from('pan_monthly_subs').select('*').eq('phone_number', uphone).eq('status', 'active'),
                supabaseClient.from('system_settings').select('konkur_date').limit(1),
                supabaseClient.from('daily_reports').select('*').eq('chat_id', uid).order('report_date', { ascending: false }),
                supabaseClient.from('ai_schedules').select('*').eq('national_id', uid).eq('status', 'approved').order('target_start_date', { ascending: false }),
                supabaseClient.from('vip_settings').select('*').eq('national_id', uid).maybeSingle(),
                supabaseClient.from('messages').select('*').eq('student_nid', uid).order('created_at', { ascending: false }).limit(20),
                supabaseClient.from('exam_results').select('*').eq('chat_id', uid).eq('status', 'approved').order('created_at', { ascending: true }),
                supabaseClient.from('ai_analyses').select('*').eq('chat_id', uid).order('created_at', { ascending: false })
            ]);

            // ۱. اطلاعات دانش‌آموز و دروس پایه/رشته
            if (stRes.data) {
                AppState.studentData = stRes.data;
                AppState.fullName = stRes.data.full_name || AppState.fullName;
                Storage.set('qotbnama_full_name', AppState.fullName);

                const g = stRes.data.grade || 'دوازدهم';
const m = stRes.data.major || 'تجربی';

// ✅ اول «دوازدهم» و «پشت کنکوری» چک شود تا با «دهم» قاطی نشود
AppState.studentGrade = (g.includes('دوازدهم') || g.includes('پشت') || g.includes('فارغ'))
    ? 'دوازدهم'
    : (g.includes('یازدهم') ? 'یازدهم' : (g.includes('دهم') ? 'دهم' : 'دوازدهم'));

AppState.studentMajor = m.includes('ریاضی') ? 'ریاضی' : (m.includes('انسانی') ? 'انسانی' : 'تجربی');

AppState.globalSubjects = SUBJECTS_DICT[AppState.studentGrade]?.[AppState.studentMajor] || SUBJECTS_DICT['دوازدهم']['تجربی'];
                const streak = stRes.data.wake_streak || 0;
                const sEl1 = document.getElementById('streakCount');
                const sEl2 = document.getElementById('homeStreakCount');
                if (sEl1) sEl1.innerText = streak;
                if (sEl2) sEl2.innerText = streak;
            }

            AppState.globalSubjects = SUBJECTS_DICT[AppState.studentGrade]?.[AppState.studentMajor] || SUBJECTS_DICT['دوازدهم']['تجربی'];

            // نام و حرف اول آواتار در هدر خانه
            const firstName = AppState.fullName.trim().split(' ')[0];
            const greetEl = document.getElementById('greetingText');
            const avatarEl = document.getElementById('avatarInitial');
            if (greetEl) greetEl.innerText = `سلام، ${firstName} عزیز!`;
            if (avatarEl) avatarEl.innerText = firstName.charAt(0) || 'ق';

            // ۲. شمارش معکوس روزهای مانده تا کنکور
            if (sysRes.data && sysRes.data.length > 0 && sysRes.data[0].konkur_date) {
                AppState.konkurDateObj = new Date(sysRes.data[0].konkur_date);
                const diffDays = Math.ceil((AppState.konkurDateObj - new Date()) / (1000 * 3600 * 24));
                if (diffDays > 0) {
                    AppState.konkurDurationMonths = Math.max(1, Math.round((diffDays / 30.41) * 10) / 10);
                    const kEl = document.getElementById('konkurDaysLeft');
                    if (kEl) kEl.innerText = `${diffDays.toLocaleString('fa-IR')} روز تا کنکور`;
                }
            }

            // ۳. بررسی اشتراک مشاوره یا پانسیون ماهانه
            AppState.subscriptions = conSubRes.data || [];
            const panSubs = panSubRes.data || [];
            AppState.isConsultant = AppState.subscriptions.length > 0;
            AppState.hasPansionActive = panSubs.length > 0;

            const tierBadge = document.getElementById('analyticsTierBadge');
            if (AppState.isConsultant) {
                AppState.planType = (AppState.subscriptions[0].service_type || 'vip').toLowerCase();
                if (tierBadge) tierBadge.innerText = `طرح ${AppState.subscriptions[0].service_type}`;
            } else if (AppState.hasPansionActive) {
                AppState.planType = 'pansion_free';
                if (tierBadge) tierBadge.innerText = 'دسترسی رایگان پانسیون';
            }

            // ۴. ذخیره داده‌های کش‌شده برای ماژول‌ها
            AppState.dailyReports = repRes.data || [];
            AppState.completedDates = AppState.dailyReports.map(r => r.report_date);
            AppState.allSchedules = schRes.data || [];
            if (AppState.allSchedules.length > 0) {
                const now = new Date();
                AppState.currentScheduleObj = AppState.allSchedules.find(s => new Date(s.target_start_date) <= now) || AppState.allSchedules[0];
            }
            AppState.vipSettings = vipRes.data || null;
            AppState.messages = msgRes.data || [];
            AppState.examResults = exRes.data || [];
            AppState.aiAnalyses = aiRes.data || [];

            // ۵. راه‌اندازی اولیه تمام ماژول‌های بارگذاری‌شده
            this.renderMessagesModal();
            if (window.ReportModule) ReportModule.init();
            if (window.PlanningModule) PlanningModule.init();
            if (window.AnalyticsModule) AnalyticsModule.init();
            if (window.ToolsModule) ToolsModule.init();
            if (window.ProfileModule) ProfileModule.init();

        } catch (err) {
            console.error("Error loading user workspace:", err);
        } finally {
            UI.hideLoader();
            UI.refreshIcons();
        }
    },

    renderMessagesModal() {
        const msgs = AppState.messages || [];
        const unread = msgs.filter(m => !m.is_read);
        const badge = document.getElementById('msgBadge');
        if (badge) {
            if (unread.length > 0) {
                badge.innerText = unread.length;
                badge.style.display = 'flex';
            } else {
                badge.style.display = 'none';
            }
        }

        const listEl = document.getElementById('messagesListContainer');
        if (!listEl) return;
        if (msgs.length === 0) {
            listEl.innerHTML = '<div style="text-align:center;color:var(--text-muted);font-size:12.5px;padding:20px;">پیام جدیدی در صندوق شما وجود ندارد.</div>';
        } else {
            listEl.innerHTML = msgs.map(m => `
                <div style="background:var(--surface-2);border:1px solid var(--border);border-radius:14px;padding:12px 14px;margin-bottom:8px;">
                    <div style="font-size:13px;font-weight:900;color:var(--primary);margin-bottom:4px;">${m.title || 'پیام سیستم'}</div>
                    <div style="font-size:12px;color:var(--text-main);line-height:1.75;">${m.body || m.content || ''}</div>
                </div>
            `).join('');
        }
    }
};

// شروع خودکار برنامه پس از بارگذاری DOM
window.addEventListener('DOMContentLoaded', () => {
    AppCore.init();
});
