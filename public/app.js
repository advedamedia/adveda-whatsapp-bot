/* ═══════════════════════════════════════════════
   WhatsApp Chatbot SaaS — Frontend App Logic
   ═══════════════════════════════════════════════ */

// ── State ──
let authToken = localStorage.getItem('saas_token') || '';
let selectedClientId = '';
let currentLeadId = '';
let currentClientEditId = '';
let lastCreatedVerifyToken = '';

const API = ''; // same origin

// ── Auth Headers ──
function headers() {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` };
}

// ══════════════════════════════════
//  INIT
// ══════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  if (authToken) {
    showApp();
  }
  // Login on Enter
  document.getElementById('passwordInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') doLogin();
  });
});

// ══════════════════════════════════
//  LOGIN / LOGOUT
// ══════════════════════════════════
async function doLogin() {
  const pw = document.getElementById('passwordInput').value.trim();
  if (!pw) return;
  const btn = document.getElementById('loginBtn');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Signing in...';

  try {
    const res = await fetch(`${API}/api/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: pw })
    });
    const data = await res.json();
    if (res.ok && data.token) {
      authToken = data.token;
      localStorage.setItem('saas_token', authToken);
      document.getElementById('loginError').style.display = 'none';
      showApp();
    } else {
      document.getElementById('loginError').style.display = 'block';
      btn.disabled = false;
      btn.innerHTML = 'Sign In →';
    }
  } catch (e) {
    document.getElementById('loginError').style.display = 'block';
    document.getElementById('loginError').textContent = '❌ Could not connect to server.';
    btn.disabled = false;
    btn.innerHTML = 'Sign In →';
  }
}

function doLogout() {
  authToken = '';
  localStorage.removeItem('saas_token');
  document.getElementById('appLayout').style.display = 'none';
  document.getElementById('loginPage').style.display = 'flex';
  document.getElementById('passwordInput').value = '';
}

function showApp() {
  document.getElementById('loginPage').style.display = 'none';
  document.getElementById('appLayout').style.display = 'flex';
  loadClients();
  loadDashboard();
}

// ══════════════════════════════════
//  NAVIGATION
// ══════════════════════════════════
function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const page = document.getElementById(`page-${name}`);
  const nav = document.getElementById(`nav-${name}`);
  if (page) page.classList.add('active');
  if (nav) nav.classList.add('active');

  if (name === 'dashboard') loadDashboard();
  if (name === 'leads') loadLeads();
  if (name === 'clients') loadClients();
  if (name === 'onboarding') resetWizard();
}

function setFilter(score) {
  document.getElementById('scoreFilter').value = score;
  loadLeads();
}

function onClientFilter() {
  selectedClientId = document.getElementById('clientFilterSelect').value;
  loadDashboard();
  loadLeads();
}

// ══════════════════════════════════
//  LOAD DASHBOARD STATS
// ══════════════════════════════════
async function loadDashboard() {
  try {
    const params = selectedClientId ? `?client_id=${selectedClientId}` : '';
    const res = await fetch(`${API}/api/dashboard/stats${params}`, { headers: headers() });
    const stats = await res.json();

    document.getElementById('stat-total').textContent = stats.total ?? 0;
    document.getElementById('stat-hot').textContent = stats.hot ?? 0;
    document.getElementById('stat-warm').textContent = stats.warm ?? 0;
    document.getElementById('stat-cold').textContent = stats.cold ?? 0;
    document.getElementById('stat-visits').textContent = stats.today_visits ?? 0;
    document.getElementById('stat-calls').textContent = stats.today_calls ?? 0;

    // Update sidebar badge
    document.getElementById('hotBadge').textContent = stats.hot ?? 0;

    // Load hot leads preview
    await loadHotLeads();
  } catch (e) {
    console.error('Error loading dashboard:', e);
  }
}

