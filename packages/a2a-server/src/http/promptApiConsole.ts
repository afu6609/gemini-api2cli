/**
 * @license
 * Copyright 2026 gemini-api2cli contributors
 * SPDX-License-Identifier: LicenseRef-CNC-1.0
 */

export function getPromptApiConsoleHtml(): string {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Gemini Prompt API</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#0b0d11;--surface:#12151c;--surface2:#181c26;--surface3:#1e2330;
  --border:#252a37;--border2:#2f3649;
  --text:#e4e8f1;--text2:#9ba3b8;--text3:#6b7490;
  --accent:#818cf8;--accent2:#6366f1;--accent-glow:rgba(99,102,241,.15);
  --green:#34d399;--green-bg:rgba(52,211,153,.1);
  --amber:#fbbf24;--amber-bg:rgba(251,191,36,.1);
  --red:#f87171;--red-bg:rgba(248,113,113,.1);
  --mono:'JetBrains Mono','Cascadia Code','SF Mono',Consolas,monospace;
  --sans:'Inter',-apple-system,'Segoe UI',sans-serif;
  --radius:12px;--radius-lg:16px;--radius-xl:20px;
  --shadow:0 4px 24px rgba(0,0,0,.4);
}
body{font-family:var(--sans);background:var(--bg);color:var(--text);min-height:100vh;line-height:1.5}
a{color:var(--accent);text-decoration:none}

/* ── Auth Screen ── */
.auth-screen{display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px}
.auth-box{width:100%;max-width:400px;background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-xl);padding:40px 32px;text-align:center;box-shadow:var(--shadow)}
.auth-box .logo{font-size:32px;font-weight:800;letter-spacing:-.03em;margin-bottom:4px}
.auth-box .logo span{color:var(--accent)}
.auth-box .subtitle{color:var(--text3);font-size:14px;margin-bottom:28px}
.auth-input{width:100%;padding:12px 16px;background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);font:14px var(--sans);outline:none;transition:border-color .15s}
.auth-input:focus{border-color:var(--accent)}
.auth-input::placeholder{color:var(--text3)}
.auth-btn{width:100%;margin-top:16px;padding:12px;background:var(--accent2);color:#fff;border:0;border-radius:var(--radius);font:600 14px var(--sans);cursor:pointer;transition:background .15s}
.auth-btn:hover{background:var(--accent)}
.auth-btn:disabled{opacity:.7;cursor:not-allowed}
.auth-btn .spinner{display:inline-block;width:14px;height:14px;border:2px solid rgba(255,255,255,.3);border-top-color:#fff;border-radius:50%;animation:spin .6s linear infinite;vertical-align:middle;margin-right:6px}
@keyframes spin{to{transform:rotate(360deg)}}
.auth-error{margin-top:12px;color:var(--red);font-size:13px;min-height:20px}

/* ── Shell ── */
.shell{display:none;max-width:1280px;margin:0 auto;padding:20px 24px 48px}

/* ── Header ── */
.header{display:flex;align-items:center;justify-content:space-between;margin-bottom:24px;gap:16px;flex-wrap:wrap}
.header-left{display:flex;align-items:center;gap:12px}
.brand{font-size:22px;font-weight:800;letter-spacing:-.03em}
.brand span{color:var(--accent)}
.header-right{display:flex;align-items:center;gap:10px}

/* ── Status Pills ── */
.status-bar{display:flex;flex-wrap:wrap;gap:8px;margin-bottom:20px}
.pill{display:inline-flex;align-items:center;gap:7px;padding:6px 12px;border-radius:999px;background:var(--surface);border:1px solid var(--border);font-size:12px;font-weight:500;color:var(--text2)}
.pill .dot{width:7px;height:7px;border-radius:50%}
.dot-ok{background:var(--green)}.dot-warn{background:var(--amber)}.dot-err{background:var(--red)}

/* ── Buttons ── */
.btn{display:inline-flex;align-items:center;gap:6px;padding:8px 16px;border:0;border-radius:var(--radius);font:600 13px var(--sans);cursor:pointer;transition:all .15s;white-space:nowrap}
.btn-primary{background:var(--accent2);color:#fff}.btn-primary:hover{background:var(--accent)}
.btn-ghost{background:var(--accent-glow);color:var(--accent)}.btn-ghost:hover{background:rgba(99,102,241,.22)}
.btn-outline{background:transparent;color:var(--text2);border:1px solid var(--border)}.btn-outline:hover{border-color:var(--text3);color:var(--text)}
.btn-danger{background:var(--red-bg);color:var(--red)}.btn-danger:hover{background:rgba(248,113,113,.18)}
.btn-sm{padding:5px 10px;font-size:12px}
.btn:disabled{opacity:.4;cursor:not-allowed}

/* ── Cards / Panels ── */
.grid{display:grid;gap:16px}
.grid-2{grid-template-columns:1fr 1fr}
.grid-3{grid-template-columns:1fr 1fr 1fr}
.grid-23{grid-template-columns:2fr 3fr}
.grid-32{grid-template-columns:3fr 2fr}

.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius-lg);padding:20px;position:relative;overflow:hidden}
.card-header{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:14px}
.card-title{font-size:15px;font-weight:700;color:var(--text)}
.card-desc{color:var(--text3);font-size:13px;margin-bottom:16px}

/* ── Form Elements ── */
.field{margin-bottom:14px}
.field:last-child{margin-bottom:0}
.label{display:block;font-size:12px;font-weight:600;color:var(--text2);text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px}
.input,.select,.textarea{width:100%;padding:10px 14px;background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius);color:var(--text);font:14px var(--sans);outline:none;transition:border-color .15s}
.input:focus,.select:focus,.textarea:focus{border-color:var(--accent)}
.input::placeholder,.textarea::placeholder{color:var(--text3)}
.textarea{font-family:var(--mono);font-size:13px;min-height:80px;resize:vertical}
.select{cursor:pointer;appearance:none;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath d='M3 5l3 3 3-3' stroke='%236b7490' stroke-width='1.5' fill='none'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 12px center}
.select option{background:var(--surface2);color:var(--text)}

.row{display:flex;gap:10px;flex-wrap:wrap;align-items:center}
.stack{display:flex;flex-direction:column;gap:12px}

/* ── Notice ── */
.notice{display:none;padding:12px 16px;border-radius:var(--radius);background:var(--red-bg);border:1px solid rgba(248,113,113,.2);color:var(--red);font-size:13px;font-weight:500;margin-bottom:16px}
.notice.visible{display:block}
.notice.notice-ok{background:var(--green-bg);border-color:rgba(52,211,153,.25);color:var(--green)}

/* ── Toggle Row ── */
.toggle-row{display:flex;align-items:center;gap:8px;cursor:pointer;font-size:14px;font-weight:500;color:var(--text);flex-wrap:wrap}
.toggle-row input[type=checkbox]{width:18px;height:18px;accent-color:var(--accent2);cursor:pointer}
.toggle-hint{display:block;width:100%;font-size:12px;font-weight:400;color:var(--text3);margin-left:26px;margin-top:-4px}

/* ── Credential Test Result ── */
.cred-test-result{font-size:12px;margin-top:8px;padding:6px 10px;border-radius:8px;display:none;word-break:break-all}
.cred-test-result.test-ok{display:block;background:var(--green-bg);color:var(--green)}
.cred-test-result.test-err{display:block;background:var(--red-bg);color:var(--red)}

