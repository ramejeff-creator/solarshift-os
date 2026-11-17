// Inspect actual controls, not fieldsets whose :invalid state is inherited from children.
export function findInvalidControl(section) {
  return [...section.querySelectorAll('input, select, textarea')]
    .find((control) => control.willValidate && !control.checkValidity()) || null;
}

export function qualificationErrorMessage(control) {
  if (control?.id === 'annualConsumption') {
    return 'Vérifiez la consommation annuelle : saisissez un nombre de kWh compris entre 0 et 1 000 000 000, ou laissez ce champ vide.';
  }
  return 'Choisissez une option dans chaque rubrique encadrée en rouge.';
}
