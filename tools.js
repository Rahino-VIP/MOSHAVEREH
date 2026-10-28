/* ==========================================================================
   👤 ماژول پروفایل، اشتراک‌ها، کیف پول و مشخصات (js/profile.js)
   متصل به زیرصفحه پروفایل (#view-profile) و هماهنگ با هسته مرکزی و Supabase
   ========================================================================== */

const ProfileModule = {
    studentData: {},
    subscriptions: [],
    installments: [],
    activeInstallmentId: null,

    // ======================================================================
    // 🚀 ۱. راه‌اندازی و بارگذاری اطلاعات پرونده کاربر
    // ======================================================================
    async init() {
        await this.fetchProfileData();
        UI.refreshIcons();
    },

    async fetchProfileData() {
        const uid = String(AppState.userId || '');
        if (!uid) return;

        try {
            const [stRes, subRes, instRes] = await Promise.all([
                supabaseClient.from('students').select('*').eq('national_id', uid).maybeSingle(),
                supabaseClient.from('subscriptions').select('*').eq('student_nid', uid).eq('service_category', 'consult').order('created_at', { ascending: false }),
                supabaseClient.from('installments').select('*').eq('student_nid', uid).order('due_date', { ascending: true })
            ]);

            if (stRes.data) {
                this.studentData = stRes.data;
                this.populateFormFields(this.studentData);
                this.renderWallet(this.studentData);
            }

            this.subscriptions = subRes.data || [];
            this.renderSubscriptions(this.subscriptions);

            this.installments = instRes.data || [];
            this.renderInstallments(this.installments);

        } catch (err) {
            console.error('Error fetching profile data:', err);
            UI.showToast('خطا در بارگذاری مشخصات کاربری.', 'error');
        }
    },

    // پر کردن فیلدهای فرم اطلاعات
    populateFormFields(data) {
        const setVal = (id, val) => {
            const el = document.getElementById(id);
            if (el) el.value = val || '';
        };

        setVal('inpName', data.full_name);
        setVal('inpGrade', data.grade);
        setVal('inpMajor', data.major);
        setVal('inpBirthdate', data.birthdate);
        setVal('inpSchool', data.school_name);
        setVal('inpProvince', data.province);
        setVal('inpCity', data.city);
        setVal('inpPhone', data.phone_number);
        setVal('inpPass', data.password);
        setVal('inpFather', data.father_phone);
        setVal('inpMother', data.mother_phone);

        // نحوه آشنایی (اگر قبلاً ثبت نشده باشد، نمایش داده می‌شود)
        const refSourceGroup = document.getElementById('referralSourceGroup');
        if (refSourceGroup) {
            if (!data.referral_source) {
                refSourceGroup.style.display = 'block';
            } else {
                refSourceGroup.style.display = 'none';
                setVal('inpReferralSource', data.referral_source);
            }
        }
    },

    // ======================================================================
    // 💳 ۲. رندر کارت‌های اشتراک فعال
    // ======================================================================
    renderSubscriptions(subs) {
        const container = document.getElementById('profileSubscriptionsContainer');
        if (!container) return;

        const activeConsultSubs = subs.filter(s => s.status === 'active');

        if (activeConsultSubs.length > 0) {
            container.innerHTML = activeConsultSubs.map(sub => {
                const sDate = new Date(sub.start_date || sub.created_at);
                const eDate = new Date(sub.end_date);
                const today = new Date();

                const totalDays = Math.max(1, Math.ceil((eDate - sDate) / (1000 * 60 * 60 * 24)));
                const passedDays = Math.ceil((today - sDate) / (1000 * 60 * 60 * 24));
                const remainDays = Math.max(0, totalDays - passedDays);
                const pct = Math.max(0, 100 - Math.min((passedDays / totalDays) * 100, 100));

                let shamsiEnd = 'پایان اشتراک';
                try {
                    shamsiEnd = eDate.toLocaleDateString('fa-IR', { year: 'numeric', month: 'short', day: 'numeric' });
                } catch (_) {}

                return `
                    <div class="sub-card consult">
                        <div class="sub-header">
                            <div>
                                <div class="plan-cat"><i data-lucide="compass" class="icon-sm"></i><span>مشاوره و هدایت تحصیلی</span></div>
                                <div class="plan-name">طرح ${sub.service_type || 'قطب‌نما'}</div>
                            </div>
                            <div class="sub-badge"><i data-lucide="badge-check" class="icon-sm"></i><span>اشتراک فعال</span></div>
                        </div>
                        <div class="progress-container">
                            <div class="progress-text">
                                <span><b>${remainDays.toLocaleString('fa-IR')} روز</b> باقی‌مانده</span>
                                <span>تا ${shamsiEnd}</span>
                            </div>
                            <div class="progress-bar">
                                <div class="progress-fill" style="width: ${pct}%;"></div>
                            </div>
                        </div>
                    </div>
                `;
            }).join('');
        } else {
            container.innerHTML = `
                <div class="sub-card inactive" onclick="Router.openSubPage('store-renew')">
                    <i data-lucide="plus-circle" class="icon-lg"></i>
                    <div>در حال حاضر اشتراک مشاوره فعال ندارید. <b style="color:var(--primary);">برای فعال‌سازی کلیک کنید.</b></div>
                </div>
            `;
        }

        UI.refreshIcons();
    },

    // ======================================================================
    // 🗓️ ۳. نمایش اقساط و آپلود فیش قسط
    // ======================================================================
    renderInstallments(insts) {
        const box = document.getElementById('profileInstallmentsBox');
        const timeline = document.getElementById('profileInstallmentsTimeline');
        if (!box || !timeline) return;

        if (!insts || insts.length === 0) {
            box.style.display = 'none';
            return;
        }

        box.style.display = 'block';
        timeline.innerHTML = insts.map((inst, idx) => {
            const isPaid = inst.status === 'paid';
            const isPendingApproval = inst.status === 'pending_approval';
            const amountFormatted = Math.round(inst.amount || 0).toLocaleString('fa-IR');

            let statusBadge = `<span class="status-pill danger">پرداخت نشده</span>`;
            if (isPaid) statusBadge = `<span class="status-pill success">تسویه شده</span>`;
            else if (isPendingApproval) statusBadge = `<span class="status-pill warning">در انتظار تایید فیش</span>`;

            return `
                <div class="timeline-item ${isPaid ? 'done' : ''}">
                    <div class="timeline-dot"></div>
                    <div class="timeline-content">
                        <div class="timeline-header">
                            <strong>قسط ${idx + 1} (${amountFormatted} تومان)</strong>
                            ${statusBadge}
                        </div>
                        <div class="timeline-sub">موعد پرداخت: ${inst.due_date || 'نامشخص'}</div>
                        ${(!isPaid && !isPendingApproval) ? `
                            <button type="button" class="btn-action primary small" style="margin-top:8px; width:auto; padding:8px 14px; font-size:12px;" onclick="ProfileModule.triggerInstallmentUpload('${inst.id}')">
                                <i data-lucide="upload-cloud" class="icon-sm"></i>
                                <span>ارسال فیش واریزی این قسط</span>
                            </button>
                        ` : ''}
                    </div>
                </div>
            `;
        }).join('');

        UI.refreshIcons();
    },

    triggerInstallmentUpload(installmentId) {
        this.activeInstallmentId = installmentId;
        const fileInput = document.getElementById('hiddenInstReceiptInput');
        if (fileInput) fileInput.click();
    },

    async handleInstallmentUpload(inputEl) {
        const file = inputEl.files[0];
        if (!file || !this.activeInstallmentId) return;

        UI.showToast('در حال آپلود فیش واریزی قسط...', 'info');

        try {
            const fileExt = file.name.split('.').pop();
            const fileName = `receipt_inst_${this.activeInstallmentId}_${Date.now()}.${fileExt}`;
            const filePath = `receipts/${fileName}`;

            const { error: uploadError } = await supabaseClient.storage
                .from('receipts')
                .upload(filePath, file);

            if (uploadError) throw uploadError;

            const { data: { publicUrl } } = supabaseClient.storage
                .from('receipts')
                .getPublicUrl(filePath);

            const { error: updateError } = await supabaseClient
                .from('installments')
                .update({
                    receipt_url: publicUrl,
                    status: 'pending_approval',
                    updated_at: new Date().toISOString()
                })
                .eq('id', this.activeInstallmentId);

            if (updateError) throw updateError;

            UI.showToast('فیش قسط با موفقیت ثبت شد و پس از بررسی حسابداری تایید می‌شود.', 'success');
            await this.fetchProfileData();
        } catch (err) {
            console.error('Installment Upload Error:', err);
            UI.showToast('خطا در بارگذاری فیش. لطفاً مجدداً امتحان کنید.', 'error');
        } finally {
            inputEl.value = '';
            this.activeInstallmentId = null;
        }
    },

    // ======================================================================
    // 🎁 ۴. مدیریت کیف پول، کد معرف و تسویه
    // ======================================================================
    renderWallet(data) {
        const balance = data.wallet_balance || 0;
        const balanceEl = document.getElementById('uiWalletBalance');
        const refCodeEl = document.getElementById('uiRefCode');
        const withdrawBtn = document.getElementById('btnOpenWithdraw');

        if (balanceEl) balanceEl.innerText = Math.round(balance).toLocaleString('fa-IR');
        if (refCodeEl) refCodeEl.innerText = data.referral_code || `RH-${String(AppState.userId).slice(-4)}`;

        // نمایش دکمه برداشت وجه فقط در صورت داشتن موجودی
        if (withdrawBtn) {
            withdrawBtn.style.display = balance >= 50000 ? 'inline-flex' : 'none';
        }
    },

    copyReferralText(btnEl) {
        const refCode = document.getElementById('uiRefCode')?.innerText || 'RH-0000';
        const textToCopy = `سلام! من از قطب‌نمای راهینو برای برنامه‌ریزی هوشمند درسی استفاده می‌کنم.\nبا ثبت کد معرف من در مرحله اول ثبت‌نام، ۱۰۰ هزار تومان هدیه نقدی دریافت می‌کنی:\nکد معرف: ${refCode}\nورود و ثبت‌نام: https://rahinovip.ir`;

        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(textToCopy).then(() => {
                UI.showToast('متن و کد دعوت با موفقیت کپی شد.', 'success');
            });
        } else {
            const ta = document.createElement('textarea');
            ta.value = textToCopy;
            document.body.appendChild(ta);
            ta.select();
            document.execCommand('copy');
            document.body.removeChild(ta);
            UI.showToast('متن و کد دعوت با موفقیت کپی شد.', 'success');
        }
    },

    async submitWithdrawRequest() {
        const name = document.getElementById('inpWithdrawName')?.value.trim();
        const card = UI.toEngDigits(document.getElementById('inpWithdrawCard')?.value.trim());
        const balance = this.studentData.wallet_balance || 0;

        if (!name) return UI.showToast('نام و نام خانوادگی صاحب حساب الزامی است.', 'error');
        if (!card || card.length !== 16) return UI.showToast('شماره کارت باید ۱۶ رقم باشد.', 'error');
        if (balance < 50000) return UI.showToast('حداقل مبلغ قابل برداشت ۵۰,۰۰۰ تومان است.', 'error');

        const btn = document.getElementById('btnSubmitWithdraw');
        if (btn) {
            btn.disabled = true;
            btn.innerText = 'در حال ثبت...';
        }

        try {
            const payload = {
                student_nid: String(AppState.userId),
                account_name: name,
                card_number: card,
                amount: balance,
                status: 'pending'
            };

            const { error } = await supabaseClient.from('wallet_withdrawals').insert([payload]);
            if (error) throw error;

            UI.showToast('درخواست برداشت ثبت شد و طی ۲۴ الی ۴۸ ساعت آینده واریز می‌گردد.', 'success');
            const formBox = document.getElementById('withdrawFormBox');
            if (formBox) formBox.style.display = 'none';
        } catch (err) {
            console.error('Withdraw Error:', err);
            UI.showToast('خطا در ثبت درخواست برداشت.', 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerText = 'ثبت درخواست برداشت';
            }
        }
    },

    // ======================================================================
    // 💾 ۵. ذخیره و بروزرسانی اطلاعات پرونده دانش‌آموز
    // ======================================================================
    async saveSettings() {
        const btn = document.getElementById('btnSaveProfile');
        const phone = UI.toEngDigits(document.getElementById('inpPhone')?.value.trim() || '');
        const father = UI.toEngDigits(document.getElementById('inpFather')?.value.trim() || '');
        const mother = UI.toEngDigits(document.getElementById('inpMother')?.value.trim() || '');
        const pass = document.getElementById('inpPass')?.value.trim() || '';
        const referralSource = document.getElementById('inpReferralSource')?.value.trim() || null;

        if (!phone || phone.length !== 11) return UI.showToast('شماره موبایل دانش‌آموز باید ۱۱ رقم باشد.', 'error');
        if (father && father.length !== 11) return UI.showToast('شماره موبایل پدر باید ۱۱ رقم باشد.', 'error');
        if (mother && mother.length !== 11) return UI.showToast('شماره موبایل مادر باید ۱۱ رقم باشد.', 'error');
        if (!pass || pass.length < 6) return UI.showToast('رمز عبور باید حداقل ۶ کاراکتر باشد.', 'error');

        const updateData = {
            phone_number: phone,
            father_phone: father || null,
            mother_phone: mother || null,
            birthdate: document.getElementById('inpBirthdate')?.value.trim() || null,
            province: document.getElementById('inpProvince')?.value.trim() || null,
            city: document.getElementById('inpCity')?.value.trim() || null,
            school_name: document.getElementById('inpSchool')?.value.trim() || null,
            password: pass
        };

        if (referralSource) {
            updateData.referral_source = referralSource;
        }

        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span>در حال ذخیره اطلاعات...</span>';
        }

        try {
            const uid = String(AppState.userId);
            const { error } = await supabaseClient
                .from('students')
                .update(updateData)
                .eq('national_id', uid);

            if (error) throw error;

            this.studentData = { ...this.studentData, ...updateData };
            UI.showToast('مشخصات پرونده با موفقیت ذخیره و بروزرسانی شد.', 'success');

            const refGroup = document.getElementById('referralSourceGroup');
            if (refGroup && referralSource) refGroup.style.display = 'none';

        } catch (err) {
            console.error('Save Profile Error:', err);
            UI.showToast('خطا در ذخیره اطلاعات در سرور.', 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i data-lucide="save" class="icon"></i><span>بروزرسانی اطلاعات پرونده</span>';
                UI.refreshIcons();
            }
        }
    }
};

window.ProfileModule = ProfileModule;
