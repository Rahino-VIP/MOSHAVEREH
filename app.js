// ==========================================
// 🔗 تنظیمات و اتصال مستقیم به سوپابیس
// ==========================================
const SUPABASE_URL = 'https://etlutqwwqeahevsskjih.supabase.co'; // 👈 لینک سوپابیس خود را اینجا بگذارید
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV0bHV0cXd3cWVhaGV2c3NramloIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2MTYwNjIsImV4cCI6MjA5NzE5MjA2Mn0.kXvSQtGM7w28IffQ4JOtv_xtHenyDV0tC70bOd7N7nQ'; // 👈 کلید Anon سوپابیس خود را اینجا بگذارید
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

let currentUser = null; 
let dbData = { rules: [] }; 
let activePansion = null;   
let availablePansionPlans = [];

let window14Dates = []; let dailyCapacities = {}; let userPastReservations = []; 
let selectedNewDates = []; let isFirstEver = false; let finalAmountToPay = 0; 
let base64Image = ""; let appliedDiscountCode = ""; let discountAmount = 0; 
let selectedPayMethod = "card"; let globalUserPastReservations = []; 
const pricingTiers = { 1: 200, 2: 190, 3: 180, 4: 175, 5: 170, 6: 160, 7: 155 };

let monState = { 
    txType: 'new', planType: 'none', basePrice: 0, duration: '1', 
    payPlan: 'cash', payMethod: 'card', 
    startDate: '', renewBaseDate: '', konkurMonths: 9, receiptBase64: "",
    promoCode: "", promoDiscount: 0, isFirstMonthly: true
};

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => alert('✅ با موفقیت کپی شد.'));
}
let monFinance = { totalBase: 0, discount: 0, finalPrice: 0, upfront: 0, installments: [] };
let currentInstallmentId = null; let currentInstallmentAmount = 0; let instBase64Image = "";

// ==========================================
// 🛠 توابع کمکی
// ==========================================
function toEngDigits(str) { return str ? str.replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)) : ''; }
function roundDown100k(amount) { return Math.floor(amount / 100000) * 100000; }
function generateReferralCode() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = 'RH-';
    for (let i = 0; i < 5; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
    return code;
}

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

function copyCard() { navigator.clipboard.writeText('6219861810380484').then(() => alert('✅ شماره کارت کپی شد.')); }

// ==========================================
// 🌗 مدیریت لایوت SPA
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
        goToAuthStep('view-phone', 'پرتال جامع راهینو', 'جهت ورود یا ثبت‌نام، شماره موبایل خود را وارد نمایید');
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
    if (!userPhone) { document.getElementById('mainLoader').style.display = 'none'; toggleAppLayout(false); } 
    else { toggleAppLayout(true); await loadRealDashboardData(userPhone); }
};

// =====================================
// 🔐 توابع احراز هویت (بدون بک‌اند)
// =====================================
function goToAuthStep(stepId, title, sub) {
    const authWrap = document.getElementById('view-auth-wrap');
    const targetStep = document.getElementById(stepId);
    if (!authWrap || !targetStep) return;
    authWrap.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
    targetStep.classList.add('active');
    document.getElementById('authHeaderTitle').innerText = title;
    document.getElementById('authHeaderSub').innerText = sub;
}

async function checkUserPhone() {
    const phone = toEngDigits(document.getElementById('inpPhone').value.trim());
    if (!phone || phone.length < 10) return alert('شماره موبایل نامعتبر است.');
    document.getElementById('mainLoader').style.display = 'flex';
    try {
        const { data, error } = await supabaseClient.from('users').select('status, security_question').eq('phone_number', phone).single();
        document.getElementById('mainLoader').style.display = 'none';
        
        if (error && error.code === 'PGRST116') goToAuthStep('view-register', 'تکمیل اطلاعات پرونده', 'جهت صدور دسترسی، فرم زیر را تکمیل نمایید');
        else if (data) {
            if (data.status === 'pending') goToAuthStep('view-pending', 'وضعیت پرونده', 'نیاز به تایید مدیریت');
            else if (data.status === 'blocked') goToAuthStep('view-blocked', 'وضعیت پرونده', 'دسترسی محدود شده است');
            else {
                if(data.security_question) {
                    document.getElementById('recoveryQuestionText').innerText = `سوال: ${data.security_question}`;
                    document.getElementById('recovPhoneStore').value = phone;
                }
                goToAuthStep('view-login', 'ورود به حساب کاربری', 'خوش آمدید! لطفاً رمز عبور خود را وارد کنید');
            }
        }
    } catch (e) { document.getElementById('mainLoader').style.display = 'none'; alert("خطا در ارتباط با دیتابیس"); }
}

async function submitLogin() {
    const phone = toEngDigits(document.getElementById('inpPhone').value.trim());
    const pass = document.getElementById('inpLoginPass').value.trim();
    if (!pass || pass.length < 6) return alert('رمز عبور باید حداقل ۶ کاراکتر باشد.');
    document.getElementById('mainLoader').style.display = 'flex';
    try {
        const { data, error } = await supabaseClient.from('users').select('status').eq('phone_number', phone).eq('password', pass).single();
        if (error || !data) { document.getElementById('mainLoader').style.display = 'none'; return alert('رمز عبور اشتباه است.'); }
        if (data.status !== 'active') { document.getElementById('mainLoader').style.display = 'none'; return alert('حساب شما در انتظار تایید است.'); }
        localStorage.setItem('rahino_user_phone', phone);
        window.location.reload(); 
    } catch (e) { document.getElementById('mainLoader').style.display = 'none'; alert("خطا در ارتباط با دیتابیس"); }
}

