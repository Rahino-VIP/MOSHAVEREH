/* ==========================================================================
   ⏱️ ماژول مستقل تایمر تمرکز سینماتیک و اتاق ایزوله مطالعه (timer.js)
   شامل:
   ۱. پیش‌فرض استاندارد کنکوری: ۹۰ دقیقه مطالعه عمیق + ۱۵ دقیقه استراحت
   ۲. ۳ تم بصری زنده: کهکشان نئونی (بوم ستارگان 60fps)، اقیانوس آرام (موج SVG)، ساعت ورق‌خور
   ۳. استودیو صدای ۴ کاناله ۱۰۰٪ آفلاین (باران، امواج ساحل، امواج آلفای مغزی 40Hz، نویز گرم)
   ۴. سپر ضد حواس‌پرتی (تشخیص خروج از اپ و محاسبه ضریب خلوص تمرکز)
   ۵. تنفس هدایت‌شده ۱۵ ثانیه‌ای قبل از شروع + ذخیره بانک تمرکز روزانه
   ========================================================================== */

const TimerModule = {
    // تنظیمات پیش‌فرض روی ۹۰ دقیقه مطالعه و ۱۵ دقیقه استراحت
    config: {
        studyMins: 90,
        breakMins: 15,
        totalRounds: 1,
        theme: 'eclipse', // 'eclipse' | 'wave' | 'flip'
        activePreset: '90_15',
        soundType: 'rain', // 'rain' | 'ocean' | 'alpha' | 'brown'
        volume: 0.35
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
        zenTimeoutId: null,

        // موتور صوتی Web Audio API
        audioCtx: null,
        gainNode: null,
        activeNodes: [],
        lfoInterval: null,
        isSoundPlaying: false,

        // انیمیشن ستارگان کهکشان
        starAnimId: null,
        stars: []
    },

    activeQuestBlockId: null,

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
    // 🚀 ۱. راه‌اندازی، تزریق رابط کاربری تمام‌صفحه و سنسور ضد حواس‌پرتی
    // ======================================================================
    init() {
        this.injectTimerOverlay();
        this.bindVisibilityShield();
        this.updateToolsCardBadge();
        UI.refreshIcons();
    },

    getTodayFocusStats() {
        const uid = String(AppState.userId || '');
        const todayStr = this.getTodayShamsiStr();
        const allHist = JSON.parse(Storage.get(`qotbnama_focus_hist_${uid}`, '{}')) || {};
        return allHist[todayStr] || { minutes: 0, sessions: 0, pureSessions: 0 };
    },

    recordCompletedFocusMinutes(mins, distractions) {
        const uid = String(AppState.userId || '');
        const todayStr = this.getTodayShamsiStr();
        const key = `qotbnama_focus_hist_${uid}`;
        const allHist = JSON.parse(Storage.get(key, '{}')) || {};

        if (!allHist[todayStr]) {
            allHist[todayStr] = { minutes: 0, sessions: 0, pureSessions: 0 };
        }
        allHist[todayStr].minutes += Math.round(mins);
        allHist[todayStr].sessions += 1;
        if (distractions === 0) allHist[todayStr].pureSessions += 1;

        Storage.set(key, JSON.stringify(allHist));
        this.updateToolsCardBadge();
    },

    updateToolsCardBadge() {
        const st = this.getTodayFocusStats();
        const badgeEl = document.getElementById('pomoTodayTotalBadge');
        if (badgeEl) {
            badgeEl.innerText = `امروز: ${this.toFa(st.minutes)} دقیقه تمرکز`;
        }
    },

    // سنسور تشخیص خروج از صفحه (سپر تعهد مطالعه)
    bindVisibilityShield() {
        document.addEventListener('visibilitychange', () => {
            if (!this.runtime.isRunning || this.runtime.isPaused || this.runtime.phase !== 'study') return;
            if (document.hidden) {
                this.runtime.distractionsCount++;
                this.updatePurityBadge();
            } else {
                UI.showToast(`⚠️ خروج از صفحه ثبت شد (${this.toFa(this.runtime.distractionsCount)} بار). به مدار تمرکز برگرد قهرمان!`, 'error');
            }
        });
    },

    updatePurityBadge() {
        const pill = document.getElementById('pomoPurityBadge');
        if (!pill) return;
        const d = this.runtime.distractionsCount;
        const purity = Math.max(40, 100 - (d * 15));
        pill.className = `pomo-purity-pill ${d > 0 ? 'warn' : ''}`;
        pill.innerHTML = d === 0
            ? `<i data-lucide="shield-check" class="icon-sm"></i><span>سپر تمرکز خالص: ۱۰۰٪ (بدون حواس‌پرتی)</span>`
            : `<i data-lucide="shield-alert" class="icon-sm"></i><span>خلوص تمرکز: ${this.toFa(purity)}٪ (${this.toFa(d)} خروج از صفحه)</span>`;
        UI.refreshIcons();
    },

    // ======================================================================
    // 🎨 ۲. ساخت لایه تمام‌صفحه تایمر سینماتیک
    // ======================================================================
    injectTimerOverlay() {
        let overlay = document.getElementById('immersiveTimerOverlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'immersiveTimerOverlay';
            overlay.className = 'immersive-timer-overlay';
            document.body.appendChild(overlay);
        }

        overlay.innerHTML = `
            <!-- ۱. بوم ستارگان متحرک (تم کهکشان) -->
            <canvas id="pomoStarCanvas" class="pomo-star-canvas"></canvas>

            <!-- ۲. لایه امواج سینوسی زنده (تم اقیانوس) -->
            <div class="pomo-ocean-wrap" id="pomoWaveBg">
                <svg class="pomo-wave-svg" viewBox="0 0 1200 120" preserveAspectRatio="none">
                    <path d="M0,60 C300,110 300,10 600,60 C900,110 900,10 1200,60 L1200,120 L0,120 Z" fill="rgba(99, 152, 137, 0.45)"></path>
                </svg>
                <svg class="pomo-wave-svg wave2" viewBox="0 0 1200 120" preserveAspectRatio="none">
                    <path d="M0,60 C300,10 300,110 600,60 C900,10 900,110 1200,60 L1200,120 L0,120 Z" fill="rgba(45, 95, 83, 0.7)"></path>
                </svg>
            </div>

            <!-- ۳. نوار بالای تایمر -->
            <div class="pomo-top-bar" style="width:100%; max-width:660px; display:flex; justify-content:space-between; align-items:center; z-index:15; flex-wrap:wrap; gap:8px;">
                <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
                    <span class="konkur-pill" id="pomoPhaseBadge" style="background:rgba(119,187,169,0.22); color:#77bba9; font-size:11.5px; padding:4px 10px;">پارت ۱ • مطالعه ۹۰ دقیقه‌ای</span>
                    <span id="pomoTitleDisplay" style="font-size:13.5px; font-weight:900; color:#f1f5f9;">تمرکز عمیق کنکوری</span>
                    <span class="status-pill" id="pomoTodayTotalBadge" style="background:rgba(255,255,255,0.08); color:#cbd5e1; font-size:10.5px;">امروز: ۰ دقیقه</span>
                </div>
                <div style="display:flex; gap:5px; align-items:center;">
                    <button type="button" class="latex-chip" id="btnThemeEclipse" style="background:rgba(119,187,169,0.25);color:#fff;border-color:#77bba9;" onclick="TimerModule.setTheme('eclipse')">کهکشان</button>
                    <button type="button" class="latex-chip" id="btnThemeWave" style="background:rgba(255,255,255,0.08);color:#cbd5e1;border-color:rgba(255,255,255,0.18);" onclick="TimerModule.setTheme('wave')">اقیانوس</button>
                    <button type="button" class="latex-chip" id="btnThemeFlip" style="background:rgba(255,255,255,0.08);color:#cbd5e1;border-color:rgba(255,255,255,0.18);" onclick="TimerModule.setTheme('flip')">ورق‌خور</button>
                    <button type="button" class="action-circle" style="width:34px;height:34px;background:rgba(255,255,255,0.1);color:#fff;border:none;" onclick="TimerModule.toggleFullscreen()" title="تمام‌صفحه">
                        <i data-lucide="maximize-2" class="icon-sm"></i>
                    </button>
                    <button type="button" class="action-circle" style="width:34px;height:34px;background:rgba(239,68,68,0.22);color:#ef4444;border:none;" onclick="TimerModule.closeImmersiveTimer()" title="خروج">
                        <i data-lucide="x" class="icon-sm"></i>
                    </button>
                </div>
            </div>

            <!-- ۴. کشوی تنظیم دستی زمان (مخفی در حالت پیش‌فرض) -->
            <div class="pomo-drawer" id="pomoCustomDrawer">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                    <strong style="font-size:13px; color:#77bba9;">⚙️ تنظیم دلخواه پارت مطالعه و استراحت</strong>
                    <button type="button" class="del-icon-btn" style="width:26px;height:26px;" onclick="TimerModule.toggleCustomDrawer()">
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
                    <i data-lucide="check" class="icon-sm"></i><span>ثبت و اعمال زمان جدید</span>
                </button>
            </div>

            <!-- ۵. بخش مرکزی: ساعت، انیمیشن و نوار انتخاب سریع پارت -->
            <div style="display:flex; flex-direction:column; align-items:center; justify-content:center; z-index:10; width:100%;">
                
                <!-- نوار انتخاب سریع استانداردهای مطالعه -->
                <div class="pomo-preset-bar" id="pomoPresetBar">
                    <button type="button" class="pomo-preset-chip active" data-preset="90_15" onclick="TimerModule.selectPreset(90, 15, 1, '90_15', this)">
                        🎯 ۹۰ / ۱۵ (استاندارد کنکور)
                    </button>
                    <button type="button" class="pomo-preset-chip" data-preset="45_10" onclick="TimerModule.selectPreset(45, 10, 2, '45_10', this)">
                        ⚡ ۴۵ / ۱۰ (دو پارت)
                    </button>
                    <button type="button" class="pomo-preset-chip" data-preset="120_20" onclick="TimerModule.selectPreset(120, 20, 1, '120_20', this)">
                        🔥 ۱۲۰ / ۲۰ (ماراتن تست)
                    </button>
                    <button type="button" class="pomo-preset-chip" onclick="TimerModule.toggleCustomDrawer()">
                        ⚙️ دلخواه
                    </button>
                </div>

                <!-- نمایشگر تم ۱ و ۲ (کهکشان کسوف و اقیانوس) -->
                <div class="eclipse-ring-stage" id="pomoEclipseStage">
                    <div class="pomo-aura-glow"></div>
                    <svg class="eclipse-svg" viewBox="0 0 260 260">
                        <circle class="eclipse-track" cx="130" cy="130" r="116"></circle>
                        <circle class="eclipse-progress" id="pomoRingCircle" cx="130" cy="130" r="116" stroke-dasharray="729" stroke-dashoffset="0"></circle>
                    </svg>
                    <div style="text-align:center; z-index:4;">
                        <div id="pomoMainClock" style="font-size:54px; font-weight:900; letter-spacing:1.5px; line-height:1.1;">۹۰:۰۰</div>
                        <div id="pomoSubStatus" style="font-size:11.5px; color:#94a3b8; font-weight:800; margin-top:6px;">آماده شروع ۹۰ دقیقه تمرکز عمیق</div>
                    </div>
                </div>

                <!-- نمایشگر تم ۳ (ساعت ورق‌خور کلاسیک) -->
                <div class="flip-clock-stage" id="pomoFlipStage">
                    <div class="flip-card-unit" id="pomoFlipMins">۹۰</div>
                    <div style="font-size:44px; font-weight:900; color:#77bba9;">:</div>
                    <div class="flip-card-unit" id="pomoFlipSecs">۰۰</div>
                </div>

                <!-- نشانگر سپر تمرکز خالص -->
                <div id="pomoPurityBadge" class="pomo-purity-pill">
                    <i data-lucide="shield-check" class="icon-sm"></i>
                    <span>سپر تمرکز خالص: ۱۰۰٪ (بدون حواس‌پرتی)</span>
                </div>
            </div>

            <!-- ۶. میکسر صدای محیطی ۴ کاناله (مخفی در حالت پیش‌فرض) -->
            <div class="pomo-sound-mixer" id="pomoSoundMixer">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                    <strong style="font-size:12.5px; color:#77bba9;">🎧 استودیو صدای محیطی تمرکز (آفلاین)</strong>
                    <button type="button" class="del-icon-btn" style="width:24px;height:24px;" onclick="TimerModule.toggleSoundMixer()">
                        <i data-lucide="x" class="icon-sm"></i>
                    </button>
                </div>
                <div class="sound-grid-4">
                    <button type="button" class="sound-opt-btn active" id="sndBtn_rain" onclick="TimerModule.selectAmbientSound('rain')">
                        <i data-lucide="cloud-rain" class="icon-sm"></i><span>باران ملایم</span>
                    </button>
                    <button type="button" class="sound-opt-btn" id="sndBtn_ocean" onclick="TimerModule.selectAmbientSound('ocean')">
                        <i data-lucide="waves" class="icon-sm"></i><span>امواج ساحل</span>
                    </button>
                    <button type="button" class="sound-opt-btn" id="sndBtn_alpha" onclick="TimerModule.selectAmbientSound('alpha')">
                        <i data-lucide="brain" class="icon-sm"></i><span>امواج آلفا (تمرکز)</span>
                    </button>
                    <button type="button" class="sound-opt-btn" id="sndBtn_brown" onclick="TimerModule.selectAmbientSound('brown')">
                        <i data-lucide="coffee" class="icon-sm"></i><span>نویز گرم سالن</span>
                    </button>
                </div>
                <div style="display:flex; align-items:center; gap:10px;">
                    <i data-lucide="volume-2" class="icon-sm" style="color:#77bba9;"></i>
                    <input type="range" min="0.05" max="0.9" step="0.05" value="0.35" style="flex:1;"
                           oninput="TimerModule.setSoundVolume(this.value)">
                    <button type="button" class="latex-chip" id="btnMuteToggle" style="background:rgba(239,68,68,0.2);color:#fca5a5;border:none;" onclick="TimerModule.stopAmbientSound()">
                        خاموش کردن صدا
                    </button>
                </div>
            </div>

            <!-- ۷. لایه تنفس ۱۵ ثانیه‌ای آرام‌سازی ذهن -->
            <div class="pomo-breath-modal" id="pomoBreathOverlay">
                <div style="font-size:14px; font-weight:900; color:#77bba9;">🧘 آماده‌سازی ذهن و کاهش ضربان قلب</div>
                <div class="pomo-breath-orb" id="pomoBreathOrb">دم عمیق...</div>
                <p style="font-size:12px; color:#94a3b8; max-width:280px;">چشمانت را ببند و با ریتم دایره نفس بکش تا ذهنت برای ۹۰ دقیقه تمرکز عمیق آماده شود.</p>
                <button type="button" class="btn-modal-outline" style="max-width:180px; background:rgba(255,255,255,0.08); color:#fff;" onclick="TimerModule.stopBreathingAndStart()">
                    رد کردن و شروع فوری
                </button>
            </div>

            <!-- ۸. نوار کنترل پایین تایمر -->
            <div style="display:flex; gap:10px; align-items:center; justify-content:center; z-index:15; width:100%; flex-wrap:wrap;">
                <button type="button" class="btn-modal-outline" style="width:auto; padding:10px 14px; background:rgba(255,255,255,0.08); color:#fff; border-color:rgba(255,255,255,0.18); font-size:12px;" onclick="TimerModule.startGuidedBreathing()">
                    <i data-lucide="wind" class="icon-sm"></i><span>تنفس آرام‌بخش</span>
                </button>

                <button type="button" id="btnPomoPlayPause" class="btn-primary-full" style="width:auto; min-width:190px; padding:13px 26px; border-radius:99px; font-size:14px;" onclick="TimerModule.togglePlayPause()">
                    <i data-lucide="play" class="icon-sm"></i><span>شروع تمرکز (۹۰ دقیقه)</span>
                </button>

                <button type="button" id="btnPomoAmbient" class="btn-modal-outline" style="width:auto; padding:10px 14px; background:rgba(255,255,255,0.08); color:#fff; border-color:rgba(255,255,255,0.18); font-size:12px;" onclick="TimerModule.toggleSoundMixer()">
                    <i data-lucide="headphones" class="icon-sm"></i><span id="lblAmbientBtn">صدای محیط</span>
                </button>
            </div>
        `;
    },

    // ======================================================================
    // 🎬 ۳. باز کردن تایمر (با پیش‌فرض قطعی ۹۰ دقیقه مطالعه و ۱۵ دقیقه استراحت)
    // ======================================================================
    openImmersiveTimer(title = 'تمرکز عمیق کنکوری', defaultMins = 90) {
        UI.closeModals();
        this.injectTimerOverlay();

        // اگر از دکمه قدیمی index2.html عدد ۴۵ با عنوان عمومی فرستاده شده بود، روی ۹۰ دقیقه استاندارد قفل شود
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

        document.getElementById('pomoTitleDisplay').innerText = title;
        document.getElementById('inpPomoStudyMins').value = this.config.studyMins;
        document.getElementById('inpPomoBreakMins').value = this.config.breakMins;
        document.getElementById('inpPomoRounds').value = this.config.totalRounds;

        const overlay = document.getElementById('immersiveTimerOverlay');
        if (overlay) {
            overlay.classList.add('active');
            overlay.classList.remove('break-phase', 'running', 'zen-idle');
        }

        this.updateToolsCardBadge();
        this.updatePurityBadge();
        this.updateVisuals();
        this.updatePlayButtonLabel();
        this.startStarfieldCanvas();
        this.requestScreenWakeLock();
        UI.refreshIcons();
    },

    selectPreset(studyMins, breakMins, rounds, presetKey, btnEl) {
        if (this.runtime.isRunning) {
            clearInterval(this.runtime.intervalId);
            this.runtime.isRunning = false;
            this.runtime.isPaused = false;
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

        const badge = document.getElementById('pomoPhaseBadge');
        if (badge) {
            badge.innerText = `پارت ۱ از ${this.toFa(rounds)} • مطالعه ${this.toFa(studyMins)} دقیقه‌ای`;
        }
        document.getElementById('pomoSubStatus').innerText = `آماده شروع ${this.toFa(studyMins)} دقیقه تمرکز عمیق`;

        this.updateVisuals();
        this.updatePlayButtonLabel();
    },

    toggleCustomDrawer() {
        const dr = document.getElementById('pomoCustomDrawer');
        if (dr) dr.classList.toggle('open');
    },

    applyCustomSetup() {
        const sMins = Math.max(1, parseInt(document.getElementById('inpPomoStudyMins')?.value, 10) || 90);
        const bMins = Math.max(1, parseInt(document.getElementById('inpPomoBreakMins')?.value, 10) || 15);
        const rounds = Math.max(1, parseInt(document.getElementById('inpPomoRounds')?.value, 10) || 1);

        document.getElementById('pomoCustomDrawer')?.classList.remove('open');
        this.selectPreset(sMins, bMins, rounds, 'custom', null);
        this.startPhase('study', 1);
    },

    // ======================================================================
    // 🧘 ۴. تنفس هدایت‌شده ۱۵ ثانیه‌ای (Box Breathing) قبل از شروع مطالعه
    // ======================================================================
    startGuidedBreathing() {
        const modal = document.getElementById('pomoBreathOverlay');
        const orb = document.getElementById('pomoBreathOrb');
        if (!modal || !orb) return;

        modal.classList.add('active');
        orb.innerText = 'دم عمیق (۴ ثانیه)...';
        orb.style.transform = 'scale(1.45)';

        this.breathStep1 = setTimeout(() => {
            orb.innerText = 'نگه دار (۴ ثانیه)...';
        }, 4000);

        this.breathStep2 = setTimeout(() => {
            orb.innerText = 'بازدم آرام (۴ ثانیه)...';
            orb.style.transform = 'scale(0.95)';
        }, 8000);

        this.breathStep3 = setTimeout(() => {
            orb.innerText = 'ذهن آماده شد! 🚀';
            orb.style.transform = 'scale(1.15)';
        }, 12000);

        this.breathStep4 = setTimeout(() => {
            this.stopBreathingAndStart();
        }, 14000);
    },

    stopBreathingAndStart() {
        clearTimeout(this.breathStep1);
        clearTimeout(this.breathStep2);
        clearTimeout(this.breathStep3);
        clearTimeout(this.breathStep4);
        document.getElementById('pomoBreathOverlay')?.classList.remove('active');
        if (!this.runtime.isRunning) {
            this.startPhase('study', 1);
        }
    },

    // ======================================================================
    // ⏱️ ۵. موتور شمارشگر، چرخه خودکار ۹۰/۱۵ و اتصال به عملیات امروز
    // ======================================================================
    togglePlayPause() {
        if (!this.runtime.isRunning) {
            this.startPhase('study', 1);
            return;
        }
        this.runtime.isPaused = !this.runtime.isPaused;
        const overlay = document.getElementById('immersiveTimerOverlay');
        overlay?.classList.toggle('running', !this.runtime.isPaused);
        this.updatePlayButtonLabel();
    },

    updatePlayButtonLabel() {
        const btn = document.getElementById('btnPomoPlayPause');
        if (!btn) return;
        if (!this.runtime.isRunning) {
            btn.innerHTML = `<i data-lucide="play" class="icon-sm"></i><span>شروع تمرکز (${this.toFa(this.config.studyMins)} دقیقه)</span>`;
        } else if (this.runtime.isPaused) {
            btn.innerHTML = `<i data-lucide="play" class="icon-sm"></i><span>ادامه تایمر</span>`;
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

        const badge = document.getElementById('pomoPhaseBadge');
        const subStatus = document.getElementById('pomoSubStatus');
        if (badge) {
            badge.innerText = `پارت ${this.toFa(roundNum)} از ${this.toFa(this.config.totalRounds)} • ${phase === 'study' ? `مطالعه (${this.toFa(mins)} دقیقه)` : `استراحت (${this.toFa(mins)} دقیقه)`}`;
        }
        if (subStatus) {
            subStatus.innerText = phase === 'study'
                ? 'در حال مطالعه عمیق... گوشی را کنار بگذار'
                : 'تایم ریکاوری! از میز فاصله بگیر و آب بنوش';
        }

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
        const mStr = this.toFa(String(Math.floor(secs / 60)).padStart(2, '0'));
        const sStr = this.toFa(String(secs % 60).padStart(2, '0'));

        const clockEl = document.getElementById('pomoMainClock');
        const fMin = document.getElementById('pomoFlipMins');
        const fSec = document.getElementById('pomoFlipSecs');

        if (clockEl) clockEl.innerText = `${mStr}:${sStr}`;
        if (fMin && fMin.innerText !== mStr) {
            fMin.innerText = mStr;
            fMin.classList.remove('tick-anim');
            void fMin.offsetWidth;
            fMin.classList.add('tick-anim');
        }
        if (fSec) {
            fSec.innerText = sStr;
        }

        const ring = document.getElementById('pomoRingCircle');
        if (ring) {
            const circumference = 729;
            const elapsedRatio = (total - secs) / total;
            ring.style.strokeDashoffset = String(Math.round(circumference * elapsedRatio));
        }

        const wave = document.getElementById('pomoWaveBg');
        if (wave && this.config.theme === 'wave') {
            const pct = Math.min(100, Math.round(((total - secs) / total) * 100));
            wave.style.height = `${pct}%`;
        }
    },

    handlePhaseComplete() {
        clearInterval(this.runtime.intervalId);
        this.playGentleChime();

        if (this.runtime.phase === 'study') {
            // ذخیره دقایق مطالعه در بانک تمرکز امروز
            this.recordCompletedFocusMinutes(this.config.studyMins, this.runtime.distractionsCount);

            if (this.runtime.currentRound < this.config.totalRounds) {
                UI.showToast(`🎉 پارت ${this.toFa(this.runtime.currentRound)} تمام شد! تایم استراحت (${this.toFa(this.config.breakMins)} دقیقه) شروع شد.`, 'success');
                this.startPhase('break', this.runtime.currentRound);
            } else {
                const purity = Math.max(40, 100 - (this.runtime.distractionsCount * 15));
                UI.showToast(`🏆 فوق‌العاده بودی! جلسه مطالعه با خلوص تمرکز ${this.toFa(purity)}٪ تکمیل شد و ۱۵ دقیقه استراحت آغاز گردید.`, 'success');
                if (window.confetti) confetti({ particleCount: 160, spread: 85, origin: { y: 0.6 } });

                // تیک خوردن خودکار پارت در «عملیات امروز» برنامه‌ریزی
                const questId = this.activeQuestBlockId || window.ToolsModule?.activeQuestBlockId;
                if (questId && window.PlanningModule) {
                    window.PlanningModule.toggleQuest(questId);
                    this.activeQuestBlockId = null;
                    if (window.ToolsModule) window.ToolsModule.activeQuestBlockId = null;
                }

                // شروع خودکار ۱۵ دقیقه استراحت پایانی
                this.startPhase('break', this.runtime.currentRound);
            }
        } else {
            if (this.runtime.currentRound < this.config.totalRounds) {
                const nextRound = this.runtime.currentRound + 1;
                UI.showToast(`⚡ استراحت تمام شد! پارت ${this.toFa(nextRound)} مطالعه شروع شد.`, 'info');
                this.startPhase('study', nextRound);
            } else {
                this.runtime.isRunning = false;
                document.getElementById('pomoSubStatus').innerText = 'پارت مطالعه و استراحت کامل شد! خسته نباشی قهرمان 🌟';
                this.updatePlayButtonLabel();
            }
        }
    },

    // ======================================================================
    // 🌌 ۶. تغییر تم‌های بصری و رندر آسمان شب (Starfield Canvas)
    // ======================================================================
    setTheme(themeName) {
        this.config.theme = themeName;
        const eclipseStage = document.getElementById('pomoEclipseStage');
        const flipStage = document.getElementById('pomoFlipStage');
        const waveBg = document.getElementById('pomoWaveBg');

        ['Eclipse', 'Wave', 'Flip'].forEach(t => {
            const btn = document.getElementById(`btnTheme${t}`);
            if (btn) {
                const isAct = t.toLowerCase() === themeName;
                btn.style.background = isAct ? 'rgba(119,187,169,0.25)' : 'rgba(255,255,255,0.08)';
                btn.style.borderColor = isAct ? '#77bba9' : 'rgba(255,255,255,0.18)';
                btn.style.color = isAct ? '#ffffff' : '#cbd5e1';
            }
        });

        if (themeName === 'flip') {
            if (eclipseStage) eclipseStage.style.display = 'none';
            if (flipStage) flipStage.style.display = 'flex';
            if (waveBg) { waveBg.style.opacity = '0.12'; waveBg.style.height = '18%'; }
        } else if (themeName === 'wave') {
            if (eclipseStage) eclipseStage.style.display = 'flex';
            if (flipStage) flipStage.style.display = 'none';
            if (waveBg) { waveBg.style.opacity = '1'; }
        } else {
            if (eclipseStage) eclipseStage.style.display = 'flex';
            if (flipStage) flipStage.style.display = 'none';
            if (waveBg) { waveBg.style.opacity = '0.15'; waveBg.style.height = '12%'; }
        }
        this.updateVisuals();
    },

    startStarfieldCanvas() {
        cancelAnimationFrame(this.runtime.starAnimId);
        const canvas = document.getElementById('pomoStarCanvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');

        const resize = () => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
        };
        resize();

        if (this.runtime.stars.length === 0) {
            for (let i = 0; i < 65; i++) {
                this.runtime.stars.push({
                    x: Math.random() * canvas.width,
                    y: Math.random() * canvas.height,
                    r: Math.random() * 1.7 + 0.4,
                    alpha: Math.random(),
                    speed: (Math.random() * 0.015) + 0.004
                });
            }
        }

        const renderLoop = () => {
            if (!document.getElementById('immersiveTimerOverlay')?.classList.contains('active')) return;
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            this.runtime.stars.forEach(s => {
                s.alpha += s.speed;
                if (s.alpha > 1 || s.alpha < 0.15) s.speed = -s.speed;
                ctx.beginPath();
                ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(226, 232, 240, ${Math.max(0.1, Math.min(1, s.alpha))})`;
                ctx.fill();
            });

            this.runtime.starAnimId = requestAnimationFrame(renderLoop);
        };
        renderLoop();
    },

    // ======================================================================
    // 🎧 ۷. استودیو صدای محیطی ۴ کاناله (Web Audio API - ۱۰۰٪ آفلاین)
    // ======================================================================
    toggleSoundMixer() {
        const mixer = document.getElementById('pomoSoundMixer');
        if (mixer) mixer.classList.toggle('open');
    },

    selectAmbientSound(type) {
        this.config.soundType = type;
        ['rain', 'ocean', 'alpha', 'brown'].forEach(k => {
            document.getElementById(`sndBtn_${k}`)?.classList.toggle('active', k === type);
        });
        this.startAmbientSound(type);
    },

    setSoundVolume(val) {
        this.config.volume = parseFloat(val) || 0.35;
        if (this.runtime.gainNode && this.runtime.audioCtx) {
            this.runtime.gainNode.gain.setTargetAtTime(this.config.volume, this.runtime.audioCtx.currentTime, 0.1);
        }
    },

    startAmbientSound(type) {
        this.stopAmbientSound(false);

        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            const ctx = new AudioCtx();
            const masterGain = ctx.createGain();
            masterGain.gain.setValueAtTime(this.config.volume, ctx.currentTime);
            masterGain.connect(ctx.destination);

            this.runtime.audioCtx = ctx;
            this.runtime.gainNode = masterGain;
            this.runtime.activeNodes = [];

            if (type === 'alpha') {
                // تولید امواج آلفای دوگوشی (Binaural Beats: 200Hz و 210Hz برای ایجاد موج آلفای 10Hz تمرکز عمیق)
                const osc1 = ctx.createOscillator();
                const osc2 = ctx.createOscillator();
                const subGain = ctx.createGain();
                subGain.gain.value = 0.25;

                osc1.type = 'sine';
                osc2.type = 'sine';
                osc1.frequency.value = 200;
                osc2.frequency.value = 210;

                osc1.connect(subGain);
                osc2.connect(subGain);
                subGain.connect(masterGain);

                osc1.start();
                osc2.start();
                this.runtime.activeNodes.push(osc1, osc2);
            } else {
                // تولید بافر نویز طبیعی برای باران، امواج ساحل و نویز گرم
                const bufferSize = 3 * ctx.sampleRate;
                const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
                const output = noiseBuffer.getChannelData(0);
                let lastOut = 0.0;

                for (let i = 0; i < bufferSize; i++) {
                    const white = Math.random() * 2 - 1;
                    if (type === 'rain') {
                        output[i] = (lastOut + (0.06 * white)) / 1.06;
                        lastOut = output[i];
                        output[i] *= 0.35;
                    } else {
                        output[i] = (lastOut + (0.02 * white)) / 1.02;
                        lastOut = output[i];
                        output[i] *= 0.5;
                    }
                }

                const noiseSource = ctx.createBufferSource();
                noiseSource.buffer = noiseBuffer;
                noiseSource.loop = true;

                const filter = ctx.createBiquadFilter();
                filter.type = 'lowpass';
                filter.frequency.value = type === 'rain' ? 1100 : (type === 'ocean' ? 450 : 650);

                noiseSource.connect(filter);
                filter.connect(masterGain);
                noiseSource.start(0);
                this.runtime.activeNodes.push(noiseSource);

                // اگر حالت امواج ساحل است، فرکانس فیلتر با ریتم موج دریا کم و زیاد شود
                if (type === 'ocean') {
                    let phase = 0;
                    this.runtime.lfoInterval = setInterval(() => {
                        if (!this.runtime.audioCtx) return;
                        phase += 0.15;
                        const freq = 380 + Math.sin(phase) * 260;
                        filter.frequency.setTargetAtTime(freq, ctx.currentTime, 0.2);
                    }, 200);
                }
            }

            this.runtime.isSoundPlaying = true;
            const ambBtn = document.getElementById('btnPomoAmbient');
            const ambLbl = document.getElementById('lblAmbientBtn');
            if (ambBtn) ambBtn.style.borderColor = '#77bba9';
            if (ambLbl) ambLbl.innerText = 'صدا: فعال 🔊';
        } catch (_) {}
    },

    stopAmbientSound(closeMixer = true) {
        clearInterval(this.runtime.lfoInterval);
        try {
            (this.runtime.activeNodes || []).forEach(n => { try { n.stop(); } catch (_) {} });
            this.runtime.audioCtx?.close();
        } catch (_) {}
        this.runtime.audioCtx = null;
        this.runtime.isSoundPlaying = false;

        const ambBtn = document.getElementById('btnPomoAmbient');
        const ambLbl = document.getElementById('lblAmbientBtn');
        if (ambBtn) ambBtn.style.borderColor = 'rgba(255,255,255,0.18)';
        if (ambLbl) ambLbl.innerText = 'صدای محیط';
        if (closeMixer) document.getElementById('pomoSoundMixer')?.classList.remove('open');
    },

    playGentleChime() {
        try {
            const ctx = new (window.AudioContext || window.webkitAudioContext)();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(528, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.65);
            gain.gain.setValueAtTime(0.28, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 1.5);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 1.5);
        } catch (_) {}
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

    closeImmersiveTimer() {
        // اگر دانش‌آموز حداقل ۵ دقیقه مطالعه کرده بود و دستی خارج شد، آن دقایق در بانک تمرکز امروزش ذخیره شود
        const focusedMins = Math.floor((this.runtime.sessionFocusedSeconds || 0) / 60);
        if (focusedMins >= 5 && this.runtime.isRunning) {
            this.recordCompletedFocusMinutes(focusedMins, this.runtime.distractionsCount);
            UI.showToast(`${this.toFa(focusedMins)} دقیقه مطالعه در بانک تمرکز امروزت ثبت شد.`, 'info');
        }
        this.runtime.sessionFocusedSeconds = 0;

        clearInterval(this.runtime.intervalId);
        cancelAnimationFrame(this.runtime.starAnimId);
        this.runtime.isRunning = false;
        this.stopAmbientSound(true);
        this.releaseScreenWakeLock();

        if (document.fullscreenElement) {
            document.exitFullscreen?.().catch(() => {});
        }
        document.getElementById('immersiveTimerOverlay')?.classList.remove('active');
    }
};

window.TimerModule = TimerModule;
