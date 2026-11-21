import { supabase } from './supabase.js';

const message = document.getElementById('authMessage');

function showMessage(text, type = 'error') {
  if (!message) return;
  message.textContent = text;
  message.className = 'auth-message ' + type;
}

const loginForm = document.getElementById('loginForm');

if (loginForm) {
  const emailInput = document.getElementById('email');
  const savedEmail = localStorage.getItem('hagai_saved_email');

  if (savedEmail) emailInput.value = savedEmail;

  loginForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const email = emailInput.value.trim();
    const password = document.getElementById('password').value;
    const button = loginForm.querySelector('button[type="submit"]');

    button.disabled = true;
    button.textContent = 'Inaingia...';

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    button.disabled = false;
    button.textContent = 'LOGIN';

    if (error) {
      showMessage('Imeshindikana kuingia: ' + error.message);
      return;
    }

    try {
      const { data: userData, error: userError } =
        await supabase.auth.getUser();

      if (userError) throw userError;

      const user = userData.user;
      const metadata = user?.user_metadata || {};

      const { data: membership, error: membershipError } = await supabase
        .from('company_members')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (membershipError) throw membershipError;

      if (!membership && metadata.registration_type === 'main') {
        button.disabled = true;
        button.textContent = 'Inaandaa ofisi yako...';

        const { error: setupError } = await supabase.rpc(
          'create_company_with_owner',
          {
            p_name: metadata.company_name,
            p_email: user.email,
            p_phone: metadata.phone || null,
            p_address: metadata.address || null
          }
        );

        if (setupError) throw setupError;
      } else if (!membership && metadata.registration_type === 'sub_branch') {
        const invitationToken = metadata.invitation_token;
        const invitationCode = metadata.invitation_code;
        if (!invitationToken || !invitationCode) {
          throw new Error('Taarifa za mwaliko hazijakamilika. Fungua Invitation Link tena na tumia Invitation Code uliyopewa.');
        }
        const { error: invitationError } = await supabase.rpc('accept_branch_invitation', {
          p_token: invitationToken,
          p_code: invitationCode
        });
        if (invitationError) throw invitationError;
      }

      localStorage.setItem('hagai_saved_email', email);
      window.location.href = 'index.html';

    } catch (setupError) {
      button.disabled = false;
      button.textContent = 'LOGIN';
      showMessage('Imeshindikana kuandaa akaunti: ' + setupError.message);
    }
  });
}

const signupForm = document.getElementById('signupForm');

if (signupForm) {
  signupForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const registrationType = document.querySelector(
      'input[name="registrationType"]:checked'
    )?.value;

    const fullName = document.getElementById('fullName').value.trim();
    const email = document.getElementById('email').value.trim();
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const button = signupForm.querySelector('button[type="submit"]');

    const companyName = document.getElementById('companyName')?.value.trim() || '';
    const phone = document.getElementById('phone')?.value.trim() || '';
    const address = document.getElementById('address')?.value.trim() || '';
    const invitationCode = document.getElementById('invitationCode')?.value.trim() || '';
    const invitationToken = new URLSearchParams(window.location.search).get('invite');

    if (!registrationType) {
      showMessage('Chagua aina ya usajili.');
      return;
    }

    if (password.length < 8) {
      showMessage('Password lazima iwe na herufi au namba zisizopungua 8.');
      return;
    }

    if (password !== confirmPassword) {
      showMessage('Password hazifanani.');
      return;
    }

    if (registrationType === 'main' && !companyName) {
      showMessage('Weka jina la Pharmacy/Kampuni.');
      return;
    }

    if (registrationType === 'sub' && (!invitationToken || !invitationCode)) {
      showMessage('Unahitaji Invitation Link na Invitation Code kutoka kwa Owner/Admin.');
      return;
    }

    button.disabled = true;
    button.textContent = 'Inatengeneza akaunti...';

    const metadata = registrationType === 'main'
      ? {
          full_name: fullName,
          registration_type: 'main',
          company_name: companyName,
          phone,
          address
        }
      : {
          full_name: fullName,
          registration_type: 'sub_branch',
          invitation_token: invitationToken,
          invitation_code: invitationCode
        };

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: new URL('../../auth-callback.html', import.meta.url).href,
          data: metadata
        }
      });

      if (error) throw error;

      localStorage.setItem('hagai_saved_email', email);

      if (data.session) {
        showMessage(
          'Akaunti imetengenezwa. Tafadhali ingia.',
          'success'
        );
      } else {
        showMessage(
          'Tumetuma link ya uthibitisho kwenye Gmail yako. Fungua Gmail uthibitishe akaunti.',
          'success'
        );
      }

      signupForm.reset();
      const mainRadio = document.querySelector(
        'input[name="registrationType"][value="main"]'
      );
      if (mainRadio) {
        mainRadio.checked = true;
        mainRadio.dispatchEvent(new Event('change'));
      }

    } catch (error) {
      showMessage('Usajili umeshindikana: ' + error.message);
    } finally {
      button.disabled = false;
      button.textContent = 'JISAJILI';
    }
  });
}

const forgotForm = document.getElementById('forgotForm');

if (forgotForm) {
  forgotForm.addEventListener('submit', async (event) => {
    event.preventDefault();

    const email = document.getElementById('email').value.trim();

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: new URL('../../reset-password.html', import.meta.url).href
    });

    if (error) {
      showMessage('Imeshindikana: ' + error.message);
      return;
    }

    showMessage('Link ya kubadilisha password imetumwa kwenye Gmail yako.', 'success');
  });
}
