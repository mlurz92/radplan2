import assert from 'node:assert';
import { test } from 'node:test';
import { getKpiInterpretation, getCellInterpretation } from '../js/tooltip.js';

test('getKpiInterpretation - Befunde gesamt', () => {
  const result1 = getKpiInterpretation('Befunde gesamt', '0');
  assert.match(result1, /Optimal/);
  assert.match(result1, /Keine Regelverstöße/);

  const result2 = getKpiInterpretation('Befunde gesamt', '2');
  assert.match(result2, /Moderat/);

  const result3 = getKpiInterpretation('Befunde gesamt', '10');
  assert.match(result3, /Kritisch/);
});

test('getKpiInterpretation - Compliance-Score', () => {
  const result1 = getKpiInterpretation('Compliance-Score', '100%');
  assert.match(result1, /Optimal/);

  const result2 = getKpiInterpretation('Compliance-Score', '85%');
  assert.match(result2, /Moderat/);

  const result3 = getKpiInterpretation('Compliance-Score', '60');
  assert.match(result3, /Kritisch/);
});

test('getCellInterpretation - Absence Table', () => {
  const table = { className: 'abs-table', closest: () => null };
  const td = {};
  
  const result1 = getCellInterpretation(table, null, td, 1, 'Krank', 'Dr. Müller', '0');
  assert.match(result1, /Optimal/);
  assert.match(result1, /0 Krankheitstage/);

  const result2 = getCellInterpretation(table, null, td, 1, 'Krank', 'Dr. Müller', '12');
  assert.match(result2, /Erhöht/);
  assert.match(result2, /Auf Ausfälle achten/);
});

test('getCellInterpretation - Fairness Table', () => {
  const table = { className: 'fair-table', closest: () => null };
  const td = {};

  const result1 = getCellInterpretation(table, null, td, 7, 'Fair-Δ', 'Dr. Schmidt', '+3');
  assert.match(result1, /Überlastet/);

  const result2 = getCellInterpretation(table, null, td, 7, 'Fair-Δ', 'Dr. Schmidt', '-3');
  assert.match(result2, /Entlastet/);

  const result3 = getCellInterpretation(table, null, td, 7, 'Fair-Δ', 'Dr. Schmidt', '0');
  assert.match(result3, /Ausgewogen/);
});