async function loadHotLeads() {
  const params = new URLSearchParams({ lead_score: 'HOT', limit: 5 });
  if (selectedClientId) params.set('client_id', selectedClientId);

  const res = await fetch(`${API}/api/leads?${params}`, { headers: headers() });
  const leads = await res.json();

  const tbody = document.getElementById('hotLeadsBody');
  if (!leads.length) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align:center;padding:40px;color:var(--text-muted)">No hot leads yet 🎯</td></tr>`;
    return;
  }

  tbody.innerHTML = leads.map(l => `
    <tr onclick="openLead('${l.id}')">
      <td>${l.name || '<em style="color:var(--text-muted)">Unknown</em>'}</td>
      <td>${l.phone}</td>
      <td>${l.budget || '—'}</td>
      <td>${l.location || '—'}</td>
      <td>${scoreBadge(l.lead_score)}</td>
      <td>${stageBadge(l.lead_stage)}</td>
      <td>${timeAgo(l.updated_at)}</td>
    </tr>
  `).join('');
}

// ══════════════════════════════════
//  LOAD LEADS
// ══════════════════════════════════
async function loadLeads() {
  const search = document.getElementById('searchInput')?.value?.trim() || '';
  const score = document.getElementById('scoreFilter')?.value || '';
  const stage = document.getElementById('stageFilter')?.value || '';

  const params = new URLSearchParams({ limit: 200 });
  if (selectedClientId) params.set('client_id', selectedClientId);
  if (search) params.set('search', search);
  if (score) params.set('lead_score', score);
  if (stage) params.set('lead_stage', stage);

  try {
    const res = await fetch(`${API}/api/leads?${params}`, { headers: headers() });
    const leads = await res.json();

    document.getElementById('leadsCount').textContent = `${leads.length} Lead${leads.length !== 1 ? 's' : ''}`;

    const tbody = document.getElementById('leadsBody');
    if (!leads.length) {
      tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;padding:60px;color:var(--text-muted)">
        <div style="font-size:40px;margin-bottom:12px">👥</div>No leads found. Leads appear here automatically when users message your WhatsApp bot.
      </td></tr>`;
      return;
    }

    tbody.innerHTML = leads.map(l => `
      <tr onclick="openLead('${l.id}')">
        <td>${l.name || '<em style="color:var(--text-muted)">Unknown</em>'}</td>
        <td>${l.phone}</td>
        <td>${l.budget || '—'}</td>
        <td>${l.location || '—'}</td>
        <td>${l.purpose || '—'}</td>
        <td>${scoreBadge(l.lead_score)}</td>
        <td>${stageBadge(l.lead_stage)}</td>
        <td>${l.site_visit_date ? `📅 ${l.site_visit_date}` : '—'}</td>
        <td>${timeAgo(l.updated_at)}</td>
      </tr>
    `).join('');
  } catch (e) {
    console.error('Error loading leads:', e);
  }
}

// ══════════════════════════════════
//  OPEN LEAD DETAIL MODAL
// ══════════════════════════════════
async function openLead(leadId) {
  currentLeadId = leadId;
  openModal('leadModal');

  try {
    const res = await fetch(`${API}/api/leads/${leadId}`, { headers: headers() });
    const { lead, conversation } = await res.json();

    document.getElementById('modalLeadName').textContent = lead.name || 'Unknown Lead';
    document.getElementById('modalLeadPhone').textContent = `📱 ${lead.phone} · ${scoreBadge(lead.lead_score)}`;

    // Details grid
    const fields = [
      ['Budget', lead.budget], ['Location', lead.location],
      ['Property Type', lead.property_type], ['Purpose', lead.purpose],
      ['Timeline', lead.timeline], ['Email', lead.email],
      ['Lead Score', scoreBadge(lead.lead_score)], ['Lead Stage', stageBadge(lead.lead_stage)],
      ['Site Visit Date', lead.site_visit_date], ['Site Visit Time', lead.site_visit_time],
      ['Call Date', lead.call_date], ['Call Time', lead.call_time],
      ['Follow-up Date', lead.follow_up_date], ['Created', formatDate(lead.created_at)],
    ];

    document.getElementById('leadDetailGrid').innerHTML = fields.map(([label, val]) => `
      <div class="detail-item">
        <div class="detail-label">${label}</div>
        <div class="detail-value ${val ? '' : 'empty'}">${val || 'Not collected yet'}</div>
      </div>
    `).join('');

    // Notes
    document.getElementById('leadNotes').value = lead.notes || '';
    document.getElementById('leadStageSelect').value = lead.lead_stage || 'new';

    // Conversation history
    const chatDiv = document.getElementById('chatHistory');
    const msgs = conversation || [];
    if (!msgs.length) {
      chatDiv.innerHTML = '<div style="text-align:center;color:var(--text-muted);font-size:13px;padding:20px">No conversation yet</div>';
    } else {
      chatDiv.innerHTML = msgs.map(m => {
        const isUser = m.role === 'user';
        const text = m.parts?.find(p => p.text)?.text || '';
        const cleanText = text.replace(/\[STATE\][\s\S]*?\[\/STATE\]/g, '').trim();
        if (!cleanText) return '';
        return `
          <div class="chat-msg ${m.role}">
            <div class="chat-label">${isUser ? '👤 User' : '🤖 Kanak'}</div>
            <div class="chat-bubble">${escapeHtml(cleanText)}</div>
          </div>
        `;
      }).join('');
      chatDiv.scrollTop = chatDiv.scrollHeight;
    }
  } catch (e) {
    console.error('Error loading lead:', e);
  }
}

async function saveLeadNotes() {
  if (!currentLeadId) return;
  const notes = document.getElementById('leadNotes').value;
  const lead_stage = document.getElementById('leadStageSelect').value;
  try {
    await fetch(`${API}/api/leads/${currentLeadId}`, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify({ notes, lead_stage })
    });
    closeModal('leadModal');
    loadLeads();
    loadDashboard();
  } catch (e) {
    console.error('Error saving notes:', e);
  }
}

// ══════════════════════════════════
//  LOAD CLIENTS
// ══════════════════════════════════
async function loadClients() {
  try {
    const res = await fetch(`${API}/api/clients`, { headers: headers() });
    const clients = await res.json();

    // Populate sidebar selector
    const sel = document.getElementById('clientFilterSelect');
    sel.innerHTML = '<option value="">All Clients</option>' +
      clients.map(c => `<option value="${c.id}" ${c.id === selectedClientId ? 'selected' : ''}>${c.name}</option>`).join('');

    // Render client cards
    const grid = document.getElementById('clientsGrid');
    if (!clients.length) {
      grid.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🏢</div>
          <h3>No Clients Yet</h3>
          <p>Add your first client to get started</p>
          <br/>
          <button class="btn btn-primary" onclick="showPage('onboarding')">➕ Add New Client</button>
        </div>`;
      return;
    }

    grid.innerHTML = clients.map(c => `
      <div class="client-card">
        <div class="client-card-header">
          <div class="client-avatar">🏢</div>
          <div class="client-info">
            <div class="client-name">${c.name}</div>
            <div class="client-type">${c.business_type || 'Business'}</div>
          </div>
          <div>${statusBadge(c.status)}</div>
        </div>
        <div class="client-meta">
          ${c.whatsapp_number ? `<span>📱 ${c.whatsapp_number}</span>` : ''}
          ${c.contact_person ? `<span>👤 ${c.contact_person}</span>` : ''}
        </div>
        <div class="client-meta">
          <span style="font-family:monospace;font-size:11px;color:var(--text-muted)">ID: ${c.phone_number_id?.substring(0,12)}...</span>
        </div>
        <div class="client-meta" style="font-size:11px">Added: ${formatDate(c.created_at)}</div>
        <div class="client-actions">
          <button class="btn btn-secondary btn-sm" onclick="openClientEdit('${c.id}', event)">✏️ Edit</button>
          <button class="btn btn-secondary btn-sm" onclick="viewClientLeads('${c.id}', event)">👥 Leads</button>
          <button class="btn btn-danger btn-sm" onclick="deactivateClient('${c.id}', event)">${c.status === 'active' ? '⏸️ Pause' : '▶️ Activate'}</button>
        </div>
      </div>
    `).join('');
  } catch (e) {
    console.error('Error loading clients:', e);
  }
}

