/* ==========================================================================
   🔐 ماژول احراز هویت و ورود مستقیم Freemium (js/auth.js)
   شامل:
   ۱. ورود دوگانه هوشمند (@rahinovip.ir و @rahino.ir)
   ۲. همگام‌سازی خودکار پرونده بچه‌های پانسیون در جدول students و اعطای اشتراک پلاس هدیه
   ۳. ثبت‌نام ۱ مرحله‌ای سریع و ورود مستقیم به محیط اپلیکیشن (با طرح رایگان و سهمیه تست)
   ========================================================================== */

const AuthModule = {
    forgotIdentityGlobal: null,

    selectPill(hiddenInputId, value, btnEl) {
        const input = document.getElementById(hiddenInputId);
        if (input) input.value = value;
        if (btnEl && btnEl.parentElement) {
            btnEl.parentElement.querySelectorAll('.pill-btn').forEach(b => b.classList.remove('active'));
            btnEl.classList.add('active');
        }
    },

    // ======================================================================
    // 🚪 ۱. ورود هوشمند و هدایت مستقیم همه کاربران به داخل اپلیکیشن
    // ======================================================================
    async handleLogin() {
        const rawInput = document.getElementById('loginUsername')?.value.trim();
        const password = document.getElementById('loginPassword')?.value.trim();
        const identity = UI.toEngDigits(rawInput);

        if (!identity || !password) {
            return UI.showAlertBox('loginAlert', 'لطفاً شماره موبایل و رمز عبور را وارد کنید.', 'error');
        }

        const btn = document.getElementById('btnLoginSubmit');
        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<span>در حال بررسی و ورود...</span>';
        }
        UI.showAlertBox('loginAlert', '');

        try {
            let authSession = null;
            let loggedInDomain = 'rahinovip.ir';

            const emailConsult = `${identity}@rahinovip.ir`;
            const emailPansion = `${identity}@rahino.ir`;

            const { data: authData1, error: authErr1 } = await supabaseClient.auth.signInWithPassword({
                email: emailConsult,
                password: password
            });

            if (!authErr1 && authData1?.session) {
                authSession = authData1.session;
                loggedInDomain = 'rahinovip.ir';
            } else {
                const { data: authData2, error: authErr2 } = await supabaseClient.auth.signInWithPassword({
                    email: emailPansion,
                    password: password
                });
                if (!authErr2 && authData2?.session) {
                    authSession = authData2.session;
                    loggedInDomain = 'rahino.ir';
                }
            }

            if (!authSession) {
                const migratedSession = await this.tryLegacyMigrationLogin(identity, password);
                if (!migratedSession) {
                    throw new Error('شماره موبایل یا رمز عبور اشتباه است!');
                }
                authSession = migratedSession.session;
                loggedInDomain = migratedSession.domain;
            }

            AppState.userAuthToken = authSession.access_token;

            // تضمین وجود پرونده در جدول students
            const studentProfile = await this.ensureStudentRecordExists(identity, password, loggedInDomain);
            const userPhone = studentProfile.phone_number || identity;
            const userNid = studentProfile.national_id || identity;

            // اگر دانش‌آموز عضو فعال ماهانه پانسیون است و هنوز اشتراک پلاس هدیه‌اش ثبت نشده، ثبت شود
            const { data: panSubs } = await supabaseClient
                .from('pan_monthly_subs')
                .select('*')
                .eq('phone_number', userPhone)
                .eq('status', 'active')
                .limit(1);

            if (panSubs && panSubs.length > 0) {
                const { data: existingConSub } = await supabaseClient
                    .from('subscriptions')
                    .select('id')
                    .or(`student_nid.eq.${userNid},user_phone.eq.${userPhone}`)
                    .eq('service_category', 'consult')
                    .eq('status', 'active')
                    .limit(1);

                if (!existingConSub || existingConSub.length === 0) {
                    await supabaseClient.from('subscriptions').insert([{
                        student_nid: userNid,
                        user_phone: userPhone,
                        service_category: 'consult',
                        service_type: 'پلاس',
                        start_date: panSubs[0].start_date || new Date().toISOString().split('T')[0],
                        end_date: panSubs[0].end_date || new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
                        status: 'active',
                        base_total_value: 0,
                        actual_paid_value: 0
                    }]);
                }
            }

            // فعال کردن وضعیت دانش‌آموز و ورود مستقیم به میز کار
            if (studentProfile.status !== 'active') {
                await supabaseClient.from('students').update({ status: 'active' }).eq('national_id', userNid);
            }

            Storage.set('qotbnama_user_id', userNid);
            Storage.set('national_id', userNid);
            Storage.set('qotbnama_phone', userPhone);
            Storage.set('qotbnama_full_name', studentProfile.full_name || 'دانش‌آموز');
            Storage.remove('temp_reg_nid');

            AppState.userId = userNid;
            AppState.userPhone = userPhone;
            AppState.fullName = studentProfile.full_name || 'دانش‌آموز';

            await AppCore.bootstrapLoggedInUser();
            Router.showAppShell('home');
            UI.showToast(`خوش آمدی ${AppState.fullName.split(' ')[0]} جان!`, 'success');

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

    async ensureStudentRecordExists(identity, password, loggedInDomain) {
        try {
            await supabaseClient.rpc('resolve_and_sync_student_login', { p_identity: identity });
        } catch (_) {}

        const { data: existingStudents } = await supabaseClient
            .from('students')
            .select('*')
            .or(`national_id.eq.${identity},phone_number.eq.${identity}`)
            .limit(1);

        if (existingStudents && existingStudents.length > 0 && existingStudents[0].national_id === identity) {
            return existingStudents[0];
        }

        let pansionUser = null;
        const { data: uData } = await supabaseClient
            .from('users')
            .select('*')
            .or(`phone_number.eq.${identity},national_id.eq.${identity}`)
            .limit(1);

        if (uData && uData.length > 0) {
            pansionUser = uData[0];
        }

        const randomRef = 'RH-' + Math.random().toString(36).substring(2, 7).toUpperCase();
        const normalizedGrade = pansionUser?.grade && ['دهم', 'یازدهم', 'دوازدهم', 'پشت کنکوری'].includes(pansionUser.grade)
            ? pansionUser.grade
            : 'دوازدهم';
        const normalizedMajor = pansionUser?.major && pansionUser.major.includes('ریاضی')
            ? 'ریاضی'
            : (pansionUser?.major && pansionUser.major.includes('انسانی') ? 'انسانی' : 'تجربی');

        const newStudentPayload = {
            full_name: pansionUser?.full_name || 'دانش‌آموز راهینو',
            national_id: identity,
            phone_number: pansionUser?.phone_number || (identity.length === 11 ? identity : '09000000000'),
            grade: normalizedGrade,
            major: normalizedMajor,
            password: password || pansionUser?.password || '123456',
            security_question: pansionUser?.security_question || 'نام بهترین دوست دوران کودکی شما چیست؟',
            security_answer: pansionUser?.security_answer || 'راهینو',
            referral_code: pansionUser?.referral_code || randomRef,
            wallet_balance: Number(pansionUser?.wallet_balance) || 0,
            status: 'active'
        };

        const { data: insertedStudent } = await supabaseClient
            .from('students')
            .upsert([newStudentPayload], { onConflict: 'national_id' })
            .select('*')
            .single();

        return insertedStudent || newStudentPayload;
    },

    async tryLegacyMigrationLogin(identity, password) {
        try {
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
    // 📝 ۲. ثبت‌نام مرحله ۱ و ورود مستقیم به داخل اپلیکیشن (Freemium Onboarding)
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
            btn.innerHTML = '<span>در حال ساخت حساب و ورود به برنامه...</span>';
        }
        UI.showAlertBox('regStep1Alert', '');

        try {
            const dummyEmail = `${phone}@rahinovip.ir`;
            let authSession = null;

            const { data: signUpData, error: signUpError } = await supabaseClient.auth.signUp({
                email: dummyEmail,
                password: password
            });

            if (signUpError) {
                const { data: signIn1 } = await supabaseClient.auth.signInWithPassword({
                    email: dummyEmail,
                    password: password
                });
                if (signIn1?.session) {
                    authSession = signIn1.session;
                } else {
                    throw new Error('این شماره موبایل قبلاً ثبت شده است. از صفحه ورود وارد شوید.');
                }
            } else {
                authSession = signUpData?.session;
            }

            if (authSession) {
                AppState.userAuthToken = authSession.access_token;
            }

            const randomRef = 'RH-' + Math.random().toString(36).substring(2, 7).toUpperCase();
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
                status: 'active' // ورود فوری با سطح دسترسی رایگان
            };

            const { error: upsertErr } = await supabaseClient
                .from('students')
                .upsert([studentPayload], { onConflict: 'national_id' });

            if (upsertErr) throw new Error('خطا در ذخیره پرونده: ' + upsertErr.message);

            Storage.set('qotbnama_user_id', phone);
            Storage.set('national_id', phone);
            Storage.set('qotbnama_phone', phone);
            Storage.set('qotbnama_full_name', fullName);
            if (referralInput) Storage.set('temp_referral_code', referralInput);

            AppState.userId = phone;
            AppState.userPhone = phone;
            AppState.fullName = fullName;

            await AppCore.bootstrapLoggedInUser();
            Router.showAppShell('home');
            UI.showToast('حساب شما فعال شد! به قطب‌نمای راهینو خوش آمدید.', 'success');

        } catch (err) {
            UI.showAlertBox('regStep1Alert', err.message || 'خطا در تشکیل پرونده', 'error');
        } finally {
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = '<span>تایید و ورود به برنامه</span><i data-lucide="arrow-left" class="icon"></i>';
                UI.refreshIcons();
            }
        }
    },

    // هدایت به فروشگاه برای خرید یا ارتقای اشتراک (پلاس / مشاوره)
    goToBuySubscription() {
        const currentIdentity = AppState.userId || Storage.get('qotbnama_user_id');
        if (currentIdentity) {
            Storage.set('temp_reg_nid', currentIdentity);
        }
        UI.closeModals();
        Router.showAuthShell('register-step2');
    },

    async fetchSecurityQuestion() {
        const rawVal = document.getElementById('forgotIdentityInput')?.value.trim();
        const identity = UI.toEngDigits(rawVal);

        if (!identity) {
            return UI.showAlertBox('forgotModalAlert', 'لطفاً شماره موبایل خود را وارد کنید.', 'error');
        }

        const btn = document.getElementById('btnForgotFetchQ');
        if (btn) { btn.disabled = true; btn.innerText = 'در حال جستجو...'; }
        UI.showAlertBox('forgotModalAlert', '');

        try {
            const { data: question, error } = await supabaseClient.rpc('get_student_security_question', {
                p_national_id: identity
            });
            if (error) throw new Error('خطا در ارتباط با دیتابیس.');
            if (!question) throw new Error('این شماره در سیستم یافت نشد.');

            this.forgotIdentityGlobal = identity;
            document.getElementById('lblForgotSecQuestion').innerText = question;
            document.getElementById('forgotStep1Box').style.display = 'none';
            document.getElementById('forgotStep2Box').style.display = 'block';
        } catch (err) {
            UI.showAlertBox('forgotModalAlert', err.message, 'error');
        } finally {
            if (btn) { btn.disabled = false; btn.innerText = 'دریافت سوال امنیتی'; }
        }
    },

    async submitPasswordReset() {
        const answer = document.getElementById('forgotSecAnswerInput')?.value.trim();
        const newPass = UI.toEngDigits(document.getElementById('forgotNewPasswordInput')?.value.trim());

        if (!answer || !newPass || newPass.length < 6) {
            return UI.showAlertBox('forgotModalAlert', 'پاسخ امنیتی و رمز عبور حداقل ۶ کاراکتری الزامی است.', 'error');
        }

        const btn = document.getElementById('btnForgotResetSubmit');
        if (btn) { btn.disabled = true; btn.innerText = 'در حال ثبت...'; }

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
            }, 1300);
        } catch (err) {
            UI.showAlertBox('forgotModalAlert', err.message, 'error');
        } finally {
            if (btn) { btn.disabled = false; btn.innerText = 'ثبت رمز عبور جدید'; }
        }
    },

    async logout() {
        UI.closeModals();
        try { await supabaseClient.auth.signOut(); } catch (_) {}

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
