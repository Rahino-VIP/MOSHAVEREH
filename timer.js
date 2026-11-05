/* ==========================================================================
   🚂 ماژول مستقل تایمر سینماتیک «اکسپرس شبانه راهینو» (timer.js)
   طراحی اختصاصی و ۱۰۰٪ آفلاین (بدون نیاز به دانلود عکس یا فایل MP3 خارجی):
   ۱. پیش‌فرض استاندارد کنکوری: ۹۰ دقیقه مطالعه عمیق + ۱۵ دقیقه استراحت
   ۲. نمای زنده داخل کوپه قطار (حرکت کوه‌ها و درختان در قاب پنجره، تغییر آسمان از شب به شفق قطبی و طلوع)
   ۳. تشکیل صورت فلکی ستارگان در آسمان پنجره به ازای هر پارت مطالعه تکمیل‌شده
   ۴. میز چوبی هوشمند (چراغ مطالعه گرم، انباشته شدن برگه‌های تست، قطب‌نمای طلایی و استکان چای کمرباریک در استراحت)
   ۵. میکسر صدای ۴ کاناله هم‌زمان (تق‌تق ریل قطار، باران روی شیشه، شومینه هیزم، موج آلفای تمرکز)
   ۶. نقشه ریلی راهینو (پیشروی کیلومتری به سمت ایستگاه دانشگاه هدف)
   ========================================================================== */