function viewClientLeads(clientId, e) {
  e?.stopPropagation();
  selectedClientId = clientId;
  document.getElementById('clientFilterSelect').value = clientId;
  showPage('leads');
}

async function deactivateClient(clientId, e) {
  e?.stopPropagation();
  if (!confirm('Are you sure you want to change this client status?')) return;
  const res = await fetch(`${API}/api/clients/${clientId}`, { headers: headers() });
  const client = await res.json();
  const newStatus = client.status === 'active' ? 'inactive' : 'active';
  await fetch(`${API}/api/clients/${clientId}`, {
    method: 'PUT', headers: headers(),
    body: JSON.stringify({ status: newStatus })
  });
  loadClients();
}

async function openClientEdit(clientId, e) {
  e?.stopPropagation();
  currentClientEditId = clientId;
  openModal('clientModal');
  document.getElementById('clientModalMsg').innerHTML = '';

  const res = await fetch(`${API}/api/clients/${clientId}`, { headers: headers() });
  const client = await res.json();
  document.getElementById('clientModalTitle').textContent = `Edit: ${client.name}`;
  document.getElementById('edit_status').value = client.status;
  document.getElementById('edit_system_prompt').value = client.system_prompt || '';
  document.getElementById('edit_knowledge_base').value =
    typeof client.knowledge_base === 'string' ? client.knowledge_base : JSON.stringify(client.knowledge_base, null, 2);
}

