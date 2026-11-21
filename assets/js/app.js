import { supabase } from './supabase.js';

const money = value =>
  'TSh ' + Number(value || 0).toLocaleString('en-US');

function show(id, value) {
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

function toggleMenu() {
  document.querySelector('.sidebar')?.classList.toggle('show');
}

function searchData() {
  const q = (document.getElementById('search')?.value || '').toLowerCase();

  document.querySelectorAll('.items p').forEach(item => {
    item.style.display =
      item.textContent.toLowerCase().includes(q) ? 'flex' : 'none';
  });
}

window.toggleMenu = toggleMenu;
window.searchData = searchData;

async function loadDashboard() {
  try {
    const access = window.hagaiMembership;

    if (!access) {
      show('dashboardMessage', 'Taarifa za akaunti hazijapatikana.');
      return;
    }

    const companyId = access.companyId;

    let branchQuery = supabase
      .from('branches')
      .select('id,name,is_head_office')
      .eq('company_id', companyId)
      .eq('is_active', true);

    if (access.scope === 'branch') {
      branchQuery = branchQuery.eq('id', access.branchId);
    }

    const { data: branches, error: branchError } = await branchQuery;
    if (branchError) throw branchError;

    const selector = document.getElementById('branch');
    if (selector) {
      selector.innerHTML = '';

      if (access.scope === 'company') {
        selector.add(new Option('Matawi yote', 'all'));
      }

      (branches || []).forEach(branch => {
        selector.add(new Option(branch.name, branch.id));
      });

      selector.value = access.scope === 'company' ? 'all' : access.branchId;
      selector.disabled = access.scope === 'branch';
    }

    await refreshDashboard();
  } catch (error) {
    console.error('Dashboard error:', error);
    show('dashboardMessage', 'Imeshindikana kupakia taarifa: ' + error.message);
  }
}

async function refreshDashboard() {
  try {
    const access = window.hagaiMembership;
    if (!access) return;

    const companyId = access.companyId;
    const selectedBranch = document.getElementById('branch')?.value || 'all';

    let salesQuery = supabase
      .from('sales')
      .select('id,total,sale_date,sale_number,branch_id,status')
      .eq('company_id', companyId)
      .eq('status', 'completed');

    let purchasesQuery = supabase
      .from('purchases')
      .select('id,total,purchase_date,purchase_number,branch_id,status')
      .eq('company_id', companyId)
      .eq('status', 'received');

    let customersQuery = supabase
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId);

    let batchesQuery = supabase
      .from('medicine_batches')
      .select('id,medicine_id,branch_id,batch_number,quantity_available,expiry_date')
      .eq('company_id', companyId);

    if (access.scope === 'branch' || selectedBranch !== 'all') {
      const branchId = access.scope === 'branch'
        ? access.branchId
        : selectedBranch;

      salesQuery = salesQuery.eq('branch_id', branchId);
      purchasesQuery = purchasesQuery.eq('branch_id', branchId);
      batchesQuery = batchesQuery.eq('branch_id', branchId);
    }

    const [salesResult, purchasesResult, customersResult, batchesResult, medicinesResult] =
      await Promise.all([
        salesQuery,
        purchasesQuery,
        customersQuery,
        batchesQuery,
        supabase.from('medicines')
          .select('id,name,reorder_level')
          .eq('company_id', companyId)
      ]);

    if (salesResult.error) throw salesResult.error;
    if (purchasesResult.error) throw purchasesResult.error;
    if (customersResult.error) throw customersResult.error;
    if (batchesResult.error) throw batchesResult.error;
    if (medicinesResult.error) throw medicinesResult.error;

    const sales = salesResult.data || [];
    const purchases = purchasesResult.data || [];
    const batches = batchesResult.data || [];
    const medicines = medicinesResult.data || [];

    const totalSales = sales.reduce((sum, row) => sum + Number(row.total || 0), 0);
    const totalPurchases = purchases.reduce((sum, row) => sum + Number(row.total || 0), 0);

    show('sales', money(totalSales));
    show('purchases', money(totalPurchases));
    show('customers', customersResult.count || 0);

    const medicineMap = new Map(medicines.map(m => [m.id, m]));
    const stockMap = new Map();

    batches.forEach(batch => {
      stockMap.set(
        batch.medicine_id,
        (stockMap.get(batch.medicine_id) || 0) + Number(batch.quantity_available || 0)
      );
    });

    let lowStock = 0;
    let outOfStock = 0;
    let inStock = 0;
    let expiredStock = 0;
    let totalStock = 0;

    const todayDate = new Date();
    todayDate.setHours(0, 0, 0, 0);

    medicines.forEach(medicine => {
      const quantity = stockMap.get(medicine.id) || 0;
      totalStock += quantity;

      if (quantity <= 0) outOfStock++;
      else if (quantity <= Number(medicine.reorder_level || 0)) lowStock++;
      else inStock++;
    });

    batches.forEach(batch => {
      if (
        batch.expiry_date &&
        new Date(batch.expiry_date + 'T00:00:00') < todayDate &&
        Number(batch.quantity_available || 0) > 0
      ) {
        expiredStock += Number(batch.quantity_available || 0);
      }
    });

    show('low', lowStock + outOfStock);
    show('profit', 'Haitahesabiwa bado');
    show('stockTotal', totalStock.toLocaleString());
    show('inStock', inStock);
    show('lowStock', lowStock);
    show('outOfStock', outOfStock);
    show('expiredStock', expiredStock.toLocaleString());

    const topSalesQuery = supabase
      .from('sale_items')
      .select('medicine_id,quantity,unit_price,sales!inner(status,branch_id)')
      .eq('company_id', companyId)
      .eq('sales.status', 'completed');

    if (access.scope === 'branch' || selectedBranch !== 'all') {
      const branchId = access.scope === 'branch'
        ? access.branchId
        : selectedBranch;

      topSalesQuery.eq('sales.branch_id', branchId);
    }

    const { data: saleItems, error: topSalesError } = await topSalesQuery;

    if (topSalesError) throw topSalesError;

    const topSalesMap = new Map();

    (saleItems || []).forEach(item => {
      const current = topSalesMap.get(item.medicine_id) || {
        quantity: 0,
        revenue: 0
      };

      const quantity = Number(item.quantity || 0);

      current.quantity += quantity;
      current.revenue += quantity * Number(item.unit_price || 0);

      topSalesMap.set(item.medicine_id, current);
    });

    const topList = document.querySelector('.medicine-list');

    if (topList) {
      topList.innerHTML = '';

      const topMedicines = [...topSalesMap.entries()]
        .sort((a, b) => b[1].quantity - a[1].quantity)
        .slice(0, 5);

      if (!topMedicines.length) {
        const item = document.createElement('p');
        item.textContent = 'Hakuna mauzo yaliyokamilika yaliyorekodiwa bado.';
        topList.appendChild(item);
      } else {
        topMedicines.forEach(([medicineId, totals]) => {
          const medicine = medicineMap.get(medicineId);
          const item = document.createElement('p');

          item.textContent =
            `${medicine?.name || 'Dawa'} · Vipande ${totals.quantity} · ${money(totals.revenue)}`;

          topList.appendChild(item);
        });
      }
    }

    const transactions = document.querySelector('.transactions');
    if (transactions) {
      const latest = [
        ...sales.map(s => ({
          number: s.sale_number,
          total: s.total,
          date: s.sale_date,
          type: 'Mauzo'
        })),
        ...purchases.map(p => ({
          number: p.purchase_number,
          total: p.total,
          date: p.purchase_date,
          type: 'Manunuzi'
        }))
      ].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 5);

      transactions.innerHTML = latest.length
        ? latest.map(t => `<p>${t.number || t.type} · ${t.type} <b>${money(t.total)}</b></p>`).join('')
        : '<p>Hakuna miamala iliyorekodiwa bado.</p>';
    }

    const expiryList = document.querySelector('.alerts');

    if (expiryList) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const expiring = batches
        .filter(b => b.expiry_date && Number(b.quantity_available || 0) > 0)
        .map(b => {
          const expiry = new Date(b.expiry_date + 'T00:00:00');
          const daysLeft = Math.ceil((expiry - today) / 86400000);
          return { ...b, daysLeft };
        })
        .filter(b => b.daysLeft <= 90)
        .sort((a, b) => a.daysLeft - b.daysLeft);

      expiryList.innerHTML = '';

      if (!expiring.length) {
        const item = document.createElement('p');
        item.textContent = 'Hakuna dawa zilizo-expire au zinazokaribia ku-expire ndani ya siku 90.';
        expiryList.appendChild(item);
      } else {
        expiring.forEach(batch => {
          const medicine = medicineMap.get(batch.medicine_id);
          const item = document.createElement('p');
          const label = batch.daysLeft < 0
            ? 'IMEISHA MUDA'
            : batch.daysLeft === 0
              ? 'INAISHA LEO'
              : `Siku ${batch.daysLeft} zimebaki`;

          item.textContent =
            `⚠ ${medicine?.name || 'Dawa'} · Batch ${batch.batch_number || ''} · ${label} · Stock ${batch.quantity_available}`;
          expiryList.appendChild(item);
        });
      }
    }


    const branchPerformance = document.querySelector('.branch-performance');
    if (branchPerformance) {
      branchPerformance.innerHTML = '<p>Taarifa za matawi zitajazwa kutoka mauzo halisi.</p>';
    }

    show('dashboardMessage', 'Taarifa zimepakiwa kutoka Supabase.');

  } catch (error) {
    console.error('Dashboard loading error:', error);
    show('dashboardMessage', 'Hitilafu: ' + error.message);
  }
}



