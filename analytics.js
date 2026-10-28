/* ==========================================================================
   📊 ماژول تحلیل عملکرد، رادار آزمون و کلینیک هوشمند (js/analytics.js)
   متصل به تب ۴ اپلیکیشن (#tab-analytics) و هماهنگ با حافظه مرکزی (AppState)
   ========================================================================== */

const AnalyticsModule = {
    dashTrendChartInstance: null,
    dashSubjectChartInstance: null,
    radarTarazChartInstance: null,

    // ======================================================================
    // 🧭 ۱. سوییچ بین زیربخش‌های تحلیل عملکرد (رادار و نمودارها / کلینیک هوشمند)
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

    // ======================================================================
    // 🚀 ۲. راه‌اندازی و محاسبه شاخص‌های کلیدی (KPIs)، رتبه و لایف‌استایل
    // ======================================================================
    init() {
        const reports = AppState.dailyReports || [];
        let totalHours = 0;
        let totalTests = 0;
        let maxDaily = 0;
        let phoneSum = 0;
        let moodCounts = { 'عالی': 0, 'خوب': 0, 'معمولی': 0, 'بد': 0 };

        reports.forEach(r => {
            let dayHours = 0;
            (r.courses || []).forEach(c => {
                const h = (parseFloat(c.edu) || 0) + (parseFloat(c.study) || 0);
                dayHours += h;
                totalTests += (parseInt(c.tests) || 0);
            });
            totalHours += dayHours;
            if (dayHours > maxDaily) maxDaily = dayHours;

            if (r.lifestyle) {
                phoneSum += parseFloat(r.lifestyle.phone) || 0;
                if (r.lifestyle.mood && moodCounts[r.lifestyle.mood] !== undefined) {
                    moodCounts[r.lifestyle.mood]++;
                }
            }
        });

        const avgDaily = reports.length > 0 ? (totalHours / reports.length).toFixed(1) : '0';

        // مقداردهی به کارت‌های KPI اصلی
        const kpiStudyEl = document.getElementById('kpiTotalStudy');
        const kpiTestsEl = document.getElementById('kpiTotalTests');
        const kpiMaxEl = document.getElementById('kpiMaxDaily');
        const kpiAvgEl = document.getElementById('kpiAvgDaily');
        const heroHoursEl = document.getElementById('dashTotalHoursHero');
        const homeHoursEl = document.getElementById('homeTotalHours');

        if (kpiStudyEl) kpiStudyEl.innerText = Math.round(totalHours).toLocaleString('fa-IR');
        if (kpiTestsEl) kpiTestsEl.innerText = totalTests.toLocaleString('fa-IR');
        if (kpiMaxEl) kpiMaxEl.innerText = maxDaily.toLocaleString('fa-IR');
        if (kpiAvgEl) kpiAvgEl.innerText = avgDaily;
        if (heroHoursEl) heroHoursEl.innerText = `${Math.round(totalHours).toLocaleString('fa-IR')} ساعت`;
        if (homeHoursEl) homeHoursEl.innerText = `${Math.round(totalHours).toLocaleString('fa-IR')} ساعت`;

        // محاسبه سطح و درجه مطالعاتی (Rank Progression)
        const ranks = [
            { limit: 50, title: 'جنگجوی تازه‌نفس' },
            { limit: 200, title: 'رهجوی پرتلاش' },
            { limit: 500, title: 'تکاور کنکور' },
            { limit: 1000, title: 'فرمانده تمرکز' },
            { limit: 2500, title: 'اسطوره راهینو' }
        ];

        const currentRank = ranks.find(rk => totalHours < rk.limit) || ranks[ranks.length - 1];
        const rankTitleEl = document.getElementById('dashRankTitle');
        const rankProgressEl = document.getElementById('dashRankProgressFill');
        const nextRankLabelEl = document.getElementById('dashNextRankLabel');

        if (rankTitleEl) rankTitleEl.innerText = currentRank.title;
        if (rankProgressEl) {
            const pct = Math.min(100, Math.round((totalHours / currentRank.limit) * 100));
            rankProgressEl.style.width = `${pct}%`;
        }
        if (nextRankLabelEl) {
            const remHours = Math.max(0, Math.round(currentRank.limit - totalHours));
            nextRankLabelEl.innerText = `${remHours.toLocaleString('fa-IR')} ساعت تا درجه بعدی`;
        }

        // پردازش و نمایش لایف‌استایل
        const avgPhone = reports.length > 0 ? (phoneSum / reports.length).toFixed(1) : '0';
        const phoneAvgEl = document.getElementById('lifePhoneAvg');
        const sleepProfileEl = document.getElementById('lifeSleepProfile');
        const moodSummaryEl = document.getElementById('lifeMoodSummary');

        if (phoneAvgEl) phoneAvgEl.innerText = `${avgPhone} ساعت در روز`;
        if (sleepProfileEl) sleepProfileEl.innerText = parseFloat(avgPhone) <= 1.5 ? 'سحرخیز منظم' : 'نیازمند تنظیم خواب';
        if (moodSummaryEl) {
            const topMood = Object.keys(moodCounts).reduce((a, b) => moodCounts[a] >= moodCounts[b] ? a : b, 'خوب');
            moodSummaryEl.innerText = topMood;
        }

        // پردازش رادار آزمون (ProMax Radar)
        const exams = AppState.examResults || [];
        const maxTarazEl = document.getElementById('radarMaxTaraz');
        const avgTarazEl = document.getElementById('radarAvgTaraz');

        if (exams.length > 0) {
            const tarazList = exams.map(e => parseInt(e.taraz) || 0).filter(t => t > 0);
            const maxT = tarazList.length > 0 ? Math.max(...tarazList) : 0;
            const avgT = tarazList.length > 0 ? Math.round(tarazList.reduce((a, b) => a + b, 0) / tarazList.length) : 0;

            if (maxTarazEl) maxTarazEl.innerText = maxT ? maxT.toLocaleString('fa-IR') : '—';
            if (avgTarazEl) avgTarazEl.innerText = avgT ? avgT.toLocaleString('fa-IR') : '—';
        } else {
            if (maxTarazEl) maxTarazEl.innerText = '—';
            if (avgTarazEl) avgTarazEl.innerText = '—';
        }

        // رندر دفترچه گزارش‌های اخیر و بخش کلینیک
        this.renderHistory(reports.slice(0, 14));
        this.renderClinicAndSprints();

        // اگر کاربر در تب رادار باشد، نمودارها رسم شوند
        const activeSubView = document.querySelector('#tab-analytics .sub-view.active');
        if (activeSubView && activeSubView.id === 'subtab-ana-stats') {
            this.renderCharts();
        }

        UI.refreshIcons();
    },

    // ======================================================================
    // 📈 ۳. رسم نمودارهای تحلیلی (Chart.js)
    // ======================================================================
    renderCharts() {
        if (!window.Chart) return;

        // تنظیم فونت و رنگ پیش‌فرض برای چارت‌ها
        Chart.defaults.font.family = 'Vazirmatn';

        // ۱. نمودار ترکیبی روند مطالعه و تست (۷ روز گذشته)
        const reports = (AppState.dailyReports || []).slice(0, 7).reverse();
        const labels = reports.length > 0 
            ? reports.map(r => r.report_date ? r.report_date.slice(5) : '') 
            : ['روز ۱', 'روز ۲', 'روز ۳', 'روز ۴', 'روز ۵', 'روز ۶', 'روز ۷'];

        const studyData = reports.length > 0 
            ? reports.map(r => (r.courses || []).reduce((acc, c) => acc + (parseFloat(c.edu) || 0) + (parseFloat(c.study) || 0), 0)) 
            : [0, 0, 0, 0, 0, 0, 0];

        const testData = reports.length > 0 
            ? reports.map(r => (r.courses || []).reduce((acc, c) => acc + (parseInt(c.tests) || 0), 0)) 
            : [0, 0, 0, 0, 0, 0, 0];

        const ctxTrend = document.getElementById('dashTrendChart');
        if (ctxTrend) {
            if (this.dashTrendChartInstance) this.dashTrendChartInstance.destroy();
            this.dashTrendChartInstance = new Chart(ctxTrend, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [
                        {
                            label: 'ساعت مطالعه',
                            data: studyData,
                            backgroundColor: '#639889',
                            borderRadius: 8,
                            order: 2
                        },
                        {
                            label: 'تست (ضریب ۰.۱)',
                            data: testData.map(t => +(t / 10).toFixed(1)),
                            type: 'line',
                            borderColor: '#d9858a',
                            backgroundColor: '#d9858a',
                            tension: 0.35,
                            borderWidth: 2.5,
                            pointRadius: 3,
                            order: 1
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'top', labels: { boxWidth: 12 } }
                    },
                    scales: {
                        y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.06)' } },
                        x: { grid: { display: false } }
                    }
                }
            });
        }

        // ۲. نمودار دونات سهم مطالعه دروس
        const subjTotals = {};
        (AppState.dailyReports || []).forEach(r => {
            (r.courses || []).forEach(c => {
                const name = c.name || 'نامشخص';
                subjTotals[name] = (subjTotals[name] || 0) + (parseFloat(c.edu) || 0) + (parseFloat(c.study) || 0);
            });
        });

        const subjKeys = Object.keys(subjTotals);
        const ctxSubj = document.getElementById('dashSubjectChart');
        if (ctxSubj) {
            if (this.dashSubjectChartInstance) this.dashSubjectChartInstance.destroy();
            this.dashSubjectChartInstance = new Chart(ctxSubj, {
                type: 'doughnut',
                data: {
                    labels: subjKeys.length > 0 ? subjKeys : ['بدون ثبت درس'],
                    datasets: [{
                        data: subjKeys.length > 0 ? subjKeys.map(k => subjTotals[k]) : [1],
                        backgroundColor: ['#639889', '#d9858a', '#6366f1', '#f59e0b', '#10b981', '#3b82f6', '#ec4899', '#8b5cf6'],
                        borderWidth: 2,
                        borderColor: 'var(--surface)'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'bottom', labels: { boxWidth: 10 } }
                    }
                }
            });
        }

        // ۳. نمودار خطی تراز آزمون‌ها (Radar Taraz Chart)
        const exams = AppState.examResults || [];
        const ctxRadar = document.getElementById('radarTarazChart');
        if (ctxRadar) {
            if (this.radarTarazChartInstance) this.radarTarazChartInstance.destroy();
            this.radarTarazChartInstance = new Chart(ctxRadar, {
                type: 'line',
                data: {
                    labels: exams.length > 0 ? exams.map((e, idx) => e.exam_title || `آزمون ${idx + 1}`) : ['آزمون ۱', 'آزمون ۲', 'آزمون ۳'],
                    datasets: [{
                        label: 'تراز آزمون',
                        data: exams.length > 0 ? exams.map(e => parseInt(e.taraz) || 5000) : [5200, 5600, 6100],
                        borderColor: '#f59e0b',
                        backgroundColor: 'rgba(245, 158, 11, 0.15)',
                        fill: true,
                        tension: 0.35,
                        pointRadius: 4,
                        borderWidth: 2.5
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false }
                    },
                    scales: {
                        y: { grid: { color: 'rgba(255,255,255,0.06)' } },
                        x: { grid: { display: false } }
                    }
                }
            });
        }
    },

    // ======================================================================
    // 📖 ۴. رندر آکاردئون دفترچه آرشیو گزارش‌ها (History Accordion)
    // ======================================================================
    renderHistory(recentReports) {
        const container = document.getElementById('historyAccordionContainer');
        if (!container) return;

        if (!recentReports || recentReports.length === 0) {
            container.innerHTML = `
                <div class="card-box" style="text-align:center; color:var(--text-muted); padding:26px;">
                    هنوز گزارشی در دفترچه شما ثبت نشده است.
                </div>`;
            return;
        }

        container.innerHTML = recentReports.map((rep, idx) => {
            const dayHours = (rep.courses || []).reduce((acc, c) => acc + (parseFloat(c.edu) || 0) + (parseFloat(c.study) || 0), 0);
            const dayTests = (rep.courses || []).reduce((acc, c) => acc + (parseInt(c.tests) || 0), 0);

            const coursesHtml = (rep.courses || []).map(c => `
                <div style="display:flex; justify-content:space-between; padding:8px 10px; background:var(--surface); border-radius:10px; margin-bottom:6px; font-size:12px; font-weight:700;">
                    <span>${c.name}</span>
                    <span style="color:var(--primary);">${(parseFloat(c.edu) || 0) + (parseFloat(c.study) || 0)} ساعت | ${c.tests || 0} تست</span>
                </div>
            `).join('');

            return `
                <div class="history-accordion-item ${idx === 0 ? 'open' : ''}">
                    <div class="history-acc-header" onclick="this.parentElement.classList.toggle('open')">
                        <div style="display:flex; align-items:center; gap:8px; font-weight:900; font-size:13.5px;">
                            <i data-lucide="calendar" class="icon-sm" style="color:var(--primary);"></i>
                            <span>گزارش ${rep.report_date}</span>
                        </div>
                        <div style="display:flex; align-items:center; gap:10px; font-size:12px; font-weight:800; color:var(--primary);">
                            <span>${dayHours} ساعت</span>
                            <span>•</span>
                            <span>${dayTests} تست</span>
                            <i data-lucide="chevron-down" class="icon-sm"></i>
                        </div>
                    </div>
                    <div class="history-acc-body">
                        ${coursesHtml || '<div style="font-size:12px; color:var(--text-muted);">درسی در این روز ثبت نشده است.</div>'}
                        <div style="display:flex; gap:12px; flex-wrap:wrap; margin-top:8px; font-size:11.5px; color:var(--text-muted); font-weight:700;">
                            <span>خواب: ${rep.lifestyle?.sleepLast || '—'} تا ${rep.lifestyle?.wakeToday || '—'}</span>
                            <span>گوشی: ${rep.lifestyle?.phone || 0} ساعت</span>
                            <span>روحیه: ${rep.lifestyle?.mood || 'خوب'}</span>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        UI.refreshIcons();
    },

    // ======================================================================
    // 🧠 ۵. رندر کلینیک هوش مصنوعی و اسپرینت‌های آزمون (Clinic & Sprints)
    // ======================================================================
    renderClinicAndSprints() {
        const aiContainer = document.getElementById('aiStandardWeeksContainer');
        const sprintsContainer = document.getElementById('promaxSprintsContainer');
        const reportsCount = (AppState.dailyReports || []).length;

        if (aiContainer) {
            const latestAnalysis = (AppState.aiAnalyses || [])[0];
            aiContainer.innerHTML = `
                <div style="background:var(--surface-2); border:1px solid var(--border); border-radius:16px; padding:15px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                        <span style="font-size:13px; font-weight:900;">وضعیت گزارش‌های ثبت‌شده: ${Math.min(7, reportsCount)} از ۶ گزارش</span>
                        <span style="font-size:11.5px; font-weight:800; color:${reportsCount >= 6 ? 'var(--success)' : 'var(--gold)'};">
                            ${reportsCount >= 6 ? 'آماده دریافت تحلیل هفتگی' : 'نیازمند تکمیل حداقل ۶ گزارش'}
                        </span>
                    </div>
                    ${latestAnalysis && latestAnalysis.ai_response ? `
                        <div style="background:var(--surface); border:1px solid var(--border); border-radius:12px; padding:12px; font-size:12.5px; line-height:1.8; margin-bottom:10px;">
                            <div style="font-weight:900; color:var(--primary); margin-bottom:4px;">آخرین بازخورد هوشمند (${latestAnalysis.request_date || ''}):</div>
                            <div>${latestAnalysis.ai_response}</div>
                        </div>
                    ` : ''}
                    <textarea class="modern-input" id="aiWeeklyStudentNote" rows="2" placeholder="یادداشت، چالش‌ها یا دغدغه شما برای تحلیلگر هوشمند..." style="margin-bottom:10px;"></textarea>
                    <button type="button" class="btn-primary-full" onclick="AnalyticsModule.requestWeeklyAiAnalysis()" style="padding:12px; font-size:13.5px;">
                        <i data-lucide="sparkles" class="icon-sm"></i>
                        <span>درخواست ارزیابی هوشمند هفتگی</span>
                    </button>
                </div>
            `;
        }

        if (sprintsContainer) {
            if (!AppState.isConsultant) {
                sprintsContainer.innerHTML = `
                    <div class="card-box" style="text-align:center; padding:26px;">
                        <i data-lucide="lock" class="icon-xl" style="color:var(--gold); margin-bottom:8px;"></i>
                        <h4 style="font-size:15px; font-weight:900; margin-bottom:6px;">ویژه دانش‌آموزان طرح مشاوره</h4>
                        <p style="font-size:12.5px; color:var(--text-muted); margin-bottom:14px;">پرونده‌های اسپرینت دوهفته‌ای و کالبدشکافی کارنامه آزمون مختص طرح‌های مشاوره قطب‌نما است.</p>
                        <button type="button" class="btn-modal" onclick="UI.openModal('upsellModal')" style="max-width:260px; margin:0 auto;">مشاهده شرایط ارتقا</button>
                    </div>
                `;
            } else {
                sprintsContainer.innerHTML = `
                    <div class="card-box">
                        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
                            <div style="font-weight:900; font-size:14px; display:flex; align-items:center; gap:8px;">
                                <i data-lucide="file-spreadsheet" class="icon" style="color:var(--gold);"></i>
                                <span>ارسال کارنامه و دریافت جراحی اسپرینت</span>
                            </div>
                            <span class="konkur-pill">هفته آزمون</span>
                        </div>
                        <input type="text" class="modern-input" id="sprintReflectionNote" placeholder="تحلیل شخصی شما از آزمون (علت بی‌دقتی‌ها، مدیریت زمان، استرس و...)" style="margin-bottom:10px;">
                        <button type="button" class="btn-primary-full" onclick="UI.showToast('درخواست جراحی اسپرینت آزمون ثبت شد و در صف تحلیل قرار گرفت.', 'success')" style="padding:12px; font-size:13.5px;">
                            <i data-lucide="upload-cloud" class="icon-sm"></i>
                            <span>ثبت بازخورد و درخواست تحلیل اسپرینت</span>
                        </button>
                    </div>
                `;
            }
        }

        UI.refreshIcons();
    },

    // ======================================================================
    // 🤖 ۶. ارسال درخواست ارزیابی هفتگی به دیتابیس
    // ======================================================================
    async requestWeeklyAiAnalysis() {
        const reportsCount = (AppState.dailyReports || []).length;
        if (reportsCount < 6) {
            UI.showToast('برای دریافت تحلیل هفتگی، باید حداقل ۶ گزارش عملکرد ثبت کرده باشید.', 'error');
            return;
        }

        const noteInput = document.getElementById('aiWeeklyStudentNote');
        const note = noteInput ? noteInput.value.trim() : '';
        const uid = String(AppState.userId || '');

        try {
            const shamsiToday = new Intl.DateTimeFormat('fa-IR', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            }).format(new Date());

            const payload = {
                chat_id: uid,
                request_date: UI.toEngDigits(shamsiToday),
                student_score: 8,
                student_note: note,
                reports_data: (AppState.dailyReports || []).slice(0, 7),
                status: 'pending'
            };

            const { error } = await supabaseClient.from('ai_analyses').insert([payload]);
            if (error) throw error;

            if (noteInput) noteInput.value = '';
            UI.showToast('درخواست ارزیابی با موفقیت ثبت شد و در صف پردازش هوش مصنوعی قرار گرفت.', 'success');
        } catch (err) {
            console.error("AI Analysis Error:", err);
            UI.showToast('خطا در ثبت درخواست ارزیابی. لطفاً اتصال اینترنت را بررسی کنید.', 'error');
        }
    }
};

window.AnalyticsModule = AnalyticsModule;
