import {
  challengeMfaFactor, enrollMfaPhone, getSession, listMfaFactors,
  sendPasswordRecovery, setRecoveredPassword, signInWithPassword, verifyMfaFactor
} from './project-hub-client.mjs?v=20261117-mfa-list-fix';

const form = document.getElementById('loginForm');
const phoneForm = document.getElementById('phoneForm');
const codeForm = document.getElementById('codeForm');
const recoveryRequestForm = document.getElementById('recoveryRequestForm');
const newPasswordForm = document.getElementById('newPasswordForm');
const email = document.getElementById('loginEmail');
const password = document.getElementById('loginPassword');
const phone = document.getElementById('loginPhone');
const code = document.getElementById('loginCode');
const recoveryEmail = document.getElementById('recoveryEmail');
const newPassword = document.getElementById('newPassword');
const confirmPassword = document.getElementById('confirmPassword');
const submit = document.getElementById('loginSubmit');
const phoneSubmit = document.getElementById('phoneSubmit');
const codeSubmit = document.getElementById('codeSubmit');
const recoveryRequestSubmit = document.getElementById('recoveryRequestSubmit');
const newPasswordSubmit = document.getElementById('newPasswordSubmit');
const status = document.getElementById('loginStatus');
const progress = document.getElementById('loginProgress');
const progressText = document.getElementById('loginProgressText');
const environment = window.SOLARSHIFT_CONFIG?.environment || 'test';
const badge = document.getElementById('environmentBadge');
badge.textContent = environment === 'test' ? 'Environnement de test' : 'Environnement OZENO';
if (window.SOLARSHIFT_CONFIG?.betaTestMfaBypass) {
  const intro = document.querySelector('.loginIntro');
  if (intro) intro.textContent = 'Connectez-vous avec votre adresse e-mail et votre mot de passe. La vérification par SMS est temporairement désactivée sur Beta.';
}

document.querySelectorAll('[data-visibility-toggle]').forEach((button) => {
  button.addEventListener('click', () => {
    const input = document.getElementById(button.dataset.visibilityToggle);
    if (!input) return;
    const visible = input.type === 'password';
    input.type = visible ? 'text' : 'password';
    button.setAttribute('aria-pressed', String(visible));
    button.setAttribute('aria-label', `${visible ? 'Masquer' : 'Afficher'} ${button.dataset.visibilityToggle === 'loginPassword' ? 'le mot de passe' : button.dataset.visibilityToggle === 'newPassword' ? 'le nouveau mot de passe' : 'la confirmation du mot de passe'}`);
  });
});

const fallback = './projects.html';
function safeReturnTarget(candidate) {
  if (!candidate) return fallback;
  try {
    const base = new URL('./', window.location.href);
    const target = new URL(candidate, base);
    if (target.origin !== base.origin || !target.pathname.startsWith(base.pathname) || /\/login\.html$/i.test(target.pathname)) return fallback;
    return `${target.pathname}${target.search}${target.hash}`;
  } catch { return fallback; }
}

function sessionAal(session) {
  try {
    const payload = session.access_token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(payload)).aal || 'aal1';
  } catch { return 'aal1'; }
}

const next = safeReturnTarget(new URLSearchParams(window.location.search).get('next'));
const reason = new URLSearchParams(window.location.search).get('reason');
const mode = new URLSearchParams(window.location.search).get('mode');
let pendingSession = null;
let pendingFactor = null;
let pendingChallenge = null;
let recoveryToken = null;
const callbackParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
if (callbackParams.get('type') === 'recovery' && callbackParams.get('access_token')) {
  recoveryToken = callbackParams.get('access_token');
  window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
}

function showProgress(message) {
  status.textContent = '';
  progressText.textContent = message;
  progress.hidden = false;
}

function clearProgress(message = '') {
  progress.hidden = true;
  status.textContent = message;
}

function hideForms() {
  for (const item of [form, phoneForm, codeForm, recoveryRequestForm, newPasswordForm]) item.hidden = true;
}

