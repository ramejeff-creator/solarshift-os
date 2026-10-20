import { signInWithPassword } from './project-hub-client.mjs';

const form = document.getElementById('loginForm');
const email = document.getElementById('loginEmail');
const password = document.getElementById('loginPassword');
const submit = document.getElementById('loginSubmit');
const status = document.getElementById('loginStatus');
const environment = window.SOLARSHIFT_CONFIG?.environment || 'test';
const badge = document.getElementById('environmentBadge');
badge.textContent = environment === 'test' ? 'Environnement de test' : 'Environnement OZENO';

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

const next = safeReturnTarget(new URLSearchParams(window.location.search).get('next'));
const reason = new URLSearchParams(window.location.search).get('reason');
if (window.__OZENO_UNSAFE_LOGIN_LINK) status.textContent = 'Lien incorrect : les identifiants ne doivent jamais être transmis dans une adresse. Ils ont été retirés ; ouvrez la page de connexion du serveur de test et saisissez-les dans les champs.';
else if (reason === 'session') status.textContent = 'Votre session a expiré ou n’est plus valide. Reconnectez-vous.';
else if (!window.SOLARSHIFT_CONFIG?.supabaseUrl || !window.SOLARSHIFT_CONFIG?.supabasePublishableKey) status.textContent = 'La configuration de connexion est indisponible.';

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const address = email.value.trim();
  if (!address || !password.value) {
    status.textContent = 'Renseignez votre adresse e-mail et votre mot de passe.';
    return;
  }
  submit.disabled = true;
  status.textContent = 'Vérification de vos identifiants…';
  try {
    await signInWithPassword(address, password.value, window.localStorage);
    status.textContent = 'Connexion réussie. Ouverture de l’espace…';
    window.location.replace(next);
  } catch {
    status.textContent = 'Connexion impossible. Vérifiez vos identifiants ou demandez à un administrateur de créer votre compte de test.';
    submit.disabled = false;
    password.value = '';
    password.focus();
  }
});