async function submitRegistration() {
    const phone = toEngDigits(document.getElementById('inpPhone').value.trim());
    let gradeVal = document.getElementById('regGrade').value === "" ? null : document.getElementById('regGrade').value;
    let secQVal = document.getElementById('regSecQ').value === "" ? null : document.getElementById('regSecQ').value;

    const userData = {
        phone_number: phone, full_name: document.getElementById('regName').value.trim(),
        grade: gradeVal, major: document.getElementById('regMajor').value.trim(),
        school_name: document.getElementById('regSchool').value.trim(), password: document.getElementById('regPass').value.trim(),
        security_question: secQVal, security_answer: document.getElementById('regSecA').value.trim(),
        invited_by: toEngDigits(document.getElementById('regReferral').value.trim().toUpperCase()) || null,
        referral_code: generateReferralCode(), status: 'pending', wallet_balance: 0
    };

    if (!userData.full_name || !userData.grade || !userData.major || !userData.school_name || !userData.password || !userData.security_question || !userData.security_answer) {
        return alert('تکمیل تمامی فیلدها الزامی است.');
    }
    if (userData.password.length < 6) return alert('رمز عبور باید حداقل ۶ کاراکتر باشد.');

    document.getElementById('mainLoader').style.display = 'flex';
    try {
        const { error } = await supabaseClient.from('users').insert([userData]);
        document.getElementById('mainLoader').style.display = 'none';
        if (!error) goToAuthStep('view-pending', 'وضعیت پرونده', 'نیاز به تایید مدیریت');
        else alert('خطا در ثبت‌نام: ' + error.message);
    } catch (e) { document.getElementById('mainLoader').style.display = 'none'; alert("خطا در ارتباط با دیتابیس"); }
}

async function submitRecovery() {
    const phone = document.getElementById('recovPhoneStore').value;
    const answer = document.getElementById('inpRecoveryAns').value.trim();
    const newPass = document.getElementById('inpRecoveryNewPass').value.trim();
    if(!phone || !answer || newPass.length < 6) return alert('اطلاعات ناقص است.');

    document.getElementById('mainLoader').style.display = 'flex';
    try {
        const { data, error: fetchError } = await supabaseClient.from('users').select('security_answer').eq('phone_number', phone).single();
        if (fetchError || !data || data.security_answer.trim() !== answer.trim()) {
            document.getElementById('mainLoader').style.display = 'none'; return alert('پاسخ سوال امنیتی اشتباه است.');
        }
        const { error: updateError } = await supabaseClient.from('users').update({ password: newPass }).eq('phone_number', phone);
        document.getElementById('mainLoader').style.display = 'none';
        if (!updateError) {
            alert('✅ رمز تغییر کرد. لطفاً با رمز جدید وارد شوید.');
            document.getElementById('inpLoginPass').value = '';
            goToAuthStep('view-login', 'ورود به حساب کاربری', 'لطفاً رمز عبور خود را وارد کنید');
        } else alert('خطا در تغییر رمز عبور.');
    } catch (e) { document.getElementById('mainLoader').style.display = 'none'; alert("خطا در ارتباط با دیتابیس"); }
}

function logout() {
    if(confirm("آیا از حساب کاربری خود خارج می‌شوید؟")) { localStorage.removeItem('rahino_user_phone'); window.location.reload(); }
}