/* ── Credential Cards ── */
.cred-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:12px}
.cred-card{background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius);padding:16px;transition:border-color .15s}
.cred-card.active{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent)}
.cred-name{font-weight:700;font-size:15px;margin-bottom:2px}
.cred-email{color:var(--text2);font-size:13px}
.cred-id{font-family:var(--mono);font-size:11px;color:var(--text3);margin-top:4px;word-break:break-all}
.cred-actions{display:flex;gap:6px;margin-top:12px;flex-wrap:wrap}

.badge{display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:600}
.badge-active{background:var(--green-bg);color:var(--green)}
.badge-stored{background:rgba(155,163,184,.1);color:var(--text3)}

/* ── Quota ── */
.quota-card{background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius);padding:16px;margin-bottom:12px}
.quota-card:last-child{margin-bottom:0}
.metric-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin-top:14px}
.metric{background:var(--surface);border:1px solid var(--border);border-radius:var(--radius);padding:12px}
.metric-label{font-size:11px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:.05em}
.metric-value{font-size:20px;font-weight:800;margin-top:4px;letter-spacing:-.02em}
.chip-row{display:flex;flex-wrap:wrap;gap:6px;margin-top:10px}
.chip{padding:4px 10px;border-radius:999px;font-size:11px;font-weight:600;background:var(--accent-glow);color:var(--accent);border:1px solid rgba(99,102,241,.2)}

/* ── Code Block ── */
.code-block{background:var(--surface2);border:1px solid var(--border);border-radius:var(--radius);padding:14px;font-family:var(--mono);font-size:12px;line-height:1.7;color:var(--text2);overflow-x:auto;white-space:pre-wrap;word-break:break-all;min-height:60px}

/* ── Endpoint Docs ── */
.ep-item{padding:12px 0;border-bottom:1px solid var(--border)}
.ep-item:last-child{border-bottom:0}
.ep-method{display:inline-block;padding:2px 8px;border-radius:6px;font-size:11px;font-weight:700;font-family:var(--mono)}
.ep-get{background:var(--green-bg);color:var(--green)}
.ep-post{background:var(--accent-glow);color:var(--accent)}
.ep-put{background:var(--amber-bg);color:var(--amber)}
.ep-delete{background:var(--red-bg);color:var(--red)}
.ep-path{font-family:var(--mono);font-size:13px;margin-left:8px;color:var(--text)}
.ep-desc{color:var(--text3);font-size:12px;margin-top:4px;padding-left:2px}

/* ── Empty State ── */
.empty{padding:24px;text-align:center;color:var(--text3);border:1px dashed var(--border);border-radius:var(--radius);font-size:13px}

/* ── Footer ── */
.footer{margin-top:20px;padding-top:18px;border-top:1px solid var(--border);display:flex;flex-direction:column;gap:6px;color:var(--text3);font-size:12px}
.footer strong{color:var(--text2);font-weight:700}

/* ── Responsive ── */
@media(max-width:860px){
  .grid-2,.grid-3,.grid-23,.grid-32{grid-template-columns:1fr}
}
</style>
</head>
<body>

<!-- Auth Screen -->
<div id="auth-screen" class="auth-screen">
  <div class="auth-box">
    <div class="logo">Gemini <span>API</span></div>
    <div id="auth-subtitle" class="subtitle">Prompt API Management Console</div>
    <input id="token-input" class="auth-input" type="password" placeholder="Enter access token" autocomplete="off"/>
    <button id="auth-submit" class="auth-btn">Sign In</button>
    <div id="auth-error" class="auth-error"></div>
  </div>
</div>

