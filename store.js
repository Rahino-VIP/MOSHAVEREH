/* ==========================================================================
   💳 ماژول جامع فروشگاه، اشتراک پرو (بدون مشاور) و طرح‌های مشاوره (پلاس و VIP)
   شامل:
   ۱. نمایش هر ۳ سطح: اشتراک پرو (۳۹۰/۸۹۰/۱۴۹۰) + طرح پلاس مشاوره + طرح VIP مشاوره
   ۲. بستن تمدید برای کسانی که اشتراک «تا روز کنکور» دارند ("این دیگه تهشه!")
   ۳. فعال شدن گزینه پرداخت اقساطی فقط برای مبالغ بالای ۳ میلیون تومان
   ۴. اعمال ۳۰٪ تخفیف طرح الماس پانسیون روی هر دو طرح مشاوره (پلاس و VIP)
   ۵. فعال‌سازی آنی در دیتابیس + ارسال تصویر فیش به ربات بله
   ========================================================================== */

const StoreModule = {
    catalogLoaded: false,

    // تعرفه مصوب اشتراک قطب‌نما پرو (هوشمند - بدون مشاور)
    proPricing: {
        '1': 390000,
        '3': 890000,
        '6': 1490000
    },

    step2State: {
        consultType: 'none', // 'pro' (بدون مشاور) | 'plus' (مشاوره استاندارد) | 'vip' (مشاوره ویژه)
        durationVal: '1',
        durationMonths: 1,
        paymentMethod: 'cash',
        promoRate: 0,
        hasReferral: false,
        isDiamondEligible: false,
        receiptBase64: null,
        receiptMime: null,
        finance: { base: 0, diamondDisc: 0, promoDisc: 0, timeDisc: 0, refDisc: 0, discount: 0, walletUsed: 0, final: 0, upfront: 0, installments: [] }
    },

    renewState: {
        activeSub: null,
        serviceObj: null,
        isProPlan: false,
        startDate: null,
        maxMonths: 10,
        durationVal: '1',
        durationMonths: 1,
        paymentMethod: 'cash',
        promoRate: 0,
        receiptBase64: null,
        receiptMime: null,
        lastInstNum: 0,
        finance: { base: 0, diamondDisc: 0, discount: 0, walletUsed: 0, newWallet: 0, final: 0, upfront: 0, installments: [] }
    },

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
        aggregatedSub: null,
        finance: {
            tradeInRefund: 0,
            oldDebt: 0,
            newBase: 0,
            diamondDisc: 0,
            discount: 0,
            walletUsed: 0,
            newWallet: 0,
            walletAdd: 0,
            final: 0,
            upfront: 0,
            installments: [],
            voidInvoiceIds: []
        }
    },

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

    // تشخیص اینکه آیا طرح انتخاب‌شده «اشتراک پرو (بدون مشاور)» است یا خیر
    isProType(planType) {
        const t = String(planType || '').trim().toLowerCase();
        return t === 'pro' || t === 'پرو';
    },

    // ارسال تصویر فیش واریزی به ربات بله در پس‌زمینه
    sendReceiptToBale(nationalId, operationTitle, planName, durationStr, paidNow, receiptBase64) {
        if (!receiptBase64 || typeof GAS_WEBAPP_URL === 'undefined') return;
        try {
            fetch(GAS_WEBAPP_URL, {
                method: 'POST',
                body: JSON.stringify({
                    action: 'send_bale_receipt',
                    photo_base64: receiptBase64,
                    caption: `🧾 فیش جدید قطب‌نما (${operationTitle})\n👤 دانش‌آموز: ${AppState.fullName} (${nationalId})\n🎯 طرح: ${planName} (${durationStr})\n💰 مبلغ واریزی الان: ${UI.formatMoney(paidNow)} تومان`
                })
            }).catch(() => {});
        } catch (_) {}
    },

    getTimeDiscountRate(durationVal, months, paymentMethod, isPro = false) {
        if (isPro) return 0;
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

    CancelStep2Checkout() {
        if (AppState.userId && Storage.get('qotbnama_user_id')) {
            Router.showAppShell('home');
        } else {
            Router.goToAuthView('login');
        }
    },

    // ======================================================================
    // 🟢 بخش ۱: ویترین اصلی خرید اشتراک (پرو + طرح پلاس مشاوره + طرح VIP مشاوره)
    // ======================================================================
    async initStep2View() {
        UI.showLoader('در حال بارگذاری طرح‌های قطب‌نما...');
        await this.ensureCatalogLoaded();

        const targetNid = UI.toEngDigits(Storage.get('temp_reg_nid') || AppState.userId);
        if (!targetNid) {
            UI.hideLoader();
            Router.goToAuthView('login');
            return;
        }

        const st = await this.ensureStudentBeforeCheckout(targetNid);
        const rawGrade = st?.grade || AppState.studentGrade || 'دوازدهم';
        const normGrade = (rawGrade.includes('دوازدهم') || rawGrade.includes('پشت') || rawGrade.includes('فارغ'))
            ? 'دوازدهم'
            : (rawGrade.includes('یازدهم') ? 'یازدهم' : 'دهم');
        const rawMajor = st?.major || AppState.studentMajor || 'تجربی';
        const normMajor = rawMajor.includes('ریاضی') ? 'ریاضی' : (rawMajor.includes('انسانی') ? 'انسانی' : 'تجربی');

        AppState.studentGrade = normGrade;
        AppState.studentMajor = normMajor;

        const userPhone = st?.phone_number || AppState.userPhone || targetNid;
        const { data: panSubs } = await supabaseClient
            .from('pan_monthly_subs')
            .select('id')
            .eq('phone_number', userPhone)
            .eq('status', 'active')
            .limit(1);

        AppState.hasPansionActive = Array.isArray(panSubs) && panSubs.length > 0;
        this.step2State.isDiamondEligible = AppState.hasPansionActive;

        const badgeEl = document.getElementById('step2UserInfoBadge');
        if (badgeEl) {
            badgeEl.innerHTML = `${st?.full_name || AppState.fullName} | پایه ${rawGrade} (${normMajor}) ${AppState.hasPansionActive ? '<span class="diamond-badge" style="margin-right:6px;">💎 مشمول ۳۰٪ تخفیف طرح الماس پانسیون</span>' : ''}`;
        }

        this.step2State.hasReferral = false;
        const refCode = UI.toEngDigits(st?.invited_by || Storage.get('temp_referral_code'));
        if (refCode && refCode.trim().length > 0 && !st?.referral_rewarded) {
            const { data: refUsers } = await supabaseClient
                .from('students')
                .select('national_id')
                .ilike('referral_code', refCode.trim())
                .limit(1);
            if (refUsers && refUsers.length > 0) {
                this.step2State.hasReferral = true;
            }
        }

        const rulesEl = document.getElementById('step2RulesList');
        if (rulesEl) rulesEl.innerHTML = this.getFilteredRulesHtml(normGrade);

        this.step2State.consultType = 'none';
        document.getElementById('step2DurationSection').style.display = 'none';
        document.getElementById('step2InvoiceSection').style.display = 'none';

        this.renderStep2PlanCards();
        UI.hideLoader();
        UI.refreshIcons();
    },

    renderStep2PlanCards() {
        const grid = document.getElementById('step2ConsultPlansGrid');
        if (!grid) return;

        // ۱. کارت اول: اشتراک قطب‌نما پرو (بدون مشاور - دسترسی کامل به ابزارها و برنامه هوشمند)
        const isProSelected = this.isProType(this.step2State.consultType);
        let html = `
            <div class="option-card ${isProSelected ? 'selected' : ''}"
                 onclick="StoreModule.selectStep2Plan('pro')">
                <div>
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                        <div class="opt-title">🚀 اشتراک قطب‌نما پرو (PRO)</div>
                        <span class="dur-badge">بدون مشاور</span>
                    </div>
                    <div class="opt-desc">دسترسی نامحدود به تمام امکانات هوشمند اپلیکیشن ویژه محصلان خودخوان</div>
                    <div class="opt-price">${UI.formatMoney(this.proPricing['1'])} <small style="font-size:11px;color:var(--text-muted);">تومان / ماهانه</small></div>
                    <ul class="features-list">
                        <li><i data-lucide="check" class="icon-sm primary-text"></i><span>ساخت نامحدود برنامه هفتگی هوشمند (منطبق با بودجه آزمون)</span></li>
                        <li><i data-lucide="check" class="icon-sm primary-text"></i><span>کلینیک تحلیل هوشمند هفتگی + آرشیو کامل نمودارها</span></li>
                        <li><i data-lucide="check" class="icon-sm primary-text"></i><span>جعبه لایتنر فرمول‌دار و ماتریس عادت‌های نامحدود</span></li>
                        <li><i data-lucide="zap" class="icon-sm gold-text"></i><span>بسته‌های ۳ ماهه (۸۹۰ت) و ۶ ماهه (۱,۴۹۰ت) با تخفیف ویژه</span></li>
                    </ul>
                </div>
            </div>
        `;

        // ۲. کارت‌های مشاوره از جدول services (هم طرح پلاس PLUS و هم طرح VIP نمایش داده می‌شوند!)
        const availablePlans = (AppState.services || []).filter(x =>
            x.category === 'consult' &&
            Number(x.base_price) > 0 &&
            (x.target_grade === AppState.studentGrade || x.target_grade === 'all') &&
            (x.target_major === AppState.studentMajor || x.target_major === 'all')
        ).sort((a, b) => (parseInt(a.base_price) || 0) - (parseInt(b.base_price) || 0));

        availablePlans.forEach(plan => {
            const rawPrice = parseInt(plan.base_price) || 0;
            const displayPrice = this.step2State.isDiamondEligible ? Math.round(rawPrice * 0.70) : rawPrice;
            const isSelected = String(this.step2State.consultType).toLowerCase() === String(plan.type).toLowerCase();
            const cap = plan.capacity !== null && plan.capacity !== undefined ? parseInt(plan.capacity) : 99;
            const isFull = cap <= 0;

            const diamondHtml = this.step2State.isDiamondEligible
                ? `<div class="diamond-badge" style="margin-bottom:6px;">💎 طرح الماس پانسیون (۳۰٪ تخفیف از ${UI.formatMoney(rawPrice)})</div>`
                : '';

            const capBadge = isFull
                ? `<div class="danger-text" style="font-size:11.5px;font-weight:800;margin-top:6px;">ظرفیت تکمیل</div>`
                : `<div class="${cap <= 5 ? 'danger-text' : 'success-text'}" style="font-size:11.5px;font-weight:800;margin-top:6px;">ظرفیت باقی‌مانده: ${cap} نفر</div>`;

            const cleanFeatures = (plan.features || '').split('\n').map(f => f.replace(/^✅\s*/, '').trim()).filter(Boolean);
            const featuresHtml = cleanFeatures.length > 0
                ? `<ul class="features-list">${cleanFeatures.map(f => `<li><i data-lucide="check" class="icon-sm primary-text"></i><span>${f}</span></li>`).join('')}</ul>`
                : '';

            html += `
                <div class="option-card ${isSelected ? 'selected' : ''} ${isFull ? 'disabled' : ''}"
                     ${isFull ? '' : `onclick="StoreModule.selectStep2Plan('${plan.type}')"`}>
                    <div>
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                            <div class="opt-title">${plan.title}</div>
                            <span class="dur-badge gold">با مشاور</span>
                        </div>
                        <div class="opt-desc">${plan.description || ''}</div>
                        ${diamondHtml}
                        <div class="opt-price">${UI.formatMoney(displayPrice)} <small style="font-size:11px;color:var(--text-muted);">تومان / ماه</small></div>
                        ${capBadge}
                        ${featuresHtml}
                    </div>
                </div>
            `;
        });

        grid.innerHTML = html;
        UI.refreshIcons();
    },

    selectStep2Plan(planType) {
        this.step2State.consultType = planType;
        this.renderStep2PlanCards();

        const durGrid = document.getElementById('step2DurationGrid');
        const isPro = this.isProType(planType);

        if (isPro) {
            this.step2State.paymentMethod = 'cash';
            if (durGrid) {
                durGrid.innerHTML = `
                    <div class="duration-card active" onclick="StoreModule.selectStep2Duration('1', this)">
                        <div class="dur-title">۱ ماهه</div>
                        <div class="dur-sub">۳۹۰,۰۰۰ تومان</div>
                    </div>
                    <div class="duration-card" onclick="StoreModule.selectStep2Duration('3', this)">
                        <span class="dur-badge">۲۸۰ هزار تومان سود</span>
                        <div class="dur-title">۳ ماهه</div>
                        <div class="dur-sub">۸۹۰,۰۰۰ تومان</div>
                    </div>
                    <div class="duration-card" onclick="StoreModule.selectStep2Duration('6', this)">
                        <span class="dur-badge gold">۸۵۰ هزار تومان سود</span>
                        <div class="dur-title">۶ ماهه</div>
                        <div class="dur-sub">۱,۴۹۰,۰۰۰ تومان</div>
                    </div>
                `;
            }
        } else {
            const shamsiKDate = AppState.konkurDateObj
                ? new Intl.DateTimeFormat('fa-IR', { year: 'numeric', month: 'long', day: 'numeric' }).format(AppState.konkurDateObj)
                : 'روز کنکور';
            const discTxt = AppState.konkurDurationMonths >= 8 ? '۱۵٪ تخفیف ویژه' : (AppState.konkurDurationMonths >= 6 ? '۱۰٪ تخفیف' : '۵٪ تخفیف');
            if (durGrid) {
                durGrid.innerHTML = `
                    <div class="duration-card active" onclick="StoreModule.selectStep2Duration('1', this)">
                        <div class="dur-title">۱ ماهه</div>
                        <div class="dur-sub">پرداخت ماه‌به‌ماه</div>
                    </div>
                    <div class="duration-card" onclick="StoreModule.selectStep2Duration('3', this)">
                        <span class="dur-badge">۵٪ تخفیف</span>
                        <div class="dur-title">۳ ماهه</div>
                        <div class="dur-sub">یک فصل کامل مطالعاتی</div>
                    </div>
                    <div class="duration-card" onclick="StoreModule.selectStep2Duration('konkur', this)">
                        <span class="dur-badge gold">${discTxt}</span>
                        <div class="dur-title">تا روز کنکور</div>
                        <div class="dur-sub">تا ${shamsiKDate} (${AppState.konkurDurationMonths} ماه)</div>
                    </div>
                `;
            }
        }

        this.step2State.durationVal = '1';
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
                msgEl.innerText = `کد تخفیف تایید شد: ${promoObj.discount_percent}٪ تخفیف اعمال گردید.`;
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

        const isPro = this.isProType(this.step2State.consultType);
        const dVal = String(this.step2State.durationVal);
        const durMonths = dVal === 'konkur' ? AppState.konkurDurationMonths : (parseFloat(dVal) || 1);
        this.step2State.durationMonths = durMonths;

        let totalBase = 0;
        let diamondDisc = 0;

        if (isPro) {
            totalBase = this.proPricing[dVal] || 390000;
        } else {
            const planObj = (AppState.services || []).find(x =>
                x.category === 'consult' &&
                String(x.type).toLowerCase() === String(this.step2State.consultType).toLowerCase() &&
                (x.target_grade === AppState.studentGrade || x.target_grade === 'all') &&
                (x.target_major === AppState.studentMajor || x.target_major === 'all')
            ) || (AppState.services || []).find(x => String(x.type).toLowerCase() === String(this.step2State.consultType).toLowerCase());

            const monthlyPrice = planObj ? parseInt(planObj.base_price) : 0;
            totalBase = Math.round(monthlyPrice * durMonths);

            if (this.step2State.isDiamondEligible) {
                diamondDisc = Math.round(totalBase * 0.30);
            }
        }

        const afterDiamond = Math.max(0, totalBase - diamondDisc);
        const promoDisc = Math.round(afterDiamond * this.step2State.promoRate);
        const afterPromo = Math.max(0, afterDiamond - promoDisc);

        // بررسی شرط ۳ میلیون تومان برای نمایش یا مخفی‌سازی دکمه اقساط (مورد ۳)
        const refDisc = this.step2State.hasReferral ? 100000 : 0;
        const curWallet = Number(AppState.studentData?.wallet_balance) || 0;
        const approxPayable = Math.max(0, afterPromo - refDisc - curWallet);
        const canUseInstallments = !isPro && approxPayable > 3000000;

        const paySwitch = document.getElementById('step2PayMethodSwitch');
        if (paySwitch) {
            paySwitch.style.display = canUseInstallments ? 'flex' : 'none';
        }
        if (!canUseInstallments && this.step2State.paymentMethod === 'installments') {
            this.step2State.paymentMethod = 'cash';
            document.getElementById('btnStep2Cash')?.classList.add('active');
            document.getElementById('btnStep2Installments')?.classList.remove('active');
        }

        const timeRate = this.getTimeDiscountRate(dVal, durMonths, this.step2State.paymentMethod, isPro);
        const timeDisc = Math.round(afterPromo * timeRate);

        let finalTotal = Math.max(0, afterPromo - timeDisc);
        if (refDisc > 0) {
            finalTotal = Math.max(0, finalTotal - refDisc);
        }

        const walletUsed = Math.min(curWallet, finalTotal);
        finalTotal -= walletUsed;

        this.step2State.finance = {
            base: totalBase,
            diamondDisc: diamondDisc,
            promoDisc: promoDisc,
            timeDisc: timeDisc,
            refDisc: refDisc,
            discount: diamondDisc + promoDisc + timeDisc + refDisc,
            walletUsed: walletUsed,
            final: finalTotal,
            upfront: finalTotal,
            installments: []
        };

        document.getElementById('step2InvBase').innerText = `${UI.formatMoney(totalBase)} تومان`;

        const rowDiamond = document.getElementById('step2RowDiamondDisc');
        if (rowDiamond) {
            rowDiamond.style.display = diamondDisc > 0 ? 'flex' : 'none';
            document.getElementById('step2InvDiamondDisc').innerText = `- ${UI.formatMoney(diamondDisc)} تومان`;
        }
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
        if (canUseInstallments && this.step2State.paymentMethod === 'installments' && finalTotal > 3000000) {
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
            return UI.showToast('لطفاً ابتدا یکی از طرح‌ها را انتخاب کنید.', 'error');
        }
        if (!document.getElementById('step2RulesCheck')?.checked) {
            return UI.showToast('لطفاً قوانین و مقررات را مطالعه و تایید نمایید.', 'error');
        }
        if (this.step2State.finance.upfront > 0 && !this.step2State.receiptBase64) {
            return UI.showToast('لطفاً تصویر فیش واریزی خود را بارگذاری نمایید.', 'error');
        }

        const btn = document.getElementById('btnStep2Submit');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span>در حال فعال‌سازی فوری اشتراک...</span>';
        }

        try {
            const targetNid = UI.toEngDigits(Storage.get('temp_reg_nid') || AppState.userId);
            const dVal = this.step2State.durationVal;
            const durStr = dVal === 'konkur' ? `تا کنکور (${this.step2State.durationMonths} ماهه)` : `${this.step2State.durationMonths} ماهه`;

            let invoiceText = `خرید و فعال‌سازی فوری:\n- طرح ${this.step2State.consultType} (${durStr})\n`;
            if (this.step2State.finance.diamondDisc > 0) {
                invoiceText += `- شامل ۳۰٪ تخفیف طرح الماس پانسیون\n`;
            }
            invoiceText += `مبلغ نهایی فاکتور: ${UI.formatMoney(this.step2State.finance.final)} تومان\n`;

            const { error } = await supabaseClient.rpc('process_instant_checkout', {
                p_invoice_type: 'ثبت‌نام جدید',
                p_consult_tier: this.step2State.consultType,
                p_con_duration: Number(this.step2State.durationMonths) || 1,
                p_total_amount: Math.round(this.step2State.finance.base) || 0,
                p_discount_amount: Math.round(this.step2State.finance.discount) || 0,
                p_final_amount: Math.round(this.step2State.finance.final) || 0,
                p_payment_method: this.step2State.paymentMethod,
                p_paid_upfront: Math.round(this.step2State.finance.upfront) || 0,
                p_wallet_used: Math.round(this.step2State.finance.walletUsed) || 0,
                p_wallet_added: 0,
                p_invoice_details: invoiceText,
                p_receipt_base64: this.step2State.receiptBase64,
                p_mime_type: this.step2State.receiptMime,
                p_installments: this.step2State.finance.installments,
                p_void_invoice_ids: []
            });

            if (error) throw new Error(error.message);

            // ارسال تصویر فیش به بله ادمین
            this.sendReceiptToBale(targetNid, 'خرید اشتراک جدید', this.step2State.consultType, durStr, this.step2State.finance.upfront, this.step2State.receiptBase64);

            Storage.remove('temp_reg_nid');
            Storage.remove('temp_referral_code');

            await AppCore.bootstrapLoggedInUser();
            Router.showAppShell('home');
            UI.showToast(`🎉 اشتراک «${this.step2State.consultType}» شما هم‌اکنون فعال شد!`, 'success');

        } catch (err) {
            UI.showToast(err.message || 'خطا در فعال‌سازی اشتراک', 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i data-lucide="check-circle-2" class="icon"></i><span>تایید نهایی و فعال‌سازی آنی</span>';
                UI.refreshIcons();
            }
        }
    },


    // ======================================================================
    // 🔵 بخش ۲: تمدید سریع اشتراک فعلی (بستن تمدید در صورت داشتن طرح تا کنکور)
    // ======================================================================
    async initRenewView() {
        const container = document.getElementById('storeRenewContainer');
        if (!container) return;
        container.innerHTML = '<div class="card-box center-card">در حال بررسی اشتراک فعلی شما...</div>';

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

        if (activeSubs.length === 0) {
            container.innerHTML = `
                <div class="card-box center-card">
                    <div class="modal-icon-ring"><i data-lucide="sparkles" class="icon-lg"></i></div>
                    <h3>خرید اشتراک قطب‌نما پرو یا مشاوره</h3>
                    <p class="muted-desc">شما در حال استفاده از نسخه رایگان هستید. برای مشاهده اشتراک پرو (۳۹۰ت ماهانه) و طرح‌های مشاوره (پلاس و VIP)، روی دکمه زیر بزنید.</p>
                    <button type="button" class="btn-primary-full" onclick="AuthModule.goToBuySubscription()">
                        <i data-lucide="shopping-bag" class="icon"></i>
                        <span>مشاهده تعرفه‌ها و فعال‌سازی آنی اشتراک</span>
                    </button>
                </div>
            `;
            UI.refreshIcons();
            return;
        }

        const latestSub = activeSubs[0];
        this.renewState.activeSub = latestSub;
        this.renewState.startDate = latestSub.end_date;
        this.renewState.isProPlan = this.isProType(latestSub.service_type);

        if (this.renewState.isProPlan) {
            this.renewState.serviceObj = { title: 'اشتراک قطب‌نما پرو (PRO)', type: 'pro', base_price: 390000 };
        } else {
            const srv = (AppState.services || []).find(s =>
                s.category === 'consult' &&
                String(s.type).toLowerCase() === String(latestSub.service_type).toLowerCase() &&
                (s.target_grade === AppState.studentGrade || s.target_grade === 'all') &&
                (s.target_major === AppState.studentMajor || s.target_major === 'all')
            ) || (AppState.services || []).find(s => s.category === 'consult' && String(s.type).toLowerCase() === String(latestSub.service_type).toLowerCase());

            this.renewState.serviceObj = srv || { title: `طرح مشاوره ${latestSub.service_type}`, type: latestSub.service_type, base_price: 1200000 };
        }

        const startD = latestSub.end_date ? new Date(latestSub.end_date) : new Date();
        const kDate = AppState.konkurDateObj || new Date('2027-07-01');
        const diffDays = Math.ceil((kDate - startD) / (1000 * 3600 * 24));
        const maxMonths = Math.max(0, Math.round((diffDays / 30.41) * 10) / 10);
        this.renewState.maxMonths = maxMonths;

        const shamsiEndCurrent = startD.toLocaleDateString('fa-IR', { year: 'numeric', month: 'long', day: 'numeric' });
        const shamsiKonkur = kDate.toLocaleDateString('fa-IR', { year: 'numeric', month: 'long', day: 'numeric' });

        // 🛑 مورد ۲: اگر دانش‌آموز طرح تا روز کنکور دارد، اجازه تمدید مجدد نده!
        if (maxMonths <= 0.5) {
            container.innerHTML = `
                <div class="card-box center-card" style="padding:32px 20px;">
                    <div class="modal-icon-ring success"><i data-lucide="trophy" class="icon-lg"></i></div>
                    <h3 class="success-text" style="font-size:17px;">این دیگه تهشه! اشتراک شما تا روز کنکور فعاله 🚀</h3>
                    <p class="muted-desc" style="margin-top:8px;">
                        شما بالاترین بازه زمانی ممکن رو دارید و اعتبار <strong>${this.renewState.serviceObj.title}</strong> شما تا تاریخ <strong>${shamsiEndCurrent}</strong> (روز کنکور) کاملاً فعاله و نیازی به تمدید نداره!
                    </p>
                    <button type="button" class="btn-outline-full" style="max-width:260px; margin:0 auto;" onclick="Router.openSubPage('store-swap')">
                        <i data-lucide="arrow-left-right" class="icon-sm"></i>
                        <span>می‌خوام نوع طرحم رو ارتقا بدم</span>
                    </button>
                </div>
            `;
            UI.refreshIcons();
            return;
        }

        this.renewState.durationVal = maxMonths >= 1 ? '1' : 'konkur';
        this.renewState.promoRate = 0;
        this.renewState.receiptBase64 = null;

        const durationCardsHtml = this.renewState.isProPlan ? `
            <div class="duration-card active" onclick="StoreModule.selectRenewDuration('1', this)">
                <div class="dur-title">۱ ماهه</div>
                <div class="dur-sub">۳۹۰,۰۰۰ تومان</div>
            </div>
            <div class="duration-card" onclick="StoreModule.selectRenewDuration('3', this)">
                <span class="dur-badge">به‌صرفه</span>
                <div class="dur-title">۳ ماهه</div>
                <div class="dur-sub">۸۹۰,۰۰۰ تومان</div>
            </div>
            <div class="duration-card" onclick="StoreModule.selectRenewDuration('6', this)">
                <span class="dur-badge gold">پیشنهاد ویژه</span>
                <div class="dur-title">۶ ماهه</div>
                <div class="dur-sub">۱,۴۹۰,۰۰۰ تومان</div>
            </div>
        ` : `
            ${maxMonths >= 1 ? `
                <div class="duration-card active" onclick="StoreModule.selectRenewDuration('1', this)">
                    <div class="dur-title">۱ ماهه</div>
                    <div class="dur-sub">تمدید یک ماهه</div>
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
                <span class="dur-badge gold">تخفیف ویژه</span>
                <div class="dur-title">تا روز کنکور</div>
                <div class="dur-sub">تا ${shamsiKonkur} (${maxMonths} ماه)</div>
            </div>
        `;

        container.innerHTML = `
            <div class="card-box hero-summary-card">
                <div class="card-header-row" style="margin-bottom:8px;">
                    <div class="module-title-group">
                        <div class="module-icon-badge"><i data-lucide="badge-check" class="icon"></i></div>
                        <div>
                            <h3>تمدید ${this.renewState.serviceObj.title}</h3>
                            <p>اضافه شدن آنی اعتبار به انتهای قرارداد فعلی (${shamsiEndCurrent})</p>
                        </div>
                    </div>
                    <span class="konkur-pill">کیف پول: ${UI.formatMoney(AppState.studentData?.wallet_balance || 0)} تومان</span>
                </div>
            </div>

            <div class="section-title">
                <span class="bar"></span>
                <i data-lucide="calendar-clock" class="icon-sm"></i>
                <span>مدت زمان تمدید را انتخاب کنید:</span>
            </div>
            <div class="duration-cards-grid" id="renewDurationGrid">${durationCardsHtml}</div>

            <div class="invoice-container">
                <div class="promo-row">
                    <input type="text" id="renewPromoInput" class="modern-input" placeholder="کد تخفیف دارید؟">
                    <button type="button" class="btn-promo" onclick="StoreModule.applyRenewPromo()">اعمال کد</button>
                </div>
                <div id="renewPromoMsg" class="promo-feedback"></div>

                <div class="segmented-pills" id="renewPaySwitch" style="display:none;">
                    <button type="button" class="pill-btn active" id="btnRenewCash" onclick="StoreModule.setRenewPayMethod('cash')">
                        <i data-lucide="credit-card" class="icon-sm"></i> پرداخت نقدی
                    </button>
                    <button type="button" class="pill-btn" id="btnRenewInst" onclick="StoreModule.setRenewPayMethod('installments')">
                        <i data-lucide="calendar-range" class="icon-sm"></i> پرداخت اقساطی
                    </button>
                </div>

                <div class="invoice-rows">
                    <div class="inv-row"><span>هزینه پایه تمدید:</span><span id="renewInvBase">۰ تومان</span></div>
                    <div class="inv-row discount" id="renewRowDiamond" style="display:none;"><span>💎 تخفیف ۳۰٪ طرح الماس پانسیون:</span><span id="renewInvDiamond">- ۰ تومان</span></div>
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
                </div>

                <div class="receipt-upload-box" id="renewReceiptBox" onclick="document.getElementById('renewReceiptInput').click()">
                    <i data-lucide="upload-cloud" class="icon-xl"></i>
                    <div id="renewReceiptLabel">آپلود تصویر فیش واریزی (الزامی)</div>
                    <input type="file" id="renewReceiptInput" accept="image/*" style="display:none;" onchange="StoreModule.handleReceiptFile(this, 'renew')">
                </div>

                <div class="action-row">
                    <button type="button" class="btn-primary-full" id="btnRenewSubmit" onclick="StoreModule.submitRenewInvoice()">
                        <i data-lucide="check-circle-2" class="icon"></i>
                        <span>تایید نهایی و تمدید آنی اشتراک</span>
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
        const dVal = String(this.renewState.durationVal);
        const durMonths = dVal === 'konkur' ? this.renewState.maxMonths : (parseFloat(dVal) || 1);
        this.renewState.durationMonths = durMonths;

        let totalBase = 0;
        let diamondDisc = 0;

        if (this.renewState.isProPlan) {
            totalBase = this.proPricing[dVal] || 390000;
        } else {
            const monthlyPrice = parseInt(this.renewState.serviceObj?.base_price) || 0;
            totalBase = Math.round(monthlyPrice * durMonths);
            if (AppState.hasPansionActive) {
                diamondDisc = Math.round(totalBase * 0.30);
            }
        }

        const afterDiamond = Math.max(0, totalBase - diamondDisc);
        const promoDisc = Math.round(afterDiamond * this.renewState.promoRate);
        const netAfterPromo = Math.max(0, afterDiamond - promoDisc);

        const curWallet = Number(AppState.studentData?.wallet_balance) || 0;
        const approxPayable = Math.max(0, netAfterPromo - curWallet);
        const canUseInstallments = !this.renewState.isProPlan && approxPayable > 3000000;

        const paySwitch = document.getElementById('renewPaySwitch');
        if (paySwitch) {
            paySwitch.style.display = canUseInstallments ? 'flex' : 'none';
        }
        if (!canUseInstallments && this.renewState.paymentMethod === 'installments') {
            this.renewState.paymentMethod = 'cash';
            document.getElementById('btnRenewCash')?.classList.add('active');
            document.getElementById('btnRenewInst')?.classList.remove('active');
        }

        const timeRate = this.getTimeDiscountRate(dVal, durMonths, this.renewState.paymentMethod, this.renewState.isProPlan);
        const timeDisc = Math.round(netAfterPromo * timeRate);

        let subTotal = Math.max(0, netAfterPromo - timeDisc);
        const walletUsed = Math.min(curWallet, subTotal);
        subTotal -= walletUsed;

        this.renewState.finance = {
            base: totalBase,
            diamondDisc: diamondDisc,
            discount: diamondDisc + promoDisc + timeDisc,
            walletUsed: walletUsed,
            newWallet: curWallet - walletUsed,
            final: subTotal,
            upfront: subTotal,
            installments: []
        };

        document.getElementById('renewInvBase').innerText = `${UI.formatMoney(totalBase)} تومان`;
        const rowD = document.getElementById('renewRowDiamond');
        if (rowD) { rowD.style.display = diamondDisc > 0 ? 'flex' : 'none'; document.getElementById('renewInvDiamond').innerText = `- ${UI.formatMoney(diamondDisc)} تومان`; }
        const rowP = document.getElementById('renewRowPromo');
        if (rowP) { rowP.style.display = promoDisc > 0 ? 'flex' : 'none'; document.getElementById('renewInvPromo').innerText = `- ${UI.formatMoney(promoDisc)} تومان`; }
        const rowT = document.getElementById('renewRowTime');
        if (rowT) { rowT.style.display = timeDisc > 0 ? 'flex' : 'none'; document.getElementById('renewInvTime').innerText = `- ${UI.formatMoney(timeDisc)} تومان`; }
        const rowW = document.getElementById('renewRowWallet');
        if (rowW) { rowW.style.display = walletUsed > 0 ? 'flex' : 'none'; document.getElementById('renewInvWallet').innerText = `- ${UI.formatMoney(walletUsed)} تومان`; }
        document.getElementById('renewInvTotal').innerText = `${UI.formatMoney(subTotal)} تومان`;

        const instEl = document.getElementById('renewInstDetails');
        if (canUseInstallments && this.renewState.paymentMethod === 'installments' && subTotal > 3000000) {
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
        if (btn) { btn.disabled = true; btn.innerHTML = '<span>در حال ثبت و تمدید آنی...</span>'; }

        try {
            const uid = String(AppState.userId);
            const dVal = this.renewState.durationVal;
            const durTxt = dVal === 'konkur' ? `تا روز کنکور (${this.renewState.durationMonths} ماه)` : `${this.renewState.durationMonths} ماهه`;
            const invoiceText = `تمدید فوری اشتراک: طرح ${this.renewState.serviceObj.type} (${durTxt})`;

            const { error } = await supabaseClient.rpc('process_instant_checkout', {
                p_invoice_type: 'تمدید اشتراک',
                p_consult_tier: this.renewState.serviceObj.type,
                p_con_duration: Number(this.renewState.durationMonths) || 1,
                p_total_amount: Math.round(this.renewState.finance.base) || 0,
                p_discount_amount: Math.round(this.renewState.finance.discount) || 0,
                p_final_amount: Math.round(this.renewState.finance.final) || 0,
                p_payment_method: this.renewState.paymentMethod,
                p_paid_upfront: Math.round(this.renewState.finance.upfront) || 0,
                p_wallet_used: Math.round(this.renewState.finance.walletUsed) || 0,
                p_wallet_added: 0,
                p_invoice_details: invoiceText,
                p_receipt_base64: this.renewState.receiptBase64,
                p_mime_type: this.renewState.receiptMime,
                p_installments: this.renewState.finance.installments,
                p_void_invoice_ids: []
            });

            if (error) throw new Error(error.message);

            this.sendReceiptToBale(uid, 'تمدید اشتراک', this.renewState.serviceObj.type, durTxt, this.renewState.finance.upfront, this.renewState.receiptBase64);

            await AppCore.bootstrapLoggedInUser();
            Router.openSubPage('profile');
            UI.showToast('تمدید اشتراک شما با موفقیت انجام و به اعتبارتان اضافه شد!', 'success');

        } catch (err) {
            UI.showToast(err.message || 'خطا در ثبت تمدید', 'error');
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="check-circle-2" class="icon"></i><span>تایید نهایی و تمدید آنی اشتراک</span>'; UI.refreshIcons(); }
        }
    },


    // ======================================================================
    // 🟣 بخش ۳: تعویض، ارتقا و لغو طرح با تجمیع تمام قراردادهای فعال (Store Swap)
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
                    <h3>شما هنوز اشتراک فعالی برای تعویض ندارید</h3>
                    <p class="muted-desc">ابتدا می‌توانید از بخش فروشگاه، اشتراک پرو یا طرح مشاوره مد نظر خود را تهیه فرمایید.</p>
                    <button type="button" class="btn-primary-full" onclick="AuthModule.goToBuySubscription()">
                        <i data-lucide="sparkles" class="icon"></i>
                        <span>مشاهده و خرید اشتراک</span>
                    </button>
                </div>
            `;
            UI.refreshIcons();
            return;
        }

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
        this.swapState.durationVal = '1';
        this.swapState.promoRate = 0;
        this.swapState.receiptBase64 = null;

        container.innerHTML = `
            <div class="card-box hero-summary-card">
                <div class="card-header-row" style="margin-bottom:6px;">
                    <div class="module-title-group">
                        <div class="module-icon-badge"><i data-lucide="layers" class="icon"></i></div>
                        <div>
                            <h3>طرح فعلی شما: ${currentServiceType} ${activeConsultSubs.length > 1 ? `(${activeConsultSubs.length} قرارداد تجمیع‌شده)` : ''}</h3>
                            <p>اعتبار تجمیعی تا ${maxEndDate.toLocaleDateString('fa-IR')} | مجموع ارزش ثبت‌شده: ${UI.formatMoney(sumActualPaid)} تومان</p>
                        </div>
                    </div>
                    <span class="konkur-pill">کیف پول: ${UI.formatMoney(AppState.studentData?.wallet_balance || 0)} تومان</span>
                </div>
            </div>

            <div class="section-title">
                <span class="bar"></span>
                <i data-lucide="arrow-left-right" class="icon-sm"></i>
                <span>۱. طرح جایگزین مورد نظر را انتخاب کنید</span>
            </div>
            <div class="plans-grid" id="swapPlansGrid"></div>

            <div id="swapDurationSection" style="display:none;">
                <div class="section-title">
                    <span class="bar"></span>
                    <i data-lucide="calendar-clock" class="icon-sm"></i>
                    <span>۲. مدت زمان طرح جایگزین جدید (از امروز)</span>
                </div>
                <div class="duration-cards-grid" id="swapDurationGrid"></div>
            </div>

            <div id="swapInvoiceSection" class="invoice-container" style="display:none;">
                <div id="swapTradeInBreakdown" style="margin-bottom:14px;"></div>

                <div class="promo-row" id="swapPromoRow">
                    <input type="text" id="swapPromoInput" class="modern-input" placeholder="کد تخفیف (ویژه طرح جدید)">
                    <button type="button" class="btn-promo" onclick="StoreModule.applySwapPromo()">اعمال کد</button>
                </div>
                <div id="swapPromoMsg" class="promo-feedback"></div>

                <div class="segmented-pills" id="swapPaySwitch" style="display:none;">
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
                    <div class="inv-row discount" id="swapRowDiamond" style="display:none;"><span>💎 تخفیف ۳۰٪ طرح الماس پانسیون:</span><span id="swapInvDiamond">- ۰ تومان</span></div>
                    <div class="inv-row discount" id="swapRowDiscount" style="display:none;"><span>تخفیف کد/زمانی طرح جدید:</span><span id="swapInvDiscount">- ۰ تومان</span></div>
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
                            <li>با ثبت این درخواست، قراردادهای قبلی ابطال شده و طرح جدید بلافاصله فعال می‌گردد.</li>
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
                </div>

                <div class="receipt-upload-box" id="swapReceiptBox" style="display:none;" onclick="document.getElementById('swapReceiptInput').click()">
                    <i data-lucide="upload-cloud" class="icon-xl"></i>
                    <div id="swapReceiptLabel">آپلود تصویر فیش واریزی مابه‌التفاوت</div>
                    <input type="file" id="swapReceiptInput" accept="image/*" style="display:none;" onchange="StoreModule.handleReceiptFile(this, 'swap')">
                </div>

                <div class="action-row">
                    <button type="button" class="btn-primary-full" id="btnSwapSubmit" onclick="StoreModule.submitSwapInvoice()">
                        <i data-lucide="check-circle-2" class="icon"></i>
                        <span>تایید نهایی و تعویض آنی طرح</span>
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
                    <div class="opt-desc">ادامه قرارداد فعلی بدون تغییر</div>
                </div>
            </div>
            <div class="option-card ${this.swapState.selectedPlanId === 'none' ? 'selected' : ''}"
                 onclick="StoreModule.selectSwapPlan('none', 'none')">
                <div>
                    <div class="opt-title danger-text">لغو کامل اشتراک</div>
                    <div class="opt-desc">بازخرید روزهای باقی‌مانده و انتقال به کیف پول</div>
                </div>
            </div>
        `;

        if (!this.isProType(currType)) {
            html += `
                <div class="option-card ${this.swapState.selectedPlanId === 'pro_plan' ? 'selected' : ''}"
                     onclick="StoreModule.selectSwapPlan('pro_plan', 'pro')">
                    <div>
                        <div class="opt-title">🚀 اشتراک قطب‌نما پرو (بدون مشاور)</div>
                        <div class="opt-desc">تغییر به اشتراک هوشمند خودخوان</div>
                        <div class="opt-price">${UI.formatMoney(this.proPricing['1'])} <small style="font-size:11px;color:var(--text-muted);">تومان / ماه</small></div>
                    </div>
                </div>
            `;
        }

        const allowedPlans = (AppState.services || []).filter(x =>
            x.category === 'consult' &&
            Number(x.base_price) > 0 &&
            String(x.type).toLowerCase() !== currType &&
            (x.target_grade === AppState.studentGrade || x.target_grade === 'all') &&
            (x.target_major === AppState.studentMajor || x.target_major === 'all')
        );

        allowedPlans.forEach(plan => {
            const isSel = String(this.swapState.selectedPlanId) === String(plan.id);
            const rawPrice = parseInt(plan.base_price) || 0;
            const displayPrice = AppState.hasPansionActive ? Math.round(rawPrice * 0.70) : rawPrice;
            html += `
                <div class="option-card ${isSel ? 'selected' : ''}"
                     onclick="StoreModule.selectSwapPlan('${plan.id}', '${plan.type}')">
                    <div>
                        <div class="opt-title">${plan.title}</div>
                        <div class="opt-desc">${plan.description || ''}</div>
                        ${AppState.hasPansionActive ? `<div class="diamond-badge" style="margin-bottom:4px;">💎 ۳۰٪ تخفیف طرح الماس</div>` : ''}
                        <div class="opt-price">${UI.formatMoney(displayPrice)} <small style="font-size:11px;color:var(--text-muted);">تومان / ماه</small></div>
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
        const isPro = this.isProType(planType);
        const durGrid = document.getElementById('swapDurationGrid');

        if (isNewPlan && durGrid) {
            if (isPro) {
                this.swapState.paymentMethod = 'cash';
                durGrid.innerHTML = `
                    <div class="duration-card active" onclick="StoreModule.selectSwapDuration('1', this)">
                        <div class="dur-title">۱ ماهه</div>
                        <div class="dur-sub">۳۹۰,۰۰۰ تومان</div>
                    </div>
                    <div class="duration-card" onclick="StoreModule.selectSwapDuration('3', this)">
                        <div class="dur-title">۳ ماهه</div>
                        <div class="dur-sub">۸۹۰,۰۰۰ تومان</div>
                    </div>
                    <div class="duration-card" onclick="StoreModule.selectSwapDuration('6', this)">
                        <div class="dur-title">۶ ماهه</div>
                        <div class="dur-sub">۱,۴۹۰,۰۰۰ تومان</div>
                    </div>
                `;
            } else {
                durGrid.innerHTML = `
                    <div class="duration-card active" onclick="StoreModule.selectSwapDuration('1', this)">
                        <div class="dur-title">۱ ماهه</div>
                        <div class="dur-sub">قرارداد یک ماهه جدید</div>
                    </div>
                    <div class="duration-card" onclick="StoreModule.selectSwapDuration('3', this)">
                        <span class="dur-badge">۵٪ تخفیف</span>
                        <div class="dur-title">۳ ماهه</div>
                        <div class="dur-sub">قرارداد سه ماهه جدید</div>
                    </div>
                    <div class="duration-card" onclick="StoreModule.selectSwapDuration('konkur', this)">
                        <span class="dur-badge gold">تخفیف ویژه</span>
                        <div class="dur-title">تا روز کنکور</div>
                        <div class="dur-sub">${AppState.konkurDurationMonths} ماه</div>
                    </div>
                `;
            }
            this.swapState.durationVal = '1';
        }

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
                msgEl.innerText = `کد تایید شد: ${promoObj.discount_percent}٪ تخفیف اعمال گردید.`;
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

        const isPro = this.isProType(this.swapState.selectedPlanType);
        const dVal = String(this.swapState.durationVal);
        const conDur = dVal === 'konkur' ? AppState.konkurDurationMonths : (parseFloat(dVal) || 1);
        this.swapState.durationMonths = conDur;

        const now = new Date();
        const consumedDays = Math.max(0, Math.ceil((now - agg.start_date) / (1000 * 3600 * 24)));
        const totalDays = Math.max(1, Math.ceil((agg.end_date - agg.start_date) / (1000 * 3600 * 24)));
        const totalMonths = Math.max(1, Math.round(totalDays / 30));

        const actualPaid = agg.actual_paid_value;
        const baseValue = agg.base_total_value || actualPaid;

        const dailyActualValue = actualPaid / totalDays;
        const dailyBaseValue = baseValue / totalDays;
        const monthlyBaseValue = baseValue / totalMonths;

        const newSrv = (AppState.services || []).find(s => String(s.id) === String(this.swapState.selectedPlanId));
        const newBaseMonthly = isPro ? 390000 : (newSrv ? parseInt(newSrv.base_price) : 0);

        const oldSrv = (AppState.services || []).find(s =>
            s.category === 'consult' && String(s.type).toLowerCase() === String(agg.service_type).toLowerCase()
        );
        const oldBaseMonthly = this.isProType(agg.service_type) ? 390000 : (oldSrv ? parseInt(oldSrv.base_price) : 0);

        let valueConsumed = 0;
        if (this.swapState.selectedPlanId === 'none') {
            const consumedMonths = Math.ceil(consumedDays / 30);
            valueConsumed = consumedMonths >= totalMonths ? actualPaid : (consumedMonths * monthlyBaseValue);
        } else if (newBaseMonthly < oldBaseMonthly) {
            valueConsumed = consumedDays * dailyBaseValue;
        } else {
            valueConsumed = consumedDays * dailyActualValue;
        }

        let grossRefund = Math.max(0, actualPaid - valueConsumed);
        grossRefund = Math.floor(grossRefund / 10000) * 10000;

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

        let newCharge = 0;
        let diamondDisc = 0;
        if (this.swapState.selectedPlanId !== 'none') {
            newCharge = isPro ? (this.proPricing[dVal] || 390000) : Math.round(newBaseMonthly * conDur);
            if (!isPro && AppState.hasPansionActive) {
                diamondDisc = Math.round(newCharge * 0.30);
            }
        }

        const afterDiamond = Math.max(0, newCharge - diamondDisc);
        const promoDisc = Math.round(afterDiamond * this.swapState.promoRate);

        const curWallet = Number(AppState.studentData?.wallet_balance) || 0;
        const approxDiff = Math.max(0, afterDiamond - promoDisc + debtFromOldPlan - netRefund - curWallet);
        const canUseInstallments = !isPro && this.swapState.selectedPlanId !== 'none' && approxDiff > 3000000;

        const paySwitch = document.getElementById('swapPaySwitch');
        if (paySwitch) {
            paySwitch.style.display = canUseInstallments ? 'flex' : 'none';
        }
        if (!canUseInstallments && this.swapState.paymentMethod === 'installments') {
            this.swapState.paymentMethod = 'cash';
            document.getElementById('btnSwapCash')?.classList.add('active');
            document.getElementById('btnSwapInst')?.classList.remove('active');
        }

        const timeRate = this.getTimeDiscountRate(dVal, conDur, this.swapState.paymentMethod, isPro);
        const timeDisc = Math.round(Math.max(0, afterDiamond - promoDisc) * timeRate);
        const otherDiscount = promoDisc + timeDisc;

        let subTotal = Math.max(0, afterDiamond - otherDiscount) + debtFromOldPlan;

        let transferredToWallet = 0;
        if (netRefund > 0) {
            if (netRefund > subTotal) {
                transferredToWallet = netRefund - subTotal;
                subTotal = 0;
            } else {
                subTotal -= netRefund;
            }
        }

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
            diamondDisc: Math.round(diamondDisc),
            discount: Math.round(diamondDisc + otherDiscount),
            walletUsed: Math.round(walletUsed),
            newWallet: Math.round(newWalletBalance),
            walletAdd: Math.round(transferredToWallet),
            final: Math.round(subTotal),
            upfront: Math.round(subTotal),
            installments: [],
            voidInvoiceIds: voidIds
        };

        const rowRef = document.getElementById('swapRowRefund');
        if (rowRef) { rowRef.style.display = netRefund > 0 ? 'flex' : 'none'; document.getElementById('swapInvRefund').innerText = `+ ${UI.formatMoney(netRefund)} تومان`; }
        const rowDebt = document.getElementById('swapRowOldDebt');
        if (rowDebt) { rowDebt.style.display = debtFromOldPlan > 0 ? 'flex' : 'none'; document.getElementById('swapInvOldDebt').innerText = `+ ${UI.formatMoney(debtFromOldPlan)} تومان`; }
        const rowNew = document.getElementById('swapRowNewCharge');
        if (rowNew) { rowNew.style.display = newCharge > 0 ? 'flex' : 'none'; document.getElementById('swapInvNewCharge').innerText = `${UI.formatMoney(newCharge)} تومان`; }
        const rowDia = document.getElementById('swapRowDiamond');
        if (rowDia) { rowDia.style.display = diamondDisc > 0 ? 'flex' : 'none'; document.getElementById('swapInvDiamond').innerText = `- ${UI.formatMoney(diamondDisc)} تومان`; }
        const rowDisc = document.getElementById('swapRowDiscount');
        if (rowDisc) { rowDisc.style.display = otherDiscount > 0 ? 'flex' : 'none'; document.getElementById('swapInvDiscount').innerText = `- ${UI.formatMoney(otherDiscount)} تومان`; }
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
                    ? `شما بستانکار شدید! مبلغ ${UI.formatMoney(transferredToWallet)} تومان در لحظه به کیف پول شما اضافه می‌شود.`
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

            if (canUseInstallments && this.swapState.paymentMethod === 'installments' && this.swapState.finance.final > 3000000) {
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
        if (btn) { btn.disabled = true; btn.innerHTML = '<span>در حال اعمال فوری تغییرات...</span>'; }

        try {
            const uid = String(AppState.userId);
            const invoiceText = `تعویض/لغو فوری طرح به: ${this.swapState.selectedPlanType}`;

            const { error } = await supabaseClient.rpc('process_instant_checkout', {
                p_invoice_type: 'تعویض و ارتقا',
                p_consult_tier: this.swapState.selectedPlanId === 'none' ? 'none' : this.swapState.selectedPlanType,
                p_con_duration: this.swapState.selectedPlanId === 'none' ? 0 : Number(this.swapState.durationMonths),
                p_total_amount: this.swapState.finance.newBase,
                p_discount_amount: this.swapState.finance.discount,
                p_final_amount: this.swapState.finance.final,
                p_payment_method: this.swapState.paymentMethod,
                p_paid_upfront: this.swapState.finance.upfront,
                p_wallet_used: this.swapState.finance.walletUsed,
                p_wallet_added: this.swapState.finance.walletAdd,
                p_invoice_details: invoiceText,
                p_receipt_base64: this.swapState.receiptBase64 || null,
                p_mime_type: this.swapState.receiptMime || null,
                p_installments: this.swapState.finance.installments,
                p_void_invoice_ids: this.swapState.finance.voidInvoiceIds
            });

            if (error) throw new Error(error.message);

            if (this.swapState.receiptBase64) {
                this.sendReceiptToBale(uid, 'تعویض و ارتقای طرح', this.swapState.selectedPlanType, `${this.swapState.durationMonths} ماهه`, this.swapState.finance.upfront, this.swapState.receiptBase64);
            }

            await AppCore.bootstrapLoggedInUser();
            Router.openSubPage('profile');
            UI.showToast('تغییرات اشتراک شما در لحظه اعمال شد!', 'success');

        } catch (err) {
            UI.showToast(err.message || 'خطا در ثبت تغییرات', 'error');
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="check-circle-2" class="icon"></i><span>تایید نهایی و تعویض آنی طرح</span>'; UI.refreshIcons(); }
        }
    }
};

window.StoreModule = StoreModule;
