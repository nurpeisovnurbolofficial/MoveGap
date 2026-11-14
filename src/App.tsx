import { useState } from 'react';
import { calculatePlans } from './domain/engine';
import { createExample } from './domain/example';

/** Temporary integration screen. Participant B owns this file and replaces it with the three-screen flow. */
export default function App() {
  const [cash, setCash] = useState('4500');
  const input = createExample();
  input.openingCashCents = Math.round(Number(cash) * 100);
  const result = calculatePlans(input);
  const usd = (cents: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
  return <main style={{ maxWidth: 1000, margin: '48px auto', padding: 24, fontFamily: 'system-ui' }}>
    <h1>MoveGap</h1>
    <p>Development preview · fictional example · no payments collected</p>
    <label>Opening cash ($) <input type="number" min="0" step="0.01" value={cash} onChange={e => setCash(e.target.value)} /></label>
    <p>Reserve: $500. Change opening cash to run the actual calculation again.</p>
    {result.errors.map(e => <p role="alert" key={e}>{e}</p>)}
    <div style={{ overflowX: 'auto' }}><table cellPadding={12}>
      <thead><tr><th>Housing / moving</th><th>Minimum cash</th><th>Gap to reserve</th><th>Entered cost</th></tr></thead>
      <tbody>{result.plans.map(plan => <tr key={plan.id}>
        <td>{plan.housingId} / {plan.movingId}</td><td>{usd(plan.minBalanceCents)}</td>
        <td>{usd(plan.gapToReserveCents)}</td><td>{usd(plan.costCents)}</td>
      </tr>)}</tbody>
    </table></div>
    <p>Expected old deposit excluded. Only entered obligations are included.</p>
    <p>This preview is not the final product: forms, saved plans, paywall and styling are assigned to the UI workstream.</p>
  </main>;
}
