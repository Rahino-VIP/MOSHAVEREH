/* ==========================================================================
   🧰 ماژول هماهنگ‌کننده ابزارها، چالش بیدارباش خودکار و پروفایل (tools.js)
   (ماژول‌های فلش‌کارت، عادت‌ها و تایمر سینماتیک در فایل‌های مستقل خودشان قرار دارند)
   ========================================================================== */

const ToolsModule = {
    activeQuestBlockId: null,
    gameTimerInterval: null,

    async init() {
        this.bindToolModalsRouting();
        if (window.HabitsModule) await window.HabitsModule.init();
        if (window.FlashcardsModule) await window.FlashcardsModule.init();
        if (window.TimerModule) window.TimerModule.init();
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

    bindToolModalsRouting() {
        const origOpenModal = UI.openModal.bind(UI);
        UI.openModal = (modalId) => {
            if (modalId === 'flashcardModal') {
                if (window.FlashcardsModule) window.FlashcardsModule.openFlashcardsPage();
                return;
            }
            if (modalId === 'habitModal') {
                if (window.HabitsModule) window.HabitsModule.openHabitsPage();
                return;
            }
            origOpenModal(modalId);
        };
    },

    // هدایت به تایمر تمام‌صفحه سینماتیک با پیش‌فرض ۹۰ دقیقه مطالعه و ۱۵ دقیقه استراحت
    openImmersiveTimer(title = 'تمرکز عمیق کنکوری', defaultMins = 90) {
        if (window.TimerModule) {
            window.TimerModule.activeQuestBlockId = this.activeQuestBlockId;
            window.TimerModule.openImmersiveTimer(title, defaultMins);
        }
    },

    // ======================================================================
    // 🌅 چالش بیدارباش خودکار صبحگاهی (۵ تا ۷ صبح)
    // ======================================================================
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

        // ثبت خودکار تیک عادت بیداری امروز در HabitsModule
        const todayShamsi = this.getShamsiDateStr(0);
        if (window.HabitsModule) {
            const wakeHabit = window.HabitsModule.habitsList.find(h => h.id === 'h_wake' || h.title.includes('بیداری'));
            if (wakeHabit) {
                const logs = window.HabitsModule.habitsLogs[wakeHabit.id] || [];
                if (!logs.includes(todayShamsi)) {
                    window.HabitsModule.toggleHabitOnDate(wakeHabit.id, todayShamsi, false);
                }
            }
        }

        UI.closeModals();
        if (window.confetti) confetti({ particleCount: 130, spread: 70, origin: { y: 0.6 } });
        UI.showToast(`آفرین قهرمان! بیداری امروز و زنجیره ${newStreak.toLocaleString('fa-IR')} روزه‌ات ثبت شد.`, 'success');
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
