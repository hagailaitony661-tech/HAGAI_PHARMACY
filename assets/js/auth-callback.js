import { supabase } from './supabase.js';

const message = document.getElementById('callbackMessage');

async function finishRegistration() {
  try {
    message.textContent = 'Tunathibitisha akaunti yako...';

    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession();

    if (sessionError) throw sessionError;

    if (!sessionData.session) {
      throw new Error('Uthibitisho haujakamilika. Fungua link tena kupitia Gmail.');
    }

    const { data: userData, error: userError } =
      await supabase.auth.getUser();

    if (userError) throw userError;

    const user = userData.user;

    if (!user || !user.email_confirmed_at) {
      throw new Error('Tafadhali thibitisha Gmail yako kwanza.');
    }

    const details = user.user_metadata || {};

    if (details.registration_type === 'sub_branch') {
      message.textContent = 'Tunakuunganisha na tawi uliloalikwa...';

      const { error } = await supabase.rpc('accept_branch_invitation', {
        p_token: details.invitation_token,
        p_code: details.invitation_code
      });

      if (error) throw error;

      message.textContent = 'Umejiunga na tawi lako. Unaelekezwa Login...';

    } else {
      message.textContent = 'Tunatengeneza kampuni yako...';

      const { error } = await supabase.rpc('create_company_with_owner', {
        p_name: details.company_name,
        p_email: user.email,
        p_phone: details.phone || null,
        p_address: details.address || null
      });

      if (error) throw error;

      message.textContent = 'Kampuni imeanzishwa. Unaelekezwa Login...';
    }

    await supabase.auth.signOut();

    setTimeout(() => {
      window.location.replace('login.html?verified=1');
    }, 2500);

  } catch (error) {
    message.textContent = error.message;
    message.style.color = '#d33d4b';
  }
}

finishRegistration();
