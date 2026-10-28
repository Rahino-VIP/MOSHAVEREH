/* ==========================================================================
   💳 ماژول فروشگاه، صدور فاکتور، تمدید و تعویض اشتراک (js/store.js)
   شامل:
   ۱. ثبت‌نام مرحله دوم و خرید اولیه طرح مشاوره (Register Step 2)
   ۲. تمدید سریع اشتراک فعلی بدون نیاز به انتخاب مجدد طرح (Store Renew)
   ۳. تعویض، ارتقا و لغو طرح با تجمیع هوشمند تمام قراردادهای فعال و تمدیدشده (Store Swap)
   ========================================================================== */

const StoreModule = {
    catalogLoaded: false,

    // وضعیت داخلی مرحله ۲ (خرید اولیه)
    step2State: {
        consultType: 'none',
        durationVal: '1',
        durationMonths: 1,
        paymentMethod: 'cash',
        promoRate: 0,
        hasReferral: false,
        receiptBase64: null,
        receiptMime: null,
        finance: { base: 0, discount: 0, final: 0, upfront: 0, installments: [] }
    },

    // وضعیت داخلی تمدید اشتراک (Renew)
    renewState: {
        activeSub: null,
        serviceObj: null,
        startDate: null,
        maxMonths: 10,
        durationVal: 'konkur',
        durationMonths: 1,
        paymentMethod: 'cash',
        promoRate: 0,
        receiptBase64: null,
        receiptMime: null,
        lastInstNum: 0,
        finance: { base: 0, discount: 0, walletUsed: 0, newWallet: 0, final: 0, upfront: 0, installments: [] }
    },

    // وضعیت داخلی تعویض و ارتقای طرح (Swap / Trade-in)
    swapState: {
        selectedPlanId: 'no_change',
        selectedPlanType: 'no_change',
        durationVal: 'konkur',
        durationMonths: 1,
        paymentMethod: 'cash',
        promoRate: 0,
        receiptBase64: null,
        receiptMime: null,
        lastInstNum: 0,
        unpaidInstallments: [],
        aggregatedSub: null, // تجمیع تمام قراردادهای فعال مشاوره (برای کسانی که تمدید کرده‌اند)
        finance: {
            tradeInRefund: 0,
            oldDebt: 0,
            newBase: 0,
            discount: 0,
            walletUsed: 0,
            newWallet: 0,
            walletNetChange: 0,
            final: 0,
            upfront: 0,
            actualValue: 0,
            installments: [],
            voidInvoiceIds: []
        }
    },

    // ======================================================================
    // 🔄 ۰. بارگذاری کاتالوگ خدمات، کدهای تخفیف، قوانین و تاریخ کنکور (یک‌بار)
    // ======================================================================
    async ensureCatalogLoaded() {
        if (this.catalogLoaded && AppState.services.length > 0) return;

        try {
            const [srvRes, prmRes, rulRes, sysRes] = await Promise.all([
                supabaseClient.from('services').select('*').eq('category', 'consult').eq('is_active', true),
                supabaseClient.from('promo_codes').select('*').eq('is_active', true),
                supabaseClient.from('terms_and_rules').select('*'),
                supabaseClient.from('system_settings').select('konkur_date').limit(1)
            ]);

            AppState.services = srvRes.data || [];
            AppState.promos = prmRes.data || [];
            AppState.rules = rulRes.data || [];

            if (sysRes.data && sysRes.data.length > 0 && sysRes.data[0].konkur_date) {
                AppState.konkurDateObj = new Date(sysRes.data[0].konkur_date);
                const diffDays = Math.ceil((AppState.konkurDateObj - new Date()) / (1000 * 3600 * 24));
                if (diffDays > 0) {
                    AppState.konkurDurationMonths = Math.max(1, Math.round((diffDays / 30.41) * 10) / 10);
                }
            }
            this.catalogLoaded = true;
        } catch (err) {
            console.error("Error loading store catalog:", err);
        }
    },

    // تضمین وجود پرونده دانش‌آموز در جدول students قبل از ثبت فاکتور (برای جلوگیری از خطای Foreign Key بچه‌های پانسیون)
    async ensureStudentBeforeCheckout(targetId) {
        const uid = String(targetId || AppState.userId || Storage.get('temp_reg_nid'));
        const { data: st } = await supabaseClient
            .from('students')
            .select('*')
            .eq('national_id', uid)
            .maybeSingle();

        if (st) {
            AppState.studentData = st;
            return st;
        }

        if (window.AuthModule) {
            const synced = await AuthModule.ensureStudentRecordExists(uid, '123456', 'rahino.ir');
            AppState.studentData = synced;
            return synced;
        }
        return null;
    },

    // محاسبه نرخ تخفیف زمانی بر اساس تعداد ماه و روش پرداخت
    getTimeDiscountRate(durationVal, months, paymentMethod) {
        if (durationVal === 'konkur') {
            if (months >= 8) return paymentMethod === 'cash' ? 0.15 : 0.08;
            if (months >= 6) return paymentMethod === 'cash' ? 0.10 : 0.05;
            if (months >= 3) return paymentMethod === 'cash' ? 0.05 : 0.02;
            return 0;
        }
        if (String(durationVal) === '3') {
            return paymentMethod === 'cash' ? 0.05 : 0.02;
        }
        return 0;
    },

    // محاسبه اقساط استاندارد
    buildInstallmentsSchedule(finalAmount, durationMonths, startInstNumber = 1) {
        const installments = [];
        let upfront = finalAmount;
        let htmlItems = '';

        if (finalAmount <= 0) {
            return { upfront: 0, installments: [], htmlItems: '' };
        }

        const formatter = new Intl.DateTimeFormat('fa-IR', { month: 'long', day: 'numeric' });
        const today = new Date();
        const n1 = startInstNumber;
        const n2 = startInstNumber + 1;
        const n3 = startInstNumber + 2;

        if (durationMonths <= 1) {
            upfront = UI.roundDown100k(finalAmount * 0.50);
            const remaining = finalAmount - upfront;
            const d1 = new Date(today);
            d1.setDate(today.getDate() + 10);
            installments.push({ due_date: d1.toISOString().split('T')[0], amount: remaining, installment_number: n1 });
            htmlItems = `
                <li><strong class="danger-text">پیش‌پرداخت نقد (الان):</strong> ${UI.formatMoney(upfront)} تومان</li>
                <li>قسط #${n1} (${UI.formatMoney(remaining)} تومان): <strong>${formatter.format(d1)}</strong> (۱۰ روز دیگر)</li>`;
        } else if (durationMonths <= 3) {
            upfront = UI.roundDown100k(finalAmount * 0.50);
            const remaining = finalAmount - upfront;
            const d1 = new Date(today);
            d1.setDate(today.getDate() + 45);
            installments.push({ due_date: d1.toISOString().split('T')[0], amount: remaining, installment_number: n1 });
            htmlItems = `
                <li><strong class="danger-text">پیش‌پرداخت نقد (الان):</strong> ${UI.formatMoney(upfront)} تومان</li>
                <li>قسط #${n1} (${UI.formatMoney(remaining)} تومان): <strong>${formatter.format(d1)}</strong> (۴۵ روز دیگر)</li>`;
        } else {
            upfront = UI.roundDown100k(Math.min(finalAmount * 0.40, 15000000));
            const remaining = finalAmount - upfront;
            const checkAmt = UI.roundDown100k(remaining / 3);
            const lastCheckAmt = remaining - (checkAmt * 2);

            const d1 = new Date(today); d1.setMonth(today.getMonth() + 2);
            const d2 = new Date(today); d2.setMonth(today.getMonth() + 4);
            const d3 = new Date(today); d3.setMonth(today.getMonth() + 6);

            installments.push({ due_date: d1.toISOString().split('T')[0], amount: checkAmt, installment_number: n1 });
            installments.push({ due_date: d2.toISOString().split('T')[0], amount: checkAmt, installment_number: n2 });
            installments.push({ due_date: d3.toISOString().split('T')[0], amount: lastCheckAmt, installment_number: n3 });

            htmlItems = `
                <li><strong class="danger-text">پیش‌پرداخت نقد (الان):</strong> ${UI.formatMoney(upfront)} تومان</li>
                <li>قسط #${n1} (${UI.formatMoney(checkAmt)} تومان): <strong>${formatter.format(d1)}</strong></li>
                <li>قسط #${n2} (${UI.formatMoney(checkAmt)} تومان): <strong>${formatter.format(d2)}</strong></li>
                <li>قسط #${n3} (${UI.formatMoney(lastCheckAmt)} تومان): <strong>${formatter.format(d3)}</strong></li>`;
        }

        return { upfront, installments, htmlItems };
    },

    // استخراج قوانین مشاوره متناسب با پایه تحصیلی
    getFilteredRulesHtml(normGrade) {
        const list = [];
        (AppState.rules || []).forEach(r => {
            if ((r.target_category === 'all' || r.target_category === 'consult') &&
                (r.target_grade === 'all' || r.target_grade === normGrade)) {
                const lines = (r.rule_text || '').split(/\n|\*/).filter(l => l.trim() !== '');
                list.push(...lines);
            }
        });
        if (list.length === 0) {
            return '<li>قوانین انضباطی و مالی سامانه قطب‌نمای راهینو را مطالعه کردم و می‌پذیرم.</li>';
        }
        return list.map(item => `<li>${item.trim()}</li>`).join('');
    },

    // مدیریت انتخاب فایل فیش واریزی برای هر ۳ بخش (step2, renew, swap)
    handleReceiptFile(inputEl, mode) {
        if (!inputEl.files || !inputEl.files[0]) return;
        const file = inputEl.files[0];
        if (file.size > 5 * 1024 * 1024) {
            UI.showToast('حجم تصویر فیش نباید بیشتر از ۵ مگابایت باشد.', 'error');
            inputEl.value = '';
            return;
        }

        const reader = new FileReader();
        reader.onload = (e) => {
            const base64 = e.target.result.split(',')[1];
            const mime = file.type;

            if (mode === 'step2') {
                this.step2State.receiptBase64 = base64;
                this.step2State.receiptMime = mime;
                document.getElementById('step2ReceiptBox')?.classList.add('has-file');
                const lbl = document.getElementById('step2ReceiptLabel');
                if (lbl) lbl.innerText = `فیش ضمیمه شد: ${file.name}`;
            } else if (mode === 'renew') {
                this.renewState.receiptBase64 = base64;
                this.renewState.receiptMime = mime;
                document.getElementById('renewReceiptBox')?.classList.add('has-file');
                const lbl = document.getElementById('renewReceiptLabel');
                if (lbl) lbl.innerText = `فیش ضمیمه شد: ${file.name}`;
            } else if (mode === 'swap') {
                this.swapState.receiptBase64 = base64;
                this.swapState.receiptMime = mime;
                document.getElementById('swapReceiptBox')?.classList.add('has-file');
                const lbl = document.getElementById('swapReceiptLabel');
                if (lbl) lbl.innerText = `فیش ضمیمه شد: ${file.name}`;
            }
        };
        reader.readAsDataURL(file);
    },

    // ارسال نوتیفیکیشن فیش به بله در پس‌زمینه (بدون معطل کردن کاربر)
    notifyBaleInBackground(nationalId, planSummary, invoiceText, base64, mime, finalAmount) {
        if (!base64) return;
        try {
            fetch(GAS_WEBAPP_URL, {
                method: 'POST',
                body: JSON.stringify({
                    action: 'send_bale_receipt',
                    photo_base64: base64,
                    caption: `🆕 فاکتور قطب‌نما (${planSummary})\n👤 کاربر: ${AppState.fullName} (${nationalId})\n💰 مبلغ نهایی: ${UI.formatMoney(finalAmount)} تومان\n\n${invoiceText}`
                })
            }).catch(() => {});
        } catch (_) {}
    },


    // ======================================================================
    // 🟢 بخش ۱: ثبت‌نام مرحله دوم و خرید اولیه طرح مشاوره (Register Step 2)
    // ======================================================================
    async initStep2View() {
        UI.showLoader('در حال بارگذاری طرح‌های مشاوره...');
        await this.ensureCatalogLoaded();

        const targetNid = UI.toEngDigits(Storage.get('temp_reg_nid') || AppState.userId);
        if (!targetNid) {
            UI.hideLoader();
            Router.goToAuthView('login');
            return;
        }

        const st = await this.ensureStudentBeforeCheckout(targetNid);
        const rawGrade = st?.grade || AppState.studentGrade || 'دوازدهم';
        const normGrade = ['دهم', 'یازدهم'].includes(rawGrade) ? rawGrade : 'دوازدهم';
        const rawMajor = st?.major || AppState.studentMajor || 'تجربی';
        const normMajor = rawMajor.includes('ریاضی') ? 'ریاضی' : (rawMajor.includes('انسانی') ? 'انسانی' : 'تجربی');

        AppState.studentGrade = normGrade;
        AppState.studentMajor = normMajor;

        const badgeEl = document.getElementById('step2UserInfoBadge');
        if (badgeEl) {
            badgeEl.innerText = `${st?.full_name || AppState.fullName} | پایه ${rawGrade} (${normMajor})`;
        }

        // بررسی کد معرف
        this.step2State.hasReferral = false;
        const refCode = UI.toEngDigits(Storage.get('temp_referral_code'));
        if (refCode && refCode.trim().length > 0) {
            const { data: refUsers } = await supabaseClient
                .from('students')
                .select('national_id')
                .ilike('referral_code', refCode.trim())
                .limit(1);
            if (refUsers && refUsers.length > 0) {
                this.step2State.hasReferral = true;
            }
        }

        // بروزرسانی متن کارت «تا روز کنکور»
        if (AppState.konkurDateObj) {
            const shamsiKDate = new Intl.DateTimeFormat('fa-IR', { year: 'numeric', month: 'long', day: 'numeric' }).format(AppState.konkurDateObj);
            const lblEl = document.getElementById('step2KonkurMonthsLabel');
            const bdgEl = document.getElementById('step2KonkurDiscountBadge');
            if (lblEl) lblEl.innerText = `تا ${shamsiKDate} (${AppState.konkurDurationMonths} ماه)`;
            if (bdgEl) {
                const discTxt = AppState.konkurDurationMonths >= 8 ? '۱۵٪ تخفیف ویژه' : (AppState.konkurDurationMonths >= 6 ? '۱۰٪ تخفیف' : '۵٪ تخفیف');
                bdgEl.innerText = discTxt;
            }
        }

        // بارگذاری قوانین
        const rulesEl = document.getElementById('step2RulesList');
        if (rulesEl) rulesEl.innerHTML = this.getFilteredRulesHtml(normGrade);

        this.renderStep2PlanCards();
        UI.hideLoader();
        UI.refreshIcons();
    },

    renderStep2PlanCards() {
        const grid = document.getElementById('step2ConsultPlansGrid');
        if (!grid) return;

        const availablePlans = (AppState.services || []).filter(x =>
            x.category === 'consult' &&
            Number(x.base_price) > 0 &&
            (x.target_grade === AppState.studentGrade || x.target_grade === 'all') &&
            (x.target_major === AppState.studentMajor || x.target_major === 'all')
        );

        if (availablePlans.length === 0) {
            grid.innerHTML = '<div class="card-box center-card">در حال حاضر طرح فعالی برای پایه و رشته شما تعریف نشده است.</div>';
            return;
        }

        grid.innerHTML = availablePlans.map(plan => {
            const price = parseInt(plan.base_price) || 0;
            const isSelected = this.step2State.consultType === plan.type;
            const cap = plan.capacity !== null && plan.capacity !== undefined ? parseInt(plan.capacity) : 99;
            const isFull = cap <= 0;

            const capBadge = isFull
                ? `<div class="danger-text" style="font-size:11.5px;font-weight:800;margin-top:6px;">ظرفیت تکمیل</div>`
                : `<div class="${cap <= 5 ? 'danger-text' : 'success-text'}" style="font-size:11.5px;font-weight:800;margin-top:6px;">ظرفیت باقی‌مانده: ${cap} نفر</div>`;

            const featuresHtml = plan.features
                ? `<ul class="features-list">${plan.features.split('\n').filter(Boolean).map(f => `<li><i data-lucide="check" class="icon-sm primary-text"></i><span>${f}</span></li>`).join('')}</ul>`
                : '';

            return `
                <div class="option-card ${isSelected ? 'selected' : ''} ${isFull ? 'disabled' : ''}"
                     ${isFull ? '' : `onclick="StoreModule.selectStep2Plan('${plan.type}')"`}>
                    <div>
                        <div class="opt-title">${plan.title}</div>
                        <div class="opt-desc">${plan.description || ''}</div>
                        <div class="opt-price">${UI.formatMoney(price)} <small style="font-size:11px;color:var(--text-muted);">تومان / ماه</small></div>
                        ${capBadge}
                        ${featuresHtml}
                    </div>
                </div>
            `;
        }).join('');
        UI.refreshIcons();
    },

    selectStep2Plan(planType) {
        this.step2State.consultType = planType;
        this.renderStep2PlanCards();
        document.getElementById('step2DurationSection').style.display = 'block';
        document.getElementById('step2InvoiceSection').style.display = 'block';
        this.calculateStep2Invoice();
    },

    selectStep2Duration(durVal, cardEl) {
        this.step2State.durationVal = durVal;
        document.getElementById('step2SelectedDuration').value = durVal;
        document.querySelectorAll('#step2DurationGrid .duration-card').forEach(c => c.classList.remove('active'));
        if (cardEl) cardEl.classList.add('active');
        this.calculateStep2Invoice();
    },

    setStep2PayMethod(method) {
        this.step2State.paymentMethod = method;
        document.getElementById('btnStep2Cash')?.classList.toggle('active', method === 'cash');
        document.getElementById('btnStep2Installments')?.classList.toggle('active', method === 'installments');
        this.calculateStep2Invoice();
    },

    applyStep2Promo() {
        const codeInput = document.getElementById('step2PromoInput')?.value.trim().toUpperCase();
        const msgEl = document.getElementById('step2PromoMessage');
        if (!codeInput) return;

        const promoObj = (AppState.promos || []).find(p => p.code.toUpperCase() === codeInput);
        if (promoObj) {
            this.step2State.promoRate = (Number(promoObj.discount_percent) || 0) / 100;
            if (msgEl) {
                msgEl.innerText = `کد تخفیف تایید شد: ${promoObj.discount_percent}٪ تخفیف روی طرح مشاوره اعمال گردید.`;
                msgEl.className = 'promo-feedback success-text';
            }
        } else {
            this.step2State.promoRate = 0;
            if (msgEl) {
                msgEl.innerText = 'کد تخفیف واردشده معتبر نیست یا منقضی شده است.';
                msgEl.className = 'promo-feedback danger-text';
            }
        }
        this.calculateStep2Invoice();
    },

    calculateStep2Invoice() {
        if (this.step2State.consultType === 'none') return;

        const dVal = this.step2State.durationVal;
        const durMonths = dVal === 'konkur' ? AppState.konkurDurationMonths : (parseFloat(dVal) || 1);
        this.step2State.durationMonths = durMonths;

        const planObj = (AppState.services || []).find(x =>
            x.category === 'consult' &&
            x.type === this.step2State.consultType &&
            (x.target_grade === AppState.studentGrade || x.target_grade === 'all') &&
            (x.target_major === AppState.studentMajor || x.target_major === 'all')
        );
        const monthlyPrice = planObj ? parseInt(planObj.base_price) : 0;
        const totalBase = Math.round(monthlyPrice * durMonths);

        const promoDisc = Math.round(totalBase * this.step2State.promoRate);
        const subAfterPromo = Math.max(0, totalBase - promoDisc);

        const timeRate = this.getTimeDiscountRate(dVal, durMonths, this.step2State.paymentMethod);
        const timeDisc = Math.round(subAfterPromo * timeRate);

        let finalTotal = Math.max(0, subAfterPromo - timeDisc);
        const refDisc = this.step2State.hasReferral ? 100000 : 0;
        if (refDisc > 0) {
            finalTotal = Math.max(0, finalTotal - refDisc);
        }

        this.step2State.finance.base = totalBase;
        this.step2State.finance.discount = promoDisc + timeDisc + refDisc;
        this.step2State.finance.final = finalTotal;

        // بروزرسانی UI فاکتور
        document.getElementById('step2InvBase').innerText = `${UI.formatMoney(totalBase)} تومان`;

        const rowPromo = document.getElementById('step2RowPromoDisc');
        if (rowPromo) {
            rowPromo.style.display = promoDisc > 0 ? 'flex' : 'none';
            document.getElementById('step2InvPromoDisc').innerText = `- ${UI.formatMoney(promoDisc)} تومان`;
        }
        const rowTime = document.getElementById('step2RowTimeDisc');
        if (rowTime) {
            rowTime.style.display = timeDisc > 0 ? 'flex' : 'none';
            document.getElementById('step2InvTimeDisc').innerText = `- ${UI.formatMoney(timeDisc)} تومان`;
        }
        const rowRef = document.getElementById('step2RowRefDisc');
        if (rowRef) {
            rowRef.style.display = refDisc > 0 ? 'flex' : 'none';
            document.getElementById('step2InvRefDisc').innerText = `- ${UI.formatMoney(refDisc)} تومان`;
        }
        document.getElementById('step2InvTotal').innerText = `${UI.formatMoney(finalTotal)} تومان`;

        const instListEl = document.getElementById('step2InstallmentDetails');
        if (this.step2State.paymentMethod === 'installments' && finalTotal > 0) {
            const sched = this.buildInstallmentsSchedule(finalTotal, durMonths, 1);
            this.step2State.finance.upfront = sched.upfront;
            this.step2State.finance.installments = sched.installments;
            instListEl.innerHTML = sched.htmlItems;
            instListEl.style.display = 'block';
        } else {
            this.step2State.finance.upfront = finalTotal;
            this.step2State.finance.installments = [];
            instListEl.style.display = 'none';
        }

        document.getElementById('step2PayNowAmount').innerText = `${UI.formatMoney(this.step2State.finance.upfront)} تومان`;
        document.getElementById('step2ShabaBox').style.display = this.step2State.finance.upfront > 15000000 ? 'flex' : 'none';
    },

    async submitStep2Invoice() {
        if (this.step2State.consultType === 'none') {
            return UI.showToast('لطفاً ابتدا یکی از طرح‌های مشاوره را انتخاب کنید.', 'error');
        }
        if (!document.getElementById('step2RulesCheck')?.checked) {
            return UI.showToast('لطفاً قوانین و مقررات پذیرش را مطالعه و تایید نمایید.', 'error');
        }
        if (this.step2State.finance.upfront > 0 && !this.step2State.receiptBase64) {
            return UI.showToast('لطفاً تصویر فیش واریزی خود را بارگذاری نمایید.', 'error');
        }

        const btn = document.getElementById('btnStep2Submit');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span>در حال ثبت فاکتور...</span>';
        }

        try {
            const targetNid = UI.toEngDigits(Storage.get('temp_reg_nid') || AppState.userId);
            const st = await this.ensureStudentBeforeCheckout(targetNid);
            const userPhone = st?.phone_number || AppState.userPhone || targetNid;

            const dVal = this.step2State.durationVal;
            const durStr = dVal === 'konkur' ? `تا کنکور (${this.step2State.durationMonths} ماهه)` : `${this.step2State.durationMonths} ماهه`;

            let invoiceText = `طرح انتخابی:\n- مشاوره ${this.step2State.consultType} (${durStr})\n`;
            invoiceText += `مبلغ نهایی فاکتور: ${UI.formatMoney(this.step2State.finance.final)} تومان\n`;
            invoiceText += `روش پرداخت: ${this.step2State.paymentMethod === 'cash' ? 'نقدی' : 'اقساطی'}\n`;
            if (this.step2State.paymentMethod === 'installments') {
                invoiceText += `زمان‌بندی اقساط:\n${document.getElementById('step2InstallmentDetails')?.innerText.replace(/\n/g, ' | ')}\n`;
            }

            // ۱. ثبت فاکتور در جدول invoices (بدون ستون‌های حذف‌شده پانسیون)
            const invoicePayload = {
                student_nid: targetNid,
                user_phone: userPhone,
                invoice_type: 'ثبت‌نام جدید',
                invoice_details: invoiceText,
                total_amount: Math.round(this.step2State.finance.base) || 0,
                discount_amount: Math.round(this.step2State.finance.discount) || 0,
                final_amount: Math.round(this.step2State.finance.final) || 0,
                payment_method: this.step2State.paymentMethod,
                paid_upfront: Math.round(this.step2State.finance.upfront) || 0,
                receipt_base64: this.step2State.receiptBase64,
                mime_type: this.step2State.receiptMime,
                status: 'pending',
                consult_tier: this.step2State.consultType,
                con_duration: Number(this.step2State.durationMonths) || 1,
                con_base_value: Math.round(this.step2State.finance.base) || 0,
                con_actual_value: Math.round(this.step2State.finance.final) || 0
            };

            const { data: invRows, error: invErr } = await supabaseClient
                .from('invoices')
                .insert([invoicePayload])
                .select('id');

            if (invErr) throw new Error('خطا در ثبت فاکتور: ' + invErr.message);

            const invoiceId = invRows?.[0]?.id;

            // ۲. ثبت اقساط در جدول installments
            if (this.step2State.paymentMethod === 'installments' && this.step2State.finance.installments.length > 0 && invoiceId) {
                const instPayloads = this.step2State.finance.installments.map(inst => ({
                    invoice_id: invoiceId,
                    student_nid: targetNid,
                    user_phone: userPhone,
                    due_date: inst.due_date,
                    amount: Math.round(inst.amount),
                    installment_number: inst.installment_number,
                    status: 'pending_upload'
                }));
                await supabaseClient.from('installments').insert(instPayloads);
            }

            // ۳. اگر کاربر از بچه‌های فعال پانسیون نیست، وضعیتش به pending تغییر کند تا مدیر تایید کند
            if (!AppState.hasPansionActive && AppState.userMode !== 'pansion_monthly') {
                await supabaseClient.from('students').update({ status: 'pending' }).eq('national_id', targetNid);
            }

            // ۴. ارسال رسید به بله ادمین در پس‌زمینه
            this.notifyBaleInBackground(targetNid, 'ثبت‌نام جدید', invoiceText, this.step2State.receiptBase64, this.step2State.receiptMime, this.step2State.finance.final);

            Storage.remove('temp_reg_nid');
            Storage.remove('temp_referral_code');

            UI.showToast('فاکتور شما با موفقیت ثبت شد و در صف تایید مدیریت قرار گرفت.', 'success');

            if (AppState.hasPansionActive || AppState.userMode === 'pansion_monthly') {
                Router.showAppShell('home');
            } else {
                setTimeout(() => Router.goToAuthView('login'), 1800);
            }

        } catch (err) {
            UI.showToast(err.message || 'خطا در ثبت فاکتور', 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i data-lucide="check-circle-2" class="icon"></i><span>تایید نهایی و ثبت فاکتور</span>';
                UI.refreshIcons();
            }
        }
    },


    // ======================================================================
    // 🔵 بخش ۲: تمدید سریع اشتراک فعلی (Store Renew)
    // بدون نیاز به انتخاب مجدد طرح؛ تشخیص خودکار طرح فعلی و پرسش مدت زمان تمدید
    // ======================================================================
    async initRenewView() {
        const container = document.getElementById('storeRenewContainer');
        if (!container) return;
        container.innerHTML = '<div class="card-box center-card">در حال بررسی اشتراک فعلی شما...</div>';

        await this.ensureCatalogLoaded();
        const uid = String(AppState.userId);
        const uphone = String(AppState.userPhone || uid);

        await this.ensureStudentBeforeCheckout(uid);

        // دریافت اشتراک‌های فعال مشاوره و آخرین شماره قسط
        const [subsRes, instRes] = await Promise.all([
            supabaseClient
                .from('subscriptions')
                .select('*')
                .or(`student_nid.eq.${uid},user_phone.eq.${uphone}`)
                .eq('service_category', 'consult')
                .eq('status', 'active')
                .order('end_date', { ascending: false }),
            supabaseClient
                .from('installments')
                .select('installment_number')
                .eq('student_nid', uid)
        ]);

        const activeSubs = subsRes.data || [];
        const allInst = instRes.data || [];
        this.renewState.lastInstNum = allInst.length > 0
            ? Math.max(...allInst.map(i => parseInt(i.installment_number) || 0), 0)
            : 0;

        // اگر کاربر (مثلاً دانش‌آموز پانسیون ماهانه) هنوز هیچ اشتراک مشاوره‌ای ندارد -> هدایت مستقیم به خرید طرح اولیه
        if (activeSubs.length === 0) {
            container.innerHTML = `
                <div class="card-box center-card">
                    <div class="modal-icon-ring"><i data-lucide="compass" class="icon-lg"></i></div>
                    <h3>شما هنوز اشتراک مشاوره فعالی ندارید</h3>
                    <p class="muted-desc">برای تهیه اولین اشتراک مشاوره و برنامه‌ریزی قطب‌نما، از دکمه زیر طرح مد نظر خود را انتخاب کنید.</p>
                    <button type="button" class="btn-primary-full" onclick="AuthModule.goToBuySubscription()">
                        <i data-lucide="sparkles" class="icon"></i>
                        <span>مشاهده و خرید طرح‌های مشاوره</span>
                    </button>
                </div>
            `;
            UI.refreshIcons();
            return;
        }

        // اگر دانش‌آموز قبلاً تمدید کرده و ۲ قرارداد فعال دارد، تاریخ شروع تمدید جدید از پایانِ آخرین قراردادش محاسبه می‌شود!
        const latestSub = activeSubs[0];
        this.renewState.activeSub = latestSub;
        this.renewState.startDate = latestSub.end_date;

        const srv = (AppState.services || []).find(s =>
            s.category === 'consult' &&
            s.type.toLowerCase() === String(latestSub.service_type).toLowerCase() &&
            (s.target_grade === AppState.studentGrade || s.target_grade === 'all') &&
            (s.target_major === AppState.studentMajor || s.target_major === 'all')
        ) || (AppState.services || []).find(s => s.category === 'consult' && s.type.toLowerCase() === String(latestSub.service_type).toLowerCase());

        this.renewState.serviceObj = srv || { title: `طرح مشاوره ${latestSub.service_type}`, type: latestSub.service_type, base_price: 2500000 };

        const startD = latestSub.end_date ? new Date(latestSub.end_date) : new Date();
        const kDate = AppState.konkurDateObj || new Date('2027-07-01');
        const diffDays = Math.ceil((kDate - startD) / (1000 * 3600 * 24));
        const maxMonths = Math.max(0, Math.round((diffDays / 30.41) * 10) / 10);
        this.renewState.maxMonths = maxMonths;

        const shamsiEndCurrent = startD.toLocaleDateString('fa-IR', { year: 'numeric', month: 'long', day: 'numeric' });
        const shamsiKonkur = kDate.toLocaleDateString('fa-IR', { year: 'numeric', month: 'long', day: 'numeric' });

        if (maxMonths <= 0.2) {
            container.innerHTML = `
                <div class="card-box center-card">
                    <div class="modal-icon-ring success"><i data-lucide="check-circle-2" class="icon-lg"></i></div>
                    <h3>اشتراک شما تا روز کنکور معتبر است!</h3>
                    <p class="muted-desc">اعتبار طرح <strong>${this.renewState.serviceObj.title}</strong> شما تا تاریخ ${shamsiEndCurrent} فعال است و نیازی به تمدید مجدد ندارد.</p>
                </div>
            `;
            UI.refreshIcons();
            return;
        }

        this.renewState.durationVal = maxMonths >= 1 ? '1' : 'konkur';
        this.renewState.promoRate = 0;
        this.renewState.receiptBase64 = null;

        container.innerHTML = `
            <!-- بنر طرح فعلی و موجودی کیف پول -->
            <div class="card-box hero-summary-card">
                <div class="card-header-row" style="margin-bottom:8px;">
                    <div class="module-title-group">
                        <div class="module-icon-badge"><i data-lucide="badge-check" class="icon"></i></div>
                        <div>
                            <h3>تمدید ${this.renewState.serviceObj.title}</h3>
                            <p>شروع دوره جدید بلافاصله پس از پایان قرارداد فعلی (${shamsiEndCurrent})</p>
                        </div>
                    </div>
                    <span class="konkur-pill">کیف پول: ${UI.formatMoney(AppState.studentData?.wallet_balance || 0)} تومان</span>
                </div>
            </div>

            <!-- انتخاب مدت زمان تمدید با کارت‌های تعاملی -->
            <div class="section-title">
                <span class="bar"></span>
                <i data-lucide="calendar-clock" class="icon-sm"></i>
                <span>اشتراک خود را چند ماهه تمدید می‌کنید؟</span>
            </div>
            <div class="duration-cards-grid" id="renewDurationGrid">
                ${maxMonths >= 1 ? `
                    <div class="duration-card active" onclick="StoreModule.selectRenewDuration('1', this)">
                        <div class="dur-title">۱ ماهه</div>
                        <div class="dur-sub">تمدید برای یک ماه</div>
                    </div>
                ` : ''}
                ${maxMonths >= 3 ? `
                    <div class="duration-card" onclick="StoreModule.selectRenewDuration('3', this)">
                        <span class="dur-badge">۵٪ تخفیف</span>
                        <div class="dur-title">۳ ماهه</div>
                        <div class="dur-sub">تمدید فصلی</div>
                    </div>
                ` : ''}
                <div class="duration-card ${maxMonths < 1 ? 'active' : ''}" onclick="StoreModule.selectRenewDuration('konkur', this)">
                    <span class="dur-badge gold">${maxMonths >= 6 ? 'تا ۱۵٪ تخفیف' : 'تخفیف ویژه'}</span>
                    <div class="dur-title">تا روز کنکور</div>
                    <div class="dur-sub">تا ${shamsiKonkur} (${maxMonths} ماه)</div>
                </div>
            </div>

            <!-- فاکتور تمدید -->
            <div class="invoice-container">
                <div class="promo-row">
                    <input type="text" id="renewPromoInput" class="modern-input" placeholder="کد تخفیف دارید؟">
                    <button type="button" class="btn-promo" onclick="StoreModule.applyRenewPromo()">اعمال کد</button>
                </div>
                <div id="renewPromoMsg" class="promo-feedback"></div>

                <div class="segmented-pills" id="renewPaySwitch">
                    <button type="button" class="pill-btn active" id="btnRenewCash" onclick="StoreModule.setRenewPayMethod('cash')">
                        <i data-lucide="credit-card" class="icon-sm"></i> پرداخت نقدی
                    </button>
                    <button type="button" class="pill-btn" id="btnRenewInst" onclick="StoreModule.setRenewPayMethod('installments')">
                        <i data-lucide="calendar-range" class="icon-sm"></i> پرداخت اقساطی
                    </button>
                </div>

                <div class="invoice-rows">
                    <div class="inv-row"><span>هزینه پایه تمدید:</span><span id="renewInvBase">۰ تومان</span></div>
                    <div class="inv-row discount" id="renewRowPromo" style="display:none;"><span>کد تخفیف:</span><span id="renewInvPromo">- ۰ تومان</span></div>
                    <div class="inv-row discount" id="renewRowTime" style="display:none;"><span>تخفیف زمانی:</span><span id="renewInvTime">- ۰ تومان</span></div>
                    <div class="inv-row discount" id="renewRowWallet" style="display:none;"><span>کسر از موجودی کیف پول:</span><span id="renewInvWallet">- ۰ تومان</span></div>
                    <div class="inv-total"><span>مبلغ قابل پرداخت:</span><span id="renewInvTotal">۰ تومان</span></div>
                </div>

                <ul class="installments-preview-list" id="renewInstDetails" style="display:none;"></ul>

                <div class="rules-box">
                    <div class="rules-header"><i data-lucide="scroll-text" class="icon-sm"></i> قوانین و مقررات تمدید اشتراک</div>
                    <div class="rules-scroll"><ul>${this.getFilteredRulesHtml(AppState.studentGrade)}</ul></div>
                    <label class="checkbox-label">
                        <input type="checkbox" id="renewRulesCheck">
                        <span>تمامی قوانین فوق را مطالعه کردم و می‌پذیرم.</span>
                    </label>
                </div>

                <div class="bank-card-box" id="renewBankBox">
                    <div class="pay-now-label">مبلغ قابل واریز در این لحظه:</div>
                    <div class="pay-now-amount" id="renewPayNowAmount">۰ تومان</div>
                    <div class="bank-row">
                        <div>
                            <small>شماره کارت بانک سامان (ارشاد شفیعی فرد)</small>
                            <div class="card-num">6219 8618 1038 0484</div>
                        </div>
                        <button type="button" class="btn-copy-inline" onclick="UI.copyText('6219861810380484', this)">
                            <i data-lucide="copy" class="icon-sm"></i><span>کپی کارت</span>
                        </button>
                    </div>
                    <div class="bank-row" id="renewShabaBox" style="display:none;">
                        <div>
                            <small class="danger-text">مبالغ بالای ۱۵ میلیون تومان (شماره شبا)</small>
                            <div class="shaba-num">IR200560611828006108618001</div>
                        </div>
                        <button type="button" class="btn-copy-inline" onclick="UI.copyText('IR200560611828006108618001', this)">
                            <i data-lucide="copy" class="icon-sm"></i><span>کپی شبا</span>
                        </button>
                    </div>
                </div>

                <div class="receipt-upload-box" id="renewReceiptBox" onclick="document.getElementById('renewReceiptInput').click()">
                    <i data-lucide="upload-cloud" class="icon-xl"></i>
                    <div id="renewReceiptLabel">آپلود تصویر فیش واریزی (الزامی)</div>
                    <input type="file" id="renewReceiptInput" accept="image/*" style="display:none;" onchange="StoreModule.handleReceiptFile(this, 'renew')">
                </div>

                <div class="action-row">
                    <button type="button" class="btn-primary-full" id="btnRenewSubmit" onclick="StoreModule.submitRenewInvoice()">
                        <i data-lucide="check-circle-2" class="icon"></i>
                        <span>تایید نهایی و ثبت تمدید</span>
                    </button>
                </div>
            </div>
        `;

        this.calculateRenewInvoice();
        UI.refreshIcons();
    },

    selectRenewDuration(durVal, cardEl) {
        this.renewState.durationVal = durVal;
        document.querySelectorAll('#renewDurationGrid .duration-card').forEach(c => c.classList.remove('active'));
        if (cardEl) cardEl.classList.add('active');
        this.calculateRenewInvoice();
    },

    setRenewPayMethod(method) {
        this.renewState.paymentMethod = method;
        document.getElementById('btnRenewCash')?.classList.toggle('active', method === 'cash');
        document.getElementById('btnRenewInst')?.classList.toggle('active', method === 'installments');
        this.calculateRenewInvoice();
    },

    applyRenewPromo() {
        const codeInput = document.getElementById('renewPromoInput')?.value.trim().toUpperCase();
        const msgEl = document.getElementById('renewPromoMsg');
        if (!codeInput) return;

        const promoObj = (AppState.promos || []).find(p => p.code.toUpperCase() === codeInput);
        if (promoObj) {
            this.renewState.promoRate = (Number(promoObj.discount_percent) || 0) / 100;
            if (msgEl) {
                msgEl.innerText = `کد تایید شد: ${promoObj.discount_percent}٪ تخفیف اعمال گردید.`;
                msgEl.className = 'promo-feedback success-text';
            }
        } else {
            this.renewState.promoRate = 0;
            if (msgEl) {
                msgEl.innerText = 'کد تخفیف نامعتبر است.';
                msgEl.className = 'promo-feedback danger-text';
            }
        }
        this.calculateRenewInvoice();
    },

    calculateRenewInvoice() {
        const dVal = this.renewState.durationVal;
        const durMonths = dVal === 'konkur' ? this.renewState.maxMonths : (parseFloat(dVal) || 1);
        this.renewState.durationMonths = durMonths;

        const monthlyPrice = parseInt(this.renewState.serviceObj?.base_price) || 0;
        const totalBase = Math.round(monthlyPrice * durMonths);

        const promoDisc = Math.round(totalBase * this.renewState.promoRate);
        const netAfterPromo = Math.max(0, totalBase - promoDisc);

        const timeRate = this.getTimeDiscountRate(dVal, durMonths, this.renewState.paymentMethod);
        const timeDisc = Math.round(netAfterPromo * timeRate);

        let subTotal = Math.max(0, netAfterPromo - timeDisc);

        const curWallet = Number(AppState.studentData?.wallet_balance) || 0;
        const walletUsed = Math.min(curWallet, subTotal);
        subTotal -= walletUsed;

        this.renewState.finance.base = totalBase;
        this.renewState.finance.discount = promoDisc + timeDisc;
        this.renewState.finance.walletUsed = walletUsed;
        this.renewState.finance.newWallet = curWallet - walletUsed;
        this.renewState.finance.final = subTotal;

        document.getElementById('renewInvBase').innerText = `${UI.formatMoney(totalBase)} تومان`;
        const rowP = document.getElementById('renewRowPromo');
        if (rowP) { rowP.style.display = promoDisc > 0 ? 'flex' : 'none'; document.getElementById('renewInvPromo').innerText = `- ${UI.formatMoney(promoDisc)} تومان`; }
        const rowT = document.getElementById('renewRowTime');
        if (rowT) { rowT.style.display = timeDisc > 0 ? 'flex' : 'none'; document.getElementById('renewInvTime').innerText = `- ${UI.formatMoney(timeDisc)} تومان`; }
        const rowW = document.getElementById('renewRowWallet');
        if (rowW) { rowW.style.display = walletUsed > 0 ? 'flex' : 'none'; document.getElementById('renewInvWallet').innerText = `- ${UI.formatMoney(walletUsed)} تومان`; }
        document.getElementById('renewInvTotal').innerText = `${UI.formatMoney(subTotal)} تومان`;

        const instEl = document.getElementById('renewInstDetails');
        if (this.renewState.paymentMethod === 'installments' && subTotal > 0) {
            const sched = this.buildInstallmentsSchedule(subTotal, durMonths, this.renewState.lastInstNum + 1);
            this.renewState.finance.upfront = sched.upfront;
            this.renewState.finance.installments = sched.installments;
            instEl.innerHTML = sched.htmlItems;
            instEl.style.display = 'block';
        } else {
            this.renewState.finance.upfront = subTotal;
            this.renewState.finance.installments = [];
            instEl.style.display = 'none';
        }

        document.getElementById('renewPayNowAmount').innerText = `${UI.formatMoney(this.renewState.finance.upfront)} تومان`;
        document.getElementById('renewShabaBox').style.display = this.renewState.finance.upfront > 15000000 ? 'flex' : 'none';
        document.getElementById('renewReceiptBox').style.display = this.renewState.finance.upfront > 0 ? 'flex' : 'none';
    },

    async submitRenewInvoice() {
        if (!document.getElementById('renewRulesCheck')?.checked) {
            return UI.showToast('لطفاً قوانین تمدید اشتراک را تایید نمایید.', 'error');
        }
        if (this.renewState.finance.upfront > 0 && !this.renewState.receiptBase64) {
            return UI.showToast('لطفاً تصویر فیش واریزی را آپلود نمایید.', 'error');
        }

        const btn = document.getElementById('btnRenewSubmit');
        if (btn) { btn.disabled = true; btn.innerHTML = '<span>در حال ثبت قرارداد تمدید...</span>'; }

        try {
            const uid = String(AppState.userId);
            const uphone = String(AppState.userPhone || uid);
            const dVal = this.renewState.durationVal;
            const durTxt = dVal === 'konkur' ? `تا روز کنکور (${this.renewState.durationMonths} ماه)` : `${this.renewState.durationMonths} ماهه`;
            const startFa = this.renewState.startDate ? new Date(this.renewState.startDate).toLocaleDateString('fa-IR') : 'امروز';

            let invoiceText = `درخواست تمدید اشتراک:\n`;
            invoiceText += `- مشاوره ${this.renewState.serviceObj.type} | ${durTxt} (محاسبه از: ${startFa})\n`;
            invoiceText += `مبلغ نهایی فاکتور: ${UI.formatMoney(this.renewState.finance.final)} تومان\n`;
            invoiceText += `روش پرداخت: ${this.renewState.paymentMethod === 'cash' ? 'نقدی' : 'اقساطی'}\n`;
            if (this.renewState.paymentMethod === 'installments') {
                invoiceText += `زمان‌بندی اقساط:\n${document.getElementById('renewInstDetails')?.innerText.replace(/\n/g, ' | ')}\n`;
            }

            const invoicePayload = {
                student_nid: uid,
                user_phone: uphone,
                invoice_type: 'خرید از فروشگاه داخلی',
                invoice_details: invoiceText,
                total_amount: Math.round(this.renewState.finance.base) || 0,
                discount_amount: Math.round(this.renewState.finance.discount) || 0,
                final_amount: Math.round(this.renewState.finance.final) || 0,
                payment_method: this.renewState.paymentMethod,
                paid_upfront: Math.round(this.renewState.finance.upfront) || 0,
                receipt_base64: this.renewState.receiptBase64,
                mime_type: this.renewState.receiptMime,
                status: 'pending',
                consult_tier: this.renewState.serviceObj.type,
                con_duration: Number(this.renewState.durationMonths) || 1,
                con_base_value: Math.round(this.renewState.finance.base) || 0,
                con_actual_value: Math.round(this.renewState.finance.final + this.renewState.finance.walletUsed) || 0
            };

            const { data: invRows, error: invErr } = await supabaseClient.from('invoices').insert([invoicePayload]).select('id');
            if (invErr) throw new Error('خطا در ثبت فاکتور تمدید: ' + invErr.message);

            const invoiceId = invRows?.[0]?.id;
            if (this.renewState.paymentMethod === 'installments' && this.renewState.finance.installments.length > 0 && invoiceId) {
                const instPayloads = this.renewState.finance.installments.map(inst => ({
                    invoice_id: invoiceId,
                    student_nid: uid,
                    user_phone: uphone,
                    due_date: inst.due_date,
                    amount: Math.round(inst.amount),
                    installment_number: inst.installment_number,
                    status: 'pending_upload'
                }));
                await supabaseClient.from('installments').insert(instPayloads);
            }

            if (this.renewState.finance.walletUsed > 0) {
                await supabaseClient.from('students').update({ wallet_balance: this.renewState.finance.newWallet }).eq('national_id', uid);
                if (AppState.studentData) AppState.studentData.wallet_balance = this.renewState.finance.newWallet;
            }

            this.notifyBaleInBackground(uid, 'تمدید اشتراک', invoiceText, this.renewState.receiptBase64, this.renewState.receiptMime, this.renewState.finance.final);

            UI.showToast('درخواست تمدید شما با موفقیت ثبت شد و پس از تایید مدیریت اعمال می‌گردد.', 'success');
            Router.openSubPage('profile');

        } catch (err) {
            UI.showToast(err.message || 'خطا در ثبت تمدید', 'error');
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="check-circle-2" class="icon"></i><span>تایید نهایی و ثبت تمدید</span>'; UI.refreshIcons(); }
        }
    },


    // ======================================================================
    // 🟣 بخش ۳: تعویض، ارتقا و لغو طرح با تجمیع تمام قراردادهای فعال (Store Swap)
    // رفع باگ: اگر دانش‌آموز تمدید کرده و ۲ یا چند قرارداد فعال داشته باشد،
    // تمامی قراردادهای او جمع زده شده و کل ارزش پرداختی و روزهایش محاسبه می‌شود!
    // ======================================================================
    async initSwapView() {
        const container = document.getElementById('storeSwapContainer');
        if (!container) return;
        container.innerHTML = '<div class="card-box center-card">در حال بررسی سوابق قراردادها و اقساط شما...</div>';

        await this.ensureCatalogLoaded();
        const uid = String(AppState.userId);
        const uphone = String(AppState.userPhone || uid);

        await this.ensureStudentBeforeCheckout(uid);

        const [subsRes, instRes] = await Promise.all([
            supabaseClient
                .from('subscriptions')
                .select('*')
                .or(`student_nid.eq.${uid},user_phone.eq.${uphone}`)
                .eq('service_category', 'consult')
                .eq('status', 'active')
                .order('start_date', { ascending: true }),
            supabaseClient
                .from('installments')
                .select('*')
                .eq('student_nid', uid)
        ]);

        const activeConsultSubs = subsRes.data || [];
        const allInst = instRes.data || [];

        this.swapState.lastInstNum = allInst.length > 0
            ? Math.max(...allInst.map(i => parseInt(i.installment_number) || 0), 0)
            : 0;
        this.swapState.unpaidInstallments = allInst.filter(i => i.status === 'pending_upload' || i.status === 'pending_approval');

        if (activeConsultSubs.length === 0) {
            container.innerHTML = `
                <div class="card-box center-card">
                    <div class="modal-icon-ring"><i data-lucide="arrow-left-right" class="icon-lg"></i></div>
                    <h3>شما اشتراک مشاوره فعالی برای تعویض ندارید</h3>
                    <p class="muted-desc">ابتدا می‌توانید از بخش خرید اشتراک، طرح مشاوره مد نظر خود را تهیه فرمایید.</p>
                    <button type="button" class="btn-primary-full" onclick="AuthModule.goToBuySubscription()">
                        <i data-lucide="sparkles" class="icon"></i>
                        <span>مشاهده و خرید طرح مشاوره</span>
                    </button>
                </div>
            `;
            UI.refreshIcons();
            return;
        }

        // 🎯 تجمیع هوشمند تمام قراردادهای فعال مشاوره (حل مشکل کسانی که تمدید کرده‌اند و ۲ قرارداد دارند)
        let minStartDate = new Date(activeConsultSubs[0].start_date);
        let maxEndDate = new Date(activeConsultSubs[0].end_date);
        let sumActualPaid = 0;
        let sumBaseValue = 0;
        const voidInvoiceIds = [];
        const currentServiceType = activeConsultSubs[activeConsultSubs.length - 1].service_type;

        activeConsultSubs.forEach(sub => {
            const sD = new Date(sub.start_date);
            const eD = new Date(sub.end_date);
            if (sD < minStartDate) minStartDate = sD;
            if (eD > maxEndDate) maxEndDate = eD;
            sumActualPaid += (parseInt(sub.actual_paid_value) || 0);
            sumBaseValue += (parseInt(sub.base_total_value) || 0);
            if (sub.invoice_id && !voidInvoiceIds.includes(sub.invoice_id)) {
                voidInvoiceIds.push(sub.invoice_id);
            }
        });

        this.swapState.aggregatedSub = {
            count: activeConsultSubs.length,
            service_type: currentServiceType,
            start_date: minStartDate,
            end_date: maxEndDate,
            actual_paid_value: sumActualPaid,
            base_total_value: sumBaseValue,
            void_invoice_ids: voidInvoiceIds
        };

        this.swapState.selectedPlanId = 'no_change';
        this.swapState.selectedPlanType = 'no_change';
        this.swapState.durationVal = 'konkur';
        this.swapState.promoRate = 0;
        this.swapState.receiptBase64 = null;

        const shamsiKDate = AppState.konkurDateObj
            ? new Intl.DateTimeFormat('fa-IR', { year: 'numeric', month: 'long', day: 'numeric' }).format(AppState.konkurDateObj)
            : 'روز کنکور';

        container.innerHTML = `
            <div class="card-box hero-summary-card">
                <div class="card-header-row" style="margin-bottom:6px;">
                    <div class="module-title-group">
                        <div class="module-icon-badge"><i data-lucide="layers" class="icon"></i></div>
                        <div>
                            <h3>طرح فعلی شما: مشاوره ${currentServiceType} ${activeConsultSubs.length > 1 ? `(${activeConsultSubs.length} قرارداد تجمیع‌شده)` : ''}</h3>
                            <p>اعتبار تجمیعی تا ${maxEndDate.toLocaleDateString('fa-IR')} | مجموع ارزش ثبت‌شده: ${UI.formatMoney(sumActualPaid)} تومان</p>
                        </div>
                    </div>
                    <span class="konkur-pill">کیف پول: ${UI.formatMoney(AppState.studentData?.wallet_balance || 0)} تومان</span>
                </div>
            </div>

            <div class="section-title">
                <span class="bar"></span>
                <i data-lucide="arrow-left-right" class="icon-sm"></i>
                <span>۱. عملیات مورد نظر روی طرح مشاوره را انتخاب کنید</span>
            </div>
            <div class="plans-grid" id="swapPlansGrid"></div>

            <div id="swapDurationSection" style="display:none;">
                <div class="section-title">
                    <span class="bar"></span>
                    <i data-lucide="calendar-clock" class="icon-sm"></i>
                    <span>۲. مدت زمان طرح جایگزین جدید (از امروز)</span>
                </div>
                <div class="duration-cards-grid" id="swapDurationGrid">
                    <div class="duration-card" onclick="StoreModule.selectSwapDuration('1', this)">
                        <div class="dur-title">۱ ماهه</div>
                        <div class="dur-sub">قرارداد یک ماهه جدید</div>
                    </div>
                    ${AppState.konkurDurationMonths >= 3 ? `
                        <div class="duration-card" onclick="StoreModule.selectSwapDuration('3', this)">
                            <span class="dur-badge">۵٪ تخفیف</span>
                            <div class="dur-title">۳ ماهه</div>
                            <div class="dur-sub">قرارداد سه ماهه جدید</div>
                        </div>
                    ` : ''}
                    <div class="duration-card active" onclick="StoreModule.selectSwapDuration('konkur', this)">
                        <span class="dur-badge gold">تخفیف ویژه</span>
                        <div class="dur-title">تا روز کنکور</div>
                        <div class="dur-sub">تا ${shamsiKDate} (${AppState.konkurDurationMonths} ماه)</div>
                    </div>
                </div>
            </div>

            <div id="swapInvoiceSection" class="invoice-container" style="display:none;">
                <div id="swapTradeInBreakdown" style="margin-bottom:14px;"></div>

                <div class="promo-row" id="swapPromoRow">
                    <input type="text" id="swapPromoInput" class="modern-input" placeholder="کد تخفیف (ویژه طرح جدید)">
                    <button type="button" class="btn-promo" onclick="StoreModule.applySwapPromo()">اعمال کد</button>
                </div>
                <div id="swapPromoMsg" class="promo-feedback"></div>

                <div class="segmented-pills" id="swapPaySwitch">
                    <button type="button" class="pill-btn active" id="btnSwapCash" onclick="StoreModule.setSwapPayMethod('cash')">
                        <i data-lucide="credit-card" class="icon-sm"></i> پرداخت نقدی مابه‌التفاوت
                    </button>
                    <button type="button" class="pill-btn" id="btnSwapInst" onclick="StoreModule.setSwapPayMethod('installments')">
                        <i data-lucide="calendar-range" class="icon-sm"></i> پرداخت اقساطی
                    </button>
                </div>

                <div class="invoice-rows">
                    <div class="inv-row discount" id="swapRowRefund" style="display:none;"><span>ارزش بازخرید روزهای باقی‌مانده قبلی:</span><span id="swapInvRefund">+ ۰ تومان</span></div>
                    <div class="inv-row danger-text" id="swapRowOldDebt" style="display:none;"><span>تسویه اقساط باقی‌مانده قبلی:</span><span id="swapInvOldDebt">+ ۰ تومان</span></div>
                    <div class="inv-row" id="swapRowNewCharge" style="display:none;"><span>هزینه طرح جایگزین جدید:</span><span id="swapInvNewCharge">۰ تومان</span></div>
                    <div class="inv-row discount" id="swapRowDiscount" style="display:none;"><span>مجموع تخفیف‌های طرح جدید:</span><span id="swapInvDiscount">- ۰ تومان</span></div>
                    <div class="inv-row discount" id="swapRowWallet" style="display:none;"><span>کسر از موجودی کیف پول:</span><span id="swapInvWallet">- ۰ تومان</span></div>
                    <div class="inv-total"><span>مبلغ نهایی قابل پرداخت شما:</span><span id="swapInvTotal">۰ تومان</span></div>
                </div>

                <div id="swapCreditAlert" class="alert-box alert-success" style="display:none;"></div>
                <ul class="installments-preview-list" id="swapInstDetails" style="display:none;"></ul>

                <div class="rules-box">
                    <div class="rules-header"><i data-lucide="scroll-text" class="icon-sm"></i> قوانین معاوضه و فسخ قرارداد</div>
                    <div class="rules-scroll">
                        <ul>
                            ${this.getFilteredRulesHtml(AppState.studentGrade)}
                            <li>با ثبت این درخواست، قراردادهای قبلی و اقساط معوقه آن‌ها ابطال شده و مابه‌التفاوت طبق جدول فوق محاسبه می‌گردد.</li>
                        </ul>
                    </div>
                    <label class="checkbox-label">
                        <input type="checkbox" id="swapRulesCheck">
                        <span>تمامی شرایط معاوضه/لغو فوق را مطالعه کردم و می‌پذیرم.</span>
                    </label>
                </div>

                <div class="bank-card-box" id="swapBankBox" style="display:none;">
                    <div class="pay-now-label">مبلغ قابل واریز در این لحظه:</div>
                    <div class="pay-now-amount" id="swapPayNowAmount">۰ تومان</div>
                    <div class="bank-row">
                        <div>
                            <small>شماره کارت بانک سامان (ارشاد شفیعی فرد)</small>
                            <div class="card-num">6219 8618 1038 0484</div>
                        </div>
                        <button type="button" class="btn-copy-inline" onclick="UI.copyText('6219861810380484', this)">
                            <i data-lucide="copy" class="icon-sm"></i><span>کپی کارت</span>
                        </button>
                    </div>
                    <div class="bank-row" id="swapShabaBox" style="display:none;">
                        <div>
                            <small class="danger-text">مبالغ بالای ۱۵ میلیون تومان (شماره شبا)</small>
                            <div class="shaba-num">IR200560611828006108618001</div>
                        </div>
                        <button type="button" class="btn-copy-inline" onclick="UI.copyText('IR200560611828006108618001', this)">
                            <i data-lucide="copy" class="icon-sm"></i><span>کپی شبا</span>
                        </button>
                    </div>
                </div>

                <div class="receipt-upload-box" id="swapReceiptBox" style="display:none;" onclick="document.getElementById('swapReceiptInput').click()">
                    <i data-lucide="upload-cloud" class="icon-xl"></i>
                    <div id="swapReceiptLabel">آپلود تصویر فیش واریزی مابه‌التفاوت</div>
                    <input type="file" id="swapReceiptInput" accept="image/*" style="display:none;" onchange="StoreModule.handleReceiptFile(this, 'swap')">
                </div>

                <div class="action-row">
                    <button type="button" class="btn-primary-full" id="btnSwapSubmit" onclick="StoreModule.submitSwapInvoice()">
                        <i data-lucide="check-circle-2" class="icon"></i>
                        <span>تایید نهایی و ثبت درخواست جایگزین</span>
                    </button>
                </div>
            </div>
        `;

        this.renderSwapCards();
        UI.refreshIcons();
    },

    renderSwapCards() {
        const grid = document.getElementById('swapPlansGrid');
        if (!grid) return;

        const currType = String(this.swapState.aggregatedSub?.service_type || '').toLowerCase();
        let html = `
            <div class="option-card ${this.swapState.selectedPlanId === 'no_change' ? 'selected' : ''}"
                 onclick="StoreModule.selectSwapPlan('no_change', 'no_change')">
                <div>
                    <div class="opt-title">بدون تغییر (حفظ طرح فعلی)</div>
                    <div class="opt-desc">ادامه قرارداد و اقساط فعلی بدون تغییر</div>
                </div>
            </div>
            <div class="option-card ${this.swapState.selectedPlanId === 'none' ? 'selected' : ''}"
                 onclick="StoreModule.selectSwapPlan('none', 'none')">
                <div>
                    <div class="opt-title danger-text">لغو کامل اشتراک مشاوره</div>
                    <div class="opt-desc">بازخرید روزهای باقی‌مانده طبق قوانین فسخ و انتقال به کیف پول</div>
                </div>
            </div>
        `;

        const allowedPlans = (AppState.services || []).filter(x =>
            x.category === 'consult' &&
            Number(x.base_price) > 0 &&
            x.type.toLowerCase() !== currType &&
            (x.target_grade === AppState.studentGrade || x.target_grade === 'all') &&
            (x.target_major === AppState.studentMajor || x.target_major === 'all')
        );

        allowedPlans.forEach(plan => {
            const isSel = this.swapState.selectedPlanId === plan.id;
            const price = parseInt(plan.base_price) || 0;
            html += `
                <div class="option-card ${isSel ? 'selected' : ''}"
                     onclick="StoreModule.selectSwapPlan('${plan.id}', '${plan.type}')">
                    <div>
                        <div class="opt-title">${plan.title}</div>
                        <div class="opt-desc">${plan.description || ''}</div>
                        <div class="opt-price">${UI.formatMoney(price)} <small style="font-size:11px;color:var(--text-muted);">تومان / ماه</small></div>
                    </div>
                </div>
            `;
        });

        grid.innerHTML = html;
    },

    selectSwapPlan(planId, planType) {
        this.swapState.selectedPlanId = planId;
        this.swapState.selectedPlanType = planType;
        this.renderSwapCards();

        const isNewPlan = planId !== 'no_change' && planId !== 'none';
        document.getElementById('swapDurationSection').style.display = isNewPlan ? 'block' : 'none';
        document.getElementById('swapPromoRow').style.display = isNewPlan ? 'flex' : 'none';
        document.getElementById('swapInvoiceSection').style.display = planId === 'no_change' ? 'none' : 'block';

        if (planId !== 'no_change') {
            this.calculateSwapInvoice();
        }
    },

    selectSwapDuration(durVal, cardEl) {
        this.swapState.durationVal = durVal;
        document.querySelectorAll('#swapDurationGrid .duration-card').forEach(c => c.classList.remove('active'));
        if (cardEl) cardEl.classList.add('active');
        this.calculateSwapInvoice();
    },

    setSwapPayMethod(method) {
        this.swapState.paymentMethod = method;
        document.getElementById('btnSwapCash')?.classList.toggle('active', method === 'cash');
        document.getElementById('btnSwapInst')?.classList.toggle('active', method === 'installments');
        this.calculateSwapInvoice();
    },

    applySwapPromo() {
        const codeInput = document.getElementById('swapPromoInput')?.value.trim().toUpperCase();
        const msgEl = document.getElementById('swapPromoMsg');
        if (!codeInput) return;

        const promoObj = (AppState.promos || []).find(p => p.code.toUpperCase() === codeInput);
        if (promoObj) {
            this.swapState.promoRate = (Number(promoObj.discount_percent) || 0) / 100;
            if (msgEl) {
                msgEl.innerText = `کد تایید شد: ${promoObj.discount_percent}٪ تخفیف روی طرح جدید اعمال گردید.`;
                msgEl.className = 'promo-feedback success-text';
            }
        } else {
            this.swapState.promoRate = 0;
            if (msgEl) {
                msgEl.innerText = 'کد تخفیف نامعتبر است.';
                msgEl.className = 'promo-feedback danger-text';
            }
        }
        this.calculateSwapInvoice();
    },

    calculateSwapInvoice() {
        const agg = this.swapState.aggregatedSub;
        if (!agg || this.swapState.selectedPlanId === 'no_change') return;

        const dVal = this.swapState.durationVal;
        const conDur = dVal === 'konkur' ? AppState.konkurDurationMonths : (parseFloat(dVal) || 1);
        this.swapState.durationMonths = conDur;

        // ۱. محاسبه دقیق ارزش بازخرید از مجموع تمام قراردادهای فعال (چه ۱ قرارداد چه چند قرارداد تمدیدشده)
        const now = new Date();
        const consumedDays = Math.max(0, Math.ceil((now - agg.start_date) / (1000 * 3600 * 24)));
        const totalDays = Math.max(1, Math.ceil((agg.end_date - agg.start_date) / (1000 * 3600 * 24)));
        const totalMonths = Math.max(1, Math.round(totalDays / 30));

        const actualPaid = agg.actual_paid_value;
        const baseValue = agg.base_total_value || actualPaid;

        const dailyActualValue = actualPaid / totalDays;
        const dailyBaseValue = baseValue / totalDays;
        const monthlyBaseValue = baseValue / totalMonths;

        const newSrv = (AppState.services || []).find(s => s.id === this.swapState.selectedPlanId);
        const newBaseMonthly = newSrv ? parseInt(newSrv.base_price) : 0;

        const oldSrv = (AppState.services || []).find(s =>
            s.category === 'consult' && s.type.toLowerCase() === String(agg.service_type).toLowerCase()
        );
        const oldBaseMonthly = oldSrv ? parseInt(oldSrv.base_price) : 0;

        let valueConsumed = 0;
        let logicLabel = '';

        if (this.swapState.selectedPlanId === 'none') {
            const consumedMonths = Math.ceil(consumedDays / 30);
            valueConsumed = consumedMonths >= totalMonths ? actualPaid : (consumedMonths * monthlyBaseValue);
            logicLabel = `قانون لغو کامل (${consumedDays} روز مصرف -> گرد شده به ${consumedMonths} ماه با تعرفه پایه)`;
        } else if (newBaseMonthly < oldBaseMonthly) {
            valueConsumed = consumedDays * dailyBaseValue;
            logicLabel = `قانون تنزیل طرح (${consumedDays} روز مصرف روزشمار با تعرفه آزاد)`;
        } else {
            valueConsumed = consumedDays * dailyActualValue;
            logicLabel = `پاداش ارتقای طرح (${consumedDays} روز مصرف روزشمار با حفظ کامل تخفیف‌های قبلی)`;
        }

        let grossRefund = Math.max(0, actualPaid - valueConsumed);
        grossRefund = Math.floor(grossRefund / 10000) * 10000;

        // ۲. کسر اقساط پرداخت‌نشده قبلی (چون با تعویض طرح، اقساط قبلی باطل می‌شوند)
        let unpaidSum = 0;
        const voidIds = [...agg.void_invoice_ids];
        (this.swapState.unpaidInstallments || []).forEach(inst => {
            unpaidSum += (parseInt(inst.amount) || 0);
            if (inst.invoice_id && !voidIds.includes(inst.invoice_id)) {
                voidIds.push(inst.invoice_id);
            }
        });

        let netRefund = grossRefund - unpaidSum;
        let debtFromOldPlan = 0;
        if (netRefund < 0) {
            debtFromOldPlan = Math.abs(netRefund);
            netRefund = 0;
        }

        // نمایش جزئیات شفاف بازخرید
        const breakdownEl = document.getElementById('swapTradeInBreakdown');
        if (breakdownEl) {
            breakdownEl.innerHTML = `
                <div style="background:var(--surface);border:1px solid var(--border);border-right:4px solid var(--primary);padding:12px 14px;border-radius:14px;font-size:12px;">
                    <div style="font-weight:900;color:var(--primary);margin-bottom:4px;">جزئیات محاسبه بازخرید (${agg.count} قرارداد فعال):</div>
                    <div style="color:var(--text-muted);margin-bottom:4px;">${logicLabel}</div>
                    <div>مجموع ارزش قراردادهای قبلی: <strong>${UI.formatMoney(actualPaid)} تومان</strong> | کسر بابت مصرف: <strong>${UI.formatMoney(valueConsumed)} تومان</strong></div>
                    ${unpaidSum > 0 ? `<div class="danger-text">کسر بابت ابطال اقساط پرداخت‌نشده قبلی: <strong>- ${UI.formatMoney(unpaidSum)} تومان</strong></div>` : ''}
                    <div class="success-text" style="font-weight:900;margin-top:4px;">مانده خالص بستانکاری از قرارداد قبلی: ${UI.formatMoney(netRefund)} تومان</div>
                </div>
            `;
        }

        // ۳. محاسبه هزینه طرح جایگزین جدید
        const newCharge = this.swapState.selectedPlanId !== 'none' ? Math.round(newBaseMonthly * conDur) : 0;
        const promoDisc = Math.round(newCharge * this.swapState.promoRate);
        const timeRate = this.getTimeDiscountRate(dVal, conDur, this.swapState.paymentMethod);
        const timeDisc = Math.round(Math.max(0, newCharge - promoDisc) * timeRate);
        const totalDiscount = promoDisc + timeDisc;

        let subTotal = Math.max(0, newCharge - totalDiscount) + debtFromOldPlan;

        let transferredToWallet = 0;
        if (netRefund > 0) {
            if (netRefund > subTotal) {
                transferredToWallet = netRefund - subTotal;
                subTotal = 0;
            } else {
                subTotal -= netRefund;
            }
        }

        const curWallet = Number(AppState.studentData?.wallet_balance) || 0;
        let newWalletBalance = curWallet + transferredToWallet;
        let walletUsed = 0;
        if (subTotal > 0 && newWalletBalance > 0) {
            walletUsed = Math.min(newWalletBalance, subTotal);
            subTotal -= walletUsed;
            newWalletBalance -= walletUsed;
        }

        this.swapState.finance = {
            tradeInRefund: Math.round(netRefund),
            oldDebt: Math.round(debtFromOldPlan),
            newBase: Math.round(newCharge),
            discount: Math.round(totalDiscount),
            walletUsed: Math.round(walletUsed),
            newWallet: Math.round(newWalletBalance),
            walletNetChange: Math.round(transferredToWallet - walletUsed),
            final: Math.round(subTotal),
            upfront: Math.round(subTotal),
            actualValue: Math.round(Math.max(0, newCharge - totalDiscount)),
            installments: [],
            voidInvoiceIds: voidIds
        };

        // بروزرسانی UI فاکتور معاوضه
        const rowRef = document.getElementById('swapRowRefund');
        if (rowRef) { rowRef.style.display = netRefund > 0 ? 'flex' : 'none'; document.getElementById('swapInvRefund').innerText = `+ ${UI.formatMoney(netRefund)} تومان`; }
        const rowDebt = document.getElementById('swapRowOldDebt');
        if (rowDebt) { rowDebt.style.display = debtFromOldPlan > 0 ? 'flex' : 'none'; document.getElementById('swapInvOldDebt').innerText = `+ ${UI.formatMoney(debtFromOldPlan)} تومان`; }
        const rowNew = document.getElementById('swapRowNewCharge');
        if (rowNew) { rowNew.style.display = newCharge > 0 ? 'flex' : 'none'; document.getElementById('swapInvNewCharge').innerText = `${UI.formatMoney(newCharge)} تومان`; }
        const rowDisc = document.getElementById('swapRowDiscount');
        if (rowDisc) { rowDisc.style.display = totalDiscount > 0 ? 'flex' : 'none'; document.getElementById('swapInvDiscount').innerText = `- ${UI.formatMoney(totalDiscount)} تومان`; }
        const rowWal = document.getElementById('swapRowWallet');
        if (rowWal) { rowWal.style.display = walletUsed > 0 ? 'flex' : 'none'; document.getElementById('swapInvWallet').innerText = `- ${UI.formatMoney(walletUsed)} تومان`; }

        document.getElementById('swapInvTotal').innerText = `${UI.formatMoney(this.swapState.finance.final)} تومان`;

        const creditAlert = document.getElementById('swapCreditAlert');
        const instEl = document.getElementById('swapInstDetails');
        const bankBox = document.getElementById('swapBankBox');
        const recBox = document.getElementById('swapReceiptBox');

        if (this.swapState.finance.final === 0) {
            if (creditAlert) {
                creditAlert.style.display = 'block';
                creditAlert.innerText = transferredToWallet > 0
                    ? `شما بستانکار شدید! پس از تایید مدیریت، مبلغ ${UI.formatMoney(transferredToWallet)} تومان به کیف پول شما اضافه خواهد شد.`
                    : `مبلغ مابه‌التفاوت ۰ تومان است و نیازی به واریز وجه نیست.`;
            }
            instEl.style.display = 'none';
            bankBox.style.display = 'none';
            recBox.style.display = 'none';
            this.swapState.finance.upfront = 0;
        } else {
            if (creditAlert) creditAlert.style.display = 'none';
            bankBox.style.display = 'block';
            recBox.style.display = 'flex';

            if (this.swapState.paymentMethod === 'installments' && conDur > 1) {
                const sched = this.buildInstallmentsSchedule(this.swapState.finance.final, conDur, this.swapState.lastInstNum + 1);
                this.swapState.finance.upfront = sched.upfront;
                this.swapState.finance.installments = sched.installments;
                instEl.innerHTML = sched.htmlItems;
                instEl.style.display = 'block';
            } else {
                this.swapState.finance.upfront = this.swapState.finance.final;
                this.swapState.finance.installments = [];
                instEl.style.display = 'none';
            }

            document.getElementById('swapPayNowAmount').innerText = `${UI.formatMoney(this.swapState.finance.upfront)} تومان`;
            document.getElementById('swapShabaBox').style.display = this.swapState.finance.upfront > 15000000 ? 'flex' : 'none';
        }
    },

    async submitSwapInvoice() {
        if (!document.getElementById('swapRulesCheck')?.checked) {
            return UI.showToast('لطفاً قوانین معاوضه و فسخ قرارداد را تایید نمایید.', 'error');
        }
        if (this.swapState.finance.final > 0 && !this.swapState.receiptBase64) {
            return UI.showToast('لطفاً تصویر فیش واریزی مابه‌التفاوت را آپلود نمایید.', 'error');
        }

        const btn = document.getElementById('btnSwapSubmit');
        if (btn) { btn.disabled = true; btn.innerHTML = '<span>در حال ثبت درخواست...</span>'; }

        try {
            const uid = String(AppState.userId);
            const uphone = String(AppState.userPhone || uid);
            const dVal = this.swapState.durationVal;
            const durStr = dVal === 'konkur' ? `تا کنکور (${this.swapState.durationMonths} ماهه)` : `${this.swapState.durationMonths} ماهه`;

            const tradeInMeta = {
                consult: {
                    action: this.swapState.selectedPlanId === 'none' ? 'cancel' : 'change',
                    type: this.swapState.selectedPlanType,
                    dur: dVal
                },
                walletChange: this.swapState.finance.walletNetChange,
                void_invoice_ids: this.swapState.finance.voidInvoiceIds
            };

            let invoiceText = `⚠️ عملیات تعویض / لغو (Trade-in):\n`;
            invoiceText += `[TRADE_IN_DATA: ${JSON.stringify(tradeInMeta)}]\n`;
            invoiceText += `- مشاوره: ${this.swapState.selectedPlanId === 'none' ? 'لغو کامل' : `تغییر به ${this.swapState.selectedPlanType} (${durStr})`}\n`;
            invoiceText += `ارزش بازخرید قراردادهای فعال قبلی: ${UI.formatMoney(this.swapState.finance.tradeInRefund)} تومان\n`;
            invoiceText += `مبلغ نهایی پرداختی (مابه‌التفاوت): ${UI.formatMoney(this.swapState.finance.final)} تومان\n`;
            if (this.swapState.paymentMethod === 'installments' && this.swapState.finance.installments.length > 0) {
                invoiceText += `زمان‌بندی اقساط جدید:\n${document.getElementById('swapInstDetails')?.innerText.replace(/\n/g, ' | ')}\n`;
            }

            const invoicePayload = {
                student_nid: uid,
                user_phone: uphone,
                invoice_type: 'تعویض و ارتقا',
                invoice_details: invoiceText,
                total_amount: this.swapState.finance.newBase,
                discount_amount: this.swapState.finance.discount,
                final_amount: this.swapState.finance.final,
                payment_method: this.swapState.paymentMethod,
                paid_upfront: this.swapState.finance.upfront,
                receipt_base64: this.swapState.receiptBase64 || null,
                mime_type: this.swapState.receiptMime || null,
                status: 'pending',
                consult_tier: this.swapState.selectedPlanType,
                con_duration: this.swapState.selectedPlanId === 'none' ? 0 : Number(this.swapState.durationMonths),
                con_base_value: this.swapState.finance.newBase,
                con_actual_value: this.swapState.finance.actualValue
            };

            const { data: invRows, error: invErr } = await supabaseClient.from('invoices').insert([invoicePayload]).select('id');
            if (invErr) throw new Error('خطا در ثبت فاکتور تعویض: ' + invErr.message);

            const invoiceId = invRows?.[0]?.id;
            if (this.swapState.finance.installments.length > 0 && invoiceId) {
                const instPayloads = this.swapState.finance.installments.map(inst => ({
                    invoice_id: invoiceId,
                    student_nid: uid,
                    user_phone: uphone,
                    due_date: inst.due_date,
                    amount: Math.round(inst.amount),
                    installment_number: inst.installment_number,
                    status: 'pending_upload'
                }));
                await supabaseClient.from('installments').insert(instPayloads);
            }

            this.notifyBaleInBackground(uid, 'تعویض و ارتقا', invoiceText, this.swapState.receiptBase64, this.swapState.receiptMime, this.swapState.finance.final);

            UI.showToast('درخواست تعویض/لغو طرح با موفقیت ثبت شد و در انتظار تایید مدیریت است.', 'success');
            Router.openSubPage('profile');

        } catch (err) {
            UI.showToast(err.message || 'خطا در ثبت درخواست', 'error');
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="check-circle-2" class="icon"></i><span>تایید نهایی و ثبت درخواست جایگزین</span>'; UI.refreshIcons(); }
        }
    }
};

window.StoreModule = StoreModule;
