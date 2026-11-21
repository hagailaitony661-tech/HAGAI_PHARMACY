import { supabase } from './supabase.js';

async function protectDashboard() {
  try {
    const loginPath = window.location.pathname.includes('/pages/')
      ? '../login.html'
      : 'login.html';

    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession();

    if (sessionError) throw sessionError;

    if (!sessionData.session) {
      window.location.replace(loginPath);
      return null;
    }

    const user = sessionData.session.user;

    const { data: membership, error } = await supabase
      .from('company_members')
      .select('company_id, branch_id, role, membership_scope')
      .eq('user_id', user.id)
      .maybeSingle();

    if (error) throw error;

    if (!membership) {
      alert('Akaunti hii haina membership ya kampuni.');
      window.location.replace(loginPath);
      return null;
    }

    if (
      membership.membership_scope === 'branch' &&
      !membership.branch_id
    ) {
      alert('Akaunti hii haijaunganishwa na tawi.');
      window.location.replace(loginPath);
      return null;
    }

    const access = {
      userId: user.id,
      email: user.email,
      companyId: membership.company_id,
      branchId: membership.branch_id,
      role: membership.role,
      scope: membership.membership_scope
    };

    window.hagaiMembership = access;
    console.log('HAGAI PHARMACY ACCESS:', access);

    return access;

  } catch (error) {
    console.error('Dashboard protection error:', error);
    alert('Hitilafu ya ulinzi: ' + error.message);
    return null;
  }
}

export const dashboardProtection = protectDashboard();
