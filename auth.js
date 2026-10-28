/* ==========================================================================
   🔐 ماژول احراز هویت، ورود دوگانه و ثبت‌نام مرحله اول (js/auth.js)
   پشتیبانی همزمان از دانش‌آموزان مشاوره (@rahinovip.ir) و پانسیون (@rahino.ir)
   ========================================================================== */

const AuthModule = {
    forgotTargetIdentity: null,

    // انتخاب دکمه‌های کپسولی (پایه، رشته، نحوه آشنایی)
    selectPill(hiddenInputId, value, btnEl) {
        const input = document.getElementById(hiddenInputId);
        if (input) input.value = value;
        if (btnEl && btnEl.parentElement) {
            btnEl.parentElement.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('active'));
            btnEl.classList.add('active');
        }
    },

    // نرمال‌سازی استاندارد پایه و رشته برای جلوگیری از خطای عدم نمایش طرح‌ها
    normalizeGradeAndMajor(rawGrade, rawMajor) {
        const g = String(rawGrade || '').trim();
        const m = String(rawMajor || '').trim();

        let normGrade = 'دوازدهم';
        if (g.includes('دهم')) normGrade = 'دهم';
        else if (g.includes('یازدهم')) normGrade = 'یازدهم';
        else if (g.includes('پشت') || g.includes('فارغ')) normGrade = 'پشت کنکوری';

        let normMajor = 'تجربی';
        if (m.includes('ریاضی') || m.includes('مهندس') || m.includes('کامپیوتر') || m.includes('برق')) normMajor = 'ریاضی';
        else if (m.includes('انسانی') || m.includes('حقوق') || m.includes('روان') || m.includes('حسابداری')) normMajor = 'انسانی';
        else if (m.includes('تجربی') || m.includes('پزشک') || m.includes('زیست')) normMajor = 'تجربی';

        return { normGrade, normMajor };
    },

    // ==========================================================================
    // 🚪 ۱. ورود هوشمند (پشتیبانی از شماره موبایل، کد ملی و حساب پانسیون)
    // ==========================================================================
    async handleLogin() {
        const rawUser = document.getElementById('loginUsername')?.value.trim() || '';
        const rawPass = document.getElementById('loginPassword')?.value.trim() || '';
        const username = UI.toEngDigits(rawUser);
        const password = UI.toEngDigits(rawPass);

        if (!username || !password) {
            return UI.showAlertBox('loginAlert', 'لطفاً شماره موبایل (یا کد ملی) و رمز عبور خود را وارد کنید.', 'error');
        }

        const btn = document.getElementById('btnLoginSubmit');
        btn.disabled = true;
        btn.innerHTML = '<span>در حال بررسی و ورود...</span>';
        UI.showAlertBox('loginAlert', '');

        try {
            // گام ۱: تلاش برای ورود با دامنه مشاوره (@rahinovip.ir) و سپس دامنه پانسیون (@rahino.ir)
            const emailVip = `${username}@rahinovip.ir`;
            const emailPan = `${username}@rahino.ir`;

            let authSession = null;
            let { data: auth1, error: err1 } = await supabaseClient.auth.signInWithPassword({
                email: emailVip,
                password: password
            });

            if (!err1 && auth1?.session) {
                authSession = auth1.session;
            } else {
                // تلاش با دامنه پانسیون یا رمز عبور با ارقام فارسیِ احتمالی
                let { data: auth2, error: err2 } = await supabaseClient.auth.signInWithPassword({
                    email: emailPan,
                    password: password
                });
                if (!err2 && auth2?.session) {
                    authSession = auth2.session;
                } else if (rawPass !== password) {
                    let { data: auth3 } = await supabaseClient.auth.signInWithPassword({
                        email: emailPan,
                        password: rawPass
                    });
                    if (auth3?.session) authSession = auth3.session;
                }
            }

            if (!authSession) {
                throw new Error('شماره موبایل یا رمز عبور اشتباه است.');
            }

            AppState.userAuthToken = authSession.access_token;

            // گام ۲: فراخوانی تابع دیتابیس برای همگام‌سازی پرونده پانسیون/مشاوره
            let resolvedProfile = null;
            try {
                const { data: rpcData, error: rpcErr } = await supabaseClient.rpc('resolve_and_sync_student_login', {
                    p_login_input: username
                });
                if (!rpcErr && rpcData && rpcData.found) {
                    resolvedProfile = rpcData;
                }
            } catch (_) {}

            // گام ۳: اگر تابع RPC در دسترس نبود یا کاربر فقط در جدول پانسیون بود، همگام‌سازی مستقیم انجام شود
            if (!resolvedProfile) {
                resolvedProfile = await this.fallbackResolveAndSyncUser(username, password);
            }

            if (!resolvedProfile || !resolvedProfile.found) {
                throw new Error('پرونده کاربری شما در سیستم یافت نشد.');
            }

            const targetNid = resolvedProfile.national_id || username;
            const targetPhone = resolvedProfile.phone_number || username;

            // گام ۴: مسیریابی بر اساس وضعیت اشتراک و پرونده
            if (resolvedProfile.status === 'blocked') {
                throw new Error('حساب کاربری شما مسدود شده است. لطفاً با مدیریت تماس بگیرید.');
            }

            // اگر دانش‌آموز اشتراک مشاوره فعال دارد یا عضو فعال ماهانه پانسیون است -> ورود مستقیم به اپ
            if (resolvedProfile.status === 'active' || resolvedProfile.has_consult_sub || resolvedProfile.has_pansion_sub) {
                Storage.set('qotbnama_user_id', targetNid);
                Storage.set('national_id', targetNid);
                Storage.set('qotbnama_phone', targetPhone);
                Storage.set('qotbnama_full_name', resolvedProfile.full_name || 'دانش‌آموز');
                Storage.set('qotbnama_plan', resolvedProfile.plan_type || 'free');
                Storage.set('qotbnama_user_mode', resolvedProfile.user_mode || 'consult');
                Storage.remove('temp_reg_nid');

                AppState.userId = targetNid;
                AppState.userPhone = targetPhone;
                await AppCore.bootstrapLoggedInUser();
                Router.showAppShell('home');
            } else if (resolvedProfile.status === 'pending') {
                UI.showAlertBox('loginAlert', 'پرونده و فیش واریزی شما در صف تایید مدیریت قرار دارد. لطفاً شکیبا باشید.', 'success');
            } else {
                // وضعیت draft یا rejected -> هدایت به مرحله ۲ (انتخاب طرح مشاوره)
                Storage.set('temp_reg_nid', targetNid);
                Storage.set('qotbnama_phone', targetPhone);
                Router.goToAuthView('register-step2');
            }

        } catch (err) {
            UI.showAlertBox('loginAlert', err.message || 'خطا در ورود به حساب.', 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i data-lucide="log-in" class="icon"></i><span>ورود به حساب کاربری</span>';
            UI.refreshIcons();
        }
    },

    // همگام‌سازی پشتیبان برای اطمینان ۱۰۰٪ از ساخت پرونده در جدول students برای بچه‌های پانسیون
    async fallbackResolveAndSyncUser(loginInput, password) {
        const [stRes, usrRes, conRes, panRes] = await Promise.all([
            supabaseClient.from('students').select('*').or(`national_id.eq.${loginInput},phone_number.eq.${loginInput}`).maybeSingle(),
            supabaseClient.from('users').select('*').or(`phone_number.eq.${loginInput},national_id.eq.${loginInput}`).maybeSingle(),
            supabaseClient.from('subscriptions').select('*').or(`student_nid.eq.${loginInput},user_phone.eq.${loginInput}`).eq('service_category', 'consult').eq('status', 'active'),
            supabaseClient.from('pan_monthly_subs').select('*').eq('phone_number', loginInput).eq('status', 'active')
        ]);

        const hasConsult = Array.isArray(conRes.data) && conRes.data.length > 0;
        const hasPansion = Array.isArray(panRes.data) && panRes.data.length > 0;

        let student = stRes.data;
        const panUser = usrRes.data;

        // اگر کاربر در جدول پانسیون (users) هست ولی در جدول students نیست، همین لحظه برایش پرونده بساز
        if (!student && panUser) {
            const { normGrade, normMajor } = this.normalizeGradeAndMajor(panUser.grade, panUser.major);
            const newStudentPayload = {
                full_name: panUser.full_name || 'دانش‌آموز راهینو',
                national_id: panUser.phone_number || loginInput,
                phone_number: panUser.phone_number || loginInput,
                grade: normGrade,
                major: normMajor,
                school_name: panUser.school_name || null,
                province: panUser.province || null,
                city: panUser.city || null,
                father_phone: panUser.father_phone ? UI.toEngDigits(panUser.father_phone) : null,
                mother_phone: panUser.mother_phone ? UI.toEngDigits(panUser.mother_phone) : null,
                password: panUser.password || password || '123456',
                security_question: panUser.security_question || 'رنگ مورد علاقه شما در کودکی چه بود؟',
                security_answer: panUser.security_answer || 'آبی',
                referral_code: panUser.referral_code || ('RH-' + Math.random().toString(36).substring(2, 7).toUpperCase()),
                wallet_balance: Number(panUser.wallet_balance) || 0,
                status: (hasPansion || hasConsult) ? 'active' : 'draft'
            };

            const { data: inserted } = await supabaseClient
                .from('students')
                .upsert([newStudentPayload], { onConflict: 'national_id' })
                .select('*')
                .maybeSingle();

            student = inserted || newStudentPayload;
        }

        if (!student) return { found: false };

        // اگر عضو فعال پانسیون است ولی وضعیتش در students هنوز draft است، فعالش کن
        if ((hasPansion || hasConsult) && student.status === 'draft') {
            await supabaseClient.from('students').update({ status: 'active' }).eq('national_id', student.national_id);
            student.status = 'active';
        }

        return {
            found: true,
            national_id: student.national_id,
            phone_number: student.phone_number || loginInput,
            full_name: student.full_name,
            grade: student.grade,
            major: student.major,
            status: (hasPansion || hasConsult) ? 'active' : (student.status || 'draft'),
            has_consult_sub: hasConsult,
            has_pansion_sub: hasPansion,
            plan_type: hasConsult ? conRes.data[0].service_type : (hasPansion ? 'pansion_free' : 'free'),
            user_mode: hasConsult ? 'consult' : (hasPansion ? 'pansion_monthly' : 'consult')
        };
    },

    // ==========================================================================
    // 📝 ۲. ثبت‌نام مرحله اول (تشکیل پرونده سریع با شماره موبایل)
    // ==========================================================================
    async submitStep1() {
        const fullName = document.getElementById('regFullName')?.value.trim() || '';
        const phone = UI.toEngDigits(document.getElementById('regPhone')?.value.trim() || '');
        const grade = document.getElementById('regGrade')?.value || '';
        const major = document.getElementById('regMajor')?.value || '';
        const invitedByRaw = UI.toEngDigits(document.getElementById('regReferralCodeInput')?.value.trim() || '');
        const password = UI.toEngDigits(document.getElementById('regPassword')?.value.trim() || '');
        const secQuestion = document.getElementById('regSecQuestion')?.value || '';
        const secAnswer = document.getElementById('regSecAnswer')?.value.trim() || '';

        if (!fullName || !phone) {
            return UI.showAlertBox('regStep1Alert', 'لطفاً نام و نام خانوادگی و شماره موبایل خود را وارد کنید.', 'error');
        }
        if (phone.length !== 11 || !phone.startsWith('09')) {
            return UI.showAlertBox('regStep1Alert', 'شماره موبایل باید ۱۱ رقم و با ۰۹ شروع شود.', 'error');
        }
        if (!grade || !major) {
            return UI.showAlertBox('regStep1Alert', 'لطفاً پایه و رشته تحصیلی خود را انتخاب کنید.', 'error');
        }
        if (password.length < 6) {
            return UI.showAlertBox('regStep1Alert', 'رمز عبور باید حداقل ۶ کاراکتر باشد.', 'error');
        }
        if (!secAnswer) {
            return UI.showAlertBox('regStep1Alert', 'لطفاً پاسخ سوال امنیتی را وارد کنید.', 'error');
        }

        const btn = document.getElementById('btnRegStep1Submit');
        btn.disabled = true;
        btn.innerHTML = '<span>در حال تشکیل پرونده...</span>';
        UI.showAlertBox('regStep1Alert', '');

        try {
            // ۱. ایجاد یا ورود به حساب امنیتی در Supabase Auth
            const dummyEmail = `${phone}@rahinovip.ir`;
            const { data: signUpData, error: signUpErr } = await supabaseClient.auth.signUp({
                email: dummyEmail,
                password: password
            });

            // اگر قبلاً در Auth ثبت شده بود، تلاش برای لاگین با رمز فعلی
            if (signUpErr && !signUpData?.user) {
                const { error: signInErr } = await supabaseClient.auth.signInWithPassword({
                    email: dummyEmail,
                    password: password
                });
                if (signInErr) {
                    // امتحان با دامنه پانسیون در صورتی که دانش‌آموز پانسیون باشد
                    const { error: panSignInErr } = await supabaseClient.auth.signInWithPassword({
                        email: `${phone}@rahino.ir`,
                        password: password
                    });
                    if (panSignInErr) {
                        throw new Error('این شماره موبایل قبلاً در سیستم ثبت شده است. لطفاً از صفحه ورود وارد شوید یا رمز خود را بازیابی کنید.');
                    }
                }
            }

            const { data: { session } } = await supabaseClient.auth.getSession();
            if (session) AppState.userAuthToken = session.access_token;

            const invitedBy = invitedByRaw ? invitedByRaw.toUpperCase() : null;

            // ۲. ثبت اطلاعات در جدول students از طریق RPC امن یا Upsert مستقیم
            const { data: rpcRes, error: rpcError } = await supabaseClient.rpc('register_qotbnama_step1', {
                p_full_name: fullName,
                p_phone: phone,
                p_grade: grade,
                p_major: major,
                p_password: password,
                p_sec_question: secQuestion,
                p_sec_answer: secAnswer,
                p_invited_by: invitedBy
            });

            if (rpcError || (rpcRes && !rpcRes.success)) {
                if (rpcRes && rpcRes.error) throw new Error(rpcRes.error);
                // پشتیبان: ثبت مستقیم
                const refCode = 'RH-' + Math.random().toString(36).substring(2, 7).toUpperCase();
                const { error: directErr } = await supabaseClient.from('students').upsert([{
                    full_name: fullName,
                    national_id: phone,
                    phone_number: phone,
                    grade: grade,
                    major: major,
                    password: password,
                    security_question: secQuestion,
                    security_answer: secAnswer,
                    invited_by: invitedBy,
                    referral_code: refCode,
                    status: 'draft'
                }], { onConflict: 'national_id' });

                if (directErr) throw new Error('خطا در ذخیره پرونده: ' + directErr.message);
            }

            // ۳. ذخیره شناسه موقت و هدایت به مرحله ۲ (انتخاب طرح)
            Storage.set('temp_reg_nid', phone);
            Storage.set('qotbnama_phone', phone);
            if (invitedBy) {
                Storage.set('temp_referral_code', invitedBy);
            } else {
                Storage.remove('temp_referral_code');
            }

            Router.goToAuthView('register-step2');

        } catch (err) {
            UI.showAlertBox('regStep1Alert', err.message || 'خطا در تشکیل پرونده.', 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<span>تایید و ادامه به مرحله بعد</span><i data-lucide="arrow-left" class="icon"></i>';
            UI.refreshIcons();
        }
    },

    // ==========================================================================
    // 🔑 ۳. بازیابی رمز عبور (۲ مرحله‌ای درون مودال)
    // ==========================================================================
    async fetchSecurityQuestion() {
        const identity = UI.toEngDigits(document.getElementById('forgotIdentityInput')?.value.trim() || '');
        if (!identity) {
            return UI.showAlertBox('forgotModalAlert', 'لطفاً شماره موبایل یا کد ملی خود را وارد کنید.', 'error');
        }

        const btn = document.getElementById('btnForgotFetchQ');
        btn.disabled = true;
        btn.innerText = 'در حال جستجو...';
        UI.showAlertBox('forgotModalAlert', '');

        try {
            const { data: question, error } = await supabaseClient.rpc('get_student_security_question', {
                p_national_id: identity
            });

            if (error || !question) {
                throw new Error('کاربری با این مشخصات یافت نشد یا سوال امنیتی ثبت نشده است.');
            }

            this.forgotTargetIdentity = identity;
            document.getElementById('lblForgotSecQuestion').innerText = question;
            document.getElementById('forgotStep1Box').style.display = 'none';
            document.getElementById('forgotStep2Box').style.display = 'block';
        } catch (err) {
            UI.showAlertBox('forgotModalAlert', err.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerText = 'دریافت سوال امنیتی';
        }
    },

    async submitPasswordReset() {
        const answer = document.getElementById('forgotSecAnswerInput')?.value.trim() || '';
        const newPass = UI.toEngDigits(document.getElementById('forgotNewPasswordInput')?.value.trim() || '');

        if (!answer || !newPass) {
            return UI.showAlertBox('forgotModalAlert', 'لطفاً پاسخ امنیتی و رمز عبور جدید را وارد کنید.', 'error');
        }
        if (newPass.length < 6) {
            return UI.showAlertBox('forgotModalAlert', 'رمز عبور جدید باید حداقل ۶ کاراکتر باشد.', 'error');
        }

        const btn = document.getElementById('btnForgotResetSubmit');
        btn.disabled = true;
        btn.innerText = 'در حال تغییر رمز...';
        UI.showAlertBox('forgotModalAlert', '');

        try {
            const { error } = await supabaseClient.rpc('reset_student_password', {
                p_national_id: this.forgotTargetIdentity,
                p_security_answer: answer,
                p_new_password: newPass
            });

            if (error) throw new Error(error.message || 'پاسخ امنیتی اشتباه است.');

            UI.showAlertBox('forgotModalAlert', 'رمز عبور با موفقیت تغییر کرد. اکنون می‌توانید وارد شوید.', 'success');
            setTimeout(() => {
                UI.closeModals();
                document.getElementById('forgotStep1Box').style.display = 'block';
                document.getElementById('forgotStep2Box').style.display = 'none';
                const loginInp = document.getElementById('loginUsername');
                if (loginInp) loginInp.value = this.forgotTargetIdentity;
            }, 1600);
        } catch (err) {
            UI.showAlertBox('forgotModalAlert', err.message, 'error');
        } finally {
            btn.disabled = false;
            btn.innerText = 'ثبت رمز عبور جدید';
        }
    },

    // ==========================================================================
    // 🚪 ۴. خروج ایمن از حساب کاربری
    // ==========================================================================
    async logout() {
        UI.closeModals();
        try {
            await supabaseClient.auth.signOut();
        } catch (_) {}

        Storage.remove('qotbnama_user_id');
        Storage.remove('national_id');
        Storage.remove('qotbnama_phone');
        Storage.remove('qotbnama_full_name');
        Storage.remove('qotbnama_plan');
        Storage.remove('qotbnama_user_mode');
        Storage.remove('temp_reg_nid');

        AppState.userId = null;
        Router.showAuthShell('login');
        UI.showToast('با موفقیت از حساب کاربری خارج شدید.', 'info');
    }
};

window.AuthModule = AuthModule;
