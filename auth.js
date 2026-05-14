/* ══════════════════════════════════════════════════════════════
   NAIROBI COUNTY BUDGET PLATFORM — auth.js
   Firebase Authentication Module
   Features:
   • Email/password signup with real-time field validation
   • Password strength meter
   • Email verification on signup
   • Login with remember-me
   • Google Sign-In (one-tap)
   • Forgot password / reset email
   • Session persistence (stays logged in on refresh)
   • User avatar + dropdown in header
   • Toast notifications for all auth events
   • Protected tab gating (optional — comment section etc.)

   ── SETUP ───────────────────────────────────────────────────
   1. Replace the firebaseConfig below with YOUR config from
      Firebase Console → Project Settings → Your Apps → Web
   2. In Firebase Console → Authentication → Sign-in methods:
      Enable "Email/Password" and optionally "Google"
   3. Add your GitHub Pages domain to:
      Firebase Console → Authentication → Settings → Authorized domains
   ══════════════════════════════════════════════════════════════ */

/* ─────────────────────────────────────────────────────────────
   STEP 1 ➜  PASTE YOUR FIREBASE CONFIG HERE
   ───────────────────────────────────────────────────────────── */
// Import the functions you need from the SDKs you need
// import { initializeApp } from "firebase/app";
// import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyCbOJ9riYQSneDDTrKXHa2jgl1EKf9LRQw",
  authDomain: "county-budget-dashboard.firebaseapp.com",
  projectId: "county-budget-dashboard",
  storageBucket: "county-budget-dashboard.firebasestorage.app",
  messagingSenderId: "738240493429",
  appId: "1:738240493429:web:5511230b8b786a6acbc53c",
  measurementId: "G-XQ3P7WJ7R3"
};

// Initialize Firebase
// const app = initializeApp(firebaseConfig);
// const analytics = getAnalytics(app);
/* ─────────────────────────────────────────────────────────────
   END CONFIG — do not edit below unless you know what you're doing
   ───────────────────────────────────────────────────────────── */

