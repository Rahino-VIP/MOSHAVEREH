// ==========================================
// 🔗 تنظیمات و اتصال مستقیم به سوپابیس
// ==========================================
const SUPABASE_URL = 'https://etlutqwwqeahevsskjih.supabase.co'; // 👈 لینک سوپابیس خود را اینجا بگذارید
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV0bHV0cXd3cWVhaGV2c3NramloIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2MTYwNjIsImV4cCI6MjA5NzE5MjA2Mn0.kXvSQtGM7w28IffQ4JOtv_xtHenyDV0tC70bOd7N7nQ'; // 👈 کلید Anon سوپابیس خود را اینجا بگذارید
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const GAS_URL = 'https://script.google.com/macros/s/AKfycbz2CXGMkNTKY8Pn--zI4R2l-we9f6jjaCXxYpljlO5trI4IcFxcO46bYm_ogPOHVAm5/exec';

let currentUser = null; 
let dbData = { rules: [] }; 

// متغیرهای رزرو روزانه و ماهانه (بدون تغییر)
let window14Dates = []; let dailyCapacities = {}; let userPastReservations = []; 
let selectedNewDates = []; let isFirstEver = false; let finalAmountToPay = 0; 
let base64Image = ""; let appliedDiscountCode = ""; let discountAmount = 0; 
let selectedPayMethod = "card"; let globalUserPastReservations = []; 
const pricingTiers = { 1: 200, 2: 190, 3: 180, 4: 175, 5: 170, 6: 160, 7: 155 };

let monState = { 
    txType: 'new', planType: 'none', basePrice: 0, duration: '1', payMethod: 'cash', 
    startDate: '', renewBaseDate: '', konkurMonths: 9, receiptBase64: "",
    promoCode: "", promoDiscount: 0, isFirstMonthly: true, referralDiscountApplied: false 
};
let monFinance = { totalBase: 0, discount: 0, finalPrice: 0, upfront: 0, installments: [] };
let currentInstallmentId = null; let currentInstallmentAmount = 0; let instBase64Image = "";

// ==========================================
// 🛠 توابع کمکی
// ==========================================
function toEngDigits(str) { return str ? str.replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)) : ''; }
function roundDown100k(amount) { return Math.floor(amount / 100000) * 100000; }

