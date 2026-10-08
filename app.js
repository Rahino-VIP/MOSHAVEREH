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
let globalUserInstallments = [];

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
function roundDown50k(amount) { 
    return Math.floor(amount / 50000) * 50000; 
}
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

function calcSimpleShamsi(dateStr, monthsToAdd, daysOffset = 0) {
    let parts = dateStr.replace(/\//g, '-').split('-');
    if(parts.length !== 3) return dateStr;
    let y = parseInt(parts[0]), m = parseInt(parts[1]), d = parseInt(parts[2]);

    m += monthsToAdd;
    d += daysOffset;

    if (d <= 0) {
        m -= 1;
        d += 30; // یک روز قبل از یکم، می‌شود سی‌ام ماه قبل
    } else if (d > 31) {
        d -= 30;
        m += 1;
    }

    while (m > 12) { m -= 12; y += 1; }
    while (m <= 0) { m += 12; y -= 1; }

    let mm = m < 10 ? '0' + m : m;
    let dd = d < 10 ? '0' + d : d;
    return `${y}-${mm}-${dd}`;
}

function addShamsiTime(dateStr, monthsToAdd, daysToAdd = 0) {
    let parts = dateStr.replace(/\//g, '-').split('-');
    if(parts.length !== 3) return dateStr;
    let y = parseInt(parts[0]), m = parseInt(parts[1]), d = parseInt(parts[2]);

    // ۱. اضافه کردن روزها
    d += daysToAdd;
    let currentMonthDays = m <= 6 ? 31 : (m <= 11 ? 30 : 29);
    while (d > currentMonthDays) {
        d -= currentMonthDays;
        m += 1;
        if (m > 12) { m -= 12; y += 1; }
        currentMonthDays = m <= 6 ? 31 : (m <= 11 ? 30 : 29);
    }

    // ۲. اضافه کردن ماه‌ها
    m += monthsToAdd;
    while (m > 12) {
        m -= 12;
        y += 1;
    }

    // ۳. اصلاح روز برای ماه‌های ۳۰ یا ۲۹ روزه
    let newMonthDays = m <= 6 ? 31 : (m <= 11 ? 30 : 29);
    if (d > newMonthDays) d = newMonthDays;

    let mm = m < 10 ? '0' + m : m;
    let dd = d < 10 ? '0' + d : d;
    return `${y}-${mm}-${dd}`;
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
// 🔐 توابع احراز هویت (متصل به Supabase Auth)
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

// بررسی وضعیت کاربر از طریق تابع امن SQL
// بررسی وضعیت کاربر از طریق تابع امن SQL
async function checkUserPhone() {
    const phone = toEngDigits(document.getElementById('inpPhone').value.trim());
    if (!phone || phone.length < 10) return alert('شماره موبایل نامعتبر است.');
    document.getElementById('mainLoader').style.display = 'flex';
    
    try {
        const { data, error } = await supabaseClient.rpc('check_user_status', { p_phone: phone });
        document.getElementById('mainLoader').style.display = 'none';

        // ۱. اگر خطای شبکه‌ای یا دیتابیسی رخ داد (مثل قطعی فیلترشکن)
        if (error) {
            console.error("Supabase Error:", error);
            return alert('ارتباط با سرور برقرار نشد. لطفاً وضعیت اینترنت یا VPN خود را بررسی کنید.');
        }

        // ۲. اگر سرور جواب داد اما این شماره موبایل در دیتابیس نبود
        if (!data || data.length === 0) {
            goToAuthStep('view-register', 'تکمیل اطلاعات پرونده', 'جهت صدور دسترسی، فرم زیر را تکمیل نمایید');
            return;
        } 
        
        // ۳. اگر کاربر وجود داشت، منطق بررسی وضعیت اعمال شود
        let user = data[0];
        if (user.status === 'pending') {
            goToAuthStep('view-pending', 'وضعیت پرونده', 'نیاز به تایید مدیریت');
        } else if (user.status === 'blocked') {
            goToAuthStep('view-blocked', 'وضعیت پرونده', 'دسترسی محدود شده است');
        } else if (!user.has_password) {
            // کاربر اکتیو است اما هنوز رمز ندارد
            document.getElementById('recovPhoneStore').value = phone; 
            goToAuthStep('view-set-password', 'ارتقای امنیت حساب', 'لطفاً رمز عبور خود را تنظیم کنید');
        } else {
            // کاربر اکتیو است و رمز دارد
            if(user.security_question) {
                document.getElementById('recoveryQuestionText').innerText = `سوال: ${user.security_question}`;
                document.getElementById('recovPhoneStore').value = phone;
            }
            goToAuthStep('view-login', 'ورود به حساب کاربری', 'خوش آمدید! لطفاً رمز عبور خود را وارد کنید');
        }
        
    } catch (e) { 
        document.getElementById('mainLoader').style.display = 'none'; 
        alert("خطای اتصال به اینترنت یا سرور"); 
    }
}
// تخصیص رمز برای کاربران قدیمی فاقد رمز
// تخصیص رمز و ساخت کد معرف برای کاربران قدیمی فاقد رمز
async function submitSetPassword() {
    const phone = document.getElementById('recovPhoneStore').value;
    const pass = document.getElementById('setNewPass').value.trim();
    const secQ = document.getElementById('setSecQ').value;
    const secA = document.getElementById('setSecA').value.trim();

    if(!pass || pass.length < 6 || !secQ || !secA) return alert('لطفا تمام فیلدها را به درستی تکمیل کنید.');

    document.getElementById('mainLoader').style.display = 'flex';
    try {
        // ۱. ساخت توکن Auth در سوپابیس (ایمیل ساختگی)
        const { data: authData, error: authError } = await supabaseClient.auth.signUp({
            email: phone + '@rahino.ir',
            password: pass
        });
        if (authError) throw authError;

        // ۲. بررسی اینکه آیا کاربر از قبل کد معرف دارد یا نه
        const { data: existingUser } = await supabaseClient.from('users').select('referral_code').eq('phone_number', phone).single();
        let refCode = (existingUser && existingUser.referral_code) ? existingUser.referral_code : generateReferralCode();

        // ۳. آپدیت اطلاعات امنیتی و کد معرف در جدول دیتابیس
        const { error: dbError } = await supabaseClient.from('users')
            .update({ 
                password: pass, 
                security_question: secQ, 
                security_answer: secA,
                referral_code: refCode 
            })
            .eq('phone_number', phone);
        if (dbError) throw dbError;

        document.getElementById('mainLoader').style.display = 'none';
        localStorage.setItem('rahino_user_phone', phone);
        alert('رمز عبور با موفقیت ثبت شد.');
        window.location.reload();
    } catch (e) { 
        document.getElementById('mainLoader').style.display = 'none'; 
        alert("خطا در ثبت اطلاعات."); 
    }
}

// ثبت‌نام یکپارچه کاربران جدید با Auth
async function submitRegistration() {
    const phone = toEngDigits(document.getElementById('inpPhone').value.trim());
    let gradeVal = document.getElementById('regGrade').value === "" ? null : document.getElementById('regGrade').value;
    let secQVal = document.getElementById('regSecQ').value === "" ? null : document.getElementById('regSecQ').value;
    const pass = document.getElementById('regPass').value.trim();

    const userData = {
        full_name: document.getElementById('regName').value.trim(),
        grade: gradeVal, 
        major: document.getElementById('regMajor').value.trim(),
        school_name: document.getElementById('regSchool').value.trim(), 
        password: pass,
        security_question: secQVal, 
        security_answer: document.getElementById('regSecA').value.trim(),
        invited_by: toEngDigits(document.getElementById('regReferral').value.trim().toUpperCase()) || null,
        referral_code: generateReferralCode(), 
        wallet_balance: 0
    };

    if (!userData.full_name || !userData.grade || !userData.major || !userData.school_name || !pass || !userData.security_question || !userData.security_answer) {
        return alert('تکمیل تمامی فیلدها الزامی است.');
    }
    if (pass.length < 6) return alert('رمز عبور باید حداقل ۶ کاراکتر باشد.');

    document.getElementById('mainLoader').style.display = 'flex';
    try {
        // ۱. ساخت یوزر در سیستم امنیتی سوپابیس
        const { data, error: authError } = await supabaseClient.auth.signUp({
            email: phone + '@rahino.ir',
            password: pass
        });
        if (authError) throw authError;

        // ۲. تریگر دیتابیس به طور خودکار ردیف را ساخته. حالا دیتای اضافه را در آن آپدیت می‌کنیم
        const { error: dbError } = await supabaseClient.from('users')
            .update(userData)
            .eq('phone_number', phone);
        if (dbError) throw dbError;

        // ۳. خارج کردن کاربر از حالت لاگین تا زمانی که مدیریت او را تایید نکرده است
        await supabaseClient.auth.signOut();

        document.getElementById('mainLoader').style.display = 'none';
        goToAuthStep('view-pending', 'وضعیت پرونده', 'نیاز به تایید مدیریت');
    } catch (e) { document.getElementById('mainLoader').style.display = 'none'; alert("خطا در ثبت‌نام."); }
}

// لاگین یکپارچه با Auth و بررسی وضعیت تایید
// لاگین یکپارچه با قابلیت انتقال خودکار کاربران قدیمی به Auth
async function submitLogin() {
    const phone = toEngDigits(document.getElementById('inpPhone').value.trim());
    const pass = document.getElementById('inpLoginPass').value.trim();
    if (!pass || pass.length < 6) return alert('رمز عبور باید حداقل ۶ کاراکتر باشد.');

    document.getElementById('mainLoader').style.display = 'flex';
    try {
        // ۱. تلاش برای ورود عادی به سیستم امنیتی (برای کسانی که درست ثبت‌نام شده‌اند)
        let { data: authData, error: authError } = await supabaseClient.auth.signInWithPassword({
            email: phone + '@rahino.ir',
            password: pass
        });

        // ۲. اگر ورود عادی ارور داد، چک می‌کنیم شاید کاربر قدیمی است که در دیتابیس رمز دارد اما وارد Auth نشده
        if (authError) {
            const { data: isOldUser } = await supabaseClient.rpc('verify_old_password', { p_phone: phone, p_pass: pass });
            
            if (isOldUser) {
                // رمز قدیمی صحیح است! پس کاربر را در همان لحظه بدون اینکه متوجه شود در Auth ثبت‌نام می‌کنیم
                const { data: signUpData, error: signUpError } = await supabaseClient.auth.signUp({
                    email: phone + '@rahino.ir',
                    password: pass
                });
                
                if (signUpError) {
                    document.getElementById('mainLoader').style.display = 'none';
                    return alert('خطا در همگام‌سازی حساب کاربری.');
                }
                // اکانت با موفقیت استانداردسازی شد و لاگین انجام شد
            } else {
                document.getElementById('mainLoader').style.display = 'none';
                return alert('رمز عبور اشتباه است.');
            }
        }

        // ۳. بررسی وضعیت تایید حساب توسط مدیریت
        const { data: userData } = await supabaseClient.from('users').select('status').eq('phone_number', phone).single();

        if (userData && userData.status !== 'active') {
            await supabaseClient.auth.signOut(); // قفل نگه داشتن کاربر
            document.getElementById('mainLoader').style.display = 'none';
            return alert('حساب شما در انتظار تایید است یا مسدود شده است.');
        }

        // ۴. ورود کاملاً موفقیت‌آمیز
        localStorage.setItem('rahino_user_phone', phone);
        window.location.reload(); 
    } catch (e) { 
        document.getElementById('mainLoader').style.display = 'none'; 
        alert("خطا در ارتباط با دیتابیس"); 
    }
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

        let consult = (consultRes.data && consultRes.data.length > 0) ? consultRes.data[0] : null;
        let installments = instRes.data || [];
        globalUserInstallments = installments; 
        let availablePlans = servicesRes.data || [];

        let pansionData = pansionRes.data || [];
        let pansion = null;
        
        if (pansionData.length > 0) {
            // مرتب‌سازی قراردادها از قدیمی به جدید بر اساس تاریخ شروع
            let subs = pansionData.sort((a, b) => a.start_date.localeCompare(b.start_date));
            let firstSub = subs[0]; // قرارداد پایه
            let lastSub = subs[subs.length - 1]; // آخرین تمدید (دورترین تاریخ انقضا)

            pansion = {
                ...firstSub,
                service_type: firstSub.plan_type,
                end_date: lastSub.end_date, // 🚀 نمایش تاریخ انقضای آخرین تمدید در داشبورد
                all_subs: subs // نگهداری تمام قراردادهای متصل برای زمان لغو
            };
        }

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
        const gasUrl = "https://script.google.com/macros/s/AKfycbz2CXGMkNTKY8Pn--zI4R2l-we9f6jjaCXxYpljlO5trI4IcFxcO46bYm_ogPOHVAm5/exec";
        const payload = {
            action: 'reward_referrer',
            referralCode: referralCode,
            amount: rewardAmount,
            messageBody: messageBody
        };
        
        // ارسال بی‌صدا به گوگل اسکریپت بدون متوقف کردن کاربر
        fetch(gasUrl, { 
            method: 'POST', 
            mode: 'no-cors', 
            body: JSON.stringify(payload) 
        }).catch(err => console.log(err));
        
    } catch(e) { 
        console.error("Error sending reward request to GAS", e); 
    }
}
// ==========================================
// 🗓 رزرو ماهانه
// ==========================================
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
        chipsHtml += `<div class="date-chip ${activeCls}" onclick="setMonDate('${o.date}', ${index}, this)">
                        <div style="font-size:13px; font-weight:900;">${o.text}</div>
                        <div style="font-size:10px; font-weight:normal; margin-top:4px;">${o.date.replace(/-/g,'/')}</div>
                      </div>`;
    });
    document.getElementById('monDateChipsContainer').innerHTML = chipsHtml;
    updateRules();
}