async function generateInventoryNotifications(access) {
  try {
    const { data: medicines, error: medError } = await supabase
      .from('medicines')
      .select('id,name,reorder_level')
      .eq('company_id', access.companyId)
      .eq('is_active', true);

    if (medError) throw medError;

    let batchQuery = supabase
      .from('medicine_batches')
      .select('id,company_id,branch_id,medicine_id,batch_number,expiry_date,quantity_available')
      .eq('company_id', access.companyId);

    if (access.scope === 'branch') {
      batchQuery = batchQuery.eq('branch_id', access.branchId);
    }

    const { data: batches, error: batchError } = await batchQuery;
    if (batchError) throw batchError;

    const medicineMap = new Map((medicines || []).map(m => [m.id, m]));
    const totals = new Map();
    const alerts = [];

    for (const batch of (batches || [])) {
      const medicine = medicineMap.get(batch.medicine_id);
      if (!medicine) continue;

      const key = `${batch.branch_id}:${batch.medicine_id}`;
      totals.set(key, (totals.get(key) || 0) + Number(batch.quantity_available || 0));

      const quantity = Number(batch.quantity_available || 0);
      if (quantity <= 0) continue;

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const expiry = new Date(`${batch.expiry_date}T00:00:00`);
      const days = Math.floor((expiry - today) / 86400000);

      let type = null;
      let severity = 'warning';
      let title = '';

      if (days < 0) {
        type = 'expired';
        severity = 'critical';
        title = 'Dawa ime-expire';
      } else if (days <= 7) {
        type = 'expiry_7';
        severity = 'critical';
        title = 'Dawa ina-expire ndani ya siku 7';
      } else if (days <= 30) {
        type = 'expiry_30';
        title = 'Dawa ina-expire ndani ya siku 30';
      } else if (days <= 90) {
        type = 'expiry_90';
        title = 'Dawa ina-expire ndani ya siku 90';
      }

      if (type) {
        alerts.push({
          company_id: access.companyId,
          branch_id: batch.branch_id,
          medicine_id: medicine.id,
          batch_id: batch.id,
          notification_type: type,
          title,
          message: `${medicine.name} · Batch ${batch.batch_number} · Expiry ${batch.expiry_date} · Stock ${quantity}`,
          severity,
          is_read: false
        });
      }
    }

    for (const [key, quantity] of totals) {
      const [branchId, medicineId] = key.split(':');
      const medicine = medicineMap.get(medicineId);
      if (!medicine) continue;

      let type = null;
      let severity = 'warning';
      let title = '';

      if (quantity <= 0) {
        type = 'out_of_stock';
        severity = 'critical';
        title = 'Dawa imeisha stock';
      } else if (quantity <= Number(medicine.reorder_level || 0)) {
        type = 'low_stock';
        title = 'Stock ya dawa iko chini';
      }

      if (type) {
        alerts.push({
          company_id: access.companyId,
          branch_id: branchId,
          medicine_id: medicineId,
          batch_id: null,
          notification_type: type,
          title,
          message: `${medicine.name} · Stock iliyobaki: ${quantity} · Reorder level: ${medicine.reorder_level}`,
          severity,
          is_read: false
        });
      }
    }

    for (const alert of alerts) {
      const { error } = await supabase.from('notifications').insert(alert);
      if (error && error.code !== '23505') {
        console.error('Notification insert error:', error);
      }
    }
  } catch (error) {
    console.error('Inventory notification generation failed:', error);
  }
}