function getShamsiDateSafe(dateObj) { 
    const parts = new Intl.DateTimeFormat('fa-IR-u-nu-latn', { year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(dateObj);
    let y, m, d;
    for (let p of parts) { if (p.type === 'year') y = p.value; if (p.type === 'month') m = p.value; if (p.type === 'day') d = p.value; }
    return `${y}-${m}-${d}`; 
}

function getRelativeDayText(dbDateStr) {
    let todayStr = getShamsiDateSafe(new Date());
    if (dbDateStr === todayStr) return 'امروز';
    let tmrw = new Date(); tmrw.setDate(tmrw.getDate() + 1);
    if (dbDateStr === getShamsiDateSafe(tmrw)) return 'فردا';
    let dayAfter = new Date(); dayAfter.setDate(dayAfter.getDate() + 2);
    if (dbDateStr === getShamsiDateSafe(dayAfter)) return 'پس‌فردا';
    return dbDateStr.replace(/-/g, '/');
}

function addMonthsJS(dateStr, monthsToAdd) {
    let d = new Date(dateStr); 
    if (isNaN(d)) d = new Date();
    d.setMonth(d.getMonth() + monthsToAdd);
    return getShamsiDateSafe(d);
}

function calcShamsiRemainDays(endDateStr) {
    if (!endDateStr) return 0;
    let endParts = endDateStr.replace(/\//g, '-').split('-');
    let todayStr = getShamsiDateSafe(new Date());
    let todayParts = todayStr.replace(/\//g, '-').split('-');
    
    if (endParts.length !== 3 || todayParts.length !== 3) return 0;
    
    let endDays = (parseInt(endParts[0]) * 365) + (parseInt(endParts[1]) * 30) + parseInt(endParts[2]);
    let todayDays = (parseInt(todayParts[0]) * 365) + (parseInt(todayParts[1]) * 30) + parseInt(todayParts[2]);
    
    return Math.max(0, endDays - todayDays);
}

function copyCard() {
    navigator.clipboard.writeText('6219861810380484').then(() => {
        alert('✅ شماره کارت کپی شد.');
    });
}

// ==========================================
// 🌗 مدیریت تم و لایوت SPA
// ==========================================
function toggleTheme() {
    const html = document.documentElement;
    if (html.getAttribute('data-theme') === 'dark') {
        html.removeAttribute('data-theme'); localStorage.setItem('theme', 'light');
    } else {
        html.setAttribute('data-theme', 'dark'); localStorage.setItem('theme', 'dark');
    }
}
if(localStorage.getItem('theme') === 'light') document.documentElement.removeAttribute('data-theme');

function toggleAppLayout(isLoggedIn) {
    document.querySelector('.app-header').style.display = isLoggedIn ? 'flex' : 'none';
    document.querySelector('.bottom-nav').style.display = isLoggedIn ? 'flex' : 'none';
    
    if(isLoggedIn) {
        document.getElementById('view-auth-wrap').style.display = 'none';
        switchView('view-dashboard', document.getElementById('navDashboard')); 
    } else {
        document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
        document.getElementById('view-auth-wrap').style.display = 'block';
        goToAuthStep('view-phone', 'پرتال جامع راهینو', 'جهت ورود یا ثبت‌‌نام، شماره موبایل خود را وارد نمایید');
    }
}

function switchView(viewId, navElement) {
    document.querySelectorAll('#mainContentArea > .view-section').forEach(el => el.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
    if (navElement) {
        document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
        navElement.classList.add('active');
    }
}

window.onload = async function() {
    const userPhone = localStorage.getItem('rahino_user_phone');
    if (!userPhone) { 
        document.getElementById('mainLoader').style.display = 'none';
        toggleAppLayout(false); 
    } else {
        toggleAppLayout(true);  
        await loadRealDashboardData(userPhone);
    }
};

// =====================================
// 🔐 توابع احراز هویت (Auth)
// =====================================
function goToAuthStep(stepId, title, sub) {
    const authWrap = document.getElementById('view-auth-wrap');
    const targetStep = document.getElementById(stepId);
    if (!authWrap || !targetStep) return;
    
    authWrap.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
    targetStep.classList.add('active');
    
    const titleEl = document.getElementById('authHeaderTitle');
    const subEl = document.getElementById('authHeaderSub');
    if (titleEl) titleEl.innerText = title;
    if (subEl) subEl.innerText = sub;
}

async function checkUserPhone() {
    const phone = toEngDigits(document.getElementById('inpPhone').value.trim());
    if (!phone || phone.length < 10) return alert('شماره موبایل نامعتبر است.');

    document.getElementById('mainLoader').style.display = 'flex';
    try {
        const response = await fetch(GAS_URL, { method: 'POST', body: JSON.stringify({ action: 'check_phone', phone_number: phone }) });
        const res = await response.json();
        document.getElementById('mainLoader').style.display = 'none';

        if (!res.success) return alert(res.error);

        if (res.status === 'not_found') {
            goToAuthStep('view-register', 'تکمیل اطلاعات پرونده', 'جهت صدور دسترسی، فرم زیر را تکمیل نمایید');
        } else if (res.status === 'pending') {
            goToAuthStep('view-pending', 'وضعیت پرونده', 'نیاز به تایید مدیریت');
        } else if (res.status === 'blocked') {
            goToAuthStep('view-blocked', 'وضعیت پرونده', 'دسترسی محدود شده است');
        } else if (res.status === 'active') {
            if(res.security_question) {
                document.getElementById('recoveryQuestionText').innerText = `سوال: ${res.security_question}`;
                document.getElementById('recovPhoneStore').value = phone;
            }
            goToAuthStep('view-login', 'ورود به حساب کاربری', 'خوش آمدید! لطفاً رمز عبور خود را وارد کنید');
        }
    } catch (e) { document.getElementById('mainLoader').style.display = 'none'; alert("خطا در ارتباط با سرور"); }
}

async function submitLogin() {
    const phone = toEngDigits(document.getElementById('inpPhone').value.trim());
    const pass = document.getElementById('inpLoginPass').value.trim();
    if (!pass || pass.length < 6) return alert('رمز عبور باید حداقل ۶ کاراکتر باشد.');

    document.getElementById('mainLoader').style.display = 'flex';
    try {
        const response = await fetch(GAS_URL, { method: 'POST', body: JSON.stringify({ action: 'login', phone_number: phone, password: pass }) });
        const res = await response.json();
        
        if (res.success) {
            localStorage.setItem('rahino_user_phone', phone);
            window.location.reload(); 
        } else {
            document.getElementById('mainLoader').style.display = 'none';
            alert(res.error || 'رمز عبور اشتباه است.');
        }
    } catch (e) { document.getElementById('mainLoader').style.display = 'none'; alert("خطا در ارتباط با سرور"); }
}

async function submitRegistration() {
    const phone = toEngDigits(document.getElementById('inpPhone').value.trim());
    
    let gradeEl = document.getElementById('regGrade');
    let secQEl = document.getElementById('regSecQ');
    let gradeVal = gradeEl.value === "" ? null : gradeEl.value;
    let secQVal = secQEl.value === "" ? null : secQEl.value;

    const userData = {
        phone: phone, 
        name: document.getElementById('regName').value.trim(),
        grade: gradeVal, 
        major: document.getElementById('regMajor').value.trim(),
        school: document.getElementById('regSchool').value.trim(), 
        password: document.getElementById('regPass').value.trim(),
        security_question: secQVal,
        security_answer: document.getElementById('regSecA').value.trim(),
        referral_code: toEngDigits(document.getElementById('regReferral').value.trim().toUpperCase())
    };

    if (!userData.name || !userData.grade || !userData.major || !userData.school || !userData.password || !userData.security_question || !userData.security_answer) {
        return alert('تکمیل تمامی فیلدها (به جز کد معرف) الزامی است.');
    }
    if (userData.password.length < 6) return alert('رمز عبور باید حداقل ۶ کاراکتر باشد.');

    document.getElementById('mainLoader').style.display = 'flex';
    try {
        const response = await fetch(GAS_URL, { method: 'POST', body: JSON.stringify({ action: 'register', user_data: userData }) });
        const res = await response.json();
        document.getElementById('mainLoader').style.display = 'none';

        if (res.success) goToAuthStep('view-pending', 'وضعیت پرونده', 'نیاز به تایید مدیریت');
        else alert(res.error);
    } catch (e) { document.getElementById('mainLoader').style.display = 'none'; alert("خطا در ارتباط با سرور"); }
}

async function submitRecovery() {
    const phone = document.getElementById('recovPhoneStore').value;
    const answer = document.getElementById('inpRecoveryAns').value.trim();
    const newPass = document.getElementById('inpRecoveryNewPass').value.trim();

    if(!phone) return alert('خطای سیستم: شماره موبایل یافت نشد.');
    if(!answer) return alert('لطفاً پاسخ سوال امنیتی را وارد کنید.');
    if(!newPass || newPass.length < 6) return alert('رمز عبور جدید باید حداقل ۶ کاراکتر باشد.');

    document.getElementById('mainLoader').style.display = 'flex';
    try {
        const response = await fetch(GAS_URL, { 
            method: 'POST', 
            body: JSON.stringify({ action: 'recover_password', phone_number: phone, answer: answer, new_password: newPass }) 
        });
        const res = await response.json();
        document.getElementById('mainLoader').style.display = 'none';

        if (res.success) {
            alert('✅ رمز عبور شما با موفقیت تغییر کرد. لطفاً با رمز جدید وارد شوید.');
            document.getElementById('inpLoginPass').value = '';
            goToAuthStep('view-login', 'ورود به حساب کاربری', 'خوش آمدید! لطفاً رمز عبور خود را وارد کنید');
        } else {
            alert(res.error || 'پاسخ سوال امنیتی اشتباه است.');
        }
    } catch (e) { document.getElementById('mainLoader').style.display = 'none'; alert("خطا در ارتباط با سرور"); }
}

function logout() {
    if(confirm("آیا از حساب کاربری خود خارج می‌شوید؟")) {
        localStorage.removeItem('rahino_user_phone');
        window.location.reload();
    }
}

// ==========================================
// ⚡ دریافت پرسرعت داده‌های داشبورد (مستقیم از سوپابیس)
// ==========================================
async function loadRealDashboardData(phone) {
    try {
        // خواندن موازی تمام اطلاعات برای حداکثر سرعت (زیر 1 ثانیه)
        const [userRes, pansionRes, consultRes, instRes, servicesRes, rulesRes, dailyRes] = await Promise.all([
            supabase.from('users').select('*').eq('phone_number', phone).single(),
            supabase.from('pan_monthly_subs').select('*').eq('phone_number', phone).eq('status', 'active'),
            supabase.from('subscriptions').select('*').eq('user_phone', phone).eq('status', 'active').eq('service_category', 'consult'),
            supabase.from('pan_installments').select('*').eq('phone_number', phone),
            supabase.from('services').select('*').eq('category', 'pansion').eq('is_active', true),
            supabase.from('terms_and_rules').select('*'),
            supabase.from('pan_reservations').select('reserved_dates').eq('phone_number', phone)
        ]);

        document.getElementById('mainLoader').style.display = 'none';

        if (userRes.error || !userRes.data) {
            alert('خطا: اطلاعات کاربری یافت نشد.');
            logout();
            return;
        }

        currentUser = userRes.data; 
        dbData.rules = rulesRes.data || [];
        
        let pansion = (pansionRes.data && pansionRes.data.length > 0) ? pansionRes.data[0] : null;
        if(pansion) pansion.service_type = pansion.plan_type; // همگام‌سازی فیلدها
        let consult = (consultRes.data && consultRes.data.length > 0) ? consultRes.data[0] : null;
        let installments = instRes.data || [];
        let availablePlans = servicesRes.data || [];

        // استخراج تاریخ‌های رزرو روزانه
        let allDailyDates = [];
        if(dailyRes.data) {
            dailyRes.data.forEach(r => {
                let dates = r.reserved_dates;
                try { if(typeof dates === 'string') dates = JSON.parse(dates); } catch(e){}
                if(Array.isArray(dates)) allDailyDates.push(...dates);
            });
        }
        globalUserPastReservations = allDailyDates;

        let todayShamsi = getShamsiDateSafe(new Date());
        let upcomingDates = globalUserPastReservations.filter(d => d >= todayShamsi).sort();
        let nextDaily = upcomingDates.length > 0 ? upcomingDates[0] : null;

        // تزریق سریع اطلاعات به داشبورد
        document.getElementById('uiUserFullName').innerText = `سلام، ${currentUser.full_name.split(' ')[0]} عزیز`;
        document.getElementById('uiUserGradeMajor').innerText = `پایه ${currentUser.grade || 'نامشخص'} (${currentUser.major || 'نامشخص'})`;
        let wBal = Number(currentUser.wallet_balance || 0);
        document.getElementById('uiWalletBalance').innerHTML = `${wBal.toLocaleString()} <span>تومان</span>`;
        if (wBal >= 500000) document.getElementById('btnWithdraw').style.display = 'block';

        renderInstallments(installments);
        initMonthlyBooking();
        renderProfile();

        const consultInactiveText = document.querySelector('#consultInactiveData p');

        // مدیریت پنل ماهانه
        if (pansion) {
            document.getElementById('badgePansion').innerText = 'فعال';
            document.getElementById('badgePansion').className = 'srv-badge';
            document.getElementById('pansionActiveData').style.display = 'block';
            document.getElementById('pansionInactiveData').style.display = 'none';
            
            document.getElementById('uiPanType').innerHTML = `<span style="direction:ltr; display:inline-block;">${pansion.service_type.toUpperCase()}</span>`;
            let safeStartDate = pansion.start_date ? pansion.start_date.replace(/-/g, '/') : '--';
            let safeEndDate = pansion.end_date ? pansion.end_date.replace(/-/g, '/') : '--';
            let remainDays = calcShamsiRemainDays(pansion.end_date);
            
            document.getElementById('uiPanStart').innerText = safeStartDate;
            document.getElementById('uiPanEnd').innerText = safeEndDate;
            document.getElementById('uiPanRemainTxt').innerText = `${remainDays} روز`;
            
            let totalEstDays = 30; 
            if(pansion.start_date && pansion.end_date) {
                 let sParts = pansion.start_date.replace(/\//g, '-').split('-');
                 let eParts = pansion.end_date.replace(/\//g, '-').split('-');
                 let sDays = (parseInt(sParts[0]) * 365) + (parseInt(sParts[1]) * 30) + parseInt(sParts[2]);
                 let eDays = (parseInt(eParts[0]) * 365) + (parseInt(eParts[1]) * 30) + parseInt(eParts[2]);
                 totalEstDays = Math.max(1, eDays - sDays);
            }
            let progressVal = Math.min(100, Math.max(0, 100 - ((remainDays / totalEstDays) * 100)));
            document.getElementById('uiPanProgressBar').style.width = `${progressVal}%`;
            
            document.getElementById('cardDaily').style.display = 'none';
            document.getElementById('navDaily').style.display = 'none';
            
            if(consultInactiveText) consultInactiveText.innerHTML = `شما اشتراک پانسیون دارید! با فعال‌سازی بخش مشاوره از <b style="color: var(--accent);">۶۰٪ تخفیف المــاس</b> بهره‌مند شوید.`;
            
            renderGatewayActive(pansion);
        } else {
            document.getElementById('cardDaily').style.display = 'block';
            document.getElementById('navDaily').style.display = 'flex';
            
            if(consultInactiveText) consultInactiveText.innerHTML = `با ثبت‌نام در پانسیون ماهانه، از <b style="color: var(--accent);">۶۰٪ تخفیف المــاس</b> روی طرح‌های مشاوره بهره‌مند شوید.`;
            
            if (nextDaily) {
                document.getElementById('badgeDaily').innerText = 'دارای رزرو';
                document.getElementById('badgeDaily').className = 'srv-badge';
                document.getElementById('dailyActiveData').style.display = 'block';
                document.getElementById('dailyInactiveData').style.display = 'none';
                document.getElementById('uiNextDailyDate').innerText = getRelativeDayText(nextDaily);
            }
            await initializeBookingEngine();
            renderGatewayInactive(availablePlans, currentUser.grade);
        }

        if (consult) {
            document.getElementById('badgeConsult').innerText = 'فعال';
            document.getElementById('badgeConsult').className = 'srv-badge';
            document.getElementById('consultActiveData').style.display = 'block';
            document.getElementById('consultInactiveData').style.display = 'none';
            document.getElementById('uiConType').innerText = `طرح ${consult.service_type}`;
            if(consult.end_date) document.getElementById('uiConDays').innerText = getShamsiDateSafe(new Date(consult.end_date)).replace(/-/g, '/');
        }

    } catch (error) {
        document.getElementById('mainLoader').style.display = 'none';
        alert('خطا در دریافت اطلاعات دیتابیس.');
        console.error(error);
    }
}

// ==========================================
// 🗓 درگاه ماهانه (فروشگاه، کارت‌ها و فاکتور)
// ==========================================
function calcKonkurMonths() {
    // محاسبه دقیق تا 15 تیر 1406
    let konkurDate = new Date('2027-07-06T00:00:00'); 
    let today = new Date();
    let diffTime = konkurDate - today;
    let diffDays = Math.ceil(diffTime / (1000 * 3600 * 24));
    let months = diffDays > 0 ? Math.max(1, Math.round((diffDays / 30.41) * 10) / 10) : 1;
    monState.konkurMonths = months;
    
    let segKonkur = document.getElementById('segDurKonkur');
    if(segKonkur) segKonkur.innerText = `تا کنکور (${Math.ceil(months)} ماه)`;
}

function updateRules() {
    let rules = [];
    let nGrade = currentUser ? currentUser.grade : 'all';
    
    if (dbData && dbData.rules) {
        // فیلتر قوانین: همه‌عمومی + پانسیون (اگر طرحی انتخاب شده باشد)
        dbData.rules.filter(r => {
            let categoryMatch = (r.target_category === 'all' || (monState.planType !== 'none' && r.target_category === 'pansion'));
            let gradeMatch = (r.target_grade === 'all' || r.target_grade === nGrade);
            return categoryMatch && gradeMatch;
        }).forEach(r => {
            let lines = r.rule_text.split(/\n|\*/).filter(line => line.trim() !== '');
            rules.push(...lines);
        });
    }

    const rulesContainer = document.getElementById('dynamicRules');
    if (rulesContainer) {
        if (rules.length > 0) rulesContainer.innerHTML = rules.map(r => `<li>${r.trim()}</li>`).join('');
        else rulesContainer.innerHTML = '<li>قوانین انضباطی و مالی آموزشگاه را می‌پذیرم.</li>';
    }
}

function initMonthlyBooking() {
    calcKonkurMonths();
    let today = new Date();
    let options = [
        { text: `امروز`, date: getShamsiDateSafe(today) },
        { text: `فردا`, date: getShamsiDateSafe(new Date(today.getTime() + 86400000)) },
        { text: `پس‌فردا`, date: getShamsiDateSafe(new Date(today.getTime() + 172800000)) }
    ];
    
    let chipsHtml = '';
    options.forEach((o, index) => {
        let activeCls = index === 0 ? 'active' : '';
        if(index === 0) monState.startDate = o.date; 
        chipsHtml += `<div class="date-chip ${activeCls}" onclick="setMonDate('${o.date}', this)">
                        <div style="font-size:13px; font-weight:900;">${o.text}</div>
                        <div style="font-size:10px; font-weight:normal; margin-top:4px;">${o.date.replace(/-/g,'/')}</div>
                      </div>`;
    });
    let chipsContainer = document.getElementById('monDateChipsContainer');
    if(chipsContainer) chipsContainer.innerHTML = chipsHtml;
    updateRules();
}

function renderGatewayActive(pansion) {
    document.getElementById('activeSubGateway').style.display = 'block';
    document.getElementById('noSubGateway').style.display = 'none';
    
    let remainDays = calcShamsiRemainDays(pansion.end_date);
    let safeEndDate = pansion.end_date ? pansion.end_date.replace(/-/g, '/') : '--';
    
    let totalEstDays = 30;
    if(pansion.start_date && pansion.end_date) {
         let sParts = pansion.start_date.replace(/\//g, '-').split('-');
         let eParts = pansion.end_date.replace(/\//g, '-').split('-');
         let sDays = (parseInt(sParts[0]) * 365) + (parseInt(sParts[1]) * 30) + parseInt(sParts[2]);
         let eDays = (parseInt(eParts[0]) * 365) + (parseInt(eParts[1]) * 30) + parseInt(eParts[2]);
         totalEstDays = Math.max(1, eDays - sDays);
    }
    let progressPercent = Math.min(100, Math.max(0, 100 - ((remainDays / totalEstDays) * 100)));
    
    let html = `
        <div class="gateway-card">
            <div class="gw-header">
                <div>
                    <div style="font-size: 11px; opacity: 0.9;">پانسیون و میز اختصاصی</div>
                    <div class="gw-title" style="direction: rtl;">طرح <span style="direction: ltr; display: inline-block; font-family: sans-serif;">${pansion.service_type.toUpperCase()}</span></div>
                </div>
                <div class="gw-status">✔ فعال</div>
            </div>
            <div class="gw-progress-container">
                <div class="gw-progress-texts">
                    <span>تا ${safeEndDate}</span>
                    <span>${remainDays} روز مانده</span>
                </div>
                <div class="progress-track">
                    <div class="progress-fill" style="width: ${progressPercent}%;"></div>
                </div>
            </div>
        </div>
    `;
    document.getElementById('gwCardContainer').innerHTML = html;
}

function renderGatewayInactive(plans, userGrade) {
    document.getElementById('activeSubGateway').style.display = 'none';
    document.getElementById('noSubGateway').style.display = 'block';
    let container = document.getElementById('newPlansContainer');
    container.innerHTML = ''; container.className = 'store-grid';
    
    let isPostKonkurOrUni = userGrade && (userGrade.includes('پشت') || userGrade.includes('فارغ') || userGrade.includes('دانشجو'));
    
    plans.forEach(plan => {
        if (plan.type === 'student_plan' && isPostKonkurOrUni) return; 
        
        let capacity = parseInt(plan.capacity) || 0; 
        let isFull = capacity <= 0;
        let capHtml = isFull 
            ? `<div class="cap-status cap-full"><svg viewBox="0 0 24 24" width="16" height="16"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg> تکمیل ظرفیت</div>`
            : `<div class="cap-status cap-available"><svg viewBox="0 0 24 24" width="16" height="16"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"></path></svg> موجودی: ${capacity} نفر</div>`;
        
        let featuresHtml = '';
        if(plan.features) {
            let listItems = plan.features.split('\n').map(l => {
                let text = l.replace('✅', '').trim();
                if(!text) return '';
                return `<li><span style="color:var(--success); flex-shrink:0;"><svg viewBox="0 0 24 24" width="14" height="14"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"></path></svg></span> <span>${text}</span></li>`;
            }).join('');
            featuresHtml = `<details class="feat-details"><summary class="feat-summary">مشاهده امکانات طرح 🔻</summary><ul class="feat-list">${listItems}</ul></details>`;
        }
        
        let onclickAttr = isFull ? '' : `onclick="selectNewPlan('${plan.type}', ${plan.base_price})"`;
        let cardClass = isFull ? 'store-card disabled' : 'store-card';
        
        container.innerHTML += `
            <div class="${cardClass}" id="card_${plan.type}" ${onclickAttr}>
                <div style="font-size: 18px; font-weight: 900; color: var(--text-main); margin-bottom: 5px; text-align: center;">${plan.title}</div>
                <div style="font-size: 11px; color: var(--text-muted); font-weight: bold; text-align: center;">${plan.description || ''}</div>
                <div style="font-size: 20px; font-weight: 900; color: var(--primary); margin-top: 15px; text-align: center;">${Number(plan.base_price).toLocaleString()} <span style="font-size: 12px; color: var(--text-muted);">/ ماه</span></div>
                ${capHtml} ${featuresHtml}
            </div>`;
    });
}

function selectNewPlan(type, price) {
    monState.planType = type; monState.basePrice = price;
    document.querySelectorAll('.store-card').forEach(card => card.classList.remove('selected'));
    let selectedCard = document.getElementById('card_' + type);
    if(selectedCard) selectedCard.classList.add('selected');

    let checkoutBox = document.getElementById('bookingCheckoutSection');
    if(checkoutBox) {
        checkoutBox.style.display = 'block';
        updateRules(); // فراخوانی مجدد تا قوانین پانسیون خوانده شود
        setTimeout(() => checkoutBox.scrollIntoView({ behavior: 'smooth' }), 100);
        calculateMonthly();
    }
}

function setMonDur(dur) {
    monState.duration = dur;
    document.querySelectorAll('.dur-seg').forEach(el => el.classList.remove('active'));
    if(dur === '1') document.getElementById('segDur1').classList.add('active');
    if(dur === '3') document.getElementById('segDur3').classList.add('active');
    if(dur === 'konkur') document.getElementById('segDurKonkur').classList.add('active');
    
    let badge = document.getElementById('monLblDurationBadge');
    if(badge) badge.innerText = document.getElementById('segDur' + (dur==='konkur'?'Konkur':dur)).innerText;
    calculateMonthly();
}

function setMonPay(method) {
    monState.payMethod = method;
    document.getElementById('segPayCash').classList.remove('active');
    document.getElementById('segPayInst').classList.remove('active');
    if(method === 'cash') document.getElementById('segPayCash').classList.add('active');
    else document.getElementById('segPayInst').classList.add('active');
    calculateMonthly();
}

function setMonDate(dateStr, element) {
    monState.startDate = dateStr;
    document.querySelectorAll('.date-chip').forEach(el => el.classList.remove('active'));
    if(element) element.classList.add('active');
    calculateMonthly();
}

function calculateMonthly() {
    let duration = monState.duration === 'konkur' ? Math.ceil(monState.konkurMonths) : parseInt(monState.duration);
    let totalBase = monState.basePrice * duration;
    let finalPrice = totalBase;
    
    const segPayInst = document.getElementById('segPayInst');
    if (totalBase < 3500000) {
        if (segPayInst) segPayInst.style.display = 'none';
        if(monState.payMethod === 'monthly') setMonPay('cash'); 
    } else {
        if (segPayInst) segPayInst.style.display = 'block';
    }

    // 🧠 تخفیف زمانی
    let timeDiscountRate = 0;
    if (monState.duration === 'konkur' || duration >= 9) {
         timeDiscountRate = monState.payMethod === 'cash' ? 0.15 : 0.08;
    } else if (monState.duration === '3' || duration === 3) {
         timeDiscountRate = monState.payMethod === 'cash' ? 0.05 : 0.03;
    }
    let timeDiscountAmount = totalBase * timeDiscountRate;
    finalPrice -= timeDiscountAmount;

    // 🧠 کد تخفیف دستی
    let promoDiscountAmount = 0;
    if (monState.promoDiscount > 0) {
         promoDiscountAmount = monState.promoDiscount < 1 ? (totalBase * monState.promoDiscount) : monState.promoDiscount;
         finalPrice -= promoDiscountAmount;
    }
    
    // 🧠 تخفیف معرفی دوستان
    let referralDiscountAmount = 0;
    let isFirstMonthlyReg = !document.getElementById('pansionActiveData') || document.getElementById('pansionActiveData').style.display === 'none';
    if (isFirstMonthlyReg && currentUser && currentUser.invited_by && !monState.referralDiscountApplied) {
         referralDiscountAmount = 100000;
         finalPrice = Math.max(0, finalPrice - referralDiscountAmount);
    }

    let totalDiscount = timeDiscountAmount + promoDiscountAmount + referralDiscountAmount;
    
    monFinance.totalBase = totalBase; 
    monFinance.discount = totalDiscount; 
    monFinance.finalPrice = finalPrice; 
    monFinance.installments = [];

    document.getElementById('monLblBase').innerText = totalBase.toLocaleString() + ' تومان';
    document.getElementById('monLblDisc').innerText = totalDiscount.toLocaleString() + ' تومان';
    document.getElementById('monLblFinal').innerText = finalPrice.toLocaleString();

    let listHtml = '';
    
    // 🧠 منطق اقساط
    if (monState.payMethod === 'monthly' && totalBase >= 3500000 && duration > 1) {
        const formatter = new Intl.DateTimeFormat('fa-IR', { month: 'long', day: 'numeric' });
        let baseInstDate = new Date(); 
        
        if (duration <= 3) {
            let upfrontRounded = roundDown100k(finalPrice * 0.50);
            let remaining = finalPrice - upfrontRounded;
            monFinance.upfront = upfrontRounded;
            
            let d1 = new Date(baseInstDate); d1.setMonth(baseInstDate.getMonth() + 1); 
            monFinance.installments.push({ due_date: d1.toISOString().split('T')[0], amount: remaining, installment_number: 1 });
            
            listHtml = `<li><strong style="color:var(--danger)">پیش‌پرداخت نقد:</strong> ${upfrontRounded.toLocaleString()} تومان</li>
                        <li>موعد قسط اول (${remaining.toLocaleString()} تومان): <b>${formatter.format(d1)}</b> (یک ماه بعد)</li>`;
        } else {
            let upfrontRounded = roundDown100k(finalPrice * 0.20);
            monFinance.upfront = upfrontRounded;
            
            let checkAmt = roundDown100k(finalPrice * 0.20);
            let lastCheckAmt = finalPrice - upfrontRounded - (checkAmt * 3);
            
            let d1 = new Date(baseInstDate); d1.setMonth(baseInstDate.getMonth() + 1);
            let d2 = new Date(baseInstDate); d2.setMonth(baseInstDate.getMonth() + 2);
            let d3 = new Date(baseInstDate); d3.setMonth(baseInstDate.getMonth() + 4);
            let d4 = new Date(baseInstDate); d4.setMonth(baseInstDate.getMonth() + 6);
            
            monFinance.installments.push({ due_date: d1.toISOString().split('T')[0], amount: checkAmt, installment_number: 1 });
            monFinance.installments.push({ due_date: d2.toISOString().split('T')[0], amount: checkAmt, installment_number: 2 });
            monFinance.installments.push({ due_date: d3.toISOString().split('T')[0], amount: checkAmt, installment_number: 3 });
            monFinance.installments.push({ due_date: d4.toISOString().split('T')[0], amount: lastCheckAmt, installment_number: 4 });
            
            listHtml = `<li><strong style="color:var(--danger)">پیش‌پرداخت نقد:</strong> ${upfrontRounded.toLocaleString()} تومان</li>
                        <li>قسط اول (${checkAmt.toLocaleString()} تومان): <b>${formatter.format(d1)}</b></li>
                        <li>قسط دوم (${checkAmt.toLocaleString()} تومان): <b>${formatter.format(d2)}</b></li>
                        <li>قسط سوم (${checkAmt.toLocaleString()} تومان): <b>${formatter.format(d3)}</b></li>
                        <li>قسط چهارم (${lastCheckAmt.toLocaleString()} تومان): <b>${formatter.format(d4)}</b></li>`;
        }
    } else {
        monFinance.upfront = finalPrice;
        listHtml = '<div style="text-align:center; color:var(--text-muted);">فاقد اقساط بعدی (تسویه کامل)</div>';
    }

    document.getElementById('monLblUpfront').innerText = monFinance.upfront.toLocaleString() + ' تومان';
    let payNowBig = document.getElementById('monLblPayNowBig');
    if(payNowBig) payNowBig.innerText = monFinance.upfront.toLocaleString() + ' تومان';
    document.getElementById('monInstList').innerHTML = `<ul style="list-style:none; padding:0; margin:0; line-height: 2;">${listHtml}</ul>`;

    let noticeMsg = "";
    if (referralDiscountAmount > 0) noticeMsg += `🎁 ۱۰۰ هزار تومان تخفیف معرف برای اولین ثبت‌نام اعمال شد!<br>`;
    if (promoDiscountAmount > 0) noticeMsg += `✅ کد تخفیف با موفقیت اعمال شد.`;
    document.getElementById('monDiscountNotice').innerHTML = noticeMsg;

    validateMonSubmit();
}

async function applyMonDiscount() {
    const code = document.getElementById('monDiscountCode').value.trim().toUpperCase();
    if(!code) return;
    document.getElementById('mainLoader').style.display = 'flex';
    try {
        const response = await fetch(GAS_URL, { method: 'POST', body: JSON.stringify({ action: 'check_discount', code: code, phone_number: currentUser.phone_number, type: 'monthly' }) });
        const res = await response.json();
        document.getElementById('mainLoader').style.display = 'none';
        if (res.success) { 
            monState.promoCode = code; 
            monState.promoDiscount = res.discount_value || 0; 
            calculateMonthly(); 
            alert('کد تخفیف اعمال شد.'); 
        } 
        else { alert(res.error); }
    } catch (e) { document.getElementById('mainLoader').style.display = 'none'; alert('خطا در بررسی کد'); }
}

function handleMonFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
        document.getElementById('monUploadText').innerText = `⏳ در حال فشرده‌سازی...`;
        const reader = new FileReader();
        reader.onload = function(e) { 
            const img = new Image();
            img.onload = function() {
                const canvas = document.createElement('canvas');
                let w = img.width, h = img.height;
                if(w > h && w > 1000) { h *= 1000/w; w = 1000; } else if(h > 1000) { w *= 1000/h; h = 1000; }
                canvas.width = w; canvas.height = h;
                const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, w, h);
                
                monState.receiptBase64 = canvas.toDataURL('image/jpeg', 0.6).split(',')[1];
                document.getElementById('monUploadText').innerText = `✅ فیش ضمیمه شد`;
                document.getElementById('monUploadBox').style.borderColor = "var(--success)";
                document.getElementById('monUploadBox').style.background = "rgba(16, 185, 129, 0.05)";
                validateMonSubmit();
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }
}

function validateMonSubmit() { 
    let hasReceipt = monState.receiptBase64 !== "";
    let rulesChecked = document.getElementById('monRulesCheckbox') ? document.getElementById('monRulesCheckbox').checked : true;
    document.getElementById('btnSubmitMonthly').disabled = !(hasReceipt && rulesChecked); 
}

async function submitMonthly() {
    document.getElementById('mainLoader').style.display = 'flex';
    let duration = monState.duration === 'konkur' ? Math.ceil(monState.konkurMonths) : parseInt(monState.duration);
    let baseDateStr = monState.startDate || getShamsiDateSafe(new Date());
    let endDateStr = addMonthsJS(baseDateStr, duration);

    try {
        const payload = {
            action: 'submit_monthly_booking', tx_type: monState.txType, phone_number: currentUser.phone_number, user_name: currentUser.full_name,
            plan_type: monState.planType, duration_months: duration, start_date: baseDateStr, end_date: endDateStr,
            total_base: monFinance.totalBase, discount: monFinance.discount, final_price: monFinance.finalPrice, upfront: monFinance.upfront,
            pay_method: monState.payMethod, receipt_base64: monState.receiptBase64, installments: monFinance.installments
        };
        const response = await fetch(GAS_URL, { method: 'POST', body: JSON.stringify(payload) });
        const res = await response.json();
        document.getElementById('mainLoader').style.display = 'none';

        if (res.success) {
            alert('🎉 قرارداد شما با موفقیت ثبت شد.\nرسید و جزئیات اقساط فعال گردید.');
            window.location.reload(); 
        } else { alert(res.error || 'خطا در ثبت قرارداد.'); }
    } catch (e) { document.getElementById('mainLoader').style.display = 'none'; alert('خطا در ارتباط با سرور.'); console.error(e); }
}

// ==========================================
// 📅 رزرو روزانه
// ==========================================
async function initializeBookingEngine() {
    window14Dates = [];
    for(let i=0; i<14; i++) {
        let d = new Date(); d.setDate(d.getDate() + i);
        const parts = new Intl.DateTimeFormat('fa-IR', { weekday: 'long' }).formatToParts(d);
        window14Dates.push({ date: getShamsiDateSafe(d), dayName: parts.find(p => p.type === 'weekday').value });
    }

    try {
        const response = await fetch(GAS_URL, { method: 'POST', body: JSON.stringify({ action: 'get_daily_capacities', phone_number: currentUser.phone_number, dates: window14Dates.map(d => d.date) }) });
        const res = await response.json();
        if (res.success) {
            dailyCapacities = res.capacities;
            userPastReservations = globalUserPastReservations.filter(rDate => window14Dates.some(w => w.date === rDate));
            isFirstEver = (globalUserPastReservations.length === 0);
            renderCalendar();
        }
    } catch (e) { console.error("خطا در بارگذاری تقویم"); }
}

function renderCalendar() {
    const grid = document.getElementById('calendarGrid'); grid.innerHTML = ''; selectedNewDates = [];
    window14Dates.forEach(d => {
        let capInfo = dailyCapacities[d.date.replace(/-/g, '/')] || dailyCapacities[d.date] || { available_capacity: 4 }; 
        let available = capInfo.available_capacity; let isPastBooked = userPastReservations.includes(d.date);
        let cardClass = 'cal-card'; let onclickEvent = ''; let statusText = `${available} ظرفیت خالی`;

        if (isPastBooked) { cardClass += ' past-booked'; statusText = 'رزرو شما ✅'; } 
        else if (available <= 0) { cardClass += ' full'; statusText = 'تکمیل ❌'; } 
        else { cardClass += ' available'; onclickEvent = `onclick="toggleDate('${d.date}', this)"`; }

        grid.innerHTML += `<div class="${cardClass}" ${onclickEvent}><div class="cal-day">${d.dayName}</div><div class="cal-date">${d.date.replace(/-/g, '/').substring(5)}</div><div class="cal-cap">${statusText}</div></div>`;
    });
    updatePricing();
}

function toggleDate(dateStr, element) {
    if(element.classList.contains('selected')) { 
        element.classList.remove('selected'); selectedNewDates = selectedNewDates.filter(d => d !== dateStr); 
    } else { element.classList.add('selected'); selectedNewDates.push(dateStr); }
    updatePricing(); 
}

function selectPayMethod(method) {
    selectedPayMethod = method;
    document.getElementById('lblCard').classList.remove('active'); document.getElementById('lblWallet').classList.remove('active');
    if (method === 'card') { document.getElementById('lblCard').classList.add('active'); document.getElementById('paymentInfoBox').style.display = 'block'; } 
    else { document.getElementById('lblWallet').classList.add('active'); document.getElementById('paymentInfoBox').style.display = 'none'; }
    updatePricing();
}

function updatePricing() {
    let activeBookedDays = userPastReservations.length; let newSelectedDays = selectedNewDates.length; let totalD = activeBookedDays + newSelectedDays;
    let applicableRate = (totalD === 0) ? 0 : (totalD >= 8 ? 150 : pricingTiers[totalD]);
    let payableAmount = newSelectedDays * applicableRate; let discountMsg = "";

    if (isFirstEver && newSelectedDays > 0) { payableAmount -= 50; discountMsg = "🎁 ۵۰ هزار تومان تخفیف اولین ورود اعمال شد!"; } 
    else if (activeBookedDays > 0 && newSelectedDays > 0) { discountMsg = `🎉 به دلیل رزروهای قبلی، روزهای جدید با تخفیف محاسبه شد!`; }

    if (discountAmount > 0) { payableAmount -= discountAmount; discountMsg += `\n💰 ${discountAmount} هزار تومان تخفیف کد معرف اعمال شد.`; }

    finalAmountToPay = payableAmount > 0 ? payableAmount * 1000 : 0;
    document.getElementById('newDaysCountTxt').innerText = `${newSelectedDays} روز`; document.getElementById('pastDaysCountTxt').innerText = `${activeBookedDays} روز`;
    document.getElementById('rateAppliedTxt').innerText = `${applicableRate} هزار تومان`; document.getElementById('finalPriceTxt').innerText = finalAmountToPay.toLocaleString();
    document.getElementById('discountNotice').innerText = discountMsg;

    let walletBadge = document.getElementById('walletStatusBadge');
    if (selectedPayMethod === 'wallet' && currentUser.wallet_balance < finalAmountToPay) { walletBadge.style.color = 'var(--danger)'; walletBadge.innerText = 'موجودی ناکافی'; } 
    else { walletBadge.style.color = 'var(--text-muted)'; walletBadge.innerText = `موجودی: ${Number(currentUser.wallet_balance || 0).toLocaleString()}`; }
    validateSubmitButton();
}

async function applyDiscount() {
    const code = document.getElementById('discountCode').value.trim().toUpperCase();
    if(!code) return;
    document.getElementById('mainLoader').style.display = 'flex';
    try {
        const response = await fetch(GAS_URL, { method: 'POST', body: JSON.stringify({ action: 'check_discount', code: code, phone_number: currentUser.phone_number, type: 'daily' }) });
        const res = await response.json();
        document.getElementById('mainLoader').style.display = 'none';
        if (res.success) { appliedDiscountCode = code; discountAmount = res.discount_value / 1000; updatePricing(); alert('کد تخفیف اعمال شد.'); } 
        else { alert(res.error); }
    } catch (e) { document.getElementById('mainLoader').style.display = 'none'; alert('خطا در بررسی کد'); }
}

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
        document.getElementById('uploadText').innerText = `⏳ در حال فشرده‌سازی...`;
        const reader = new FileReader();
        reader.onload = function(e) { 
            const img = new Image();
            img.onload = function() {
                const canvas = document.createElement('canvas'); let w = img.width, h = img.height;
                if(w > h && w > 1000) { h *= 1000/w; w = 1000; } else if(h > 1000) { w *= 1000/h; h = 1000; }
                canvas.width = w; canvas.height = h; const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, w, h);
                base64Image = canvas.toDataURL('image/jpeg', 0.6).split(',')[1];
                document.getElementById('uploadText').innerText = `✅ فایل آماده شد: ${file.name}`;
                document.getElementById('uploadBox').style.borderColor = "var(--success)"; document.getElementById('uploadBox').style.background = "rgba(16, 185, 129, 0.05)";
                validateSubmitButton();
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }
}

document.getElementById('rulesCheckbox').addEventListener('change', validateSubmitButton);

function validateSubmitButton() { 
    const btn = document.getElementById('btnSubmitBooking');
    let isValid = selectedNewDates.length > 0 && document.getElementById('rulesCheckbox').checked;
    if (selectedPayMethod === 'wallet') isValid = isValid && (currentUser.wallet_balance >= finalAmountToPay);
    else isValid = isValid && (base64Image !== "");
    btn.disabled = !isValid; 
}

async function submitBooking() {
    document.getElementById('mainLoader').style.display = 'flex'; document.getElementById('loaderTxt').innerText = 'در حال ثبت رزرو...';
    try {
        const payload = { action: 'submit_daily_booking', phone_number: currentUser.phone_number, dates: selectedNewDates, amount: finalAmountToPay, pay_method: selectedPayMethod, receipt_base64: selectedPayMethod === 'card' ? base64Image : '', discount_code: appliedDiscountCode, user_name: currentUser.full_name };
        const response = await fetch(GAS_URL, { method: 'POST', body: JSON.stringify(payload) });
        const res = await response.json();
        document.getElementById('mainLoader').style.display = 'none';
        if (res.success) { alert('🎉 رزرو شما با موفقیت قطعی شد.'); window.location.reload(); } 
        else { alert(res.error || 'خطا در ثبت رزرو'); await initializeBookingEngine(); }
    } catch (e) { document.getElementById('mainLoader').style.display = 'none'; alert('خطای ارتباط با سرور.'); }
}

// ==========================================
// 💰 امور مالی و اقساط
// ==========================================
function openWithdrawModal() { document.getElementById('withdrawModal').style.display = 'flex'; }
function closeWithdrawModal() { document.getElementById('withdrawModal').style.display = 'none'; }

async function submitWithdraw() {
    const card = document.getElementById('withdrawCard').value.trim(); const name = document.getElementById('withdrawName').value.trim(); const amount = parseInt(document.getElementById('withdrawAmount').value);
    if(!card || card.length !== 16 || !name || !amount) return alert('لطفاً اطلاعات را به درستی وارد کنید.');
    if(amount > currentUser.wallet_balance || amount < 50000) return alert('مبلغ درخواستی نامعتبر است.');
    document.getElementById('mainLoader').style.display = 'flex';
    try {
        const payload = { action: 'withdraw_wallet', phone_number: currentUser.phone_number, user_name: name, card_number: card, amount: amount };
        const response = await fetch(GAS_URL, { method: 'POST', body: JSON.stringify(payload) });
        const res = await response.json();
        document.getElementById('mainLoader').style.display = 'none';
        if (res.success) { alert('درخواست برداشت با موفقیت ثبت شد.'); window.location.reload(); } else { alert(res.error); }
    } catch (e) { document.getElementById('mainLoader').style.display = 'none'; alert('خطا در ارتباط با سرور'); }
}

function openInstallmentModal(id, amount) {
    currentInstallmentId = id; currentInstallmentAmount = amount;
    document.getElementById('instPayAmount').innerText = `${amount.toLocaleString()} تومان`;
    document.getElementById('installmentModal').style.display = 'flex';
}
function closeInstallmentModal() { document.getElementById('installmentModal').style.display = 'none'; }

function handleInstFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
        document.getElementById('instUploadText').innerText = `⏳ در حال فشرده‌سازی...`;
        const reader = new FileReader();
        reader.onload = function(e) { 
            const img = new Image();
            img.onload = function() {
                const canvas = document.createElement('canvas'); let w = img.width, h = img.height;
                if(w > h && w > 1000) { h *= 1000/w; w = 1000; } else if(h > 1000) { w *= 1000/h; h = 1000; }
                canvas.width = w; canvas.height = h; const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, w, h);
                instBase64Image = canvas.toDataURL('image/jpeg', 0.6).split(',')[1];
                document.getElementById('instUploadText').innerText = `✅ فیش آماده ارسال`;
                document.getElementById('btnSubmitInst').disabled = false;
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }
}

async function submitInstallment() {
    document.getElementById('mainLoader').style.display = 'flex';
    try {
        const payload = { action: 'pay_installment', installment_id: currentInstallmentId, phone_number: currentUser.phone_number, user_name: currentUser.full_name, amount: currentInstallmentAmount, receipt_base64: instBase64Image };
        const response = await fetch(GAS_URL, { method: 'POST', body: JSON.stringify(payload) });
        const res = await response.json();
        document.getElementById('mainLoader').style.display = 'none';
        if (res.success) { alert('فیش شما ارسال شد و وضعیت قسط به پرداخت‌شده تغییر یافت.'); window.location.reload(); } else { alert(res.error); }
    } catch (e) { document.getElementById('mainLoader').style.display = 'none'; alert('خطا در ارسال فیش'); }
}

function renderInstallments(installmentsData) {
    const container = document.getElementById('installmentsContainer');
    if(!installmentsData || installmentsData.length === 0) {
        container.innerHTML = '<div style="text-align: center; color: var(--text-muted); margin-top: 30px; font-weight: bold;">شما هیچ قسط ثبت‌شده‌ای ندارید.</div>'; return;
    }
    let html = ''; installmentsData.sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
    installmentsData.forEach(inst => {
        let statusObj = { text: 'در انتظار پرداخت', color: 'var(--warning)', bg: 'rgba(245, 158, 11, 0.1)', showBtn: true };
        if (inst.status === 'paid') statusObj = { text: 'پرداخت شده', color: 'var(--success)', bg: 'rgba(16, 185, 129, 0.1)', showBtn: false };
        else {
            let due = new Date(inst.due_date); let today = new Date(); today.setHours(0,0,0,0);
            if (due < today) statusObj = { text: 'سررسید گذشته (اخطار)', color: 'var(--danger)', bg: 'rgba(239, 68, 68, 0.1)', showBtn: true };
        }
        let btnHtml = statusObj.showBtn ? `<button class="btn-action primary" style="width:100%; margin-top:15px;" onclick="openInstallmentModal('${inst.id}', ${inst.amount})">آپلود فیش و پرداخت</button>` : '';
        html += `<div class="status-card glass-panel" style="margin-bottom: 15px; border-right: 4px solid ${statusObj.color};"><div class="status-header" style="margin-bottom: 10px;"><div class="srv-title" style="font-size: 14px;">قسط شماره ${inst.installment_number}</div><div class="srv-badge" style="background: ${statusObj.bg}; color: ${statusObj.color}; border: none;">${statusObj.text}</div></div><div style="font-size: 22px; font-weight: 900; color: var(--text-main); margin-bottom: 10px;">${Number(inst.amount).toLocaleString()} <span style="font-size: 12px; color: var(--text-muted);">تومان</span></div><div style="font-size: 12px; color: var(--text-muted); font-weight: bold; margin-bottom: 15px;">تاریخ سررسید: ${getShamsiDateSafe(new Date(inst.due_date)).replace(/-/g, '/')}</div>${btnHtml}</div>`;
    });
    container.innerHTML = html;
}

// ==========================================
// 📜 تاریخچه و پروفایل
// ==========================================
function openHistoryModal() {
    document.getElementById('historyModal').style.display = 'flex';
    const container = document.getElementById('historyListContainer');
    if(globalUserPastReservations && globalUserPastReservations.length > 0) {
        let html = ''; let sortedPast = [...globalUserPastReservations].sort().reverse(); let todayShamsi = getShamsiDateSafe(new Date()); 
        sortedPast.forEach(dateStr => {
            let isUpcoming = (dateStr >= todayShamsi);
            html += `<div class="history-item"><div class="history-date">${getRelativeDayText(dateStr)}</div><div class="history-status ${isUpcoming ? 'status-upcoming' : 'status-done'}">${isUpcoming ? 'در انتظار مراجعه' : 'استفاده شده'}</div></div>`;
        });
        container.innerHTML = html;
    } else { container.innerHTML = '<div style="text-align: center; color: var(--text-muted); font-size: 13px; margin-top: 10px;">تاریخچه‌ای یافت نشد.</div>'; }
}
function closeHistoryModal() { document.getElementById('historyModal').style.display = 'none'; }

function renderProfile() {
    if(!currentUser) return;
    document.getElementById('profNameTitle').innerText = currentUser.full_name || 'کاربر راهینو';
    document.getElementById('profPhoneTitle').innerText = currentUser.phone_number || '--';
    document.getElementById('profName').value = currentUser.full_name || '';
    document.getElementById('profGrade').value = currentUser.grade || 'دوازدهم';
    document.getElementById('profMajor').value = currentUser.major || '';
    document.getElementById('profSchool').value = currentUser.school_name || '';
    document.getElementById('profProvince').value = currentUser.province || '';
    document.getElementById('profCity').value = currentUser.city || '';
    document.getElementById('profFather').value = currentUser.father_phone || '';
    document.getElementById('profMother').value = currentUser.mother_phone || '';
    document.getElementById('profReferralCode').innerText = currentUser.referral_code || 'در حال صدور...';
}

async function submitProfileUpdate() {
    const payload = {
        action: 'update_profile', phone_number: currentUser.phone_number, full_name: document.getElementById('profName').value.trim(),
        grade: document.getElementById('profGrade').value, major: document.getElementById('profMajor').value.trim(),
        school_name: document.getElementById('profSchool').value.trim(), province: document.getElementById('profProvince').value.trim(),
        city: document.getElementById('profCity').value.trim(), father_phone: toEngDigits(document.getElementById('profFather').value.trim()),
        mother_phone: toEngDigits(document.getElementById('profMother').value.trim())
    };
    document.getElementById('mainLoader').style.display = 'flex';
    try {
        const response = await fetch(GAS_URL, { method: 'POST', body: JSON.stringify(payload) });
        const res = await response.json();
        document.getElementById('mainLoader').style.display = 'none';
        if (res.success) { alert('✅ پروفایل شما با موفقیت بروزرسانی شد.'); window.location.reload(); } 
        else { alert(res.error || 'خطا در بروزرسانی.'); }
    } catch (e) { document.getElementById('mainLoader').style.display = 'none'; alert('خطا در ارتباط با سرور.'); }
}

function copyReferral() {
    const code = document.getElementById('profReferralCode').innerText;
    if(code && code !== '--' && code !== 'در حال صدور...') { navigator.clipboard.writeText(code).then(() => alert('✅ کد معرف کپی شد!')); }
}
</script>