<!-- Main App -->
<div id="app" class="shell">

  <!-- Header -->
  <div class="header">
    <div class="header-left">
      <div class="brand">Gemini <span>Prompt API</span></div>
    </div>
    <div class="header-right">
      <button class="btn btn-outline btn-sm" id="lang-btn" style="font-weight:700;min-width:36px;text-align:center">EN</button>
      <button class="btn btn-outline btn-sm" id="refresh-all-btn">Refresh All</button>
      <button class="btn btn-danger btn-sm" id="logout-btn">Sign Out</button>
    </div>
  </div>

  <!-- Notice -->
  <div class="notice" id="notice"></div>

  <!-- Status Bar -->
  <div class="status-bar" id="status-bar"></div>

  <!-- Row 1: Login + Complete Login -->
  <div class="grid grid-23" style="margin-bottom:16px">

    <!-- Start Login -->
    <div class="card">
      <div class="card-title" id="t-start-login">Start Login</div>
      <div class="card-desc" id="t-start-login-desc">Initiate a Google OAuth flow for a new credential.</div>
      <div class="stack">
        <div class="field">
          <span class="label" id="t-cred-label">Credential Label</span>
          <input id="login-label" class="input" placeholder="e.g. Main Google Account"/>
        </div>
        <div class="row">
          <button class="btn btn-primary" id="start-login-btn">Start Login</button>
          <button class="btn btn-ghost" id="open-auth-btn" disabled>Open Auth URL</button>
        </div>
        <div class="field">
          <span class="label" id="t-auth-url">Auth URL</span>
          <textarea id="auth-url" class="textarea" readonly placeholder="Auth URL will appear here after starting login..."></textarea>
        </div>
        <div class="field">
          <span class="label" id="t-redirect-uri">Redirect URI</span>
          <input id="redirect-uri" class="input" readonly placeholder="Redirect URI..."/>
        </div>
      </div>
    </div>

    <!-- Complete Login -->
    <div class="card">
      <div class="card-title" id="t-complete-login">Complete Login</div>
      <div class="card-desc" id="t-complete-login-desc">After Google redirects to the localhost callback (browser will show an error page), copy the full URL from the address bar and paste it here.</div>
      <div class="stack">
        <div class="field">
          <span class="label" id="t-callback-url">Callback URL</span>
          <textarea id="callback-url" class="textarea" placeholder="http://127.0.0.1:.../oauth2callback?code=...&state=..."></textarea>
        </div>
        <div class="row">
          <button class="btn btn-primary" id="complete-login-btn">Complete Login</button>
          <button class="btn btn-outline" id="check-status-btn">Check Status</button>
        </div>
        <div id="login-meta" style="color:var(--text3);font-size:13px"></div>
        <div id="login-output" class="code-block" style="display:none"></div>
      </div>
    </div>
  </div>

  <!-- Row 2: Credentials -->
  <div class="card" style="margin-bottom:16px">
    <div class="card-header">
      <div>
        <div class="card-title" id="t-credentials">Credentials</div>
        <div style="color:var(--text3);font-size:13px" id="t-cred-desc">Manage your OAuth credentials. Switch active credential, view quota, or delete.</div>
      </div>
      <div class="row">
        <button class="btn btn-outline btn-sm" id="refresh-creds-btn">Refresh</button>
        <button class="btn btn-danger btn-sm" id="delete-all-btn">Delete All</button>
      </div>
    </div>
    <div id="cred-list" class="cred-grid"></div>
  </div>

  <!-- Row 3: Quotas + Model + Quota Detail -->
  <div class="grid grid-32" style="margin-bottom:16px">

    <!-- Quota Overview -->
    <div class="card">
      <div class="card-header">
        <div class="card-title" id="t-quota-overview">Quota Overview</div>
        <button class="btn btn-outline btn-sm" id="refresh-quotas-btn">Refresh</button>
      </div>
      <div id="quota-list"></div>
    </div>

    <!-- Right column: Model + Quota Detail -->
    <div class="stack">
      <!-- Model -->
      <div class="card">
        <div class="card-title" id="t-default-model">Default Model</div>
        <div class="card-desc" id="t-default-model-desc">Used when chat requests don't specify a model.</div>
        <div class="field">
          <select id="model-select" class="select"></select>
        </div>
        <div class="row" style="margin-top:10px">
          <button class="btn btn-primary btn-sm" id="save-model-btn">Save</button>
          <span id="model-meta" style="color:var(--text3);font-size:12px"></span>
        </div>
      </div>

      <!-- Quota Detail -->
      <div class="card" style="flex:1">
        <div class="card-title" id="t-quota-detail">Quota Detail</div>
        <div class="card-desc" id="t-quota-detail-desc">Click "View Quota" on a credential to see its raw quota data.</div>
        <div id="quota-detail-meta" style="color:var(--text3);font-size:12px;margin-bottom:8px"></div>
        <div id="quota-detail" class="code-block" style="min-height:100px"></div>
      </div>
    </div>
  </div>

  <!-- Row 4: Token Management + Request Settings -->
  <div class="grid grid-2" style="margin-bottom:16px">
    <!-- Token Management -->
    <div class="card">
      <div class="card-title" id="t-token-mgmt">Token Management</div>
      <div class="card-desc" id="t-token-mgmt-desc">Token is used for both Web login and API Authorization header.</div>
      <div class="field">
        <label class="label" id="t-new-token-label">New Token</label>
        <input type="text" id="new-token-input" class="input" placeholder="Enter new token..."/>
      </div>
      <div class="row" style="margin-top:10px">
        <button class="btn btn-primary btn-sm" id="change-token-btn">Change Token</button>
        <span id="token-meta" style="color:var(--text3);font-size:12px"></span>
      </div>
      <label class="toggle-row" style="margin-top:14px">
        <input type="checkbox" id="open-api-toggle"/>
        <span id="t-open-api-label">Disable API Auth</span>
        <span class="toggle-hint" id="t-open-api-hint">Allow API requests without token (Web login still required)</span>
      </label>
      <div class="row" style="margin-top:8px">
        <button class="btn btn-outline btn-sm" id="save-open-api-btn" style="font-size:12px" id2="t-save-open-api">Save</button>
        <span id="open-api-meta" style="color:var(--text3);font-size:12px"></span>
      </div>
    </div>

    <!-- Request Settings -->
    <div class="card">
      <div class="card-title" id="t-req-settings">Request Settings</div>
      <div class="card-desc" id="t-req-settings-desc">Configure credential rotation and error retry behavior.</div>
      <div class="stack" style="gap:12px">
        <label class="toggle-row">
          <input type="checkbox" id="rotation-toggle"/>
          <span id="t-rotation-label">Credential Rotation</span>
          <span class="toggle-hint" id="t-rotation-hint">Round-robin across all credentials per request</span>
        </label>
        <label class="toggle-row">
          <input type="checkbox" id="retry-toggle"/>
          <span id="t-retry-label">Auto Retry on Error</span>
          <span class="toggle-hint" id="t-retry-hint">Automatically retry failed requests</span>
        </label>
        <div class="field" id="retry-count-row" style="display:none">
          <span class="label" id="t-retry-count-label">Retry Count</span>
          <select id="retry-count-select" class="select" style="width:80px">
            <option value="1">1</option><option value="2">2</option><option value="3" selected>3</option>
            <option value="4">4</option><option value="5">5</option>
          </select>
        </div>
        <div style="border-top:1px solid var(--border);margin:4px 0 8px;padding-top:8px">
          <div style="font-size:12px;color:var(--text3);margin-bottom:8px" id="t-cli-init-title">CLI Initialization (disabling speeds up cold start)</div>
          <label class="toggle-row">
            <input type="checkbox" id="mcp-toggle"/>
            <span id="t-mcp-label">MCP Servers</span>
            <span class="toggle-hint" id="t-mcp-hint">Start MCP servers in CLI subprocess</span>
          </label>
          <label class="toggle-row">
            <input type="checkbox" id="extensions-toggle"/>
            <span id="t-extensions-label">Extensions</span>
            <span class="toggle-hint" id="t-extensions-hint">Load extensions in CLI subprocess</span>
          </label>
          <label class="toggle-row">
            <input type="checkbox" id="skills-toggle"/>
            <span id="t-skills-label">Skills</span>
            <span class="toggle-hint" id="t-skills-hint">Enable skill discovery in CLI subprocess</span>
          </label>
        </div>
        <div class="field">
          <span class="label" id="t-timeout-label">Timeout (seconds)</span>
          <div class="row" style="gap:8px;align-items:center">
            <input type="number" id="timeout-input" class="input" style="width:100px" min="0" step="10" value="0"/>
            <span class="toggle-hint" id="t-timeout-hint" style="margin-left:0">0 = use default</span>
          </div>
        </div>
        <div class="row">
          <button class="btn btn-primary btn-sm" id="save-settings-btn">Save</button>
          <span id="settings-meta" style="color:var(--text3);font-size:12px"></span>
        </div>
      </div>
    </div>
  </div>

  <!-- Row 5: API Docs -->
  <div class="card">
    <div class="card-title" id="t-api-endpoints">API Endpoints</div>
    <div class="card-desc" id="t-api-desc">All endpoints require <code style="color:var(--accent)">Authorization: Bearer &lt;token&gt;</code> header.</div>
    <div id="ep-list"></div>
  </div>

  <div class="footer">
    <div id="footer-license-1"><strong>License:</strong> Upstream Gemini CLI code remains Apache-2.0.</div>
    <div id="footer-license-2">gemini-api2cli-specific files in this fork are marked under CNC-1.0. See LICENSING.md for the current scope.</div>
  </div>

</div>

<script>
const TOKEN_KEY = 'gemini_prompt_api_token';
const LANG_KEY = 'gemini_prompt_api_lang';
const S = {
  token: localStorage.getItem(TOKEN_KEY) || '',
  lang: localStorage.getItem(LANG_KEY) || (navigator.language.startsWith('zh') ? 'zh' : 'en'),
  loginId: null,
  credentials: [],
  lastHealth: null,
  lastModels: null,
  lastCreds: null,
  lastQuotas: null,
};

const $ = id => document.getElementById(id);