// ==========================================
// ⚡ دریافت داده‌های داشبورد (سوپابیس)
// ==========================================
async function loadRealDashboardData(phone) {
    try {
        const [userRes, pansionRes, consultRes, instRes, servicesRes, rulesRes, dailyRes, messagesRes, subsHistRes] = await Promise.all([
            supabaseClient.from('users').select('*').eq('phone_number', phone).single(),
            supabaseClient.from('pan_monthly_subs').select('*').eq('phone_number', phone).eq('status', 'active'),
            supabaseClient.from('subscriptions').select('*').eq('user_phone', phone).eq('status', 'active').eq('service_category', 'consult'),
            supabaseClient.from('pan_installments').select('*').eq('phone_number', phone),
            supabaseClient.from('services').select('*').eq('category', 'pansion').eq('is_active', true),
            supabaseClient.from('terms_and_rules').select('*'),
            supabaseClient.from('pan_reservations').select('reserved_dates').eq('phone_number', phone),
            supabaseClient.from('messages').select('*').eq('phone_number', phone).order('created_at', { ascending: false }),
            supabaseClient.from('pan_monthly_subs').select('id').eq('phone_number', phone) // برای چک کردن اولین رزرو ماهانه
        ]);

        document.getElementById('mainLoader').style.display = 'none';
        if (userRes.error || !userRes.data) { alert('اطلاعات کاربری یافت نشد.'); logout(); return; }

        currentUser = userRes.data; 
        dbData.rules = rulesRes.data || [];
        monState.isFirstMonthly = !subsHistRes.data || subsHistRes.data.length === 0;

        let pansion = (pansionRes.data && pansionRes.data.length > 0) ? pansionRes.data[0] : null;
        if(pansion) pansion.service_type = pansion.plan_type; 
        let consult = (consultRes.data && consultRes.data.length > 0) ? consultRes.data[0] : null;
        let installments = instRes.data || [];
        let availablePlans = servicesRes.data || [];

        activePansion = pansion;       
        availablePansionPlans = availablePlans;

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
        let nextDaily = globalUserPastReservations.filter(d => d >= todayShamsi).sort()[0] || null;

        document.getElementById('uiUserFullName').innerText = `سلام، ${currentUser.full_name.split(' ')[0]} عزیز`;
        document.getElementById('uiUserGradeMajor').innerText = `پایه ${currentUser.grade || 'نامشخص'} (${currentUser.major || 'نامشخص'})`;
        let wBal = Number(currentUser.wallet_balance || 0);
        document.getElementById('uiWalletBalance').innerHTML = `${wBal.toLocaleString()} <span>تومان</span>`;
        if (wBal >= 500000) document.getElementById('btnWithdraw').style.display = 'block';

        renderInstallments(installments);
        renderMessages(messagesRes.data || []);
        initMonthlyBooking();
        renderProfile();

        if (pansion) {
            document.getElementById('badgePansion').innerText = 'فعال';
            document.getElementById('badgePansion').className = 'srv-badge';
            document.getElementById('pansionActiveData').style.display = 'block';
            document.getElementById('pansionInactiveData').style.display = 'none';
            document.getElementById('uiPanType').innerHTML = `<span style="direction:ltr; display:inline-block;">${pansion.service_type.toUpperCase()}</span>`;
            document.getElementById('uiPanStart').innerText = pansion.start_date ? pansion.start_date.replace(/-/g, '/') : '--';
            document.getElementById('uiPanEnd').innerText = pansion.end_date ? pansion.end_date.replace(/-/g, '/') : '--';
            document.getElementById('uiPanRemainTxt').innerText = `${calcShamsiRemainDays(pansion.end_date)} روز`;
            document.getElementById('cardDaily').style.display = 'none';
            document.getElementById('navDaily').style.display = 'none';
            renderGatewayActive(pansion);
        } else {
            document.getElementById('cardDaily').style.display = 'block';
            document.getElementById('navDaily').style.display = 'flex';
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

    } catch (error) { document.getElementById('mainLoader').style.display = 'none'; alert('خطا در دریافت اطلاعات.'); console.error(error); }
}

// ==========================================
// 💡 پیام‌ها و پاداش سیستم معرف
// ==========================================
function renderMessages(messages) {
    const container = document.getElementById('messagesContainer');
    if(!messages || messages.length === 0) {
        container.innerHTML = '<div style="text-align: center; color: var(--text-muted); font-size: 12px; padding: 20px;">پیامی ندارید.</div>';
        return;
    }
    let html = '';
    messages.forEach(msg => {
        let isRead = msg.is_read;
        html += `
            <div style="padding: 15px; border-bottom: 1px solid var(--glass-border); ${isRead ? 'opacity: 0.6;' : ''}">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
                    <strong style="color: var(--text-main); font-size: 13px;">${msg.title} ${isRead ? '' : '<span style="color:var(--danger); font-size:10px;">(جدید)</span>'}</strong>
                    <span style="font-size: 10px; color: var(--text-muted);">${getRelativeDayText(msg.created_at.split('T')[0])}</span>
                </div>
                <div style="font-size: 11px; color: var(--text-muted); line-height: 1.8; text-align: justify;">${msg.body}</div>
            </div>`;
    });
    container.innerHTML = html;
}

async function rewardReferrer(referralCode, rewardAmount, messageBody) {
    try {
        const { data: referrer } = await supabaseClient.from('users').select('phone_number, wallet_balance').eq('referral_code', referralCode).single();
        if (referrer) {
            await supabaseClient.from('users').update({ wallet_balance: Number(referrer.wallet_balance || 0) + rewardAmount }).eq('phone_number', referrer.phone_number);
            await supabaseClient.from('messages').insert([{
                phone_number: referrer.phone_number, title: '🎉 پاداش معرفی دوستان!',
                body: messageBody, is_read: false, created_at: new Date().toISOString()
            }]);
        }
    } catch(e) { console.error("Error rewarding referrer", e); }
}

// ==========================================
// 🗓 رزرو ماهانه
// ==========================================
function calcKonkurMonths() {
    let konkurDate = new Date('2027-07-06T00:00:00'); 
    let today = new Date();
    let diffDays = Math.ceil((konkurDate - today) / (1000 * 3600 * 24));
    let months = diffDays > 0 ? (diffDays / 30.41) : 1;
    monState.konkurMonths = Math.round(months * 10) / 10;
    
    let segKonkur = document.getElementById('segDurKonkur');
    if(segKonkur) segKonkur.innerText = `تا کنکور (۱۵ تیر ۱۴۰۶)`;
}

function updateRules() {
    let rules = [];
    let nGrade = currentUser ? currentUser.grade : 'all';
    if (dbData && dbData.rules) {
        dbData.rules.filter(r => {
            let categoryMatch = (r.target_category === 'all' || (monState.planType !== 'none' && r.target_category === 'pansion'));
            return categoryMatch && (r.target_grade === 'all' || r.target_grade === nGrade);
        }).forEach(r => {
            let lines = r.rule_text.split(/\n|\*/).filter(line => line.trim() !== '');
            rules.push(...lines);
        });
    }
    const rulesContainer = document.getElementById('dynamicRules');
    if (rulesContainer) {
        if (rules.length > 0) rulesContainer.innerHTML = rules.map(r => `<li>${r.trim()}</li>`).join('');
        else rulesContainer.innerHTML = '<li>قوانین آموزشگاه را می‌پذیرم.</li>';
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
        if(index === 0) { monState.startDate = o.date; monState.startDateIndex = 0; }
        // ارسال index تاریخ برای محاسبه دقیق اقساط
        chipsHtml += `<div class="date-chip ${activeCls}" onclick="setMonDate('${o.date}', ${index}, this)">
                        <div style="font-size:13px; font-weight:900;">${o.text}</div>
                        <div style="font-size:10px; font-weight:normal; margin-top:4px;">${o.date.replace(/-/g,'/')}</div>
                      </div>`;
    });
    document.getElementById('monDateChipsContainer').innerHTML = chipsHtml;
    updateRules();
}
function renderGatewayActive(pansion) { /* (همان کدهای قبلی رندر کارت فعال) */ 
    document.getElementById('activeSubGateway').style.display = 'block';
    document.getElementById('noSubGateway').style.display = 'none';
    let remainDays = calcShamsiRemainDays(pansion.end_date);
    let html = `<div class="gateway-card"><div class="gw-header"><div><div style="font-size: 11px; opacity: 0.9;">پانسیون و میز اختصاصی</div><div class="gw-title" style="direction: rtl;">طرح <span style="direction: ltr; display: inline-block; font-family: sans-serif;">${pansion.service_type.toUpperCase()}</span></div></div><div class="gw-status">✔ فعال</div></div><div class="gw-progress-container"><div class="gw-progress-texts"><span>تا ${pansion.end_date.replace(/-/g, '/')}</span><span>${remainDays} روز مانده</span></div><div class="progress-track"><div class="progress-fill" style="width: 100%;"></div></div></div></div>`;
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
            ? `<div class="cap-status cap-full">تکمیل ظرفیت</div>`
            : `<div class="cap-status cap-available">موجودی: ${capacity} نفر</div>`;
        
        // ✨ بازسازی بخش توضیحات و امکانات طرح‌ها (Accordion)
        let featuresHtml = '';
        if(plan.features) {
            let listItems = plan.features.split('\n').map(l => {
                let text = l.replace('✅', '').trim();
                if(!text) return '';
                return `<li style="display:flex; align-items:flex-start; gap:6px; margin-bottom:8px;">
                            <span style="color:var(--success); flex-shrink:0;">✔️</span> 
                            <span>${text}</span>
                        </li>`;
            }).join('');
            featuresHtml = `<details class="feat-details">
                                <summary class="feat-summary">مشاهده امکانات و توضیحات طرح 🔻</summary>
                                <ul class="feat-list" style="list-style:none; padding:0; margin-top:10px; font-size:11px; text-align:right;">${listItems}</ul>
                            </details>`;
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
    monState.txType = 'new'; // 👈 ریست به ثبت‌نام جدید
    document.getElementById('monDateSelectionBox').style.display = 'block'; // نمایش انتخاب تاریخ
    
    monState.planType = type; monState.basePrice = price;
    document.querySelectorAll('.store-card').forEach(card => card.classList.remove('selected'));
    document.getElementById('card_' + type).classList.add('selected');
    document.getElementById('bookingCheckoutSection').style.display = 'block';
    
    updateRules(); calculateMonthly();
    setTimeout(() => document.getElementById('bookingCheckoutSection').scrollIntoView({ behavior: 'smooth' }), 100);
}

// 🧠 تابع اصلی تمدید هوشمند
// 🧠 تابع اصلی تمدید هوشمند (همراه با دیباگر)
function openRenewal() {
    console.log("✅ دکمه تمدید کلیک شد!");
    console.log("وضعیت طرح فعلی (activePansion):", activePansion);
    
    if (!activePansion) {
        alert('شما در حال حاضر طرح فعالی برای تمدید ندارید.');
        return;
    }
    
    // پیدا کردن قیمت پایه طرح فعلی از بین لیست طرح‌ها
    let activePlanData = availablePansionPlans.find(p => p.type === activePansion.service_type) || { base_price: 3600000 };
    let remainDays = calcShamsiRemainDays(activePansion.end_date);

    console.log("اطلاعات طرح پیدا شده برای تمدید:", activePlanData);
    console.log("روزهای باقیمانده از طرح فعلی:", remainDays);

    monState.txType = 'renew';
    monState.planType = activePansion.service_type;
    monState.basePrice = activePlanData.base_price;
    monState.startDate = activePansion.end_date; // 👈 شروع دقیقاً از روز پایان طرح قبلی
    monState.renewRemainDays = remainDays;

    // مخفی کردن انتخاب تاریخ و نمایش فرم پرداخت
    let dateBox = document.getElementById('monDateSelectionBox');
    if (dateBox) {
        dateBox.style.display = 'none';
        console.log("باکس تاریخ مخفی شد.");
    } else {
        console.log("⚠️ اخطار: آیدی monDateSelectionBox در HTML یافت نشد!");
    }
    
    let checkoutBox = document.getElementById('bookingCheckoutSection');
    if (checkoutBox) {
        checkoutBox.style.display = 'block';
    } else {
        console.log("⚠️ اخطار: آیدی bookingCheckoutSection در HTML یافت نشد!");
    }
    
    updateRules();
    calculateMonthly();
    
    setTimeout(() => {
        if (checkoutBox) checkoutBox.scrollIntoView({ behavior: 'smooth' });
        console.log("🚀 فرم تمدید با موفقیت باز و محاسبات انجام شد.");
    }, 100);
}

function setMonDur(dur) { 
    monState.duration = dur; 
    document.querySelectorAll('.dur-seg').forEach(el => el.classList.remove('active')); 
    document.getElementById('segDur' + (dur==='konkur'?'Konkur':dur)).classList.add('active'); 
    calculateMonthly(); 
}

function setMonPay(method) { monState.payMethod = method; document.getElementById('segPayCash').classList.remove('active'); document.getElementById('segPayInst').classList.remove('active'); if(method === 'cash') document.getElementById('segPayCash').classList.add('active'); else document.getElementById('segPayInst').classList.add('active'); calculateMonthly(); }
function setMonDate(dateStr, index, element) { 
    monState.startDate = dateStr; 
    monState.startDateIndex = index; // 👈 ذخیره اندیس تاریخ
    document.querySelectorAll('.date-chip').forEach(el => el.classList.remove('active')); 
    element.classList.add('active'); 
    calculateMonthly(); 
}
function setMonPlan(plan) { 
    monState.payPlan = plan; 
    document.getElementById('segPayCash').classList.remove('active'); 
    document.getElementById('segPayInst').classList.remove('active'); 
    if(plan === 'cash') document.getElementById('segPayCash').classList.add('active'); 
    else document.getElementById('segPayInst').classList.add('active'); 
    calculateMonthly(); 
}

function setMonSource(method) {
    monState.payMethod = method;
    document.getElementById('monLblCard').classList.remove('active'); 
    document.getElementById('monLblWallet').classList.remove('active');
    if (method === 'card') document.getElementById('monLblCard').classList.add('active'); 
    else document.getElementById('monLblWallet').classList.add('active'); 
    calculateMonthly();
}

function calculateMonthly() {
    let duration = monState.duration === 'konkur' ? monState.konkurMonths : parseInt(monState.duration);
    let totalBase = monState.basePrice * duration;
    let finalPrice = totalBase;
    
    // ✨ شرط اقساط تغییر کرد به 3.4 میلیون تومان
    const segPayInst = document.getElementById('segPayInst');
    if (totalBase < 3400000 || duration === 1) {
        if (segPayInst) segPayInst.style.display = 'none';
        if(monState.payPlan === 'monthly') setMonPlan('cash'); 
    } else {
        if (segPayInst) segPayInst.style.display = 'block';
    }

    let timeDiscountRate = 0;
    let badgeText = '۱ ماهه';

    if (monState.duration === 'konkur' || duration >= 9) {
         timeDiscountRate = monState.payPlan === 'cash' ? 0.15 : 0.08;
         let offText = monState.payPlan === 'cash' ? '۱۵٪ تخفیف' : '۸٪ تخفیف قسطی';
         badgeText = `تا کنکور (${monState.konkurMonths} ماه) - ${offText}`;
    } else if (monState.duration === '3' || duration === 3) {
         timeDiscountRate = monState.payPlan === 'cash' ? 0.05 : 0.03;
         let offText = monState.payPlan === 'cash' ? '۵٪ تخفیف' : '۳٪ تخفیف قسطی';
         badgeText = `۳ ماهه - ${offText}`;
    }
    
    let badgeEl = document.getElementById('monLblDurationBadge');
    if (badgeEl) badgeEl.innerText = badgeText;

    let timeDiscountAmount = totalBase * timeDiscountRate; 
    finalPrice -= timeDiscountAmount;

    let promoDiscountAmount = monState.promoDiscount > 0 ? (monState.promoDiscount < 1 ? (totalBase * monState.promoDiscount) : monState.promoDiscount) : 0; 
    finalPrice -= promoDiscountAmount;
    
    let referralDiscountAmount = 0;
    let isFirstMonthlyReg = !document.getElementById('pansionActiveData') || document.getElementById('pansionActiveData').style.display === 'none';
    if (monState.isFirstMonthly && currentUser && currentUser.invited_by && isFirstMonthlyReg) { 
        referralDiscountAmount = 100000; 
        finalPrice = Math.max(0, finalPrice - referralDiscountAmount); 
    }

    let totalDiscount = timeDiscountAmount + promoDiscountAmount + referralDiscountAmount;
    monFinance.totalBase = totalBase; monFinance.discount = totalDiscount; monFinance.finalPrice = finalPrice; monFinance.installments = [];

    document.getElementById('monLblBase').innerText = totalBase.toLocaleString() + ' تومان';
    document.getElementById('monLblDisc').innerText = totalDiscount.toLocaleString() + ' تومان';
    document.getElementById('monLblFinal').innerText = finalPrice.toLocaleString();

    let listHtml = '';
    // ✨ شرط اقساط تغییر کرد به 3.4 میلیون تومان
    if (monState.payPlan === 'monthly' && totalBase >= 3400000) {
        const formatter = new Intl.DateTimeFormat('fa-IR', { month: 'long', day: 'numeric' }); 
        
        // ⏱️ محاسبه تاریخ مبدا اقساط (از زمان شروع قرارداد جدید)
        let baseInstDate = new Date(); 
        if (monState.txType === 'renew' && monState.renewRemainDays) {
            // اگر تمدید بود، مبدا اقساط رو ببر به تاریخی که طرح جدید شروع میشه
            baseInstDate.setDate(baseInstDate.getDate() + monState.renewRemainDays);
        } else {
            // اگر ثبت‌نام جدید بود، مبدا اقساط میشه همون امروز/فردا/پس‌‌فردا
            baseInstDate.setDate(baseInstDate.getDate() + (monState.startDateIndex || 0));
        }
        
        if (duration === 1 || duration === '1') {
            // یک ماهه (۵۰٪ نقد، ۵۰٪ ده روز بعد از شروع قرارداد)
            let upfrontRounded = roundDown100k(finalPrice * 0.50); 
            let remaining = finalPrice - upfrontRounded; 
            monFinance.upfront = upfrontRounded;
            
            let d1 = new Date(baseInstDate); 
            d1.setDate(baseInstDate.getDate() + 10); // 👈 دقیقاً 10 روز بعد از شروع قرارداد
            
            monFinance.installments.push({ due_date: d1.toISOString().split('T')[0], amount: remaining, installment_number: 1 });
            
            listHtml = `<li><strong style="color:var(--danger)">پیش‌پرداخت نقد:</strong> ${upfrontRounded.toLocaleString()} تومان</li>
                        <li>موعد قسط اول (${remaining.toLocaleString()} تومان): <b>${formatter.format(d1)}</b> (۱۰ روز پس از شروع قرارداد)</li>`;
        } else if (duration === 3 || duration === '3') {
            // سه ماهه (۵۰٪ نقد، ۵۰٪ یک ماه بعد از شروع قرارداد)
            let upfrontRounded = roundDown100k(finalPrice * 0.50); 
            let remaining = finalPrice - upfrontRounded; 
            monFinance.upfront = upfrontRounded;
            
            let d1 = new Date(baseInstDate); 
            d1.setMonth(baseInstDate.getMonth() + 1); 
            
            monFinance.installments.push({ due_date: d1.toISOString().split('T')[0], amount: remaining, installment_number: 1 });
            
            listHtml = `<li><strong style="color:var(--danger)">پیش‌پرداخت نقد:</strong> ${upfrontRounded.toLocaleString()} تومان</li>
                        <li>موعد قسط اول (${remaining.toLocaleString()} تومان): <b>${formatter.format(d1)}</b> (یک ماه پس از شروع قرارداد)</li>`;
        } else {
            // سالانه / تا کنکور (۲۰٪ نقد، ۴ چک ۲۰٪ در ماه‌های ۱، ۲، ۴، ۶ بعد از شروع قرارداد)
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
    let payNowBig = document.getElementById('monLblPayNowBig'); if(payNowBig) payNowBig.innerText = monFinance.upfront.toLocaleString() + ' تومان';
    document.getElementById('monInstList').innerHTML = `<ul style="list-style:none; padding:0; margin:0; line-height: 2;">${listHtml}</ul>`;

    let ibanBox = document.getElementById('monIbanBox');
    if (ibanBox) {
        if (monFinance.upfront >= 15000000) ibanBox.style.display = 'block';
        else ibanBox.style.display = 'none';
    }

    // ✨ نمایش شفاف مبلغ کسری از کیف پول
    let wBal = Number(currentUser.wallet_balance || 0);
    let walletBadge = document.getElementById('monWalletStatusBadge');
    if (walletBadge) {
        if (monState.payMethod === 'wallet' && wBal < monFinance.upfront) {
            walletBadge.style.color = 'var(--danger)'; walletBadge.innerText = 'موجودی ناکافی';
        } else {
            walletBadge.style.color = 'var(--text-muted)'; 
            walletBadge.innerText = `موجودی: ${wBal.toLocaleString()} | کسر: ${monFinance.upfront.toLocaleString()}`;
        }
    }

    let payCardBox = document.getElementById('monPayCardBox');
    let uploadBox = document.getElementById('monUploadBox');
    if (monState.payMethod === 'wallet') {
        if(payCardBox) payCardBox.style.display = 'none';
        if(uploadBox) uploadBox.style.display = 'none';
    } else {
        if(payCardBox) payCardBox.style.display = 'block';
        if(uploadBox) uploadBox.style.display = 'flex';
    }

    let noticeMsg = "";
    if (referralDiscountAmount > 0) noticeMsg += `🎁 ۱۰۰ هزار تومان هدیه اولین ثبت‌نام (معرف) اعمال شد!<br>`;
    if (promoDiscountAmount > 0) noticeMsg += `✅ کد تخفیف اعمال شد.`;
    document.getElementById('monDiscountNotice').innerHTML = noticeMsg;
    validateMonSubmit();
}

async function applyMonDiscount() {
    const code = document.getElementById('monDiscountCode').value.trim().toUpperCase();
    if(!code) return;
    if(code === 'DEMO10') { monState.promoCode = code; monState.promoDiscount = 0.10; calculateMonthly(); alert('کد تخفیف دمو اعمال شد.'); } 
    else { alert('کد تخفیف در سیستم یافت نشد.'); }
}

function handleMonFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
        document.getElementById('monUploadText').innerText = `⏳ در حال فشرده‌سازی...`;
        const reader = new FileReader();
        reader.onload = function(e) { 
            const img = new Image();
            img.onload = function() {
                const canvas = document.createElement('canvas'); let w = img.width, h = img.height;
                if(w > h && w > 1000) { h *= 1000/w; w = 1000; } else if(h > 1000) { w *= 1000/h; h = 1000; }
                canvas.width = w; canvas.height = h; const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, w, h);
                monState.receiptBase64 = canvas.toDataURL('image/jpeg', 0.6).split(',')[1];
                document.getElementById('monUploadText').innerText = `✅ فیش ضمیمه شد`;
                document.getElementById('monUploadBox').style.borderColor = "var(--success)"; document.getElementById('monUploadBox').style.background = "rgba(16, 185, 129, 0.05)";
                validateMonSubmit();
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }
}
function validateMonSubmit() { 
    let hasReceiptOrWallet = false;
    if (monState.payMethod === 'wallet') {
        hasReceiptOrWallet = (currentUser.wallet_balance >= monFinance.upfront);
    } else {
        hasReceiptOrWallet = (monState.receiptBase64 !== "");
    }
    let rulesChecked = document.getElementById('monRulesCheckbox') ? document.getElementById('monRulesCheckbox').checked : true;
    document.getElementById('btnSubmitMonthly').disabled = !(hasReceiptOrWallet && rulesChecked); 
}

async function submitMonthly() {
    document.getElementById('mainLoader').style.display = 'flex';
    let duration = monState.duration === 'konkur' ? monState.konkurMonths : parseInt(monState.duration);
    let baseDateStr = monState.startDate || getShamsiDateSafe(new Date()); let endDateStr = addMonthsJS(baseDateStr, duration);
    try {
        const { error: subError } = await supabaseClient.from('pan_monthly_subs').insert([{
            phone_number: currentUser.phone_number, plan_type: monState.planType, start_date: baseDateStr, end_date: endDateStr,
            total_price: monFinance.finalPrice, paid_amount: monFinance.upfront, 
            receipt_base64: monState.payMethod === 'card' ? monState.receiptBase64 : null, status: 'pending'
        }]);
        if (subError) throw subError;

        if (monFinance.installments.length > 0) {
            let instInserts = monFinance.installments.map(inst => ({ phone_number: currentUser.phone_number, amount: inst.amount, due_date: inst.due_date, installment_number: inst.installment_number, status: 'pending' }));
            await supabaseClient.from('pan_installments').insert(instInserts);
        }

        if (monState.payMethod === 'wallet') {
            await supabaseClient.from('users').update({ wallet_balance: currentUser.wallet_balance - monFinance.upfront }).eq('phone_number', currentUser.phone_number);
        }

        if (monState.isFirstMonthly && currentUser.invited_by) await rewardReferrer(currentUser.invited_by, 150000, `یکی از دوستان شما با کد معرف شما اولین اشتراک ماهانه خود را ثبت کرد. ۱۵۰,۰۰۰ تومان پاداش به کیف پول شما اضافه شد!`);
        
        const { data: srv } = await supabaseClient.from('services').select('capacity').eq('type', monState.planType).single();
        if (srv && srv.capacity > 0) await supabaseClient.from('services').update({ capacity: srv.capacity - 1 }).eq('type', monState.planType);

        document.getElementById('mainLoader').style.display = 'none';
        alert('🎉 قرارداد شما با موفقیت ثبت شد.'); window.location.reload(); 
    } catch (e) { document.getElementById('mainLoader').style.display = 'none'; alert('خطا در ثبت پایگاه داده.'); }
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
    renderCalendar();
}

function renderCalendar() {
    const grid = document.getElementById('calendarGrid'); grid.innerHTML = ''; selectedNewDates = [];
    window14Dates.forEach(d => {
        let isPastBooked = globalUserPastReservations.includes(d.date);
        let cardClass = 'cal-card'; let onclickEvent = ''; let statusText = `ظرفیت دارد`;
        if (isPastBooked) { cardClass += ' past-booked'; statusText = 'رزرو شما ✅'; } 
        else { cardClass += ' available'; onclickEvent = `onclick="toggleDate('${d.date}', this)"`; }
        grid.innerHTML += `<div class="${cardClass}" ${onclickEvent}><div class="cal-day">${d.dayName}</div><div class="cal-date">${d.date.replace(/-/g, '/').substring(5)}</div><div class="cal-cap">${statusText}</div></div>`;
    });
    updatePricing();
}

function toggleDate(dateStr, element) {
    if(element.classList.contains('selected')) { element.classList.remove('selected'); selectedNewDates = selectedNewDates.filter(d => d !== dateStr); } 
    else { element.classList.add('selected'); selectedNewDates.push(dateStr); }
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
    let activeBookedDays = globalUserPastReservations.length; let newSelectedDays = selectedNewDates.length; let totalD = activeBookedDays + newSelectedDays;
    let applicableRate = (totalD === 0) ? 0 : (totalD >= 8 ? 150 : pricingTiers[totalD]);
    let payableAmount = newSelectedDays * applicableRate; let discountMsg = "";

    let isFirstEverDaily = (globalUserPastReservations.length === 0);
    let referralDiscountAmount = 0;
    if (isFirstEverDaily && currentUser.invited_by && newSelectedDays > 0) { 
        referralDiscountAmount = 20000; 
        discountMsg += `🎁 ۲۰ هزار تومان هدیه اولین ورود (معرف) اعمال شد!\n`; 
    }

    if (discountAmount > 0) { payableAmount -= discountAmount; discountMsg += `✅ تخفیف دستی اعمال شد.\n`; }
    finalAmountToPay = Math.max(0, (payableAmount * 1000) - referralDiscountAmount);

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
    if(code === 'DEMO10') { appliedDiscountCode = code; discountAmount = 10; updatePricing(); alert('کد تخفیف اعمال شد.'); } 
    else { alert('کد تخفیف یافت نشد.'); }
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
                document.getElementById('uploadText').innerText = `✅ فایل آماده شد`;
                document.getElementById('uploadBox').style.borderColor = "var(--success)"; document.getElementById('uploadBox').style.background = "rgba(16, 185, 129, 0.05)";
                validateSubmitButton();
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }
}
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
        const { error } = await supabaseClient.from('pan_reservations').insert([{
            phone_number: currentUser.phone_number, reserved_dates: JSON.stringify(selectedNewDates),
            total_amount: finalAmountToPay, pay_method: selectedPayMethod, receipt_base64: selectedPayMethod === 'card' ? base64Image : null,
            status: 'pending'
        }]);
        if (error) throw error;

        let isFirstEverDaily = (globalUserPastReservations.length === 0);
        if (isFirstEverDaily && currentUser.invited_by) await rewardReferrer(currentUser.invited_by, 50000, `یکی از دوستان شما با کد معرف شما اولین رزرو روزانه خود را ثبت کرد. مبلغ ۵۰,۰۰۰ تومان به کیف پول شما اضافه شد!`);

        if (selectedPayMethod === 'wallet') {
            await supabaseClient.from('users').update({ wallet_balance: currentUser.wallet_balance - finalAmountToPay }).eq('phone_number', currentUser.phone_number);
        }

        document.getElementById('mainLoader').style.display = 'none';
        alert('🎉 رزرو شما با موفقیت قطعی شد.'); window.location.reload(); 
    } catch (e) { document.getElementById('mainLoader').style.display = 'none'; alert('خطای ارتباط با دیتابیس.'); }
}