function renderGatewayActive(pansion) { 
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

function openRenewal() {
    if (!activePansion) return;
    
    let pType = activePansion.plan_type || activePansion.service_type;
    let activePlanData = availablePansionPlans.find(p => p.type === pType) || { base_price: 3600000 };
    let remainDays = calcShamsiRemainDays(activePansion.end_date);

    monState.txType = 'renew';
    monState.planType = pType;
    monState.basePrice = activePlanData.base_price;
    
    // اگر قرارداد تمام شده بود، تمدید از امروز شروع می‌شود، در غیر این صورت از روز پایان قرارداد
    if (remainDays <= 0) {
        monState.startDate = getShamsiDateSafe(new Date());
        monState.renewRemainDays = 0;
    } else {
        monState.startDate = activePansion.end_date;
        monState.renewRemainDays = remainDays;
    }

    let checkoutBox = document.getElementById('bookingCheckoutSection');
    if(checkoutBox) document.getElementById('view-monthly').appendChild(checkoutBox);

    let dateBox = document.getElementById('monDateSelectionBox'); 
    if (dateBox) dateBox.style.display = 'none';
    
    if (checkoutBox) checkoutBox.style.display = 'block';
    
    updateRules();
    calculateMonthly();
    setTimeout(() => { if (checkoutBox) checkoutBox.scrollIntoView({ behavior: 'smooth' }); }, 100);
}
function selectNewPlan(type, price) {
    monState.txType = 'new'; 
    
    let checkoutBox = document.getElementById('bookingCheckoutSection');
    if(checkoutBox) document.getElementById('view-monthly').appendChild(checkoutBox);

    let dateBox = document.getElementById('monDateSelectionBox'); 
    if(dateBox) dateBox.style.display = 'block'; 
    
    monState.planType = type; 
    monState.basePrice = price;
    
    document.querySelectorAll('.store-card').forEach(card => card.classList.remove('selected')); 
    let selectedCard = document.getElementById('card_' + type);
    if(selectedCard) selectedCard.classList.add('selected');
    
    if (checkoutBox) checkoutBox.style.display = 'block';
    
    updateRules(); 
    calculateMonthly(); 
    setTimeout(() => { if (checkoutBox) checkoutBox.scrollIntoView({ behavior: 'smooth' }); }, 100);
}

function setMonDur(dur) { 
    monState.duration = dur; 
    document.querySelectorAll('.dur-seg').forEach(el => el.classList.remove('active')); 
    document.getElementById('segDur' + dur).classList.add('active'); 
    calculateMonthly(); 
}

function setMonPay(method) { monState.payMethod = method; document.getElementById('segPayCash').classList.remove('active'); document.getElementById('segPayInst').classList.remove('active'); if(method === 'cash') document.getElementById('segPayCash').classList.add('active'); else document.getElementById('segPayInst').classList.add('active'); calculateMonthly(); }
function setMonDate(dateStr, index, element) { monState.startDate = dateStr; monState.startDateIndex = index; document.querySelectorAll('.date-chip').forEach(el => el.classList.remove('active')); element.classList.add('active'); calculateMonthly(); }
function setMonPlan(plan) { monState.payPlan = plan; document.getElementById('segPayCash').classList.remove('active'); document.getElementById('segPayInst').classList.remove('active'); if(plan === 'cash') document.getElementById('segPayCash').classList.add('active'); else document.getElementById('segPayInst').classList.add('active'); calculateMonthly(); }
function setMonSource(method) { monState.payMethod = method; document.getElementById('monLblCard').classList.remove('active'); document.getElementById('monLblWallet').classList.remove('active'); if (method === 'card') document.getElementById('monLblCard').classList.add('active'); else document.getElementById('monLblWallet').classList.add('active'); calculateMonthly(); }

function calculateMonthly() {
    let duration = parseInt(monState.duration);
    let totalBase = monState.basePrice * duration;
    let finalPrice = totalBase;
    
    const segPayInst = document.getElementById('segPayInst');
    if (totalBase < 3400000) {
        if (segPayInst) segPayInst.style.display = 'none';
        if(monState.payPlan === 'monthly') setMonPlan('cash'); 
    } else {
        if (segPayInst) segPayInst.style.display = 'block';
    }

    let timeDiscountRate = 0;
    let badgeText = '۱ ماهه';

    if (duration === 9) {
         timeDiscountRate = monState.payPlan === 'cash' ? 0.15 : 0.08;
         badgeText = `۹ ماهه - ${monState.payPlan === 'cash' ? '۱۵٪ تخفیف' : '۸٪ تخفیف قسطی'}`;
    } else if (duration === 6) {
         timeDiscountRate = monState.payPlan === 'cash' ? 0.10 : 0.06;
         badgeText = `۶ ماهه - ${monState.payPlan === 'cash' ? '۱۰٪ تخفیف' : '۶٪ تخفیف قسطی'}`;
    } else if (duration === 3) {
         timeDiscountRate = monState.payPlan === 'cash' ? 0.05 : 0.03;
         badgeText = `۳ ماهه - ${monState.payPlan === 'cash' ? '۵٪ تخفیف' : '۳٪ تخفیف قسطی'}`;
    }
    
    let badgeEl = document.getElementById('monLblDurationBadge');
    if (badgeEl) badgeEl.innerText = badgeText;

    let timeDiscountAmount = totalBase * timeDiscountRate; 
    finalPrice -= timeDiscountAmount;

    let noticeMsg = "";

    // اعمال هدیه معرف
    let referralDiscountAmount = 0;
    let isFirstMonthlyReg = !document.getElementById('pansionActiveData') || document.getElementById('pansionActiveData').style.display === 'none';
    if (monState.isFirstMonthly && currentUser && currentUser.invited_by && isFirstMonthlyReg) { 
        referralDiscountAmount = 100000; 
        finalPrice -= referralDiscountAmount;
        noticeMsg += `🎁 ۱۰۰ هزار تومان هدیه اولین ثبت‌نام (معرف) اعمال شد!<br>`;
    }

    // اعمال کد تخفیف اختصاصی
    let promoDiscountAmount = 0;
    if (currentMonPromoData && finalPrice > 0) { 
        if (currentMonPromoData.discount_type === 'percent') {
            promoDiscountAmount = finalPrice * (currentMonPromoData.discount_value / 100);
        } else {
            promoDiscountAmount = currentMonPromoData.discount_value;
        }
        finalPrice -= promoDiscountAmount; 
        noticeMsg += `✅ کد تخفیف اعمال شد.<br>`; 
    }

    finalPrice = Math.max(0, finalPrice);

    // گرد کردن منصفانه مبلغ نهایی (Math.round) تا به ضرر شما تمام نشود
    let originalFinal = finalPrice;
    finalPrice = Math.round(finalPrice / 50000) * 50000; 
    let roundingDiff = originalFinal - finalPrice; 
    
    let totalDiscount = timeDiscountAmount + promoDiscountAmount + referralDiscountAmount + roundingDiff;

    monFinance.totalBase = totalBase; 
    monFinance.discount = totalDiscount; 
    monFinance.finalPrice = finalPrice; 
    monFinance.installments = [];

    document.getElementById('monLblBase').innerText = totalBase.toLocaleString() + ' تومان';
    document.getElementById('monLblDisc').innerText = totalDiscount.toLocaleString() + ' تومان';
    document.getElementById('monLblFinal').innerText = finalPrice.toLocaleString();
    if(document.getElementById('monDiscountNotice')) document.getElementById('monDiscountNotice').innerHTML = noticeMsg;

    let listHtml = '';
    
    if (monState.payPlan === 'monthly' && totalBase >= 3400000) {
        let baseInstDate = monState.startDate || getShamsiDateSafe(new Date()); 
        
        // 🚀 مشکل پرش تاریخ تمدید اینجا حل شد. برای تمدید هیچ روز اضافه‌ای نمی‌بندیم.
        if (monState.txType !== 'renew' && monState.startDateIndex > 0) {
            baseInstDate = calcSimpleShamsi(baseInstDate, 0, monState.startDateIndex);
        }
        
        // تقسیم اقساط به مضرب‌های تمیز 50 هزار تومانی
        if (duration === 1) {
            let upfrontRounded = Math.ceil((finalPrice * 0.50) / 50000) * 50000; 
            let remaining = finalPrice - upfrontRounded; 
            monFinance.upfront = upfrontRounded;
            let d1 = calcSimpleShamsi(baseInstDate, 0, 10); 
            monFinance.installments.push({ due_date: d1, amount: remaining, installment_number: 1 });
            listHtml = `<li><strong style="color:var(--danger)">پیش‌پرداخت نقد:</strong> ${upfrontRounded.toLocaleString()} تومان</li><li>موعد قسط اول (${remaining.toLocaleString()} تومان): <b>${d1.replace(/-/g, '/')}</b> (۱۰ روز پس از شروع)</li>`;
        } else if (duration === 3) {
            let upfrontRounded = Math.ceil((finalPrice * 0.50) / 50000) * 50000; 
            let remaining = finalPrice - upfrontRounded; 
            monFinance.upfront = upfrontRounded;
            let d1 = calcSimpleShamsi(baseInstDate, 1, 0); 
            monFinance.installments.push({ due_date: d1, amount: remaining, installment_number: 1 });
            listHtml = `<li><strong style="color:var(--danger)">پیش‌پرداخت نقد:</strong> ${upfrontRounded.toLocaleString()} تومان</li><li>موعد قسط اول (${remaining.toLocaleString()} تومان): <b>${d1.replace(/-/g, '/')}</b> (یک ماه پس از شروع)</li>`;
        } else if (duration === 6) {
            let upfrontRounded = Math.ceil((finalPrice * 0.25) / 50000) * 50000; 
            monFinance.upfront = upfrontRounded;
            let checkAmt = Math.round((finalPrice * 0.25) / 50000) * 50000; 
            let lastCheckAmt = finalPrice - upfrontRounded - (checkAmt * 2); 
            let d1 = calcSimpleShamsi(baseInstDate, 1, 0); 
            let d2 = calcSimpleShamsi(baseInstDate, 2, 0); 
            let d3 = calcSimpleShamsi(baseInstDate, 4, 0); 
            monFinance.installments.push({ due_date: d1, amount: checkAmt, installment_number: 1 }); 
            monFinance.installments.push({ due_date: d2, amount: checkAmt, installment_number: 2 }); 
            monFinance.installments.push({ due_date: d3, amount: lastCheckAmt, installment_number: 3 }); 
            listHtml = `<li><strong style="color:var(--danger)">پیش‌پرداخت نقد:</strong> ${upfrontRounded.toLocaleString()} تومان</li><li>قسط اول (${checkAmt.toLocaleString()} تومان): <b>${d1.replace(/-/g, '/')}</b> (۱ ماه پس از شروع)</li><li>قسط دوم (${checkAmt.toLocaleString()} تومان): <b>${d2.replace(/-/g, '/')}</b> (۲ ماه پس از شروع)</li><li>قسط سوم (${lastCheckAmt.toLocaleString()} تومان): <b>${d3.replace(/-/g, '/')}</b> (۴ ماه پس از شروع)</li>`;
        } else if (duration === 9) {
            let upfrontRounded = Math.ceil((finalPrice * 0.20) / 50000) * 50000; 
            monFinance.upfront = upfrontRounded;
            let checkAmt = Math.round((finalPrice * 0.20) / 50000) * 50000; 
            let lastCheckAmt = finalPrice - upfrontRounded - (checkAmt * 3);
            let d1 = calcSimpleShamsi(baseInstDate, 1, 0); 
            let d2 = calcSimpleShamsi(baseInstDate, 2, 0); 
            let d3 = calcSimpleShamsi(baseInstDate, 4, 0); 
            let d4 = calcSimpleShamsi(baseInstDate, 6, 0);
            monFinance.installments.push({ due_date: d1, amount: checkAmt, installment_number: 1 }); 
            monFinance.installments.push({ due_date: d2, amount: checkAmt, installment_number: 2 }); 
            monFinance.installments.push({ due_date: d3, amount: checkAmt, installment_number: 3 }); 
            monFinance.installments.push({ due_date: d4, amount: lastCheckAmt, installment_number: 4 });
            listHtml = `<li><strong style="color:var(--danger)">پیش‌‌پرداخت نقد:</strong> ${upfrontRounded.toLocaleString()} تومان</li><li>قسط اول (${checkAmt.toLocaleString()} تومان): <b>${d1.replace(/-/g, '/')}</b> (۱ ماه پس از شروع)</li><li>قسط دوم (${checkAmt.toLocaleString()} تومان): <b>${d2.replace(/-/g, '/')}</b> (۲ ماه پس از شروع)</li><li>قسط سوم (${checkAmt.toLocaleString()} تومان): <b>${d3.replace(/-/g, '/')}</b> (۴ ماه پس از شروع)</li><li>قسط چهارم (${lastCheckAmt.toLocaleString()} تومان): <b>${d4.replace(/-/g, '/')}</b> (۶ ماه پس از شروع)</li>`;
        }
    } else { 
        monFinance.upfront = finalPrice; 
        listHtml = '<div style="text-align:center; color:var(--text-muted);">فاقد اقساط بعدی (تسویه کامل)</div>'; 
    }

    document.getElementById('monLblUpfront').innerText = monFinance.upfront.toLocaleString() + ' تومان';
    let payNowBig = document.getElementById('monLblPayNowBig'); if(payNowBig) payNowBig.innerText = monFinance.upfront.toLocaleString() + ' تومان';
    document.getElementById('monInstList').innerHTML = `<ul style="list-style:none; padding:0; margin:0; line-height: 2;">${listHtml}</ul>`;

    // 🚀 نمایش هوشمند شماره شبا برای مبالغ بالای 15 میلیون تومان
    let ibanBox = document.getElementById('monIbanBox');
    if (ibanBox) {
        if (monFinance.upfront >= 15000000) ibanBox.style.display = 'block';
        else ibanBox.style.display = 'none';
    }

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

    validateMonSubmit();
}

let currentMonPromoData = null; // متغیر سراسری برای نگهداری تخفیف ماهانه

async function applyMonDiscount() {
    const code = document.getElementById('monDiscountCode').value.trim().toUpperCase();
    if (!code) return; 

    document.getElementById('mainLoader').style.display = 'flex';
    try {
        const { data: promo, error } = await supabaseClient.from('promos_codes')
            .select('*')
            .eq('code', code)
            .eq('is_active', true)
            .single();

        document.getElementById('mainLoader').style.display = 'none';

        if (error || !promo) return alert('کد تخفیف نامعتبر است یا منقضی شده.');
        if (promo.target_service !== 'all' && promo.target_service !== 'monthly') return alert('این کد برای خدمات ماهانه معتبر نیست.');
        if (promo.max_uses && promo.used_count >= promo.max_uses) return alert('ظرفیت استفاده از این کد به پایان رسیده است.');

        currentMonPromoData = promo; 
        calculateMonthly(); // اعمال زنده روی فاکتور
    } catch(e) {
        document.getElementById('mainLoader').style.display = 'none';
        alert('خطا در ارتباط با سرور.');
    }
}

function handleMonFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
        document.getElementById('monUploadText').innerText = `⏳ در حال فشرده‌سازی و بهینه‌سازی...`;
        const reader = new FileReader();
        reader.onload = function(e) { 
            const img = new Image();
            img.onload = function() {
                const canvas = document.createElement('canvas'); 
                let w = img.width, h = img.height;
                const MAX_SIZE = 800; // کاهش سایز برای سرعت وحشتناک بالا
                
                if(w > h && w > MAX_SIZE) { h *= MAX_SIZE/w; w = MAX_SIZE; } 
                else if(h > MAX_SIZE) { w *= MAX_SIZE/h; h = MAX_SIZE; }
                
                canvas.width = w; canvas.height = h; 
                const ctx = canvas.getContext('2d'); 
                ctx.drawImage(img, 0, 0, w, h);
                
                monState.receiptBase64 = canvas.toDataURL('image/jpeg', 0.5).split(',')[1];
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
    let hasReceiptOrWallet = false;
    if (monState.payMethod === 'wallet') {
        hasReceiptOrWallet = (Number(currentUser.wallet_balance || 0) >= monFinance.upfront);
    } else {
        hasReceiptOrWallet = (monState.receiptBase64 !== "");
    }
    let rulesChecked = document.getElementById('monRulesCheckbox') ? document.getElementById('monRulesCheckbox').checked : true;
    document.getElementById('btnSubmitMonthly').disabled = !(hasReceiptOrWallet && rulesChecked); 
}

async function submitMonthly() {
    document.getElementById('mainLoader').style.display = 'flex';
    if(document.getElementById('loaderTxt')) document.getElementById('loaderTxt').innerText = 'در حال پردازش قرارداد...';
    
    let duration = monState.duration === 'konkur' ? monState.konkurMonths : parseInt(monState.duration);
    let baseDateStr = monState.startDate || getShamsiDateSafe(new Date()); 
    let endDateStr = calcSimpleShamsi(baseDateStr, duration, -1); 

    try {
        let invDetails = `طرح: ${monState.planType} | مدت: ${duration} ماه | شروع: ${baseDateStr}`;
        let payMethodDB = monState.payMethod === 'wallet' ? 'wallet' : (monState.payPlan === 'cash' ? 'cash' : 'monthly');
        
        const { data: invData, error: invError } = await supabaseClient.from('pan_invoices').insert([{
            phone_number: currentUser.phone_number,
            invoice_type: monState.txType === 'new' ? 'ثبت‌‌نام ماهانه' : 'تمدید ماهانه',
            total_amount: monFinance.totalBase,
            discount_amount: monFinance.discount,
            final_amount: monFinance.finalPrice,
            paid_upfront: monFinance.upfront,
            payment_method: payMethodDB,
            status: 'approved', 
            details_text: invDetails
        }]).select('id').single();
        if (invError) throw invError;

        const { error: subError } = await supabaseClient.from('pan_monthly_subs').insert([{
            invoice_id: invData.id, 
            phone_number: currentUser.phone_number, 
            plan_type: monState.planType, 
            start_date: baseDateStr, 
            end_date: endDateStr,
            status: 'active' 
        }]);
        if (subError) throw subError;

        if (monFinance.installments.length > 0 && invData) {
            let instInserts = monFinance.installments.map(inst => ({ 
                invoice_id: invData.id, 
                phone_number: currentUser.phone_number, 
                amount: inst.amount, 
                due_date: inst.due_date, 
                installment_number: inst.installment_number, 
                status: 'pending_upload' 
            }));
            await supabaseClient.from('pan_installments').insert(instInserts);
        }

        if (monState.isFirstMonthly && currentUser.invited_by) {
            await rewardReferrer(
                currentUser.invited_by, 
                150000, 
                `یکی از دوستان شما با کد معرف شما اولین رزرو ماهانه خود را ثبت کرد. مبلغ ۱۵۰,۰۰۰ تومان به کیف پول شما اضافه شد!`
            );
        }

        if (monState.payMethod === 'wallet') {
            await supabaseClient.from('users').update({ wallet_balance: Number(currentUser.wallet_balance || 0) - monFinance.upfront }).eq('phone_number', currentUser.phone_number);
        }
        
        const { data: srv } = await supabaseClient.from('services').select('capacity').eq('type', monState.planType).single();
        if (srv && srv.capacity > 0) await supabaseClient.from('services').update({ capacity: srv.capacity - 1 }).eq('type', monState.planType);

        if (currentMonPromoData) {
            await supabaseClient.from('promos_codes').update({ used_count: currentMonPromoData.used_count + 1 }).eq('id', currentMonPromoData.id);
        }

        // 🚀 ارسال بی‌نقص رسید به بله (بدون هدرهای محدودکننده CORS)
        const gasUrl = "https://script.google.com/macros/s/AKfycbz2CXGMkNTKY8Pn--zI4R2l-we9f6jjaCXxYpljlO5trI4IcFxcO46bYm_ogPOHVAm5/exec";
        const payTypeFa = monState.payMethod === 'wallet' ? 'کیف پول' : 'کارت به کارت';
        const payload = {
            text: `🚨 ثبت‌نام/تمدید ماهانه 🚨\n👤 نام: ${currentUser.full_name}\n📱 موبایل: ${currentUser.phone_number}\n📦 طرح: ${monState.planType} (${duration} ماهه)\n💰 پرداختی الان: ${monFinance.upfront.toLocaleString()} تومان\n💳 روش: ${payTypeFa}`,
            image_base64: monState.payMethod === 'card' ? monState.receiptBase64 : ""
        };
        fetch(gasUrl, { 
            method: 'POST', 
            mode: 'no-cors', 
            body: JSON.stringify(payload) 
        }).catch(err => console.log(err));

        document.getElementById('mainLoader').style.display = 'none';
        
        // ساخت مودال اختصاصی با لینک‌های قابل کپی و لیبل‌های واضح
        const successModalHtml = `
        <div class="modal-overlay" id="successChannelModal" style="display: flex; align-items: center; justify-content: center; z-index: 10000; background: rgba(0,0,0,0.8); backdrop-filter: blur(8px);">
            <div class="glass-panel" style="width: 90%; max-width: 400px; padding: 25px 20px; border-radius: 28px; text-align: center; border: 1px solid var(--success);">
                <div style="font-size: 50px; margin-bottom: 10px;">🎉</div>
                <h3 style="color: var(--success); margin-bottom: 10px; font-weight: 900;">ثبت‌نام با موفقیت انجام شد!</h3>
                <p style="font-size: 13px; color: var(--text-muted); margin-bottom: 20px; line-height: 1.8; font-weight: bold; text-align: justify;">
                    قرارداد شما فعال شد. لطفاً لینک‌های زیر را کپی کرده و در پیام‌رسان مربوطه جای‌گذاری (Paste) کنید تا عضو کانال خانواده راهینو شوید:
                </p>
                
                <div style="display: flex; flex-direction: column; margin-bottom: 25px;">
                    
                    <!-- باکس لینک تلگرام -->
                    <div style="text-align: right; margin-bottom: 5px; font-size: 12px; font-weight: bold; color: #2AABEE;">✈️ کانال تلگرام راهینو:</div>
                    <div style="background: rgba(42, 171, 238, 0.1); border: 1px dashed #2AABEE; padding: 12px; border-radius: 16px; display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 15px;">
                        <span style="font-size: 12px; font-weight: bold; color: #2AABEE; direction: ltr; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">https://t.me/+d8Ijxk_im8M3ZmQ0</span>
                        <button onclick="copyToClipboard('https://t.me/+d8Ijxk_im8M3ZmQ0')" style="background: #2AABEE; color: white; border: none; padding: 8px 15px; border-radius: 10px; font-size: 11px; font-weight: bold; cursor: pointer; flex-shrink: 0;">کپی لینک</button>
                    </div>
                    
                    <!-- باکس لینک بله -->
                    <div style="text-align: right; margin-bottom: 5px; font-size: 12px; font-weight: bold; color: #10b981;">💬 کانال بله راهینو:</div>
                    <div style="background: rgba(16, 185, 129, 0.1); border: 1px dashed #10b981; padding: 12px; border-radius: 16px; display: flex; align-items: center; justify-content: space-between; gap: 10px;">
                        <span style="font-size: 12px; font-weight: bold; color: #10b981; direction: ltr; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">https://ble.ir/join/CghLcw3J4k</span>
                        <button onclick="copyToClipboard('https://web.bale.ai/ble.ir/join/CghLcw3J4k')" style="background: #10b981; color: white; border: none; padding: 8px 15px; border-radius: 10px; font-size: 11px; font-weight: bold; cursor: pointer; flex-shrink: 0;">کپی لینک</button>
                    </div>

                </div>
                <button class="btn-action" style="width: 100%; border-radius: 16px; background: transparent;" onclick="window.location.reload()">بستن و ورود به داشبورد</button>
            </div>
        </div>`;
        document.body.insertAdjacentHTML('beforeend', successModalHtml);
    } catch (e) { 
        console.error(e);
        document.getElementById('mainLoader').style.display = 'none'; 
        alert('خطا در ثبت پایگاه داده.'); 
    }
}
// ==========================================
// 📅 رزرو روزانه (موتور جدید با بررسی ظرفیت)
// ==========================================
async function initializeBookingEngine() {
    window14Dates = [];
    for(let i=0; i<14; i++) {
        let d = new Date(); d.setDate(d.getDate() + i);
        const parts = new Intl.DateTimeFormat('fa-IR', { weekday: 'long' }).formatToParts(d);
        // استفاده از فرمت استاندارد با خط تیره (مثل دیتابیس) در کل برنامه
        let formattedDate = getShamsiDateSafe(d).replace(/\//g, '-'); 
        window14Dates.push({ 
            date: formattedDate, 
            dayName: parts.find(p => p.type === 'weekday').value 
        });
    }
    
    let justDates = window14Dates.map(d => d.date);
    
    try {
        // جستجو در دیتابیس مستقیماً با فرمت دارای خط تیره
        const { data: capData, error } = await supabaseClient.from('pan_daily_capacity').select('*').in('target_date', justDates);
        if (error) console.error("Capacity Fetch Error:", error);
        
        dailyCapacities = {};
        if (capData) {
            // ذخیره در دیکشنری دقیقاً با همان فرمت دیتابیس (بدون تبدیل اضافه)
            capData.forEach(d => { dailyCapacities[d.target_date] = d; });
        }
    } catch(e) { console.error("خطا در دریافت ظرفیت", e); }
    
    renderCalendar();
}

function renderCalendar() {
    const grid = document.getElementById('calendarGrid'); grid.innerHTML = ''; selectedNewDates = [];
    window14Dates.forEach(d => {
        // حالا کلید دقیقاً با کلید دیکشنری یکی است
        let capInfo = dailyCapacities[d.date] || { available_capacity: 4 }; 
        let available = capInfo.available_capacity;
        
        // چک کردن تاریخچه کاربر با تبدیل یکپارچه به خط تیره
        let isPastBooked = globalUserPastReservations.some(past => past.replace(/\//g, '-') === d.date);
        
        let cardClass = 'cal-card'; let onclickEvent = ''; 
        let statusText = `${available} نفر ظرفیت`;

        if (isPastBooked) { cardClass += ' past-booked'; statusText = 'رزرو شما ✅'; } 
        else if (available <= 0) { cardClass += ' full'; statusText = 'تکمیل ❌'; } 
        else { cardClass += ' available'; onclickEvent = `onclick="toggleDate('${d.date}', this)"`; }

        // فقط برای نمایش به کاربر، خط تیره‌ها را به اسلش تبدیل می‌کنیم
        let displayDateStr = d.date.replace(/-/g, '/').substring(5);
        
        grid.innerHTML += `<div class="${cardClass}" ${onclickEvent}><div class="cal-day">${d.dayName}</div><div class="cal-date">${displayDateStr}</div><div class="cal-cap">${statusText}</div></div>`;
    });
    updatePricing();
}

function toggleDate(dateStr, element) {
    if(element.classList.contains('selected')) { 
        element.classList.remove('selected'); 
        selectedNewDates = selectedNewDates.filter(d => d !== dateStr); 
    } else { 
        element.classList.add('selected'); 
        selectedNewDates.push(dateStr); 
    }
    updatePricing(); 
}

function updatePricing() {
    // مقایسه با تاریخچه‌های رزرو شده با در نظر گرفتن خط تیره
    let activeBookedDaysInWindow = globalUserPastReservations.filter(pastDate => 
        window14Dates.some(w => w.date === pastDate.replace(/\//g, '-'))
    ).length; 

    let newSelectedDays = selectedNewDates.length; 
    let totalD = activeBookedDaysInWindow + newSelectedDays;
    
    // محاسبه پایه
    let applicableRate = (totalD === 0) ? 0 : (totalD >= 8 ? 150 : pricingTiers[totalD]);
    let payableAmount = (newSelectedDays * applicableRate) * 1000; 
    let discountMsg = "";

    let isFirstEverDaily = (globalUserPastReservations.length === 0);
    
    // ۱. هدیه ۵۰ تومانی یا تخفیف پلکانی
    if (isFirstEverDaily && newSelectedDays > 0) {
        payableAmount -= 50000;
        discountMsg += `🎁 ۵۰,۰۰۰ تومان هدیه اولین رزرو سیستم اعمال شد!<br>`;
    } else if (activeBookedDaysInWindow > 0 && newSelectedDays > 0) {
        discountMsg += `🎉 روزهای جدید با تخفیف (نرخ ${applicableRate} تومانی) محاسبه شد!<br>`;
    }

    // ۲. هدیه ۲۰ تومانی معرف
    let referralDiscountAmount = 0;
    if (isFirstEverDaily && currentUser.invited_by && newSelectedDays > 0) { 
        referralDiscountAmount = 20000; 
        discountMsg += `🎁 ۲۰,۰۰۰ تومان هدیه ورود با کد معرف کسر شد!<br>`; 
    }
    payableAmount -= referralDiscountAmount;

    // ۳. اعمال دقیق و زنده کد تخفیف روی مبلغ به دست آمده
    if (currentPromoData && payableAmount > 0) { 
        let calculatedPromoDiscount = 0;
        if (currentPromoData.discount_type === 'percent') {
            calculatedPromoDiscount = payableAmount * (currentPromoData.discount_value / 100);
        } else {
            calculatedPromoDiscount = currentPromoData.discount_value;
        }
        payableAmount -= calculatedPromoDiscount; 
        discountMsg += `✅ کد تخفیف اعمال شد.<br>`; 
    }
    
    finalAmountToPay = Math.max(0, payableAmount);

    document.getElementById('newDaysCountTxt').innerText = `${newSelectedDays} روز`; 
    document.getElementById('pastDaysCountTxt').innerText = `${activeBookedDaysInWindow} روز`;
    document.getElementById('rateAppliedTxt').innerText = `${applicableRate} هزار تومان`; 
    document.getElementById('finalPriceTxt').innerText = finalAmountToPay.toLocaleString();
    
    let noticeEl = document.getElementById('discountNotice');
    if(noticeEl) noticeEl.innerHTML = discountMsg;

    let walletBadge = document.getElementById('walletStatusBadge');
    if (walletBadge) {
        if (selectedPayMethod === 'wallet' && Number(currentUser.wallet_balance || 0) < finalAmountToPay) { 
            walletBadge.style.color = 'var(--danger)'; walletBadge.innerText = 'موجودی ناکافی'; 
        } else { 
            walletBadge.style.color = 'var(--text-muted)'; walletBadge.innerText = `موجودی: ${Number(currentUser.wallet_balance || 0).toLocaleString()}`; 
        }
    }
    validateSubmitButton();
}

function selectPayMethod(method) {
    selectedPayMethod = method;
    document.getElementById('lblCard').classList.remove('active'); document.getElementById('lblWallet').classList.remove('active');
    if (method === 'card') { document.getElementById('lblCard').classList.add('active'); document.getElementById('paymentInfoBox').style.display = 'block'; } 
    else { document.getElementById('lblWallet').classList.add('active'); document.getElementById('paymentInfoBox').style.display = 'none'; }
    updatePricing();
}



let currentPromoData = null; // نگهداری اطلاعات کد تخفیف برای محاسبه زنده

async function applyDiscount() {
    const code = document.getElementById('discountCode').value.trim().toUpperCase();
    if (!code) return; // پیام موفقیت یا خطا فقط اگر کدی وارد شده باشد

    let newSelectedDays = selectedNewDates.length; 
    if(newSelectedDays === 0) return alert('ابتدا روزهای مورد نظر خود را از تقویم انتخاب کنید.');

    document.getElementById('mainLoader').style.display = 'flex';
    try {
        const { data: promo, error } = await supabaseClient.from('promos_codes')
            .select('*')
            .eq('code', code)
            .eq('is_active', true)
            .single();

        document.getElementById('mainLoader').style.display = 'none';

        if (error || !promo) return alert('کد تخفیف نامعتبر است یا منقضی شده.');
        if (promo.target_service !== 'all' && promo.target_service !== 'daily') return alert('این کد برای خدمات روزانه معتبر نیست.');
        if (promo.max_uses && promo.used_count >= promo.max_uses) return alert('ظرفیت استفاده از این کد به پایان رسیده است.');

        // ذخیره اطلاعات خام کد تخفیف تا سیستم خودش روی مبلغ نهایی حساب کند
        currentPromoData = promo; 
        updatePricing(); 
        // الرت روی اعصاب حذف شد! پیام فقط اون پایین نوشته میشه.
    } catch(e) {
        document.getElementById('mainLoader').style.display = 'none';
        alert('خطا در ارتباط با سرور.');
    }
}

function handleFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
        document.getElementById('uploadText').innerText = `⏳ در حال فشرده‌سازی و بهینه‌سازی...`;
        const reader = new FileReader();
        reader.onload = function(e) { 
            const img = new Image();
            img.onload = function() {
                const canvas = document.createElement('canvas'); 
                let w = img.width, h = img.height;
                const MAX_SIZE = 800; // کاهش سایز برای سرعت وحشتناک بالا
                
                if(w > h && w > MAX_SIZE) { h *= MAX_SIZE/w; w = MAX_SIZE; } 
                else if(h > MAX_SIZE) { w *= MAX_SIZE/h; h = MAX_SIZE; }
                
                canvas.width = w; canvas.height = h; 
                const ctx = canvas.getContext('2d'); 
                ctx.drawImage(img, 0, 0, w, h);
                
                // افت کیفیت روی 0.5 برای سبک شدن استثنایی بدون افت ظاهری
                base64Image = canvas.toDataURL('image/jpeg', 0.5).split(',')[1];
                document.getElementById('uploadText').innerText = `✅ فیش پرداختی ضمیمه شد`;
                document.getElementById('uploadBox').style.borderColor = "var(--success)"; 
                document.getElementById('uploadBox').style.background = "rgba(16, 185, 129, 0.05)";
                validateSubmitButton(); // باز شدن قطعی دکمه
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }
}
function validateSubmitButton() { 
    const btn = document.getElementById('btnSubmitBooking');
    let rulesCheckbox = document.getElementById('rulesCheckbox');
    let isRulesChecked = rulesCheckbox ? rulesCheckbox.checked : true;
    
    let isValid = (selectedNewDates.length > 0) && isRulesChecked;

    if (selectedPayMethod === 'wallet') {
        // تبدیل صریح به عدد (دلیل اصلی گیر کردن دکمه کیف پول)
        isValid = isValid && (Number(currentUser.wallet_balance || 0) >= finalAmountToPay);
    } else {
        isValid = isValid && (base64Image !== "");
    }
    btn.disabled = !isValid; 
}

async function submitBooking() {
    document.getElementById('mainLoader').style.display = 'flex'; 
    if(document.getElementById('loaderTxt')) document.getElementById('loaderTxt').innerText = 'در حال ثبت رزرو...';
    try {
        let dbSelectedDates = selectedNewDates.map(d => d.replace(/\//g, '-'));
        
        const { data: capCheck } = await supabaseClient.from('pan_daily_capacity').select('*').in('target_date', dbSelectedDates);
        let isConflict = false;
        if(capCheck) capCheck.forEach(c => { if(c.available_capacity <= 0) isConflict = true; });
        if (isConflict) { 
            document.getElementById('mainLoader').style.display = 'none'; 
            alert('⚠️ ظرفیت یکی از روزها همین الان توسط شخص دیگری پر شد!'); 
            await initializeBookingEngine(); 
            return; 
        }

        const { error } = await supabaseClient.from('pan_reservations').insert([{
            phone_number: currentUser.phone_number, 
            reserved_dates: JSON.stringify(dbSelectedDates),
            paid_amount: finalAmountToPay, 
            receipt_base64: selectedPayMethod === 'card' ? base64Image : null,
        }]);
        if (error) throw error;

        for (let dateStr of selectedNewDates) {
            let currentAvailable = dailyCapacities[dateStr]?.available_capacity ?? 4; 
            await supabaseClient.from('pan_daily_capacity').upsert({ target_date: dateStr.replace(/\//g, '-'), available_capacity: currentAvailable - 1 });
        }

        let isFirstEverDaily = (globalUserPastReservations.length === 0);
        if (isFirstEverDaily && currentUser.invited_by) await rewardReferrer(currentUser.invited_by, 50000, `یکی از دوستان شما با کد معرف شما اولین رزرو روزانه خود را ثبت کرد. مبلغ ۵۰,۰۰۰ تومان به کیف پول شما اضافه شد!`);

        if (selectedPayMethod === 'wallet') {
            await supabaseClient.from('users').update({ wallet_balance: currentUser.wallet_balance - finalAmountToPay }).eq('phone_number', currentUser.phone_number);
        }

        if (currentPromoData) {
            await supabaseClient.from('promos_codes').update({ used_count: currentPromoData.used_count + 1 }).eq('id', currentPromoData.id);
        }

        // 🚀 شلیک به سرور گوگل به صورت Fire-and-Forget (بدون متوقف کردن کاربر)
        const gasUrl = "https://script.google.com/macros/s/AKfycbz2CXGMkNTKY8Pn--zI4R2l-we9f6jjaCXxYpljlO5trI4IcFxcO46bYm_ogPOHVAm5/exec"; 
        const payTypeFa = selectedPayMethod === 'wallet' ? 'کیف پول' : 'کارت به کارت';
        const payload = {
            text: `🚨 رزرو جدید روزانه 🚨\n👤 نام: ${currentUser.full_name}\n📱 موبایل: ${currentUser.phone_number}\n📅 روزهای رزرو: ${selectedNewDates.join(' ، ')}\n💰 پرداختی: ${finalAmountToPay.toLocaleString()} تومان\n💳 روش: ${payTypeFa}`,
            image_base64: selectedPayMethod === 'card' ? base64Image : ""
        };
        fetch(gasUrl, { method: 'POST', body: JSON.stringify(payload) }).catch(err => console.log(err));

        document.getElementById('mainLoader').style.display = 'none';
        alert('🎉 رزرو با موفقیت انجام شد.\n⏰ ما از 7 صبح تا 10 شب هستیم.'); 
        window.location.reload(); 
    } catch (e) { 
        document.getElementById('mainLoader').style.display = 'none'; 
        alert('خطای ارتباط با دیتابیس.'); 
    }
}
// ==========================================
// ❌ توابع لغو قرارداد (ارسال درخواست)
// ==========================================

function calcShamsiPassedDays(startDateStr) {
    if (!startDateStr) return 0;
    let startParts = startDateStr.replace(/\//g, '-').split('-');
    let todayStr = getShamsiDateSafe(new Date());
    let todayParts = todayStr.replace(/\//g, '-').split('-');
    if (startParts.length !== 3 || todayParts.length !== 3) return 0;
    
    let startDays = (parseInt(startParts[0]) * 365) + (parseInt(startParts[1]) * 30) + parseInt(startParts[2]);
    let todayDays = (parseInt(todayParts[0]) * 365) + (parseInt(todayParts[1]) * 30) + parseInt(todayParts[2]);
    
    return todayDays - startDays; 
}

async function openCancellation() {
    if (!activePansion || !activePansion.all_subs) return;
    
    document.getElementById('mainLoader').style.display = 'flex';
    if(document.getElementById('loaderTxt')) document.getElementById('loaderTxt').innerText = 'در حال محاسبه دقیق حساب‌ها...';

    try {
        let totalPaid = 0;
        let totalDeduction = 0;
        let deductionDetailsHTML = '';

        for (let sub of activePansion.all_subs) {
            let pType = sub.plan_type;
            let activePlanData = availablePansionPlans.find(p => p.type === pType) || { base_price: 3600000 };
            let basePrice = activePlanData.base_price;

            const { data: inv } = await supabaseClient.from('pan_invoices').select('paid_upfront').eq('id', sub.invoice_id).single();
            let paidUpfront = inv ? Number(inv.paid_upfront || 0) : 0;

            const { data: insts } = await supabaseClient.from('pan_installments').select('amount').eq('invoice_id', sub.invoice_id).in('status', ['paid', 'approved']);
            let paidInstSum = 0;
            if (insts) paidInstSum = insts.reduce((sum, i) => sum + Number(i.amount || 0), 0);

            let subTotalPaid = paidUpfront + paidInstSum;
            totalPaid += subTotalPaid;

            let rawDiff = calcShamsiPassedDays(sub.start_date);
            let subDeduction = 0;
            let deductionText = '';

            if (rawDiff < 0) {
                subDeduction = 0;
                deductionText = `<span style="color: var(--success);">شروع نشده (۰ تومان کسری)</span>`;
            } else if (rawDiff <= 3) {
                let daysToCharge = rawDiff === 0 ? 1 : rawDiff;
                subDeduction = daysToCharge * 200000;
                deductionText = `${subDeduction.toLocaleString()} تومان (استفاده ${daysToCharge} روزه)`;
            } else {
                let monthsUsed = Math.ceil(rawDiff / 30);
                subDeduction = monthsUsed * basePrice;
                deductionText = `${subDeduction.toLocaleString()} تومان (استفاده ${monthsUsed} ماهه)`;
            }
            totalDeduction += subDeduction;

            deductionDetailsHTML += `
                <div style="background: rgba(0,0,0,0.2); padding: 12px; border-radius: 12px; margin-bottom: 10px; border: 1px dashed var(--glass-border);">
                    <div style="display:flex; justify-content:space-between; margin-bottom: 8px; font-size: 12px;">
                        <span style="color: var(--text-muted);">شروع: ${sub.start_date.replace(/-/g,'/')}</span>
                        <strong style="color: var(--text-main);">گذشته: ${rawDiff < 0 ? 0 : rawDiff} روز</strong>
                    </div>
                    <div style="display:flex; justify-content:space-between; font-size: 13px;">
                        <span>پرداختی: <b style="color:var(--success)">${subTotalPaid.toLocaleString()}</b></span>
                        <span>کسری: <b style="color:var(--warning)">${subDeduction.toLocaleString()}</b></span>
                    </div>
                </div>
            `;
        }

        let refund = totalPaid - totalDeduction;
        
        // 🚀 ذخیره اطلاعات محاسبه شده در حافظه مرورگر برای ثبت در دیتابیس
        window.pendingCancellationData = {
            totalPaid: totalPaid,
            totalDeduction: totalDeduction,
            refundAmount: refund > 0 ? refund : 0
        };

        let refundText = refund > 0 ? `${refund.toLocaleString()} تومان` : `0 تومان (بدهی: ${Math.abs(refund).toLocaleString()} تومان)`;

        let html = `
            <div style="margin-bottom: 15px;">
                ${deductionDetailsHTML}
            </div>
            <div style="background: rgba(15, 23, 42, 0.4); padding: 15px; border-radius: 14px; border: 1px solid var(--glass-border);">
                <div class="price-row" style="margin-bottom: 12px; font-size:13px;"><span>جمع کل واریزی شما:</span><strong style="color:var(--success);">${totalPaid.toLocaleString()} تومان</strong></div>
                <div class="price-row" style="margin-bottom: 12px; font-size:13px;"><span>جمع کل مبالغ کسر شده:</span><strong style="color:var(--warning);">${totalDeduction.toLocaleString()} تومان</strong></div>
                <div class="price-row" style="margin-top: 15px; font-size: 14px; background: rgba(0, 0, 0, 0.4); padding: 15px; border-radius: 12px; border: 1px dashed var(--primary);">
                    <span>مبلغ نهایی قابل عودت:</span><strong style="color:var(--primary); direction:ltr; font-size: 16px;">${refundText}</strong>
                </div>
            </div>
            <div style="font-size:11px; color:var(--text-muted); text-align:justify; line-height: 1.8; background: rgba(245, 158, 11, 0.1); padding: 12px; border-radius: 12px; border: 1px solid rgba(245, 158, 11, 0.2); margin-top: 15px;">
                <strong style="color:var(--warning);">⚠️ توجه:</strong> با تایید این بخش، قرارداد شما فوراً لغو نمی‌شود. محاسبات فوق برای مدیریت ارسال شده و پس از بررسی و توافق نهایی، این مبلغ به کیف پول شما واریز و میز شما آزاد می‌گردد.
            </div>
        `;
        
        document.getElementById('cancelModalBody').innerHTML = html;
        document.getElementById('mainLoader').style.display = 'none';
        document.getElementById('cancelModal').style.display = 'flex';
    } catch(e) {
        console.error(e);
        document.getElementById('mainLoader').style.display = 'none';
        alert('خطا در ارتباط با دیتابیس برای محاسبه حساب‌ها.');
    }
}

function closeCancelModal() {
    document.getElementById('cancelModal').style.display = 'none';
}

async function submitCancellation() {
    document.getElementById('mainLoader').style.display = 'flex';
    if(document.getElementById('loaderTxt')) document.getElementById('loaderTxt').innerText = 'در حال ارسال درخواست...';

    try {
        let cancelData = window.pendingCancellationData;

        // ۱. ثبت درخواست لغو در جدول جدید (قراردادها دست‌نخورده باقی می‌‌مانند)
        const { error } = await supabaseClient.from('cancellation_requests').insert([{
            phone_number: currentUser.phone_number,
            refund_amount: cancelData.refundAmount,
            total_paid: cancelData.totalPaid,
            total_deduction: cancelData.totalDeduction,
            status: 'pending'
        }]);
        if (error) throw error;
        
        // ۲. ارسال پیام اطلاع‌رسانی به خود کاربر
        await supabaseClient.from('messages').insert([{
            phone_number: currentUser.phone_number, 
            title: '⏳ ثبت درخواست لغو قرارداد',
            body: 'درخواست لغو قرارداد شما در سیستم ثبت شد. وضعیت قرارداد شما همچنان فعال است. پس از بررسی درخواست توسط مدیریت و انجام هماهنگی‌های لازم، مبلغ محاسبه شده به کیف پول شما عودت داده خواهد شد.', 
            is_read: false, 
            created_at: new Date().toISOString()
        }]);

        // ۳. 🚀 شلیک پیام به ربات تلگرام/بله مدیریت
        const gasUrl = "https://script.google.com/macros/s/AKfycbz2CXGMkNTKY8Pn--zI4R2l-we9f6jjaCXxYpljlO5trI4IcFxcO46bYm_ogPOHVAm5/exec";
        const payload = {
            text: `⚠️ درخواست لغو قرارداد ⚠️\n👤 نام: ${currentUser.full_name}\n📱 موبایل: ${currentUser.phone_number}\n💸 مبلغ عودت محاسبه شده: ${cancelData.refundAmount.toLocaleString()} تومان\n\n(در پنل ادمین جهت تایید نهایی موجود است)`
        };
        fetch(gasUrl, { method: 'POST', mode: 'no-cors', body: JSON.stringify(payload) }).catch(e => console.log(e));

        document.getElementById('mainLoader').style.display = 'none';
        alert('درخواست لغو با موفقیت برای مدیریت ارسال شد.');
        window.location.reload();
    } catch(e) {
        console.error(e);
        document.getElementById('mainLoader').style.display = 'none';
        alert('خطا در ثبت درخواست.');
    }
}

async function validateAndApplyDiscount(code, serviceType, totalBaseAmount) {
    if (!code) return { success: false, msg: 'کد تخفیف وارد نشده است.' };
    
    try {
        // جستجو در جدول promos_codes
        const { data: promo, error } = await supabaseClient.from('promos_codes')
            .select('*')
            .eq('code', code)
            .eq('is_active', true)
            .single();

        if (error || !promo) return { success: false, msg: 'کد تخفیف نامعتبر است یا وجود ندارد.' };
        
        // بررسی نوع سرویس (روزانه، ماهانه یا همه)
        if (promo.target_service !== 'all' && promo.target_service !== serviceType) {
            return { success: false, msg: 'این کد تخفیف برای این نوع خدمات معتبر نیست.' };
        }
        
        // بررسی ظرفیت استفاده
        if (promo.max_uses && promo.used_count >= promo.max_uses) {
            return { success: false, msg: 'ظرفیت این کد تخفیف به پایان رسیده است.' };
        }
        
        // بررسی تاریخ انقضا
        if (promo.valid_until && new Date() > new Date(promo.valid_until)) {
            return { success: false, msg: 'این کد تخفیف منقضی شده است.' };
        }

        // محاسبه مبلغ نهایی تخفیف
        let calculatedDiscount = 0;
        if (promo.discount_type === 'percent') {
            calculatedDiscount = totalBaseAmount * (promo.discount_value / 100);
        } else {
            calculatedDiscount = promo.discount_value;
        }

        return { success: true, discountAmount: calculatedDiscount, promoId: promo.id };
    } catch (e) {
        console.error("Discount Error:", e);
        return { success: false, msg: 'خطا در ارتباط با دیتابیس کدهای تخفیف.' };
    }
}

// ==========================================
// 💰 امور مالی
// ==========================================
function openWithdrawModal() { document.getElementById('withdrawModal').style.display = 'flex'; }
function closeWithdrawModal() { document.getElementById('withdrawModal').style.display = 'none'; }
async function submitWithdraw() {
    const card = document.getElementById('withdrawCard').value.trim(); 
    const accHolder = document.getElementById('withdrawName').value.trim();
    const amount = parseInt(document.getElementById('withdrawAmount').value);
    
    // دریافت شماره موبایل به صورت خودکار از سشن کاربر
    const userPhone = currentUser.phone_number; 

    if(!card || card.length !== 16 || !accHolder || !amount) {
        return alert('اطلاعات نامعتبر است. لطفاً شماره کارت، نام و مبلغ را به درستی وارد کنید.');
    }
    if(amount > currentUser.wallet_balance || amount < 50000) {
        return alert('مبلغ درخواستی نامعتبر است (موجودی ناکافی یا کمتر از ۵۰ هزار تومان).');
    }

    document.getElementById('mainLoader').style.display = 'flex';
    if(document.getElementById('loaderTxt')) document.getElementById('loaderTxt').innerText = 'در حال ثبت درخواست و کسر از کیف پول...';

    try {
        // ۱. ثبت درخواست در دیتابیس
        const { error: insertError } = await supabaseClient.from('withdraw_requests').insert([{
            student_nid: userPhone, 
            amount: amount,
            card_number: card,
            account_holder: accHolder,
            shaba_number: '', 
            status: 'pending' 
        }]);
        if (insertError) throw insertError;

        // ۲. کسر آنی از کیف پول در دیتابیس
        const newBalance = Number(currentUser.wallet_balance) - amount;
        const { error: updateError } = await supabaseClient.from('users')
            .update({ wallet_balance: newBalance })
            .eq('phone_number', userPhone);
        if (updateError) throw updateError;

        alert('✅ درخواست برداشت ثبت و مبلغ از کیف پول شما کسر شد.'); 
        document.getElementById('mainLoader').style.display = 'none'; 
        closeWithdrawModal();
        window.location.reload(); 
    } catch (e) {
        console.error(e);
        document.getElementById('mainLoader').style.display = 'none'; 
        alert('خطا در ثبت درخواست. لطفاً دوباره تلاش کنید.');
    }
}

// ==========================================
// 💰 مدیریت و پرداخت اقساط
// ==========================================
let instPayMethod = 'card'; // پیش‌فرض روش پرداخت قسط

function openInstallmentModal(id, amount) { 
    currentInstallmentId = id; 
    currentInstallmentAmount = amount; 
    instBase64Image = "";
    
    document.getElementById('instPayAmount').innerText = `${amount.toLocaleString()} تومان`; 
    document.getElementById('installmentModal').style.display = 'flex';
    
    // ریست کردن ظاهر آپلودر عکس
    let uploadText = document.getElementById('instUploadText');
    let uploadBox = document.getElementById('instUploadBox');
    if(uploadText) uploadText.innerText = 'آپلود رسید واریز';
    if(uploadBox) {
        uploadBox.style.borderColor = 'var(--border)';
        uploadBox.style.background = 'var(--bg-color)';
    }
    
    selectInstPayMethod('card'); 
}

function closeInstallmentModal() { 
    document.getElementById('installmentModal').style.display = 'none'; 
}

// انتخاب روش پرداخت برای قسط
function selectInstPayMethod(method) {
    instPayMethod = method;
    let btnCard = document.getElementById('btnInstCard');
    let btnWallet = document.getElementById('btnInstWallet');
    let cardSection = document.getElementById('instCardSection');
    let walletBadge = document.getElementById('instWalletStatusBadge');
    
    if (btnCard && btnWallet) {
        // ریست استایل دکمه‌ها
        btnCard.className = 'btn btn-outline';
        btnWallet.className = 'btn btn-outline';
        
        if (method === 'card') {
            btnCard.className = 'btn btn-primary';
            cardSection.style.display = 'block';
            walletBadge.innerText = '';
        } else {
            btnWallet.className = 'btn btn-primary';
            cardSection.style.display = 'none';
            
            // بررسی موجودی کیف پول
            let wBal = Number(currentUser.wallet_balance || 0);
            if (wBal < currentInstallmentAmount) {
                walletBadge.style.color = 'var(--danger)'; 
                walletBadge.innerText = `موجودی ناکافی (موجودی شما: ${wBal.toLocaleString()} تومان)`;
            } else {
                walletBadge.style.color = 'var(--success)'; 
                walletBadge.innerText = `موجودی کافی است (کسر: ${currentInstallmentAmount.toLocaleString()} تومان)`;
            }
        }
    }
    validateInstSubmit();
}

// کپی شماره کارت اختصاصی برای مودال اقساط
function copyCardInst(btnElement) {
    navigator.clipboard.writeText('6219861810380484').then(() => {
        const originalText = btnElement.innerHTML;
        btnElement.innerHTML = '✅ کپی شد!';
        btnElement.style.background = 'var(--success)';
        btnElement.style.color = 'white';
        btnElement.style.borderColor = 'var(--success)';
        
        setTimeout(() => {
            btnElement.innerHTML = originalText;
            btnElement.style.background = 'transparent';
            btnElement.style.color = 'var(--text-muted)';
            btnElement.style.borderColor = 'var(--border)';
        }, 2000);
    });
}

// فشرده‌سازی عکس فیش قسط (مشابه رزرو روزانه و ماهانه)
function handleInstFileSelect(event) {
    const file = event.target.files[0];
    if (file) {
        document.getElementById('instUploadText').innerText = `⏳ در حال فشرده‌سازی...`;
        const reader = new FileReader();
        reader.onload = function(e) { 
            const img = new Image(); 
            img.onload = function() {
                const canvas = document.createElement('canvas'); 
                let w = img.width, h = img.height;
                const MAX_SIZE = 800; // فشرده‌سازی شدید و بهینه
                if(w > h && w > MAX_SIZE) { h *= MAX_SIZE/w; w = MAX_SIZE; } 
                else if(h > MAX_SIZE) { w *= MAX_SIZE/h; h = MAX_SIZE; }
                canvas.width = w; canvas.height = h; 
                const ctx = canvas.getContext('2d'); 
                ctx.drawImage(img, 0, 0, w, h);
                instBase64Image = canvas.toDataURL('image/jpeg', 0.5).split(',')[1];
                document.getElementById('instUploadText').innerText = `✅ فیش آماده ارسال`; 
                document.getElementById('instUploadBox').style.borderColor = 'var(--success)';
                document.getElementById('instUploadBox').style.background = 'rgba(16, 185, 129, 0.05)';
                validateInstSubmit();
            }; 
            img.src = e.target.result;
        }; 
        reader.readAsDataURL(file);
    }
}

// ولیدیشن باز شدن دکمه پرداخت قسط
function validateInstSubmit() {
    let btn = document.getElementById('btnSubmitInst');
    if (!btn) return;
    
    if (instPayMethod === 'wallet') {
        btn.disabled = (Number(currentUser.wallet_balance || 0) < currentInstallmentAmount);
    } else {
        btn.disabled = (instBase64Image === "");
    }
}

// ثبت نهایی پرداخت قسط و شلیک به بله
async function submitInstallment() {
    document.getElementById('mainLoader').style.display = 'flex';
    if(document.getElementById('loaderTxt')) document.getElementById('loaderTxt').innerText = 'در حال پرداخت قسط...';
    
    try {
        // ۱. کسر از کیف پول (در صورت انتخاب این روش)
        if (instPayMethod === 'wallet') {
            let newBalance = Number(currentUser.wallet_balance || 0) - currentInstallmentAmount;
            const { error: wError } = await supabaseClient.from('users').update({ wallet_balance: newBalance }).eq('phone_number', currentUser.phone_number);
            if(wError) throw wError;
        } 
        
        // ۲. آپدیت وضعیت قسط به پرداخت شده (بدون ارسال عکس فیش به دیتابیس برای جلوگیری از ارور 400)
        const { error } = await supabaseClient.from('pan_installments')
            .update({ status: 'paid' }) 
            .eq('id', currentInstallmentId);
        if(error) throw error;

        // ۳. 🚀 ارسال آنی عکس فیش و اطلاعات به ربات بله
        const gasUrl = "https://script.google.com/macros/s/AKfycbz2CXGMkNTKY8Pn--zI4R2l-we9f6jjaCXxYpljlO5trI4IcFxcO46bYm_ogPOHVAm5/exec";
        const payTypeFa = instPayMethod === 'wallet' ? 'کیف پول' : 'کارت به کارت';
        const payload = {
            text: `🚨 پرداخت قسط جدید 🚨\n👤 نام: ${currentUser.full_name}\n📱 موبایل: ${currentUser.phone_number}\n💰 مبلغ: ${currentInstallmentAmount.toLocaleString()} تومان\n💳 روش: ${payTypeFa}`,
            image_base64: instPayMethod === 'card' ? instBase64Image : ""
        };
        fetch(gasUrl, { method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) }).catch(err => console.log(err));

        document.getElementById('mainLoader').style.display = 'none';
        alert('✅ پرداخت قسط با موفقیت در سیستم ثبت شد.'); 
        window.location.reload(); 
    } catch (e) { 
        console.error(e);
        document.getElementById('mainLoader').style.display = 'none'; 
        alert('خطا در ارتباط با سرور.'); 
    }
}

function renderInstallments(installmentsData) {
    const container = document.getElementById('installmentsContainer');
    if(!installmentsData || installmentsData.length === 0) { 
        container.innerHTML = '<div style="text-align: center; color: var(--text-muted); margin-top: 30px; font-weight: bold;">شما هیچ قسط ثبت‌شده‌ای ندارید.</div>'; 
        return; 
    }
    
    let html = ''; 
    // مرتب‌سازی بر اساس متن تاریخ شمسی (به جای تبدیل به میلادی)
    installmentsData.sort((a, b) => a.due_date.localeCompare(b.due_date));
    
    // گرفتن تاریخ امروز به شمسی
    let todayShamsi = getShamsiDateSafe(new Date());

    installmentsData.forEach(inst => {
        let statusObj = { text: 'در انتظار پرداخت', color: 'var(--warning)', bg: 'rgba(245, 158, 11, 0.1)', showBtn: true };
        
        if (inst.status === 'paid' || inst.status === 'approved') {
            statusObj = { text: 'پرداخت شده', color: 'var(--success)', bg: 'rgba(16, 185, 129, 0.1)', showBtn: false };
        } else { 
            // مقایسه مستقیم دو تاریخ شمسی با هم
            if (inst.due_date < todayShamsi) { 
                statusObj = { text: 'سررسید گذشته', color: 'var(--danger)', bg: 'rgba(239, 68, 68, 0.1)', showBtn: true }; 
            } 
        }
        
        let btnHtml = statusObj.showBtn ? `<button class="btn-action primary" style="width:100%; margin-top:15px;" onclick="openInstallmentModal('${inst.id}', ${inst.amount})">پرداخت قسط</button>` : '';
        
        // نمایش مستقیم تاریخ شمسی بدون تبدیل مخرب جاوااسکریپت
        let displayDate = inst.due_date.replace(/-/g, '/');
        
        html += `<div class="status-card glass-panel" style="margin-bottom: 15px; border-right: 4px solid ${statusObj.color};">
                    <div class="status-header" style="margin-bottom: 10px;">
                        <div class="srv-title" style="font-size: 14px;">قسط شماره ${inst.installment_number}</div>
                        <div class="srv-badge" style="background: ${statusObj.bg}; color: ${statusObj.color}; border: none;">${statusObj.text}</div>
                    </div>
                    <div style="font-size: 22px; font-weight: 900; color: var(--text-main); margin-bottom: 10px;">${Number(inst.amount).toLocaleString()} <span style="font-size: 12px; color: var(--text-muted);">تومان</span></div>
                    <div style="font-size: 12px; color: var(--text-muted); font-weight: bold; margin-bottom: 15px;">تاریخ سررسید: ${displayDate}</div>
                    ${btnHtml}
                 </div>`;
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