async function saveClientEdit() {
  const system_prompt = document.getElementById('edit_system_prompt').value.trim();
  const status = document.getElementById('edit_status').value;
  let knowledge_base;
  const kbRaw = document.getElementById('edit_knowledge_base').value.trim();
  try {
    knowledge_base = kbRaw ? JSON.parse(kbRaw) : [];
  } catch {
    document.getElementById('clientModalMsg').innerHTML = '<div class="alert alert-error">❌ Knowledge Base JSON is invalid. Please fix it.</div>';
    return;
  }

  const res = await fetch(`${API}/api/clients/${currentClientEditId}`, {
    method: 'PUT', headers: headers(),
    body: JSON.stringify({ system_prompt, status, knowledge_base })
  });
  if (res.ok) {
    closeModal('clientModal');
    loadClients();
  } else {
    document.getElementById('clientModalMsg').innerHTML = '<div class="alert alert-error">❌ Error saving. Please try again.</div>';
  }
}

// ══════════════════════════════════
//  ONBOARDING WIZARD
// ══════════════════════════════════
let currentWizardStep = 1;

function resetWizard() {
  goWizard(1);
  ['ob_name','ob_business_type','ob_whatsapp_number','ob_contact_person','ob_contact_phone',
   'ob_phone_number_id','ob_access_token','ob_verify_token','ob_system_prompt','ob_knowledge_base','ob_gemini_key']
    .forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        if (el.tagName === 'SELECT') el.selectedIndex = 0;
        else el.value = '';
      }
    });
  document.getElementById('onboardingMsg').innerHTML = '';
}

function goWizard(step) {
  for (let i = 1; i <= 4; i++) {
    document.getElementById(`wpanel-${i}`).classList.remove('active');
    document.getElementById(`wstep-${i}`).classList.remove('active');
    if (i < step) document.getElementById(`wstep-${i}`).classList.add('done');
    else document.getElementById(`wstep-${i}`).classList.remove('done');
  }
  document.getElementById(`wpanel-${step}`).classList.add('active');
  document.getElementById(`wstep-${step}`).classList.add('active');
  currentWizardStep = step;
}