async function initializeNotifications() {
  const button = document.getElementById('notificationBtn');
  const countBadge = document.getElementById('notificationCount');

  if (!button) {
    console.error('Notification button haijapatikana.');
    return;
  }

  let panel = document.getElementById('notificationPanel');

  if (!panel) {
    const style = document.createElement('style');
    style.textContent = `
      .notification-btn { position:relative; cursor:pointer; border:0; background:transparent; font-size:21px; padding:8px; }
      .notification-count { position:absolute; top:0; right:0; background:#e53935; color:white; border-radius:20px; font-size:10px; padding:2px 5px; min-width:16px; }
      #notificationPanel { display:none; position:fixed; top:65px; right:20px; width:min(390px,calc(100vw - 30px)); max-height:75vh; overflow:auto; background:white; color:#26354a; z-index:9999; border:1px solid #ddd; border-radius:12px; box-shadow:0 8px 30px #0002; padding:16px; }
      #notificationPanel.open { display:block; }
      .notification-item { border-bottom:1px solid #eee; padding:12px 0; }
      .notification-item p { margin:6px 0; }
      .notification-item button { cursor:pointer; padding:6px 10px; border:0; border-radius:6px; background:#e8eef8; }
      .notification-head { display:flex; justify-content:space-between; align-items:center; gap:10px; }
      .notification-head button { cursor:pointer; border:0; background:transparent; font-size:20px; }
    `;
    document.head.appendChild(style);

    panel = document.createElement('section');
    panel.id = 'notificationPanel';
    panel.innerHTML = `
      <div class="notification-head">
        <strong>Notifications</strong>
        <button type="button" id="closeNotificationPanel" aria-label="Funga">✕</button>
      </div>
      <div id="notificationList"><p>Inapakia taarifa...</p></div>
    `;
    document.body.appendChild(panel);

    panel.querySelector('#closeNotificationPanel').addEventListener('click', () => {
      panel.classList.remove('open');
      button.setAttribute('aria-expanded', 'false');
    });
  }

  async function loadNotifications() {
    const access = window.hagaiMembership;
    const list = panel.querySelector('#notificationList');

    if (!access) return;

    await generateInventoryNotifications(access);
    list.textContent = 'Inapakia taarifa...';

    let query = supabase
      .from('notifications')
      .select('id,title,message,severity,is_read,created_at,branch_id,notification_type')
      .eq('company_id', access.companyId)
      .order('created_at', { ascending: false })
      .limit(50);

    if (access.scope === 'branch') {
      query = query.eq('branch_id', access.branchId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Notifications error:', error);
      list.textContent = 'Imeshindikana kupakia notifications: ' + error.message;
      return;
    }

    const notifications = data || [];
    const unread = notifications.filter(n => !n.is_read).length;

    if (countBadge) {
      countBadge.textContent = unread > 99 ? '99+' : String(unread);
      countBadge.style.display = unread ? 'inline-block' : 'none';
    }

    list.innerHTML = '';

    if (!notifications.length) {
      list.textContent = 'Hakuna notifications zilizorekodiwa bado.';
      return;
    }

    notifications.forEach(notification => {
      const item = document.createElement('div');
      item.className = 'notification-item';

      const title = document.createElement('strong');
      title.textContent = notification.title || 'Taarifa ya mfumo';

      const message = document.createElement('p');
      message.textContent = notification.message || '';

      const details = document.createElement('small');
      details.textContent =
        `${notification.severity || 'info'} · ${notification.created_at ? new Date(notification.created_at).toLocaleString() : ''}`;

      item.append(title, message, details);

      if (!notification.is_read) {
        const markButton = document.createElement('button');
        markButton.type = 'button';
        markButton.textContent = 'Weka kuwa imesomwa';

        markButton.addEventListener('click', async () => {
          markButton.disabled = true;

          const { error: updateError } = await supabase
            .from('notifications')
            .update({ is_read: true, read_at: new Date().toISOString() })
            .eq('id', notification.id)
            .eq('company_id', access.companyId);

          if (updateError) {
            console.error('Mark notification read error:', updateError);
            markButton.disabled = false;
            alert('Imeshindikana kusasisha taarifa: ' + updateError.message);
            return;
          }

          await loadNotifications();
        });

        item.appendChild(markButton);
      }

      list.appendChild(item);
    });
  }

  button.addEventListener('click', async () => {
    const isOpen = panel.classList.toggle('open');
    button.setAttribute('aria-expanded', String(isOpen));

    if (isOpen) {
      await loadNotifications();
    }
  });

  await loadNotifications();
}

window.changeBranch = refreshDashboard;

async function waitForAccess() {
  for (let i = 0; i < 30; i++) {
    if (window.hagaiMembership) {
      await loadDashboard();
      await initializeNotifications();
      return;
    }
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  show('dashboardMessage', 'Imeshindikana kupata taarifa za akaunti. Tafadhali ingia tena.');
}

waitForAccess();