/* ── i18n ── */
const I = {
  en: {
    authSubtitle: 'Prompt API Management Console',
    authPlaceholder: 'Enter access token',
    authSignIn: 'Sign In',
    authSigningIn: 'Signing in...',
    authEmpty: 'Please enter a token.',
    authInvalid: 'Invalid token.',
    authConnErr: 'Connection error: ',
    refreshAll: 'Refresh All',
    signOut: 'Sign Out',
    startLogin: 'Start Login',
    startLoginDesc: 'Initiate a Google OAuth flow for a new credential.',
    credLabel: 'Credential Label',
    credLabelPh: 'e.g. Main Google Account',
    openAuthUrl: 'Open Auth URL',
    authUrl: 'Auth URL',
    authUrlPh: 'Auth URL will appear here after starting login...',
    redirectUri: 'Redirect URI',
    redirectUriPh: 'Redirect URI...',
    completeLogin: 'Complete Login',
    completeLoginDesc: 'After Google redirects to the localhost callback (browser will show an error page), copy the full URL from the address bar and paste it here.',
    callbackUrl: 'Callback URL',
    callbackUrlPh: 'http://127.0.0.1:.../oauth2callback?code=...&state=...',
    checkStatus: 'Check Status',
    credentials: 'Credentials',
    credDesc: 'Manage your OAuth credentials. Switch active credential, view quota, or delete.',
    refresh: 'Refresh',
    deleteAll: 'Delete All',
    quotaOverview: 'Quota Overview',
    defaultModel: 'Default Model',
    defaultModelDesc: "Used when chat requests don't specify a model.",
    save: 'Save',
    quotaDetail: 'Quota Detail',
    quotaDetailDesc: 'Click "View Quota" on a credential to see its raw quota data.',
    apiEndpoints: 'API Endpoints',
    apiEndpointsDesc: 'All endpoints require <code style="color:var(--accent)">Authorization: Bearer &lt;token&gt;</code> header.',
    noCreds: 'No credentials yet. Start a login flow to create one.',
    noQuota: 'No quota data. Add credentials first.',
    active: 'Active',
    stored: 'Stored',
    setActive: 'Set Active',
    viewQuota: 'View Quota',
    delete: 'Delete',
    notLoggedIn: 'Not logged in',
    loginStarted: 'Login started. Credential: ',
    loginCompleted: 'Login completed successfully.',
    startFirst: 'Start a login flow first.',
    noLoginFlow: 'No active login flow.',
    saved: 'Saved: ',
    confirmDeleteAll: 'Delete ALL managed credentials? This cannot be undone.',
    confirmDelete: 'Delete credential?\\n',
    loadingQuota: 'Loading quota for ',
    credentialColon: 'Credential: ',
    sessionExpired: 'Session expired.',
    health: 'Health', cli: 'CLI', context: 'Context', model: 'Model', credential: 'Credential',
    ok: 'OK', error: 'Error', built: 'Built', notBuilt: 'Not Built', isolated: 'Isolated', unknown: 'Unknown', none: 'None',
    remaining: 'Remaining', numeric: 'Numeric', plan: 'Plan', credits: 'Credits', reset: 'Reset', models: 'Models',
    statusOk: 'OK', statusNotLoggedIn: 'Not Logged In', statusError: 'Error',
    tokenMgmt: 'Token Management',
    tokenMgmtDesc: 'Token applies to both Web console login and API request Authorization header.',
    openApiLabel: 'Disable API Auth',
    openApiHint: 'Allow API requests without token (Web login still required)',
    openApiSaved: 'Saved.',
    newTokenLabel: 'New Token',
    newTokenPh: 'Enter new token...',
    changeToken: 'Change Token',
    tokenChanged: 'Token changed. Please re-login with the new token.',
    tokenEmpty: 'Please enter a token.',
    testSuccess: 'OK — Response received.',
    testing: 'Testing...',
    testCredBtn: 'Test',
    testCredTip: 'Send a test message using this credential.',
    reqSettings: 'Request Settings',
    reqSettingsDesc: 'Configure credential rotation and error retry behavior.',
    rotationLabel: 'Credential Rotation',
    rotationHint: 'Round-robin across all credentials per request',
    retryLabel: 'Auto Retry on Error',
    retryHint: 'Automatically retry failed requests',
    retryCountLabel: 'Retry Count',
    timeoutLabel: 'Timeout (seconds)',
    timeoutHint: '0 = use default',
    settingsSaved: 'Settings saved.',
    cliInitTitle: 'CLI Initialization (disabling speeds up cold start)',
    mcpLabel: 'MCP Servers',
    mcpHint: 'Start MCP servers in CLI subprocess',
    extensionsLabel: 'Extensions',
    extensionsHint: 'Load extensions in CLI subprocess',
    skillsLabel: 'Skills',
    skillsHint: 'Enable skill discovery in CLI subprocess',
    epGeminiGen: 'Gemini native non-streaming. Request/response in Gemini API format.',
    epGeminiStream: 'Gemini native streaming (SSE). Request in Gemini API format.',
    epOpenai: 'OpenAI-compatible chat completions. Set "stream":true for SSE streaming.',
    epModels: 'List available models and aliases.',
    epModelsCur: 'Get current default model.',
    epModelsSet: 'Set default model. Body: {"model":"..."}',
    epCreds: 'List all managed credentials.',
    epCredsCur: 'Get current active credential.',
    epCredsSet: 'Set active credential. Body: {"credentialId":"..."}',
    epCredsDel: 'Delete all credentials.',
    epCredDel: 'Delete a specific credential.',
    epLogin: 'Start OAuth login flow.',
    epLoginStatus: 'Check login status.',
    epLoginComplete: 'Complete OAuth with callback URL.',
    epQuotas: 'Get quotas for all credentials.',
    epQuota: 'Get quota for a specific credential.',
    epHealth: 'Health check.',
    footerLicense1: '<strong>License:</strong> Upstream Gemini CLI code remains Apache-2.0.',
    footerLicense2: 'gemini-api2cli-specific files in this fork are marked under CNC-1.0. See LICENSING.md for the current scope.',
  },
  zh: {
    authSubtitle: 'Prompt API 管理控制台',
    authPlaceholder: '请输入访问令牌',
    authSignIn: '登录',
    authSigningIn: '登录中...',
    authEmpty: '请输入令牌。',
    authInvalid: '令牌无效。',
    authConnErr: '连接错误：',
    refreshAll: '刷新全部',
    signOut: '退出登录',
    startLogin: '开始登录',
    startLoginDesc: '为新凭据发起一次 Google OAuth 登录流程。',
    credLabel: '凭据名称',
    credLabelPh: '例如：主 Google 账号',
    openAuthUrl: '打开授权链接',
    authUrl: '授权链接',
    authUrlPh: '开始登录后，授权链接会显示在这里...',
    redirectUri: '回调地址',
    redirectUriPh: '回调地址...',
    completeLogin: '完成登录',
    completeLoginDesc: 'Google 跳转到 localhost 回调地址后，浏览器会显示无法访问。请将地址栏中的完整 URL 复制到这里提交。',
    callbackUrl: '回调 URL',
    callbackUrlPh: 'http://127.0.0.1:.../oauth2callback?code=...&state=...',
    checkStatus: '查看状态',
    credentials: '凭据管理',
    credDesc: '管理 OAuth 凭据。可切换当前凭据、查看额度或删除。',
    refresh: '刷新',
    deleteAll: '删除全部',
    quotaOverview: '额度总览',
    defaultModel: '默认模型',
    defaultModelDesc: '聊天请求未指定模型时使用此默认模型。',
    save: '保存',
    quotaDetail: '额度详情',
    quotaDetailDesc: '点击凭据上的"查看额度"按钮可在此查看原始额度数据。',
    apiEndpoints: 'API 接口文档',
    apiEndpointsDesc: '所有接口需要 <code style="color:var(--accent)">Authorization: Bearer &lt;token&gt;</code> 请求头。',
    noCreds: '暂无凭据。请先发起登录流程。',
    noQuota: '暂无额度数据。请先添加凭据。',
    active: '当前使用',
    stored: '已存储',
    setActive: '设为当前',
    viewQuota: '查看额度',
    delete: '删除',
    notLoggedIn: '未登录',
    loginStarted: '登录已发起，凭据 ID：',
    loginCompleted: '登录已完成。',
    startFirst: '请先发起一次登录流程。',
    noLoginFlow: '当前没有进行中的登录流程。',
    saved: '已保存：',
    confirmDeleteAll: '确定删除全部凭据吗？此操作不可撤销。',
    confirmDelete: '确定删除此凭据吗？\\n',
    loadingQuota: '正在加载额度：',
    credentialColon: '凭据：',
    sessionExpired: '会话已过期。',
    health: '健康状态', cli: 'CLI', context: '上下文', model: '模型', credential: '凭据',
    ok: '正常', error: '异常', built: '已构建', notBuilt: '未构建', isolated: '隔离', unknown: '未知', none: '无',
    remaining: '剩余比例', numeric: '数值额度', plan: '套餐', credits: '积分', reset: '重置时间', models: '模型数',
    statusOk: '正常', statusNotLoggedIn: '未登录', statusError: '错误',
    tokenMgmt: '密钥管理',
    tokenMgmtDesc: '密钥同时用于 Web 管理页面登录和 API 请求的 Authorization 请求头鉴权。',
    openApiLabel: '放开 API 鉴权',
    openApiHint: '允许 API 请求不带密钥（Web 登录仍需密钥）',
    openApiSaved: '已保存。',
    newTokenLabel: '新密钥',
    newTokenPh: '输入新密钥...',
    changeToken: '更改密钥',
    tokenChanged: '密钥已更改，请使用新密钥重新登录。',
    tokenEmpty: '请输入密钥。',
    testSuccess: '正常 — 已收到响应。',
    testing: '测试中...',
    testCredBtn: '测试',
    testCredTip: '使用此凭据发送测试消息。',
    reqSettings: '请求设置',
    reqSettingsDesc: '配置凭据轮询和错误重试行为。',
    rotationLabel: '凭据轮询',
    rotationHint: '每次请求轮流使用不同凭据',
    retryLabel: '错误自动重试',
    retryHint: '请求失败时自动重试',
    retryCountLabel: '重试次数',
    timeoutLabel: '超时时间（秒）',
    timeoutHint: '0 = 使用默认值',
    settingsSaved: '设置已保存。',
    cliInitTitle: 'CLI 初始化项（关闭可加快冷启动速度）',
    mcpLabel: 'MCP 服务器',
    mcpHint: '在 CLI 子进程中启动 MCP 服务器',
    extensionsLabel: '扩展',
    extensionsHint: '在 CLI 子进程中加载扩展',
    skillsLabel: '技能',
    skillsHint: '在 CLI 子进程中启用技能发现',
    epGeminiGen: 'Gemini 原生非流式接口，请求/响应均为 Gemini API 格式。',
    epGeminiStream: 'Gemini 原生流式接口 (SSE)，请求为 Gemini API 格式。',
    epOpenai: 'OpenAI 兼容聊天补全接口，设置 "stream":true 开启 SSE 流式。',
    epModels: '列出可用模型和别名。',
    epModelsCur: '获取当前默认模型。',
    epModelsSet: '设置默认模型。Body: {"model":"..."}',
    epCreds: '列出所有托管凭据。',
    epCredsCur: '获取当前活跃凭据。',
    epCredsSet: '设置活跃凭据。Body: {"credentialId":"..."}',
    epCredsDel: '删除所有凭据。',
    epCredDel: '删除指定凭据。',
    epLogin: '发起 OAuth 登录流程。',
    epLoginStatus: '查看登录状态。',
    epLoginComplete: '用回调 URL 完成 OAuth 登录。',
    epQuotas: '获取所有凭据的额度。',
    epQuota: '获取指定凭据的额度。',
    epHealth: '健康检查。',
    footerLicense1: '<strong>许可说明：</strong>上游 Gemini CLI 代码仍然保持 Apache-2.0。',
    footerLicense2: '这个 fork 中新增的 gemini-api2cli 特定文件标记为 CNC-1.0。当前适用范围请查看 LICENSING.md。',
  },
};