if (window.__OZENO_UNSAFE_LOGIN_LINK) status.textContent = 'Lien incorrect : les identifiants ne doivent jamais être transmis dans une adresse. Ils ont été retirés ; ouvrez la page de connexion du serveur de test et saisissez-les dans les champs.';
else if (reason === 'session') status.textContent = 'Votre session a expiré ou n’est plus valide. Reconnectez-vous.';
else if (reason === 'password-reset') status.textContent = 'Votre nouveau mot de passe est enregistré. Connectez-vous pour reprendre votre session sécurisée.';
else if (!window.SOLARSHIFT_CONFIG?.supabaseUrl || !window.SOLARSHIFT_CONFIG?.supabasePublishableKey) status.textContent = 'La configuration de connexion est indisponible.';

async function completeLogin(session) {
  pendingSession = session;
  hideForms();
  if (sessionAal(session) === 'aal2' || window.SOLARSHIFT_CONFIG?.localTestMfaBypass || window.SOLARSHIFT_CONFIG?.betaTestMfaBypass) {
    clearProgress('Connexion sécurisée. Ouverture de l’espace…');
    window.location.replace(next);
    return;
  }
  showProgress('Vérification du téléphone associé au compte…');
  const factors = await listMfaFactors(session.access_token);
  const phoneFactors = factors.phone || [];
  const verified = phoneFactors.find((factor) => factor.status === 'verified');
  if (verified) {
    pendingFactor = verified;
    await sendCode(verified);
    return;
  }
  const awaitingVerification = phoneFactors.find((factor) => factor.status !== 'verified');
  if (awaitingVerification) {
    status.textContent = 'Confirmez le numéro de téléphone enregistré pour protéger votre compte.';
    await sendCode(awaitingVerification);
    return;
  }
  clearProgress('Ajoutez votre téléphone pour protéger votre compte. Un code SMS vérifiera que vous en avez l’accès.');
  phoneForm.hidden = false;
  phone.focus();
}

async function sendCode(factor) {
  pendingFactor = factor;
  showProgress('Envoi du code sécurisé sur votre téléphone…');
  phoneForm.hidden = true;
  codeForm.hidden = true;
  const challenge = await challengeMfaFactor(pendingSession.access_token, factor.id);
  pendingChallenge = challenge.id;
  const destination = factor.phone ? ` au ${factor.phone}` : '';
  clearProgress(`Un code a été envoyé${destination}. Saisissez-le pour terminer la connexion.`);
  codeForm.hidden = false;
  code.focus();
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const address = email.value.trim();
  if (!address || !password.value) {
    status.textContent = 'Renseignez votre adresse e-mail et votre mot de passe.';
    return;
  }
  submit.disabled = true;
  showProgress('Vérification de vos identifiants…');
  try {
    const session = await signInWithPassword(address, password.value, window.localStorage);
    password.value = '';
    await completeLogin(session);
  } catch (error) {
    clearProgress(`Connexion impossible. ${error.message || 'Vérifiez vos identifiants ou demandez à un administrateur de créer votre compte.'}`);
    form.hidden = false;
    submit.disabled = false;
    password.value = '';
    password.focus();
  }
});

phoneForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const number = phone.value.trim().replace(/[\s().-]/g, '');
  if (!/^\+[1-9]\d{7,14}$/.test(number)) {
    status.textContent = 'Saisissez un numéro au format international, par exemple +33 6 12 34 56 78.';
    return;
  }
  phoneSubmit.disabled = true;
  showProgress('Enregistrement sécurisé du téléphone…');
  try {
    const factor = pendingFactor && pendingFactor.status !== 'verified'
      ? pendingFactor
      : await enrollMfaPhone(pendingSession.access_token, number);
    await sendCode(factor);
  } catch (error) {
    clearProgress(`Impossible d’enregistrer ce téléphone : ${error.message}`);
    phoneForm.hidden = false;
    phoneSubmit.disabled = false;
  }
});

codeForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const value = code.value.trim();
  if (!/^\d{6}$/.test(value)) {
    status.textContent = 'Saisissez les six chiffres du code reçu par SMS.';
    return;
  }
  codeSubmit.disabled = true;
  showProgress('Validation du code SMS…');
  try {
    await verifyMfaFactor(pendingSession.access_token, pendingFactor.id, pendingChallenge, value, window.localStorage);
    clearProgress('Téléphone confirmé. Ouverture de l’espace…');
    window.location.replace(next);
  } catch (error) {
    clearProgress(`Code non validé : ${error.message}. Vous pouvez réessayer avec le code le plus récent.`);
    code.value = '';
    codeSubmit.disabled = false;
    code.focus();
  }
});