async function submitClient() {
  const name = document.getElementById('ob_name').value.trim();
  const phone_number_id = document.getElementById('ob_phone_number_id').value.trim();
  const access_token = document.getElementById('ob_access_token').value.trim();
  const system_prompt = document.getElementById('ob_system_prompt').value.trim();

  if (!name || !phone_number_id || !access_token || !system_prompt) {
    document.getElementById('onboardingMsg').innerHTML = '<div class="alert alert-error">❌ Please fill in all required fields (marked with *).</div>';
    goWizard(2);
    return;
  }

  let knowledge_base = [];
  const kbRaw = document.getElementById('ob_knowledge_base').value.trim();
  if (kbRaw) {
    try { knowledge_base = JSON.parse(kbRaw); }
    catch { document.getElementById('onboardingMsg').innerHTML = '<div class="alert alert-error">❌ Knowledge Base JSON is invalid.</div>'; goWizard(3); return; }
  }

  const payload = {
    name,
    business_type: document.getElementById('ob_business_type').value,
    whatsapp_number: document.getElementById('ob_whatsapp_number').value.trim(),
    phone_number_id,
    access_token,
    verify_token: document.getElementById('ob_verify_token').value.trim() || undefined,
    system_prompt,
    knowledge_base,
    gemini_api_key: document.getElementById('ob_gemini_key').value.trim() || undefined,
    contact_person: document.getElementById('ob_contact_person').value.trim(),
    contact_phone: document.getElementById('ob_contact_phone').value.trim(),
  };

  try {
    const res = await fetch(`${API}/api/clients`, {
      method: 'POST', headers: headers(), body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (res.ok) {
      lastCreatedVerifyToken = data.client?.verify_token || payload.verify_token || 'VERIFY_TOKEN';
      // Show webhook URL and verify token in step 4
      const host = window.location.origin;
      document.getElementById('webhookUrl').textContent = `${host}/webhook`;
      document.getElementById('verifyTokenDisplay').textContent = lastCreatedVerifyToken;
      loadClients();
      goWizard(4);
    } else {
      document.getElementById('onboardingMsg').innerHTML = `<div class="alert alert-error">❌ Error: ${data.error}</div>`;
      goWizard(2);
    }
  } catch (e) {
    document.getElementById('onboardingMsg').innerHTML = '<div class="alert alert-error">❌ Could not connect to server.</div>';
    goWizard(2);
  }
}

// ══════════════════════════════════
//  MODALS
// ══════════════════════════════════
function openModal(id) {
  document.getElementById(id).classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal(id) {
  document.getElementById(id).classList.remove('open');
  document.body.style.overflow = '';
}

// Close modal on overlay click
document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) {
    e.target.classList.remove('open');
    document.body.style.overflow = '';
  }
});

// ══════════════════════════════════
//  UTILITY FUNCTIONS
// ══════════════════════════════════
function scoreBadge(score) {
  const map = {
    HOT: 'badge-hot', WARM: 'badge-warm', COLD: 'badge-cold', UNKNOWN: 'badge-unknown'
  };
  const emoji = { HOT: '🔥', WARM: '🟡', COLD: '🔵', UNKNOWN: '❓' };
  const s = (score || 'UNKNOWN').toUpperCase();
  return `<span class="badge ${map[s] || 'badge-unknown'}">${emoji[s] || ''}${s}</span>`;
}

function stageBadge(stage) {
  const map = {
    new: 'badge-new', qualified: 'badge-qualified',
    site_visit_scheduled: 'badge-visit', call_scheduled: 'badge-visit',
    converted: 'badge-converted', lost: 'badge-lost'
  };
  const label = {
    new: 'New', qualified: 'Qualified', site_visit_scheduled: '📅 Visit',
    call_scheduled: '📞 Call', converted: '✅ Converted', lost: '❌ Lost'
  };
  const s = stage || 'new';
  return `<span class="badge ${map[s] || 'badge-new'}">${label[s] || s}</span>`;
}

function statusBadge(status) {
  const map = { active: 'badge-active', inactive: 'badge-inactive', setup: 'badge-unknown' };
  return `<span class="badge ${map[status] || 'badge-unknown'}">${status}</span>`;
}

function timeAgo(dateStr) {
  if (!dateStr) return '—';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function escapeHtml(text) {
  return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>');
}

async function copyText(elemId, btn) {
  const text = document.getElementById(elemId).textContent;
  await navigator.clipboard.writeText(text);
  btn.textContent = '✅ Copied!';
  btn.classList.add('copied');
  setTimeout(() => { btn.textContent = '📋 Copy'; btn.classList.remove('copied'); }, 2000);
}