function t(key) { return (I[S.lang] || I.en)[key] || I.en[key] || key; }

/* ── Apply language to all static elements ── */
function applyLang() {
  document.documentElement.lang = S.lang === 'zh' ? 'zh-CN' : 'en';
  $('lang-btn').textContent = S.lang === 'zh' ? '中文' : 'EN';
  // Auth screen
  $('auth-subtitle').textContent = t('authSubtitle');
  $('token-input').placeholder = t('authPlaceholder');
  if (!$('auth-submit').disabled) $('auth-submit').textContent = t('authSignIn');
  // Header
  $('refresh-all-btn').textContent = t('refreshAll');
  $('logout-btn').textContent = t('signOut');
  // Start Login
  $('t-start-login').textContent = t('startLogin');
  $('t-start-login-desc').textContent = t('startLoginDesc');
  $('t-cred-label').textContent = t('credLabel');
  $('login-label').placeholder = t('credLabelPh');
  $('start-login-btn').textContent = t('startLogin');
  $('open-auth-btn').textContent = t('openAuthUrl');
  $('t-auth-url').textContent = t('authUrl');
  $('auth-url').placeholder = t('authUrlPh');
  $('t-redirect-uri').textContent = t('redirectUri');
  $('redirect-uri').placeholder = t('redirectUriPh');
  // Complete Login
  $('t-complete-login').textContent = t('completeLogin');
  $('t-complete-login-desc').textContent = t('completeLoginDesc');
  $('t-callback-url').textContent = t('callbackUrl');
  $('callback-url').placeholder = t('callbackUrlPh');
  $('complete-login-btn').textContent = t('completeLogin');
  $('check-status-btn').textContent = t('checkStatus');
  // Credentials
  $('t-credentials').textContent = t('credentials');
  $('t-cred-desc').textContent = t('credDesc');
  $('refresh-creds-btn').textContent = t('refresh');
  $('delete-all-btn').textContent = t('deleteAll');
  // Quota
  $('t-quota-overview').textContent = t('quotaOverview');
  $('refresh-quotas-btn').textContent = t('refresh');
  // Model
  $('t-default-model').textContent = t('defaultModel');
  $('t-default-model-desc').textContent = t('defaultModelDesc');
  $('save-model-btn').textContent = t('save');
  // Quota Detail
  $('t-quota-detail').textContent = t('quotaDetail');
  $('t-quota-detail-desc').textContent = t('quotaDetailDesc');
  // Token Management
  $('t-token-mgmt').textContent = t('tokenMgmt');
  $('t-token-mgmt-desc').textContent = t('tokenMgmtDesc');
  $('t-new-token-label').textContent = t('newTokenLabel');
  $('new-token-input').placeholder = t('newTokenPh');
  $('change-token-btn').textContent = t('changeToken');
  $('t-open-api-label').textContent = t('openApiLabel');
  $('t-open-api-hint').textContent = t('openApiHint');
  $('save-open-api-btn').textContent = t('save');
  // Request Settings
  $('t-req-settings').textContent = t('reqSettings');
  $('t-req-settings-desc').textContent = t('reqSettingsDesc');
  $('t-rotation-label').textContent = t('rotationLabel');
  $('t-rotation-hint').textContent = t('rotationHint');
  $('t-retry-label').textContent = t('retryLabel');
  $('t-retry-hint').textContent = t('retryHint');
  $('t-retry-count-label').textContent = t('retryCountLabel');
  $('t-cli-init-title').textContent = t('cliInitTitle');
  $('t-mcp-label').textContent = t('mcpLabel');
  $('t-mcp-hint').textContent = t('mcpHint');
  $('t-extensions-label').textContent = t('extensionsLabel');
  $('t-extensions-hint').textContent = t('extensionsHint');
  $('t-skills-label').textContent = t('skillsLabel');
  $('t-skills-hint').textContent = t('skillsHint');
  $('t-timeout-label').textContent = t('timeoutLabel');
  $('t-timeout-hint').textContent = t('timeoutHint');
  $('save-settings-btn').textContent = t('save');
  // API
  $('t-api-endpoints').textContent = t('apiEndpoints');
  $('t-api-desc').innerHTML = t('apiEndpointsDesc');
  // Footer
  $('footer-license-1').innerHTML = t('footerLicense1');
  $('footer-license-2').textContent = t('footerLicense2');
  // Re-render dynamic content with new language
  renderEndpoints();
  if (S.lastHealth) renderStatus(S.lastHealth, S.lastModels, S.lastCreds);
  if (S.lastCreds) renderCreds({ credentials: S.lastCreds.credentials || S.credentials });
  if (S.lastQuotas) renderQuotas(S.lastQuotas);
}