document.getElementById('forgotPassword').addEventListener('click', () => {
  hideForms();
  recoveryEmail.value = email.value.trim();
  recoveryRequestForm.hidden = false;
  clearProgress('Indiquez l’adresse associée au compte. Un lien temporaire permettra de choisir un nouveau mot de passe.');
  recoveryEmail.focus();
});

document.getElementById('recoveryRequestCancel').addEventListener('click', () => {
  hideForms();
  form.hidden = false;
  clearProgress();
  email.focus();
});

recoveryRequestForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const address = recoveryEmail.value.trim();
  if (!address) { clearProgress('Indiquez votre adresse e-mail.'); return; }
  recoveryRequestSubmit.disabled = true;
  showProgress('Envoi du lien de récupération…');
  const redirect = new URL('./login.html', window.location.protocol === 'file:'
    ? 'http://localhost:3000/'
    : window.location.href);
  redirect.searchParams.set('mode', 'recovery');
  if (next !== fallback) redirect.searchParams.set('next', next);
  try {
    await sendPasswordRecovery(address, redirect.href);
    hideForms();
    clearProgress('Si cette adresse correspond à un compte, un lien temporaire vient d’être envoyé. Ouvrez-le sur cet appareil pour choisir un nouveau mot de passe.');
  } catch {
    clearProgress('Le lien n’a pas pu être envoyé. Vérifiez l’adresse et réessayez dans quelques instants.');
    recoveryRequestSubmit.disabled = false;
  }
});

newPasswordForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!recoveryToken) {
    hideForms();
    form.hidden = false;
    clearProgress('Le lien de récupération est absent ou a expiré. Demandez-en un nouveau.');
    return;
  }
  if (newPassword.value.length < 15) {
    clearProgress('Choisissez une phrase secrète d’au moins 15 caractères.');
    newPassword.focus();
    return;
  }
  if (newPassword.value !== confirmPassword.value) {
    clearProgress('Les deux mots de passe ne correspondent pas.');
    confirmPassword.focus();
    return;
  }
  newPasswordSubmit.disabled = true;
  showProgress('Enregistrement du nouveau mot de passe…');
  try {
    await setRecoveredPassword(recoveryToken, newPassword.value);
    const sessionKey = window.SOLARSHIFT_CONFIG?.sessionStorageKey || 'ozeno-supabase-session';
    window.localStorage.removeItem(sessionKey);
    recoveryToken = null;
    newPassword.value = '';
    confirmPassword.value = '';
    window.location.replace(`./login.html?${new URLSearchParams({ reason: 'password-reset' })}`);
  } catch (error) {
    clearProgress(`Le nouveau mot de passe n’a pas été enregistré : ${error.message}`);
    newPasswordSubmit.disabled = false;
  }
});

(async () => {
  if (window.__OZENO_UNSAFE_LOGIN_LINK) return;
  if (recoveryToken) {
    hideForms();
    newPasswordForm.hidden = false;
    clearProgress('Choisissez un nouveau mot de passe. Utilisez une phrase longue que vous n’utilisez pas sur un autre site.');
    newPassword.focus();
    return;
  }
  if (mode === 'recovery') {
    hideForms();
    recoveryRequestForm.hidden = false;
    clearProgress('Le lien de récupération est absent ou expiré. Demandez-en un nouveau avec l’adresse de votre compte.');
    recoveryEmail.focus();
    return;
  }
  try {
    const session = await getSession(window.localStorage);
    if (session?.access_token && sessionAal(session) !== 'aal2' && !(window.SOLARSHIFT_CONFIG?.localTestMfaBypass || window.SOLARSHIFT_CONFIG?.betaTestMfaBypass)) await completeLogin(session);
    else if (session?.access_token) window.location.replace(next);
    else {
      form.hidden = false;
      if (reason === 'mfa') status.textContent = 'Validez votre accès avec le code envoyé sur votre téléphone.';
    }
  } catch (error) {
    clearProgress(`La vérification SMS est indisponible : ${error.message}. Réessayez dans quelques instants.`);
    form.hidden = false;
  }
})();
