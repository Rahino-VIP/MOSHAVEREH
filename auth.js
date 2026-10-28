/* ==========================================================================
   🔐 ماژول احراز هویت، ثبت‌نام و همگام‌سازی یکپارچه پانسیون و مشاوره (js/auth.js)
   شامل:
   ۱. ورود دوگانه هوشمند (@rahinovip.ir و @rahino.ir)
   ۲. همگام‌سازی خودکار پرونده بچه‌های پانسیون در جدول students (رفع قطعی مشکل خرید اشتراک)
   ۳. ثبت‌نام مرحله اول (بدون نیاز به گوگل اسکریپت)
   ۴. بازیابی و تغییر رمز عبور (پشتیبانی از هر دو جدول students و users)
   ========================================================================== */

const AuthModule = {
    forgotIdentityGlobal: null,

    // ======================================================================
    // 🎯 ۱. انتخاب دکمه‌های کپسولی پایه، رشته و نحوه آشنایی (Segmented Pills)
    // ======================================================================
    selectPill(hiddenInputId, value, btnEl) {
        const input = document.getElementById(hiddenInputId);
        if (input) input.value = value;

        if (btnEl && btnEl.parentElement) {
            btnEl.parentElement.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('active'));
            btnEl.classList.add('active');
        }
    },

    // ======================================================================
    // 🚪 ۲. ورود هوشمند دوگانه (پشتیبانی همزمان از مشاوره و پانسیون ماهانه)
    // ======================================================================
    async handleLogin() {
        const rawInput = document.getElementById('loginUsername')?.value.trim();
        const password = document.getElementById('loginPassword')?.value.trim();
        const identity = UI.toEngDigits(rawInput);

        if (!identity || !password) {
            return UI.showAlertBox('loginAlert', 'لطفاً شماره موبایل (یا کد ملی) و رمز عبور را وارد کنید.', 'error');
        }

        const btn = document.getElementById('btnLoginSubmit');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span>در حال بررسی و ورود...</span>';
        }
        UI.showAlertBox('loginAlert', '');

        try {
            // ۱. تلاش برای ورود در هسته Auth سوپابیس با هر دو دامنه (@rahinovip.ir و @rahino.ir)
            let authSession = null;
            let loggedInDomain = 'rahinovip.ir';

            const emailConsult = `${identity}@rahinovip.ir`;
            const emailPansion = `${identity}@rahino.ir`;

            let { data: authData1, error: authErr1 } = await supabaseClient.auth.signInWithPassword({
                email: emailConsult,
                password: password
            });

            if (!authErr1 && authData1?.session) {
                authSession = authData1.session;
                loggedInDomain = 'rahinovip.ir';
            } else {
                // تلاش با دامنه پانسیون (@rahino.ir)
                let { data: authData2, error: authErr2 } = await supabaseClient.auth.signInWithPassword({
                    email: emailPansion,
                    password: password
                });

                if (!authErr2 && authData2?.session) {
                    authSession = authData2.session;
                    loggedInDomain = 'rahino.ir';
                }
            }

            // ۲. اگر کاربر در جدول قدیمی بود ولی هنوز در Supabase Auth ثبت نشده بود (خودکارسازی مهاجرت)
            if (!authSession) {
                const migratedSession = await this.tryLegacyMigrationLogin(identity, password);
                if (!migratedSession) {
                    throw new Error('شماره موبایل یا رمز عبور اشتباه است!');
                }
                authSession = migratedSession.session;
                loggedInDomain = migratedSession.domain;
            }

            AppState.userAuthToken = authSession.access_token;

            // ۳. تضمین وجود پرونده استاندارد در جدول students (حیاتی برای اینکه بچه‌های پانسیون بتوانند اشتراک بخرند!)
            const studentProfile = await this.ensureStudentRecordExists(identity, password, loggedInDomain);

            // ۴. بررسی اشتراک‌های فعال در هر دو جدول (مشاوره و پانسیون ماهانه)
            const userPhone = studentProfile.phone_number || identity;
            const userNid = studentProfile.national_id || identity;

            const [conSubsRes, panSubsRes] = await Promise.all([
                supabaseClient
                    .from('subscriptions')
                    .select('*')
                    .or(`student_nid.eq.${userNid},user_phone.eq.${userPhone}`)
                    .eq('service_category', 'consult')
                    .eq('status', 'active'),
                supabaseClient
                    .from('pan_monthly_subs')
                    .select('*')
                    .eq('phone_number', userPhone)
                    .eq('status', 'active')
            ]);

            const hasActiveConsult = Array.isArray(conSubsRes.data) && conSubsRes.data.length > 0;
            const hasActivePansionMonthly = Array.isArray(panSubsRes.data) && panSubsRes.data.length > 0;

            // ۵. مسیریابی هوشمند بر اساس وضعیت کاربر
            if (studentProfile.status === 'pending' && !hasActiveConsult && !hasActivePansionMonthly) {
                UI.showAlertBox(
                    'loginAlert',
                    '⏳ فیش واریزی شما ثبت شده و در صف تایید مدیریت قرار دارد. لطفاً تا بررسی فیش صبور باشید.',
                    'success'
                );
                return;
            }

            // اگر دانش‌آموز اشتراک مشاوره دارد، یا عضو فعال پانسیون ماهانه است، یا وضعیتش active است -> ورود مستقیم به اپ
            if (hasActiveConsult || hasActivePansionMonthly || studentProfile.status === 'active') {
                // اگر عضو پانسیون ماهانه است ولی وضعیت جدول students او draft مانده بود، active شود
                if (hasActivePansionMonthly && studentProfile.status !== 'active') {
                    await supabaseClient
                        .from('students')
                        .update({ status: 'active' })
                        .eq('national_id', userNid);
                    studentProfile.status = 'active';
                }

                const planBadge = hasActiveConsult
                    ? conSubsRes.data[0].service_type
                    : (hasActivePansionMonthly ? 'pansion_free' : 'free');
                const userMode = hasActiveConsult
                    ? 'consult'
                    : (hasActivePansionMonthly ? 'pansion_monthly' : 'free');

                // ذخیره در حافظه و AppState
                Storage.set('qotbnama_user_id', userNid);
                Storage.set('national_id', userNid);
                Storage.set('qotbnama_phone', userPhone);
                Storage.set('qotbnama_full_name', studentProfile.full_name || 'دانش‌آموز');
                Storage.set('qotbnama_plan', planBadge);
                Storage.set('qotbnama_user_mode', userMode);
                Storage.remove('temp_reg_nid');

                AppState.userId = userNid;
                AppState.userPhone = userPhone;
                AppState.fullName = studentProfile.full_name || 'دانش‌آموز';
                AppState.planType = planBadge;
                AppState.userMode = userMode;

                await AppCore.bootstrapLoggedInUser();
                Router.showAppShell('home');
                UI.showToast(`خوش آمدی ${AppState.fullName.split(' ')[0]} جان!`, 'success');
                return;
            }

            // اگر کاربر تازه مرحله ۱ ثبت‌نام مشاوره را پر کرده (draft یا rejected) و عضو پانسیون هم نیست -> هدایت به مرحله ۲ (خرید طرح)
            Storage.set('temp_reg_nid', userNid);
            Storage.set('qotbnama_phone', userPhone);
            Router.goToAuthView('register-step2');

        } catch (err) {
            UI.showAlertBox('loginAlert', err.message || 'خطا در ورود به حساب کاربری', 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<i data-lucide="log-in" class="icon"></i><span>ورود به حساب کاربری</span>';
                UI.refreshIcons();
            }
        }
    },

    // ======================================================================
    // 🔄 ۳. همگام‌سازی و ساخت خودکار پرونده در جدول students برای بچه‌های پانسیون
    // مهم: چون جدول invoices و subscriptions به جدول students.national_id کلید خارجی دارند،
    // این تابع تضمین می‌کند که هر دانش‌آموز پانسیون یک رکورد معتبر با کلید identity در students دارد
    // تا هر زمان خواست اشتراک مشاوره بخرد، دیتابیس هیچ خطای Foreign Key یا RLS ندهد.
    // ======================================================================
    async ensureStudentRecordExists(identity, password, loggedInDomain) {
        // ۱. ابتدا بررسی با تابع RPC دیتابیس (اگر قبلاً در SQL نصب شده باشد)
        try {
            await supabaseClient.rpc('resolve_and_sync_student_login', { p_identity: identity });
        } catch (_) {}

        // ۲. جستجو در جدول students با national_id یا phone_number
        const { data: existingStudents } = await supabaseClient
            .from('students')
            .select('*')
            .or(`national_id.eq.${identity},phone_number.eq.${identity}`)
            .limit(1);

        if (existingStudents && existingStudents.length > 0) {
            const st = existingStudents[0];
            // نکته بسیار مهم برای RLS: در قوانین RLS سوپابیس، شرط دسترسی برابر بودن national_id با بخش اول ایمیل (identity) است.
            // اگر دانش‌آموز پانسیون قبلاً با کد ملی ۱۰ رقمی در students ثبت شده ولی الان با موبایل ۱۱ رقمی (@rahino.ir) وارد شده،
            // یا برعکس، باید رکوردی با national_id = identity داشته باشد تا بتواند فاکتور ثبت کند.
            if (st.national_id === identity) {
                return st;
            }
        }

        // ۳. اگر در جدول students نبود، اطلاعاتش را از جدول users یا pan_users (پانسیون) می‌خوانیم
        let pansionUser = null;
        const { data: uData } = await supabaseClient
            .from('users')
            .select('*')
            .or(`phone_number.eq.${identity},national_id.eq.${identity}`)
            .limit(1);

        if (uData && uData.length > 0) {
            pansionUser = uData[0];
        } else {
            const { data: puData } = await supabaseClient
                .from('pan_users')
                .select('*')
                .eq('phone_number', identity)
                .limit(1);
            if (puData && puData.length > 0) {
                pansionUser = puData[0];
            }
        }

        const randomRef = 'RH-' + Math.random().toString(36).substring(2, 7).toUpperCase();
        const normalizedGrade = pansionUser?.grade && ['دهم', 'یازدهم', 'دوازدهم', 'پشت کنکوری'].includes(pansionUser.grade)
            ? pansionUser.grade
            : 'دوازدهم';
        const normalizedMajor = pansionUser?.major && (pansionUser.major.includes('ریاضی') || pansionUser.major.includes('انسانی') || pansionUser.major.includes('تجربی'))
            ? (pansionUser.major.includes('ریاضی') ? 'ریاضی' : (pansionUser.major.includes('انسانی') ? 'انسانی' : 'تجربی'))
            : 'تجربی';

        const newStudentPayload = {
            full_name: pansionUser?.full_name || 'دانش‌آموز راهینو',
            national_id: identity,
            phone_number: pansionUser?.phone_number || (identity.length === 11 ? identity : '09000000000'),
            grade: normalizedGrade,
            major: normalizedMajor,
            school_name: pansionUser?.school_name || pansionUser?.school || null,
            province: pansionUser?.province || null,
            city: pansionUser?.city || null,
            father_phone: pansionUser?.father_phone && pansionUser.father_phone.length === 11 ? pansionUser.father_phone : null,
            mother_phone: pansionUser?.mother_phone && pansionUser.mother_phone.length === 11 ? pansionUser.mother_phone : null,
            password: password || pansionUser?.password || '123456',
            security_question: pansionUser?.security_question || 'نام بهترین دوست دوران کودکی شما چیست؟',
            security_answer: pansionUser?.security_answer || 'راهینو',
            referral_code: pansionUser?.referral_code || randomRef,
            wallet_balance: Number(pansionUser?.wallet_balance) || 0,
            status: loggedInDomain === 'rahino.ir' ? 'active' : 'draft'
        };

        const { data: insertedStudent, error: insErr } = await supabaseClient
            .from('students')
            .upsert([newStudentPayload], { onConflict: 'national_id' })
            .select('*')
            .single();

        if (!insErr && insertedStudent) {
            return insertedStudent;
        }

        return newStudentPayload;
    },

    // پشتیبانی از کاربرانی که در جدول users یا students هستند ولی هنوز اکانت Auth ندارند
    async tryLegacyMigrationLogin(identity, password) {
        try {
            // بررسی در جدول users پانسیون
            const { data: uRows } = await supabaseClient
                .from('users')
                .select('phone_number, password')
                .eq('phone_number', identity)
                .limit(1);

            if (uRows && uRows.length > 0 && UI.toEngDigits(uRows[0].password) === UI.toEngDigits(password)) {
                const email = `${identity}@rahino.ir`;
                const { data: signUpData, error: signUpErr } = await supabaseClient.auth.signUp({
                    email: email,
                    password: password
                });
                if (!signUpErr && signUpData?.session) {
                    return { session: signUpData.session, domain: 'rahino.ir' };
                }
            }
        } catch (_) {}
        return null;
    },

    // ======================================================================
    // 📝 ۴. ثبت‌نام مرحله اول (تشکیل پرونده مستقیم در سوپابیس بدون گوگل اسکریپت)
    // ======================================================================
    async submitStep1() {
        const fullName = document.getElementById('regFullName')?.value.trim();
        const phone = UI.toEngDigits(document.getElementById('regPhone')?.value.trim());
        const grade = document.getElementById('regGrade')?.value;
        const major = document.getElementById('regMajor')?.value;
        const referralInput = UI.toEngDigits(document.getElementById('regReferralCodeInput')?.value.trim().toUpperCase());
        const password = UI.toEngDigits(document.getElementById('regPassword')?.value.trim());
        const secQuestion = document.getElementById('regSecQuestion')?.value;
        const secAnswer = document.getElementById('regSecAnswer')?.value.trim();

        // اعتبارسنجی دقیق درون‌برنامه‌ای
        if (!fullName || !phone) {
            return UI.showAlertBox('regStep1Alert', 'لطفاً نام و نام خانوادگی و شماره موبایل خود را وارد کنید.', 'error');
        }
        if (phone.length !== 11 || !phone.startsWith('09')) {
            return UI.showAlertBox('regStep1Alert', 'شماره موبایل باید ۱۱ رقم و با 09 شروع شود.', 'error');
        }
        if (!grade || !major) {
            return UI.showAlertBox('regStep1Alert', 'لطفاً پایه و رشته تحصیلی خود را از گزینه‌ها انتخاب کنید.', 'error');
        }
        if (!password || password.length < 6) {
            return UI.showAlertBox('regStep1Alert', 'رمز عبور باید حداقل ۶ کاراکتر باشد.', 'error');
        }
        if (!secAnswer) {
            return UI.showAlertBox('regStep1Alert', 'لطفاً پاسخ سوال امنیتی را جهت بازیابی رمز در آینده وارد کنید.', 'error');
        }

        const btn = document.getElementById('btnRegStep1Submit');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span>در حال تشکیل پرونده...</span>';
        }
        UI.showAlertBox('regStep1Alert', '');

        try {
            // ۱. ثبت‌نام یا ورود در Supabase Auth
            const dummyEmail = `${phone}@rahinovip.ir`;
            let authSession = null;

            const { data: signUpData, error: signUpError } = await supabaseClient.auth.signUp({
                email: dummyEmail,
                password: password
            });

            if (signUpError) {
                // شاید این شماره قبلاً در پانسیون (@rahino.ir) یا مرحله ۱ قبلی ثبت‌نام کرده باشد؛ تلاش برای ورود:
                const { data: signIn1 } = await supabaseClient.auth.signInWithPassword({
                    email: dummyEmail,
                    password: password
                });
                if (signIn1?.session) {
                    authSession = signIn1.session;
                } else {
                    const { data: signIn2 } = await supabaseClient.auth.signInWithPassword({
                        email: `${phone}@rahino.ir`,
                        password: password
                    });
                    if (signIn2?.session) {
                        authSession = signIn2.session;
                    } else {
                        throw new Error('این شماره موبایل قبلاً در سیستم ثبت شده است. از صفحه ورود وارد شوید یا از فراموشی رمز استفاده کنید.');
                    }
                }
            } else {
                authSession = signUpData?.session;
            }

            if (authSession) {
                AppState.userAuthToken = authSession.access_token;
            }

            // ۲. تشکیل پرونده در جدول students (ابتدا از طریق تابع امن RPC و در صورت عدم وجود، مستقیم)
            const randomRef = 'RH-' + Math.random().toString(36).substring(2, 7).toUpperCase();
            let step1Saved = false;

            try {
                const { data: rpcRes, error: rpcErr } = await supabaseClient.rpc('register_qotbnama_step1', {
                    p_full_name: fullName,
                    p_phone: phone,
                    p_grade: grade,
                    p_major: major,
                    p_password: password,
                    p_security_question: secQuestion,
                    p_security_answer: secAnswer,
                    p_invited_by: referralInput || null
                });
                if (!rpcErr && rpcRes && rpcRes.success) {
                    step1Saved = true;
                } else if (rpcRes && !rpcRes.success) {
                    throw new Error(rpcRes.error);
                }
            } catch (innerErr) {
                if (innerErr.message && innerErr.message.includes('قبلاً')) throw innerErr;
            }

            if (!step1Saved) {
                const studentPayload = {
                    full_name: fullName,
                    national_id: phone,
                    phone_number: phone,
                    grade: grade,
                    major: major,
                    password: password,
                    security_question: secQuestion,
                    security_answer: secAnswer,
                    referral_code: randomRef,
                    invited_by: referralInput || null,
                    status: 'draft'
                };

                const { error: upsertErr } = await supabaseClient
                    .from('students')
                    .upsert([studentPayload], { onConflict: 'national_id' });

                if (upsertErr) throw new Error('خطا در ذخیره پرونده: ' + upsertErr.message);
            }

            // ۳. ذخیره شناسه موقت و هدایت به مرحله ۲ (انتخاب طرح مشاوره)
            Storage.set('temp_reg_nid', phone);
            Storage.set('qotbnama_phone', phone);
            Storage.set('qotbnama_full_name', fullName);
            if (referralInput) {
                Storage.set('temp_referral_code', referralInput);
            } else {
                Storage.remove('temp_referral_code');
            }

            AppState.userId = phone;
            AppState.userPhone = phone;
            AppState.fullName = fullName;
            AppState.studentGrade = grade.includes('یازدهم') ? 'یازدهم' : (grade.includes('دهم') ? 'دهم' : 'دوازدهم');
            AppState.studentMajor = major;

            UI.showToast('پرونده شما با موفقیت تشکیل شد. اکنون طرح مشاوره را انتخاب کنید.', 'success');
            Router.goToAuthView('register-step2');

        } catch (err) {
            UI.showAlertBox('regStep1Alert', err.message || 'خطا در تشکیل پرونده', 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<span>تایید و ادامه به مرحله بعد</span><i data-lucide="arrow-left" class="icon"></i>';
                UI.refreshIcons();
            }
        }
    },

    // ======================================================================
    // 🛒 ۵. هدایت مستقیم بچه‌های پانسیون از داخل اپ به صفحه خرید اشتراک مشاوره
    // ======================================================================
    goToBuySubscription() {
        const currentIdentity = AppState.userId || Storage.get('qotbnama_user_id');
        if (currentIdentity) {
            Storage.set('temp_reg_nid', currentIdentity);
        }
        UI.closeModals();
        Router.showAuthShell('register-step2');
    },

    // ======================================================================
    // 🔑 ۶. فراموشی رمز عبور (دریافت سوال امنیتی و تغییر رمز همزمان در هر دو دامنه)
    // ======================================================================
    async fetchSecurityQuestion() {
        const rawVal = document.getElementById('forgotIdentityInput')?.value.trim();
        const identity = UI.toEngDigits(rawVal);

        if (!identity) {
            return UI.showAlertBox('forgotModalAlert', 'لطفاً شماره موبایل یا کد ملی خود را وارد کنید.', 'error');
        }

        const btn = document.getElementById('btnForgotFetchQ');
        if (btn) {
            btn.disabled = true;
            btn.innerText = 'در حال جستجو...';
        }
        UI.showAlertBox('forgotModalAlert', '');

        try {
            const { data: question, error } = await supabaseClient.rpc('get_student_security_question', {
                p_national_id: identity
            });

            if (error) throw new Error('خطا در ارتباط با دیتابیس.');
            if (!question) throw new Error('این شماره در سیستم یافت نشد یا سوال امنیتی ثبت نکرده است.');

            this.forgotIdentityGlobal = identity;
            document.getElementById('lblForgotSecQuestion').innerText = question;
            document.getElementById('forgotStep1Box').style.display = 'none';
            document.getElementById('forgotStep2Box').style.display = 'block';

        } catch (err) {
            UI.showAlertBox('forgotModalAlert', err.message, 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerText = 'دریافت سوال امنیتی';
            }
        }
    },

    async submitPasswordReset() {
        const answer = document.getElementById('forgotSecAnswerInput')?.value.trim();
        const newPass = UI.toEngDigits(document.getElementById('forgotNewPasswordInput')?.value.trim());

        if (!answer || !newPass) {
            return UI.showAlertBox('forgotModalAlert', 'لطفاً پاسخ امنیتی و رمز عبور جدید را وارد کنید.', 'error');
        }
        if (newPass.length < 6) {
            return UI.showAlertBox('forgotModalAlert', 'رمز عبور جدید باید حداقل ۶ کاراکتر باشد.', 'error');
        }

        const btn = document.getElementById('btnForgotResetSubmit');
        if (btn) {
            btn.disabled = true;
            btn.innerText = 'در حال ثبت رمز جدید...';
        }
        UI.showAlertBox('forgotModalAlert', '');

        try {
            const { error } = await supabaseClient.rpc('reset_student_password', {
                p_national_id: this.forgotIdentityGlobal,
                p_security_answer: answer,
                p_new_password: newPass
            });

            if (error) throw new Error(error.message || 'پاسخ امنیتی اشتباه است.');

            UI.showAlertBox('forgotModalAlert', '✅ رمز عبور با موفقیت تغییر یافت.', 'success');
            setTimeout(() => {
                UI.closeModals();
                document.getElementById('forgotStep1Box').style.display = 'block';
                document.getElementById('forgotStep2Box').style.display = 'none';
                const loginInp = document.getElementById('loginUsername');
                const passInp = document.getElementById('loginPassword');
                if (loginInp) loginInp.value = this.forgotIdentityGlobal;
                if (passInp) passInp.value = '';
            }, 1400);

        } catch (err) {
            UI.showAlertBox('forgotModalAlert', err.message, 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerText = 'ثبت رمز عبور جدید';
            }
        }
    },

    // ======================================================================
    // 🚪 ۷. خروج امن از حساب کاربری (بدون رفرش صفحه)
    // ======================================================================
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
        AppState.currentScheduleObj = null;
        AppState.dailyReports = [];

        Router.showAuthShell('login');
        UI.showToast('با موفقیت از حساب کاربری خارج شدید.', 'info');
    }
};

window.AuthModule = AuthModule;