$('lang-btn').onclick = () => {
  S.lang = S.lang === 'en' ? 'zh' : 'en';
  localStorage.setItem(LANG_KEY, S.lang);
  applyLang();
};

/* ── Auth ── */
async function showApp() {
  // Pre-load data before switching screens so the spinner stays visible
  await boot();
  $('auth-screen').style.display = 'none';
  $('app').style.display = 'block';
}

async function tryAuth(token) {
  const r = await fetch('/v1/auth/check', {
    headers: { 'Authorization': 'Bearer ' + token },
  });
  return r.ok;
}

$('auth-submit').onclick = async () => {
  const token = $('token-input').value.trim();
  if (!token) { $('auth-error').textContent = t('authEmpty'); return; }
  const btn = $('auth-submit');
  const origText = btn.textContent;
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>' + t('authSigningIn');
  $('auth-error').textContent = '';
  try {
    if (await tryAuth(token)) {
      S.token = token;
      localStorage.setItem(TOKEN_KEY, token);
      $('auth-error').textContent = '';
      await showApp();
    } else {
      $('auth-error').textContent = t('authInvalid');
    }
  } catch (e) {
    $('auth-error').textContent = t('authConnErr') + e.message;
  } finally {
    btn.disabled = false;
    btn.textContent = origText;
  }
};

$('token-input').onkeydown = e => { if (e.key === 'Enter') $('auth-submit').click(); };

$('logout-btn').onclick = () => {
  S.token = '';
  localStorage.removeItem(TOKEN_KEY);
  $('app').style.display = 'none';
  $('auth-screen').style.display = 'flex';
  $('token-input').value = '';
  $('auth-error').textContent = '';
};

/* ── API Helper ── */
async function api(path, opts = {}) {
  const r = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + S.token,
      ...(opts.headers || {}),
    },
    ...opts,
  });
  if (r.status === 401) {
    $('logout-btn').click();
    throw new Error(t('sessionExpired'));
  }
  const text = await r.text();
  const body = text ? JSON.parse(text) : null;
  if (!r.ok) throw new Error(body?.error || r.statusText || 'Request failed');
  return body;
}

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function setNotice(msg, type) {
  const el = $('notice');
  el.classList.remove('visible','notice-ok');
  if (!msg) { el.textContent = ''; return; }
  el.textContent = msg;
  if (type === 'ok') el.classList.add('notice-ok');
  el.classList.add('visible');
  // 成功提示 5 秒后自动消失
  if (type === 'ok') setTimeout(() => { el.classList.remove('visible','notice-ok'); }, 5000);
}

/* ── Render: Status Bar ── */
function renderStatus(health, models, creds) {
  S.lastHealth = health; S.lastModels = models; S.lastCreds = creds;
  const items = [
    { l: t('health'), v: health.ok ? t('ok') : t('error'), d: health.ok ? 'ok' : 'err' },
    { l: t('cli'), v: health.cliBuilt ? t('built') : t('notBuilt'), d: health.cliBuilt ? 'ok' : 'err' },
    { l: t('context'), v: t('isolated'), d: 'ok' },
    { l: t('model'), v: models.currentModel?.label || t('unknown'), d: 'warn' },
    { l: t('credential'), v: creds.currentCredentialId ? t('active') : t('none'), d: creds.currentCredentialId ? 'ok' : 'warn' },
  ];
  $('status-bar').innerHTML = items.map(i =>
    '<div class="pill"><span class="dot dot-'+i.d+'"></span><strong>'+esc(i.l)+'</strong>&nbsp;'+esc(i.v)+'</div>'
  ).join('');
}

/* ── Render: Credentials ── */
function renderCreds(payload) {
  S.credentials = payload.credentials || [];
  if (!S.credentials.length) {
    $('cred-list').innerHTML = '<div class="empty">'+esc(t('noCreds'))+'</div>';
    return;
  }
  $('cred-list').innerHTML = S.credentials.map(c => {
    const badge = c.isCurrent
      ? '<span class="badge badge-active">'+esc(t('active'))+'</span>'
      : '<span class="badge badge-stored">'+esc(t('stored'))+'</span>';
    return '<div class="cred-card'+(c.isCurrent?' active':'')+'">'+
      '<div style="display:flex;justify-content:space-between;align-items:flex-start">'+
        '<div><div class="cred-name">'+esc(c.label)+'</div>'+
        '<div class="cred-email">'+(c.email?esc(c.email):esc(t('notLoggedIn')))+'</div>'+
        '<div class="cred-id">'+esc(c.id)+'</div></div>'+
        badge+
      '</div>'+
      '<div class="cred-actions">'+
        '<button class="btn btn-ghost btn-sm" data-a="switch" data-id="'+esc(c.id)+'">'+esc(t('setActive'))+'</button>'+
        '<button class="btn btn-outline btn-sm" data-a="test" data-id="'+esc(c.id)+'" title="'+esc(t('testCredTip'))+'">'+esc(t('testCredBtn'))+'</button>'+
        '<button class="btn btn-outline btn-sm" data-a="quota" data-id="'+esc(c.id)+'">'+esc(t('viewQuota'))+'</button>'+
        '<button class="btn btn-danger btn-sm" data-a="delete" data-id="'+esc(c.id)+'">'+esc(t('delete'))+'</button>'+
      '</div>'+
      '<div class="cred-test-result" id="cred-test-'+esc(c.id)+'"></div>'+
      '</div>';
  }).join('');
}

