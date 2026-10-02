// ==========================================
// 🔗 تنظیمات پایه و اتصال به دیتابیس
// ==========================================
const GAS_URL = 'https://script.google.com/macros/s/AKfycbyUkf-Z8j1QEn9IUS6MC9ph2Bq1ScRO-esG2nPufYFurJlNGlHXzXaYATEllk4VpnhdeA/exec';
const SUPABASE_URL = 'https://etlutqwwqeahevsskjih.supabase.co'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV0bHV0cXd3cWVhaGV2c3NramloIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2MTYwNjIsImV4cCI6MjA5NzE5MjA2Mn0.kXvSQtGM7w28IffQ4JOtv_xtHenyDV0tC70bOd7N7nQ'; 

const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { 'x-client-info': 'supabase-js/2' } }
});

let activeUser = null;
let storeProducts = []; 
let userWalletBalance = 0; 
const maxCredit = 200000; 
let cart = []; 
let receiptBase64 = "";
let userFavorites = []; 
let chargeMethod = 'receipt';
let featuredProducts = [];

// آیکون‌های SVG برای تولید داینامیک
const icons = {
    add: `<svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>`,
    minus: `<svg viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"></line></svg>`,
    trash: `<svg viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>`,
    star: `<svg viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>`,
    heart: `<svg viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>`
};

// ==========================================
// 🛠 توابع کمکی
// ==========================================
function showLoader(text) { document.getElementById('loaderText').innerText = text; document.getElementById('loader').style.display = 'flex'; }
function hideLoader() { document.getElementById('loader').style.display = 'none'; }
function toEnglishDigits(str) { return str ? str.replace(/[۰-۹]/g, d => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[٠-٩]/g, d => '٠١٢٣٤٥٦٧٨٩'.indexOf(d)) : ''; }

function goToStep(stepId, title, sub) {
    document.querySelectorAll('.step-section').forEach(el => el.classList.remove('active'));
    document.getElementById(stepId).classList.add('active');
    document.getElementById('headerTitle').innerText = title;
    document.getElementById('headerSub').innerText = sub;
}

