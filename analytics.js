/* ==========================================================================
   📊 ماژول جامع تحلیل عملکرد، رادار آزمون و کلینیک هوشمند (js/analytics.js)
   شامل:
   ۱. شاخص‌های کلیدی (KPIs) با رکورد ساعت و رکورد تست روزانه + سیستم درجات (Rank)
   ۲. نمودار روند مطالعه و تست با ۳ حالت تقویمی دقیق (کل هفته‌ها / همین هفته / هفته گذشته)
   ۳. نمودار سهم دروس + درس محبوب و رادار لایف‌استایل (تیپ‌شناسی خواب، باتری تمرکز، نوار روحیه)
   ۴. رادار آزمون‌های ProMax (متصل به exam_results: روند تراز، مدیریت زمان، ترازوی عدالت)
   ۵. دفترچه گزارش‌های ۱۴ روز اخیر (با نمودار دونات روزانه و گراف کمانی خواب و بیداری)
   ۶. کلینیک هوشمند متصل به week_status_calendar با پشتیبانی از آپلود هم‌زمان ۲ فایل کارنامه
      و تفکیک هوشمند دسترسی کاربران اشتراکی و غیر اشتراکی
   ========================================================================== */

const AnalyticsModule = {
    trendMode: 'all_weeks', // 'all_weeks' | 'this_week' | 'last_week'
    dashTrendChartInstance: null,
    dashSubjectChartInstance: null,
    radarTarazChartInstance: null,
    radarTimeMgmtChartInstance: null,
    radarRoiChartInstance: null,
    historyChartInstances: {},
    dossierChartInstances: {},

    weekCalendars: [],
    uploadedExamFiles: {}, // { [weekId]: { file1: {base64, mime, name}, file2: {base64, mime, name} } }

    monthNames: ["", "فروردین", "اردیبهشت", "خرداد", "تیر", "مرداد", "شهریور", "مهر", "آبان", "آذر", "دی", "بهمن", "اسفند"],
    dayNamesFa: ["شنبه", "یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه"],
    chartColors: ['#639889', '#d9858a', '#10b981', '#f59e0b', '#6366f1', '#ec4899', '#14b8a6', '#3b82f6'],

    // ======================================================================
    // 🗓️ ۱. توابع دقیق تبدیل تاریخ جلالی (JDN) برای محاسبه شنبه‌تا‌جمعه تقویمی
    // ======================================================================
    jalaliToJdn(y, m, d) {
        const epBase = y - ((y >= 0) ? 474 : 473);
        const epYear = 474 + (epBase % 2820);
        const md = (m <= 7) ? ((m - 1) * 31) : (((m - 1) * 30) + 6);
        return d + md + Math.floor(((epYear * 682) - 110) / 2816) + (epYear - 1) * 365 + Math.floor(epBase / 2820) * 1029983 + 1948321;
    },

    jdnToJalali(jdn) {
        const a = jdn - 2121446;
        const epBase = Math.floor(a / 1029983);
        const epRemain = a % 1029983;
        const epYear = Math.floor((epRemain * 2816 + 1031337) / 1028522);
        const epDay = epRemain - Math.floor(((epYear * 682) - 110) / 2816) - (epYear - 1) * 365;
        const y = epYear + epBase * 2820 + 474;
        let m, d;
        if (epDay <= 186) {
            m = Math.ceil(epDay / 31);
            d = epDay - (m - 1) * 31;
        } else {
            m = Math.ceil((epDay - 6) / 30);
            d = epDay - 186 - (m - 7) * 30;
        }
        return `${y}/${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}`;
    },

    getShortPersianDate(dateStr) {
        if (!dateStr) return '';
        const parts = String(dateStr).split('/');
        if (parts.length < 3) return dateStr;
        return `${parseInt(parts[2], 10)} ${this.monthNames[parseInt(parts[1], 10)] || ''}`;
    },

    getTodayShamsiStr() {
        const formatter = new Intl.DateTimeFormat('en-US-u-ca-persian', { year: 'numeric', month: '2-digit', day: '2-digit' });
        const parts = formatter.formatToParts(new Date());
        const y = parts.find(p => p.type === 'year')?.value || '1405';
        const m = (parts.find(p => p.type === 'month')?.value || '01').padStart(2, '0');
        const d = (parts.find(p => p.type === 'day')?.value || '01').padStart(2, '0');
        return UI.toEngDigits(`${y}/${m}/${d}`);
    },

    // ======================================================================
    // 🧭 ۲. سوییچ بین زیرتب‌های بخش تحلیل عملکرد
    // ======================================================================
    switchSubtab(subId, btnEl) {
        document.querySelectorAll('#tab-analytics .subtab-btn').forEach(b => b.classList.remove('active'));
        if (btnEl) btnEl.classList.add('active');

        document.querySelectorAll('#tab-analytics .sub-view').forEach(v => v.classList.remove('active'));
        const target = document.getElementById(`subtab-ana-${subId}`);
        if (target) target.classList.add('active');

        if (subId === 'stats') {
            this.renderCharts();
        }
        UI.refreshIcons();
    },

    setTrendMode(mode, btnEl) {
        this.trendMode = mode;
        document.querySelectorAll('#trendChartModeSwitch .pill-btn').forEach(b => b.classList.remove('active'));
        if (btnEl) btnEl.classList.add('active');

        const titleEl = document.getElementById('trendChartTitle');
        if (titleEl) {
            if (mode === 'all_weeks') titleEl.innerText = 'روند پیشرفت (عملکرد هفتگی کل)';
            else if (mode === 'this_week') titleEl.innerText = 'عملکرد روزانه (همین هفته: شنبه تا جمعه)';
            else titleEl.innerText = 'عملکرد روزانه (هفته گذشته: شنبه تا جمعه)';
        }
        this.renderTrendChart();
    },

    // ======================================================================
    // 🚀 ۳. راه‌اندازی ماژول و دریافت تقویم هفته‌ها و نتایج آزمون
    // ======================================================================
    async init() {
        await this.ensureAnalyticsTablesLoaded();
        this.processDashboardMetrics();
        this.processPromaxRadar();
        this.renderHistory((AppState.dailyReports || []).slice(0, 14));
        this.renderClinicDossiers();

        const activeSubView = document.querySelector('#tab-analytics .sub-view.active');
        if (activeSubView && activeSubView.id === 'subtab-ana-stats') {
            this.renderCharts();
        }
        UI.refreshIcons();
    },

    async ensureAnalyticsTablesLoaded() {
        const uid = String(AppState.userId || '');
        if (!uid) return;

        try {
            const [calRes, exRes, aiRes] = await Promise.all([
                supabaseClient.from('week_status_calendar').select('*').order('start_date', { ascending: false }),
                supabaseClient.from('exam_results').select('*').eq('chat_id', uid).order('created_at', { ascending: true }),
                supabaseClient.from('ai_analyses').select('*').eq('chat_id', uid).order('created_at', { ascending: false })
            ]);

            if (calRes.data) this.weekCalendars = calRes.data;
            if (exRes.data) AppState.examResults = exRes.data;
            if (aiRes.data) AppState.aiAnalyses = aiRes.data;
        } catch (err) {
            console.warn("Analytics Sync Warning:", err);
        }
    },

    // ======================================================================
    // 📊 ۴. محاسبه آمار کلی، رکورد تست روزانه، مقام و رادار لایف‌استایل
    // ======================================================================
    processDashboardMetrics() {
        const reports = AppState.dailyReports || [];
        const major = AppState.studentMajor || 'تجربی';

        let totalTime = 0;
        let totalTests = 0;
        let maxTimeDay = 0;
        let maxTestsDay = 0;

        let totalWake = 0;
        let totalBedtime = 0;
        let totalSleepDuration = 0;
        let totalPhone = 0;
        const moodCounts = { 'عالی': 0, 'خوب': 0, 'معمولی': 0, 'بد': 0 };

        reports.forEach(r => {
            let dayTime = 0;
            let dayTests = 0;

            (r.courses || []).forEach(c => {
                const cTime = (parseFloat(c.edu) || 0) + (parseFloat(c.study) || 0);
                dayTime += cTime;
                dayTests += (parseInt(c.tests, 10) || 0);
            });

            totalTime += dayTime;
            totalTests += dayTests;
            if (dayTime > maxTimeDay) maxTimeDay = dayTime;
            if (dayTests > maxTestsDay) maxTestsDay = dayTests;

            if (r.lifestyle) {
                const wStr = r.lifestyle.wakeToday || "07:00";
                const sStr = r.lifestyle.sleepLast || "23:00";
                const nap = parseFloat(r.lifestyle.nap) || 0;

                const wParts = String(wStr).split(':');
                const sParts = String(sStr).split(':');
                const wH = (parseInt(wParts[0], 10) || 7) + ((parseInt(wParts[1], 10) || 0) / 60);
                const sH = (parseInt(sParts[0], 10) || 23) + ((parseInt(sParts[1], 10) || 0) / 60);

                totalWake += wH;
                const adjustedBedtime = sH < 12 ? sH + 24 : sH;
                totalBedtime += adjustedBedtime;

                let sleepDuration = wH - sH;
                if (sleepDuration < 0) sleepDuration += 24;
                sleepDuration += nap;
                totalSleepDuration += sleepDuration;

                totalPhone += parseFloat(r.lifestyle.phone) || 0;
                if (moodCounts[r.lifestyle.mood] !== undefined) {
                    moodCounts[r.lifestyle.mood]++;
                }
            }
        });

        // ۱. مقداردهی ۴ کارت KPI (شامل رکورد تست روزانه)
        const elTotalStudy = document.getElementById('kpiTotalStudy');
        const elTotalTests = document.getElementById('kpiTotalTests');
        const elMaxTime = document.getElementById('kpiMaxDaily');
        const elMaxTests = document.getElementById('kpiMaxTestsDaily');
        const elHeroHours = document.getElementById('dashTotalHoursHero');
        const elHomeHours = document.getElementById('homeTotalHours');

        if (elTotalStudy) elTotalStudy.innerText = Number(totalTime.toFixed(1)).toLocaleString('fa-IR');
        if (elTotalTests) elTotalTests.innerText = totalTests.toLocaleString('fa-IR');
        if (elMaxTime) elMaxTime.innerText = Number(maxTimeDay.toFixed(1)).toLocaleString('fa-IR');
        if (elMaxTests) elMaxTests.innerText = maxTestsDay.toLocaleString('fa-IR');
        if (elHeroHours) elHeroHours.innerText = `${Number(totalTime.toFixed(1)).toLocaleString('fa-IR')} ساعت`;
        if (elHomeHours) elHomeHours.innerText = `${Math.round(totalTime).toLocaleString('fa-IR')} ساعت`;

        // ۲. محاسبه مقام در سیستم (دقیقاً مطابق dashboard.html)
        const ranksList = [
            { max: 50, title: "مسافرِ مسیر" },
            { max: 150, title: "جستجوگر قطب‌نما" },
            { max: 300, title: "جنگجوی بااراده" },
            { max: 600, title: "ماشین تست‌زنی" },
            { max: 1000, title: "قهرمان پیوستگی" },
            { max: 1500, title: "شکارچی تراز" },
            { max: 2000, title: "غولِ آزمون‌ها" },
            { max: 2500, title: "افسانه قطب‌نما" }
        ];

        let rankTitle = "مسافرِ مسیر";
        let targetHours = 50;
        for (let i = 0; i < ranksList.length; i++) {
            if (totalTime < ranksList[i].max) {
                rankTitle = ranksList[i].title;
                targetHours = ranksList[i].max;
                break;
            }
        }
        if (totalTime >= 2500) {
            if (major.includes("تجربی")) rankTitle = "دکترِ آینده";
            else if (major.includes("ریاضی")) rankTitle = "مهندسِ آینده";
            else if (major.includes("انسانی")) rankTitle = "حقوق‌دان / استادِ آینده";
            else rankTitle = "رتبه‌برترِ آینده";
            targetHours = totalTime + 500;
        }

        const rankTitleEl = document.getElementById('dashRankTitle');
        const rankProgEl = document.getElementById('dashRankProgressFill');
        const rankSubEl = document.getElementById('dashNextRankLabel');

        if (rankTitleEl) rankTitleEl.innerText = rankTitle;
        if (rankProgEl) {
            const pct = Math.min((totalTime / targetHours) * 100, 100);
            rankProgEl.style.width = `${pct}%`;
        }
        if (rankSubEl) {
            rankSubEl.innerText = `هدف بعدی: ${(targetHours - totalTime).toFixed(1)} ساعت مانده`;
        }

        // ۳. رادار لایف‌استایل و ریکاوری (مشابه dashboard.html)
        const daysCount = reports.length;
        const sleepNameEl = document.getElementById('sleepProfileName');
        const sleepDescEl = document.getElementById('sleepProfileDesc');
        const sleepSvgBox = document.getElementById('sleepSvgBox');
        const batteryNameEl = document.getElementById('batteryName');
        const batteryDescEl = document.getElementById('batteryDesc');
        const batterySvgBox = document.getElementById('batterySvgBox');
        const moodDaysEl = document.getElementById('moodDaysCount');
        const moodBarEl = document.getElementById('moodBar');

        if (daysCount === 0) {
            if (sleepNameEl) sleepNameEl.innerText = 'تیپ‌شناسی خواب (بدون دیتا)';
            if (sleepDescEl) sleepDescEl.innerText = 'پس از ثبت اولین گزارش روزانه، الگوی خواب شما محاسبه می‌شود.';
            if (sleepSvgBox) sleepSvgBox.innerHTML = `<i data-lucide="moon" class="icon-lg primary-text"></i>`;
            if (batterySvgBox) batterySvgBox.innerHTML = `<i data-lucide="battery-charging" class="icon-lg success-text"></i>`;
            if (moodDaysEl) moodDaysEl.innerText = 'بر اساس ۰ روز';
            if (moodBarEl) moodBarEl.innerHTML = '';
            return;
        }

        const avgWake = totalWake / daysCount;
        let avgBedtime = totalBedtime / daysCount;
        const avgSleepDuration = totalSleepDuration / daysCount;
        if (avgBedtime >= 24) avgBedtime -= 24;

        const formatClock = (timeNum) => {
            let h = Math.floor(timeNum);
            let m = Math.round((timeNum - h) * 60);
            if (m === 60) { h++; m = 0; }
            if (h >= 24) h -= 24;
            return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
        };

        let sleepTitle = "سحرخیز و پرانرژی";
        let sleepColor = "var(--gold)";
        let sleepIcon = "sunrise";

        if (avgSleepDuration >= 10) {
            sleepTitle = "تیپ خواب کوالا (خواب بالا)";
            sleepColor = "var(--text-muted)";
            sleepIcon = "cloud-moon";
        } else if (avgWake <= 7.5) {
            sleepTitle = "سحرخیز و پرانرژی";
            sleepColor = "var(--gold)";
            sleepIcon = "sun";
        } else {
            sleepTitle = "جغدِ شب‌بیدار";
            sleepColor = "var(--indigo)";
            sleepIcon = "moon-star";
        }

        if (sleepNameEl) {
            sleepNameEl.innerText = sleepTitle;
            sleepNameEl.style.color = sleepColor;
        }
        if (sleepDescEl) {
            sleepDescEl.innerHTML = `
                میانگین ساعت خواب : <strong style="color:var(--text-main)">${formatClock(avgBedtime)}</strong><br>
                میانگین ساعت بیداری : <strong style="color:var(--text-main)">${formatClock(avgWake)}</strong><br>
                طول کل خواب (با چرت روزانه) : <strong style="color:var(--text-main)">${formatClock(avgSleepDuration)}</strong>
            `;
        }
        if (sleepSvgBox) {
            sleepSvgBox.innerHTML = `<i data-lucide="${sleepIcon}" class="icon-xl" style="color:${sleepColor};"></i>`;
        }

        // باتری تمرکز (گوشی)
        const avgPhone = totalPhone / daysCount;
        let batteryColor = "var(--success)";
        let batteryFill = 82;
        let batteryText = "تمرکز عالی";
        if (avgPhone > 3) {
            batteryColor = "var(--danger)";
            batteryFill = 22;
            batteryText = "هشدار حواس‌پرتی!";
        } else if (avgPhone > 1.5) {
            batteryColor = "var(--gold)";
            batteryFill = 52;
            batteryText = "نیاز به کنترل بیشتر";
        }

        if (batteryNameEl) {
            batteryNameEl.innerText = batteryText;
            batteryNameEl.style.color = batteryColor;
        }
        if (batteryDescEl) {
            batteryDescEl.innerText = `میانگین استفاده از گوشی: ${avgPhone.toFixed(1)} ساعت در روز`;
        }
        if (batterySvgBox) {
            batterySvgBox.innerHTML = `
                <svg viewBox="0 0 24 24" width="34" height="34" fill="none" stroke="${batteryColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="2" y="7" width="16" height="10" rx="2" ry="2"></rect>
                    <line x1="22" y1="11" x2="22" y2="13"></line>
                    <rect x="4" y="9" width="${(batteryFill / 100) * 12}" height="6" fill="${batteryColor}" stroke="none"></rect>
                </svg>`;
        }

        // نوار حال روحی
        if (moodDaysEl) moodDaysEl.innerText = `بر اساس ${daysCount.toLocaleString('fa-IR')} روز`;
        const goodPct = ((moodCounts['عالی'] + moodCounts['خوب']) / daysCount) * 100;
        const neutralPct = (moodCounts['معمولی'] / daysCount) * 100;
        const badPct = (moodCounts['بد'] / daysCount) * 100;

        let moodHtml = "";
        if (goodPct > 0) moodHtml += `<div class="mood-segment" style="width:${goodPct}%; background:var(--success);">${Math.round(goodPct)}%</div>`;
        if (neutralPct > 0) moodHtml += `<div class="mood-segment" style="width:${neutralPct}%; background:var(--gold);">${Math.round(neutralPct)}%</div>`;
        if (badPct > 0) moodHtml += `<div class="mood-segment" style="width:${badPct}%; background:var(--danger);">${Math.round(badPct)}%</div>`;
        if (moodBarEl) moodBarEl.innerHTML = moodHtml;
    },

    // ======================================================================
    // 📈 ۵. رسم نمودارهای سه‌گانه روند مطالعه و سهم دروس
    // ======================================================================
    renderCharts() {
        if (!window.Chart) return;
        Chart.defaults.font.family = 'Vazirmatn';

        this.renderTrendChart();
        this.renderSubjectPieChart();
        this.renderPromaxRadarCharts();
    },

    renderTrendChart() {
        const ctx = document.getElementById('dashTrendChart');
        if (!ctx || !window.Chart) return;

        const reports = AppState.dailyReports || [];
        let labels = [];
        let studyData = [];
        let testData = [];

        // الف) حالت اول: روند کل هفته به هفته (دقیقاً مشابه dashboard.html)
        if (this.trendMode === 'all_weeks') {
            const weeklyData = {};
            // مرتب‌سازی صعودی بر اساس تاریخ
            const sortedAsc = [...reports].sort((a, b) => String(a.report_date).localeCompare(String(b.report_date)));

            sortedAsc.forEach(r => {
                if (!r.report_date) return;
                const parts = String(r.report_date).split('/');
                if (parts.length < 3) return;
                const jdn = this.jalaliToJdn(parseInt(parts[0], 10), parseInt(parts[1], 10), parseInt(parts[2], 10));
                const dayOfWeek = (jdn + 1) % 7; // 0 = شنبه ... 6 = جمعه
                const saturdayJdn = jdn - dayOfWeek;
                const fridayJdn = saturdayJdn + 6;

                if (!weeklyData[saturdayJdn]) {
                    weeklyData[saturdayJdn] = {
                        study: 0,
                        tests: 0,
                        startStr: this.jdnToJalali(saturdayJdn),
                        endStr: this.jdnToJalali(fridayJdn)
                    };
                }

                (r.courses || []).forEach(c => {
                    weeklyData[saturdayJdn].study += (parseFloat(c.edu) || 0) + (parseFloat(c.study) || 0);
                    weeklyData[saturdayJdn].tests += (parseInt(c.tests, 10) || 0);
                });
            });

            Object.keys(weeklyData).sort((a, b) => Number(a) - Number(b)).forEach(k => {
                const w = weeklyData[k];
                const sLbl = this.getShortPersianDate(w.startStr);
                const eLbl = this.getShortPersianDate(w.endStr);
                labels.push(sLbl === eLbl ? sLbl : `${sLbl} تا ${eLbl}`);
                studyData.push(Number(w.study.toFixed(1)));
                testData.push(w.tests);
            });

            if (labels.length === 0) {
                labels = ['هفته ۱'];
                studyData = [0];
                testData = [0];
            }
        }
        // ب) حالت دوم و سوم: همین هفته یا هفته گذشته (بر اساس تاریخ تقویمی شنبه تا جمعه، روزهای ثبت‌نشده = ۰)
        else {
            const todayStr = this.getTodayShamsiStr();
            const tParts = todayStr.split('/');
            const todayJdn = this.jalaliToJdn(parseInt(tParts[0], 10), parseInt(tParts[1], 10), parseInt(tParts[2], 10));
            const todayDayOfWeek = (todayJdn + 1) % 7; // 0 = شنبه
            const thisSaturdayJdn = todayJdn - todayDayOfWeek;
            const baseSaturdayJdn = this.trendMode === 'this_week' ? thisSaturdayJdn : (thisSaturdayJdn - 7);

            // ساخت مپ سریع از گزارش‌های موجود بر اساس تاریخ
            const reportMap = {};
            reports.forEach(r => {
                if (r.report_date) {
                    reportMap[UI.toEngDigits(r.report_date)] = r;
                }
            });

            for (let i = 0; i < 7; i++) {
                const targetJdn = baseSaturdayJdn + i;
                const targetDateStr = this.jdnToJalali(targetJdn);
                const shortDate = this.getShortPersianDate(targetDateStr);
                labels.push(`${this.dayNamesFa[i]} (${shortDate})`);

                const rep = reportMap[targetDateStr];
                if (rep && Array.isArray(rep.courses)) {
                    let dStudy = 0;
                    let dTests = 0;
                    rep.courses.forEach(c => {
                        dStudy += (parseFloat(c.edu) || 0) + (parseFloat(c.study) || 0);
                        dTests += (parseInt(c.tests, 10) || 0);
                    });
                    studyData.push(Number(dStudy.toFixed(1)));
                    testData.push(dTests);
                } else {
                    // اگر دانش‌آموز در آن تاریخ گزارشی ثبت نکرده باشد، دقیقاً ۰ منظور می‌شود
                    studyData.push(0);
                    testData.push(0);
                }
            }
        }

        if (this.dashTrendChartInstance) this.dashTrendChartInstance.destroy();
        this.dashTrendChartInstance = new Chart(ctx.getContext('2d'), {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        type: 'line',
                        label: 'تعداد تست',
                        data: testData,
                        borderColor: '#d9858a',
                        backgroundColor: '#d9858a',
                        yAxisID: 'y1',
                        tension: 0.38,
                        borderWidth: 3,
                        pointRadius: 4
                    },
                    {
                        type: 'bar',
                        label: 'ساعت مطالعه',
                        data: studyData,
                        backgroundColor: '#639889',
                        borderRadius: 7,
                        yAxisID: 'y'
                    }
                ]
            },
            options: {
                maintainAspectRatio: false,
                responsive: true,
                scales: {
                    y: {
                        type: 'linear',
                        position: 'right',
                        beginAtZero: true,
                        title: { display: true, text: 'ساعت مطالعه', font: { family: 'Vazirmatn', size: 11 } }
                    },
                    y1: {
                        type: 'linear',
                        position: 'left',
                        beginAtZero: true,
                        grid: { drawOnChartArea: false },
                        title: { display: true, text: 'تعداد تست', font: { family: 'Vazirmatn', size: 11 } }
                    },
                    x: { grid: { display: false } }
                },
                plugins: {
                    legend: { labels: { font: { family: 'Vazirmatn' } } }
                }
            }
        });
    },

    renderSubjectPieChart() {
        const ctx = document.getElementById('dashSubjectChart');
        if (!ctx || !window.Chart) return;

        const subjectAgg = {};
        (AppState.dailyReports || []).forEach(r => {
            (r.courses || []).forEach(c => {
                const cTime = (parseFloat(c.edu) || 0) + (parseFloat(c.study) || 0);
                if (cTime > 0) {
                    subjectAgg[c.name] = (subjectAgg[c.name] || 0) + cTime;
                }
            });
        });

        const sortedSubjects = Object.keys(subjectAgg).sort((a, b) => subjectAgg[b] - subjectAgg[a]);
        const favEl = document.getElementById('favSubjectName');
        if (favEl) {
            favEl.innerText = sortedSubjects.length > 0 ? sortedSubjects[0] : 'هنوز درسی ثبت نشده';
        }

        const pieLabels = sortedSubjects.length > 0 ? sortedSubjects.slice(0, 5) : ['بدون دیتا'];
        const pieData = sortedSubjects.length > 0 ? pieLabels.map(s => Number(subjectAgg[s].toFixed(1))) : [1];

        if (this.dashSubjectChartInstance) this.dashSubjectChartInstance.destroy();
        this.dashSubjectChartInstance = new Chart(ctx.getContext('2d'), {
            type: 'doughnut',
            data: {
                labels: pieLabels,
                datasets: [{
                    data: pieData,
                    backgroundColor: this.chartColors,
                    borderWidth: 0
                }]
            },
            options: {
                maintainAspectRatio: false,
                responsive: true,
                cutout: '65%',
                plugins: {
                    legend: {
                        position: 'right',
                        labels: { font: { family: 'Vazirmatn', size: 11 } }
                    }
                }
            }
        });
    },

    // ======================================================================
    // 🎯 ۶. رادار آزمون‌های ProMax (متصل به جدول exam_results)
    // ======================================================================
    processPromaxRadar() {
        const contentBox = document.getElementById('promaxRadarContent');
        const emptyBox = document.getElementById('promaxRadarEmpty');
        const emptyDesc = document.getElementById('promaxRadarEmptyDesc');
        if (!contentBox || !emptyBox) return;

        // فیلتر کردن کارنامه‌های تاییدشده‌ای که مربوط به هفته آزمون هستند یا تراز دارند
        const approvedExams = (AppState.examResults || []).filter(ex =>
            ex.status === 'approved' && (ex.is_exam_week === true || Number(ex.total_taraz) > 0)
        );

        if (!AppState.isConsultant) {
            contentBox.style.display = 'none';
            emptyBox.style.display = 'block';
            if (emptyDesc) {
                emptyDesc.innerHTML = 'رادار تراز آزمون، مدیریت زمان و ترازوی عدالت ویژه دانش‌آموزان <strong>طرح مشاوره قطب‌نما</strong> است.';
            }
            return;
        }

        if (approvedExams.length === 0) {
            contentBox.style.display = 'none';
            emptyBox.style.display = 'block';
            return;
        }

        contentBox.style.display = 'block';
        emptyBox.style.display = 'none';

        const tarazTrend = [];
        const subjectAvgMap = {};
        const subjectCountMap = {};

        approvedExams.forEach(ex => {
            const t = Number(ex.total_taraz || 0);
            if (t > 0) tarazTrend.push(t);

            let parsedLessons = [];
            try {
                parsedLessons = typeof ex.extracted_data === 'string'
                    ? JSON.parse(ex.extracted_data || "[]")
                    : (ex.extracted_data || []);
            } catch (_) {}

            (parsedLessons || []).forEach(lesson => {
                const lName = lesson.name;
                const lTaraz = Number(lesson.taraz || 0);
                if (lName && lTaraz > 0) {
                    subjectAvgMap[lName] = (subjectAvgMap[lName] || 0) + lTaraz;
                    subjectCountMap[lName] = (subjectCountMap[lName] || 0) + 1;
                }
            });
        });

        const maxTaraz = tarazTrend.length > 0 ? Math.max(...tarazTrend) : 0;
        const avgTaraz = tarazTrend.length > 0 ? Math.round(tarazTrend.reduce((a, b) => a + b, 0) / tarazTrend.length) : 0;

        let bestSubject = "—";
        let worstSubject = "—";
        let highestAvg = -1;
        let lowestAvg = 999999;

        for (const [subj, sumT] of Object.entries(subjectAvgMap)) {
            const avg = sumT / subjectCountMap[subj];
            if (avg > highestAvg) { highestAvg = avg; bestSubject = subj; }
            if (avg < lowestAvg) { lowestAvg = avg; worstSubject = subj; }
        }

        document.getElementById('radarMaxTaraz').innerText = maxTaraz > 0 ? maxTaraz.toLocaleString('fa-IR') : '—';
        document.getElementById('radarAvgTaraz').innerText = avgTaraz > 0 ? avgTaraz.toLocaleString('fa-IR') : '—';
        document.getElementById('radarBestSubj').innerText = bestSubject;
        document.getElementById('radarWorstSubj').innerText = worstSubject;
    },

    renderPromaxRadarCharts() {
        const approvedExams = (AppState.examResults || []).filter(ex =>
            ex.status === 'approved' && (ex.is_exam_week === true || Number(ex.total_taraz) > 0)
        );
        if (!AppState.isConsultant || approvedExams.length === 0 || !window.Chart) return;

        const labels = [];
        const tarazTrend = [];
        const correctData = [];
        const incorrectData = [];
        const unattemptedData = [];
        const totalTestsData = [];

        approvedExams.forEach((ex, index) => {
            labels.push(ex.period_end ? `آزمون ${this.getShortPersianDate(ex.period_end)}` : `آزمون ${index + 1}`);
            tarazTrend.push(Number(ex.total_taraz || 0));

            let parsedLessons = [];
            try {
                parsedLessons = typeof ex.extracted_data === 'string'
                    ? JSON.parse(ex.extracted_data || "[]")
                    : (ex.extracted_data || []);
            } catch (_) {}

            let sumC = 0, sumI = 0, sumU = 0;
            (parsedLessons || []).forEach(lesson => {
                sumC += Number(lesson.correct || 0);
                sumI += Number(lesson.incorrect || 0);
                sumU += Number(lesson.unattempted || 0);
            });
            correctData.push(sumC);
            incorrectData.push(sumI);
            unattemptedData.push(sumU);

            let snap = {};
            try {
                snap = typeof ex.lifestyle_snapshot === 'string'
                    ? JSON.parse(ex.lifestyle_snapshot || "{}")
                    : (ex.lifestyle_snapshot || {});
            } catch (_) {}
            totalTestsData.push(Number(snap.total_tests || 0));
        });

        // ۱. نمودار روند تراز کل
        const ctx1 = document.getElementById('radarTarazChart');
        if (ctx1) {
            if (this.radarTarazChartInstance) this.radarTarazChartInstance.destroy();
            this.radarTarazChartInstance = new Chart(ctx1.getContext('2d'), {
                type: 'line',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'تراز کل',
                        data: tarazTrend,
                        borderColor: '#639889',
                        backgroundColor: 'rgba(99, 152, 137, 0.15)',
                        borderWidth: 3,
                        tension: 0.38,
                        fill: true,
                        pointRadius: 5
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { display: false } },
                    scales: { x: { grid: { display: false } } }
                }
            });
        }

        // ۲. نمودار تکامل مدیریت زمان (درست / غلط / نزده)
        const ctx2 = document.getElementById('radarTimeMgmtChart');
        if (ctx2) {
            if (this.radarTimeMgmtChartInstance) this.radarTimeMgmtChartInstance.destroy();
            this.radarTimeMgmtChartInstance = new Chart(ctx2.getContext('2d'), {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [
                        { label: 'درست', data: correctData, backgroundColor: '#10b981' },
                        { label: 'غلط', data: incorrectData, backgroundColor: '#ef4444' },
                        { label: 'نزده', data: unattemptedData, backgroundColor: '#94a3b8' }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: { stacked: true, grid: { display: false } },
                        y: { stacked: true }
                    },
                    plugins: { legend: { position: 'bottom' } }
                }
            });
        }

        // ۳. نمودار ترازوی عدالت (تست در برابر تراز)
        const ctx3 = document.getElementById('radarRoiChart');
        if (ctx3) {
            if (this.radarRoiChartInstance) this.radarRoiChartInstance.destroy();
            this.radarRoiChartInstance = new Chart(ctx3.getContext('2d'), {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            type: 'line',
                            label: 'تراز آزمون',
                            data: tarazTrend,
                            borderColor: '#d9858a',
                            backgroundColor: '#d9858a',
                            borderWidth: 3,
                            pointRadius: 5,
                            tension: 0.35,
                            yAxisID: 'y1'
                        },
                        {
                            type: 'bar',
                            label: 'مجموع تست دوره',
                            data: totalTestsData,
                            backgroundColor: '#639889',
                            borderRadius: 6,
                            yAxisID: 'y'
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: { type: 'linear', position: 'right', grid: { display: false } },
                        y1: { type: 'linear', position: 'left' },
                        x: { grid: { display: false } }
                    },
                    plugins: { legend: { position: 'bottom' } }
                }
            });
        }
    },

    // ======================================================================
    // 📖 ۷. دفترچه گزارش‌های ۱۴ روز اخیر (دقیقاً مشابه history.html)
    // ======================================================================
    renderHistory(recentReports) {
        const container = document.getElementById('historyAccordionContainer');
        if (!container) return;

        if (!recentReports || recentReports.length === 0) {
            container.innerHTML = `
                <div class="card-box center-card">
                    <i data-lucide="inbox" class="icon-xl" style="color:var(--text-muted); margin-bottom:8px;"></i>
                    <div style="font-weight:800; color:var(--text-muted);">هنوز هیچ گزارشی در دفترچه ثبت نکرده‌اید!</div>
                </div>`;
            return;
        }

        container.innerHTML = recentReports.map((report, index) => {
            const courses = report.courses || [];
            const life = report.lifestyle || {};

            let totalStudy = 0;
            let totalTests = 0;
            const chartLabels = [];
            const chartData = [];

            const coursesHtml = courses.map(c => {
                const cTime = (parseFloat(c.edu) || 0) + (parseFloat(c.study) || 0);
                totalStudy += cTime;
                totalTests += (parseInt(c.tests, 10) || 0);
                chartLabels.push(c.name);
                chartData.push(cTime);

                return `
                    <div class="history-course-item">
                        <span class="history-course-name">${c.name}</span>
                        <div class="history-course-badges">
                            <span class="h-badge-edu">آموزش: ${c.edu || 0} ساعت</span>
                            <span class="h-badge-std">مطالعه: ${c.study || 0} ساعت</span>
                            <span class="h-badge-tst">تست: ${c.tests || 0}</span>
                        </div>
                    </div>
                `;
            }).join('');

            const phoneTime = parseFloat(life.phone) || 0;
            const phoneClass = phoneTime >= 2 ? 'danger-text' : 'primary-text';

            let moodIcon = 'smile';
            if (life.mood === 'عالی') moodIcon = 'zap';
            else if (life.mood === 'معمولی') moodIcon = 'meh';
            else if (life.mood === 'بد') moodIcon = 'frown';

            const sleepSvg = `
                <div style="text-align:center; padding: 10px 0;">
                    <svg viewBox="0 0 200 115" style="width:100%; max-width:260px; height:auto; overflow:visible; margin:0 auto; display:block;">
                        <defs>
                            <linearGradient id="histGrad_${index}" x1="0%" y1="0%" x2="100%" y2="0%"> 
                                <stop offset="0%" stop-color="var(--primary)" />
                                <stop offset="100%" stop-color="var(--accent)" />
                            </linearGradient>
                        </defs>
                        <path d="M 30 78 A 70 70 0 0 1 170 78" fill="none" stroke="var(--border)" stroke-width="4" stroke-dasharray="4 4" />
                        <path d="M 30 78 A 70 70 0 0 1 170 78" fill="none" stroke="url(#histGrad_${index})" stroke-width="6" stroke-dasharray="8 6" stroke-linecap="round" />
                        <circle cx="30" cy="78" r="14" fill="var(--surface-2)" stroke="var(--primary)" stroke-width="2"/>
                        <circle cx="170" cy="78" r="14" fill="var(--surface-2)" stroke="var(--accent)" stroke-width="2"/>
                        <text x="30" y="82" font-size="11" fill="var(--primary)" text-anchor="middle" font-weight="bold">شب</text>
                        <text x="170" y="82" font-size="11" fill="var(--accent)" text-anchor="middle" font-weight="bold">صبح</text>
                        <text x="30" y="110" font-size="13" fill="var(--text-main)" text-anchor="middle" font-weight="900" font-family="Vazirmatn">${life.sleepLast || '23:00'}</text>
                        <text x="170" y="110" font-size="13" fill="var(--text-main)" text-anchor="middle" font-weight="900" font-family="Vazirmatn">${life.wakeToday || '07:00'}</text>
                    </svg>
                </div>
            `;

            const safeLabelsAttr = encodeURIComponent(JSON.stringify(chartLabels));
            const safeDataAttr = encodeURIComponent(JSON.stringify(chartData));

            return `
                <div class="history-accordion-item" id="histCard_${index}" data-labels="${safeLabelsAttr}" data-values="${safeDataAttr}">
                    <div class="history-acc-header" onclick="AnalyticsModule.toggleHistoryCard(${index})">
                        <div class="history-date-badge">${report.report_date}</div>
                        <div class="history-summary-pills">
                            <span><i data-lucide="clock" class="icon-sm primary-text"></i> ${Number(totalStudy.toFixed(1))} ساعت</span>
                            <span><i data-lucide="target" class="icon-sm accent-text"></i> ${totalTests} تست</span>
                            <span><i data-lucide="${moodIcon}" class="icon-sm gold-text"></i></span>
                            <i data-lucide="chevron-down" class="icon-sm"></i>
                        </div>
                    </div>
                    <div class="history-acc-body">
                        ${totalStudy > 0 ? `
                            <div class="section-inline-title" style="margin-bottom:10px;">
                                <i data-lucide="pie-chart" class="icon-sm accent-text"></i>
                                <span>نمودار سهم دروس این روز</span>
                            </div>
                            <div class="card-box" style="display:flex; justify-content:center; padding:14px;">
                                <div style="position:relative; width:100%; max-width:220px; height:200px;">
                                    <canvas id="histChart_${index}"></canvas>
                                </div>
                            </div>
                        ` : ''}

                        <div class="section-inline-title" style="margin-bottom:10px;">
                            <i data-lucide="moon" class="icon-sm indigo-text"></i>
                            <span>چرخه خواب و بیداری</span>
                        </div>
                        <div class="card-box" style="padding:12px; margin-bottom:14px;">
                            ${sleepSvg}
                        </div>

                        <div class="section-inline-title" style="margin-bottom:10px;">
                            <i data-lucide="activity" class="icon-sm primary-text"></i>
                            <span>ریکاوری و لایف‌استایل</span>
                        </div>
                        <div class="history-life-grid">
                            <div class="history-life-widget">
                                <span style="font-size:11.5px; color:var(--text-muted); font-weight:800;">فضای مجازی و گوشی</span>
                                <span style="font-size:15px; font-weight:900;" class="${phoneClass}">${life.phone || 0} ساعت</span>
                            </div>
                            <div class="history-life-widget">
                                <span style="font-size:11.5px; color:var(--text-muted); font-weight:800;">چرت و استراحت روزانه</span>
                                <span style="font-size:15px; font-weight:900; color:var(--primary);">${life.nap || 0} ساعت</span>
                            </div>
                        </div>

                        <div class="section-inline-title" style="margin-bottom:10px;">
                            <i data-lucide="book-open" class="icon-sm primary-text"></i>
                            <span>ریز عملکرد درسی</span>
                        </div>
                        <div>${coursesHtml || '<div style="font-size:12px;color:var(--text-muted);">درسی در این روز ثبت نشده است.</div>'}</div>
                    </div>
                </div>
            `;
        }).join('');
    },

    toggleHistoryCard(index) {
        const card = document.getElementById(`histCard_${index}`);
        if (!card) return;
        const isOpen = card.classList.contains('open');

        document.querySelectorAll('#historyAccordionContainer .history-accordion-item').forEach(c => c.classList.remove('open'));
        if (!isOpen) {
            card.classList.add('open');
            const canvas = document.getElementById(`histChart_${index}`);
            if (canvas && !this.historyChartInstances[index] && window.Chart) {
                try {
                    const labels = JSON.parse(decodeURIComponent(card.getAttribute('data-labels') || '[]'));
                    const data = JSON.parse(decodeURIComponent(card.getAttribute('data-values') || '[]'));
                    this.historyChartInstances[index] = new Chart(canvas.getContext('2d'), {
                        type: 'doughnut',
                        data: {
                            labels: labels,
                            datasets: [{
                                data: data,
                                backgroundColor: this.chartColors.slice(0, data.length),
                                borderWidth: 0
                            }]
                        },
                        options: {
                            responsive: true,
                            maintainAspectRatio: false,
                            cutout: '64%',
                            plugins: {
                                legend: { position: 'bottom', labels: { font: { family: 'Vazirmatn', size: 10 } } }
                            }
                        }
                    });
                } catch (_) {}
            }
        }
    },

    // ======================================================================
    // 🧠 ۸. کلینیک هوشمند و اسپرینت آزمون (بر اساس جدول week_status_calendar)
    // ======================================================================
    renderClinicDossiers() {
        const container = document.getElementById('clinicDossiersContainer');
        if (!container) return;

        const todayShamsi = this.getTodayShamsiStr();
        const studentGrade = AppState.studentGrade || 'دوازدهم';
        const rawGrade = AppState.studentData?.grade || studentGrade;

        // فیلتر کردن هفته‌های جدول week_status_calendar که شروع آن‌ها تا امروز بوده و شامل پایه دانش‌آموز است
        let weeks = (this.weekCalendars || []).filter(w => {
            const gradeArr = Array.isArray(w.target_grade) ? w.target_grade : [];
            const gradeMatch = gradeArr.length === 0 ||
                gradeArr.includes('all') ||
                gradeArr.includes(studentGrade) ||
                gradeArr.includes(rawGrade) ||
                (rawGrade.includes('پشت') && gradeArr.includes('فارغ التحصیل'));
            return gradeMatch && String(w.start_date) <= todayShamsi;
        });

        if (weeks.length === 0) {
            container.innerHTML = `
                <div class="card-box center-card">
                    <i data-lucide="calendar-clock" class="icon-xl" style="color:var(--text-muted); margin-bottom:8px;"></i>
                    <div style="font-weight:800; color:var(--text-muted);">هنوز هفته فعالی در تقویم آموزشی تعریف نشده است.</div>
                </div>`;
            return;
        }

        container.innerHTML = weeks.map(w => {
            const wId = `wk_${w.id}`;
            const startStr = UI.toEngDigits(w.start_date);
            const endStr = UI.toEngDigits(w.end_date);

            // تشخیص نوع هفته از جدول week_status_calendar یا جدول برنامه دانش‌آموز (ai_schedules)
            const matchedSchedule = (AppState.allSchedules || []).find(s =>
                (s.week_label && s.week_label.includes(w.title))
            );
            const isExamWeek = String(w.week_type).toLowerCase() === 'exam' ||
                (matchedSchedule && String(matchedSchedule.week_type).toLowerCase() === 'exam');

            // شمارش گزارش‌های ثبت‌شده دانش‌آموز در بازه تاریخی این هفته
            const weekReports = (AppState.dailyReports || []).filter(r => {
                const rDate = UI.toEngDigits(r.report_date);
                return rDate >= startStr && rDate <= endStr;
            });
            const reportCount = weekReports.length;

            // بررسی وجود تحلیل قبلی در exam_results یا ai_analyses
            const existingExamResult = (AppState.examResults || []).find(ex =>
                UI.toEngDigits(ex.period_start) === startStr && UI.toEngDigits(ex.period_end) === endStr
            );
            const existingAiAnalysis = (AppState.aiAnalyses || []).find(ai =>
                ai.request_date === w.title || ai.request_date === `${this.getShortPersianDate(startStr)} تا ${this.getShortPersianDate(endStr)}`
            );

            let statusPillHtml = '';
            if ((existingExamResult && existingExamResult.status === 'approved') || (existingAiAnalysis && existingAiAnalysis.status === 'completed')) {
                statusPillHtml = `<span class="status-pill" style="background:var(--success-fade);color:var(--success);">مشاهده تحلیل آماده</span>`;
            } else if ((existingExamResult && existingExamResult.status === 'pending') || (existingAiAnalysis && existingAiAnalysis.status === 'pending')) {
                statusPillHtml = `<span class="status-pill" style="background:var(--gold-fade);color:var(--gold);">در صف پردازش</span>`;
            } else if (reportCount >= 6) {
                statusPillHtml = `<span class="status-pill" style="background:var(--primary-fade);color:var(--primary);">آماده درخواست تحلیل (${reportCount}/۷)</span>`;
            } else {
                statusPillHtml = `<span class="status-pill" style="background:var(--surface-2);color:var(--text-muted);">دیتای ناکافی (${reportCount}/۶ گزارش)</span>`;
            }

            const weekBadge = isExamWeek
                ? `<span class="konkur-pill" style="background:var(--accent-fade);color:var(--accent);"><i data-lucide="file-spreadsheet" class="icon-sm"></i> هفته آزمون</span>`
                : `<span class="konkur-pill"><i data-lucide="Trending-up" class="icon-sm"></i> فاز پیشروی</span>`;

            return `
                <div class="clinic-dossier-card" id="dossierCard_${wId}">
                    <div class="clinic-dossier-header" onclick="AnalyticsModule.toggleClinicDossier('${wId}', '${startStr}', '${endStr}', ${isExamWeek}, '${w.title}')">
                        <div>
                            <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
                                <strong style="font-size:14.5px; color:var(--text-main);">${w.title}</strong>
                                ${weekBadge}
                            </div>
                            <div style="font-size:11.5px; color:var(--text-muted); font-weight:700;">
                                ${this.getShortPersianDate(startStr)} الی ${this.getShortPersianDate(endStr)}
                            </div>
                        </div>
                        <div style="display:flex; align-items:center; gap:8px;">
                            ${statusPillHtml}
                            <i data-lucide="chevron-down" class="icon-sm"></i>
                        </div>
                    </div>
                    <div class="clinic-dossier-body" id="dossierBody_${wId}"></div>
                </div>
            `;
        }).join('');

        UI.refreshIcons();
    },

    toggleClinicDossier(wId, startStr, endStr, isExamWeek, weekTitle) {
        const card = document.getElementById(`dossierCard_${wId}`);
        const body = document.getElementById(`dossierBody_${wId}`);
        if (!card || !body) return;

        const isOpen = card.classList.contains('open');
        document.querySelectorAll('#clinicDossiersContainer .clinic-dossier-card').forEach(c => c.classList.remove('open'));
        if (isOpen) return;

        card.classList.add('open');

        // ۱. بررسی تحلیل موجود
        const existingExam = (AppState.examResults || []).find(ex =>
            UI.toEngDigits(ex.period_start) === startStr && UI.toEngDigits(ex.period_end) === endStr
        );
        const shortRangeLabel = `${this.getShortPersianDate(startStr)} تا ${this.getShortPersianDate(endStr)}`;
        const existingAi = (AppState.aiAnalyses || []).find(ai =>
            ai.request_date === weekTitle || ai.request_date === shortRangeLabel
        );

        // الف) اگر تحلیل تاییدشده / تکمیل‌شده وجود دارد -> نمایش نتیجه و نمودارهای پرونده
        if ((existingExam && existingExam.status === 'approved') || (existingAi && existingAi.status === 'completed')) {
            const rawText = existingExam?.consultant_analysis || existingAi?.ai_response || '';
            const formattedText = String(rawText)
                .replace(/###\s*(.*?)\n/g, '<h4 style="color:var(--primary); margin:14px 0 6px 0; font-weight:900;">$1</h4>')
                .replace(/##\s*(.*?)\n/g, '<h4 style="color:var(--primary); margin:14px 0 6px 0; font-weight:900;">$1</h4>')
                .replace(/\*\*(.*?)\*\*/g, '<strong style="color:var(--accent);">$1</strong>')
                .replace(/\n/g, '<br>');

            const hasExamCharts = existingExam && existingExam.extracted_data && AppState.isConsultant;
            body.innerHTML = `
                <div style="display:flex; align-items:center; gap:6px; color:var(--success); font-weight:900; font-size:13.5px; margin-bottom:10px;">
                    <i data-lucide="check-circle-2" class="icon-sm"></i>
                    <span>نتیجه کالبدشکافی و تحلیل هوشمند این هفته:</span>
                </div>
                <div class="ai-result-formatted">${formattedText}</div>
                ${hasExamCharts ? `
                    <div id="dossierChartsWrap_${wId}" style="display:grid; grid-template-columns:1fr; gap:14px;">
                        <div class="card-box" style="margin:0;">
                            <div style="font-size:12.5px; font-weight:900; color:var(--accent); text-align:center; margin-bottom:8px;">ترازوی عدالت (ساعت مطالعه در برابر تراز کارنامه)</div>
                            <div style="position:relative; height:260px;"><canvas id="dossierRadar_${wId}"></canvas></div>
                        </div>
                        <div class="card-box" style="margin:0;">
                            <div style="font-size:12.5px; font-weight:900; color:var(--primary); text-align:center; margin-bottom:8px;">مدیریت زمان به تفکیک هر درس (درست / غلط / نزده)</div>
                            <div style="position:relative; height:240px;"><canvas id="dossierBar_${wId}"></canvas></div>
                        </div>
                    </div>
                ` : ''}
            `;
            UI.refreshIcons();
            if (hasExamCharts) {
                this.renderDossierExamCharts(wId, existingExam.extracted_data, existingExam.lifestyle_snapshot);
            }
            return;
        }

        // ب) اگر درخواست در وضعیت pending است
        if ((existingExam && existingExam.status === 'pending') || (existingAi && existingAi.status === 'pending')) {
            body.innerHTML = `
                <div class="card-box center-card" style="margin:0;">
                    <div class="modal-icon-ring gold"><i data-lucide="hourglass" class="icon-lg"></i></div>
                    <h4>پرونده شما در صف تحلیل قرار دارد</h4>
                    <p class="muted-desc" style="margin-bottom:0;">درخواست شما با موفقیت ثبت شده و به زودی نتیجه کالبدشکافی در همین بخش نمایش داده می‌شود.</p>
                </div>
            `;
            UI.refreshIcons();
            return;
        }

        // ج) شمارش گزارش‌های هفته برای بررسی شرط حداقل ۶ گزارش
        const weekReports = (AppState.dailyReports || []).filter(r => {
            const rDate = UI.toEngDigits(r.report_date);
            return rDate >= startStr && rDate <= endStr;
        });

        if (weekReports.length < 6) {
            body.innerHTML = `
                <div class="card-box center-card" style="margin:0; border-color:var(--danger);">
                    <div class="modal-icon-ring danger"><i data-lucide="lock" class="icon-lg"></i></div>
                    <h4 class="danger-text">دیتای این هفته هنوز کامل نیست (${weekReports.length} از ۶ گزارش)</h4>
                    <p class="muted-desc">برای دریافت تحلیل دقیق، باید حداقل ۶ روز از این هفته (${this.getShortPersianDate(startStr)} تا ${this.getShortPersianDate(endStr)}) گزارش ثبت کرده باشید.</p>
                    <button type="button" class="btn-outline-full" onclick="Router.switchMainTab('report')" style="max-width:240px; margin:0 auto;">
                        <i data-lucide="file-pen-line" class="icon-sm"></i>
                        <span>رفتن به بخش ثبت گزارش</span>
                    </button>
                </div>
            `;
            UI.refreshIcons();
            return;
        }

        // د) فرم آماده ارسال درخواست تحلیل (با تفکیک هفته آزمون/پیشروی و تفکیک کاربر اشتراکی/رایگان)
        this.uploadedExamFiles[wId] = { file1: null, file2: null };

        let examSectionHtml = '';
        if (isExamWeek) {
            if (AppState.isConsultant) {
                // دانش‌آموز دارای اشتراک مشاوره -> امکان آپلود هم‌زمان تا ۲ فایل کارنامه
                examSectionHtml = `
                    <div style="background:var(--gold-fade); border:1px solid rgba(245,158,11,0.4); padding:12px 14px; border-radius:14px; margin-bottom:14px; font-size:12px; font-weight:800; color:var(--gold);">
                        <i data-lucide="award" class="icon-sm"></i>
                        <span>فاز آزمون جامع: می‌توانید تصویر یا PDF کارنامه خود را (تا ۲ فایل هم‌زمان) بارگذاری کنید تا علاوه بر عملکرد ۱۴ روزه، تراز و تله‌های تستی شما کالبدشکافی شود.</span>
                    </div>
                    <div class="dual-upload-grid">
                        <div class="exam-upload-slot" id="slot1_${wId}" onclick="document.getElementById('fileInp1_${wId}').click()">
                            <i data-lucide="file-up" class="icon-lg primary-text"></i>
                            <div style="font-size:12px; font-weight:900; color:var(--text-main);" id="slot1Lbl_${wId}">فایل اول کارنامه (الزامی)</div>
                            <small style="font-size:10.5px; color:var(--text-muted);">یا انتخاب ۲ فایل هم‌زمان</small>
                            <input type="file" id="fileInp1_${wId}" accept="image/*,application/pdf" multiple style="display:none;"
                                   onchange="AnalyticsModule.handleExamFilesSelect(this, '${wId}', 1)">
                        </div>
                        <div class="exam-upload-slot" id="slot2_${wId}" onclick="document.getElementById('fileInp2_${wId}').click()">
                            <i data-lucide="file-plus-2" class="icon-lg accent-text"></i>
                            <div style="font-size:12px; font-weight:900; color:var(--text-main);" id="slot2Lbl_${wId}">فایل دوم کارنامه (اختیاری)</div>
                            <small style="font-size:10.5px; color:var(--text-muted);">صفحه دوم یا پاسخبرگ</small>
                            <input type="file" id="fileInp2_${wId}" accept="image/*,application/pdf" style="display:none;"
                                   onchange="AnalyticsModule.handleExamFilesSelect(this, '${wId}', 2)">
                        </div>
                    </div>
                `;
            } else {
                // دانش‌آموز بدون اشتراک مشاوره در هفته آزمون -> نمایش بنر ارتقا + اجازه دریافت تحلیل بدون کارنامه
                examSectionHtml = `
                    <div style="background:linear-gradient(135deg, var(--gold-fade), var(--surface)); border:1px dashed var(--gold); padding:16px; border-radius:16px; margin-bottom:14px;">
                        <div style="display:flex; align-items:center; gap:8px; font-weight:900; font-size:13.5px; color:var(--gold); margin-bottom:6px;">
                            <i data-lucide="crown" class="icon-sm"></i>
                            <span>این هفته، هفته آزمون است! (تحلیل کارنامه مخصوص اشتراک مشاوره)</span>
                        </div>
                        <p style="font-size:12px; color:var(--text-main); line-height:1.75; margin-bottom:10px;">
                            شما می‌توانید <strong>تحلیل عملکرد مطالعاتی و لایف‌استایل</strong> این هفته را در پایین همین کادر بدون کارنامه دریافت کنید؛ اما اگر می‌خواهید <strong>تصویر کارنامه آزمون</strong> خود را نیز ارسال کنید تا درصدها، تراز و مدیریت زمان شما موشکافی شود، اشتراک مشاوره تهیه فرمایید.
                        </p>
                        <button type="button" class="btn-modal" style="max-width:240px; padding:9px 14px; font-size:12px; margin:0;" onclick="Router.openSubPage('store-renew')">
                            <i data-lucide="sparkles" class="icon-sm"></i>
                            <span>تهیه اشتراک جهت تحلیل کارنامه</span>
                        </button>
                    </div>
                `;
            }
        } else {
            examSectionHtml = `
                <div style="background:var(--primary-fade); border:1px solid rgba(99,152,137,0.35); padding:12px 14px; border-radius:14px; margin-bottom:14px; font-size:12px; font-weight:800; color:var(--primary);">
                    <i data-lucide="check-circle" class="icon-sm"></i>
                    <span>فاز پیشروی و روتین: کیفیت ساعت مطالعه، تعادل تستی و لایف‌استایل ۷ روز شما در این هفته کالبدشکافی می‌شود.</span>
                </div>
            `;
        }

        body.innerHTML = `
            ${examSectionHtml}

            <div class="slider-group" style="background:var(--surface);">
                <div class="slider-header">
                    <span class="slider-label">نمره خودارزیابی شما به عملکرد این هفته (از ۱ تا ۱۰):</span>
                    <span class="slider-val" id="scoreVal_${wId}">7</span>
                </div>
                <input type="range" id="selfScore_${wId}" min="1" max="10" value="7"
                       oninput="document.getElementById('scoreVal_${wId}').innerText = this.value">
            </div>

            <textarea class="modern-input" id="reflection_${wId}" rows="3" style="background:var(--surface); margin-bottom:12px;"
                      placeholder="یادداشت و اعترافات شما: در این هفته چه چالش یا نقطه قوتی داشتید؟"></textarea>

            <button type="button" class="btn-primary-full" id="btnSubmitClinic_${wId}"
                    onclick="AnalyticsModule.submitClinicAnalysis('${wId}', '${startStr}', '${endStr}', ${isExamWeek}, '${weekTitle}')">
                <i data-lucide="send" class="icon-sm"></i>
                <span>${isExamWeek && AppState.isConsultant ? 'ارسال کارنامه و دریافت کالبدشکافی جامع' : 'ارسال پرونده برای تحلیل عملکرد هفته'}</span>
            </button>
        `;

        UI.refreshIcons();
    },

    // مدیریت انتخاب ۱ یا ۲ فایل هم‌زمان کارنامه آزمون
    handleExamFilesSelect(inputEl, wId, slotNum) {
        if (!inputEl.files || inputEl.files.length === 0) return;
        if (!this.uploadedExamFiles[wId]) {
            this.uploadedExamFiles[wId] = { file1: null, file2: null };
        }

        const readFileAsBase64 = (file, targetSlot) => {
            if (file.size > 6 * 1024 * 1024) {
                UI.showToast(`حجم فایل ${file.name} بیش از ۶ مگابایت است.`, 'error');
                return;
            }
            const reader = new FileReader();
            reader.onload = (e) => {
                const base64 = e.target.result.split(',')[1];
                this.uploadedExamFiles[wId][`file${targetSlot}`] = {
                    base64: base64,
                    mime: file.type || 'image/jpeg',
                    name: file.name
                };
                const slotBox = document.getElementById(`slot${targetSlot}_${wId}`);
                const slotLbl = document.getElementById(`slot${targetSlot}Lbl_${wId}`);
                if (slotBox) slotBox.classList.add('has-file');
                if (slotLbl) slotLbl.innerText = `فایل ${targetSlot}: ${file.name}`;
            };
            reader.readAsDataURL(file);
        };

        // اگر کاربر در باکس اول به صورت هم‌زمان ۲ فایل را انتخاب کرده باشد، هر دو باکس پر می‌شوند!
        if (slotNum === 1 && inputEl.files.length >= 2) {
            readFileAsBase64(inputEl.files[0], 1);
            readFileAsBase64(inputEl.files[1], 2);
        } else {
            readFileAsBase64(inputEl.files[0], slotNum);
        }
    },

    async submitClinicAnalysis(wId, startStr, endStr, isExamWeek, weekTitle) {
        const reflection = document.getElementById(`reflection_${wId}`)?.value.trim() || '';
        const selfScore = parseInt(document.getElementById(`selfScore_${wId}`)?.value, 10) || 7;
        const canUploadExam = isExamWeek && AppState.isConsultant;
        const filesObj = this.uploadedExamFiles[wId] || {};

        if (canUploadExam && !filesObj.file1) {
            return UI.showToast('لطفاً حداقل فایل اول کارنامه آزمون خود را بارگذاری کنید.', 'error');
        }
        if (reflection.length < 5) {
            return UI.showToast('لطفاً یک توضیح کوتاه درباره عملکرد یا چالش‌های این هفته خود بنویسید.', 'error');
        }

        const btn = document.getElementById(`btnSubmitClinic_${wId}`);
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span>در حال ارسال پرونده به موتور تحلیل...</span>';
        }

        const uid = String(AppState.userId);

        try {
            // ارسال به موتور تحلیل گوگل اسکریپت (پشتیبانی از ۱ یا ۲ فایل هم‌زمان)
            const response = await fetch(GAS_WEBAPP_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'text/plain;charset=utf-8' },
                body: JSON.stringify({
                    action: 'analyze_period',
                    student_id: uid,
                    start_date: startStr,
                    end_date: endStr,
                    has_exam: canUploadExam,
                    student_score: selfScore,
                    reflection: reflection,
                    mime_type: canUploadExam && filesObj.file1 ? filesObj.file1.mime : null,
                    file_base64: canUploadExam && filesObj.file1 ? filesObj.file1.base64 : null,
                    mime_type_2: canUploadExam && filesObj.file2 ? filesObj.file2.mime : null,
                    file_base64_2: canUploadExam && filesObj.file2 ? filesObj.file2.base64 : null
                })
            });

            const result = await response.json();
            if (!result.success) {
                throw new Error(result.error || 'خطا در ثبت تحلیل');
            }

            // افزودن موقت به حافظه محلی تا بلافاصله وضعیت در صف پردازش نمایش داده شود
            AppState.examResults.push({
                chat_id: uid,
                period_start: startStr,
                period_end: endStr,
                is_exam_week: canUploadExam,
                status: 'pending'
            });

            UI.showToast('پرونده شما با موفقیت ارسال شد و در صف تحلیل قرار گرفت.', 'success');
            this.renderClinicDossiers();

        } catch (err) {
            UI.showToast('خطا در ارسال درخواست: ' + (err.message || 'ارتباط با سرور برقرار نشد'), 'error');
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<span>تلاش مجدد ارسال پرونده</span>';
            }
        }
    },

    // رسم نمودارهای رادار و مدیریت زمان داخل هر پرونده آزمون تاییدشده
    renderDossierExamCharts(wId, extractedData, lifestyleSnapshot) {
        if (!window.Chart) return;
        let examData = [];
        let lifestyle = {};
        try {
            examData = typeof extractedData === 'string' ? JSON.parse(extractedData || "[]") : (extractedData || []);
            lifestyle = typeof lifestyleSnapshot === 'string' ? JSON.parse(lifestyleSnapshot || "{}") : (lifestyleSnapshot || {});
        } catch (_) {}

        if (!Array.isArray(examData) || examData.length === 0) return;

        const labels = examData.map(l => l.name);
        const corrects = examData.map(l => Number(l.correct || 0));
        const incorrects = examData.map(l => Number(l.incorrect || 0));
        const unattempteds = examData.map(l => Number(l.unattempted || 0));

        const rawTaraz = examData.map(l => Number(l.taraz || 0));
        const maxTaraz = Math.max(...rawTaraz, 1);
        const normalizedTaraz = rawTaraz.map(t => Math.round((t / maxTaraz) * 100));

        const subjectStats = lifestyle.subject_stats || {};
        const rawStudyHours = labels.map(lessonName => {
            const foundKey = Object.keys(subjectStats).find(k => lessonName.includes(k) || k.includes(lessonName));
            return foundKey ? ((Number(subjectStats[foundKey].study) || 0) + (Number(subjectStats[foundKey].edu) || 0)) : 0;
        });
        const maxStudy = Math.max(...rawStudyHours, 1);
        const normalizedStudy = rawStudyHours.map(s => Math.round((s / maxStudy) * 100));

        const ctxRadar = document.getElementById(`dossierRadar_${wId}`);
        if (ctxRadar) {
            if (this.dossierChartInstances[`r_${wId}`]) this.dossierChartInstances[`r_${wId}`].destroy();
            this.dossierChartInstances[`r_${wId}`] = new Chart(ctxRadar.getContext('2d'), {
                type: 'radar',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'تلاش (ساعت مطالعه)',
                            data: normalizedStudy,
                            backgroundColor: 'rgba(99, 152, 137, 0.22)',
                            borderColor: '#639889',
                            borderWidth: 2
                        },
                        {
                            label: 'نتیجه (تراز کارنامه)',
                            data: normalizedTaraz,
                            backgroundColor: 'rgba(217, 133, 138, 0.22)',
                            borderColor: '#d9858a',
                            borderWidth: 2
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: { r: { ticks: { display: false, min: 0, max: 100 } } }
                }
            });
        }

        const ctxBar = document.getElementById(`dossierBar_${wId}`);
        if (ctxBar) {
            if (this.dossierChartInstances[`b_${wId}`]) this.dossierChartInstances[`b_${wId}`].destroy();
            this.dossierChartInstances[`b_${wId}`] = new Chart(ctxBar.getContext('2d'), {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [
                        { label: 'درست', data: corrects, backgroundColor: '#10b981' },
                        { label: 'غلط', data: incorrects, backgroundColor: '#ef4444' },
                        { label: 'نزده', data: unattempteds, backgroundColor: '#94a3b8' }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: { stacked: true, grid: { display: false } },
                        y: { stacked: true }
                    }
                }
            });
        }
    }
};

window.AnalyticsModule = AnalyticsModule;