/* ── Render: Quotas ── */
function renderQuotas(payload) {
  S.lastQuotas = payload;
  const quotas = payload.quotas || [];
  if (!quotas.length) {
    $('quota-list').innerHTML = '<div class="empty">'+esc(t('noQuota'))+'</div>';
    return;
  }
  $('quota-list').innerHTML = quotas.map(e => {
    const tot = e.quotaSummary?.totals || {};
    const models = e.quotaSummary?.models || [];
    const plan = e.userTierName || e.userTier || '--';
    const chips = models.length
      ? '<div class="chip-row">'+models.map(m=>'<span class="chip">'+esc(m.label||m.id)+'</span>').join('')+'</div>'
      : '';
    const statusBadge = e.status === 'ok'
      ? '<span class="badge badge-active">'+esc(t('statusOk'))+'</span>'
      : '<span class="badge badge-stored">'+esc(localeStatus(e.status))+'</span>';
    return '<div class="quota-card">'+
      '<div style="display:flex;justify-content:space-between;align-items:flex-start">'+
        '<div><strong>'+esc(e.credential.label)+'</strong>'+
        '<div style="color:var(--text3);font-size:12px">'+esc(e.credential.email||e.credential.id)+'</div></div>'+
        statusBadge+
      '</div>'+
      '<div class="metric-grid">'+
        metric(t('remaining'), fmtFraction(tot))+
        metric(t('numeric'), fmtCount(tot))+
        metric(t('plan'), plan)+
        metric(t('credits'), fmtCredits(e))+
        metric(t('reset'), fmtDate(tot.resetTime))+
        metric(t('models'), String(tot.modelCount??models.length??'--'))+
      '</div>'+
      chips+
      (e.error?'<div style="margin-top:8px;color:var(--red);font-size:12px">'+esc(e.error)+'</div>':'')+
    '</div>';
  }).join('');
}

function metric(label, value) {
  return '<div class="metric"><div class="metric-label">'+esc(label)+'</div><div class="metric-value" style="'+(String(value).length>10?'font-size:14px':'')+'">'+esc(value)+'</div></div>';
}

function fmtFraction(tot) {
  if (typeof tot.minRemainingFractionPercent !== 'number') return '--';
  if (tot.allModelsFull) return '100%';
  if (typeof tot.maxRemainingFractionPercent === 'number' && tot.maxRemainingFractionPercent !== tot.minRemainingFractionPercent) {
    return tot.minRemainingFractionPercent+'% - '+tot.maxRemainingFractionPercent+'%';
  }
  return tot.minRemainingFractionPercent + '%';
}

function fmtCount(tot) {
  if (typeof tot.remaining === 'number' && typeof tot.limit === 'number' && tot.limit > 0) return tot.remaining+' / '+tot.limit;
  if (typeof tot.remaining === 'number') return String(tot.remaining);
  return '--';
}

function fmtCredits(e) {
  if (typeof e.creditBalance === 'number' && Number.isFinite(e.creditBalance) && e.creditBalance > 0) return String(e.creditBalance);
  return '--';
}

function fmtDate(v) {
  if (!v) return '--';
  const d = new Date(v);
  if (isNaN(d.getTime())) return String(v);
  const loc = S.lang === 'zh' ? 'zh-CN' : 'en-US';
  return new Intl.DateTimeFormat(loc,{dateStyle:'medium',timeStyle:'short'}).format(d);
}

function localeStatus(s) {
  if (s==='ok') return t('statusOk');
  if (s==='not_logged_in') return t('statusNotLoggedIn');
  if (s==='error') return t('statusError');
  return s;
}

/* ── Render: Models ── */
function renderModels(payload) {
  const cur = payload.currentModel?.id;
  const opts = [
    ...(payload.models||[]),
    ...(payload.aliases||[]).map(a=>({id:a.id,label:a.label+' -> '+a.targetId})),
  ];
  $('model-select').innerHTML = opts.map(m=>
    '<option value="'+esc(m.id)+'"'+(m.id===cur?' selected':'')+'>'+esc(m.label||m.id)+'</option>'
  ).join('');
}

/* ── Render: Endpoints ── */
function renderEndpoints() {
  const eps = [
    ['POST','/v1/gemini/generateContent',t('epGeminiGen')],
    ['POST','/v1/gemini/streamGenerateContent',t('epGeminiStream')],
    ['POST','/v1/openai/chat/completions',t('epOpenai')],
    ['GET','/v1/models',t('epModels')],
    ['GET','/v1/models/current',t('epModelsCur')],
    ['PUT','/v1/models/current',t('epModelsSet')],
    ['GET','/v1/credentials',t('epCreds')],
    ['GET','/v1/credentials/current',t('epCredsCur')],
    ['PUT','/v1/credentials/current',t('epCredsSet')],
    ['DELETE','/v1/credentials',t('epCredsDel')],
    ['DELETE','/v1/credentials/:id',t('epCredDel')],
    ['POST','/v1/credentials/login',t('epLogin')],
    ['GET','/v1/credentials/login/:id',t('epLoginStatus')],
    ['POST','/v1/credentials/login/:id/complete',t('epLoginComplete')],
    ['GET','/v1/quotas',t('epQuotas')],
    ['GET','/v1/quotas/:credentialId',t('epQuota')],
    ['GET','/v1/health',t('epHealth')],
  ];
  const methodClass = {GET:'ep-get',POST:'ep-post',PUT:'ep-put',DELETE:'ep-delete'};
  $('ep-list').innerHTML = eps.map(([m,p,d])=>
    '<div class="ep-item"><span class="ep-method '+(methodClass[m]||'')+'">'+m+'</span>'+
    '<span class="ep-path">'+esc(p)+'</span>'+
    '<div class="ep-desc">'+esc(d)+'</div></div>'
  ).join('');
}

/* ── Data Loading ── */
async function refreshHealth() {
  const [health,models,creds] = await Promise.all([
    api('/v1/health'), api('/v1/models'), api('/v1/credentials'),
  ]);
  renderStatus(health, models, creds);
  renderModels(models);
  renderCreds(creds);
}

async function refreshQuotas() {
  setNotice('');
  renderQuotas(await api('/v1/quotas'));
}

async function refreshAll() {
  await Promise.all([refreshHealth(), refreshQuotas()]);
}

/* ── Actions ── */
$('refresh-all-btn').onclick = () => refreshAll().catch(showErr);
$('refresh-creds-btn').onclick = () => refreshHealth().catch(showErr);
$('refresh-quotas-btn').onclick = () => refreshQuotas().catch(showErr);

$('start-login-btn').onclick = async () => {
  try {
    setNotice('');
    const p = await api('/v1/credentials/login',{
      method:'POST',
      body:JSON.stringify({label:$('login-label').value.trim()||undefined}),
    });
    S.loginId = p.login.loginId;
    $('auth-url').value = p.login.authUrl||'';
    $('redirect-uri').value = p.login.redirectUri||'';
    $('login-meta').textContent = t('loginStarted')+p.credential.id;
    $('open-auth-btn').disabled = !p.login.authUrl;
    $('login-output').style.display = 'block';
    $('login-output').textContent = JSON.stringify(p, null, 2);
    await refreshHealth();
  } catch(e) { showErr(e); }
};

$('open-auth-btn').onclick = () => {
  const u = $('auth-url').value;
  if (u) window.open(u, '_blank', 'noopener,noreferrer');
};

$('complete-login-btn').onclick = async () => {
  try {
    setNotice('');
    if (!S.loginId) throw new Error(t('startFirst'));
    const p = await api('/v1/credentials/login/'+S.loginId+'/complete',{
      method:'POST',
      body:JSON.stringify({callbackUrl:$('callback-url').value.trim()}),
    });
    $('login-meta').textContent = t('loginCompleted');
    $('login-output').style.display = 'block';
    $('login-output').textContent = JSON.stringify(p, null, 2);
    await refreshAll();
  } catch(e) { showErr(e); }
};

$('check-status-btn').onclick = async () => {
  try {
    setNotice('');
    if (!S.loginId) throw new Error(t('noLoginFlow'));
    const p = await api('/v1/credentials/login/'+S.loginId);
    $('login-output').style.display = 'block';
    $('login-output').textContent = JSON.stringify(p, null, 2);
  } catch(e) { showErr(e); }
};