function switchView(viewId, navElement = null) {
    document.querySelectorAll('.view-section').forEach(el => el.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');
    if (navElement) {
        document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
        navElement.classList.add('active');
    }
    if(viewId === 'view-cart') updateCartUI();
    if(viewId === 'view-profile') renderProfileUI();
}

// ==========================================
// 🔐 احراز هویت (متصل به جدول users)
// ==========================================
window.onload = () => {
    const savedPhone = localStorage.getItem('buffet_user_phone');
    if (savedPhone) {
        activeUser = { phone_number: savedPhone };
        document.getElementById('view-auth').classList.remove('active');
        loginSuccess(); 
    }
};

async function checkUser() {
    let phone = toEnglishDigits(document.getElementById('inpPhone').value.trim());
    if(phone.length < 10) return alert('لطفاً شماره موبایل را به درستی وارد کنید.');
    showLoader('در حال بررسی هویت...');
    
    try {
        const { data, error } = await supabaseClient.rpc('check_user_status', { p_phone: phone });
        hideLoader();
        if (error) {
            console.error("Supabase Error:", error);
            return alert('خطا در ارتباط با سرور.');
        }

        if (data && data.length > 0) {
            let user = data[0];
            if (user.status === 'pending') return alert('⏳ حساب شما در انتظار تایید مدیریت است.');
            if (user.status === 'blocked' || user.status === 'rejected') return alert('❌ دسترسی مسدود شده است.');
            
            activeUser = { ...user, phone_number: phone };
            let firstName = user.full_name ? user.full_name.split(' ')[0] : 'کاربر';

            if (!user.has_password) {
                if(document.getElementById('setupNameLabel')) document.getElementById('setupNameLabel').innerText = firstName;
                goToStep('step-setup', 'تنظیمات امنیتی', 'حفاظت از کیف پول شما');
            } else {
                goToStep('step-login', 'ورود به بوفه', `سلام ${firstName}، رمز عبورت رو وارد کن`);
            }
        } else {
            goToStep('step-register', 'ثبت‌نام در بوفه', 'تشکیل پرونده جدید');
        }
    } catch (err) { hideLoader(); console.error(err); alert('خطا در ارتباط با سرور.'); }
}

async function verifyLogin() {
    let pass = document.getElementById('inpLoginPass').value.trim();
    if(!pass) return alert('رمز عبور را وارد کنید.');
    showLoader('اعتبارسنجی...');
    
    try {
        let { error: authError } = await supabaseClient.auth.signInWithPassword({
            email: activeUser.phone_number + '@rahino.ir', password: pass
        });

        if (authError) {
            const { data: dbUser } = await supabaseClient.from('users').select('password').eq('phone_number', activeUser.phone_number).single();
            if (dbUser && dbUser.password === pass) {
                await supabaseClient.auth.signUp({ email: activeUser.phone_number + '@rahino.ir', password: pass });
                hideLoader(); loginSuccess();
            } else {
                hideLoader(); alert('❌ رمز عبور اشتباه است!');
            }
        } else {
            hideLoader(); loginSuccess();
        }
    } catch(e) { hideLoader(); console.error(e); alert('خطا در ورود به سیستم.'); }
}

async function saveNewPassword() {
    let pass = document.getElementById('setupPass').value.trim();
    let secQ = document.getElementById('setupSecQ').value;
    let secA = document.getElementById('setupSecA').value.trim();
    if(pass.length < 6 || !secQ || !secA) return alert('رمز عبور باید حداقل ۶ کاراکتر باشد.');
    showLoader('در حال ذخیره...');
    try {
        await supabaseClient.auth.signUp({ email: activeUser.phone_number + '@rahino.ir', password: pass });
        await supabaseClient.from('users').update({ password: pass, security_question: secQ, security_answer: secA }).eq('phone_number', activeUser.phone_number);
        hideLoader(); loginSuccess();
    } catch (err) { hideLoader(); console.error(err); alert('خطا در ذخیره اطلاعات.'); }
}

async function registerUser() {
    let phone = toEnglishDigits(document.getElementById('inpPhone').value.trim());
    let name = document.getElementById('regName').value.trim();
    let grade = document.getElementById('regGrade').value;
    let major = document.getElementById('regMajor').value.trim();
    let school = document.getElementById('regSchool').value.trim();
    let pass = document.getElementById('regPass').value.trim();
    let secQ = document.getElementById('regSecQ').value;
    let secA = document.getElementById('regSecA').value.trim();
    
    if(!name || pass.length < 6 || !secQ || !secA) return alert('رمز عبور باید حداقل ۶ کاراکتر باشد.');
    showLoader('تشکیل پرونده...');
    try {
        await supabaseClient.auth.signUp({ email: phone + '@rahino.ir', password: pass });
        await supabaseClient.from('users').insert([{
            phone_number: phone, full_name: name, grade: grade, major: major, school_name: school, 
            password: pass, security_question: secQ, security_answer: secA, status: 'pending', wallet_balance: 0
        }]);
        hideLoader();
        alert('✅ ثبت‌نام انجام شد. منتظر تایید مدیریت باشید.');
        goToStep('step-phone', 'ورود به سیستم', 'موبایل خود را وارد کنید');
        document.getElementById('inpPhone').value = '';
    } catch (err) { hideLoader(); console.error(err); alert('خطا در ثبت نام.'); }
}

async function processRecovery() {
    let ans = document.getElementById('inpRecoveryAns').value.trim();
    let newPass = document.getElementById('inpRecoveryNewPass').value.trim();
    if(newPass.length < 6) return alert('رمز عبور جدید باید حداقل ۶ کاراکتر باشد.');
    showLoader('تغییر رمز...');
    try {
        const { data, error } = await supabaseClient.from('users').select('security_answer').eq('phone_number', activeUser.phone_number).single();
        if (error || !data || data.security_answer.trim() !== ans) { hideLoader(); return alert('❌ پاسخ سوال امنیتی اشتباه است!'); }
        await supabaseClient.from('users').update({ password: newPass }).eq('phone_number', activeUser.phone_number);
        hideLoader(); alert('✅ رمز تغییر کرد.'); loginSuccess();
    } catch(e) { hideLoader(); console.error(e); alert('خطا در تغییر رمز.'); }
}

function setupRecoveryView() {
    document.getElementById('recoveryQuestionText').innerText = activeUser.security_question || 'سوال امنیتی یافت نشد.';
    goToStep('step-recovery', 'بازیابی رمز عبور', 'پاسخ به سوال امنیتی');
}

function logoutApp() {
    if(confirm('آیا از حساب کاربری خود خارج می‌شوید؟')) {
        localStorage.removeItem('buffet_user_phone');
        activeUser = null; cart = [];
        document.getElementById('bottomNavWrapper').style.display = 'none';
        document.getElementById('inpPhone').value = ''; document.getElementById('inpLoginPass').value = '';
        switchView('view-auth');
        goToStep('step-phone', 'ورود به سیستم', 'موبایل خود را وارد کنید');
    }
}

// ==========================================
// 🏪 دریافت مستقیم داده‌ها از دیتابیس
// ==========================================
async function loginSuccess() {
    localStorage.setItem('buffet_user_phone', activeUser.phone_number);
    const overlay = document.getElementById('welcomeOverlay');
    document.getElementById('welcomeName').innerText = `خوش آمدید!`;
    overlay.style.display = 'flex';

    try {
        const { data: userData, error: uErr } = await supabaseClient.from('users').select('wallet_balance, full_name').eq('phone_number', activeUser.phone_number).single();
        if(uErr) throw uErr;

        userWalletBalance = userData ? Number(userData.wallet_balance || 0) : 0;
        activeUser.full_name = userData ? userData.full_name : activeUser.phone_number;
        document.getElementById('welcomeName').innerText = `سلام ${activeUser.full_name.split(' ')[0]} عزیز!`;

        const { data: prods } = await supabaseClient.from('buffet_products').select('*').eq('is_active', true);
        storeProducts = prods || [];

        const { data: orders } = await supabaseClient.from('buffet_orders').select('items').eq('phone_number', activeUser.phone_number);
        let itemFreq = {};
        if (orders) {
            orders.forEach(o => {
                try { JSON.parse(o.items).forEach(i => { itemFreq[i.id] = (itemFreq[i.id] || 0) + i.qty; }) } catch(e){}
            });
        }
        userFavorites = Object.keys(itemFreq).sort((a,b) => itemFreq[b] - itemFreq[a]).slice(0, 3);

        let currentDay = new Intl.DateTimeFormat('en-US', { weekday: 'long' }).format(new Date()).toLowerCase();
        let currentTime = new Date().toLocaleTimeString('en-US', { hour12: false, hour: "2-digit", minute: "2-digit" });
        
        featuredProducts = storeProducts.filter(p => {
            if(!p.featured_days || !p.featured_start || !p.featured_end) return false;
            return p.featured_days.toLowerCase().includes(currentDay) && p.featured_start <= currentTime && p.featured_end >= currentTime;
        });

        setTimeout(() => {
            overlay.style.display = 'none';
            document.getElementById('view-auth').classList.remove('active');
            document.getElementById('bottomNavWrapper').style.display = 'flex';
            switchView('view-store', document.querySelectorAll('.nav-item')[0]);
            renderStore();
            updateWalletLabels();
        }, 1000);
    } catch (err) {
        console.error(err);
        overlay.style.display = 'none';
        alert('خطا در دریافت اطلاعات دیتابیس بوفه.');
        logoutApp();
    }
}

// ==========================================
// 🛒 فروشگاه و سبد خرید
// ==========================================
function updateWalletLabels() {
    document.getElementById('walletLabelBadge').innerText = `${userWalletBalance.toLocaleString()}`;
    const profileBal = document.getElementById('profileWalletBalance');
    profileBal.innerHTML = `${userWalletBalance.toLocaleString()} <span>تومان</span>`;
    if (userWalletBalance < 0) {
        profileBal.classList.add('negative');
        document.getElementById('profileWalletStatus').innerText = '⚠ شما بدهی دارید. لطفاً حساب خود را شارژ کنید.';
    } else {
        profileBal.classList.remove('negative');
        document.getElementById('profileWalletStatus').innerText = '(سقف اعتبار خرید: ۲۰۰,۰۰۰- تومان)';
    }
}

function renderStore() {
    const navContainer = document.getElementById('catNav');
    const storeContainer = document.getElementById('storeScroll');
    if(!navContainer || !storeContainer) return;
    
    const categories = [...new Set(storeProducts.filter(p => p.stock_count > 0).map(p => p.category))];
    let storeHtml = ''; let navHtml = '';

    if (featuredProducts && featuredProducts.length > 0) {
        navHtml += `<div class="cat-link active" onclick="scrollToCategory('cat-featured', this)">${icons.star} پیشنهاد ویژه</div>`;
        storeHtml += `<section id="cat-featured" class="category-section"><div class="section-header">${icons.star} پیشنهاد راهینو</div><div class="horizontal-list">`;
        featuredProducts.forEach(p => { storeHtml += generateProductHtml(p); });
        storeHtml += `</div></section>`;
    }

    let favoriteProducts = storeProducts.filter(p => userFavorites.includes(p.id) && p.stock_count > 0);
    if (favoriteProducts.length > 0) {
        let activeClass = (featuredProducts.length === 0) ? 'active' : '';
        navHtml += `<div class="cat-link ${activeClass}" onclick="scrollToCategory('cat-foryou', this)">${icons.heart} ویژه شما</div>`;
        storeHtml += `<section id="cat-foryou" class="category-section"><div class="section-header">${icons.heart} علاقه‌مندی‌های شما</div><div class="horizontal-list">`;
        favoriteProducts.forEach(p => { storeHtml += generateProductHtml(p); });
        storeHtml += `</div></section>`;
    }

    categories.forEach((cat, index) => {
        let activeClass = (index === 0 && featuredProducts.length === 0 && favoriteProducts.length === 0) ? 'active' : '';
        navHtml += `<div class="cat-link ${activeClass}" onclick="scrollToCategory('cat-${cat}', this)">${cat}</div>`;
    });
    navContainer.innerHTML = navHtml;

    categories.forEach(cat => {
        let catProducts = storeProducts.filter(p => p.stock_count > 0 && p.category === cat);
        if (catProducts.length === 0) return;

        storeHtml += `<section id="cat-${cat}" class="category-section"><div class="section-header">${cat}</div><div class="horizontal-list">`;
        catProducts.forEach(p => { storeHtml += generateProductHtml(p); });
        storeHtml += `</div></section>`;
    });
    storeContainer.innerHTML = storeHtml;
}

function generateProductHtml(p) {
    const cartItem = cart.find(item => item.id === p.id);
    const qty = cartItem ? cartItem.qty : 0;
    
    let actionHtml = qty === 0 
        ? `<div class="btn-add-init" onclick="updateItemQty('${p.id}', '${p.name}', ${p.price}, 1)">${icons.add} افزودن</div>` 
        : `<div class="qty-controls"><button class="${qty === 1 ? 'qty-btn del' : 'qty-btn'}" onclick="updateItemQty('${p.id}', '${p.name}', ${p.price}, -1)">${qty === 1 ? icons.trash : icons.minus}</button><span class="qty-display">${qty}</span><button class="qty-btn" onclick="updateItemQty('${p.id}', '${p.name}', ${p.price}, 1)">${icons.add}</button></div>`;
    
    let imageDiv = p.image_url ? `url('${p.image_url}')` : 'none';
    
    return `<div class="product-card"><div class="product-img" style="background-image: ${imageDiv};"></div><div class="product-info"><div class="product-name">${p.name}</div><div class="product-price">${p.price.toLocaleString()} <span style="font-size: 11px; color: var(--text-muted);">تومان</span></div><div style="margin-top:auto;">${actionHtml}</div></div></div>`;
}

function scrollToCategory(id, btn) {
    document.querySelectorAll('.cat-link').forEach(l => l.classList.remove('active'));
    btn.classList.add('active');
    const section = document.getElementById(id);
    const storeScroll = document.getElementById('storeScroll');
    if(section && storeScroll) storeScroll.scrollTo({ top: section.offsetTop - 25, behavior: 'smooth' });
}

window.addEventListener('DOMContentLoaded', () => {
    const storeScroll = document.getElementById('storeScroll');
    if(storeScroll) {
        storeScroll.addEventListener('scroll', () => {
            const sections = document.querySelectorAll('.category-section');
            const navLinks = document.querySelectorAll('.cat-link');
            let current = '';
            sections.forEach(section => { if (storeScroll.scrollTop >= (section.offsetTop - 80)) current = section.getAttribute('id'); });
            navLinks.forEach(link => {
                link.classList.remove('active');
                if (current && link.getAttribute('onclick') && link.getAttribute('onclick').includes(current)) {
                    link.classList.add('active');
                    link.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                }
            });
        });
    }
});

function updateItemQty(id, name, price, change) {
    if (navigator.vibrate) navigator.vibrate(30);
    let itemIndex = cart.findIndex(item => item.id === id);
    let productDb = storeProducts.find(p => p.id === id);
    
    if(change > 0 && productDb && itemIndex > -1 && cart[itemIndex].qty >= productDb.stock_count) {
        return alert('موجودی این محصول در بوفه کافی نیست!'); 
    }

    if (itemIndex > -1) {
        cart[itemIndex].qty += change;
        if (cart[itemIndex].qty <= 0) cart.splice(itemIndex, 1);
    } else if (change > 0) { cart.push({ id, name, price, qty: 1 }); }
    
    const storeScroll = document.getElementById('storeScroll');
    const currentScroll = storeScroll ? storeScroll.scrollTop : 0;
    
    updateBadge(); renderStore(); updateCartUI();
    if(storeScroll) storeScroll.scrollTop = currentScroll;
}

function updateBadge() {
    let totalItems = cart.reduce((sum, item) => sum + item.qty, 0);
    const badge = document.getElementById('cartBadge');
    if (totalItems > 0) {
        badge.innerText = totalItems; badge.style.display = 'flex';
        badge.classList.remove('pop'); void badge.offsetWidth; badge.classList.add('pop');
    } else { badge.style.display = 'none'; }
}

function updateCartUI() {
    const container = document.getElementById('cartItemsContainer');
    const checkoutBox = document.getElementById('checkoutBox');
    const emptyMsg = document.getElementById('emptyCartMsg');
    const btnCheckout = document.getElementById('btnCheckout');
    const msgStatus = document.getElementById('checkoutStatusMsg');
    
    if (cart.length === 0) { checkoutBox.style.display = 'none'; emptyMsg.style.display = 'flex'; return; }
    emptyMsg.style.display = 'none'; checkoutBox.style.display = 'block';
    
    let html = ''; let totalPrice = 0;
    cart.forEach(item => {
        totalPrice += (item.price * item.qty);
        html += `<div class="cart-item">
                    <div><div class="cart-item-name">${item.name}</div><div class="cart-item-price">${item.price.toLocaleString()} تومان</div></div>
                    <div class="qty-controls" style="margin-top:0;">
                        <button class="${item.qty === 1 ? 'qty-btn del' : 'qty-btn'}" onclick="updateItemQty('${item.id}', '${item.name}', ${item.price}, -1)">${item.qty === 1 ? icons.trash : icons.minus}</button>
                        <span class="qty-display">${item.qty}</span>
                        <button class="qty-btn" onclick="updateItemQty('${item.id}', '${item.name}', ${item.price}, 1)">${icons.add}</button>
                    </div>
                </div>`;
    });
    container.innerHTML = html;
    document.getElementById('totalPriceLabel').innerText = `${totalPrice.toLocaleString()} تومان`;

    const selectedMethod = document.querySelector('input[name="payMethod"]:checked').value;
    document.getElementById('lblWallet').classList.remove('active'); document.getElementById('lblCash').classList.remove('active');
    
    if(selectedMethod === 'wallet') {
        document.getElementById('lblWallet').classList.add('active');
    } else {
        document.getElementById('lblCash').classList.add('active');
    }

    let totalBuyingPower = userWalletBalance + maxCredit; 
    if (selectedMethod === 'wallet' && totalPrice > totalBuyingPower) {
        btnCheckout.className = 'btn-checkout disabled'; 
        btnCheckout.innerHTML = 'موجودی ناکافی <svg viewBox="0 0 24 24"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>'; 
        btnCheckout.disabled = true; msgStatus.style.display = 'block';
    } else {
        btnCheckout.className = 'btn-checkout active'; 
        btnCheckout.innerHTML = 'تایید نهایی و خرید <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg>'; 
        btnCheckout.disabled = false; msgStatus.style.display = 'none';
    }
}

async function processCheckout() {
    const btn = document.getElementById('btnCheckout');
    const selectedMethod = document.querySelector('input[name="payMethod"]:checked').value;
    let totalToPay = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    
    btn.innerHTML = 'در حال ثبت... <svg viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>'; btn.disabled = true;

    try {
        if (selectedMethod === 'wallet') {
            if (totalToPay > (userWalletBalance + maxCredit)) throw new Error("موجودی ناکافی");
            userWalletBalance -= totalToPay; 
            await supabaseClient.from('users').update({ wallet_balance: userWalletBalance }).eq('phone_number', activeUser.phone_number);
            await supabaseClient.from('buffet_transactions').insert([{ phone_number: activeUser.phone_number, amount: -totalToPay, tx_type: 'purchase', status: 'approved' }]);
        }
        
        let orderStatus = selectedMethod === 'wallet' ? 'paid' : 'pending_cash';
        await supabaseClient.from('buffet_orders').insert([{ phone_number: activeUser.phone_number, items: JSON.stringify(cart), total_price: totalToPay, payment_method: selectedMethod, status: orderStatus }]);

        let mText = selectedMethod === 'wallet' ? "💳 کیف پول" : "💵 نقدی";
        let iText = cart.map(i => `▫️ ${i.qty}x ${i.name}`).join("\n");
        let payload = { text: `🚨 سفارش بوفه 🚨\n👤 خریدار: ${activeUser.full_name}\n💰 مبلغ: ${totalToPay.toLocaleString()} تومان\nوضعیت: ${mText}\n\n🛒 اقلام سفارش:\n${iText}` };
        fetch(GAS_URL, { method: 'POST', mode: 'no-cors', body: JSON.stringify(payload) }).catch(e=>{});

        alert(selectedMethod === 'wallet' ? '✅ سفارش ثبت و مبلغ کسر شد.\nخرید خود را تحویل بگیرید.' : '✅ سفارش نقدی ثبت شد.\nمبلغ را به سرپرست تحویل دهید.');
        cart = []; updateBadge(); updateWalletLabels();
        
        const { data: newProds } = await supabaseClient.from('buffet_products').select('*').eq('is_active', true);
        storeProducts = newProds || [];
        
        renderStore(); switchView('view-store', document.querySelectorAll('.nav-item')[0]);
        btn.innerHTML = 'تایید نهایی و خرید <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg>';
    } catch(e) {
        console.error(e);
        alert('خطا در ثبت سفارش.');
        btn.innerHTML = 'تایید نهایی و خرید <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg>'; btn.disabled = false;
    }
}

// ==========================================
// 💳 پروفایل و شارژ
// ==========================================
function renderProfileUI() {
    const container = document.getElementById('quickAmountsContainer');
    let html = '';
    if (userWalletBalance < 0) {
        const debtAmount = Math.abs(userWalletBalance);
        html += `<div class="amount-chip debt-chip" onclick="setChargeAmount(${debtAmount})">تسویه بدهی (${debtAmount.toLocaleString()})</div>`;
    }
    const amounts = [50000, 100000, 200000, 300000];
    amounts.forEach(amt => { html += `<div class="amount-chip" onclick="setChargeAmount(${amt})">${(amt/1000)} هزار</div>`; });
    container.innerHTML = html;
}

function setChargeAmount(amount) { document.getElementById('inpChargeAmount').value = amount; validateChargeForm(); }

function handleReceiptSelect(event) {
    const file = event.target.files[0];
    if (file) {
        document.getElementById('uploadText').innerText = `⏳ در حال فشرده‌سازی...`;
        const reader = new FileReader();
        reader.onload = function(e) { 
            const img = new Image();
            img.onload = function() {
                const canvas = document.createElement('canvas');
                let w = img.width, h = img.height;
                const MAX = 800;
                if(w > h && w > MAX) { h *= MAX/w; w = MAX; } else if(h > MAX) { w *= MAX/h; h = MAX; }
                canvas.width = w; canvas.height = h;
                const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, w, h);
                receiptBase64 = canvas.toDataURL('image/jpeg', 0.6).split(',')[1];
                document.getElementById('uploadText').innerText = `✅ فیش ضمیمه شد`;
                document.getElementById('uploadBox').style.borderColor = "var(--primary)";
                document.getElementById('uploadBox').style.background = "var(--primary-fade)";
                validateChargeForm();
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    }
}

document.getElementById('inpChargeAmount').addEventListener('input', validateChargeForm);

function switchChargeTab(method) {
    chargeMethod = method;
    const btnReceipt = document.getElementById('btnTabReceipt');
    const btnCash = document.getElementById('btnTabCash');
    
    if(method === 'receipt') {
        btnReceipt.classList.add('active');
        btnCash.classList.remove('active');
        document.getElementById('receiptBox').style.display = 'block';
    } else {
        btnCash.classList.add('active');
        btnReceipt.classList.remove('active');
        document.getElementById('receiptBox').style.display = 'none';
    }
    validateChargeForm();
}

function validateChargeForm() {
    const amt = document.getElementById('inpChargeAmount').value;
    const btn = document.getElementById('btnSubmitCharge');
    let isValid = amt >= 10000;
    if(chargeMethod === 'receipt' && !receiptBase64) isValid = false;
    
    if (isValid) { btn.disabled = false; btn.className = 'btn-checkout active'; } 
    else { btn.disabled = true; btn.className = 'btn-checkout disabled'; }
}

async function submitChargeRequest() {
    const amt = Number(document.getElementById('inpChargeAmount').value);
    const btn = document.getElementById('btnSubmitCharge');
    btn.innerHTML = 'در حال ارسال... <svg viewBox="0 0 24 24"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>'; btn.disabled = true;

    try {
        let txType = chargeMethod === 'cash' ? 'cash_charge' : 'receipt_charge';
        await supabaseClient.from('buffet_transactions').insert([{ phone_number: activeUser.phone_number, amount: amt, tx_type: txType, status: 'pending', receipt_base64: receiptBase64 || null }]);

        let payload = {
            text: chargeMethod === 'receipt' ? `⚡ تایید فیش بوفه ⚡\n👤 کاربر: ${activeUser.full_name}\n💰 مبلغ: ${amt.toLocaleString()} تومان` : `💵 شارژ نقدی بوفه 💵\n👤 کاربر: ${activeUser.full_name}\n💰 مبلغ: ${amt.toLocaleString()} تومان`,
            image_base64: chargeMethod === 'receipt' ? receiptBase64 : ""
        };
        fetch(GAS_URL, { method: 'POST', mode: 'no-cors', body: JSON.stringify(payload) }).catch(e=>{});

        alert(chargeMethod === 'receipt' ? '✅ فیش ثبت شد. منتظر تایید باشید.' : '✅ درخواست ثبت شد. مبلغ را تحویل دهید.');
        
        document.getElementById('inpChargeAmount').value = ''; receiptBase64 = '';
        document.getElementById('uploadText').innerText = `تصویر فیش را آپلود کنید`;
        document.getElementById('uploadBox').style.borderColor = "var(--glass-border)";
        document.getElementById('uploadBox').style.background = "var(--glass-highlight)";
        validateChargeForm();
        btn.innerHTML = 'ثبت درخواست <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg>';
    } catch(e) {
        console.error(e);
        alert('خطا در ارسال درخواست.');
        btn.innerHTML = 'ثبت درخواست <svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"></polyline></svg>'; validateChargeForm();
    }
}

// ==========================================
// 📜 تاریخچه
// ==========================================
async function loadHistory() {
    switchView('view-history');
    const container = document.getElementById('historyContainer');
    container.innerHTML = '<div style="text-align:center; color:var(--text-muted); margin-top:40px; font-weight: bold;">⏳ در حال دریافت اطلاعات...</div>';
    
    try {
        const [ordersRes, txsRes] = await Promise.all([
            supabaseClient.from('buffet_orders').select('*').eq('phone_number', activeUser.phone_number).order('created_at', { ascending: false }),
            supabaseClient.from('buffet_transactions').select('*').eq('phone_number', activeUser.phone_number).order('created_at', { ascending: false })
        ]);
        
        let historyList = [];
        if(ordersRes.data) ordersRes.data.forEach(o => historyList.push({ type: 'order', amount: o.total_price, raw_date: o.created_at, items: o.items, payment_method: o.payment_method, status: o.status }));
        if(txsRes.data) txsRes.data.forEach(t => { if(t.tx_type !== 'purchase') historyList.push({ type: 'charge', amount: Math.abs(t.amount), raw_date: t.created_at, status: t.status, tx_type: t.tx_type }); });
        
        historyList.sort((a, b) => new Date(b.raw_date) - new Date(a.raw_date));
        
        if(historyList.length === 0) {
            container.innerHTML = '<div class="empty-state"><svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg><div style="font-size: 15px; font-weight: 900; color: var(--text-main);">تاکنون تراکنشی نداشته‌اید</div></div>'; return;
        }
        
        let html = '';
        historyList.forEach(item => {
            let isOrder = item.type === 'order';
            let icon = isOrder ? '<svg viewBox="0 0 24 24"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"></path><line x1="3" y1="6" x2="21" y2="6"></line><path d="M16 10a4 4 0 0 1-8 0"></path></svg>' : '<svg viewBox="0 0 24 24"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>';
            let title = isOrder ? 'خرید از بوفه' : (item.tx_type === 'cash_charge' ? 'شارژ نقدی' : (item.tx_type === 'receipt_charge' ? 'واریز کارت به کارت' : 'شارژ متفرقه'));
            let amountColor = isOrder ? 'var(--danger)' : 'var(--success)';
            let sign = isOrder ? '-' : '+';
            let shamsiDate = new Date(item.raw_date).toLocaleDateString('fa-IR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

            let detailsHtml = '';
            if (isOrder && item.items) {
                let itemsArr = typeof item.items === 'string' ? JSON.parse(item.items) : item.items;
                let itemsText = itemsArr.map(i => `${i.qty}x ${i.name}`).join(' ، ');
                let payMethodTxt = item.payment_method === 'wallet' ? '💳 کیف پول' : '💵 نقدی';
                let payMethodColor = item.payment_method === 'wallet' ? 'var(--primary)' : 'var(--warning)';
                detailsHtml = `<div style="font-size: 11px; color: var(--text-muted); margin-top: 8px; line-height: 1.6; font-weight: bold;">اقلام: <span style="color: var(--text-main);">${itemsText}</span><br><span style="color: ${payMethodColor}; display: inline-block; margin-top: 6px;">${payMethodTxt}</span></div>`;
            } else if (!isOrder) {
                let statusTxt = item.status === 'approved' ? '✅ تایید شده' : (item.status === 'rejected' ? '❌ رد شده' : '⏳ در انتظار تایید');
                let statusColor = item.status === 'approved' ? 'var(--success)' : (item.status === 'rejected' ? 'var(--danger)' : 'var(--warning)');
                detailsHtml = `<div style="font-size: 11px; color: ${statusColor}; margin-top: 8px; font-weight: bold;">وضعیت: ${statusTxt}</div>`;
            }
            
            html += `<div class="history-card glass-panel"><div class="history-info"><div class="history-icon">${icon}</div><div><div class="history-title">${title}</div><div class="history-date" style="direction:ltr; text-align:right;">${shamsiDate}</div>${detailsHtml}</div></div><div class="history-amount" style="color:${amountColor};">${sign} ${item.amount.toLocaleString()}</div></div>`;
        });
        container.innerHTML = html;
    } catch(e) { 
        console.error(e);
        container.innerHTML = `<div style="text-align:center; color:var(--danger); margin-top:40px; font-weight:bold;">خطا در دریافت تاریخچه</div>`; 
    }
}
</script>