const Auth = (() => {

  /* ── State ─────────────────────────────────────────── */
  let firebaseApp   = null;
  let firebaseAuth  = null;
  let currentUser   = null;
  let dropdownOpen  = false;
  let resendTimer   = null;
  let resendSeconds = 60;
  let activeMode    = 'login'; // 'login' | 'signup' | 'verify' | 'forgot'

  /* ── Validation Regexes ─────────────────────────────── */
  const RE = {
    email:    /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/,
    name:     /^[a-zA-Z\s'-]{2,50}$/,
    ward:     /^[a-zA-Z\s/'-]{2,60}$/,
    password: /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/,
  };

  /* ── Firebase loader (CDN) ──────────────────────────── */
  function loadFirebase() {
    return new Promise((resolve, reject) => {
      if (window.firebase) { resolve(); return; }
      // Load Firebase App (modular compat)
      const scripts = [
        'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js',
        'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js',
      ];
      // Load sequentially: auth-compat depends on app-compat being ready first
      function loadNext(index) {
        if (index >= scripts.length) { resolve(); return; }
        const s = document.createElement('script');
        s.src = scripts[index];
        s.onload  = () => loadNext(index + 1);
        s.onerror = () => reject(new Error('Failed to load Firebase SDK: ' + scripts[index]));
        document.head.appendChild(s);
      }
      loadNext(0);
    });
  }

  /* ── Initialise ─────────────────────────────────────── */
  async function init() {
    // Inject toast container
    if (!document.getElementById('authToastContainer')) {
      const tc = document.createElement('div');
      tc.id = 'authToastContainer';
      tc.className = 'auth-toast-container';
      document.body.appendChild(tc);
    }

    // Skip if config not set
    if (firebaseConfig.apiKey === 'REPLACE_WITH_YOUR_API_KEY') {
      console.warn('[Auth] Firebase config not set. Auth disabled — add your config to auth.js');
      renderHeaderGuestFallback();
      return;
    }

    try {
      await loadFirebase();
      firebaseApp  = firebase.initializeApp(firebaseConfig);
      firebaseAuth = firebase.auth();

      // Persist session across browser restarts
      await firebaseAuth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);

      // Listen for auth state changes
      firebaseAuth.onAuthStateChanged(user => {
        currentUser = user;
        renderHeader();
        if (user && !user.emailVerified) {
          // Show verify prompt if modal is open
          if (activeMode === 'signup') showVerifyScreen(user.email);
        }
      });

      renderHeaderGuest();
    } catch (err) {
      console.error('[Auth] Init error:', err);
      toast('Authentication service unavailable', 'warning');
      renderHeaderGuestFallback();
    }
  }

  /* ══════════════════════════════════════════════════════
     HEADER RENDERING
     ══════════════════════════════════════════════════════ */
  function renderHeader() {
    if (currentUser) renderHeaderUser(currentUser);
    else renderHeaderGuest();
  }

  function renderHeaderGuest() {
    const container = getOrCreateHeaderAuthSlot();
    container.innerHTML = `
      <button class="auth-login-btn" onclick="Auth.openModal('login')">
        Sign In / Sign Up
      </button>`;
  }

  function renderHeaderGuestFallback() {
    // Show nothing extra if Firebase not configured
    const container = getOrCreateHeaderAuthSlot();
    container.innerHTML = '';
  }

  function renderHeaderUser(user) {
    const initials = getInitials(user.displayName || user.email);
    const name     = user.displayName || user.email.split('@')[0];
    const container = getOrCreateHeaderAuthSlot();
    container.innerHTML = `
      <div style="position:relative">
        <button class="auth-user-btn" onclick="Auth.toggleDropdown()" id="authUserBtn">
          <div class="auth-avatar">${initials}</div>
          <span class="auth-user-name">${escHtml(name)}</span>
          <span style="font-size:10px;color:#7aab8c">&#9660;</span>
        </button>
        <div class="auth-dropdown" id="authDropdown" style="display:none">
          <div class="auth-dropdown-header">
            <div class="auth-dropdown-name">${escHtml(user.displayName || 'Nairobi Resident')}</div>
            <div class="auth-dropdown-email">${escHtml(user.email)}</div>
            <span class="auth-dropdown-verify ${user.emailVerified ? 'verified' : 'unverified'}">
              ${user.emailVerified ? '✓ Email verified' : '⚠ Email not verified'}
            </span>
          </div>
          ${!user.emailVerified ? `
          <button class="auth-dropdown-item" onclick="Auth.resendVerification()">
            <span>✉️</span> Resend verification email
          </button>` : ''}
          <button class="auth-dropdown-item" onclick="Auth.openModal('forgot')">
            <span>🔑</span> Change password
          </button>
          <button class="auth-dropdown-item danger" onclick="Auth.signOut()">
            <span>🚪</span> Sign out
          </button>
        </div>
      </div>`;

    // Close dropdown when clicking outside
    document.addEventListener('click', outsideDropdownHandler);
  }

  function getOrCreateHeaderAuthSlot() {
    let slot = document.getElementById('headerAuthSlot');
    if (!slot) {
      slot = document.createElement('div');
      slot.id = 'headerAuthSlot';
      slot.style.cssText = 'display:flex;align-items:center;gap:8px;flex-shrink:0';
      const hr = document.querySelector('.header-right');
      if (hr) hr.appendChild(slot);
      else document.querySelector('header').appendChild(slot);
    }
    return slot;
  }

  function outsideDropdownHandler(e) {
    const btn = document.getElementById('authUserBtn');
    const dd  = document.getElementById('authDropdown');
    if (dd && btn && !btn.contains(e.target) && !dd.contains(e.target)) {
      closeDropdown();
    }
  }

  function toggleDropdown() {
    const dd = document.getElementById('authDropdown');
    if (!dd) return;
    dropdownOpen = !dropdownOpen;
    dd.style.display = dropdownOpen ? 'block' : 'none';
  }

  function closeDropdown() {
    const dd = document.getElementById('authDropdown');
    if (dd) dd.style.display = 'none';
    dropdownOpen = false;
  }

  /* ══════════════════════════════════════════════════════
     MODAL
     ══════════════════════════════════════════════════════ */
  function openModal(mode = 'login') {
    activeMode = mode;
    if (document.getElementById('authOverlay')) closeModal();

    const overlay = document.createElement('div');
    overlay.id = 'authOverlay';
    overlay.className = 'auth-overlay';
    overlay.innerHTML = buildModalHTML(mode);
    document.body.appendChild(overlay);
    document.body.style.overflow = 'hidden';

    // Focus first input
    setTimeout(() => {
      const first = overlay.querySelector('.auth-input');
      if (first) first.focus();
    }, 100);

    // Close on backdrop click
    overlay.addEventListener('click', e => {
      if (e.target === overlay) closeModal();
    });

    // Attach live validation
    attachValidation(mode);

    // If mode is forgot, show that screen
    if (mode === 'forgot') showForgotScreen();
  }

  function closeModal() {
    const overlay = document.getElementById('authOverlay');
    if (!overlay) return;
    overlay.classList.add('hiding');
    setTimeout(() => {
      overlay.remove();
      document.body.style.overflow = '';
    }, 220);
    clearResendTimer();
  }

  function switchMode(mode) {
    openModal(mode);
  }

  /* ── Modal HTML builder ─────────────────────────────── */
  function buildModalHTML(mode) {
    return `
    <div class="auth-modal" role="dialog" aria-modal="true" aria-label="Sign in or create account">
      <button class="auth-close" onclick="Auth.closeModal()" aria-label="Close">&#10005;</button>
      <div class="auth-modal-logo">&#127963;</div>
      <h2>Welcome to Nairobi Budget Platform</h2>
      <p class="auth-modal-sub">
        Sign in or create an account to post comments, save your People's Budget, and participate in budget oversight.
      </p>

      <!-- Error / Success banners -->
      <div class="auth-error-banner"   id="authErrorBanner"></div>
      <div class="auth-success-banner" id="authSuccessBanner"></div>

      <!-- Tabs -->
      <div class="auth-tabs" id="authTabs">
        <button class="auth-tab ${mode === 'login'  ? 'active' : ''}" onclick="Auth.switchMode('login')">Sign In</button>
        <button class="auth-tab ${mode === 'signup' ? 'active' : ''}" onclick="Auth.switchMode('signup')">Create Account</button>
      </div>

      <!-- ── MAIN FORM AREA ── -->
      <div id="authFormArea">

        <!-- LOGIN FORM -->
        <div id="loginForm" style="display:${mode === 'login' ? 'block' : 'none'}">
          <div class="auth-field">
            <label class="auth-label" for="loginEmail">Email address</label>
            <div class="auth-input-wrap">
              <input class="auth-input" type="email" id="loginEmail" placeholder="you@example.com" autocomplete="email">
              <span class="auth-input-icon" id="loginEmailIcon">&#9993;</span>
            </div>
            <div class="auth-hint" id="loginEmailHint"></div>
          </div>
          <div class="auth-field">
            <label class="auth-label" for="loginPw">Password</label>
            <div class="auth-input-wrap">
              <input class="auth-input" type="password" id="loginPw" placeholder="Your password" autocomplete="current-password">
              <button class="auth-toggle-pw" type="button" onclick="Auth.togglePw('loginPw',this)" tabindex="-1">&#128065;</button>
            </div>
            <div class="auth-hint" id="loginPwHint"></div>
          </div>
          <div class="auth-forgot"><a onclick="Auth.showForgotScreen()">Forgot password?</a></div>
          <div class="auth-check-row">
            <input type="checkbox" id="rememberMe" checked>
            <label class="auth-check-label" for="rememberMe">Keep me signed in</label>
          </div>
          <button class="auth-btn" id="loginBtn" onclick="Auth.handleLogin()">
            <span class="auth-btn-text">Sign In</span>
            <div class="auth-btn-spinner"></div>
          </button>
          <div class="auth-divider">or</div>
          <button class="auth-btn-google" onclick="Auth.handleGoogleSignIn()">
            <svg viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            Continue with Google
          </button>
          <div class="auth-switch">No account? <a onclick="Auth.switchMode('signup')">Create one — it's free</a></div>
        </div>

        <!-- SIGNUP FORM -->
        <div id="signupForm" style="display:${mode === 'signup' ? 'block' : 'none'}">
          <div class="auth-field-row">
            <div class="auth-field">
              <label class="auth-label" for="signupFirst">First name</label>
              <div class="auth-input-wrap">
                <input class="auth-input" type="text" id="signupFirst" placeholder="Grace" autocomplete="given-name">
                <span class="auth-input-icon" id="signupFirstIcon">&#128100;</span>
              </div>
              <div class="auth-hint" id="signupFirstHint"></div>
            </div>
            <div class="auth-field">
              <label class="auth-label" for="signupLast">Last name</label>
              <div class="auth-input-wrap">
                <input class="auth-input" type="text" id="signupLast" placeholder="Njoroge" autocomplete="family-name">
                <span class="auth-input-icon" id="signupLastIcon">&#128100;</span>
              </div>
              <div class="auth-hint" id="signupLastHint"></div>
            </div>
          </div>
          <div class="auth-field">
            <label class="auth-label" for="signupWard">Your ward (optional)</label>
            <div class="auth-input-wrap">
              <input class="auth-input" type="text" id="signupWard" placeholder="e.g. Kibra, Westlands, Kasarani">
              <span class="auth-input-icon" id="signupWardIcon">&#127968;</span>
            </div>
            <div class="auth-hint" id="signupWardHint">Helps attribute your comments to the right ward</div>
          </div>
          <div class="auth-field">
            <label class="auth-label" for="signupEmail">Email address</label>
            <div class="auth-input-wrap">
              <input class="auth-input" type="email" id="signupEmail" placeholder="you@example.com" autocomplete="email">
              <span class="auth-input-icon" id="signupEmailIcon">&#9993;</span>
            </div>
            <div class="auth-hint" id="signupEmailHint"></div>
          </div>
          <div class="auth-field">
            <label class="auth-label" for="signupPw">Password</label>
            <div class="auth-input-wrap">
              <input class="auth-input" type="password" id="signupPw" placeholder="Min. 8 chars, upper, lower, number" autocomplete="new-password">
              <button class="auth-toggle-pw" type="button" onclick="Auth.togglePw('signupPw',this)" tabindex="-1">&#128065;</button>
            </div>
            <div class="pw-strength-wrap">
              <div class="pw-strength-bar"><div class="pw-strength-fill" id="pwStrengthFill"></div></div>
              <div class="pw-strength-label" id="pwStrengthLabel">Enter a password</div>
            </div>
            <div class="auth-hint" id="signupPwHint"></div>
          </div>
          <div class="auth-field">
            <label class="auth-label" for="signupPw2">Confirm password</label>
            <div class="auth-input-wrap">
              <input class="auth-input" type="password" id="signupPw2" placeholder="Repeat password" autocomplete="new-password">
              <button class="auth-toggle-pw" type="button" onclick="Auth.togglePw('signupPw2',this)" tabindex="-1">&#128065;</button>
            </div>
            <div class="auth-hint" id="signupPw2Hint"></div>
          </div>
          <div class="auth-check-row">
            <input type="checkbox" id="agreeTerms">
            <label class="auth-check-label" for="agreeTerms">
              I agree to the <a href="#" onclick="return false">Terms of Use</a> and <a href="#" onclick="return false">Privacy Policy</a>. I am a Nairobi County resident or stakeholder.
            </label>
          </div>
          <button class="auth-btn" id="signupBtn" onclick="Auth.handleSignup()">
            <span class="auth-btn-text">Create Account</span>
            <div class="auth-btn-spinner"></div>
          </button>
          <div class="auth-divider">or</div>
          <button class="auth-btn-google" onclick="Auth.handleGoogleSignIn()">
            <svg viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/></svg>
            Continue with Google
          </button>
          <div class="auth-switch">Already have an account? <a onclick="Auth.switchMode('login')">Sign in</a></div>
        </div>

        <!-- EMAIL VERIFICATION SCREEN -->
        <div id="verifyScreen" class="auth-verify-screen" style="display:none">
          <div class="auth-verify-icon">&#128231;</div>
          <h3>Verify your email</h3>
          <p>We've sent a verification link to <strong id="verifyEmailDisplay"></strong>.<br>
          Click the link in the email to activate your account. Check your spam folder if you don't see it.</p>
          <button class="btn-resend" id="btnResend" onclick="Auth.resendVerification()">Resend verification email</button>
          <div class="resend-timer" id="resendTimer"></div>
          <div style="margin-top:16px">
            <button class="auth-btn" style="margin-bottom:0" onclick="Auth.checkVerificationAndProceed()">
              <span class="auth-btn-text">I've verified my email &rarr;</span>
              <div class="auth-btn-spinner"></div>
            </button>
          </div>
          <div style="margin-top:12px;text-align:center">
            <a style="font-size:.74rem;color:#7aab8c;cursor:pointer" onclick="Auth.switchMode('login')">Back to sign in</a>
          </div>
        </div>

        <!-- FORGOT PASSWORD SCREEN -->
        <div id="forgotScreen" class="auth-forgot-screen">
          <button class="auth-back-btn" onclick="Auth.hideForgotScreen()">&#8592; Back to sign in</button>
          <div class="auth-field">
            <label class="auth-label" for="forgotEmail">Your email address</label>
            <div class="auth-input-wrap">
              <input class="auth-input" type="email" id="forgotEmail" placeholder="you@example.com">
              <span class="auth-input-icon">&#9993;</span>
            </div>
            <div class="auth-hint" id="forgotEmailHint">Enter the email you signed up with</div>
          </div>
          <button class="auth-btn" id="forgotBtn" onclick="Auth.handleForgotPassword()">
            <span class="auth-btn-text">Send reset email</span>
            <div class="auth-btn-spinner"></div>
          </button>
        </div>

      </div><!-- /authFormArea -->
    </div><!-- /auth-modal -->`;
  }

  /* ══════════════════════════════════════════════════════
     LIVE VALIDATION
     ══════════════════════════════════════════════════════ */
  function attachValidation(mode) {
    setTimeout(() => {
      if (mode === 'login') {
        addListener('loginEmail', () => validateField('loginEmail', 'email'));
        addListener('loginPw',    () => validateField('loginPw', 'password-simple'));
      }
      if (mode === 'signup') {
        addListener('signupFirst', () => validateField('signupFirst', 'name'));
        addListener('signupLast',  () => validateField('signupLast',  'name'));
        addListener('signupWard',  () => validateField('signupWard',  'ward'));
        addListener('signupEmail', () => validateField('signupEmail', 'email'));
        addListener('signupPw',    () => {
          validateField('signupPw', 'password');
          updatePasswordStrength(document.getElementById('signupPw')?.value || '');
          if (document.getElementById('signupPw2')?.value) validateField('signupPw2', 'confirm-password');
        });
        addListener('signupPw2',  () => validateField('signupPw2', 'confirm-password'));
        addListener('signupEmail',() => validateField('signupEmail','email'));
      }
    }, 80);
  }

  function addListener(id, fn) {
    const el = document.getElementById(id);
    if (el) { el.addEventListener('input', fn); el.addEventListener('blur', fn); }
  }

  function validateField(id, type) {
    const el    = document.getElementById(id);
    const hint  = document.getElementById(id + 'Hint');
    const icon  = document.getElementById(id + 'Icon');
    if (!el) return false;
    const val = el.value.trim();
    let ok = true; let msg = ''; let cls = '';

    switch (type) {
      case 'email':
        if (!val)                       { ok=false; msg='Email is required'; cls='error'; }
        else if (!RE.email.test(val))   { ok=false; msg='Enter a valid email address'; cls='error'; }
        else                            { msg='Looks good'; cls='ok'; }
        break;
      case 'name':
        if (!val)                       { ok=false; msg='This field is required'; cls='error'; }
        else if (val.length < 2)        { ok=false; msg='Too short — at least 2 characters'; cls='error'; }
        else if (!RE.name.test(val))    { ok=false; msg='Only letters, spaces, hyphens allowed'; cls='error'; }
        else                            { msg=''; cls='ok'; }
        break;
      case 'ward':
        if (val && !RE.ward.test(val))  { ok=false; msg='Invalid ward name'; cls='error'; }
        else                            { msg=''; cls='ok'; }
        break;
      case 'password':
        if (!val)                       { ok=false; msg='Password is required'; cls='error'; }
        else if (val.length < 8)        { ok=false; msg='Minimum 8 characters'; cls='error'; }
        else if (!/[A-Z]/.test(val))    { ok=false; msg='Add at least one uppercase letter'; cls='error'; }
        else if (!/[a-z]/.test(val))    { ok=false; msg='Add at least one lowercase letter'; cls='error'; }
        else if (!/\d/.test(val))       { ok=false; msg='Add at least one number'; cls='error'; }
        else                            { msg='Strong password'; cls='ok'; }
        break;
      case 'password-simple':
        if (!val)                       { ok=false; msg='Password is required'; cls='error'; }
        else                            { msg=''; cls='ok'; }
        break;
      case 'confirm-password': {
        const pw = document.getElementById('signupPw')?.value || '';
        if (!val)                       { ok=false; msg='Please confirm your password'; cls='error'; }
        else if (val !== pw)            { ok=false; msg='Passwords do not match'; cls='error'; }
        else                            { msg='Passwords match'; cls='ok'; }
        break;
      }
    }

    el.classList.toggle('valid',   ok && !!val);
    el.classList.toggle('invalid', !ok && !!val);
    if (hint) { hint.textContent = msg; hint.className = 'auth-hint ' + (val ? cls : ''); }
    return ok;
  }

  function updatePasswordStrength(pw) {
    const fill  = document.getElementById('pwStrengthFill');
    const label = document.getElementById('pwStrengthLabel');
    if (!fill || !label) return;

    let score = 0;
    if (pw.length >= 8)              score++;
    if (/[A-Z]/.test(pw))            score++;
    if (/[a-z]/.test(pw))            score++;
    if (/\d/.test(pw))               score++;
    if (/[^a-zA-Z0-9]/.test(pw))     score++;
    if (pw.length >= 12)             score++;

    const map = [
      { pct:0,   bg:'transparent', lbl:'Enter a password'  },
      { pct:17,  bg:'#e84040',     lbl:'Very weak'         },
      { pct:34,  bg:'#f97316',     lbl:'Weak'              },
      { pct:50,  bg:'#f0b429',     lbl:'Fair'              },
      { pct:67,  bg:'#5fcf85',     lbl:'Good'              },
      { pct:84,  bg:'#2e9e5b',     lbl:'Strong'            },
      { pct:100, bg:'#2e9e5b',     lbl:'Very strong'       },
    ];
    const level = map[Math.min(score, 6)];
    fill.style.width      = level.pct + '%';
    fill.style.background = level.bg;
    label.textContent     = level.lbl;
    label.style.color     = level.bg === 'transparent' ? '#4a7a5c' : level.bg;
  }

  /* ══════════════════════════════════════════════════════
     AUTH ACTIONS
     ══════════════════════════════════════════════════════ */

  /* ── LOGIN ──────────────────────────────────────────── */
  async function handleLogin() {
    clearBanners();
    const emailOk = validateField('loginEmail', 'email');
    const pwOk    = validateField('loginPw',    'password-simple');
    if (!emailOk || !pwOk) return;

    const email = document.getElementById('loginEmail').value.trim();
    const pw    = document.getElementById('loginPw').value;

    setLoading('loginBtn', true);
    try {
      const cred = await firebaseAuth.signInWithEmailAndPassword(email, pw);
      if (!cred.user.emailVerified) {
        showVerifyScreen(cred.user.email);
        setLoading('loginBtn', false);
        return;
      }
      toast(`Welcome back, ${cred.user.displayName || email.split('@')[0]}!`, 'success');
      closeModal();
    } catch (err) {
      setLoading('loginBtn', false);
      showError(friendlyError(err.code));
    }
  }

  /* ── SIGNUP ─────────────────────────────────────────── */
  async function handleSignup() {
    clearBanners();
    const firstOk  = validateField('signupFirst', 'name');
    const lastOk   = validateField('signupLast',  'name');
    const emailOk  = validateField('signupEmail', 'email');
    const pwOk     = validateField('signupPw',    'password');
    const pw2Ok    = validateField('signupPw2',   'confirm-password');
    const terms    = document.getElementById('agreeTerms')?.checked;

    if (!firstOk || !lastOk || !emailOk || !pwOk || !pw2Ok) {
      showError('Please fix the errors above before continuing.');
      return;
    }
    if (!terms) { showError('Please agree to the Terms of Use to continue.'); return; }

    const first = document.getElementById('signupFirst').value.trim();
    const last  = document.getElementById('signupLast').value.trim();
    const ward  = document.getElementById('signupWard')?.value.trim() || '';
    const email = document.getElementById('signupEmail').value.trim();
    const pw    = document.getElementById('signupPw').value;

    setLoading('signupBtn', true);
    try {
      const cred = await firebaseAuth.createUserWithEmailAndPassword(email, pw);

      // Set display name and ward in profile
      await cred.user.updateProfile({
        displayName: `${first} ${last}`,
        photoURL: ward ? `ward:${ward}` : null,
      });

      // Send verification email
      await cred.user.sendEmailVerification();

      setLoading('signupBtn', false);
      showVerifyScreen(email);
      toast('Account created! Please verify your email.', 'success');
    } catch (err) {
      setLoading('signupBtn', false);
      showError(friendlyError(err.code));
    }
  }

  /* ── GOOGLE SIGN-IN ─────────────────────────────────── */
  async function handleGoogleSignIn() {
    clearBanners();
    try {
      const provider = new firebase.auth.GoogleAuthProvider();
      provider.addScope('profile');
      provider.addScope('email');
      const cred = await firebaseAuth.signInWithPopup(provider);
      toast(`Welcome, ${cred.user.displayName || 'Nairobi Resident'}!`, 'success');
      closeModal();
    } catch (err) {
      if (err.code !== 'auth/popup-closed-by-user') {
        showError(friendlyError(err.code));
      }
    }
  }

  /* ── FORGOT PASSWORD ────────────────────────────────── */
  async function handleForgotPassword() {
    clearBanners();
    const emailEl = document.getElementById('forgotEmail');
    if (!emailEl) return;
    const email = emailEl.value.trim();

    if (!email || !RE.email.test(email)) {
      const hint = document.getElementById('forgotEmailHint');
      if (hint) { hint.textContent = 'Enter a valid email address'; hint.className = 'auth-hint error'; }
      return;
    }

    setLoading('forgotBtn', true);
    try {
      await firebaseAuth.sendPasswordResetEmail(email);
      setLoading('forgotBtn', false);
      showSuccess(`Password reset email sent to ${email}. Check your inbox (and spam folder).`);
      emailEl.value = '';
    } catch (err) {
      setLoading('forgotBtn', false);
      showError(friendlyError(err.code));
    }
  }

  /* ── RESEND VERIFICATION ────────────────────────────── */
  async function resendVerification() {
    if (!firebaseAuth?.currentUser) return;
    try {
      await firebaseAuth.currentUser.sendEmailVerification();
      toast('Verification email sent!', 'success');
      startResendTimer();
    } catch (err) {
      toast(friendlyError(err.code), 'error');
    }
  }

  /* ── CHECK VERIFICATION ─────────────────────────────── */
  async function checkVerificationAndProceed() {
    const btn = document.getElementById('signupBtn') || document.querySelector('.auth-verify-screen .auth-btn');
    if (btn) setLoading(btn.id || 'signupBtn', true);
    try {
      await firebaseAuth.currentUser?.reload();
      const user = firebaseAuth.currentUser;
      if (user?.emailVerified) {
        toast(`Welcome to the platform, ${user.displayName || user.email.split('@')[0]}!`, 'success');
        closeModal();
      } else {
        toast('Email not yet verified — please click the link in your inbox.', 'warning');
      }
    } catch (err) {
      toast(friendlyError(err.code), 'error');
    }
    if (btn) setLoading(btn.id, false);
  }

  /* ── SIGN OUT ───────────────────────────────────────── */
  async function signOut() {
    closeDropdown();
    try {
      await firebaseAuth.signOut();
      toast('Signed out successfully', 'info');
    } catch (err) {
      toast(friendlyError(err.code), 'error');
    }
  }

  /* ══════════════════════════════════════════════════════
     VERIFY / FORGOT SCREEN HELPERS
     ══════════════════════════════════════════════════════ */
  function showVerifyScreen(email) {
    const loginForm  = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');
    const tabs       = document.getElementById('authTabs');
    const screen     = document.getElementById('verifyScreen');
    const display    = document.getElementById('verifyEmailDisplay');

    if (loginForm)  loginForm.style.display  = 'none';
    if (signupForm) signupForm.style.display = 'none';
    if (tabs)       tabs.style.display       = 'none';
    if (screen)     screen.style.display     = 'block';
    if (display)    display.textContent      = email;
    activeMode = 'verify';
    startResendTimer();
  }

  function showForgotScreen() {
    const loginForm  = document.getElementById('loginForm');
    const signupForm = document.getElementById('signupForm');
    const tabs       = document.getElementById('authTabs');
    const screen     = document.getElementById('forgotScreen');

    if (loginForm)  loginForm.style.display  = 'none';
    if (signupForm) signupForm.style.display = 'none';
    if (tabs)       tabs.style.display       = 'none';
    if (screen)     screen.classList.add('show');
    activeMode = 'forgot';

    setTimeout(() => {
      document.getElementById('forgotEmail')?.focus();
    }, 60);
  }

  function hideForgotScreen() {
    const loginForm = document.getElementById('loginForm');
    const tabs      = document.getElementById('authTabs');
    const screen    = document.getElementById('forgotScreen');

    if (loginForm) loginForm.style.display = 'block';
    if (tabs)      tabs.style.display      = 'flex';
    if (screen)    screen.classList.remove('show');
    activeMode = 'login';
    clearBanners();
  }

  /* Resend cooldown timer */
  function startResendTimer() {
    const btn   = document.getElementById('btnResend');
    const timer = document.getElementById('resendTimer');
    if (btn) btn.disabled = true;
    resendSeconds = 60;
    clearResendTimer();
    resendTimer = setInterval(() => {
      resendSeconds--;
      if (timer) timer.textContent = `Resend available in ${resendSeconds}s`;
      if (resendSeconds <= 0) {
        clearResendTimer();
        if (btn)   btn.disabled = false;
        if (timer) timer.textContent = '';
      }
    }, 1000);
  }

  function clearResendTimer() {
    if (resendTimer) { clearInterval(resendTimer); resendTimer = null; }
  }

  /* ══════════════════════════════════════════════════════
     UI UTILITIES
     ══════════════════════════════════════════════════════ */
  function setLoading(btnId, loading) {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    btn.disabled = loading;
    btn.classList.toggle('loading', loading);
  }

  function showError(msg) {
    const el = document.getElementById('authErrorBanner');
    if (el) { el.textContent = '⚠ ' + msg; el.classList.add('show'); }
  }

  function showSuccess(msg) {
    const el = document.getElementById('authSuccessBanner');
    if (el) { el.textContent = '✓ ' + msg; el.classList.add('show'); }
  }

  function clearBanners() {
    ['authErrorBanner','authSuccessBanner'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.classList.remove('show');
    });
  }

  function togglePw(inputId, btn) {
    const input = document.getElementById(inputId);
    if (!input) return;
    const isText = input.type === 'text';
    input.type   = isText ? 'password' : 'text';
    btn.textContent = isText ? '👁️' : '🙈';
  }

  /* ── TOAST ──────────────────────────────────────────── */
  function toast(msg, type = 'info', duration = 4000) {
    const tc = document.getElementById('authToastContainer');
    if (!tc) return;
    const icons = { success:'✅', error:'❌', info:'ℹ️', warning:'⚠️' };
    const t = document.createElement('div');
    t.className = `auth-toast ${type}`;
    t.innerHTML = `
      <span class="auth-toast-icon">${icons[type] || '💬'}</span>
      <span class="auth-toast-msg">${escHtml(msg)}</span>
      <button class="auth-toast-close" onclick="this.parentElement.remove()">&#10005;</button>`;
    tc.appendChild(t);
    setTimeout(() => {
      t.classList.add('removing');
      setTimeout(() => t.remove(), 220);
    }, duration);
  }

  /* ── FRIENDLY ERROR MESSAGES ────────────────────────── */
  function friendlyError(code) {
    const map = {
      'auth/email-already-in-use':      'An account with this email already exists. Try signing in.',
      'auth/invalid-email':             'The email address is not valid.',
      'auth/user-not-found':            'No account found with this email. Create one above.',
      'auth/wrong-password':            'Incorrect password. Try again or reset your password.',
      'auth/too-many-requests':         'Too many attempts. Please wait a few minutes and try again.',
      'auth/network-request-failed':    'Network error. Check your internet connection.',
      'auth/weak-password':             'Password is too weak. Use at least 8 characters with upper, lower, and a number.',
      'auth/popup-blocked':             'Popup was blocked by your browser. Allow popups for this site.',
      'auth/account-exists-with-different-credential': 'An account already exists with a different sign-in method.',
      'auth/invalid-credential':        'Invalid credentials. Please try again.',
      'auth/operation-not-allowed':     'This sign-in method is not enabled. Contact the administrator.',
      'auth/user-disabled':             'This account has been disabled. Contact support.',
    };
    return map[code] || 'An error occurred. Please try again.';
  }

  /* ── UTILITIES ──────────────────────────────────────── */
  function getInitials(nameOrEmail) {
    if (!nameOrEmail) return '?';
    const parts = nameOrEmail.split(' ').filter(Boolean);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return nameOrEmail.slice(0, 2).toUpperCase();
  }

  function escHtml(str) {
    return String(str)
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;');
  }

  /* ── GETTERS ────────────────────────────────────────── */
  function getUser()         { return currentUser; }
  function isLoggedIn()      { return !!currentUser; }
  function isVerified()      { return currentUser?.emailVerified === true; }
  function getDisplayName()  { return currentUser?.displayName || currentUser?.email?.split('@')[0] || 'Resident'; }

  /* ══════════════════════════════════════════════════════
     PUBLIC API
     ══════════════════════════════════════════════════════ */
  return {
    init,
    openModal,
    closeModal,
    switchMode,
    handleLogin,
    handleSignup,
    handleGoogleSignIn,
    handleForgotPassword,
    resendVerification,
    checkVerificationAndProceed,
    showForgotScreen,
    hideForgotScreen,
    signOut,
    toggleDropdown,
    togglePw,
    toast,
    getUser,
    isLoggedIn,
    isVerified,
    getDisplayName,
  };

})();

/* ── Auto-init on DOM ready ─────────────────────────── */
document.addEventListener('DOMContentLoaded', () => Auth.init());