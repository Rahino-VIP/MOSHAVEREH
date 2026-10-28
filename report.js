/* ==========================================================================
   📝 ماژول ثبت و ویرایش گزارش عملکرد روزانه (js/report.js)
   متصل به تب ۲ اپلیکیشن (#tab-report) و هماهنگ با حافظه مرکزی (AppState)
   ========================================================================== */

const ReportModule = {
    selectedDate: '',
    courseCounter: 0,

    // ======================================================================
    // 🚀 ۱. راه‌اندازی اولیه ماژول گزارش (فراخوانی خودکار از AppCore)
    // ======================================================================
    init() {
        this.generateDateChips();

        // اگر تاریخی انتخاب نشده، تاریخ امروز انتخاب و اطلاعاتش بارگذاری شود
        if (this.selectedDate) {
            this.loadReportForDate(this.selectedDate);
        } else {
            const container = document.getElementById('courseContainer');
            if (container && container.children.length === 0) {
                this.addCourseCard();
            }
        }
        UI.refreshIcons();
    },

    // ======================================================================
    // 📅 ۲. ساخت نوار انتخاب تاریخ (۷ روز اخیر به شمسی)
    // ======================================================================
    generateDateChips() {
        const container = document.getElementById('dateSlider');
        if (!container) return;
        container.innerHTML = '';

        const labels = ["امروز", "دیروز", "پریروز", "۳ روز پیش", "۴ روز پیش", "۵ روز پیش", "۶ روز پیش"];
        const completedDates = AppState.completedDates || [];

        for (let i = 0; i < 7; i++) {
            const d = new Date();
            d.setDate(d.getDate() - i);

            const shamsi = new Intl.DateTimeFormat('fa-IR', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            }).format(d);

            const shamsiEng = UI.toEngDigits(shamsi);
            const isCompleted = completedDates.includes(shamsiEng);

            if (i === 0) {
                if (!this.selectedDate) this.selectedDate = shamsiEng;
                // بروزرسانی وضعیت گزارش امروز در کارت خلاصه تب خانه
                const homeRepEl = document.getElementById('homeReportStatus');
                if (homeRepEl) {
                    homeRepEl.innerText = isCompleted ? 'ثبت شده' : 'ثبت نشده';
                }
            }

            const chip = document.createElement('div');
            const isActive = this.selectedDate === shamsiEng;
            chip.className = `date-chip ${isCompleted ? 'completed' : ''} ${isActive ? 'active' : ''}`;

            const statusHtml = isCompleted
                ? `<span class="status-badge"><i data-lucide="check-circle-2" class="icon-sm" style="width:13px;height:13px;"></i> ثبت شده</span>`
                : ``;

            chip.innerHTML = `${statusHtml}<span>${labels[i]}</span><small>${shamsi}</small>`;
            chip.onclick = () => this.handleDateClick(chip, shamsiEng, isCompleted);
            container.appendChild(chip);
        }

        UI.refreshIcons();
    },

    // مدیریت کلیک روی روزهای نوار تاریخ
    handleDateClick(element, dateStr, isCompleted) {
        if (dateStr === this.selectedDate) return;

        const applySelection = () => {
            document.querySelectorAll('#dateSlider .date-chip').forEach(c => c.classList.remove('active'));
            element.classList.add('active');
            this.selectedDate = dateStr;
            this.loadReportForDate(dateStr);
        };

        if (isCompleted) {
            UI.confirm(
                'مشاهده و ویرایش گزارش ثبت‌شده',
                'شما قبلاً گزارش این روز را ثبت کرده‌اید. اطلاعات ثبت‌شده این روز جهت مشاهده یا ویرایش بارگذاری شود؟',
                applySelection
            );
        } else {
            applySelection();
        }
    },

    // ======================================================================
    // 🔄 ۳. بارگذاری اطلاعات گزارش یک روز (در صورت ثبت قبلی) یا ریست فرم
    // ======================================================================
    loadReportForDate(dateStr) {
        const container = document.getElementById('courseContainer');
        if (!container) return;
        container.innerHTML = '';
        this.courseCounter = 0;

        const existingReport = (AppState.dailyReports || []).find(r => r.report_date === dateStr);

        if (existingReport) {
            // ۱. پر کردن کارت‌های دروس ثبت‌شده
            const courses = Array.isArray(existingReport.courses) ? existingReport.courses : [];
            if (courses.length > 0) {
                courses.forEach(c => this.addCourseCard(c));
            } else {
                this.addCourseCard();
            }

            // ۲. پر کردن اسلایدرهای لایف‌استایل
            const life = existingReport.lifestyle || {};
            const sleepNum = this.timeStrToSliderVal(life.sleepLast || '23:00', true);
            const wakeNum = this.timeStrToSliderVal(life.wakeToday || '07:00', false);
            const phoneVal = parseFloat(life.phone) ?? 1.5;
            const napVal = parseFloat(life.nap) ?? 0;
            const moodVal = life.mood || 'خوب';

            const sleepInput = document.getElementById('life_sleep');
            const wakeInput = document.getElementById('life_wake');
            const phoneInput = document.getElementById('life_phone');
            const napInput = document.getElementById('life_nap');

            if (sleepInput) {
                sleepInput.value = sleepNum;
                this.updateTimeFormat(sleepNum, 'val_sleep');
            }
            if (wakeInput) {
                wakeInput.value = wakeNum;
                this.updateTimeFormat(wakeNum, 'val_wake');
            }
            if (phoneInput) {
                phoneInput.value = phoneVal;
                document.getElementById('val_phone').innerText = `${phoneVal}${phoneVal == 5 ? '+' : ''} ساعت`;
            }
            if (napInput) {
                napInput.value = napVal;
                document.getElementById('val_nap').innerText = `${napVal}${napVal == 3 ? '+' : ''} ساعت`;
            }

            // ۳. تنظیم وضعیت روحی
            this.setMoodByValue(moodVal);
        } else {
            // فرم خام برای روز جدید
            this.addCourseCard();
            const sleepInput = document.getElementById('life_sleep');
            const wakeInput = document.getElementById('life_wake');
            const phoneInput = document.getElementById('life_phone');
            const napInput = document.getElementById('life_nap');

            if (sleepInput) { sleepInput.value = 23; this.updateTimeFormat(23, 'val_sleep'); }
            if (wakeInput) { wakeInput.value = 7; this.updateTimeFormat(7, 'val_wake'); }
            if (phoneInput) { phoneInput.value = 1.5; document.getElementById('val_phone').innerText = '1.5 ساعت'; }
            if (napInput) { napInput.value = 0; document.getElementById('val_nap').innerText = '0 ساعت'; }
            this.setMoodByValue('خوب');
        }

        UI.refreshIcons();
    },

    // ======================================================================
    // 📚 ۴. افزودن کارت درس با منوی کشویی اختصاصی درون‌برنامه‌ای
    // ======================================================================
    addCourseCard(prefill = null) {
        this.courseCounter++;
        const id = this.courseCounter;
        const container = document.getElementById('courseContainer');
        if (!container) return;

        const subjects = (AppState.globalSubjects && AppState.globalSubjects.length > 0)
            ? AppState.globalSubjects
            : ["زیست ۱", "فیزیک ۱", "شیمی ۱", "ریاضی ۱", "فارسی", "عربی", "دینی", "زبان", "سایر"];

        const selectedSubj = prefill?.name && subjects.includes(prefill.name) ? prefill.name : (prefill?.name || subjects[0]);
        const eduVal = parseFloat(prefill?.edu) || 0;
        const stdVal = parseFloat(prefill?.study) || 0;
        const tstVal = parseInt(prefill?.tests) || 0;

        const div = document.createElement('div');
        div.className = 'course-card';
        div.id = `course_${id}`;  const wrapId = `courseSelectWrap_${id}`;
        const hiddenInputId = `courseSubjVal_${id}`; const labelId = `courseSubjText_${id}`;

        const menuItemsHtml = subjects.map(s => `
            <div class="custom-select-item ${s === selectedSubj ? 'selected' : ''}"
                 onclick="UI.selectDropdownItem('${wrapId}', '${hiddenInputId}', '${labelId}', '${s}', this)">
                <span>${s}</span>
                <i data-lucide="check" class="icon-sm"></i>
            </div>
        `).join('');

        div.innerHTML = `
            <div class="course-card-header">
                <div class="custom-select-wrap" id="${wrapId}" style="margin-bottom:0; flex:1;">
                    <input type="hidden" class="c-name" id="${hiddenInputId}" value="${selectedSubj}">
                    <div class="custom-select-trigger" onclick="UI.toggleDropdown('${wrapId}', event)">
                        <span id="${labelId}">${selectedSubj}</span>
                        <i data-lucide="chevron-down" class="icon-sm"></i>
                    </div>
                    <div class="custom-select-menu">${menuItemsHtml}</div>
                </div>
                ${container.children.length >= 1 ? `
                    <button type="button" class="del-icon-btn" onclick="document.getElementById('course_${id}').remove()" title="حذف این درس">
                        <i data-lucide="trash-2" class="icon-sm"></i>
                    </button>
                ` : ''}
            </div>

            <div class="slider-group">
                <div class="slider-header">
                    <span class="slider-label"><i data-lucide="video" class="icon-sm primary-text"></i> کلاس / ویدیو آموزشی</span>
                    <span class="slider-val" id="v_edu_${id}">${eduVal} ساعت</span>
                </div>
                <input type="range" class="c-edu" min="0" max="10" step="0.5" value="${eduVal}"
                       oninput="document.getElementById('v_edu_${id}').innerText = this.value + ' ساعت'">
            </div>

            <div class="slider-group">
                <div class="slider-header">
                    <span class="slider-label"><i data-lucide="book-open" class="icon-sm primary-text"></i> مطالعه شخصی (تستی/تشریحی)</span>
                    <span class="slider-val" id="v_std_${id}">${stdVal} ساعت</span>
                </div>
                <input type="range" class="c-std" min="0" max="10" step="0.5" value="${stdVal}"
                       oninput="document.getElementById('v_std_${id}').innerText = this.value + ' ساعت'">
            </div>

            <div class="slider-group" style="margin-bottom:0; background: var(--accent-fade); border-color: rgba(217, 133, 138, 0.28);">
                <div class="slider-header">
                    <span class="slider-label"><i data-lucide="check-square" class="icon-sm accent-text"></i> تعداد سوال / تست حل‌شده</span>
                    <span class="slider-val accent-text" id="v_tst_${id}">${tstVal} تست</span>
                </div>
                <input type="range" class="c-tst" min="0" max="400" step="5" value="${tstVal}"
                       oninput="document.getElementById('v_tst_${id}').innerText = this.value + ' تست'">
            </div>
        `;

        container.appendChild(div);
        UI.refreshIcons();
    },

    // ======================================================================
    // ⏱️ ۵. توابع کمکی زمان خواب و وضعیت روحی
    // ======================================================================
    updateTimeFormat(val, labelId) {
        const num = parseFloat(val);
        let h = Math.floor(num);
        const m = (num - h) * 60;
        if (h >= 24) h -= 24;
        const el = document.getElementById(labelId);
        if (el) {
            el.innerText = `${h < 10 ? '0' + h : h}:${m === 0 ? '00' : '30'}`; 
        } 
    },

    timeStrToSliderVal(timeStr, isSleep = false) { 
        if (!timeStr) return isSleep ? 23 : 7; 
        const parts = String(timeStr).split(':'); 
        let h = parseInt(parts[0]) || 0; 
        const m = parseInt(parts[1]) || 0; 
        if (isSleep && h < 12) h += 24; 
        return h + (m >= 30 ? 0.5 : 0); 
    },

    setMood(elem, val) { 
        document.querySelectorAll('#tab-report .mood-btn').forEach(b => b.classList.remove('active')); 
        if (elem) elem.classList.add('active'); 
        const input = document.getElementById('life_mood'); 
        if (input) input.value = val; 
    },

    setMoodByValue(val) { 
        const input = document.getElementById('life_mood'); 
        if (input) input.value = val; 
        const moodMap = ['عالی', 'خوب', 'معمولی', 'بد']; 
        const idx = moodMap.indexOf(val); 
        const btns = document.querySelectorAll('#tab-report .mood-btn'); 
        btns.forEach((b, i) => b.classList.toggle('active', i === (idx !== -1 ? idx : 1))); 
    },

    // ====================================================================== 
    // 🗑️ ۶. حذف گزارش روز انتخاب‌شده (با مودال تایید درون‌برنامه‌ای) 
    // ====================================================================== 
    confirmDeleteReport() { 
        if (!this.selectedDate) return; 
        UI.confirm( 
            'حذف گزارش روزانه', 
            `آیا مطمئن هستید که کل گزارش تاریخ (${this.selectedDate}) از پرونده شما پاک شود؟`,
            () => this.executeDeleteReport()
        );
    },

    // ======================================================================
    // 🚀 ۷. ثبت و ذخیره نهایی گزارش روزانه در سوپابیس
    // ======================================================================
    async submitReport() {
        const isAlreadyCompleted = (AppState.completedDates || []).includes(this.selectedDate);

        const executeSave = async () => {
            const btn = document.getElementById('submitReportBtn');
            if (btn) {
                btn.disabled = true;
                btn.innerHTML = '<span>در حال ثبت در سرور...</span>';
            }

            const coursesData = [];
            let totalStudy = 0;
            let totalTests = 0;

            document.querySelectorAll('#courseContainer .course-card').forEach(card => {
                const name = card.querySelector('.c-name')?.value || 'درس تخصصی';
                const edu = parseFloat(card.querySelector('.c-edu')?.value) || 0;
                const std = parseFloat(card.querySelector('.c-std')?.value) || 0;
                const tst = parseInt(card.querySelector('.c-tst')?.value) || 0;

                if (edu > 0 || std > 0 || tst > 0) {
                    coursesData.push({ name: name, edu: edu, study: std, tests: tst });
                    totalStudy += (edu + std);
                    totalTests += tst;
                }
            });

            let feedbackMsg = 'گزارش عملکرد امروز با موفقیت ثبت شد!';
            if (totalStudy >= 8 || totalTests >= 150) {
                feedbackMsg = 'شاهکار بود! با همین فرمان پیش بروی، هدفت در مشتت است.';
            } else if (totalStudy >= 4) {
                feedbackMsg = 'خدا قوت! روز خوبی ساختی و روندت رو به رشد است.';
            } else if (totalStudy > 0) {
                feedbackMsg = 'ثبت شد! استمرار در مسیر، کلید اصلی موفقیت است.';
            }

            const uid = String(AppState.userId);
            const payload = {
                chat_id: uid,
                report_date: this.selectedDate,
                courses: coursesData,
                lifestyle: {
                    sleepLast: document.getElementById('val_sleep')?.innerText || '23:00',
                    wakeToday: document.getElementById('val_wake')?.innerText || '07:00',
                    phone: document.getElementById('life_phone')?.value || '1.5',
                    nap: document.getElementById('life_nap')?.value || '0',
                    mood: document.getElementById('life_mood')?.value || 'خوب'
                }
            };

            try {
                // بررسی وجود رکورد قبلی برای همان تاریخ (برای سازگاری ۱۰۰٪ با سرورهای مختلف سوپابیس)
                const { data: existingRows } = await supabaseClient
                    .from('daily_reports')
                    .select('id')
                    .eq('chat_id', uid)
                    .eq('report_date', this.selectedDate)
                    .limit(1);

                if (existingRows && existingRows.length > 0) {
                    const { error: updErr } = await supabaseClient
                        .from('daily_reports')
                        .update({ courses: payload.courses, lifestyle: payload.lifestyle })
                        .eq('id', existingRows[0].id);
                    if (updErr) throw updErr;
                } else {
                    const { error: insErr } = await supabaseClient
                        .from('daily_reports')
                        .insert([payload]);
                    if (insErr) throw insErr;
                }

                // بروزرسانی فوری AppState در حافظه
                const idx = (AppState.dailyReports || []).findIndex(r => r.report_date === this.selectedDate);
                if (idx >= 0) {
                    AppState.dailyReports[idx] = { ...AppState.dailyReports[idx], ...payload };
                } else {
                    AppState.dailyReports.unshift(payload);
                }

                // مرتب‌سازی نزولی گزارش‌ها بر اساس تاریخ
                AppState.dailyReports.sort((a, b) => String(b.report_date).localeCompare(String(a.report_date)));
                AppState.completedDates = AppState.dailyReports.map(r => r.report_date);

                // بروزرسانی نوار تاریخ و هماهنگ‌سازی با تب تحلیل عملکرد و تب خانه
                this.generateDateChips();
                if (window.AnalyticsModule) AnalyticsModule.init();

                UI.showToast(feedbackMsg, 'success');
            } catch (err) {
                console.error("Save Report Error:", err);
                UI.showToast('خطا در ذخیره گزارش. لطفاً اتصال خود را بررسی کنید.', 'error');
            } finally {
                if (btn) {
                    btn.disabled = false;
                    btn.innerHTML = '<i data-lucide="send" class="icon"></i><span>ثبت نهایی گزارش روزانه</span>';
                    UI.refreshIcons();
                }
            }
        };

        if (isAlreadyCompleted) {
            UI.confirm(
                'بروزرسانی گزارش ثبت‌شده',
                'با ثبت این فرم، اطلاعات قبلی این روز با مقادیر جدید جایگزین می‌شود. ادامه می‌دهید؟',
                executeSave
            );
        } else {
            await executeSave();
        }
    }
};

window.ReportModule = ReportModule;