$('save-model-btn').onclick = async () => {
  try {
    setNotice('');
    const p = await api('/v1/models/current',{
      method:'PUT',
      body:JSON.stringify({model:$('model-select').value}),
    });
    $('model-meta').textContent = t('saved')+p.currentModel.label;
    await refreshHealth();
  } catch(e) { showErr(e); }
};

$('delete-all-btn').onclick = async () => {
  if (!confirm(t('confirmDeleteAll'))) return;
  try {
    setNotice('');
    await api('/v1/credentials',{method:'DELETE'});
    S.loginId = null;
    $('auth-url').value = '';
    $('redirect-uri').value = '';
    $('callback-url').value = '';
    $('login-meta').textContent = '';
    $('login-output').style.display = 'none';
    $('quota-detail').textContent = '';
    $('quota-detail-meta').textContent = '';
    await refreshAll();
  } catch(e) { showErr(e); }
};

/* ── Credential Card Actions (delegation) ── */
$('cred-list').onclick = e => {
  const btn = e.target.closest('button[data-a]');
  if (!btn) return;
  const action = btn.dataset.a;
  const id = btn.dataset.id;
  if (!action || !id) return;

  if (action === 'switch') {
    api('/v1/credentials/current',{method:'PUT',body:JSON.stringify({credentialId:id})})
      .then(()=>refreshAll()).catch(showErr);
  } else if (action === 'quota') {
    $('quota-detail-meta').textContent = t('loadingQuota') + id + '...';
    api('/v1/quotas/'+id).then(p => {
      $('quota-detail-meta').textContent = t('credentialColon') + id;
      $('quota-detail').textContent = JSON.stringify(p, null, 2);
    }).catch(showErr);
  } else if (action === 'test') {
    testCredential(id);
  } else if (action === 'delete') {
    if (!confirm(t('confirmDelete')+id)) return;
    api('/v1/credentials/'+id,{method:'DELETE'}).then(()=>refreshAll()).catch(showErr);
  }
};

/* ── Test a credential ── */
async function testCredential(credentialId) {
  const btn = document.querySelector('button[data-a="test"][data-id="'+credentialId+'"]');
  const resultEl = $('cred-test-'+credentialId);
  if (btn) { btn.disabled = true; btn.textContent = t('testing'); }
  if (resultEl) { resultEl.className = 'cred-test-result'; resultEl.textContent = ''; }
  try {
    const prevCred = S.lastCreds?.currentCredentialId;
    await api('/v1/credentials/current',{method:'PUT',body:JSON.stringify({credentialId})});
    const result = await api('/v1/openai/chat/completions',{
      method:'POST',
      body:JSON.stringify({messages:[{role:'user',content:'Hello, reply with exactly: OK'}]}),
    });
    if (prevCred && prevCred !== credentialId) {
      await api('/v1/credentials/current',{method:'PUT',body:JSON.stringify({credentialId:prevCred})});
    }
    const text = result?.choices?.[0]?.message?.content || '';
    if (resultEl) {
      resultEl.className = 'cred-test-result test-ok';
      resultEl.textContent = t('testSuccess') + ' — ' + text.slice(0,120);
    }
  } catch(e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (resultEl) {
      resultEl.className = 'cred-test-result test-err';
      resultEl.textContent = msg;
    }
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = t('testCredBtn'); }
  }
}

/* ── Token Management ── */
$('change-token-btn').onclick = async () => {
  const newToken = $('new-token-input').value.trim();
  if (!newToken) { setNotice(t('tokenEmpty')); return; }
  try {
    await api('/v1/auth/token',{method:'PUT',body:JSON.stringify({token:newToken})});
    // Update local state and re-login with new token
    S.token = newToken;
    localStorage.setItem(TOKEN_KEY, newToken);
    $('new-token-input').value = '';
    $('token-meta').textContent = t('tokenChanged');
    // Re-enter the app with the new token
    $('auth-screen').style.display = 'flex';
    $('app').style.display = 'none';
    tryAuth(newToken).then(async ok => {
      if (ok) await showApp();
    });
  } catch(e) { showErr(e); }
};

$('save-open-api-btn').onclick = async () => {
  try {
    await api('/v1/auth/open-api',{method:'PUT',body:JSON.stringify({enabled:$('open-api-toggle').checked})});
    $('open-api-meta').textContent = t('openApiSaved');
    setTimeout(() => { $('open-api-meta').textContent = ''; }, 3000);
  } catch(e) { showErr(e); }
};

/* ── Request Settings ── */
$('retry-toggle').onchange = () => {
  $('retry-count-row').style.display = $('retry-toggle').checked ? '' : 'none';
};

$('save-settings-btn').onclick = async () => {
  try {
    const timeoutSec = parseFloat($('timeout-input').value) || 0;
    const p = await api('/v1/settings',{
      method:'PUT',
      body:JSON.stringify({
        rotationEnabled: $('rotation-toggle').checked,
        retryEnabled: $('retry-toggle').checked,
        retryCount: parseInt($('retry-count-select').value, 10),
        timeoutMs: Math.floor(timeoutSec * 1000),
        mcpEnabled: $('mcp-toggle').checked,
        extensionsEnabled: $('extensions-toggle').checked,
        skillsEnabled: $('skills-toggle').checked,
      }),
    });
    $('settings-meta').textContent = t('settingsSaved');
    setTimeout(() => { $('settings-meta').textContent = ''; }, 3000);
  } catch(e) { showErr(e); }
};

async function loadSettings() {
  try {
    const [p, oa] = await Promise.all([api('/v1/settings'), api('/v1/auth/open-api')]);
    const s = p.settings || {};
    $('rotation-toggle').checked = !!s.rotationEnabled;
    $('retry-toggle').checked = !!s.retryEnabled;
    $('retry-count-select').value = String(s.retryCount || 3);
    $('retry-count-row').style.display = s.retryEnabled ? '' : 'none';
    $('mcp-toggle').checked = !!s.mcpEnabled;
    $('extensions-toggle').checked = !!s.extensionsEnabled;
    $('skills-toggle').checked = !!s.skillsEnabled;
    const timeoutSec = (s.timeoutMs || 0) / 1000;
    $('timeout-input').value = timeoutSec > 0 ? String(timeoutSec) : '0';
    const defSec = p.defaultTimeoutMs ? (p.defaultTimeoutMs / 1000) : 600;
    $('t-timeout-hint').textContent = t('timeoutHint') + ' (' + defSec + 's)';
    $('open-api-toggle').checked = !!oa.openApiEnabled;
  } catch(e) {}
}

function showErr(e) {
  setNotice(e instanceof Error ? e.message : String(e));
}

/* ── Boot ── */
async function boot() {
  applyLang();
  try { await Promise.all([refreshAll(), loadSettings()]); } catch(e) { showErr(e); }
}

// Apply language on load (before auth)
applyLang();

// Auto-login if token exists in localStorage
if (S.token) {
  const btn = $('auth-submit');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span>' + t('authSigningIn');
  tryAuth(S.token).then(async ok => {
    if (ok) { await showApp(); }
    else {
      localStorage.removeItem(TOKEN_KEY);
      S.token = '';
    }
  }).catch(() => {}).finally(() => {
    btn.disabled = false;
    btn.textContent = t('authSignIn');
  });
}
</script>
</body>
</html>`;
}