// ==========================================
// 💰 امور مالی
// ==========================================
function openWithdrawModal() { document.getElementById('withdrawModal').style.display = 'flex'; }
function closeWithdrawModal() { document.getElementById('withdrawModal').style.display = 'none'; }
async function submitWithdraw() {
    const card = document.getElementById('withdrawCard').value.trim(); const amount = parseInt(document.getElementById('withdrawAmount').value);
    if(!card || card.length !== 16 || !amount) return alert('اطلاعات نامعتبر است.');
    if(amount > currentUser.wallet_balance || amount < 50000) return alert('مبلغ درخواستی نامعتبر است.');
    document.getElementById('mainLoader').style.display = 'flex';
    // درج درخواست تسویه (در دیتابیس باید جدول withdrawals وجود داشته باشد)
    alert('درخواست برداشت ثبت شد (تست بدون بک‌اند)'); document.getElementById('mainLoader').style.display = 'none'; window.location.reload(); 
}

function openInstallmentModal(id, amount) { currentInstallmentId = id; currentInstallmentAmount = amount; document.getElementById('instPayAmount').innerText = `${amount.toLocaleString()} تومان`; document.getElementById('installmentModal').style.display = 'flex'; }
function closeInstallmentModal() { document.getElementById('installmentModal').style.display = 'none'; }
function handleInstFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
        document.getElementById('instUploadText').innerText = `⏳ در حال فشرده‌سازی...`;
        const reader = new FileReader();
        reader.onload = function(e) { 
            const img = new Image(); img.onload = function() {
                const canvas = document.createElement('canvas'); let w = img.width, h = img.height;
                if(w > h && w > 1000) { h *= 1000/w; w = 1000; } else if(h > 1000) { w *= 1000/h; h = 1000; }
                canvas.width = w; canvas.height = h; const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, w, h);
                instBase64Image = canvas.toDataURL('image/jpeg', 0.6).split(',')[1];
                document.getElementById('instUploadText').innerText = `✅ فیش آماده ارسال`; document.getElementById('btnSubmitInst').disabled = false;
            }; img.src = e.target.result;
        }; reader.readAsDataURL(file);
    }
}

