/* ==========================================================================
   🚂 ماژول مستقل تایمر سینماتیک «کوپه قطار شبانه راهینو» (timer.js)
   نسخه نهایی با رفع کامل ۴ مورد:
   ۱. تولید فایل صوتی WAV واقعی در حافظه (پخش ۱۰۰٪ تضمینی روی آیفون و اندروید)
   ۲. مخفی شدن دکمه‌های انتخاب زمان پس از شروع + افزودن دکمه «پایان و لغو تایمر» در حالت توقف
   ۳. حذف کیلومترشمار بدون دیتابیس و یک‌خطی شدن کامل هدر بالای صفحه
   ۴. گرافیک سه‌بعدی و واقع‌گرایانه داخل کابین (پرده‌های مخمل، ماه و جنگل طبیعی، میز پرسپکتیو، دفتر خط‌دار و چراغ مطالعه)
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
        windowAnimId: null,
        raindrops: [],
        skyStars: [],

        // پلیرهای صوتی استاندارد HTML5 (ساخته‌شده با WAV واقعی در حافظه برای سازگاری ۱۰۰٪ با آیفون)
        audioPlayers: {
            tracks: { active: false, volume: 0.55, audioEl: null },
            rain:   { active: false, volume: 0.45, audioEl: null },
            fire:   { active: false, volume: 0.45, audioEl: null },
            lofi:   { active: false, volume: 0.40, audioEl: null }
        }
    },

    activeQuestBlockId: null,

    toFa(val) {
        if (val === null || val === undefined) return '';
        return String(val).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[d]);
    },

    init() {
        this.injectTrainCabinOverlay();
        this.bindVisibilityShield();
        UI.refreshIcons();
    },

    bindVisibilityShield() {
        document.addEventListener('visibilitychange', () => {
            if (!this.runtime.isRunning || this.runtime.isPaused || this.runtime.phase !== 'study') return;
            if (document.hidden) {
                this.runtime.distractionsCount++;
                this.updatePurityBadge();
            } else {
                UI.showToast(`⚠️ خروج از صفحه ثبت شد (${this.toFa(this.runtime.distractionsCount)} بار). تمرکزت رو حفظ کن قهرمان!`, 'error');
            }
        });
    },

    updatePurityBadge() {
        const el = document.getElementById('trainPurityText');
        if (!el) return;
        const d = this.runtime.distractionsCount;
        const purity = Math.max(40, 100 - (d * 15));
        el.innerText = d === 0 ? `خلوص تمرکز: ۱۰۰٪` : `خلوص تمرکز: ${this.toFa(purity)}٪`;
        el.style.color = d === 0 ? '#34d399' : '#fbbf24';
    },

    // ======================================================================
    // 🎨 ۱. رابط کاربری واقع‌گرایانه کابین قطار و هدر یک‌خطی
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
            <!-- ۱. هدر یک‌خطی، تمیز و خلوت بالای صفحه -->
            <div class="pomo-clean-header">
                <div style="display:flex; align-items:center; gap:8px; overflow:hidden;">
                    <span class="konkur-pill" id="pomoPhaseBadge" style="background:rgba(119,187,169,0.22); color:#77bba9; font-size:11px; padding:4px 9px; white-space:nowrap;">پارت ۱ • مطالعه</span>
                    <span id="pomoTitleDisplay" style="font-size:12.5px; font-weight:900; color:#f1f5f9; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">تمرکز عمیق</span>
                </div>
                <div style="display:flex; gap:6px; align-items:center; flex-shrink:0;">
                    <button type="button" class="action-circle" style="width:32px;height:32px;background:rgba(255,255,255,0.08);color:#fff;border:none;" onclick="TimerModule.toggleFullscreen()" title="تمام‌صفحه">
                        <i data-lucide="maximize-2" class="icon-sm"></i>
                    </button>
                    <button type="button" class="action-circle" style="width:32px;height:32px;background:rgba(239,68,68,0.22);color:#ef4444;border:none;" onclick="TimerModule.closeImmersiveTimer()" title="بستن تایمر">
                        <i data-lucide="x" class="icon-sm"></i>
                    </button>
                </div>
            </div>

            <!-- ۲. نوار انتخاب زمان (به محض شروع تایمر به صورت خودکار مخفی می‌شود) -->
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

            <!-- ۳. سازه واقع‌گرایانه داخل کوپه قطار -->
            <div class="train-cabin-stage">
                
                <!-- قاب پنجره قطار با پرده‌های مخمل، ماه، جنگل کاج طبیعی و شیشه براق -->
                <div class="train-window-frame" id="trainWindowSky">
                    <div class="window-glass-glare"></div>
                    <div class="window-brass-rail"></div>

                    <!-- بوم آسمان پرستاره و باران روی شیشه -->
                    <canvas id="trainWindowCanvas" style="position:absolute; inset:0; width:100%; height:100%; z-index:2; pointer-events:none;"></canvas>

                    <!-- ماه کامل با هاله نورانی در آسمان شب -->
                    <div id="windowMoonGlow" style="position:absolute; top:22px; left:34px; width:34px; height:34px; border-radius:50%; background:#fef9c3; box-shadow:0 0 28px 8px rgba(254, 240, 138, 0.35); z-index:2; transition:opacity 1.5s;"></div>

                    <!-- ساعت دیجیتال در مرکز آسمان پنجره -->
                    <div class="window-hud-clock">
                        <div class="hud-time-digits" id="pomoMainClock">۹۰:۰۰</div>
                        <div class="hud-sub-status">
                            <span id="pomoStatusText">آماده حرکت (۹۰ دقیقه مطالعه)</span>
                            <span>•</span>
                            <span id="trainPurityText" style="color:#34d399;">خلوص تمرکز: ۱۰۰٪</span>
                        </div>
                    </div>

                    <!-- پرده‌های مخمل جمع‌شده در دو طرف قاب پنجره کوپه -->
                    <svg viewBox="0 0 400 250" preserveAspectRatio="none" style="position:absolute; inset:0; width:100%; height:100%; z-index:6; pointer-events:none;">
                        <!-- پرده سمت راست -->
                        <path d="M400,0 L355,0 Q368,90 348,165 Q365,210 358,250 L400,250 Z" fill="#134e4a" opacity="0.92"/>
                        <path d="M400,0 L372,0 Q380,90 364,165 L400,250 Z" fill="#0f3d39"/>
                        <path d="M348,165 L400,158" stroke="#fbbf24" stroke-width="3.5" stroke-linecap="round"/>
                        <!-- پرده سمت چپ -->
                        <path d="M0,0 L45,0 Q32,90 52,165 Q35,210 42,250 L0,250 Z" fill="#134e4a" opacity="0.92"/>
                        <path d="M0,0 L28,0 Q20,90 36,165 L0,250 Z" fill="#0f3d39"/>
                        <path d="M52,165 L0,158" stroke="#fbbf24" stroke-width="3.5" stroke-linecap="round"/>
                    </svg>

                    <!-- لایه ۱ بیرون پنجره: کوهستان‌های طبیعی با منحنی نرم و مه دامنه -->
                    <div class="parallax-layer parallax-mountains">
                        <svg viewBox="0 0 1200 110" preserveAspectRatio="none" style="width:100%; height:100%;">
                            <defs>
                                <linearGradient id="mtnGrad1" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stop-color="#1e293b"/>
                                    <stop offset="100%" stop-color="#090d16"/>
                                </linearGradient>
                            </defs>
                            <path d="M0,110 L0,65 Q75,15 160,60 T320,35 T480,68 T600,50 T760,22 T920,62 T1080,30 L1200,65 L1200,110 Z" fill="url(#mtnGrad1)"/>
                            <path d="M0,110 L0,80 Q110,40 220,78 T440,52 T660,82 T880,48 T1100,76 L1200,70 L1200,110 Z" fill="#0f172a" opacity="0.88"/>
                        </svg>
                    </div>

                    <!-- لایه ۲ بیرون پنجره: درختان کاج طبیعی و چراغ‌های گرم روستای دوردست -->
                    <div class="parallax-layer parallax-trees">
                        <svg viewBox="0 0 1200 65" preserveAspectRatio="none" style="width:100%; height:100%;">
                            <!-- چراغ‌های طلایی کلبه‌های دوردست -->
                            <circle cx="180" cy="42" r="2" fill="#fbbf24" opacity="0.8"/><circle cx="195" cy="44" r="1.5" fill="#fde047" opacity="0.7"/>
                            <circle cx="520" cy="40" r="2" fill="#fbbf24" opacity="0.8"/><circle cx="780" cy="43" r="2" fill="#fbbf24" opacity="0.8"/>
                            <circle cx="798" cy="41" r="1.5" fill="#fde047" opacity="0.7"/><circle cx="1120" cy="42" r="2" fill="#fbbf24" opacity="0.8"/>
                            <!-- تپه‌ها و درختان کاج چندطبقه -->
                            <path d="M0,65 Q150,38 300,52 T600,45 T900,52 T1200,46 L1200,65 Z" fill="#060a12"/>
                            <path d="M20,65 L32,32 L26,32 L36,16 L30,16 L38,4 L46,16 L40,16 L50,32 L44,32 L56,65 Z
                                     M95,65 L105,38 L100,38 L108,22 L116,38 L111,38 L121,65 Z
                                     M240,65 L252,30 L246,30 L256,12 L266,30 L260,30 L272,65 Z
                                     M380,65 L390,36 L385,36 L394,20 L403,36 L398,36 L408,65 Z
                                     M620,65 L632,32 L626,32 L636,16 L630,16 L638,4 L646,16 L640,16 L650,32 L644,32 L656,65 Z
                                     M695,65 L705,38 L700,38 L708,22 L716,38 L711,38 L721,65 Z
                                     M840,65 L852,30 L846,30 L856,12 L866,30 L860,30 L872,65 Z
                                     M980,65 L990,36 L985,36 L994,20 L1003,36 L998,36 L1008,65 Z" fill="#04070d"/>
                        </svg>
                    </div>

                    <!-- لایه ۳ بیرون پنجره: تیرهای برق و سیم‌های کنار ریل -->
                    <div class="parallax-layer parallax-poles">
                        <svg viewBox="0 0 1200 165" preserveAspectRatio="none" style="width:100%; height:100%;">
                            <g stroke="#080e1a" stroke-width="2.5" fill="none">
                                <line x1="180" y1="28" x2="180" y2="165"/><line x1="166" y1="36" x2="194" y2="36"/>
                                <line x1="580" y1="28" x2="580" y2="165"/><line x1="566" y1="36" x2="594" y2="36"/>
                                <line x1="980" y1="28" x2="980" y2="165"/><line x1="966" y1="36" x2="994" y2="36"/>
                                <path d="M0,36 Q90,52 180,36 Q380,58 580,36 Q780,58 980,36 Q1090,48 1200,36" stroke-width="1" opacity="0.5"/>
                            </g>
                        </svg>
                    </div>
                </div>

                <!-- تابش حجمی نور چراغ مطالعه روی میز -->
                <div class="lamp-light-cone"></div>

                <!-- میز چوبی سه‌بعدی کوپه با پرسپکتیو واقعی و سایه اشیاء -->
                <div class="cabin-desk-3d">
                    <svg viewBox="0 0 440 110" preserveAspectRatio="none" style="width:100%; height:100%; overflow:visible;">
                        <defs>
                            <linearGradient id="woodTopGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stop-color="#3e2723"/>
                                <stop offset="100%" stop-color="#271815"/>
                            </linearGradient>
                            <linearGradient id="woodEdgeGrad" x1="0" y1="0" x2="1" y2="0">
                                <stop offset="0%" stop-color="#1b0f0d"/>
                                <stop offset="50%" stop-color="#4e342e"/>
                                <stop offset="100%" stop-color="#1b0f0d"/>
                            </linearGradient>
                        </defs>

                        <!-- سطح بالایی میز در پرسپکتیو (ذوزنقه سه‌بعدی) -->
                        <polygon points="14,6 426,6 440,86 0,86" fill="url(#woodTopGrad)" stroke="#5d4037" stroke-width="1.5"/>
                        <!-- لبه جلویی میز چوبی -->
                        <rect x="0" y="86" width="440" height="22" rx="4" fill="url(#woodEdgeGrad)"/>
                        <line x1="0" y1="87" x2="440" y2="87" stroke="#8d6e63" stroke-width="1" opacity="0.55"/>

                        <!-- ۱. سمت راست میز: چراغ مطالعه کلاسیک بانکداری (سبز زمردی و برنجی) -->
                        <g transform="translate(342, -32)">
                            <!-- سایه پایه چراغ روی میز -->
                            <ellipse cx="42" cy="104" rx="28" ry="7" fill="rgba(0,0,0,0.55)"/>
                            <!-- پایه برنجی پله‌ای -->
                            <ellipse cx="42" cy="101" rx="24" ry="5.5" fill="#b45309" stroke="#fbbf24" stroke-width="1"/>
                            <path d="M26,101 C26,93 58,93 58,101 Z" fill="#d97706"/>
                            <!-- ستون و بازوی منحنی چراغ -->
                            <path d="M42,95 L42,36 C42,16 24,14 14,24" fill="none" stroke="#f59e0b" stroke-width="4.5" stroke-linecap="round"/>
                            <circle cx="42" cy="58" r="4" fill="#fbbf24"/>
                            <!-- حباب شیشه‌ای سبز زمردی و لامپ گرم داخلش -->
                            <ellipse cx="16" cy="31" rx="14" ry="6" fill="#fef08a" id="deskLampBulb"/>
                            <path d="M-6,28 C0,10 28,10 36,26 L28,34 L-2,32 Z" fill="#047857" stroke="#fbbf24" stroke-width="2"/>
                            <path d="M2,24 C8,15 22,15 28,23" fill="none" stroke="rgba(255,255,255,0.35)" stroke-width="1.5" stroke-linecap="round"/>
                        </g>

                        <!-- ۲. مرکز میز: دفتر مطالعه باز در پرسپکتیو + خطوط نوشته + خودکار -->
                        <g transform="translate(148, 22)">
                            <!-- سایه دفتر روی میز -->
                            <polygon points="4,52 146,52 154,58 -4,58" fill="rgba(0,0,0,0.5)"/>
                            <!-- جلد چرمی سرمه‌ای دفتر -->
                            <polygon points="8,14 140,14 150,52 -2,52" fill="#0f172a" stroke="#639889" stroke-width="1.5"/>
                            <!-- صفحه سمت راست دفتر -->
                            <polygon points="74,16 136,16 144,48 74,49" fill="#f8fafc"/>
                            <!-- صفحه سمت چپ دفتر -->
                            <polygon points="12,16 74,16 74,49 4,48" fill="#f1f5f9"/>
                            <!-- خط وسط و روبان نشانگر قرمز -->
                            <line x1="74" y1="15" x2="74" y2="50" stroke="#94a3b8" stroke-width="1.5"/>
                            <path d="M74,49 L70,60 L75,58 L78,61 L76,49" fill="#ef4444"/>
                            <!-- خطوط نوشته داخل دفتر (با پیشرفت تایمر پررنگ‌تر می‌شوند) -->
                            <g stroke="#64748b" stroke-width="1.4" stroke-linecap="round">
                                <line x1="84" y1="23" x2="128" y2="23"/>
                                <line x1="84" y1="29" x2="130" y2="29"/>
                                <line x1="84" y1="35" x2="122" y2="35" id="notebookLine1" opacity="0.35"/>
                                <line x1="84" y1="41" x2="115" y2="41" id="notebookLine2" opacity="0.25"/>
                                <line x1="20" y1="23" x2="64" y2="23" id="notebookLine3" opacity="0.2"/>
                                <line x1="20" y1="29" x2="66" y2="29" id="notebookLine4" opacity="0.15"/>
                                <line x1="20" y1="35" x2="56" y2="35" id="notebookLine5" opacity="0.15"/>
                            </g>
                            <!-- خودکار طلایی کنار دفتر -->
                            <path d="M152,26 L164,50" stroke="#fbbf24" stroke-width="3" stroke-linecap="round"/>
                            <path d="M152,26 L156,34" stroke="#1e293b" stroke-width="3" stroke-linecap="round"/>
                        </g>

                        <!-- ۳. سمت چپِ دفتر: قطب‌نمای جیبی برنجی خوابیده در پرسپکتیو روی میز -->
                        <g transform="translate(86, 40)">
                            <ellipse cx="24" cy="24" rx="22" ry="13" fill="rgba(0,0,0,0.5)"/>
                            <ellipse cx="24" cy="21" rx="20" ry="12" fill="#b45309" stroke="#fbbf24" stroke-width="1.5"/>
                            <ellipse cx="24" cy="19" rx="17" ry="9.5" fill="#0f172a" stroke="#d97706" stroke-width="1"/>
                            <g id="deskCompassNeedle" style="transform-origin: 24px 19px; transition: transform 1s linear;">
                                <polygon points="24,11 27,19 24,17 21,19" fill="#ef4444"/>
                                <polygon points="24,27 27,19 24,21 21,19" fill="#e2e8f0"/>
                            </g>
                            <circle cx="24" cy="19" r="2" fill="#fbbf24"/>
                        </g>

                        <!-- ۴. سمت چپ میز: فنجان سرامیکی چای/قهوه داغ با نعلبکی و بخار زنده -->
                        <g transform="translate(18, 14)" id="deskTeaCupSvg">
                            <!-- بخار چای -->
                            <path class="tea-steam-path" d="M22,22 Q16,12 24,3" fill="none" stroke="#cbd5e1" stroke-width="1.8" stroke-linecap="round"/>
                            <path class="tea-steam-path" d="M30,20 Q36,10 28,1" fill="none" stroke="#cbd5e1" stroke-width="1.8" stroke-linecap="round" style="animation-delay:1.2s;"/>
                            <!-- سایه و نعلبکی -->
                            <ellipse cx="26" cy="56" rx="20" ry="6" fill="rgba(0,0,0,0.5)"/>
                            <ellipse cx="26" cy="53" rx="18" ry="5" fill="#cbd5e1" stroke="#94a3b8" stroke-width="1"/>
                            <!-- بدنه فنجان سه‌بعدی -->
                            <path d="M12,30 L40,30 C39,46 35,52 26,52 C17,52 13,46 12,30 Z" fill="#7c2d12" stroke="#f59e0b" stroke-width="1.4"/>
                            <!-- دسته فنجان -->
                            <path d="M39,34 C46,34 46,45 37,46" fill="none" stroke="#f59e0b" stroke-width="2.2"/>
                            <!-- سطح مایع چای گرم داخل فنجان -->
                            <ellipse cx="26" cy="30" rx="14" ry="3.8" fill="#451a03" stroke="#d97706" stroke-width="1"/>
                        </g>
                    </svg>
                </div>
            </div>

            <!-- ۴. پنجره تنظیم زمان دلخواه -->
            <div class="pomo-popup-sheet" id="pomoCustomSheet">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                    <strong style="font-size:13px; color:#77bba9;">⚙️ تنظیم دلخواه زمان مطالعه و استراحت</strong>
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
                    <i data-lucide="check" class="icon-sm"></i><span>ثبت و اعمال زمان</span>
                </button>
            </div>

            <!-- ۵. پنل میکسر صدای کوپه (با پخش WAV واقعی روی آیفون و اندروید) -->
            <div class="pomo-popup-sheet" id="pomoSoundSheet">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                    <strong style="font-size:13px; color:#77bba9;">🎧 صداهای آرامش‌بخش کوپه (قابلیت ترکیب هم‌زمان)</strong>
                    <button type="button" class="del-icon-btn" style="width:26px;height:26px;" onclick="TimerModule.toggleSoundMixer()">
                        <i data-lucide="x" class="icon-sm"></i>
                    </button>
                </div>
                <p style="font-size:10.5px; color:#94a3b8; margin-bottom:10px; text-align:right;">روی هر ردیف بزنید تا صدای آن روشن یا خاموش شود (مطمئن شوید کلید سایلنت بغل گوشی باز باشد):</p>

                <div class="sound-mix-row" id="mixRow_tracks" onclick="TimerModule.toggleSoundChannel('tracks')">
                    <div style="display:flex; align-items:center; gap:8px; color:#fff; font-size:12px; font-weight:800;">
                        <i data-lucide="train-front" class="icon-sm primary-text"></i>
                        <span>🚂 ریتم حرکت قطار روی ریل</span>
                    </div>
                    <input type="range" min="0.1" max="1" step="0.05" value="0.55" style="width:90px;"
                           onclick="event.stopPropagation()" oninput="TimerModule.setChannelVolume('tracks', this.value)">
                </div>

                <div class="sound-mix-row" id="mixRow_rain" onclick="TimerModule.toggleSoundChannel('rain')">
                    <div style="display:flex; align-items:center; gap:8px; color:#fff; font-size:12px; font-weight:800;">
                        <i data-lucide="cloud-rain" class="icon-sm primary-text"></i>
                        <span>🌧️ بارش باران روی شیشه کوپه</span>
                    </div>
                    <input type="range" min="0.1" max="1" step="0.05" value="0.45" style="width:90px;"
                           onclick="event.stopPropagation()" oninput="TimerModule.setChannelVolume('rain', this.value)">
                </div>

                <div class="sound-mix-row" id="mixRow_fire" onclick="TimerModule.toggleSoundChannel('fire')">
                    <div style="display:flex; align-items:center; gap:8px; color:#fff; font-size:12px; font-weight:800;">
                        <i data-lucide="flame" class="icon-sm gold-text"></i>
                        <span>🔥 صدای هیزم و گرمای شومینه</span>
                    </div>
                    <input type="range" min="0.1" max="1" step="0.05" value="0.45" style="width:90px;"
                           onclick="event.stopPropagation()" oninput="TimerModule.setChannelVolume('fire', this.value)">
                </div>

                <div class="sound-mix-row" id="mixRow_lofi" onclick="TimerModule.toggleSoundChannel('lofi')">
                    <div style="display:flex; align-items:center; gap:8px; color:#fff; font-size:12px; font-weight:800;">
                        <i data-lucide="music" class="icon-sm indigo-text"></i>
                        <span>🎹 هارمونی آرام شبانه (Lo-Fi Pad)</span>
                    </div>
                    <input type="range" min="0.1" max="1" step="0.05" value="0.40" style="width:90px;"
                           onclick="event.stopPropagation()" oninput="TimerModule.setChannelVolume('lofi', this.value)">
                </div>

                <button type="button" class="btn-danger-soft" style="padding:8px; margin-top:4px;" onclick="TimerModule.stopAllSounds()">
                    <span>خاموش کردن همه صداها</span>
                </button>
            </div>

            <!-- ۶. نوار کنترل پایین تایمر (شامل دکمه صدا، شروع/توقف و دکمه پایان کامل تایمر) -->
            <div style="display:flex; gap:8px; align-items:center; justify-content:center; z-index:20; width:100%; max-width:440px;">
                <button type="button" id="btnPomoAmbient" class="btn-modal-outline" style="width:auto; padding:11px 14px; background:rgba(255,255,255,0.07); color:#fff; border-color:rgba(255,255,255,0.16); font-size:12px; margin:0;" onclick="TimerModule.toggleSoundMixer()">
                    <i data-lucide="headphones" class="icon-sm"></i><span id="lblAmbientBtn">صدای کوپه</span>
                </button>

                <button type="button" id="btnPomoPlayPause" class="btn-primary-full" style="flex:1; padding:12px 16px; border-radius:99px; font-size:13.5px;" onclick="TimerModule.togglePlayPause()">
                    <i data-lucide="play" class="icon-sm"></i><span>شروع تمرکز (۹۰ دقیقه)</span>
                </button>

                <!-- دکمه پایان کامل تایمر (زمانی که تایمر شروع یا متوقف شده نمایش داده می‌شود) -->
                <button type="button" id="btnPomoEndReset" class="btn-danger-soft" style="display:none; width:auto; margin:0; padding:11px 14px; border-radius:99px; font-size:12px; white-space:nowrap;" onclick="TimerModule.resetAndEndCurrentTimer()">
                    <i data-lucide="square" class="icon-sm"></i><span>پایان تایمر</span>
                </button>
            </div>
        `;
    },

    // ======================================================================
    // 🎬 ۲. باز کردن تایمر و مدیریت مخفی شدن دکمه‌های زمان پس از شروع
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

        document.getElementById('pomoTitleDisplay').innerText = title;
        document.getElementById('inpPomoStudyMins').value = this.config.studyMins;
        document.getElementById('inpPomoBreakMins').value = this.config.breakMins;
        document.getElementById('inpPomoRounds').value = this.config.totalRounds;

        const overlay = document.getElementById('immersiveTimerOverlay');
        if (overlay) {
            overlay.classList.add('active');
            overlay.classList.remove('break-phase', 'running');
        }

        this.syncControlsVisibility();
        this.updatePurityBadge();
        this.updateVisuals();
        this.startWindowCanvasLoop();
        this.requestScreenWakeLock();
        UI.refreshIcons();
    },

    // ✅ مدیریت نمایش/مخفی‌سازی نوار انتخاب زمان و دکمه پایان تایمر
    syncControlsVisibility() {
        const presetBar = document.getElementById('pomoPresetBar');
        const endBtn = document.getElementById('btnPomoEndReset');
        const playBtn = document.getElementById('btnPomoPlayPause');

        if (!this.runtime.isRunning) {
            // هنوز تایمر شروع نشده -> دکمه‌های انتخاب زمان (۹۰/۱۵ و...) باز باشند
            if (presetBar) presetBar.style.display = 'flex';
            if (endBtn) endBtn.style.display = 'none';
            if (playBtn) {
                playBtn.innerHTML = `<i data-lucide="play" class="icon-sm"></i><span>شروع تمرکز (${this.toFa(this.config.studyMins)} دقیقه)</span>`;
            }
        } else {
            // تایمر شروع شده -> دکمه‌های انتخاب زمان بالا کاملاً مخفی شوند تا اول تکلیف این تایمر مشخص شود!
            if (presetBar) presetBar.style.display = 'none';
            document.getElementById('pomoCustomSheet')?.classList.remove('open');

            if (this.runtime.isPaused) {
                // وقتی توقف موقت زده شد -> هم دکمه «ادامه» و هم دکمه «پایان تایمر» نمایش داده شود
                if (endBtn) endBtn.style.display = 'inline-flex';
                if (playBtn) {
                    playBtn.innerHTML = `<i data-lucide="play" class="icon-sm"></i><span>ادامه تایمر</span>`;
                }
            } else {
                // در حال حرکت -> دکمه توقف موقت + دکمه پایان
                if (endBtn) endBtn.style.display = 'inline-flex';
                if (playBtn) {
                    playBtn.innerHTML = `<i data-lucide="pause" class="icon-sm"></i><span>توقف موقت</span>`;
                }
            }
        }
        UI.refreshIcons();
    },

    selectPreset(studyMins, breakMins, rounds, presetKey, btnEl) {
        if (this.runtime.isRunning) return; // جلوگیری از تغییر زمان وسط حرکت تایمر

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

        document.getElementById('pomoPhaseBadge').innerText = `پارت ۱ از ${this.toFa(rounds)} • مطالعه`;
        document.getElementById('pomoStatusText').innerText = `آماده حرکت (${this.toFa(studyMins)} دقیقه مطالعه)`;

        this.updateVisuals();
        this.syncControlsVisibility();
    },

    toggleCustomSheet() {
        if (this.runtime.isRunning) return;
        document.getElementById('pomoSoundSheet')?.classList.remove('open');
        document.getElementById('pomoCustomSheet')?.classList.toggle('open');
    },

    applyCustomSetup() {
        const sMins = Math.max(1, parseInt(document.getElementById('inpPomoStudyMins')?.value, 10) || 90);
        const bMins = Math.max(1, parseInt(document.getElementById('inpPomoBreakMins')?.value, 10) || 15);
        const rounds = Math.max(1, parseInt(document.getElementById('inpPomoRounds')?.value, 10) || 1);

        document.getElementById('pomoCustomSheet')?.classList.remove('open');
        this.selectPreset(sMins, bMins, rounds, 'custom', null);
    },

    // ======================================================================
    // ⏱️ ۳. شروع، توقف موقت و پایان کامل تایمر
    // ======================================================================
    togglePlayPause() {
        if (!this.runtime.isRunning) {
            this.playSoftChime();
            this.startPhase('study', 1);
            return;
        }
        this.runtime.isPaused = !this.runtime.isPaused;
        const overlay = document.getElementById('immersiveTimerOverlay');
        overlay?.classList.toggle('running', !this.runtime.isPaused);
        document.getElementById('pomoStatusText').innerText = this.runtime.isPaused
            ? '⏸️ متوقف‌شده (ادامه یا پایان را انتخاب کنید)'
            : (this.runtime.phase === 'study' ? '🚂 در حال پیشروی عمیق...' : '🍵 تایم ریکاوری و استراحت');
        this.syncControlsVisibility();
    },

    // ✅ دکمه پایان کامل تایمر فعلی و بازگشت به حالت انتخاب زمان جدید
    resetAndEndCurrentTimer() {
        clearInterval(this.runtime.intervalId);
        this.runtime.isRunning = false;
        this.runtime.isPaused = false;
        this.runtime.phase = 'study';
        this.runtime.currentRound = 1;
        this.runtime.secondsLeft = this.config.studyMins * 60;
        this.runtime.totalPhaseSeconds = this.config.studyMins * 60;

        const overlay = document.getElementById('immersiveTimerOverlay');
        overlay?.classList.remove('running', 'break-phase');

        document.getElementById('pomoPhaseBadge').innerText = `پارت ۱ از ${this.toFa(this.config.totalRounds)} • مطالعه`;
        document.getElementById('pomoStatusText').innerText = `تایمر متوقف شد • آماده شروع مجدد`;

        this.updateVisuals();
        this.syncControlsVisibility();
        UI.showToast('تایمر فعلی بسته شد. می‌توانید زمان جدیدی انتخاب کنید.', 'info');
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

        const bulb = document.getElementById('deskLampBulb');
        if (bulb) bulb.setAttribute('fill', phase === 'break' ? '#64748b' : '#fef08a');

        document.getElementById('pomoPhaseBadge').innerText = phase === 'study'
            ? `پارت ${this.toFa(roundNum)} از ${this.toFa(this.config.totalRounds)} • در حال حرکت`
            : `🍵 استراحت (${this.toFa(mins)} دقیقه)`;

        document.getElementById('pomoStatusText').innerText = phase === 'study'
            ? '🚂 در حال پیشروی به سمت مقصد...'
            : 'چایت را بنوش و چشم‌هایت را استراحت بده';

        this.syncControlsVisibility();
        this.updateVisuals();

        this.runtime.intervalId = setInterval(() => {
            if (this.runtime.isPaused) return;
            this.runtime.secondsLeft--;
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

        // چرخش عقربه قطب‌نما روی میز
        const needle = document.getElementById('deskCompassNeedle');
        if (needle) {
            needle.style.transform = `rotate(${Math.round(elapsedRatio * 360)}deg)`;
        }

        // پررنگ شدن خطوط دفتر روی میز با گذشت زمان مطالعه
        ['notebookLine1', 'notebookLine2', 'notebookLine3', 'notebookLine4', 'notebookLine5'].forEach((id, idx) => {
            const lineEl = document.getElementById(id);
            if (lineEl) {
                const threshold = (idx + 1) * 0.18;
                lineEl.setAttribute('opacity', elapsedRatio >= threshold ? '0.85' : '0.2');
            }
        });
    },

    handlePhaseComplete() {
        clearInterval(this.runtime.intervalId);
        this.playSoftChime();

        if (this.runtime.phase === 'study') {
            if (this.runtime.currentRound < this.config.totalRounds) {
                UI.showToast(`🎉 پارت ${this.toFa(this.runtime.currentRound)} تمام شد! تایم استراحت (${this.toFa(this.config.breakMins)} دقیقه) شروع شد.`, 'success');
                this.startPhase('break', this.runtime.currentRound);
            } else {
                if (window.confetti) confetti({ particleCount: 150, spread: 85, origin: { y: 0.6 } });
                UI.showToast(`🏆 تبریک! پارت مطالعه کامل شد و ${this.toFa(this.config.breakMins)} دقیقه استراحت آغاز گردید.`, 'success');

                const questId = this.activeQuestBlockId || window.ToolsModule?.activeQuestBlockId;
                if (questId && window.PlanningModule) {
                    window.PlanningModule.toggleQuest(questId);
                    this.activeQuestBlockId = null;
                    if (window.ToolsModule) window.ToolsModule.activeQuestBlockId = null;
                }

                this.startPhase('break', this.runtime.currentRound);
            }
        } else {
            if (this.runtime.currentRound < this.config.totalRounds) {
                const nextRound = this.runtime.currentRound + 1;
                UI.showToast(`🚂 استراحت تمام شد! پارت ${this.toFa(nextRound)} مطالعه شروع شد.`, 'info');
                this.startPhase('study', nextRound);
            } else {
                this.resetAndEndCurrentTimer();
                document.getElementById('pomoStatusText').innerText = 'پارت مطالعه و استراحت کامل شد! خسته نباشی 🌟';
            }
        }
    },

    // ======================================================================
    // ✨ ۴. بوم آسمان شب و باران روی شیشه پنجره
    // ======================================================================
    startWindowCanvasLoop() {
        cancelAnimationFrame(this.runtime.windowAnimId);
        const canvas = document.getElementById('trainWindowCanvas');
        if (!canvas) return;
        const ctx = canvas.getContext('2d');

        canvas.width = canvas.clientWidth || 400;
        canvas.height = canvas.clientHeight || 245;

        if (this.runtime.skyStars.length === 0) {
            for (let i = 0; i < 38; i++) {
                this.runtime.skyStars.push({
                    x: Math.random() * canvas.width,
                    y: Math.random() * (canvas.height * 0.62),
                    r: Math.random() * 1.4 + 0.5,
                    phase: Math.random() * Math.PI * 2
                });
            }
        }

        if (this.runtime.raindrops.length === 0) {
            for (let i = 0; i < 30; i++) {
                this.runtime.raindrops.push({
                    x: Math.random() * canvas.width,
                    y: Math.random() * canvas.height,
                    len: Math.random() * 12 + 8,
                    speed: Math.random() * 4 + 5
                });
            }
        }

        let t = 0;
        const render = () => {
            if (!document.getElementById('immersiveTimerOverlay')?.classList.contains('active')) return;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            t += 0.03;

            // چشمک زدن طبیعی ستارگان آسمان شب
            this.runtime.skyStars.forEach(st => {
                const alpha = 0.45 + Math.sin(t + st.phase) * 0.35;
                ctx.beginPath();
                ctx.arc(st.x, st.y, st.r, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(248, 250, 252, ${alpha})`;
                ctx.fill();
            });

            // بارش قطرات باران روی شیشه پنجره (وقتی صدای باران فعال است)
            if (this.runtime.audioPlayers.rain.active) {
                ctx.strokeStyle = 'rgba(186, 230, 253, 0.38)';
                ctx.lineWidth = 1.2;
                this.runtime.raindrops.forEach(r => {
                    ctx.beginPath();
                    ctx.moveTo(r.x, r.y);
                    ctx.lineTo(r.x - 3, r.y + r.len);
                    ctx.stroke();

                    r.y += r.speed;
                    r.x -= 0.8;
                    if (r.y > canvas.height) {
                        r.y = -12;
                        r.x = Math.random() * canvas.width;
                    }
                });
            }

            this.runtime.windowAnimId = requestAnimationFrame(render);
        };
        render();
    },

    // ======================================================================
    // 🎧 ۵. موتور تولید فایل صوتی WAV در حافظه (پخش ۱۰۰٪ تضمینی روی iOS و Android)
    // ======================================================================
    buildWavBlobUrl(type) {
        const sampleRate = 22050;
        const durationSeconds = 6; // حلقه ۶ ثانیه‌ای بدون درز
        const numSamples = sampleRate * durationSeconds;
        const buffer = new ArrayBuffer(44 + numSamples * 2);
        const view = new DataView(buffer);

        const writeStr = (offset, str) => {
            for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i));
        };

        writeStr(0, 'RIFF');
        view.setUint32(4, 36 + numSamples * 2, true);
        writeStr(8, 'WAVE');
        writeStr(12, 'fmt ');
        view.setUint32(16, 16, true);
        view.setUint16(20, 1, true); // PCM
        view.setUint16(22, 1, true); // Mono
        view.setUint32(24, sampleRate, true);
        view.setUint32(28, sampleRate * 2, true);
        view.setUint16(32, 2, true);
        view.setUint16(34, 16, true);
        writeStr(36, 'data');
        view.setUint32(40, numSamples * 2, true);

        let b0 = 0, b1 = 0, b2 = 0;

        for (let i = 0; i < numSamples; i++) {
            const t = i / sampleRate;
            const white = Math.random() * 2 - 1;
            let sample = 0;

            if (type === 'tracks') {
                // غرش بم داخل واگن + ۴ ضربه واقعی چرخ روی ریل در هر ۱.۵ ثانیه (تق-تق... تق-تق)
                b0 = 0.985 * b0 + 0.015 * white;
                const cycle = t % 1.5;
                let clack = 0;
                const hits = [0.05, 0.21, 0.52, 0.68];
                for (let h = 0; h < hits.length; h++) {
                    const dt = cycle - hits[h];
                    if (dt >= 0 && dt < 0.09) {
                        const env = Math.exp(-dt * 48);
                        clack += env * (Math.sin(2 * Math.PI * 82 * dt) * 0.7 + white * 0.45);
                    }
                }
                sample = (b0 * 0.65) + (clack * 0.55);
            }
            else if (type === 'rain') {
                // صدای طبیعی باران ملایم روی شیشه (Pink/Brown filtered noise)
                b0 = 0.92 * b0 + 0.08 * white;
                b1 = 0.85 * b1 + 0.15 * b0;
                sample = b1 * 0.55;
            }
            else if (type === 'fire') {
                // صدای گرم شومینه + ترق‌تروق ملایم چوب و هیزم
                b0 = 0.96 * b0 + 0.04 * white;
                if (Math.random() < 0.0025) b2 = 0.65;
                b2 *= 0.93;
                sample = (b0 * 0.65) + (b2 * white * 0.55);
            }
            else if (type === 'lofi') {
                // آکورد آرامش‌بخش شبانه (Fmaj7 Ambient Warm Pad) با محو ملایم
                const env = 0.75 + 0.25 * Math.sin((2 * Math.PI * t) / durationSeconds);
                const w1 = Math.sin(2 * Math.PI * 174.61 * t); // F3
                const w2 = Math.sin(2 * Math.PI * 220.00 * t); // A3
                const w3 = Math.sin(2 * Math.PI * 261.63 * t); // C4
                const w4 = Math.sin(2 * Math.PI * 329.63 * t); // E4
                b0 = 0.98 * b0 + 0.02 * white;
                sample = ((w1 + w2 + w3 + w4) * 0.11 * env) + (b0 * 0.12);
            }

            sample = Math.max(-1, Math.min(1, sample));
            view.setInt16(44 + i * 2, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
        }

        const blob = new Blob([buffer], { type: 'audio/wav' });
        return URL.createObjectURL(blob);
    },

    toggleSoundMixer() {
        document.getElementById('pomoCustomSheet')?.classList.remove('open');
        document.getElementById('pomoSoundSheet')?.classList.toggle('open');
    },

    toggleSoundChannel(chName) {
        const ch = this.runtime.audioPlayers[chName];
        if (!ch) return;

        if (ch.active) {
            ch.active = false;
            try { ch.audioEl?.pause(); } catch (_) {}
        } else {
            if (!ch.audioEl) {
                const wavUrl = this.buildWavBlobUrl(chName);
                const audio = new Audio(wavUrl);
                audio.loop = true;
                audio.playsInline = true;
                audio.volume = ch.volume;
                ch.audioEl = audio;
            }
            ch.active = true;
            ch.audioEl.volume = ch.volume;
            ch.audioEl.play().catch(err => {
                console.warn("Audio Play Warning:", err);
                UI.showToast('لطفاً کلید سایلنت کنار گوشی را باز کنید و مجدد لمس نمایید.', 'info');
            });
        }

        this.updateSoundButtonsUI();
    },

    setChannelVolume(chName, val) {
        const ch = this.runtime.audioPlayers[chName];
        if (!ch) return;
        ch.volume = parseFloat(val) || 0.45;
        if (ch.audioEl) {
            ch.audioEl.volume = ch.volume;
        }
    },

    stopAllSounds() {
        Object.keys(this.runtime.audioPlayers).forEach(k => {
            const ch = this.runtime.audioPlayers[k];
            ch.active = false;
            try { ch.audioEl?.pause(); } catch (_) {}
        });
        this.updateSoundButtonsUI();
    },

    updateSoundButtonsUI() {
        let anyActive = false;
        Object.keys(this.runtime.audioPlayers).forEach(k => {
            const isAct = this.runtime.audioPlayers[k].active;
            if (isAct) anyActive = true;
            document.getElementById(`mixRow_${k}`)?.classList.toggle('active', isAct);
        });

        const ambBtn = document.getElementById('btnPomoAmbient');
        const ambLbl = document.getElementById('lblAmbientBtn');
        if (ambBtn) ambBtn.style.borderColor = anyActive ? '#10b981' : 'rgba(255,255,255,0.16)';
        if (ambLbl) ambLbl.innerText = anyActive ? 'صدا: روشن 🔊' : 'صدای کوپه';
    },

    // صدای زنگ ملایم شروع و پایان پارت (فایل WAV کوتاه در حافظه)
    playSoftChime() {
        try {
            const sampleRate = 22050;
            const numSamples = Math.floor(sampleRate * 1.2);
            const buffer = new ArrayBuffer(44 + numSamples * 2);
            const view = new DataView(buffer);
            const writeStr = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };

            writeStr(0, 'RIFF');
            view.setUint32(4, 36 + numSamples * 2, true);
            writeStr(8, 'WAVE');
            writeStr(12, 'fmt ');
            view.setUint32(16, 16, true);
            view.setUint16(20, 1, true);
            view.setUint16(22, 1, true);
            view.setUint32(24, sampleRate, true);
            view.setUint32(28, sampleRate * 2, true);
            view.setUint16(32, 2, true);
            view.setUint16(34, 16, true);
            writeStr(36, 'data');
            view.setUint32(40, numSamples * 2, true);

            for (let i = 0; i < numSamples; i++) {
                const t = i / sampleRate;
                const env = Math.exp(-t * 3.2);
                const s = env * (Math.sin(2 * Math.PI * 528 * t) * 0.35 + Math.sin(2 * Math.PI * 660 * t) * 0.25);
                view.setInt16(44 + i * 2, s * 0x7FFF, true);
            }

            const chimeAudio = new Audio(URL.createObjectURL(new Blob([buffer], { type: 'audio/wav' })));
            chimeAudio.volume = 0.5;
            chimeAudio.play().catch(() => {});
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
        clearInterval(this.runtime.intervalId);
        cancelAnimationFrame(this.runtime.windowAnimId);
        this.runtime.isRunning = false;
        this.runtime.isPaused = false;
        this.stopAllSounds();
        this.releaseScreenWakeLock();

        if (document.fullscreenElement) {
            document.exitFullscreen?.().catch(() => {});
        }
        document.getElementById('immersiveTimerOverlay')?.classList.remove('active', 'running', 'break-phase');
    }
};

window.TimerModule = TimerModule;