const TimerModule = {
    config: {
        studyMins: 90,
        breakMins: 15,
        totalRounds: 1,
        activePreset: '90_15'
    },

    runtime: {
        isRunning: false,
        isPaused: false,
        phase: 'study', // 'study' | 'break'
        currentRound: 1,
        secondsLeft: 90 * 60,
        totalPhaseSeconds: 90 * 60,
        intervalId: null,
        wakeLock: null,
        distractionsCount: 0,
        sessionFocusedSeconds: 0,
        windowAnimId: null,
        raindrops: [],

        // میکسر چندکاناله صوتی (امکان روشن کردن هم‌زمان ریل قطار + باران + آتش)
        audioCtx: null,
        channels: {
            tracks: { active: false, volume: 0.45, nodes: [], timerId: null },
            rain:   { active: false, volume: 0.35, nodes: [], gainNode: null },
            fire:   { active: false, volume: 0.35, nodes: [], timerId: null },
            alpha:  { active: false, volume: 0.20, nodes: [], gainNode: null }
        }
    },

    activeQuestBlockId: null,

    // ایستگاه‌های نقشه ریلی راهینو (۱ دقیقه تمرکز = ۱ کیلومتر پیشروی)
    railwayStations: [
        { km: 0,     title: '۱. ایستگاه مبدأ (شروع سفر)', reward: 'کوپه کلاسیک چوبی + صدای باران' },
        { km: 450,   title: '۲. دره تمرکز عمیق', reward: 'باز شدن صدای ریل و فانوس طلایی (۷.۵ ساعت)' },
        { km: 1800,  title: '۳. گردنه استمرار', reward: 'ظهور شفق قطبی در آسمان پنجره (۳۰ ساعت)' },
        { km: 4500,  title: '۴. دشت تراز و تسلط', reward: 'قطب‌نمای سلطنتی روی میز (۷۵ ساعت)' },
        { km: 9000,  title: '۵. پل بزرگ جمع‌بندی', reward: 'کوپه ویژه رتبه‌برترها (۱۵۰ ساعت)' },
        { km: 15000, title: '۶. ایستگاه دانشگاه هدف', reward: 'فتح قله کنکور (۲۵۰ ساعت مطالعه خالص)' }
    ],

    toFa(val) {
        if (val === null || val === undefined) return '';
        return String(val).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
    },

    getTodayShamsiStr() {
        const d = new Date();
        const shamsi = new Intl.DateTimeFormat('fa-IR', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
        return UI.toEngDigits(shamsi);
    },

    // ======================================================================
    // 🚀 ۱. راه‌اندازی، ذخیره کیلومتر قطار و ستاره‌های آسمان دانش‌آموز
    // ======================================================================
    init() {
        this.injectTrainCabinOverlay();
        this.bindVisibilityShield();
        this.updateCabinStatsUI();
        UI.refreshIcons();
    },

    getTravelerProgress() {
        const uid = String(AppState.userId || '');
        const key = `qotbnama_train_prog_${uid}`;
        const saved = JSON.parse(Storage.get(key, 'null')) || {};
        return {
            totalKm: Number(saved.totalKm) || 0,
            totalTrips: Number(saved.totalTrips) || 0,
            stars: Array.isArray(saved.stars) ? saved.stars : [], // ستاره‌های ساخته‌شده در آسمان پنجره
            todayDate: saved.todayDate || '',
            todayKm: saved.todayDate === this.getTodayShamsiStr() ? (Number(saved.todayKm) || 0) : 0
        };
    },

    addTravelerKilometers(kmAdded, completedFullTrip = false, lessonTitle = 'مطالعه') {
        const uid = String(AppState.userId || '');
        const key = `qotbnama_train_prog_${uid}`;
        const prog = this.getTravelerProgress();
        const todayStr = this.getTodayShamsiStr();

        prog.totalKm += Math.round(kmAdded);
        prog.todayDate = todayStr;
        prog.todayKm = (prog.todayKm || 0) + Math.round(kmAdded);

        if (completedFullTrip) {
            prog.totalTrips += 1;
            // افزودن یک ستاره جدید به صورت فلکی آسمان پنجره (حداکثر ۱۴ ستاره اخیر در قاب)
            prog.stars.push({
                x: Math.round(12 + Math.random() * 76),
                y: Math.round(14 + Math.random() * 42),
                title: lessonTitle,
                date: todayStr
            });
            if (prog.stars.length > 14) prog.stars.shift();
        }

        Storage.set(key, JSON.stringify(prog));
        this.updateCabinStatsUI();
    },

    getDestinationName() {
        const goal = AppState.vipSettings?.goal || AppState.studentData?.goal;
        if (goal && String(goal).trim().length > 2) return String(goal).trim();
        return 'ایستگاه دانشگاه هدف';
    },

    updateCabinStatsUI() {
        const prog = this.getTravelerProgress();
        const dest = this.getDestinationName();

        const kmEl = document.getElementById('trainTotalKmBadge');
        const destEl = document.getElementById('trainTicketDest');
        const todayEl = document.getElementById('trainTicketTodayKm');

        if (kmEl) kmEl.innerText = `${this.toFa(prog.totalKm)} کیلومتر طی‌شده`;
        if (destEl) destEl.innerText = `مقصد: ${dest}`;
        if (todayEl) todayEl.innerText = `امروز: ${this.toFa(prog.todayKm)} کیلومتر (${this.toFa(prog.stars.length)} ستاره در آسمان)`;
    },

    // سنسور سپر تمرکز (تشخیص خروج از صفحه هنگام حرکت قطار)
    bindVisibilityShield() {
        document.addEventListener('visibilitychange', () => {
            if (!this.runtime.isRunning || this.runtime.isPaused || this.runtime.phase !== 'study') return;
            if (document.hidden) {
                this.runtime.distractionsCount++;
                this.updatePurityBadge();
            } else {
                UI.showToast(`⚠️ حواس‌پرتی ثبت شد (${this.toFa(this.runtime.distractionsCount)} بار). قطار تمرکزت رو ترک نکن قهرمان!`, 'error');
            }
        });
    },

    updatePurityBadge() {
        const el = document.getElementById('trainPurityText');
        if (!el) return;
        const d = this.runtime.distractionsCount;
        const purity = Math.max(40, 100 - (d * 15));
        el.innerText = d === 0 ? `خلوص سفر: ۱۰۰٪` : `خلوص سفر: ${this.toFa(purity)}٪`;
        el.style.color = d === 0 ? '#34d399' : '#fbbf24';
    },

    // ======================================================================
    // 🎨 ۲. تزریق گرافیک برداری کوپه قطار، قاب پنجره و میز مطالعه
    // ======================================================================
    injectTrainCabinOverlay() {
        let overlay = document.getElementById('immersiveTimerOverlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'immersiveTimerOverlay';
            overlay.className = 'immersive-timer-overlay';
            document.body.appendChild(overlay);
        }

        overlay.innerHTML = `
            <!-- ۱. نوار بالای کوپه قطار -->
            <div style="width:100%; max-width:460px; display:flex; justify-content:space-between; align-items:center; z-index:15; gap:6px; flex-wrap:wrap;">
                <div style="display:flex; align-items:center; gap:6px;">
                    <span class="konkur-pill" id="pomoPhaseBadge" style="background:rgba(119,187,169,0.22); color:#77bba9; font-size:11px; padding:4px 9px;">🚂 کوپه تمرکز (۹۰ دقیقه)</span>
                    <span id="pomoTitleDisplay" style="font-size:12.5px; font-weight:900; color:#f1f5f9;">اکسپرس شبانه راهینو</span>
                </div>
                <div style="display:flex; gap:6px; align-items:center;">
                    <button type="button" class="latex-chip" style="background:rgba(251,191,36,0.16); color:#fbbf24; border-color:rgba(251,191,36,0.35); font-size:10.5px; padding:4px 9px;" onclick="TimerModule.toggleRailwayMap()">
                        <i data-lucide="map" class="icon-sm" style="width:13px;height:13px;"></i>
                        <span id="trainTotalKmBadge">۰ کیلومتر</span>
                    </button>
                    <button type="button" class="action-circle" style="width:32px;height:32px;background:rgba(255,255,255,0.08);color:#fff;border:none;" onclick="TimerModule.toggleFullscreen()" title="تمام‌صفحه">
                        <i data-lucide="maximize-2" class="icon-sm"></i>
                    </button>
                    <button type="button" class="action-circle" style="width:32px;height:32px;background:rgba(239,68,68,0.22);color:#ef4444;border:none;" onclick="TimerModule.confirmExitTimer()" title="خروج">
                        <i data-lucide="x" class="icon-sm"></i>
                    </button>
                </div>
            </div>

            <!-- ۲. نوار انتخاب سریع زمان پارت (پیش‌فرض روی ۹۰ دقیقه مطالعه و ۱۵ دقیقه استراحت) -->
            <div class="pomo-preset-bar" id="pomoPresetBar">
                <button type="button" class="pomo-preset-chip active" onclick="TimerModule.selectPreset(90, 15, 1, '90_15', this)">
                    🎯 ۹۰ / ۱۵ (استاندارد کنکور)
                </button>
                <button type="button" class="pomo-preset-chip" onclick="TimerModule.selectPreset(60, 10, 1, '60_10', this)">
                    ⚡ ۶۰ / ۱۰ (یک ساعته)
                </button>
                <button type="button" class="pomo-preset-chip" onclick="TimerModule.selectPreset(45, 10, 2, '45_10', this)">
                    🔥 ۴۵ / ۱۰ (دو پارت)
                </button>
                <button type="button" class="pomo-preset-chip" onclick="TimerModule.toggleCustomSheet()">
                    ⚙️ دلخواه
                </button>
            </div>

            <!-- ۳. صحنه اصلی کوپه قطار: قاب پنجره پانوراما + میز چوبی هوشمند -->
            <div class="train-cabin-stage">
                
                <!-- قاب پنجره قطار -->
                <div class="train-window-frame" id="trainWindowSky">
                    <!-- شفق قطبی و طلوع خورشید -->
                    <div class="window-aurora" id="windowAurora"></div>
                    <div class="window-sunrise-glow" id="windowSunrise"></div>

                    <!-- بوم ستاره‌های صورت فلکی و قطرات باران روی شیشه -->
                    <canvas id="trainWindowCanvas" style="position:absolute; inset:0; width:100%; height:100%; z-index:2; pointer-events:none;"></canvas>

                    <!-- ساعت هولوگرافیک در بالای آسمان پنجره -->
                    <div class="window-hud-clock">
                        <div class="hud-time-digits" id="pomoMainClock">۹۰:۰۰</div>
                        <div class="hud-sub-status" id="pomoSubStatus">
                            <span id="pomoStatusText">آماده پانچ بلیت و حرکت قطار</span>
                            <span>•</span>
                            <span id="trainPurityText" style="color:#34d399;">خلوص سفر: ۱۰۰٪</span>
                        </div>
                    </div>

                    <!-- لایه ۱ بیرون پنجره: کوهستان‌های دوردست -->
                    <div class="parallax-layer parallax-mountains">
                        <svg viewBox="0 0 1200 120" preserveAspectRatio="none" style="width:100%; height:100%;">
                            <polygon points="0,120 0,70 90,25 190,80 310,15 430,75 540,35 600,70 690,25 790,80 910,15 1030,75 1140,35 1200,70 1200,120" fill="#0f172a"/>
                            <polygon points="0,120 60,55 150,95 260,40 380,90 490,50 600,120 660,55 750,95 860,40 980,90 1090,50 1200,120" fill="#162238" opacity="0.85"/>
                        </svg>
                    </div>

                    <!-- لایه ۲ بیرون پنجره: جنگل کاج‌های در حال حرکت -->
                    <div class="parallax-layer parallax-trees">
                        <svg viewBox="0 0 1200 60" preserveAspectRatio="none" style="width:100%; height:100%;">
                            <path d="M0,60 L15,20 L30,60 L50,15 L70,60 L95,28 L115,60 L145,12 L170,60 L205,22 L230,60 L265,18 L290,60 L330,25 L355,60 L390,14 L420,60 L455,24 L480,60 L520,16 L550,60 L580,28 L600,60 L615,20 L630,60 L650,15 L670,60 L695,28 L715,60 L745,12 L770,60 L805,22 L830,60 L865,18 L890,60 L930,25 L955,60 L990,14 L1020,60 L1055,24 L1080,60 L1120,16 L1150,60 L1180,28 L1200,60 Z" fill="#070d17"/>
                        </svg>
                    </div>

                    <!-- لایه ۳ بیرون پنجره: تیرهای تلگراف کنار ریل قطار -->
                    <div class="parallax-layer parallax-poles">
                        <svg viewBox="0 0 1200 150" preserveAspectRatio="none" style="width:100%; height:100%;">
                            <g stroke="#0b1320" stroke-width="3">
                                <line x1="150" y1="25" x2="150" y2="150"/><line x1="138" y1="35" x2="162" y2="35"/>
                                <line x1="450" y1="25" x2="450" y2="150"/><line x1="438" y1="35" x2="462" y2="35"/>
                                <line x1="750" y1="25" x2="750" y2="150"/><line x1="738" y1="35" x2="762" y2="35"/>
                                <line x1="1050" y1="25" x2="1050" y2="150"/><line x1="1038" y1="35" x2="1062" y2="35"/>
                            </g>
                        </svg>
                    </div>
                </div>

                <!-- نور گرم چراغ مطالعه روی میز -->
                <div class="lamp-light-cone"></div>

                <!-- میز چوبی کوپه (شامل چراغ مطالعه، برگه‌های تست، قطب‌نمای طلایی و استکان چای استراحت) -->
                <div class="cabin-desk-surface">
                    
                    <!-- سمت راست میز: چراغ مطالعه برنجی کلاسیک -->
                    <svg width="72" height="92" viewBox="0 0 72 92" style="margin-bottom:-4px; overflow:visible;">
                        <ellipse cx="36" cy="86" rx="22" ry="5" fill="#78350f"/>
                        <path d="M36,86 L36,38 Q36,18 20,22" fill="none" stroke="#d97706" stroke-width="4" stroke-linecap="round"/>
                        <path d="M6,28 L34,14 L42,30 L10,38 Z" fill="#0f766e" stroke="#fbbf24" stroke-width="2"/>
                        <circle cx="23" cy="30" r="6" fill="#fef08a" id="deskLampBulb"/>
                    </svg>

                    <!-- مرکز میز: دفتر باز و برگه‌های تستی که با گذشت زمان روی هم جمع می‌شوند -->
                    <div style="display:flex; align-items:flex-end; gap:14px;">
                        <svg width="95" height="44" viewBox="0 0 95 44">
                            <!-- کتاب/دفتر اصلی -->
                            <rect x="6" y="28" width="82" height="10" rx="3" fill="#1e293b" stroke="#639889" stroke-width="1.5"/>
                            <rect x="10" y="22" width="74" height="6" rx="2" fill="#e2e8f0" id="paperStack1"/>
                            <!-- برگه دوم (بعد از ۳۰ دقیقه ظاهر می‌شود) -->
                            <rect x="14" y="15" width="66" height="6" rx="2" fill="#cbd5e1" id="paperStack2" style="opacity:0.2; transition:0.6s;"/>
                            <!-- برگه سوم (بعد از ۶۰ دقیقه ظاهر می‌شود) -->
                            <rect x="18" y="8" width="58" height="6" rx="2" fill="#f8fafc" id="paperStack3" style="opacity:0.15; transition:0.6s;"/>
                        </svg>

                        <!-- قطب‌نمای طلایی راهینو روی میز -->
                        <svg width="42" height="42" viewBox="0 0 44 44" style="margin-bottom:2px;">
                            <circle cx="22" cy="22" r="19" fill="#0f172a" stroke="#fbbf24" stroke-width="2.5"/>
                            <circle cx="22" cy="22" r="15" fill="none" stroke="rgba(119,187,169,0.4)" stroke-width="1" stroke-dasharray="3 2"/>
                            <g id="deskCompassNeedle" style="transform-origin: 22px 22px; transition: transform 1s linear;">
                                <polygon points="22,7 26,22 22,19 18,22" fill="#ef4444"/>
                                <polygon points="22,37 26,22 22,25 18,22" fill="#e2e8f0"/>
                            </g>
                            <circle cx="22" cy="22" r="2.5" fill="#fbbf24"/>
                        </svg>
                    </div>

                    <!-- سمت چپ میز: استکان چای کمرباریک داغ (در تایم استراحت بخار آن فعال و پررنگ می‌شود) -->
                    <svg width="48" height="66" viewBox="0 0 48 66" id="deskTeaCupSvg" style="opacity:0.45; transition:0.6s;">
                        <!-- بخار زنده چای -->
                        <path class="tea-steam-path" d="M20,24 Q15,14 22,6" fill="none" stroke="#e2e8f0" stroke-width="2" stroke-linecap="round"/>
                        <path class="tea-steam-path" d="M28,22 Q33,12 26,4" fill="none" stroke="#e2e8f0" stroke-width="2" stroke-linecap="round" style="animation-delay:1.1s;"/>
                        <!-- نعلبکی و استکان کمرباریک -->
                        <ellipse cx="24" cy="60" rx="18" ry="4" fill="#d9858a"/>
                        <path d="M14,30 L34,30 Q30,44 33,58 L15,58 Q18,44 14,30 Z" fill="rgba(220, 38, 38, 0.78)" stroke="#fbbf24" stroke-width="1.8"/>
                        <path d="M33,36 Q41,36 41,44 Q41,51 32,51" fill="none" stroke="#fbbf24" stroke-width="2"/>
                    </svg>
                </div>

                <!-- بلیت طلایی سفر در پایین میز -->
                <div class="train-ticket-bar">
                    <div style="display:flex; align-items:center; gap:6px; color:#fbbf24; font-weight:900;">
                        <i data-lucide="compass" class="icon-sm"></i>
                        <span id="trainTicketDest">مقصد: ایستگاه دانشگاه هدف</span>
                    </div>
                    <div style="color:#94a3b8; font-weight:800;" id="trainTicketTodayKm">
                        امروز: ۰ کیلومتر
                    </div>
                </div>
            </div>

            <!-- ۴. پنل تنظیم زمان دلخواه -->
            <div class="pomo-popup-sheet" id="pomoCustomSheet">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                    <strong style="font-size:13px; color:#77bba9;">⚙️ تنظیم دلخواه زمان سفر</strong>
                    <button type="button" class="del-icon-btn" style="width:26px;height:26px;" onclick="TimerModule.toggleCustomSheet()">
                        <i data-lucide="x" class="icon-sm"></i>
                    </button>
                </div>
                <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:8px; text-align:center; margin-bottom:12px;">
                    <div>
                        <small style="font-size:10px; color:#94a3b8;">مطالعه (دقیقه)</small>
                        <input type="number" id="inpPomoStudyMins" value="90" min="5" max="180" style="width:100%;background:rgba(0,0,0,0.45);border:1px solid rgba(255,255,255,0.22);color:#fff;padding:8px;border-radius:10px;text-align:center;font-weight:900;margin-top:4px;">
                    </div>
                    <div>
                        <small style="font-size:10px; color:#94a3b8;">استراحت (دقیقه)</small>
                        <input type="number" id="inpPomoBreakMins" value="15" min="2" max="60" style="width:100%;background:rgba(0,0,0,0.45);border:1px solid rgba(255,255,255,0.22);color:#fff;padding:8px;border-radius:10px;text-align:center;font-weight:900;margin-top:4px;">
                    </div>
                    <div>
                        <small style="font-size:10px; color:#94a3b8;">تعداد پارت</small>
                        <input type="number" id="inpPomoRounds" value="1" min="1" max="8" style="width:100%;background:rgba(0,0,0,0.45);border:1px solid rgba(255,255,255,0.22);color:#fff;padding:8px;border-radius:10px;text-align:center;font-weight:900;margin-top:4px;">
                    </div>
                </div>
                <button type="button" class="btn-primary-full" style="padding:10px;" onclick="TimerModule.applyCustomSetup()">
                    <i data-lucide="check" class="icon-sm"></i><span>ثبت و تنظیم بلیت</span>
                </button>
            </div>

            <!-- ۵. پنل میکسر ۴ کاناله صدای کوپه (قابلیت ترکیب هم‌زمان صداها!) -->
            <div class="pomo-popup-sheet" id="pomoSoundSheet">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                    <strong style="font-size:13px; color:#77bba9;">🎧 میکسر صدای کوپه (قابلیت ترکیب هم‌زمان)</strong>
                    <button type="button" class="del-icon-btn" style="width:26px;height:26px;" onclick="TimerModule.toggleSoundMixer()">
                        <i data-lucide="x" class="icon-sm"></i>
                    </button>
                </div>
                <p style="font-size:10.5px; color:#94a3b8; margin-bottom:10px; text-align:right;">می‌توانید چند صدا را هم‌زمان روشن کنید (مثلاً ریتم ریل قطار + باران روی شیشه):</p>

                <div class="sound-mix-row" id="mixRow_tracks">
                    <button type="button" class="link-btn" style="color:#fff; font-size:12px;" onclick="TimerModule.toggleSoundChannel('tracks')">
                        <i data-lucide="train-front" class="icon-sm primary-text"></i>
                        <span>🚂 ریتم حرکت روی ریل قطار</span>
                    </button>
                    <input type="range" min="0.05" max="0.9" step="0.05" value="0.45" style="width:95px;" oninput="TimerModule.setChannelVolume('tracks', this.value)">
                </div>

                <div class="sound-mix-row" id="mixRow_rain">
                    <button type="button" class="link-btn" style="color:#fff; font-size:12px;" onclick="TimerModule.toggleSoundChannel('rain')">
                        <i data-lucide="cloud-rain" class="icon-sm primary-text"></i>
                        <span>🌧️ باران ملایم روی شیشه کوپه</span>
                    </button>
                    <input type="range" min="0.05" max="0.9" step="0.05" value="0.35" style="width:95px;" oninput="TimerModule.setChannelVolume('rain', this.value)">
                </div>

                <div class="sound-mix-row" id="mixRow_fire">
                    <button type="button" class="link-btn" style="color:#fff; font-size:12px;" onclick="TimerModule.toggleSoundChannel('fire')">
                        <i data-lucide="flame" class="icon-sm gold-text"></i>
                        <span>🔥 صدای هیزم و گرمای ایستگاه</span>
                    </button>
                    <input type="range" min="0.05" max="0.9" step="0.05" value="0.35" style="width:95px;" oninput="TimerModule.setChannelVolume('fire', this.value)">
                </div>

                <div class="sound-mix-row" id="mixRow_alpha">
                    <button type="button" class="link-btn" style="color:#fff; font-size:12px;" onclick="TimerModule.toggleSoundChannel('alpha')">
                        <i data-lucide="brain" class="icon-sm indigo-text"></i>
                        <span>🧠 موج آلفای تمرکز عمیق</span>
                    </button>
                    <input type="range" min="0.05" max="0.6" step="0.05" value="0.20" style="width:95px;" oninput="TimerModule.setChannelVolume('alpha', this.value)">
                </div>

                <button type="button" class="btn-danger-soft" style="padding:8px; margin-top:6px;" onclick="TimerModule.stopAllSounds()">
                    <span>خاموش کردن همه صداها</span>
                </button>
            </div>

            <!-- ۶. پنل نقشه ریلی راهینو -->
            <div class="pomo-popup-sheet" id="pomoRailwaySheet">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                    <strong style="font-size:13px; color:#fbbf24;">🗺️ نقشه ریلی قطب‌نما (مسیر صعود شما)</strong>
                    <button type="button" class="del-icon-btn" style="width:26px;height:26px;" onclick="TimerModule.toggleRailwayMap()">
                        <i data-lucide="x" class="icon-sm"></i>
                    </button>
                </div>
                <div id="railwayStationsList"></div>
            </div>

            <!-- ۷. نوار کنترل پایین کوپه -->
            <div style="display:flex; gap:8px; align-items:center; justify-content:center; z-index:15; width:100%; max-width:460px;">
                <button type="button" class="btn-modal-outline" style="width:auto; padding:10px 12px; background:rgba(255,255,255,0.07); color:#fff; border-color:rgba(255,255,255,0.16); font-size:11.5px;" onclick="TimerModule.toggleRailwayMap()">
                    <i data-lucide="map-pin" class="icon-sm"></i><span>ایستگاه‌ها</span>
                </button>

                <button type="button" id="btnPomoPlayPause" class="btn-primary-full" style="flex:1; padding:12px 18px; border-radius:99px; font-size:13.5px;" onclick="TimerModule.togglePlayPause()">
                    <i data-lucide="ticket" class="icon-sm"></i><span>پانچ بلیت و حرکت (۹۰ دقیقه)</span>
                </button>

                <button type="button" id="btnPomoAmbient" class="btn-modal-outline" style="width:auto; padding:10px 12px; background:rgba(255,255,255,0.07); color:#fff; border-color:rgba(255,255,255,0.16); font-size:11.5px;" onclick="TimerModule.toggleSoundMixer()">
                    <i data-lucide="headphones" class="icon-sm"></i><span id="lblAmbientBtn">صدای کوپه</span>
                </button>
            </div>
        `;
    },

    // ======================================================================
    // 🎬 ۳. باز کردن تایمر (پیش‌فرض روی ۹۰ دقیقه مطالعه و ۱۵ دقیقه استراحت)
    // ======================================================================
    openImmersiveTimer(title = 'تمرکز عمیق کنکوری', defaultMins = 90) {
        UI.closeModals();
        this.injectTrainCabinOverlay();

        let targetMins = parseInt(defaultMins, 10) || 90;
        if (title === 'تمرکز عمیق پومودورو' && targetMins === 45) {
            targetMins = 90;
        }

        this.config.studyMins = targetMins;
        this.config.breakMins = targetMins >= 80 ? 15 : 10;
        this.config.totalRounds = 1;

        this.runtime.isRunning = false;
        this.runtime.isPaused = false;
        this.runtime.phase = 'study';
        this.runtime.currentRound = 1;
        this.runtime.secondsLeft = this.config.studyMins * 60;
        this.runtime.totalPhaseSeconds = this.config.studyMins * 60;
        this.runtime.distractionsCount = 0;
        this.runtime.sessionFocusedSeconds = 0;

        document.getElementById('pomoTitleDisplay').innerText = title;
        document.getElementById('inpPomoStudyMins').value = this.config.studyMins;
        document.getElementById('inpPomoBreakMins').value = this.config.breakMins;
        document.getElementById('inpPomoRounds').value = this.config.totalRounds;

        const overlay = document.getElementById('immersiveTimerOverlay');
        if (overlay) {
            overlay.classList.add('active');
            overlay.classList.remove('break-phase', 'running');
        }

        this.updateCabinStatsUI();
        this.updatePurityBadge();
        this.updateVisuals();
        this.updatePlayButtonLabel();
        this.startWindowCanvasLoop();
        this.requestScreenWakeLock();
        UI.refreshIcons();
    },

    selectPreset(studyMins, breakMins, rounds, presetKey, btnEl) {
        if (this.runtime.isRunning) {
            clearInterval(this.runtime.intervalId);
            this.runtime.isRunning = false;
            this.runtime.isPaused = false;
            document.getElementById('immersiveTimerOverlay')?.classList.remove('running');
        }

        this.config.studyMins = studyMins;
        this.config.breakMins = breakMins;
        this.config.totalRounds = rounds;
        this.config.activePreset = presetKey;

        this.runtime.phase = 'study';
        this.runtime.currentRound = 1;
        this.runtime.secondsLeft = studyMins * 60;
        this.runtime.totalPhaseSeconds = studyMins * 60;

        document.getElementById('inpPomoStudyMins').value = studyMins;
        document.getElementById('inpPomoBreakMins').value = breakMins;
        document.getElementById('inpPomoRounds').value = rounds;

        document.querySelectorAll('#pomoPresetBar .pomo-preset-chip').forEach(c => c.classList.remove('active'));
        if (btnEl) btnEl.classList.add('active');

        document.getElementById('pomoPhaseBadge').innerText = `🚂 پارت ۱ از ${this.toFa(rounds)} (${this.toFa(studyMins)} دقیقه)`;
        document.getElementById('pomoStatusText').innerText = `آماده حرکت (${this.toFa(studyMins)} کیلومتر)`;

        this.updateVisuals();
        this.updatePlayButtonLabel();
    },

    toggleCustomSheet() {
        document.getElementById('pomoSoundSheet')?.classList.remove('open');
        document.getElementById('pomoRailwaySheet')?.classList.remove('open');
        document.getElementById('pomoCustomSheet')?.classList.toggle('open');
    },

    applyCustomSetup() {
        const sMins = Math.max(1, parseInt(document.getElementById('inpPomoStudyMins')?.value, 10) || 90);
        const bMins = Math.max(1, parseInt(document.getElementById('inpPomoBreakMins')?.value, 10) || 15);
        const rounds = Math.max(1, parseInt(document.getElementById('inpPomoRounds')?.value, 10) || 1);

        document.getElementById('pomoCustomSheet')?.classList.remove('open');
        this.selectPreset(sMins, bMins, rounds, 'custom', null);
        this.startPhase('study', 1);
    },

    // ======================================================================
    // ⏱️ ۴. موتور حرکت قطار، تغییر آسمان شب به طلوع و ایستگاه استراحت
    // ======================================================================
    togglePlayPause() {
        if (!this.runtime.isRunning) {
            this.playTrainWhistle();
            this.startPhase('study', 1);
            return;
        }
        this.runtime.isPaused = !this.runtime.isPaused;
        const overlay = document.getElementById('immersiveTimerOverlay');
        overlay?.classList.toggle('running', !this.runtime.isPaused);
        document.getElementById('pomoStatusText').innerText = this.runtime.isPaused
            ? '⏸️ توقف موقت در مسیر'
            : (this.runtime.phase === 'study' ? '🚂 در حال پیشروی عمیق...' : '🍵 استراحت در ایستگاه');
        this.updatePlayButtonLabel();
    },

    updatePlayButtonLabel() {
        const btn = document.getElementById('btnPomoPlayPause');
        if (!btn) return;
        if (!this.runtime.isRunning) {
            btn.innerHTML = `<i data-lucide="ticket" class="icon-sm"></i><span>پانچ بلیت و حرکت (${this.toFa(this.config.studyMins)} دقیقه)</span>`;
        } else if (this.runtime.isPaused) {
            btn.innerHTML = `<i data-lucide="play" class="icon-sm"></i><span>ادامه حرکت قطار</span>`;
        } else {
            btn.innerHTML = `<i data-lucide="pause" class="icon-sm"></i><span>توقف موقت</span>`;
        }
        UI.refreshIcons();
    },

    startPhase(phase, roundNum) {
        clearInterval(this.runtime.intervalId);
        this.runtime.phase = phase;
        this.runtime.currentRound = roundNum;
        this.runtime.isRunning = true;
        this.runtime.isPaused = false;

        const mins = phase === 'study' ? this.config.studyMins : this.config.breakMins;
        this.runtime.totalPhaseSeconds = mins * 60;
        this.runtime.secondsLeft = mins * 60;

        const overlay = document.getElementById('immersiveTimerOverlay');
        if (overlay) {
            overlay.classList.toggle('break-phase', phase === 'break');
            overlay.classList.add('running');
        }

        // در تایم استراحت، استکان چای کمرباریک پررنگ و داغ شود و چراغ مطالعه ملایم گردد
        const teaSvg = document.getElementById('deskTeaCupSvg');
        const bulb = document.getElementById('deskLampBulb');
        if (teaSvg) teaSvg.style.opacity = phase === 'break' ? '1' : '0.45';
        if (bulb) bulb.setAttribute('fill', phase === 'break' ? '#64748b' : '#fef08a');

        document.getElementById('pomoPhaseBadge').innerText = phase === 'study'
            ? `🚂 پارت ${this.toFa(roundNum)} از ${this.toFa(this.config.totalRounds)} • در حال حرکت`
            : `🍵 ایستگاه ریکاوری (${this.toFa(mins)} دقیقه استراحت)`;

        document.getElementById('pomoStatusText').innerText = phase === 'study'
            ? 'در حال پیشروی به سمت مقصد...'
            : 'چایت را بنوش و چشم‌هایت را استراحت بده';

        this.updateVisuals();
        this.updatePlayButtonLabel();

        this.runtime.intervalId = setInterval(() => {
            if (this.runtime.isPaused) return;
            this.runtime.secondsLeft--;
            if (this.runtime.phase === 'study') {
                this.runtime.sessionFocusedSeconds++;
            }
            this.updateVisuals();

            if (this.runtime.secondsLeft <= 0) {
                this.handlePhaseComplete();
            }
        }, 1000);
    },

    updateVisuals() {
        const secs = Math.max(0, this.runtime.secondsLeft);
        const total = Math.max(1, this.runtime.totalPhaseSeconds);
        const elapsedRatio = (total - secs) / total;

        const mStr = this.toFa(String(Math.floor(secs / 60)).padStart(2, '0'));
        const sStr = this.toFa(String(secs % 60).padStart(2, '0'));

        const clockEl = document.getElementById('pomoMainClock');
        if (clockEl) clockEl.innerText = `${mStr}:${sStr}`;

        // ۱. چرخش عقربه قطب‌نمای طلایی روی میز
        const needle = document.getElementById('deskCompassNeedle');
        if (needle) {
            const deg = Math.round(elapsedRatio * 360);
            needle.style.transform = `rotate(${deg}deg)`;
        }

        // ۲. انباشته شدن برگه‌های تست روی میز با گذشت زمان (۳۳٪ و ۶۶٪)
        const p2 = document.getElementById('paperStack2');
        const p3 = document.getElementById('paperStack3');
        if (p2) p2.style.opacity = elapsedRatio >= 0.33 ? '1' : '0.2';
        if (p3) p3.style.opacity = elapsedRatio >= 0.66 ? '1' : '0.15';

        // ۳. تغییر اتمسفر آسمان بیرون پنجره (از شب به شفق قطبی فیروزه‌ای و طلوع طلایی در دقیقه ۹۰)
        const aurora = document.getElementById('windowAurora');
        const sunrise = document.getElementById('windowSunrise');
        const sky = document.getElementById('trainWindowSky');

        if (this.runtime.phase === 'study') {
            if (aurora) aurora.style.opacity = (elapsedRatio >= 0.30 && elapsedRatio < 0.85) ? '1' : '0';
            if (sunrise) sunrise.style.opacity = elapsedRatio >= 0.78 ? '1' : '0';
            if (sky) {
                if (elapsedRatio >= 0.82) {
                    sky.style.background = 'linear-gradient(180deg, #0f172a 0%, #312e81 55%, #b45309 100%)';
                } else if (elapsedRatio >= 0.35) {
                    sky.style.background = 'linear-gradient(180deg, #050811 0%, #0d252c 60%, #1e293b 100%)';
                } else {
                    sky.style.background = 'linear-gradient(180deg, #060913 0%, #0f172a 65%, #1e293b 100%)';
                }
            }
        }
    },

    handlePhaseComplete() {
        clearInterval(this.runtime.intervalId);
        this.playTrainWhistle();

        if (this.runtime.phase === 'study') {
            const title = document.getElementById('pomoTitleDisplay')?.innerText || 'مطالعه';
            this.addTravelerKilometers(this.config.studyMins, true, title);
            this.runtime.sessionFocusedSeconds = 0;

            if (this.runtime.currentRound < this.config.totalRounds) {
                UI.showToast(`🚂 به ایستگاه استراحت رسیدیم! (${this.toFa(this.config.breakMins)} دقیقه ریکاوری)`, 'success');
                this.startPhase('break', this.runtime.currentRound);
            } else {
                if (window.confetti) confetti({ particleCount: 150, spread: 85, origin: { y: 0.6 } });
                UI.showToast(`🌟 سفر ${this.toFa(this.config.studyMins)} کیلومتری کامل شد و ۱ ستاره جدید در آسمان قطب‌نما ثبت گردید!`, 'success');

                // تیک زدن خودکار پارت در «عملیات امروز»
                const questId = this.activeQuestBlockId || window.ToolsModule?.activeQuestBlockId;
                if (questId && window.PlanningModule) {
                    window.PlanningModule.toggleQuest(questId);
                    this.activeQuestBlockId = null;
                    if (window.ToolsModule) window.ToolsModule.activeQuestBlockId = null;
                }

                // شروع خودکار ۱۵ دقیقه استراحت با چای داغ
                this.startPhase('break', this.runtime.currentRound);
            }
        } else {
            if (this.runtime.currentRound < this.config.totalRounds) {
                const nextRound = this.runtime.currentRound + 1;
                UI.showToast(`🚂 حرکت مجدد قطار! پارت ${this.toFa(nextRound)} آغاز شد.`, 'info');
                this.startPhase('study', nextRound);
            } else {
                this.runtime.isRunning = false;
                document.getElementById('immersiveTimerOverlay')?.classList.remove('running');
                document.getElementById('pomoStatusText').innerText = 'سفر و ریکاوری کامل شد! خسته نباشی قهرمان 🌟';
                this.updatePlayButtonLabel();
            }
        }
    },

    // ======================================================================
    // ✨ ۵. بوم آسمان پنجره: رسم صورت فلکی ستاره‌های دانش‌آموز و قطرات باران
    // ======================================================================
    startWindowCanvasLoop() {
        cancelAnimationFrame(this.runtime.windowAnimId);
        const canvas = document.getElementById('trainWindowCanvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');

        canvas.width = canvas.clientWidth || 420;
        canvas.height = canvas.clientHeight || 255;

        // ایجاد ۲۵ قطره باران سبک برای مواقعی که صدای باران روشن است
        if (this.runtime.raindrops.length === 0) {
            for (let i = 0; i < 28; i++) {
                this.runtime.raindrops.push({
                    x: Math.random() * canvas.width,
                    y: Math.random() * canvas.height,
                    len: Math.random() * 12 + 8,
                    speed: Math.random() * 4 + 5
                });
            }
        }

        let twinklePhase = 0;
        const render = () => {
            if (!document.getElementById('immersiveTimerOverlay')?.classList.contains('active')) return;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            twinklePhase += 0.04;

            const prog = this.getTravelerProgress();
            const stars = prog.stars || [];

            // ۱. رسم خطوط صورت فلکی بین ستاره‌های ساخته‌شده توسط دانش‌آموز
            if (stars.length > 1) {
                ctx.beginPath();
                ctx.strokeStyle = 'rgba(119, 187, 169, 0.28)';
                ctx.lineWidth = 1;
                stars.forEach((st, idx) => {
                    const sx = (st.x / 100) * canvas.width;
                    const sy = (st.y / 100) * canvas.height;
                    if (idx === 0) ctx.moveTo(sx, sy);
                    else ctx.lineTo(sx, sy);
                });
                ctx.stroke();
            }

            // ۲. رسم تک‌تک ستاره‌های صورت فلکی
            stars.forEach((st, idx) => {
                const sx = (st.x / 100) * canvas.width;
                const sy = (st.y / 100) * canvas.height;
                const alpha = 0.65 + Math.sin(twinklePhase + idx) * 0.35;

                ctx.beginPath();
                ctx.arc(sx, sy, 2.6, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(251, 191, 36, ${alpha})`;
                ctx.fill();
            });

            // ۳. اگر صدای باران روشن است، قطرات باران روی شیشه پنجره ببارند
            if (this.runtime.channels.rain.active) {
                ctx.strokeStyle = 'rgba(186, 230, 253, 0.35)';
                ctx.lineWidth = 1.2;
                this.runtime.raindrops.forEach(r => {
                    ctx.beginPath();
                    ctx.moveTo(r.x, r.y);
                    ctx.lineTo(r.x - 3, r.y + r.len);
                    ctx.stroke();

                    r.y += r.speed;
                    r.x -= 0.8;
                    if (r.y > canvas.height) {
                        r.y = -10;
                        r.x = Math.random() * canvas.width;
                    }
                });
            }

            this.runtime.windowAnimId = requestAnimationFrame(render);
        };
        render();
    },

    // ======================================================================
    // 🎧 ۶. میکسر صوتی چندکاناله کوپه (ریتم واقعی تق‌تق ریل قطار + باران + آتش + آلفا)
    // ======================================================================
    ensureAudioContext() {
        if (!this.runtime.audioCtx) {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            this.runtime.audioCtx = new AudioCtx();
        }
        if (this.runtime.audioCtx.state === 'suspended') {
            this.runtime.audioCtx.resume();
        }
        return this.runtime.audioCtx;
    },

    toggleSoundMixer() {
        document.getElementById('pomoCustomSheet')?.classList.remove('open');
        document.getElementById('pomoRailwaySheet')?.classList.remove('open');
        document.getElementById('pomoSoundSheet')?.classList.toggle('open');
    },

    toggleSoundChannel(chName) {
        const ch = this.runtime.channels[chName];
        if (!ch) return;

        if (ch.active) {
            this.stopChannel(chName);
        } else {
            this.startChannel(chName);
        }
        this.updateSoundButtonsUI();
    },

    setChannelVolume(chName, val) {
        const ch = this.runtime.channels[chName];
        if (!ch) return;
        ch.volume = parseFloat(val) || 0.35;
        if (ch.gainNode && this.runtime.audioCtx) {
            ch.gainNode.gain.setTargetAtTime(ch.volume, this.runtime.audioCtx.currentTime, 0.1);
        }
    },

    startChannel(chName) {
        this.stopChannel(chName);
        const ctx = this.ensureAudioContext();
        const ch = this.runtime.channels[chName];
        ch.active = true;

        if (chName === 'tracks') {
            // 🚂 شبیه‌سازی ریتم واقعی چرخ‌های قطار روی درز ریل‌ها (تق-تق... تق-تق...)
            const playTrackBeat = () => {
                if (!ch.active || !this.runtime.audioCtx) return;
                const now = ctx.currentTime;

                const triggerClack = (timeOffset, freq) => {
                    const osc = ctx.createOscillator();
                    const g = ctx.createGain();
                    osc.type = 'triangle';
                    osc.frequency.setValueAtTime(freq, now + timeOffset);
                    osc.frequency.exponentialRampToValueAtTime(32, now + timeOffset + 0.085);

                    g.gain.setValueAtTime(ch.volume * 0.55, now + timeOffset);
                    g.gain.exponentialRampToValueAtTime(0.001, now + timeOffset + 0.09);

                    osc.connect(g);
                    g.connect(ctx.destination);
                    osc.start(now + timeOffset);
                    osc.stop(now + timeOffset + 0.095);
                };

                // ریتم ۴ ضربه‌ای واگن روی ریل: تق-تق (مکث کوتاه) تق-تق
                triggerClack(0.0, 95);
                triggerClack(0.16, 82);
                triggerClack(0.48, 90);
                triggerClack(0.64, 78);
            };

            playTrackBeat();
            ch.timerId = setInterval(playTrackBeat, 1650);
        }
        else if (chName === 'rain' || chName === 'fire') {
            const bufferSize = 2 * ctx.sampleRate;
            const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
            const out = buffer.getChannelData(0);
            let last = 0;

            for (let i = 0; i < bufferSize; i++) {
                const white = Math.random() * 2 - 1;
                out[i] = (last + (0.04 * white)) / 1.04;
                last = out[i];
                out[i] *= 0.4;
            }

            const src = ctx.createBufferSource();
            src.buffer = buffer;
            src.loop = true;

            const filter = ctx.createBiquadFilter();
            filter.type = 'lowpass';
            filter.frequency.value = chName === 'rain' ? 1050 : 380;

            const gain = ctx.createGain();
            gain.gain.value = ch.volume;

            src.connect(filter);
            filter.connect(gain);
            gain.connect(ctx.destination);
            src.start();

            ch.nodes = [src];
            ch.gainNode = gain;
        }
        else if (chName === 'alpha') {
            const osc1 = ctx.createOscillator();
            const osc2 = ctx.createOscillator();
            const gain = ctx.createGain();
            gain.gain.value = ch.volume * 0.35;

            osc1.frequency.value = 200;
            osc2.frequency.value = 210; // ایجاد موج آلفای ۱۰ هرتز تمرکز
            osc1.connect(gain);
            osc2.connect(gain);
            gain.connect(ctx.destination);

            osc1.start();
            osc2.start();
            ch.nodes = [osc1, osc2];
            ch.gainNode = gain;
        }
    },

    stopChannel(chName) {
        const ch = this.runtime.channels[chName];
        if (!ch) return;
        ch.active = false;
        clearInterval(ch.timerId);
        (ch.nodes || []).forEach(n => { try { n.stop(); } catch (_) {} });
        ch.nodes = [];
        ch.gainNode = null;
    },

    stopAllSounds() {
        ['tracks', 'rain', 'fire', 'alpha'].forEach(k => this.stopChannel(k));
        this.updateSoundButtonsUI();
    },

    updateSoundButtonsUI() {
        let anyActive = false;
        ['tracks', 'rain', 'fire', 'alpha'].forEach(k => {
            const isAct = this.runtime.channels[k].active;
            if (isAct) anyActive = true;
            document.getElementById(`mixRow_${k}`)?.classList.toggle('active', isAct);
        });

        const ambBtn = document.getElementById('btnPomoAmbient');
        const ambLbl = document.getElementById('lblAmbientBtn');
        if (ambBtn) ambBtn.style.borderColor = anyActive ? '#77bba9' : 'rgba(255,255,255,0.16)';
        if (ambLbl) ambLbl.innerText = anyActive ? 'صدا: روشن 🔊' : 'صدای کوپه';
    },

    // صدای سوت ملایم و اصیل قطار هنگام شروع حرکت و رسیدن به ایستگاه
    playTrainWhistle() {
        try {
            const ctx = this.ensureAudioContext();
            const now = ctx.currentTime;
            const osc1 = ctx.createOscillator();
            const osc2 = ctx.createOscillator();
            const gain = ctx.createGain();

            osc1.type = 'sine';
            osc2.type = 'triangle';
            osc1.frequency.setValueAtTime(440, now);
            osc2.frequency.setValueAtTime(554.37, now); // فاصله سوم بزرگ (آکورد سوت قطار کلاسیک)

            gain.gain.setValueAtTime(0.01, now);
            gain.gain.linearRampToValueAtTime(0.18, now + 0.2);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 1.4);

            osc1.connect(gain);
            osc2.connect(gain);
            gain.connect(ctx.destination);

            osc1.start(now);
            osc2.start(now);
            osc1.stop(now + 1.45);
            osc2.stop(now + 1.45);
        } catch (_) {}
    },

    // ======================================================================
    // 🗺️ ۷. نقشه ریلی راهینو و خروج ایمن
    // ======================================================================
    toggleRailwayMap() {
        document.getElementById('pomoCustomSheet')?.classList.remove('open');
        document.getElementById('pomoSoundSheet')?.classList.remove('open');
        const sheet = document.getElementById('pomoRailwaySheet');
        if (!sheet) return;

        const isOpen = sheet.classList.toggle('open');
        if (isOpen) {
            const prog = this.getTravelerProgress();
            const listEl = document.getElementById('railwayStationsList');
            if (listEl) {
                listEl.innerHTML = this.railwayStations.map((st, idx) => {
                    const reached = prog.totalKm >= st.km;
                    const nextSt = this.railwayStations[idx + 1];
                    const isCurrent = reached && (!nextSt || prog.totalKm < nextSt.km);

                    return `
                        <div class="railway-station-item ${reached ? 'reached' : ''} ${isCurrent ? 'current' : ''}">
                            <div style="font-size:18px;">${isCurrent ? '🚂' : (reached ? '✅' : '🔒')}</div>
                            <div style="flex:1;">
                                <div style="display:flex; justify-content:space-between; font-size:12px; font-weight:900; color:#fff;">
                                    <span>${st.title}</span>
                                    <span style="color:#fbbf24;">${this.toFa(st.km)} کیلومتر</span>
                                </div>
                                <small style="font-size:10.5px; color:#94a3b8;">پاداش: ${st.reward}</small>
                            </div>
                        </div>
                    `;
                }).join('');
            }
        }
    },

    async requestScreenWakeLock() {
        try {
            if ('wakeLock' in navigator) {
                this.runtime.wakeLock = await navigator.wakeLock.request('screen');
            }
        } catch (_) {}
    },

    releaseScreenWakeLock() {
        try {
            if (this.runtime.wakeLock) {
                this.runtime.wakeLock.release();
                this.runtime.wakeLock = null;
            }
        } catch (_) {}
    },

    toggleFullscreen() {
        const overlay = document.getElementById('immersiveTimerOverlay');
        if (!document.fullscreenElement) {
            overlay?.requestFullscreen?.().catch(() => {});
        } else {
            document.exitFullscreen?.().catch(() => {});
        }
    },

    confirmExitTimer() {
        const focusedMins = Math.floor((this.runtime.sessionFocusedSeconds || 0) / 60);
        if (this.runtime.isRunning && this.runtime.phase === 'study' && focusedMins >= 5) {
            this.addTravelerKilometers(focusedMins, false);
            UI.showToast(`${this.toFa(focusedMins)} کیلومتر پیشروی امروز در نقشه ریلی شما ثبت شد.`, 'info');
        }
        this.closeImmersiveTimer();
    },

    closeImmersiveTimer() {
        this.runtime.sessionFocusedSeconds = 0;
        clearInterval(this.runtime.intervalId);
        cancelAnimationFrame(this.runtime.windowAnimId);
        this.runtime.isRunning = false;
        this.stopAllSounds();
        this.releaseScreenWakeLock();

        if (document.fullscreenElement) {
            document.exitFullscreen?.().catch(() => {});
        }
        document.getElementById('immersiveTimerOverlay')?.classList.remove('active', 'running', 'break-phase');
    }
};

window.TimerModule = TimerModule;