async function submitInstallment() {
    document.getElementById('mainLoader').style.display = 'flex';
    try {
        const { error } = await supabaseClient.from('pan_installments').update({ receipt_base64: instBase64Image, status: 'paid' }).eq('id', currentInstallmentId);
        document.getElementById('mainLoader').style.display = 'none';
        if (!error) { alert('فیش ارسال و وضعیت به پرداخت‌شده تغییر یافت.'); window.location.reload(); } else { alert('خطا در ارتباط با سرور.'); }
    } catch (e) { document.getElementById('mainLoader').style.display = 'none'; alert('خطا'); }
}

function renderInstallments(installmentsData) {
    const container = document.getElementById('installmentsContainer');
    if(!installmentsData || installmentsData.length === 0) { container.innerHTML = '<div style="text-align: center; color: var(--text-muted); margin-top: 30px; font-weight: bold;">شما هیچ قسط ثبت‌شده‌ای ندارید.</div>'; return; }
    let html = ''; installmentsData.sort((a, b) => new Date(a.due_date) - new Date(b.due_date));
    installmentsData.forEach(inst => {
        let statusObj = { text: 'در انتظار پرداخت', color: 'var(--warning)', bg: 'rgba(245, 158, 11, 0.1)', showBtn: true };
        if (inst.status === 'paid') statusObj = { text: 'پرداخت شده', color: 'var(--success)', bg: 'rgba(16, 185, 129, 0.1)', showBtn: false };
        else { let due = new Date(inst.due_date); let today = new Date(); today.setHours(0,0,0,0); if (due < today) statusObj = { text: 'سررسید گذشته', color: 'var(--danger)', bg: 'rgba(239, 68, 68, 0.1)', showBtn: true }; }
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
    document.getElementById('profGrade').value = currentUser.grade || ''; // فیلد گرید حالا ثابت (readonly) است
    document.getElementById('profMajor').value = currentUser.major || '';
    document.getElementById('profSchool').value = currentUser.school_name || '';
    document.getElementById('profProvince').value = currentUser.province || '';
    document.getElementById('profCity').value = currentUser.city || '';
    document.getElementById('profFather').value = currentUser.father_phone || '';
    document.getElementById('profMother').value = currentUser.mother_phone || '';
    
    // کادر نحوه آشنایی: اگر در دیتابیس خالی است، نمایش داده شود
    let refSourceGroup = document.getElementById('profRefSourceGroup');
    if (!currentUser.referral_source) {
        refSourceGroup.style.display = 'block';
    } else {
        refSourceGroup.style.display = 'none';
    }

    let refCode = currentUser.referral_code || 'در حال صدور...';
    document.getElementById('profReferralCode').innerText = refCode;
    document.getElementById('txtCodeSpan').innerText = refCode;
}

async function submitProfileUpdate() {
    const payload = {
        full_name: document.getElementById('profName').value.trim(), 
        // پایه تحصیلی (grade) دیگر از اینجا ارسال نمی‌شود چون ثابت است
        major: document.getElementById('profMajor').value.trim(), 
        school_name: document.getElementById('profSchool').value.trim(), 
        province: document.getElementById('profProvince').value.trim(), 
        city: document.getElementById('profCity').value.trim(), 
        father_phone: toEngDigits(document.getElementById('profFather').value.trim()), 
        mother_phone: toEngDigits(document.getElementById('profMother').value.trim())
    };

    // اگر کادر نحوه آشنایی فعال بود و کاربر گزینه‌ای انتخاب کرد، آن را به دیتابیس بفرست
    if (!currentUser.referral_source) {
        let refSourceVal = document.getElementById('profRefSource').value;
        if (refSourceVal) {
            payload.referral_source = refSourceVal;
        }
    }

    document.getElementById('mainLoader').style.display = 'flex';
    try {
        const { error } = await supabaseClient.from('users').update(payload).eq('phone_number', currentUser.phone_number);
        document.getElementById('mainLoader').style.display = 'none';
        if (!error) { 
            alert('اطلاعات با موفقیت ذخیره شد.'); 
            window.location.reload(); 
        } else { 
            alert('خطا در بروزرسانی.'); 
        }
    } catch (e) { 
        document.getElementById('mainLoader').style.display = 'none'; 
        alert('خطا در ارتباط با سرور.'); 
    }
}
function copyReferral() {
    const refCode = currentUser.referral_code || 'RH-XXXXX';
    const textToCopy = `سلام! من تو پانسیون مطالعاتی راهینو ثبت‌نام کردم.\n\nاگه موقع ثبت‌نام کد معرف من رو وارد کنی، همون اول ۱۰۰ هزار تومان برای رزرو ماهانه و ۲۰ هزار تومان برای رزرو روزانه تخفیف می‌گیری!\n\nکد معرف اختصاصی من: ${refCode}\nلینک ثبت‌نام: https://booking.rahinovip.ir`;
    navigator.clipboard.writeText(textToCopy).then(() => alert('متن دعوت کپی شد.'));
}
