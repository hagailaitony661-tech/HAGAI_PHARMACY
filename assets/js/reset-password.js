import { supabase } from './supabase.js';

const form = document.getElementById('resetPasswordForm');
const message = document.getElementById('resetMessage');
const button = document.getElementById('resetButton');

let recoveryReady = false;

function showMessage(text, type = 'error') {
  message.textContent = text;
  message.className = 'auth-message ' + type;
}

function enableReset() {
  recoveryReady = true;
  button.disabled = false;
  showMessage('Link imethibitishwa. Sasa weka password yako mpya.', 'success');
}

supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'PASSWORD_RECOVERY' && session) {
    enableReset();
  }
});

async function checkSession() {
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    showMessage(error.message);
    return;
  }

  if (data.session) {
    enableReset();
  } else {
    showMessage('Fungua link ya kubadilisha password iliyotumwa kwenye Gmail yako.');
  }
}

checkSession();

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  const password = document.getElementById('newPassword').value;
  const confirmPassword = document.getElementById('confirmNewPassword').value;

  if (!recoveryReady) {
    showMessage('Tafadhali fungua link halali iliyotumwa kwenye Gmail yako.');
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

  button.disabled = true;
  button.textContent = 'Inabadilisha...';

  try {
    const { error } = await supabase.auth.updateUser({
      password: password
    });

    if (error) throw error;

    showMessage('Password imebadilishwa vizuri. Unaelekezwa Login...', 'success');

    await supabase.auth.signOut();

    setTimeout(() => {
      window.location.replace('login.html?password_updated=1');
    }, 2500);

  } catch (error) {
    showMessage('Imeshindikana kubadilisha password: ' + error.message);
    button.disabled = false;
    button.textContent = 'BADILISHA PASSWORD';
  }
});
