(function () {
  'use strict';

  function addSection(markup) {
    const shell = document.querySelector('main.shell');
    const documents = [...document.querySelectorAll('section.card')].find((node) => /Documents investisseurs/i.test(node.textContent || ''));
    if (!shell || !documents) return;
    documents.insertAdjacentHTML('beforebegin', markup);
  }

  function boot() {
    if (document.querySelector('[data-investor-v2]')) return;
    addSection(`
      <section class="card investor-v2" data-investor-v2 style="margin-top:18px">
        <h2>Production et incertitude</h2>
        <div class="grid" style="margin:10px 0 0">
          <div class="card metric"><small>Scénario de travail</small><b>345 000 kWh/an</b><em>Valeur indicative actuelle</em></div>
          <div class="card metric"><small>Profil mensuel</small><b>À valider</b><em>Rendement PVGIS par mois</em></div>
          <div class="card metric"><small>P50 / P90</small><b>À importer</b><em>Étude externe validée requise</em></div>
          <div class="card metric"><small>Ombrage</small><b>À documenter</b><em>Simulation ou visite commerciale</em></div>
        </div>
        <p>La production publiée devra provenir d’un calcul versionné, avec coordonnées, orientation, pente, ombrage et niveau de qualité clairement tracés.</p>
      </section>
      <section class="two" style="margin-top:18px" data-investor-v2>
        <div class="card">
          <h2>Revenus et projection financière</h2>
          <div class="model">
            <div><span>Modèle principal</span><b>ACI · ACC · surplus</b><span>À confirmer</span></div>
            <div><span>TRI investisseur</span><b>9,0 %</b><span>Scénario local</span></div>
            <div><span>VAN · payback · LCOE</span><b>À calculer</b><span>Energy Engine v1</span></div>
          </div>
          <p>Les résultats définitifs seront calculés côté serveur à partir des profils énergétiques validés et des hypothèses financières retenues.</p>
        </div>
        <div class="card">
          <h2>Paramètres de l’étude</h2>
          <ul class="list">
            <li>Horizon contractuel : 30 ans dans le scénario actuel</li>
            <li>Prix et répartition de l’énergie : à confirmer</li>
            <li>Capex, loyer, OPEX et garanties : à documenter</li>
            <li>Risques et preuves : registre SolarShift</li>
          </ul>
        </div>
      </section>
      <section class="two" style="margin-top:18px" data-investor-v2>
        <div class="card">
          <h2>Impact environnemental</h2>
          <p>Émissions évitées, équivalent consommation et bilan environnemental seront affichés après validation de la production annuelle et du facteur d’émission retenu.</p>
          <div class="status">Donnée non publiée tant que la source et la méthode ne sont pas validées.</div>
        </div>
        <div class="card">
          <h2>Prochaines étapes</h2>
          <div class="timeline">
            <div class="step done"><b>Qualification</b><br>Fiche commerciale</div>
            <div class="step current"><b>Validation</b><br>Technique & risques</div>
            <div class="step"><b>Étude</b><br>Production & finance</div>
            <div class="step"><b>Publication</b><br>Investisseurs</div>
          </div>
        </div>
      </section>`);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
}());
